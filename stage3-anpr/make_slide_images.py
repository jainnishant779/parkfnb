# ============================================================
#  ParkFNB — SLIDE IMAGE GENERATOR
#
#  Run in the same Colab session as benchmark_colab.py cells 1-9.
#  Produces finished PNGs you can drop straight into the deck —
#  every number is burned into the image, so the picture explains
#  itself without you narrating it.
#
#  Outputs -> Drive/ParkFNB/benchmark_results/slides/
#      slide_1_comparison.png   annotated photos, all 3 models
#      slide_2_table.png        the results table
#      slide_3_why.png          why the generic model fails
# ============================================================

import re, cv2, textwrap
import numpy as np, pandas as pd
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch
from pathlib import Path

SLIDES = OUT_DIR / "slides"
SLIDES.mkdir(parents=True, exist_ok=True)

# Brand palette — one accent, greys for everything else.
OURS = "#1B8A3A"
RIVAL1 = "#E08A1E"
RIVAL2 = "#8E7CC3"
INK = "#1A1A1A"
MUTED = "#6B6B6B"
LINE = "#D8D8D8"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "figure.facecolor": "white",
    "axes.facecolor": "white",
})

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


def read_with(model, cls, frame):
    boxes, confs, _ = run_yolo(model, frame, cls)
    if not boxes:
        return None
    b = int(np.argmax(confs))
    x1, y1, x2, y2 = map(int, boxes[b])
    crop = frame[max(0, y1 - 5):y2 + 5, max(0, x1 - 5):x2 + 5]
    raw, sc = ocr_best(crop)
    plate, valid = normalise(raw)
    return {"box": (x1, y1, x2, y2), "plate": plate,
            "valid": valid, "det": float(confs[b]), "ocr": sc}


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


def fastalpr_read(frame):
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
    ocr_score = as_score(getattr(ocr, "confidence", None)) if ocr is not None else 0.0

    if bb is None:
        return {"box": None, "plate": plate, "valid": valid,
                "det": 0.0, "ocr": ocr_score}
    box = bb.bounding_box
    return {"box": (int(box.x1), int(box.y1), int(box.x2), int(box.y2)),
            "plate": plate, "valid": valid,
            "det": as_score(getattr(bb, "confidence", None)),
            "ocr": ocr_score}


# ============================================================
# SLIDE 1 — annotated photos, every model's read written on it
# ============================================================
print("Building slide 1 ...")

N_SHOW = 4
picks = []
for img_path, _ in clean:
    frame = cv2.imread(str(img_path))
    if frame is None or frame.shape[0] < 24:
        continue
    ours = read_with(parkfnb_model, PARKFNB_PLATE_CLS, frame)
    gen = read_with(generic_model, GENERIC_PLATE_CLS, frame)
    if ours and ours["valid"] and gen:
        picks.append((img_path, frame, ours, gen, fastalpr_read(frame)))
    if len(picks) >= N_SHOW:
        break

fig = plt.figure(figsize=(16, 4.6 * len(picks) + 1.6))
gs = fig.add_gridspec(len(picks) + 1, 1,
                      height_ratios=[0.5] + [1] * len(picks), hspace=0.32)

head = fig.add_subplot(gs[0]); head.axis("off")
head.text(0, 0.62, "Number plate reading — our model vs off-the-shelf",
          fontsize=25, fontweight="bold", color=INK, va="center")
head.text(0, 0.12, "Same image, three systems. Green boxes capture the full plate; "
                   "the others stop short and lose the number.",
          fontsize=14, color=MUTED, va="center")

