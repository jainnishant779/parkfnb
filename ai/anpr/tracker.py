"""
PARKBNB Multi-Object Tracking (MOT) & Vehicle Perception Engine.

Integrates Ultralytics ByteTrack for persistent vehicle track IDs across CCTV frames.
Maintains trajectory history, stationary status, and occlusion modeling
(VISIBLE, PARTIALLY_OCCLUDED, HEAVILY_OCCLUDED, LOST) to prevent false alerts
when a vehicle is temporarily occluded behind another car.
"""

from __future__ import annotations

import time
import math
from dataclasses import dataclass, field
from collections import deque
from typing import Sequence

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, box as shapely_box
from detector import estimate_vehicle_orientation_and_mask
from occupancy import ground_footprint as make_ground_footprint

# Occlusion lifecycle states
OCCLUSION_VISIBLE = "visible"
OCCLUSION_PARTIAL = "partially_occluded"
OCCLUSION_HEAVY = "heavily_occluded"
OCCLUSION_LOST = "lost"

# Stationary velocity threshold (pixels per second)
STATIONARY_VELOCITY_THRESH = 8.0


@dataclass
class TrackedVehicle:
    """Represents a persistent vehicle tracked across multiple CCTV frames."""
    track_id: int
    cls_id: int
    cls_name: str
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)
    confidence: float
    footprint: Polygon
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    frame_count: int = 1
    centroid_history: deque[tuple[float, float, float]] = field(default_factory=lambda: deque(maxlen=30))  # (cx, cy, timestamp)
    velocity: float = 0.0  # px/sec
    is_stationary: bool = True
    occlusion_state: str = OCCLUSION_VISIBLE
    plate: str = ""
    orientation_deg: float = 0.0
    orientation_confidence: float = 0.0
    orientation_history: deque[float] = field(default_factory=lambda: deque(maxlen=20))
    # Heading the vehicle drove in, latched once it parks and its centroid
    # stops moving.  None means it was never seen moving far enough to tell.
    heading_deg: float | None = None
    heading_confidence: float = 0.0

    @property
    def x1(self) -> float:
        return self.bbox[0]

    @property
    def y1(self) -> float:
        return self.bbox[1]

    @property
    def x2(self) -> float:
        return self.bbox[2]

    @property
    def y2(self) -> float:
        return self.bbox[3]

    @property
    def width(self) -> float:
        return max(1.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def centroid(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    @property
    def orientation_degrees(self) -> float:
        """
        Best estimate of the vehicle's yaw.

        The latched driving heading wins when we have one: it comes from metres
        of real motion, whereas the appearance estimate comes from thresholding
        a low-contrast crop and is frequently wrong.  Only fall back to the
        appearance mean when the vehicle was never observed moving.
        """
        if self.heading_deg is not None:
            return self.heading_deg
        if self.orientation_history:
            return circular_mean_orientation(list(self.orientation_history))
        return self.orientation_deg

    def dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "cls_id": self.cls_id,
            "cls_name": self.cls_name,
            "bbox": [round(v, 1) for v in self.bbox],
            "confidence": round(self.confidence, 3),
            "velocity": round(self.velocity, 2),
            "is_stationary": self.is_stationary,
            "occlusion_state": self.occlusion_state,
            "plate": self.plate,
            "orientation_deg": round(self.orientation_degrees, 1),
            "duration_sec": round(time.time() - self.first_seen, 1),
            "frame_count": self.frame_count,
        }


def circular_mean_orientation(angles: Sequence[float]) -> float:
    """
    Computes circular mean of orientation angles with 180° axial symmetry.
    Prevents wrap-around artifacts (e.g., between -89° and +89°).
    """
    if not angles:
        return 0.0
    sin_sum = sum(math.sin(math.radians(2.0 * a)) for a in angles)
    cos_sum = sum(math.cos(math.radians(2.0 * a)) for a in angles)
    if abs(sin_sum) < 1e-6 and abs(cos_sum) < 1e-6:
        return float(angles[-1])
    mean_double = math.degrees(math.atan2(sin_sum, cos_sum))
    return float(mean_double / 2.0)


def heading_from_trajectory(
    centroid_history: Sequence[tuple[float, float, float]],
    min_displacement_px: float = 25.0,
) -> tuple[float, float] | None:
    """
    The direction a vehicle drove in, as (angle_deg in [0,180), confidence).

    Appearance-based orientation (Otsu/PCA on the crop) is unreliable on real
    CCTV: a grey car on grey tarmac has no dependable edge, so the estimator
    bails out with low confidence on most frames and skew detection never runs.
    Motion does not have that problem -- a car driving into a bay moves tens of
    pixels against sub-pixel tracking noise, and its heading *is* its yaw.

    Returns None when the vehicle has not moved far enough for the direction to
    mean anything (it was already parked, or is only jittering in place).  That
    honest "unknown" is the point: the caller must not fall back to a fake 0.0,
    which reads as "perfectly straight" downstream.
    """
    if not centroid_history or len(centroid_history) < 2:
        return None

    x0, y0, _ = centroid_history[0]
    x1, y1, _ = centroid_history[-1]
    dx, dy = x1 - x0, y1 - y0
    displacement = math.hypot(dx, dy)
    if displacement < min_displacement_px:
        return None

    angle = math.degrees(math.atan2(dy, dx)) % 180.0

    # Straighter, longer runs are more trustworthy: compare the net displacement
    # against the path actually walked, so a car that turned or wandered scores
    # lower than one that drove in cleanly.
    path = 0.0
    for (ax, ay, _), (bx, by, _) in zip(centroid_history, list(centroid_history)[1:]):
        path += math.hypot(bx - ax, by - ay)
    straightness = displacement / path if path > 0 else 0.0

    confidence = max(0.0, min(0.9, 0.55 + 0.35 * straightness))
    return angle, confidence


# make_ground_footprint is imported from occupancy.py (single source of truth)


def _box_iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


class VehicleMOTTracker:
    """
    Multi-Object Tracking manager.
    Wraps YOLO tracking with ByteTrack, maintains persistent TrackedVehicle objects,
    calculates velocity/stationary state, and handles vehicle-to-vehicle occlusion.
    """

    def __init__(self, model, tracker_config: str = "bytetrack.yaml",
                 footprint_fraction: float = 0.28,
                 max_lost_seconds: float = 5.0):
        self.model = model
        self.tracker_config = tracker_config
        self.footprint_fraction = footprint_fraction
        self.max_lost_seconds = max_lost_seconds
        self.tracks: dict[int, TrackedVehicle] = {}
        self._next_synthetic_id = 9000
        # ultralytics keeps ONE set of ByteTrack trackers on the model's predictor, however many cameras share the model: a second camera
        # (the gate phone) or a re-marked layout would carry the first one's associations and track ids.  Each of these keeps its own and
        # puts it on the predictor for the length of its own call.
        self._ult_trackers = None

    def reset(self):
        """Clears all tracking history."""
        self.tracks.clear()
        self._next_synthetic_id = 9000
        self._ult_trackers = None                         # a new ByteTrack on the next picture

    def _use_own_trackers(self) -> None:
        pred = getattr(self.model, "predictor", None)
        if pred is None:
            return                                        # the first call: ultralytics makes the predictor and the trackers
        if self._ult_trackers is not None:
            pred.trackers = self._ult_trackers
        elif hasattr(pred, "trackers"):
            del pred.trackers                             # someone else's: this one starts clean

    def _keep_own_trackers(self) -> None:
        pred = getattr(self.model, "predictor", None)
        if pred is not None and hasattr(pred, "trackers"):
            self._ult_trackers = pred.trackers

    def track_frame(self, frame: np.ndarray, conf: float = 0.10,
                    imgsz: int = 1280) -> list[TrackedVehicle]:
        """
        Runs YOLO with ByteTrack on the frame and returns updated persistent vehicle tracks.
        """
        now = time.time()
        self._use_own_trackers()
        results = self.model.track(
            source=frame,
            persist=True,
            tracker=self.tracker_config,
            conf=conf,
            imgsz=imgsz,
            verbose=False
        )
        self._keep_own_trackers()

        active_track_ids = set()
        current_vehicles: list[TrackedVehicle] = []

        if results and len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for b_idx, b in enumerate(boxes):
                cls_id = int(b.cls[0])
                # Only track vehicle classes (class 0 in user's model is vehicle)
                if cls_id != 0:
                    continue

                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
                det_conf = float(b.conf[0])
                
                # Check for ByteTrack assigned ID
                if b.id is not None:
                    track_id = int(b.id[0])
                else:
                    # Synthetic ID if tracker has not assigned yet
                    track_id = self._next_synthetic_id
                    self._next_synthetic_id += 1

                active_track_ids.add(track_id)
                
                # Silhouettes come from segmenter.py; the tracking model is detect-only.
                measured_ang, geom_conf, _ = estimate_vehicle_orientation_and_mask(
                    frame, x1, y1, x2, y2, seg_mask=None
                )
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0

                if track_id in self.tracks:
                    tv = self.tracks[track_id]
                    tv.bbox = (x1, y1, x2, y2)
                    tv.confidence = det_conf
                    tv.last_seen = now
                    tv.frame_count += 1
                    tv.centroid_history.append((cx, cy, now))
                    
                    # Update orientation history if not heavily occluded
                    if tv.occlusion_state != OCCLUSION_HEAVY:
                        tv.orientation_history.append(measured_ang)
                        tv.orientation_deg = circular_mean_orientation(list(tv.orientation_history))
                        tv.orientation_confidence = geom_conf

                    # Prefer the heading the vehicle actually drove in.  Once it
                    # has parked its centroid stops moving, so latch the last
                    # trusted heading rather than letting it decay to nothing.
                    motion = heading_from_trajectory(list(tv.centroid_history))
                    if motion is not None:
                        tv.orientation_deg, tv.orientation_confidence = motion
                        tv.heading_deg, tv.heading_confidence = motion
                    elif tv.heading_deg is not None:
                        tv.orientation_deg = tv.heading_deg
                        tv.orientation_confidence = tv.heading_confidence
                    
                    tv.footprint = make_ground_footprint(x1, y1, x2, y2, self.footprint_fraction, angle_deg=tv.orientation_degrees)
                    tv.occlusion_state = OCCLUSION_VISIBLE

                    # Compute velocity & stationary state over history
                    if len(tv.centroid_history) >= 2:
                        hist = list(tv.centroid_history)
                        p_old = hist[0]
                        p_new = hist[-1]
                        dt = max(0.05, p_new[2] - p_old[2])
                        dist = math.hypot(p_new[0] - p_old[0], p_new[1] - p_old[1])
                        tv.velocity = dist / dt
                        tv.is_stationary = tv.velocity < STATIONARY_VELOCITY_THRESH
                else:
                    # New track initialized
                    footprint = make_ground_footprint(x1, y1, x2, y2, self.footprint_fraction, angle_deg=measured_ang)
                    tv = TrackedVehicle(
                        track_id=track_id,
                        cls_id=cls_id,
                        cls_name="vehicle",
                        bbox=(x1, y1, x2, y2),
                        confidence=det_conf,
                        footprint=footprint,
                        first_seen=now,
                        last_seen=now,
                        frame_count=1,
                        centroid_history=deque([(cx, cy, now)], maxlen=30),
                        velocity=0.0,
                        is_stationary=True,
                        occlusion_state=OCCLUSION_VISIBLE,
                        orientation_deg=measured_ang,
                        orientation_confidence=geom_conf,
                        orientation_history=deque([measured_ang], maxlen=20),
                    )
                    self.tracks[track_id] = tv

                current_vehicles.append(tv)

        # Handle vehicle-to-vehicle occlusion and lost tracks
        self._evaluate_occlusion_and_prune(active_track_ids, current_vehicles, now)
        return current_vehicles

    EXTRA_ID_BASE = 50000          # ids of vehicles that only the second model saw, apart from ByteTrack's
    EXTRA_MATCH_IOU = 0.3          # the same extra vehicle from one refresh to the next

    def add_extra(self, boxes: list[tuple[float, float, float, float, float]], tracked: list[TrackedVehicle],
                  now: float | None = None) -> list[TrackedVehicle]:
        """
        Vehicles the tracking model missed but a second model found (`boxes`: x1, y1, x2, y2, confidence), typically a car
        half hidden behind another one.  Each becomes a TrackedVehicle with a stable id of its own (matched to the previous
        refresh by overlap), so the bays see it like any other car.  Returns those vehicles; `tracked` is not changed.
        """
        now = time.time() if now is None else now
        if not hasattr(self, "_extra"):
            self._extra: dict[int, TrackedVehicle] = {}
            self._next_extra_id = self.EXTRA_ID_BASE
        out, used = [], set()
        for x1, y1, x2, y2, conf in boxes:
            best, best_iou = None, self.EXTRA_MATCH_IOU
            for tid, tv in self._extra.items():
                if tid in used:
                    continue
                iou = _box_iou((x1, y1, x2, y2), tv.bbox)
                if iou >= best_iou:
                    best, best_iou = tid, iou
            if best is None:
                best = self._next_extra_id
                self._next_extra_id += 1
                self._extra[best] = TrackedVehicle(
                    track_id=best, cls_id=0, cls_name="vehicle", bbox=(x1, y1, x2, y2), confidence=conf,
                    footprint=make_ground_footprint(x1, y1, x2, y2, self.footprint_fraction, angle_deg=0.0),
                    first_seen=now, last_seen=now, centroid_history=deque([((x1 + x2) / 2, (y1 + y2) / 2, now)], maxlen=30))
            tv = self._extra[best]
            tv.bbox, tv.confidence, tv.last_seen = (x1, y1, x2, y2), conf, now
            tv.footprint = make_ground_footprint(x1, y1, x2, y2, self.footprint_fraction, angle_deg=tv.orientation_degrees)
            tv.occlusion_state = OCCLUSION_VISIBLE
            setattr(tv, "source", "seg")
            used.add(best)
            out.append(tv)
        for tid in [t for t in self._extra if t not in used and now - self._extra[t].last_seen > self.max_lost_seconds]:
            del self._extra[tid]
        # a vehicle found only by the second model is usually the one behind: mark it hidden like any other
        for tv in out:
            for other in tracked:
                ix = max(0.0, min(tv.x2, other.x2) - max(tv.x1, other.x1))
                iy = max(0.0, min(tv.y2, other.y2) - max(tv.y1, other.y1))
                share = ix * iy / tv.area if tv.area > 0 else 0.0
                if share > 0.20 and tv.y2 < other.y2:
                    tv.occlusion_state = OCCLUSION_HEAVY if share > 0.45 else OCCLUSION_PARTIAL
        return out

    def _evaluate_occlusion_and_prune(self, active_track_ids: set[int],
                                     current_vehicles: list[TrackedVehicle],
                                     now: float):
        """
        Detects when a vehicle is occluded behind another vehicle in the camera perspective,
        and marks stale tracks as LOST after max_lost_seconds.
        """
        # Pairwise bbox IoU / overlap among active vehicles
        n = len(current_vehicles)
        for i in range(n):
            v1 = current_vehicles[i]
            for j in range(i + 1, n):
                v2 = current_vehicles[j]
                # Check box overlap
                inter_x1 = max(v1.x1, v2.x1)
                inter_y1 = max(v1.y1, v2.y1)
                inter_x2 = min(v1.x2, v2.x2)
                inter_y2 = min(v1.y2, v2.y2)

                if inter_x2 > inter_x1 and inter_y2 > inter_y1:
                    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
                    overlap1 = inter_area / v1.area
                    overlap2 = inter_area / v2.area

                    # The vehicle with lower y2 (further away from camera) is occluded by the closer one
                    if overlap1 > 0.20 or overlap2 > 0.20:
                        if v1.y2 < v2.y2:
                            v1.occlusion_state = OCCLUSION_HEAVY if overlap1 > 0.45 else OCCLUSION_PARTIAL
                        else:
                            v2.occlusion_state = OCCLUSION_HEAVY if overlap2 > 0.45 else OCCLUSION_PARTIAL

        # Check tracks that disappeared in this frame
        stale_ids = []
        for tid, track in self.tracks.items():
            if tid not in active_track_ids:
                age = now - track.last_seen
                if age > self.max_lost_seconds:
                    stale_ids.append(tid)
                else:
                    track.occlusion_state = OCCLUSION_LOST

        for tid in stale_ids:
            del self.tracks[tid]