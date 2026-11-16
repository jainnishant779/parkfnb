# Bay occupancy and parking quality

Answers three questions from the same camera and the same detector that
reads number plates:

- Is this bay free or taken?
- Is the car parked inside its lines, or across two bays?
- Is that a car or a two-wheeler?

No second model. The detector already emits vehicle boxes; what this adds
is geometry, a temporal filter, and an honest set of thresholds.

---

## Use it

```bash
# 1. Register the bays for a camera (once, at install)
curl -X POST localhost:8008/occupancy/bays \
  -H "Content-Type: application/json" \
  -d '{"camera_id":"lot-1","view":"oblique",
       "bays":{"A-01":[[100,400],[300,400],[310,520],[95,520]],
               "A-02":[[300,400],[500,400],[505,520],[310,520]]}}'

# 2. Send frames
curl -F "image=@frame.jpg" -F "camera_id=lot-1" \
     localhost:8008/occupancy/check

# 3. Read the current state without sending anything
curl "localhost:8008/occupancy/state?camera_id=lot-1"
```

| Endpoint | Does |
|---|---|
| `POST /occupancy/bays` | Register or replace a camera's bay polygons |
| `POST /occupancy/check` | One frame in, bay states out |
| `GET /occupancy/state` | Last known state, no frame needed |

`/occupancy/check` takes `track` (default true), `conf` (0.10) and `imgsz`
(1280). `track=false` returns the raw single-frame reading, which is what
you want while tuning thresholds; `track=true` returns the debounced state,
which is what production should use.

Measured: **402 ms per frame** on a 4-core laptop CPU, 12 bays, 1200x800.
Cost is per *frame*, not per bay — a hundred bays costs the same as ten.

---

## Why not IoU

The obvious metric is wrong, and this is the part worth understanding.

A bay polygon and a vehicle's axis-aligned box have systematically
different shapes. Under an oblique camera the box also contains the car's
height projected up the image, so a perfectly parked car scores an IoU of
only 0.3-0.5 — and a threshold tuned for near bays is wrong for far ones.

The tell is in the literature: published "optimal IoU" for this task ranges
from 0.10 to 0.9 across papers. That spread is not a range to pick from. It
means everyone is tuning around a mis-specified metric.

**What this uses instead:**

1. Take the **bottom ~28% of the vehicle box** — roughly where the tyres
   meet tarmac. The bottom edge of a box lies near the ground plane, so
   most of the perspective error cancels without needing a homography. It
   also stops a long evening shadow reaching into the next bay.

2. Divide the intersection by the **smaller of the two areas**, never the
   union. This asks the question that actually matters — *is this footprint
   inside this bay?* — and gives ~1.0 for a properly parked car regardless
   of whether it is a hatchback or a bus.

3. Assign each vehicle to **exactly one bay**, the one it covers most.
   Without that rule a car straddling a line marks two bays occupied and
   the lot reports negative free space.

With perfect detections the geometry scores 12/12 on a 12-bay row.

### Camera view matters

```
POST /occupancy/bays  {"view": "oblique"}   default
POST /occupancy/bays  {"view": "topdown"}
```

The footprint slice only makes sense when the camera sees the car from the
side. Looking straight down there is no projected height to remove: the box
is already on the ground, and slicing it pushes the footprint off the car
and into the aisle behind — which reads a full bay as empty.

`view: "topdown"` disables the slice. Getting this wrong is silent and
looks like a detection problem, so set it when you register the bays.

---

## Thresholds

| | |
|---|---|
| `coverage ≥ 0.50` | occupied |
| `coverage ≤ 0.20` | empty |
| in between | hold the previous state |

The middle band is not indecision, it is hysteresis. Without it a bay on
the boundary flickers between states every frame.

`STRADDLE_AT = 0.25` — a vehicle covering a *second* bay by this much is
across the line.

---

## A frame is not a decision

A car driving past covers a bay for one or two frames. A person walking
through briefly hides a parked one. So `OccupancyTracker` votes over a
rolling window, and the window is **asymmetric on purpose**:

| | Frames needed |
|---|---|
| empty → occupied | 3 |
| occupied → empty | 5 |

Becoming occupied is quick; becoming free is slow. Freeing a bay somebody
has paid for, because a passer-by blocked the camera for four seconds, is a
far worse failure than holding it a few seconds too long.

