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
#ifndef __COMMS_H__
#define __COMMS_H__

#include "HardwareConfig.h"

#include <stdint.h>
#include <esp_attr.h>

void HandleSerialRead();
void HandleServerUDP();
void SendCurrRSSIloop();
void IRAM_ATTR sendLap(uint8_t Lap, uint8_t NodeAddr, uint8_t espnow=0, uint8_t send_laps=0);
void commsSetup();
void thresholdModeStep();
void handleSerialControlInput(char *controlData, uint8_t  ControlByte, uint8_t NodeAddr, uint8_t length);
bool isInRaceMode();
void startRace();
void stopRace();
bool isExperimentalModeOn();
void sendCalibrationFinished();
void sendExtendedRSSI(uint8_t node, uint32_t time, uint16_t rssi);
void update_comms();

void SendVRxBand(uint8_t NodeAddr);
void SendVRxChannel(uint8_t NodeAddr);
void SendVRxFreq(uint8_t NodeAddr);

#define TRIGGER_NORMAL 0
#define TRIGGER_PEAK 1
uint8_t get_trigger_mode();

#endif // __COMMS_H__
