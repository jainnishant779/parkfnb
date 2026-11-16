"""
Site calibration: one camera, fitted from every drawn bay at once.

A single bay's four corners are a weak basis for a camera.  A few pixels of
clicking error move its implied camera height by metres (measured: 6.9 m vs
4.5 m for the same camera and the same bay, drawn twice), and that error flows
straight into every distance the parking engine reports.

But all bays in a view share one camera and lie on one ground plane, and each
is a stall of known size.  So the camera is fitted to all of them together:
unknowns are focal length, pitch, roll and height, plus each bay's position and
heading on the ground; observations are every drawn corner.  Twenty corners
constrain eleven-odd unknowns for a five-bay row, so drawing noise averages out
(measured: 8.57 m vs 8.58 m for the two drawings above).

The fit also grades each bay.  A bay whose corners the shared camera cannot
reproduce, or which maps to a very different size than declared, is flagged --
typically bays at the edge of a wide lens, where distortion bends straight
lines.  Downstream, a degraded bay can warn but never raise a violation, and a
rejected bay falls back to the box-slice estimate.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import least_squares

from contact import (
    STALL_LENGTH_M, STALL_WIDTH_M, BayFrame, CameraPose, bay_frame, camera_pose,
    order_bay_corners,
)
from homography import HomographyCalibrator
from shapely.geometry import Polygon

# Grading, as fractions of the bay's diagonal in pixels / of its declared size.
GOOD_REPROJ = 0.04
DEGRADED_REPROJ = 0.08
GOOD_DIM = 0.10
DEGRADED_DIM = 0.20

GOOD, DEGRADED, REJECTED = "good", "degraded", "rejected"

# Bays that must fit the shared camera well before its metres are trusted.
MIN_GOOD_BAYS = 2
MIN_FOCAL_FRAC = float(os.getenv("ANPR_MIN_FOCAL_FRAC", "0.28"))     # smallest believable focal length, as a share of the picture width


@dataclass
class Camera:
    focal_px: float
    pitch_deg: float
    roll_deg: float
    height_m: float
    image_size: tuple[int, int]

    def _rot(self):
        p, r = math.radians(self.pitch_deg), math.radians(self.roll_deg)
        return math.cos(p), math.sin(p), math.cos(r), math.sin(r)

    def project(self, world_xy: np.ndarray, z: float = 0.0) -> np.ndarray:
        """Ground points (camera nadir at the origin, Y away from the camera) to pixels."""
        cp, sp, cr, sr = self._rot()
        g = np.asarray(world_xy, dtype=np.float64).reshape(-1, 2)
        X, Y, Z = g[:, 0], g[:, 1], np.full(len(g), z - self.height_m)
        fwd = Y * cp - Z * sp
        up = Y * sp + Z * cp
        xr, upr = X * cr - up * sr, X * sr + up * cr
        w, h = self.image_size
        return np.stack([w / 2 + self.focal_px * xr / fwd, h / 2 - self.focal_px * upr / fwd], axis=1)

    def back_project(self, uv: np.ndarray) -> np.ndarray:
        """Pixels to ground points (z = 0).  Rays above the horizon return NaN."""
        cp, sp, cr, sr = self._rot()
        w, h = self.image_size
        p = np.asarray(uv, dtype=np.float64).reshape(-1, 2)
        a = (p[:, 0] - w / 2) / self.focal_px          # xr / fwd
        b = -(p[:, 1] - h / 2) / self.focal_px         # upr / fwd
        # Undo roll: X/fwd and up/fwd.
        xf = a * cr + b * sr
        uf = -a * sr + b * cr
        # up = Y sp + Z cp, fwd = Y cp - Z sp, with Z = -H.  Solve for Y, then X.
        H = self.height_m
        denom = sp - uf * cp
        with np.errstate(divide="ignore", invalid="ignore"):
            Y = H * (cp + uf * sp) / denom
            fwd = Y * cp + H * sp
            X = xf * fwd
        bad = ~(fwd > 0)
        X[bad], Y[bad] = np.nan, np.nan
        return np.stack([X, Y], axis=1)

    @property
    def vanishing_uv(self) -> np.ndarray:
        cp, sp, cr, sr = self._rot()
        w, h = self.image_size
        k = self.focal_px * cp / sp
        return np.array([w / 2 + k * sr, h / 2 + k * cr])


@dataclass
class BayCalibration:
    bay_id: str
    status: str
    reproj_px: float = 0.0
    measured_width_m: float | None = None
    measured_length_m: float | None = None
    dimension_error: float | None = None
    frame: BayFrame | None = None
    pose: CameraPose | None = None
    placement: tuple | None = None               # (x, y, heading rad) of the stall centre, site fit only

    @property
    def margin_m(self) -> float | None:
        """The corner fit error expressed on the ground: pixels times metres per pixel here."""
        if self.frame is None:
            return None
        area_px = Polygon([tuple(p) for p in self.frame.corners]).area
        if area_px <= 0:
            return None
        return self.reproj_px * math.sqrt(self.frame.width_m * self.frame.length_m / area_px)


@dataclass
class SiteCalibration:
    method: str                                  # "site" | "per_bay"
    camera: Camera | None = None
    rms_px: float | None = None
    confidence: float = 0.0
    bays: dict = field(default_factory=dict)     # bay id -> BayCalibration
    flags: list = field(default_factory=list)

    @property
    def frames(self) -> dict:
        return {b: c.frame for b, c in self.bays.items() if c.frame is not None}

    @property
    def poses(self) -> dict:
        return {b: c.pose for b, c in self.bays.items()}

    def stall_to_world(self, bay_id: str, pts) -> np.ndarray | None:
        """Points in a bay's stall frame (0..W across, 0..L along) to the site ground frame."""
        c = self.bays.get(bay_id)
        if self.camera is None or c is None or c.placement is None or c.frame is None:
            return None
        local = np.asarray(pts, dtype=np.float64).reshape(-1, 2) - (c.frame.width_m / 2, c.frame.length_m / 2)
        return _placed(local, *c.placement)

    def project_stall(self, bay_id: str, pts, z: float = 0.0) -> np.ndarray | None:
        """Stall-frame ground points, raised to height z, to pixels."""
        world = self.stall_to_world(bay_id, pts)
        return None if world is None else self.camera.project(world, z)

    def status(self, bay_id: str) -> str:
        c = self.bays.get(bay_id)
        return c.status if c else REJECTED

    def report(self) -> dict:
        cam = None
        if self.camera is not None:
            cam = {"focal_px": round(self.camera.focal_px), "pitch_deg": round(self.camera.pitch_deg, 1),
                   "roll_deg": round(self.camera.roll_deg, 1), "height_m": round(self.camera.height_m, 2)}
        return {
            "method": self.method,
            "camera": cam,
            "rms_px": round(self.rms_px, 1) if self.rms_px is not None else None,
            "confidence": round(self.confidence, 2),
            "flags": list(self.flags),
            "bays": {
                b: {
                    "status": c.status,
                    "reproj_px": round(c.reproj_px, 1),
                    "measured_m": (None if c.measured_width_m is None else
                                   [round(c.measured_width_m, 2), round(c.measured_length_m, 2)]),
                    "dimension_error": None if c.dimension_error is None else round(c.dimension_error, 3),
                }
                for b, c in self.bays.items()
            },
        }


