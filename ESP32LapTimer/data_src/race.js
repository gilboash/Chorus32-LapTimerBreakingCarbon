/* Race management: live standings, lap capture and spoken callouts. */

BC.start("race.html");

var NUM_PILOTS = 8;
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
	};
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
	if (lead == null || pilot === lead) return "leader";
	var lap_diff = lap_count(lead) - lap_count(pilot);
	if (lap_diff > 0) return "+" + lap_diff + (lap_diff == 1 ? " lap" : " laps");
	var delta = elapsed_time(pilot) - elapsed_time(lead);
	return "+" + (delta / 1000).toFixed(2) + "s";
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
				'<div class="bc-last"><span class="bc-value"></span>' +
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
			"<span>Lap " + lap_count(pilot) + "/" + target_laps + "</span>" +
			"<span>Best " + format_time(best_lap(pilot)) + "</span>" +
			"<span>2&nbsp;consec " + format_time(consec) + "</span>";
	});
}

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
}

BC.on_message(function (msg) {
	if (msg.extended) {
		if (msg.cmd == "R") {
			race_num = parseInt(msg.payload, 16);
			document.getElementById("race_num").innerText = race_num;
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
			render();
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
	} else {
		bar.classList.remove("racing");
		document.getElementById("race_status").innerText = "Finished";
		button.innerText = "Start";
		button.className = "bc-primary";
	}
}

function reset_race() {
	pilots.forEach(function (pilot) {
		pilot.laps = [];
		pilot.finished_at = null;
		pilot.last_is_best = false;
	});
	leader = null;
	announced_last_lap = false;
	container.dataset.signature = ""; // force a rebuild
	render();
}

document.getElementById("race_button").onclick = function () {
	if (racing) {
		BC.send("R*R0\n");
	} else {
		reset_race();
		BC.send("R*R1\n");
		Announcer.say("Go");
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
	// No RSSI stream on this page: it's a lot of traffic and nothing here plots it.
	BC.set_rssi_interval(0);
});

/* ---------------- options ---------------- */

var voice_select = document.getElementById("voice_select");
Announcer.populate_voices(voice_select);
voice_select.addEventListener("change", function () {
	Announcer.set_voice(this.value);
	try { localStorage.setItem("bc_voice", this.value); } catch (e) { /* ignore */ }
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
render();

BC.fetch_version(function (version) {
	if (version != null) {
		document.getElementById("foot_version").innerText = "v" + version.firmware;
	}
});
