# ParkFNB live pilot — validation, configuration, deployment and rollback

Companion to `docs/pilot-baseline.md` (what the pilot was before this work). Everything marked **measured**
below was actually run; everything marked **not yet measured** needs the labelled recording described in §2.

## 1. What changed, in one page

| Area | Before | Now |
|---|---|---|
| Bay answer | seven internal states; tiles, map and legend counted them differently | one answer per bay: **Vacant / Occupied / Unclear / No signal** (`status.py`), and every number on the page comes from the same list (`slot_summary`; the four always add up to the total) |
| Night | detector sees nothing, "free" votes win, parked cars show as free | a dark picture (`light: low`) never frees a bay that holds a car, and a bay with no car seen shows **Unclear**, not Available; the page says "Night mode" |
| Camera offline / stalled / failing | last states frozen, still looked live | `stream_status` (live / stale / offline / error / not_started); after 15 s every bay is **No signal**, numbers dimmed, "last known" kept; one failed frame no longer stays in `error` forever |
| Camera moved | bays silently wrong | the live view is compared with a small reference taken when the bays were saved; a confident shift marks bays **Unclear** ("camera view changed") until the layout is re-saved. A weak match (night vs day) says nothing, so light changes cannot raise it |
| Car partly hidden by another car | counted as "occupied" in the old numbers, but drawn grey on the map | **Occupied**, reason "Partly hidden by another car" (a car is in the bay; only how it is parked cannot be judged). Not "Unclear" |
| Cars in shade | a white SUV in shadow scored 0.16 at the old detection size, below what the tracker needs, so its bay read empty | the live picture is shown to the detector at 960 px instead of 640 (`ANPR_LIVE_IMGSZ`): the same car scores 0.54, for about 70 ms more per picture |
| Held state | "Correct" shown next to "Slot is empty" | a held state keeps the details of the last reading that agreed with it |
| Flapping | a car arriving and the bay turning free within seconds | optional `ANPR_MIN_DWELL_S` (off by default) |
| Bay design | pixel-even split of a row; no corner drag, rename, delete, duplicate; page opened empty; no validation | projective row tool (near stalls wider than far ones, as painted); edit mode (drag corner / whole bay / arrow keys / rename / duplicate / delete); the saved layout and IN/OUT line load on open; layouts are checked before saving; every save keeps the layout it replaced (last 10) with a one-click restore; "Unsaved changes" marker |
| Optimizer import | obstacles and access lanes in a GeoJSON became bays | skipped |
| Public viewer | prototype look; numbers could disagree; no stale/offline states | camera-first layout, compact KPI cards with one-line definitions, selected-bay detail, health strip (stream, frame age, fps, latency, light, view), timeline incl. feed events, loading / empty / no-signal / unreachable states, backoff polling |
| Operator review | none | an admin can mark a bay Vacant / Occupied for up to 60 min; it ends early when the camera's own reading of that bay changes (`POST /live/bay-override`, private) |

| Activity log | events written to `live_logs/` inside the code folder, no way to read them | one log per camera in the data folder (`<data>/logs/<camera>-<date>.jsonl`, survives updates and rollbacks): every bay change (with the car), the first reading of each bay after a start, cars in/out, camera offline/back, too dark, camera view changed, operator answers, and a one-line occupancy sample every minute (`ANPR_LOG_SAMPLE_S`). The operator reads it at `/live/log` (filter by period, kind, bay) and downloads it as a CSV (`/live/log.csv`, opens in Excel). Older logs in `live_logs/` are still read |

Nothing was removed. Old fields (`bays`, `bay_summary`, `counts`, `online`, `age_s`, ...) are unchanged; new
fields were added next to them (`slots`, `slot_summary`, `stream_status`, `frame_age_s`, `fps_processed`,
`frame_seq`, `light`, `calibration`, `is_admin`). `GET /occupancy/bays` also returns `frame_size`, `saved_at`
and the IN/OUT `line`. `/live/frame.jpg` sends `X-Frame-Seq`.
Backend gate, booking and payment code (`services/backend`) was not touched.

## 2. How to measure accuracy (the part that needs footage)

No accuracy figure is claimed until this has been run on real footage. Do it once per camera position and again
whenever the mount, the lens, the bays or a threshold changes.

