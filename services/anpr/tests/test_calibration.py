"""
Site calibration: one camera fitted from every bay, and a grade for each bay.
Synthetic rows of stalls give exact ground truth.  No model weights needed.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import Camera as SynCam, Stall, W, H_IMG, bay_polygon, parked, render_mask  # noqa: E402
from calibration import DEGRADED, GOOD, REJECTED, fit_site_calibration  # noqa: E402
from contact import ContactReport, bay_frame, camera_pose  # noqa: E402
from intelligence import STATE_SUSPICIOUS, STATE_WRONG, ParkingThresholds, _classify_from_contact  # noqa: E402
from occupancy import BayMap, Detection  # noqa: E402

IMG = (W, H_IMG)


def _row(cam, n=5, y_near=5.0, x0=-5.0):
    return {f"B{i}": bay_polygon(cam, Stall(x_center=x0 + 2.5 * i, y_near=y_near)) for i in range(n)}


@pytest.mark.parametrize("h,tilt", [(5, 35), (6, 45), (8, 60)])
def test_exact_camera_from_a_row(h, tilt):
    cal = fit_site_calibration(_row(SynCam(h, tilt)), IMG)
    assert cal.method == "site"
    assert cal.camera.focal_px == pytest.approx(1000, rel=1e-3)
    assert cal.camera.height_m == pytest.approx(h, rel=1e-3)
    assert cal.camera.pitch_deg == pytest.approx(tilt, abs=0.05)
    assert all(b.status == GOOD for b in cal.bays.values())
    assert cal.rms_px < 0.5


def test_site_fit_matches_single_bay_recovery_when_exact():
    cam = SynCam(6, 45)
    bays = _row(cam)
    cal = fit_site_calibration(bays, IMG)
    for bid, pts in bays.items():
        single = camera_pose(bay_frame(pts), IMG)
        assert cal.poses[bid].nadir == pytest.approx(single.nadir, abs=1e-2)
        assert cal.poses[bid].vanishing_uv == pytest.approx(single.vanishing_uv, abs=0.5)


def test_site_fit_is_far_steadier_than_single_bays_under_click_noise():
    """The reason this module exists: a few pixels of clicking error."""
    cam = SynCam(6, 45)
    bays = _row(cam)
    rng = np.random.default_rng(7)
    site_err, bay_err = [], []
    for _ in range(6):
        noisy = {b: (np.asarray(p) + rng.normal(0, 3, (4, 2))).tolist() for b, p in bays.items()}
        site_err.append(abs(fit_site_calibration(noisy, IMG).camera.height_m - 6.0))
        for p in noisy.values():
            pose = camera_pose(bay_frame(p), IMG)
            bay_err.append(abs(pose.height_m - 6.0) if pose else 6.0)
    assert max(site_err) < 0.6
    assert np.median(site_err) < np.median(bay_err)


def test_mis_drawn_bay_is_rejected_and_the_rest_stay_good():
    cam = SynCam(6, 45)
    bays = _row(cam)
    bays["B2"] = bay_polygon(cam, Stall(x_center=0.0, y_near=5.0, length=2.5))   # drawn half length
    cal = fit_site_calibration(bays, IMG)
    assert cal.bays["B2"].status in (REJECTED, DEGRADED)
    assert all(cal.bays[b].status == GOOD for b in ("B0", "B1", "B3", "B4"))
    assert cal.camera.height_m == pytest.approx(6.0, rel=0.05), "one bad bay must not drag the camera"


def test_edge_degradation_is_flagged():
    cam = SynCam(6, 45)
    bays = _row(cam)
    bays["B4"] = (np.asarray(bays["B4"]) * [1.0, 1.0] + [[0, 0], [25, 0], [40, -10], [0, 0]]).tolist()
    cal = fit_site_calibration(bays, IMG)
    assert cal.bays["B4"].status != GOOD
    assert "CALIBRATION_DEGRADATION_AT_EDGES" in cal.flags


def test_measured_dimensions_reported():
    cal = fit_site_calibration(_row(SynCam(6, 45)), IMG)
    for b in cal.bays.values():
        assert b.measured_width_m == pytest.approx(2.5, abs=0.01)
        assert b.measured_length_m == pytest.approx(5.0, abs=0.01)
    rep = cal.report()
    assert rep["camera"]["height_m"] == pytest.approx(6.0, abs=0.01)
    assert set(rep["bays"]) == set(cal.bays)


def test_single_bay_falls_back_to_per_bay():
    cam = SynCam(6, 45)
    cal = fit_site_calibration({"B": bay_polygon(cam, Stall(0.0, 5.0))}, IMG)
    assert cal.method == "per_bay"
    assert "SINGLE_BAY_CALIBRATION" in cal.flags
    assert cal.poses["B"] is not None


def test_degraded_bay_never_raises_wrong():
    rep = ContactReport(crossing_m=0.40, crossing_side="right", crossing_upper_m=0.5,
                        crossing_upper_side="right", n_points=5, calibration_status=DEGRADED)
    state, _, _ = _classify_from_contact(rep, ParkingThresholds())
    assert state == STATE_SUSPICIOUS
    rep.calibration_status = GOOD
    assert _classify_from_contact(rep, ParkingThresholds())[0] == STATE_WRONG


def test_degraded_bay_raises_wrong_only_beyond_its_error():
    """A crossing that survives the bay's calibration error, in metres, is a violation."""
    thr = ParkingThresholds()
    big = ContactReport(crossing_m=0.46, crossing_side="right", crossing_upper_m=0.5,
                        crossing_upper_side="right", n_points=5, calibration_status=DEGRADED,
                        calibration_margin_m=0.15)
    assert _classify_from_contact(big, thr)[0] == STATE_WRONG
    small = ContactReport(crossing_m=0.20, crossing_side="right", crossing_upper_m=0.25,
                          crossing_upper_side="right", n_points=5, calibration_status=DEGRADED,
                          calibration_margin_m=0.15)
    assert _classify_from_contact(small, thr)[0] == STATE_SUSPICIOUS
    straddle = ContactReport(crossing_m=0.05, straddle={"B3": 0.40}, n_points=5,
                             calibration_status=DEGRADED, calibration_margin_m=0.15)
    assert _classify_from_contact(straddle, thr)[0] == STATE_WRONG


