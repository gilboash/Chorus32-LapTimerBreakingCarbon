/*
 * This file is part of Chorus32-ESP32LapTimer
 * (see https://github.com/AlessandroAU/Chorus32-ESP32LapTimer).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
#include "TimerWebServer.h"

#include "settings_eeprom.h"
#include "ADC.h"
#include "RX5808.h"
#include "Calibration.h"
#include "Laptime.h"
#include "Comms.h"
#include "HardwareConfig.h"
#include "Wireless.h"
#include "Output.h"
#include "CrashDetection.h"
#include "Logging.h"
#include "Version.h"

#include <esp_wifi.h>
#include <FS.h>
#include "SPIFFS.h"
#include <Update.h>
#include <ESPAsyncWebServer.h>

#define WEBSOCKET_BUF_SIZE 1500
static uint8_t websocket_buffer[WEBSOCKET_BUF_SIZE];
static int websocket_buffer_pos = 0;
SemaphoreHandle_t websocket_lock;

AsyncWebServer webServer(80);
AsyncWebSocket ws("/ws");

//flag to use from web update to reboot the ESP
//static bool shouldReboot = false;
static const char NOSPIFFS[] PROGMEM = "<h1>ERROR: Could not read the SPIFFS partition</h1>This means you either forgot to upload the data files or a previous update failed.<br>To fix this problem you have a few options:<h4>1 Arduino IDE</h4> Install the <b><a href=\"https://github.com/me-no-dev/arduino-esp32fs-plugin\">following plugin</a></b>.<br> Place the plugin file here: <b>\"&lt;path to your Arduino dir&gt;/tools/ESP32FS/tool/esp32fs.jar\"</b>.<br><br> Next select <b>Tools > ESP32 Sketch Data Upload</b>.<br>NOTE: This is a seperate upload to the normal arduino upload!<h4>2 Platformio</h4>Press the Upload Filesystem button or run \"pio run -e &lt;your board&gt; -t uploadfs\"<h4>3 Use this form</h4>Upload the spiffs file from the release site here:<br><br><form method='POST' action='/update' enctype='multipart/form-data'> <input type='file' name='update'> <input type='submit' value='Update'></form>";

static bool HasSPIFFsBegun = false;

static bool isHTTPUpdating = false;

String getMacAddress() {
  byte mac[6];
  WiFi.macAddress(mac);
  String cMac = "";
  for (int i = 0; i < 6; ++i) {
    cMac += String(mac[i], HEX);
    if (i < 5)
      cMac += "-";
  }
  cMac.toUpperCase();
  Serial.print("Mac Addr:");
  Serial.println(cMac);
  return cMac;
}

String getContentType(String filename) { // convert the file extension to the MIME type
  if (filename.endsWith(".html")) return "text/html";
  else if (filename.endsWith(".htm")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".png")) return "image/png";
  else if (filename.endsWith(".gif")) return "image/gif";
  else if (filename.endsWith(".svg")) return "image/svg+xml";
  else if (filename.endsWith(".jpg")) return "image/jpeg";
  else if (filename.endsWith(".ico")) return "image/x-icon";
  else if (filename.endsWith(".xml")) return "text/xml";
  else if (filename.endsWith(".pdf")) return "application/x-pdf";
  else if (filename.endsWith(".zip")) return "application/x-zip";
  else if (filename.endsWith(".json")) return "application/json";
  else if (filename.endsWith(".mp4")) return "video/mp4";
  else if (filename.endsWith(".gz")) return "application/x-gzip";
  return "text/plain";
}

// prepare_data.py gzips most files in place, but not all of them, and a
// filesystem image flashed over OTA may not have come from our build at all.
// Sniff the gzip magic instead of assuming, so we never label a plain file as
// compressed (which makes the browser discard it).
static bool isGzipped(String path) {
  File f = SPIFFS.open(path, "r");
  if (!f) return false;
  uint8_t magic[2] = {0, 0};
  size_t read = f.read(magic, sizeof(magic));
  f.close();
  return read == sizeof(magic) && magic[0] == 0x1F && magic[1] == 0x8B;
}

bool handleFileRead(AsyncWebServerRequest* req, String path) { // send the right file to the client (if it exists)
  // If a folder is requested, send the index file
  String contentType = getContentType(path);            // Get the MIME type
  if (SPIFFS.exists(path)) {
    AsyncWebServerResponse *response = req->beginResponse(SPIFFS, path, contentType);
    if (isGzipped(path)) {
      response->addHeader("Content-Encoding", "gzip");
    }
    req->send(response);
    return true;
  }
  return false;                                         // If the file doesn't exist, return false
}

// Reads the version string out of the generated /version.json that ships in the
// filesystem image. Deliberately a hand-rolled scan rather than a JSON parser:
// the file is ours, it is three fields long, and this avoids a dependency.
static String getFilesystemVersion() {
  if (!SPIFFS.exists("/version.json")) return String("unknown");
  File f = SPIFFS.open("/version.json", "r");
  if (!f) return String("unknown");
  String content = f.readString();
  f.close();

  int key = content.indexOf("\"version\"");
  if (key < 0) return String("unknown");
  int colon = content.indexOf(':', key);
  if (colon < 0) return String("unknown");
  int start = content.indexOf('"', colon);
  if (start < 0) return String("unknown");
  int end = content.indexOf('"', ++start);
  if (end < 0) return String("unknown");
  return content.substring(start, end);
}

// Firmware and filesystem are two separate OTA uploads, so report both and let
// the UI shout if they drifted apart.
void sendVersion(AsyncWebServerRequest* req) {
  String fs_version = getFilesystemVersion();
  String body = String("{\"firmware\":\"") + FIRMWARE_VERSION +
                "\",\"filesystem\":\"" + fs_version +
                "\",\"match\":" + (fs_version == FIRMWARE_VERSION ? "true" : "false") +
                ",\"git\":\"" + GIT_HASH +
                "\",\"built\":\"" + BUILD_DATE +
                "\",\"api\":\"0004\"}";
  req->send(200, "application/json", body);
}

// The connectivity-check URLs the major platforms hit after associating. Any of
// them answered with a redirect makes the OS pop the captive portal page, which
// is how we get the timer's UI to open by itself on connect.
static bool isCaptivePortalProbe(AsyncWebServerRequest* req) {
  String url = req->url();
  return url == "/generate_204" ||              // Android
         url == "/gen_204" ||                   // Android (older)
         url == "/hotspot-detect.html" ||       // iOS / macOS
         url == "/library/test/success.html" || // iOS / macOS (older)
         url == "/success.txt" ||               // Firefox / iOS
         url == "/canonical.html" ||            // Firefox
         url == "/connectivity-check.html" ||   // Ubuntu
         url == "/check_network_status.txt" ||  // Ubuntu
         url == "/connecttest.txt" ||           // Windows
         url == "/redirect" ||                  // Windows
         url == "/ncsi.txt" ||                  // Windows
         url == "/fwlink";                      // Windows
}

void updateRx (int band, int channel, int rx) {
  setPilotBand(rx, band);
  setPilotChannel(rx, channel);
}

void calibrateRSSI(AsyncWebServerRequest* req) {
  rssiCalibration();
  req->redirect("/redirect.html");
}

void startRace_button(AsyncWebServerRequest* req) {
  logToFile("Starting race...");
  startRace();
  req->send(200, "text/plain", "");
}

void stopRace_button(AsyncWebServerRequest* req) {
  logToFile("Stopping race...");
  stopRace();
  req->send(200, "text/plain", "");
}

void fetch_laptimes_button(AsyncWebServerRequest* req) {
  logToFile("Fetching laptimes...");
  //stopRace();
  req->send(200, "text/plain", "");
}

void onWebsocketEvent(AsyncWebSocket * server, AsyncWebSocketClient * client, AwsEventType type, void * arg, uint8_t *data, size_t len){
  if(isHTTPUpdating) return; // ignore all incoming messages during update



//  Serial.print("Got websocket message: ");
//  Serial.write(data, len);
//  Serial.println("");

  logToFile("Got websocket message: !");

  // Copy payload into a null-terminated buffer
    char buf[256];  // adjust size depending on max expected len
    size_t copyLen = (len < sizeof(buf) - 1) ? len : sizeof(buf) - 1;
    memcpy(buf, data, copyLen);
    buf[copyLen] = '\0';

    logToFile("%s", buf);

  if(xSemaphoreTake(websocket_lock, portMAX_DELAY)){
    //Handle WebSocket event
    if(type == WS_EVT_DATA){
      //data packet
      AwsFrameInfo * info = (AwsFrameInfo*)arg;
      if(info->final && info->index == 0 && info->len == len){
        //the whole message is in a single frame and we got all of it's data
        // we'll ignore fragmented messages for now
        if(websocket_buffer_pos + len < WEBSOCKET_BUF_SIZE) {
          memcpy(websocket_buffer + websocket_buffer_pos, data, len);
          websocket_buffer_pos += len;
        }
      }
    }
    xSemaphoreGive(websocket_lock);
  }
}

void read_websocket(void* output) {
  if(xSemaphoreTake(websocket_lock, 1)){
    if(websocket_buffer_pos > 0) {
      output_t* out = (output_t*)output;
      out->handle_input_callback(websocket_buffer, websocket_buffer_pos);
      websocket_buffer_pos = 0;
    }
    xSemaphoreGive(websocket_lock);
  }
}

void send_websocket(void* output, uint8_t* data, size_t len) {
  ws.textAll(data, len);
}


void InitWebServer() {
  HasSPIFFsBegun = SPIFFS.begin();
  // attach AsyncWebSocket
  ws.onEvent(onWebsocketEvent);
  webServer.addHandler(&ws);
  websocket_lock = xSemaphoreCreateMutex();
  webServer.on("/recovery.html", HTTP_GET, [](AsyncWebServerRequest* req) {
      req->send(200, "text/html", NOSPIFFS);
    });

  if (!SPIFFS.exists("/index.html")) {
    Serial.println("SPIFFS filesystem was not found");
    // Serve the built-in page directly. Going through handleFileRead would look
    // for /recovery.html *in SPIFFS*, which is exactly what we don't have here:
    // it would find nothing, return false and never send a response, leaving the
    // request to hang. This is the path a half-finished filesystem update lands
    // on, so it has to work without a serial cable.
    webServer.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
      req->send(200, "text/html", NOSPIFFS);
    });
  } else {
    webServer.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
      handleFileRead(req, "/index.html");
    });
  }


  initLogFile();

  webServer.onNotFound([](AsyncWebServerRequest* req) {

    if (isCaptivePortalProbe(req)) {
      // Every OS probes a URL it expects a specific answer from, and shows the
      // "sign in to network" sheet when it gets a redirect instead. Send an
      // absolute URL: some clients ignore a relative Location on a probe.
      req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
    } else {
      // If the client requests any URI
      if (!handleFileRead(req, req->url()))                  // send it if it exists
        req->send(404, "text/plain", "404: Not Found"); // otherwise, respond with a 404 (Not Found) error
    }
  });

   // serve the log file
    webServer.on("/logs", HTTP_GET, [](AsyncWebServerRequest *request){
        if (SPIFFS.exists("/logstore.txt")) {
            request->send(SPIFFS, "/logstore.txt", "text/plain");
        } else {
            request->send(404, "text/plain", "Log file not found");
        }
    });


  webServer.on("/version", HTTP_GET, sendVersion);

  webServer.on("/start_race", startRace_button);
  webServer.on("/stop_race", stopRace_button);
  webServer.on("/fetch_laptimes", fetch_laptimes_button);

  webServer.on("/calibrateRSSI",calibrateRSSI);


  webServer.on("/update", HTTP_POST, [](AsyncWebServerRequest* req) {
    AsyncWebServerResponse *response = req->beginResponse((Update.hasError()) ? 400 : 200, "text/plain", (Update.hasError()) ? "FAIL" : "OK, module rebooting");
    response->addHeader("Connection", "close");
    req->send(response);
    Serial.println("off-updating");
    restart_esp();
  }, [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    isHTTPUpdating = true;
    if(!index) {
      int partition = data[0] == 0xE9 ? U_FLASH : U_SPIFFS;
      if(partition == U_SPIFFS) {
        // Since we don't have a magic number, we are checking the filename for "spiffs"
        if(strstr(filename.c_str(), "spiffs") == NULL) {
          partition = -1; // set partition to an invalid value
        }
      }
      log_i("Update Start: %s on partition %d\n", filename.c_str(), partition);
      if (!Update.begin(UPDATE_SIZE_UNKNOWN, partition)) { //start with max available size
        log_e("%s\n", Update.errorString());
        isHTTPUpdating = false;
      }
    }
    if(!Update.hasError()){
      if(Update.write(data, len) != len){
        log_e("%s\n", Update.errorString());
        isHTTPUpdating = false;
      }
    }
    if(final){
      if(Update.end(true)){
        Serial.printf("Update Success: %uB\n", index+len);
      } else {
        log_e("%s\n", Update.errorString());
      }
      isHTTPUpdating = false;
    }
  });

  webServer.begin();                           // Actually start the server
  Serial.println("HTTP server started");
  delay(1000);
}

bool isUpdating() {
  return isHTTPUpdating;
}
