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
#include "Beeper.h"

#include "Timer.h"
#include "HardwareConfig.h"

#include <Arduino.h>

#define BEEP_MAX_QUEUE 4

static queue_t beep_queue;
static pattern_t* beep_queue_data[BEEP_MAX_QUEUE];

static pattern_t* current_pattern = NULL;
static uint32_t start_time = 0;
static uint8_t repeat_count = 0;

void beeper_add_to_queue(const pattern_t* pattern) {
  queue_enqueue(&beep_queue, (void*)pattern);
}

void beeperUpdate() {
  // currently playing one pattern
  if(current_pattern) {
    if(millis() - start_time < current_pattern->on_time) {
      digitalWrite(BEEPER, HIGH);
    }
    else if (millis() - start_time < current_pattern->off_time) {
      digitalWrite(BEEPER, LOW);
    }
    else { // pattern end
      ++repeat_count;
      start_time = millis();
      if(repeat_count >= current_pattern->repeat) {
        current_pattern = NULL;
      }
    }
  }
  else {
    // get new pattern
    current_pattern = (pattern_t*)queue_dequeue(&beep_queue);
    start_time = millis();
    repeat_count = 0;
  }
}


void beeper_init() {
  beep_queue.curr_size = 0;
  beep_queue.max_size = BEEP_MAX_QUEUE;
  beep_queue.data = (void**)beep_queue_data;
}
