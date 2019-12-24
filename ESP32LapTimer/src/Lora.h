#ifndef __LORA_H__
#define __LORA_H__

#include <stdint.h>

void lora_send_packet(void* output, uint8_t* buf, uint32_t size);
void lora_init(void* output);
void lora_update(void* output);

#endif // __LORA_H__
