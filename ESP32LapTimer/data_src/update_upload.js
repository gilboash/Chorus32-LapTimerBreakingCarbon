var button = document.getElementById("update_button");
var upload_select = document.getElementById("update_file");
button.addEventListener("click", upload_firmware);
button.disabled = true;
upload_select.addEventListener("input", function() {
	button.disabled = false;
});


function upload_progress(e) {
	var progress = (e.loaded/ e.total);
	var elem = document.getElementById("update_bar");
	var percent = parseInt(progress*100);
	elem.style.width = percent + "%";
	elem.innerHTML = percent + "%";
}

function upload_complete(e) {
	console.log("Upload complete!");
}

function upload_failed(e) {
	console.log("Upload failed!");
}

function upload_firmware() {
	var file = document.getElementById("update_file").files[0];

	var formData = new FormData();
	formData.append("update", file);

	var xhr = new XMLHttpRequest();
	xhr.upload.addEventListener("progress", upload_progress, false);
	xhr.addEventListener("load", upload_complete, false);
	xhr.addEventListener("error", upload_failed, false);
	xhr.addEventListener("abort", upload_failed, false);

	xhr.onreadystatechange = function () {
		if(xhr.readyState === 4) {
			document.write(xhr.responseText);
		}
	};

	xhr.open('POST', '/update', true);
	xhr.send(formData);
}
