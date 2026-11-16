# Camera / live-feed architecture: where it is, and where it should go

Written 16 Nov 2026. **Status: the current state is described as built; the target is the owner's intended flow; the decision on how to get
there is open** (see "Decisions needed" at the end). Facts below were re-checked against the code on 16 Nov 2026.

## 1. The intended flow

The live-feed camera service is **standalone** (it is not part of the backend that serves our apps). Our **backend consumes it**. The
**frontend never talks to it directly**: whatever a frontend needs from the camera side is **routed through our backend**.

```
camera ──frames──▶ camera service (standalone, private) ◀──server to server── backend ◀── frontend (apps, web)
```

## 2. What exists today

"The camera service" is `ai/anpr` (FastAPI, on an EC2 box at `https://3-7-139-193.sslip.io`, served by Caddy). It is also the operator console (the
earlier PoC dashboard) and is the only place any camera logic lives.

### What the camera service owns (its business logic)

| Area | What it does |
|---|---|
| Ingest | A phone page (or an ESP32) pushes frames to `/live/frame` or `/live/frame-raw` with a shared camera key (`LIVE_CAMERA_KEY`). One camera today (`phone-1`). |
| Bay verdicts | Per bay: free, occupied, over the line, close to the line, across two bays, unclear; handles night and a moved camera; counts cars in and out at a line. |
| Plates | Reads plates from close-up photos of each car that stops; a plate is confirmed when two photos agree. |
| Registers | Arrivals (plate, car and plate photos), a vehicles register by plate, and a **violations register** (open / resolved / dismissed, with a note and an evidence picture). |
| History | An activity log and reports (occupancy, dwell, turnover, parking quality, uptime). |
| Settings | Camera names, zones, overstay limits, bay layouts and calibration (operator only). |
| Storage | **JSON files on the EC2 disk** (`/var/lib/parkfnb-anpr`). No database. Retention: logs 180 days, pictures and handled violations 30 days. **No backup yet.** |
| Access control | One shared admin login for the console (`admin` for testing per the 26 Oct readiness check, "weak, change it first" per the 15 Nov handover; not re-checked on the server). `/live`, `/live/state` and `/live/frame.jpg` are **public for any camera ID** (no plates in them). |

### What the backend knows about cameras

- A `Camera` record: `camera_id` linked to an Owner and a Property, a status, how it was linked, and `linked_at` (the "since" time).
- `POST /api/cameras/access-grant`: a signed 15-minute pass naming the owner's cameras (see section 3).
- **Nothing else.** No occupancy, no violations, no plates, no pictures. **The backend never calls the camera service** (checked: no HTTP call to it
  anywhere in `software/services/backend/src`).
- Bays are not linked to `ParkingSpace` or to bookings (`research/system-design/company-system-design.md` says the same).

### The two directions between them today

| Direction | What | Status |
|---|---|---|
| camera service → backend | `/gate-event` (a demo page) posts a plate to `/api/access/anpr-event`; the backend decides allow or deny and drives the barrier | works; the live camera pipeline itself sends nothing to the backend |
| camera service → backend | `dispatch_occupancy_event` posts to `/api/access/anpr-occupancy-event` | **the backend has no such route**; only the old upload-a-frame route calls it |
| backend → camera service | nothing | none exists |

On EC2 `BACKEND_URL` and `ANPR_SERVICE_TOKEN` are not in the documented env file, so they are at their defaults (`localhost:5000`,
`change-me-anpr-token`).

## 3. How the owner dashboard consumes it today (this is NOT the intended flow)

```
phone / ESP32 ──frames──▶ camera service (EC2, public)  ◀── browser (owner-web), Bearer pass
                                                               ▲
                          backend (Render): decides who may see which camera, signs the pass
```

- The browser asks the backend for a pass, then calls the camera service **directly** at `/owner/api/cameras/{id}/...` (state, frame, arrivals, vehicles,
  violations and their actions, evidence pictures, reports, CSV, activity log).
- The camera service is therefore **internet-facing for owners**: it has CORS opened for the owner dashboard's origin (`ANPR_OWNER_ORIGINS`) and verifies
  the pass itself with a secret shared with the backend (`ANPR_GRANT_SECRET`).
- The backend is the **authoriser only**; the traffic does not pass through it. Everything else in the owner dashboard (bookings, listings, earnings,
  barriers, profile) does go browser → backend, as intended.
