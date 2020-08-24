#include "Espnow.h"
#include "msp.h"
#include "msptypes.h"
#include "Output.h"
#include "HardwareConfig.h"
#include "ADC.h"
#include "RX5808.h"
#include "Comms.h"

#include <Arduino.h>
#include <esp_now.h>

MSP msp_parser;

static void esp_now_recv_cb(const uint8_t *mac_addr, const uint8_t *data, int data_len)
{
  int iter;
  bool msp_rcvd = 0;

  /* No data or peer is unknown => ignore */
  if (!data_len || !esp_now_is_peer_exist(mac_addr))
    return;

  Serial.printf("ESP NOW: ");

  msp_rcvd = msp_parser.processReceivedByte(data[0]);

  // Check if message is MSP
  for (iter = 1; (iter < data_len) && (msp_rcvd == 0) && msp_parser.mspOngoing(); iter++) {
    msp_rcvd = msp_parser.processReceivedByte(data[iter]);
  }

  // Only MSP packet or laptime is expected
  if (msp_rcvd) {
    /* Process the received MSP packet */
    mspPacket_t &msp_in = msp_parser.getPacket();
    if (msp_in.type == MSP_PACKET_V2_COMMAND && msp_in.function == MSP_SET_VTX_CONFIG) {
      Serial.print("MSP_SET_VTX_CONFIG, channel: ");

      uint8_t * payload = (uint8_t*)msp_in.payload;

      uint16_t freq = payload[1];
      freq <<= 8;
      freq += payload[0];

      uint8_t index = getFreqIndexByFrequency(freq);
      uint8_t band = index / 8, NodeAddrByte = 0;
      uint8_t channel = index % 8;

      // Set channel to RF module
      setPilotBandChannel(NodeAddrByte, band, channel);
      // Send info to all clients
      SendVRxBand(NodeAddrByte);
      SendVRxChannel(NodeAddrByte);
      SendVRxFreq(NodeAddrByte);

      Serial.println(channel);
    } else {
      Serial.println(" UNKNOWN MSP!");
    }
  } else if (strnlen((char*)data, 100) < 100) {
    /* Race control command */
    Serial.print("command: '");
    Serial.print((char*)data);
    Serial.println("'");

    // TODO: handle incomming command!
    output_input_callback((uint8_t*)data, data_len);

  } else {
    Serial.println(" UNKNOWN command!");
  }

  msp_parser.markPacketFree();
}


void espnow_init(uint8_t if_type)
{
#if defined(ESP_NOW_PEERS)
    /*
    STA MAC Address: F0:08:D1:D4:ED:7C
    AP MAC Address: F0:08:D1:D4:ED:7D
    */

    Serial.print("Initialize ESP-NOW... ");
    if (esp_now_init() == ESP_OK) {
        esp_now_register_recv_cb(esp_now_recv_cb);

        esp_now_peer_info_t peer_info = {
            .peer_addr = {0},
            .lmk = {0},
            .channel = 1,
            .ifidx = (wifi_interface_t)if_type,
            .encrypt = 0,
            .priv = NULL
        };
        uint8_t peers[][ESP_NOW_ETH_ALEN] = ESP_NOW_PEERS;
        uint8_t num_peers = sizeof(peers) / ESP_NOW_ETH_ALEN;
        for (uint8_t iter = 0; iter < num_peers; iter++) {
        memcpy(peer_info.peer_addr, peers[iter], ESP_NOW_ETH_ALEN);
        if (ESP_OK != esp_now_add_peer(&peer_info))
            Serial.println("ESPNOW add peer failed!");
        }

        Serial.println("DONE");

    } else {
        Serial.println("ESPNOW init failed!");
    }
#endif // ESP_NOW_PEERS
}


void espnow_sendPacket(void* output, uint8_t* data, size_t len)
{
    // not used at the moment
    esp_now_send(NULL, data, len);
}


void espnow_update(void* output)
{
    // not used at the moment
}
