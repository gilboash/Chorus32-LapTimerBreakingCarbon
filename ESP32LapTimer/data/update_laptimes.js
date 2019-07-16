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
				var table = document.getElementById("lap_table");
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
							best_lap = Math.min(best_lap, lap);
							avg_lap += lap;
							row.cells[j+1].innerHTML = lap/1000.0;
						}
						avg_lap /= j;
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
