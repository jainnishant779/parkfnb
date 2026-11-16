"""PARKFNB V2 - CONCEPT VISUAL (not a drawing set): one steel box over the whole mechanism, tyre folds around it.

Idea (user): 0-180 deg motion.  One rectangular steel box covers motor, bearings, chain, sprocket (and electronics).
The tyre arch folds into the semicircular space around the box: at 0 deg it lies in FRONT of the shaft, at 180 deg
BEHIND it, at 90 deg it stands up.  This script draws that idea and CHECKS numbers (does the V1 motor fit inside
the tyre's semicircle?  does the tyre sweep clear the box?) so we both see the same thing before the real drawings.

Run:  python concept_visual.py      ->  concept_visual.png + printed clearance table
Coordinates: mm, x along the shaft, y front(-)/rear(+), z up, z=0 top of the deck.  Values are the Rev E estimates
(E = estimated from photos, verify on V1).
"""
import math
import os
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, Rectangle, Circle
from shapely.geometry import Polygon, Point, box as sbox
from shapely import affinity

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import cadlib
from cadlib import Model, render_iso

# ---- V1 mechanism (kept) --------------------------------------------------------------------------------------
ZS = 36.5                     # shaft axis above deck (UCP205 centre height)
RO, RI, LEG, TW = 203.0, 101.5, 51.0, 100.0        # tyre: outer R, inner R, leg length, thickness (E)
BRG_X, BRG_A, BRG_L = 65.0, 38.0, 140.0
MOTOR_Y, MOTOR_Z = -100.0, 25.5                     # V1 motor centre (E)
GB_D, CAN_D, MOTOR_LEN, MOTOR_OUT = 45.0, 36.0, 77.5, 26.0
OD_B = 93.0                   # big sprocket OD (44 T #25, E)
SPK_X = 0.0                   # chain plane (x) - option below moves it
REST = 10.0                   # tyre rest angle (E - measure on V1)
GROUND, PLATE = -31.0, -6.0
MARGIN = 8.0                  # clearance box <-> tyre
cadlib.ZS = ZS


def tyre_u(sign):
    """Plan outline of the tyre lying toward sign*y (U shape: legs + semicircle), polygon."""
    n = 60
    out = [(RO, 0), (RO, LEG)] + [(RO * math.cos(t), LEG + RO * math.sin(t)) for t in np.linspace(0, math.pi, n)] + [(-RO, LEG), (-RO, 0)]
    inn = [(-RI, 0), (-RI, LEG)] + [(RI * math.cos(t), LEG + RI * math.sin(t)) for t in np.linspace(math.pi, 0, n)] + [(RI, LEG), (RI, 0)]
    return Polygon([(a, sign * b) for a, b in out + inn]).buffer(0)


TOP = 91.0                    # box top above the deck: big sprocket top (83) + 5 mm plate + 3 mm gap
SWEEP_MARGIN = 8.0            # radial clearance box corner <-> tyre inner edge while the tyre swings


def y_lim(x):
    """Longest the box may be at lateral position x: the box top corner must stay SWEEP_MARGIN inside the tyre's inner edge,
    measured as radius from the shaft axis (the tyre inner edge is at LEG + sqrt(RI^2 - x^2) from the axis)."""
    if abs(x) >= RI:
        return 0.0
    d_in = LEG + math.sqrt(RI ** 2 - x ** 2) - SWEEP_MARGIN
    zr = TOP - ZS
    return math.sqrt(max(d_in ** 2 - zr ** 2, 0.0))


def box_plan(min_len=30.0):
    xs = [x for x in np.linspace(0, RI, 400) if y_lim(x) >= min_len]
    xw = max(xs)
    grid = np.linspace(-xw, xw, 120)
    rear = [(x, y_lim(x)) for x in grid[::-1]]
    front = [(x, -y_lim(x)) for x in grid]
    return Polygon(rear + front)


def motor_poly(spk_x, cy):
    xf = spk_x - MOTOR_OUT
    return sbox(xf - MOTOR_LEN, cy - GB_D / 2, xf, cy + GB_D / 2)


