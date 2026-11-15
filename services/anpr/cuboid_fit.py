"""
A 3D box for each car, fitted to its silhouette with the calibrated camera.

Why
---
The ground-contact verdict (contact.py) reads a car's lines from the lowest points of its silhouette, and those are
the bumper and the sills, not the tyres, so it cannot tell a car that overhangs a line from one that is over it.  It
also cannot say anything about a car that is parked sideways, or half hidden behind another one.  A box of the
right size, put where the car really is, answers all three: it has a front, a width and a heading.

How (render and compare, after DirectShape / 3D-RCNN, but only 3 unknowns because the camera and the ground
plane are already known)
---
Unknowns: the car's centre (x, y) on the ground and its heading, in the site's ground frame (metres; the camera
is at the origin, Y points away from it; see calibration.py).  Its size comes from a small table of typical cars.

  1. Start where the silhouette's centre of mass points to: its pixel, cast onto a plane 0.8 m up.
  2. Try every size class, a grid of headings and positions around that start, project the 8 corners of each
     candidate box with Camera.project (z = 0 and z = height) and score it by the overlap (IoU) of its outline with
     the silhouette.
  3. Refine the best one with a small pattern search.
  4. Pixels covered by a *nearer* car's silhouette are left out of the score, so a car hidden behind another one is
     fitted on what can be seen, and the box says how much of it that was (`visible_share`).

A fit is `good` when it matches well and most of the box is visible, `partial` when it matches the visible part, and
`poor` otherwise (nothing is drawn or concluded from a poor fit).
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import cv2
import numpy as np
from shapely.geometry import Polygon

# length, width, height in metres: typical Indian cars (hatchback / sedan / SUV-MUV / van)
CLASSES = {"hatchback": (3.8, 1.68, 1.52), "sedan": (4.4, 1.73, 1.48), "suv": (4.6, 1.85, 1.75), "van": (4.9, 1.90, 2.00)}

GOOD_IOU, PARTIAL_IOU = 0.70, 0.60
GOOD_VISIBLE, PARTIAL_VISIBLE = 0.80, 0.35
CANVAS = 96                      # the longest side of the comparison picture, in pixels
START_HEIGHT_M = 0.8             # the silhouette's centre of mass is about this high
SEARCH_M, SEARCH_STEP_M, YAW_STEP_DEG = 1.2, 0.3, 15


@dataclass
class CarFit:
    cls: str
    x: float                     # centre, site ground frame (m)
    y: float
    yaw_deg: float               # heading of the long axis, from the ground frame's +X axis, 0..180
    length: float
    width: float
    height: float
    iou: float
    visible_share: float         # share of the box's outline not covered by a nearer car
    quality: str                 # "good" | "partial" | "poor"
    base_world: np.ndarray = field(repr=False, default=None)     # 4 x 2 footprint corners (m)
    base_px: np.ndarray = field(repr=False, default=None)        # 4 x 2, the same corners in the picture
    roof_px: np.ndarray = field(repr=False, default=None)        # 4 x 2, the roof corners in the picture
    ms: float = 0.0

    @property
    def footprint(self) -> Polygon:
        return Polygon([tuple(p) for p in self.base_world])


def _corners(cx, cy, yaw_rad, length, width) -> np.ndarray:
    """Footprint corners (4 x 2) for arrays of centres/headings: shape (N, 4, 2)."""
    cx, cy, yaw = np.atleast_1d(cx), np.atleast_1d(cy), np.atleast_1d(yaw_rad)
    ux, uy = np.cos(yaw), np.sin(yaw)                  # the long axis
    vx, vy = -uy, ux                                   # the width axis
    out = np.empty((len(cx), 4, 2))
    for i, (a, b) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        out[:, i, 0] = cx + a * length / 2 * ux + b * width / 2 * vx
        out[:, i, 1] = cy + a * length / 2 * uy + b * width / 2 * vy
    return out


def _project(cam, base: np.ndarray, height: float) -> np.ndarray:
    """(N, 4, 2) footprints to (N, 8, 2) pixels: the 4 base corners then the 4 roof corners."""
    n = len(base)
    flat = base.reshape(-1, 2)
    lo = cam.project(flat, 0.0).reshape(n, 4, 2)
    hi = cam.project(flat, height).reshape(n, 4, 2)
    return np.concatenate([lo, hi], axis=1)


class _Scene:
    """The silhouette and the nearer cars' silhouettes on a small canvas around the car."""

    def __init__(self, outline: np.ndarray, occluders: list):
        pts = np.asarray(outline, dtype=np.float64).reshape(-1, 2)
        x0, y0 = pts.min(axis=0)
        x1, y1 = pts.max(axis=0)
        w, h = max(x1 - x0, 1.0), max(y1 - y0, 1.0)
        pad = 0.45
        self.ox, self.oy = x0 - pad * w, y0 - pad * h
        self.scale = CANVAS / (max(w, h) * (1 + 2 * pad))
        self.w = int(math.ceil((w * (1 + 2 * pad)) * self.scale)) + 2
        self.h = int(math.ceil((h * (1 + 2 * pad)) * self.scale)) + 2
        self.mask = self._fill([outline])
        self.occ = self._fill(occluders)
        self.free = cv2.bitwise_not(self.occ)
        self.mask_free = cv2.bitwise_and(self.mask, self.free)
        self.mask_area = int(cv2.countNonZero(self.mask))
        self._canvas = np.zeros((self.h, self.w), np.uint8)

    def to_canvas(self, px: np.ndarray) -> np.ndarray:
        return (np.asarray(px, dtype=np.float64) - (self.ox, self.oy)) * self.scale

    def _fill(self, outlines) -> np.ndarray:
        img = np.zeros((self.h, self.w), np.uint8)
        for o in outlines:
            if o is None or len(o) < 3:
                continue
            cv2.fillPoly(img, [np.round(self.to_canvas(o)).astype(np.int32)], 255)
        return img

    def score(self, px8: np.ndarray) -> tuple[float, float]:
        """(IoU on the pixels no nearer car covers, share of the candidate's outline that is not covered)."""
        hull = cv2.convexHull(np.round(self.to_canvas(px8)).astype(np.int32))
        c = self._canvas
        c[:] = 0
        cv2.fillConvexPoly(c, hull, 255)
        area = cv2.countNonZero(c)
        if area == 0:
            return 0.0, 0.0
        cand_free = cv2.bitwise_and(c, self.free)
        inter = cv2.countNonZero(cv2.bitwise_and(cand_free, self.mask))
        union = cv2.countNonZero(cv2.bitwise_or(cand_free, self.mask_free))
        return (inter / union if union else 0.0), cv2.countNonZero(cand_free) / area


