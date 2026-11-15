"""
Reading a number plate from a picture of one: two small ONNX models (fast-plate-ocr's "cct-xs-v2-global" and "cct-s-v2-global",
MIT licence, 3 MB and 5 MB, a few ms to ~60 ms a plate on a CPU) and nothing else but onnxruntime, so it fits the 2 GB server
where EasyOCR (a gigabyte of torch) does not.

One model on one picture is not trustworthy enough to call a plate "confirmed".  Measured on 28 Oct:
  * plain black-on-white plates: every read agreed and was right (MP09BU5540, 7 of 7 good crops);
  * a green electric-vehicle plate (light letters on a dark green board) was read MP09AW5254 twice, by the same model: the
    real plate is MP09AN5254.  The models are trained mostly on dark-on-light plates; the same crop turned to its negative was
    read correctly by both models.
So each crop is read by both models, as it is and as its negative, the reads are cleaned up to the Indian plate format, and
the text most of them agree on wins.  A crop with no plate in it still gives a confident wrong answer, so callers also check the
format (a real state code) and vote across several photos (`vote`).

The models are files in weights/plate_ocr/ (ANPR_PLATE_OCR_DIR changes the folder); with no model file or no onnxruntime,
`available()` is False and plate reading is simply off.
"""
from __future__ import annotations

import os
import threading
from collections import defaultdict
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

MODELS = [("cct_xs_v2_global.onnx", "cct_xs_v2_global_plate_config.yaml"),
          ("cct_s_v2_global.onnx", "cct_s_v2_global_plate_config.yaml")]
MODEL_FILE = MODELS[0][0]
READER_VERSION = 5       # raise it when the way plates are read changes: stored arrivals are then re-read from their saved plate picture
MIN_MEAN_PROB = 0.70        # a read whose letters are on average less sure than this is not used
MIN_CHAR_PROB = 0.40        # ... nor one with a letter this unsure (a missing stroke turns an 8 into a 6 with a low score)
MIN_AGREE = 2               # a crop is read 4 ways (2 models x as-is / negative): at least this many must give the same plate
RIVAL_SHARE = 0.6           # a plate is confirmed only if the next best text has at most this share of its weight


def _dir() -> Path:
    return Path(os.getenv("ANPR_PLATE_OCR_DIR") or Path(__file__).parent / "weights" / "plate_ocr")


class PlateReader:
    """One loaded model.  `read(crop_bgr)` -> (text, [probability of each letter]) or ("", [])."""

    def __init__(self, folder: Optional[Path] = None, model_file: str = MODELS[0][0], config_file: str = MODELS[0][1]):
        import onnxruntime as ort
        import yaml
        folder = Path(folder or _dir())
        cfg = yaml.safe_load((folder / config_file).read_text(encoding="utf-8"))
        self.name = model_file
        self.alphabet: str = cfg["alphabet"]
        self.pad: str = cfg["pad_char"]
        self.h, self.w = int(cfg["img_height"]), int(cfg["img_width"])
        self.slots = int(cfg["max_plate_slots"])
        self.rgb = cfg.get("image_color_mode", "rgb") == "rgb"
        self.matrix_shape = (self.slots, len(self.alphabet))
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1               # the live feed owns the CPU; a plate is tiny
        opts.log_severity_level = 3                 # the model triggers pages of harmless shape-merge warnings
        self._sess = ort.InferenceSession(str(folder / model_file), sess_options=opts, providers=["CPUExecutionProvider"])
        self._out = next(o.name for o in self._sess.get_outputs() if o.name == "plate")
        self._lock = threading.Lock()

    def matrix(self, crop_bgr) -> Optional[np.ndarray]:
        """The model's probability of each character in each slot: an array (slots, alphabet), or None for an unusable picture."""
        if crop_bgr is None or getattr(crop_bgr, "size", 0) == 0 or min(crop_bgr.shape[:2]) < 8:
            return None
        img = crop_bgr if crop_bgr.ndim == 3 else cv2.cvtColor(crop_bgr, cv2.COLOR_GRAY2BGR)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if self.rgb else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)[..., None]
        x = cv2.resize(img, (self.w, self.h), interpolation=cv2.INTER_LINEAR)
        if x.ndim == 2:
            x = x[..., None]
        with self._lock:
            probs = self._sess.run([self._out], {"input": x[None].astype(np.uint8)})[0][0]
        return probs.reshape(self.slots, -1)

    def decode(self, probs: np.ndarray) -> tuple[str, list[float]]:
        idx = probs.argmax(axis=1)
        text = "".join(self.alphabet[i] for i in idx).rstrip(self.pad)
        keep = len(text)
        return text.replace(self.pad, ""), [float(probs[s, idx[s]]) for s in range(keep)]

    def read(self, crop_bgr) -> tuple[str, list[float]]:
        probs = self.matrix(crop_bgr)
        return ("", []) if probs is None else self.decode(probs)


