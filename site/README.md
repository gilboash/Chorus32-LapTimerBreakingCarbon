# Project site

The public landing page and guides for the Breaking Carbon Chorus32 lap timer.

Plain static files. No build step, no framework, no package manager, nothing to
install — the same discipline as the timer's own web UI, for the same reason:
one less thing that can rot between releases.

```
site/
  index.html        landing page
  build.html        hardware: PCB choice, BOM, assembly
  install.html      flashing over FTDI, then updates over WiFi
  race-day.html     setup, thresholds, running a round, the Android app
  downloads.html    firmware, flasher, APK, PCB files
  assets/css/       one stylesheet
  assets/js/        theme toggle, deferred YouTube embed, nav highlighting
  assets/img/       photos, screenshots
```

## Running it locally

```sh
cd site
python3 -m http.server 8099
```

Then open <http://127.0.0.1:8099/>.

Opening `index.html` straight off the disk works too, but serving it is closer
to the real thing.

## Deploying

Copy the folder to any static host — nginx, Caddy, S3, Netlify, Cloudflare
Pages. There is nothing to configure and no server-side anything.

**On GitHub Pages**, note that Pages can only publish from the repository root
or from a folder called `docs/`. To use it, either rename this folder to
`docs/`, or publish from a branch whose root *is* this folder. The repository
root also has a `_config.yml` selecting a Jekyll theme; if Pages ever starts
processing these files, add an empty `.nojekyll` file here to turn that off.

## Where the content comes from

The guides restate what is already in the repository, so when any of this
changes the page has to change with it:

| Page | Follows |
|---|---|
| `build.html` | `pcb/AaronSmith/PCB V2/readme.md` and `bom.md`, `pcb/JyeSmith/*/readme.md` |
| `install.html` | `esp32flasher/README`, `release_bins/V3/README.md`, the flash offsets in `esp32flasher/naco_chorus32_flasher.py` |
| `race-day.html` | the timer's own pages in `ESP32LapTimer/data_src/` |
| `downloads.html` | file sizes and paths under `release_bins/`, `pcb/`, `Android sandbox/` |

Downloads link to `github.com/gilboash/Chorus32-LapTimerBreakingCarbon/raw/dev/…`
rather than carrying copies, so binaries are never duplicated and never go
stale. If the default branch is ever renamed, those URLs need updating.

## Things to know before editing

- **The video posters are local files**, not `i.ytimg.com` URLs, so the page
  makes no request to YouTube until a visitor presses play. Changing a video
  means changing the id in two places (`data-video` and the "Open on YouTube"
  href) and dropping a new 16:9 poster in `assets/img/`.
- **The id in the root `README.md` (`qDBn3r2yoy8`) is dead** — 404 from
  YouTube's oEmbed endpoint, no thumbnail at any size. The site uses
  `dDGj_28wDJ0` (the build) and `p0HdgJ5Kaas` (the V3 web upgrade) instead.
  The root README still points at the dead one.
- **No print files are hosted here.** `build.html#case` and
  `downloads.html#print` link out to a printable box on Thingiverse
  (`thing:5164793`) and say plainly that nothing lives under `pcb/`. Drop an
  STL or STEP in there and link it from both.
- **Off-site product links** (the Thingiverse box, the PIXLINK repeater on
  AliExpress) are the two places this site depends on someone else's listing
  staying up. Worth a check whenever you touch these pages.
- **Screenshots of the timer UI** (`assets/img/ui-race.jpg`,
  `ui-live.jpg`) were captured from `ESP32LapTimer/tools/mock_timer.py` at a
  420px viewport. Retake them the same way if the UI changes.
- Colour tokens are deliberately the same as `data_src/assets/css/bc.css`, so
  the site and the device look like one product. Change them together.
