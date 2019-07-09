#include "Lora.h"

#include "HardwareConfig.h"

#ifdef USE_LORA

#include "Output.h"

#include <SPI.h>
#include <LoRa.h>
#include <Arduino.h>

#if defined(LORA_MOSI) && defined(LORA_SCK) && defined(LORA_MISO) // lora spi pins defined
#define CUSTOM_LORA_SPI
  static SPIClass lora_spi(HSPI);
#endif

void lora_send_packet(void* output, uint8_t* buf, uint32_t size) {
  if (buf != NULL && size != 0) {
    LoRa.beginPacket();
    uint32_t bytes = LoRa.write(buf, size);
    LoRa.endPacket(true);
  }
}

void lora_init(void* output) {
#ifdef CUSTOM_LORA_SPI
  Serial.println("Using custom lora pins!");
  lora_spi.begin(LORA_SCK, LORA_MISO, LORA_MOSI);
  LoRa.setSPI(lora_spi);
#endif
  LoRa.setPins(LORA_CS, LORA_RST, LORA_IRQ);
  if(!LoRa.begin(LORA_FREQ)) {
    Serial.println("Failed to init LoRa!!");
  }
}

void lora_update(void* output) {
  int pos = 0;
  uint8_t packetBuffer[1500];
  int packetSize = LoRa.parsePacket();
  if(packetSize > 0) {
    while(LoRa.available() > 0 && pos < 1500 && pos < packetSize) {
      packetBuffer[pos] = LoRa.read();
      ++pos;
    }
    output_t* out = (output_t*)output;
    out->handle_input_callback(packetBuffer, pos);
  }
}

#endif // USE_LORA
