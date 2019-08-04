#include "Lora.h"

#include "HardwareConfig.h"

#ifdef USE_LORA

#include "Output.h"
#include "Utils.h"

#include <SPI.h>
#include <LoRa.h>
#include <Arduino.h>

#if defined(LORA_MOSI) && defined(LORA_SCK) && defined(LORA_MISO) // lora spi pins defined
#define CUSTOM_LORA_SPI
  static SPIClass lora_spi(HSPI);
#endif

#define LORA_RX_WAIT_TIME_MS 50 // Forbid sending packages if we received one in the last x milliseconds. Should prevent lost packages (TODO: improve this)
#define LORA_MAX_PACKET_SIZE 150
#define LORA_TASK_DELAY_MS 10

static uint32_t last_rx_time_ms = 0;

#define LORA_SEND_BUF_SIZE 6000

static uint8_t lora_send_buf[LORA_SEND_BUF_SIZE];
static uint32_t lora_buf_pos = 0;

static SemaphoreHandle_t queue_semaphore = NULL;

static void lora_send() {
	if (lora_buf_pos != 0 && (millis() - last_rx_time_ms) > LORA_RX_WAIT_TIME_MS && xSemaphoreTake(queue_semaphore, portMAX_DELAY)) {
		size_t size_to_send = MIN(lora_buf_pos, LORA_MAX_PACKET_SIZE);
		int status = 0;
		size_t written_bytes = 0;
		// find line break to only send complete packages
		while(size_to_send > 0 && lora_send_buf[size_to_send - 1] != '\n') {
			--size_to_send;
		}
		if(size_to_send == 0) {
			log_e("Got incomplete package in buf with size %d", lora_buf_pos);
			Serial.write(lora_send_buf, lora_buf_pos);
			Serial.println("");
			lora_buf_pos -= MIN(lora_buf_pos, LORA_MAX_PACKET_SIZE);
			goto send_end;
		}
		Serial.printf("Sending LoRa packet with size %d buf %d\n", size_to_send, lora_buf_pos);
		status = LoRa.beginPacket();
		if(!status) {
			log_e("Error on lora begin packet");
			goto send_end;
		}
		written_bytes = LoRa.write(lora_send_buf, size_to_send);
		status = LoRa.endPacket(true);
		if(!status) {
			log_e("Error on lora end packet");
			goto send_end;
		}
		lora_buf_pos -= written_bytes;
		memmove(lora_send_buf, lora_send_buf + size_to_send, LORA_SEND_BUF_SIZE - size_to_send);
		send_end:
		xSemaphoreGive(queue_semaphore);
	}
}

static void lora_send_task(void* arg) {
	const TickType_t xDelay = LORA_TASK_DELAY_MS / portTICK_PERIOD_MS;
	while(42) {
		lora_send();
		vTaskDelay(xDelay);
	}
}

void lora_send_packet(void* output, uint8_t* buf, uint32_t size) {
	if(lora_buf_pos + size < LORA_SEND_BUF_SIZE && xSemaphoreTake(queue_semaphore, portMAX_DELAY)) {
		memcpy(lora_send_buf + lora_buf_pos, buf, size);
		lora_buf_pos += size;
		//Serial.printf("Lora send buf is now at %d\n", lora_buf_pos);
		xSemaphoreGive(queue_semaphore);
	}
}

void lora_init(void* output) {
  queue_semaphore = xSemaphoreCreateMutex();
#ifdef CUSTOM_LORA_SPI
  Serial.println("Using custom lora pins!");
  lora_spi.begin(LORA_SCK, LORA_MISO, LORA_MOSI);
  LoRa.setSPI(lora_spi);
#endif
  LoRa.setPins(LORA_CS, LORA_RST, LORA_IRQ);
  LoRa.enableCrc();
  LoRa.setSyncWord(0xC7);
  if(!LoRa.begin(LORA_FREQ)) {
    Serial.println("Failed to init LoRa!!");
  }
  
  // TODO: use the task. I currently have problems with the mutex
  //xTaskCreatePinnedToCore(lora_send_task, "lora_send", 4096, NULL, 1, NULL, 1);
}

void lora_update(void* output) {
	int pos = 0;
	uint8_t packetBuffer[1500];
	int packetSize = LoRa.parsePacket();
	if(packetSize > 0) {
		Serial.printf("New lora package with size %d!\n", packetSize);
		last_rx_time_ms = millis();
		while(LoRa.available() > 0 && pos < 1500 && pos < packetSize) {
			packetBuffer[pos] = LoRa.read();
			++pos;
		}
		output_t* out = (output_t*)output;
		out->handle_input_callback(packetBuffer, pos);
	} else {
		lora_send();
	}
	
}

#endif // USE_LORA
