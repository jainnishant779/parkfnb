"""
Vehicle silhouettes for ground-contact geometry (see contact.py).

A pretrained COCO instance-segmentation model (yolo11n-seg, ~6 MB) runs
*alongside* the custom plate detector -- it never replaces it.  Its masks are
semantic, so they hold up on a grey car against grey tarmac and keep adjacent
cars apart, which is exactly where thresholding the crop failed.

Operational rules, because this box is short on memory and disk:
  * Loaded lazily, only from an explicit file that already exists.  ultralytics
    downloads a model if handed a bare name that is missing; that must never
    happen silently here.
  * Throttled per camera: parked cars do not move, so masks are refreshed every
    few seconds and reused in between.
  * An out-of-memory error disables segmentation for a cooldown instead of
    failing the request; the box-slice estimate takes over meanwhile.

Environment:
  ANPR_SEG            "auto" (default: on if weights exist), "1" / "0"
  ANPR_SEG_WEIGHTS    path to the -seg weights (default weights/yolo11n-seg.pt)
  ANPR_SEG_INTERVAL   seconds between refreshes per camera (default 3)
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon, box as shapely_box

HERE = Path(__file__).parent
DEFAULT_WEIGHTS = HERE / "weights" / "yolo11n-seg.pt"

# COCO: car, motorcycle, bus, truck
VEHICLE_CLASSES = [2, 3, 5, 7]

MATCH_MIN_IOU = 0.5
MATCH_MIN_INSIDE = 0.8
OOM_COOLDOWN_S = 60.0


@dataclass
class Silhouette:
    box: tuple[float, float, float, float]
    confidence: float
    outline: np.ndarray          # (N, 2) float, frame pixels


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _inside_fraction(outline: np.ndarray, box, pad: float = 0.05) -> float:
    """Share of the silhouette's area that falls inside the (slightly padded) box."""
    try:
        poly = Polygon(outline)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.area <= 0:
            return 0.0
        w, h = box[2] - box[0], box[3] - box[1]
        b = shapely_box(box[0] - pad * w, box[1] - pad * h, box[2] + pad * w, box[3] + pad * h)
        return poly.intersection(b).area / poly.area
    except Exception:
        return 0.0


def attach_silhouettes(detections, silhouettes: list[Silhouette]) -> int:
    """
    Give each detection the silhouette that is unambiguously its own.

    A pair must overlap well (IoU >= 0.5) *and* the silhouette must sit mostly
    inside the detection's box, so a mask spanning two cars is not handed to
    either.  Greedy on IoU, one-to-one.  Returns the number attached.
    """
    dets = list(detections)
    # Tracked vehicles persist across frames; a silhouette from an earlier frame
    # must not linger on a car that did not match this time.
    for d in dets:
        setattr(d, "contact_shape", None)
        setattr(d, "contact_source", None)
    pairs = []
    for i, d in enumerate(dets):
        dbox = (float(d.x1), float(d.y1), float(d.x2), float(d.y2))
        for j, s in enumerate(silhouettes):
            iou = _iou(dbox, s.box)
            if iou >= MATCH_MIN_IOU and _inside_fraction(s.outline, dbox) >= MATCH_MIN_INSIDE:
                pairs.append((iou, i, j))
    used_d, used_s, n = set(), set(), 0
    for _, i, j in sorted(pairs, reverse=True):
        if i in used_d or j in used_s:
            continue
        used_d.add(i)
        used_s.add(j)
        setattr(dets[i], "contact_shape", silhouettes[j].outline)
        setattr(dets[i], "contact_source", "mask")
        n += 1
    return n


EXTRA_MIN_CONF = float(os.getenv("ANPR_SEG_EXTRA_CONF", "0.4"))
EXTRA_MAX_IOU = 0.5            # overlapping a tracked car this much: it is that car
EXTRA_MAX_INSIDE = 0.7         # mostly inside a tracked car's box: part of that car, not another one


EXTRA_MIN_W_FRAC, EXTRA_MIN_H_FRAC = 0.05, 0.04      # a car is at least this share of the picture across / high


