"""How the V2 controller PCB looks and how it sits in the Rev F box.   python board_view.py

Writes  out/PARKFNB_V2_PCB_how_it_looks.png  (A3-ish, 4 panes):
  1  top view rendered from the real Gerber files (what the fab makes)
  2  3-D view of the populated board (component heights from the footprint types)
  3  plan of the Rev F box with the PCB on the L2 deck, battery below, antenna end at the rear RF window
  4  side section of the L1 / L2 stack with the height budget
Runs the Rev F generator first (imports it) so the box outline and the battery position are the live ones.
"""
import os
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, Rectangle, Circle

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "revF"))
sys.path.insert(0, os.path.dirname(HERE))

from design import build_parts, BOARD_W, BOARD_H            # noqa
from placement import PLACEMENT                              # noqa
from render_gerber import composite                          # noqa
import generate_revF as R                                    # noqa  (box outline, battery position)
from cadlib import Model, render_iso                         # noqa

OUT = os.path.join(HERE, "out")
G = os.path.join(OUT, "gerbers", "PARKFNB_V2_CTRL-")
parts = build_parts(PLACEMENT)
P = {p.ref: p for p in parts}

# component height above the PCB top surface (mm), from the footprint type (typical parts - check the real ones)
H = {"R": 2.5, "C100N": 4.5, "C470": 17.0, "C220": 12.0, "D41": 3.5, "DO15": 5.5, "D35": 3.0, "LED3": 9.0, "TO92": 5.5,
     "BUZZER": 9.0, "TP": 1.0, "PTC": 5.5, "HDR2": 9.0, "HDR3": 9.0, "HDR4": 9.0, "HDR8": 9.0, "SCREW2": 10.5, "DIP14": 8.0, "MOUNT": 0.0}
COL = {"R": "#c9a36b", "C100N": "#d6c25a", "C470": "#2b3f66", "C220": "#2b3f66", "D41": "#222222", "DO15": "#222222", "D35": "#222222",
       "LED3": "#d33a3a", "TO92": "#222222", "BUZZER": "#303030", "TP": "#d4a017", "PTC": "#e0b000", "HDR2": "#e8e8e0",
       "HDR3": "#e8e8e0", "HDR4": "#e8e8e0", "HDR8": "#e8e8e0", "SCREW2": "#2f9a4a", "DIP14": "#1b1b1b"}
PCB_T = 1.6
BOARD_TOP = 31.0 + PCB_T          # z of the PCB top surface on the L2 deck (underside at 31, see Rev F)
TALLEST = 0.0


def pcb_model(mirror_y=False):
    M = Model()
    M.box("pcb", "#1f6b35", 0, BOARD_W, 0, BOARD_H, -PCB_T, 0)
    global TALLEST
    for pt in parts:
        if pt.fp == "MOUNT":
            continue
        x0, y0, x1, y1 = pt.bbox
        if pt.fp == "ESP32":
            # DevKit: black PCB on 8.5 mm headers, module + USB on top, antenna end overhangs the top edge
            M.box("esp32_pcb", "#151515", x0 + 3, x1 - 3, y0 + 0, y1 - 0 + 0, 8.5, 10.1)
            M.box("esp32_module", "#bcbcbc", x0 + 8, x1 - 8, y0 + 8, y1 - 18, 10.1, 13.0)
            M.box("esp32_usb", "#9a9a9a", x0 + 12, x0 + 24, y0 - 2, y0 + 6, 10.1, 13.5)
            TALLEST = max(TALLEST, 13.5)
            continue
        h = H.get(pt.fp, 3.0)
        TALLEST = max(TALLEST, h)
        M.box(pt.ref, COL.get(pt.fp, "#888888"), x0 + 0.3, x1 - 0.3, y0 + 0.3, y1 - 0.3, 0, h)
    return M


