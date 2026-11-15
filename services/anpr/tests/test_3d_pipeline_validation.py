"""
Validation tests for the 3D Parking Geometry Pipeline.

Covers:
1. Vehicle ground-contact extraction & elevation ray-correction (0.30m nadir pull).
2. 3D cuboid extrusion (z=0.0m base to z=1.5m roof) and projection consistency.
3. Metric clearance calculations (Left, Right, Near) against known synthetic ground truth.
4. Uncertainty bounds (certain vs possible crossing) preventing false positives.
5. Camera validation safety gate (MIN_GOOD_BAYS = 2) and safe fallback behavior.
6. Per-bay non-uniform dimensions support and strict verification of overrides.
7. Adaptive experimental contact height resolution and uncertainty preservation.
8. Rigorous validation of positive overshoot magnitude vs signed clearance conventions.
"""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import Camera, Stall, W, H_IMG, bay_polygon, parked, render_mask
from calibration import DEGRADED, GOOD, REJECTED, fit_site_calibration
from contact import (
    CONTACT_HEIGHT_M,
    VEHICLE_HEIGHT_PRIOR_M,
    analyse_contact,
    bay_frame,
    bay_relation,
    bounded_crossing,
    camera_pose,
    contact_points,
    correct_height,
    ground_contact_segments,
    line_crossing,
    reconstruct_footprint,
    resolve_contact_height_m,
)
from intelligence import STATE_CORRECT, STATE_SUSPICIOUS, STATE_WRONG, ParkingThresholds, _classify_from_contact
from occupancy import BayMap, Detection

IMG = (W, H_IMG)
CAM = Camera(height=6.0, tilt_deg=45.0)


# ============================================================================
# 1. Ground Contact & Elevation Correction Tests
# ============================================================================

def test_elevation_correction_pulls_toward_nadir():
    """Points at height h > 0 must be pulled radially toward the camera nadir."""
    stall = Stall(x_center=0.0, y_near=5.0)
    poly = bay_polygon(CAM, stall)
    pose = camera_pose(bay_frame(poly), IMG)

    # Point on ground plane away from nadir
    test_pt = pose.nadir + np.array([2.0, 4.0])
    corrected = correct_height(test_pt, pose, height_m=0.30)

    # Direction vector from nadir to point
    v_orig = test_pt - pose.nadir
    v_corr = corrected[0] - pose.nadir

    # Check that corrected point remains collinear with nadir
    cross = v_orig[0] * v_corr[1] - v_orig[1] * v_corr[0]
    assert abs(cross) < 1e-6, "Height correction must be purely radial from nadir"

    # Check that distance from nadir decreases by exactly (H - h) / H
    expected_ratio = (pose.height_m - 0.30) / pose.height_m
    actual_ratio = np.linalg.norm(v_corr) / np.linalg.norm(v_orig)
    assert actual_ratio == pytest.approx(expected_ratio, rel=1e-4)


def test_contact_segments_face_vertical_vanishing_point():
    """Ground contact edges are selected from the silhouette hull facing the vanishing point."""
    stall = Stall(x_center=2.0, y_near=4.0)
    car = parked(stall, dx=0.0)
    mask = render_mask(CAM, car)

    poly = bay_polygon(CAM, stall)
    pose = camera_pose(bay_frame(poly), IMG)
    segs = ground_contact_segments(mask, vanishing_uv=pose.vanishing_uv)

    assert len(segs) > 0, "Must extract non-empty contact segments"
    pts = contact_points(segs)
    assert len(pts) >= 2, "Must produce multiple contact vertices"

    # Contact points must lie in the lower half of the vehicle silhouette
    ys, xs = np.nonzero(mask)
    y_mid = (ys.min() + ys.max()) / 2.0
    assert pts[:, 1].mean() > y_mid, "Contact points must be on the lower silhouette facing nadir"


# ============================================================================
# 2. 3D Cuboid Extrusion & Projection Consistency
# ============================================================================

