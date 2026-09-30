r"""
PARKBNB Parking Intelligence & Geometry Engine.

Implements the 7-State Classification Model:
  1. FREE: No stable vehicle-slot association
  2. OCCUPIED: Vehicle present, analyzing correctness
  3. CORRECT: Geometry within tolerance
  4. SUSPICIOUS: Geometry borderline / unconfirmed spike
  5. WRONG: Persistent geometry violation
  6. OCCLUDED: Vehicle state cannot be reliably observed due to foreground occlusion
  7. UNKNOWN: Camera/model/system confidence insufficient

Quantifies parking correctness via:
  1. Camera Profile & Perspective-Aware Footprint Slicing
  2. NeoSmart Outside-Ratio: Area(footprint \ slot) / Area(footprint)
  3. Slot Coverage: Area(footprint ∩ slot) / Area(slot)
  4. Orientation / Angle Error: |theta_vehicle - theta_slot| mod 180°
  5. Double-Slot Occupancy: Multi-bay simultaneous straddle
  6. Physical Pairwise Occlusion: Foreground vehicle masking background vehicle
  7. Visibility & Parking Confidence Scoring
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field, asdict
from typing import Sequence, Iterable, Dict, List, Any

from shapely.geometry import Polygon, box as shapely_box

# 7-State Classification Constants (Product Contract)
STATE_FREE = "free"
STATE_OCCUPIED = "occupied"
STATE_CORRECT = "correct"
STATE_SUSPICIOUS = "suspicious"
STATE_WRONG = "wrong"
STATE_OCCLUDED = "occluded"
STATE_UNKNOWN = "unknown"

# Violation categories
VIOLATION_NONE = "none"
VIOLATION_OUTSIDE = "outside_slot"
VIOLATION_DOUBLE_PARKING = "double_parking"
VIOLATION_SKEWED = "skewed_angle"
VIOLATION_ENCROACHMENT = "line_encroachment"
VIOLATION_OCCLUSION = "vehicle_occluded"


@dataclass
class CameraProfile:
    """
    Per-camera calibration and footprint configuration.
    Supports variable angles, footprint models, and site-level tuning.
    """
    camera_id: str = "default"
    view_angle: str = "medium"                 # "high", "medium", "low", "topdown"
    footprint_method: str = "bottom_fraction"  # "bottom_fraction", "homography", "segmentation"
    bottom_fraction: float | None = None       # Custom override (if None, derived from view_angle)
    site_id: str = "default_site"

    def get_bottom_fraction(self) -> float:
        """Returns the tarmac footprint slice fraction for this camera setup."""
        if self.bottom_fraction is not None and self.bottom_fraction > 0:
            return float(self.bottom_fraction)
        presets = {
            "high": 0.18,      # High angle / pole looking steeply down (~60°-75°)
            "medium": 0.28,    # Standard first-floor oblique view (~35°-55°)
            "low": 0.42,       # Low ground-level / gate pole (~15°-30°)
            "topdown": 1.0,    # Orthographic / ceiling / drone (90°)
        }
        return presets.get(self.view_angle.lower(), 0.28)

    def dict(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "view_angle": self.view_angle,
            "footprint_method": self.footprint_method,
            "bottom_fraction": self.get_bottom_fraction(),
            "site_id": self.site_id,
        }


@dataclass
class ParkingThresholds:
    """Configurable thresholds (per camera or site profile) for parking correctness."""
    correct_max_outside: float = 0.10         # <= 10% outside slot -> clean / correct
    suspicious_max_outside: float = 0.10     # 10% - 25% outside slot -> suspicious (advisory)
    outside_wrong_min: float = 0.25          # >= 25% outside slot -> confirmed wrong parking
    angle_error_suspicious: float = 15.0     # > 15° angular deviation -> suspicious
    angle_error_wrong: float = 25.0          # > 25° angular deviation -> wrong
    double_slot_min_overlap: float = 0.20    # >= 20% in second slot -> double parking violation
    encroach_warning_min: float = 0.12       # >= 12% in adjacent bay -> line proximity warning
    occupied_coverage_min: float = 0.35      # Slot coverage >= 35% -> occupied
    empty_coverage_max: float = 0.15         # Slot coverage <= 15% -> free
    min_persistence_seconds: float = 5.0     # Time violation must persist before WRONG alert
    min_free_persistence_seconds: float = 4.0 # Time bay must remain empty before FREE
    occlusion_threshold: float = 0.35        # >= 35% bbox masked by foreground vehicle -> occluded
    line_crossing_min_m: float = 0.10        # ground-contact overshoot past a stall line

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class VehicleStateHistory:
    """
    Persistent temporal memory tracking a vehicle across frames.
    Maintains:
      - Trajectory centroids & velocity
      - Historical unoccluded ground footprints
      - Occluded footprint prediction
      - Multi-frame visibility & orientation history
    """
    vehicle_id: int | str
    slot_id: str | None = None
    trajectory: list[tuple[float, float, float]] = field(default_factory=list)  # [(cx, cy, timestamp), ...]
    observed_footprints: list[tuple[Polygon, float, float]] = field(default_factory=list)  # [(poly, timestamp, occlusion_level), ...]
    predicted_footprint: Polygon | None = None
    orientation_history: list[float] = field(default_factory=list)
    occlusion_history: list[float] = field(default_factory=list)
    last_known_clean_state: str = STATE_CORRECT
    motion_speed_px_per_sec: float = 0.0
    is_stationary: bool = True
    last_seen: float = field(default_factory=time.time)

    def record_observation(
        self,
        cx: float,
        cy: float,
        footprint: Polygon | None,
        orientation: float | None,
        occlusion_level: float,
        timestamp: float | None = None,
    ):
        t = timestamp if timestamp is not None else time.time()
        self.last_seen = t
        self.trajectory.append((cx, cy, t))
        if len(self.trajectory) > 30:
            self.trajectory.pop(0)

        # Estimate speed from recent trajectory
        if len(self.trajectory) >= 2:
            dt = self.trajectory[-1][2] - self.trajectory[-2][2]
            if dt > 0.001:
                dist = math.hypot(
                    self.trajectory[-1][0] - self.trajectory[-2][0],
                    self.trajectory[-1][1] - self.trajectory[-2][1],
                )
                inst_speed = dist / dt
                self.motion_speed_px_per_sec = 0.7 * self.motion_speed_px_per_sec + 0.3 * inst_speed
                self.is_stationary = (self.motion_speed_px_per_sec < 20.0)

        self.occlusion_history.append(occlusion_level)
        if len(self.occlusion_history) > 20:
            self.occlusion_history.pop(0)

        # Occlusion Safety Gate: freeze orientation updates during heavy occlusion.
        # `orientation` is None when it could not be measured this frame -- record
        # nothing rather than a literal 0.0, which would drag the circular mean
        # toward "pointing straight" every time the estimator gave up.
        if occlusion_level < 0.35 and orientation is not None:
            self.orientation_history.append(orientation)
            if len(self.orientation_history) > 20:
                self.orientation_history.pop(0)

        # Cache reference footprint when vehicle is clearly observed with minimal occlusion
        if occlusion_level < 0.25 and footprint is not None and footprint.area > 0:
            self.observed_footprints.append((footprint, t, occlusion_level))
            if len(self.observed_footprints) > 15:
                self.observed_footprints.pop(0)
            self.predicted_footprint = footprint

    def get_smoothed_orientation(self) -> float:
        """
        Computes circular mean of orientation angles with 180° axial symmetry.
        Prevents angular wrap-around jitter.
        """
        if not self.orientation_history:
            return 0.0
        sin_sum = sum(math.sin(math.radians(2.0 * a)) for a in self.orientation_history)
        cos_sum = sum(math.cos(math.radians(2.0 * a)) for a in self.orientation_history)
        if abs(sin_sum) < 1e-6 and abs(cos_sum) < 1e-6:
            return float(self.orientation_history[-1])
        mean_double = math.degrees(math.atan2(sin_sum, cos_sum))
        return float(mean_double / 2.0)

    def get_best_footprint(
        self,
        current_visible_fp: Polygon | None,
        current_occlusion: float,
        slot_polygon: Polygon | None = None,
    ) -> tuple[Polygon, str]:
        """
        Resolves the best ground footprint.
        When current view is occluded (>= 35%) and vehicle is stationary,
        falls back to historical predicted footprint or slot prior to avoid false spikes!
        """
        if current_occlusion >= 0.35 and self.predicted_footprint is not None:
            return self.predicted_footprint, "historical_prior"
        if current_visible_fp is not None and current_visible_fp.area > 0:
            return current_visible_fp, "observed_visible"
        if self.predicted_footprint is not None:
            return self.predicted_footprint, "historical_prior"
        if slot_polygon is not None and slot_polygon.area > 0:
            return slot_polygon, "slot_prior"
        return Polygon(), "none"


class VehicleStateManager:
    """
    Registry of persistent vehicle state histories.
    Maintains continuity across video frames.
    """
    def __init__(self, max_idle_seconds: float = 60.0):
        self.histories: dict[str, VehicleStateHistory] = {}
        self.max_idle_seconds = max_idle_seconds

    def get_or_create(self, vehicle_id: int | str) -> VehicleStateHistory:
        vid_str = str(vehicle_id)
        if vid_str not in self.histories:
            self.histories[vid_str] = VehicleStateHistory(vehicle_id=vid_str)
        return self.histories[vid_str]

    def get(self, vehicle_id: int | str) -> VehicleStateHistory | None:
        return self.histories.get(str(vehicle_id))

    def cleanup_stale(self, current_time: float | None = None):
        now = current_time or time.time()
        stale = [k for k, h in self.histories.items() if (now - h.last_seen) > self.max_idle_seconds]
        for k in stale:
            del self.histories[k]



@dataclass
class SlotIntelligenceReport:
    """
    Formal product contract for a single parking slot observation.
    Provides visible geometry confidence, occlusion level, and multi-factor correctness.
    """
    slot_id: str
    state: str                                 # One of 7 states: FREE, OCCUPIED, CORRECT, SUSPICIOUS, WRONG, OCCLUDED, UNKNOWN
    occupancy_status: str                      # "free" or "occupied"
    parking_status: str                        # "correct", "suspicious", "wrong", "occluded", "none"
    vehicle_track_id: int | None = None
    slot_coverage_percent: float = 0.0         # % of slot covered
    outside_slot_percent: float = 0.0          # % of vehicle outside assigned slot (NeoSmart)
    angle_error_deg: float | None = None       # Angle deviation relative to slot axis
    double_parking: bool = False
    straddled_slots: list[str] = field(default_factory=list)
    encroachments: dict[str, float] = field(default_factory=dict)
    occlusion_state: str = "visible"           # "visible", "partially_occluded", "heavily_occluded"
    occlusion_level: float = 0.0               # 0.0 (clear) to 1.0 (fully occluded)
    visible_geometry_confidence: float = 1.0   # Confidence in visible boundaries
    parking_confidence: float = 0.0            # Multi-signal evaluation certainty [0.0, 1.0]
    confidence: float = 0.0                    # Legacy alias
    reason: str = ""
    plate: str = ""
    # Ground-contact evidence (contact.py).  geometry_source says which kind of
    # evidence the verdict rests on: "mask" (real silhouette) or "bbox" (the
    # legacy box-slice estimate, which never claims a crossing or a skew).
    geometry_source: str = "bbox"
    line_crossing_m: float = 0.0               # certain overshoot past a stall line
    line_crossing_possible_m: float = 0.0      # upper bound; may be height ambiguity
    crossing_side: str | None = None
    skew_deg: float | None = None
    reason_codes: list[str] = field(default_factory=list)

    def dict(self) -> dict:
        return {
            "geometry_source": self.geometry_source,
            "line_crossing_m": round(self.line_crossing_m, 3),
            "line_crossing_possible_m": round(self.line_crossing_possible_m, 3),
            "crossing_side": self.crossing_side,
            "skew_deg": round(self.skew_deg, 1) if self.skew_deg is not None else None,
            "reason_codes": list(self.reason_codes),
            "slot_id": self.slot_id,
            "state": self.state,
            "occupancy": self.occupancy_status,
            "parking_status": self.parking_status,
            "vehicle_id": self.vehicle_track_id,
            "slot_coverage_percent": round(self.slot_coverage_percent, 1),
            "outside_slot_percent": round(self.outside_slot_percent, 1),
            "angle_error_deg": round(self.angle_error_deg, 1) if self.angle_error_deg is not None else None,
            "double_parking": self.double_parking,
            "straddled_slots": self.straddled_slots,
            "encroachments": self.encroachments,
            "occlusion_state": self.occlusion_state,
            "occlusion_level": round(self.occlusion_level, 2),
            "visible_geometry_confidence": round(self.visible_geometry_confidence, 2),
            "parking_confidence": round(self.parking_confidence, 2),
            "confidence": round(self.confidence, 2),
            "reason": self.reason,
            "plate": self.plate,
        }


def compute_outside_ratio(vehicle_footprint: Polygon, slot_polygon: Polygon) -> float:
    """
    NeoSmart Outside-Ratio:
    Measures what fraction of the vehicle's ground footprint lies OUTSIDE the slot polygon.
    outside_ratio = Area(Footprint minus Slot) / Area(Footprint)
    """
    if vehicle_footprint.area <= 0:
        return 0.0
    try:
        diff = vehicle_footprint.difference(slot_polygon).area
        return min(1.0, max(0.0, float(diff / vehicle_footprint.area)))
    except Exception:
        return 0.0


def compute_slot_coverage(vehicle_footprint: Polygon, slot_polygon: Polygon) -> float:
    """Fraction of the slot covered by the vehicle footprint."""
    if slot_polygon.area <= 0 or vehicle_footprint.area <= 0:
        return 0.0
    try:
        inter = vehicle_footprint.intersection(slot_polygon).area
        denom = min(slot_polygon.area, vehicle_footprint.area)
        return min(1.0, max(0.0, float(inter / denom))) if denom > 0 else 0.0
    except Exception:
        return 0.0


def compute_angle_error(vehicle_angle_deg: float, slot_angle_deg: float) -> float:
    """Computes acute angular deviation between vehicle axis and slot axis in [0, 90] degrees."""
    diff = abs(vehicle_angle_deg - slot_angle_deg) % 180.0
    return min(diff, 180.0 - diff)


def _ground_slice(veh, fraction: float = 0.28) -> Polygon:
    """Bottom slice of a vehicle box, approximating its tarmac contact patch."""
    y1, y2 = float(veh.y1), float(veh.y2)
    h = max(1.0, y2 - y1)
    return shapely_box(float(veh.x1), y2 - h * fraction, float(veh.x2), y2)


def compute_inter_vehicle_occlusion(
    target_veh,
    all_vehicles: Iterable,
    target_footprint: Polygon | None = None,
    depth_margin_ratio: float = 0.35,
) -> tuple[float, str]:
    """
    How much of the target vehicle is *visually hidden* behind another vehicle.

    This answers "can I see this car?", which is a question about the image.  It
    is NOT the same question as "is this car physically in another bay?", which
    is answered on the ground plane by compute_outside_ratio() against the slot
    polygon.  Keeping them apart matters: on an oblique camera a car is tall in
    image space, so two cars parked metres apart in adjacent bays still overlap
    heavily in pixels.  Scoring that as occlusion forces a spurious OCCLUDED
    state and, downstream, freezes orientation updates and wipes the violation
    timer.

    So occlusion is measured between *ground contact patches*, and only counts a
    neighbour that is genuinely nearer the camera -- meaning its contact patch
    sits substantially lower in the frame, scaled to vehicle height rather than
    a fixed pixel constant so it holds at any resolution or zoom.

    Returns:
      (occlusion_level in [0.0, 1.0], "visible" | "partially_occluded" | "heavily_occluded")
    """
    if not hasattr(target_veh, "x1") or not hasattr(target_veh, "y2"):
        return 0.0, "visible"

    ty2 = float(target_veh.y2)
    t_fp = target_footprint if (target_footprint is not None and target_footprint.area > 0) \
        else _ground_slice(target_veh)
    if t_fp.area <= 0:
        return 0.0, "visible"

    t_height = max(1.0, float(target_veh.y2) - float(target_veh.y1))
    depth_margin = t_height * depth_margin_ratio

    max_mask_ratio = 0.0
    for other in all_vehicles:
        if other is target_veh:
            continue
        if not hasattr(other, "x1") or not hasattr(other, "y2"):
            continue

        # Only a vehicle clearly nearer the camera can hide this one.  Cars at a
        # comparable depth are side by side, not in front.
        if float(other.y2) <= ty2 + depth_margin:
            continue

        # A nearer car hides this one with its whole body, not just its tyres,
        # so the occluder is its full box.  What gets hidden is measured on the
        # target's ground patch: that is the part the parking geometry actually
        # depends on, and it keeps a tall roof from inflating the score.
        o_box = shapely_box(float(other.x1), float(other.y1), float(other.x2), float(other.y2))

        try:
            mask = t_fp.intersection(o_box).area / t_fp.area
            if mask > max_mask_ratio:
                max_mask_ratio = mask
        except Exception:
            continue

    max_mask_ratio = min(1.0, max(0.0, max_mask_ratio))
    if max_mask_ratio >= 0.35:
        return max_mask_ratio, "heavily_occluded"
    elif max_mask_ratio >= 0.15:
        return max_mask_ratio, "partially_occluded"
    return max_mask_ratio, "visible"


def _classify_from_contact(contact, cfg: "ParkingThresholds") -> tuple[str, str, list[str]]:
    """
    Verdict from ground-contact evidence.

    WRONG needs something *certain*: a crossing that holds even with every contact
    point assumed at bumper height, or a certain intrusion into another bay.  A
    crossing that only appears when points are assumed to sit on the tarmac, one
    inferred from the vehicle-length prior, or a rotated car with no crossing at
    all, is at most SUSPICIOUS.
    """
    thr = cfg.line_crossing_min_m
    # A bay the shared camera fits only loosely: its metres are approximate.  A
    # crossing still counts as a violation if it survives that error -- the
    # corner fit error converted to metres at this bay, taken off the crossing.
    # Without that figure, a crossing on such a bay is only ever a warning.
    if getattr(contact, "calibration_status", "good") != "good":
        margin = getattr(contact, "calibration_margin_m", None)
        deepest = max([contact.crossing_m, *contact.straddle.values()])
        if margin is None or deepest - margin <= thr:
            if contact.straddle or contact.crossing_m > thr or contact.crossing_upper_m > thr:
                return STATE_SUSPICIOUS, "suspicious", [
                    "Possible line crossing; this bay's calibration is approximate (edge of lens?)"]
        elif contact.crossing_m - margin > thr:
            return STATE_WRONG, "wrong", [
                f"Over the {contact.crossing_side} line by {contact.crossing_m:.2f} m "
                f"(clear of this bay's ±{margin:.2f} m calibration error)"]
        else:
            bays = ", ".join(f"{b} ({d:.2f} m)" for b, d in contact.straddle.items())
            return STATE_WRONG, "wrong", [
                f"Occupying another bay: {bays} inside it (clear of ±{margin:.2f} m calibration error)"]
    if contact.straddle:
        bays = ", ".join(f"{b} ({d:.2f} m)" for b, d in contact.straddle.items())
        return STATE_WRONG, "wrong", [f"Occupying another bay: tyres/bumper {bays} inside it"]
    if contact.crossing_m > thr:
        return STATE_WRONG, "wrong", [
            f"Over the {contact.crossing_side} line by {contact.crossing_m:.2f} m"]
    # Warnings are cumulative so the operator sees every reason, not just the first.
    warnings = []
    if contact.crossing_upper_m > thr:
        warnings.append(
            f"Possibly on the {contact.crossing_upper_side} line (up to {contact.crossing_upper_m:.2f} m)")
    if contact.inferred_crossing_m > thr:
        # From a car-length prior, so it over-reaches on small cars: warn only.
        warnings.append(f"Hidden side may be over a line (estimated {contact.inferred_crossing_m:.2f} m)")
    if contact.skew_deg is not None and contact.skew_deg > cfg.angle_error_suspicious:
        warnings.append(f"Parked at {contact.skew_deg:.0f}° to the bay, inside its lines")
    if warnings:
        return STATE_SUSPICIOUS, "suspicious", warnings
    return STATE_CORRECT, "correct", ["Correctly parked within boundary lines"]


def evaluate_parking_intelligence(
    slot_id: str,
    slot_polygon: Polygon,
    slot_angle_deg: float,
    assigned_vehicle, # TrackedVehicle or Detection
    all_slot_polygons: dict[str, Polygon],
    all_slot_coverages_for_vehicle: dict[str, float] | None = None,
    cfg: ParkingThresholds | None = None,
    assigned_footprint: Polygon | None = None,
    camera_profile: CameraProfile | None = None,
    all_vehicles: Iterable | None = None,
    vehicle_history: VehicleStateHistory | None = None,
    vehicle_angle_deg: float | None = None,
    contact=None,
) -> SlotIntelligenceReport:
    """
    Performs full geometric and multi-signal intelligence on a slot and its assigned vehicle.
    Incorporates:
      - Visible ground footprint slicing
      - Optical pairwise inter-vehicle occlusion (bbox + tarmac contact masking)
      - Vehicle state memory & historical prior footprint fallback
      - Multi-signal confidence and 7-state classification
    """
    cfg = cfg or ParkingThresholds()
    profile = camera_profile or CameraProfile()

    # Case 1: Empty slot
    if assigned_vehicle is None:
        return SlotIntelligenceReport(
            slot_id=slot_id,
            state=STATE_FREE,
            occupancy_status=STATE_FREE,
            parking_status="none",
            slot_coverage_percent=0.0,
            outside_slot_percent=0.0,
            occlusion_level=0.0,
            visible_geometry_confidence=1.0,
            parking_confidence=1.0,
            confidence=1.0,
            reason="Slot is empty",
        )

    # 1. Resolve Visible Ground Footprint based on Camera Profile
    fraction = profile.get_bottom_fraction()
    visible_fp = assigned_footprint if assigned_footprint is not None else getattr(assigned_vehicle, "footprint", None)
    if visible_fp is None and hasattr(assigned_vehicle, "x1") and hasattr(assigned_vehicle, "y2"):
        x1, y1 = float(assigned_vehicle.x1), float(assigned_vehicle.y1)
        x2, y2 = float(assigned_vehicle.x2), float(assigned_vehicle.y2)
        h = max(1.0, y2 - y1)
        if fraction >= 1.0:
            visible_fp = shapely_box(x1, y1, x2, y2)
        else:
            visible_fp = shapely_box(x1, y2 - h * fraction, x2, y2)

    # Fallback if geometry creation failed
    if visible_fp is None:
        return SlotIntelligenceReport(
            slot_id=slot_id,
            state=STATE_OCCUPIED,
            occupancy_status=STATE_OCCUPIED,
            parking_status="correct",
            vehicle_track_id=getattr(assigned_vehicle, "track_id", None),
            occlusion_level=0.0,
            visible_geometry_confidence=0.5,
            parking_confidence=0.6,
            confidence=0.6,
            reason="Vehicle detected in slot (footprint uncomputed)",
        )

    # 2. Compute Inter-Vehicle Occlusion (both box and tarmac contact)
    occlusion_level = 0.0
    occlusion_state = getattr(assigned_vehicle, "occlusion_state", "visible")
    if all_vehicles:
        calc_level, calc_state = compute_inter_vehicle_occlusion(
            assigned_vehicle, all_vehicles, target_footprint=visible_fp
        )
        if calc_level > occlusion_level:
            occlusion_level = calc_level
            occlusion_state = calc_state
    elif occlusion_state in ("partially_occluded", "heavily_occluded"):
        occlusion_level = 0.45 if occlusion_state == "partially_occluded" else 0.75

    # 3. Vehicle State History & Prior Footprint Prediction
    cx = (float(assigned_vehicle.x1) + float(assigned_vehicle.x2)) / 2.0
    cy = (float(assigned_vehicle.y1) + float(assigned_vehicle.y2)) / 2.0
    veh_angle = vehicle_angle_deg
    fp = visible_fp
    fp_source = "observed_visible"

    if vehicle_history is not None:
        # Pass the angle through as-is: None means "not measured this frame" and
        # must not be recorded, or the running mean drifts toward 0 every time
        # the estimator gives up.
        vehicle_history.record_observation(cx, cy, visible_fp, veh_angle, occlusion_level)
        # Prefer the smoothed angle whenever there is any history to smooth over.
        # Testing `smoothed_ang != 0.0` treated a genuinely straight-on vehicle
        # as if nothing had been measured.
        if veh_angle is not None and vehicle_history.orientation_history:
            veh_angle = vehicle_history.get_smoothed_orientation()
        fp, fp_source = vehicle_history.get_best_footprint(visible_fp, occlusion_level, slot_polygon)

    # 4. Compute Coverage & Outside Ratio with Resolved Footprint
    slot_cov = compute_slot_coverage(fp, slot_polygon)
    outside_ratio = compute_outside_ratio(fp, slot_polygon)

    # If coverage is below empty threshold, slot is effectively free
    if slot_cov <= cfg.empty_coverage_max and outside_ratio > 0.85:
        return SlotIntelligenceReport(
            slot_id=slot_id,
            state=STATE_FREE,
            occupancy_status=STATE_FREE,
            parking_status="none",
            slot_coverage_percent=slot_cov * 100.0,
            outside_slot_percent=outside_ratio * 100.0,
            occlusion_level=0.0,
            visible_geometry_confidence=0.9,
            parking_confidence=0.9,
            confidence=0.9,
            reason="Minimal slot coverage, classified as free",
        )

    # 5. Compute Angle Error
    angle_err = compute_angle_error(veh_angle, slot_angle_deg) if veh_angle is not None else None

    # 6. Check Double-Parking / Adjacent Slot Encroachments
    encroachments = {}
    straddles = []
    fp_area = fp.area
    if fp_area > 0:
        for other_id, other_poly in all_slot_polygons.items():
            if other_id != slot_id:
                try:
                    inter_area = fp.intersection(other_poly).area
                    veh_intrusion = inter_area / fp_area
                    if veh_intrusion >= cfg.encroach_warning_min:
                        encroachments[other_id] = round(veh_intrusion, 3)
                        if veh_intrusion >= cfg.double_slot_min_overlap:
                            straddles.append(other_id)
                except Exception:
                    pass

    double_parked = len(straddles) > 0

    # 7. Visible Geometry Confidence & Parking Confidence
    det_conf = getattr(assigned_vehicle, "confidence", 0.85)
    visible_geom_conf = max(0.15, round(1.0 - (occlusion_level * 0.75), 2))
    fit_penalty = outside_ratio * 0.3
    tracking_factor = 1.0
    if vehicle_history and len(vehicle_history.trajectory) >= 3:
        tracking_factor = min(1.0, 0.85 + len(vehicle_history.trajectory) * 0.015)
    parking_conf = round(min(0.98, max(0.30, det_conf * tracking_factor * visible_geom_conf * (1.0 - fit_penalty))), 2)

    # 7b. Ground-contact evidence overrides the box-slice numbers for reporting
    # too, so the dashboard never shows "8% outside" beside a crossing verdict.
    use_contact = contact is not None and getattr(contact, "n_points", 0) > 0
    if use_contact:
        outside_ratio = contact.outside_ratio
        angle_err = contact.skew_deg
        straddles = list(contact.straddle)
        double_parked = bool(contact.straddle)

    # 8. Synthesize 7-State Classification
    state = STATE_CORRECT
    parking_status = "correct"
    reasons = []

    # Check Occlusion (Foreground Traffic Masking)
    if occlusion_level >= cfg.occlusion_threshold or occlusion_state == "heavily_occluded":
        state = STATE_OCCLUDED
        parking_status = "occluded"
        if fp_source == "historical_prior":
            reasons.append(
                f"Vehicle occluded by foreground traffic ({int(occlusion_level*100)}% masked); "
                f"prior footprint confirms correct fit"
            )
        else:
            reasons.append(
                f"Vehicle occluded by foreground traffic ({int(occlusion_level*100)}% masked); "
                f"visible geometry unobservable"
            )

    # Real ground-contact evidence, when a silhouette was available.  It replaces
    # the box-slice checks below entirely: those only ever saw the rear bumper.
    elif use_contact:
        state, parking_status, why = _classify_from_contact(contact, cfg)
        reasons.extend(why)

    # Check Double-Parking
    elif double_parked:
        state = STATE_WRONG
        parking_status = "wrong"
        offenders = [f"{sid} ({int(encroachments[sid]*100)}%)" for sid in straddles]
        reasons.append(f"Double-slot parking: line crossed into {', '.join(offenders)}")

    # Check Outside Ratio (NeoSmart)
    elif outside_ratio >= cfg.outside_wrong_min:
        state = STATE_WRONG
        parking_status = "wrong"
        reasons.append(f"{int(outside_ratio * 100)}% of vehicle outside slot lines")

    elif outside_ratio >= cfg.suspicious_max_outside:
        state = STATE_SUSPICIOUS
        parking_status = "suspicious"
        reasons.append(f"Suspicious position: {int(outside_ratio * 100)}% outside slot boundary")

    # Skew with no crossing is a warning, never a violation, however large the
    # angle: a rotated car still inside its lines is not blocking anyone.
    elif angle_err is not None and angle_err > cfg.angle_error_suspicious:
        state = STATE_SUSPICIOUS
        parking_status = "suspicious"
        reasons.append(f"Skewed alignment: {int(angle_err)}° angle error relative to slot")

    elif encroachments:
        state = STATE_SUSPICIOUS
        parking_status = "suspicious"
        near = [f"{sid} ({int(sc*100)}%)" for sid, sc in encroachments.items()]
        reasons.append(f"Close to boundary line of {', '.join(near)}")

    else:
        state = STATE_CORRECT
        parking_status = "correct"
        reasons.append("Correctly parked within boundary lines")

    if state == STATE_CORRECT and occlusion_level < 0.25 and vehicle_history:
        vehicle_history.last_known_clean_state = STATE_CORRECT

    return SlotIntelligenceReport(
        slot_id=slot_id,
        state=state,
        occupancy_status=STATE_OCCUPIED,
        parking_status=parking_status,
        vehicle_track_id=getattr(assigned_vehicle, "track_id", None),
        slot_coverage_percent=slot_cov * 100.0,
        outside_slot_percent=outside_ratio * 100.0,
        angle_error_deg=angle_err,
        double_parking=double_parked,
        straddled_slots=straddles,
        encroachments=encroachments,
        occlusion_state=occlusion_state,
        occlusion_level=occlusion_level,
        visible_geometry_confidence=visible_geom_conf,
        parking_confidence=parking_conf,
        confidence=parking_conf,
        reason="; ".join(reasons),
        plate=getattr(assigned_vehicle, "plate", ""),
        geometry_source="mask" if use_contact else "bbox",
        line_crossing_m=contact.crossing_m if use_contact else 0.0,
        line_crossing_possible_m=contact.crossing_upper_m if use_contact else 0.0,
        crossing_side=(contact.crossing_side or contact.crossing_upper_side) if use_contact else None,
        skew_deg=contact.skew_deg if use_contact else None,
        reason_codes=list(contact.reason_codes) if use_contact else ["BBOX_FOOTPRINT_ONLY"],
    )
