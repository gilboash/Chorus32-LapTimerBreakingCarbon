var current_race = 0;
var ws = null;
var num_pilots = 8;
var count_first = 0;
var max_laps = 4;

var pilot_active = [];

const cells_before_lap = 2;
function speak_lap(pilot, lap_number, time) {
	var su = new SpeechSynthesisUtterance();
	const voiceSelect = document.getElementById('voices');
	su.lang = "en";
	su.text = `${pilot} lap ${lap_number} is ${time} seconds`;
	console.log(su.voice);
	su.voice = speechSynthesis.getVoices().filter(function (voice) {
					return voice.name === voiceSelect.value;
				})[0];
	speechSynthesis.speak(su);
}


function startWebsocket(websocketServerLocation){
    ws = new WebSocket(websocketServerLocation);
    ws.onmessage = on_websocket_event;
    ws.onclose = function(){
        // Try to reconnect in 5 seconds
        setTimeout(function(){startWebsocket(websocketServerLocation)}, 1000);
    };
	ws.oncerror = ws.onclose;
	ws.onopen = function() {
		ws.send("ER*R\n"); // get current race number
		ws.send("R*a\n"); // just get all settings to get all laps
	};
}

// TODO: add support for hiding or disabling pilots. Not sure what of those to do
function build_table(race_num, num_laps) {
	console.log("Building table with race_num " + race_num);
	// build the table template with the given parameters from the node
	var table = document.getElementById("lap_table_" + race_num);
	// If the round is new create a new tab
	if(table == null) {
		// TODO: completely create table in js
		var table = document.getElementById("lap_table_default").cloneNode(true);
		table.id = "lap_table_" + race_num;
		var i;
		for(i = num_laps; i != 0 ; i--) {
			var cell = table.rows[0].insertCell(cells_before_lap);
			cell.outerHTML = "<th align=\"center\">Lap " + i + "</th>";
		}
		for (i = 0; i < num_pilots; i++) {
			var row = table.insertRow(-1);
			// Active button
			var cell = row.insertCell(-1);
			cell.innerHTML = "<input id=\"pilot_active_box_" + i + "\" value=" + i + " type=\"checkbox\"></input>";
			cell.firstChild.onclick = function () {
				ws.send(`R${this.value}A${this.checked ? 1 : 0}\n`);
			};
			cell.firstChild.checked = pilot_active[i];
			// pilot name
			cell = row.insertCell(-1);
			var pilot_name = localStorage.getItem("pilot_name_" + i);
			if(pilot_name == null) {
				pilot_name = "Pilot " + (i + 1);
			}
			cell.innerHTML = "<input id=\"pilot_name_" + i + "\" type=\"text\" name=\"pilot\" value=\"" + pilot_name + "\" oninput=update_default_pilot_name(" + i + ")>";
			// add remaining cells
			for(var j = 0; j < num_laps ; ++j) {
				row.insertCell(-1);
			}
			row.insertCell(-1); // Total
			row.insertCell(-1); // Position
			row.insertCell(-1); // avg
			var best = row.insertCell(-1); // best
			best.innerText = "99999";
		}


		var table_div = document.getElementById("table_container");
		var content_div = document.createElement("div");
		content_div.setAttribute('class', 'tabcontent');
		content_div.id = "round_tab_content_" + race_num;
		table_div.appendChild(content_div);
		content_div.appendChild(table);

		// create button
		var button_div = document.getElementById("round_buttons");
		console.log(button_div);
		button_div.innerHTML += "<button class='tablinks' onclick='openRound(event," + race_num + ")'>Round " + race_num + "</button>\n"
		button_div.children[button_div.childElementCount - 1].click();
		window.scrollTo(0, document.body.scrollHeight);
	}
}

function get_lap(race_num, pilot_num, lap_num) {
	var table = document.getElementById("lap_table_" + race_num);
	var row = table.rows[pilot_num+1];
	return parseFloat(row.cells[lap_num+cells_before_lap].innerText);
}

