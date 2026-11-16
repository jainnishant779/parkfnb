"""
Unit tests for the pure geometry functions.

These deliberately load no YOLO/OCR weights and read no images, so the whole
file runs in well under a second and is safe on a memory-constrained box.
Anything needing a model belongs in test_fixtures/run_occupancy_test.py.
"""
import math
import sys
from pathlib import Path

import pytest
from shapely.geometry import Polygon, box as shapely_box

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from intelligence import (  # noqa: E402
    compute_angle_error,
    compute_outside_ratio,
    compute_slot_coverage,
    compute_inter_vehicle_occlusion,
)
from intelligence import VehicleStateHistory  # noqa: E402
from occupancy import (  # noqa: E402
    bay_axis_degrees,
    ground_footprint,
)
from tracker import circular_mean_orientation, heading_from_trajectory  # noqa: E402


# --- compute_angle_error: axial (mod-180) geometry --------------------------

@pytest.mark.parametrize("veh, slot, expected", [
    (0.0, 0.0, 0.0),
    (45.0, 0.0, 45.0),
    (90.0, 90.0, 0.0),
    (175.0, 5.0, 10.0),      # wraps across 180 -- must not report 170
    (5.0, 175.0, 10.0),      # and is symmetric
    (90.0, 0.0, 90.0),       # maximum possible axial error
    (135.0, 45.0, 90.0),
    (180.0, 0.0, 0.0),       # 180 is the same axis as 0
    (-45.0, 45.0, 90.0),     # negative input still normalises
])
def test_angle_error_is_axial(veh, slot, expected):
    assert compute_angle_error(veh, slot) == pytest.approx(expected, abs=1e-6)


def test_angle_error_never_exceeds_90():
    for veh in range(-360, 361, 7):
        for slot in range(0, 180, 11):
            assert 0.0 <= compute_angle_error(float(veh), float(slot)) <= 90.0 + 1e-9


# --- outside ratio / coverage: must stay 0..1 -------------------------------

def test_outside_ratio_fully_inside_is_zero():
    bay = shapely_box(0, 0, 100, 100)
    fp = shapely_box(10, 10, 90, 90)
    assert compute_outside_ratio(fp, bay) == pytest.approx(0.0)


def test_outside_ratio_fully_outside_is_one():
    bay = shapely_box(0, 0, 100, 100)
    fp = shapely_box(200, 200, 300, 300)
    assert compute_outside_ratio(fp, bay) == pytest.approx(1.0)


def test_outside_ratio_half_out_is_half():
    bay = shapely_box(0, 0, 100, 100)
    fp = shapely_box(50, 0, 150, 100)   # exactly half the footprint sits outside
    assert compute_outside_ratio(fp, bay) == pytest.approx(0.5)


def test_outside_ratio_is_a_ratio_not_a_percent():
    """Guards the ratio/percent convention: this must be 0.08, never 8.0."""
    bay = shapely_box(0, 0, 100, 100)
    fp = shapely_box(92, 0, 192, 100)
    ratio = compute_outside_ratio(fp, bay)
    assert 0.0 <= ratio <= 1.0
    assert ratio == pytest.approx(0.92)


def test_outside_ratio_degenerate_footprint_is_zero():
    assert compute_outside_ratio(Polygon(), shapely_box(0, 0, 10, 10)) == 0.0


def test_slot_coverage_basics():
    """
    Note the denominator is min(slot_area, footprint_area), not slot_area --
    so a small footprint entirely inside a big bay scores 1.0, meaning "all of
    the footprint is accounted for", despite the docstring saying otherwise.
    """
    bay = shapely_box(0, 0, 100, 100)
    assert compute_slot_coverage(shapely_box(0, 0, 100, 100), bay) == pytest.approx(1.0)
    assert compute_slot_coverage(shapely_box(0, 0, 50, 100), bay) == pytest.approx(1.0)
    assert compute_slot_coverage(shapely_box(500, 500, 600, 600), bay) == pytest.approx(0.0)
    assert compute_slot_coverage(Polygon(), bay) == 0.0


