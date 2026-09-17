# ============================================================
#  ParkFNB — ANPR MODEL COMPARISON  (Colab)
#  Paste each numbered CELL into its own Colab cell.
#
#  Compares 3 detectors on the kedarsai Indian plates dataset:
#    1. ParkFNB YOLO11n   (yours, India-trained)
#    2. Generic YOLO11n plate model  (morsetechlab, HuggingFace)
#    3. FastALPR          (YOLOv9-t, off-the-shelf)
#
#  Ground truth comes from the dataset's own label files, so
#  NOTHING has to be labelled by hand.
#
#  Outputs -> Drive/ParkFNB/benchmark_results/
#      detection_results.csv     per-image rows
#      summary.csv               one row per model
#      comparison_charts.png     4-panel chart for the deck
#      ocr_results.csv           plate text where OCR ran
# ============================================================


# ============================================================
# CELL 1 — SETUP
# ============================================================
!pip -q install ultralytics huggingface_hub pandas matplotlib
!pip -q install "fast-alpr[onnx-gpu]"

from google.colab import drive
drive.mount('/content/drive')

import os, json, time, shutil, zipfile
from pathlib import Path
import numpy as np, pandas as pd, torch, cv2

DEVICE = 0 if torch.cuda.is_available() else "cpu"
print("CUDA:", torch.cuda.is_available(), "| device:", DEVICE)

DRIVE   = Path("/content/drive/MyDrive/ParkFNB")
OUT_DIR = DRIVE / "benchmark_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)
print("Results ->", OUT_DIR)


# ============================================================
# CELL 2 — DOWNLOAD THE TEST DATASET
#   kedarsai/indian-license-plates-with-labels
#   Upload your kaggle.json when prompted.
# ============================================================
from google.colab import files

KAGGLE_DIR = Path("/root/.kaggle")
KAGGLE_DIR.mkdir(exist_ok=True)

if not (KAGGLE_DIR / "kaggle.json").exists():
    print("Upload kaggle.json  (Kaggle > Account > Create New API Token)")
    up = files.upload()
    shutil.move(list(up.keys())[0], KAGGLE_DIR / "kaggle.json")
os.chmod(KAGGLE_DIR / "kaggle.json", 0o600)

!pip -q install kaggle
!kaggle datasets download -d kedarsai/indian-license-plates-with-labels -p /content/kedarsai --unzip

RAW = Path("/content/kedarsai")
print("\nTop-level contents:")
for p in sorted(RAW.iterdir())[:20]:
    print(" ", p.name)


# ============================================================
# CELL 3 — INDEX IMAGES + LABELS
#   Handles the common layouts (images/ + labels/, or flat).
# ============================================================
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp"}

all_images = [p for p in RAW.rglob("*") if p.suffix.lower() in IMG_EXT]
print("Images found:", len(all_images))


def find_label(img_path: Path):
    """Locate the YOLO .txt label for an image, whatever the layout."""
    stem = img_path.stem
    cands = [
        img_path.with_suffix(".txt"),
        img_path.parent / "labels" / f"{stem}.txt",
        img_path.parent.parent / "labels" / f"{stem}.txt",
    ]
    for c in cands:
        if c.exists():
            return c
    hits = list(RAW.rglob(f"{stem}.txt"))
    return hits[0] if hits else None


def read_boxes(label_path, w, h):
    """YOLO normalised cx,cy,w,h -> pixel x1,y1,x2,y2."""
    if label_path is None:
        return []
    out = []
    for line in label_path.read_text().strip().splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        _, cx, cy, bw, bh = parts[:5]
        cx, cy, bw, bh = float(cx) * w, float(cy) * h, float(bw) * w, float(bh) * h
        out.append([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2])
    return out


labelled = []
for img in all_images:
    lp = find_label(img)
    if lp is not None:
        labelled.append((img, lp))

print("Images with labels:", len(labelled))


