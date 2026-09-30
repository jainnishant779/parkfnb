"""
Parking bay occupancy, slot geometry registry, and spatial parking intelligence.

Architecture:
  YOLO (Perception) -> ByteTrack (Tracking) -> Spatial Geometry (Footprint & NeoSmart)
  -> Temporal State Engine (Debouncing & Persistence) -> Event Engine (Alerts)

Formal 7-State Product Contract:
  1. FREE: No stable vehicle-slot association
  2. OCCUPIED: Vehicle present, correctness not yet established / analyzing
  3. CORRECT: Geometry within calibrated tolerance
  4. SUSPICIOUS: Borderline alignment or unconfirmed spike
  5. WRONG: Persistent geometry violation (>= min_persistence_seconds)
  6. OCCLUDED: Vehicle state cannot be reliably observed due to foreground occlusion
  7. UNKNOWN: Camera/model/system confidence insufficient
"""

from __future__ import annotations

import math
import time
from collections import deque, Counter
from dataclasses import dataclass, field, asdict
from typing import Iterable, Sequence, Dict, List, Any

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, box as shapely_box
from shapely.validation import make_valid
from calibration import SiteCalibration, fit_site_calibration
from contact import (
    DOOR_GAP_M, STALL_LENGTH_M, STALL_WIDTH_M, BayFrame, analyse_contact, bay_frame, to_other_stall,
)
from detector import normalise_plate
from intelligence import (
    STATE_FREE, STATE_OCCUPIED, STATE_CORRECT, STATE_SUSPICIOUS,
    STATE_WRONG, STATE_OCCLUDED, STATE_UNKNOWN,
    CameraProfile, ParkingThresholds, SlotIntelligenceReport,
    VehicleStateHistory, VehicleStateManager,
    compute_outside_ratio, compute_slot_coverage, compute_angle_error,
    evaluate_parking_intelligence, compute_inter_vehicle_occlusion,
)

# --- tuning constants & legacy aliases ---------------------------------------
OCCUPIED_AT = 0.50          # coverage >= this -> occupied
EMPTY_AT = 0.20             # coverage <= this -> empty
FOOTPRINT_FRACTION = 0.28   # default bottom slice of box on tarmac
FOOTPRINT_BLEND_DEG = 12.0  # straight-on slice -> angled chassis, blended over this many degrees

# Two-wheeler heuristic
TWO_WHEELER_MAX_AREA_RATIO = 0.22   # box area vs bay area
TWO_WHEELER_MIN_ASPECT = 0.55       # h/w: tall for their width

# Backward-compatibility aliases
EMPTY = STATE_FREE
OCCUPIED = STATE_OCCUPIED
BADLY_PARKED = STATE_WRONG
UNKNOWN = STATE_UNKNOWN

QUALITY_GOOD = "correct"        # neatly inside lines
QUALITY_MARGINAL = "marginal"   # close to line / skewed / partial
QUALITY_VIOLATION = "violation" # crossing line / blocking adjacent slot
QUALITY_NONE = "none"           # empty bay


# --- Slot Geometry Registry (Space Optimizer Bridge) -------------------------

@dataclass
class SlotDefinition:
    """
    Standardized machine-readable parking slot infrastructure entity.
    Directly bridges Space Optimizer geometry to CCTV coordinate system.
    """
    slot_id: str
    polygon: list[list[float]]
    orientation: float = 0.0
    vehicle_type: str = "car"  # "car", "two_wheeler", "bus", "truck", "accessible"
    zone_id: str = "default_zone"
    camera_id: str = "default"
    site_id: str = "default_site"

    def to_poly(self) -> Polygon:
        return _poly(self.polygon)


@dataclass
class SlotRegistry:
    """
    First-class registry of all parking infrastructure for a site/camera.
    Maintains machine-readable spatial geometry, versioning, and vehicle constraints.
    """
    site_id: str = "SITE_001"
    camera_id: str = "default"
    version: str = "1.0"
    slots: dict[str, SlotDefinition] = field(default_factory=dict)

    def add_slot(self, slot: SlotDefinition):
        self.slots[slot.slot_id] = slot

    def get_polygons(self) -> dict[str, Polygon]:
        return {k: v.to_poly() for k, v in self.slots.items()}

    def get_orientations(self) -> dict[str, float]:
        return {k: v.orientation for k, v in self.slots.items()}

    def dict(self) -> dict:
        return {
            "site_id": self.site_id,
            "camera_id": self.camera_id,
            "version": self.version,
            "slots": [
                {
                    "slot_id": s.slot_id,
                    "polygon": s.polygon,
                    "orientation": s.orientation,
                    "vehicle_type": s.vehicle_type,
                    "zone_id": s.zone_id,
                    "camera_id": s.camera_id,
                }
                for s in self.slots.values()
            ],
        }


# --- geometry primitives ----------------------------------------------------

def _poly(points: Sequence[Sequence[float]]) -> Polygon:
    """Build a bay polygon, repairing self-intersections from sloppy drawing."""
    p = Polygon([(float(x), float(y)) for x, y in points])
    if not p.is_valid:
        p = make_valid(p)
    if hasattr(p, "geoms"):
        polys = [g for g in p.geoms if g.geom_type == "Polygon"]
        if not polys:
            raise ValueError("bay polygon has no usable area")
        p = max(polys, key=lambda g: g.area)
    return p


