"""
Ground-contact geometry, checked against exact ground truth.

Scenes come from tests/synthetic_scene.py: a pinhole camera renders a car (body
box + four wheels) into a mask, so every test knows where the car really is,
including which silhouette points are tyres (0 m) and which are bumper (0.3 m).
No model weights, no images on disk.
"""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import (  # noqa: E402
    Camera, Stall, W, H_IMG, bay_polygon, parked, render_mask, true_crossing,
)
from contact import (  # noqa: E402
    analyse_contact, bay_frame, bounded_crossing, camera_pose, contact_points,
    ground_contact_segments, order_bay_corners,
)

IMG = (W, H_IMG)
CAMERAS = [Camera(5, 35), Camera(6, 45), Camera(8, 60), Camera(10, 55)]


def _in_frame(poly, margin=5):
    p = np.asarray(poly)
    return ((p[:, 0] > margin) & (p[:, 0] < W - margin) &
            (p[:, 1] > margin) & (p[:, 1] < H_IMG - margin)).all()


def _scenes():
    """Stalls fully inside the frame, across heights, tilts and lateral offsets."""
    for cam in CAMERAS:
        for sx in (0.0, 1.5, 3.0, 4.5):
            for yn in (3.0, 5.0):
                stall = Stall(x_center=sx, y_near=yn)
                poly = bay_polygon(cam, stall)
                if _in_frame(poly):
                    yield cam, stall, poly


def _clearance(car, stall):
    g = car.ground_rect()
    x0, x1 = stall.x_center - stall.width / 2, stall.x_center + stall.width / 2
    y0, y1 = stall.y_near, stall.y_near + stall.length
    return min(g[:, 0].min() - x0, x1 - g[:, 0].max(), g[:, 1].min() - y0, y1 - g[:, 1].max())


def _analyse(cam, stall, car, poly=None):
    poly = poly if poly is not None else bay_polygon(cam, stall)
    return analyse_contact(render_mask(cam, car), "B", {"B": bay_frame(poly)}, IMG)


# --- bay frame --------------------------------------------------------------

@pytest.mark.parametrize("order", [(0, 1, 2, 3), (2, 3, 0, 1), (3, 2, 1, 0), (1, 0, 3, 2)])
def test_bay_corners_any_click_order(order):
    base = [(100, 50), (300, 50), (340, 300), (60, 300)]    # far-left, far-right, near-right, near-left
    corners = order_bay_corners([base[i] for i in order])
    assert np.allclose(corners, [(60, 300), (340, 300), (300, 50), (100, 50)])


def test_bay_frame_maps_corners_to_stall():
    fr = bay_frame([(100, 50), (300, 50), (340, 300), (60, 300)], 2.5, 5.0)
    g = fr.to_ground(fr.corners)
    assert np.allclose(g, [(0, 0), (2.5, 0), (2.5, 5.0), (0, 5.0)], atol=1e-4)


# --- camera recovery ----------------------------------------------------------

@pytest.mark.parametrize("cam", CAMERAS, ids=lambda c: f"h{c.height}_t{c.tilt_deg}")
@pytest.mark.parametrize("sx", [0.0, 3.0])
def test_camera_recovered_exactly_from_one_bay(cam, sx):
    stall = Stall(x_center=sx, y_near=4.0)
    pose = camera_pose(bay_frame(bay_polygon(cam, stall)), IMG)
    assert pose is not None
    assert pose.focal_px == pytest.approx(1000.0, rel=1e-3)
    assert pose.height_m == pytest.approx(cam.height, rel=1e-3)
    # Nadir in the stall frame: the camera sits at world (0, 0).
    assert pose.nadir == pytest.approx([-(sx - stall.width / 2), -stall.y_near], abs=1e-3)
    tilt = math.radians(cam.tilt_deg)
    assert pose.vanishing_uv == pytest.approx([W / 2, H_IMG / 2 + 1000 / math.tan(tilt)], abs=0.5)


# --- crossings: the guarantees the decision engine relies on -----------------

