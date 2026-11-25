/* Site chrome. Two jobs: remember the theme, and keep YouTube out of the
 * page until someone asks for it.
 *
 * The theme key is deliberately NOT the timer's "bc_theme" -- the site is a
 * different origin from the device, so sharing the name would buy nothing and
 * only confuse anyone reading localStorage on either side.
 */
(function () {
	"use strict";

	/* ---------------- theme ---------------- */

	function stored() {
		try { return localStorage.getItem("bc_site_theme"); } catch (e) { return null; }
	}

	function apply(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		var meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute("content", theme == "light" ? "#ffffff" : "#0b0b0c");
		var btn = document.getElementById("theme_toggle");
		if (btn) {
			btn.textContent = theme == "light" ? "☾" : "☀";
			btn.setAttribute("aria-label",
				theme == "light" ? "Switch to dark mode" : "Switch to daylight mode");
		}
	}

	function current() {
		var saved = stored();
		if (saved) return saved;
		// Nothing stored: follow the OS, but default to dark, which is what
		// the timer's own UI does and what the logo was drawn for.
		try {
			if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
		} catch (e) { /* older browser */ }
		return "dark";
	}

	apply(current());

	document.addEventListener("DOMContentLoaded", function () {
		apply(current()); // the button only exists now

		var btn = document.getElementById("theme_toggle");
		if (btn) {
			btn.addEventListener("click", function () {
				var next = document.documentElement.getAttribute("data-theme") == "light"
					? "dark" : "light";
				try { localStorage.setItem("bc_site_theme", next); } catch (e) { /* private mode */ }
				apply(next);
			});
		}

		/* ---------------- deferred youtube ---------------- */

		// Embedding the player on load pulls in ~1MB and sets cookies for
		// every visitor who never watches. The poster is a plain button that
		// swaps itself for the iframe on the first click.
		var posters = document.querySelectorAll(".video-poster[data-video]");
		Array.prototype.forEach.call(posters, function (poster) {
			poster.addEventListener("click", function () {
				var frame = document.createElement("iframe");
				frame.src = "https://www.youtube-nocookie.com/embed/" +
					poster.getAttribute("data-video") + "?autoplay=1&rel=0";
				frame.title = poster.getAttribute("data-title") || "Video";
				frame.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
				frame.allowFullscreen = true;
				poster.parentNode.replaceChild(frame, poster);
			});
		});

		/* ---------------- current page in the nav ---------------- */

		// Saves every page from hand-marking its own link, and keeps working
		// whether the site is served from a domain root or a subfolder.
		var here = location.pathname.replace(/\/$/, "/index.html").split("/").pop();
		if (here === "") here = "index.html";
		Array.prototype.forEach.call(document.querySelectorAll(".site-nav a"), function (a) {
			var target = a.getAttribute("href").split("#")[0].split("/").pop();
			if (target === here) a.classList.add("active");
		});
	});
})();
