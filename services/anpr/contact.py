"""
Ground-contact geometry: where a vehicle actually meets the tarmac, measured
against the stall it is parked in.

Why this exists
---------------
The old footprint was the bottom slice of the detection box.  On an oblique
camera that slice is the rear bumper only -- about 0.6 m of a 4.4 m car -- so a
car whose front wheel sits on the bay line was reported as "8% outside" and
CORRECT.  Rotating that slice cannot fix it; it samples the wrong part of the car.

What commercial systems do instead (Hikvision/Dahua "line-pressing", Milesight
"across spaces", the Cloudparc patent) is compare the vehicle's *real pixels*
with the drawn bay.  On an oblique camera the full silhouette over-reports,
because roof and pillars project over the neighbouring bay, so only the
*ground-contact* part of the silhouette is used here.

How
---
1. Every drawn bay is four ground points of a stall of known size, so it gives a
   homography for free -- and from that homography the camera itself: focal
   length, height, the ground point beneath it, and the image point where
   world-vertical lines converge (the vertical vanishing point).
2. The ground-contact points of a silhouette are the ones nearest that vanishing
   point: along any world-vertical line, the point closest to it is the lowest.
   So the contact chain is the part of the silhouette's convex hull that *faces*
   the vanishing point -- not "the bottom of the hull in the image", which picks
   up body panels on cars off to the side of the frame.
3. Those points still sit up to ~0.3 m above the tarmac (bumper, sill).  With the
   camera known, that is undone by pulling each point toward the spot under the
   camera.  The correction only ever moves points inward, so it cannot invent a
   crossing.

The effect of each step is measured against exact ground truth in
tests/test_contact.py (a synthetic pinhole renderer), not assumed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

import cv2
import numpy as np
from shapely.geometry import Polygon

from homography import HomographyCalibrator

# Indian IRC car stall; overridable per bay.
STALL_WIDTH_M = 2.5
STALL_LENGTH_M = 5.0

# Height assumed for every contact point when correcting for projection.  The
# bumper's lower edge is the highest thing on the contact chain; assuming it for
# all points keeps the correction conservative (tyres are then under-reported).
CONTACT_HEIGHT_M = 0.30

# Fallback when the camera cannot be recovered: keep hull edges whose outward
# normal is within this angle of straight down in the image.
MAX_CONTACT_NORMAL_DEG = 75.0

# Skew is only claimed when the contact edges are long enough to fix an angle
# and agree with each other about it.
MIN_SKEW_EXTENT_M = 1.2
MIN_SKEW_AGREEMENT = 0.6

MIN_CROSSING_M = 0.10

# Contact points this close to the image edge are treated as clipping artefacts.
BORDER_PX = 2

VEHICLE_LENGTH_PRIOR_M = 4.4
VEHICLE_WIDTH_PRIOR_M = 1.8
VEHICLE_HEIGHT_PRIOR_M = 1.5    # display only: the car's 3D box in the overlay

# Bay-relative analysis (display, not verdicts).  A side is "measured" when an
# observed contact point reaches within this distance of the reconstructed
# footprint's edge on that side; otherwise the edge is the size prior.
MEASURED_SIDE_TOL_M = 0.15
# A 1.8 m car centred in a 2.5 m stall leaves ~0.35 m a side; doors need
# ~0.5-0.6 m between cars.  Below these, the dashboard shows a hint.
TIGHT_CLEARANCE_M = 0.25
DOOR_GAP_M = 0.6
# The area labels of the reference system: >= 25% in a second slot is
# MULTI_SLOT, < 50% in its own slot is MISALIGNED.  Skew above the same 15
# degrees the verdict engine treats as suspicious also counts as MISALIGNED.
MULTI_SLOT_SHARE = 0.25
MISALIGNED_OWN_SHARE = 0.50
MISALIGNED_SKEW_DEG = 15.0

SIDES = ("left", "right", "near", "far")


# --- bay frame ---------------------------------------------------------------

@dataclass
class BayFrame:
    """A drawn bay plus the homography that maps it onto a width x length stall."""
    polygon: Polygon
    corners: np.ndarray          # near-left, near-right, far-right, far-left (image px)
    width_m: float
    length_m: float
    calibrator: HomographyCalibrator

    def to_ground(self, pts) -> np.ndarray:
        pts = np.asarray(pts, dtype=np.float64).reshape(-1, 2)
        if len(pts) == 0:
            return pts
        return np.asarray(self.calibrator.image_to_ground(pts.tolist()), dtype=np.float64)

    def to_image(self, pts) -> np.ndarray:
        pts = np.asarray(pts, dtype=np.float64).reshape(-1, 2)
        if len(pts) == 0:
            return pts
        return np.asarray(self.calibrator.ground_to_image(pts.tolist()), dtype=np.float64)


def order_bay_corners(points: Sequence[Sequence[float]]) -> np.ndarray:
    """
    Return the four corners as near-left, near-right, far-right, far-left.

    "Near" is the edge closest to the camera, i.e. lowest in the image.  Works for
    any click order; a polygon that is not a quadrilateral is reduced to its
    minimum rotated rectangle.
    """
    poly = Polygon([(float(x), float(y)) for x, y in points])
    if not poly.is_valid or poly.area <= 0:
        raise ValueError("bay polygon has no area")
    ring = list(poly.exterior.coords)[:-1]
    if len(ring) != 4:
        ring = list(poly.minimum_rotated_rectangle.exterior.coords)[:-1]
    pts = np.asarray(ring, dtype=np.float64)

    edges = [(i, (i + 1) % 4) for i in range(4)]
    i, j = max(edges, key=lambda e: (pts[e[0], 1] + pts[e[1], 1]) / 2.0)
    k, m = (j + 1) % 4, (j + 2) % 4          # far edge, continuing around the ring
    if pts[i, 0] <= pts[j, 0]:
        nl, nr, fr, fl = pts[i], pts[j], pts[k], pts[m]
    else:
        nr, nl, fl, fr = pts[i], pts[j], pts[k], pts[m]
    return np.array([nl, nr, fr, fl], dtype=np.float64)


def bay_frame(points: Sequence[Sequence[float]],
              width_m: float = STALL_WIDTH_M,
              length_m: float = STALL_LENGTH_M) -> BayFrame:
    """Build the stall frame for one drawn bay.  Raises rather than return a frame
    that would silently pass pixels through as metres (HomographyCalibrator does
    exactly that when uncalibrated)."""
    corners = order_bay_corners(points)
    cal = HomographyCalibrator()
    if not cal.calibrate_from_rectangle(corners.tolist(), float(width_m), float(length_m)):
        raise ValueError("bay polygon is degenerate; cannot build a ground frame")
    poly = Polygon([(float(x), float(y)) for x, y in points])
    return BayFrame(poly, corners, float(width_m), float(length_m), cal)


# --- camera pose, recovered from the bay itself ------------------------------

@dataclass
class CameraPose:
    """Camera geometry expressed in one bay's ground frame (metres)."""
    focal_px: float
    height_m: float
    nadir: np.ndarray            # ground point directly below the camera, bay frame
    vanishing_uv: np.ndarray     # image point where world-vertical lines converge