def analyse(spk_x, cy, label):
    box_poly = box_plan()
    m = motor_poly(spk_x, cy)
    out = m.difference(box_poly)
    over = max([Point(c).distance(box_poly) for c in m.exterior.coords]) if not out.is_empty else 0.0
    tyre_gap = min(box_poly.distance(tyre_u(-1)), box_poly.distance(tyre_u(1)))
    brg = [sbox(sx * BRG_X - BRG_A / 2, -BRG_L / 2, sx * BRG_X + BRG_A / 2, BRG_L / 2) for sx in (-1, 1)]
    brg_out = max(b.difference(box_poly).area for b in brg)
    return dict(label=label, box=box_poly, motor=m, tyre_gap=tyre_gap, overflow=over, out=out, spk_x=spk_x, cy=cy,
                brg_out=brg_out, xw=box_poly.bounds[2])

def vprism(M, name, color, poly, z0, z1, alpha=1.0):
    pts = list(poly.exterior.coords)[:-1]
    if Polygon(pts).exterior.is_ccw is False:
        pts = pts[::-1]
    n = len(pts)
    v = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    f = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    M.add(name, color, v, f, alpha)


def chain_poly(c1, r1, c2, r2, n=30):
    (x1, y1), (x2, y2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    base = math.atan2(y2 - y1, x2 - x1)
    beta = math.acos((r1 - r2) / d)
    pts = [(x1 + r1 * math.cos(t), y1 + r1 * math.sin(t)) for t in np.linspace(base + beta, base + 2 * math.pi - beta, n)]
    pts += [(x2 + r2 * math.cos(t), y2 + r2 * math.sin(t)) for t in np.linspace(base - beta, base + beta, n // 2)]
    pts.append(pts[0])
    return pts


def build(theta, case, box_alpha=1.0):
    spk, cy = case["spk_x"], case["cy"]
    M = Model()
    xs = np.linspace(-250, 250, 9)
    ys = np.linspace(-300, 300, 9)
    for a, b in zip(xs[:-1], xs[1:]):
        for c, d in zip(ys[:-1], ys[1:]):
            M.box("deck", "#9aa0a6", a, b, c, d, PLATE, 0)
    M.box("frame", "#6d7177", -250, 250, -300, -275, GROUND, PLATE)
    M.box("frame", "#6d7177", -250, 250, 275, 300, GROUND, PLATE)
    vprism(M, "steel_box", "#8fa3b8", case["box"], 0, TOP, box_alpha)
    for sx in (-1, 1):
        cx = sx * BRG_X
        M.box("bearing", "#2f7d53", cx - BRG_A / 2, cx + BRG_A / 2, -BRG_L / 2, BRG_L / 2, 0, 15)
        M.cyl("bearing", "#2f7d53", (0, ZS), 34.5, cx - 17, cx + 17, "x")
    M.cyl("shaft", "#d0d0d0", (0, ZS), 12.5, -203, 203, "x")
    M.cyl("sprocket", "#8f8f8f", (0, ZS), OD_B / 2, spk - 1.5, spk + 1.5, "x", n=40)
    xf = spk - MOTOR_OUT
    M.cyl("gearbox", "#bfc3c7", (cy, MOTOR_Z), GB_D / 2, xf - 33, xf, "x")
    M.cyl("motor", "#c9ccd0", (cy, MOTOR_Z), CAN_D / 2, xf - 77.5, xf - 33, "x")
    path = chain_poly((0, ZS), 44.5, (cy, MOTOR_Z), 13.4, 20)
    for (a, b), (c, d) in zip(path[:-1], path[1:]):
        L = math.hypot(c - a, d - b)
        if L > 0.1:
            nx, nz = -(d - b) / L * 2, (c - a) / L * 2
            v = [(spk - 3, a - nx, b - nz), (spk - 3, c - nx, d - nz), (spk - 3, c + nx, d + nz), (spk - 3, a + nx, b + nz),
                 (spk + 3, a - nx, b - nz), (spk + 3, c - nx, d - nz), (spk + 3, c + nx, d + nz), (spk + 3, a + nx, b + nz)]
            M.add("chain", "#3a3a3a", v, [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
    M.box("battery", "#e48bd0", -70, 6, 60, 118, 3, 24)
    M.box("ibt2", "#2b66b3", 20, 70, 62, 112, 3, 46)
    M.box("pcb", "#2f8a4a", -55, 45, 60, 120, 56, 58)
    for sx in (-1, 1):
        M.box("arm_bracket", "#7b7b7b", sx * 152 - 18, sx * 152 + 18, -6, 6, ZS - 22, ZS + 22)
    M.uarch("tyre", "#2b2b2b", theta, RO, RI, LEG, TW, ZS)
    return M


def main():
    a = analyse(0.0, MOTOR_Y, "A  V1 as it is today (chain plane x=0, motor y=-100)")
    b = analyse(40.0, -85.0, "B  chain plane moved to x=+40, motor centre y=-85")
    print(f"box top {TOP:.0f} above deck, sweep margin {SWEEP_MARGIN:.0f} mm, box plan half-width {a['xw']:.0f} mm, "
          f"length at x=0: {2 * y_lim(0):.0f} mm")
    for c in (a, b):
        print(f"{c['label']:<56} motor sticks out by {c['overflow']:5.1f} mm   bearing feet outside box {c['brg_out']:.0f} mm2   "
              f"box-to-tyre (plan) {c['tyre_gap']:.0f} mm")
    # numeric sweep check: tyre swings 10..170 deg, minimum distance to the box top corner (y-z section at several x)
    print("tyre sweep vs box top corner (min distance while swinging 10 -> 170 deg):")
    for x in (0.0, 40.0, 80.0, 90.0):
        yl = y_lim(x)
        if yl <= 0:
            continue
        dmin = 1e9
        for th in np.linspace(REST, 180 - REST, 80):
            t = math.radians(th)
            d = (-math.cos(t), math.sin(t))
            nrm = (math.sin(t), math.cos(t))
            d_in = LEG + math.sqrt(max(RI ** 2 - x ** 2, 0))
            d_out = LEG + math.sqrt(max(RO ** 2 - x ** 2, 0))
            band = Polygon([(aa * d[0] + bb * nrm[0], ZS + aa * d[1] + bb * nrm[1])
                            for aa, bb in ((d_in, -TW / 2), (d_out, -TW / 2), (d_out, TW / 2), (d_in, TW / 2))])
            dmin = min(dmin, band.distance(sbox(-yl, 0, yl, TOP)))
        print(f"  x={x:>4.0f}: box half-length {yl:6.1f}   min distance to the swinging tyre {dmin:5.1f} mm")

    fig = plt.figure(figsize=(19, 12))
    fig.suptitle("PARKFNB V2 concept: ONE steel box over the whole mechanism, tyre folds around it (0 - 90 - 180 deg)",
                 fontsize=14, weight="bold")
    ax = fig.add_axes([0.02, 0.50, 0.40, 0.42])
    ax.set_aspect("equal")
    ax.set_xlim(-270, 270)
    ax.set_ylim(-330, 330)
    ax.add_patch(Rectangle((-250, -300), 500, 600, fc="#e6e6e6", ec="#555"))
    for sign in (-1, 1):
        ax.add_patch(MPoly(list(tyre_u(sign).exterior.coords), fc="#333", alpha=0.22, ec="#1f5fae", ls="--", lw=1))
    ax.add_patch(MPoly(list(a["box"].exterior.coords), fc="#8fa3b8", ec="k", lw=1.5, alpha=0.95))
    ax.plot([-203, 203], [0, 0], color="#888", lw=6, solid_capstyle="butt")
    for sx in (-1, 1):
        ax.add_patch(Rectangle((sx * BRG_X - BRG_A / 2, -BRG_L / 2), BRG_A, BRG_L, fc="#2f7d53", alpha=0.6))
    ax.add_patch(MPoly(list(a["motor"].exterior.coords), fc="#d4d4d4", ec="#c00", lw=1.5))
    for g in (a["out"].geoms if hasattr(a["out"], "geoms") else [a["out"]]):
        if not g.is_empty:
            ax.add_patch(MPoly(list(g.exterior.coords), fc="#e03030", ec="none", alpha=0.9))
    ax.add_patch(MPoly(list(b["motor"].exterior.coords), fc="none", ec="#1d7a3a", lw=2, ls="--"))
    ax.add_patch(Circle((40, 0), OD_B / 2, fc="none", ec="#1d7a3a", ls=":"))
    ax.text(0, 238, "TYRE lies here at 180 deg (rear)", ha="center", color="#1f5fae", fontsize=9)
    ax.text(0, -262, "TYRE lies here at 0 deg (front)", ha="center", color="#1f5fae", fontsize=9)
    ax.text(0, 100, "STEEL BOX rear half:\nbattery, PCB, IBT-2", ha="center", fontsize=9, weight="bold")
    ax.text(40, -60, "STEEL BOX front half: motor, chain", ha="center", fontsize=8.5, weight="bold")
    ax.text(-252, -128, "RED = V1 motor today\nsticks out of the box", color="#c00", fontsize=8.5, ha="left")
    ax.text(70, -165, "GREEN dashed = motor if the chain plane\nmoves to x=+40 and centre distance ~85", color="#1d7a3a", fontsize=8)
    ax.text(-200, 12, "shaft", ha="center", fontsize=8, color="#555")
    ax.set_title("PLAN (from above)", fontsize=11)
    ax.set_xticks([])
    ax.set_yticks([])

    def pane(rect, theta, title, alpha=1.0, case=b):
        p_ = fig.add_axes(rect)
        p_.set_xlim(0, 100)
        p_.set_ylim(0, 70)
        p_.set_aspect("equal")
        p_.axis("off")
        render_iso(p_, build(theta, case, box_alpha=alpha), 50, 28, 0.085, cam=(0.9, -1.25, 0.85))
        p_.set_title(title, fontsize=11)

    pane([0.44, 0.50, 0.27, 0.42], REST, f"0 deg  (tyre lying in FRONT, rest ~{REST:.0f} deg)")
    pane([0.71, 0.50, 0.27, 0.42], 90, "90 deg  (standing = LOCKED)")
    pane([0.02, 0.06, 0.27, 0.42], 180 - REST, f"180 deg  (tyre lying BEHIND, rest ~{REST:.0f} deg)")
    pane([0.29, 0.06, 0.27, 0.42], 90, "box 75 % transparent: motor, chain, bearings, electronics inside", alpha=0.25)
    sa = fig.add_axes([0.58, 0.07, 0.40, 0.37])
    sa.set_aspect("equal")
    sa.set_xlim(-330, 330)
    sa.set_ylim(-45, 330)
    sa.add_patch(Rectangle((-300, PLATE), 600, -PLATE, fc="#bbb", ec="k", lw=0.5))
    sa.add_patch(Rectangle((-300, GROUND), 600, PLATE - GROUND, fc="#ddd", ec="k", lw=0.5))
    yl0 = y_lim(0.0)
    sa.add_patch(Rectangle((-yl0, 0), 2 * yl0, TOP, fc="#8fa3b8", ec="k", lw=1.5, alpha=0.9))
    sa.add_patch(Circle((0, ZS), 12.5, fc="#d8d8d8", ec="k"))
    sa.add_patch(Circle((0, ZS), OD_B / 2, fc="none", ec="#666", ls=":"))
    sa.add_patch(Circle((b["cy"], MOTOR_Z), GB_D / 2, fc="#c9ccd0", ec="#1d7a3a"))
    cp = chain_poly((0, ZS), 44.5, (b["cy"], MOTOR_Z), 13.4)
    sa.plot([q[0] for q in cp], [q[1] for q in cp], color="#333", lw=1)
    for th, col in ((REST, "#1f5fae"), (90, "#222"), (180 - REST, "#1f5fae")):
        t = math.radians(th)
        d = (-math.cos(t), math.sin(t))
        nrm = (math.sin(t), math.cos(t))
        a0, a1 = LEG + RI, LEG + RO
        pts = [(u * d[0] + v * nrm[0], ZS + u * d[1] + v * nrm[1]) for u, v in ((a0, -TW / 2), (a1, -TW / 2), (a1, TW / 2), (a0, TW / 2))]
        sa.add_patch(MPoly(pts, fc=col, alpha=0.18, ec=col, lw=1))
    sa.annotate("", xy=(yl0 + 20, 0), xytext=(yl0 + 20, TOP), arrowprops=dict(arrowstyle="<->"))
    sa.text(yl0 + 26, TOP / 2, f"box top {TOP:.0f} above deck\n({TOP - GROUND:.0f} above ground)", fontsize=8, va="center")
    sa.text(-150, 250, "180 deg\nrest", color="#1f5fae", ha="center", fontsize=9)
    sa.text(150, 250, "0 deg\nrest", color="#1f5fae", ha="center", fontsize=9)
    sa.text(0, 305, "90 deg (standing, above the box)", ha="center", fontsize=9)
    sa.set_title("SIDE SECTION through the box (x = 0), tyre positions in blue", fontsize=11)
    sa.set_xticks([])
    sa.set_yticks([])
    fig.savefig(os.path.join(HERE, "concept_visual.png"), dpi=100)
    print("wrote", os.path.join(HERE, "concept_visual.png"))


if __name__ == "__main__":
    main()