PADDLE_FILE = "ch_PP-OCRv3_rec_infer.onnx"


class PaddleReader:
    """
    A third, independent reader: PaddleOCR's PP-OCRv3 text recogniser (Apache-2.0, 10 MB, run with onnxruntime alone).  It is a
    different network trained on different data, so it does not make the same mistakes as the two plate models.  Measured on 28
    Oct on the far SUV plate DL8CAU7240, whose 6th letter the plate models called U, V and D in turn: this one read the U.  On the
    four clear plates it read all four right.  It gives text and one probability per letter (CTC), not a letter-by-slot matrix.
    """

    H, W = 48, 320

    def __init__(self, folder: Optional[Path] = None):
        import onnxruntime as ort
        folder = Path(folder or _dir())
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.log_severity_level = 3
        self._sess = ort.InferenceSession(str(folder / PADDLE_FILE), sess_options=opts, providers=["CPUExecutionProvider"])
        chars = self._sess.get_modelmeta().custom_metadata_map["character"].split("\n")
        self.chars = ["<blank>"] + chars + [" "]                 # CTC: index 0 is "nothing", the dictionary follows, then a space
        self._in = self._sess.get_inputs()[0].name
        self._lock = threading.Lock()

    def read(self, bgr) -> tuple[str, list[float]]:
        """Letters and digits only, each with its probability; "" when nothing was read."""
        if bgr is None or getattr(bgr, "size", 0) == 0 or min(bgr.shape[:2]) < 8:
            return "", []
        img = bgr if bgr.ndim == 3 else cv2.cvtColor(bgr, cv2.COLOR_GRAY2BGR)
        h, w = img.shape[:2]
        ratio = w / float(h)
        width = int(self.H * max(self.W / self.H, ratio))
        rw = min(width, int(np.ceil(self.H * ratio)))
        x = cv2.resize(img, (rw, self.H)).astype(np.float32).transpose(2, 0, 1) / 255.0
        x = (x - 0.5) / 0.5
        canvas = np.zeros((1, 3, self.H, width), np.float32)
        canvas[0, :, :, :rw] = x
        with self._lock:
            probs = self._sess.run(None, {self._in: canvas})[0][0]               # (time steps, classes)
        idx, conf = probs.argmax(axis=1), probs.max(axis=1)
        text, ps, prev = [], [], 0
        for t, i in enumerate(idx):
            if i != 0 and i != prev:                                               # a new character: not a blank, not a repeat
                ch = self.chars[i] if i < len(self.chars) else ""
                if ch.isascii() and ch.isalnum():
                    text.append(ch.upper())
                    ps.append(float(conf[t]))
            prev = i
        return "".join(text), ps


# What a look-alike letter can be at the start of a plate (the state code is two letters, and D, O and 0 are easily taken for one another)
_STATE_CONFUSION = {"0": "DO", "O": "D", "Q": "D", "D": "O", "8": "B", "5": "S", "1": "I", "I": "L", "L": "I", "U": "V", "V": "U", "W": "M", "N": "M", "H": "M"}