def camera_pose(frame: BayFrame, image_size: tuple[int, int]) -> CameraPose | None:
    """
    Recover the camera from the bay's own homography.

    A plane homography is K[r1 r2 t].  Assuming square pixels and the principal
    point at the image centre, the only unknown in K is the focal length, and the
    rotation columns must be orthonormal, which pins it down.  From that come the
    camera height, the ground point beneath it, and the vertical vanishing point.

    Returns None when the result is implausible (mis-drawn bay, badly wrong stall
    size), so callers fall back rather than trust it.
    """
    w_img, h_img = image_size
    try:
        hgi = np.linalg.inv(frame.calibrator.H.astype(np.float64))
    except (np.linalg.LinAlgError, AttributeError):
        return None
    hgi = hgi / np.linalg.norm(hgi[:, 0])
    cx, cy = w_img / 2.0, h_img / 2.0

    def centred(h):
        return np.array([h[0] - cx * h[2], h[1] - cy * h[2], h[2]])

    a, b = centred(hgi[:, 0]), centred(hgi[:, 1])
    # Two constraints on w = 1/f^2: r1 . r2 = 0 and |r1| = |r2|.  For a level
    # camera the first degenerates to 0 = 0, so solve both in least squares.
    lhs = np.array([[a[0] * b[0] + a[1] * b[1]],
                    [(a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2)]])
    rhs = -np.array([a[2] * b[2], a[2] ** 2 - b[2] ** 2])
    sol, *_ = np.linalg.lstsq(lhs, rhs, rcond=None)
    inv_f2 = float(sol[0])
    if not inv_f2 > 0:
        return None
    f = 1.0 / math.sqrt(inv_f2)
    # Real CCTV lenses: roughly 25-110 degrees horizontal field of view.  Outside
    # that the solve is fitting a mis-drawn bay or a wrong stall size, not a lens
    # (a bay drawn tight around a car produced f = 2.8 x image width).
    if not (0.35 * w_img <= f <= 2.2 * w_img):
        return None

    k_inv = np.array([[1 / f, 0, -cx / f], [0, 1 / f, -cy / f], [0, 0, 1]])
    r1, r2, t = k_inv @ hgi[:, 0], k_inv @ hgi[:, 1], k_inv @ hgi[:, 2]
    scale = (np.linalg.norm(r1) + np.linalg.norm(r2)) / 2.0
    r1, r2, t = r1 / scale, r2 / scale, t / scale
    if t[2] < 0:                              # the ground must be in front of the camera
        r1, r2, t = -r1, -r2, -t
    r3 = np.cross(r1, r2)
    centre = -np.column_stack([r1, r2, r3]).T @ t
    height = abs(float(centre[2]))
    if not (2.0 <= height <= 25.0):
        return None
    v = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]]) @ r3
    if abs(v[2]) < 1e-12:
        return None
    vp = v[:2] / v[2]
    # A camera looking down at a car park sees world-vertical lines converge
    # below the frame, roughly beneath it.  Anywhere else means the geometry is
    # not a real camera over a real stall.
    if not (vp[1] > h_img and -w_img <= vp[0] <= 2 * w_img):
        return None
    return CameraPose(f, height, centre[:2].astype(np.float64), vp.astype(np.float64))


