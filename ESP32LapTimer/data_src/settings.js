/* Settings page.
 *
 * Every control follows the same contract as the old UI: mark the field orange
 * the moment a change is sent, and green once the timer echoes the value back.
 * That echo is the only confirmation the protocol offers, so it matters.
 */

BC.start("settings.html");

var NUM_PILOTS = 8;
var MAX_RECEIVERS = 6;

var BANDS = [
	{ value: 0, label: "R (Raceband)" },
	{ value: 1, label: "A" },
	{ value: 2, label: "B" },
	{ value: 3, label: "E" },
	{ value: 4, label: "F (Airwave)" },
	{ value: 5, label: "D (5.3)" },
	{ value: 6, label: "Connex" },
	{ value: 7, label: "Connex 2" },
];

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

function pending(el) {
	if (el) el.setAttribute("val_state", "pending");
}

// Confirmation is a moment, not a state: leaving every field outlined green
// just adds noise once the page has loaded. Pending and error stay put,
// because those are conditions you need to keep seeing.
function received(el) {
	if (!el) return;
	el.setAttribute("val_state", "received");
	clearTimeout(el._confirm_timer);
	el._confirm_timer = setTimeout(function () {
		el.removeAttribute("val_state");
	}, 1200);
}

function id(name) { return document.getElementById(name); }

/* ---------------- per-receiver cards ---------------- */

function build_receivers() {
	var html = "";
	for (var node = 0; node < NUM_PILOTS; ++node) {
		var band_options = BANDS.map(function (band) {
			return '<option value="' + band.value + '">' + band.label + "</option>";
		}).join("");

		var channel_options = "";
		for (var ch = 0; ch < 8; ++ch) {
			channel_options += '<option value="' + ch + '">' + (ch + 1) + "</option>";
		}

		html +=
			'<div class="bc-rx" id="rx_card_' + node + '" ' +
			'style="--rx-colour:var(--rx' + (node + 1) + ')">' +
				'<div class="bc-rx-head">' +
					'<span class="bc-rx-title">Receiver ' + (node + 1) + "</span>" +
					'<span class="bc-rx-freq" id="rx_freq_' + node + '">&mdash;</span>' +
					'<label class="bc-check"><input type="checkbox" id="rx_active_' + node + '" /> On</label>' +
				"</div>" +
				'<div class="bc-rx-grid">' +
					'<div class="bc-field"><label>Band</label>' +
						'<select id="rx_band_' + node + '">' + band_options + "</select></div>" +
					'<div class="bc-field"><label>Channel</label>' +
						'<select id="rx_channel_' + node + '">' + channel_options + "</select></div>" +
					'<div class="bc-field"><label>Threshold</label>' +
						'<input type="number" min="0" max="341" id="rx_threshold_' + node + '" /></div>' +
					'<div class="bc-field"><label>Multiplexing</label>' +
						'<label class="bc-check" style="min-height:44px">' +
						'<input type="checkbox" id="rx_multiplex_' + node + '" /> Disabled</label></div>' +
					'<div class="bc-rx-rssi">' +
						"<span>RSSI</span>" +
						'<span class="bc-rx-meter"><span class="bc-rx-level" id="rx_level_' + node + '"></span>' +
						'<span class="bc-rx-mark" id="rx_mark_' + node + '"></span></span>' +
						'<span id="rx_value_' + node + '">0</span>' +
					"</div>" +
				"</div>" +
			"</div>";
	}
	id("receivers").innerHTML = html;

	for (node = 0; node < NUM_PILOTS; ++node) {
		wire_receiver(node);
	}
}

function wire_receiver(node) {
	var band = id("rx_band_" + node);
	band.addEventListener("change", function () {
		pending(this);
		BC.set_value(node, "B", parseInt(this.value, 10), 4);
	});

	var channel = id("rx_channel_" + node);
	channel.addEventListener("change", function () {
		pending(this);
		BC.set_value(node, "C", parseInt(this.value, 10), 4);
	});

	var threshold = id("rx_threshold_" + node);
	threshold.addEventListener("change", function () {
		pending(this);
		BC.set_value(node, "T", parseInt(this.value, 10) || 0, 16);
	});

	var active = id("rx_active_" + node);
	active.addEventListener("change", function () {
		pending(this);
		BC.set_value(node, "A", this.checked ? 1 : 0, 4);
	});

	var multiplex = id("rx_multiplex_" + node);
	multiplex.addEventListener("change", function () {
		pending(this);
		BC.set_extended(node, "m", this.checked ? 1 : 0, 4);
	});
}

function update_freq(node) {
	var band = parseInt(id("rx_band_" + node).value, 10);
	var channel = parseInt(id("rx_channel_" + node).value, 10);
	var freq = FREQ_TABLE[channel + 8 * band];
	id("rx_freq_" + node).innerText = freq ? freq + " MHz" : "—";
}

// Only show as many receiver cards as the timer is configured for.
function apply_receiver_count(count) {
	for (var node = 0; node < NUM_PILOTS; ++node) {
		var card = id("rx_card_" + node);
		if (card != null) card.style.display = node < count ? "" : "none";
	}
}

/* ---------------- message handling ---------------- */

var thresholds = [];

