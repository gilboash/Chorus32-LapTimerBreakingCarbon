/* Live RSSI plot, drawn spectrum-analyser style.
 *
 * Canvas rather than an SVG chart library: this redraws every animation frame
 * with up to 8 series, and rebuilding that many SVG nodes at 10-20Hz visibly
 * stutters on a phone, which is the one device this has to stay smooth on.
 *
 * Values are raw 12-bit ADC readings (0-4095) exactly as the timer sends them.
 */

function BCPlot(canvas, options) {
	options = options || {};

	var ctx = canvas.getContext("2d");
	var window_ms = options.window_ms || 20000;
	var floor_value = options.floor !== undefined ? options.floor : 600;
	var ceil_value = options.ceil !== undefined ? options.ceil : 3200;

	// One ring buffer per receiver. Capped by time, not by sample count, so a
	// faster RSSI interval just means a denser trace rather than a shorter one.
	var series = {};
	var running = false;

	// The ceiling follows the data instead of being fixed, otherwise gate-pass
	// spikes clip flat against the top of the plot and you lose the shape that
	// tells you whether the threshold is set sensibly. Eased so it glides
	// rather than jumping on every spike.
	var shown_ceiling = ceil_value;
	var ceiling_target = ceil_value;
	var ceiling_checked = 0;

	// Rescanning every sample of every series on each animation frame is a lot
	// of pointless work at 60fps, and the answer barely moves between frames.
	function refresh_ceiling_target() {
		var now = Date.now();
		if (now - ceiling_checked < 250) return;
		ceiling_checked = now;
		ceiling_target = target_ceiling();
	}

	function target_ceiling() {
		var peak = floor_value;
		for (var node in series) {
			var points = series[node].points;
			for (var i = 0; i < points.length; ++i) {
				if (points[i].v > peak) peak = points[i].v;
			}
			if (series[node].threshold != null && series[node].threshold > peak) {
				peak = series[node].threshold;
			}
		}
		// Headroom above the peak, and never a squashed range on a quiet trace.
		return Math.min(4095, Math.max(floor_value + 800, peak * 1.12));
	}

	function colour_for(node) {
		var style = getComputedStyle(document.documentElement);
		return style.getPropertyValue("--rx" + (node + 1)).trim() || "#888";
	}

	function css(name) {
		return getComputedStyle(document.documentElement)
			.getPropertyValue(name).trim();
	}

	this.add_series = function (node, label) {
		if (series[node] === undefined) {
			series[node] = { points: [], label: label, peak: 0, peak_time: 0, threshold: null };
		} else {
			series[node].label = label;
		}
	};

	this.remove_series = function (node) {
		delete series[node];
	};

	this.clear_series = function () {
		series = {};
	};

	this.has_series = function () {
		return Object.keys(series).length > 0;
	};

	this.set_threshold = function (node, value) {
		if (series[node] !== undefined) series[node].threshold = value;
	};

	this.push = function (node, time, value) {
		var s = series[node];
		if (s === undefined) return;
		s.points.push({ t: time, v: value });

		// Peak hold, the detail that makes it read as a spectrum analyser.
		// Decays so an old spike doesn't pin the marker forever.
		if (value >= s.peak || time - s.peak_time > 3000) {
			s.peak = value;
			s.peak_time = time;
		}

		var cutoff = time - window_ms;
		while (s.points.length > 0 && s.points[0].t < cutoff) {
			s.points.shift();
		}
	};

	function latest_time() {
		var newest = 0;
		for (var node in series) {
			var points = series[node].points;
			if (points.length > 0) {
				newest = Math.max(newest, points[points.length - 1].t);
			}
		}
		return newest;
	}

	function resize() {
		// Match the backing store to the CSS size times DPR, otherwise the
		// trace is blurry on every phone made in the last decade.
		var dpr = window.devicePixelRatio || 1;
		var width = canvas.clientWidth;
		var height = canvas.clientHeight;
		if (canvas.width != width * dpr || canvas.height != height * dpr) {
			canvas.width = width * dpr;
			canvas.height = height * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { w: width, h: height };
	}

	function draw() {
		if (!running) return;
		requestAnimationFrame(draw);

		var size = resize();
		var w = size.w;
		var h = size.h;
		if (w == 0 || h == 0) return;

		ctx.clearRect(0, 0, w, h);

		var pad_left = 34;
		var pad_bottom = 16;
		var pad_top = 8;
		var plot_w = w - pad_left - 6;
		var plot_h = h - pad_top - pad_bottom;

		var now = latest_time();
		var start = now - window_ms;

		refresh_ceiling_target();
		shown_ceiling += (ceiling_target - shown_ceiling) * 0.08;

		function x_at(t) { return pad_left + ((t - start) / window_ms) * plot_w; }
		function y_at(v) {
			var clamped = Math.max(floor_value, Math.min(shown_ceiling, v));
			var frac = (clamped - floor_value) / (shown_ceiling - floor_value);
			return pad_top + plot_h - frac * plot_h;
		}

		// grid
		var line_colour = css("--line");
		var dim_colour = css("--text-dim");
		ctx.strokeStyle = line_colour;
		ctx.fillStyle = dim_colour;
		ctx.lineWidth = 1;
		ctx.font = "10px -apple-system, system-ui, sans-serif";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";

		var steps = 4;
		for (var i = 0; i <= steps; ++i) {
			var value = floor_value + ((shown_ceiling - floor_value) * i) / steps;
			var y = Math.round(y_at(value)) + 0.5;
			ctx.beginPath();
			ctx.moveTo(pad_left, y);
			ctx.lineTo(pad_left + plot_w, y);
			ctx.stroke();
			ctx.fillText(String(Math.round(value)), pad_left - 6, y);
		}

		if (now == 0) {
			ctx.textAlign = "center";
			ctx.fillText("waiting for RSSI…", pad_left + plot_w / 2, pad_top + plot_h / 2);
			return;
		}

		for (var node in series) {
			var s = series[node];
			if (s.points.length < 2) continue;
			var colour = colour_for(parseInt(node, 10));

			// Filled area under the trace, faded out towards the bottom.
			var gradient = ctx.createLinearGradient(0, pad_top, 0, pad_top + plot_h);
			gradient.addColorStop(0, hex_to_rgba(colour, 0.35));
			gradient.addColorStop(1, hex_to_rgba(colour, 0.02));

			ctx.beginPath();
			ctx.moveTo(x_at(s.points[0].t), pad_top + plot_h);
			for (var p = 0; p < s.points.length; ++p) {
				ctx.lineTo(x_at(s.points[p].t), y_at(s.points[p].v));
			}
			ctx.lineTo(x_at(s.points[s.points.length - 1].t), pad_top + plot_h);
			ctx.closePath();
			ctx.fillStyle = gradient;
			ctx.fill();

			// The trace itself.
			ctx.beginPath();
			for (p = 0; p < s.points.length; ++p) {
				var px = x_at(s.points[p].t);
				var py = y_at(s.points[p].v);
				if (p == 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
			}
			ctx.strokeStyle = colour;
			ctx.lineWidth = 1.5;
			ctx.lineJoin = "round";
			ctx.stroke();

			// Threshold: where this receiver calls a lap.
			if (s.threshold != null) {
				var ty = Math.round(y_at(s.threshold)) + 0.5;
				ctx.save();
				ctx.setLineDash([3, 3]);
				ctx.strokeStyle = hex_to_rgba(colour, 0.6);
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(pad_left, ty);
				ctx.lineTo(pad_left + plot_w, ty);
				ctx.stroke();
				ctx.restore();
			}

			// Peak-hold tick at the right edge.
			var peak_y = y_at(s.peak);
			ctx.fillStyle = colour;
			ctx.fillRect(pad_left + plot_w - 10, peak_y - 1, 10, 2);
		}

		// time axis
		ctx.fillStyle = dim_colour;
		ctx.textAlign = "left";
		ctx.fillText("-" + Math.round(window_ms / 1000) + "s", pad_left, h - 6);
		ctx.textAlign = "right";
		ctx.fillText("now", pad_left + plot_w, h - 6);
	}

	// Accepts the #rrggbb that the CSS custom properties resolve to.
	function hex_to_rgba(colour, alpha) {
		var match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colour.trim());
		if (!match) return colour;
		return "rgba(" + parseInt(match[1], 16) + "," + parseInt(match[2], 16) +
			"," + parseInt(match[3], 16) + "," + alpha + ")";
	}

	this.start = function () {
		if (running) return;
		running = true;
		requestAnimationFrame(draw);
	};

	this.stop = function () { running = false; };

	this.set_window = function (ms) { window_ms = ms; };
}
