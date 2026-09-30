"""
The car relative to its bay: clearances, offset, heading, area shares, gaps to
neighbours, and the 3D drawing helpers.  Synthetic scenes give exact ground truth.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import Camera, Stall, W, H_IMG, bay_polygon, parked, render_mask  # noqa: E402
from calibration import fit_site_calibration  # noqa: E402
from contact import analyse_contact  # noqa: E402
from intelligence import STATE_WRONG, ParkingThresholds, _classify_from_contact  # noqa: E402
from occupancy import BayMap, Detection, ParkingIntelligenceEngine, annotate, plan_view  # noqa: E402

IMG = (W, H_IMG)
CAM = Camera(6, 45)
STALLS = {f"B{i}": Stall(x_center=-5.0 + 2.5 * i, y_near=5.0) for i in range(5)}
TOL = 0.08


@pytest.fixture(scope="module")
def cal():
    return fit_site_calibration({b: bay_polygon(CAM, s) for b, s in STALLS.items()}, IMG)


def _relation(cal, car, bay="B2"):
    rep = analyse_contact(render_mask(CAM, car), bay, cal.frames, IMG, poses=cal.poses)
    return rep, rep.relation


def _true_gaps(car, stall):
    g = car.ground_rect()
    x0 = stall.x_center - stall.width / 2
    return {"left": g[:, 0].min() - x0, "right": x0 + stall.width - g[:, 0].max(),
            "near": g[:, 1].min() - stall.y_near}


@pytest.mark.parametrize("dx,rear", [(0.0, 0.3), (0.2, 0.3), (-0.2, 0.3), (0.0, 0.6), (0.0, -0.4)])
def test_clearances_and_offset_match_truth(cal, dx, rear):
    car = parked(STALLS["B2"], dx=dx, rear_gap=rear)
    _, rel = _relation(cal, car)
    truth = _true_gaps(car, STALLS["B2"])
    for side, v in truth.items():
        c = rel["clearance"][side]
        assert c["source"] == "measured"
        assert c["m"] == pytest.approx(v, abs=TOL), side
        assert c["lo"] - 0.03 <= v <= c["hi"] + 0.03, f"{side}: truth outside its range"
    assert rel["offset_m"] == pytest.approx(dx, abs=0.05)
    assert rel["clearance"]["far"]["source"] == "estimated", "the far end is the length prior"


def test_heading_reported(cal):
    _, rel = _relation(cal, parked(STALLS["B2"], yaw_deg=10))
    assert abs(rel["heading_deg"]) == pytest.approx(10, abs=2)


def test_centred_car_is_correct_and_inside(cal):
    _, rel = _relation(cal, parked(STALLS["B2"]))
    assert rel["label"] == "CORRECT"
    assert rel["all_corners_inside"]
    assert rel["own_share"] == pytest.approx(1.0, abs=0.01)
    assert rel["neighbour_share"] == {}
    assert rel["tight_sides"] == []


def test_whole_side_over_the_line_is_multi_slot(cal):
    """0.45 m of a 1.8 m wide car over the line along its full length = 25%."""
    _, rel = _relation(cal, parked(STALLS["B2"], dx=0.8))
    assert rel["label"] == "MULTI_SLOT"
    assert rel["neighbour_share"]["B3"] == pytest.approx(0.25, abs=0.04)
    assert rel["clearance"]["right"]["m"] == pytest.approx(-0.45, abs=TOL)
    assert not rel["all_corners_inside"]


def test_skewed_corner_overshoot_is_small_by_area_but_still_wrong(cal):
    """The black sedan's shape: area rules alone would call it fine."""
    rep, rel = _relation(cal, parked(STALLS["B2"], dx=0.3, yaw_deg=17))
    assert rel["neighbour_share"].get("B3", 0.0) < 0.15
    assert rep.crossing_m > 0.10
    assert _classify_from_contact(rep, ParkingThresholds())[0] == STATE_WRONG
    # What the camera saw over the line agrees with the verdict's crossing; the
    # whole-car figure can only reach further.
    right = rel["clearance"]["right"]
    assert right["seen_m"] == pytest.approx(-rep.crossing_m, abs=0.1)
    assert all(c["m"] <= c["seen_m"] + 1e-6 for c in rel["clearance"].values())


