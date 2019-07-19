#include <SPI.h>
#include <driver/adc.h>
#include <driver/timer.h>
#include <esp_adc_cal.h>

#include <stdint.h>

#define SPI_ADDRESS_SYNTH_B 0x01
#define PIN_SPI_SLAVE_SELECT 16
#define ADC1 ADC1_CHANNEL_0

#define START_FREQ 5658
#define TEST_FREQ 5769

#define TEST_TIME 100

uint32_t data[TEST_TIME];
uint32_t time_counter = 0;

void setup() {

  Serial.begin(9600);
  Serial.println("Starting...");
  
  pinMode(PIN_SPI_SLAVE_SELECT, OUTPUT);
  digitalWrite(PIN_SPI_SLAVE_SELECT, HIGH);

  SPI.begin();
  
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ADC1, ADC_ATTEN_6db);
  rxWrite(SPI_ADDRESS_SYNTH_B, getSynthRegisterBFreq(START_FREQ));
  delay(100);
  
}

void loop() {
	time_counter = 0;
	rxWrite(SPI_ADDRESS_SYNTH_B, getSynthRegisterBFreq(TEST_FREQ));
	
	for(int i = 0; i < TEST_TIME; ++i) {
		data[time_counter] = adc1_get_raw(ADC1);
		++time_counter;
		delay(1);
	}
	
	Serial.println("Results: ");
	for(int i = 0; i < TEST_TIME; ++i) {
		Serial.print(i);
		Serial.print("\t");
		Serial.println(data[i]);
	}
	
	rxWrite(SPI_ADDRESS_SYNTH_B, getSynthRegisterBFreq(START_FREQ));
	delay(1000);
}

void rxWrite(uint8_t addressBits, uint32_t dataBits) {
  
  uint32_t data = addressBits | (1 << 4) | (dataBits << 5);
  
  SPI.beginTransaction(SPISettings(1000000, LSBFIRST, SPI_MODE0));
  digitalWrite(PIN_SPI_SLAVE_SELECT, LOW);
  SPI.transferBits(data, NULL, 25);  
  digitalWrite(PIN_SPI_SLAVE_SELECT, HIGH);
  SPI.endTransaction();
  
}

uint16_t getSynthRegisterBFreq(uint16_t f) {
      return ((((f - 479) / 2) / 32) << 7) | (((f - 479) / 2) % 32);
}
