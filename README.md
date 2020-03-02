# Chorus32-ESP32Laptimer

Some notes on using this fork:
 * Bluetooth is enabled by default, so you'll need to change the partition scheme to "HUGE APP" or something similar, so the sketch fits
 * Currently the initial power state of the modules is off, if the voltage reading is below 6V (this is to protect my already weak USB-Port during developement with multiple modules)
 * The module will always report 8 pilots. If the number of activated pilots is greater than the number of modules, multiplexing is enabled. If the number is lower the unsused modules are powered down. You can disable multiplexing for specific pilots on the settings page
 * EEPROM will be saved after a max of 10 sec
 * I'll regularly rebase and force push this branch ;)

This fork adds (mostly backend):
 * Mutliplexing modules. Reduces the accuracy, but is the only option if you want to go cheap and small
 * OLED page with lap times
 * Support for LoRa
 * Support for using a TCP connection. This should improve the connection quality (needs my fork of the app)
 * Some other changes I don't remember
 * Almost entirely usable without the app. Navigate to http://192.168.4.1/laptimes.html for in browser lap times. If your system supports text to speech the lap times will be spoken (for Linux speech-dispacher is responsible. You can test it with "spd-say 'hello world'")
 * Currently testing new peak detection method. See the wiki for some test results.
   * Compile with "DEBUG_SIGNAL_LOG" enabled, to print out (using USB) the last second of data after a lap has finished (this blocks the esp for a short while, so this is strictly used for data collection)
 * Much faster webinterface. Changing the settings is now much easier just enter a new value and be done. Green outline means the value is confirmed by the timer, orange means we are still waiting for a confirmation
    * You'll need to download  https://github.com/me-no-dev/ESPAsyncWebServer and https://github.com/me-no-dev/AsyncTCP as a .zip and add them in the Arduino IDE with "Sketch -> Include Library -> Add .ZIP Library..."