function transpose(matrix) {
  return matrix[0].map((col, i) => matrix.map(row => row[i]));
}

function update_pilots_positions(race_num) {
	var table = document.getElementById("lap_table_" + race_num);
	var times = [];
	for(var i = 0; i < num_pilots; ++i) {
		var row = table.rows[i+1];
		var total_time = parseFloat(row.cells[row.cells.length - 4].innerText);
		if(total_time > 0) {
			times[times.length] = { num: i, time: total_time};
		}
	}
	times.sort(function (a,b) {
		return a.time - b.time;
	});
	for(var i = 0; i < times.length; ++i) {
		var pilot_num = times[i].num
		var row = table.rows[pilot_num + 1];
		row.cells[row.cells.length - 3].innerText = i;
	}

}

function add_lap(race_num, pilot_num, lap_num, lap_time) {
	if(lap_num >= max_laps) return;
	var table = document.getElementById("lap_table_" + race_num);
	var row = table.rows[pilot_num + 1];
	// actually get val from table
	var best_lap = parseFloat(row.cells[row.childElementCount - 1].innerText * 1000.0);
	var avg_lap = 0;
	if(!(count_first == 0 && lap_num == 0)) { // skip lap 0 for avg and best if we don't count it
		best_lap = Math.min(best_lap, lap_time);
		if(row.cells[lap_num+cells_before_lap].innerText == "") {
			var pilot_name = row.cells[1].children[0].value;
			speak_lap(pilot_name, lap_num, (lap_time/1000.0).toFixed(2));
			row.cells[row.cells.length - 4].innerText = parseFloat(row.cells[row.cells.length - 4].innerText*1) + parseFloat(lap_time/1000.0);
			update_pilots_positions(race_num);
		}
	}
	row.cells[lap_num+cells_before_lap].innerText = lap_time/1000.0;
	// + 1 to skip the pilot field. - 2 because of best/avg lap
	var avg_lap = 0;
	var i;
	for(i = (count_first == 0) + cells_before_lap; i < row.cells.length - 2; ++i) {
		var lap = parseFloat(row.cells[i].innerText);
		if(lap == 0 || isNaN(lap)) break;
		avg_lap += lap;
	}
	avg_lap /= i - (count_first == 0) - cells_before_lap;
	row.cells[row.cells.length - 2].innerText = avg_lap.toFixed(2);
	row.cells[row.cells.length - 1].innerText = (best_lap/1000.0).toFixed(2);
}

function handle_message(message) {
	var extended = message[0] == 'E';
	if(extended) {
		message = message.substr(1);
	}
	var pilot_num = parseInt(message[1]);
	var cmd = message[2];

	// Extended commands
	if(extended) {
		switch(cmd) {
			case 'R':
				current_race = parseInt(message.substr(3), 16);
				break;
		}
	} else {
		switch(cmd) {
			case 'L':
				var lap_num = parseInt(message.substr(3,2), 16);
				var lap_time = parseInt(message.substr(5), 16);
				add_lap(current_race, pilot_num, lap_num, lap_time);
				break;
			case 'A':
				pilot_active[pilot_num] = message[3] == '1';
				break;
			case 'R':
				document.getElementById('race_mode').innerHTML = parseInt(message[3]) ? "Racing" : "Finished";
				break;
		}
	}
}

function on_websocket_event(event) {
	console.log(event.data);
	var messages = event.data.split('\n');
	for(var i = 0; i < messages.length; ++i) {
		handle_message(messages[i]);
	}
}

startWebsocket("ws://192.168.4.1/ws");
document.getElementById("start_race_button").onclick = function () {
	current_race += 1;
	max_laps = parseInt(document.getElementById("max_laps").value);
	build_table(current_race, max_laps);
	ws.send("R*R1\n");
}
document.getElementById("stop_race_button").onclick = function () {
	ws.send("R*R0\n");
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

document.getElementById("max_laps").value = max_laps;