def correct_height(ground_pts, pose: CameraPose | None, height_m: float) -> np.ndarray:
    """
    Undo the projection of a point at `height_m` onto the ground plane.

    Seen from a camera H up, a point h above the ground lands on the ground plane
    pushed radially away from the spot under the camera by H / (H - h).  Pulling
    it back by (H - h) / H only ever moves points toward the camera.
    """
    pts = np.asarray(ground_pts, dtype=np.float64).reshape(-1, 2)
    if pose is None or height_m <= 0 or len(pts) == 0:
        return pts
    k = (pose.height_m - height_m) / pose.height_m
    return pose.nadir + (pts - pose.nadir) * k


# --- ground contact from a silhouette ---------------------------------------

def _shape_points(shape) -> np.ndarray:
    """Outline points as float (N, 2); masks must be bool or integer typed."""
    arr = np.asarray(shape)
    if arr.ndim == 2 and arr.shape[1] == 2 and arr.dtype.kind == "f":
        return arr.astype(np.float32)
    nz = cv2.findNonZero((arr > 0).astype(np.uint8))
    if nz is None:
        return np.empty((0, 2), np.float32)
    return nz.reshape(-1, 2).astype(np.float32)


def _signed_area(poly: np.ndarray) -> float:
    x, y = poly[:, 0], poly[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y))


# A world-vertical edge (a pillar, a wheel's side) projects exactly along a line
# through the vanishing point, so it sits on the knife-edge of "facing" it and
# rounding decides which way it falls -- dragging its roof-height end into the
# contact chain.  Require an edge to face the vanishing point by a clear margin.
# The margin must also cover calibration error in the vanishing point: at 5
# degrees an SUV's rear pillar (roof at y=221) slipped in under a 10-bay fit and
# read as 0.57 m past the far line.  On the venue frame 8-12 degrees gave the
# same verdicts under both the 5-bay and 10-bay layouts; 15 began losing the
# sedan's real crossing evidence.
MIN_FACING_DEG = 10.0