def ground_footprint(x1: float, y1: float, x2: float, y2: float,
                     fraction: float = FOOTPRINT_FRACTION,
                     angle_deg: float = 0.0) -> Polygon:
    """
    Estimated tarmac patch of a vehicle from its detection box alone.

    This is the fallback used when no silhouette is available (see contact.py
    for the ground-contact path).  It is a heuristic: an axis-aligned box cannot
    reveal a vehicle's true footprint, and on an oblique camera the base slice
    covers only the rear bumper.
    """
    w = max(1.0, x2 - x1)
    h = max(1.0, y2 - y1)
    cx = (x1 + x2) / 2.0

    if fraction >= 1.0:
        # Top-down view: the box already is the ground patch.
        return affinity.rotate(shapely_box(x1, y1, x2, y2), angle_deg, origin="centroid")

    # Two shapes, both checked against real footage: a thin slice along the base
    # of the box for a straight-on car, and a chassis rectangle through the lower
    # body for an angled one.  Blend between them over the first few degrees
    # instead of switching at a threshold, so a small angle neither snaps to flat
    # nor jumps to a different area.
    a = abs(angle_deg) % 180.0
    a = min(a, 180.0 - a)
    t = min(1.0, a / FOOTPRINT_BLEND_DEG)
    t = t * t * (3.0 - 2.0 * t)                      # smoothstep

    flat_l, flat_w, flat_cy = w, max(2.0, h * fraction), y2 - max(2.0, h * fraction) / 2.0
    diag_l = max(w * 0.70, min(w * 0.90, float(np.hypot(w * 0.65, h * 0.45))))
    diag_w = max(16.0, min(w * 0.40, h * 0.35))
    diag_cy = y1 + h * 0.58

    chassis_l = flat_l + (diag_l - flat_l) * t
    chassis_w = flat_w + (diag_w - flat_w) * t
    cy_ground = flat_cy + (diag_cy - flat_cy) * t

    rect = shapely_box(cx - chassis_l / 2.0, cy_ground - chassis_w / 2.0,
                       cx + chassis_l / 2.0, cy_ground + chassis_w / 2.0)
    return affinity.rotate(rect, angle_deg, origin=(cx, cy_ground))


def coverage(bay: Polygon, vehicle_footprint: Polygon) -> float:
    """Fraction of the bay polygon covered by the vehicle's ground footprint."""
    if bay.area <= 0:
        return 0.0
    return bay.intersection(vehicle_footprint).area / bay.area


def bay_axis_degrees(poly: Polygon) -> float:
    """Computes the primary longitudinal orientation of a slot polygon in [0, 180) degrees."""
    mrr = poly.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)[:-1]
    if len(coords) < 4:
        return 0.0

    d01 = math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    d12 = math.hypot(coords[2][0] - coords[1][0], coords[2][1] - coords[1][1])

    if d01 >= d12:
        dx = coords[1][0] - coords[0][0]
        dy = coords[1][1] - coords[0][1]
    else:
        dx = coords[2][0] - coords[1][0]
        dy = coords[2][1] - coords[1][1]

    angle = math.degrees(math.atan2(dy, dx)) % 180.0
    return angle


# --- data carriers ----------------------------------------------------------

@dataclass
class Detection:
    """A vehicle detected in one frame."""
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    class_id: int = 0
    plate: str = ""
    track_id: int | None = None
    orientation_degrees: float = 0.0
    orientation_confidence: float = 0.0
    occlusion_state: str = "visible"
    # Vehicle silhouette from a segmentation model: a binary mask in frame
    # pixels or an (N, 2) float outline.  None means only the box is known, and
    # the parking verdict falls back to the box-slice estimate.
    contact_shape: object = None
    contact_source: str | None = None

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height


@dataclass
class BayObservation:
    """Instantaneous observation of one bay in one frame."""
    bay_id: str
    state: str = STATE_FREE
    coverage: float = 0.0
    vehicle_index: int | None = None
    confidence: float = 0.0
    straddles: list[str] = field(default_factory=list)
    angle_offset: float | None = None
    two_wheeler: bool = False
    parking_quality: str = QUALITY_NONE
    lateral_offset: float | None = None
    encroachments: dict[str, float] = field(default_factory=dict)
    quality_note: str = ""
    plate: str = ""
    note: str = ""
    # Quantitative & Occlusion Metrics
    outside_slot_percent: float = 0.0
    angle_error_deg: float | None = None
    double_parking: bool = False
    vehicle_track_id: int | None = None
    occlusion_state: str = "visible"
    occlusion_level: float = 0.0
    visible_geometry_confidence: float = 1.0
    parking_confidence: float = 1.0
    reason: str = ""
    geometry_source: str = "bbox"
    line_crossing_m: float = 0.0
    line_crossing_possible_m: float = 0.0
    crossing_side: str | None = None
    skew_deg: float | None = None
    reason_codes: list[str] = field(default_factory=list)
    # The car relative to its bay in metres (contact.bay_relation); None when the
    # verdict came from the box-slice estimate.
    bay_relation: dict | None = None

    def dict(self):
        d = asdict(self)
        d["slot_id"] = self.bay_id
        d["vehicle_id"] = self.vehicle_track_id
        d["outside_ratio"] = round(self.outside_slot_percent / 100.0, 3)
        d["angle_error"] = self.angle_error_deg
        d["adjacent_slot_overlap"] = max(self.encroachments.values()) if self.encroachments else 0.0
        return d


@dataclass
class BayState:
    """Persistent, temporally smoothed state of one bay over time."""
    bay_id: str
    state: str = UNKNOWN
    status: str = "free"
    since: float = field(default_factory=time.time)
    coverage: float = 0.0
    straddles: list[str] = field(default_factory=list)
    two_wheeler: bool = False
    parking_quality: str = QUALITY_NONE
    lateral_offset: float | None = None
    encroachments: dict[str, float] = field(default_factory=dict)
    quality_note: str = ""
    plate: str = ""
    changed: bool = False
    previous_state: str = UNKNOWN
    # Quantitative & Occlusion Metrics
    outside_slot_percent: float = 0.0
    angle_error_deg: float | None = None
    double_parking: bool = False
    vehicle_id: int | None = None
    occlusion_state: str = "visible"
    occlusion_level: float = 0.0
    visible_geometry_confidence: float = 1.0
    parking_confidence: float = 1.0
    reason: str = ""
    wrong_since: float | None = None
    geometry_source: str = "bbox"
    line_crossing_m: float = 0.0
    line_crossing_possible_m: float = 0.0
    crossing_side: str | None = None
    skew_deg: float | None = None
    reason_codes: list[str] = field(default_factory=list)
    # The car relative to its bay in metres (contact.bay_relation); None when the
    # verdict came from the box-slice estimate.
    bay_relation: dict | None = None

    def dict(self):
        d = asdict(self)
        d["slot_id"] = self.bay_id
        d["held_for_seconds"] = round(time.time() - self.since, 1)
        d["duration_seconds"] = d["held_for_seconds"]
        d["outside_ratio"] = round(self.outside_slot_percent / 100.0, 3)
        d["angle_error"] = self.angle_error_deg
        d["adjacent_slot_overlap"] = max(self.encroachments.values()) if self.encroachments else 0.0
        if self.wrong_since:
            d["wrong_duration_sec"] = round(time.time() - self.wrong_since, 1)
        return d


