# ============================================================
#  ParkFNB — ANNOTATED IMAGES
#
#  Run in the same Colab session as benchmark_colab.py cells 1-9.
#
#  Draws each model's box on the image and writes the plate it read
#  directly above that box. No charts, no slides — just the pictures.
#
#     green  = ParkFNB (ours)
#     orange = Generic YOLO11n
#     purple = FastALPR
#
#  Outputs -> Drive/ParkFNB/benchmark_results/annotated/
#      <image>.jpg          all three models on one image
#      compare/<image>.jpg  ours vs generic, side by side
# ============================================================

import re, cv2, numpy as np, pandas as pd
from pathlib import Path

HOW_MANY = 60            # how many images to annotate
MAKE_SIDE_BY_SIDE = True # also write the two-panel version

ANN = OUT_DIR / "annotated"
CMP = ANN / "compare"
ANN.mkdir(parents=True, exist_ok=True)
if MAKE_SIDE_BY_SIDE:
    CMP.mkdir(parents=True, exist_ok=True)

# BGR — OpenCV order
C_OURS = (58, 178, 27)     # green
C_GEN = (30, 138, 224)     # orange
C_FAL = (190, 124, 195)    # purple
C_BAD = (40, 40, 200)      # red, for an unusable read

A2D = {"O": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}
D2A = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "4": "A"}
PLATE_RE = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$")


