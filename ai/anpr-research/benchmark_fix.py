# ============================================================
#  ParkFNB — BENCHMARK FIX PACK
#
#  Two problems in the first run:
#
#  A) "Dropped as seen-in-training: 0" — the MD5 filter failed,
#     because training copies were resized/re-encoded, so the
#     bytes differ even for the same photo. CELL A replaces it
#     with a perceptual hash, which survives re-encoding.
#
#  B) "Both agreed exactly: 0.0%" — impossible if both models
#     read real plates. CELL B prints the actual strings so the
#     cause is visible, then CELL C fixes the likely cause.
#
#  Run CELL B first. It takes 30 seconds and tells you what to do.
# ============================================================


# ============================================================
# CELL B — WHY IS AGREEMENT ZERO?   (run this first)
# ============================================================
import cv2, json, numpy as np
from pathlib import Path

print("Inspecting 8 images, both detectors, raw OCR output\n")

for img_path, _ in clean[:8]:
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue
    print("=" * 66)
    print(img_path.name, f"  {frame.shape[1]}x{frame.shape[0]}")

    for name, model, cls in [
        ("ParkFNB", parkfnb_model, PARKFNB_PLATE_CLS),
        ("Generic", generic_model, GENERIC_PLATE_CLS),
    ]:
        boxes, confs, _ = run_yolo(model, frame, cls)
        if not boxes:
            print(f"  {name:8} no plate box")
            continue
        b = int(np.argmax(confs))
        x1, y1, x2, y2 = map(int, boxes[b])
        crop = frame[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5]
        txt, sc = ocr_crop(crop)
        print(f"  {name:8} box=({x1},{y1},{x2},{y2}) "
              f"{crop.shape[1]}x{crop.shape[0]}px  "
              f"det={confs[b]:.2f}  ocr='{txt}' ({sc:.2f})")

print("""
How to read this:

  Both OCR strings empty        -> crops are too small; see CELL C
  Strings differ by 1-2 chars   -> normal OCR noise; normalise then compare
  One model boxes something else-> wrong class index for that model
  Crops under ~30px tall        -> upscale before OCR; CELL C does this
""")


# ============================================================
# CELL C — FIXED OCR COMPARISON
#   Changes that matter:
#     1. Upscale small crops before OCR (plates are tiny)
#     2. CLAHE retry when the first read is empty
#     3. Compare NORMALISED plates, not raw strings
#     4. Report near-match (<=1 char) as well as exact
# ============================================================
import re, pandas as pd

ALPHA2DIGIT = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}
DIGIT2ALPHA = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A"}
PLATE_RE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$")


def normalise(text):
    """Indian plate format, position-aware. Returns (plate, is_valid)."""
    s = re.sub(r"[^A-Z0-9]", "", (text or "").upper()
               .replace("|", "1").replace("!", "1"))
    if not s or len(s) < 8 or len(s) > 10:
        return s, False
    o = list(s)
    n = len(o)
    for i in range(n - 4, n):                      # last 4 = digits
        if o[i].isalpha():
            o[i] = ALPHA2DIGIT.get(o[i], o[i])
    for i in (0, 1):                               # state code = letters
        if o[i].isdigit():
            o[i] = DIGIT2ALPHA.get(o[i], o[i])
    for i in (2, 3):                               # district = digits
        if i < n - 4 and o[i].isalpha():
            o[i] = ALPHA2DIGIT.get(o[i], o[i])
    for i in range(4, n - 4):                      # series = letters
        if o[i].isdigit():
            o[i] = DIGIT2ALPHA.get(o[i], o[i])
    p = "".join(o)
    return p, bool(PLATE_RE.match(p))