def best_window(text: str, probs: list[float]):
    """
    The plate inside what a general reader gave (it adds noise at the ends: 'SOL8C4U7240', 'EMP43CA2340'): the longest 8-10 character
    stretch that is a real plate format with a real state code, looking at the first letters as a look-alike too (OL -> DL).
    Returns (plate, mean probability, lowest probability) or None.
    """
    from detector import normalise_plate
    from live import plausible_indian_plate
    n = len(text)
    for size in (10, 9, 8):
        for start in range(0, n - size + 1):
            window = text[start:start + size]
            ps = probs[start:start + size]
            tried = [window]
            for pos in (0, 1):                                                     # a state-code letter that is a look-alike of the real one
                for alt in _STATE_CONFUSION.get(window[pos], ""):
                    tried.append(window[:pos] + alt + window[pos + 1:])
            for cand in tried:
                plate, ok = normalise_plate(cand)
                if ok and plausible_indian_plate(plate):
                    pen = 0.85 if cand != window else 1.0                          # a look-alike repair is a little less sure
                    return plate, pen * sum(ps) / len(ps), pen * min(ps)
    return None


_readers: Optional[list[PlateReader]] = None
_paddle: Optional[PaddleReader] = None
_paddle_failed = False
_failed = False
_load_lock = threading.Lock()


def get_readers() -> list[PlateReader]:
    """The shared readers (every model file that is there), loaded on first use; [] when none can be."""
    global _readers, _failed
    if _readers is not None or _failed:
        return _readers or []
    with _load_lock:
        if _readers is None and not _failed:
            found, folder = [], _dir()
            for model_file, config_file in MODELS:
                if not (folder / model_file).is_file():
                    continue
                try:
                    found.append(PlateReader(folder, model_file, config_file))
                except Exception as e:                                 # plate reading is an extra: never stop the feed
                    print(f"[anpr] plate model {model_file} unavailable: {type(e).__name__}: {e}")
            if found:
                _readers = found
            else:
                _failed = True
    return _readers or []


def get_paddle() -> Optional[PaddleReader]:
    """The third reader, loaded on first use; None when its model file is not there (the other two carry on)."""
    global _paddle, _paddle_failed
    if _paddle is not None or _paddle_failed:
        return _paddle
    with _load_lock:
        if _paddle is None and not _paddle_failed:
            if not (_dir() / PADDLE_FILE).is_file():
                _paddle_failed = True
            else:
                try:
                    _paddle = PaddleReader()
                except Exception as e:
                    _paddle_failed = True
                    print(f"[anpr] third plate reader unavailable: {type(e).__name__}: {e}")
    return _paddle


def get_reader() -> Optional[PlateReader]:
    r = get_readers()
    return r[0] if r else None


def available() -> bool:
    return bool(get_readers())


