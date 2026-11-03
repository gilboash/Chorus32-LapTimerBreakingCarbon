// Keeps the phone screen awake while a race is being managed.
//
// The Screen Wake Lock API needs a secure context, and the timer serves plain
// HTTP from its own access point, so navigator.wakeLock is undefined on the
// device. We still try it first (in case the page is ever served over HTTPS)
// and otherwise fall back to looping a tiny muted video, which is the only
// thing that reliably holds the screen on over plain HTTP.
//
// Either path needs a user gesture to start, so enable() is called from the
// first tap on the page as well as from the keep-awake checkbox.

var NoSleep = (function () {
	// 3s of 64x64 black, h264 baseline. Inlined rather than served as a file so
	// the blanket "Content-Encoding: gzip" the server puts on every SPIFFS file
	// can't confuse the media element.
	var VIDEO_MP4 = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAC7gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlp0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAC7gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAu4AAAAAAABAAAAAAHSbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAwABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABfW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT1zdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAF2dCwB7ZBCbARAAAAwAEAAADAAg8WLkgAQAFaMuDyyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAHEgAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAwAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAwAAAAEAAAAgc3RzegAAAAAAAAAAAAAAAwAAApIAAAAKAAAACwAAABRzdGNvAAAAAAAAAAEAAANfAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMAAAAAhmcmVlAAACr21kYXQAAAJwBgX//2zcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAGmWIhAX///8PRQABV58nJyddddddddddddeAAAAABkGaOAt4RgAAAAdBmlQCvhGA";

	var video = null;
	var wake_lock = null;
	var enabled = false;

	function make_video() {
		var v = document.createElement("video");
		v.setAttribute("muted", "");
		v.setAttribute("loop", "");
		v.setAttribute("playsinline", "");
		v.setAttribute("title", "keep awake");
		v.muted = true;
		v.loop = true;
		// Must stay in the layout to count as playing, so keep it present but
		// out of the way instead of display:none.
		v.style.position = "fixed";
		v.style.right = "0";
		v.style.bottom = "0";
		v.style.width = "1px";
		v.style.height = "1px";
		v.style.opacity = "0.01";
		v.style.pointerEvents = "none";
		v.src = VIDEO_MP4;
		document.body.appendChild(v);
		return v;
	}

	function enable() {
		if (enabled) return;
		enabled = true;

		if (navigator.wakeLock) {
			navigator.wakeLock.request("screen").then(function (lock) {
				wake_lock = lock;
				console.log("Screen wake lock acquired");
			}).catch(function (err) {
				console.log("Wake lock refused, falling back to video: " + err);
				play_video();
			});
		} else {
			play_video();
		}
	}

	function play_video() {
		if (video == null) {
			video = make_video();
		}
		var p = video.play();
		if (p != undefined) {
			p.catch(function (err) {
				// Expected until the user has tapped something.
				console.log("Keep-awake video blocked, will retry on next tap: " + err);
				enabled = false;
			});
		}
	}

	function disable() {
		enabled = false;
		if (wake_lock != null) {
			wake_lock.release();
			wake_lock = null;
		}
		if (video != null) {
			video.pause();
		}
	}

	function is_enabled() {
		return enabled;
	}

	// The browser drops the lock and pauses the video when the page is hidden,
	// so take it again when we come back.
	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState == "visible" && enabled) {
			enabled = false;
			enable();
		}
	});

	return { enable: enable, disable: disable, is_enabled: is_enabled };
})();
