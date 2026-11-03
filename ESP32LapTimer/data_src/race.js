/* Race management: live standings, lap capture and spoken callouts. */

BC.start("race.html");

var NUM_PILOTS = 8;
var MAX_RSSI_SCALE = 341; // the timer reports RSSI already divided by 12
var num_receivers = NUM_PILOTS;
var race_num = 0;
var racing = false;
var race_started_at = 0;
var count_first = 0;   // whether lap 0 (the hole shot) counts
var target_laps = 5;
var leader = null;
var announced_last_lap = false;

var pilots = [];
for (var i = 0; i < NUM_PILOTS; ++i) {
	pilots[i] = {
		node: i,
		active: false,
		name: load_name(i),
		laps: [],          // every lap time in ms, index 0 is the hole shot
		finished_at: null, // finishing position once they complete target_laps
		last_is_best: false,
		band: 0,
		channel: 0,
		threshold: null,   // as the timer reports it, i.e. already /12
		rssi: 0,
	};
}

var BAND_LABELS = ["R", "A", "B", "E", "F", "D", "CX", "CX2"];

// Mirrors channelFreqTable in src/RX5808.h.
var FREQ_TABLE = [
	5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917,
	5865, 5845, 5825, 5805, 5785, 5765, 5745, 5725,
	5733, 5752, 5771, 5790, 5809, 5828, 5847, 5866,
	5705, 5685, 5665, 5645, 5885, 5905, 5925, 5945,
	5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880,
	5362, 5399, 5436, 5473, 5510, 5547, 5584, 5621,
	5180, 5200, 5220, 5240, 5745, 5765, 5785, 5805,
	5825, 5845, 5845, 5845, 5845, 5845, 5845, 5845,
];

function channel_label(pilot) {
	var freq = FREQ_TABLE[pilot.channel + 8 * pilot.band];
	return BAND_LABELS[pilot.band] + (pilot.channel + 1) + (freq ? " · " + freq : "");
}

function load_name(node) {
	try {
		return localStorage.getItem("pilot_name_" + node) || "Pilot " + (node + 1);
	} catch (e) {
		return "Pilot " + (node + 1);
	}
}

function save_name(node, name) {
	try { localStorage.setItem("pilot_name_" + node, name); } catch (e) { /* ignore */ }
}

/* ---------------- race maths ---------------- */

// Lap 0 is the hole shot: the run from the start line to the gate for the
// first time. It is not a lap of the course, so unless the timer is set to
// count it, it stays out of totals, bests and the lap count.
function counted_laps(pilot) {
	var laps = count_first ? pilot.laps : pilot.laps.slice(1);
	// Laps arrive indexed, so a replay that starts mid-race can leave holes.
	// Those would turn Math.min into NaN and the lap count into a lie.
	return laps.filter(function (lap) { return lap !== undefined; });
}

function lap_count(pilot) {
	return counted_laps(pilot).length;
}

function total_time(pilot) {
	return counted_laps(pilot).reduce(function (sum, lap) { return sum + lap; }, 0);
}

// Time on track since the race started, hole shot included.
//
// This is what decides position, and it is deliberately not total_time: that
// one drops the hole shot because it isn't a lap of the course, which is right
// for lap statistics and wrong for placing. A pilot who launches slowly but
// laps quickly can have the lower total_time while actually being behind on
// track, which showed up as the standings disagreeing with the finish order.
function elapsed_time(pilot) {
	return pilot.laps.reduce(function (sum, lap) {
		return sum + (lap === undefined ? 0 : lap);
	}, 0);
}

function best_lap(pilot) {
	var laps = counted_laps(pilot);
	return laps.length ? Math.min.apply(null, laps) : null;
}

function best_consecutive(pilot) {
	var laps = counted_laps(pilot);
	if (laps.length < 2) return null;
	var best = Infinity;
	for (var i = 0; i + 1 < laps.length; ++i) {
		best = Math.min(best, laps[i] + laps[i + 1]);
	}
	return best;
}

