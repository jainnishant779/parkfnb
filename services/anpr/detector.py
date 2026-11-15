"""
Plate detection and reading.

YOLO finds the plate, OCR reads it, then the text is normalised to the
Indian format. Models load once at import — never per request, or the
first call after every idle period pays the load cost again.
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

import cv2
import numpy as np

def _resolve_weights() -> Path:
    env_w = os.getenv("ANPR_WEIGHTS")
    if env_w and Path(env_w).exists():
        return Path(env_w)
    base = Path(__file__).parent
    candidates = [
        base / "best (4).pt",
        base / "best(4).pt",
        base / "weights" / "best (4).pt",
        base / "weights" / "best.pt",
        base / "best.pt",
    ]
    for c in candidates:
        if c.exists():
            return c
    return base / "weights" / "best.pt"


WEIGHTS = _resolve_weights()
IMGSZ = int(os.getenv("ANPR_IMGSZ", "960"))
DEVICE = os.getenv("ANPR_DEVICE", "cpu")

VEHICLE_CLS = 0
PLATE_CLS = 1

# ----------------------------------------------------------------------
# Indian plate format
#   Standard : MH 12 AB 1234   ->  LL DD LL DDDD
#   BH series: 22 BH 1234 AA
#
# Fixes are applied BY POSITION. A blanket O->0 would turn the MP state
# code into M0, which matches nothing.
# ----------------------------------------------------------------------

ALPHA_TO_DIGIT = {
    "O": "0", "Q": "0", "D": "0",
    "I": "1", "L": "1", "J": "1",
    "Z": "2",
    "E": "8", "B": "8",
    "A": "4",
    "S": "5",
    "G": "6",
    "T": "7", "Y": "7"
}

DIGIT_TO_ALPHA = {
    "0": "O", "1": "I", "2": "Z", "3": "E", "4": "A",
    "5": "S", "6": "G", "7": "T", "8": "B", "9": "P"
}

DL_DISTRICT_LETTERS = "CSPRNYVZ"     # the letter after the digit in a Delhi RTO code (DL 1C, DL 3S, ...)

MP_RTOS = {"09", "13", "04", "07", "20", "43", "11", "12", "14", "15", "19", "08"}

STROKES = str.maketrans({"|": "1", "!": "1", "[": "1", "]": "1"})

PLATE_RE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$")
BH_RE = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")


def normalise_plate(text: str) -> tuple[str, bool]:
    """Clean an OCR string into a plate. Returns (plate, is_valid_format)."""
    s = re.sub(r"[^A-Z0-9]", "", (text or "").upper().translate(STROKES))
    if not s:
        return "", False
    if BH_RE.match(s):
        return s, True
    if len(s) < 8 or len(s) > 10:
        return s, False

    o, n = list(s), len(s)

    # 1. Last 4 characters: always digits in standard Indian plates
    for i in range(n - 4, n):
        if o[i].isalpha():
            o[i] = ALPHA_TO_DIGIT.get(o[i], o[i])

    # 2. State code (indices 0, 1): always letters
    for i in (0, 1):
        if o[i].isdigit():
            o[i] = DIGIT_TO_ALPHA.get(o[i], o[i])

    # 3. RTO district (indices 2, 3): digits, except Delhi: its codes are a digit and a letter (DL 1C, DL 8C, DL 3S ...), so for a
    #    10-character DL plate whose third character is a digit the fourth is a letter.  A letter that looks like the C of "8C" (E, G,
    #    O, Q) is the C; one that is already a district letter stays.
    for i in (2, 3):
        if i < n - 4 and o[i].isalpha():
            if i == 3 and n == 10 and o[0] + o[1] == "DL" and o[2].isdigit() and o[3] in DL_DISTRICT_LETTERS + "EGOQ":
                if o[3] in "EGOQ":
                    o[3] = "C"
                continue
            o[i] = ALPHA_TO_DIGIT.get(o[i], o[i])

    # Disambiguate M vs H in State Code:
    # EasyOCR commonly misreads faint diagonals of 'M' as 'H' (reading HP instead of MP)
    state = "".join(o[:2])
    rto = "".join(o[2:4])
    if state == "HP" and rto in MP_RTOS:
        o[0] = "M"

    # 4. Series (from index 4 to n-4): letters
    for i in range(4, n - 4):
        if o[i].isdigit():
            o[i] = DIGIT_TO_ALPHA.get(o[i], o[i])

    plate = "".join(o)
    return plate, bool(PLATE_RE.match(plate))


# ----------------------------------------------------------------------

def _enhance(img):
    """CLAHE on the L channel — recovers plates in glare and deep shade."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def enhance_plate_crop(crop: np.ndarray) -> np.ndarray:
    """
    Multi-stage enhancement for distant, low-contrast, or glared plate crops.
    Pipeline:
      1. Lanczos-4 sinc upscaling to min height 84px for clear character strokes
      2. CLAHE contrast stretching on Lab L-channel
      3. Morphological Black-Hat filter to extract dark embossed characters on bright plate
      4. High-frequency unsharp masking
    """
    if crop is None or crop.size == 0 or min(crop.shape[:2]) < 4:
        return crop
    h, w = crop.shape[:2]

    # 1. Lanczos-4 sinc upscaling
    if h < 84:
        scale = max(2.0, 84.0 / max(h, 1))
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)

    # 2. CLAHE on Lab L-channel
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8)).apply(l)
    enhanced_bgr = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # 3. Morphological Black-Hat filter
    gray = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
    boosted_gray = cv2.subtract(gray, blackhat)

    # 4. High-frequency unsharp masking
    blurred = cv2.GaussianBlur(boosted_gray, (0, 0), sigmaX=2.0)
    unsharp = cv2.addWeighted(boosted_gray, 1.8, blurred, -0.8, 0)
    return cv2.cvtColor(unsharp, cv2.COLOR_GRAY2BGR)