# --- Space Optimizer Layout Import Bridge ------------------------------------

def import_optimizer_layout(layout_data: dict, calibrator=None) -> tuple[dict[str, list[list[float]]], SlotRegistry]:
    """
    Imports parking slots from Space Optimizer output.
    Returns:
      (dict of bay polygons for BayMap, SlotRegistry object for system registry)
    """
    if not layout_data:
        return {}, SlotRegistry()

    registry = SlotRegistry(
        site_id=layout_data.get("site_id", "SITE_001"),
        camera_id=layout_data.get("camera_id", "default"),
        version=str(layout_data.get("version", "1.0"))
    )

    slots_raw = layout_data.get("slots") or layout_data.get("bays")
    if not slots_raw and "result" in layout_data and isinstance(layout_data["result"], dict):
        slots_raw = layout_data["result"].get("slots")

    bays = {}
    if isinstance(slots_raw, list):
        for idx, s in enumerate(slots_raw, 1):
            if isinstance(s, dict):
                sid = str(s.get("id") or s.get("slot_id") or f"Bay-{idx:02d}")
                pts = s.get("ring") or s.get("path") or s.get("polygon")
                orient = float(s.get("orientation") or s.get("angle") or 0.0)
                vtype = str(s.get("vehicle_type") or s.get("type") or "car")
                zone = str(s.get("zone_id") or "zone_1")

                if pts and isinstance(pts, list):
                    coords = []
                    for p in pts:
                        if isinstance(p, (list, tuple)) and len(p) >= 2:
                            coords.append([float(p[0]), float(p[1])])
                        elif isinstance(p, dict) and "lng" in p and "lat" in p:
                            coords.append([float(p["lng"]), float(p["lat"])])
                        elif isinstance(p, dict) and "x" in p and "y" in p:
                            coords.append([float(p["x"]), float(p["y"])])
                    if coords:
                        if calibrator and getattr(calibrator, "is_calibrated", False):
                            coords = calibrator.ground_to_image(coords)
                        bays[sid] = coords
                        registry.add_slot(SlotDefinition(
                            slot_id=sid, polygon=coords, orientation=orient,
                            vehicle_type=vtype, zone_id=zone, camera_id=registry.camera_id
                        ))
    elif isinstance(slots_raw, dict):
        for k, v in slots_raw.items():
            coords = list(v)
            bays[str(k)] = coords
            registry.add_slot(SlotDefinition(slot_id=str(k), polygon=coords))
    elif isinstance(layout_data, dict) and not any(k in layout_data for k in ("slots", "result", "bays")):
        for k, v in layout_data.items():
            if isinstance(v, (list, tuple)):
                coords = list(v)
                bays[str(k)] = coords
                registry.add_slot(SlotDefinition(slot_id=str(k), polygon=coords))

    return bays, registry


# --- BayMap (Spatial Geometry Mapping) ---------------------------------------

