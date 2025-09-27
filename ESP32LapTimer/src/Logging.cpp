
#include <esp_log.h>
#include <stdarg.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "SPIFFS.h"
#include "Output.h"


#include <FS.h>

#include "Output.h"
#include "Logging.h"


const size_t MAX_LOG_SIZE = 100 * 1024;  // 100 KB
const size_t KEEP_SIZE    = 80 * 1024;


static uint32_t lineCounter = 0;

static File logFile;

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


static void printMemoryStats() {
    logToFile("Free heap: %u bytes\n", ESP.getFreeHeap());
    logToFile("Min free heap (lowest ever): %u bytes\n", ESP.getMinFreeHeap());
    logToFile("Largest free block: %u bytes\n", ESP.getMaxAllocHeap());
}
void shouldLogFileTruncate() {
    size_t size = logFile.size();

    if (size > MAX_LOG_SIZE) {
      Serial.println("log file size limit reached, truncating");
      logFile.close();
      logFile = SPIFFS.open("/logstore.txt", "r");


      // Move to the point we want to keep
      logFile.seek(size - KEEP_SIZE);
      String recent = logFile.readString();
      logFile.close();

      // Rewrite file with only recent logs
      logFile = SPIFFS.open("/logstore.txt", "w");
      if (logFile) {
          logFile.print("---- log trimmed ----\n");
          logFile.print(recent);
          logFile.close();
          logFile = SPIFFS.open("/logstore.txt", FILE_APPEND);
          if (!logFile) {
                    Serial.println("Failed to open log file after truncated");
          }
          


      } else {
            Serial.println("Failed to open log file for write");

      }

    }
    //good opportunity
    printMemoryStats();

}
void initLogFile() {

  logFile = SPIFFS.open("/logstore.txt", FILE_APPEND);
  if (!logFile) {
        Serial.println("Failed to open log file");
  } else {
        shouldLogFileTruncate();
  }


  size_t totalBytes = SPIFFS.totalBytes();
  size_t usedBytes  = SPIFFS.usedBytes();

  logToFile("SPIFFS size: %u bytes\n", totalBytes);
  logToFile("Used: %u bytes\n", usedBytes);
  logToFile("Free: %u bytes\n", totalBytes - usedBytes);
}

void logToFile(const char *fmt, ...) {

    //void logToFile(const String &msg) {
    if (!logFile) return;
    char buf[256];  // adjust size depending on max log line length

    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);

    // write to file
    logFile.println(buf);
    lineCounter++;
    logFile.flush();

    // check for truncation every 200 log lines
    if (lineCounter % 200 == 0) {
        shouldLogFileTruncate();
    }
    
    Serial.println(buf);
}

void closeLog() {
    if (logFile) logFile.close();
}