// Standard race order: most laps first, and among pilots on the same lap the
// one who got there soonest. Ordering on total time alone, as the old page
// did, puts a pilot who has done fewer laps ahead of one who has done more.
function standings() {
	var running = pilots.filter(function (p) { return p.active; });
	running.sort(function (a, b) {
		// Anyone home is classified ahead of anyone still out, in the order
		// they finished. Without this a pilot who kept flying after the flag
		// would out-lap the winner and take the top of the table back.
		if (a.finished_at != null || b.finished_at != null) {
			if (a.finished_at == null) return 1;
			if (b.finished_at == null) return -1;
			return a.finished_at - b.finished_at;
		}
		var laps_a = lap_count(a), laps_b = lap_count(b);
		if (laps_a != laps_b) return laps_b - laps_a;
		return elapsed_time(a) - elapsed_time(b);
	});
	return running;
}

function format_time(ms) {
	if (ms == null) return "—";
	return (ms / 1000).toFixed(2);
}

function gap_text(pilot, lead) {
	// Before anyone has completed a lap there is no order to report, so don't
	// crown a leader or quote a 0.00s gap off an empty table.
	if (lead == null || lap_count(lead) == 0) return "";
	if (lap_count(pilot) == 0) return "no laps";
	if (pilot === lead) return "leader";
	var lap_diff = lap_count(lead) - lap_count(pilot);
	if (lap_diff > 0) return "+" + lap_diff + (lap_diff == 1 ? " lap" : " laps");
	var delta = elapsed_time(pilot) - elapsed_time(lead);
	return "+" + (delta / 1000).toFixed(2) + "s";
}

/* ---------------- roster ---------------- */

// Who is in the race, and what each receiver is listening to. The old race
// page had an include checkbox per pilot and this one lost it in the rebuild,
// which left no way to set the grid from the page you actually race from.
// Threshold lives here too rather than only in Settings, because tuning it is
// something you do against live RSSI just before and during a session.
function build_roster() {
	var html = "";
	for (var node = 0; node < NUM_PILOTS; ++node) {
		html +=
			'<div class="bc-rx-row" id="roster_row_' + node + '" ' +
			'style="--rx-colour:var(--rx' + (node + 1) + ')">' +
				'<input class="bc-rx-check" type="checkbox" id="roster_active_' + node + '" />' +
				'<input class="bc-rx-name" id="roster_name_' + node + '" value="" />' +
				'<span class="bc-rx-chan" id="roster_chan_' + node + '">&mdash;</span>' +
				'<div class="bc-rx-tune">' +
					'<label for="roster_threshold_' + node + '">Thr</label>' +
					'<input type="number" min="0" max="341" id="roster_threshold_' + node + '" />' +
					'<span class="bc-meter">' +
						'<span class="bc-meter-level" id="roster_level_' + node + '"></span>' +
						'<span class="bc-meter-mark" id="roster_mark_' + node + '"></span>' +
					"</span>" +
					'<span class="bc-rx-rssi" id="roster_rssi_' + node + '">0</span>' +
				"</div>" +
				'<div class="bc-rx-warn" id="roster_warn_' + node + '"></div>' +
			"</div>";
	}
	document.getElementById("roster").innerHTML = html;

	for (node = 0; node < NUM_PILOTS; ++node) {
		wire_roster(node);
	}
}

function wire_roster(node) {
	var pilot = pilots[node];

	var active = document.getElementById("roster_active_" + node);
	active.addEventListener("change", function () {
		BC.pending(this);
		BC.set_value(node, "A", this.checked ? 1 : 0, 4);
	});

	var name = document.getElementById("roster_name_" + node);
	name.value = pilot.name;
	name.addEventListener("input", function () {
		pilot.name = this.value;
		save_name(node, this.value);
		var standing_name = document.getElementById("name_" + node);
		if (standing_name != null && standing_name.value != this.value) {
			standing_name.value = this.value;
		}
	});

	var threshold = document.getElementById("roster_threshold_" + node);
	threshold.addEventListener("change", function () {
		// Never fall back to 0 here. A number input reads "" when empty or
		// invalid, and this field starts empty until the timer echoes a value,
		// so a careless "|| 0" sends threshold 0 -- which is not "disabled":
		// ADCvalue > 0 is true on every sample, so the pilot free-runs laps at
		// the minimum lap time. Put the known value back instead.
		var value = parseInt(this.value, 10);
		if (isNaN(value) || value < 1) {
			this.value = pilot.threshold != null ? pilot.threshold : "";
			return;
		}
		BC.pending(this);
		BC.set_value(node, "T", value, 16);
	});
}