def test_tray_and_car_box_projection(cal):
    fr = cal.frames["B2"]
    corners = np.array([(0, 0), (fr.width_m, 0), (fr.width_m, fr.length_m), (0, fr.length_m)])
    base = cal.project_stall("B2", corners, 0.0)
    assert np.abs(base - fr.to_image(corners)).max() < 0.01
    # Raised corners lie on the line from each base corner to the vertical vanishing point.
    rim = cal.project_stall("B2", corners, 0.3)
    vp = cal.camera.vanishing_uv
    for b, r in zip(base, rim):
        d1, d2 = r - b, vp - b
        assert abs(d1[0] * d2[1] - d1[1] * d2[0]) / np.linalg.norm(d2) < 0.01
    # And agree with the true 3D projection.
    s = STALLS["B2"]
    true = CAM.project([[s.x_center - 1.25, s.y_near, 1.5]])
    assert np.abs(cal.project_stall("B2", [[0, 0]], 1.5) - true).max() < 0.05


def test_adjacent_stalls_share_edges_in_the_plan(cal):
    for a, b in (("B0", "B1"), ("B1", "B2"), ("B2", "B3")):
        wa = cal.stall_to_world(a, [(2.5, 0), (2.5, 5)])
        wb = cal.stall_to_world(b, [(0, 0), (0, 5)])
        assert np.abs(wa - wb).max() < 0.03


def _scene(cars):
    stalls = [STALLS[b] for b in ("B1", "B2", "B3")]
    bm = BayMap({b: bay_polygon(CAM, STALLS[b]) for b in ("B1", "B2", "B3")}, view="medium")
    dets = []
    for car in cars:
        m = render_mask(CAM, car)
        ys, xs = np.nonzero(m)
        d = Detection(float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()), 0.9)
        d.contact_shape = m
        dets.append(d)
    eng = ParkingIntelligenceEngine(bm)
    return bm, eng.update(dets, image_size=IMG), dets, stalls


def test_neighbour_gap_and_door_flag():
    # B1 car 0.2 m right, B2 car 0.2 m left: true gap 2.5 - 1.8 - 0.4 = 0.3 m.
    bm, states, _, _ = _scene([parked(STALLS["B1"], dx=0.2), parked(STALLS["B2"], dx=-0.2)])
    rel = states["B1"].bay_relation
    # These two stalls sit either side of the camera's own column, where a car's
    # side line runs almost along the vertical vanishing direction and is partly
    # dropped as height-ambiguous (contact.MIN_FACING_DEG), so the hidden far
    # corner comes from the size prior: measured 0.18 m here against 0.30 true.
    assert rel["neighbour_gap_m"]["B2"] == pytest.approx(0.3, abs=0.15)
    assert rel["door_blocked_by"] == ["B2"]
    assert "B3" not in rel["neighbour_gap_m"], "an empty bay has no car to measure to"


def test_plan_view_and_annotation():
    bm, states, dets, _ = _scene([parked(STALLS["B2"], dx=0.3, yaw_deg=17)])
    plan = plan_view(bm, states)
    assert plan["available"]
    by_id = {b["bay_id"]: b for b in plan["bays"]}
    assert by_id["B2"]["car"] is not None and len(by_id["B2"]["car"]) == 4
    assert by_id["B1"]["car"] is None
    # The car in the plan sits where the car really is, in the camera's ground frame.
    true = parked(STALLS["B2"], dx=0.3, yaw_deg=17).ground_rect()
    assert np.mean(by_id["B2"]["car"], axis=0)[0] == pytest.approx(true[:, 0].mean(), abs=0.15)
    img = annotate(np.zeros((H_IMG, W, 3), np.uint8), bm, states, dets)
    assert img.shape == (H_IMG, W, 3) and img.any()


def test_plan_view_needs_a_site_camera():
    bm = BayMap({"B": bay_polygon(CAM, STALLS["B2"])}, view="medium")
    bm.observe([], image_size=IMG)
    assert plan_view(bm, {})["available"] is False