def _local_corners(w: float, l: float) -> np.ndarray:
    """Stall corners about its centre: near-left, near-right, far-right, far-left."""
    return np.array([(-w / 2, -l / 2), (w / 2, -l / 2), (w / 2, l / 2), (-w / 2, l / 2)])


def _placed(local: np.ndarray, x: float, y: float, th: float) -> np.ndarray:
    c, s = math.cos(th), math.sin(th)
    return local @ np.array([[c, s], [-s, c]]) + (x, y)


def _per_bay(bays: dict, image_size, sizes: dict) -> SiteCalibration:
    cal = SiteCalibration(method="per_bay")
    for bid, pts in bays.items():
        w, l = sizes.get(bid, (STALL_WIDTH_M, STALL_LENGTH_M))
        try:
            fr = bay_frame(pts, w, l)
        except ValueError:
            cal.bays[bid] = BayCalibration(bid, REJECTED)
            continue
        pose = camera_pose(fr, image_size)
        cal.bays[bid] = BayCalibration(bid, GOOD if pose else REJECTED, frame=fr, pose=pose)
    n = len(cal.bays)
    cal.confidence = 0.5 * sum(c.status == GOOD for c in cal.bays.values()) / n if n else 0.0
    if n == 1:
        cal.flags.append("SINGLE_BAY_CALIBRATION")
    return cal