function render_roster() {
	var included = 0;
	for (var node = 0; node < NUM_PILOTS; ++node) {
		var pilot = pilots[node];
		var row = document.getElementById("roster_row_" + node);
		if (row == null) continue;

		// Show a row for every receiver the timer has, and for any pilot that
		// is enabled beyond that count. Hiding the latter was how a pilot could
		// be enabled, untimed and completely invisible on the page you would
		// go to in order to fix it.
		var relevant = node < num_receivers || pilot.active;
		row.style.display = relevant ? "" : "none";
		if (!relevant) continue;

		row.className = "bc-rx-row" + (pilot.active ? "" : " off") +
			(pilot.active && node >= num_receivers ? " untimed" : "");
		if (pilot.active) included++;

		document.getElementById("roster_chan_" + node).innerText = channel_label(pilot);

		// A threshold of 0 isn't "off": the detector compares RSSI > threshold,
		// so it matches every sample and the pilot scores phantom laps at the
		// minimum lap time. Worth shouting about, because the symptom looks
		// like a receiver picking up someone else's quad.
		var warn = document.getElementById("roster_warn_" + node);
		if (pilot.active && node >= num_receivers) {
			warn.style.display = "";
			warn.innerText = "No receiver for this pilot, so no laps will be " +
				"recorded. The timer has " + num_receivers + " receivers.";
		} else if (pilot.active && pilot.threshold === 0) {
			warn.style.display = "";
			warn.innerText = "Threshold is 0, so this pilot will score laps " +
				"continuously. Set it above the noise floor.";
		} else {
			warn.style.display = "none";
		}

		var level = document.getElementById("roster_level_" + node);
		var mark = document.getElementById("roster_mark_" + node);
		var value = document.getElementById("roster_rssi_" + node);
		value.innerText = pilot.rssi;
		level.style.width = Math.min(100, (pilot.rssi / MAX_RSSI_SCALE) * 100) + "%";
		if (pilot.threshold != null) {
			mark.style.display = "";
			mark.style.left = Math.min(100, (pilot.threshold / MAX_RSSI_SCALE) * 100) + "%";
		} else {
			mark.style.display = "none";
		}
	}

	document.getElementById("roster_count").innerText =
		included + (included == 1 ? " pilot" : " pilots");

	// Each receiver is pinned to one pilot, so anyone enabled past the module
	// count never gets a receiver and is simply not timed. Nothing else on the
	// timer says so, and it looks identical to a pilot who never crossed.
	var capacity = document.getElementById("capacity_alert");
	if (included > num_receivers) {
		capacity.style.display = "";
		document.getElementById("capacity_text").innerText =
			included + " pilots are enabled but the timer has " + num_receivers +
			" receiver" + (num_receivers == 1 ? "" : "s") + ". Only " +
			num_receivers + " will be timed; the rest record no laps at all. " +
			"Either untick the extras or raise the receiver count in Settings.";
	} else {
		capacity.style.display = "none";
	}
}

/* ---------------- rendering ---------------- */

var container = document.getElementById("standings");

