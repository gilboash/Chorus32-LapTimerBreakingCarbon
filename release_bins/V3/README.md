# V3 — firmware 3.0.0

Built from commit `726b2e6`, board target `BOARD_MICRO32`.

| File | Flash offset | Purpose |
|---|---|---|
| `firmware.bin` | `0x10000` | the program |
| `spiffs.bin` | `0x3D0000` | the web interface |

## Updating over wifi (no cable)

Join the timer's network, open its page, go to **Update**, and upload the two
files **in this order**:

1. `firmware.bin` — the timer restarts
2. `spiffs.bin` — the timer restarts

Order matters. The fixed recovery page is part of the *new* firmware, so
installing it first means a failed filesystem upload can still be retried from
the browser. The other way round, a failed filesystem upload leaves the old
firmware's broken recovery route and needs a serial cable.

Between the two steps the timer runs new firmware behind the old pages. That
is expected; the Update page reports both versions and warns while they differ.

## Updating over serial

Use `esp32flasher/naco_chorus32_flasher.py` and point it at these two files.

`bootloader.bin`, `partitions.bin` and `ota_data_initial.bin` are not included
because they are unchanged since V2 and are only needed on a chip that has
never been flashed. Take those from `../V2/` if you need them — the partition
table is identical, which is also why V1 and V2 units can update over wifi.

## Notes for this release

- The buzzer and receiver multiplexing both now default to **off**. Multiplexing
  time-shared one receiver across several pilots and credited mistimed samples
  to the wrong one, which showed up as a pilot scoring another's laps.
- With multiplexing off, a pilot enabled beyond the receiver count gets no
  receiver and is not timed. The race page warns when that happens.