def test_no_certain_crossing_on_cleanly_parked_cars():
    """
    The WRONG guarantee: a car at least 5 cm clear of every line never gets a
    certain crossing, anywhere in the camera grid.
    """
    failures = []
    for cam, stall, poly in _scenes():
        for dx in (0.0, 0.2, -0.2):
            for yaw in (0, 8, -8):
                car = parked(stall, dx=dx, yaw_deg=yaw)
                if _clearance(car, stall) < 0.05:
                    continue
                rep = _analyse(cam, stall, car, poly)
                if rep.crossing_m > 0.10:
                    failures.append((cam.height, cam.tilt_deg, stall.x_center, dx, yaw, rep.crossing_m))
    assert not failures, f"false certain crossings: {failures}"


def test_every_real_crossing_is_flagged():
    """No real crossing over 20 cm goes unflagged (certain, possible or inferred)."""
    missed = []
    for cam, stall, poly in _scenes():
        for dx in (0.35, -0.35, 0.5, -0.5):
            for yaw in (0, 8, -8, 15, -15):
                car = parked(stall, dx=dx, yaw_deg=yaw)
                if max(true_crossing(car, stall).values()) <= 0.20:
                    continue
                rep = _analyse(cam, stall, car, poly)
                if not (rep.crossing_m > 0.10 or rep.crossing_upper_m > 0.10 or rep.inferred_crossing_m > 0.10):
                    missed.append((cam.height, cam.tilt_deg, stall.x_center, dx, yaw))
    assert not missed, f"real crossings missed: {missed}"


def test_camera_facing_crossing_is_certain_and_measured():
    """A crossing on the side the camera can see is certain, and roughly sized."""
    cam, stall = Camera(6, 45), Stall(x_center=3.0, y_near=4.0)
    car = parked(stall, dx=-0.6)                  # left side faces a camera to its left
    rep = _analyse(cam, stall, car)
    truth = true_crossing(car, stall)["left"]
    assert rep.crossing_side == "left"
    assert rep.crossing_m > 0.10
    assert rep.crossing_m <= truth + 0.02, "the certain bound must never over-report"
    assert rep.crossing_upper_m >= truth - 0.02, "the possible bound must never under-report"


def test_far_line_needs_certainty():
    """
    A centred car's front corner (bumper height, furthest from the camera) always
    projects past the far line when assumed to be on the ground.  That must not
    become a warning.
    """
    for cam, stall, poly in _scenes():
        rep = _analyse(cam, stall, parked(stall), poly)
        assert rep.crossing_upper_side != "far"


def test_length_prior_never_infers_a_far_crossing():
    """
    A short car parked to the back of its stall: the 4.4 m prior extends its
    reconstruction past the far line, which must not become a warning.
    """
    cam, stall = Camera(6, 45), Stall(x_center=0.0, y_near=4.0)
    car = parked(stall, rear_gap=1.0, length=3.9, wheelbase=2.4)
    assert max(true_crossing(car, stall).values()) == 0.0
    rep = _analyse(cam, stall, car)
    assert rep.inferred_crossing_m <= 0.10


def test_bounds_ordering():
    """certain <= possible, per side, whatever the geometry."""
    fr = bay_frame([(100, 50), (300, 50), (340, 300), (60, 300)])
    rng = np.random.default_rng(0)
    a = rng.uniform(-1, 6, size=(40, 2))
    b = a + rng.uniform(-0.5, 0.5, size=(40, 2))
    certain, possible = bounded_crossing(a, b, fr)
    for side in certain.per_side:
        assert certain.per_side[side] <= possible.per_side[side] + 1e-12


# --- skew ------------------------------------------------------------------

@pytest.mark.parametrize("yaw", [0, 5, 10, 20, 30, -10, -20])
def test_skew_accuracy(yaw):
    for cam, stall, poly in _scenes():
        rep = _analyse(cam, stall, parked(stall, yaw_deg=yaw), poly)
        assert rep.skew_deg is not None
        assert rep.skew_deg == pytest.approx(abs(yaw), abs=3.0)