function render() {
	var order = standings();
	document.getElementById("standings_empty").style.display =
		order.length ? "none" : "";

	var lead = order.length ? order[0] : null;

	// Rebuild only when the set or order of pilots changes; otherwise patch the
	// existing rows so that editing a name doesn't blow away the input's focus
	// every time a lap arrives.
	var signature = order.map(function (p) { return p.node; }).join(",");
	if (container.dataset.signature !== signature) {
		container.dataset.signature = signature;
		container.innerHTML = order.map(function (pilot) {
			return '<div class="bc-pilot" id="pilot_' + pilot.node + '" ' +
				'style="--rx-colour:var(--rx' + (pilot.node + 1) + ')">' +
				'<div class="bc-pos"></div>' +
				'<input class="bc-name" id="name_' + pilot.node + '" value="" />' +
				'<div class="bc-meta"></div>' +
				'<div class="bc-last"><span class="bc-last-label">Last lap</span>' +
				'<span class="bc-value"></span>' +
				'<span class="bc-gap"></span></div>' +
				"</div>";
		}).join("");

		order.forEach(function (pilot) {
			var input = document.getElementById("name_" + pilot.node);
			input.value = pilot.name;
			input.addEventListener("input", function () {
				pilot.name = this.value;
				save_name(pilot.node, this.value);
			});
		});
	}

	order.forEach(function (pilot, index) {
		var row = document.getElementById("pilot_" + pilot.node);
		if (row == null) return;

		row.className = "bc-pilot" +
			(index == 0 && lap_count(pilot) > 0 ? " leader" : "") +
			(pilot.finished_at != null ? " finished" : "");

		row.querySelector(".bc-pos").innerText =
			lap_count(pilot) > 0 || pilot.finished_at != null ? index + 1 : "–";

		var laps = counted_laps(pilot);
		var last = laps.length ? laps[laps.length - 1] : null;

		var value = row.querySelector(".bc-value");
		value.innerText = format_time(last);
		value.parentNode.className = "bc-last" + (pilot.last_is_best ? " personal-best" : "");

		row.querySelector(".bc-gap").innerText =
			pilot.finished_at != null ? "finished" : gap_text(pilot, lead);

		var consec = best_consecutive(pilot);
		row.querySelector(".bc-meta").innerHTML =
			"<span>" + channel_label(pilot) + "</span>" +
			"<span>Lap " + lap_count(pilot) + "/" + target_laps + "</span>" +
			"<span>Best " + format_time(best_lap(pilot)) + "</span>" +
			"<span>2&nbsp;consec " + format_time(consec) + "</span>";
	});
}

/* ---------------- lap tables ---------------- */

// Finished rounds are kept so a night's racing stays on screen, newest first,
// and survive a reload because a phone at a track will lock, sleep and
// reconnect. Capped so the list can't grow without bound.
var MAX_HISTORY_ROUNDS = 8;
// Named race_history, not history: a top-level `var history` in a classic
// script cannot shadow window.history, so the assignment silently does nothing
// and every use below would hit the browser's History API instead.
var race_history = load_history();

function load_history() {
	try {
		var raw = localStorage.getItem("bc_history");
		var parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch (e) {
		return [];
	}
}

function save_history() {
	try {
		localStorage.setItem("bc_history", JSON.stringify(race_history));
	} catch (e) {
		// Out of quota or private mode. The on-screen history still works for
		// this session, so there is nothing useful to tell the user here.
	}
}

// Snapshot whatever is on screen before a new race wipes it.
function archive_current_race() {
	var rows = pilots.filter(function (p) {
		return p.active && p.laps.length > 0;
	}).map(function (p) {
		return { node: p.node, name: p.name, laps: p.laps.slice() };
	});
	if (rows.length == 0) return;

	race_history.unshift({
		race_num: race_num,
		target_laps: target_laps,
		count_first: count_first,
		rows: rows,
	});
	race_history = race_history.slice(0, MAX_HISTORY_ROUNDS);
	save_history();
}

function counted_from(laps, counts_first) {
	var list = counts_first ? laps : laps.slice(1);
	return list.filter(function (lap) { return lap !== undefined; });
}

// One round as a table: a pilot per row, a lap per column, then the summary.
function round_html(round, is_live) {
	var max_laps = 0;
	round.rows.forEach(function (row) {
		max_laps = Math.max(max_laps, row.laps.length);
	});
	if (max_laps == 0) return "";

	// Fastest counted lap anywhere in this round, so it can be called out.
	var fastest = Infinity;
	round.rows.forEach(function (row) {
		counted_from(row.laps, round.count_first).forEach(function (lap) {
			if (lap < fastest) fastest = lap;
		});
	});

	var header = '<th class="bc-col-pilot">Pilot</th>';
	for (var i = 0; i < max_laps; ++i) {
		// Index 0 is the hole shot unless the timer counts it as a lap.
		var label = (!round.count_first && i == 0) ? "HS" : (round.count_first ? i + 1 : i);
		header += "<th>" + label + "</th>";
	}
	header += '<th class="bc-col-sep">Best</th><th>2&nbsp;cons</th><th>Total</th>';

	var body = round.rows.map(function (row) {
		var counted = counted_from(row.laps, round.count_first);
		var best = counted.length ? Math.min.apply(null, counted) : null;

		var consec = null;
		for (var i = 0; i + 1 < counted.length; ++i) {
			var pair = counted[i] + counted[i + 1];
			if (consec == null || pair < consec) consec = pair;
		}

		var total = counted.reduce(function (sum, lap) { return sum + lap; }, 0);

		var cells = '<td class="bc-col-pilot" style="--rx-colour:var(--rx' +
			(row.node + 1) + ')">' + escape_html(row.name) + "</td>";

		for (i = 0; i < max_laps; ++i) {
			var lap = row.laps[i];
			if (lap === undefined) {
				cells += '<td class="bc-cell-empty">&mdash;</td>';
				continue;
			}
			var is_holeshot = !round.count_first && i == 0;
			var cls = is_holeshot ? "bc-cell-holeshot"
				: (lap === fastest ? "bc-cell-fastest"
				: (lap === best ? "bc-cell-best" : ""));
			cells += '<td class="' + cls + '">' + (lap / 1000).toFixed(2) + "</td>";
		}

		cells += '<td class="bc-col-sep">' + format_time(best) + "</td>" +
			"<td>" + format_time(consec) + "</td>" +
			"<td>" + (total ? (total / 1000).toFixed(2) : "—") + "</td>";

		return "<tr>" + cells + "</tr>";
	}).join("");

	return '<div class="bc-round">' +
		'<div class="bc-round-title"><span>Round ' + round.race_num + "</span>" +
		(is_live ? '<span class="bc-round-live">live</span>' : "") +
		"</div>" +
		'<div class="bc-laptable-wrap"><table class="bc-laptable">' +
		"<thead><tr>" + header + "</tr></thead><tbody>" + body + "</tbody>" +
		"</table></div></div>";
}

function escape_html(text) {
	return String(text).replace(/[&<>"']/g, function (ch) {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;",
			'"': "&quot;", "'": "&#39;" }[ch];
	});
}

