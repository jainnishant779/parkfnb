"""
ParkFNB — ANPR on video, with tracking and multi-frame voting.

    python anpr_video.py --video clip.mp4 --weights best.pt

Pipeline
    YOLO11n           vehicle + license_plate boxes
    ByteTrack         same vehicle keeps one id across frames
    plate crop        best plate inside each tracked vehicle
    PaddleOCR         text + confidence
    normalise         Indian format, position-aware O/0 and I/1
    vote              many frames -> one plate per vehicle

Why voting: a single frame is a coin toss. Ten frames of the same
car, weighted by confidence, is a decision. Never trust one read.

Outputs (default ./anpr_out)
    annotated.mp4     video with boxes, ids and live plate text
    plates.csv        one row per vehicle: final plate, votes, confidence
    frames.csv        per-frame detail for debugging
    crops/            best plate crop per vehicle, for the deck
"""

import argparse
import csv
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

# ----------------------------------------------------------------------
# Indian plate format
#   Standard : MH 12 AB 1234   -> LL DD LL DDDD
#   BH series: 22 BH 1234 AA
# Position matters: a blanket O->0 turns the MP state code into M0.
# ----------------------------------------------------------------------

ALPHA_TO_DIGIT = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}
DIGIT_TO_ALPHA = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A"}

PLATE_RE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$")
BH_RE = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")


# OCR often emits these for a narrow "1" or "I" before we ever see a letter.
STROKE_CHARS = str.maketrans({"|": "1", "!": "1", "[": "1", "]": "1"})


def clean_raw(text: str) -> str:
    """Strip everything that cannot appear on a plate."""
    s = (text or "").upper().translate(STROKE_CHARS)
    return re.sub(r"[^A-Z0-9]", "", s)


def fix_positions(s: str) -> str:
    """
    Apply confusions by position for the standard LL DD LL DDDD shape.
    Leaves anything that does not look standard untouched.
    """
    if len(s) < 8 or len(s) > 10:
        return s

    out = list(s)
    tail = len(out)

    # last 4 must be digits
    for i in range(tail - 4, tail):
        if out[i].isalpha():
            out[i] = ALPHA_TO_DIGIT.get(out[i], out[i])

    # first 2 must be letters (state code)
    for i in (0, 1):
        if out[i].isdigit():
            out[i] = DIGIT_TO_ALPHA.get(out[i], out[i])

    # positions 2-3 are the RTO district number
    for i in (2, 3):
        if i < tail - 4 and out[i].isalpha():
            out[i] = ALPHA_TO_DIGIT.get(out[i], out[i])

    # whatever sits between the district and the last 4 is the series
    for i in range(4, tail - 4):
        if out[i].isdigit():
            out[i] = DIGIT_TO_ALPHA.get(out[i], out[i])

    return "".join(out)


def normalise_plate(text: str):
    """-> (plate, is_valid). Invalid reads are kept, just flagged."""
    s = clean_raw(text)
    if not s:
        return "", False
    if BH_RE.match(s):
        return s, True
    fixed = fix_positions(s)
    return fixed, bool(PLATE_RE.match(fixed))


# ----------------------------------------------------------------------
# OCR — PaddleOCR preferred, EasyOCR as fallback
# ----------------------------------------------------------------------

class Ocr:
    def __init__(self, engine="auto"):
        self.kind = None
        if engine in ("auto", "paddle"):
            try:
                from paddleocr import TextRecognition
                self.rec = TextRecognition()
                self.kind = "paddle"
            except Exception as e:
                if engine == "paddle":
                    sys.exit(f"PaddleOCR unavailable: {e}")
        if self.kind is None:
            import easyocr
            self.rec = easyocr.Reader(["en"], gpu=False, verbose=False)
            self.kind = "easyocr"
        print(f"OCR engine: {self.kind}")

    def read(self, crop):
        if crop is None or crop.size == 0 or min(crop.shape[:2]) < 8:
            return "", 0.0
        try:
            if self.kind == "paddle":
                for r in self.rec.predict(crop):
                    d = r.json
                    if isinstance(d, str):
                        d = json.loads(d)
                    if "res" in d:
                        d = d["res"]
                    txt = d.get("rec_text") or d.get("text") or ""
                    sc = float(d.get("rec_score", d.get("score", 0)) or 0)
                    return txt, sc
                return "", 0.0
            res = self.rec.readtext(crop, detail=1, paragraph=False)
            if not res:
                return "", 0.0
            best = max(res, key=lambda r: r[2])
            return best[1], float(best[2])
        except Exception:
            return "", 0.0