def unmatched_boxes(silhouettes: list[Silhouette], detections, min_conf: float = EXTRA_MIN_CONF, image_size=None):
    """
    Vehicles the segmentation model found that the tracking model did not: (x1, y1, x2, y2, confidence) for each
    confident silhouette that is neither the same car as a detection (IoU) nor a piece of one (mostly inside its box).
    The tracking model was trained on close-up plate pictures and misses a car half hidden behind another one;
    the COCO model sees it.
    """
    dets = [(float(d.x1), float(d.y1), float(d.x2), float(d.y2)) for d in detections]
    out = []
    for s in silhouettes:
        if s.confidence < min_conf:
            continue
        b = s.box
        if image_size and ((b[2] - b[0]) < EXTRA_MIN_W_FRAC * image_size[0] or (b[3] - b[1]) < EXTRA_MIN_H_FRAC * image_size[1]):
            continue            # 28 Oct: a 30 x 15 px plastic wrapper on the grass was "a car" and made a ghost 3D box and a violation
        area = max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
        same = False
        for d in dets:
            ix = max(0.0, min(b[2], d[2]) - max(b[0], d[0]))
            iy = max(0.0, min(b[3], d[3]) - max(b[1], d[1]))
            if _iou(b, d) >= EXTRA_MAX_IOU or ix * iy / area >= EXTRA_MAX_INSIDE:
                same = True
                break
        if not same:
            out.append((b[0], b[1], b[2], b[3], s.confidence))
    return out


class Segmenter:
    def __init__(self, weights: str | Path | None = None, interval_s: float | None = None,
                 enabled: str | None = None):
        self.weights = Path(weights or os.getenv("ANPR_SEG_WEIGHTS") or DEFAULT_WEIGHTS)
        # 960, not the model's 640: at 640 a car half hidden behind another one is only found in pieces
        self.imgsz = int(os.getenv("ANPR_SEG_IMGSZ", "960"))
        self.interval_s = float(interval_s if interval_s is not None
                                else os.getenv("ANPR_SEG_INTERVAL", "3"))
        mode = (enabled or os.getenv("ANPR_SEG", "auto")).lower()
        self.enabled = mode not in ("0", "false", "off") and (mode != "auto" or self.weights.is_file())
        self._model = None
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[float, list[Silhouette]]] = {}
        self._disabled_until = 0.0
        self.last_error: str | None = None

    @property
    def available(self) -> bool:
        return self.enabled and self.weights.is_file() and time.time() >= self._disabled_until

    def _load(self):
        if self._model is None:
            if not self.weights.is_file():
                raise FileNotFoundError(f"segmentation weights not found at {self.weights}")
            from ultralytics import YOLO
            self._model = YOLO(str(self.weights))       # explicit existing path: no download
        return self._model

    def segment(self, frame, camera_id: str = "default", force: bool = False) -> list[Silhouette]:
        """Silhouettes for this frame, refreshed at most every `interval_s` per camera."""
        if not self.available:
            return []
        now = time.time()
        cached = self._cache.get(camera_id)
        if cached and not force and now - cached[0] < self.interval_s:
            return cached[1]
        with self._lock:
            try:
                model = self._load()
                r = model.predict(frame, classes=VEHICLE_CLASSES, imgsz=self.imgsz, verbose=False)[0]
            except (MemoryError, RuntimeError) as e:     # torch reports OOM as RuntimeError
                self._disabled_until = now + OOM_COOLDOWN_S
                self._model = None
                self.last_error = f"{type(e).__name__}: {e}"
                return []
        out = []
        if r.masks is not None and r.boxes is not None:
            for b, xy in zip(r.boxes, r.masks.xy):       # masks.xy is already in frame pixels
                if len(xy) < 3:
                    continue
                out.append(Silhouette(tuple(float(v) for v in b.xyxy[0].tolist()),
                                      float(b.conf[0]), np.asarray(xy, dtype=np.float64)))
        self._cache[camera_id] = (now, out)
        return out

    def attach(self, frame, detections, camera_id: str = "default") -> int:
        return attach_silhouettes(detections, self.segment(frame, camera_id))


_segmenter: Segmenter | None = None


def get_segmenter() -> Segmenter:
    global _segmenter
    if _segmenter is None:
        _segmenter = Segmenter()
    return _segmenter
