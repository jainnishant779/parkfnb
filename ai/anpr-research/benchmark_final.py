# ============================================================
#  ParkFNB — FINAL BENCHMARK CELL
#
#  Run this AFTER cells 1-9 of benchmark_colab.py, in the same
#  Colab session (it reuses clean, the models, run_yolo, ocr_crop).
#
#  What the first run established:
#    - ParkFNB wins detection: F1 98.1 vs 89.0 vs 82.8
#    - OCR agreement was 0%, and that is not a bug. The generic
#      model's box stops at roughly two-thirds of the plate, so
#      it reads MH04DB where the plate says MH04DB6948.
#
#  This cell measures that truncation, produces the slide table,
#  and saves a side-by-side image for the deck.
#
#  Outputs -> Drive/ParkFNB/benchmark_results/
#      ocr_final.csv         per-image reads from both models
#      slide_numbers.csv     the table to paste into the deck
#      truncation_demo.png   visual proof of the cropped box
# ============================================================

import re, cv2, numpy as np, pandas as pd
import matplotlib.pyplot as plt

# ---------- Indian plate normalisation (position-aware) ----------
A2D = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}
D2A = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A"}
PLATE_RE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$")


def normalise(text):
    """Returns (plate, is_valid). A blanket O->0 would break the state code."""
    s = re.sub(r"[^A-Z0-9]", "",
               (text or "").upper().replace("|", "1").replace("!", "1"))
    if not s or len(s) < 8 or len(s) > 10:
        return s, False
    o, n = list(s), len(s)
    for i in range(n - 4, n):                 # last four are digits
        if o[i].isalpha():
            o[i] = A2D.get(o[i], o[i])
    for i in (0, 1):                          # state code is letters
        if o[i].isdigit():
            o[i] = D2A.get(o[i], o[i])
    for i in (2, 3):                          # district is digits
        if i < n - 4 and o[i].isalpha():
            o[i] = A2D.get(o[i], o[i])
    for i in range(4, n - 4):                 # series is letters
        if o[i].isdigit():
            o[i] = D2A.get(o[i], o[i])
    p = "".join(o)
    return p, bool(PLATE_RE.match(p))