function current_round() {
	return {
		race_num: race_num,
		target_laps: target_laps,
		count_first: count_first,
		rows: pilots.filter(function (p) {
			return p.active && p.laps.length > 0;
		}).map(function (p) {
			return { node: p.node, name: p.name, laps: p.laps.slice() };
		}),
	};
}

function render_lap_tables() {
	var live = current_round();
	var html = "";
	if (live.rows.length > 0) html += round_html(live, true);
	race_history.forEach(function (round) { html += round_html(round, false); });

	document.getElementById("lap_rounds").innerHTML = html;
	document.getElementById("lap_table_empty").style.display = html ? "none" : "";

	render_lap_stats(live);
}

function render_lap_stats(live) {
	var all = [];
	live.rows.forEach(function (row) {
		all = all.concat(counted_from(row.laps, live.count_first));
	});

	var fastest = all.length ? Math.min.apply(null, all) : null;
	var average = all.length
		? all.reduce(function (a, b) { return a + b; }, 0) / all.length : null;

	document.getElementById("lap_stats").innerHTML =
		stat("Laps this round", all.length ? String(all.length) : "—") +
		stat("Fastest", format_time(fastest)) +
		stat("Average", format_time(average)) +
		stat("Rounds kept", String(race_history.length + (live.rows.length ? 1 : 0)));
}

function stat(label, value) {
	return '<div class="bc-stat"><div class="bc-stat-label">' + label +
		'</div><div class="bc-stat-value">' + value + "</div></div>";
}

document.getElementById("clear_history").onclick = function () {
	race_history = [];
	save_history();
	render_lap_tables();
};

/* ---------------- lap handling ---------------- */

function on_lap(node, lap_index, lap_ms) {
	var pilot = pilots[node];

	// Their race is over; the timer keeps reporting crossings until someone
	// stops the race, but those laps are no longer part of this result.
	if (pilot.finished_at != null) return;

	// The timer replays all known laps on "R*a", so ignore anything we already
	// have rather than counting it twice.
	if (pilot.laps[lap_index] !== undefined) return;
	pilot.laps[lap_index] = lap_ms;

	var laps = counted_laps(pilot);
	var is_counted = count_first || lap_index > 0;
	if (!is_counted) {
		render();
		render_lap_tables();
		return;
	}

	var best = best_lap(pilot);
	pilot.last_is_best = laps.length > 1 && lap_ms === best;

	Announcer.lap(pilot.name, lap_count(pilot), lap_ms / 1000);

	// Lead changes, announced only once per change and only once someone has
	// actually completed a lap.
	var order = standings();
	if (order.length && lap_count(order[0]) > 0 && order[0] !== leader) {
		if (leader != null) Announcer.lead_change(order[0].name);
		leader = order[0];
	}

	// Final lap: said once, when the first pilot starts their last one.
	if (!announced_last_lap && lap_count(pilot) == target_laps - 1 && target_laps > 1) {
		announced_last_lap = true;
		Announcer.last_lap(pilot.name);
	}

	if (pilot.finished_at == null && lap_count(pilot) >= target_laps) {
		// Rank among those already home by time on track, not by the order the
		// lap messages happened to arrive. Those are usually the same, but
		// deriving it from elapsed time is what guarantees the announced
		// finishing position agrees with the standings above it.
		var mine = elapsed_time(pilot);
		var ahead = pilots.filter(function (p) {
			return p.finished_at != null && elapsed_time(p) < mine;
		}).length;
		pilot.finished_at = ahead + 1;
		Announcer.finish(pilot.name, pilot.finished_at);
	}

	render();
	render_lap_tables();
}

