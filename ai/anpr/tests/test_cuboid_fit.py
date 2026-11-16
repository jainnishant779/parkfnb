"""
The fitted 3D box: recovered from a silhouette rendered with a known camera, kept while the car sits still, and read
against the bays.  Measured on the live frame of 26 Oct (3 cars, 150-200 ms each): IoU 0.89 on the hatchback,
0.82 on the SUV, and 0.80 on the SUV hidden behind it (partial).
"""
import math
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cuboid_fit as CF  # noqa: E402
from calibration import Camera  # noqa: E402

CAM = Camera(focal_px=1000.0, pitch_deg=35.0, roll_deg=0.0, height_m=6.0, image_size=(1280, 720))


def silhouette(x, y, yaw_deg, cls="sedan", cam=CAM):
    """The outline (N x 2 pixels) of a car of class `cls` standing at world (x, y) heading yaw_deg."""
    length, width, height = CF.CLASSES[cls]
    base = CF._corners(x, y, math.radians(yaw_deg), length, width)
    px = CF._project(cam, base, height)[0]
    return cv2.convexHull(px.astype(np.float32)).reshape(-1, 2).astype(np.float64)


def yaw_error(a, b):
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


# ---- recovering where the car is

@pytest.mark.parametrize("x,y,yaw,cls", [(0.0, 12.0, 90, "sedan"), (-3.0, 14.0, 75, "hatchback"), (4.0, 11.0, 105, "suv"),
                                          (2.0, 13.0, 0, "sedan"), (-2.0, 12.5, 50, "suv")])
def test_a_clean_silhouette_gives_back_the_car_it_was_made_from(x, y, yaw, cls):
    fit = CF.fit_car(CAM, silhouette(x, y, yaw, cls))
    assert fit is not None and fit.quality == "good" and fit.iou > 0.85
    assert math.hypot(fit.x - x, fit.y - y) < 0.25, (fit.x, fit.y)
    assert yaw_error(fit.yaw_deg, yaw) < 8.0, fit.yaw_deg
    assert abs(fit.length - CF.CLASSES[cls][0]) < 0.6 and abs(fit.width - CF.CLASSES[cls][1]) < 0.2   # a size class near the real one


def test_the_fitted_footprint_and_the_roof_are_where_the_silhouette_is():
    fit = CF.fit_car(CAM, silhouette(1.0, 12.0, 90, "suv"))
    assert fit.base_px.shape == (4, 2) and fit.roof_px.shape == (4, 2) and fit.base_world.shape == (4, 2)
    assert (fit.roof_px[:, 1] < fit.base_px[:, 1]).all()                      # the roof is above the base in the picture
    assert fit.footprint.area == pytest.approx(fit.length * fit.width, rel=0.02)


