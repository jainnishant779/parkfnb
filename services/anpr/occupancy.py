"""
Parking bay occupancy and parking quality from a camera frame.

The same detector that reads number plates also outputs vehicle boxes, so
occupancy needs geometry rather than a second model. What it does need is
the *right* geometry, and the obvious choice is wrong:

  IoU does not work here. A parking bay polygon and a vehicle's
  axis-aligned box have systematically different shapes. Under an oblique
  camera the box also contains the car's height projected into the image,
  so a perfectly parked car scores an IoU of only 0.3-0.5, and a threshold
  tuned for near bays is wrong for far ones. The published "optimal IoU"
  for this task ranges from 0.10 to 0.9 across papers, which is the tell
  that the metric itself is mis-specified.

  Instead: take the bottom strip of the vehicle box — roughly where the
  tyres meet tarmac — and measure its intersection against the bay
  polygon's own area. The bottom edge of a box lies approximately on the
  ground plane, so most of the perspective error cancels without needing a
  homography. Dividing by the bay area, not the union, keeps the number
  comparable between a hatchback and a bus.

A frame is a single observation, not a decision. `OccupancyTracker` folds
observations over time so a car driving past a bay does not flip it to
occupied. See its docstring.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from typing import Iterable, Sequence

import numpy as np
from shapely.geometry import Polygon, box as shapely_box
from shapely.validation import make_valid

# --- tuning -----------------------------------------------------------------
# Deliberately a band, not a single threshold: values in between keep the
# previous state, which is what stops a bay oscillating at the boundary.
OCCUPIED_AT = 0.50          # coverage >= this -> occupied
EMPTY_AT = 0.20             # coverage <= this -> empty

FOOTPRINT_FRACTION = 0.28   # bottom slice of the box treated as ground contact

# A vehicle overlapping a second bay by this much is straddling the line.
STRADDLE_AT = 0.25

# A two-wheeler occupies a car bay while covering a fraction of its area.
# The coverage ratio cannot see this — a motorcycle sitting inside a bay
# scores as highly as a car does — so it is flagged from box shape and size
# and reported alongside the state. A bay holding only a two-wheeler is
# genuinely occupied, but a bay that could still take a car alongside is a
# business decision, not a vision one: the flag lets the backend choose.
TWO_WHEELER_MAX_AREA_RATIO = 0.22   # box area vs bay area
TWO_WHEELER_MIN_ASPECT = 0.55       # h/w: tall for their width

EMPTY = "empty"
OCCUPIED = "occupied"
BADLY_PARKED = "badly_parked"
UNKNOWN = "unknown"


# --- geometry ---------------------------------------------------------------

def _poly(points: Sequence[Sequence[float]]) -> Polygon:
    """Build a bay polygon, repairing self-intersections from sloppy drawing."""
    p = Polygon([(float(x), float(y)) for x, y in points])
    if not p.is_valid:
        p = make_valid(p)
        if p.geom_type == "GeometryCollection":
            polys = [g for g in p.geoms if g.geom_type == "Polygon"]
            if not polys:
                raise ValueError("bay polygon has no usable area")
            p = max(polys, key=lambda g: g.area)
    return p


def ground_footprint(x1: float, y1: float, x2: float, y2: float,
                     fraction: float = FOOTPRINT_FRACTION) -> Polygon:
    """
    The part of a vehicle box that sits on the tarmac.

    Under an oblique camera the box contains the car's height projected up
    the image, so only its bottom slice is near the ground plane. Taking
    that slice cancels most of the perspective error without a homography,
    and stops a long evening shadow reaching into the next bay.

    Looking straight down there is no projected height to remove: the whole
    box already lies on the ground, and slicing it would push the footprint
    off the car and into the aisle behind — which reads a full bay as
    empty. `fraction=1.0` disables the slice for top-down cameras; see
    BayMap(view=...).
    """
    if fraction >= 1.0:
        return shapely_box(x1, y1, x2, y2)
    h = max(1.0, y2 - y1)
    return shapely_box(x1, y2 - h * fraction, x2, y2)


def coverage(bay: Polygon, footprint: Polygon) -> float:
    """
    How strongly a vehicle sits in a bay, as 0..1.

    Divided by the *smaller* of the two areas, never by the union. Two
    reasons:

      Dividing by the bay alone looks right but is not, because the
      footprint is only a slice of the vehicle box and can never cover a
      whole bay — a neatly parked car scores about 0.33, so any threshold
      above that rejects it. Calibrating the threshold down to suit would
      then make a car in the next bay, clipping the edge, look parked.

      Dividing by the smaller area asks the question that actually
      matters: is this footprint inside this bay? A car properly parked
      scores near 1.0 whatever its size, and a motorcycle would too —
      which is why two-wheelers are caught by box shape instead (see
      _looks_like_two_wheeler), not by this ratio.
    """
    if bay.area <= 0 or footprint.area <= 0:
        return 0.0
    try:
        inter = footprint.intersection(bay).area
    except Exception:
        return 0.0
    return float(inter / min(bay.area, footprint.area))


def bay_axis_degrees(bay: Polygon) -> float:
    """
    Orientation of the bay's long axis, from its minimum rotated rectangle.
    Used to judge whether a vehicle sits square in the bay.
    """
    rect = bay.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    edges = [
        (math.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]),
         math.degrees(math.atan2(ys[i + 1] - ys[i], xs[i + 1] - xs[i])))
        for i in range(4)
    ]
    _, angle = max(edges, key=lambda e: e[0])
    return angle % 180.0


# --- one frame --------------------------------------------------------------

@dataclass
class Detection:
    """A vehicle box from the detector, in pixels."""
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float = 0.0

    @property
    def width(self) -> float:
        return max(1.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height


@dataclass
class BayObservation:
    """What one bay looked like in one frame."""
    bay_id: str
    state: str
    coverage: float
    vehicle_index: int | None = None
    confidence: float = 0.0
    straddles: list[str] = field(default_factory=list)
    angle_offset: float | None = None
    two_wheeler: bool = False
    note: str = ""

    def dict(self):
        return asdict(self)


class BayMap:
    """
    The bays for one camera: polygon per bay, drawn once during install.

        bays = BayMap({"A-01": [[100,400],[300,400],[310,520],[95,520]]})
        obs = bays.observe(detections)

    Each vehicle is assigned to exactly one bay — the one it covers most.
    Without that rule a single car straddling a line marks two bays
    occupied and the lot reports negative free space.
    """

    def __init__(self, bays: dict[str, Sequence[Sequence[float]]],
                 view: str = "oblique"):
        """
        view: "oblique" for a camera on a pole looking along the rows —
        the normal install, where a vehicle box contains projected height
        that has to be sliced away. "topdown" for a camera looking straight
        down, where the box is already on the ground and slicing it would
        push the footprint off the car into the aisle behind.
        """
        if not bays:
            raise ValueError("no bays defined")
        if view not in ("oblique", "topdown"):
            raise ValueError("view must be 'oblique' or 'topdown'")
        self.view = view
        self.footprint_fraction = 1.0 if view == "topdown" else FOOTPRINT_FRACTION
        self.polygons: dict[str, Polygon] = {k: _poly(v) for k, v in bays.items()}
        self.axes: dict[str, float] = {
            k: bay_axis_degrees(p) for k, p in self.polygons.items()
        }

    @property
    def bay_ids(self) -> list[str]:
        return list(self.polygons)

    def _looks_like_two_wheeler(self, det: Detection, bay: Polygon) -> bool:
        if bay.area <= 0:
            return False
        small = det.area / bay.area < TWO_WHEELER_MAX_AREA_RATIO
        tall = det.height / det.width > TWO_WHEELER_MIN_ASPECT
        return small and tall

    def observe(self, detections: Iterable[Detection]) -> list[BayObservation]:
        dets = list(detections)
        footprints = [ground_footprint(d.x1, d.y1, d.x2, d.y2,
                                       self.footprint_fraction) for d in dets]

        # coverage[bay][vehicle]
        grid: dict[str, list[float]] = {
            bid: [coverage(poly, fp) for fp in footprints]
            for bid, poly in self.polygons.items()
        }

        # Each vehicle goes to its best bay, so one car never fills two.
        owner: dict[int, str] = {}
        for vi in range(len(dets)):
            scores = {bid: grid[bid][vi] for bid in self.polygons}
            best = max(scores, key=scores.get) if scores else None
            if best is not None and scores[best] > 0:
                owner[vi] = best

        out: list[BayObservation] = []
        for bid, poly in self.polygons.items():
            mine = [vi for vi, b in owner.items() if b == bid]
            if not mine:
                out.append(BayObservation(bid, EMPTY, 0.0))
                continue

            vi = max(mine, key=lambda i: grid[bid][i])
            det = dets[vi]
            cov = grid[bid][vi]
            two = self._looks_like_two_wheeler(det, poly)

            if cov >= OCCUPIED_AT:
                state = OCCUPIED
            elif cov <= EMPTY_AT:
                state = EMPTY
            else:
                state = UNKNOWN          # inside the hysteresis band

            # Straddling: meaningful coverage of a *second* bay at the same time.
            straddles = [
                other for other in self.polygons
                if other != bid and grid[other][vi] >= STRADDLE_AT
            ]
            if state == OCCUPIED and straddles:
                state = BADLY_PARKED

            # Angle is advisory only. An axis-aligned box cannot tell a car
            # at 30 degrees from a large vehicle parked straight, so this is
            # reported but never used to decide the state.
            angle_offset = None
            if state in (OCCUPIED, BADLY_PARKED):
                box_axis = 0.0 if det.width >= det.height else 90.0
                diff = abs(box_axis - self.axes[bid]) % 180.0
                angle_offset = round(min(diff, 180.0 - diff), 1)

            out.append(BayObservation(
                bay_id=bid,
                state=state,
                coverage=round(cov, 3),
                vehicle_index=vi,
                confidence=round(det.confidence, 3),
                straddles=straddles,
                angle_offset=angle_offset,
                two_wheeler=two,
                note="two-wheeler threshold applied" if two else "",
            ))

        return out


# --- over time --------------------------------------------------------------

@dataclass
class BayState:
    bay_id: str
    state: str = UNKNOWN
    since: float = field(default_factory=time.time)
    coverage: float = 0.0
    straddles: list[str] = field(default_factory=list)
    two_wheeler: bool = False
    changed: bool = False

    def dict(self):
        d = asdict(self)
        d["held_for_seconds"] = round(time.time() - self.since, 1)
        return d


class OccupancyTracker:
    """
    Turns a stream of frames into stable bay states.

    A single frame is a bad decision-maker: a car driving past a bay covers
    it for one or two frames, and a person walking through briefly hides a
    parked car. So observations go into a rolling window and only a
    majority flips the state.

    The window is asymmetric on purpose. Becoming occupied is quick;
    becoming empty is slow. Freeing a bay that someone has paid for,
    because a passer-by blocked the camera for four seconds, is a much
    worse failure than holding it a few seconds too long.

    Sample every 3-5 seconds, not at video rate. Parking does not change
    faster than that, and at that cadence one CPU serves many cameras.
    """

    def __init__(self, bay_map: BayMap, window: int = 6,
                 occupy_votes: int = 3, free_votes: int = 5):
        if free_votes > window or occupy_votes > window:
            raise ValueError("vote counts cannot exceed the window")
        self.map = bay_map
        self.window = window
        self.occupy_votes = occupy_votes
        self.free_votes = free_votes
        self.history: dict[str, deque[BayObservation]] = {
            b: deque(maxlen=window) for b in bay_map.bay_ids
        }
        self.states: dict[str, BayState] = {
            b: BayState(b) for b in bay_map.bay_ids
        }

    def update(self, detections: Iterable[Detection]) -> dict[str, BayState]:
        for obs in self.map.observe(detections):
            hist = self.history[obs.bay_id]
            hist.append(obs)
            cur = self.states[obs.bay_id]
            cur.changed = False

            votes = [o.state for o in hist]
            occupied_like = sum(1 for v in votes if v in (OCCUPIED, BADLY_PARKED))
            empty_like = sum(1 for v in votes if v == EMPTY)

            new = cur.state
            if occupied_like >= self.occupy_votes:
                # Prefer the badly-parked reading only if it is the majority
                # of the occupied votes, so one shadowed frame cannot raise
                # a misparking alert.
                bad = sum(1 for o in hist if o.state == BADLY_PARKED)
                new = BADLY_PARKED if bad * 2 > occupied_like else OCCUPIED
            elif empty_like >= self.free_votes:
                new = EMPTY

            if new != cur.state:
                cur.state = new
                cur.since = time.time()
                cur.changed = True

            cur.coverage = obs.coverage
            cur.straddles = obs.straddles
            cur.two_wheeler = obs.two_wheeler

        return self.states

    def summary(self) -> dict:
        s = self.states.values()
        return {
            "total": len(self.states),
            "occupied": sum(1 for b in s if b.state == OCCUPIED),
            "empty": sum(1 for b in s if b.state == EMPTY),
            "badly_parked": sum(1 for b in s if b.state == BADLY_PARKED),
            "unknown": sum(1 for b in s if b.state == UNKNOWN),
            "bays": {b.bay_id: b.dict() for b in s},
        }


# --- drawing ----------------------------------------------------------------

COLOURS = {
    EMPTY: (110, 180, 60),        # BGR green
    OCCUPIED: (40, 40, 210),      # red
    BADLY_PARKED: (0, 160, 240),  # amber
    UNKNOWN: (150, 150, 150),
}


def annotate(frame, bay_map: BayMap, states: dict[str, BayState],
             detections: Iterable[Detection] | None = None):
    """Draw bays tinted by state, with the id and coverage written on each."""
    import cv2

    img = frame.copy()
    overlay = img.copy()

    for bid, poly in bay_map.polygons.items():
        pts = np.array(poly.exterior.coords[:-1], dtype=np.int32)
        st = states.get(bid)
        colour = COLOURS.get(st.state if st else UNKNOWN, COLOURS[UNKNOWN])
        cv2.fillPoly(overlay, [pts], colour)
        cv2.polylines(img, [pts], True, colour, 2)

    cv2.addWeighted(overlay, 0.28, img, 0.72, 0, img)

    for bid, poly in bay_map.polygons.items():
        st = states.get(bid)
        cx, cy = poly.centroid.x, poly.centroid.y
        label = bid
        if st and st.state != EMPTY:
            label = f"{bid} {st.coverage:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(img, (int(cx - tw / 2) - 4, int(cy - th) - 4),
                      (int(cx + tw / 2) + 4, int(cy) + 4), (20, 20, 20), -1)
        cv2.putText(img, label, (int(cx - tw / 2), int(cy)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

        if st and st.state == BADLY_PARKED:
            cv2.putText(img, "BADLY PARKED", (int(cx - 62), int(cy + 20)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOURS[BADLY_PARKED],
                        2, cv2.LINE_AA)

    for d in (detections or []):
        cv2.rectangle(img, (int(d.x1), int(d.y1)), (int(d.x2), int(d.y2)),
                      (200, 200, 200), 1)
        fp = ground_footprint(d.x1, d.y1, d.x2, d.y2,
                              bay_map.footprint_fraction)
        fx1, fy1, fx2, fy2 = fp.bounds
        cv2.rectangle(img, (int(fx1), int(fy1)), (int(fx2), int(fy2)),
                      (255, 220, 60), 2)

    return img
