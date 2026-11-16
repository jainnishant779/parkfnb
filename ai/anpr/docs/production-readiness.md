# ParkFNB management console: what is left before real customers

*Checked 2026-10-26 against the live server (`3-7-139-193.sslip.io`, bundle after the 3D-box change) and the code in
`services/anpr`. "Done" means seen working; "Open" means not done. Nothing here is a claim about accuracy: accuracy has
not been measured on labelled footage (section 3).*

## 0. Where it stands

| Area | Status |
|---|---|
| Live occupancy, per-bay verdicts, 3D box per car, public view, operator console, reports, violations register, settings | Done and deployed |
| Sign-in (ID + password, throttled, signed cookie), private routes closed to visitors | Done. **The password is `admin` for testing.** |
| Number plates | **Not working**: ~5 px letters from this camera (needs a gate camera) |
| Payments, bookings, barrier, staff accounts | Not part of this service (backend/apps, untouched) |

## 1. Must fix before a paying customer

| # | Item | Why | Next action |
|---|---|---|---|
| 1 | **Real password** (today `admin`) | Anyone on the internet can open the console: violation photos, settings, the camera's phone link with its key | `set_admin_password.py` without `--allow-weak` (12+ characters) |
| 2 | **Backups**: nothing copies `/var/lib/parkfnb-anpr` (bays, logs, violations, evidence) anywhere | One bad disk or instance loss and the history and the saved bay layouts are gone | Nightly `tar` to S3 (or an EBS snapshot) with 14-day retention; test a restore once |
| 3 | **Git**: none of the ANPR work is committed (a standing rule for this pilot) | A single copy on one laptop; no history | Decide when to commit (a branch) and to remove scratch files from the workspace |
| 4 | **Camera key** is old and shared by every camera (it was once exposed) | Anyone with it can feed fake pictures | One key per camera, rotated; the phone page and the ESP32 need the new one |
| 5 | **`parkfnb1.pem` is inside the workspace** | A copied folder is a copied server key | Move to `~/.ssh`, restrict permissions |
| 6 | **A named domain + Elastic IP** instead of `<ip>.sslip.io` | A shared free name has a weekly certificate limit; a stop/start can change the IP | A domain with an A record, an Elastic IP |
| 7 | **Alerts**: nobody is told when the camera goes offline or a car is over a line | The register fills, but a person has to look | Telegram/WhatsApp/e-mail on `feed_offline` (after 2 min) and a new violation |

## 2. Reliability

| Item | Status |
|---|---|
| Restarts itself after a crash or reboot (systemd `Restart=always`, enabled) | Done (0 restarts since the last deploy) |
| One server, one instance (t3.small, 2 GB + 2 GB swap, 51 % disk, ~0.9 GB free RAM) | Open: no standby; CPU credits can run out under a sustained load |
| Deploy with automatic rollback (`update-ec2.sh`) and a code backup per deploy | Done. A deploy still restarts the service and cuts open stays (reports mark them "cut short") |
| Monitoring / uptime check from outside | Open: add an external ping of `/live/state` and alert on `stream_status != live` |
| The phone is the camera: power, Wi-Fi, a locked screen, a browser update | Open: fine for a pilot; a fixed IP camera or an ESP32 on a wall is the production answer |
| Time zone | Server is UTC; reports use `ANPR_TIMEZONE` (default Asia/Kolkata) |
| Log and evidence retention (180 / 30 days) | Done (automatic) |
| Firewall | `ufw` is off; the AWS security group is the only fence. Check that only 80/443 (and your IP for SSH) are open. SSH password login is off (good) |

## 3. Accuracy (what has and has not been measured)

| Item | Status |
|---|---|
| Occupancy and parking verdict accuracy on labelled footage | **Never measured.** Needs a few hours of footage with a person's labels, then a table of correct / wrong / not judged |
| Night | Bays turn "unclear" when it is dark (by design); real night needs lighting or an IR camera |
| 3D calibration | 3 of 7 bays "good" (02, 06, 07), 01/03/04 rough, 05 rejected (its painted shape is not 2.5 × 5 m). Far bays are placed to about ±0.25 m |
| The fitted 3D box | On the live frame: hatchback IoU 0.89, SUV 0.82, SUV hidden behind it 0.80 (partial). It moved by up to ~0.2 m / 10° between two frames of the same parked cars, so a verdict taken from it alone carries a ±0.25 m allowance and says "3D box" |
| A car hidden behind another | The tracking model misses it; the segmentation model finds it (added). Its bay is occupied; its parking is "not judged" |
| Bay-07 flicker | Real data showed 25 occupied↔free flips in half an hour; reports now ignore stays under 3 minutes and flag the bay |
| Plates | Not readable from this camera. Needs a camera 2–3 m from where cars stop, plus IR at night |

## 4. Management features a parking company will ask for

| Feature | Status |
|---|---|
| Live dashboard, full screen for a wall, mobile layout | Done |
| Occupancy / dwell / turnover / quality / uptime reports, CSV, print to PDF | Done (history only from 26 Oct) |
| Violations with picture, resolve/dismiss with a note, overstay limit | Done |
| Parked across two bays: the other bay is shown **Blocked** | Done |
| Scheduled daily or weekly report by e-mail / WhatsApp | Open |
| Staff accounts, roles, an audit trail of who did what | Open (one shared sign-in; the log records "admin") |
| Fines / tickets / payment for a violation | Open (backend) |
| Booking and gate link (open the barrier for a paid booking) | Open (backend; the ANPR rule there still denies cash bookings) |
| Several sites in one console | Partly (cameras are listed and named; no site grouping or per-site totals) |
| Export of evidence for a dispute (a signed PDF with time, bay, picture) | Open |

## 5. Data and the law (India)

| Item | Status |
|---|---|
| Who can see pictures and (later) plates | Signed-in operators only; visitors get the public view, which has no plates and no evidence |
| Purpose and notice | Open. The Digital Personal Data Protection Act 2023 expects a stated purpose and a notice (signage at the lot) for images of vehicles and people. Write a short policy and put up a sign before a public launch |
| Retention | 180 days for logs, 30 days for evidence pictures; plates are not stored. Put the numbers in the policy |
| A person's face in a picture | The cameras look at the lot, not at people, but violation crops can include them; keep evidence admin-only (it is) |

## 6. Suggested order

1. **This week:** a real password, nightly backup, an outside ping with an alert, move the `.pem`, a camera key per camera.
2. **Next two weeks:** label two hours of footage and measure accuracy (this is what decides what you may promise a client); fix the bays that grade "rough"/"rejected" on the HQ photo; a named domain.
3. **Before the first paying site:** a gate camera for plates, staff accounts, scheduled reports, the privacy notice, and commit the work to git on a branch.