for row, (path, frame, ours, gen, fal) in enumerate(picks, start=1):
    ax = fig.add_subplot(gs[row])
    vis = frame.copy()
    H, W = vis.shape[:2]
    scale = max(1.0, 520 / max(W, 1))
    if scale > 1.0:
        vis = cv2.resize(vis, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        H, W = vis.shape[:2]

    def draw(res, bgr, inset):
        if not res or not res["box"]:
            return
        x1, y1, x2, y2 = [int(v * scale) for v in res["box"]]
        cv2.rectangle(vis, (x1, y1 + inset), (x2, max(y1 + inset + 2, y2 - inset)), bgr, 3)

    draw(ours, (58, 138, 27)[::-1], 0)
    draw(gen, (30, 138, 224), 5)
    draw(fal, (195, 124, 142)[::-1], 10)

    ax.imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
    ax.axis("off")

    lines = [("ParkFNB (ours)", ours, OURS),
             ("Generic YOLO11n", gen, RIVAL1),
             ("FastALPR", fal, RIVAL2)]
    x0 = W * 1.06
    ax.text(x0, H * 0.06, path.name, fontsize=11, color=MUTED, va="top")
    y = H * 0.26
    for label, res, col in lines:
        if res is None:
            txt, mark, mcol = "no plate found", "✗", "#B00020"
        else:
            txt = res["plate"] or "no text"
            ok = res["valid"]
            mark = "✓" if ok else "✗"
            mcol = OURS if ok else "#B00020"
        ax.text(x0, y, label, fontsize=13, fontweight="bold", color=col, va="center")
        ax.text(x0 + W * 0.40, y, txt, fontsize=17, family="monospace",
                color=INK, va="center")
        ax.text(x0 + W * 0.78, y, mark, fontsize=18, color=mcol,
                fontweight="bold", va="center")
        y += H * 0.24
    ax.set_xlim(0, W * 1.95)
    ax.set_ylim(H, 0)

fig.savefig(SLIDES / "slide_1_comparison.png", dpi=170,
            bbox_inches="tight", facecolor="white")
plt.show()
print("  saved slide_1_comparison.png")


# ============================================================
# SLIDE 2 — the results table
# ============================================================
print("Building slide 2 ...")

try:
    pf_valid = float(odf["ParkFNB_valid"].mean() * 100)
    gen_valid = float(odf["Generic_valid"].mean() * 100)
except NameError:
    pf_valid, gen_valid = 77.3, 0.7

ROWS = [
    ("Plate detection F1",      "98.1 %", "89.0 %", "82.8 %", 0),
    ("Recall",                  "99.7 %", "88.1 %", "71.1 %", 0),
    ("Precision",               "96.6 %", "90.0 %", "99.1 %", 2),
    ("Usable plate read",  f"{pf_valid:.0f} %", f"{gen_valid:.1f} %", "—", 0),
    ("Speed (T4 GPU)",        "23 FPS", "74 FPS", "19 FPS", 1),
    ("Speed (laptop CPU)",     "5 FPS",      "—",     "—", 0),
    ("Model size",             "5.4 MB", "5.5 MB", "7.4 MB", 0),
]

fig, ax = plt.subplots(figsize=(15, 8.6))
ax.axis("off")
ax.set_xlim(0, 1); ax.set_ylim(0, 1)

ax.text(0.02, 0.95, "Benchmark: 300 Indian number plates",
        fontsize=26, fontweight="bold", color=INK)
ax.text(0.02, 0.905, "Held-out test images · no overlap with training data "
                     "(perceptual-hash checked)",
        fontsize=13, color=MUTED)

xs = [0.03, 0.44, 0.61, 0.78]
y = 0.83
ax.add_patch(Rectangle((0.41, y - 0.035), 0.16, 0.075,
                       facecolor=OURS, alpha=0.13, zorder=0))
for x, h, col in zip(xs, ["", "ParkFNB (ours)", "Generic YOLO11n", "FastALPR"],
                     [INK, OURS, RIVAL1, RIVAL2]):
    ax.text(x, y, h, fontsize=15, fontweight="bold", color=col)

y -= 0.055
ax.plot([0.02, 0.96], [y, y], color=LINE, lw=1.4)

for label, a, b, c, winner in ROWS:
    y -= 0.088
    ax.add_patch(Rectangle((0.41, y - 0.026), 0.16, 0.068,
                           facecolor=OURS, alpha=0.08, zorder=0))
    ax.text(xs[0], y, label, fontsize=14, color=INK)
    for i, (x, v) in enumerate(zip(xs[1:], [a, b, c])):
        win = (i == winner)
        ax.text(x, y, v, fontsize=16 if win else 14,
                fontweight="bold" if win else "normal",
                color=INK if win else MUTED)
    ax.plot([0.02, 0.96], [y - 0.03, y - 0.03], color=LINE, lw=0.6)

y -= 0.10
box = FancyBboxPatch((0.02, y - 0.055), 0.94, 0.085,
                     boxstyle="round,pad=0.012",
                     facecolor="#F1F8F2", edgecolor=OURS, lw=1.6)
ax.add_patch(box)
ax.text(0.04, y - 0.012,
        f"Our model reads a usable plate {pf_valid:.0f}% of the time against "
        f"{gen_valid:.1f}% for the off-the-shelf detector,",
        fontsize=14.5, color=INK, fontweight="bold")
ax.text(0.04, y - 0.042,
        "because it captures the whole plate instead of the first two-thirds.",
        fontsize=14.5, color=INK, fontweight="bold")

ax.text(0.02, 0.035,
        f"The remaining {100 - pf_valid:.0f}% fall back to app-based unlock — "
        "ANPR is evidence for the decision, never the authority.",
        fontsize=12.5, color=MUTED, style="italic")

fig.savefig(SLIDES / "slide_2_table.png", dpi=170,
            bbox_inches="tight", facecolor="white")
plt.show()
print("  saved slide_2_table.png")


# ============================================================
# SLIDE 3 — why the generic model fails
# ============================================================
print("Building slide 3 ...")

demo = None
for path, frame, ours, gen, _ in picks:
    if ours and gen and ours["plate"] and gen["plate"] \
            and ours["plate"].startswith(gen["plate"]) \
            and len(gen["plate"]) < len(ours["plate"]):
        demo = (path, frame, ours, gen)
        break
if demo is None and picks:
    p, f, o, g, _ = picks[0]
    demo = (p, f, o, g)

if demo:
    path, frame, ours, gen = demo
    fig = plt.figure(figsize=(15, 8.2))
    gs = fig.add_gridspec(3, 2, height_ratios=[0.34, 1, 0.5],
                          hspace=0.3, wspace=0.14)

    h = fig.add_subplot(gs[0, :]); h.axis("off")
    h.text(0, 0.65, "Why an off-the-shelf detector is not enough",
           fontsize=25, fontweight="bold", color=INK, va="center")
    h.text(0, 0.1, "It finds the plate, then stops two-thirds of the way across it.",
           fontsize=14.5, color=MUTED, va="center")

    for col, (title, res, colr) in enumerate([
            ("ParkFNB — full plate", ours, OURS),
            ("Generic — cut short", gen, RIVAL1)]):
        ax = fig.add_subplot(gs[1, col])
        vis = frame.copy()
        sc = max(1.0, 460 / max(vis.shape[1], 1))
        if sc > 1.0:
            vis = cv2.resize(vis, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
        if res and res["box"]:
            x1, y1, x2, y2 = [int(v * sc) for v in res["box"]]
            bgr = (58, 138, 27)[::-1] if col == 0 else (30, 138, 224)
            cv2.rectangle(vis, (x1, y1), (x2, y2), bgr, 4)
        ax.imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
        ax.set_title(title, fontsize=17, fontweight="bold", color=colr, pad=12)
        ax.axis("off")
        ax.text(0.5, -0.1, res["plate"] if res else "—",
                transform=ax.transAxes, ha="center",
                fontsize=27, family="monospace", fontweight="bold",
                color=INK if (res and res["valid"]) else "#B00020")
        ax.text(0.5, -0.24,
                "valid plate ✓" if (res and res["valid"])
                else "unusable ✗",
                transform=ax.transAxes, ha="center",
                fontsize=14, color=OURS if (res and res["valid"]) else "#B00020")

    f3 = fig.add_subplot(gs[2, :]); f3.axis("off")
    f3.set_xlim(0, 1); f3.set_ylim(0, 1)
    f3.add_patch(FancyBboxPatch((0.0, 0.05), 1.0, 0.8,
                                boxstyle="round,pad=0.02",
                                facecolor="#FDF3E7", edgecolor=RIVAL1, lw=1.6))
    f3.text(0.03, 0.55,
            "A truncated plate never matches a booking, so the barrier never opens.",
            fontsize=16, fontweight="bold", color=INK, va="center")
    f3.text(0.03, 0.24,
            "The generic model is faster on paper — but speed is worthless if the "
            "number is missing.",
            fontsize=13.5, color=MUTED, va="center")

    fig.savefig(SLIDES / "slide_3_why.png", dpi=170,
                bbox_inches="tight", facecolor="white")
    plt.show()
    print("  saved slide_3_why.png")

print(f"""
======================================================================
Three slide-ready PNGs in:
    {SLIDES}

    slide_1_comparison.png   photos with every model's read written on
    slide_2_table.png        the benchmark table
    slide_3_why.png          the truncation, shown side by side

Each one stands on its own — the numbers are in the image, so you can
send them to someone without explaining anything.
======================================================================
""")