# ============================================================
# CELL 4 — REMOVE ANY IMAGE THAT WAS IN TRAINING
#
#   IMPORTANT: this dataset was used to build the training set,
#   so scoring on it unfiltered would be testing on training
#   data. We hash every training image and drop any match.
#
#   Set TRAIN_DIRS to wherever your training images live.
# ============================================================
import hashlib

TRAIN_DIRS = [
    DRIVE / "ParkFNB_Dataset" / "images" / "train",
    DRIVE / "ParkFNB_Dataset" / "images" / "val",
    DRIVE / "ParkFNB_Dataset" / "train" / "images",
    DRIVE / "ParkFNB_Dataset" / "valid" / "images",
]


def file_hash(p, chunk=1 << 16):
    h = hashlib.md5()
    with open(p, "rb") as f:
        while (b := f.read(chunk)):
            h.update(b)
    return h.hexdigest()


train_hashes, train_stems = set(), set()
for d in TRAIN_DIRS:
    if not d.exists():
        continue
    for p in d.rglob("*"):
        if p.suffix.lower() in IMG_EXT:
            train_hashes.add(file_hash(p))
            # training copies were renamed e.g. "vehicle_<orig>.jpg"
            train_stems.add(p.stem.replace("vehicle_", ""))

print("Training images indexed:", len(train_hashes))

clean = []
dropped = 0
for img, lp in labelled:
    if file_hash(img) in train_hashes or img.stem in train_stems:
        dropped += 1
        continue
    clean.append((img, lp))

print(f"Dropped as seen-in-training: {dropped}")
print(f"CLEAN TEST IMAGES:           {len(clean)}")

if len(clean) == 0:
    print("\n*** Every image was in training. This dataset cannot")
    print("*** give an honest score. Use your own held-out test")
    print("*** split, or footage you shot yourself, instead.")

# Cap the run so it finishes in minutes, not hours.
MAX_IMAGES = 300
rng = np.random.default_rng(42)
if len(clean) > MAX_IMAGES:
    idx = rng.choice(len(clean), MAX_IMAGES, replace=False)
    clean = [clean[i] for i in idx]
print("Benchmarking on:", len(clean), "images")


# ============================================================
# CELL 5 — LOAD THE THREE DETECTORS
# ============================================================
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

PARKFNB_WEIGHTS = (
    DRIVE / "ParkFNB_Dataset" / "training_runs"
    / "yolo11n_vehicle_plate_v3" / "weights" / "best.pt"
)
assert PARKFNB_WEIGHTS.exists(), f"Not found: {PARKFNB_WEIGHTS}"

parkfnb_model = YOLO(str(PARKFNB_WEIGHTS))
print("ParkFNB classes:", parkfnb_model.names)

generic_path = hf_hub_download(
    repo_id="morsetechlab/yolov11-license-plate-detection",
    filename="license-plate-finetune-v1n.pt",
)
generic_model = YOLO(generic_path)
print("Generic classes:", generic_model.names)

try:
    from fast_alpr import ALPR
    fastalpr = ALPR(
        detector_model="yolo-v9-t-384-license-plate-end2end",
        ocr_model="global-plates-mobile-vit-v2-model",
    )
    HAVE_FASTALPR = True
except Exception as e:
    print("FastALPR unavailable:", e)
    HAVE_FASTALPR = False

# Which class index means "license plate" in each model
PARKFNB_PLATE_CLS = 1          # 0=vehicle, 1=license_plate
GENERIC_PLATE_CLS = 0          # single-class model


# ============================================================
# CELL 6 — IoU + PER-MODEL RUNNERS
# ============================================================
def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)


CONF = 0.25
IMGSZ = 960


def run_yolo(model, frame, plate_cls):
    t0 = time.time()
    r = model.predict(frame, conf=CONF, imgsz=IMGSZ, device=DEVICE, verbose=False)[0]
    ms = (time.time() - t0) * 1000
    boxes, confs = [], []
    for b in r.boxes:
        if int(b.cls[0]) == plate_cls:
            boxes.append([float(v) for v in b.xyxy[0].tolist()])
            confs.append(float(b.conf[0]))
    return boxes, confs, ms


