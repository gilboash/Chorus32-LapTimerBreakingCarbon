# Development tools

## mock_timer.py

A fake Chorus32 timer, so the web interface can be worked on without hardware.

It serves `data_src/` over HTTP and speaks enough of the Chorus ASCII protocol
over a websocket to drive every page: settings on request, a live RSSI stream
with gate-pass spikes, simulated laps, and the `/version` endpoint.

```sh
python3 tools/mock_timer.py data_src 8080
# then open http://127.0.0.1:8080
```

Standard library only, so there is nothing to install.

Two things worth knowing:

- It serves `data_src/` directly, **not** the generated `data/`. That is
  deliberate: `data/` is gzipped in place by `prepare_data.py`, which a plain
  file server would hand to the browser still compressed.
- The simulated lap times are the real intervals between gate crossings, so
  they sum to elapsed race time. If you change that, the standings and the
  finishing order will stop agreeing and it will look like a bug in the page.

It is a test rig, not a simulator of the hardware: RSSI is plausible noise with
a bump as a lap approaches, not a model of anything.