BC.on_message(function (msg) {
	var field;

	if (msg.extended) {
		switch (msg.cmd) {
			case "v": // VBAT mode
				field = id("vbat_mode");
				field.value = parseInt(msg.payload[0], 16);
				received(field);
				break;
			case "V": // VBAT calibration, sent x1000
				field = id("vbat_calib");
				field.value = parseInt(msg.payload, 16) / 1000;
				received(field);
				break;
			case "D":
				field = id("display_timeout");
				field.value = parseInt(msg.payload, 16);
				received(field);
				break;
			case "W":
				field = id("wifi_channel");
				field.value = parseInt(msg.payload[0], 16);
				received(field);
				break;
			case "z":
				field = id("wifi_ssid");
				field.value = parseInt(msg.payload, 16);
				id("ssid_preview").innerText = field.value;
				received(field);
				break;
			case "w":
				field = id("wifi_protocol");
				field.value = parseInt(msg.payload[0], 16);
				received(field);
				break;
			case "F":
				field = id("filter_cutoff");
				field.value = parseInt(msg.payload, 16);
				received(field);
				break;
			case "M":
				field = id("num_rx");
				field.value = parseInt(msg.payload[0], 16);
				received(field);
				apply_receiver_count(parseInt(msg.payload[0], 16));
				break;
			case "m":
				field = id("rx_multiplex_" + msg.node);
				if (field) { field.checked = parseInt(msg.payload[0], 16) == 1; received(field); }
				break;
			case "E": // EEPROM reset acknowledged
				received(id("eeprom_reset"));
				BC.request_all();
				break;
			case "G": // restart acknowledged
				received(id("chorus_reset"));
				break;
			case "S": // calibration finished
				received(id("calibrate_button"));
				id("calibrate_button").innerText = "Calibrate RSSI";
				id("calibrate_button").disabled = false;
				break;
		}
		return;
	}

	switch (msg.cmd) {
		case "B":
			field = id("rx_band_" + msg.node);
			if (field) { field.value = parseInt(msg.payload[0], 16); received(field); update_freq(msg.node); }
			break;
		case "C":
			field = id("rx_channel_" + msg.node);
			if (field) { field.value = parseInt(msg.payload[0], 16); received(field); update_freq(msg.node); }
			break;
		case "T":
			field = id("rx_threshold_" + msg.node);
			if (field) {
				thresholds[msg.node] = parseInt(msg.payload, 16);
				field.value = thresholds[msg.node];
				received(field);
			}
			break;
		case "A":
			field = id("rx_active_" + msg.node);
			if (field) { field.checked = msg.payload[0] == "1"; received(field); }
			break;
		case "S": // buzzer
			field = id("opt_sound");
			field.checked = parseInt(msg.payload[0], 16) == 1;
			received(field);
			break;
		case "r": // current RSSI, already divided by 12 by the timer
			var value = parseInt(msg.payload, 16);
			var label = id("rx_value_" + msg.node);
			var level = id("rx_level_" + msg.node);
			var mark = id("rx_mark_" + msg.node);
			if (label) label.innerText = value;
			if (level) level.style.width = Math.min(100, (value / 341) * 100) + "%";
			if (mark && thresholds[msg.node] != null) {
				mark.style.left = Math.min(100, (thresholds[msg.node] / 341) * 100) + "%";
			}
			break;
	}
});

/* ---------------- global controls ---------------- */

id("num_rx").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "M", parseInt(this.value, 10), 4);
	apply_receiver_count(parseInt(this.value, 10));
});

id("opt_sound").addEventListener("change", function () {
	pending(this);
	BC.set_value("*", "S", this.checked ? 1 : 0, 4);
});

id("vbat_mode").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "v", parseInt(this.value, 10), 4);
});

id("vbat_calib").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "V", Math.round(parseFloat(this.value) * 1000) || 0, 16);
});

id("wifi_protocol").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "w", parseInt(this.value, 10), 4);
});

id("wifi_channel").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "W", parseInt(this.value, 10) || 1, 4);
});

id("wifi_ssid").addEventListener("change", function () {
	pending(this);
	id("ssid_preview").innerText = this.value;
	BC.set_extended("*", "z", parseInt(this.value, 10) || 0, 16);
});

id("filter_cutoff").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "F", parseInt(this.value, 10) || 0, 16);
});

id("display_timeout").addEventListener("change", function () {
	pending(this);
	BC.set_extended("*", "D", parseInt(this.value, 10) || 0, 16);
});

id("calibrate_button").addEventListener("click", function () {
	pending(this);
	this.disabled = true;
	this.innerText = "Calibrating…";
	BC.send("ER*s\n");
});

id("chorus_reset").addEventListener("click", function () {
	pending(this);
	BC.send("ER*G\n");
});

id("eeprom_reset").addEventListener("click", function () {
	pending(this);
	BC.send("ER*E\n");
});

/* ---------------- startup ---------------- */

build_receivers();

BC.on_open(function () {
	BC.request_all();
	BC.set_rssi_interval(0); // the per-receiver meters poll instead
});

// The meters need current RSSI; ask for it rather than opening the firehose.
setInterval(function () { BC.send("R*r\n"); }, 500);

BC.fetch_version(function (version) {
	if (version != null) {
		id("foot_version").innerText = "v" + version.firmware;
	}
});