def _chain_facing(hull: np.ndarray, vp: np.ndarray) -> np.ndarray:
    """Hull edges clearly visible from point `vp`, as (S, 2, 2), in traversal order."""
    n = len(hull)
    area = _signed_area(hull)
    min_sin = math.sin(math.radians(MIN_FACING_DEG))
    visible = []
    for i in range(n):
        p, q = hull[i], hull[(i + 1) % n]
        d = q - p
        r = vp - (p + q) / 2.0
        norm = math.hypot(*d) * math.hypot(*r)
        if norm < 1e-12:
            visible.append(False)
            continue
        sin_ang = (d[0] * r[1] - d[1] * r[0]) / norm
        visible.append(sin_ang * area < 0 and abs(sin_ang) > min_sin)
    if not any(visible) or all(visible):
        return np.empty((0, 2, 2), np.float64)
    # Walk from the start of a visible run so the output stays in hull order.
    start = next(i for i in range(n) if visible[i] and not visible[i - 1])
    segs = [(hull[(start + k) % n], hull[(start + k + 1) % n])
            for k in range(n) if visible[(start + k) % n]]
    return np.asarray(segs, dtype=np.float64)


def _chain_below(hull: np.ndarray) -> np.ndarray:
    """Fallback without a camera: the bottom of the hull, minus steep edges."""
    n = len(hull)
    left = min(range(n), key=lambda i: (hull[i, 0], -hull[i, 1]))
    right = max(range(n), key=lambda i: (hull[i, 0], hull[i, 1]))

    def walk(step: int) -> list[int]:
        idx, out = left, [left]
        while idx != right:
            idx = (idx + step) % n
            out.append(idx)
        return out

    a, b = walk(1), walk(-1)
    chain = hull[a if hull[a, 1].mean() >= hull[b, 1].mean() else b]
    cos_max = math.cos(math.radians(MAX_CONTACT_NORMAL_DEG))
    segs = []
    for p, q in zip(chain[:-1], chain[1:]):
        d = q - p
        length = math.hypot(d[0], d[1])
        if length > 1e-6 and d[0] / length >= cos_max:
            segs.append((p, q))
    return np.asarray(segs, dtype=np.float64) if segs else np.empty((0, 2, 2), np.float64)


def ground_contact_segments(shape, vanishing_uv=None) -> np.ndarray:
    """
    The ground-contact edges of a vehicle silhouette, as (S, 2, 2) image segments.

    `shape` is a binary mask (H x W, bool/uint8) or an (N, 2) float outline such as
    ultralytics `masks.xy`.  With the vertical vanishing point known, the contact
    chain is the part of the convex hull facing it.  Without it (camera not
    recoverable, or the vanishing point falls inside the silhouette as on a
    top-down camera), the bottom of the hull in the image is used instead.
    """
    pts = _shape_points(shape)
    if len(pts) < 3:
        return np.empty((0, 2, 2), np.float64)
    hull = cv2.convexHull(pts).reshape(-1, 2).astype(np.float64)
    if len(hull) < 3:
        return np.empty((0, 2, 2), np.float64)
    if vanishing_uv is not None:
        vp = np.asarray(vanishing_uv, dtype=np.float64)
        inside = cv2.pointPolygonTest(hull.astype(np.float32), (float(vp[0]), float(vp[1])), False)
        if inside < 0:
            segs = _chain_facing(hull, vp)
            if len(segs):
                return segs
    return _chain_below(hull)


def contact_points(segments: np.ndarray) -> np.ndarray:
    """Unique segment endpoints, in order."""
    if len(segments) == 0:
        return np.empty((0, 2), np.float64)
    pts = [segments[0, 0]]
    for p, q in segments:
        if np.linalg.norm(p - pts[-1]) > 1e-6:
            pts.append(p)
        pts.append(q)
    return np.asarray(pts, dtype=np.float64)


# --- measurements in the stall frame ----------------------------------------

@dataclass
class Crossing:
    max_m: float = 0.0
    side: str | None = None
    per_side: dict = field(default_factory=lambda: {s: 0.0 for s in SIDES})
    points_outside: int = 0


def _overshoot(g: np.ndarray, frame: BayFrame) -> np.ndarray:
    """Per point, per side (left, right, near, far): metres past that stall edge."""
    x, y = g[:, 0], g[:, 1]
    return np.stack([-x, x - frame.width_m, -y, y - frame.length_m], axis=1)