def read_plate(crop_bgr) -> Optional[dict]:
    """
    Read one crop every way there is (each model, as it is and as its negative) and combine.  Returns None when nothing was read,
    else {"text", "raw", "valid", "mean_prob", "min_prob", "agree", "of"}: `text` is the plate most reads agree on after the
    Indian-plate clean-up (a letter O in the number part is a zero, and so on), `valid` says it is a real format with a real
    state code, the probabilities are those of the reads that agree, `agree` of `of` reads gave that text.
    """
    readers = get_readers()
    if not readers or crop_bgr is None or getattr(crop_bgr, "size", 0) == 0:
        return None
    from detector import normalise_plate
    from live import plausible_indian_plate
    base = crop_bgr if crop_bgr.ndim == 3 else cv2.cvtColor(crop_bgr, cv2.COLOR_GRAY2BGR)
    # The models know dark letters on a light board.  A green electric-vehicle plate is the other way round: it is read as its
    # negative first, and the other way round is only a second opinion (half weight, and only when it is itself sure).
    neg = cv2.bitwise_not(base)
    first, second = (neg, base) if green_board(base) else (base, neg)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(2, 4))
    stretch = lambda im: cv2.cvtColor(clahe.apply(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)), cv2.COLOR_GRAY2BGR)
    # The plate cut tight and straightened (a plate seen at a slant, as on a car parked beside the camera, is read far better so);
    # when no clean board can be found in the crop this is simply left out.
    flat = rectify(first)
    pics = [(first, True), (stretch(first), True)] + ([(flat, True), (stretch(flat), True)] if flat is not None else []) + [(second, False)]
    cands, soft_sum, soft_n = [], None, 0
    for reader in readers:
        for img, primary in pics:
            m = reader.matrix(img)
            if m is None:
                continue
            if primary and reader.slots == readers[0].slots and m.shape == readers[0].matrix_shape:
                soft_sum = m.copy() if soft_sum is None else soft_sum + m
                soft_n += 1
            raw, probs = reader.decode(m)
            if not raw or not probs:
                continue
            text, fmt_ok = normalise_plate(raw)
            c = {"text": text, "raw": raw, "valid": bool(fmt_ok and plausible_indian_plate(text)),
                 "mean": sum(probs) / len(probs), "min": min(probs), "w": 1.0 if primary else 0.5}
            if not primary and not (c["valid"] and c["mean"] >= 0.8 and c["min"] >= 0.5):
                continue
            cands.append(c)
    paddle = get_paddle()
    board = rectify(first, out_w=384, out_h=128) if paddle is not None else None
    if paddle is not None and board is not None:
        # a general text reader needs the line of letters on its own, as its own detector would hand it: the board straightened, then
        # the ink cut tight (given the crop with the car around it, it reads noise)
        line = ink_line(board, negative=False)
        pics = [(board, True)] + ([(line, True), (cv2.bitwise_not(line), False)] if line is not None else [])
        for img, primary in pics:
            raw, probs = paddle.read(img)
            found = best_window(raw, probs) if raw else None
            if found is None:
                continue
            plate, mean, low = found
            if not primary and not (mean >= 0.6 and low >= 0.3):
                continue
            cands.append({"text": plate, "raw": raw, "valid": True, "mean": mean, "min": low, "w": 1.0 if primary else 0.5, "engine": "paddle"})
    if soft_n >= 2:
        # soft vote: average what every model saw in every picture, letter by letter, THEN choose.  It settles what the hard votes
        # cannot (28 Oct: one model said U, another V, the average said U) and counts double.
        raw, probs = readers[0].decode(soft_sum / soft_n)
        if raw and probs:
            text, fmt_ok = normalise_plate(raw)
            cands.append({"text": text, "raw": raw, "valid": bool(fmt_ok and plausible_indian_plate(text)),
                          "mean": sum(probs) / len(probs), "min": min(probs), "w": 2.0})
    for c in cands:
        c.setdefault("engine", "plate")
    if not cands:
        return None
    valid = [c for c in cands if c["valid"]]
    pool = valid or cands
    weight: dict[str, float] = defaultdict(float)
    for c in pool:
        weight[c["text"]] += c["mean"] * c["w"]
    ranked = sorted(weight, key=lambda t: (weight[t], sum(1 for c in pool if c["text"] == t)), reverse=True)
    text = ranked[0]
    same = [c for c in pool if c["text"] == text]
    rival = weight[ranked[1]] / weight[text] if valid and len(ranked) > 1 else 0.0
    out = {"text": text, "raw": same[0]["raw"], "valid": bool(valid), "agree": len(same) if valid else 1, "of": len(cands),
           "rival": round(rival, 2), "mean_prob": round(sum(c["mean"] for c in same) / len(same), 3),
           "min_prob": round(sum(c["min"] for c in same) / len(same), 3),
           # two readers of different kinds (the plate models; PaddleOCR) giving the same plate: their mistakes are not the same
           # ones, so this is much stronger than the same reader agreeing with itself
           "cross": bool(valid) and {c["engine"] for c in same} >= {"plate", "paddle"}}
    if soft_n >= 2:
        out["m"] = _sparse(soft_sum / soft_n)                      # kept with the read, so later photos of the car can be averaged with it
    out["votes"] = [[t, round(w, 2)] for t, w in sorted(weight.items(), key=lambda kv: -kv[1])[:4]]      # who proposed what: for the letters in doubt
    return out


