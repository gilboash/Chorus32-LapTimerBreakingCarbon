/* Over-the-air update.
 *
 * The timer decides which partition an upload belongs to the same way this
 * page does: a first byte of 0xE9 is an ESP32 application image, anything else
 * is treated as a filesystem image but only if the filename contains "spiffs".
 * Mirroring that check here means a file the firmware would reject never gets
 * sent at all, instead of being discovered halfway through an upload.
 */

BC.start("update.html");

var file_input = document.getElementById("update_file");
var upload_button = document.getElementById("upload_button");
var kind_label = document.getElementById("file_kind");
var status_label = document.getElementById("upload_status");
var progress_wrap = document.getElementById("progress_wrap");
var progress_bar = document.getElementById("progress_bar");
var progress_text = document.getElementById("progress_text");

var ESP_IMAGE_MAGIC = 0xE9;
var chosen = null; // { file, kind }

document.getElementById("recovery_host").innerText = location.host;

function set_kind(kind, text) {
	kind_label.className = "bc-upload-kind " + kind;
	kind_label.innerText = text;
}

function human_size(bytes) {
	return (bytes / 1024).toFixed(0) + " kB";
}

file_input.addEventListener("change", function () {
	chosen = null;
	upload_button.disabled = true;
	status_label.innerText = "";

	var file = this.files[0];
	if (file == null) { set_kind("", ""); return; }

	// Only the first byte decides, so there's no reason to read more.
	var reader = new FileReader();
	reader.onload = function () {
		var first = new Uint8Array(reader.result)[0];
		var is_firmware = first == ESP_IMAGE_MAGIC;
		var name = file.name.toLowerCase();

		if (is_firmware) {
			chosen = { file: file, kind: "firmware" };
			set_kind("firmware",
				"Firmware image, " + human_size(file.size) +
				". The timer will restart when it finishes.");
			upload_button.disabled = false;
			return;
		}

		if (name.indexOf("spiffs") < 0) {
			// Not a rule we can relax from here: the firmware looks for this
			// exact substring and refuses the upload without it.
			set_kind("unknown",
				"This is not an application image, and the timer only accepts a " +
				"filesystem image whose filename contains \"spiffs\". Rename it to " +
				"spiffs.bin if that is what it is.");
			return;
		}

		chosen = { file: file, kind: "filesystem" };
		set_kind("filesystem",
			"Web interface image, " + human_size(file.size) +
			". These pages are replaced and the timer will restart.");
		upload_button.disabled = false;
	};
	reader.onerror = function () {
		set_kind("unknown", "Could not read that file.");
	};
	reader.readAsArrayBuffer(file.slice(0, 1));
});

upload_button.addEventListener("click", function () {
	if (chosen == null) return;

	upload_button.disabled = true;
	file_input.disabled = true;
	progress_wrap.style.display = "";
	status_label.style.color = "";
	status_label.innerText = "Uploading. Do not power off the timer.";

	var form = new FormData();
	form.append("update", chosen.file, chosen.file.name);

	var request = new XMLHttpRequest();

	request.upload.addEventListener("progress", function (event) {
		if (!event.lengthComputable) return;
		var percent = Math.round((event.loaded / event.total) * 100);
		progress_bar.style.width = percent + "%";
		progress_text.innerText = percent + "%";
	});

	request.addEventListener("load", function () {
		// The timer answers "OK, module rebooting" and restarts immediately, so
		// a clean response here only means it accepted the image.
		if (request.status == 200) {
			progress_bar.style.width = "100%";
			progress_text.innerText = "100%";
			status_label.innerText = "Upload accepted. The timer is restarting…";
			wait_for_reboot();
		} else {
			fail("The timer rejected the image (" + request.status + "). " +
				"It is still running the previous version.");
		}
	});

	request.addEventListener("error", function () {
		fail("The connection dropped during the upload.");
	});

	request.addEventListener("abort", function () {
		fail("Upload cancelled.");
	});

	request.open("POST", "/update");
	request.send(form);
});

function fail(message) {
	status_label.style.color = "var(--err)";
	status_label.innerText = message;
	upload_button.disabled = false;
	file_input.disabled = false;
}

// Poll until the timer answers again, so the page reports the result rather
// than leaving the user staring at a finished progress bar.
function wait_for_reboot() {
	var attempts = 0;

	function poll() {
		if (++attempts > 40) {
			status_label.style.color = "var(--warn)";
			status_label.innerText =
				"The timer has not come back yet. Reconnect to its WiFi and reload " +
				"this page. If the web interface is gone, open " + location.host +
				" for the built-in recovery form.";
			upload_button.disabled = false;
			file_input.disabled = false;
			return;
		}

		BC.fetch_version(function (version) {
			if (version == null) { setTimeout(poll, 1000); return; }
			show_version(version);
			status_label.style.color = "var(--ok)";
			status_label.innerText = version.match
				? "Done. Firmware and web interface are both " + version.firmware +
				  " (" + version.git + ")."
				: "Done, but the two halves are from different builds: firmware " +
				  version.git + ", web interface " +
				  (version.filesystem_git || "unknown") +
				  ". Upload the other file from the same release.";
			upload_button.disabled = false;
			file_input.disabled = false;
			file_input.value = "";
			chosen = null;
			set_kind("", "");
		});
	}

	setTimeout(poll, 3000);
}

function show_version(version) {
	document.getElementById("ver_firmware").innerText = version.firmware;
	document.getElementById("ver_filesystem").innerText = version.filesystem;
	document.getElementById("foot_version").innerText = "v" + version.firmware;
	document.getElementById("ver_build").innerText =
		version.git + " · built " + version.built;

	var warning = document.getElementById("ver_warning");
	if (version.match) {
		warning.style.display = "none";
	} else {
		warning.style.display = "";
		// Name the build hashes, not the version numbers: those are bumped by
		// hand and are usually identical across the two halves, so quoting
		// them would describe a mismatch as "3.0.0 versus 3.0.0".
		warning.innerText =
			"Firmware and web interface are from different builds (firmware " +
			version.git + ", web interface " + (version.filesystem_git || "unknown") +
			"). Upload the other file from the same release.";
	}
}

BC.fetch_version(function (version) {
	if (version != null) show_version(version);
});
