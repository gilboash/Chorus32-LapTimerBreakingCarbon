#include "Logging.h"

#include <esp_log.h>
#include <stdarg.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include "Output.h"

static vprintf_like_t old_output;

int chorus_printf(const char* format, va_list args) {
  int size = vsnprintf(NULL, 0, format, args);
  size += 1 + 4 + 1; // 1 for null byte, 4 for "ER*L" and 1 for \n
  char* buf = (char*)malloc(size);

  strncpy(buf, "ER*L", 4);
  vsnprintf(buf + 4, size - 6, format, args);
  buf[size-2] = '\n';
  buf[size-1] = '\0';
  //on the esp32 messages there already is an \0 at size - 3. but better be safe :)
  addToSendQueue((uint8_t*)buf, size);
  free(buf);
  return size;
}


void set_chorus_log(bool enable) {
  if(enable) {
    old_output = esp_log_set_vprintf(chorus_printf);
  } else {
    esp_log_set_vprintf(old_output);
  }
}