class BayMap:
    """
    The spatial mapping for one camera: polygon per bay.
    Each vehicle is assigned to exactly one bay — the one it covers most.
    """

    def __init__(self, bays: dict[str, Sequence[Sequence[float]]],
                 view: str = "oblique", camera_profile: CameraProfile | None = None,
                 bay_sizes: dict[str, tuple[float, float]] | None = None):
        if not bays:
            raise ValueError("no bays defined")
        self.view = view
        self.profile = camera_profile or CameraProfile(view_angle=view)
        self.footprint_fraction = self.profile.get_bottom_fraction()
        self.polygons: dict[str, Polygon] = {k: _poly(v) for k, v in bays.items()}
        self.axes: dict[str, float] = {
            k: bay_axis_degrees(p) for k, p in self.polygons.items()
        }
        self.vehicle_state_manager = VehicleStateManager()

        # One metric stall frame per bay, for ground-contact evidence.  A bay that
        # cannot be framed (degenerate drawing) simply falls back to the box-slice
        # estimate; it must not take the whole map down.
        sizes = bay_sizes or {}
        self._bay_points = {k: [list(map(float, p)) for p in v] for k, v in bays.items()}
        self._bay_sizes = dict(sizes)
        self._calibrations: dict[tuple[int, int], SiteCalibration] = {}
        self.last_image_size: tuple[int, int] | None = None
        self.frames: dict[str, BayFrame] = {}
        for bid, pts in bays.items():
            w_m, l_m = sizes.get(bid, (STALL_WIDTH_M, STALL_LENGTH_M))
            try:
                self.frames[bid] = bay_frame(pts, w_m, l_m)
            except ValueError:
                pass

    def calibration(self, image_size: tuple[int, int]) -> SiteCalibration:
        """One camera for all bays at this frame size, fitted once and cached."""
        key = (int(image_size[0]), int(image_size[1]))
        if key not in self._calibrations:
            self._calibrations[key] = fit_site_calibration(self._bay_points, key, self._bay_sizes)
        return self._calibrations[key]

    @property
    def bay_ids(self) -> list[str]:
        return list(self.polygons)

    def _looks_like_two_wheeler(self, det, bay: Polygon) -> bool:
        if bay.area <= 0:
            return False
        det_area = getattr(det, "area", (getattr(det, "width", 1.0) * getattr(det, "height", 1.0)))
        small = det_area / bay.area < TWO_WHEELER_MAX_AREA_RATIO
        h = getattr(det, "height", 1.0)
        w = getattr(det, "width", 1.0)
        tall = h / w > TWO_WHEELER_MIN_ASPECT
        return small and tall

    def observe(self, detections: Iterable, camera_profile: CameraProfile | None = None,
                thresholds: ParkingThresholds | None = None,
                image_size: tuple[int, int] | None = None) -> list[BayObservation]:
        """
        `image_size` is (width, height) of the frame; ground-contact evidence
        needs it to recover the camera, so without it every bay uses the
        box-slice estimate.
        """
        dets = list(detections)
        if image_size is not None:
            self.last_image_size = (int(image_size[0]), int(image_size[1]))
        profile = camera_profile or self.profile
        fraction = profile.get_bottom_fraction()
        cfg = thresholds or ParkingThresholds()

        # Flat footprint for the initial bay-assignment pass only — which
        # bay a vehicle belongs to is decided before we know that bay's own
        # axis, so there is no slot angle yet to align to here. The final,
        # slot-aligned footprint is (re)built below once a bay is assigned.
        footprints = [
            ground_footprint(d.x1, d.y1, d.x2, d.y2, fraction, angle_deg=0.0)
            for d in dets
        ]

        # coverage[bay][vehicle]
        grid: dict[str, list[float]] = {
            bid: [coverage(poly, fp) for fp in footprints]
            for bid, poly in self.polygons.items()
        }

        # Greedy / Hungarian 1-Car-to-1-Bay Assignment
        owner: dict[int, str] = {}
        for vi in range(len(dets)):
            scores = {bid: grid[bid][vi] for bid in self.polygons}
            best = max(scores, key=scores.get) if scores else None
            if best is not None and scores[best] > 0:
                owner[vi] = best

        cal = self.calibration(image_size) if image_size is not None else None
        out: list[BayObservation] = []
        for bid, poly in self.polygons.items():
            mine = [vi for vi, b in owner.items() if b == bid]
            if not mine:
                out.append(BayObservation(
                    bay_id=bid,
                    state=STATE_FREE,
                    coverage=0.0,
                    outside_slot_percent=0.0,
                    reason="Slot is empty",
                ))
                continue

            vi = max(mine, key=lambda i: grid[bid][i])
            det = dets[vi]
            two = self._looks_like_two_wheeler(det, poly)

            # Orientation: the bay's own drawn/stored axis is authoritative
            # for FOOTPRINT construction.  CV-estimated vehicle orientation
            # (Otsu/PCA on the crop) is too unreliable on real CCTV footage,
            # so it is NOT used for building the cyan chassis polygon.
            #
            # However, the vehicle's raw measured angle IS still forwarded
            # to the intelligence engine for angle-error checking — so that
            # a car parked diagonally across a slot gets flagged as WRONG.
            slot_ang = self.axes.get(bid, 0.0)
            effective_ang = slot_ang  # footprint aligns to bay axis

            oriented_fp = ground_footprint(det.x1, det.y1, det.x2, det.y2, fraction, angle_deg=effective_ang)
            det.footprint = oriented_fp
            fp = oriented_fp
            cov = coverage(poly, fp)

            veh_all_covs = {other_bid: grid[other_bid][vi] for other_bid in self.polygons}

            # Retrieve or initialize temporal vehicle state history
            v_hist = None
            tid = getattr(det, "track_id", None)
            if tid is not None:
                v_hist = self.vehicle_state_manager.get_or_create(tid)
                v_hist.slot_id = bid

            # Vehicle's own measured angle for skew detection.
            # Only evaluate angle error if orientation was confidently measured
            # (i.e. not degenerate Otsu fallback or unmeasured 0.0 default).
            meas_conf = getattr(det, 'orientation_confidence', 0.0)
            if meas_conf >= 0.50:
                measured_veh_ang = getattr(det, 'orientation_degrees', None)
            else:
                measured_veh_ang = None

            # Ground-contact evidence, when the vehicle carries a silhouette and
            # this bay could be framed.  Otherwise the box-slice path decides.
            contact = None
            shape = getattr(det, "contact_shape", None)
            if shape is not None and cal is not None and bid in cal.frames:
                contact = analyse_contact(shape, bid, cal.frames, image_size,
                                          min_crossing_m=cfg.line_crossing_min_m,
                                          poses=cal.poses)
                # Without a recovered camera, contact points cannot be corrected
                # for height: body panels then read as intrusions into the
                # neighbouring bay.  On real frames that turned correctly parked
                # cars SUSPICIOUS, so the box-slice estimate decides instead.
                if not contact.camera_recovered:
                    contact = None
                else:
                    contact.calibration_status = cal.status(bid)
                    bc = cal.bays.get(bid)
                    contact.calibration_margin_m = bc.margin_m if bc is not None else None
                    if contact.calibration_status != "good":
                        contact.reason_codes.append("CALIBRATION_DEGRADED")

            # Run full PARKBNB Spatial Intelligence Engine with pairwise occlusion & temporal state memory
            intel: SlotIntelligenceReport = evaluate_parking_intelligence(
                slot_id=bid,
                slot_polygon=poly,
                slot_angle_deg=self.axes[bid],
                assigned_vehicle=det,
                all_slot_polygons=self.polygons,
                all_slot_coverages_for_vehicle=veh_all_covs,
                cfg=cfg,
                assigned_footprint=fp,
                camera_profile=profile,
                all_vehicles=dets,
                vehicle_history=v_hist,
                vehicle_angle_deg=measured_veh_ang,
                contact=contact,
            )

            # Draw the footprint the verdict actually rests on.
            if contact is not None and contact.footprint_image is not None and intel.geometry_source == "mask":
                det.footprint = contact.footprint_image

            relation = None
            if contact is not None and contact.relation is not None and intel.geometry_source == "mask":
                relation = dict(contact.relation, calibration=contact.calibration_status)

            lateral_offset = round(fp.centroid.x - poly.centroid.x, 1)

            out.append(BayObservation(
                bay_id=bid,
                state=intel.state,
                coverage=round(cov, 3),
                vehicle_index=vi,
                confidence=round(intel.confidence, 3),
                straddles=intel.straddled_slots,
                angle_offset=round(intel.angle_error_deg, 1) if intel.angle_error_deg is not None else None,
                two_wheeler=two,
                parking_quality=intel.parking_status,
                lateral_offset=lateral_offset,
                encroachments=intel.encroachments,
                quality_note=intel.reason,
                plate=getattr(det, "plate", ""),
                note="two-wheeler" if two else "",
                outside_slot_percent=round(intel.outside_slot_percent, 1),
                angle_error_deg=round(intel.angle_error_deg, 1) if intel.angle_error_deg is not None else None,
                double_parking=intel.double_parking,
                vehicle_track_id=getattr(det, "track_id", None),
                occlusion_state=intel.occlusion_state,
                occlusion_level=intel.occlusion_level,
                visible_geometry_confidence=intel.visible_geometry_confidence,
                parking_confidence=intel.parking_confidence,
                reason=intel.reason,
                geometry_source=intel.geometry_source,
                line_crossing_m=round(intel.line_crossing_m, 3),
                line_crossing_possible_m=round(intel.line_crossing_possible_m, 3),
                crossing_side=intel.crossing_side,
                skew_deg=round(intel.skew_deg, 1) if intel.skew_deg is not None else None,
                reason_codes=list(intel.reason_codes),
                bay_relation=relation,
            ))

        if cal is not None:
            _neighbour_gaps(out, cal.frames)
        return out


