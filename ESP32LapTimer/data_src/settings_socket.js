import * as constants from './constants.js';

var ws = null;

function send_data_to_prefix(prefix, to, type, data, bits) {
	ws.send(`${prefix}R${to}${type}${(data).toString(16).padStart(bits/4, '0').toUpperCase()}\n`);
}

function send_extended_data_to(to, type, data, bits) {
	send_data_to_prefix(constants.EXTENDED_PREFIX, to, type, data, bits);
}

function send_extended_data(type, data, bits) {
	send_extended_data_to("*", type, data, bits);
}

function send_data_to(to, type, data, bits) {
	send_data_to_prefix("", to, type, data, bits);
}

function update_all_values() {
	ws.send("ER*a\n"); // get all extended settings
	ws.send("R*a\n"); // get all normal settings
}

function startWebsocket(websocketServerLocation){
    ws = new WebSocket(websocketServerLocation);
    ws.onmessage = on_websocket_event;
    ws.onclose = function(){
        // Try to reconnect in 5 seconds
        setTimeout(function(){startWebsocket(websocketServerLocation)}, 5000);
    };
	ws.onopen = function() {
		update_all_values();
	};
}


function set_value_pending(object) {
	object.setAttribute("val_state","pending");
}

function set_value_received(object) {
	object.setAttribute("val_state","received");
}

function set_value_error(object) {
	object.setAttribute("val_state","error");
}

