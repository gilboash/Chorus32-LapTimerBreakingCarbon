requestData(); // get intial data straight away
var StatusData;
function requestData() {

	var xhr = new XMLHttpRequest();
	xhr.open('GET', 'StaticVars');

	xhr.onload = function() {
	if (xhr.status === 200) {
	  if (xhr.responseText) { // if the returned data is not null, update the values
		console.log(xhr.responseText);
		StatusData = JSON.parse(JSON.stringify(xhr.responseText));
		console.log(StatusData);
		var data = JSON.parse(StatusData); //yeah not sure why I need to do this twice, but otherwise it doesn't work....
		console.log(data);
		var num_pilots = parseInt(data.num_pilots);
		var num_laps = parseInt(data.num_laps);
		
		// build the table template with the given parameters from the node
		var table = document.getElementById("lap_table_default");
		var i;
		for(i = num_laps; i != 0 ; i--) {
			var cell = table.rows[0].insertCell(1);
			cell.outerHTML = "<th align=\"center\">Lap " + i + "</th>";
		}
		for (i = 0; i < num_pilots; i++) { 
			var row = table.insertRow(-1);
			var cell = row.insertCell(-1);
			var pilot_name = localStorage.getItem("pilot_name_" + i);
			if(pilot_name == null) {
				pilot_name = "Pilot " + i + 1;
			}
			cell.innerHTML = "<input id=\"pilot_name_" + i + "\" type=\"text\" name=\"pilot\" value=\"" + pilot_name + "\" oninput=update_default_pilot_name(" + i + ")>";
			// add remaining cells
			for(var j = 0; j < num_laps ; ++j) {
				row.insertCell(-1);
			}
			row.insertCell(-1); // avg
			row.insertCell(-1); // best
		}
	  }
	}else{requestData() }
  };

  xhr.send();
}

const voiceSelect = document.getElementById('voices');
var voices = speechSynthesis.getVoices();
// XXX: sometimes the first call returns null :/
voices = speechSynthesis.getVoices();
voices = speechSynthesis.getVoices();

voices.forEach((voice) => {
	const option = document.createElement('option');
	option.value = voice.name;
	option.innerHTML = voice.name;
	option.id = voice.name;
	voiceSelect.appendChild(option);
	// just hope we get an english voice with this
	if(voice.name.includes("english")) {
		voiceSelect.value = voice.name;
	}
});

var selected_voice = localStorage.getItem("voice");
if(selected_voice != null) {
	voiceSelect.value = selected_voice;
} 

voiceSelect.addEventListener('change', (e) => {
  localStorage.setItem("voice", voiceSelect.value);
});