def _sparse(matrix: np.ndarray, top: int = 3, floor: float = 0.03) -> list:
    """A probability matrix (slots x characters) as the few likely characters of each slot: [[index, probability], ...] per slot."""
    out = []
    for row in matrix:
        idx = np.argsort(row)[::-1][:top]
        out.append([[int(i), round(float(row[i]), 2)] for i in idx if row[i] >= floor])
    return out


def fuse(reads: list[dict], min_reads: int = 2) -> Optional[dict]:
    """
    Average what the reader saw in EVERY photo of the car, letter by letter, and decode that.  This is the "combine the frames, then
    read" idea of the multi-frame plate papers (UFPR-SR-Plates, 2025: voting letter by letter over five frames lifted a hard
    low-resolution set from 31 % to 45 %): a letter that is U in one photo, V in the next and D in the third (the same far plate
    on 28 Oct) is settled by the weight of all of them, where a vote of whole plates sees three different plates.
    Returns {"text", "valid", "mean_prob", "min_prob", "n"} or None (too few photos with their letters kept, or nothing to read).
    """
    mats = [r["m"] for r in reads if r.get("m")]
    readers = get_readers()
    if len(mats) < min_reads or not readers:
        return None
    reader = readers[0]
    acc = np.zeros(reader.matrix_shape, np.float32)
    for m in mats:
        for s, slot in enumerate(m[:reader.slots]):
            for idx, p in slot:
                acc[s, idx] += p
    acc /= len(mats)
    raw, probs = reader.decode(acc)
    if not raw or not probs:
        return None
    from detector import normalise_plate
    from live import plausible_indian_plate
    text, fmt_ok = normalise_plate(raw)
    return {"text": text, "valid": bool(fmt_ok and plausible_indian_plate(text)), "mean_prob": round(sum(probs) / len(probs), 3),
            "min_prob": round(min(probs), 3), "n": len(mats)}


def _order_corners(pts) -> np.ndarray:
    pts = np.asarray(pts, np.float32)
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)        # top-left, top-right, bottom-right, bottom-left


def rectify(bgr, out_w: int = 192, out_h: int = 64, margin: float = 0.03):
    """
    The plate's board cut tight and straightened (perspective), or None when no clean board is found.  The board is the biggest
    light (or, for a green plate, dark) shape in the crop that is a convex four-cornered shape about 1.6 to 6.5 times wider than
    high.  Measured on 28 Oct: a plate seen at a slant was read DLBEAU7240 as it was and DL8CAV7240 straightened (truth
    DL8CAU7240); the crop the detector gives also carries a margin the model has to ignore.
    """
    h, w = bgr.shape[:2]
    if h < 12 or w < 24:
        return None
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    for inverted in (False, True):
        g = 255 - gray if inverted else gray
        _, m = cv2.threshold(cv2.GaussianBlur(g, (3, 3), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cs:
            continue
        c = max(cs, key=cv2.contourArea)
        area = cv2.contourArea(c)
        if area < 0.2 * h * w or area > 0.95 * h * w:
            continue
        hull = cv2.convexHull(c)
        quad = cv2.approxPolyDP(hull, 0.03 * cv2.arcLength(hull, True), True)
        box = quad.reshape(-1, 2) if len(quad) == 4 else cv2.boxPoints(cv2.minAreaRect(hull))
        q = _order_corners(box)
        wq = max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3]))
        hq = max(np.linalg.norm(q[3] - q[0]), np.linalg.norm(q[2] - q[1]))
        if hq < 6 or not (1.6 <= wq / hq <= 6.5) or cv2.contourArea(hull) < 0.6 * wq * hq:
            continue
        mx, my = margin * out_w, margin * out_h
        dst = np.array([[mx, my], [out_w - mx, my], [out_w - mx, out_h - my], [mx, out_h - my]], np.float32)
        return cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(q, dst), (out_w, out_h), flags=cv2.INTER_CUBIC,
                                   borderMode=cv2.BORDER_REPLICATE)
    return None


