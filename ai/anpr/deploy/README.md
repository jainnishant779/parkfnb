# Running the live ANPR service on EC2 (24/7)

Tested target: a small Ubuntu instance (t3.small, 2 GB RAM). The service runs vehicle detection,
bay occupancy and IN/OUT counting; **plate reading is off** there (`ANPR_OCR=none`) because the plate
reader needs ~0.5 GB more RAM than the box has. Use a 4 GB instance and `--with-ocr` to turn it on.

```
phone / ESP32-CAM --HTTPS--> Caddy (80/443) --> uvicorn 127.0.0.1:8010 (systemd, restarts itself)
anyone's browser  --HTTPS--> /live            state in /var/lib/parkfnb-anpr (survives restarts)
```

## What you get
| | |
|---|---|
| Viewer (public) | `https://<name>/live` |
| Phone camera | `https://<name>/live/camera?camera_id=phone-1&key=<key>` |
| ESP32-CAM | `config.h`: `SERVER_HOST "<name>"`, `SERVER_PORT 443`, `USE_HTTPS 1`, `CAMERA_KEY "<key>"` |
| Admin (mark bays, IN/OUT line) | `https://<name>/admin?token=<admin token>`, signs you in with a cookie |

Everything else (bay layouts, setup pages, plate text, the camera key) needs the admin sign-in.
The key and admin token are in `/etc/parkfnb-anpr.env` (root only). Keep them private.

## Steps
1. **Security Group** (EC2 console): inbound **80** and **443** from anywhere. Keep 22 as it is.
   Never open 8008 or 8010.
2. On your laptop make the bundle and serve it once (see `make-bundle` notes below); it prints the
   download URL and its SHA-256.
3. On the instance (EC2 Instance Connect is fine):
   ```
   curl -fsSL <url>/setup-ec2.sh -o setup-ec2.sh
   sudo bash setup-ec2.sh <url>/bundle.tgz <sha256> --retire-old
   ```
   `--retire-old` stops the old `anpr` service, which holds ~0.7 GB; leave it out to keep it running
   (then there is not enough RAM on a 2 GB box).
4. The script prints the links, the key and the admin link. Open the admin link, then
   `/occupancy?camera=phone-1`, load a frame, mark the bays.

## Day to day
```
sudo systemctl status parkfnb-anpr        # is it running
journalctl -u parkfnb-anpr -n 50          # its log
free -m                                   # memory
sudo systemctl restart parkfnb-anpr       # bays, line and IN/OUT totals come back by themselves
```
Update the code: run `setup-ec2.sh` again with a new bundle. It keeps the key, token and saved bays.

## Settings you can change (all optional)
Put any of these in `/etc/parkfnb-anpr.env` (one `NAME=value` per line) and `sudo systemctl restart parkfnb-anpr`.
Without them the defaults below apply, so an update needs no change to that file.

| Name | Default | What it does |
|---|---|---|
| `ANPR_STALE_AFTER_S` | 15 | No processed picture for this many seconds: every bay shows "No signal" and the numbers are dimmed. |
| `ANPR_LOWLIGHT_MEAN` | 45 | A picture darker than this (average pixel value, 0-255) is "night": bays with no car seen show "Unclear", never "Available", and an empty reading cannot free a bay that holds a car. |
| `ANPR_MOVE_PX_FRAC` | 0.03 | The camera view shifted by more than this share of the picture width since the bays were saved: bays show "Unclear" until the layout is re-saved. |
| `ANPR_OCCUPY_VOTES` / `ANPR_FREE_VOTES` | 3 / 5 | Readings (about one a second) in a row needed before a bay turns Occupied / Available. |
| `ANPR_MIN_DWELL_S` | 0 | A bay that just turned Occupied is not freed again before this many seconds (0 = off). |
| `ANPR_END_LINE_TOLERANCE_M` | 0.40 | A car may reach this far past the front (road side) or back line before it counts as over it (a bumper overhangs the chalk). The side lines, into the next bay, allow only the calibration error plus 0.10 m. |
| `ANPR_3D_FIT` | 1 | Fit a 3D box to each car (kept while it sits still, ~0.15-0.4 s once per car) for the picture, for cars whose outlines run together, and to find a car lying across two bays (their other bay shows "Blocked"). 0 turns it off. |
| `ANPR_SEG_EXTRA_VEHICLES` / `ANPR_SEG_IMGSZ` | 1 / 960 | Also count a car only the segmentation model sees (one half hidden behind another). |
| `ANPR_STILL_EVERY_S` | 900 | How often the phone is asked for a full 2-4 MB photo (0 = off). It was 120 and held the live pictures back on a weak uplink; cars get close-ups instead. Can also be set in the console's Settings. |
| `ANPR_SLOW_FRAME_S` | 2.5 | A live frame slower than this is written to the service log with the time of each stage. |
| `ANPR_FREEZE_AFTER_SAME` | 10 | This many identical uploads in a row = the phone's camera has frozen. |
| `ANPR_ARRIVAL_PHOTOS` | 1 | Ask the phone for a full-resolution photo when a car stops in a bay, cut the car out, and measure its plate (Vehicles page, "Arrivals"). 0 = off. |
| `ANPR_RECORD_S` | 0 (off) | Keep the raw live picture and the system's answers for every bay every N seconds, for labelling and scoring (see `docs/accuracy-test.md`). 30 for a normal day, 1 for a dense hour. Pictures show plates and people: admin-only, deleted by the two limits below. |
| `ANPR_RECORD_MAX_MB` / `ANPR_RECORD_DAYS` | 1500 / 14 | The recorder deletes whole days, oldest first, past either limit, and stops when under 1 GB of disk is free. Labels are kept. |
| `ANPR_INSIDE_FROM_BAYS` | 1 | Put the line counter's "inside" count right when every bay is clear to read and nobody has crossed the line for 2 minutes (it then equals the occupied bays). 0 = leave the count as the line made it. |
| `ANPR_MIN_STAY_S` | 180 | Reports: a bay that is occupied for less than this is the camera flickering, not a car; it is left out of cars parked and stay averages. |
| `ANPR_UNSTABLE_FLICKERS` | 6 | Reports: this many flickers in a period flags a bay as hard for the camera to see. |
| `ANPR_TIMEZONE` | Asia/Kolkata | The time zone reports count days and hours in. |
| `ANPR_LOG_RETENTION_DAYS` | 180 | Activity-log day files older than this are deleted (once a day). 0 keeps everything. |
| `ANPR_EVIDENCE_DAYS` | 30 | Violation pictures, and handled violations, older than this are deleted. Open violations are kept. |
| `ANPR_GRANT_SECRET` | (none: owner dashboard off) | The owner dashboard's API (`/owner/api`) only answers a signed pass from the backend (`POST /api/cameras/access-grant`), and checks it with this secret: **the same value as `ANPR_GRANT_SECRET` on the backend**, 32+ random characters (shorter is ignored), not the backend's `JWT_SECRET`. Unset, the API answers 503. A leak lets someone make a pass for any camera: keep it only in the Render dashboard and this root-only file. |
| `ANPR_GRANT_SECRET_PREV` | (none) | The previous secret, accepted for a while when the secret is rotated: put the old one here, set the new one on both sides, remove this a day later. |
| `ANPR_OWNER_ORIGINS` | (none) | The web address(es) the owner dashboard is served from, comma separated (e.g. `https://parkfnb-owner.onrender.com`). Only these may call `/owner/api` from a browser (CORS). Empty = none may. `*` is ignored. |

