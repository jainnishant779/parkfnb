# ParkFNB live pilot — baseline (before the production-pilot work)

Recorded 2026-10-22, before any change from the production-pilot plan. Every statement below was read from
the code or measured on the running pilot; line numbers refer to the working tree on that date.

Rollback point: a file snapshot of `services/anpr` and `services/space-optimizer` (model weights excluded,
they are unchanged) plus the live bay layout of `phone-1` saved from EC2. No git commit was made (standing
rule for the ANPR work). On EC2, `update-ec2.sh` also keeps `/var/backups/parkfnb-anpr` and restores it by
itself if a new version does not start.

## What is running

| Part | Where | Notes |
|---|---|---|
| ANPR / live service | EC2 t3.small (2 vCPU, 2 GB), `https://3-7-139-193.sslip.io` | Caddy (HTTPS) → uvicorn `127.0.0.1:8010`, systemd `parkfnb-anpr`, Python 3.12, torch CPU |
| Cameras | `phone-1` (phone browser page), `gate-1` (ESP32-CAM, HTTPS) | ~1 frame/s each |
| Space Optimizer | laptop only, Flask `:5000` | used while drawing bays, not by the live path |
| Backend (bookings, payments, gate) | `services/backend` | **not part of this work and not touched** |

Plate reading is off on EC2 (`ANPR_OCR=none`, not enough RAM). Vehicle segmentation (`yolo11n-seg`) is on.

## Data flow

```
phone page / ESP32 ── POST /live/frame | /live/frame-raw (camera key) ──► LiveSession slot (newest frame wins)
                                                                             │ worker thread, one per camera
   _live_process (app.py:1052)                                               ▼
     VehicleMOTTracker.track_frame (YOLO + ByteTrack, conf 0.15, imgsz 640)
     → segmenter.attach (masks every 3 s)
     → BayMap.observe (occupancy.py:409): bottom slice of each box = footprint, car → bay with most coverage
     → evaluate_parking_intelligence (intelligence.py:461): free / correct / suspicious / wrong / occluded
     → ParkingIntelligenceEngine.update (occupancy.py:746): 6-frame vote window
     → LineCounter (IN/OUT, only if a line is set)
     → annotate (technical) + annotate_clean (public) JPEGs
   snapshot (live.py:290-311, under one lock) ──► GET /live/state, GET /live/frame.jpg ──► static/live.html
```

Saved per camera in `data/cameras/<id>.json` (`state_store.py`): `view`, `bays` (pixel polygons),
`line`, `counts`, `read_plates`. No frame size, no version, no bay states (bays restart as "unknown").

## Routes and access

Public over the internet (`live.py:505-519`): `GET /live`, `/live/state`, `/live/frame.jpg`, `/live/camera`,
`/admin`, `/admin/logout`, `/static/*`; `POST /live/frame`, `/live/frame-raw` (camera key required).
Everything else (bay editing `/occupancy*`, `/optimizer/*`, `/live/config`, `/live/reset`, plates, raw
frames) answers 403 to remote callers unless they hold the admin cookie (`/admin?token=…`).

## Occupancy rules today

- States: `free, occupied, correct, suspicious, wrong, occluded, unknown` (`intelligence.py:33-39`).
- Debounce counts frames, not seconds: last 6 observations; 3 occupied-like votes to become occupied,
  5 free votes to become free; "wrong" must last 5 s (`occupancy.py:757-875`). At ~1 fps that is about 3 s / 5 s.
- Constants that exist but are never read: `OCCUPIED_AT`, `EMPTY_AT` (`occupancy.py:45-46`),
  `min_free_persistence_seconds`, `occupied_coverage_min` (`intelligence.py:94,97`).
- Camera offline: no frames → `update()` never runs → bay states freeze at their last value. No stale state.
- `online` = a frame was *received* in the last 8 s (`live.py:193,386`), even if processing fails.
  `error` is never cleared after a later success.

## Known problems (baseline bugs)

Bays
1. Auto-Grid Lane splits a row evenly in pixels (`static/occupancy.html:711-767`), so under perspective far
   bays come out too wide and near bays too narrow.
2. The bay editor cannot drag a corner, move, delete or rename one bay; a repeated id silently overwrites.
   No validation of shapes on either side (server only rejects zero area, `occupancy.py:135`).
3. Optimizer GeoJSON import turns `obstacle` / `access_lane` features into bays and their ids clash with
   stall ids (`optimizer_bridge.py:126`).
4. Every bay save overwrites the previous layout with no backup (`app.py:320-339`).
5. The IN/OUT line is not loaded back into the setup page when it opens.

Occupancy truth
6. `summary().occupied` counts every non-free bay, including `unknown` and `occluded` (`occupancy.py:972`);
   the map draws those grey. "Need a look" counts wrong/suspicious bays that are already in "occupied", so
   the legend can add up to more than the total (`static/live.html:436-449`).
7. At night the detector sees no cars, so free votes win and parked cars show as free. Measured: the night
   frame below has 4 parked cars, the viewer showed 2/5 taken, P4 free with a car in it. The model run on a
   brightened copy of the frame still found no cars, so brightening alone does not fix it.
8. Display fields (reason, coverage) come from the latest frame even while the state is held
   (`occupancy.py:884-907`), e.g. "correct" next to "Slot is empty".
9. Flapping: P2 went occupied → free → occupied within 3 s (events 09:15:40 / 09:15:43).

Viewer
10. No request timeout, no `r.ok` check, no stale styling; old numbers stay when the server is unreachable.
11. The camera image is fetched separately and can be from a newer frame than the numbers.
12. Inter is named in CSS but never loaded. Gate tiles show "–" when no line is set.

## Measured baseline (EC2, phone-1, night, 2026-10-22 21:28)

| Metric | Value |
|---|---|
| Processing time per frame (`ms_per_frame`, 10-frame mean) | 147 ms |
| Frames processed since last restart | 8 315 |
| Frame age at sample | 0.4 s |
| Bays | 5 (bay 5 is clipped by the frame edge and has 5 corners) |
| Occupancy shown vs. real | 2/5 shown, 4/5 real (night) |

Screenshots: `docs/pilot-screens/baseline-desktop.png`, `docs/pilot-screens/baseline-mobile.png`.

No accuracy figure exists yet; it is measured with the procedure in `docs/pilot-validation.md`.

## Commands

```bash
# local service (port 8008), from services/anpr
python -m uvicorn app:app --host 127.0.0.1 --port 8008
# tests
python -m pytest tests -q            # 321 passed at baseline
# replay a recording into the live path
python test_fixtures/replay_live.py
# deploy: build bundle → one-time link (deploy/serve-once.py behind a temporary tunnel) → on EC2:
sudo bash update-ec2.sh <bundle-url> <sha256>
```

## Tests at baseline

321 passing (`services/anpr/tests`): admin/guard, line counter, live path, plates, persistence, optimizer
bridge + endpoints, geometry, calibration, ground contact, segmenter, temporal debounce, clean overlay.
The `/live/state` keys pinned by tests: `online`, `counts` (`in/out/inside`), `events`, `line_set`,
`frame_size`, `layout`, `bays` shape `{"1": {"state": "free"}}`. Nothing pins `bay_summary`,
`ms_per_frame`, `updated_at`.