def ink_line(board, negative: bool = False):
    """The line of letters on a straightened board, cut tight: the bounding box of the ink with a small margin (None if there is none).
    `negative` for light letters on a dark board."""
    g = cv2.cvtColor(board, cv2.COLOR_BGR2GRAY)
    if negative:
        g = 255 - g
    _, m = cv2.threshold(cv2.GaussianBlur(g, (3, 3), 0), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = m.shape
    m[:int(h * 0.12)] = 0
    m[int(h * 0.9):] = 0
    m[:, :int(w * 0.04)] = 0
    m[:, int(w * 0.97):] = 0                                                         # the frame of the plate is not ink
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in cs if cv2.contourArea(c) > 0.004 * h * w]
    if not boxes:
        return None
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[0] + b[2] for b in boxes), max(b[1] + b[3] for b in boxes)
    px, py = int(0.04 * w) + 2, int(0.12 * h) + 2
    line = board[max(0, y0 - py):min(h, y1 + py), max(0, x0 - px):min(w, x1 + px)]
    return line if line.shape[0] >= 8 and line.shape[1] >= 24 else None


def green_board(bgr) -> bool:
    """A green number plate (an electric vehicle's: light letters on a green board)?  A fifth of the picture is a saturated green
    that is not too dark.  Cars, tarmac and plain plates are not that colour."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, w = hsv.shape[:2]
    core = hsv[int(h * 0.10):int(h * 0.90), int(w * 0.05):int(w * 0.95)]
    if core.size == 0:
        return False
    hue, sat, val = core[..., 0], core[..., 1], core[..., 2]
    return float(((hue >= 40) & (hue <= 95) & (sat >= 70) & (val >= 45)).mean()) >= 0.20


# A plate picture can be big enough and still unreadable: dark, or blurred.  "Readable" by size alone sent the black sedan's plate of 29 Oct
# (81 x 60 px, mean brightness 29, edges 26) to the readers, which gave "3", "CWC6454" and "SF9216" for one car.  Measured on 21 plate
# pictures of this lot: the clean ones have edges of 44-144 and a contrast of 95-219, the two bad ones 26-29 and 84-160.  The numbers
# are settings: more pictures will move them.
CLARITY_MIN_EDGE = float(os.getenv("ANPR_PLATE_MIN_EDGE", "34"))
CLARITY_MIN_CONTRAST = float(os.getenv("ANPR_PLATE_MIN_CONTRAST", "60"))


def clarity(tile_bgr) -> dict:
    """How clean a plate picture is: {"edge", "contrast", "clear"}.  `edge` is the mean Sobel strength on the picture brought to a standard
    200 px width (so a small and a large tile are alike), `contrast` the spread of its brightness (5th to 95th percentile)."""
    gray = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2GRAY) if tile_bgr.ndim == 3 else tile_bgr
    h, w = gray.shape[:2]
    if h < 4 or w < 4:
        return {"edge": 0.0, "contrast": 0.0, "clear": False}
    std = cv2.resize(gray, (200, max(8, int(200 * h / w))), interpolation=cv2.INTER_AREA)
    gx, gy = cv2.Sobel(std, cv2.CV_32F, 1, 0), cv2.Sobel(std, cv2.CV_32F, 0, 1)
    edge = float(np.mean(np.hypot(gx, gy)))
    contrast = float(np.percentile(gray, 95) - np.percentile(gray, 5))
    return {"edge": round(edge, 1), "contrast": round(contrast, 1),
            "clear": bool(edge >= CLARITY_MIN_EDGE and contrast >= CLARITY_MIN_CONTRAST)}


def usable(read: Optional[dict]) -> bool:
    """A read worth keeping: a real plate format, every letter sure enough, and no other plate text that is nearly as likely."""
    if not read or not read["valid"] or (read.get("rival") or 0.0) > RIVAL_SHARE:
        return False
    if read.get("cross"):                                      # two kinds of reader agree: a weak letter in one is covered by the other
        return read["mean_prob"] >= 0.55 and read["min_prob"] >= 0.2
    return read["mean_prob"] >= MIN_MEAN_PROB and read["min_prob"] >= MIN_CHAR_PROB


ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_"


def letter_doubts(reads: list[dict], text: Optional[str]) -> list[dict]:
    """
    Which letters of `text` the photos did NOT agree on, for a person who is about to check the plate against the picture:
    [{"pos": 5, "chars": ["U", "V", "D"]}, ...] (the letter is the 6th, 0-based 5), most likely first.  A person who is shown a whole
    plate and asked "is this right?" nods at it (28 Oct: a wrong "D" was confirmed that way); one who is told "look at the 6th letter:
    U, V or D" looks at that letter.  Needs the letters kept with the reads; [] when there are none, or none is in doubt.
    """
    if not text:
        return []
    weight: dict[int, dict[str, float]] = {}
    for r in reads or []:
        for cand, w in r.get("votes") or []:                       # the plates the readers proposed in that photo, with their weight
            if len(cand) == len(text):
                for pos, ch in enumerate(cand):
                    weight.setdefault(pos, {})[ch] = weight.setdefault(pos, {}).get(ch, 0.0) + w
    out = []
    for pos in range(len(text)):
        chars = weight.get(pos, {})
        total = sum(chars.values())
        if total <= 0 or len(chars) < 2:
            continue
        ranked = sorted(chars.items(), key=lambda kv: -kv[1])
        if ranked[0][1] / total < 0.8:                             # the readers did not agree on this letter
            shown = [c for c, w in ranked if w / total >= 0.05]
            if text[pos] not in shown:
                shown.append(text[pos])
            out.append({"pos": pos, "chars": shown})
    return out


def guess(reads: list[dict], min_mean: float = 0.45) -> Optional[str]:
    """
    The best guess at a plate that is NOT sure enough to count: the real-format text with the most weight among all the reads of
    the car, however unsure.  It is shown to a person as "?" with the picture beside it (28 Oct: a clear plate on a slanted car
    in a far bay read right at low certainty, and showing nothing was no help), and is never used as the plate.
    """
    weight: dict[str, float] = defaultdict(float)
    for r in reads:
        if r.get("valid") and r.get("text") and (r.get("mean_prob") or 0.0) >= min_mean:
            weight[r["text"]] += r["mean_prob"]
    return max(weight, key=weight.get) if weight else None


def vote(reads: list[dict], need: int = 2, solo_prob: float = 0.92, strict: bool = False) -> Optional[dict]:
    """
    The plate a car has, from all the usable reads of it so far (one per photo): the text with the most weight (each read
    weighs its mean probability).  It counts as confirmed with `need` agreeing photos, or with one photo whose every letter was
    at least `solo_prob` sure and which every way of reading agreed on; and never while another text has more than RIVAL_SHARE
    of its weight (two plates that nearly tie are not a confirmed plate).  Returns {"text", "reads", "agree", "confirmed"} or None.
    """
    good = [r for r in reads if usable(r)]
    if not good:
        return None
    weight: dict[str, float] = defaultdict(float)
    count: dict[str, int] = defaultdict(int)
    solo: dict[str, bool] = defaultdict(bool)
    for r in good:
        weight[r["text"]] += r["mean_prob"]
        count[r["text"]] += 1
        solo[r["text"]] = solo[r["text"]] or (r["min_prob"] >= solo_prob and (r.get("agree") or 4) >= (r.get("of") or 4) // 2 + 1)
    ranked = sorted(weight, key=lambda t: (weight[t], count[t]), reverse=True)
    text = ranked[0]
    rival = weight[ranked[1]] / weight[text] if len(ranked) > 1 else 0.0
    if strict:
        # `strict` is for a plate that is small (letters 14-20 px): there the readers are over-sure (28 Oct: the wrong letter had the
        # highest score), so it takes at least two photos, and two kinds of reader agreeing in each of them
        agreeing = [r for r in good if r["text"] == text]
        confirmed = len(agreeing) >= max(2, need) and all(r.get("cross") for r in agreeing) and rival <= RIVAL_SHARE
    else:
        confirmed = (count[text] >= need or solo[text]) and rival <= RIVAL_SHARE
    return {"text": text, "reads": len(good), "agree": count[text], "confirmed": confirmed}
