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
from dataclasses import dataclass, asdict
from pathlib import Path

import cv2
import numpy as np

WEIGHTS = Path(os.getenv("ANPR_WEIGHTS", Path(__file__).parent / "weights" / "best.pt"))
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

ALPHA_TO_DIGIT = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}
DIGIT_TO_ALPHA = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A"}

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
    for i in range(n - 4, n):            # last four: always digits
        if o[i].isalpha():
            o[i] = ALPHA_TO_DIGIT.get(o[i], o[i])
    for i in (0, 1):                     # state code: always letters
        if o[i].isdigit():
            o[i] = DIGIT_TO_ALPHA.get(o[i], o[i])
    for i in (2, 3):                     # RTO district: digits
        if i < n - 4 and o[i].isalpha():
            o[i] = ALPHA_TO_DIGIT.get(o[i], o[i])
    for i in range(4, n - 4):            # series: letters
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

        if want in ("auto", "paddle", "paddleocr"):
            os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
            try:
                from paddleocr import TextRecognition
                return "paddleocr", TextRecognition()
            except Exception as e:
                if want != "auto":
                    raise
                print(f"[anpr] PaddleOCR unavailable ({e}); falling back to EasyOCR")

        import easyocr
        return "easyocr", easyocr.Reader(["en"], gpu=False, verbose=False)

    def _read_text(self, crop) -> tuple[str, float]:
        if crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
            return "", 0.0
        # OCR needs pixels; these plate crops are often tiny.
        if crop.shape[0] < 48:
            f = 48 / crop.shape[0]
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
            best = max(res, key=lambda r: r[2])
            return best[1], float(best[2])
        except Exception:
            return "", 0.0

    # -- detection ------------------------------------------------------
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
        # Anything that parses as a real plate wins outright; otherwise the
        # best-scoring partial read is returned so the UI can show something.
        h, w = frame.shape[:2]
        pad = 5
        best = None

        for box, det_conf in sorted(plates, key=lambda p: p[1], reverse=True)[:5]:
            x1, y1, x2, y2 = box
            crop = frame[max(0, y1 - pad):min(h, y2 + pad),
                         max(0, x1 - pad):min(w, x2 + pad)]

            raw, ocr_conf = self._read_text(crop)
            if not raw:                              # one retry, enhanced
                raw, ocr_conf = self._read_text(_enhance(crop))

            plate, valid = normalise_plate(raw)
            candidate = PlateRead(plate, valid, raw, det_conf, ocr_conf,
                                  (x1, y1, x2, y2), vehicles,
                                  (time.time() - t0) * 1000)

            if valid:
                return candidate
            if best is None or (plate and ocr_conf > best.ocr_conf):
                best = candidate

        best.ms = (time.time() - t0) * 1000
        return best

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
