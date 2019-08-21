import * as constants from './constants.js';

var ws = null;

function send_extended_data(type, data, bits) {
	ws.send(`ER*${type}${(data).toString(16).padStart(bits/4, '0').toUpperCase()}\n`);
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
	object.style.border = "1px solid orange";
}

function set_value_received(object) {
	object.style.border = "1px solid green";
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
		}
	} else {
		switch(cmd) {
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

document.getElementById("ADCVBATmode").oninput = function() {
	set_value_pending(this);
	ws.send(`ER*${constants.EXTENDED_VOLTAGE_TYPE}${this.value}\n`);
};
document.getElementById("ADCcalibValue").oninput = function() {
	set_value_pending(this);
	if(this.value.endsWith('.')) {
		this.style.border = "1px solid red";
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