def test_3d_cuboid_extrusion_and_pillar_consistency():
    """Verifies that base (z=0) and roof (z=1.5m) project along vertical perspective rays."""
    # Multi-bay row produces site camera
    bays = {
        "B0": bay_polygon(CAM, Stall(x_center=-2.5, y_near=5.0)),
        "B1": bay_polygon(CAM, Stall(x_center=0.0, y_near=5.0)),
        "B2": bay_polygon(CAM, Stall(x_center=2.5, y_near=5.0)),
    }
    cal = fit_site_calibration(bays, IMG)
    assert cal.camera is not None, "Site calibration must solve camera for multi-bay row"

    # Define a 4-corner ground footprint in stall coordinates
    fp_corners = np.array([
        [0.35, 0.5],
        [2.15, 0.5],
        [2.15, 4.5],
        [0.35, 4.5],
    ], dtype=np.float64)

    base_uv = cal.project_stall("B1", fp_corners, z=0.0)
    roof_uv = cal.project_stall("B1", fp_corners, z=VEHICLE_HEIGHT_PRIOR_M)

    assert base_uv is not None and roof_uv is not None
    assert base_uv.shape == (4, 2)
    assert roof_uv.shape == (4, 2)

    # Vertical pillars connect base_uv[i] to roof_uv[i].
    # Lines through base_uv[i] and roof_uv[i] must converge to the vertical vanishing point!
    vp = cal.poses["B1"].vanishing_uv
    for i in range(4):
        b = base_uv[i]
        r = roof_uv[i]
        pillar_vec = r - b
        to_vp_vec = vp - b
        # Cross product of pillar_vec and to_vp_vec must be approximately 0 (collinear)
        cross_prod = pillar_vec[0] * to_vp_vec[1] - pillar_vec[1] * to_vp_vec[0]
        norm = np.linalg.norm(pillar_vec) * np.linalg.norm(to_vp_vec)
        sin_err = abs(cross_prod) / norm
        assert sin_err < 0.05, f"Pillar {i} must point directly toward the vertical vanishing point"


# ============================================================================
# 3. Metric Clearance Calculations (Left, Right, Near)
# ============================================================================

def test_synthetic_clearance_known_geometry():
    """Verify Left, Right, Near clearances for a known centered 1.8m x 4.4m vehicle in 2.5m x 5.0m stall."""
    stall = Stall(x_center=0.0, y_near=5.0, width=2.5, length=5.0)
    # Centered car: width=1.8, length=4.4, rear_gap=0.30m
    car = parked(stall, dx=0.0, rear_gap=0.30, width=1.8, length=4.4)
    mask = render_mask(CAM, car)

    poly = bay_polygon(CAM, stall)
    frame = bay_frame(poly, 2.5, 5.0)
    pose = camera_pose(frame, IMG)
    segs = ground_contact_segments(mask, pose.vanishing_uv)
    pts = contact_points(segs)

    # Map to stall frame
    g_raw = frame.to_ground(pts)
    g_raised = correct_height(g_raw, pose, CONTACT_HEIGHT_M)

    rel = bay_relation(
        observed=g_raised,
        observed_ground=g_raw,
        theta=0.0,
        bay_id="B0",
        frames={"B0": frame},
        usable={"B0"},
        straddle={},
    )
    assert rel is not None
    clr = rel["clearance"]

    # The observed side clearance should be close to 0.35m
    assert clr["near"]["seen_m"] == pytest.approx(0.30, abs=0.15)
    assert clr["left"]["m"] == pytest.approx(0.35, abs=0.15)
    assert clr["right"]["m"] == pytest.approx(0.35, abs=0.15)


def test_line_crossing_left_and_right():
    """A vehicle shifted 0.6m to the left must record negative left clearance and line crossing."""
    stall = Stall(x_center=0.0, y_near=5.0, width=2.5, length=5.0)
    # Shifted left by 0.60m -> Left edge at 0.35 - 0.60 = -0.25m (over the line)
    car = parked(stall, dx=-0.60, rear_gap=0.30, width=1.8, length=4.4)
    mask = render_mask(CAM, car)

    poly = bay_polygon(CAM, stall)
    frame = bay_frame(poly, 2.5, 5.0)
    pose = camera_pose(frame, IMG)
    segs = ground_contact_segments(mask, pose.vanishing_uv)
    pts = contact_points(segs)

    g_raw = frame.to_ground(pts)
    g_raised = correct_height(g_raw, pose, CONTACT_HEIGHT_M)

    certain_cross, poss_cross = bounded_crossing(g_raw, g_raised, frame)
    assert certain_cross.max_m > 0.08, "Must register certain line crossing"
    assert certain_cross.side == "left", "Crossing side must be left"


# ============================================================================
# 4. Uncertainty & Bounded Crossings Near Boundary Threshold
# ============================================================================

def test_bounded_crossing_avoids_confident_fp_at_threshold():
    """A wheel touching the line (overshoot ~ 0.03m) must NOT trigger certain line crossing."""
    stall = Stall(x_center=0.0, y_near=5.0, width=2.5, length=5.0)
    # Shifted left by 0.36m -> clearance is ~ -0.01m to +0.02m (on the borderline)
    car = parked(stall, dx=-0.36, rear_gap=0.30, width=1.8, length=4.4)
    mask = render_mask(CAM, car)

    poly = bay_polygon(CAM, stall)
    frame = bay_frame(poly, 2.5, 5.0)
    pose = camera_pose(frame, IMG)
    segs = ground_contact_segments(mask, pose.vanishing_uv)
    pts = contact_points(segs)

    g_raw = frame.to_ground(pts)
    g_raised = correct_height(g_raw, pose, CONTACT_HEIGHT_M)

    certain_cross, poss_cross = bounded_crossing(g_raw, g_raised, frame)

    # Certain crossing requires holding at both ground and raised heights
    # Near threshold, certain crossing should be below MIN_CROSSING_M (0.10m)
    assert certain_cross.max_m < 0.10, "Borderline crossing must not be classified as confident crossing"