def run_fastalpr(frame):
    t0 = time.time()
    try:
        res = fastalpr.predict(frame)
    except Exception:
        return [], [], (time.time() - t0) * 1000
    ms = (time.time() - t0) * 1000
    boxes, confs = [], []
    for r in res:
        bb = getattr(r, "detection", None)
        if bb is None:
            continue
        bbox = bb.bounding_box
        boxes.append([float(bbox.x1), float(bbox.y1), float(bbox.x2), float(bbox.y2)])
        confs.append(float(getattr(bb, "confidence", 0.0)))
    return boxes, confs, ms


# ============================================================
# CELL 7 — RUN THE BENCHMARK
# ============================================================
IOU_THRESH = 0.5
rows = []

for n, (img_path, label_path) in enumerate(clean, 1):
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue
    h, w = frame.shape[:2]
    gt = read_boxes(label_path, w, h)
    if not gt:
        continue

    systems = {
        "ParkFNB":  run_yolo(parkfnb_model, frame, PARKFNB_PLATE_CLS),
        "Generic":  run_yolo(generic_model, frame, GENERIC_PLATE_CLS),
    }
    if HAVE_FASTALPR:
        systems["FastALPR"] = run_fastalpr(frame)

    for name, (boxes, confs, ms) in systems.items():
        matched, used = 0, set()
        for g in gt:
            best_i, best_v = -1, 0.0
            for i, b in enumerate(boxes):
                if i in used:
                    continue
                v = iou(g, b)
                if v > best_v:
                    best_i, best_v = i, v
            if best_v >= IOU_THRESH:
                matched += 1
                used.add(best_i)

        rows.append({
            "image": img_path.name,
            "model": name,
            "gt_plates": len(gt),
            "detected": len(boxes),
            "matched": matched,
            "false_pos": len(boxes) - matched,
            "avg_conf": float(np.mean(confs)) if confs else 0.0,
            "ms": ms,
        })

    if n % 25 == 0:
        print(f"  {n}/{len(clean)} images")

df = pd.DataFrame(rows)
df.to_csv(OUT_DIR / "detection_results.csv", index=False)
print("\nSaved detection_results.csv —", len(df), "rows")


# ============================================================
# CELL 8 — SUMMARY TABLE  (this is the slide)
# ============================================================
summary = []
for model in df["model"].unique():
    d = df[df["model"] == model]
    tp = d["matched"].sum()
    fp = d["false_pos"].sum()
    gt = d["gt_plates"].sum()

    recall    = tp / gt if gt else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    summary.append({
        "Model": model,
        "Recall %":      round(recall * 100, 1),
        "Precision %":   round(precision * 100, 1),
        "F1 %":          round(f1 * 100, 1),
        "Avg conf":      round(d["avg_conf"].mean(), 3),
        "Latency ms":    round(d["ms"].mean(), 1),
        "FPS":           round(1000 / d["ms"].mean(), 1),
        "Images":        len(d),
    })

sdf = pd.DataFrame(summary).sort_values("F1 %", ascending=False)
sdf.to_csv(OUT_DIR / "summary.csv", index=False)

print("\n" + "=" * 70)
print("PARKFNB ANPR DETECTION BENCHMARK")
print(f"Test images: {len(clean)}  (training images removed)")
print("=" * 70)
print(sdf.to_string(index=False))


# ============================================================
# CELL 9 — CHARTS FOR THE DECK
# ============================================================
import matplotlib.pyplot as plt

fig, ax = plt.subplots(2, 2, figsize=(14, 9))
colors = ["#2E7D32" if m == "ParkFNB" else "#90A4AE" for m in sdf["Model"]]

ax[0, 0].bar(sdf["Model"], sdf["Recall %"], color=colors)
ax[0, 0].set_title("Plate detection rate (recall)")
ax[0, 0].set_ylabel("%"); ax[0, 0].set_ylim(0, 100)

