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
	var language = "en";
	var queue = [];
	var speaking = false;

	// Callouts are phrased per language rather than translated word by word,
	// because an Arabic voice reading English word order sounds wrong. The
	// voice itself has to be installed on the device -- the Web Speech API has
	// no way to ship or fetch one -- so picking Arabic here only helps if the
	// phone has an Arabic voice (iOS: Settings > Accessibility > Spoken
	// Content > Voices; Android: Google TTS language packs).
	var PHRASES = {
		en: {
			tag: "en",
			go: "Go",
			lap: function (pilot, lap, seconds) {
				return pilot + ", lap " + lap + ", " + seconds.toFixed(2) + " seconds";
			},
			lead: function (pilot) { return pilot + " takes the lead"; },
			last: function (pilot) { return pilot + ", last lap"; },
			finish: function (pilot, position) {
				var words = ["", "first", "second", "third", "fourth",
					"fifth", "sixth", "seventh", "eighth"];
				return pilot + " finishes " + (words[position] || position);
			},
		},
		ar: {
			tag: "ar-SA",
			go: "انطلق",
			lap: function (pilot, lap, seconds) {
				// "<pilot>, lap <n>, <t> seconds"
				return pilot + "، لفة " + lap + "، " +
					seconds.toFixed(2) + " ثانية";
			},
			// "<pilot> takes the lead"
			lead: function (pilot) { return pilot + " يتصدر"; },
			// "<pilot>, the last lap"
			last: function (pilot) {
				return pilot + "، اللفة الأخيرة";
			},
			// "<pilot> finished in <n>th place"
			finish: function (pilot, position) {
				var words = ["", "الأول", "الثاني",
					"الثالث", "الرابع",
					"الخامس", "السادس",
					"السابع", "الثامن"];
				return pilot + " أنهى في المركز " +
					(words[position] || position);
			},
		},
	};

	function phrases() {
		return PHRASES[language] || PHRASES.en;
	}

	function set_language(lang) {
		var next = PHRASES[lang] ? lang : "en";
		if (next === language) return;
		language = next;
		// Queued lines are in the old language and were built for the old
		// voice, so they are no longer worth saying.
		reset();
	}

	function get_language() { return language; }

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
		if (voice_name === name) return;
		voice_name = name;
		// Drop anything already queued or mid-sentence. Otherwise the callout
		// you just changed the voice for is still read out in the old one.
		reset();
	}

	// Clears the queue and stops whatever is being spoken right now.
	function reset() {
		queue = [];
		speaking = false;
		try {
			speechSynthesis.cancel();
		} catch (e) {
			// Not supported; nothing queued to clear either.
		}
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
		utterance.lang = phrases().tag;
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

	/* ---------------- one speaker at a time ---------------- */

	// Every open copy of the race page has its own websocket, so every copy
	// hears every lap and every copy would announce it. Two of them left open
	// read the same callout twice, and if the voice was changed in only one
	// they read it in two different voices.
	//
	// The page loaded most recently claims the role; the others fall silent.
	// A storage event only fires in the *other* documents of an origin, which
	// is exactly the signal needed.
	var speaker_id = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
	var is_speaker = true;

	function claim_speaker() {
		is_speaker = true;
		try {
			localStorage.setItem("bc_speaker", speaker_id);
		} catch (e) {
			// No storage: assume this is the only copy, which it usually is.
		}
	}

	window.addEventListener("storage", function (event) {
		if (event.key !== "bc_speaker" || event.newValue == null) return;
		if (event.newValue === speaker_id) return;
		// Another copy of the page took over.
		is_speaker = false;
		reset();
	});

	function say(text, ttl) {
		if (!enabled || !text || !is_speaker) return;
		queue.push({ text: text, ttl: ttl === undefined ? null : ttl, queued: Date.now() });
		pump();
	}

	// Lap callouts expire; the race has usually moved on by the time a backlog
	// would reach them.
	function lap(pilot, lap_number, seconds) {
		say(phrases().lap(pilot, lap_number, seconds), LAP_TTL_MS);
	}

	function lead_change(pilot) {
		say(phrases().lead(pilot));
	}

	function last_lap(pilot) {
		say(phrases().last(pilot));
	}

	function finish(pilot, position) {
		say(phrases().finish(pilot, position));
	}

	function go() {
		say(phrases().go);
	}

	// Speaks one of each callout so the chosen voice and language can be
	// judged by ear without running a race. Uses the real phrase builders, so
	// what you hear here is exactly what a race will say.
	function preview(pilot_name) {
		var name = pilot_name || "Ron";
		reset();
		var p = phrases();
		say(p.go);
		say(p.lap(name, 3, 24.81));
		say(p.lead(name));
		say(p.last(name));
		say(p.finish(name, 1));
	}

	// Voices load asynchronously and the list is empty on first call in most
	// browsers, so fill the picker when it arrives rather than polling.
	function populate_voices(select, on_ready) {
		function fill() {
			var voices = speechSynthesis.getVoices();
			if (voices.length == 0) return false;

			// Show the language tag next to every name. Device voice names
			// give no clue what language they speak ("Maged", "Samantha"), so
			// without this an Arabic voice is unfindable in a list of forty.
			select.innerHTML = "";
			var want = (phrases().tag || "en").slice(0, 2).toLowerCase();
			var preferred = null;

			voices.slice().sort(function (a, b) {
				return (a.lang || "").localeCompare(b.lang || "") ||
					a.name.localeCompare(b.name);
			}).forEach(function (voice) {
				var option = document.createElement("option");
				option.value = voice.name;
				option.textContent = voice.name +
					(voice.lang ? " (" + voice.lang + ")" : "");
				select.appendChild(option);
				// Prefer a voice for the chosen callout language, by lang tag
				// rather than by sniffing the display name.
				if (preferred == null && voice.lang &&
					voice.lang.toLowerCase().indexOf(want) == 0) {
					preferred = voice.name;
				}
			});

			var stored = null;
			try { stored = localStorage.getItem("bc_voice"); } catch (e) { /* ignore */ }
			// Only honour a stored voice if it still exists on this device.
			var has_stored = stored && voices.some(function (v) { return v.name === stored; });
			select.value = has_stored ? stored : (preferred || voices[0].name);
			set_voice(select.value);
			if (on_ready) on_ready(preferred != null);
			return true;
		}

		if (!fill()) {
			speechSynthesis.onvoiceschanged = function () { fill(); };
		}
	}

	claim_speaker();

	return {
		set_enabled: set_enabled,
		set_voice: set_voice,
		set_language: set_language,
		get_language: get_language,
		reset: reset,
		is_speaker: function () { return is_speaker; },
		say: say,
		go: go,
		preview: preview,
		lap: lap,
		lead_change: lead_change,
		last_lap: last_lap,
		finish: finish,
		populate_voices: populate_voices,
	};
})();