def back_project_at(cam, uv, z: float) -> np.ndarray:
    """The ground-frame point under a pixel on the plane z metres up (a camera `z` lower sees the ground there)."""
    low = type(cam)(cam.focal_px, cam.pitch_deg, cam.roll_deg, max(cam.height_m - z, 0.3), cam.image_size)
    return low.back_project(np.asarray(uv, dtype=np.float64).reshape(-1, 2))[0]


def fit_car(cam, outline, occluders: list | None = None, classes: dict | None = None) -> CarFit | None:
    """The best box for one silhouette, or None when there is nothing to fit (no camera, no outline, off the horizon)."""
    t0 = time.perf_counter()
    if cam is None or outline is None or len(outline) < 3:
        return None
    classes = classes or CLASSES
    scene = _Scene(np.asarray(outline, dtype=np.float64), occluders or [])
    if scene.mask_area < 12:
        return None
    m = cv2.moments(scene.mask, binaryImage=True)
    if m["m00"] <= 0:
        return None
    cu = scene.ox + (m["m10"] / m["m00"]) / scene.scale
    cv_ = scene.oy + (m["m01"] / m["m00"]) / scene.scale
    start = back_project_at(cam, [cu, cv_], START_HEIGHT_M)
    if not np.isfinite(start).all():
        return None

    # 2. coarse search, every size class
    offs = np.arange(-SEARCH_M, SEARCH_M + 1e-9, SEARCH_STEP_M)
    gx, gy, gyaw = np.meshgrid(start[0] + offs, start[1] + offs, np.radians(np.arange(0, 180, YAW_STEP_DEG)), indexing="ij")
    gx, gy, gyaw = gx.ravel(), gy.ravel(), gyaw.ravel()
    best = (-1.0, None)
    for name, (length, width, height) in classes.items():
        px = _project(cam, _corners(gx, gy, gyaw, length, width), height)
        for i in range(len(gx)):
            iou, _ = scene.score(px[i])
            if iou > best[0]:
                best = (iou, (name, gx[i], gy[i], gyaw[i]))
    name, x, y, yaw = best[1]
    length, width, height = classes[name]

    # 3. refine: a pattern search around the best, steps halving
    step_xy, step_yaw = 0.15, math.radians(6)
    cur = best[0]
    for _ in range(14):
        improved = False
        for dx, dy, dyaw in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
            cx, cy, cyaw = x + dx * step_xy, y + dy * step_xy, yaw + dyaw * step_yaw
            iou, _ = scene.score(_project(cam, _corners(cx, cy, cyaw, length, width), height)[0])
            if iou > cur + 1e-4:
                cur, x, y, yaw, improved = iou, cx, cy, cyaw, True
        if not improved:
            step_xy, step_yaw = step_xy / 2, step_yaw / 2
            if step_xy < 0.02:
                break

    base = _corners(x, y, yaw, length, width)
    px8 = _project(cam, base, height)
    iou, visible = scene.score(px8[0])
    if iou >= GOOD_IOU and visible >= GOOD_VISIBLE:
        quality = "good"
    elif iou >= PARTIAL_IOU and visible >= PARTIAL_VISIBLE:
        quality = "partial"
    else:
        quality = "poor"
    return CarFit(cls=name, x=float(x), y=float(y), yaw_deg=float(math.degrees(yaw) % 180.0), length=length, width=width,
                  height=height, iou=float(iou), visible_share=float(visible), quality=quality, base_world=base[0],
                  base_px=px8[0, :4], roof_px=px8[0, 4:], ms=(time.perf_counter() - t0) * 1000.0)