def test_slot_coverage_half_in_half_out():
    """Footprint straddling the bay edge: only the inside half counts."""
    bay = shapely_box(0, 0, 100, 100)
    fp = shapely_box(50, 0, 150, 100)       # equal areas, half overlapping
    assert compute_slot_coverage(fp, bay) == pytest.approx(0.5)


# --- bay_axis_degrees -------------------------------------------------------

@pytest.mark.parametrize("coords, expected", [
    ([(0, 0), (100, 0), (100, 40), (0, 40)], 0.0),     # wide -> long axis horizontal
    ([(0, 0), (40, 0), (40, 100), (0, 100)], 90.0),    # tall -> long axis vertical
])
def test_bay_axis_cardinal(coords, expected):
    assert bay_axis_degrees(Polygon(coords)) == pytest.approx(expected, abs=1e-6)


def test_bay_axis_diagonal_45():
    # A long thin rectangle rotated 45 degrees.
    d = 50.0
    poly = Polygon([(0, 0), (d, d), (d - 10, d + 10), (-10, 10)])
    assert bay_axis_degrees(poly) == pytest.approx(45.0, abs=1.0)


def test_bay_axis_always_in_0_180():
    for ang in range(0, 360, 13):
        r = math.radians(ang)
        # unit-ish long rectangle rotated by `ang`
        pts = [(0, 0), (100 * math.cos(r), 100 * math.sin(r))]
        nx, ny = -math.sin(r) * 20, math.cos(r) * 20
        poly = Polygon([pts[0], pts[1], (pts[1][0] + nx, pts[1][1] + ny), (pts[0][0] + nx, pts[0][1] + ny)])
        assert 0.0 <= bay_axis_degrees(poly) < 180.0


# --- circular_mean_orientation ---------------------------------------------

def test_circular_mean_empty_is_zero():
    assert circular_mean_orientation([]) == 0.0


def test_circular_mean_of_identical_angles():
    assert circular_mean_orientation([30.0, 30.0, 30.0]) == pytest.approx(30.0, abs=1e-6)


def test_circular_mean_wraps_across_180():
    """179 and 1 are one degree apart on an axial circle, so the mean is ~0."""
    mean = circular_mean_orientation([179.0, 1.0])
    assert min(abs(mean), abs(abs(mean) - 180.0)) == pytest.approx(0.0, abs=1e-6)


# --- ground_footprint -------------------------------------------------------

BOX = (100.0, 100.0, 300.0, 260.0)   # w=200, h=160


def test_ground_footprint_zero_angle_sits_at_the_wheels():
    """
    Broadside: a thin patch at the base of the box, inset slightly because a
    detection box includes mirrors and margin that the tyres do not span.
    """
    bx1, by1, bx2, by2 = BOX
    fp = ground_footprint(*BOX, fraction=0.28, angle_deg=0.0)
    minx, miny, maxx, maxy = fp.bounds

    assert maxy == pytest.approx(by2, abs=1.0)                 # anchored at the base
    assert (maxy - miny) == pytest.approx(160.0 * 0.28, abs=1.0)   # `fraction` tall
    assert bx1 <= minx and maxx <= bx2                          # inside the box
    assert (maxx - minx) > 0.85 * (bx2 - bx1)                   # but nearly its full width


def test_ground_footprint_always_has_area():
    for ang in range(0, 180, 3):
        fp = ground_footprint(*BOX, fraction=0.28, angle_deg=float(ang))
        assert fp.area > 0.0, f"degenerate footprint at {ang} deg"


def test_ground_footprint_stays_near_the_vehicle():
    """A footprint must not fly off somewhere unrelated to its bounding box."""
    bx1, by1, bx2, by2 = BOX
    cx, cy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
    diag = math.hypot(bx2 - bx1, by2 - by1)
    for ang in range(0, 180, 3):
        fp = ground_footprint(*BOX, fraction=0.28, angle_deg=float(ang))
        assert fp.centroid.distance(Polygon([(cx, cy), (cx, cy), (cx, cy)]).centroid) < diag


# --- the footprint must vary continuously with yaw (no deadband cliff) ------