@dataclass
class PlateRead:
    plate: str
    valid_format: bool
    raw_text: str
    det_conf: float
    ocr_conf: float
    box: tuple[int, int, int, int] | None
    vehicles: int
    ms: float

    def dict(self):
        d = asdict(self)
        d["box"] = list(self.box) if self.box else None
        return d


def estimate_vehicle_orientation_and_mask(
    frame: np.ndarray,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    seg_mask: np.ndarray | None = None
) -> tuple[float, float, list[list[float]] | None]:
    """
    Estimates the vehicle's true chassis orientation angle in degrees [-90, 90)
    and visible geometry contour mask.
    
    Priority Hierarchy:
      1. YOLO-Seg mask contour (if seg_mask is provided).
      2. Visible geometry segmentation via adaptive Otsu / Canny / morphology on vehicle crop:
         - Computes PCA principal inertia axis: theta_pca = atan2(v_{0,1}, v_{0,0})
         - Computes cv2.minAreaRect(contour) angle: theta_rect
         - Combines them into robust orientation with visible geometry confidence.
      3. Fallback when degenerate: 0.0 with low confidence.
    """
    h_f, w_f = frame.shape[:2]
    ix1, iy1, ix2, iy2 = max(0, int(x1)), max(0, int(y1)), min(w_f, int(x2)), min(h_f, int(y2))
    w_box = max(1, ix2 - ix1)
    h_box = max(1, iy2 - iy1)
    if w_box < 10 or h_box < 10:
        return 0.0, 0.2, None

    # Priority 1: YOLO-Seg mask if available
    if seg_mask is not None and getattr(seg_mask, "size", 0) > 0:
        pts = cv2.findNonZero(seg_mask)
        if pts is not None and len(pts) >= 20:
            rect = cv2.minAreaRect(pts)
            pts_f = pts.reshape(-1, 2).astype(np.float32)
            _, eig = cv2.PCACompute(pts_f, mean=np.empty((0)))
            pca_deg = float(np.degrees(np.arctan2(eig[0, 1], eig[0, 0])))
            while pca_deg >= 90.0:
                pca_deg -= 180.0
            while pca_deg < -90.0:
                pca_deg += 180.0
            box_pts = cv2.boxPoints(rect).tolist()
            return pca_deg, 0.95, box_pts

    # Priority 2: Visible Geometry Segmentation via OpenCV
    crop = frame[iy1:iy2, ix1:ix2]
    if crop.size == 0:
        return 0.0, 0.2, None
        
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Adaptive Otsu thresholding
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0.0, 0.3, None

    # Filter contours by size and pick the central vehicle body
    valid_cnts = [c for c in contours if cv2.contourArea(c) > (w_box * h_box * 0.10)]
    if not valid_cnts:
        valid_cnts = contours
    largest = max(valid_cnts, key=cv2.contourArea)

    area_ratio = cv2.contourArea(largest) / max(1.0, w_box * h_box)

    # A contour that fills ~all of its own bbox means Otsu failed to separate
    # the vehicle from the background (e.g. low contrast against tarmac) —
    # minAreaRect on that degenerate blob just re-derives the axis-aligned
    # bbox, not the vehicle's true chassis angle. Treat it as unmeasured
    # rather than reporting a fake axis-aligned angle with high confidence.
    if area_ratio > 0.92:
        return 0.0, 0.2, None

    rect = cv2.minAreaRect(largest)
    (rcx, rcy), (rw, rh), rang = rect

    # A patchy blob (low fill ratio, e.g. only the roof/glare caught by
    # Otsu) can still touch near the crop's corners, so minAreaRect comes
    # back the size of the crop itself even though area_ratio looks fine.
    # That rect's angle is bbox-derived noise, not the chassis axis — reject
    # it the same way as the full-blob case above.
    rect_fill_ratio = (rw * rh) / max(1.0, w_box * h_box)
    if rect_fill_ratio > 0.85:
        return 0.0, 0.2, None

    if rw < rh:
        long_ang = rang + 90.0
    else:
        long_ang = rang
    while long_ang >= 90.0:
        long_ang -= 180.0
    while long_ang < -90.0:
        long_ang += 180.0
        
    pts = largest.reshape(-1, 2).astype(np.float32)
    if len(pts) >= 10:
        _, eig = cv2.PCACompute(pts, mean=np.empty((0)))
        pca_deg = float(np.degrees(np.arctan2(eig[0, 1], eig[0, 0])))
        while pca_deg >= 90.0:
            pca_deg -= 180.0
        while pca_deg < -90.0:
            pca_deg += 180.0
    else:
        pca_deg = long_ang

    diff = abs(pca_deg - long_ang)
    if diff > 90.0:
        diff = 180.0 - diff
    
    if diff <= 25.0:
        fused_angle = 0.6 * pca_deg + 0.4 * long_ang
        conf = min(0.95, max(0.60, area_ratio * 1.5))
    else:
        fused_angle = pca_deg
        conf = 0.55

    # Shift rect points from crop space to full frame space
    box_pts = (cv2.boxPoints(rect) + np.array([ix1, iy1], dtype=np.float32)).tolist()
    return float(fused_angle), float(conf), box_pts