OUTSIDE_MARGIN = 0.05      # how far past the frame edge a bay's centre may lie (fraction of size)


def _mark_outside(cal: SiteCalibration, outside: list) -> None:
    """Bays drawn outside this image: rejected, and named so the operator can fix them."""
    for bid in outside:
        cal.bays[bid] = BayCalibration(bid, REJECTED)
        cal.flags.append(f"BAY_OUTSIDE_IMAGE_{bid.upper()}")


def _joint_fit(observed: list, locals_: list, image_size) -> tuple | None:
    """Camera plus each bay's ground placement, fitted to every given corner."""
    w_img, _ = image_size
    obs = np.concatenate(observed)
    n = len(observed)

    def unpack(p):
        return Camera(p[0], math.degrees(p[1]), math.degrees(p[2]), p[3], image_size)

    def residual(p):
        cam = unpack(p)
        proj = [cam.project(_placed(locals_[k], *p[4 + 3 * k: 7 + 3 * k])) for k in range(n)]
        return (np.concatenate(proj) - obs).ravel()

    best = None
    for f0 in (0.8 * w_img, 1.2 * w_img):
        for pitch0 in (30.0, 45.0, 60.0):
            cam0 = Camera(f0, pitch0, 0.0, 7.0, image_size)
            x0 = [f0, math.radians(pitch0), 0.0, 7.0]
            ok = True
            for o in observed:
                g = cam0.back_project(o)
                if not np.isfinite(g).all():
                    ok = False
                    break
                c = g.mean(axis=0)
                near, far = (g[0] + g[1]) / 2, (g[2] + g[3]) / 2
                x0 += [c[0], c[1], math.atan2(-(far - near)[0], (far - near)[1])]
            if not ok:
                continue
            lo = [0.2 * w_img, math.radians(5), math.radians(-30), 1.0] + [-200, 0.1, -math.pi] * n
            hi = [6.0 * w_img, math.radians(89), math.radians(30), 40.0] + [200, 400, math.pi] * n
            x0 = np.clip(x0, lo, hi)
            try:
                res = least_squares(residual, x0, bounds=(lo, hi), loss="soft_l1", f_scale=5.0)
            except ValueError:
                continue
            if best is None or res.cost < best.cost:
                best = res
    if best is None:
        return None
    return unpack(best.x), [tuple(best.x[4 + 3 * k: 7 + 3 * k]) for k in range(n)]


def _place_bay(cam: Camera, observed: np.ndarray, local: np.ndarray) -> tuple | None:
    """Best ground placement of one bay under a fixed camera."""
    g = cam.back_project(observed)
    if not np.isfinite(g).all():
        return None
    c = g.mean(axis=0)
    near, far = (g[0] + g[1]) / 2, (g[2] + g[3]) / 2
    x0 = [c[0], c[1], math.atan2(-(far - near)[0], (far - near)[1])]
    res = least_squares(lambda p: (cam.project(_placed(local, *p)) - observed).ravel(), x0,
                        loss="soft_l1", f_scale=5.0)
    return tuple(res.x)


