# Handover: ParkFNB ANPR service and its operator console

For whoever takes over the UI and the server work.  Read this first, then `README.md` (map of the code) and `docs/` (how it works, how to
measure accuracy).  Written 15 Nov 2026 from what is actually running; anything not measured is marked **unproven**.

## 1. What is running on EC2 right now

| | |
|---|---|
| Server | AWS EC2 t3.small (2 vCPU, 2 GB RAM, **CPU only**), Ubuntu, Python 3.12, public address `3.7.139.193` (no Elastic IP: it can change on a stop/start) |
| Web address | `https://3-7-139-193.sslip.io` (Caddy in front, HTTPS) |
| Service | systemd unit `parkfnb-anpr` (uvicorn on `127.0.0.1:8010`, one worker); `caddy` |
| Code | `/opt/parkfnb-anpr` (+ `.venv`).  Deployed by copying a bundle, **not** by git |
| Data | `/var/lib/parkfnb-anpr` (bays, line counts, arrivals, violations, activity logs, pictures) |
| Config | `/etc/parkfnb-anpr.env` (names only: `ANPR_DATA_DIR`, `ANPR_OCR`, `OMP_NUM_THREADS`, `MALLOC_ARENA_MAX`, `LIVE_CAMERA_KEY`, `ANPR_ADMIN_USER`, `ANPR_ADMIN_PASSWORD_HASH`; optional `ANPR_RECORD_S`; for the owner dashboard `ANPR_GRANT_SECRET` (same value as the backend's), `ANPR_OWNER_ORIGINS`, optional `ANPR_GRANT_SECRET_PREV`). Never print or commit its values |
| Deploy backups | `/var/backups/parkfnb-anpr/code-<date>.tgz` (made by every deploy; rollback is automatic if the new code does not start) |
| Camera | one Android phone (`camera_id=phone-1`) running `/live/camera?camera_id=phone-1&key=<camera key>` in Chrome, screen on |
| Weights | `weights/best.pt`, `weights/yolo11n-seg.pt`, `weights/plate_ocr/*.onnx` live on the server and are **not in git** (ask the owner / Colab) |

Owner dashboard API: `/owner/api/*` (`owner_api.py`, `grant_auth.py`), used by `software/apps/owner-web` and nothing else: see section 7.
Pages: `/` operator console (sign in at `/admin`), `/live` public view (no plates, ever), `/live/camera` phone page, `/occupancy` bay editor,
`/label` labelling page for accuracy tests, `/live/log` activity log.

## 2. Doing UI work

The console is plain JavaScript, **no build step**: `static/console.html`, `static/js/console.js` (Dashboard, Live Operations, Parking Lots,
Vehicles, Devices), `static/js/console-reports.js` (Sessions, Reports, Violations, Settings), `static/css/parkfnb.css`.  The public page is
`static/live.html`, the phone page `static/live-camera.html`, the bay editor `static/occupancy.html` (large, needs care).

Rules the code follows (keep them):
- Server text (plates, notes, names) goes in with `textContent`, **never `innerHTML`**.
- Every page's `render` returns a cleanup function that stops its pollers and listeners.
- A page that repaints on a poll must not wipe something the person is typing in (see `paintDetail` in `console.js`).
- Times are shown in the lot's time zone (`S.site.timezone`, `ANPR_TIMEZONE`, default Asia/Kolkata), not the browser's.
- Colours mean: blue = a car in its bay (nothing to do), amber = close to a line or unclear, red = over a line, green = free.
- The look follows the ParkFNB website and apps (Urbanist, grey canvas, white 24 px cards, black pills for what is selected); the tokens
  are at the top of `static/css/parkfnb.css`.  Every page is light unless the person picks dark: each loads `static/js/theme.js` in
  `<head>` and has a `<button data-theme-toggle>`; dark colours live only under `:root[data-theme="dark"]`, never in a
  `prefers-color-scheme` block.

See your change against the real lot without deploying: `ssh -N -L 8011:127.0.0.1:8010 ubuntu@<server>` then open `http://127.0.0.1:8011`
(a loopback connection counts as an admin).  Static files are served `no-cache`, so a deploy shows on the next reload.

Browser tests: `python tools/e2e/run_e2e.py console` (suites: viewer, editor, integration, log, login, console, phone; needs Node and Chrome).
Known flake: the console suite's Sessions/flicker checks depend on the time of day (stays seeded "today" look old after local midnight).

## 3. Deploying (what you need and how)

**Automatic (since 15 Nov 2026):** a push to `main` that changes `ai/anpr` runs the tests and then deploys by itself (`.github/workflows/deploy-anpr.yml`).  How it works, what it may and may not do, and how to stop it (set the variable `AUTO_DEPLOY` to `false`): `deploy/AUTO_DEPLOY.md`.  Use a branch and a pull request: the tests run on the PR, and merging is what deploys.

**By hand**, you need an SSH key for `ubuntu@<server>` from the owner (it is not in this repo and must never be).

```
python deploy/make_bundle.py --name bundleNN           # builds bundleNN.tgz from deploy/bundle-files.txt, prints the sha256 and the commands
scp -i <key.pem> bundleNN.tgz deploy/update-ec2.sh ubuntu@<server>:/tmp/
ssh -i <key.pem> ubuntu@<server> "sudo bash /tmp/update-ec2.sh file:///tmp/bundleNN.tgz <sha256>"
```

- Add every new module or static file to `deploy/bundle-files.txt`, or it never reaches the server.
- The installer checks the checksum, backs up, swaps the code and rolls back by itself.  If `requirements*.txt` changed it stops: install the
  packages by hand with `uv pip install --python /opt/parkfnb-anpr/.venv/bin/python ...`, copy the requirements, then run it again.
- **Every deploy restarts the service**: open stays are cut and the first minute is "no signal".  Deploy when the lot is quiet.
- Scripts must have LF line endings (`.gitattributes` and `make_bundle.py` make sure of it; Python files may be CRLF, `app.py` is).
- After a deploy check `https://<server>/live/state` (`stream_status` live) and `sudo journalctl -u parkfnb-anpr -n 40`.

Signing in: the ID and password hash are in the env file.  Set them with `sudo /opt/parkfnb-anpr/.venv/bin/python /opt/parkfnb-anpr/tools/set_admin_password.py --env /etc/parkfnb-anpr.env`
then restart.  **The current password is weak (set for testing): change it first.**

## 4. Rules (from the owner)

- Do not touch the Node backend's booking, payment and gate code or the mobile apps from here.  The exception, by the owner's decision of 15 Nov 2026, is the camera-to-owner link and the pass this service checks: `software/services/backend` `/api/cameras`, the admin panel's Cameras page and `software/apps/owner-web` (section 7).
- Number plates are personal data: admin, or the owner of that camera through `/owner/api` (section 7), and never in `/live/state` or the public picture.  Pictures and records are kept 30 days, logs 180.
  (Until 15 Nov 2026 this said "admin-only"; the owner dashboard was decided to show an owner the plates of their own cameras.  It needs a privacy notice and signage at the lot before a real owner is let in: `docs/production-readiness.md` section 5.)
- Do not overwrite the saved bay layout (`/var/lib/parkfnb-anpr/cameras/*.json`) without the owner's say-so.  A new layout closes every open
  violation and arrival of that camera.
- Do not rotate the camera key without asking (the phone link carries it).
- Check what another tool (the owner also uses another AI assistant) changed in the repo before you build or deploy.
- Never commit `.env`, keys, `.pem`, weights or activity logs.  The repo this came from had **malware injected twice** (a hidden ~13,000-character
  line in `api.js` and `postcss.config.js`, Sep-Nov 2026).  Review diffs for very long lines, and do not run `npm run dev/build` from an unreviewed commit.

## 5. State of the product (honest)

Works and is checked against pictures: free/taken per bay, which bay a car is in (ground footprint, not the box), "over the line" and
"across two bays", plates from close-ups (confirmed when two photos agree), arrivals/violations registers, night judged bay by bay.

**Unproven or weak:**
- No accuracy figure has ever been measured.  `docs/accuracy-test.md` says how (record, label, score).  The recorder is **off** (`ANPR_RECORD_S` unset).
- The metre error of the "over the line" verdict is unmeasured; the calibration assumes 2.5 x 5.0 m stalls (set real sizes on Devices > Stall sizes).
- Camera calibration: only 2-4 of 7 bays grade "good"; it is a self-consistency check, not accuracy.
- Plate reading from the phone is limited by pixels (a plate is about 5 px tall in the live picture; close-ups work when the car is near).
  About 7 labelled plates exist.  A gate camera would be the real fix.
- Night thresholds come from two pictures of one lot.  No plates or 3D boxes at night.
- Overstay was broken until 29 Oct and has not been seen working on the live lot.
- Feed speed: the phone page is throttled when Chrome hides it or the screen dims (measured: 20% of ticks "hidden", frames every 5 s).  Keep the screen on and the page in front.

**Open work, in the order the owner chose:** measure accuracy (recorder, labelling, tape-measure test) > cut flicker (per-bay empty reference, tracker tuning) >
better 3D box from the full photo > a second phone at the gate for plates > manager features ("Needs your action" list, alerts) > production hardening
(registers to SQLite, nightly backup, a key per camera, Elastic IP, 78 violations waiting for review).  Splitting `app.py` (3,300 lines, 77 routes) into routers
is wanted before the console grows: routes first, helpers and state stay where they are so the tests keep passing.

## 6. Where to look when something is wrong

| Symptom | Look at |
|---|---|
| Console says "No signal" / "Offline" | the phone: screen on, page open, Wi-Fi; `/live/state` `age_s`, `uplink` |
| Everything "Unclear" or "Moved" | `move_check` in `/live/state`; did the phone or its lens change (picture size guard)? |
| A plate in the wrong bay | `/console/api/arrivals`: `outline`, `moved_from`; `plate_ocr.py`, `_arrival_car` in `app.py` |
| Verdicts jumpy | `status.VerdictHold` (12 s to start a violation, 8 s to end); `docs/accuracy-test.md` to measure |
| A hook failed silently | `sudo journalctl -u parkfnb-anpr | grep hook` (they are logged since 29 Oct) |
| Slow frames | journal lines `slow frame ...` show the time of each stage |

## 7. The owner dashboard API (`/owner/api`)

The owner web app (`software/apps/owner-web`) is a separate site: an owner signs in there with their phone (the Node backend's OTP), and the
backend gives their browser a **15-minute signed pass** (`POST /api/cameras/access-grant`) naming the cameras that owner may see.  The browser
then calls this service directly.  This service never calls the backend: it only checks the pass (`grant_auth.py`, standard library, HS256) with
`ANPR_GRANT_SECRET`, the same value the backend signs with.

- **Every route is scoped to one camera in the pass**; any other camera id answers 404 (made-up, someone else's, or not even a valid id, never `phone-1`).
  The routes are in `owner_api.py` and reuse the console's helpers through `_core()` (a call-time lookup: a top-level `from app import ...` would be
  circular and would bind a name the tests replace).  Helpers split out of the console's handlers for this: `_camera_row`, `_state_snapshot`,
  `_violation_rows`, `_violations_csv`, `_handle_violation`; `_build_report` and `reports.build_report` take `since`.
- **"Since" hides history.**  For each camera the pass carries the moment the owner got it.  Arrivals, vehicles, violations, evidence, reports, the log
  and the state's events from before that moment are not shown, and neither are plates of cars that arrived before it (even on a later violation or stay).
  So a camera that changes hands never shows the previous owner's plates to the next one.
- **What an owner may do:** look, download CSVs, and resolve / dismiss / reopen their own violations (recorded as `handled_by = owner:<id>`, which the
  accuracy page ignores).  **What stays in the console:** bay layouts, calibration, stall sizes, camera keys, site settings, the recorder, bulk
  dismissals, typing a plate.  A pass opens none of `/console/*`.
- **Browser rules:** CORS only for `/owner/api/`, only for the origins in `ANPR_OWNER_ORIGINS`, no cookies.  Pictures are fetched with the pass in a header
  and shown from a blob (a token in a URL would end up in logs and history).  The live picture is limited to one a second per owner and camera, and
  `?after=<frame>` answers 204 until there is a newer one.  A report is built one at a time (429 if busy), at most 31 days, and kept for 60 seconds.
- **Revoking** (unpair, reassign, disable) takes effect when the pass expires, within 15 minutes.
- **Open:** `/live/state` and `/live/frame.jpg` are still public for any camera id (no plates in them).  An `ANPR_PUBLIC_CAMERAS` allow-list would close that.
- Tests: `tests/test_grant_auth.py` (includes a token minted by the backend's own library), `tests/test_owner_api.py` (with the checks that every
  protection above fails a test when removed).
