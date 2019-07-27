    requestData(); // get intial data straight away
	var StatusData;
    function requestData() {

      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'StaticVars');

      xhr.onload = function() {
        if (xhr.status === 200) {
          if (xhr.responseText) { // if the returned data is not null, update the values
            StatusData = JSON.parse(JSON.stringify(xhr.responseText));
			var data = JSON.parse(StatusData); //yeah not sure why I need to do this twice, but otherwise it doesn't work....
            document.getElementById("NumRXs").selectedIndex = parseInt(data.NumRXs);
			document.getElementById("ADCVBATmode").selectedIndex = parseInt(data.ADCVBATmode);
            document.getElementById("RXFilterCutoff").value = parseInt(data.RXFilterCutoff);
			document.getElementById('ADCcalibValue').value = parseFloat(data.ADCcalibValue);
            document.getElementById('WiFiProtocol').value = parseInt(data.WiFiProtocol);
            document.getElementById('WiFiChannel').value = parseInt(data.WiFiChannel);
            document.getElementById('displayTimeout').value = Math.floor(parseInt(data.displayTimeout) / 1000);
           
            createPilotSettings(data);
            updateBandChannel(data);
          }
        }else{requestData() }
      };

      xhr.send();
    }
    
    function createPilotSettings(data) {
		var pilots = data.pilot_data;
		for(var i = 0; i < data.pilot_data.length; ++i) {
			var table = document.getElementById('pilot_table');
			var row = table.insertRow(-1);
			row.insertCell(-1).innerText = pilots[i].number;
			var cell;
			var input_html = "";

			// band selection
			cell = row.insertCell(-1);
			input_html = "<select style=\"width: 80%;\" name=\"band" + pilots[i].number + "\" id=\"band" + pilots[i].number + "\">";
			input_html += "<option selected=\"\" value=\"0\">R</option><option value=\"1\">A</option><option value=\"2\">B</option><option value=\"3\">E</option><option value=\"4\">F</option><option value=\"5\">D</option><option value=\"6\">Connex</option><option value=\"7\">Connex2</option></select>";
			cell.innerHTML = input_html;

			// channel selection
			cell = row.insertCell(-1);
			input_html = "<select name=\"channel" + i + "\" id=\"channel" + i + "\" style=\"width: 100%;\"><option value=\"0\">1</option><option value=\"1\">2</option><option value=\"2\">3</option><option value=\"3\">4</option><option value=\"4\">5</option><option value=\"5\">6</option><option value=\"6\">7</option><option value=\"7\">8</option></select>";
			cell.innerHTML = input_html;
			
			// RSSI threshold
			cell = row.insertCell(-1);
			input_html = "<input type=\"number\" name=\"RSSIthreshold" + i + "\" min=\"0\" max=\"342\" step=\"1\" value=" + Math.floor(pilots[i].threshold) + ">";
			cell.innerHTML = input_html;

			// Enabled checkbox
			cell = row.insertCell(-1);
			input_html= "<input type='checkbox' name='pilot_enabled_" + pilots[i].number + "'";
			if(pilots[i].enabled) {
				input_html += "checked";
			}
			input_html += ">";
			cell.innerHTML = input_html;
			
			// multiplex checkbox
			cell = row.insertCell(-1);
			input_html = "<input type='checkbox' name='pilot_multuplex_off_" + pilots[i].number + "'";
			if(pilots[i].multiplex_off) {
				input_html += "checked";
			}
			input_html += ">";
			cell.innerHTML = input_html;
		}
	}

    function updateBandChannel(data){
        for(var i=0;i<data.pilot_data.length;i++){
            document.getElementById('band'+i).value = data.pilot_data[i].band;
            document.getElementById('channel'+i).value = data.pilot_data[i].channel;
        }
    }
