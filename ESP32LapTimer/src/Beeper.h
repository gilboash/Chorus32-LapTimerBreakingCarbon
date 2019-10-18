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
#ifndef __BEEPER_H__
#define __BEEPER_H__

#include <stdint.h>

#include "Queue.h"

typedef struct pattern_s{
  uint16_t on_time;
  uint16_t off_time;
  uint8_t repeat;
} pattern_t;

const pattern_t BEEP_SINGLE = {50, 50, 1};
const pattern_t BEEP_DOUBLE = {50, 50, 2};
const pattern_t BEEP_FIVE = {50, 50, 5};
const pattern_t BEEP_CHIRPS = {10, 10, 6};

void beeper_add_to_queue(const pattern_t* pattern = &BEEP_SINGLE);
void beeperUpdate();
void beeper_init();


#endif // __BEEPER_H__