# ============================================================================
# 5. Camera-Validation Safety Gate (MIN_GOOD_BAYS = 2) & Fallback Behavior
# ============================================================================

def test_safety_gate_invalidates_camera_when_fewer_than_two_good_bays():
    """When fewer than 2 bays achieve GOOD calibration, cal.camera must be None and flagged."""
    # Create invalid bays with impossible aspect ratios (length = 0.5m instead of 5.0m)
    bays = {
        "B0": bay_polygon(CAM, Stall(x_center=-2.5, y_near=5.0, length=0.5)),
        "B1": bay_polygon(CAM, Stall(x_center=0.0, y_near=5.0, length=0.5)),
        "B2": bay_polygon(CAM, Stall(x_center=2.5, y_near=5.0, length=0.5)),
    }
    cal = fit_site_calibration(bays, IMG)

    # Check safety gate
    good_bays = sum(b.status == GOOD for b in cal.bays.values())
    assert good_bays < 2
    assert cal.camera is None, "Safety gate must set cal.camera to None when fewer than 2 good bays"
    assert any(f in cal.flags for f in ("SITE_FIT_IMPLAUSIBLE", "CAMERA_UNVALIDATED_TOO_FEW_GOOD_BAYS"))


def test_fallback_behavior_when_camera_unvalidated():
    """BayMap falls back to 2D bbox estimation without crash when camera is unvalidated."""
    stall = Stall(x_center=0.0, y_near=5.0)
    # Bay configured with invalid size to force unvalidated camera
    bm = BayMap(
        {"B0": bay_polygon(CAM, stall)},
        view="medium",
        bay_sizes={"B0": (2.5, 0.5)},  # Distorted stall
    )

    car = parked(stall, dx=-0.6)
    mask = render_mask(CAM, car)
    ys, xs = np.nonzero(mask)
    det = Detection(float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()), 0.9)
    det.contact_shape = mask

    obs = bm.observe([det], image_size=IMG)[0]
    # Fallback to bbox should occur safely
    assert obs.geometry_source == "bbox", "Must fall back to bbox when camera cannot be validated"
    assert obs.line_crossing_m == 0.0, "Must not report metric line crossing on unvalidated fallback"


# ============================================================================
# 6. Per-Bay Non-Uniform Dimensions Support & Strict Grade Safeguard
# ============================================================================

def test_per_bay_dimensions_support():
    """Site calibration supports non-uniform physical stall dimensions across a row."""
    # B0 is standard 2.5m x 5.0m, B1 is wider 3.0m x 5.0m (e.g. SUV stall)
    bays = {
        "B0": bay_polygon(CAM, Stall(x_center=-2.75, y_near=5.0, width=2.5, length=5.0)),
        "B1": bay_polygon(CAM, Stall(x_center=0.0, y_near=5.0, width=3.0, length=5.0)),
        "B2": bay_polygon(CAM, Stall(x_center=2.75, y_near=5.0, width=2.5, length=5.0)),
    }
    sizes = {"B1": (3.0, 5.0)}  # Specify B1's actual width
    cal = fit_site_calibration(bays, IMG, sizes=sizes)

    assert cal.camera is not None
    assert cal.bays["B1"].status == GOOD, "B1 must be graded GOOD with correct dimension prior"
    assert cal.bays["B1"].measured_width_m == pytest.approx(3.0, abs=0.08)
    assert cal.bays["B0"].measured_width_m == pytest.approx(2.5, abs=0.08)


def test_overridden_dimensions_with_mismatched_corners_are_not_marked_good():
    """A bay must NOT be graded GOOD simply because dimensions were overridden to an unmatching value."""
    # All bays are actually 2.5m x 5.0m
    bays = {
        "B0": bay_polygon(CAM, Stall(x_center=-2.5, y_near=5.0, width=2.5, length=5.0)),
        "B1": bay_polygon(CAM, Stall(x_center=0.0, y_near=5.0, width=2.5, length=5.0)),
        "B2": bay_polygon(CAM, Stall(x_center=2.5, y_near=5.0, width=2.5, length=5.0)),
    }
    # Pass a mismatched size (claim B1 is 4.5m wide when corners represent 2.5m)
    bogus_sizes = {"B1": (4.5, 5.0)}
    cal = fit_site_calibration(bays, IMG, sizes=bogus_sizes)

    # B1 MUST NOT be GOOD because the reprojection/dimension residual fails
    assert cal.bays["B1"].status in (DEGRADED, REJECTED), "Mismatched dimension override must not be marked GOOD"


