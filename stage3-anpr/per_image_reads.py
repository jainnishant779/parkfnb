# ============================================================
#  ParkFNB — PER-IMAGE READS
#
#  Run in the same Colab session as benchmark_colab.py cells 1-9.
#
#  Shows, for every test image, exactly what each model read:
#
#     image              ParkFNB       Generic     FastALPR
#     License (593)      TN19B3753  ✓  TN19B3   ✗  TN19B    ✗
#     License (1592)     MH04DB6948 ✓  MH04DB   ✗  MH04DB69 ✗
#
#  Outputs -> Drive/ParkFNB/benchmark_results/
#      per_image_reads.csv      every image, every model
#      per_image_reads.xlsx     same, colour-coded, openable in Excel
#      reads_grid.png           image thumbnails + the three reads
# ============================================================

import re, cv2, numpy as np, pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# ---------- how many images to process ----------
HOW_MANY = 200          # set to len(clean) for all of them
SHOW_IN_GRID = 12       # thumbnails in the PNG

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
    """FastALPR hands back per-character confidences; collapse to one number."""
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
        return {"plate": "", "valid": False, "det": 0.0, "ocr": 0.0, "box": None}
    b = int(np.argmax(confs))
    x1, y1, x2, y2 = map(int, boxes[b])
    crop = frame[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5]
    raw, sc = ocr_best(crop)
    plate, valid = normalise(raw)
    return {"plate": plate, "valid": valid, "det": float(confs[b]),
            "ocr": round(sc, 3), "box": (x1, y1, x2, y2)}


def read_fastalpr(frame):
    if not HAVE_FASTALPR:
        return {"plate": "", "valid": False, "det": 0.0, "ocr": 0.0, "box": None}
    try:
        res = fastalpr.predict(frame)
    except Exception:
        return {"plate": "", "valid": False, "det": 0.0, "ocr": 0.0, "box": None}
    if not res:
        return {"plate": "", "valid": False, "det": 0.0, "ocr": 0.0, "box": None}
    r = res[0]
    ocr = getattr(r, "ocr", None)
    bb = getattr(r, "detection", None)
    txt = (getattr(ocr, "text", "") or "") if ocr is not None else ""
    plate, valid = normalise(txt)
    box = None
    if bb is not None:
        bx = bb.bounding_box
        box = (int(bx.x1), int(bx.y1), int(bx.x2), int(bx.y2))
    return {"plate": plate, "valid": valid,
            "det": round(as_score(getattr(bb, "confidence", None)) if bb else 0.0, 3),
            "ocr": round(as_score(getattr(ocr, "confidence", None)) if ocr else 0.0, 3),
            "box": box}


# ---------- run every model on every image ----------
n = min(HOW_MANY, len(clean))
print(f"Reading {n} images with all three models ...\n")

rows, keep = [], []
for i, (img_path, _) in enumerate(clean[:n], 1):
    frame = cv2.imread(str(img_path))
    if frame is None:
        continue

    ours = read_yolo(parkfnb_model, PARKFNB_PLATE_CLS, frame)
    gen = read_yolo(generic_model, GENERIC_PLATE_CLS, frame)
    fal = read_fastalpr(frame)

    rows.append({
        "image": img_path.name,
        "ParkFNB": ours["plate"] or "(nothing)",
        "ParkFNB_ok": "YES" if ours["valid"] else "no",
        "Generic": gen["plate"] or "(nothing)",
        "Generic_ok": "YES" if gen["valid"] else "no",
        "FastALPR": fal["plate"] or "(nothing)",
        "FastALPR_ok": "YES" if fal["valid"] else "no",
        "agree_all": (ours["plate"] != "" and
                      ours["plate"] == gen["plate"] == fal["plate"]),
        "ParkFNB_chars": len(ours["plate"]),
        "Generic_chars": len(gen["plate"]),
        "FastALPR_chars": len(fal["plate"]),
        "ParkFNB_det": round(ours["det"], 3),
        "Generic_det": round(gen["det"], 3),
        "ParkFNB_ocr": ours["ocr"],
        "Generic_ocr": gen["ocr"],
    })
    keep.append((img_path, frame, ours, gen, fal))

    if i % 25 == 0:
        print(f"  {i}/{n}")

df = pd.DataFrame(rows)
df.to_csv(OUT_DIR / "per_image_reads.csv", index=False)

# ---------- printed table ----------
print("\n" + "=" * 96)
print("WHAT EACH MODEL READ, IMAGE BY IMAGE")
print("=" * 96)
print(f"{'image':<22} {'ParkFNB (ours)':<15} {'':<2} "
      f"{'Generic':<14} {'':<2} {'FastALPR':<14}")
print("-" * 96)

for r in rows[:60]:
    print(f"{r['image'][:21]:<22} "
          f"{r['ParkFNB'][:14]:<15} {'✓' if r['ParkFNB_ok'] == 'YES' else '✗':<2} "
          f"{r['Generic'][:13]:<14} {'✓' if r['Generic_ok'] == 'YES' else '✗':<2} "
          f"{r['FastALPR'][:13]:<14} {'✓' if r['FastALPR_ok'] == 'YES' else '✗'}")

if len(rows) > 60:
    print(f"... and {len(rows) - 60} more rows in per_image_reads.csv")

