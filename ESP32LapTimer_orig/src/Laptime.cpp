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
#include "Laptime.h"

#include <stdint.h>
#include <Arduino.h>

#include "HardwareConfig.h"
#include "settings_eeprom.h"
#include "Comms.h"

struct lap_data {
  uint32_t lap_times[MAX_LAPS_NUM];
  uint8_t last_lap_sent;
  uint8_t lap_counter; // Keep track of what lap we are up too
  uint8_t best_lap_num;
};
struct lap_data LapTimes[MAX_NUM_PILOTS];

static uint32_t MinLapTime = 5000;  //this is in millis
static uint32_t start_time = 0;
static uint8_t count_first_lap = 0; // 0 means start table is before the laptimer, so first lap is not a full-fledged lap (i.e. don't respect min-lap-time for the very first lap)
static uint16_t race_num = 0; // number of races

int increaseCurrentLap(struct lap_data * data);

void resetLaptimes() {
  memset(LapTimes, 0, sizeof(LapTimes));

#if 0
  // Debug!
  for (uint32_t iter = 1; iter <= 16; iter++) {
    uint32_t tmp = iter*4;
    LapTimes[1].lap_times[iter] = (60u*tmp + tmp) * 1000 + tmp;
    LapTimes[1].lap_counter = iter;
  }
  LapTimes[1].last_lap_sent = LapTimes[1].lap_counter;
#endif
}

void sendNewLaps() {
  struct lap_data * data;
  uint8_t i, j;
  for (i = 0; i < MAX_NUM_PILOTS; i++) {
    data = &LapTimes[i];
#if 1 // Send order fixed
    j = data->last_lap_sent;
    for (j = (j ? j : 1); j <= data->lap_counter && j <= MAX_LAPS_NUM; j++) {
      sendLap(j, i, true);
    }
    data->last_lap_sent = j;
#else
     // This sends laps in descendign order
    int laps_to_send = data->lap_counter - data->last_lap_sent;
    if(laps_to_send > 0) {
      for(j = 0; j < laps_to_send && j <= MAX_LAPS_NUM; j++) {
        sendLap(data->lap_counter - j, i, true);
      }
      data->last_lap_sent += laps_to_send;
    }
#endif
  }
}

uint32_t getLaptime(uint8_t receiver, uint8_t lap) {
  if (receiver < MAX_NUM_PILOTS && lap < MAX_LAPS_NUM) {
    return LapTimes[receiver].lap_times[lap];
  }
  return 0;
}


uint32_t getLaptime(uint8_t receiver) {
  return getLaptime(receiver, getCurrentLap(receiver));
}

uint32_t getLaptimeRel(uint8_t receiver, uint8_t lap) {
  if(lap == 1) {
    return getLaptime(receiver, lap) - start_time;
  } else if(lap == 0) {
    return 0;
  }
  uint32_t lap_time = getLaptime(receiver, lap);
  uint32_t prev_lap_time = getLaptime(receiver, lap - 1);
  if(lap_time < prev_lap_time) {
    Serial.printf("Prev lap > current lap!!!! prev: %d curr: %d curr#: %d curr call: %d\n", prev_lap_time, lap_time, lap, getLaptime(receiver, lap));
  }
  return getLaptime(receiver, lap) - getLaptime(receiver, lap - 1);
}

uint32_t getLaptimeRelToStart(uint8_t receiver, uint8_t lap) {
  return getLaptime(receiver, lap) - start_time;
}

uint32_t getLaptimeRel(uint8_t receiver) {
  return getLaptimeRel(receiver, getCurrentLap(receiver));
}

uint8_t addLap(uint8_t receiver, uint32_t time) {
  struct lap_data * data = &LapTimes[receiver];
  int lap_num = increaseCurrentLap(data);
  if (0 > lap_num) {
    return 0; // just don't add any more laps, so other pilots still get their time
  }
  data->lap_times[lap_num] = time;
  if ((getLaptimeRel(receiver) < getLaptimeRel(receiver, data->best_lap_num) ||
      getLaptimeRel(receiver, data->best_lap_num) == 0)) {
    // skip best time if we skip the first lap
    if(!(lap_num == 1 && !count_first_lap)) {
      data->best_lap_num = lap_num;
    }
  }
  return lap_num;
}

uint8_t getBestLap(uint8_t receiver) {
  return LapTimes[receiver].best_lap_num;
}

uint32_t getMinLapTime() {
  return MinLapTime;
}

void setMinLapTime(uint32_t time) {
  MinLapTime = time;
}

uint8_t getCurrentLap(uint8_t receiver) {
  if (receiver < MAX_NUM_PILOTS)
    return LapTimes[receiver].lap_counter;
  return MAX_LAPS_NUM;
}
int increaseCurrentLap(struct lap_data * data) {
  uint8_t lap = data->lap_counter + 1;
  if (lap >= MAX_LAPS_NUM) {
    return -1; // just don't add any more laps, so other pilots still get their time
  }
  data->lap_counter = lap;
  return lap;
}

void startRaceLap() {
  resetLaptimes();
  start_time = millis();
  ++race_num;
}

void setCountFirstLap(uint8_t shouldWaitForFirstLap) {
  count_first_lap = shouldWaitForFirstLap;
}

uint8_t getCountFirstLap() {
  return count_first_lap;
}

uint16_t getRaceNum() {
  return race_num;
}
