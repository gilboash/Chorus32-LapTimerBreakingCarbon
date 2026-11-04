#!/bin/bash
#
# Talk to the timer while the Mac is joined to its access point.
#
# Joining Chorus32_naco_XXXX costs the Mac its internet connection, which also
# cuts off any assistant session running on it. So this script does a whole
# round of work unattended and writes everything to a log that can be read
# afterwards, once the Mac is back on a network with internet.
#
#   ./tools/timer.sh probe    read-only: version, debug state, lap info
#   ./tools/timer.sh flash    probe, then OTA firmware.bin and spiffs.bin
#
# Run it from a normal Terminal window, not from inside the assistant.

set -u

TIMER=${TIMER:-192.168.4.1}
MODE=${1:-probe}
HERE=$(cd "$(dirname "$0")/.." && pwd)
BINS="$HERE/../release_bins/V3"
LOG="$HERE/tools/timer-session.log"

exec > >(tee "$LOG") 2>&1

say() { printf '\n=== %s ===\n' "$*"; }

say "started $(date)"
echo "timer   : $TIMER"
echo "mode    : $MODE"
echo "binaries: $BINS"

say "wifi"
networksetup -getairportnetwork en0 2>/dev/null || echo "(unknown)"

say "waiting for the timer (up to 30s)"
reachable=no
for i in $(seq 1 15); do
    if curl -s -m 2 -o /dev/null "http://$TIMER/"; then reachable=yes; break; fi
    sleep 2
done
if [ "$reachable" != yes ]; then
    echo "NOT REACHABLE at $TIMER."
    echo "Check the Mac is joined to the Chorus32 network and the timer is powered."
    exit 1
fi
echo "reachable after ~$((i*2))s"

dump() {
    say "GET /version"
    curl -s -m 5 "http://$TIMER/version" | python3 -m json.tool 2>/dev/null \
        || echo "(no /version - firmware predates it)"

    say "GET /debug"
    curl -s -m 5 "http://$TIMER/debug" | python3 -m json.tool 2>/dev/null \
        || echo "(no /debug - firmware predates it)"
}

dump

if [ "$MODE" != flash ]; then
    say "done (probe only). Log: $LOG"
    exit 0
fi

upload() {
    local file=$1 name size magic
    name=$(basename "$file")
    [ -f "$file" ] || { echo "MISSING: $file"; return 1; }
    size=$(wc -c < "$file" | tr -d ' ')
    magic=$(xxd -l1 -p "$file")

    say "uploading $name ($size bytes, first byte 0x$magic)"
    # Mirror the firmware's own rule so a doomed upload is never started:
    # 0xE9 means an app image, anything else must be named *spiffs*.
    if [ "$magic" != e9 ] && [[ "$name" != *spiffs* ]]; then
        echo "REFUSING: not an app image and the name lacks 'spiffs'"
        return 1
    fi

    curl -s --max-time 240 \
         -F "update=@${file};filename=${name}" \
         -w 'HTTP %{http_code} in %{time_total}s\n' \
         "http://$TIMER/update"

    echo "waiting for restart..."
    for n in $(seq 1 45); do
        sleep 2
        if curl -s -m 3 -o /dev/null "http://$TIMER/version"; then
            echo "back after ~$((n*2))s"
            return 0
        fi
    done
    echo "did not answer /version within 90s"
    echo "If the web UI is gone, open http://$TIMER/ for the recovery form."
    return 1
}

# Firmware first: the fixed recovery page lives in the new firmware, so if the
# filesystem upload then fails it can still be retried from a browser.
if ! upload "$BINS/firmware.bin"; then
    say "firmware upload did not complete - NOT touching the filesystem"
    echo "The timer keeps running its previous firmware until one is written whole."
    exit 1
fi

if ! upload "$BINS/spiffs.bin"; then
    say "filesystem upload did not complete"
    exit 1
fi

say "after flashing"
dump

say "done. Log: $LOG"
echo "Rejoin your normal wifi, then the log can be read back."