def _crossing_from(over: np.ndarray) -> Crossing:
    out = Crossing()
    if len(over) == 0:
        return out
    outside = over.max(axis=1) > 0
    out.points_outside = int(outside.sum())
    for i, side in enumerate(SIDES):
        out.per_side[side] = float(max(0.0, over[:, i].max()))
    side = max(out.per_side, key=out.per_side.get)
    if out.per_side[side] > 0:
        out.max_m, out.side = out.per_side[side], side
    return out


def line_crossing(ground_pts, frame: BayFrame) -> Crossing:
    """How far contact points, at one assumed height, reach past each stall edge."""
    g = np.asarray(ground_pts, dtype=np.float64).reshape(-1, 2)
    return _crossing_from(_overshoot(g, frame))


def bounded_crossing(g_ground: np.ndarray, g_raised: np.ndarray,
                     frame: BayFrame) -> tuple[Crossing, Crossing]:
    """
    Crossing bounds from the same contact points projected two ways: assuming each
    lies on the ground, and assuming each lies at bumper height.

    A point's true position is somewhere between those two projections, and
    overshoot is linear along that segment, so its worst case is at one end and
    its best case at the other.  A crossing is *certain* only if it holds at both
    ends, and *possible* if it holds at either.

    Note the height correction does not simply move points inward: it moves them
    toward the camera, which carries them across whichever stall edge faces it.
    Taking the minimum is what keeps that from inventing a crossing.
    """
    a, b = _overshoot(g_ground, frame), _overshoot(g_raised, frame)
    return _crossing_from(np.minimum(a, b)), _crossing_from(np.maximum(a, b))


def fit_skew(ground_segments: np.ndarray) -> tuple[float | None, float, float]:
    """
    Rotation of the vehicle relative to the stall, from its ground-contact edges.

    A car's visible contact edges form an L -- the rear bumper and the side facing
    the camera -- both parallel or perpendicular to its axis.  So all segments are
    fitted together modulo 90 degrees (quadrupled angle), weighted by length.

    Returns (signed_skew_deg or None, agreement 0..1, extent_m).  None means the
    evidence is too short or too inconsistent to claim an angle.
    """
    if len(ground_segments) == 0:
        return None, 0.0, 0.0
    d = ground_segments[:, 1, :] - ground_segments[:, 0, :]
    lengths = np.hypot(d[:, 0], d[:, 1])
    extent = float(lengths.sum())
    if extent <= 1e-9:
        return None, 0.0, 0.0
    phi = np.arctan2(d[:, 1], d[:, 0])
    c = float((lengths * np.cos(4 * phi)).sum())
    s = float((lengths * np.sin(4 * phi)).sum())
    agreement = math.hypot(c, s) / extent
    if extent < MIN_SKEW_EXTENT_M or agreement < MIN_SKEW_AGREEMENT:
        return None, agreement, extent
    return math.degrees(math.atan2(s, c) / 4.0), agreement, extent


def reconstruct_footprint(ground_pts, frame: BayFrame, skew_deg: float | None):
    """
    A full ground rectangle for the vehicle: the edges actually observed, extended
    with length/width priors where the far side is hidden.

    Display and *inferred* crossings only -- the priors are guesses, so nothing
    derived from them may raise a vehicle to WRONG.
    Returns (ground Polygon, image Polygon) or (None, None).
    """
    g = np.asarray(ground_pts, dtype=np.float64).reshape(-1, 2)
    if len(g) < 2:
        return None, None
    th = math.radians(skew_deg or 0.0)
    u = np.array([math.cos(th), math.sin(th)])      # across the car
    v = np.array([-math.sin(th), math.cos(th)])     # along the car, away from camera
    pu, pv = g @ u, g @ v
    u_lo, u_hi = float(pu.min()), float(pu.max())
    if u_hi - u_lo < VEHICLE_WIDTH_PRIOR_M:
        mid = (u_lo + u_hi) / 2.0
        u_lo, u_hi = mid - VEHICLE_WIDTH_PRIOR_M / 2.0, mid + VEHICLE_WIDTH_PRIOR_M / 2.0
    v_lo = float(pv.min())
    v_hi = v_lo + max(float(pv.max()) - v_lo, VEHICLE_LENGTH_PRIOR_M)
    corners = np.array([a * u + b * v for a, b in
                        ((u_lo, v_lo), (u_hi, v_lo), (u_hi, v_hi), (u_lo, v_hi))])
    ground = Polygon([tuple(c) for c in corners])
    image = Polygon([tuple(p) for p in frame.to_image(corners)])
    return ground, image