def test_skew_abstains_on_too_little_evidence():
    """A sliver of contact edge is not enough to claim an angle."""
    cam, stall = Camera(6, 45), Stall(x_center=0.0, y_near=4.0)
    mask = render_mask(cam, parked(stall, yaw_deg=10))
    ys, xs = np.nonzero(mask)
    keep = np.zeros_like(mask)
    lo = ys.max() - 3                                   # only the bottom few rows
    keep[ys[ys >= lo], xs[ys >= lo]] = 1
    rep = analyse_contact(keep, "B", {"B": bay_frame(bay_polygon(cam, stall))}, IMG)
    assert rep.skew_deg is None
    assert "SKEW_UNKNOWN" in rep.reason_codes


# --- straddle, clipping, missing camera ---------------------------------------

def test_straddle_into_neighbour():
    cam = Camera(6, 45)
    a, b = Stall(x_center=0.0, y_near=4.0), Stall(x_center=2.5, y_near=4.0)
    frames = {"A": bay_frame(bay_polygon(cam, a)), "B": bay_frame(bay_polygon(cam, b))}
    rep = analyse_contact(render_mask(cam, parked(a, dx=1.2)), "A", frames, IMG)
    assert "B" in rep.straddle
    assert any(c.startswith("STRADDLE_B_") for c in rep.reason_codes)


def test_clipped_vehicle_uses_no_border_points():
    cam, stall = Camera(6, 45), Stall(x_center=0.0, y_near=4.0)
    mask = render_mask(cam, parked(stall))
    ys, xs = np.nonzero(mask)
    cut = int(np.median(xs))
    mask[:, cut:] = 0                                # frame edge chops the car in half
    mask = mask[:, :cut + 1]
    rep = analyse_contact(mask, "B", {"B": bay_frame(bay_polygon(cam, stall))}, (cut + 1, H_IMG))
    assert rep.clipped
    assert "VEHICLE_CLIPPED" in rep.reason_codes


def test_without_a_camera_nothing_is_certain():
    """If the camera cannot be recovered, a crossing may only ever be 'possible'."""
    cam, stall = Camera(6, 45), Stall(x_center=3.0, y_near=4.0)
    frames = {"B": bay_frame(bay_polygon(cam, stall), 2.5, 2.0)}   # absurd stall length
    rep = analyse_contact(render_mask(cam, parked(stall, dx=-0.6)), "B", frames, IMG)
    assert not rep.camera_recovered
    assert rep.crossing_m == 0.0
    assert "CAMERA_UNRECOVERED" in rep.reason_codes


# --- the real frame from the UI --------------------------------------------

REAL_STALL = [(675.6, 145), (814.0, 145), (864.6, 465), (619.7, 465)]
# Black sedan outline traced from test_fixtures/cctv_test_frame.jpg (1376x768).
REAL_SEDAN = np.array([
    (628.6, 316.4), (633.2, 366.4), (649.1, 380.0), (740.0, 391.4), (765.0, 389.0),
    (788.0, 394.0), (846.0, 298.0), (856.0, 258.0), (854.0, 235.0), (844.5, 220.9),
    (726.4, 205.0), (680.9, 230.0), (644.5, 284.5)], dtype=np.float64)


def test_real_sedan_old_footprint_saw_only_the_bumper():
    """Documents the original bug: the bottom-28% slice spans 0.61 m of a 4.4 m car."""
    fr = bay_frame(REAL_STALL)
    x1, y1, x2, y2 = 628.6, 207.3, 858.2, 393.6
    cx = (x1 + x2) / 2
    near, far = fr.to_ground([(cx, y2), (cx, y2 - 0.28 * (y2 - y1))])
    assert far[1] - near[1] == pytest.approx(0.61, abs=0.05)


def test_real_sedan_right_tyre_on_the_line():
    """
    The front-right tyre sits on the right line.  This frame's perspective is not
    consistent with a real 2.5 x 5 m stall (it is AI-generated), so the camera is
    not recovered -- and the crossing is therefore reported as possible, never
    certain.  That is the honest answer for this frame.
    """
    rep = analyse_contact(REAL_SEDAN, "Bay-02", {"Bay-02": bay_frame(REAL_STALL)}, (1376, 768))
    assert not rep.camera_recovered
    assert rep.crossing_m == 0.0
    assert rep.crossing_upper_side == "right"
    assert rep.crossing_upper_m >= 0.05
