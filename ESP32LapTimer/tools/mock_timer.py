#!/usr/bin/env python3
"""A fake Chorus32 timer, so the web UI can be developed without hardware.

Serves data_src over HTTP and speaks enough of the Chorus ASCII protocol over
a websocket to drive the pages: settings on request, a live RSSI stream, and
simulated laps. Standard library only (no websockets package available here),
so the frame handling is hand-rolled but only needs to cover text frames.

Usage: python3 mock_timer.py <data_src dir> [port]
"""

import base64
import hashlib
import json
import os
import random
import socket
import struct
import sys
import threading
import time

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

NUM_PILOTS = 8
ACTIVE = [True, True, True, True, True, True, False, False]
BANDS = [0, 0, 0, 0, 0, 0, 0, 0]
CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7]
THRESHOLDS = [180] * NUM_PILOTS  # as sent, i.e. raw/12
MIN_LAP_S = [10]  # whole seconds, as CONTROL_MIN_LAP_TIME carries it

MIME = {
    ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4",
}


def hx(value, digits):
    return format(value & ((1 << (digits * 4)) - 1), "0{}X".format(digits))


class Client(threading.Thread):
    def __init__(self, conn, root):
        super().__init__(daemon=True)
        self.conn = conn
        self.root = root
        self.alive = True
        self.race_on = False
        self.race_num = 1
        self.lap = [0] * NUM_PILOTS
        self.interval = 0
        self.last_cross = [time.time()] * NUM_PILOTS

    # ---------- websocket framing ----------

    def send_text(self, text):
        payload = text.encode()
        header = bytes([0x81])
        length = len(payload)
        if length < 126:
            header += bytes([length])
        elif length < (1 << 16):
            header += bytes([126]) + struct.pack(">H", length)
        else:
            header += bytes([127]) + struct.pack(">Q", length)
        try:
            self.conn.sendall(header + payload)
        except OSError:
            self.alive = False

    def read_frame(self):
        def recv_exactly(n):
            buf = b""
            while len(buf) < n:
                chunk = self.conn.recv(n - len(buf))
                if not chunk:
                    return None
                buf += chunk
            return buf

        header = recv_exactly(2)
        if header is None:
            return None
        opcode = header[0] & 0x0F
        masked = header[1] & 0x80
        length = header[1] & 0x7F
        if length == 126:
            length = struct.unpack(">H", recv_exactly(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", recv_exactly(8))[0]
        mask = recv_exactly(4) if masked else None
        payload = recv_exactly(length) if length else b""
        if payload is None:
            return None
        if mask:
            payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        if opcode == 0x8:
            return None
        return payload.decode(errors="replace")

    # ---------- protocol ----------

    def send_all_settings(self):
        for node in range(NUM_PILOTS):
            self.send_text("S{}A{}\n".format(hx(node, 1), 1 if ACTIVE[node] else 0))
            self.send_text("S{}B{}\n".format(hx(node, 1), hx(BANDS[node], 1)))
            self.send_text("S{}C{}\n".format(hx(node, 1), hx(CHANNELS[node], 1)))
            self.send_text("S{}T{}\n".format(hx(node, 1), hx(THRESHOLDS[node], 4)))
        self.send_text("S0M{}\n".format(hx(MIN_LAP_S[0], 2)))
        self.send_text("S0R{}\n".format(1 if self.race_on else 0))
        self.send_text("S0v{}\n".format(hx(int(12.4 / 11 * (1024 / 5)), 4)))

    def send_extended_settings(self):
        self.send_text("ES*R{}\n".format(hx(self.race_num, 2)))
        self.send_text("ES*M{}\n".format(hx(4, 1)))
        self.send_text("ES*H{}\n".format(hx(142000, 8)))

    def handle(self, line):
        line = line.strip()
        if not line:
            return
        if line.startswith("ER*a"):
            self.send_extended_settings()
        elif line.startswith("R*a"):
            self.send_all_settings()
        elif line.startswith("ES*y"):
            self.interval = int(line[4:8], 16)
        elif line.startswith("R*r"):
            # Current RSSI per node, already divided by 12 by the firmware.
            for node in range(NUM_PILOTS):
                value = random.randint(70, 140) if ACTIVE[node] else 0
                self.send_text("S{}r{}\n".format(hx(node, 1), hx(value, 4)))
        elif line.startswith("R*v"):
            self.send_text("S0v{}\n".format(hx(int(12.4 / 11 * (1024 / 5)), 4)))
        elif line.startswith("ER*H"):
            self.send_text("ES*H{}\n".format(hx(random.randint(138000, 146000), 8)))
        elif line.startswith("R*R"):
            self.race_on = line[3] == "1"
            if self.race_on:
                self.race_num += 1
                self.lap = [0] * NUM_PILOTS
                self.last_cross = [time.time()] * NUM_PILOTS
                self.send_text("ES*R{}\n".format(hx(self.race_num, 2)))
            for node in range(NUM_PILOTS):
                self.send_text("S{}R{}\n".format(hx(node, 1), 1 if self.race_on else 0))
        elif line.startswith("R*M"):
            if len(line) >= 5:
                value = int(line[3:5], 16)
                if 1 <= value <= 120:  # firmware clamps the same way
                    MIN_LAP_S[0] = value
            self.send_text("S0M{}\n".format(hx(MIN_LAP_S[0], 2)))
        elif len(line) >= 7 and line[0] == "R" and line[2] == "T":
            node = int(line[1], 16)
            THRESHOLDS[node] = int(line[3:7], 16)
            self.send_text("S{}T{}\n".format(hx(node, 1), hx(THRESHOLDS[node], 4)))
        elif len(line) >= 4 and line[0] == "R" and line[2] == "A":
            node = int(line[1], 16)
            ACTIVE[node] = line[3] == "1"
            self.send_text("S{}A{}\n".format(hx(node, 1), line[3]))

    # ---------- simulation ----------

    def simulate(self):
        start = time.time()
        phase = [random.random() * 6.28 for _ in range(NUM_PILOTS)]
        next_lap = [start + 6 + random.random() * 6 for _ in range(NUM_PILOTS)]
        self.last_cross = [start for _ in range(NUM_PILOTS)]
        last_rssi = 0.0

        while self.alive:
            now = time.time()
            elapsed_ms = int((now - start) * 1000)

            if self.interval > 0 and (now - last_rssi) * 1000 >= self.interval:
                last_rssi = now
                for node in range(NUM_PILOTS):
                    if not ACTIVE[node]:
                        continue
                    # Noise floor with a gate-pass bump as a lap approaches.
                    base = 900 + 180 * random.random() + 120 * (node % 3)
                    to_lap = next_lap[node] - now
                    if abs(to_lap) < 0.9:
                        base += 2100 * (1 - abs(to_lap) / 0.9) ** 2
                    base += 90 * (1 + __import__("math").sin(elapsed_ms / 700.0 + phase[node]))
                    self.send_text("ES{}y{}{}\n".format(
                        hx(node, 1), hx(elapsed_ms, 8), hx(int(base), 4)))

            if self.race_on:
                for node in range(NUM_PILOTS):
                    if ACTIVE[node] and now >= next_lap[node]:
                        self.lap[node] += 1
                        # Report the lap that actually just elapsed, not a fresh
                        # random number. Otherwise reported lap times don't sum
                        # to real elapsed time and the standings legitimately
                        # disagree with the order laps arrived in.
                        lap_ms = int((now - self.last_cross[node]) * 1000)
                        self.last_cross[node] = now
                        self.send_text("S{}L{}{}\n".format(
                            hx(node, 1), hx(self.lap[node] - 1, 2), hx(lap_ms, 8)))
                        next_lap[node] = now + 6 + random.random() * 4
            else:
                for node in range(NUM_PILOTS):
                    if now >= next_lap[node]:
                        next_lap[node] = now + 10 + random.random() * 8

            time.sleep(0.005)

    # ---------- http ----------

    def serve_http(self, request):
        line = request.split("\r\n")[0]
        try:
            path = line.split(" ")[1].split("?")[0]
        except IndexError:
            return
        if path == "/":
            path = "/index.html"

        if path == "/version":
            body = json.dumps({
                "firmware": "3.0.0", "filesystem": "3.0.0", "match": True,
                "git": "mock", "built": "mock build", "api": "0004",
            }).encode()
            self.conn.sendall(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
            return

        local = os.path.join(self.root, path.lstrip("/"))
        if not os.path.isfile(local):
            self.conn.sendall(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
            return
        with open(local, "rb") as f:
            body = f.read()
        ctype = MIME.get(os.path.splitext(local)[1], "text/plain")
        self.conn.sendall(
            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n"
            .format(ctype, len(body)).encode() + body)

    def run(self):
        try:
            request = self.conn.recv(65536).decode(errors="replace")
        except OSError:
            return
        if not request:
            return

        key = None
        for header in request.split("\r\n"):
            if header.lower().startswith("sec-websocket-key:"):
                key = header.split(":", 1)[1].strip()

        if key is None:
            self.serve_http(request)
            self.conn.close()
            return

        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.conn.sendall(
            ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
             "Connection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n"
             .format(accept)).encode())

        threading.Thread(target=self.simulate, daemon=True).start()
        while self.alive:
            frame = self.read_frame()
            if frame is None:
                break
            for line in frame.split("\n"):
                self.handle(line)
        self.alive = False
        self.conn.close()


def main():
    root = os.path.abspath(sys.argv[1])
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", port))
    server.listen(16)
    print("mock chorus32 on http://127.0.0.1:{} serving {}".format(port, root))
    sys.stdout.flush()
    while True:
        conn, _ = server.accept()
        Client(conn, root).start()


if __name__ == "__main__":
    main()
