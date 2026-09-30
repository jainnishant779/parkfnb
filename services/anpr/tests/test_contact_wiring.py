"""
The ground-contact evidence must actually reach the verdict.

These drive BayMap.observe and ParkingIntelligenceEngine.update with synthetic
silhouettes, so they prove the new path runs end to end -- not just that the
geometry module exists.  No model weights needed.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import (  # noqa: E402
    Camera, Stall, W, H_IMG, bay_polygon, parked, render_mask, true_crossing,
)
from intelligence import STATE_CORRECT, STATE_SUSPICIOUS, STATE_WRONG  # noqa: E402
from occupancy import BayMap, Detection, ParkingIntelligenceEngine  # noqa: E402

IMG = (W, H_IMG)
CAM = Camera(6, 45)


def _clearance(car, stall):
    g = car.ground_rect()
    x0, x1 = stall.x_center - stall.width / 2, stall.x_center + stall.width / 2
    y0, y1 = stall.y_near, stall.y_near + stall.length
    return min(g[:, 0].min() - x0, x1 - g[:, 0].max(), g[:, 1].min() - y0, y1 - g[:, 1].max())


def _scene(dx=0.0, yaw=0.0, x_center=3.0):
    stall = Stall(x_center=x_center, y_near=4.0)
    bm = BayMap({"Bay-01": bay_polygon(CAM, stall)}, view="medium")
    mask = render_mask(CAM, parked(stall, dx=dx, yaw_deg=yaw))
    ys, xs = np.nonzero(mask)
    det = Detection(float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()), 0.9, track_id=7)
    det.contact_shape = mask
    det.contact_source = "mask"
    return bm, det


def test_mask_evidence_drives_the_verdict():
    bm, det = _scene(dx=-0.6)                    # 0.25 m over the camera-facing line
    obs = bm.observe([det], image_size=IMG)[0]
    assert obs.geometry_source == "mask"
    assert obs.state == STATE_WRONG
    assert obs.line_crossing_m > 0.10
    assert any(c.startswith("LINE_CROSSING_LEFT") for c in obs.reason_codes)


def test_clean_car_is_correct_with_mask_evidence():
    bm, det = _scene()
    obs = bm.observe([det], image_size=IMG)[0]
    assert obs.geometry_source == "mask"
    assert obs.state == STATE_CORRECT


def test_skew_alone_is_only_suspicious():
    """User decision: a rotated car still inside its lines is a warning, not a violation."""
    stall = Stall(x_center=3.0, y_near=4.0)
    bm = BayMap({"Bay-01": bay_polygon(CAM, stall)}, view="medium")
    # A micro car rotated 22 degrees: its corners stay ~20 cm inside every line,
    # so skew is the only thing wrong with it.
    car = parked(stall, yaw_deg=22, length=2.6, width=1.2, wheelbase=1.7, track=1.05, rear_gap=1.2)
    assert max(true_crossing(car, stall).values()) == 0.0
    assert _clearance(car, stall) >= 0.18
    mask = render_mask(CAM, car)
    ys, xs = np.nonzero(mask)
    det = Detection(float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()), 0.9)
    det.contact_shape = mask
    obs = bm.observe([det], image_size=IMG)[0]
    assert obs.skew_deg is not None and obs.skew_deg > 15
    assert obs.line_crossing_m <= 0.10, "no certain crossing"
    assert obs.line_crossing_possible_m <= 0.10, "no possible crossing either"
    assert obs.state == STATE_SUSPICIOUS, "skew alone must be a warning"
    assert "inside its lines" in obs.reason
    # The hidden-side estimate uses a 4.4 m car prior, so on a 2.6 m micro car it
    # over-reaches.  That is tolerated only because it can never exceed a warning.
    assert obs.state != STATE_WRONG


def test_box_only_detection_never_claims_crossing_or_skew():
    """Without a silhouette the legacy estimate decides, and must say so."""
    bm, det = _scene(dx=-0.6)
    det.contact_shape = None
    obs = bm.observe([det], image_size=IMG)[0]
    assert obs.geometry_source == "bbox"
    assert obs.line_crossing_m == 0.0
    assert obs.skew_deg is None
    assert not any(c.startswith(("LINE_CROSSING", "SKEW_")) for c in obs.reason_codes)


def test_unrecovered_camera_falls_back_to_box():
    """
    A bay drawn so its assumed 2.5 x 5 m stall is impossible yields no camera.
    Uncorrected contact points then over-report, so the box estimate decides.
    """
    stall = Stall(x_center=3.0, y_near=4.0)
    bm = BayMap({"Bay-01": bay_polygon(CAM, stall)}, view="medium",
                bay_sizes={"Bay-01": (2.5, 1.0)})
    _, det = _scene(dx=-0.6)
    obs = bm.observe([det], image_size=IMG)[0]
    assert obs.geometry_source == "bbox"


def test_missing_image_size_falls_back_to_box():
    bm, det = _scene(dx=-0.6)
    obs = bm.observe([det])[0]
    assert obs.geometry_source == "bbox"


def test_engine_passes_evidence_to_state_and_api():
    bm, det = _scene(dx=-0.6)
    eng = ParkingIntelligenceEngine(bm)
    eng.thresholds.min_persistence_seconds = 0.0
    for _ in range(4):
        eng.update([det], image_size=IMG)
    st = eng.states["Bay-01"]
    assert st.state == STATE_WRONG
    assert st.geometry_source == "mask"
    payload = st.dict()
    for key in ("geometry_source", "line_crossing_m", "line_crossing_possible_m",
                "crossing_side", "skew_deg", "reason_codes"):
        assert key in payload
    # Existing fields are still there.
    for key in ("state", "outside_slot_percent", "angle_error_deg", "plate", "reason"):
        assert key in payload


def test_display_footprint_follows_the_evidence():
    """The cyan polygon should be the reconstructed ground rectangle, not the box slice."""
    bm, det = _scene(yaw=15)
    bm.observe([det], image_size=IMG)
    fp = det.footprint
    assert fp is not None
    # Box-slice footprints are axis-aligned rectangles; a rotated car's must not be.
    xs, ys = zip(*list(fp.exterior.coords)[:-1])
    assert len(set(round(x) for x in xs)) > 2 or len(set(round(y) for y in ys)) > 2