# ---------------------------------------------------------------- the box against the bays

def bay_world_polygon(cal, bay_id: str) -> np.ndarray | None:
    """A bay's four corners in the site ground frame (near-left, near-right, far-right, far-left)."""
    c = cal.bays.get(bay_id)
    if c is None or c.frame is None:
        return None
    w, l = c.frame.width_m, c.frame.length_m
    return cal.stall_to_world(bay_id, [(0, 0), (w, 0), (w, l), (0, l)])


def bay_overlaps(cal, footprint: Polygon) -> dict:
    """{bay_id: share of the car's footprint that lies inside that bay}, only for bays it touches."""
    out = {}
    if footprint.area <= 0:
        return out
    for bid in cal.bays:
        corners = bay_world_polygon(cal, bid)
        if corners is None:
            continue
        share = footprint.intersection(Polygon([tuple(p) for p in corners])).area / footprint.area
        if share > 0.01:
            out[bid] = round(float(share), 3)
    return out


def edge_overshoot(bay_corners: np.ndarray, points: np.ndarray, signed: bool = False) -> dict:
    """How far (m) the points reach past each of a bay's four edges, measured square to the edge.
    Corners are near-left, near-right, far-right, far-left; a point inside the bay gives 0 for every side.
    With `signed`, a negative number is the gap left between the outermost point and that edge (the clearance)."""
    pts = np.asarray(points, dtype=np.float64).reshape(-1, 2)
    c = np.asarray(bay_corners, dtype=np.float64)
    centre = c.mean(axis=0)
    out = {}
    for side, (a, b) in {"near": (0, 1), "right": (1, 2), "far": (2, 3), "left": (3, 0)}.items():
        e = c[b] - c[a]
        n = np.array([e[1], -e[0]]) / (np.linalg.norm(e) or 1.0)
        if np.dot(c[a] - centre, n) < 0:                  # make the normal point away from the bay
            n = -n
        d = float(((pts - c[a]) @ n).max())
        out[side] = d if signed else max(0.0, d)
    return out


def camera_facing_sides(footprint_corners: np.ndarray) -> list:
    """For each of a footprint's 4 side faces (face i stands on the edge from corner i to corner i+1): is it turned
    to the camera (which is at the ground frame's origin, well above the car)?  The roof always is."""
    f = np.asarray(footprint_corners, dtype=np.float64)
    centre = f.mean(axis=0)
    out = []
    for i in range(4):
        d = f[(i + 1) % 4] - f[i]
        m = np.array([d[1], -d[0]]) / (np.linalg.norm(d) or 1.0)
        mid = (f[i] + f[(i + 1) % 4]) / 2.0
        if np.dot(mid - centre, m) < 0:
            m = -m                                          # point it away from the car
        out.append(bool(np.dot(m, -mid) > 0))                # the camera is at the origin: the way to it is -mid
    return out


