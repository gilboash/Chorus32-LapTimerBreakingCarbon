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
			cell.innerHTML = "<input id=\"pilot_name_" + i + "\" type=\"text\" name=\"pilot\" value=\"" + (i+1) + "\" oninput=update_default_pilot_name(" + i + ")>";
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