def test_a_car_half_hidden_behind_a_nearer_one_is_fitted_on_what_can_be_seen():
    behind = silhouette(0.5, 14.0, 90, "suv")
    x0, x1 = behind[:, 0].min(), behind[:, 0].max()
    y0, y1 = behind[:, 1].min(), behind[:, 1].max()
    cover = np.array([[x0 + 0.55 * (x1 - x0), y0 - 5], [x1 + 5, y0 - 5], [x1 + 5, y1 + 5], [x0 + 0.55 * (x1 - x0), y1 + 5]])
    seen = cv2.fillPoly(np.zeros((900, 1500), np.uint8), [np.round(behind).astype(np.int32)], 255)
    cv2.fillPoly(seen, [np.round(cover).astype(np.int32)], 0)                 # what is left of it in the picture
    cnts, _ = cv2.findContours(seen, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    outline = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(np.float64)
    fit = CF.fit_car(CAM, outline, [cover])
    assert fit.quality in ("good", "partial") and fit.iou > 0.8 and fit.visible_share < 0.8
    assert math.hypot(fit.x - 0.5, fit.y - 14.0) < 0.6                           # the hidden half did not drag it away
    blind = CF.fit_car(CAM, outline, [])                                          # without the occluder it fits the stump
    assert math.hypot(blind.x - 0.5, blind.y - 14.0) >= math.hypot(fit.x - 0.5, fit.y - 14.0) - 0.05


def test_nothing_to_fit_gives_nothing_and_a_nonsense_outline_is_poor():
    assert CF.fit_car(None, silhouette(0, 12, 90)) is None
    assert CF.fit_car(CAM, None) is None and CF.fit_car(CAM, np.array([[1, 1], [2, 2]])) is None
    sliver = np.array([[600, 300], [900, 302], [900, 303], [600, 301]], float)       # not a car
    fit = CF.fit_car(CAM, sliver)
    assert fit is None or fit.quality == "poor"


def test_a_fit_takes_a_fraction_of_a_second():
    fit = CF.fit_car(CAM, silhouette(0.0, 12.0, 90))
    assert fit.ms < 1500                                                           # ~150 ms here; the bound is for a slow CI box


# ---- the cache

def test_a_parked_car_is_fitted_once_then_reused_until_it_moves():
    cache = CF.FitCache(max_new=2)
    outline = silhouette(0, 12, 90)
    bbox = (*outline.min(axis=0), *outline.max(axis=0))
    first = cache.update(CAM, "cal", [(7, bbox, outline)], now=100.0)[7]
    again = cache.update(CAM, "cal", [(7, bbox, outline)], now=130.0)[7]
    assert again is first                                                          # the same object: not fitted again
    moved = (bbox[0] + 40, bbox[1], bbox[2] + 40, bbox[3])
    assert cache.update(CAM, "cal", [(7, moved, outline)], now=131.0)[7] is not first
    assert cache.update(CAM, "other-cal", [(7, moved, outline)], now=132.0)[7] is not first    # a new calibration: refit
    assert cache.update(CAM, "cal", [(7, bbox, outline)], now=400.0)[7] is not first          # and a refresh after the age limit


def test_only_a_few_cars_are_fitted_per_frame_nearest_first_and_the_rest_wait():
    cache = CF.FitCache(max_new=1)
    near, far = silhouette(0, 11, 90, "sedan"), silhouette(3, 15, 90, "sedan")
    box = lambda o: (*o.min(axis=0), *o.max(axis=0))
    out = cache.update(CAM, "c", [(1, box(far), far), (2, box(near), near)], now=1.0)
    assert out.get(2) is not None and 1 not in out                                  # the nearer car first; the far one waits
    out = cache.update(CAM, "c", [(1, box(far), far), (2, box(near), near)], now=2.0)
    assert out[1] is not None and out[2] is not None


def test_a_car_that_has_gone_is_forgotten():
    cache = CF.FitCache(forget_s=60.0)
    outline = silhouette(0, 12, 90)
    bbox = (*outline.min(axis=0), *outline.max(axis=0))
    cache.update(CAM, "c", [(5, bbox, outline)], now=0.0)
    cache.update(CAM, "c", [], now=30.0)
    assert 5 in cache._d
    cache.update(CAM, "c", [], now=100.0)
    assert 5 not in cache._d


# ---- the box against the bays (a flat world, bays 2.5 x 5 m side by side along X)

class FlatCal:
    """Bays laid in a row, bay i covering x in [i*2.5, (i+1)*2.5], y in [10, 15] (the stall frame is the world shifted)."""

    def __init__(self, n=3):
        self.bays = {f"B{i}": NS(frame=NS(width_m=2.5, length_m=5.0)) for i in range(n)}
        self._index = {f"B{i}": i for i in range(n)}

    def stall_to_world(self, bay_id, pts):
        return np.asarray(pts, float) + (self._index[bay_id] * 2.5, 10.0)


def car_at(cx, cy, yaw, length=4.4, width=1.8):
    return CF._corners(cx, cy, math.radians(yaw), length, width)[0]


def test_a_car_inside_its_bay_touches_no_line_and_the_gap_is_the_clearance():
    cal = FlatCal()
    corners = CF.bay_world_polygon(cal, "B1")
    fp = car_at(3.75, 12.5, 90)                                                      # centred in B1 (x 2.5..5), nose-in
    over = CF.edge_overshoot(corners, fp)
    assert all(v == 0.0 for v in over.values())
    gap = CF.edge_overshoot(corners, fp, signed=True)
    assert gap["left"] == pytest.approx(-0.35, abs=1e-6) and gap["right"] == pytest.approx(-0.35, abs=1e-6)   # (2.5-1.8)/2
    assert gap["near"] == pytest.approx(-0.3, abs=1e-6) and gap["far"] == pytest.approx(-0.3, abs=1e-6)       # (5-4.4)/2


def test_a_car_pushed_over_a_line_reports_how_far_and_on_which_side():
    cal = FlatCal()
    corners = CF.bay_world_polygon(cal, "B1")
    over = CF.edge_overshoot(corners, car_at(3.75 + 0.6, 12.5, 90))                   # 0.6 m to the right
    assert over["right"] == pytest.approx(0.25, abs=1e-6) and over["left"] == 0.0
    over = CF.edge_overshoot(corners, car_at(3.75, 12.5 - 0.5, 90))                    # 0.5 m toward the camera
    assert over["near"] == pytest.approx(0.2, abs=1e-6) and over["far"] == 0.0


def test_a_car_lying_across_two_bays_is_shared_between_them():
    cal = FlatCal()
    shares = CF.bay_overlaps(cal, Polygon_of(car_at(2.5, 12.5, 90)))                  # straddling the line between B0 and B1
    assert shares["B0"] == pytest.approx(0.5, abs=0.02) and shares["B1"] == pytest.approx(0.5, abs=0.02) and "B2" not in shares
    sideways = CF.bay_overlaps(cal, Polygon_of(car_at(3.75, 12.5, 0)))                 # across the width of B1, 4.4 m long
    assert sideways["B1"] < 0.7 and sideways["B0"] > 0.1 and sideways["B2"] > 0.1


def Polygon_of(corners):
    from shapely.geometry import Polygon
    return Polygon([tuple(p) for p in corners])


def test_relative_yaw_is_how_far_the_car_is_turned_from_its_bay():
    cal = FlatCal()
    assert CF.relative_yaw_deg(cal, "B1", 90.0) == pytest.approx(0.0, abs=1e-6)        # the bay's depth axis is world Y
    assert CF.relative_yaw_deg(cal, "B1", 80.0) == pytest.approx(10.0, abs=1e-6)
    assert CF.relative_yaw_deg(cal, "B1", 0.0) == pytest.approx(90.0, abs=1e-6)         # sideways
    assert CF.relative_yaw_deg(cal, "B1", 170.0) == pytest.approx(80.0, abs=1e-6)       # a heading is modulo 180 degrees


def test_the_sides_turned_to_the_camera_and_the_edge_that_faces_a_line():
    fp = car_at(0.0, 12.0, 90)                                                         # the camera is at the origin, beyond the near end
    faces = CF.camera_facing_sides(fp)
    assert sum(faces) in (1, 2) and faces.count(True) >= 1
    cal = FlatCal()
    corners = CF.bay_world_polygon(cal, "B1")
    pushed = car_at(3.75 + 0.6, 12.5, 90)
    edge = CF.edge_towards(corners, pushed, "right")
    a, b = pushed[edge], pushed[(edge + 1) % 4]
    assert abs(a[0] - b[0]) < 1e-6 and a[0] > pushed[:, 0].mean()                       # the edge on the right-hand side of the car