ax[0, 1].bar(sdf["Model"], sdf["Precision %"], color=colors)
ax[0, 1].set_title("Precision")
ax[0, 1].set_ylabel("%"); ax[0, 1].set_ylim(0, 100)

ax[1, 0].bar(sdf["Model"], sdf["Latency ms"], color=colors)
ax[1, 0].set_title("Latency (lower is better)")
ax[1, 0].set_ylabel("ms / image")

ax[1, 1].scatter(sdf["Latency ms"], sdf["F1 %"], s=220, c=colors)
for _, r in sdf.iterrows():
    ax[1, 1].annotate(r["Model"], (r["Latency ms"], r["F1 %"]),
                      textcoords="offset points", xytext=(8, 6))
ax[1, 1].set_xlabel("Latency (ms)"); ax[1, 1].set_ylabel("F1 %")
ax[1, 1].set_title("Accuracy vs speed — top-left is best")
ax[1, 1].grid(alpha=0.3)

for a in ax.flat:
    a.grid(axis="y", alpha=0.3)

plt.tight_layout()
plt.savefig(OUT_DIR / "comparison_charts.png", dpi=200)
plt.show()
print("Saved comparison_charts.png")


# ============================================================
# CELL 10 (OPTIONAL) — OCR ON WHAT EACH DETECTOR FOUND
#   Detection alone does not open a barrier; the text must be
#   right. This reads the plate crop from each detector.
#   No ground-truth text needed — where two systems agree,
#   that is strong evidence the read is correct.
# ============================================================
!pip -q install paddleocr paddlepaddle
from paddleocr import TextRecognition

rec = TextRecognition()


def ocr_crop(crop):
    if crop is None or crop.size == 0:
        return "", 0.0
    try:
        for r in rec.predict(crop):
            d = r.json
            if isinstance(d, str):
                d = json.loads(d)
            if "res" in d:
                d = d["res"]
            txt = (d.get("rec_text") or d.get("text") or "").upper().replace(" ", "")
            return txt, float(d.get("rec_score", d.get("score", 0)) or 0)
    except Exception:
        pass
    return "", 0.0


ocr_rows = []
OCR_LIMIT = min(100, len(clean))

for img_path, _ in clean[:OCR_LIMIT]:
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue
    row = {"image": img_path.name}

    for name, model, cls in [
        ("ParkFNB", parkfnb_model, PARKFNB_PLATE_CLS),
        ("Generic", generic_model, GENERIC_PLATE_CLS),
    ]:
        boxes, confs, _ = run_yolo(model, frame, cls)
        if boxes:
            best = int(np.argmax(confs))
            x1, y1, x2, y2 = map(int, boxes[best])
            pad = 5
            crop = frame[max(0, y1 - pad):y2 + pad, max(0, x1 - pad):x2 + pad]
            txt, sc = ocr_crop(crop)
            row[f"{name}_text"] = txt
            row[f"{name}_ocr_conf"] = round(sc, 3)
        else:
            row[f"{name}_text"] = ""
            row[f"{name}_ocr_conf"] = 0.0

    row["agree"] = (
        row["ParkFNB_text"] != ""
        and row["ParkFNB_text"] == row["Generic_text"]
    )
    ocr_rows.append(row)

odf = pd.DataFrame(ocr_rows)
odf.to_csv(OUT_DIR / "ocr_results.csv", index=False)

pf_read = (odf["ParkFNB_text"] != "").mean() * 100
gen_read = (odf["Generic_text"] != "").mean() * 100
agree = odf["agree"].mean() * 100

print("\n" + "=" * 70)
print("OCR OUTCOME  (no manual labelling involved)")
print("=" * 70)
print(f"ParkFNB produced a plate string : {pf_read:.1f}% of images")
print(f"Generic produced a plate string : {gen_read:.1f}% of images")
print(f"Both agreed exactly             : {agree:.1f}%  <- strong evidence of correctness")
print("\nSaved ocr_results.csv")
print("\nAll outputs in:", OUT_DIR)