ADJACENT_STALL_M = 0.5      # stalls closer than this count as neighbours for door gaps


def _neighbour_gaps(observations: list, frames: dict) -> None:
    """
    Gap from each measured car to the car in each adjacent bay, in metres, in
    the first bay's frame.  Under DOOR_GAP_M a door cannot open fully.
    """
    measured = {o.bay_id: np.asarray(o.bay_relation["footprint_m"], dtype=np.float64)
                for o in observations if o.bay_relation is not None and o.bay_id in frames}
    for a, fa in measured.items():
        frame_a = frames[a]
        stall_a = Polygon([(0, 0), (frame_a.width_m, 0), (frame_a.width_m, frame_a.length_m),
                           (0, frame_a.length_m)])
        car_a = Polygon([tuple(p) for p in fa])
        gaps, tight = {}, []
        for b, fb in measured.items():
            if b == a:
                continue
            frame_b = frames[b]
            stall_b = Polygon(to_other_stall(np.array([(0, 0), (frame_b.width_m, 0),
                                                       (frame_b.width_m, frame_b.length_m),
                                                       (0, frame_b.length_m)], float), frame_b, frame_a))
            if not stall_b.is_valid or stall_a.distance(stall_b) > ADJACENT_STALL_M:
                continue
            car_b = Polygon(to_other_stall(fb, frame_b, frame_a))
            if not car_b.is_valid:
                continue
            gap = round(float(car_a.distance(car_b)), 3)
            gaps[b] = gap
            if gap < DOOR_GAP_M:
                tight.append(b)
        rel = next(o for o in observations if o.bay_id == a).bay_relation
        rel["neighbour_gap_m"] = gaps
        rel["door_blocked_by"] = tight


def plan_view(bay_map: BayMap, states: dict) -> dict:
    """
    Top-down layout for the dashboard: every stall and every measured car in one
    ground frame, metres, camera at the origin looking along +Y.  Needs the site
    camera; with per-bay calibration there is no shared frame to place bays in.
    """
    size = bay_map.last_image_size
    cal = bay_map.calibration(size) if size is not None else None
    if cal is None or cal.camera is None:
        return {"available": False, "reason": "needs a site calibration (two or more good bays)"}

    def r(pts):
        return [[round(float(x), 3), round(float(y), 3)] for x, y in pts]

    bays = []
    for bid, bc in cal.bays.items():
        if bc.frame is None or bc.placement is None:
            continue
        st = states.get(bid)
        rel = getattr(st, "bay_relation", None) if st is not None else None
        car = None
        if rel and st.state != STATE_FREE:
            car = r(cal.stall_to_world(bid, rel["footprint_m"]))
        bays.append({
            "bay_id": bid,
            "state": st.state if st is not None else STATE_UNKNOWN,
            "calibration": bc.status,
            "corners": r(cal.stall_to_world(bid, [(0, 0), (bc.frame.width_m, 0),
                                                  (bc.frame.width_m, bc.frame.length_m),
                                                  (0, bc.frame.length_m)])),
            "car": car,
            "relation": rel if car is not None else None,
        })
    return {"available": True, "bays": bays}


# --- Plate Majority Voting Consensus ----------------------------------------

def consensus_plate(plate_history: Sequence[str]) -> str:
    """Computes character-by-character consensus plate from rolling observations."""
    valid_candidates = []
    for p in plate_history:
        p_clean = (p or "").strip().upper()
        if p_clean:
            norm_p, is_valid = normalise_plate(p_clean)
            if is_valid:
                valid_candidates.append(norm_p)

    pool = valid_candidates if valid_candidates else [p.strip().upper() for p in plate_history if p and len(p.strip()) >= 6]
    if not pool:
        return ""

    lengths = [len(p) for p in pool]
    target_len = Counter(lengths).most_common(1)[0][0]
    aligned = [p for p in pool if len(p) == target_len]

    consensus = []
    for i in range(target_len):
        col_chars = [p[i] for p in aligned]
        best_char = Counter(col_chars).most_common(1)[0][0]
        consensus.append(best_char)

    return "".join(consensus)


# --- Dedicated Parking Intelligence Engine (Temporal State Machine) ---------