def test_rejected_bay_does_not_drag_the_camera():
    """Refit without the rejected bay: the rest fit tighter than with it."""
    cam = SynCam(6, 45)
    bays = _row(cam)
    bays["B4"] = (np.asarray(bays["B4"]) + [[0, 0], [60, 10], [90, -30], [0, 0]]).tolist()
    cal = fit_site_calibration(bays, IMG)
    assert cal.bays["B4"].status == REJECTED
    assert "REFIT_WITHOUT_REJECTED_BAYS" in cal.flags
    assert cal.camera.height_m == pytest.approx(6.0, rel=0.02)
    assert max(cal.bays[b].reproj_px for b in ("B0", "B1", "B2", "B3")) < 1.0
    assert cal.bays["B4"].placement is not None, "a rejected bay is still placed for drawing"


def test_bay_from_another_photo_does_not_break_the_site_fit():
    """Corners far outside this frame are set aside, not fitted."""
    cam = SynCam(6, 45)
    bays = _row(cam)
    bays["STRAY"] = [[1649, 2290], [2184, 2297], [2069, 1829], [1672, 1826]]
    cal = fit_site_calibration(bays, IMG)
    assert cal.method == "site" and cal.camera is not None
    assert cal.camera.height_m == pytest.approx(6.0, rel=0.02)
    assert cal.bays["STRAY"].status == REJECTED
    assert "BAY_OUTSIDE_IMAGE_STRAY" in cal.flags
    assert all(cal.bays[b].status == GOOD for b in ("B0", "B1", "B2", "B3", "B4"))


def test_camera_no_two_bays_agree_with_is_withdrawn():
    """Live venue layout: bays drawn round cars on an unmarked lot (4096x3072)."""
    bays = {
        "Bay-01": [[1538, 2333], [2206, 2311], [2099, 1858], [1534, 1865]],
        "Bay-02": [[2292, 1888], [2652, 1810], [2830, 2177], [2422, 2200]],
        "Bay-03": [[3109, 1810], [3398, 1758], [3918, 2200], [3517, 2274]],
    }
    cal = fit_site_calibration(bays, (4096, 3072))
    assert sum(c.status == GOOD for c in cal.bays.values()) < 2
    assert cal.camera is None
    assert all(p is None for p in cal.poses.values())
    assert "CAMERA_UNVALIDATED_TOO_FEW_GOOD_BAYS" in cal.flags


def test_margin_in_metres():
    cal = fit_site_calibration(_row(SynCam(6, 45)), IMG)
    b = cal.bays["B2"]
    b.reproj_px = 10.0
    fr = b.frame
    from shapely.geometry import Polygon as P
    mpp = (fr.width_m * fr.length_m / P([tuple(p) for p in fr.corners]).area) ** 0.5
    assert b.margin_m == pytest.approx(10.0 * mpp)


def test_baymap_uses_the_shared_camera():
    cam = SynCam(6, 45)
    stalls = [Stall(x_center=x, y_near=5.0) for x in (-2.5, 0.0, 2.5)]
    bm = BayMap({f"B{i}": bay_polygon(cam, s) for i, s in enumerate(stalls)}, view="medium")
    mask = render_mask(cam, parked(stalls[1], dx=-0.6))
    ys, xs = np.nonzero(mask)
    det = Detection(float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()), 0.9)
    det.contact_shape = mask
    obs = {o.bay_id: o for o in bm.observe([det], image_size=IMG)}
    assert bm.calibration(IMG).method == "site"
    assert obs["B1"].geometry_source == "mask"
    assert obs["B1"].line_crossing_m > 0.10
