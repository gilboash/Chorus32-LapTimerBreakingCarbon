/* Landing page: live RSSI for every enabled receiver, plus timer status. */

BC.start("index.html");

var plot = new BCPlot(document.getElementById("rssi_plot"), { window_ms: 20000 });
plot.start();

// Mirrors channelFreqTable in src/RX5808.h so the legend can show the actual
// frequency rather than just a band letter and a channel number.
var BAND_LABELS = ["R", "A", "B", "E", "F", "D", "CX", "CX2"];
var FREQ_TABLE = [
	5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917, // Raceband
	5865, 5845, 5825, 5805, 5785, 5765, 5745, 5725, // A
	5733, 5752, 5771, 5790, 5809, 5828, 5847, 5866, // B
	5705, 5685, 5665, 5645, 5885, 5905, 5925, 5945, // E
	5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880, // F
	5362, 5399, 5436, 5473, 5510, 5547, 5584, 5621, // D
	5180, 5200, 5220, 5240, 5745, 5765, 5785, 5805, // Connex
	5825, 5845, 5845, 5845, 5845, 5845, 5845, 5845, // Connex 2
];

var NUM_PILOTS = 8;
var pilots = [];
for (var i = 0; i < NUM_PILOTS; ++i) {
	pilots[i] = { active: false, band: 0, channel: 0, threshold: null, rssi: 0 };
}

function freq_of(pilot) {
	var index = pilot.channel + 8 * pilot.band;
	return FREQ_TABLE[index] !== undefined ? FREQ_TABLE[index] : 0;
}

function label_of(node) {
	var pilot = pilots[node];
	return BAND_LABELS[pilot.band] + (pilot.channel + 1) + " " + freq_of(pilot);
}

var legend_dirty = true;

function rebuild_series() {
	plot.clear_series();
	var any = false;
	for (var node = 0; node < NUM_PILOTS; ++node) {
		if (!pilots[node].active) continue;
		any = true;
		plot.add_series(node, label_of(node));
		if (pilots[node].threshold != null) {
			plot.set_threshold(node, pilots[node].threshold);
		}
	}
	document.getElementById("rssi_empty").style.display = any ? "none" : "";
	legend_dirty = true;
}

function render_legend() {
	if (!legend_dirty) return;
	legend_dirty = false;
	var legend = document.getElementById("rssi_legend");
	var html = "";
	for (var node = 0; node < NUM_PILOTS; ++node) {
		if (!pilots[node].active) continue;
		html += '<span class="bc-legend-item">' +
			'<span class="bc-swatch" style="background:var(--rx' + (node + 1) + ')"></span>' +
			"RX" + (node + 1) + " " + label_of(node) +
			' <b id="legend_rssi_' + node + '">0</b></span>';
	}
	legend.innerHTML = html;
}

// Updating the legend numbers by innerHTML every frame would thrash the DOM,
// so only the value nodes are touched, on a timer rather than per message.
function update_legend_values() {
	for (var node = 0; node < NUM_PILOTS; ++node) {
		var cell = document.getElementById("legend_rssi_" + node);
		if (cell != null) cell.innerText = pilots[node].rssi;
	}
}

BC.on_message(function (msg) {
	if (msg.extended) {
		switch (msg.cmd) {
			case "y": // RSSI sample: 8 hex of millis, then 4 hex of raw RSSI
				var time = parseInt(msg.payload.substr(0, 8), 16);
				var rssi = parseInt(msg.payload.substr(8, 4), 16);
				pilots[msg.node].rssi = rssi;
				plot.push(msg.node, time, rssi);
				break;
			case "H": // free heap
				document.getElementById("stat_heap").innerText =
					(parseInt(msg.payload, 16) / 1024).toFixed(0);
				break;
			case "M": // number of receivers configured
				document.getElementById("stat_rx").innerText = parseInt(msg.payload, 16);
				break;
		}
		return;
	}

	switch (msg.cmd) {
		case "A": // pilot active
			pilots[msg.node].active = msg.payload[0] == "1";
			rebuild_series();
			break;
		case "B": // band
			pilots[msg.node].band = parseInt(msg.payload[0], 16);
			rebuild_series();
			break;
		case "C": // channel
			pilots[msg.node].channel = parseInt(msg.payload[0], 16);
			rebuild_series();
			break;
		case "T": // threshold, sent divided by 12
			pilots[msg.node].threshold = parseInt(msg.payload, 16) * 12;
			plot.set_threshold(msg.node, pilots[msg.node].threshold);
			break;
		case "v": // battery, as the raw divider reading the app expects
			document.getElementById("stat_vbat").innerText =
				(parseInt(msg.payload, 16) * (5 / 1024) * 11).toFixed(2);
			break;
		case "R": // race mode
			document.getElementById("stat_race").innerText =
				parseInt(msg.payload[0]) ? "On" : "Idle";
			break;
	}
});

function current_interval() {
	return parseInt(document.getElementById("plot_interval").value, 10);
}

BC.on_open(function () {
	BC.request_all();
	BC.set_rssi_interval(current_interval());
});

document.getElementById("plot_interval").addEventListener("change", function () {
	BC.set_rssi_interval(current_interval());
});

document.getElementById("plot_window").addEventListener("change", function () {
	plot.set_window(parseInt(this.value, 10));
});

// Heap and battery aren't pushed, so ask for them periodically.
setInterval(function () {
	BC.send("R*v\n");
	BC.send("ER*H\n");
}, 2000);

setInterval(function () {
	render_legend();
	update_legend_values();
}, 200);

BC.fetch_version(function (version) {
	if (version == null) return;
	document.getElementById("foot_version").innerText = "v" + version.firmware;
	document.getElementById("foot_build").innerText = version.git + " · " + version.built;

	if (!version.match) {
		document.getElementById("mismatch_card").style.display = "";
		document.getElementById("mismatch_text").innerText =
			"Firmware is " + version.firmware + " but the web interface is " +
			version.filesystem + ". These are two separate uploads, so one of " +
			"them did not take. Re-upload the matching file.";
	}
});

// Leaving the RSSI stream running after the page closes would keep the timer
// generating traffic for nobody.
window.addEventListener("pagehide", function () {
	BC.set_rssi_interval(0);
});