- Code: `ai/anpr/owner_api.py`, `ai/anpr/grant_auth.py`, `software/services/backend/src/controllers/camerasController.js`,
  `software/apps/owner-web/src/lib/anpr.ts`. Rules for it: `ai/anpr/HANDOVER.md` section 7.

**Why it was built this way:** to keep live pictures off the backend's free Render tier (30-60 second cold start, no streaming mechanism, and every
viewer's picture would pass through it). It was in the approved plan, but it was presented as an implementation detail when it is an architecture
decision, and it contradicts section 1.

## 4. What the intended flow needs

1. **The camera service becomes private.** Only camera ingest (`/live/frame*`, with the camera key) stays reachable from outside. No public live view,
   no console on the open internet, no CORS, no browser-facing routes. Network rule (security group or private network) so that only the cameras and the
   backend reach it.
2. **The backend becomes the gateway.** One endpoint per thing the owner views, under `/api/cameras/:cameraId/...` (state, frame, arrivals, vehicles,
   violations, evidence, reports, CSV, log), each checking `protect` + owner role + that the camera is the owner's and active, and passing the camera's
   `linked_at` as the "since" time. The backend then calls the camera service server to server.
3. **The frontends call only the backend.** `owner-web` drops its direct camera client (`lib/anpr.ts`) and calls the backend's `/api/cameras/...`. The mobile
   owner app can use the same endpoints later with no new camera code.

**Sketch of the smallest change (design only, not built or tested):**

- The backend signs the *same* short pass itself and sends it to the camera service on each call (or caches one for a minute). Then
  `owner_api.py` and `grant_auth.py` need **no change at all**: the scoping to a camera and the hiding of everything recorded before the owner got the
  camera already live there. Only the caller changes, from the browser to the backend.
- Removed: `POST /api/cameras/access-grant`, `ANPR_OWNER_ORIGINS` and the CORS wrapper, the `/owner/api/` public allow-list entry in `live.py`, and
  `owner-web/src/lib/anpr.ts`.
- Added: the backend proxy routes and an `ANPR_BASE_URL` setting; pictures and CSVs are streamed through; the frame route keeps `?after=<seq>` (204 when
  there is nothing new) so a quiet camera costs almost nothing.
- Also closes the existing gap that `/live/state` and `/live/frame.jpg` are public for every camera ID.

### What it costs (the reasons it was not done this way first)

| Concern | Detail |
|---|---|
| **Backend hosting** | The live picture would pass through the backend. On Render's free tier that means a 30-60 second cold start before the first picture, no streaming support in the backend (no websockets or SSE), and every open viewer adds a picture roughly every 1.5 s. **Estimate, not measured:** frames of 150-250 KB, so about 1 Mbit/s per open viewer. Live video needs an always-on backend. |
| **One more hop** | Latency and a second thing that can be down. A dead backend now also means no camera view. |
| **Reaching the camera service** | The EC2 box has no Elastic IP (its address can change on a stop/start). The backend needs a configured address and a way to keep everyone else out. |
| **Where the backend runs** | If it were hosted next to the camera service (same EC2 box or the same private network), the camera service could listen only on localhost or the private network and the hop becomes cheap. Not assessed: cost and operations. |

### Related, separate question: should events also live in the backend?

The unimplemented `/api/access/anpr-occupancy-event` was meant to be a **push** model: the camera service sends events (bay occupied or freed, wrong
parking) and the backend stores and serves them. That would let the apps show history and let bookings link to bays **without the camera service being
up**, and is the natural base for tying a bay to a `ParkingSpace`. It does not replace the gateway for the live picture, which still has to be pulled
from the camera service. It is also a prerequisite for any future "this car's booking matches this bay" logic.

## 5. Options

1. **Backend as gateway for everything** (the intended flow). Needs the hosting decision above.
2. **Keep it as built**: the backend only authorises, the browser talks to the camera service. Works today, breaks the rule in section 1.
3. **Gateway for data, CSV and pictures; the live frame direct with the pass.** Avoids the hosting problem, but still breaks the rule for the live
   picture, and keeps the camera service public.

## 6. Decisions needed

1. Is "frontends never talk to the camera service" firm for the **live picture** too, or only for data?
2. Can the backend run **always-on** (paid hosting, or beside the camera service)? Option 1 is hard on the free tier.
3. Should the camera service also **push events** to the backend (so the backend keeps occupancy and violation history), or stay the only store?
4. Cameras themselves (phone, ESP32) keep pushing frames **straight to the camera service**: assumed, since they cannot sit behind the backend's API. Say so
   if that is not what is wanted.
