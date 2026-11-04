// Keeps the phone screen awake while a race is being managed.
//
// The Screen Wake Lock API needs a secure context and the timer serves plain
// HTTP from its own access point, so navigator.wakeLock is undefined on the
// device. We try it anyway in case the page is ever served over HTTPS, and
// otherwise loop a tiny muted video, which is the only thing that holds the
// screen on over plain HTTP.
//
// The video path is fussier than it looks, and every detail below is there
// because of a way it fails:
//
//  - It must look like real, visible playback. A 1x1 element at opacity 0.01
//    can be treated as hidden, and a hidden video does not hold the screen on.
//  - Older Android builds are unreliable with a data: URI as a video source,
//    so the file is tried first and the inline copy is only a fallback.
//  - play() returns a promise that rejects without a user gesture. State has
//    to follow that promise, not the attempt, or the UI claims the screen is
//    locked when nothing is playing.
//  - Playback can be stopped by the system later, so it is re-checked.

var NoSleep = (function () {

	// 3s of 64x64 black, h264 baseline.
	var VIDEO_DATA_URI = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAC7gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlp0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAC7gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAu4AAAAAAABAAAAAAHSbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAwABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT1zdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAF2dCwB7ZBCbARAAAAwAEAAADAAg8WLkgAQAFaMuDyyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAHEgAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAwAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAwAAAAEAAAAgc3RzegAAAAAAAAAAAAAAAwAAApIAAAAKAAAACwAAABRzdGNvAAAAAAAAAAEAAANfAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMAAAAAhmcmVlAAACr21kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAGmWIhAX///8PRQABV58nJyddddddddddddeAAAAABkGaOAt4RgAAAAdBmlQCvhGA";
	var VIDEO_FILE = "nosleep.mp4";

	var video = null;
	var wake_lock = null;
	var wanted = false;      // the user asked for the screen to stay on
	var method = "none";     // "wakelock" | "video" | "none"
	var last_error = "";
	var watchdog = null;

	function make_video() {
		var v = document.createElement("video");
		v.setAttribute("playsinline", "");
		v.setAttribute("webkit-playsinline", "");
		v.setAttribute("muted", "");
		v.setAttribute("loop", "");
		v.setAttribute("title", "keep awake");
		// Set as properties too: the attributes alone are not enough on some
		// builds, and muted has to be true before play() to autoplay at all.
		v.muted = true;
		v.loop = true;
		v.playsInline = true;

		// Small and tucked into a corner, but genuinely rendered: fully opaque
		// and a few pixels across, because near-zero opacity or a single pixel
		// can count as hidden and then the screen sleeps anyway.
		v.style.position = "fixed";
		v.style.right = "0";
		v.style.bottom = "0";
		v.style.width = "4px";
		v.style.height = "4px";
		v.style.zIndex = "0";
		v.style.pointerEvents = "none";

		// File first, inline copy as the fallback.
		var file_source = document.createElement("source");
		file_source.src = VIDEO_FILE;
		file_source.type = "video/mp4";
		var inline_source = document.createElement("source");
		inline_source.src = VIDEO_DATA_URI;
		inline_source.type = "video/mp4";
		v.appendChild(file_source);
		v.appendChild(inline_source);

		v.addEventListener("error", function () {
			last_error = "video source failed to load";
		});

		document.body.appendChild(v);
		return v;
	}

	function play_video() {
		if (video == null) video = make_video();

		var promise;
		try {
			promise = video.play();
		} catch (e) {
			method = "none";
			last_error = String(e);
			return;
		}

		// Older browsers return nothing from play(); assume it started and let
		// the watchdog correct us if it did not.
		if (promise == undefined) {
			method = "video";
			return;
		}

		promise.then(function () {
			method = "video";
			last_error = "";
		}).catch(function (err) {
			// Expected until the page has been tapped.
			method = "none";
			last_error = String(err && err.name ? err.name : err);
		});
	}

	function enable() {
		wanted = true;

		if (navigator.wakeLock && wake_lock == null) {
			navigator.wakeLock.request("screen").then(function (lock) {
				wake_lock = lock;
				method = "wakelock";
				last_error = "";
				// Released automatically when the page is hidden.
				lock.addEventListener("release", function () {
					wake_lock = null;
					if (wanted) method = "none";
				});
			}).catch(function (err) {
				last_error = String(err && err.name ? err.name : err);
				play_video();
			});
		} else if (wake_lock == null) {
			play_video();
		}

		start_watchdog();
	}

	function disable() {
		wanted = false;
		method = "none";
		stop_watchdog();
		if (wake_lock != null) {
			try { wake_lock.release(); } catch (e) { /* already gone */ }
			wake_lock = null;
		}
		if (video != null) video.pause();
	}

	// The system can stop playback, and a wake lock is dropped whenever the
	// page is hidden, so keep checking rather than assuming it held.
	function start_watchdog() {
		if (watchdog != null) return;
		watchdog = setInterval(function () {
			if (!wanted) return;
			if (wake_lock != null) return;
			if (video != null && !video.paused) { method = "video"; return; }
			if (method == "video") method = "none";
			// Retry quietly; it will succeed once the page has a gesture.
			enable();
		}, 5000);
	}

	function stop_watchdog() {
		if (watchdog == null) return;
		clearInterval(watchdog);
		watchdog = null;
	}

	function is_enabled() {
		if (!wanted) return false;
		if (wake_lock != null) return true;
		return video != null && !video.paused;
	}

	// What is actually holding the screen on, for the UI to report honestly.
	function status() {
		if (!wanted) return { ok: false, method: "off", detail: "" };
		if (wake_lock != null) return { ok: true, method: "wakelock", detail: "" };
		if (video != null && !video.paused) {
			return { ok: true, method: "video", detail: "" };
		}
		return { ok: false, method: "none", detail: last_error };
	}

	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState == "visible" && wanted) enable();
	});

	return {
		enable: enable,
		disable: disable,
		is_enabled: is_enabled,
		status: status,
	};
})();
