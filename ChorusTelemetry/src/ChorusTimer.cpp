#include <WiFi.h>
#include <esp_wifi.h>

#include <lwip/sockets.h>
#include <lwip/netdb.h>

#define WIFI_AP_NAME "Chorus32 LapTimer"

#define UART_TX 21
#define UART_RX 12

WiFiClient client;

#define MAX_BUF 1500
char buf[MAX_BUF];
uint32_t buf_pos = 0;

void chorus_connect() {
	if(WiFi.isConnected()) {
		if(client.connect("192.168.4.1", 9000)) {
			Serial.println("Connected to chorus via tcp");
		}
	}
}

void wifi_connect() {
	WiFi.begin(WIFI_AP_NAME);
	while (WiFi.status() != WL_CONNECTED) {
		delay(500);
		Serial.print(".");
	}
	Serial.println("Connected!");
	Serial.print("IP: ");
	Serial.println(WiFi.localIP());
}

void setup() {
	Serial.begin(115200);
	Serial1.begin(115200, SERIAL_8N1, UART_TX, UART_RX, true);
	delay(500);

	memset(buf, 0, 1500 * sizeof(char));
}

void loop() {
	while(client.connected() && client.available()) {
		// Doesn't include the \n itself
		String line = client.readStringUntil('\n');
		// Only forward specific messages for now
		if(line[2] == 'L') {
			Serial1.println(line);
			Serial.printf("Forwarding to taranis: %s\n", line.c_str());
		}
	}

	while(Serial1.available()) {
		if(buf_pos >= MAX_BUF -1 ) {
			buf_pos = 0; // clear buffer when full
			break;
		}
		buf[buf_pos++] = Serial.read();
		if(buf[buf_pos - 1] == '\n') {
			Serial.print("Forwarding to chorus: ");
			Serial.write((uint8_t*)buf, buf_pos);
			client.write(buf, buf_pos);
			buf_pos = 0;
		}
	}

	if(!WiFi.isConnected()) {
		Serial.println("Lost WiFi connection! Trying to reconnect");
		wifi_connect();
	}

	if(!client.connected()) {
		delay(1000);
		Serial.println("Lost tcp connection! Trying to reconnect");
		chorus_connect();
	}
}