def enhance(img):
    """CLAHE on the L channel — recovers plates in glare and shade."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def inside(outer, inner, slack=0.6):
    """Is the plate box mostly inside the vehicle box?"""
    ix1, iy1 = max(outer[0], inner[0]), max(outer[1], inner[1])
    ix2, iy2 = min(outer[2], inner[2]), min(outer[3], inner[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return False
    inter = (ix2 - ix1) * (iy2 - iy1)
    area = max(1.0, (inner[2] - inner[0]) * (inner[3] - inner[1]))
    return inter / area >= slack


# ----------------------------------------------------------------------
# Per-vehicle vote accumulator
# ----------------------------------------------------------------------

class Vehicle:
    __slots__ = ("tid", "votes", "best_conf", "best_crop", "frames",
                 "first_frame", "last_frame")

    def __init__(self, tid, frame_no):
        self.tid = tid
        self.votes = defaultdict(float)     # plate -> summed weight
        self.best_conf = 0.0
        self.best_crop = None
        self.frames = 0
        self.first_frame = frame_no
        self.last_frame = frame_no

    def add(self, plate, valid, ocr_conf, det_conf, crop, frame_no):
        self.frames += 1
        self.last_frame = frame_no
        if not plate:
            return
        # A read that matches the Indian format counts for more.
        weight = ocr_conf * det_conf * (2.0 if valid else 1.0)
        self.votes[plate] += weight
        if ocr_conf > self.best_conf:
            self.best_conf = ocr_conf
            self.best_crop = crop

    def result(self):
        if not self.votes:
            return None
        plate, score = max(self.votes.items(), key=lambda kv: kv[1])
        total = sum(self.votes.values())
        _, valid = normalise_plate(plate)
        return {
            "track_id": self.tid,
            "plate": plate,
            "valid_format": valid,
            "vote_share": round(score / total, 3) if total else 0.0,
            "distinct_reads": len(self.votes),
            "frames_seen": self.frames,
            "best_ocr_conf": round(self.best_conf, 3),
            "first_frame": self.first_frame,
            "last_frame": self.last_frame,
        }


# ----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="ANPR on video with tracking")
    ap.add_argument("--video", required=True, help="input video path")
    ap.add_argument("--weights", default="best.pt", help="YOLO weights")
    ap.add_argument("--out", default="anpr_out", help="output directory")
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--conf", type=float, default=0.25, help="vehicle conf")
    ap.add_argument("--plate-conf", type=float, default=0.15)
    ap.add_argument("--skip", type=int, default=1, help="process every Nth frame")
    ap.add_argument("--device", default="cpu", help="cpu or 0")
    ap.add_argument("--ocr", default="auto", choices=["auto", "paddle", "easyocr"])
    ap.add_argument("--ocr-every", type=int, default=3,
                    help="run OCR every Nth processed frame per vehicle")
    ap.add_argument("--vehicle-cls", type=int, default=0)
    ap.add_argument("--plate-cls", type=int, default=1)
    ap.add_argument("--no-video", action="store_true", help="skip writing the annotated mp4")
    ap.add_argument("--show-fps", action="store_true")
    args = ap.parse_args()

    from ultralytics import YOLO
    import torch
    import os
    torch.set_num_threads(os.cpu_count() or 4)   # default is 1 — roughly 2x slower

    src = Path(args.video)
    if not src.exists():
        sys.exit(f"Video not found: {src}")

    out_dir = Path(args.out)
    (out_dir / "crops").mkdir(parents=True, exist_ok=True)

    model = YOLO(args.weights)
    names = model.names
    print(f"Model classes: {names}")
    single_class = len(names) == 1
    if single_class:
        print("Single-class model — treating every box as a plate.")

    ocr = Ocr(args.ocr)

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {src}")

    fps_in = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"{W}x{H} @ {fps_in:.1f} fps, {total} frames")

    writer = None
    if not args.no_video:
        writer = cv2.VideoWriter(
            str(out_dir / "annotated.mp4"),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps_in / max(1, args.skip),
            (W, H),
        )

    vehicles = {}
    frame_rows = []
    frame_no = 0
    processed = 0
    t_start = time.time()
    infer_ms = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_no += 1
        if (frame_no - 1) % args.skip:
            continue
        processed += 1

        t0 = time.time()
        res = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=min(args.conf, args.plate_conf),
            imgsz=args.imgsz,
            device=args.device,
            verbose=False,
        )[0]
        infer_ms.append((time.time() - t0) * 1000)

        vboxes, pboxes = [], []
        if res.boxes is not None and len(res.boxes):
            for b in res.boxes:
                cls = int(b.cls[0])
                xyxy = [float(v) for v in b.xyxy[0].tolist()]
                conf = float(b.conf[0])
                tid = int(b.id[0]) if b.id is not None else -1
                if single_class or cls == args.plate_cls:
                    if conf >= args.plate_conf:
                        pboxes.append((xyxy, conf))
                if not single_class and cls == args.vehicle_cls and conf >= args.conf:
                    vboxes.append((xyxy, conf, tid))

        # A single-class model has no vehicle boxes: track the plate itself.
        if single_class:
            vboxes = [(b, c, -1) for b, c in pboxes]

        annotated = frame if writer is not None else None

        for vbox, vconf, tid in vboxes:
            if tid < 0:
                continue
            veh = vehicles.get(tid)
            if veh is None:
                veh = vehicles[tid] = Vehicle(tid, frame_no)

            # best plate inside this vehicle
            cand = None
            for pbox, pconf in pboxes:
                if single_class or inside(vbox, pbox):
                    if cand is None or pconf > cand[1]:
                        cand = (pbox, pconf)

            plate_txt = ""
            if cand is not None:
                px1, py1, px2, py2 = map(int, cand[0])
                pad = 4
                crop = frame[max(0, py1 - pad):min(H, py2 + pad),
                             max(0, px1 - pad):min(W, px2 + pad)]

                # OCR is the slow part — sample it, the vote covers the gaps.
                if crop.size and veh.frames % args.ocr_every == 0:
                    raw, sc = ocr.read(crop)
                    if not raw:
                        raw, sc = ocr.read(enhance(crop))
                    plate, valid = normalise_plate(raw)
                    veh.add(plate, valid, sc, cand[1], crop.copy(), frame_no)
                    plate_txt = plate
                else:
                    veh.add("", False, 0.0, cand[1], None, frame_no)

                if annotated is not None:
                    cv2.rectangle(annotated, (px1, py1), (px2, py2), (0, 255, 0), 2)

            r = veh.result()
            running = r["plate"] if r else ""

            frame_rows.append({
                "frame": frame_no,
                "track_id": tid,
                "plate_this_frame": plate_txt,
                "running_vote": running,
            })

            if annotated is not None:
                x1, y1, x2, y2 = map(int, vbox)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (255, 120, 0), 2)
                label = f"#{tid}  {running}" if running else f"#{tid}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                cv2.rectangle(annotated, (x1, max(0, y1 - th - 10)),
                              (x1 + tw + 8, y1), (255, 120, 0), -1)
                cv2.putText(annotated, label, (x1 + 4, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        if annotated is not None:
            if args.show_fps and infer_ms:
                cv2.putText(annotated,
                            f"{1000 / np.mean(infer_ms[-30:]):.1f} FPS  |  vehicles: {len(vehicles)}",
                            (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            writer.write(annotated)

        if processed % 50 == 0:
            done = f"{frame_no}/{total}" if total > 0 else str(frame_no)
            print(f"  {done} frames | {len(vehicles)} vehicles | "
                  f"{np.mean(infer_ms):.0f} ms/frame")

    cap.release()
    if writer is not None:
        writer.release()

    # ---------------- results ----------------
    results = [v.result() for v in vehicles.values()]
    results = [r for r in results if r]
    results.sort(key=lambda r: r["first_frame"])

    with open(out_dir / "plates.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[
            "track_id", "plate", "valid_format", "vote_share",
            "distinct_reads", "frames_seen", "best_ocr_conf",
            "first_frame", "last_frame"])
        w.writeheader()
        w.writerows(results)

    with open(out_dir / "frames.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["frame", "track_id",
                                          "plate_this_frame", "running_vote"])
        w.writeheader()
        w.writerows(frame_rows)

    for v in vehicles.values():
        if v.best_crop is not None:
            r = v.result()
            tag = r["plate"] if r and r["plate"] else "unknown"
            cv2.imwrite(str(out_dir / "crops" / f"v{v.tid:03d}_{tag}.jpg"), v.best_crop)

    elapsed = time.time() - t_start
    print("\n" + "=" * 68)
    print("ANPR RESULT")
    print("=" * 68)
    if not results:
        print("No plates read. Try --plate-conf 0.05, or --imgsz 1280.")
    else:
        print(f"{'id':>4}  {'plate':<12} {'ok':<4} {'vote':>6} {'reads':>6} "
              f"{'frames':>7} {'conf':>6}")
        print("-" * 68)
        for r in results:
            print(f"{r['track_id']:>4}  {r['plate']:<12} "
                  f"{'yes' if r['valid_format'] else 'no':<4} "
                  f"{r['vote_share']:>6.2f} {r['distinct_reads']:>6} "
                  f"{r['frames_seen']:>7} {r['best_ocr_conf']:>6.3f}")

    valid_n = sum(1 for r in results if r["valid_format"])
    print("-" * 68)
    print(f"Vehicles tracked      : {len(vehicles)}")
    print(f"Plates read           : {len(results)}")
    print(f"Valid Indian format   : {valid_n}"
          + (f"  ({valid_n / len(results) * 100:.0f}%)" if results else ""))
    if infer_ms:
        print(f"Detection+track       : {np.mean(infer_ms):.0f} ms/frame "
              f"({1000 / np.mean(infer_ms):.1f} FPS)")
    print(f"Wall clock            : {elapsed:.1f}s for {processed} frames")
    print(f"\nOutputs in: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