1. **Record** 20-30 minutes from the real camera at the real mount, covering: cars arriving and leaving, bays
   that stay empty, a car passing outside the bays, a car partly hidden by another, and a change of light
   (day to dusk, or lights coming on). Save as `.mp4`.
2. **Label what you are sure of** in a CSV (video seconds). Leave out the moments you are unsure about, for
   example while a car is still reversing into the bay:
   ```
   bay_id,start_s,end_s,state
   1,0,312,VACANT
   1,340,1210,OCCUPIED
   2,0,95,OCCUPIED
   2,120,1210,VACANT
   ```
   Two people labelling the same video and comparing is better than one.
3. **Replay** it into a local server that has the same bays saved (`/occupancy?camera=<id>`):
   ```
   python test_fixtures/replay_live.py recording.mp4 --camera <id> --record run.jsonl
   ```
   One frame a second is sent, the same rate as the real camera. `--record` writes what the system said about every
   bay after each frame was processed.
4. **Score it:**
   ```
   python tools/eval_pilot.py --truth truth.csv --log run.jsonl --md report.md --json report.json
   ```
   Paste `report.md` into §3.

What the tool reports (positive class = Occupied; "undecided" = Unclear or No signal):

| Measure | Meaning |
|---|---|
| Precision | of the bays reported Occupied, how many really were |
| Recall | of the bays really Occupied, how many were reported so; undecided readings count as missed |
| Recall among decided | the same, ignoring the moments the system declined to answer |
| False occupied / false vacant | seconds an empty bay was reported occupied / a car-holding bay reported vacant (the dangerous one) |
| Undecided share | how often the system said "I cannot tell" (honest, but a bay that is always Unclear is useless) |
| Change latency, median / p90 | seconds from a real change to the system reporting it and keeping it for 3 readings; changes never reported are counted |
| Stream uptime | share of recorded frames where the stream was live |
| Inference | ms per frame, median / p90 |

Replaying one video through the server measures the *pipeline*. Stream uptime and reconnection over weeks can
only be measured on the live camera: read `stream_status`, `frame_age_s` and the timeline events
(`feed_offline` / `feed_online`, also written to `live_logs/<camera>-<date>.jsonl`).

## 3. Results

**Accuracy on labelled footage: not yet measured.** No labelled recording of the pilot site exists yet.

Fill in after a run (date, camera, mount, light conditions, thresholds used):

| Measure | Value |
|---|---|
| _paste the table from `report.md` here_ | |

Plumbing check (measured 2026-10-23, **not** an accuracy result): a 10-frame replay of the bundled
`test_fixtures/cctv_live_stream.mp4` with `--record` produced a log that `tools/eval_pilot.py` scored without
error against a throw-away truth file. The bundled clip has no labels, so it says nothing about accuracy.

## 4. What was verified, and how

All of this was executed on 2026-10-22/23 on the development laptop (Windows, CPU), not on the EC2 server.

| Check | Result |
|---|---|
| Automated test suite `python -m pytest tests -q` (services/anpr) | 476 passed (see §9) |
| Real-browser checks, bay editor (`tools/e2e/occ_e2e.mjs`, real Chrome, real server): opens with the saved layout and line, drag a corner / a whole bay, arrow nudge, rename (duplicates refused), duplicate, delete, crossing outline flagged and save blocked, server refuses a bad layout, save keeps the replaced layout and Restore brings it back, row tool near-wider-than-far, bay id shown as text not markup | all passed |
| Real-browser checks, public viewer (`tools/e2e/viewer_e2e.mjs`, mock server using the real `status.py`): live, picking a bay from map / list / camera picture, admin buttons, night, offline, stalled, error (no raw error text shown), camera moved, not started, no bays, gate card, server down (backs off, keeps last numbers, recovers), request that never answers (given up after 8 s), tablet and phone widths (no sideways scroll, camera first) | all passed |
| Real-browser checks, whole path (`tools/e2e/integration_e2e.mjs`): a camera feeding a dark picture to a real server, the page reading it, an operator answering for a bay and clearing it, the camera stopping | all passed |

Honest limits of these checks: they use drawn test pictures, not footage of the site; the one real night frame
used during development (private, not stored in the repository) showed the night rule working as intended
(no bay called vacant, the two cars that were detected stayed Occupied).

## 5. Configuration (all optional; defaults shown)