def _plausible(cam: Camera, image_size) -> bool:
    """The same plausibility gates as single-bay recovery (contact.camera_pose)."""
    w_img, h_img = image_size
    vp = cam.vanishing_uv
    # The lower focal bound admits an ultra-wide phone lens (the 0.5x camera is about 110-120 degrees across: a focal
    # length of 0.33 x the width).  At 0.35 it refused the best fit of a layout measured on the ground (corner error
    # 2.6-9 px, f = 0.33 x width) and left that site with no 3D camera at all.
    return (MIN_FOCAL_FRAC * w_img <= cam.focal_px <= 2.2 * w_img and 2.0 <= cam.height_m <= 25.0
            and vp[1] > h_img and -w_img <= vp[0] <= 2 * w_img)


def _grade(bid, cam: Camera, placement, observed: np.ndarray, local: np.ndarray, size, drawn):
    """One bay against a fitted camera: (BayCalibration, per-corner pixel errors)."""
    w, l = size
    x, y, th = placement
    fitted_img = cam.project(_placed(local, x, y, th))
    errs = np.linalg.norm(fitted_img - observed, axis=1)
    diag = float(np.linalg.norm(observed[0] - observed[2]))

    # What the drawn corners measure on the ground, through the shared camera.
    g = cam.back_project(observed)
    meas_w = meas_l = dim_err = None
    if np.isfinite(g).all():
        meas_w = float((np.linalg.norm(g[1] - g[0]) + np.linalg.norm(g[2] - g[3])) / 2)
        meas_l = float((np.linalg.norm(g[3] - g[0]) + np.linalg.norm(g[2] - g[1])) / 2)
        dim_err = max(abs(meas_w - w) / w, abs(meas_l - l) / l)

    reproj = float(errs.mean())
    if dim_err is not None and reproj <= GOOD_REPROJ * diag and dim_err <= GOOD_DIM:
        status = GOOD
    elif dim_err is not None and reproj <= DEGRADED_REPROJ * diag and dim_err <= DEGRADED_DIM:
        status = DEGRADED
    else:
        status = REJECTED

    # Stall frame consistent with the shared camera: the ideal stall, projected.
    cal_h = HomographyCalibrator()
    cal_h.calibrate_from_rectangle(fitted_img.tolist(), w, l)
    frame = BayFrame(Polygon([tuple(map(float, p)) for p in drawn]), fitted_img, w, l, cal_h)
    pose = None
    if status != REJECTED:
        # Camera nadir (world origin) in this stall's frame: undo placement.
        c, s = math.cos(th), math.sin(th)
        local_nadir = np.array([-x, -y]) @ np.array([[c, -s], [s, c]])
        pose = CameraPose(cam.focal_px, cam.height_m, local_nadir + (w / 2, l / 2), cam.vanishing_uv.copy())
    bc = BayCalibration(bid, status, reproj, meas_w, meas_l, dim_err, frame, pose,
                        placement=(float(x), float(y), float(th)))
    return bc, errs


