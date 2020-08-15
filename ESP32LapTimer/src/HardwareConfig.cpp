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
/////define Pins//////
#include "HardwareConfig.h"

#include <Arduino.h>

uint8_t CS_PINS[MAX_NUM_RECEIVERS] = {
  CS1,
#if 1 < MAX_NUM_RECEIVERS
  CS2,
#if 2 < MAX_NUM_RECEIVERS
  CS3,
#if 3 < MAX_NUM_RECEIVERS
  CS4,
#if 4 < MAX_NUM_RECEIVERS
  CS5,
#if 5 < MAX_NUM_RECEIVERS
  CS6
#endif
#endif
#endif
#endif
#endif
};

void InitHardwarePins() {

  pinMode(SCK, OUTPUT);
  pinMode(MOSI, OUTPUT);
  for(int i = 0; i < sizeof(CS_PINS); i++) {
    pinMode(CS_PINS[i], OUTPUT);
    digitalWrite(CS_PINS[i], HIGH);
  }
  //pinMode(MISO, INPUT);
#ifdef BEEPER
  pinMode(BEEPER, OUTPUT);
  digitalWrite(BEEPER, LOW);
#endif // BEEPER
}