TODO:
 * Add race times to OSD (not sure how useful this will be, but I'll at least implement it)
 * Maybe support for checkpoints
 * Make useable without app
   * Continous mode
   * Statistics

This is an ESP32 port of the popular Chorus RF laptimer (https://github.com/voroshkov/Chorus-RF-Laptimer). Using an ESP32 provides much more processing power than AVR based Arduino boards and also has built in Wifi and Bluetooth networking simplifying connectivity options.

Compared to the original ChorusRF Lamptimer this ESP32 version only requires one RX module per pilot and a single ESP32 (nodemcu or similar) board. This allows you to connect your Lap timer wirelessly with no extra hardware required. However, due to ADC constraints, we are limited to 6 pilots per device.

Hardware construction is also simplified as both parts are 3.3v logic and there is no need for level shifting or resistors.

[Click HERE for a video showing the full setup process to get Chorus32 running on your ESP32 using Arduino IDE.](https://www.youtube.com/watch?v=ip2HUVk_lMs).

[Click Here for German version Part 1](https://www.youtube.com/watch?v=z8xTfuLECME) [Part 2](https://www.youtube.com/watch?v=7wl0CgA8YnM).

Updates:
-----
*Important Notice for Chorus32 users!!!:*

As of last commit the default pinout has been changed to match that of the PCBs currently being tested.

For anyone that has built a Chorus32 with original schematics do not worry, your unit will continue working with future updates. However you must change `#define BOARD BOARD_DEFAULT` to `#define BOARD BOARD_OLD` in 'HardwareConfig.h' when compiling.

Added OLED and VBAT measurement support
Auto RSSI threshold setup is also not implemented, just set thresholds manually for now.

Added inital webserver configuration portal
https://www.youtube.com/watch?v=BVd2t0yO_5A/0.jpg

Application Support:
-----
Chorus32 communicates using the Chorus RF Laptimer API, which is supported by LiveTime.

LiveTime is an incredibly powerful and feature-rich timing system which runs on Windows. It is, however, quite complex, and likely overkill for most users.

More information can be found here: https://www.livetimescoring.com/

If you are looking for a simpler setup, you can also use the Chorus RF Lap Timer app available for:

Android: https://play.google.com/store/apps/details?id=app.andrey_voroshkov.chorus_laptimer

iOS: https://itunes.apple.com/us/app/chorus-rf-laptimer/id1296647206?mt=8

Serial to UDP bridge.
-----

To use this wirelessly with livetime you must use a third party application to a bridge vitural serial port with the UDP connection to the timer. The native ethernet TCP mode does not work at the moment. You can use this free application https://www.netburner.com/download/virtual-comm-port-driver-windows-xp-10/?fbclid=IwAR2W9V_YzjuP5_u9U-nJx1x38beFWNR0eRI59QOyYO_-NSePmTnW14kk7yA

Configure it like this:

![alt text](img/vcommport.png)

Hardware:
-----
Construction is easy and only requires some basic point to point wiring of each module to the ESP32 board.

See HardwareConfig.h for pin assignments, it is possible to change any pin assignments apart from ADC channels. Note that pin assignments are GPIO hardware pin numbers and not pin numbers specific to the particular ESP32 development board you may be using.

PCB designs are currently being tested

![alt text](img/PCBv1.jpg)

![alt text](pcb/JyeSmith/PCBV2/Schematic_V2.png)

Performance:
-----
The Chorus32 Lap timer was compared to the $600USD ImmersionRC LapRF 8-Way at a local indoor event, arguably the worst conditions due to multipath and reflections. Results are presented below, you can see that the Chorus32 very closely matches the measured lap times of the LapRF.

![alt text](img/Comparison1.png)
![alt text](img/Comparison2.png)

## Compiling the project using platformio

## Installing
 TODO

## Compiling and uploading

### IDE
TODO

### CLI
To upload the code to your timer just run
```
pio run -e <your board> -t upload
pio run -e <your board> -t uploadfs
```
Insert the board you are using, which is probably `BOARD_DEFAULT`. To list all valid targets just insert some random string as the board (sorry, I have no idea on how to list them properly).

To update using the webpage, run the same commands (and ignore the errors about a failed connection). The path to the file you upload should now be `<project dir>/.pio/build/<BOARD NAME>/firmware.bin`.

## Compiling the Project using the Arduino IDE (the old way):

#### Add esp32 to the Arduino IDE

Navigate to "File -> Preferences" and add "https://dl.espressif.com/dl/package_esp32_index.json" to "Additional Boards Manager URLs". If there is already an entry, just separate them with a ",".

Now navigate to "Tools -> Board -> Boards Manager..." search for "esp32" and click install.

#### Data Upload

To upload the files for the webpage you'll need to download https://github.com/me-no-dev/arduino-esp32fs-plugin/releases/ and extract it in "<Your Arduino install folder>/tools/". So that you end up with a folder called "ESP32FS" which has a folder "tool" inside of it.

#### Libraries

First head to "Sketch -> Include Library -> Manage Libraries" and search for "adafruit ina219" and "ssd1306 esp32" and install them both.
Now head to https://github.com/me-no-dev/ESPAsyncWebServer and https://github.com/me-no-dev/AsyncTCP and click on "Clone or download -> Download ZIP".
In the Arduino IDE nagivate to "Sketch -> Include Library -> Add .ZIP Library" and add them both.

#### Flashing
Now hit the upload button (with an arrow to the right) to upload the code to the board. After that upload the webpage data by clicking on "Tools -> ESP32 Sketch Data Upload". This should be done on every update!

You can edit file "HardwareConfig.h" to specify your board type and for some advanced configuration.

Now hit the upload button (with an arrow to the right) to upload the code to the board. After that upload the webpage data by clicking on "Tools -> ESP32 Sketch Data Upload". This should be done on every update!

##### For this branch you'll also need to change the default board in HardwareConfig.h to "BOARD_DEFAULT"

#### Updating

For updates either follow the normal flashing procedure or use the web UI.
To use the web UI updater open your Arduino IDE and click the verify button (the most left one).
Depending on your operating system there is a folder named "arduino_build_\<some numbers\>" in:
  - Linux: /tmp
  - Windows: %AppData%
  - OSX: No idea, sorry

Inside that folder should be a file called "ESP32LapTimer.ino.bin", which can be uploaded in the web interface.


Library requirements:
-----
Adafruit_INA219 https://github.com/adafruit/Adafruit_INA219

ESP8266 AND ESP32 OLED DRIVER FOR SSD1306 DISPLAY https://github.com/ThingPulse/esp8266-oled-ssd1306