BC.on_message(function (msg) {
	if (msg.extended) {
		switch (msg.cmd) {
			case "R":
				race_num = parseInt(msg.payload, 16);
				document.getElementById("race_num").innerText = race_num;
				break;
			case "M": // how many receivers the timer is configured for
				num_receivers = parseInt(msg.payload[0], 16) || NUM_PILOTS;
				render_roster();
				break;
		}
		return;
	}

	switch (msg.cmd) {
		case "L":
			on_lap(msg.node,
				parseInt(msg.payload.substr(0, 2), 16),
				parseInt(msg.payload.substr(2), 16));
			break;
		case "A":
			pilots[msg.node].active = msg.payload[0] == "1";
			BC.received(document.getElementById("roster_active_" + msg.node));
			document.getElementById("roster_active_" + msg.node).checked =
				pilots[msg.node].active;
			render_roster();
			render();
			break;
		case "B":
			pilots[msg.node].band = parseInt(msg.payload[0], 16);
			render_roster();
			break;
		case "C":
			pilots[msg.node].channel = parseInt(msg.payload[0], 16);
			render_roster();
			break;
		case "T":
			pilots[msg.node].threshold = parseInt(msg.payload, 16);
			var field = document.getElementById("roster_threshold_" + msg.node);
			if (field != null && document.activeElement !== field) {
				field.value = pilots[msg.node].threshold;
			}
			BC.received(field);
			render_roster();
			break;
		case "r": // current RSSI, already divided by 12 by the timer
			pilots[msg.node].rssi = parseInt(msg.payload, 16);
			break;
		case "R":
			set_racing(parseInt(msg.payload[0]) != 0);
			break;
		case "1": // whether the first lap counts
			count_first = parseInt(msg.payload[0], 16);
			render();
			break;
	}
});

/* ---------------- race control ---------------- */

function set_racing(value) {
	if (racing == value) return;
	racing = value;
	var bar = document.querySelector(".bc-race-bar");
	var button = document.getElementById("race_button");

	if (racing) {
		race_started_at = Date.now();
		bar.classList.add("racing");
		document.getElementById("race_status").innerText = "Racing";
		button.innerText = "Stop";
		button.className = "bc-danger";
		set_roster_open(false);
	} else {
		bar.classList.remove("racing");
		document.getElementById("race_status").innerText = "Finished";
		button.innerText = "Start";
		button.className = "bc-primary";
		set_roster_open(true);
	}
}

function reset_race() {
	// Keep the round that just ran; only the live table is cleared.
	archive_current_race();
	pilots.forEach(function (pilot) {
		pilot.laps = [];
		pilot.finished_at = null;
		pilot.last_is_best = false;
	});
	leader = null;
	announced_last_lap = false;
	container.dataset.signature = ""; // force a rebuild
	render();
	render_lap_tables();
}

document.getElementById("race_button").onclick = function () {
	if (racing) {
		BC.send("R*R0\n");
	} else {
		reset_race();
		BC.send("R*R1\n");
		Announcer.go();
	}
};

document.getElementById("target_laps").addEventListener("input", function () {
	target_laps = Math.max(1, parseInt(this.value, 10) || 1);
	try { localStorage.setItem("bc_target_laps", target_laps); } catch (e) { /* ignore */ }
	render();
});