# --- the car relative to its bay ---------------------------------------------

def _rect_corners(ground_pts, frame: BayFrame, theta: float | None) -> np.ndarray | None:
    rect, _ = reconstruct_footprint(ground_pts, frame, theta)
    if rect is None or rect.area <= 0:
        return None
    return np.asarray(rect.exterior.coords[:-1], dtype=np.float64)


def _gaps(corners: np.ndarray, frame: BayFrame) -> dict:
    """Clearance from the car to each stall line; negative = over the line."""
    xs, ys = corners[:, 0], corners[:, 1]
    return {"left": float(xs.min()), "right": float(frame.width_m - xs.max()),
            "near": float(ys.min()), "far": float(frame.length_m - ys.max())}


def _stall_polygon(frame: BayFrame) -> Polygon:
    return Polygon([(0, 0), (frame.width_m, 0), (frame.width_m, frame.length_m), (0, frame.length_m)])


def to_other_stall(corners: np.ndarray, frame: BayFrame, other: BayFrame) -> np.ndarray:
    """Ground points from one stall's frame into another's, through the image."""
    return other.to_ground(frame.to_image(corners))


def bay_relation(observed: np.ndarray, observed_ground: np.ndarray, theta: float | None,
                 bay_id: str, frames: dict, usable: set, straddle: dict) -> dict | None:
    """
    Where the car sits inside its bay, in metres: clearance to each line, how far
    off-centre, heading, and what share of it lies in this bay and each neighbour.

    `observed` and `observed_ground` are the contact points projected at bumper
    height and at ground height; the true position lies between, so each value
    comes with that range.  Each side is marked "measured" or "estimated" (the
    hidden side, filled in by the vehicle size prior).

    Display and analysis only: nothing here changes a verdict.
    """
    frame = frames[bay_id]
    main = _rect_corners(observed, frame, theta)
    if main is None:
        return None
    alt = _rect_corners(observed_ground, frame, theta)
    gaps = _gaps(main, frame)
    gaps_alt = _gaps(alt, frame) if alt is not None else gaps
    seen = _gaps(observed, frame)             # the observed points' own extremes

    sides = {}
    for side, v in gaps.items():
        lo, hi = sorted((v, gaps_alt[side]))
        # "m" is the whole car, hidden corners included; "seen_m" only what the
        # camera saw on that side.  For a skewed car the outermost corner is
        # usually the hidden far one, so the two differ and both are shown.
        sides[side] = {
            "m": round(v, 3), "lo": round(lo, 3), "hi": round(hi, 3),
            "seen_m": round(seen[side], 3),
            "source": "measured" if seen[side] - v <= MEASURED_SIDE_TOL_M else "estimated",
        }

    rect = Polygon([tuple(c) for c in main])
    stall = _stall_polygon(frame)
    own = float(rect.intersection(stall).area / rect.area)
    shares = {}
    for other_id, other in frames.items():
        if other_id == bay_id or other_id not in usable:
            continue
        there = Polygon([tuple(c) for c in to_other_stall(main, frame, other)])
        if not there.is_valid or there.area <= 0:
            continue
        share = float(there.intersection(_stall_polygon(other)).area / rect.area)
        if share >= 0.005:
            shares[other_id] = round(share, 3)

    skew = abs(theta) if theta is not None else None
    if straddle or any(v >= MULTI_SLOT_SHARE for v in shares.values()):
        label = "MULTI_SLOT"
    elif own < MISALIGNED_OWN_SHARE or (skew is not None and skew > MISALIGNED_SKEW_DEG):
        label = "MISALIGNED"
    else:
        label = "CORRECT"

    centre = main.mean(axis=0)
    tight = [s for s in ("left", "right") if sides[s]["m"] < TIGHT_CLEARANCE_M]
    return {
        "stall_m": [frame.width_m, frame.length_m],
        "footprint_m": [[round(float(x), 3), round(float(y), 3)] for x, y in main],
        "clearance": sides,
        "offset_m": round(float(centre[0] - frame.width_m / 2), 3),      # + right, - left
        "heading_deg": round(float(theta), 1) if theta is not None else None,
        "own_share": round(own, 3),
        "neighbour_share": shares,
        "all_corners_inside": bool(all(v >= 0 for v in gaps.values())),
        "tight_sides": tight,
        "neighbour_gap_m": {},                   # filled by BayMap, which sees every car
        "label": label,
    }