def test_footprint_continuous_across_all_angles():
    """
    Regression guard for the old 8-degree deadband: a 0.5 degree step must never
    move the footprint's area or centre abruptly.
    """
    prev = ground_footprint(*BOX, fraction=0.28, angle_deg=0.0)
    for step in range(1, 181):
        ang = step * 0.5
        cur = ground_footprint(*BOX, fraction=0.28, angle_deg=ang)
        area_ratio = cur.area / prev.area
        assert 0.95 < area_ratio < 1.05, f"area jumps {area_ratio:.3f}x at {ang} deg"
        assert cur.centroid.distance(prev.centroid) < 5.0, f"centroid jumps at {ang} deg"
        prev = cur


def test_no_dead_zone_near_zero_degrees():
    """
    The exact bug seen in the UI: a car parked a few degrees off straight used
    to get a perfectly flat footprint because small angles were snapped to zero.
    """
    flat = ground_footprint(*BOX, fraction=0.28, angle_deg=0.0)
    for ang in (2.0, 5.0, 7.0):
        tilted = ground_footprint(*BOX, fraction=0.28, angle_deg=ang)
        # Corners must actually move -- i.e. the polygon really is rotated.
        assert tilted.equals(flat) is False, f"footprint ignores a {ang} deg yaw"
        shifted = max(
            abs(a[0] - b[0]) + abs(a[1] - b[1])
            for a, b in zip(sorted(tilted.exterior.coords), sorted(flat.exterior.coords))
        )
        assert shifted > 1.0, f"footprint barely responds to a {ang} deg yaw"


def test_footprint_area_is_sane_at_every_angle():
    """The patch must stay a plausible fraction of the detection box."""
    box_area = (BOX[2] - BOX[0]) * (BOX[3] - BOX[1])
    for ang in range(0, 180, 5):
        fp = ground_footprint(*BOX, fraction=0.28, angle_deg=float(ang))
        assert 0.05 * box_area < fp.area < 0.75 * box_area, f"implausible area at {ang} deg"


# --- compute_inter_vehicle_occlusion ---------------------------------------
# Phase 1b: visual bbox overlap must not be read as physical ground overlap.

class _Veh:
    """Minimal stand-in exposing the x1/y1/x2/y2 attributes the function needs."""
    def __init__(self, x1, y1, x2, y2):
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2


def _fp(v, fraction=0.28):
    h = v.y2 - v.y1
    return shapely_box(v.x1, v.y2 - h * fraction, v.x2, v.y2)


def test_occlusion_of_a_lone_vehicle_is_zero():
    v = _Veh(100, 100, 300, 260)
    level, state = compute_inter_vehicle_occlusion(v, [v], target_footprint=_fp(v))
    assert level == pytest.approx(0.0)
    assert state == "visible"


def test_vehicle_directly_behind_another_is_occluded():
    """Genuine occlusion: same column, other car much nearer the camera."""
    far = _Veh(100, 100, 300, 240)
    near = _Veh(110, 200, 310, 420)          # overlaps in x, far lower in frame
    level, state = compute_inter_vehicle_occlusion(far, [far, near], target_footprint=_fp(far))
    assert level > 0.35
    assert state == "heavily_occluded"


def test_occlusion_scales_with_vehicle_height_not_raw_pixels():
    """
    The depth gate is a fraction of vehicle height, so the same physical layout
    classifies identically whether the scene is 200px or 2000px tall.
    """
    small_far = _Veh(100, 100, 300, 240)
    small_near = _Veh(110, 200, 310, 420)
    small_level, _ = compute_inter_vehicle_occlusion(
        small_far, [small_far, small_near], target_footprint=_fp(small_far))

    k = 10
    big_far = _Veh(100 * k, 100 * k, 300 * k, 240 * k)
    big_near = _Veh(110 * k, 200 * k, 310 * k, 420 * k)
    big_level, _ = compute_inter_vehicle_occlusion(
        big_far, [big_far, big_near], target_footprint=_fp(big_far))

    assert small_level == pytest.approx(big_level, abs=0.02)


# --- heading from tracking displacement ------------------------------------

def _track(points, dt=0.2):
    return [(x, y, i * dt) for i, (x, y) in enumerate(points)]