class ParkingIntelligenceEngine:
    """
    Dedicated decision engine for parking spatial intelligence and temporal state machine.
    Decoupled from YOLO (perception) and ByteTrack (tracking).

    Lifecycle Contract:
      DETECTED -> CANDIDATE -> OCCUPIED (Analyzing) -> [CORRECT | SUSPICIOUS -> WRONG] -> EXIT
      - Anti-Spike Protection: Single-frame outliers (e.g. during parking maneuver) do not fire alerts.
      - Temporal Persistence: Violation must persist for >= min_persistence_seconds before WRONG state.
    """

    def __init__(self, bay_map: BayMap, camera_profile: CameraProfile | None = None,
                 thresholds: ParkingThresholds | None = None, window: int = 6,
                 occupy_votes: int = 3, free_votes: int = 5):
        self.map = bay_map
        self.profile = camera_profile or getattr(bay_map, "profile", CameraProfile())
        self.thresholds = thresholds or ParkingThresholds()
        self.window = window
        self.occupy_votes = occupy_votes
        self.free_votes = free_votes

        self.history: dict[str, deque[BayObservation]] = {
            b: deque(maxlen=window) for b in bay_map.bay_ids
        }
        self.plate_history: dict[str, deque[str]] = {
            b: deque(maxlen=8) for b in bay_map.bay_ids
        }
        self.states: dict[str, BayState] = {
            b: BayState(b) for b in bay_map.bay_ids
        }
        self.event_queue: list[dict] = []

    def pop_events(self) -> list[dict]:
        events = list(self.event_queue)
        self.event_queue.clear()
        return events

    def update(self, detections: Iterable, observations: list | None = None,
               image_size: tuple[int, int] | None = None) -> dict[str, BayState]:
        now = time.time()
        obs_list = observations if observations is not None else self.map.observe(
            detections, camera_profile=self.profile, thresholds=self.thresholds,
            image_size=image_size,
        )

        for obs in obs_list:
            bid = obs.bay_id
            if bid not in self.history:
                self.history[bid] = deque(maxlen=self.window)
                self.plate_history[bid] = deque(maxlen=8)
                self.states[bid] = BayState(bid)

            hist = self.history[bid]
            hist.append(obs)
            cur = self.states[bid]
            cur.changed = False

            if obs.plate and obs.state != STATE_FREE:
                self.plate_history[bid].append(obs.plate)

            votes = [o.state for o in hist]
            occupied_like = sum(1 for v in votes if v not in (STATE_FREE, STATE_UNKNOWN))
            empty_like = sum(1 for v in votes if v == STATE_FREE)

            new = cur.state
            if cur.state == STATE_UNKNOWN:
                # Bootstrap: accept first observation, but demote a borderline
                # WRONG to SUSPICIOUS so the persistence timer still applies
                # (protects against a car mid-parking-maneuver on frame one).
                # An extreme violation — double the outside-ratio threshold —
                # is not given that benefit of the doubt: a car already
                # halfway out of its bay on the very first frame is wrong
                # now, not "wrong if it's still there in 5 seconds."
                new = obs.state
                if new == STATE_WRONG:
                    is_extreme = obs.outside_slot_percent >= self.thresholds.outside_wrong_min * 200.0
                    if is_extreme:
                        cur.wrong_since = now - self.thresholds.min_persistence_seconds
                    else:
                        new = STATE_SUSPICIOUS  # require persistence before WRONG
                        cur.wrong_since = now
                else:
                    cur.wrong_since = None
            elif occupied_like >= self.occupy_votes:
                # Evaluating correctness with temporal anti-spike debouncing & occlusion guard
                is_occluded = (
                    obs.state == STATE_OCCLUDED or
                    obs.occlusion_level >= self.thresholds.occlusion_threshold or
                    obs.occlusion_state == "heavily_occluded"
                )

                if is_occluded:
                    # Hold the violation timer rather than clearing it.  A car
                    # that is already mis-parked does not become innocent because
                    # something drove in front of it, and resetting here let a
                    # vehicle in a busy lane dodge the persistence threshold
                    # indefinitely.  It resumes from where it left off once the
                    # view clears; only genuinely correct parking clears it.
                    new = STATE_OCCLUDED
                else:
                    is_violating = (
                        obs.state == STATE_WRONG or
                        obs.parking_quality in ("wrong", QUALITY_VIOLATION) or
                        obs.double_parking or
                        obs.outside_slot_percent >= self.thresholds.outside_wrong_min * 100.0
                    )
                    is_suspicious = (
                        obs.state == STATE_SUSPICIOUS or
                        obs.outside_slot_percent >= self.thresholds.suspicious_max_outside * 100.0 or
                        (obs.angle_error_deg is not None and obs.angle_error_deg > self.thresholds.angle_error_suspicious)
                    )

                    if is_violating:
                        if cur.wrong_since is None:
                            cur.wrong_since = now
                        # Only confirm WRONG state if violation persists continuously
                        if (now - cur.wrong_since) >= self.thresholds.min_persistence_seconds:
                            new = STATE_WRONG
                        else:
                            new = STATE_SUSPICIOUS
                    elif is_suspicious:
                        cur.wrong_since = None
                        new = STATE_SUSPICIOUS
                    else:
                        # Clear any temporary violation timer — maneuver was corrected!
                        cur.wrong_since = None
                        new = STATE_CORRECT
            elif empty_like >= self.free_votes:
                new = STATE_FREE
                cur.wrong_since = None

            state_transition = (new != cur.state)
            if state_transition:
                cur.previous_state = cur.state
                cur.state = new
                cur.since = now
                cur.changed = True

            cur.status = "free" if cur.state == STATE_FREE else "occupied"
            cur.coverage = obs.coverage
            cur.straddles = obs.straddles
            cur.two_wheeler = obs.two_wheeler
            cur.parking_quality = obs.parking_quality
            cur.lateral_offset = obs.lateral_offset
            cur.encroachments = obs.encroachments
            cur.quality_note = obs.quality_note
            cur.outside_slot_percent = obs.outside_slot_percent
            cur.angle_error_deg = obs.angle_error_deg
            cur.double_parking = obs.double_parking
            cur.vehicle_id = obs.vehicle_track_id
            cur.occlusion_state = obs.occlusion_state
            cur.occlusion_level = obs.occlusion_level
            cur.visible_geometry_confidence = obs.visible_geometry_confidence
            cur.parking_confidence = obs.parking_confidence
            cur.reason = obs.reason
            cur.geometry_source = obs.geometry_source
            cur.line_crossing_m = obs.line_crossing_m
            cur.line_crossing_possible_m = obs.line_crossing_possible_m
            cur.crossing_side = obs.crossing_side
            cur.skew_deg = obs.skew_deg
            cur.reason_codes = list(obs.reason_codes)
            cur.bay_relation = obs.bay_relation

            # Plate consensus
            voted_plate = consensus_plate(self.plate_history[bid])
            if cur.state != STATE_FREE:
                if voted_plate:
                    cur.plate = voted_plate
                elif obs.plate:
                    cur.plate = obs.plate

            # Enqueue events on verified transitions
            if state_transition:
                if cur.state != STATE_FREE and cur.previous_state in (STATE_FREE, STATE_UNKNOWN):
                    self.event_queue.append({
                        "event": "bay_occupied",
                        "bay_id": bid,
                        "track_id": cur.vehicle_id,
                        "plate": cur.plate or obs.plate,
                        "quality": cur.parking_quality,
                        "state": cur.state,
                        "coverage": cur.coverage,
                        "outside_percent": cur.outside_slot_percent,
                        "parking_confidence": cur.parking_confidence,
                        "timestamp": now,
                    })
                elif cur.state == STATE_FREE and cur.previous_state != STATE_FREE:
                    self.event_queue.append({
                        "event": "bay_freed",
                        "bay_id": bid,
                        "track_id": cur.vehicle_id,
                        "plate": cur.plate,
                        "timestamp": now,
                    })

                if cur.state == STATE_WRONG and cur.previous_state != STATE_WRONG:
                    ev_type = "double_slot_occupancy" if cur.double_parking else "wrong_parking"
                    self.event_queue.append({
                        "event": ev_type,
                        "bay_id": bid,
                        "track_id": cur.vehicle_id,
                        "plate": cur.plate,
                        "quality": cur.parking_quality,
                        "outside_percent": cur.outside_slot_percent,
                        "angle_error": cur.angle_error_deg,
                        "double_parking": cur.double_parking,
                        "straddles": cur.straddles,
                        "encroachments": cur.encroachments,
                        "parking_confidence": cur.parking_confidence,
                        "reason": cur.reason,
                        "timestamp": now,
                    })

            if state_transition and cur.state == STATE_FREE:
                cur.plate = ""
                cur.wrong_since = None
                self.plate_history[bid].clear()

        return self.states

    def summary(self) -> dict:
        s = list(self.states.values())
        return {
            "total": len(self.states),
            "free": sum(1 for b in s if b.state == STATE_FREE),
            "empty": sum(1 for b in s if b.state == STATE_FREE),
            "occupied": sum(1 for b in s if b.state != STATE_FREE),
            "correctly_parked": sum(1 for b in s if b.state in (STATE_CORRECT, STATE_OCCUPIED)),
            "suspicious": sum(1 for b in s if b.state == STATE_SUSPICIOUS),
            "badly_parked": sum(1 for b in s if b.state == STATE_WRONG),
            "wrong_parking": sum(1 for b in s if b.state == STATE_WRONG),
            "double_parked": sum(1 for b in s if b.double_parking),
            "occluded": sum(1 for b in s if b.state == STATE_OCCLUDED),
            "unknown": sum(1 for b in s if b.state == STATE_UNKNOWN),
            "bays": {b.bay_id: b.dict() for b in s},
        }