# --- one-call analysis -------------------------------------------------------

@dataclass
class ContactReport:
    # Two bounds, because one image cannot say whether a contact point is a tyre
    # (0 m up) or the bumper's lower edge (~0.3 m up):
    #   crossing_m        -- every point assumed at bumper height; can only
    #                        under-report, so above threshold it is certain.
    #   crossing_upper_m  -- every point assumed on the ground; can only
    #                        over-report, so above threshold it is only possible.
    crossing_m: float = 0.0
    crossing_side: str | None = None
    crossing_upper_m: float = 0.0
    crossing_upper_side: str | None = None
    clipped: bool = False                  # silhouette touches the image border
    skew_deg: float | None = None          # unsigned degrees from square; None = unknown
    skew_agreement: float = 0.0
    skew_extent_m: float = 0.0
    inferred_crossing_m: float = 0.0
    outside_ratio: float = 0.0             # of the reconstructed ground footprint
    straddle: dict = field(default_factory=dict)   # neighbour bay id -> intrusion m
    footprint_image: Polygon | None = None
    footprint_stall: np.ndarray | None = None      # 4 ground corners, stall frame (m)
    relation: dict | None = None                   # see bay_relation()
    camera_recovered: bool = False
    calibration_status: str = "good"       # "good" | "degraded" -- see calibration.py
    calibration_margin_m: float | None = None      # corner fit error in metres at this bay
    n_points: int = 0
    reason_codes: list = field(default_factory=list)


def _silhouette_polygon(shape) -> Polygon | None:
    pts = _shape_points(shape)
    if len(pts) < 3:
        return None
    hull = cv2.convexHull(pts).reshape(-1, 2)
    return Polygon([tuple(map(float, p)) for p in hull]) if len(hull) >= 3 else None


def _to_stall(points_img, frame: BayFrame, pose: CameraPose | None, height_m: float) -> np.ndarray:
    return correct_height(frame.to_ground(points_img), pose, height_m)