try {
	var stored_laps = parseInt(localStorage.getItem("bc_target_laps"), 10);
	if (!isNaN(stored_laps)) {
		target_laps = stored_laps;
		document.getElementById("target_laps").value = stored_laps;
	}
} catch (e) { /* ignore */ }

setInterval(function () {
	if (!racing) return;
	var elapsed = Math.floor((Date.now() - race_started_at) / 1000);
	document.getElementById("race_clock").innerText =
		String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" +
		String(elapsed % 60).padStart(2, "0");
}, 500);

BC.on_open(function () {
	BC.request_all();
	// The roster meters need RSSI, but polling R*r is far lighter than the
	// extended stream and this page plots nothing.
	BC.set_rssi_interval(0);
});

// Poll RSSI for the threshold meters, and repaint them off the same timer so
// a burst of samples can't drive a repaint per message.
setInterval(function () { BC.send("R*r\n"); }, 300);
setInterval(render_roster, 300);

// Collapse the roster when a race starts so the standings are what's on screen,
// and open it again when the race ends.
function set_roster_open(open) {
	document.getElementById("roster_card").open = open;
}

/* ---------------- options ---------------- */

var voice_select = document.getElementById("voice_select");
var lang_select = document.getElementById("lang_select");
var voice_hint = document.getElementById("voice_hint");

try {
	var stored_lang = localStorage.getItem("bc_lang");
	if (stored_lang) lang_select.value = stored_lang;
} catch (e) { /* ignore */ }
Announcer.set_language(lang_select.value);

// The browser can only speak with voices the device already has, so say so
// plainly when the chosen language has none rather than failing silently.
function on_voices_ready(found_match) {
	if (found_match) {
		voice_hint.innerText = "";
		return;
	}
	voice_hint.innerText = lang_select.value == "ar"
		? "No Arabic voice is installed on this device, so callouts will use " +
		  "whatever voice is selected. Add one under Settings › Accessibility " +
		  "› Spoken Content › Voices on iOS, or in the Google " +
		  "text-to-speech settings on Android."
		: "No voice for this language is installed on this device.";
}

Announcer.populate_voices(voice_select, on_voices_ready);

voice_select.addEventListener("change", function () {
	Announcer.set_voice(this.value);
	try { localStorage.setItem("bc_voice", this.value); } catch (e) { /* ignore */ }
});

lang_select.addEventListener("change", function () {
	Announcer.set_language(this.value);
	try {
		localStorage.setItem("bc_lang", this.value);
		// The stored voice belongs to the previous language, so let the picker
		// choose a fitting one again.
		localStorage.removeItem("bc_voice");
	} catch (e) { /* ignore */ }
	Announcer.populate_voices(voice_select, on_voices_ready);
});

var opt_voice = document.getElementById("opt_voice");
try {
	if (localStorage.getItem("bc_callouts") == "0") opt_voice.checked = false;
} catch (e) { /* ignore */ }
Announcer.set_enabled(opt_voice.checked);
opt_voice.addEventListener("change", function () {
	Announcer.set_enabled(this.checked);
	try { localStorage.setItem("bc_callouts", this.checked ? "1" : "0"); } catch (e) { /* ignore */ }
});

var opt_awake = document.getElementById("opt_awake");
var awake_state = document.getElementById("awake_state");
try {
	if (localStorage.getItem("keep_awake") == "0") opt_awake.checked = false;
} catch (e) { /* ignore */ }

function refresh_awake() {
	try { localStorage.setItem("keep_awake", opt_awake.checked ? "1" : "0"); } catch (e) { /* ignore */ }
	if (opt_awake.checked) {
		NoSleep.enable();
		awake_state.innerText = NoSleep.is_enabled()
			? "Screen will stay on." : "Tap anywhere to arm the screen lock.";
	} else {
		NoSleep.disable();
		awake_state.innerText = "";
	}
}

opt_awake.addEventListener("change", refresh_awake);

// Both the wake lock and speech need a user gesture before they'll start.
function arm_on_gesture() {
	if (opt_awake.checked && !NoSleep.is_enabled()) refresh_awake();
}
document.addEventListener("click", arm_on_gesture);
document.addEventListener("touchend", arm_on_gesture);

refresh_awake();
build_roster();
render_roster();
render();
render_lap_tables();

BC.fetch_version(function (version) {
	if (version != null) {
		document.getElementById("foot_version").innerText = "v" + version.firmware;
	}
});