**Sample every 3-5 seconds, not at video rate.** Parking does not change
faster than that, and at that cadence the 400 ms cost per frame means one
CPU serves many cameras.

Verified: a settled `occupied` bay survives two fully-blocked frames
without being freed.

---

## Badly parked

Reported when a vehicle covers a second bay by ≥0.25 while being assigned
to its own. Ships as an **advisory flag, not an enforcement trigger**, for
three reasons:

- The whole published literature on misparking accuracy is essentially one
  datapoint: 87% (motorcycles, Indonesia, a purpose-built segmentation
  system). That is the *good* result, not the floor.
- Long shadows extend the apparent vehicle region into the next bay. The
  footprint slice reduces this but does not remove it.
- An axis-aligned box cannot distinguish a car at 30° from a large vehicle
  parked straight. The angle is reported in `angle_offset` and deliberately
  never used to decide state.

Doing this properly needs oriented boxes (YOLO-OBB), which means retraining
the detector on re-annotated Indian data — three to four weeks, with no
controlled evidence it beats the overlap method for this task.

---

## Two-wheelers

The India-specific case nobody's dataset covers.

A motorcycle in a car bay scores just as highly on coverage as a car does,
so the ratio cannot see it. It is flagged instead from box shape and size —
small relative to the bay, and tall for its width — and returned as
`two_wheeler: true` alongside the state.

The bay *is* occupied. Whether it could still take a car alongside is a
business decision, not a vision one, so the flag is surfaced rather than
resolved here.

**This is the assumption most likely to be wrong.** There is no public
Indian parking-occupancy dataset; the shape heuristic is reasoning from
geometry, not measurement. Build a few hundred labelled frames from a real
Indian lot before trusting the thresholds.

---

## Camera requirements — say these before installation, not after

| | |
|---|---|
| Height | 8-12 m |
| Aim | Down the rows, along the parking axis |
| Depth | Maximum 2 rows from any one camera |
| Coverage | 25-40 bays per camera |
| Lens | No fisheye |

**Occlusion cannot be fixed in software.** A car in row 1 physically blocks
row 2; those pixels were never captured. A bird's-eye homography rectifies
the ground plane, which is genuinely useful for perspective, but it cannot
recover information the sensor never had — it smears the occluding car into
a streak over the row behind.

The fix is camera placement. Not maths.

---

## What accuracy to claim

> 90-95% per-bay occupancy in daylight on a correctly-sited camera, after a
> short per-site calibration. Degraded at night and in heavy rain. Bays with
> line-of-sight occlusion excluded.

The 98-99% figures in the papers are **same-camera, daytime, fair-weather**
numbers, with the model trained on labelled crops from that exact camera.
Point the same model at a different camera and published results drop to
**77.7%**; on an unseen lot, ~89%. Night costs roughly 23 points, rain 16.

Of the four main public datasets, PKLot has **zero** night images and none
have any snow or fog. Every headline number in this field carries that
caveat whether or not it is printed.

Fine-tuning on ~1,000 labelled samples from the target lot recovers ~97% —
an afternoon of labelling per site, and the honest answer to "why does it
need calibration".

---

## Known limits in this build

**Detection recall on top-down views is the real ceiling, not the
geometry.** Measured on a 25-car overhead lot photo:

| Settings | Cars found |
|---|---|
| conf 0.25, 960px | 7 / 25 |
| conf 0.10, 1280px | 17 / 25 |
| conf 0.05, 1536px | 22 / 25 |

The detector was trained on side-on Indian vehicles — a gate camera's view.
From directly above a car shows its roof and no plate, which is close to
unseen data. For comparison, stock COCO YOLO11n found **zero** cars in the
same image and labelled 21 regions "cell phone" at low confidence, so this
model is still the better starting point.

Two ways forward: mount cameras obliquely, where this detector is already
strong, or fine-tune on a few hundred overhead frames.

Also unhandled: night and IR, heavy rain and wet reflective tarmac, and
camera drift. Drift especially — mast vibration and maintenance move the
view out from under the polygons, and nothing currently detects that. A
stored reference frame plus a periodic feature-match would turn silent rot
into a "recalibrate" alert. Worth building before any pilot.