| Name | Default | Effect |
|---|---|---|
| `ANPR_STALE_AFTER_S` | 15 | seconds without a processed picture before bays show No signal |
| `ANPR_LOWLIGHT_MEAN` | 45 | picture darker than this = night rules apply (the one real night frame measured 12.6) |
| `ANPR_MOVE_PX_FRAC` | 0.03 | view shift (share of picture width) that counts as the camera having moved |
| `ANPR_OCCUPY_VOTES` / `ANPR_FREE_VOTES` | 3 / 5 | readings in a row before a bay turns Occupied / Available |
| `ANPR_MIN_DWELL_S` | 0 | a bay that just turned Occupied is not freed for this long |
| `ANPR_LIVE_IMGSZ` | 960 | size the live picture is shown to the vehicle detector at (640 is faster but misses cars in shade) |
| `ANPR_LOG_SAMPLE_S` | 60 | seconds between the one-line occupancy samples in the activity log |

Fixed in code (change only with evidence from §2): the move check runs every 30 s and needs two agreeing checks
to change its verdict; an operator answer lasts 1-60 minutes; a bay overlapping a neighbour by more than 30%, or
a corner more than 2% outside the picture, is a warning; a bay smaller than 25 px² (and 0.05% of the picture) or
with crossing corners is refused.

## 6. Tests and tools added

Counts and dates: §9.
- `tests/test_status.py`, `tests/test_operator.py`: the four-state answer, summaries that add up, night, stale and
  recovery, moved camera, held details, operator answers and their expiry, feed events, the new routes' access.
- `tests/test_bay_validation.py`: every refusal and warning, the real pilot layout accepted, backups and restore,
  the new routes are private, obstacles in a GeoJSON are not bays.
- `tests/test_bay_geometry_js.py`: the editor's geometry run under node against numpy ground truth (a tilted camera
  looking at a row of equal stalls), and the page's checks against the server's.
- `tests/test_eval_pilot.py`: the scoring tool against numbers worked out by hand.
- `tools/e2e/`: the three real-browser suites (`python tools/e2e/run_e2e.py`; needs Chrome and node 22+).

## 7. Deploying to the EC2 server

The code runs unchanged on the same instance: `requirements.txt` did not change (so `update-ec2.sh` applies).

1. Build a bundle of the files that changed plus the new ones: `app.py live.py occupancy.py status.py
   bay_validation.py activity_log.py state_store.py optimizer_bridge.py static/live.html static/occupancy.html
   static/log.html static/bay-geometry.js` together with everything in the previous bundle (see `deploy/README.md`).
2. Serve it once behind a temporary tunnel and, on the instance, run `sudo bash update-ec2.sh <url> <sha256>`.
   The script saves the running code first and restores it by itself if the new version does not start.
3. After the update: open `/admin?token=...`, then `/occupancy?camera=phone-1`. The saved layout loads by itself.
   Press **Apply to Server** once (nothing needs to change): it records the picture size the bays were drawn on. The
   first live picture after the update becomes the reference for the camera-moved check automatically (it is
   replaced again each time bays are saved), so do that when the camera is where it should be.
4. Check from outside: `/live`, `/live/state` and `/live/frame.jpg` answer 200; `/occupancy/bays`,
   `/occupancy/bays/backups`, `/live/bay-override` answer 403 without the admin cookie.

**Rollback.** Automatic if the service does not start. By hand: `sudo tar -xzf
/var/backups/parkfnb-anpr/code-<time>.tgz -C /opt/parkfnb-anpr && sudo systemctl restart parkfnb-anpr`. Saved bays,
the camera key and the admin token are outside the code. Old pages keep working against the new server because no
field was removed.

## 8. Known limits

- At night the detector cannot see parked cars reliably. The page now says so instead of showing a wrong
  "Available", but it cannot read the bays. That needs light (or an IR camera) at the site.
- Bay states are judged from the bottom of the car's box (and a silhouette when available), so "parked badly" is a
  hint, not a measurement; Occupied / Vacant is the reliable part.
- The camera-moved check compares a small grey picture with a reference. It catches a knock or a re-aim, not a slow
  drift, and it says nothing when the scene has changed too much to compare.
- An operator answer is a hand-set value for up to an hour; it is shown as "Set by operator".
- Plate reading is off on the 2 GB server; plates are only read on a larger instance (`--with-ocr`).
- The bay editor is not tested on touch screens.
- Accuracy has not been measured (see §3).