def main():
    fig = plt.figure(figsize=(20, 13))
    fig.suptitle("PARKFNB V2 controller PCB - how it looks and how it sits in the box (preliminary, hold)", fontsize=14, weight="bold")

    # ------------------------------------------------------------ 1 top view from Gerbers
    a1 = fig.add_axes([0.02, 0.50, 0.46, 0.43])
    a1.set_facecolor("#0b3d1a")
    composite(a1, [(G + "F_Cu.gbr", "#d94a4a", 1.0), (G + "F_Silkscreen.gbr", "#ffffff", 0.95), (G + "Edge_Cuts.gbr", "#ffe066", 1.0)],
              xlim=(-6, 106), ylim=(-6, 90), px_per_mm=12)
    a1.set_xticks([])
    a1.set_yticks([])
    a1.set_title("TOP VIEW from the Gerber files: 100 x 80 mm, 2 layers (red = top copper, white = silkscreen, GND plane on the bottom)", fontsize=10)
    a1.text(50, 85.5, "antenna end (ESP32 overhangs the top edge)", color="#6cf", ha="center", fontsize=8)
    a1.text(50, -3.5, "connector edge  (IBT-2, 3 x Hall, IMU, LEDs, tamper)", color="#ff9", ha="center", fontsize=8)

    # ------------------------------------------------------------ 2 3-D populated board
    a2 = fig.add_axes([0.50, 0.50, 0.48, 0.43])
    a2.set_xlim(0, 100)
    a2.set_ylim(0, 56)
    a2.set_aspect("equal")
    a2.axis("off")
    cam = np.array([0.55, -1.0, 0.85])
    cam = cam / np.linalg.norm(cam)
    fwd = -cam
    right = np.cross(fwd, [0, 0, 1.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    ctr = np.array([50.0, 40.0, 6.0])                       # board centre; shift the projection so it sits mid-pane
    sc = 0.5
    render_iso(a2, pcb_model(), 50 - sc * ctr @ right, 28 - sc * ctr @ up, sc, cam=tuple(cam))
    a2.set_title("3-D, populated (heights typical: 470 uF cap 17 mm, ESP32 on sockets 13.5 mm, screw terminal 10.5 mm)", fontsize=10)

    # ------------------------------------------------------------ 3 plan in the Rev F box
    a3 = fig.add_axes([0.02, 0.05, 0.40, 0.40])
    a3.set_aspect("equal")
    a3.set_xlim(-130, 130)
    a3.set_ylim(-150, 175)
    for pg in (R.main, R.ear):
        a3.add_patch(MPoly(list(pg.exterior.coords), fc="#dfe6ee", ec="#51627a", lw=1.3))
    a3.add_patch(MPoly(list(R.inner_all.exterior.coords), fc="none", ec="#51627a", lw=0.7, ls="--"))
    for b in R.brg_polys():
        a3.add_patch(MPoly(list(b.exterior.coords), fc="#2f7d53", alpha=0.35, ec="none"))
    a3.add_patch(Rectangle((-90, -12.5), 180, 25, fc="#d8d8d8", ec="none", alpha=0.8))
    bx = [c for c in R.comps if "battery" in c[0]][0]
    a3.add_patch(Rectangle((bx[1], bx[3]), bx[2] - bx[1], bx[4] - bx[3], fc="#e48bd0", alpha=0.55, ec="#a0307a", lw=1))
    a3.text((bx[1] + bx[2]) / 2, bx[3] + 6, "battery below", ha="center", fontsize=8, color="#7a1f5a")
    ox, oy = -50.0, 38.0                                   # PCB lower-left corner in box coordinates
    a3.add_patch(Rectangle((ox, oy), BOARD_W, BOARD_H, fc="#2f8a4a", alpha=0.45, ec="#1d6b35", lw=1.5))
    for pt in parts:
        if pt.fp == "MOUNT":
            a3.add_patch(Circle((ox + pt.x, oy + pt.y), 3.0, fc="#ffffff", ec="#444", lw=1))
            continue
        x0, y0, x1, y1 = pt.bbox
        if pt.ref.startswith(("J", "ESP", "BZ", "C1", "C2", "U2")) or pt.ref in ("D1", "F1"):
            a3.add_patch(Rectangle((ox + x0, oy + y0), x1 - x0, y1 - y0, fc="#f2f2f2" if pt.ref.startswith("J") else "#666",
                                   ec="#333", lw=0.4, alpha=0.9))
        if pt.ref.startswith("J"):
            a3.text(ox + (x0 + x1) / 2, oy + (y0 + y1) / 2 - 3.5 if pt.ref in ("J2", "J4", "J5", "J6", "J7", "J8") else oy + y1 + 3,
                    pt.ref, fontsize=6.5, ha="center", weight="bold")
    a3.annotate("antenna -> rear wall RF window", xy=(0, 150), xytext=(0, 163), ha="center", fontsize=9, color="#1f5fae",
                arrowprops=dict(arrowstyle="->", color="#1f5fae"))
    a3.add_patch(Rectangle((-35, 152), 70, 6, fc="#cfe8ff", ec="#1f5fae", lw=1))
    a3.annotate("cables to IBT-2, Hall x3, IMU, LEDs leave this edge", xy=(0, oy - 1), xytext=(0, 12), ha="center", fontsize=8.5,
                arrowprops=dict(arrowstyle="->"))
    a3.text(0, -130, "FRONT: motor + IBT-2 side", ha="center", fontsize=8, color="#555")
    a3.set_title("PLAN inside the Rev F box: PCB on the L2 deck (4 x M3 posts at the white circles), battery under it", fontsize=10)
    a3.set_xticks([])
    a3.set_yticks([])

    # ------------------------------------------------------------ 4 stack section
    a4 = fig.add_axes([0.46, 0.06, 0.52, 0.36])
    a4.set_xlim(-60, 175)
    a4.set_ylim(-4, 92)
    a4.set_aspect("equal")
    a4.add_patch(Rectangle((-60, -6), 235, 6, fc="#bbbbbb", ec="k", lw=0.5))
    a4.add_patch(Rectangle((-55, 0), 230, 80, fc="#dfe6ee", ec="#51627a", lw=0.8, alpha=0.6))
    a4.add_patch(Rectangle((-55, 80 - R.p["skin"]), 230, R.p["skin"], fc="#8fa3b8", ec="k", lw=0.5))
    a4.text(60, 85, "6 mm top skin (wheel load stops here)", fontsize=8, ha="center")
    # battery, posts, PCB
    a4.add_patch(Rectangle((40, 3), 76, 21, fc="#e48bd0", ec="#a0307a", lw=1))
    a4.text(78, 12, "battery holder 21", fontsize=8, ha="center")
    for y_ in (42, 114):
        a4.add_patch(Rectangle((y_ - 2.5, 3), 5, 28, fc="#b5b5b5", ec="#444", lw=0.6))
    a4.add_patch(Rectangle((38, 31), 80, PCB_T, fc="#1f6b35", ec="k", lw=0.6))
    for pt in parts:
        if pt.fp in ("C470", "ESP32", "SCREW2"):
            x0, y0, x1, y1 = pt.bbox
            h = 13.5 if pt.fp == "ESP32" else H[pt.fp]
            a4.add_patch(Rectangle((38 + y0, BOARD_TOP), y1 - y0, h, fc=COL.get(pt.fp, "#222"), alpha=0.75, ec="k", lw=0.4))
    a4.annotate("", xy=(124, 24), xytext=(124, 31), arrowprops=dict(arrowstyle="<->"))
    a4.text(127, 27, "7 mm: battery top to PCB underside\n(solder leads stick out 2.5)", fontsize=7.5, va="center")
    a4.annotate("", xy=(135, BOARD_TOP), xytext=(135, BOARD_TOP + TALLEST), arrowprops=dict(arrowstyle="<->"))
    a4.text(138, BOARD_TOP + TALLEST / 2, f"tallest part {TALLEST:.1f}", fontsize=7.5, va="center")
    a4.annotate("", xy=(150, BOARD_TOP + TALLEST), xytext=(150, 80 - R.p["skin"]), arrowprops=dict(arrowstyle="<->"))
    a4.text(153, (BOARD_TOP + TALLEST + 80 - R.p["skin"]) / 2, f"{80 - R.p['skin'] - BOARD_TOP - TALLEST:.0f} mm\nto the ribs", fontsize=7.5, va="center")
    a4.text(38, -2.5, "front (y 38) -> rear (y 118)", fontsize=7.5)
    a4.set_title("SIDE SECTION through x = 0: battery on the floor (L1), PCB on 28 mm posts (L2), ribs + skin above (L3)", fontsize=10)
    a4.set_xticks([])
    a4.set_yticks([])
    path = os.path.join(OUT, "PARKFNB_V2_PCB_how_it_looks.png")
    fig.savefig(path, dpi=95, facecolor="white")
    plt.close(fig)
    print(f"tallest part {TALLEST:.1f} mm -> top at z {BOARD_TOP + TALLEST:.1f}, ceiling under the ribs {80 - R.p['skin'] - 8:.0f}")
    print("wrote", path)


if __name__ == "__main__":
    main()