def edge_towards(bay_corners: np.ndarray, footprint_corners: np.ndarray, side: str) -> int:
    """Which footprint edge (0..3, edge i runs from corner i to corner i+1) faces a bay's `side` line: the one whose
    outward normal points most the way the bay's edge faces.  For drawing the crossing edge of a box."""
    c = np.asarray(bay_corners, dtype=np.float64)
    a, b = {"near": (0, 1), "right": (1, 2), "far": (2, 3), "left": (3, 0)}[side]
    e = c[b] - c[a]
    n = np.array([e[1], -e[0]]) / (np.linalg.norm(e) or 1.0)
    if np.dot(c[a] - c.mean(axis=0), n) < 0:
        n = -n
    f = np.asarray(footprint_corners, dtype=np.float64)
    centre = f.mean(axis=0)
    best, which = -2.0, 0
    for i in range(4):
        d = f[(i + 1) % 4] - f[i]
        m = np.array([d[1], -d[0]]) / (np.linalg.norm(d) or 1.0)
        if np.dot(f[i] - centre, m) < 0:
            m = -m
        score = float(np.dot(m, n))
        if score > best:
            best, which = score, i
    return which


class FitCache:
    """
    The fitted box of each tracked car, kept while the car sits still.  A parked car does not move, so the (0.15 s)
    fit is done once and reused; it is redone when the car's box moves or changes size, when the camera calibration
    changes, or after `max_age_s`.  At most `max_new` cars are fitted per call, so one frame never stalls the feed.
    """

    def __init__(self, max_age_s: float = 120.0, forget_s: float = 60.0, move_px: float = 8.0, max_new: int = 1):
        self.max_age_s, self.forget_s, self.move_px, self.max_new = max_age_s, forget_s, move_px, max_new
        self._d: dict = {}                                # track id -> {bbox, cal, fit, t, seen}

    def _stale(self, e, bbox, cal_key, now) -> bool:
        if e is None or e["cal"] != cal_key or now - e["t"] > self.max_age_s:
            return True
        ox, oy = (e["bbox"][0] + e["bbox"][2]) / 2, (e["bbox"][1] + e["bbox"][3]) / 2
        nx, ny = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        w0, w1 = e["bbox"][2] - e["bbox"][0], bbox[2] - bbox[0]
        return math.hypot(nx - ox, ny - oy) > self.move_px or abs(w1 - w0) > 0.10 * max(w0, 1.0)

    def update(self, camera, cal_key, cars: list, now: float) -> dict:
        """`cars` is [(track_id, bbox, outline)].  Returns {track_id: CarFit | None} for every car given."""
        out, todo = {}, []
        for tid, bbox, outline in cars:
            e = self._d.get(tid)
            if self._stale(e, bbox, cal_key, now):
                todo.append((tid, bbox, outline))
            if e is not None:
                e["seen"] = now
                out[tid] = e["fit"]
        # fit the cars with no fit at all first, then the ones whose fit is out of date; nearest to the camera first
        todo.sort(key=lambda c: (c[0] in out, -c[1][3]))
        for tid, bbox, outline in todo[:self.max_new]:
            occluders = [o for t, b, o in cars if t != tid and b[3] > bbox[3] + 6]
            fit = fit_car(camera, outline, occluders)
            self._d[tid] = {"bbox": tuple(bbox), "cal": cal_key, "fit": fit, "t": now, "seen": now}
            out[tid] = fit
        for tid in [t for t, e in self._d.items() if now - e["seen"] > self.forget_s]:
            del self._d[tid]
        return out


def relative_yaw_deg(cal, bay_id: str, yaw_deg: float) -> float:
    """How far (0..90 degrees) a car's long axis is turned from its bay's depth axis."""
    corners = bay_world_polygon(cal, bay_id)
    if corners is None:
        return 0.0
    d = corners[3] - corners[0]                           # the bay's depth axis (near-left to far-left)
    axis = math.degrees(math.atan2(d[1], d[0])) % 180.0
    diff = abs(yaw_deg - axis) % 180.0
    return float(min(diff, 180.0 - diff))