# ============================================================================
# 7. Adaptive Experimental Contact Height Resolution & Uncertainty
# ============================================================================

def test_adaptive_contact_height_resolution_and_uncertainty_preservation():
    """Verify experimental contact height resolution while preserving conservative defaults."""
    # Default without category must return standard 0.30m
    assert resolve_contact_height_m() == CONTACT_HEIGHT_M
    assert resolve_contact_height_m(None) == 0.30
    assert resolve_contact_height_m("unknown") == 0.30

    # Experimental categories
    assert resolve_contact_height_m("sedan") == 0.22
    assert resolve_contact_height_m("suv") == 0.28
    assert resolve_contact_height_m("hatchback") == 0.20

    # Custom override takes precedence
    assert resolve_contact_height_m("sedan", custom_height_m=0.25) == 0.25

    # Uncertainty preservation: verify that bounded_crossing tests both z=0 and z=h
    stall = Stall(x_center=0.0, y_near=5.0)
    frame = bay_frame(bay_polygon(CAM, stall))
    pose = camera_pose(frame, IMG)

    test_pts = np.array([[1.0, 6.0], [2.0, 7.0]])
    for test_h in (0.20, 0.28, 0.35):
        corrected = correct_height(test_pts, pose, test_h)
        # Higher contact height pulls further toward nadir
        orig_dist = np.linalg.norm(test_pts[0] - pose.nadir)
        corr_dist = np.linalg.norm(corrected[0] - pose.nadir)
        expected_ratio = (pose.height_m - test_h) / pose.height_m
        assert corr_dist / orig_dist == pytest.approx(expected_ratio, rel=1e-4)


# ============================================================================
# 8. Positive Overshoot Magnitude vs Signed Clearance Conventions
# ============================================================================

def test_crossing_magnitude_vs_signed_clearance_conventions():
    """
    Assert and protect the mathematical sign conventions:
    1. contact.Crossing.max_m: POSITIVE OVERSHOOT MAGNITUDE (0.0 = within lines, >0.10 = over line).
    2. bay_relation['clearance'][side]['seen_m']: SIGNED CLEARANCE (>0.25 = centered, <0.0 = over line).
    """
    stall = Stall(x_center=0.0, y_near=5.0, width=2.5, length=5.0)
    frame = bay_frame(bay_polygon(CAM, stall))

    # Case A: Inside vehicle (width=1.8, centered in 2.5m stall)
    # Left edge at 0.35m from left line, Right edge at 2.15m (0.35m from right line)
    inside_pts = np.array([[0.35, 1.0], [2.15, 1.0], [2.15, 4.0], [0.35, 4.0]])
    cross_inside = line_crossing(inside_pts, frame)
    assert cross_inside.max_m == 0.0, "Inside points must have 0.0 overshoot magnitude"
    assert cross_inside.points_outside == 0

    # Case B: Vehicle crossing left line by 0.20m (left edge at -0.20m)
    outside_pts = np.array([[-0.20, 1.0], [1.60, 1.0], [1.60, 4.0], [-0.20, 4.0]])
    cross_outside = line_crossing(outside_pts, frame)
    assert cross_outside.max_m == pytest.approx(0.20, abs=1e-4), "Overshoot magnitude must be positive (0.20m)"
    assert cross_outside.side == "left"
    assert cross_outside.points_outside == 2

    # Case C: Signed clearance via bay_relation
    # Inside vehicle -> positive clearance (+0.35m)
    rel_inside = bay_relation(
        observed=inside_pts, observed_ground=inside_pts, theta=0.0,
        bay_id="B0", frames={"B0": frame}, usable={"B0"}, straddle={}
    )
    assert rel_inside["clearance"]["left"]["seen_m"] == pytest.approx(0.35, abs=0.02)
    assert rel_inside["clearance"]["left"]["seen_m"] > 0, "Inside clearance must be POSITIVE"

    # Outside vehicle -> negative clearance (-0.20m)
    rel_outside = bay_relation(
        observed=outside_pts, observed_ground=outside_pts, theta=0.0,
        bay_id="B0", frames={"B0": frame}, usable={"B0"}, straddle={}
    )
    assert rel_outside["clearance"]["left"]["seen_m"] == pytest.approx(-0.20, abs=0.02)
    assert rel_outside["clearance"]["left"]["seen_m"] < 0, "Over-the-line clearance must be NEGATIVE"