function handle_message(message) {
	var binary = message[0] == 'B';

	if(binary) {
		var cmd = message[1];
		switch(cmd) {
			case constants.BINARY_RSSI:
				var time = ((message[2] << 24) & 0xffff) | ((message[3] << 16) & 0xffff) | ((message[4] << 8) & 0xffff) | (message[5] & 0xffff);
				var rssi =(((message[6] & 0xff) << 8) | (message[7] & 0xff));
				console.log("Got binary! with time " + time + " and rssi " + rssi + " message: " + message);

				break;
		}
	} else {
		var extended = message[0] == 'E';
		if(extended) {
			message = message.substr(1);
		}
		var pilot_num = parseInt(message[1]);
		var cmd = message[2];

		// Extended commands
		if(extended) {
			switch(cmd) {
				case constants.EXTENDED_VOLTAGE_TYPE:
					var field = document.getElementById("ADCVBATmode");
					field.value = parseInt(message[3], 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_VOLTAGE_CALIB:
					var field = document.getElementById("ADCcalibValue");
					field.value = parseInt(message.substr(3), 16) / 1000.0;
					set_value_received(field);
					break;
				case constants.EXTENDED_EEPROM_RESET:
					var field = document.getElementById("eepromReset");
					set_value_received(field);
					update_all_values();
					break;
				case constants.EXTENDED_DISPLAY_TIMEOUT:
					var field = document.getElementById("displayTimeout");
					field.value = parseInt(message.substr(3), 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_WIFI_CHANNEL:
					var field = document.getElementById("WiFiChannel");
					field.value = parseInt(message[3], 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_WIFI_PROTOCOL:
					var field = document.getElementById("WiFiProtocol");
					field.value = parseInt(message[3], 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_FILTER_CUTOFF:
					var field = document.getElementById("RXFilterCutoff");
					field.value = parseInt(message.substr(3), 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_NUM_MODULES:
					var field = document.getElementById("NumRXs");
					field.value = parseInt(message[3], 16);
					set_value_received(field);
					break;
				case constants.EXTENDED_MULTIPLEX_OFF:
					var field = document.getElementById("pilot_multuplex_off_" + pilot_num);
					field.checked = parseInt(message[3]) == 1;
					set_value_received(field);
					break;
				case constants.EXTENDED_CALIB_MIN:
					var field = document.getElementById("calib_table");
					var row = field.rows[pilot_num + 1];
					row.cells[1].innerText = parseInt(message.substr(3), 16);
					break;
				case constants.EXTENDED_CALIB_MAX:
					var field = document.getElementById("calib_table");
					var row = field.rows[pilot_num + 1];
					row.cells[2].innerText = parseInt(message.substr(3), 16);
					break;
				case constants.EXTENDED_CALIB_STATUS:
					var field = document.getElementById("calibrate_button");
					set_value_received(field);
					for(var i = 0; i < 6; ++i){
						ws.send(`ER${i}${constants.EXTENDED_CALIB_MIN}\n`);
						ws.send(`ER${i}${constants.EXTENDED_CALIB_MAX}\n`);
					}
					break;
				case constants.EXTENDED_DEBUG_FREE_HEAP:
					document.getElementById("heap_free").innerText = (parseInt(message.substr(3), 16)/1024.0).toFixed(2);
					break;
				case constants.EXTENDED_DEBUG_MIN_FREE_HEAP:
					document.getElementById("heap_low").innerText = (parseInt(message.substr(3), 16)/1024.0).toFixed(2);
					break;
				case constants.EXTENDED_DEBUG_MAX_BLOCK_HEAP:
					document.getElementById("heap_max_block").innerText = (parseInt(message.substr(3), 16)/1024.0).toFixed(2);
					break;
			}
		} else {
			switch(cmd) {
				case constants.RESPONSE_VOLTAGE:
					var field = document.getElementById("Var_VBAT");
					field.innerText = (parseInt(message.substr(3), 16) * (5/1024.0) * 11).toFixed(2);
					break;				
				case constants.RESPONSE_THRESHOLD:
					var field = document.getElementById("RSSIthreshold" + pilot_num);
					field.value = parseInt(message.substr(3), 16);
					set_value_received(field);
					break;
				case constants.RESPONSE_PILOT_ACTIVE:
					var field = document.getElementById("pilot_enabled_" + pilot_num);
					field.checked = parseInt(message[3]) == 1;
					set_value_received(field);
					break;
				case constants.RESPONSE_BAND:
					var field = document.getElementById("band" + pilot_num);
					field.value = message[3];
					set_value_received(field);
					break;
				case constants.RESPONSE_CHANNEL:
					var field = document.getElementById("channel" + pilot_num);
					field.value = message[3];
					set_value_received(field);
					break;
				case constants.RESPONSE_MINRSSIVAL:
					var field = document.getElementById("pilot_rssi_min_val_" + pilot_num);
					field.value = parseInt(message.substr(3), 16);
					set_value_received(field);
					break;
				case constants.RESPONSE_MAXRSSIVAL:
					var field = document.getElementById("pilot_rssi_max_val_" + pilot_num);
					field.value = parseInt(message.substr(3), 16);
					set_value_received(field);
					break;
					
			}
		}
	}
}

function create_pilots() {
	for(var i = 0; i < 8; ++i) {
		var table = document.getElementById('pilot_table');
		var row = table.insertRow(-1);
		row.insertCell(-1).innerText = (i+1);
		var cell;
		var input_html = "";
		// band selection
		cell = row.insertCell(-1);
		input_html = `<select class="band_select" name="band${i}" id="band${i}">`;
		input_html += "<option selected=\"\" value=\"0\">R</option><option value=\"1\">A</option><option value=\"2\">B</option><option value=\"3\">E</option><option value=\"4\">F</option><option value=\"5\">D</option><option value=\"6\">Connex</option><option value=\"7\">Connex2</option></select>";
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)), constants.CONTROL_BAND, parseInt(this.value*1), 4);
		}
		// channel selection
		cell = row.insertCell(-1);
		input_html = `<select name="channel${i}" id="channel${i}" `;
		input_html += "class=\"channel_select\"><option value=\"0\">1</option><option value=\"1\">2</option><option value=\"2\">3</option><option value=\"3\">4</option><option value=\"4\">5</option><option value=\"5\">6</option><option value=\"6\">7</option><option value=\"7\">8</option></select>";
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)), constants.CONTROL_CHANNEL, parseInt(this.value*1), 4);
		}

		// RSSI threshold
		cell = row.insertCell(-1);
		input_html = `<input type="number" id="RSSIthreshold${i}" min="0" max="342" step="1" class="rssi_select">`;
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)), constants.CONTROL_THRESHOLD, parseInt(this.value*1), 16);
		}
		// Enabled checkbox
		cell = row.insertCell(-1);
		input_html= `<input type="checkbox" id="pilot_enabled_${i}">`;
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)), constants.CONTROL_PILOT_ACTIVE, this.checked ? 1 : 0, 4);
		}

		// multiplex checkbox
		cell = row.insertCell(-1);
		input_html = `<input type="checkbox" id="pilot_multuplex_off_${i}">`;
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_extended_data_to(parseInt(this.id.slice(-1)), constants.EXTENDED_MULTIPLEX_OFF, this.checked ? 1 : 0, 4);
		}

		// min rssi val
		cell = row.insertCell(-1);
		input_html = `<input type="number" id="pilot_rssi_min_val_${i}" min="0" max="4000" step="50" class="rssi_select">`;
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)),  constants.RESPONSE_MINRSSIVAL, parseInt(this.value*1), 16);
		}

		// max rssi val
		cell = row.insertCell(-1);
		input_html = `<input type="number" id="pilot_rssi_max_val_${i}" min="0" max="4000" step="50" class="rssi_select">`;
		cell.innerHTML = input_html;
		cell.lastChild.onclick = function () {
			set_value_pending(this);
			send_data_to(parseInt(this.id.slice(-1)), constants.RESPONSE_MAXRSSIVAL, parseInt(this.value*1), 16);
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

create_pilots();
startWebsocket("ws://192.168.4.1/ws");

document.getElementById("ADCVBATmode").oninput = function() {
	set_value_pending(this);
	ws.send(`ER*${constants.EXTENDED_VOLTAGE_TYPE}${this.value}\n`);
};
document.getElementById("ADCcalibValue").oninput = function() {
	set_value_pending(this);
	if(this.value.endsWith('.')) {
		set_value_error(this);
		return;
	}
	send_extended_data(constants.EXTENDED_VOLTAGE_CALIB, parseInt(this.value * 1000), 16);
};

document.getElementById("eepromReset").onclick = function () {
	set_value_pending(this);
	ws.send(`ER*${constants.EXTENDED_EEPROM_RESET}\n`);
};

document.getElementById("displayTimeout").oninput = function () {
	set_value_pending(this);
	send_extended_data(constants.EXTENDED_DISPLAY_TIMEOUT, parseInt(this.value*1), 16);
};

document.getElementById("WiFiProtocol").oninput = function () {
	set_value_pending(this);
	send_extended_data(constants.EXTENDED_WIFI_PROTOCOL, parseInt(this.value), 4);
};

document.getElementById("WiFiChannel").oninput = function () {
	set_value_pending(this);
	send_extended_data(constants.EXTENDED_WIFI_CHANNEL, parseInt(this.value), 4);
};

document.getElementById("RXFilterCutoff").oninput = function () {
	set_value_pending(this);
	send_extended_data(constants.EXTENDED_FILTER_CUTOFF, parseInt(this.value*1), 16);
};

document.getElementById("NumRXs").oninput = function () {
	set_value_pending(this);
	send_extended_data(constants.EXTENDED_NUM_MODULES, parseInt(this.value*1), 4);
};

document.getElementById("calibrate_button").onclick = function () {
	set_value_pending(this);
	ws.send(`ER*${constants.EXTENDED_CALIB_START}\n`);
};

function get_variable_settings() {
	ws.send("R*v\n");
	ws.send("ER*h\n");
	ws.send("ER*H\n");
	ws.send("ER*B\n");
}

setInterval(get_variable_settings, 2000);
