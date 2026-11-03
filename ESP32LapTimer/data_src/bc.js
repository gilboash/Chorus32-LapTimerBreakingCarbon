/* Shared plumbing for the Breaking Carbon web UI: theme, websocket, version.
 *
 * Deliberately a plain script with one global rather than ES modules, so every
 * page can include it without the module/worker fetch dance on a device that
 * serves everything gzipped from SPIFFS.
 */

var BC = (function () {

	/* ---------------- theme ---------------- */

	// Dark matches the logo; daylight exists because a black UI is unreadable
	// in direct sun at a track. Remembered per device.
	function apply_theme(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		try { localStorage.setItem("bc_theme", theme); } catch (e) { /* private mode */ }
	}

	function current_theme() {
		try {
			return localStorage.getItem("bc_theme") || "dark";
		} catch (e) {
			return "dark";
		}
	}

	function toggle_theme() {
		apply_theme(current_theme() == "dark" ? "light" : "dark");
	}

	/* ---------------- protocol ---------------- */

	// Messages look like S<node><cmd><payload> or ES<node><cmd><payload>.
	// Returns null for anything we can't make sense of, including the empty
	// strings that fall out of splitting on the trailing newline.
	function parse_message(message) {
		if (!message || message.length < 3) return null;
		var extended = message[0] == "E";
		if (extended) message = message.substr(1);
		if (message.length < 3) return null;
		return {
			extended: extended,
			node: parseInt(message[1], 16),
			cmd: message[2],
			payload: message.substr(3),
		};
	}

	function hex(value, digits) {
		return (value >>> 0).toString(16).toUpperCase().padStart(digits, "0");
	}

	/* ---------------- websocket ---------------- */

	var socket = null;
	var handlers = [];
	var open_handlers = [];
	var status_handlers = [];
	var connected = false;

	function set_status(state) {
		if (connected == (state == "open")) return;
		connected = (state == "open");
		status_handlers.forEach(function (fn) { fn(connected); });
	}

	function connect() {
		// location.host, never a hardcoded 192.168.4.1: the timer can run in
		// client mode on someone else's network.
		socket = new WebSocket("ws://" + location.host + "/ws");

		socket.onopen = function () {
			set_status("open");
			open_handlers.forEach(function (fn) { fn(); });
		};

		socket.onclose = function () {
			set_status("closed");
			setTimeout(connect, 1000);
		};

		socket.onerror = function () {
			// onclose always follows, so let that one do the reconnecting.
			set_status("closed");
		};

		socket.onmessage = function (event) {
			var messages = event.data.split("\n");
			for (var i = 0; i < messages.length; ++i) {
				var parsed = parse_message(messages[i]);
				if (parsed == null) continue;
				for (var h = 0; h < handlers.length; ++h) {
					handlers[h](parsed);
				}
			}
		};
	}

	function send(text) {
		if (socket != null && socket.readyState == WebSocket.OPEN) {
			socket.send(text);
			return true;
		}
		return false;
	}

	/* ---------------- settings pushes ---------------- */

	function send_to(prefix, node, cmd, value, bits) {
		return send(prefix + "R" + node + cmd + hex(value, bits / 4) + "\n");
	}

	function set_value(node, cmd, value, bits) {
		return send_to("", node, cmd, value, bits);
	}

	function set_extended(node, cmd, value, bits) {
		return send_to("E", node, cmd, value, bits);
	}

	function request_all() {
		send("ER*a\n"); // every extended setting
		send("R*a\n");  // every standard setting, which also replays the laps
	}

	// Interval is parsed as hex by the firmware, so it has to be sent as hex.
	// The old page sent the decimal digits padded to 4, which meant asking for
	// 50 actually set 0x50 = 80ms.
	function set_rssi_interval(ms) {
		return send("ES*y" + hex(ms, 4) + "\n");
	}

	/* ---------------- version ---------------- */

	// Firmware and filesystem are two separate OTA uploads, so they can drift.
	// /version reports both and whether they agree.
	function fetch_version(callback) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", "/version");
		xhr.onload = function () {
			if (xhr.status != 200) { callback(null); return; }
			try {
				callback(JSON.parse(xhr.responseText));
			} catch (e) {
				callback(null);
			}
		};
		xhr.onerror = function () { callback(null); };
		xhr.send();
	}

	/* ---------------- chrome ---------------- */

	// Renders the shared header and nav so the pages don't each repeat it.
	function build_chrome(active) {
		var header = document.querySelector(".bc-header");
		if (header != null) {
			header.innerHTML =
				'<img src="logo.jpg" alt="Breaking Carbon">' +
				'<span class="bc-title">Chorus32' +
				'<span class="bc-sub" id="bc_subtitle">Breaking Carbon</span></span>' +
				'<span class="bc-pill" id="bc_link"><span class="bc-dot"></span>' +
				'<span id="bc_link_text">connecting</span></span>' +
				'<button class="bc-shrink" id="bc_theme" title="Toggle daylight mode" ' +
				'style="min-width:44px;padding:0 12px">&#9728;</button>';
			document.getElementById("bc_theme").onclick = toggle_theme;
		}

		var nav = document.querySelector(".bc-nav");
		if (nav != null) {
			var pages = [
				{ href: "index.html", label: "Live" },
				{ href: "race.html", label: "Race" },
				{ href: "settings.html", label: "Settings" },
				{ href: "update.html", label: "Update" },
			];
			nav.innerHTML = pages.map(function (p) {
				return '<a href="' + p.href + '"' +
					(p.href == active ? ' class="active"' : "") + ">" + p.label + "</a>";
			}).join("");
		}

		on_status(function (is_connected) {
			var pill = document.getElementById("bc_link");
			var text = document.getElementById("bc_link_text");
			if (pill == null || text == null) return;
			pill.className = "bc-pill " + (is_connected ? "ok" : "err");
			text.innerText = is_connected ? "live" : "offline";
		});
	}

	function on_message(fn) { handlers.push(fn); }
	function on_open(fn) { open_handlers.push(fn); }
	function on_status(fn) { status_handlers.push(fn); }

	function start(active_page) {
		apply_theme(current_theme());
		build_chrome(active_page);
		connect();
	}

	return {
		start: start,
		send: send,
		set_value: set_value,
		set_extended: set_extended,
		set_rssi_interval: set_rssi_interval,
		request_all: request_all,
		on_message: on_message,
		on_open: on_open,
		on_status: on_status,
		fetch_version: fetch_version,
		toggle_theme: toggle_theme,
		hex: hex,
		is_connected: function () { return connected; },
	};
})();

// Apply the stored theme before first paint so the page doesn't flash dark.
(function () {
	try {
		document.documentElement.setAttribute(
			"data-theme", localStorage.getItem("bc_theme") || "dark");
	} catch (e) {
		document.documentElement.setAttribute("data-theme", "dark");
	}
})();