def normalise(text):
    s = re.sub(r"[^A-Z0-9]", "",
               (text or "").upper().replace("|", "1").replace("!", "1"))
    if not s or len(s) < 8 or len(s) > 10:
        return s, False
    o, n = list(s), len(s)
    for i in range(n - 4, n):
        if o[i].isalpha():
            o[i] = A2D.get(o[i], o[i])
    for i in (0, 1):
        if o[i].isdigit():
            o[i] = D2A.get(o[i], o[i])
    for i in (2, 3):
        if i < n - 4 and o[i].isalpha():
            o[i] = A2D.get(o[i], o[i])
    for i in range(4, n - 4):
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
    if crop is None or crop.size == 0 or min(crop.shape[:2]) < 6:
        return "", 0.0
    if crop.shape[0] < 48:
        f = 48 / crop.shape[0]
        crop = cv2.resize(crop, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    t, s = ocr_crop(crop)
    if not t:
        t, s = ocr_crop(enhance(crop))
    return t, s


def as_score(v):
    """FastALPR returns per-character confidences; collapse to one number."""
    if v is None:
        return 0.0
    if isinstance(v, (list, tuple, np.ndarray)):
        vals = [float(x) for x in np.asarray(v).flatten() if x is not None]
        return float(np.mean(vals)) if vals else 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def read_yolo(model, cls, frame):
    boxes, confs, _ = run_yolo(model, frame, cls)
    if not boxes:
        return None
    b = int(np.argmax(confs))
    x1, y1, x2, y2 = map(int, boxes[b])
    crop = frame[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5]
    raw, sc = ocr_best(crop)
    plate, valid = normalise(raw)
    return {"box": (x1, y1, x2, y2), "plate": plate, "valid": valid,
            "det": float(confs[b]), "ocr": sc}


def read_fastalpr(frame):
    if not HAVE_FASTALPR:
        return None
    try:
        res = fastalpr.predict(frame)
    except Exception:
        return None
    if not res:
        return None
    r = res[0]
    bb = getattr(r, "detection", None)
    ocr = getattr(r, "ocr", None)
    txt = (getattr(ocr, "text", "") or "") if ocr is not None else ""
    plate, valid = normalise(txt)
    if bb is None:
        return None
    bx = bb.bounding_box
    return {"box": (int(bx.x1), int(bx.y1), int(bx.x2), int(bx.y2)),
            "plate": plate, "valid": valid,
            "det": as_score(getattr(bb, "confidence", None)),
            "ocr": as_score(getattr(ocr, "confidence", None)) if ocr else 0.0}


def upscale(frame, target=900):
    """These dataset crops are tiny; enlarge so text is readable."""
    h, w = frame.shape[:2]
    f = max(1.0, target / max(w, 1))
    if f > 1.0:
        frame = cv2.resize(frame, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    return frame, f


def label_above(img, box, text, colour, tier=0, tag=""):
    """
    Draw the box and put `text` on a filled bar directly above it.
    `tier` stacks multiple models' labels so they never overlap.
    """
    x1, y1, x2, y2 = box
    cv2.rectangle(img, (x1, y1), (x2, y2), colour, 3)

    shown = text if text else "no text"
    if tag:
        shown = f"{tag}  {shown}"

    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = max(0.7, min(1.5, (x2 - x1) / 320))
    thick = 2
    (tw, th), base = cv2.getTextSize(shown, font, scale, thick)

    pad = 8
    bar_h = th + base + pad
    by2 = y1 - tier * (bar_h + 5) - 4
    by1 = by2 - bar_h

    # if there is no room above, drop the bar below the box instead
    if by1 < 0:
        by1 = y2 + tier * (bar_h + 5) + 4
        by2 = by1 + bar_h

    bx1 = max(0, x1)
    bx2 = min(img.shape[1], bx1 + tw + pad * 2)

    cv2.rectangle(img, (bx1, by1), (bx2, by2), colour, -1)
    cv2.putText(img, shown, (bx1 + pad, by2 - base - pad // 2),
                font, scale, (255, 255, 255), thick, cv2.LINE_AA)
    return img


# ------------------------------------------------------------
n = min(HOW_MANY, len(clean))
print(f"Annotating {n} images ...\n")

summary = []

for i, (img_path, _) in enumerate(clean[:n], 1):
    raw = cv2.imread(str(img_path))
    if raw is None:
        continue

    frame, f = upscale(raw)

    ours = read_yolo(parkfnb_model, PARKFNB_PLATE_CLS, raw)
    gen = read_yolo(generic_model, GENERIC_PLATE_CLS, raw)
    fal = read_fastalpr(raw)

    def scaled(res):
        if not res:
            return None
        x1, y1, x2, y2 = res["box"]
        return (int(x1 * f), int(y1 * f), int(x2 * f), int(y2 * f))

    # --- all three on one image, labels stacked above the boxes ---
    combined = frame.copy()
    tier = 0
    for res, colour, tag in [(ours, C_OURS, "OURS"),
                             (gen, C_GEN, "GENERIC"),
                             (fal, C_FAL, "FASTALPR")]:
        if res:
            col = colour if res["valid"] else C_BAD
            label_above(combined, scaled(res), res["plate"], col, tier, tag)
            tier += 1

    out = ANN / f"{img_path.stem}.jpg"
    cv2.imwrite(str(out), combined, [cv2.IMWRITE_JPEG_QUALITY, 92])

    # --- ours vs generic, side by side ---
    if MAKE_SIDE_BY_SIDE and ours and gen:
        left, right = frame.copy(), frame.copy()
        label_above(left, scaled(ours), ours["plate"],
                    C_OURS if ours["valid"] else C_BAD, 0, "OURS")
        label_above(right, scaled(gen), gen["plate"],
                    C_GEN if gen["valid"] else C_BAD, 0, "GENERIC")

        gap = np.full((left.shape[0], 14, 3), 255, np.uint8)
        pair = np.hstack([left, gap, right])

        strip = np.full((58, pair.shape[1], 3), 255, np.uint8)
        cv2.putText(strip, f"OURS: {ours['plate'] or '-'}", (14, 39),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0,
                    C_OURS if ours["valid"] else C_BAD, 2, cv2.LINE_AA)
        cv2.putText(strip, f"GENERIC: {gen['plate'] or '-'}",
                    (left.shape[1] + 28, 39),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0,
                    C_GEN if gen["valid"] else C_BAD, 2, cv2.LINE_AA)
        pair = np.vstack([pair, strip])

        cv2.imwrite(str(CMP / f"{img_path.stem}.jpg"), pair,
                    [cv2.IMWRITE_JPEG_QUALITY, 92])

    summary.append({
        "image": img_path.name,
        "ParkFNB": (ours["plate"] if ours else "") or "(nothing)",
        "ParkFNB_ok": "YES" if (ours and ours["valid"]) else "no",
        "Generic": (gen["plate"] if gen else "") or "(nothing)",
        "Generic_ok": "YES" if (gen and gen["valid"]) else "no",
        "FastALPR": (fal["plate"] if fal else "") or "(nothing)",
        "FastALPR_ok": "YES" if (fal and fal["valid"]) else "no",
    })

    if i % 20 == 0:
        print(f"  {i}/{n}")

df = pd.DataFrame(summary)
df.to_csv(OUT_DIR / "annotated_reads.csv", index=False)

print("\n" + "=" * 92)
print("WHAT EACH MODEL READ")
print("=" * 92)
print(f"{'image':<24} {'OURS':<14} {'':<2} {'GENERIC':<13} {'':<2} {'FASTALPR':<13}")
print("-" * 92)
for r in summary[:40]:
    print(f"{r['image'][:23]:<24} "
          f"{r['ParkFNB'][:13]:<14} {'v' if r['ParkFNB_ok'] == 'YES' else 'x':<2} "
          f"{r['Generic'][:12]:<13} {'v' if r['Generic_ok'] == 'YES' else 'x':<2} "
          f"{r['FastALPR'][:12]:<13} {'v' if r['FastALPR_ok'] == 'YES' else 'x'}")
if len(summary) > 40:
    print(f"... {len(summary) - 40} more rows in annotated_reads.csv")

print("\n" + "-" * 92)
for name in ["ParkFNB", "Generic", "FastALPR"]:
    ok = (df[f"{name}_ok"] == "YES").sum()
    print(f"{name:<10} usable plate on {ok:>3}/{len(df)} images  ({ok / len(df) * 100:.1f}%)")

print(f"""
======================================================================
    {ANN}
        one image per file, all three models drawn on it
    {CMP}
        ours vs generic, side by side

Each picture carries the plate text above the box, so it explains
itself with no caption.
======================================================================
""")
