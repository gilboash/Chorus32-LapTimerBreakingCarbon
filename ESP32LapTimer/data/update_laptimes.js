requestData(); // get intial data straight away
var StatusData;

// request data updates every 5000 milliseconds
setInterval(requestData, 2000);

function requestData() {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', 'get_laptimes');

	xhr.onload = function() {
		if (xhr.status === 200) {
			if (xhr.responseText) { // if the returned data is not null, update the values
				StatusData = JSON.parse(JSON.stringify(xhr.responseText));
				var data = JSON.parse(StatusData);
				var round_num = data.race_num;
				if(round_num == 0) return;
				
				var count_first = parseInt(data.count_first);
				var table = document.getElementById("lap_table_" + round_num);
				// If the round is new create a new tab
				if(table == null) {
					var default_list = document.getElementById("lap_table_default");
					table = default_list.cloneNode(true);
					table.id = "lap_table_" + round_num;
					var table_div = document.getElementById("table_container");
					var content_div = document.createElement("div");
					content_div.setAttribute('class', 'tabcontent');
					content_div.id = "round_tab_content_" + round_num;
					table_div.appendChild(content_div);
					content_div.appendChild(table);

					// create button
					var button_div = document.getElementById("round_buttons");
					console.log(button_div);
					button_div.innerHTML += "<button class='tablinks' onclick='openRound(event," + round_num + ")'>Round " + round_num + "</button>\n"
				}
				
				var lap_data = data.lap_data;
				var total_laps = table.rows[0].cells.length - 3;
				for(var i = 0; i < data.lap_data.length; ++i) {
					if(data.lap_data[i].laps.length != 0) {
						var pilot = data.lap_data[i].pilot;
						var row = table.rows[pilot + 1];
						var best_lap = 99999;
						var avg_lap = 0;
						var j;
						for(j = 0; j < data.lap_data[i].laps.length && j < total_laps; ++j) {
							var lap = data.lap_data[i].laps[j];
							row.cells[j+1].innerHTML = lap/1000.0;
							if(count_first == 0 && j == 0) continue; // skip lap 0 for avg and best if we don't count it
							best_lap = Math.min(best_lap, lap);
							avg_lap += lap;
						}
						avg_lap /= j - (count_first == 0);
						row.cells[total_laps + 1].innerHTML = avg_lap/1000.0;
						row.cells[total_laps + 2].innerHTML = best_lap/1000.0;
					}
				}
			} else {
				console.log('Request failed.	Returned status of ' + xhr.status);
			}
		}
	};
	xhr.send();
}