@dataclass
class JointDetection:
    """Output of single-pass detection containing vehicles, orientations, and matched plates."""
    vehicles: list[tuple[float, float, float, float, float]]  # (x1, y1, x2, y2, conf)
    plates: list[tuple[int, int, int, int, float, str]]      # (px1, py1, px2, py2, conf, plate_str)
    vehicle_plates: dict[int, str]                           # vehicle_index -> plate_str
    vehicle_orientations: dict[int, float] = field(default_factory=dict)  # vehicle_index -> orientation_deg
    vehicle_confidences: dict[int, float] = field(default_factory=dict)   # vehicle_index -> geom_conf
    vehicle_masks: dict[int, list[list[float]]] = field(default_factory=dict)


class Detector:
    """Loads YOLO + OCR once, then reads plates from frames."""

    def __init__(self, weights: Path = WEIGHTS, device: str = DEVICE):
        import torch
        from ultralytics import YOLO

        # torch defaults to a single thread here, which roughly halves speed.
        torch.set_num_threads(os.cpu_count() or 4)

        if not Path(weights).exists():
            raise FileNotFoundError(
                f"Model weights not found at {weights}.\n"
                f"Download best.pt from Colab into services/anpr/weights/"
            )

        t0 = time.time()
        self.model = YOLO(str(weights))
        self.device = device
        self.names = self.model.names
        self.ocr_kind, self._ocr = self._load_ocr()
        self.load_ms = (time.time() - t0) * 1000

        # warm up, so the first real request is not the slow one
        self.model.predict(np.zeros((640, 640, 3), np.uint8),
                           imgsz=IMGSZ, device=device, verbose=False)

    # -- OCR ------------------------------------------------------------
    @staticmethod
    def _load_ocr():
        """
        PaddleOCR reads plates better, but it phones home to check for model
        updates on construction, which cost ~80s on a cold start here. Pin it
        off, and let ANPR_OCR=easyocr skip Paddle entirely.
        """
        want = os.getenv("ANPR_OCR", "auto").lower()

        # ANPR_OCR=none: do not load any OCR (saves ~0.5 GB, for small servers).  Vehicles,
        # bays and IN/OUT counting do not need it; plates are simply not read.
        if want in ("none", "off", "0", "false"):
            return "none", None

        if want in ("auto", "paddle", "paddleocr"):
            os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
            try:
                from paddleocr import TextRecognition
                return "paddleocr", TextRecognition()
            except Exception as e:
                if want != "auto":
                    raise
                print(f"[anpr] PaddleOCR unavailable ({e}); falling back to EasyOCR")

        try:
            import easyocr
            return "easyocr", easyocr.Reader(["en"], gpu=False, verbose=False)
        except Exception as e:
            print(f"[anpr] OCR engine unavailable ({e}); running OCR-free mode")
            return "none", None

    def _read_text(self, crop) -> tuple[str, float]:
        if self._ocr is None or crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
            return "", 0.0
        # OCR needs sufficient vertical pixels for stroke recognition
        if crop.shape[0] < 64:
            f = 64.0 / crop.shape[0]
            crop = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
        try:
            if self.ocr_kind == "paddleocr":
                import json
                for r in self._ocr.predict(crop):
                    d = r.json
                    if isinstance(d, str):
                        d = json.loads(d)
                    if "res" in d:
                        d = d["res"]
                    txt = d.get("rec_text") or d.get("text") or ""
                    sc = float(d.get("rec_score", d.get("score", 0)) or 0)
                    return txt, sc
                return "", 0.0

            res = self._ocr.readtext(crop, detail=1, paragraph=False)
            if not res:
                return "", 0.0

            items = []
            for item in res:
                bbox, text, conf = item[0], item[1], float(item[2])
                cleaned = re.sub(r"[^A-Z0-9]", "", text.upper().replace("|", "1").replace("!", "1"))
                if cleaned in ("IND", "INDIA", "IN"):
                    continue
                if conf < 0.10:
                    continue
                ys = [pt[1] for pt in bbox]
                xs = [pt[0] for pt in bbox]
                items.append({
                    "ymin": min(ys),
                    "ymax": max(ys),
                    "xmin": min(xs),
                    "text": text,
                    "cleaned": cleaned,
                    "conf": conf
                })

            if not items:
                best = max(res, key=lambda r: r[2])
                return best[1], float(best[2])

            # 1. Check if any single token is already a valid Indian plate
            for it in sorted(items, key=lambda x: x["conf"], reverse=True):
                p, valid = normalise_plate(it["cleaned"])
                if valid:
                    return p, it["conf"]

            # 2. Sort lines top-to-bottom, then left-to-right (handles 2-line and multi-piece plates)
            items.sort(key=lambda x: (x["ymin"] + x["ymax"]) / 2)
            lines = []
            for it in items:
                cy = (it["ymin"] + it["ymax"]) / 2
                placed = False
                for line in lines:
                    line_cy = sum((m["ymin"] + m["ymax"]) / 2 for m in line) / len(line)
                    h = it["ymax"] - it["ymin"]
                    if abs(cy - line_cy) < max(12, h * 0.5):
                        line.append(it)
                        placed = True
                        break
                if not placed:
                    lines.append([it])

            for line in lines:
                line.sort(key=lambda x: x["xmin"])

            combined_clean = "".join(it["cleaned"] for line in lines for it in line)
            combined_raw = " ".join(it["text"] for line in lines for it in line)
            avg_conf = sum(it["conf"] for it in items) / len(items)

            p, valid = normalise_plate(combined_clean)
            if valid:
                return p, avg_conf

            return (combined_clean if combined_clean else combined_raw), avg_conf
        except Exception:
            return "", 0.0

    def read_plate_crop(self, crop: np.ndarray) -> tuple[str, bool, float]:
        """
        Reads a plate crop using standard, CLAHE, and multi-stage Black-Hat enhancement.
        Returns: (plate_text, is_valid_format, ocr_confidence)
        """
        if crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
            return "", False, 0.0

        # Attempt 1: Standard read
        raw, ocr_sc = self._read_text(crop)
        plate, valid = normalise_plate(raw)
        if valid:
            return plate, True, ocr_sc

        # Attempt 2: Enhanced CLAHE
        try:
            raw_clahe, sc_clahe = self._read_text(_enhance(crop))
            p_clahe, val_clahe = normalise_plate(raw_clahe)
            if val_clahe:
                return p_clahe, True, sc_clahe
            if p_clahe and sc_clahe > ocr_sc:
                plate, ocr_sc = p_clahe, sc_clahe
        except Exception:
            pass

        # Attempt 3: Multi-stage Black-Hat + Lanczos-4 sinc upscaling + Unsharp
        try:
            enh = enhance_plate_crop(crop)
            raw_enh, sc_enh = self._read_text(enh)
            p_enh, val_enh = normalise_plate(raw_enh)
            if val_enh:
                return p_enh, True, sc_enh
            if p_enh and sc_enh > ocr_sc:
                plate, ocr_sc = p_enh, sc_enh
        except Exception:
            pass

        return plate, valid, ocr_sc

    # -- detection ------------------------------------------------------
    @staticmethod
    def _collect_boxes(result):
        """Splits one YOLO result into (vehicle boxes, plate boxes)."""
        vehicles, plates = [], []
        for b in result.boxes:
            cls_id = int(b.cls[0])
            box_coords = [float(v) for v in b.xyxy[0].tolist()]
            box_conf = float(b.conf[0])
            if cls_id == VEHICLE_CLS:
                vehicles.append((box_coords[0], box_coords[1], box_coords[2], box_coords[3], box_conf))
            elif cls_id == PLATE_CLS:
                plates.append(([int(v) for v in box_coords], box_conf))
        return vehicles, plates

    def _detect(self, frame, conf, imgsz):
        r = self.model.predict(frame, conf=conf, imgsz=imgsz,
                               device=self.device, verbose=False)[0]
        plates, vehicles = [], 0
        for b in r.boxes:
            cls = int(b.cls[0])
            if cls == PLATE_CLS:
                plates.append(([int(v) for v in b.xyxy[0].tolist()], float(b.conf[0])))
            elif cls == VEHICLE_CLS:
                vehicles += 1
        return plates, vehicles

    def read(self, frame, conf: float = 0.15) -> PlateRead:
        """
        Find the best plate in a frame and read it.

        A distant plate can be only a few dozen pixels across, so a single
        pass at one size misses it. Retry larger and less strict before
        giving up — each attempt costs time, so stop at the first hit.
        """
        t0 = time.time()

        attempts = [(conf, IMGSZ)]
        if IMGSZ < 1280:
            attempts += [(conf, 1280), (0.05, 1280)]
        else:
            attempts += [(0.05, IMGSZ)]

        plates, vehicles = [], 0
        for c, size in attempts:
            plates, v = self._detect(frame, c, size)
            vehicles = max(vehicles, v)
            if plates:
                break

        # Last resort: CLAHE lifts plates out of glare and deep shade.
        if not plates:
            plates, v = self._detect(_enhance(frame), 0.05, 1280)
            vehicles = max(vehicles, v)

        if not plates:
            return PlateRead("", False, "", 0.0, 0.0, None, vehicles,
                             (time.time() - t0) * 1000)

        # A frame often holds several cars. Reading only the highest-scoring
        # box throws away a clean plate whenever a blurrier one happens to
        # score higher, so walk them in order and keep the first valid read.
        h, w = frame.shape[:2]
        pad = 5
        best = None

        for box, det_conf in sorted(plates, key=lambda p: p[1], reverse=True)[:5]:
            x1, y1, x2, y2 = box
            crop = frame[max(0, y1 - pad):min(h, y2 + pad),
                         max(0, x1 - pad):min(w, x2 + pad)]

            plate, valid, ocr_conf = self.read_plate_crop(crop)
            candidate = PlateRead(plate, valid, plate, det_conf, ocr_conf,
                                  (x1, y1, x2, y2), vehicles,
                                  (time.time() - t0) * 1000)

            if valid:
                return candidate
            if best is None or (plate and ocr_conf > best.ocr_conf):
                best = candidate

        best.ms = (time.time() - t0) * 1000
        return best

    def read_plate_in_box(self, frame, box, conf: float = 0.05) -> str:
        """Find and read any number plate within a vehicle bounding box."""
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in box[:4]]
        pad = 6
        crop = frame[max(0, y1 - pad):min(h, y2 + pad), max(0, x1 - pad):min(w, x2 + pad)]
        if crop.size == 0 or min(crop.shape[:2]) < 10:
            return ""

        ch, cw = crop.shape[:2]
        r = self.model.predict(crop, conf=conf, imgsz=max(640, min(1280, max(ch, cw))),
                               device=self.device, verbose=False)[0]
        plates = []
        for b in r.boxes:
            if int(b.cls[0]) == PLATE_CLS:
                plates.append(([int(v) for v in b.xyxy[0].tolist()], float(b.conf[0])))

        if not plates:
            return ""

        plates.sort(key=lambda p: p[1], reverse=True)
        best_candidate = ""
        for pbox, pconf in plates[:4]:
            px1, py1, px2, py2 = pbox
            ppad = 4
            pcrop = crop[max(0, py1 - ppad):min(ch, py2 + ppad),
                         max(0, px1 - ppad):min(cw, px2 + ppad)]
            plate, valid, ocr_sc = self.read_plate_crop(pcrop)
            if valid:
                return plate
            if plate and not best_candidate:
                best_candidate = plate
        return best_candidate

    def detect_joint(self, frame, conf: float = 0.10, imgsz: int | None = None, skip_vehicle_detection: bool = False, vehicle_boxes: list | None = None) -> JointDetection:
        """
        Single-pass YOLO detection for both vehicles and plates.
        Associates plates to parent vehicles using spatial containment:
          plate center (cx, cy) is within vehicle bbox (vx1, vy1, vx2, vy2).
        Tie-breaking: If plate center is inside multiple vehicles (e.g. dense overlap),
        the vehicle with the smallest area min(Area(V_i)) wins.

        A car far from the camera or tucked in a corner can be only a few
        thousand pixels — retry once at a larger imgsz (same idea as the
        plate-reading path) rather than silently reporting its bay as empty.
        A missed far car is worse than the extra inference cost: it sells
        an occupied bay as free.
        """
        imgsz = imgsz or IMGSZ
        r = self.model.predict(frame, conf=conf, imgsz=imgsz, device=self.device, verbose=False)[0]

        raw_vehicles, raw_plates = self._collect_boxes(r)

        if skip_vehicle_detection and vehicle_boxes is not None:
            # Skip vehicle detection — only use provided boxes for plate reading
            raw_vehicles = vehicle_boxes
            raw_plates = [p for p in raw_plates]  # keep plates from single pass
        elif imgsz < 1536 and len(raw_vehicles) <= 2:
            try:
                r_hi = self.model.predict(frame, conf=conf, imgsz=1536, device=self.device, verbose=False)[0]
                vehicles_hi, plates_hi = self._collect_boxes(r_hi)
                if len(vehicles_hi) > len(raw_vehicles):
                    raw_vehicles = vehicles_hi
                    raw_plates = plates_hi
                    r = r_hi
            except Exception:
                pass  # OOM safety — fall back to first pass results

        h, w = frame.shape[:2]
        pad = 4
        plate_results = []
        vehicle_plates = {}

        # Process plate crops
        for pbox, pconf in raw_plates:
            px1, py1, px2, py2 = pbox
            crop = frame[max(0, py1 - pad):min(h, py2 + pad), max(0, px1 - pad):min(w, px2 + pad)]
            plate_str, is_valid, _ = self.read_plate_crop(crop)
            plate_results.append((px1, py1, px2, py2, pconf, plate_str))

            if not plate_str:
                continue

            pcx = (px1 + px2) / 2.0
            pcy = (py1 + py2) / 2.0

            # Spatial containment with tie-breaking (minimum vehicle area)
            best_v_idx = None
            min_v_area = float("inf")
            for v_idx, (vx1, vy1, vx2, vy2, _) in enumerate(raw_vehicles):
                # Small tolerance margin around vehicle bbox
                vw = vx2 - vx1
                vh = vy2 - vy1
                if (vx1 - vw * 0.05) <= pcx <= (vx2 + vw * 0.05) and (vy1 - vh * 0.05) <= pcy <= (vy2 + vh * 0.05):
                    area = vw * vh
                    if area < min_v_area:
                        min_v_area = area
                        best_v_idx = v_idx

            if best_v_idx is not None:
                if best_v_idx in vehicle_plates:
                    existing_plate = vehicle_plates[best_v_idx]
                    _, existing_valid = normalise_plate(existing_plate)
                    if not existing_valid and is_valid:
                        vehicle_plates[best_v_idx] = plate_str
                else:
                    vehicle_plates[best_v_idx] = plate_str

        # High-recall fallback: For any vehicle without a plate from the full-frame pass,
        # run zoomed plate detection on the vehicle crop (skip if frame is huge >=2560 to prevent OOM)
        if max(frame.shape[:2]) <= 2560:
            for v_idx, v_box in enumerate(raw_vehicles):
                if v_idx not in vehicle_plates or not vehicle_plates[v_idx]:
                    try:
                        p_fallback = self.read_plate_in_box(frame, v_box[:4])
                        if p_fallback:
                            vehicle_plates[v_idx] = p_fallback
                            vx1, vy1, vx2, vy2 = [int(v) for v in v_box[:4]]
                            plate_results.append((vx1, vy1, vx2, vy2, 0.0, p_fallback))
                    except Exception:
                        pass

        # Hierarchical Vehicle Orientation & Visible Geometry Estimation
        vehicle_orientations = {}
        vehicle_confidences = {}
        vehicle_masks = {}

        # Silhouettes come from segmenter.py; this detect-only model produces none.
        for v_idx, v_box in enumerate(raw_vehicles):
            vx1, vy1, vx2, vy2 = v_box[:4]
            ang, geom_conf, box_pts = estimate_vehicle_orientation_and_mask(
                frame, vx1, vy1, vx2, vy2, seg_mask=None
            )
            vehicle_orientations[v_idx] = ang
            vehicle_confidences[v_idx] = geom_conf
            if box_pts:
                vehicle_masks[v_idx] = box_pts

        return JointDetection(
            vehicles=raw_vehicles,
            plates=plate_results,
            vehicle_plates=vehicle_plates,
            vehicle_orientations=vehicle_orientations,
            vehicle_confidences=vehicle_confidences,
            vehicle_masks=vehicle_masks,
        )

    def vehicles(self, frame, conf: float = 0.10, imgsz: int | None = None):

        """
        Vehicle boxes only — the input to occupancy.

        A lower default confidence than plate reading on purpose. A missed
        car reads a full bay as empty and sells it twice, which is worse
        than a spurious box: a false detection has to land inside a bay
        polygon to do any harm, and the temporal vote discards it.

        Top-down views need a larger imgsz than the plate path uses. Cars
        seen from above look nothing like the side-on vehicles this model
        was trained on, so recall drops sharply at 960.
        """
        r = self.model.predict(frame, conf=conf, imgsz=imgsz or IMGSZ,
                               device=self.device, verbose=False)[0]
        out = []
        for b in r.boxes:
            if int(b.cls[0]) != VEHICLE_CLS:
                continue
            x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
            out.append((x1, y1, x2, y2, float(b.conf[0])))
        return out

    def annotate(self, frame, res: PlateRead, allowed: bool | None = None):
        """Draw the box and write the plate above it. Returns a new image."""
        img = frame.copy()
        if not res.box:
            return img

        if allowed is True:
            colour = (58, 178, 27)       # green
        elif allowed is False:
            colour = (40, 40, 200)       # red
        else:
            colour = (224, 138, 30)      # blue-ish, undecided

        x1, y1, x2, y2 = res.box
        cv2.rectangle(img, (x1, y1), (x2, y2), colour, 3)

        text = res.plate or "no text"
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = max(0.7, min(1.6, (x2 - x1) / 300))
        (tw, th), base = cv2.getTextSize(text, font, scale, 2)

        pad = 8
        by2 = y1 - 6
        by1 = by2 - (th + base + pad)
        if by1 < 0:                                   # no room above
            by1, by2 = y2 + 6, y2 + 6 + th + base + pad

        cv2.rectangle(img, (x1, by1), (min(img.shape[1], x1 + tw + pad * 2), by2),
                      colour, -1)
        cv2.putText(img, text, (x1 + pad, by2 - base - pad // 2),
                    font, scale, (255, 255, 255), 2, cv2.LINE_AA)
        return img


_detector: Detector | None = None


def get_detector() -> Detector:
    global _detector
    if _detector is None:
        _detector = Detector()
    return _detector
