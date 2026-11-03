/* Spoken race callouts.
 *
 * speechSynthesis already queues utterances, so the risk isn't that calls cut
 * each other off -- it's the opposite. With six pilots crossing the gate the
 * queue grows faster than it drains and the voice ends up describing a race
 * that finished a minute ago. So lap callouts get a short shelf life and are
 * dropped if they've gone stale by the time the queue reaches them, while
 * results (lead changes, last lap, finishes) are always worth saying late.
 */

var Announcer = (function () {

	var enabled = true;
	var voice_name = null;
	var queue = [];
	var speaking = false;

	// A lap callout is worth about this long; after that the race has moved on.
	var LAP_TTL_MS = 6000;

	function set_enabled(value) {
		enabled = value;
		if (!enabled) {
			queue = [];
			try { speechSynthesis.cancel(); } catch (e) { /* not supported */ }
			speaking = false;
		}
	}

	function set_voice(name) {
		voice_name = name;
	}

	function pick_voice() {
		if (!voice_name) return null;
		var voices = speechSynthesis.getVoices();
		for (var i = 0; i < voices.length; ++i) {
			if (voices[i].name === voice_name) return voices[i];
		}
		return null;
	}

	function pump() {
		if (speaking || queue.length == 0 || !enabled) return;

		var item = queue.shift();
		// Drop lap callouts that waited too long; keep everything else.
		while (item != null && item.ttl != null && Date.now() - item.queued > item.ttl) {
			item = queue.shift();
		}
		if (item == null) return;

		var utterance = new SpeechSynthesisUtterance(item.text);
		utterance.lang = "en";
		var voice = pick_voice();
		if (voice != null) utterance.voice = voice;
		utterance.onend = function () { speaking = false; pump(); };
		utterance.onerror = function () { speaking = false; pump(); };

		speaking = true;
		try {
			speechSynthesis.speak(utterance);
		} catch (e) {
			speaking = false;
		}
	}

	function say(text, ttl) {
		if (!enabled || !text) return;
		queue.push({ text: text, ttl: ttl === undefined ? null : ttl, queued: Date.now() });
		pump();
	}

	// Lap callouts expire; the race has usually moved on by the time a backlog
	// would reach them.
	function lap(pilot, lap_number, seconds) {
		say(pilot + ", lap " + lap_number + ", " + seconds.toFixed(2) + " seconds", LAP_TTL_MS);
	}

	function lead_change(pilot) {
		say(pilot + " takes the lead");
	}

	function last_lap(pilot) {
		say(pilot + ", last lap");
	}

	function finish(pilot, position) {
		var words = ["", "first", "second", "third", "fourth",
			"fifth", "sixth", "seventh", "eighth"];
		say(pilot + " finishes " + (words[position] || position));
	}

	// Voices load asynchronously and the list is empty on first call in most
	// browsers, so fill the picker when it arrives rather than polling.
	function populate_voices(select, on_ready) {
		function fill() {
			var voices = speechSynthesis.getVoices();
			if (voices.length == 0) return false;

			select.innerHTML = "";
			var preferred = null;
			voices.forEach(function (voice) {
				var option = document.createElement("option");
				option.value = voice.name;
				option.textContent = voice.name;
				select.appendChild(option);
				// Prefer an english voice, by lang tag rather than by sniffing
				// the display name for a lowercase "english" that never matches.
				if (preferred == null && voice.lang &&
					voice.lang.toLowerCase().indexOf("en") == 0) {
					preferred = voice.name;
				}
			});

			var stored = null;
			try { stored = localStorage.getItem("bc_voice"); } catch (e) { /* ignore */ }
			select.value = stored || preferred || voices[0].name;
			set_voice(select.value);
			if (on_ready) on_ready();
			return true;
		}

		if (!fill()) {
			speechSynthesis.onvoiceschanged = function () { fill(); };
		}
	}

	return {
		set_enabled: set_enabled,
		set_voice: set_voice,
		say: say,
		lap: lap,
		lead_change: lead_change,
		last_lap: last_lap,
		finish: finish,
		populate_voices: populate_voices,
	};
})();
