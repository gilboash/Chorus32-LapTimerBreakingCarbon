#include <WiFi.h>
#include <esp_wifi.h>
#include "HardwareConfig.h"

#include "Output.h"

static IPAddress apIP(192, 168, 4, 1);

void setup() {
	 Serial.begin(115200);
	
	// TODO: create wifi
	
	WiFi.begin();
	delay( 500 ); // If not used, somethimes following command fails
	WiFi.mode( WIFI_AP );
	uint8_t protocol = (WIFI_PROTOCOL_11B);
	ESP_ERROR_CHECK(esp_wifi_set_protocol(WIFI_IF_AP, protocol));
	WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
	uint8_t channel = 1;
	Serial.print("Starting wifi \"" WIFI_AP_NAME "\" on channel ");
	Serial.print(channel);
	Serial.print(" and mode ");
	Serial.println(protocol ? "bgn" : "b");
	WiFi.softAP(WIFI_AP_NAME, NULL, channel);
	
	init_outputs();

}

void loop() {
	update_outputs();
}