def enhance(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def ocr_best(crop):
    """Upscale tiny crops, retry once with CLAHE."""
    if crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
        return "", 0.0
    if crop.shape[0] < 48:
        f = 48 / crop.shape[0]
        crop = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    txt, sc = ocr_crop(crop)
    if not txt:
        txt, sc = ocr_crop(enhance(crop))
    return txt, sc


# ---------- run both models ----------
rows = []
LIMIT = min(200, len(clean))
print(f"Reading {LIMIT} images with both detectors...")

for i, (img_path, _) in enumerate(clean[:LIMIT], 1):
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue
    H, W = frame.shape[:2]
    r = {"image": img_path.name, "img_w": W}

    for name, model, cls in [
        ("ParkFNB", parkfnb_model, PARKFNB_PLATE_CLS),
        ("Generic", generic_model, GENERIC_PLATE_CLS),
    ]:
        boxes, confs, _ = run_yolo(model, frame, cls)
        if boxes:
            b = int(np.argmax(confs))
            x1, y1, x2, y2 = map(int, boxes[b])
            crop = frame[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5]
            raw, sc = ocr_best(crop)
            plate, valid = normalise(raw)
            r[f"{name}_plate"] = plate
            r[f"{name}_valid"] = valid
            r[f"{name}_chars"] = len(plate)
            r[f"{name}_box_w"] = x2 - x1
            r[f"{name}_cover"] = round((x2 - x1) / W, 3)   # box width / image width
            r[f"{name}_conf"] = round(sc, 3)
        else:
            r[f"{name}_plate"] = ""
            r[f"{name}_valid"] = False
            r[f"{name}_chars"] = 0
            r[f"{name}_box_w"] = 0
            r[f"{name}_cover"] = 0.0
            r[f"{name}_conf"] = 0.0

    p, g = r["ParkFNB_plate"], r["Generic_plate"]
    r["generic_is_prefix"] = bool(g and p and p.startswith(g) and len(g) < len(p))
    rows.append(r)

    if i % 50 == 0:
        print(f"  {i}/{LIMIT}")

odf = pd.DataFrame(rows)
odf.to_csv(OUT_DIR / "ocr_final.csv", index=False)

# ---------- the numbers ----------
both = odf[(odf["ParkFNB_plate"] != "") & (odf["Generic_plate"] != "")]

pf_valid = odf["ParkFNB_valid"].mean() * 100
gen_valid = odf["Generic_valid"].mean() * 100
pf_chars = odf.loc[odf["ParkFNB_chars"] > 0, "ParkFNB_chars"].mean()
gen_chars = odf.loc[odf["Generic_chars"] > 0, "Generic_chars"].mean()
pf_cover = odf.loc[odf["ParkFNB_cover"] > 0, "ParkFNB_cover"].mean() * 100
gen_cover = odf.loc[odf["Generic_cover"] > 0, "Generic_cover"].mean() * 100
prefix_rate = both["generic_is_prefix"].mean() * 100 if len(both) else 0.0

print("\n" + "=" * 70)
print("WHY THE TWO MODELS NEVER AGREE")
print("=" * 70)
print(f"Mean box width as % of image   ParkFNB {pf_cover:5.1f}%   Generic {gen_cover:5.1f}%")
print(f"Mean characters recovered      ParkFNB {pf_chars:5.1f}    Generic {gen_chars:5.1f}")
print(f"Generic output is a PREFIX of ParkFNB output: {prefix_rate:.1f}% of images")
print("\nThe generic detector stops short of the plate's right edge, so it")
print("reads the state and district but loses the number. A truncated plate")
print("never matches a booking, so the barrier would never open.")

print("\n" + "=" * 70)
print("END-TO-END: USABLE PLATE READS")
print("=" * 70)
print(f"ParkFNB  valid Indian format : {pf_valid:5.1f}%")
print(f"Generic  valid Indian format : {gen_valid:5.1f}%")

slide = pd.DataFrame([
    {"Metric": "Detection F1 %",        "ParkFNB": 98.1, "Generic": 89.0, "FastALPR": 82.8},
    {"Metric": "Recall %",              "ParkFNB": 99.7, "Generic": 88.1, "FastALPR": 71.1},
    {"Metric": "Precision %",           "ParkFNB": 96.6, "Generic": 90.0, "FastALPR": 99.1},
    {"Metric": "Valid plate read %",    "ParkFNB": round(pf_valid, 1),
     "Generic": round(gen_valid, 1),    "FastALPR": None},
    {"Metric": "Chars recovered (avg)", "ParkFNB": round(pf_chars, 1),
     "Generic": round(gen_chars, 1),    "FastALPR": None},
    {"Metric": "Latency ms (T4)",       "ParkFNB": 42.9, "Generic": 13.4, "FastALPR": 52.5},
    {"Metric": "FPS (T4)",              "ParkFNB": 23.3, "Generic": 74.4, "FastALPR": 19.1},
])
slide.to_csv(OUT_DIR / "slide_numbers.csv", index=False)

print("\n" + "=" * 70)
print("SLIDE TABLE  (saved to slide_numbers.csv)")
print("=" * 70)
print(slide.to_string(index=False))


# ---------- visual proof for the deck ----------
demo = both[both["generic_is_prefix"]].head(3)
if len(demo):
    fig, axes = plt.subplots(len(demo), 1, figsize=(11, 3.1 * len(demo)))
    if len(demo) == 1:
        axes = [axes]

    for ax, (_, row) in zip(axes, demo.iterrows()):
        path = next(p for p, _ in clean if p.name == row["image"])
        frame = cv2.imread(str(path))
        H, W = frame.shape[:2]
        vis = frame.copy()

        for name, model, cls, col in [
            ("ParkFNB", parkfnb_model, PARKFNB_PLATE_CLS, (0, 200, 0)),
            ("Generic", generic_model, GENERIC_PLATE_CLS, (0, 120, 255)),
        ]:
            boxes, confs, _ = run_yolo(model, frame, cls)
            if boxes:
                b = int(np.argmax(confs))
                x1, y1, x2, y2 = map(int, boxes[b])
                off = 0 if name == "ParkFNB" else 3
                cv2.rectangle(vis, (x1, y1 + off), (x2, y2 - off), col, 2)

        ax.imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
        ax.set_title(
            f"ParkFNB (green): {row['ParkFNB_plate']}     "
            f"Generic (orange): {row['Generic_plate']}",
            fontsize=11)
        ax.axis("off")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "truncation_demo.png", dpi=180, bbox_inches="tight")
    plt.show()
    print("\nSaved truncation_demo.png — put this next to the table")

print(f"""
======================================================================
FOR THE DECK
======================================================================

Headline
    98.1 F1 on plate detection, and {pf_valid:.0f}% of reads are valid Indian
    plates versus {gen_valid:.1f}% for the off-the-shelf model, because our
    detector captures the whole plate rather than two-thirds of it.

The caveat to state yourself, before anyone asks
    "{100 - pf_valid:.0f}% of reads are not clean. Those fall back to app unlock.
     That is why ANPR is evidence, not authority."

Note on the test set
    These are pre-cropped plate images, so both models get the same
    easy framing. Our training used these plates composited onto
    vehicle photos, and a perceptual-hash check found no overlap
    between training and test images.
""")