# Aliasing OccupancyTracker to ParkingIntelligenceEngine for complete backwards compatibility
OccupancyTracker = ParkingIntelligenceEngine


# --- drawing & visualization ------------------------------------------------

COLOURS = {
    STATE_FREE: (110, 180, 60),          # soft green
    STATE_CORRECT: (60, 200, 60),        # bright green
    STATE_SUSPICIOUS: (0, 200, 240),     # amber / yellow
    STATE_WRONG: (40, 40, 220),          # bright red
    STATE_OCCLUDED: (180, 60, 160),      # purple
    STATE_OCCUPIED: (40, 40, 210),       # red
    STATE_UNKNOWN: (140, 140, 140),      # gray
}


def annotate(frame, bay_map: BayMap, states: dict[str, BayState],
             detections: Iterable | None = None):
    """Draw bays tinted by 7-state model, with ID, plate, Outside %, and angle written on each."""
    import cv2

    img = frame.copy()
    overlay = img.copy()
    # Strokes and labels are sized for a ~1376 px frame; a 4096 px photo shown
    # in the browser is scaled down ~3x, and 1-2 px lines vanish.  Scale with it.
    k = _draw_scale(img)

    for bid, poly in bay_map.polygons.items():
        st = states.get(bid)
        state_key = st.state if st else STATE_FREE
        color = COLOURS.get(state_key, (120, 120, 120))

        pts = np.array(poly.exterior.coords, dtype=np.int32)
        cv2.fillPoly(overlay, [pts], color)
        cv2.polylines(img, [pts], isClosed=True, color=color, thickness=_t(2, k))

    cv2.addWeighted(overlay, 0.28, img, 0.72, 0, img)

    h_img, w_img = img.shape[:2]
    cal = bay_map.calibration((w_img, h_img))
    if cal.camera is not None:
        _draw_trays(img, cal, states, k)

    # Draw vehicle detections with oriented ground footprints
    if detections:
        fraction = getattr(bay_map, "footprint_fraction", FOOTPRINT_FRACTION)
        for d in detections:
            x1, y1, x2, y2 = int(d.x1), int(d.y1), int(d.x2), int(d.y2)
            cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), _t(1, k))

            # Draw ground footprint polygon in cyan with translucent fill
            fp = getattr(d, "footprint", None)
            if fp is not None and isinstance(fp, Polygon) and not fp.is_empty:
                pts = np.array(fp.exterior.coords, dtype=np.int32)
                fp_overlay = img.copy()
                cv2.fillPoly(fp_overlay, [pts], (255, 255, 0))
                cv2.addWeighted(fp_overlay, 0.25, img, 0.75, 0, img)
                cv2.polylines(img, [pts], isClosed=True, color=(255, 255, 0), thickness=_t(2, k))
            else:
                fy1 = int(y2 - (y2 - y1) * fraction)
                cv2.rectangle(img, (x1, fy1), (x2, y2), (255, 255, 0), _t(2, k))

            tid = getattr(d, "track_id", None)
            if tid is not None:
                cv2.putText(img, f"#{tid}", (x1, max(int(15 * k), y1 - int(4 * k))),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5 * k, (0, 255, 255), _t(2, k))

    if cal.camera is not None:
        for bid, st in states.items():
            if st is not None and st.state != STATE_FREE and st.bay_relation:
                _draw_car_box(img, cal, bid, st.bay_relation, k)

    # Write bay status text and labels
    for bid, poly in bay_map.polygons.items():
        st = states.get(bid)
        state_key = st.state if st else STATE_FREE
        cx, cy = int(poly.centroid.x), int(poly.centroid.y)

        tag = bid
        if st and st.state != STATE_FREE:
            tid_str = f"#{st.vehicle_id} " if st.vehicle_id else ""
            out_str = f"{int(st.outside_slot_percent)}%out" if st.outside_slot_percent > 0 else ""
            tag = f"{bid} {tid_str}{out_str}".strip()

        plate = st.plate if (st and st.plate) else ""
        sub = f"[{plate}]" if plate else state_key.upper()

        x0 = cx - int(30 * k)
        cv2.putText(img, tag, (x0, cy - int(6 * k)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50 * k, (255, 255, 255), _t(2, k))
        cv2.putText(img, sub, (x0, cy + int(12 * k)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45 * k, (255, 255, 255), _t(2, k))
        rel = st.bay_relation if st else None
        if rel and st.state != STATE_FREE:
            cv2.putText(img, f"{rel['label']} {rel['offset_m']:+.2f}m", (x0, cy + int(28 * k)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.40 * k, (255, 255, 255), _t(1, k))

    return img


# 3D context drawn with the site camera.  Judgement stays on the ground plane:
# a tall bay box would make any SUV "poke out" and cut across the neighbour, so
# a bay is drawn as a low tray and the car gets a box of its own size.
TRAY_HEIGHT_M = 0.3
CLEAR_OK = (60, 200, 60)
CLEAR_TIGHT = (0, 200, 240)
CLEAR_OVER = (40, 40, 220)


REFERENCE_WIDTH_PX = 1376        # frame width the stroke and font sizes were tuned on


def _draw_scale(img) -> float:
    return max(1.0, img.shape[1] / REFERENCE_WIDTH_PX)


def _t(px: float, k: float) -> int:
    """A stroke width in pixels, scaled to the frame."""
    return max(1, int(round(px * k)))


def _pt(p) -> tuple[int, int]:
    return int(round(float(p[0]))), int(round(float(p[1])))


def _line(img, a, b, color, thickness=1, dashed=False, dash_px=8.0):
    import cv2
    if not (np.isfinite(a).all() and np.isfinite(b).all()):
        return
    if not dashed:
        cv2.line(img, _pt(a), _pt(b), color, thickness, cv2.LINE_AA)
        return
    n = max(2, int(np.hypot(*(np.asarray(b) - np.asarray(a))) // dash_px))
    ts = np.linspace(0.0, 1.0, n + 1)
    for i in range(0, n, 2):
        p = np.asarray(a) + (np.asarray(b) - np.asarray(a)) * ts[i]
        q = np.asarray(a) + (np.asarray(b) - np.asarray(a)) * ts[i + 1]
        cv2.line(img, _pt(p), _pt(q), color, thickness, cv2.LINE_AA)


def _stall_corners(frame) -> np.ndarray:
    return np.array([(0, 0), (frame.width_m, 0), (frame.width_m, frame.length_m), (0, frame.length_m)], float)


def _draw_trays(img, cal, states, k: float = 1.0):
    for bid, bc in cal.bays.items():
        if bc.status == "rejected" or bc.frame is None:
            continue
        st = states.get(bid)
        color = COLOURS.get(st.state if st else STATE_FREE, (120, 120, 120))
        corners = _stall_corners(bc.frame)
        base = cal.project_stall(bid, corners, 0.0)
        rim = cal.project_stall(bid, corners, TRAY_HEIGHT_M)
        if base is None:
            continue
        for i in range(4):
            j = (i + 1) % 4
            _line(img, rim[i], rim[j], color, _t(1, k))
            _line(img, base[i], rim[i], color, _t(1, k))


def _clearance_colour(v: float) -> tuple:
    from contact import TIGHT_CLEARANCE_M
    return CLEAR_OVER if v < 0 else CLEAR_TIGHT if v < TIGHT_CLEARANCE_M else CLEAR_OK


def _draw_car_box(img, cal, bid: str, rel: dict, k: float = 1.0):
    import cv2
    from contact import VEHICLE_HEIGHT_PRIOR_M
    fp = np.asarray(rel["footprint_m"], dtype=np.float64)
    base = cal.project_stall(bid, fp, 0.0)
    top = cal.project_stall(bid, fp, VEHICLE_HEIGHT_PRIOR_M)
    if base is None or not np.isfinite(base).all():
        return
    clr = rel["clearance"]
    # Footprint corners run near-left, near-right, far-right, far-left, so the
    # edges are the near, right, far and left sides of the car.
    for i, side in enumerate(("near", "right", "far", "left")):
        j = (i + 1) % 4
        _line(img, base[i], base[j], (255, 255, 255), _t(2, k),
              dashed=clr[side]["source"] != "measured", dash_px=8 * k)
        _line(img, top[i], top[j], (220, 220, 220), _t(1, k), dashed=True, dash_px=8 * k)
        _line(img, base[i], top[i], (220, 220, 220), _t(1, k), dashed=True, dash_px=8 * k)

    # Dimension callouts: from the car's outermost point on each side, square
    # across to that stall line, labelled with the clearance.
    frame = cal.bays[bid].frame
    xs, ys = fp[:, 0], fp[:, 1]
    # A square car has two corners tied for outermost: anchor mid-way between.
    tie = 0.02
    y_l = float(ys[xs <= xs.min() + tie].mean())
    y_r = float(ys[xs >= xs.max() - tie].mean())
    x_n = float(xs[ys <= ys.min() + tie].mean())
    callouts = {
        "left": ((xs.min(), y_l), (0.0, y_l), "L"),
        "right": ((xs.max(), y_r), (frame.width_m, y_r), "R"),
        "near": ((x_n, ys.min()), (x_n, 0.0), "N"),
    }
    for side, (a, b, tag) in callouts.items():
        c = clr[side]
        uv = cal.project_stall(bid, [a, b], 0.0)
        if uv is None or not np.isfinite(uv).all():
            continue
        # Coloured by what the camera saw; the whole-car estimate in brackets
        # when the outermost point on this side was hidden.
        colour = _clearance_colour(c["seen_m"])
        _line(img, uv[0], uv[1], colour, _t(2, k))
        cv2.circle(img, _pt(uv[1]), _t(3, k), colour, -1)
        text = f"{tag} {c['seen_m']:+.2f}m"
        if c["source"] != "measured":
            text += f" (~{c['m']:+.2f})"
        org = _pt((uv[0] + uv[1]) / 2 + (4 * k, -4 * k))
        cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.42 * k, (0, 0, 0), _t(3, k), cv2.LINE_AA)
        cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.42 * k, colour, _t(1, k), cv2.LINE_AA)