def test_heading_of_a_car_driving_straight_right():
    hist = _track([(0, 0), (30, 0), (60, 0), (90, 0)])
    angle, conf = heading_from_trajectory(hist)
    assert angle == pytest.approx(0.0, abs=1.0)
    assert conf > 0.5


def test_heading_of_a_car_driving_diagonally():
    hist = _track([(0, 0), (25, 25), (50, 50), (75, 75)])
    angle, conf = heading_from_trajectory(hist)
    assert angle == pytest.approx(45.0, abs=1.0)
    assert conf > 0.8, "a dead-straight run should score high"


def test_heading_is_axial_not_directional():
    """Reversing into a bay yields the same axis as driving in forwards."""
    fwd = heading_from_trajectory(_track([(0, 0), (40, 40), (80, 80)]))[0]
    rev = heading_from_trajectory(_track([(80, 80), (40, 40), (0, 0)]))[0]
    assert fwd == pytest.approx(rev, abs=1.0)


def test_stationary_car_has_no_heading():
    """A parked car only jitters -- that direction is noise, not a yaw."""
    hist = _track([(100, 100), (101, 99), (100, 101), (99, 100), (100, 100)])
    assert heading_from_trajectory(hist) is None


def test_too_short_a_run_has_no_heading():
    assert heading_from_trajectory(_track([(0, 0), (5, 5)])) is None


def test_empty_history_has_no_heading():
    assert heading_from_trajectory([]) is None
    assert heading_from_trajectory(_track([(0, 0)])) is None


def test_wandering_path_scores_lower_than_straight_one():
    straight = heading_from_trajectory(_track([(0, 0), (30, 0), (60, 0), (90, 0)]))[1]
    wobbly = heading_from_trajectory(_track([(0, 0), (30, 25), (60, -20), (90, 5)]))[1]
    assert wobbly < straight


def test_heading_confidence_clears_the_skew_gate():
    """It must exceed occupancy.py's 0.50 threshold or skew stays dark."""
    _, conf = heading_from_trajectory(_track([(0, 0), (40, 15), (80, 30)]))
    assert conf >= 0.50


# --- Phase 3: orientation history must not be polluted with zeros -----------

def test_history_ignores_unmeasured_orientation():
    """None means 'not measured' -- it must not enter the running mean as 0.0."""
    h = VehicleStateHistory(vehicle_id="v1")
    h.record_observation(10.0, 10.0, None, 40.0, 0.0)
    h.record_observation(10.0, 10.0, None, None, 0.0)   # estimator gave up
    h.record_observation(10.0, 10.0, None, 40.0, 0.0)

    assert list(h.orientation_history) == [40.0, 40.0]
    assert h.get_smoothed_orientation() == pytest.approx(40.0, abs=1e-6)


def test_history_still_freezes_under_heavy_occlusion():
    h = VehicleStateHistory(vehicle_id="v2")
    h.record_observation(10.0, 10.0, None, 40.0, 0.0)
    h.record_observation(10.0, 10.0, None, 88.0, 0.9)   # heavily occluded
    assert list(h.orientation_history) == [40.0]


def test_history_records_a_genuine_zero_angle():
    """0.0 is a real measurement (straight on) and must be kept."""
    h = VehicleStateHistory(vehicle_id="v3")
    h.record_observation(10.0, 10.0, None, 0.0, 0.0)
    assert list(h.orientation_history) == [0.0]


def test_side_by_side_vehicles_are_not_occluded():
    """
    Two cars parked in adjacent bays at the SAME depth.  They are physically
    metres apart on the ground, so neither occludes the other -- but their
    full-height image bboxes overlap on an oblique camera.
    Mirrors the real venue_4car.jpg sedan pair (measured 67% today).
    """
    left = _Veh(3075, 1748, 3924, 2296)
    right = _Veh(3577, 1761, 4095, 2278)
    level, state = compute_inter_vehicle_occlusion(right, [left, right], target_footprint=_fp(right))
    assert level < 0.35, f"false occlusion of {level:.0%} between adjacent bays"
    assert state != "heavily_occluded"
