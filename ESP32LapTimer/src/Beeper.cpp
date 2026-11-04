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

#ifdef BEEPER

#define BEEP_MAX_QUEUE 4

static queue_t beep_queue;
static pattern_t* beep_queue_data[BEEP_MAX_QUEUE];

static pattern_t* current_pattern = NULL;
static uint32_t start_time = 0;
static uint8_t repeat_count = 0;

// Off until something asks for it. A timer that starts beeping the moment it
// powers up is a nuisance on the bench and at a start line.
static bool sound_enabled = false;

void beeper_set_enabled(bool enabled) {
  sound_enabled = enabled;
  if(!enabled) {
    // Drop whatever is queued and shut the buzzer up immediately.
    while(queue_dequeue(&beep_queue) != NULL) {}
    current_pattern = NULL;
    digitalWrite(BEEPER, LOW);
  }
}

bool beeper_is_enabled() {
  return sound_enabled;
}

void beeper_add_to_queue(const pattern_t* pattern) {
  if(!sound_enabled) return;
  queue_enqueue(&beep_queue, (void*)pattern);
}

void beeperUpdate() {
  // currently playing one pattern
  if(current_pattern) {
    if(millis() - start_time < current_pattern->on_time) {
      digitalWrite(BEEPER, HIGH);
    }
    // off_time is the length of the silence, so the pattern's period is
    // on_time + off_time. Comparing against off_time alone made every repeat
    // end the moment the tone did, so a double beep came out as one long one.
    else if (millis() - start_time < (uint32_t)current_pattern->on_time + current_pattern->off_time) {
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

#endif // BEEPER