Tune them against labelled footage (`docs/pilot-validation.md`), not by feel.

## The activity log (where to read what happened)
Everything is kept per camera, one file a day, in `/var/lib/parkfnb-anpr/logs/` (outside the code, so updates and
rollbacks never touch it). Read it in the browser, signed in as admin:

- `https://<name>/live/log?camera_id=phone-1`: a table, newest first. Filter by period, kind of event and bay.
- **Download CSV** on that page (or `https://<name>/live/log.csv?camera_id=phone-1&days=30`): opens in Excel; times
  carry the server's UTC offset and there is an `epoch` column for charts.
- On `/live` an admin also sees "Full log · CSV" in the Activity box.

What is in it: every bay turning occupied or free (with the car), the first reading of each bay after a start-up,
cars in and out at the gate, the camera going offline and coming back, too dark, camera view changed, operator answers,
and one line every minute with the occupancy of every bay (`ANPR_LOG_SAMPLE_S` to change, in seconds). A day is a few
hundred kilobytes; day files older than `ANPR_LOG_RETENTION_DAYS` (180) are deleted automatically, once a day.

## The management console
Signed in as admin, `https://<name>/` is the management console (a visitor is sent to the public `/live` view).
Dashboard, Live Operations, Parking Lots, Vehicles / ANPR, Sessions, Reports, Violations, Devices, and the bay layout,
activity log and Settings. Reports and Sessions are worked out from the activity log above, so they only reach back to
when the log began, and any time the camera was not seen is shown as a gap, never as an empty bay. A stay is only
counted when it was seen from start to finish and lasted at least `ANPR_MIN_STAY_S`.

- **Violations**: a trusted over-the-line verdict opens one (with a picture of the bay), the car moving or leaving closes
  it, and an operator marks it resolved or dismissed with a note. A bay held longer than the camera's overstay limit
  (Settings, per camera, off by default) opens an overstay.
- **Full-resolution photo**: the phone page sends one about every 2 minutes, or when an operator asks (Vehicles / ANPR,
  Settings). It is kept as it came (latest per camera, `/var/lib/parkfnb-anpr/stills/`) and used for violation pictures
  and for checking the chalk lines in the bay editor (**HQ photo check**). Reload the phone's camera page once after an
  update so it starts sending them. The live frames stay 1280 wide (the bays are drawn on that size); `&w=1920` on the
  phone link changes it, but then the bays must be marked again.
- **Number plates are not read** (about 5 pixels tall from this camera position); the console says so and shows none.

## Bay layouts and undo
Every save of a camera's bays keeps the layout it replaced (the last 10) under `/var/lib/parkfnb-anpr/cameras/backups/`.
In the setup page (`/occupancy?camera=phone-1`) the **Earlier Layouts** button lists them and puts one back; the
current one is kept too, so a restore can be undone. A layout is checked before it is saved (corners that cross,
a bay too small or outside the picture are refused with the reason).

## Updating, and going back
`update-ec2.sh` saves the running code first and puts it back by itself if the new version does not start. To go back
by hand: `ls /var/backups/parkfnb-anpr/` then
`sudo tar -xzf /var/backups/parkfnb-anpr/code-<time>.tgz -C /opt/parkfnb-anpr && sudo systemctl restart parkfnb-anpr`.
Saved bays, the camera key, the admin token and the backups above are outside the code and are not touched.

## Limits to know
- 2 vCPU burstable (t3): continuous inference can use up CPU credits; on the default "unlimited" mode
  that costs extra. Keep the camera at about 1 frame per second.
- With no plate reader the server counts and watches bays but does not read plates.
- The Let's Encrypt name `<ip>.sslip.io` is a shared free name: if its weekly certificate limit is hit,
  HTTPS fails until it resets. Your own domain (`--domain parking.example.com`, with an A record to the
  instance's IP) does not have that problem. Give the instance an Elastic IP so the address survives a
  stop/start.