def enhance(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def ocr_best(crop):
    """Upscale small crops, retry with CLAHE. Returns (raw, conf)."""
    if crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
        return "", 0.0
    h = crop.shape[0]
    if h < 48:                                     # plates are small; OCR needs pixels
        f = 48 / h
        crop = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    txt, sc = ocr_crop(crop)
    if not txt:
        txt, sc = ocr_crop(enhance(crop))
    return txt, sc


def char_diff(a, b):
    if not a or not b or len(a) != len(b):
        return 99
    return sum(1 for x, y in zip(a, b) if x != y)


rows = []
LIMIT = min(150, len(clean))

for i, (img_path, _) in enumerate(clean[:LIMIT], 1):
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue
    r = {"image": img_path.name}

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
            r[f"{name}_raw"] = raw
            r[f"{name}_plate"] = plate
            r[f"{name}_valid"] = valid
            r[f"{name}_conf"] = round(sc, 3)
        else:
            r[f"{name}_raw"] = r[f"{name}_plate"] = ""
            r[f"{name}_valid"] = False
            r[f"{name}_conf"] = 0.0

    p, g = r["ParkFNB_plate"], r["Generic_plate"]
    r["exact"] = bool(p and p == g)
    r["near"] = bool(p and g and char_diff(p, g) <= 1)
    rows.append(r)

    if i % 25 == 0:
        print(f"  {i}/{LIMIT}")

odf = pd.DataFrame(rows)
odf.to_csv(OUT_DIR / "ocr_results_fixed.csv", index=False)

both = odf[(odf["ParkFNB_plate"] != "") & (odf["Generic_plate"] != "")]

print("\n" + "=" * 68)
print("OCR COMPARISON  (no manual labelling)")
print("=" * 68)
print(f"Images tested                      : {len(odf)}")
print(f"ParkFNB returned text              : {(odf['ParkFNB_plate'] != '').mean() * 100:.1f}%")
print(f"Generic returned text              : {(odf['Generic_plate'] != '').mean() * 100:.1f}%")
print(f"ParkFNB valid Indian format        : {odf['ParkFNB_valid'].mean() * 100:.1f}%")
print(f"Generic valid Indian format        : {odf['Generic_valid'].mean() * 100:.1f}%")
if len(both):
    print(f"Exact agreement (both read)        : {both['exact'].mean() * 100:.1f}%")
    print(f"Within 1 character                 : {both['near'].mean() * 100:.1f}%")
print("\nFirst 15 side by side:")
print(odf[["ParkFNB_plate", "Generic_plate", "exact"]].head(15).to_string(index=False))
print("\nSaved ocr_results_fixed.csv")

print("""
Use on the slide:
  "Valid Indian format %" is the honest headline. A plate that does not
  match LL DD LL DDDD is a plate the barrier would refuse, so this is
  the number that predicts whether the gate opens.
""")


# ============================================================
# CELL A — HONEST TEST SET  (perceptual hash)
#   MD5 failed because training copies were re-encoded.
#   dHash compares what the image LOOKS like, so it catches
#   resized and re-compressed duplicates.
#   Run this, then re-run the benchmark cells on `clean`.
# ============================================================
def dhash(path, size=8):
    """64-bit perceptual hash; survives resize and re-compression."""
    im = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if im is None:
        return None
    im = cv2.resize(im, (size + 1, size), interpolation=cv2.INTER_AREA)
    diff = im[:, 1:] > im[:, :-1]
    return "".join("1" if v else "0" for v in diff.flatten())


train_ph = set()
for d in TRAIN_DIRS:
    if not d.exists():
        continue
    for p in d.rglob("*"):
        if p.suffix.lower() in IMG_EXT:
            h = dhash(p)
            if h:
                train_ph.add(h)

print("Training perceptual hashes:", len(train_ph))

honest, leaked = [], 0
for img, lp in labelled:
    h = dhash(img)
    if h and h in train_ph:
        leaked += 1
        continue
    honest.append((img, lp))

print(f"Leaked (seen in training)  : {leaked}")
print(f"HONEST TEST IMAGES         : {len(honest)}")

if leaked == 0:
    print("""
Still zero. Either the training images really are different photos,
or TRAIN_DIRS points at the wrong folders. Check:
    for d in TRAIN_DIRS: print(d, d.exists(), len(list(d.rglob('*.jpg'))))

If you cannot prove separation, say so on the slide:
    "Tested on 300 images from the same public dataset family used
     in training; an independent held-out set is the next step."
Stating the caveat costs you nothing. Being caught costs the room.
""")
else:
    MAX_IMAGES = 300
    rng = np.random.default_rng(42)
    clean = honest if len(honest) <= MAX_IMAGES else \
        [honest[i] for i in rng.choice(len(honest), MAX_IMAGES, replace=False)]
    print(f"\n`clean` now holds {len(clean)} leak-free images.")
    print("Re-run CELL 7, 8, 9 to regenerate honest numbers.")