# ---------- totals ----------
print("\n" + "=" * 96)
print("TOTALS")
print("=" * 96)
for name in ["ParkFNB", "Generic", "FastALPR"]:
    ok = (df[f"{name}_ok"] == "YES").sum()
    got = (df[name] != "(nothing)").sum()
    chars = df.loc[df[f"{name}_chars"] > 0, f"{name}_chars"].mean()
    print(f"{name:<10} found a plate: {got:>3}/{len(df)}   "
          f"valid format: {ok:>3}/{len(df)} ({ok / len(df) * 100:5.1f}%)   "
          f"avg chars: {chars:.1f}" if got else f"{name}: nothing found")

# ---------- Excel with colour ----------
try:
    xlsx = OUT_DIR / "per_image_reads.xlsx"
    cols = ["image", "ParkFNB", "ParkFNB_ok", "Generic", "Generic_ok",
            "FastALPR", "FastALPR_ok", "ParkFNB_chars", "Generic_chars",
            "FastALPR_chars"]
    with pd.ExcelWriter(xlsx, engine="xlsxwriter") as xw:
        df[cols].to_excel(xw, sheet_name="reads", index=False)
        wb, ws = xw.book, xw.sheets["reads"]
        good = wb.add_format({"bg_color": "#D8F0DC", "font_color": "#14532D"})
        bad = wb.add_format({"bg_color": "#FBE0E0", "font_color": "#7F1D1D"})
        mono = wb.add_format({"font_name": "Consolas"})
        ws.set_column("A:A", 24)
        ws.set_column("B:B", 16, mono)
        ws.set_column("D:D", 16, mono)
        ws.set_column("F:F", 16, mono)
        ws.set_column("C:C", 11); ws.set_column("E:E", 11); ws.set_column("G:G", 11)
        last = len(df) + 1
        for col in ("C", "E", "G"):
            ws.conditional_format(f"{col}2:{col}{last}", {
                "type": "cell", "criteria": "==", "value": '"YES"', "format": good})
            ws.conditional_format(f"{col}2:{col}{last}", {
                "type": "cell", "criteria": "==", "value": '"no"', "format": bad})
        ws.freeze_panes(1, 1)
    print(f"\nSaved {xlsx.name} — green means a usable plate, red means not")
except Exception as e:
    print(f"\n(Excel export skipped: {e})")

# ---------- visual grid ----------
print("Building reads_grid.png ...")

show = keep[:SHOW_IN_GRID]
ncol = 2
nrow = (len(show) + ncol - 1) // ncol
fig, axes = plt.subplots(nrow, ncol, figsize=(17, 2.5 * nrow))
axes = np.atleast_1d(axes).flatten()

OURS_C, GEN_C, FAL_C = "#1B8A3A", "#E08A1E", "#8E7CC3"

for ax, (path, frame, ours, gen, fal) in zip(axes, show):
    vis = frame.copy()
    sc = max(1.0, 300 / max(vis.shape[1], 1))
    if sc > 1.0:
        vis = cv2.resize(vis, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)

    for res, bgr, inset in [(ours, (27, 138, 58)[::-1], 0),
                            (gen, (30, 138, 224), 4),
                            (fal, (195, 124, 142)[::-1], 8)]:
        if res["box"]:
            x1, y1, x2, y2 = [int(v * sc) for v in res["box"]]
            cv2.rectangle(vis, (x1, y1 + inset),
                          (x2, max(y1 + inset + 2, y2 - inset)), bgr, 2)

    H, W = vis.shape[:2]
    ax.imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
    ax.axis("off")
    ax.set_xlim(0, W * 2.5)
    ax.set_ylim(H, 0)

    ax.text(W * 1.08, H * 0.1, path.name[:24], fontsize=9, color="#6B6B6B", va="top")
    y = H * 0.36
    for label, res, col in [("ParkFNB", ours, OURS_C),
                            ("Generic", gen, GEN_C),
                            ("FastALPR", fal, FAL_C)]:
        ax.text(W * 1.08, y, label, fontsize=10, fontweight="bold", color=col, va="center")
        ax.text(W * 1.55, y, res["plate"] or "—", fontsize=13,
                family="monospace", color="#1A1A1A", va="center")
        ax.text(W * 2.28, y, "✓" if res["valid"] else "✗", fontsize=13,
                fontweight="bold", va="center",
                color=OURS_C if res["valid"] else "#B00020")
        y += H * 0.26

for ax in axes[len(show):]:
    ax.axis("off")

fig.suptitle("What each model read, image by image", fontsize=19,
             fontweight="bold", y=0.997)
plt.tight_layout(rect=[0, 0, 1, 0.985])
fig.savefig(OUT_DIR / "reads_grid.png", dpi=160,
            bbox_inches="tight", facecolor="white")
plt.show()

print(f"""
======================================================================
Saved to {OUT_DIR}

    per_image_reads.csv    every image, every model's read
    per_image_reads.xlsx   the same, colour-coded for Excel
    reads_grid.png         thumbnails with all three reads written on

To inspect where our model disagreed with the others:
    df[df.ParkFNB != df.Generic][['image','ParkFNB','Generic','FastALPR']]

To see only the images our model got wrong:
    df[df.ParkFNB_ok == 'no'][['image','ParkFNB','Generic','FastALPR']]
======================================================================
""")