def fit_site_calibration(bays: dict, image_size: tuple[int, int],
                         sizes: dict | None = None) -> SiteCalibration:
    """
    One camera for every bay in a view.  Falls back to independent per-bay
    recovery when there are fewer than two usable bays or no plausible fit.

    Two passes.  A bay the first fit rejects (typically one bent by lens
    distortion at the edge of the frame) still pulls on the camera through the
    robust loss, so the camera is refitted without it, and every bay -- the
    rejected ones included -- is graded against that.  On the live venue frame
    this took the corner error from 13.7 px to 7.1 px.
    """
    sizes = sizes or {}
    w_img, h_img = image_size
    ids, observed, locals_, outside = [], [], [], []
    for bid, pts in bays.items():
        try:
            corners = order_bay_corners(pts)
        except ValueError:
            continue
        # A bay drawn on a different photo (seen live: corners at x=3090 on a
        # 1376-wide frame) pulled the shared fit implausible, which silently
        # dropped every bay to per-bay recovery -- and the 3D view with it.
        # A bay cut by the frame edge is fine; one whose centre is off the
        # frame was not drawn on it.
        cx, cy = corners.mean(axis=0)
        mx, my = OUTSIDE_MARGIN * w_img, OUTSIDE_MARGIN * h_img
        if not (-mx <= cx <= w_img + mx and -my <= cy <= h_img + my):
            outside.append(bid)
            continue
        observed.append(corners)
        ids.append(bid)
        locals_.append(_local_corners(*sizes.get(bid, (STALL_WIDTH_M, STALL_LENGTH_M))))
    if len(ids) < 2:
        cal = _per_bay({b: p for b, p in bays.items() if b not in outside}, image_size, sizes)
        _mark_outside(cal, outside)
        return cal

    inside = {b: p for b, p in bays.items() if b not in outside}
    fit = _joint_fit(observed, locals_, image_size)
    if fit is None:
        cal = _per_bay(inside, image_size, sizes)
        _mark_outside(cal, outside)
        return cal
    cam, placements = fit
    if not _plausible(cam, image_size):
        cal = _per_bay(inside, image_size, sizes)
        cal.flags.append("SITE_FIT_IMPLAUSIBLE")
        _mark_outside(cal, outside)
        return cal

    def grade_all():
        return [_grade(b, cam, placements[k], observed[k], locals_[k],
                       sizes.get(b, (STALL_WIDTH_M, STALL_LENGTH_M)), bays[b])
                for k, b in enumerate(ids)]

    graded = grade_all()
    keep = [k for k, (bc, _) in enumerate(graded) if bc.status != REJECTED]
    refitted = False
    if 2 <= len(keep) < len(ids):
        fit2 = _joint_fit([observed[k] for k in keep], [locals_[k] for k in keep], image_size)
        if fit2 is not None and _plausible(fit2[0], image_size):
            cam, kept = fit2
            placements = list(placements)
            for k, pl in zip(keep, kept):
                placements[k] = pl
            for k in set(range(len(ids))) - set(keep):
                placements[k] = _place_bay(cam, observed[k], locals_[k]) or placements[k]
            graded = grade_all()
            refitted = True

    cal = SiteCalibration(method="site", camera=cam)
    err_sq = []
    for k, (bc, errs) in enumerate(graded):
        cal.bays[ids[k]] = bc
        # The corner error describes the bays the camera was fitted to; bays
        # left out of the refit are graded against it, not averaged in.
        if not refitted or k in keep:
            err_sq.extend((errs ** 2).tolist())

    _mark_outside(cal, outside)
    for bid in bays:                               # bays that could not even be ordered
        cal.bays.setdefault(bid, BayCalibration(bid, REJECTED))

    cal.rms_px = math.sqrt(float(np.mean(err_sq))) if err_sq else None
    cal.confidence = sum({GOOD: 1.0, DEGRADED: 0.5}.get(c.status, 0.0)
                         for c in cal.bays.values()) / len(cal.bays)
    if refitted:
        cal.flags.append("REFIT_WITHOUT_REJECTED_BAYS")

    # Edge degradation: problems concentrated at the left/right ends of the row.
    order = sorted(ids, key=lambda b: float(np.mean(order_bay_corners(bays[b])[:, 0])))
    bad = {b for b in ids if cal.bays[b].status != GOOD}
    if bad and len(order) >= 3 and bad <= {order[0], order[-1]}:
        cal.flags.append("CALIBRATION_DEGRADATION_AT_EDGES")
    for b in ids:
        if cal.bays[b].status == REJECTED:
            cal.flags.append(f"BAY_INCONSISTENT_{b.upper()}")

    # A camera no two bays agree with is a guess.  Seen live on a lot with no
    # painted stalls, bays drawn round the cars: 71 px corner error, no bay
    # good, yet its metres raised a 1.00 m "crossing" and drew 3D boxes off the
    # cars.  Withdraw it: every bay falls back to the box estimate.
    if sum(c.status == GOOD for c in cal.bays.values()) < MIN_GOOD_BAYS:
        cal.flags.append("CAMERA_UNVALIDATED_TOO_FEW_GOOD_BAYS")
        cal.camera = None
        for c in cal.bays.values():
            c.pose = None
    return cal