def analyse_contact(shape, bay_id: str, frames: dict, image_size: tuple[int, int],
                    contact_height_m: float = CONTACT_HEIGHT_M,
                    min_crossing_m: float = MIN_CROSSING_M,
                    poses: dict | None = None) -> ContactReport:
    """
    Everything the decision engine needs about one vehicle in one bay.

    `shape` is the vehicle's mask or outline; `frames` maps every bay id to its
    BayFrame so straddling into a neighbour can be measured in *that* bay's frame.
    `poses` gives each bay's camera from a site-wide calibration (calibration.py);
    without it each bay recovers its own camera, which is far noisier.
    """
    rep = ContactReport()
    frame = frames.get(bay_id)
    if frame is None:
        return rep

    def pose_of(bid, fr):
        return poses.get(bid) if poses is not None else camera_pose(fr, image_size)

    pose = pose_of(bay_id, frame)
    rep.camera_recovered = pose is not None
    segments = ground_contact_segments(shape, pose.vanishing_uv if pose else None)

    # A silhouette cut off by the frame edge has a false boundary there; points on
    # it say where the picture ends, not where the car does.
    w_img, h_img = image_size
    def on_border(p):
        return p[0] <= BORDER_PX or p[1] <= BORDER_PX or p[0] >= w_img - 1 - BORDER_PX or p[1] >= h_img - 1 - BORDER_PX
    if len(segments):
        keep = [not (on_border(p) or on_border(q)) for p, q in segments]
        rep.clipped = not all(keep)
        segments = segments[np.asarray(keep, dtype=bool)]

    pts = contact_points(segments)
    rep.n_points = len(pts)
    if len(pts) == 0:
        if rep.clipped:
            rep.reason_codes.append("VEHICLE_CLIPPED")
        return rep

    ground = _to_stall(pts, frame, pose, contact_height_m)
    certain, possible = bounded_crossing(_to_stall(pts, frame, pose, 0.0), ground, frame)
    # Without the camera the height correction cannot be applied, so both bounds
    # collapse onto the ground projection -- which only over-reports.  Nothing may
    # be called certain then; crossings stay "possible".
    if pose is not None:
        rep.crossing_m, rep.crossing_side = certain.max_m, certain.side
    # The far line is only flagged when certain.  The car's front corner is always
    # at bumper height, and it is the point furthest from the camera, so assuming
    # it sits on the ground throws it 0.4-0.7 m past the far line for *every* car.
    # Measured on the synthetic sweep: dropping it cut warnings on cleanly parked
    # cars from 25/105 to 10/105 without missing any real crossing.
    near_sides = {s: v for s, v in possible.per_side.items() if s != "far"}
    side = max(near_sides, key=near_sides.get)
    rep.crossing_upper_m = near_sides[side]
    rep.crossing_upper_side = side if near_sides[side] > 0 else None

    gseg = np.stack([_to_stall(segments[:, 0, :], frame, pose, contact_height_m),
                     _to_stall(segments[:, 1, :], frame, pose, contact_height_m)], axis=1)
    theta, rep.skew_agreement, rep.skew_extent_m = fit_skew(gseg)
    rep.skew_deg = abs(theta) if theta is not None else None

    rect, rep.footprint_image = reconstruct_footprint(ground, frame, theta)
    if rect is not None:
        rep.footprint_stall = np.asarray(rect.exterior.coords[:-1], dtype=np.float64)
    if pose is None or theta is None:
        # Without the camera or the car's angle, the reconstruction is mostly the
        # length prior -- drawing it would show a guess as if it were measured.
        # Show what was actually measured: the silhouette itself.
        rep.footprint_image = _silhouette_polygon(shape)
    if rect is not None and rect.area > 0:
        stall = Polygon([(0, 0), (frame.width_m, 0),
                         (frame.width_m, frame.length_m), (0, frame.length_m)])
        rep.outside_ratio = float(rect.difference(stall).area / rect.area)
        xs, ys = zip(*rect.exterior.coords[:-1])
        # Far line excluded for the same reason as the "possible" bound: the far
        # end of the reconstruction is the length prior itself, so it pokes past
        # the far line on correctly parked cars (seen live on a hatchback).
        rep.inferred_crossing_m = float(max(-min(xs), max(xs) - frame.width_m, -min(ys), 0.0))

    for other_id, other in frames.items():
        if other_id == bay_id or pose is None:      # no camera: nothing is certain
            continue
        other_pose = pose_of(other_id, other)
        if other_pose is None:
            continue
        # Depth inside the neighbour; negative when outside.  As with crossing, a
        # point only certainly intrudes if it does so under both height bounds.
        depths = [-_overshoot(_to_stall(pts, other, other_pose, h), other).max(axis=1)
                  for h in (0.0, contact_height_m)]
        depth = float(np.minimum(*depths).max())
        if depth > min_crossing_m:
            rep.straddle[other_id] = round(depth, 3)

    if pose is not None:
        usable = {b for b, fr in frames.items() if pose_of(b, fr) is not None}
        rep.relation = bay_relation(ground, _to_stall(pts, frame, pose, 0.0), theta,
                                    bay_id, frames, usable, rep.straddle)

    if rep.crossing_m > min_crossing_m:
        rep.reason_codes.append(f"LINE_CROSSING_{rep.crossing_side.upper()}_{rep.crossing_m:.2f}M")
    elif rep.crossing_upper_m > min_crossing_m:
        rep.reason_codes.append(
            f"LINE_PRESSING_POSSIBLE_{rep.crossing_upper_side.upper()}_{rep.crossing_upper_m:.2f}M")
    elif rep.inferred_crossing_m > min_crossing_m:
        rep.reason_codes.append(f"CROSSING_INFERRED_{rep.inferred_crossing_m:.2f}M")
    if rep.clipped:
        rep.reason_codes.append("VEHICLE_CLIPPED")
    for other_id, depth in rep.straddle.items():
        rep.reason_codes.append(f"STRADDLE_{other_id.upper()}_{depth:.2f}M")
    rep.reason_codes.append(f"SKEW_{rep.skew_deg:.0f}DEG" if rep.skew_deg is not None else "SKEW_UNKNOWN")
    if not rep.camera_recovered:
        rep.reason_codes.append("CAMERA_UNRECOVERED")
    return rep