## 9. Run log

| When | What | Result |
|---|---|---|
| Before the work (2026-10-22) | `python -m pytest tests -q` | 321 passed |
| After the work (2026-10-23) | `python -m pytest tests -q` | **476 passed** (155 new) |
| After the work | `python tools/e2e/run_e2e.py` | viewer 48/48, bay editor 24/24, whole path 16/16, activity log 10/10 |

Not run: the new version on the EC2 server (it has not been deployed yet), accuracy on labelled footage, a multi-day
stream-uptime measurement, touch-screen editing.

## 10. Is the car parked correctly? (3D verdict on the live page, 2026-10-26)

What the page now says per occupied bay, and when:

| Verdict | Shown when | Public flag |
|---|---|---|
| Parked correctly (with distances to the lines) | the car's silhouette was used, the bay's calibration is good or degraded, the car fits inside its lines | none |
| Close to the line / at an angle | same evidence, a possible crossing or a skew over 15° | amber `!` |
| Over the line | same evidence, a crossing that survives the bay's own calibration error | red `!` |
| **Not judged** (reason given) | box-only guess, no 3D camera, bay rejected, a car hidden by another, or an outline too big for one car (two cars joined) | none |

So a box-only "parked badly" guess no longer reaches visitors. Clean 3D boxes (ground footprint, faint roof and pillars) are drawn on the public picture for judged cars only.
Operator: **Check 3D** in the bay editor fits the camera to the bays as drawn (nothing saved) and shows each bay's grade and error in metres; `/live/state` has `site_calibration` and the log has `parking_over_line` / `parking_ok`.
Settings: `ANPR_MAX_CAR_WIDTH_M` (2.45) and `ANPR_MAX_CAR_LENGTH_M` (5.8) decide when an outline is too big for one car.

Measured on the live frame of 2026-10-26 (camera moved again; seven bays): the bays as saved by hand (dividers drawn to the kerb) gave no 3D camera (1 good, 2 rejected, up to 15.8 px error); the same bays laid out from the painted chalk (box's bottom and top lines, painted dividers, vanishing point for hidden ones) gave a camera and 6 of 7 bays good (1.3 to 4.3 px). The remaining bay is rejected because the painted stall between two dividers is about 2.95 m wide, not 2.5 m: the chalk itself is uneven, and the system says so.

## 11. Management console, reports and violations (2026-10-26)

What was added (all in `services/anpr`; the backend, apps, payment, booking and gate are untouched): the console at `/` for a signed-in operator (visitors are sent to `/live`), reports and sessions from the activity log, a violations register with pictures, site settings, a full-resolution photo from the phone, and a cleaner public picture (dashed free bays, a tick / ! / ? on each bay's name, the 3D box only on a car close to a line or over it).

Verified: 680 unit tests and all six browser suites (viewer, editor, integration, log, login, console) pass; on EC2 (bundle14) visitors get 403 on every `/console/api/*` route and a redirect from `/`, an operator reads the real data through the console, and the first real violation (Bay-03, 0.49 m over the right line, clear of the bay's ±0.15 m calibration error) was registered by the live feed.

Found on the real log, and fixed in the reports: the occupied/free events contain many stays of a few seconds (4 to 120 s), mostly on Bay-07 (25 in half an hour) where one car is hidden by another. A car does not park for seconds, so any stay shorter than `ANPR_MIN_STAY_S` (3 min) is a "flicker": listed only on request, left out of cars parked and the stay averages, and a bay with 6 or more of them is flagged as hard for the camera to see. Before this, the report said the average stay was 37 seconds. Stays cut by an outage, darkness, a moved camera or a restart (every deploy is one) have an unknown length and are listed but not averaged, so the average stay is empty until a stay is seen from start to finish.

Not done, and why: **number plates are not read**. The plate detector found 0 plates in three real phone-1 frames (960, 1280 and 1920 detection size): the nearest plate is about 36x8 pixels and a far one 20x5, letters about 5 px tall against the roughly 20 needed. The console says "needs a gate camera" instead of showing a guess. The phone-1 live stream stays 1280 wide (the bays are drawn on that size); sharper pictures come from the full-resolution photo. Accuracy has still not been measured on labelled footage.
