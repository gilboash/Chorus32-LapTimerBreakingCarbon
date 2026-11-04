/* Gate-crossing beep, in the browser.
 *
 * This is the instant acknowledgement that someone went through: it fires the
 * moment the lap message arrives, where the spoken callout is a sentence long
 * and may be queued behind another. Separate from the timer's own buzzer,
 * which is a setting on the device.
 *
 * Synthesised with Web Audio rather than shipped as a sound file: it costs no
 * filesystem space on a 192KB partition, starts with no load delay, and lets
 * each receiver have its own pitch so you can tell who crossed by ear.
 */

var Beep = (function () {

	var ctx = null;
	var enabled = true;
	var unavailable = false;

	// One pitch per receiver. Spaced widely enough to tell apart over a track
	// PA and a quad on full throttle, and kept off a chromatic scale so two
	// near-simultaneous crossings don't sound like one chord.
	var TONES = [880, 1047, 1245, 1480, 1760, 2093, 2489, 2960];

	function context() {
		if (unavailable) return null;
		if (ctx == null) {
			var Ctor = window.AudioContext || window.webkitAudioContext;
			if (!Ctor) { unavailable = true; return null; }
			try {
				ctx = new Ctor();
			} catch (e) {
				unavailable = true;
				return null;
			}
		}
		return ctx;
	}

	// Browsers start the audio context suspended until the page has been
	// interacted with, same as speech and video playback. Call this from a
	// real tap.
	function arm() {
		var c = context();
		if (c == null) return;
		if (c.state === "suspended") {
			try { c.resume(); } catch (e) { /* will retry on the next tap */ }
		}
	}

	function is_ready() {
		return ctx != null && ctx.state === "running";
	}

	function set_enabled(value) {
		enabled = value;
		if (enabled) arm();
	}

	function tone(frequency, duration, volume) {
		var c = context();
		if (c == null || c.state !== "running") return;

		var osc = c.createOscillator();
		var gain = c.createGain();
		var now = c.currentTime;

		osc.type = "square"; // carries better outdoors than a sine
		osc.frequency.setValueAtTime(frequency, now);

		// Short ramps at both ends: switching a square wave on and off at full
		// amplitude puts a click in front of the note.
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(volume, now + 0.005);
		gain.gain.setValueAtTime(volume, now + duration - 0.02);
		gain.gain.linearRampToValueAtTime(0, now + duration);

		osc.connect(gain);
		gain.connect(c.destination);
		osc.start(now);
		osc.stop(now + duration + 0.02);
	}

	/// A crossing by the given receiver.
	function lap(node) {
		if (!enabled) return;
		tone(TONES[node % TONES.length], 0.09, 0.22);
	}

	/// Race start: two rising notes, clearly not a lap.
	function start() {
		if (!enabled) return;
		tone(660, 0.12, 0.2);
		setTimeout(function () { tone(990, 0.18, 0.2); }, 150);
	}

	/// A pilot has finished: three quick notes.
	function finish() {
		if (!enabled) return;
		tone(990, 0.09, 0.2);
		setTimeout(function () { tone(1245, 0.09, 0.2); }, 110);
		setTimeout(function () { tone(1480, 0.2, 0.2); }, 220);
	}

	return {
		arm: arm,
		set_enabled: set_enabled,
		is_ready: is_ready,
		lap: lap,
		start: start,
		finish: finish,
	};
})();
