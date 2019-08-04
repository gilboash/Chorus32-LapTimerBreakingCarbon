#include "Output.h"

#include "HardwareConfig.h"

#include "UDP.h"
#include "Serial.h"
#ifdef USE_BLUETOOTH
#include "Bluetooth.h"
#endif
#ifdef USE_LORA
#include "Lora.h"
#endif

#include <freertos/semphr.h>

#define MAX_OUTPUT_BUFFER_SIZE 2000

#define OUTPUT_TYPE_LAN 0
#define OUTPUT_TYPE_WAN 1

static uint8_t output_buffer_lan[MAX_OUTPUT_BUFFER_SIZE];
static uint8_t output_buffer_wan[MAX_OUTPUT_BUFFER_SIZE];
static int output_buffer_pos_lan = 0; //Keep track of where we are in the Queue
static int output_buffer_pos_wan = 0; //Keep track of where we are in the Queue

static SemaphoreHandle_t queue_semaphore_lan = NULL;
static SemaphoreHandle_t queue_semaphore_wan = NULL;

// TODO: define this somewhere else!
static output_t outputs_lan[] = {
  {NULL, udp_init, udp_send_packet, udp_update, output_input_callback_lan},
#ifdef USE_SERIAL_OUTPUT
  {NULL, serial_init, serial_send_packet, serial_update, output_input_callback_lan},
#endif // USE_SERIAL_OUTPUT
#ifdef USE_BLUETOOTH
  {NULL, bluetooth_init, bluetooth_send_packet, bluetooth_update, output_input_callback_lan},
#endif // USE_BLUETOOTH
};

static output_t outputs_wan[] = {
#ifdef USE_LORA
  {NULL, lora_init, lora_send_packet, lora_update, output_input_callback_wan},
#endif // USE_LORA
};

#define OUTPUT_SIZE_LAN (sizeof(outputs_lan)/sizeof(outputs_lan[0]))
#define OUTPUT_SIZE_WAN (sizeof(outputs_wan)/sizeof(outputs_wan[0]))


bool addToSendQueue_lan(uint8_t item) {
  if(xSemaphoreTake(queue_semaphore_lan, portMAX_DELAY)) {
    if(output_buffer_pos_lan >= MAX_OUTPUT_BUFFER_SIZE) {
      xSemaphoreGive(queue_semaphore_lan);
      return false;
    }
    output_buffer_lan[output_buffer_pos_lan++] = item;
    xSemaphoreGive(queue_semaphore_lan);
    return true;
  }
  return false;
}

bool addToSendQueue_wan(uint8_t item) {
  if(xSemaphoreTake(queue_semaphore_wan, portMAX_DELAY)) {
    if(output_buffer_pos_wan >= MAX_OUTPUT_BUFFER_SIZE) {
      xSemaphoreGive(queue_semaphore_wan);
      return false;
    }
    output_buffer_wan[output_buffer_pos_wan++] = item;
    xSemaphoreGive(queue_semaphore_wan);
    return true;
  }
  return false;
}

uint8_t addToSendQueue_lan(uint8_t * buff, uint32_t length) {
  for (int i = 0; i < length; ++i) {
    if(!addToSendQueue_lan(buff[i])) {
      return i;
    }
  }
  return length;
}

uint8_t addToSendQueue_wan(uint8_t * buff, uint32_t length) {
  for (int i = 0; i < length; ++i) {
    if(!addToSendQueue_wan(buff[i])) {
      return i;
    }
  }
  return length;
}

void update_outputs() {
  // First update all inputs before sending new stuff
  for(int i = 0; i < OUTPUT_SIZE_LAN; ++i) {
    if(outputs_lan[i].update){
      outputs_lan[i].update(&outputs_lan[i]);
    }
  }
  for(int i = 0; i < OUTPUT_SIZE_WAN; ++i) {
    if(outputs_wan[i].update){
      outputs_wan[i].update(&outputs_wan[i]);
    }
  }
  if(xSemaphoreTake(queue_semaphore_lan, portMAX_DELAY)) {
    if(output_buffer_pos_lan > 0) {
#ifdef OUTPUT_DEBUG
  Serial.println("Output packet LAN: ");
  Serial.write(output_buffer_lan, output_buffer_pos_lan);
  Serial.println("######");
#endif
      // Send current buffer to all configured outputs
      for(int i = 0; i < OUTPUT_SIZE_LAN; ++i) {
        if(outputs_lan[i].sendPacket) {
          outputs_lan[i].sendPacket(&outputs_lan[i], output_buffer_lan, output_buffer_pos_lan);
        }
      }
      output_buffer_pos_lan = 0;
    }
    xSemaphoreGive(queue_semaphore_lan);
  }
  if(xSemaphoreTake(queue_semaphore_wan, portMAX_DELAY)) {
    if(output_buffer_pos_wan > 0) {
#ifdef OUTPUT_DEBUG
  Serial.println("Output packet WAN: ");
  Serial.write(output_buffer_wan, output_buffer_pos_wan);
  Serial.println("######");
#endif
      // Send current buffer to all configured outputs
      for(int i = 0; i < OUTPUT_SIZE_WAN; ++i) {
        if(outputs_wan[i].sendPacket) {
          outputs_wan[i].sendPacket(&outputs_wan[i], output_buffer_wan, output_buffer_pos_wan);
        }
      }
      output_buffer_pos_wan = 0;
    }
    xSemaphoreGive(queue_semaphore_wan);
  }
}

void init_outputs() {
  queue_semaphore_lan = xSemaphoreCreateMutex();
  for(int i = 0; i < OUTPUT_SIZE_LAN; ++i) {
    if(outputs_lan[i].init) {
      outputs_lan[i].init(&outputs_lan[i]);
    }
  }
  queue_semaphore_wan = xSemaphoreCreateMutex();
  for(int i = 0; i < OUTPUT_SIZE_WAN; ++i) {
    if(outputs_wan[i].init) {
      outputs_wan[i].init(&outputs_wan[i]);
    }
  }
}

void output_input_callback_lan(uint8_t* buf, uint32_t size) {
	log_i("Lan callback with size %d", size);
	addToSendQueue_wan(buf, size); // just relay to wan
}

void output_input_callback_wan(uint8_t* buf, uint32_t size) {
	log_i("Wan callback with size %d", size);
	addToSendQueue_lan(buf, size); // just relay to lan
}
