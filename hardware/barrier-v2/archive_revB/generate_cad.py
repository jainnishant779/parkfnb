"""PARKFNB smart parking barrier - Prototype V2 parametric CAD generator.

Edit the numbers in P (and the dimension register) and re-run:

    python generate_cad.py

Writes, next to this file:
    PARKFNB_V2_CAD_Drawings.pdf   10-sheet A3 drawing set
    PARKFNB_V2_Assembly.dxf       plan / front / section / enclosure / PCB views, 1:1 mm
    PARKFNB_V2_Assembly_3D.obj    coloured 3D assembly (+ .mtl), opens in Windows 3D Viewer / Blender
    preview_*.png                 sheet previews

Coordinates (mm): x along the shaft (+ to the right when you face the unit from the
barrier side), y horizontal (- = barrier side, where the arch lies when lowered;
+ = rear, enclosure side), z up, z = 0 is the top of the deck plate.
"""
import math
import os

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Polygon, Rectangle, Circle, FancyBboxPatch
from matplotlib.collections import PolyCollection
import ezdxf
from ezdxf.enums import TextEntityAlignment

HERE = os.path.dirname(os.path.abspath(__file__))
REV, DATE = "B", "2026-10-26"
START_DAY = (2026, 10, 27)  # Day 1 of the timeline

# --------------------------------------------------------------------------------------
# Parameters.  M = measured by the team (sketch / tape), C = catalogue standard,
# E = estimated from photos (verify before fabrication), D = V2 design choice.
# --------------------------------------------------------------------------------------
P = dict(
    # shaft (M)
    shaft_d=25.0, shaft_len=406.0,
    # UCP205 pillow blocks (C) at a measured spacing (E)
    brg_cc=130.0, brg_h=36.5, brg_L=140.0, brg_A=38.0, brg_J=105.0, brg_H2=71.0,
    brg_foot=15.0, brg_r=32.0,
    # rubber U-arch (M: 16 in wide, 8 in opening, 6 in deep opening, 15 mm thick)
    ring_ro=203.0, ring_ri=101.5, ring_leg=51.0, ring_t=15.0,
    # drive (E: #25 chain, tooth counts estimated - count them)
    chain_p=6.35, n_big=44, n_small=13, chain_x=0.0,
    motor_y=100.0, motor_z=25.5,
    gb_d=45.0, gb_len=33.0, can_d=36.0, can_len=44.5, motor_out=26.0,
    motor_rpm=30.0,
    # deck (D)
    plate_x=245.0, plate_y0=-270.0, plate_y1=215.0, plate_t=5.0, frame_h=25.0,
    anchor_x=225.0, anchor_y0=-250.0, anchor_y1=195.0, anchor_d=12.0,
    # common enclosure (D)
    enc_x=200.0, enc_y0=72.0, enc_y1=200.0, enc_h=65.0, enc_wall=3.0,
    wall_bat=-115.0, wall_elec=20.0,
    # chain guard (D)
    guard_hw=22.0, guard_y0=-55.0, guard_h=92.0,
    # arch brackets, rests, stops (D)
    brk_x=152.0, rest_x=150.0, rest_y=-160.0, stop_y=17.5,  # stop face touches the raised arch (y = +7.5)
    imu_x=34.0, hall_x=-34.0,
)

p = P
ZS = p["brg_h"]                      # shaft axis height above deck
GROUND = -(p["plate_t"] + p["frame_h"])


def pd(n):
    return p["chain_p"] / math.sin(math.pi / n)


def od(n):
    return p["chain_p"] * (0.6 + 1 / math.tan(math.pi / n))


PD_B, PD_S = pd(p["n_big"]), pd(p["n_small"])
OD_B, OD_S = od(p["n_big"]), od(p["n_small"])
C_NOM = math.hypot(p["motor_y"], ZS - p["motor_z"])


def chain_links(C):
    n1, n2, pp = p["n_small"], p["n_big"], p["chain_p"]
    return 2 * C / pp + (n1 + n2) / 2 + pp * ((n2 - n1) / (2 * math.pi)) ** 2 / C


LINKS = math.ceil(chain_links(C_NOM))
LINKS += LINKS % 2


def centre_for_links(L):
    n1, n2, pp = p["n_small"], p["n_big"], p["chain_p"]
    a = L - (n1 + n2) / 2
    return pp / 4 * (a + math.sqrt(a * a - 8 * ((n2 - n1) / (2 * math.pi)) ** 2))


C_EXACT = centre_for_links(LINKS)
RATIO = p["n_big"] / p["n_small"]
SHAFT_RPM = p["motor_rpm"] / RATIO
T90 = 0.25 * 60 / SHAFT_RPM
# farthest guard corner (front end of the guard) from the shaft axis, in the x = 0 section
GUARD_REACH = max(math.hypot(p["guard_y0"], p["guard_h"] - 12 - ZS), math.hypot(p["guard_y0"] + 12, p["guard_h"] - ZS))

# arch mass / torque estimate (rubber 1.15 g/cm3, +40 % for steel belts)
_ro, _ri, _lg, _t = p["ring_ro"], p["ring_ri"], p["ring_leg"], p["ring_t"]
ARCH_AREA = math.pi / 2 * (_ro**2 - _ri**2) + 2 * _lg * (_ro - _ri)
ARCH_KG = ARCH_AREA * _t * 1.15e-6 * 1.4
_cg_semi = _lg + 4 / (3 * math.pi) * (_ro**3 - _ri**3) / (_ro**2 - _ri**2)
ARCH_CG = (math.pi / 2 * (_ro**2 - _ri**2) * _cg_semi + 2 * _lg * (_ro - _ri) * _lg / 2) / ARCH_AREA
T_SHAFT = ARCH_KG * 9.81 * ARCH_CG / 1000
T_MOTOR_KGCM = T_SHAFT / RATIO / 0.85 / 9.81 * 100

# --------------------------------------------------------------------------------------
# Drawing primitives: every call draws on the matplotlib sheet and (optionally) the DXF.
# --------------------------------------------------------------------------------------
STY = {
    "out": dict(c="#111111", lw=0.7, ls="-"),
    "thin": dict(c="#222222", lw=0.4, ls="-"),
    "hid": dict(c="#666666", lw=0.4, ls=(0, (3, 1.6))),
    "cen": dict(c="#b03030", lw=0.3, ls=(0, (9, 2, 1.5, 2))),
    "phan": dict(c="#1f5fae", lw=0.45, ls=(0, (7, 2, 1.5, 2, 1.5, 2))),
    "dim": dict(c="#1f3f6f", lw=0.3, ls="-"),
    "elec": dict(c="#1d6b35", lw=0.6, ls="-"),
}
DXF_LAYERS = {
    "out": ("OUTLINE", 7, "CONTINUOUS"), "thin": ("THIN", 7, "CONTINUOUS"),
    "hid": ("HIDDEN", 8, "DASHED"), "cen": ("CENTER", 1, "CENTER"),
    "phan": ("PHANTOM", 5, "PHANTOM"), "dim": ("DIM", 4, "CONTINUOUS"),
    "txt": ("TEXT", 2, "CONTINUOUS"), "elec": ("PCB", 3, "CONTINUOUS"),
}


def fmt(v):
    v = abs(v)
    return f"{v:.0f}" if abs(v - round(v)) < 0.05 else f"{v:.1f}"


class View:
    """A 2-D view placed on a sheet at (ox, oy) paper-mm with scale sc; mirrored to DXF
    model space at offset (dx, dy) when msp is given."""

    def __init__(self, ax, ox, oy, sc, msp=None, dx=0.0, dy=0.0, clip=None):
        self.ax, self.ox, self.oy, self.sc = ax, ox, oy, sc
        self.msp, self.dx, self.dy = msp, dx, dy
        # clip = (x0, y0, w, h) in paper mm: geometry outside it is not drawn on the sheet
        self.clip = Rectangle(clip[:2], *clip[2:], transform=ax.transData) if clip else None

    def P(self, u, v):
        return self.ox + u * self.sc, self.oy + v * self.sc

    def _c(self, art):
        if self.clip is not None:
            for a in (art if isinstance(art, list) else [art]):
                a.set_clip_path(self.clip)
        return art

    def _dxf(self, L):
        return {"layer": DXF_LAYERS[L][0]}

    def line(self, pts, L="out", close=False, fill=None, alpha=1.0, z=2):
        pp = [self.P(u, v) for u, v in pts]
        s = STY[L]
        if fill is not None:
            self._c(self.ax.add_patch(Polygon(pp, closed=True, fc=fill, ec="none", alpha=alpha, zorder=z - 1)))
        if close:
            pp = pp + [pp[0]]
        xs, ys = zip(*pp)
        self._c(self.ax.plot(xs, ys, color=s["c"], lw=s["lw"], ls=s["ls"], zorder=z,
                             solid_capstyle="round", dash_capstyle="butt"))
        if self.msp is not None:
            self.msp.add_lwpolyline([(self.dx + u, self.dy + v) for u, v in pts],
                                    close=close, dxfattribs=self._dxf(L))

    def rect(self, u0, u1, v0, v1, L="out", fill=None, alpha=1.0, z=2):
        self.line([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], L, True, fill, alpha, z)

    def circle(self, u, v, r, L="out", fill=None, alpha=1.0, z=2):
        s = STY[L]
        cx, cy = self.P(u, v)
        if fill is not None:
            self._c(self.ax.add_patch(Circle((cx, cy), r * self.sc, fc=fill, ec="none", alpha=alpha, zorder=z - 1)))
        self._c(self.ax.add_patch(Circle((cx, cy), r * self.sc, fc="none", ec=s["c"], lw=s["lw"], ls=s["ls"],
                                         zorder=z)))
        if self.msp is not None:
            self.msp.add_circle((self.dx + u, self.dy + v), r, dxfattribs=self._dxf(L))

    def arc(self, u, v, r, a0, a1, L="out", n=48, z=2):
        a = np.radians(np.linspace(a0, a1, n))
        pts = list(zip(u + r * np.cos(a), v + r * np.sin(a)))
        s = STY[L]
        pp = [self.P(*q) for q in pts]
        xs, ys = zip(*pp)
        self._c(self.ax.plot(xs, ys, color=s["c"], lw=s["lw"], ls=s["ls"], zorder=z))
        if self.msp is not None:
            self.msp.add_arc((self.dx + u, self.dy + v), r, a0, a1, dxfattribs=self._dxf(L))

    def cl(self, u0, v0, u1, v1):
        self.line([(u0, v0), (u1, v1)], "cen")

    def text(self, u, v, s, size=6.0, ha="center", va="center", rot=0, color="#111", weight="normal",
             dxf=True, bg=None):
        x, y = self.P(u, v)
        kw = {}
        if bg:
            kw["bbox"] = dict(fc=bg, ec="none", pad=0.6)
        self.ax.text(x, y, s, fontsize=size, ha=ha, va=va, rotation=rot, color=color,
                     weight=weight, zorder=6, **kw)
        if self.msp is not None and dxf:
            al = {("center", "center"): TextEntityAlignment.MIDDLE_CENTER,
                  ("left", "center"): TextEntityAlignment.MIDDLE_LEFT,
                  ("right", "center"): TextEntityAlignment.MIDDLE_RIGHT,
                  ("center", "bottom"): TextEntityAlignment.BOTTOM_CENTER,
                  ("center", "top"): TextEntityAlignment.TOP_CENTER,
                  ("left", "bottom"): TextEntityAlignment.BOTTOM_LEFT,
                  ("left", "top"): TextEntityAlignment.TOP_LEFT}.get((ha, va), TextEntityAlignment.MIDDLE_LEFT)
            for i, line in enumerate(s.split("\n")):
                h = size * 0.9 / self.sc * 0.35
                self.msp.add_text(line, height=h, dxfattribs={"layer": "TEXT", "rotation": rot}).set_placement(
                    (self.dx + u, self.dy + v - i * h * 1.5), align=al)

    def dim(self, p1, p2, off, kind="h", txt=None, size=5.5):
        """Linear dimension between model points p1, p2.  kind 'h' measures along u
        (dimension line at v = p1.v + off), 'v' along v (line at u = p1.u + off)."""
        (u1, v1), (u2, v2) = p1, p2
        val = abs(u2 - u1) if kind == "h" else abs(v2 - v1)
        label = txt if txt is not None else fmt(val)
        s = STY["dim"]
        ov = 1.5 / self.sc
        if kind == "h":
            vd = v1 + off
            ext = [((u1, v1), (u1, vd + math.copysign(ov, off))), ((u2, v2), (u2, vd + math.copysign(ov, off)))]
            a, b = self.P(u1, vd), self.P(u2, vd)
            tx, ty, rot = (a[0] + b[0]) / 2, a[1] + 0.8, 0
            va = "bottom"
        else:
            ud = u1 + off
            ext = [((u1, v1), (ud + math.copysign(ov, off), v1)), ((u2, v2), (ud + math.copysign(ov, off), v2))]
            a, b = self.P(ud, v1), self.P(ud, v2)
            tx, ty, rot = a[0] - 0.8, (a[1] + b[1]) / 2, 90
            va = "bottom"
        for q0, q1 in ext:
            (x0, y0), (x1, y1) = self.P(*q0), self.P(*q1)
            gap = 0.8
            d = math.hypot(x1 - x0, y1 - y0) or 1
            x0, y0 = x0 + (x1 - x0) / d * gap, y0 + (y1 - y0) / d * gap
            self.ax.plot([x0, x1], [y0, y1], color=s["c"], lw=0.25, zorder=5)
        self.ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="<|-|>", color=s["c"], lw=0.3,
                                                             mutation_scale=4.5, shrinkA=0, shrinkB=0), zorder=5)
        self.ax.text(tx, ty, label, fontsize=size, ha="center", va=va, rotation=rot, color=s["c"], zorder=6,
                     bbox=dict(fc="white", ec="none", pad=0.15, alpha=0.85))
        if self.msp is not None:
            base = (self.dx + (u1 + u2) / 2, self.dy + v1 + off) if kind == "h" else \
                (self.dx + u1 + off, self.dy + (v1 + v2) / 2)
            d = self.msp.add_linear_dim(base=base, p1=(self.dx + u1, self.dy + v1), p2=(self.dx + u2, self.dy + v2),
                                        angle=0 if kind == "h" else 90, dimstyle="PFNB",
                                        text=txt if txt is not None else "<>",
                                        dxfattribs={"layer": "DIM"})
            d.render()

    def balloon(self, u, v, bu, bv, n):
        """Leader from model point (u, v) to a numbered balloon at model point (bu, bv)."""
        a, b = self.P(u, v), self.P(bu, bv)
        self.ax.plot([a[0], b[0]], [a[1], b[1]], color="#333", lw=0.3, zorder=7)
        self.ax.plot(*a, marker="o", ms=1.2, color="#333", zorder=7)
        self.ax.add_patch(Circle(b, 2.6, fc="white", ec="#333", lw=0.45, zorder=8))
        self.ax.text(b[0], b[1], str(n), fontsize=5.6, ha="center", va="center", zorder=9, weight="bold")
        if self.msp is not None:
            self.msp.add_line((self.dx + u, self.dy + v), (self.dx + bu, self.dy + bv), dxfattribs={"layer": "TEXT"})
            self.msp.add_circle((self.dx + bu, self.dy + bv), 2.6 / self.sc, dxfattribs={"layer": "TEXT"})
            self.msp.add_text(str(n), height=2.6 / self.sc, dxfattribs={"layer": "TEXT"}).set_placement(
                (self.dx + bu, self.dy + bv), align=TextEntityAlignment.MIDDLE_CENTER)


# --------------------------------------------------------------------------------------
# Sheet frame
# --------------------------------------------------------------------------------------
SHEETS_TOTAL = 13


def new_sheet(no, title, scale="AS SHOWN"):
    fig = plt.figure(figsize=(420 / 25.4, 297 / 25.4))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 420)
    ax.set_ylim(0, 297)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(Rectangle((10, 10), 400, 277, fc="none", ec="#111", lw=1.0))
    ax.add_patch(Rectangle((7, 7), 406, 283, fc="none", ec="#111", lw=0.3))
    # zone marks
    for i in range(8):
        x = 10 + 50 * i + 25
        ax.text(x, 8.5, str(i + 1), fontsize=4.5, ha="center", va="center", color="#555")
        ax.text(x, 288.5, str(i + 1), fontsize=4.5, ha="center", va="center", color="#555")
    for i, ch in enumerate("ABCDEF"):
        y = 287 - 23 - 46.2 * i
        ax.text(8.5, y, ch, fontsize=4.5, ha="center", va="center", color="#555")
        ax.text(411.5, y, ch, fontsize=4.5, ha="center", va="center", color="#555")
    # title block 160 x 36 at bottom right
    x0, y0, w, h = 250, 10, 160, 36
    ax.add_patch(Rectangle((x0, y0), w, h, fc="white", ec="#111", lw=0.8, zorder=3))
    for yy in (y0 + 12, y0 + 24):
        ax.plot([x0, x0 + w], [yy, yy], color="#111", lw=0.4, zorder=4)
    for xx in (x0 + 100, x0 + 130):
        ax.plot([xx, xx], [y0, y0 + 12], color="#111", lw=0.4, zorder=4)
    ax.plot([x0 + 100, x0 + 100], [y0 + 12, y0 + 24], color="#111", lw=0.4, zorder=4)
    T = lambda x, y, s, **k: ax.text(x, y, s, zorder=5, **k)
    T(x0 + 3, y0 + 30, "PARKFNB  SMART PARKING BARRIER  -  PROTOTYPE V2", fontsize=7.2, weight="bold", va="center")
    T(x0 + 3, y0 + 26.3, "Concept CAD for design review  |  reuses V1 shaft, UCP205 bearings, arch, motor, chain",
      fontsize=4.6, va="center", color="#444")
    T(x0 + 3, y0 + 18, title, fontsize=7.5, weight="bold", va="center")
    T(x0 + 103, y0 + 21, "SHEET", fontsize=4.2, color="#555", va="center")
    T(x0 + 103, y0 + 16, f"{no} / {SHEETS_TOTAL}", fontsize=7, weight="bold", va="center")
    T(x0 + 133, y0 + 21, "SCALE (A3)", fontsize=4.2, color="#555", va="center")
    T(x0 + 133, y0 + 16, scale, fontsize=6.5, weight="bold", va="center")
    T(x0 + 3, y0 + 9, "UNITS mm  |  FIRST-ANGLE  |  GENERAL TOL. +/-1 mm UNLESS STATED", fontsize=4.5, va="center")
    T(x0 + 3, y0 + 4, "STATUS: CONCEPT - NOT FOR FABRICATION UNTIL 'E' DIMENSIONS ARE VERIFIED",
      fontsize=4.5, va="center", color="#a02020", weight="bold")
    T(x0 + 103, y0 + 9, "REV", fontsize=4.2, color="#555", va="center")
    T(x0 + 103, y0 + 4, REV, fontsize=7, weight="bold", va="center")
    T(x0 + 133, y0 + 9, "DATE", fontsize=4.2, color="#555", va="center")
    T(x0 + 133, y0 + 4, DATE, fontsize=6, weight="bold", va="center")
    return fig, ax


def note_block(ax, x, y, title, lines, w=150, size=5.6, lh=3.4, title_size=6.6):
    ax.text(x, y, title, fontsize=title_size, weight="bold", va="top")
    yy = y - 5
    for ln in lines:
        ax.text(x, yy, ln, fontsize=size, va="top", wrap=False)
        yy -= lh * (ln.count("\n") + 1)
    return yy


def table(ax, x, y, cols, rows, widths, rh=4.4, size=5.2, head_fc="#1f3f6f", zebra="#f1f4f8", bold_col0=False):
    """Simple ruled table; returns the y below it."""
    W = sum(widths)
    ax.add_patch(Rectangle((x, y - rh), W, rh, fc=head_fc, ec="#111", lw=0.4))
    xx = x
    for c, w in zip(cols, widths):
        ax.text(xx + 1.2, y - rh / 2, c, fontsize=size, color="white", weight="bold", va="center")
        xx += w
    yy = y - rh
    for i, r in enumerate(rows):
        nl = max(str(c).count("\n") + 1 for c in r)
        hh = rh * (1 + 0.72 * (nl - 1))
        ax.add_patch(Rectangle((x, yy - hh), W, hh, fc=zebra if i % 2 else "white", ec="#999", lw=0.25))
        xx = x
        for j, (c, w) in enumerate(zip(r, widths)):
            ax.text(xx + 1.2, yy - hh / 2, str(c), fontsize=size, va="center",
                    weight="bold" if (bold_col0 and j == 0) else "normal", linespacing=1.05)
            xx += w
        yy -= hh
    xx = x
    for w in widths[:-1]:
        xx += w
        ax.plot([xx, xx], [y, yy], color="#999", lw=0.25)
    ax.add_patch(Rectangle((x, yy), W, y - yy, fc="none", ec="#111", lw=0.4))
    return yy


# --------------------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------------------
def u_band(ro, ri, leg, n=64):
    """Closed outline of the U-arch in its own plane: a along the shaft, b away from it."""
    out = [(ro, 0), (ro, leg)] + [(ro * math.cos(t), leg + ro * math.sin(t))
                                  for t in np.linspace(0, math.pi, n)] + [(-ro, leg), (-ro, 0)]
    inn = [(-ri, 0), (-ri, leg)] + [(ri * math.cos(t), leg + ri * math.sin(t))
                                    for t in np.linspace(math.pi, 0, n)] + [(ri, leg), (ri, 0)]
    return out + inn


def chain_path(c1, r1, c2, r2, n=80):
    """Closed loop around two pitch circles (open belt).  Returns polyline points."""
    (x1, y1), (x2, y2) = c1, c2
    dx, dy = x2 - x1, y2 - y1
    d = math.hypot(dx, dy)
    base = math.atan2(dy, dx)
    beta = math.acos((r1 - r2) / d)
    pts = []
    # wrap on circle 1 from base+beta to base+2pi-beta, then on circle 2 from base-beta to base+beta
    for t in np.linspace(base + beta, base + 2 * math.pi - beta, n):
        pts.append((x1 + r1 * math.cos(t), y1 + r1 * math.sin(t)))
    for t in np.linspace(base - beta, base + beta, max(8, n // 3)):
        pts.append((x2 + r2 * math.cos(t), y2 + r2 * math.sin(t)))
    pts.append(pts[0])
    return pts


def resample(pts, step):
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    total = sum(seg)
    k = int(total // step)
    out, acc, i = [], 0.0, 0
    for j in range(k):
        s = j * total / k
        while acc + seg[i] < s:
            acc += seg[i]
            i += 1
        f = (s - acc) / seg[i] if seg[i] else 0
        out.append((pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])))
    return out


# --------------------------------------------------------------------------------------
# Views of the assembly
# --------------------------------------------------------------------------------------
FILL = dict(base="#e9e9e9", ring="#3b3b3b", enc="#d6e8f6", guard="#ffe39a", brg="#2f7d53", motor="#bdbdbd",
            pcb="#2f8a4a", bat="#e48bd0", ibt="#2b66b3", spr="#9a9a9a")


def plan_view(V, detail=True):
    x, = (p["plate_x"],)
    V.rect(-x, x, p["plate_y0"], p["plate_y1"], fill=FILL["base"], alpha=0.6, z=1)
    # perimeter frame under plate (hidden)
    f = 25
    V.rect(-x, x, p["plate_y0"], p["plate_y1"], "hid")
    V.rect(-x + f, x - f, p["plate_y0"] + f, p["plate_y1"] - f, "hid")
    for sx in (-1, 1):
        for ay in (p["anchor_y0"], p["anchor_y1"]):
            V.circle(sx * p["anchor_x"], ay, p["anchor_d"] / 2)
            V.cl(sx * p["anchor_x"] - 9, ay, sx * p["anchor_x"] + 9, ay)
            V.cl(sx * p["anchor_x"], ay - 9, sx * p["anchor_x"], ay + 9)
    # deck slot + under-pan (hidden)
    V.rect(-10, 10, -35, 45, "hid")
    # arch (lowered)
    band = [(a, -b) for a, b in u_band(p["ring_ro"], p["ring_ri"], p["ring_leg"])]
    V.line(band, "out", close=True, fill=FILL["ring"], alpha=0.22)
    V.cl(0, -270, 0, 215)
    # rests under the arch (hidden by the arch)
    for sx in (-1, 1):
        V.rect(sx * p["rest_x"] - 20, sx * p["rest_x"] + 20, p["rest_y"] - 20, p["rest_y"] + 20, "hid")
    # bearings
    for sx in (-1, 1):
        cx = sx * p["brg_cc"] / 2
        V.rect(cx - p["brg_A"] / 2, cx + p["brg_A"] / 2, -p["brg_L"] / 2, p["brg_L"] / 2, fill=FILL["brg"], alpha=0.35)
        V.rect(cx - 17, cx + 17, -p["brg_r"], p["brg_r"], "thin")
        for by in (-p["brg_J"] / 2, p["brg_J"] / 2):
            V.line([(cx - 6.5, by - 3), (cx + 6.5, by - 3), (cx + 6.5, by + 3), (cx - 6.5, by + 3)], "thin", True)
            V.circle(cx, by, 5)
    # shaft
    hl, r = p["shaft_len"] / 2, p["shaft_d"] / 2
    V.rect(-hl, hl, -r, r, fill="#d8d8d8")
    V.cl(-hl - 12, 0, hl + 12, 0)
    # arch brackets (clamp collar + plate along the leg)
    for sx in (-1, 1):
        bx = sx * p["brk_x"]
        V.rect(bx - 20, bx + 20, -70, -12, "out", fill="#8a8a8a", alpha=0.5)
        V.rect(bx - 15, bx + 15, -22.5, 22.5, "out", fill="#8a8a8a", alpha=0.5)
        V.circle(bx, -35, 4.5)
        V.circle(bx, -58, 4.5)
        # 90 deg end stop
        V.rect(bx - 12.5, bx + 12.5, p["stop_y"] - 10, p["stop_y"] + 10, fill="#444", alpha=0.35)
    # chain guard + hidden sprocket/chain/motor
    g = p["guard_hw"]
    V.rect(-g, g, p["guard_y0"], p["enc_y0"], fill=FILL["guard"], alpha=0.55)
    V.rect(-1.5, 1.5, -OD_B / 2, OD_B / 2, "hid")
    V.rect(-16.5, -1.5, -20, 20, "hid")
    # IMU pod and Hall collar on the shaft
    V.rect(p["imu_x"] - 9, p["imu_x"] + 9, -21, 21, fill="#3557a8", alpha=0.45)
    V.rect(p["hall_x"] - 6, p["hall_x"] + 6, -19, 19, fill="#777", alpha=0.45)
    V.rect(p["hall_x"] - 8, p["hall_x"] + 8, 20, 30, "thin")
    # enclosure
    ex, y0, y1, w = p["enc_x"], p["enc_y0"], p["enc_y1"], p["enc_wall"]
    V.rect(-ex, ex, y0, y1, fill=FILL["enc"], alpha=0.6)
    V.rect(-ex + w, ex - w, y0 + w, y1 - w, "hid")
    for wx in (p["wall_bat"], p["wall_elec"]):
        V.rect(wx - 1.5, wx + 1.5, y0 + w, y1 - w, "hid")
    my = p["motor_y"]
    x_f = p["chain_x"] - p["motor_out"]
    V.rect(x_f - p["gb_len"], x_f, my - p["gb_d"] / 2, my + p["gb_d"] / 2, "hid")
    V.rect(x_f - p["gb_len"] - p["can_len"], x_f - p["gb_len"], my - p["can_d"] / 2, my + p["can_d"] / 2, "hid")
    V.rect(x_f, x_f + 3, my - 28, my + 28, "hid")
    V.rect(-195, -118, 78, 195, "hid")       # battery 3S2P
    V.rect(30, 130, 108, 188, "hid")         # controller PCB
    V.rect(142, 192, 80, 130, "hid")         # IBT-2
    if detail:
        V.text(-156, 136, "BATTERY\n3S2P", 4.6, color="#555", dxf=False)
        V.text(-60, 160, "DRIVE BAY", 4.6, color="#555", dxf=False)
        V.text(80, 148, "CONTROLLER\nPCB 100x80", 4.6, color="#555", dxf=False)
        V.text(167, 105, "IBT-2", 4.6, color="#555", dxf=False)
        V.text(0, -210, "ARCH (LOWERED 0 deg)", 5.0, color="#222", bg="white", dxf=False)


def front_view(V):
    """Elevation viewed from the barrier side (looking toward +y); arch raised to 90 deg."""
    x = p["plate_x"]
    V.rect(-x, x, -p["plate_t"], 0, fill="#bbbbbb")
    V.rect(-x, -x + 25, GROUND, -p["plate_t"], fill="#cccccc")
    V.rect(x - 25, x, GROUND, -p["plate_t"], fill="#cccccc")
    V.line([(-x + 25, GROUND + 3), (x - 25, GROUND + 3)], "hid")
    V.line([(-x - 15, GROUND), (x + 15, GROUND)], "thin")
    for k in range(-9, 10):
        u = k * 26
        V.line([(u, GROUND), (u - 5, GROUND - 5)], "thin")
    ex = p["enc_x"]
    V.rect(-ex, ex, 0, p["enc_h"], fill=FILL["enc"], alpha=0.7, z=1)
    V.rect(-ex - 4, ex + 4, p["enc_h"], p["enc_h"] + 3, "thin")
    g = p["guard_hw"]
    V.rect(-g, g, 0, p["guard_h"], fill=FILL["guard"], alpha=0.8, z=2)
    for sx in (-1, 1):
        cx = sx * p["brg_cc"] / 2
        V.rect(cx - p["brg_A"] / 2, cx + p["brg_A"] / 2, 0, p["brg_foot"], fill=FILL["brg"], alpha=0.5)
        V.line([(cx - 17, p["brg_foot"]), (cx - 17, ZS)] +
               [(cx + 17 * math.cos(t), ZS + 34.5 * math.sin(t)) for t in np.linspace(math.pi, 0, 30)] +
               [(cx + 17, p["brg_foot"])], fill=FILL["brg"], alpha=0.5)
        V.circle(cx, p["brg_H2"] - 3, 2.5, "thin")
        bx = sx * p["brk_x"]
        V.rect(bx - 15, bx + 15, ZS - 22.5, ZS + 22.5, fill="#8a8a8a", alpha=0.7)
        V.rect(bx - 20, bx + 20, ZS + 12, ZS + 70, fill="#8a8a8a", alpha=0.5)
        V.rect(bx - 12.5, bx + 12.5, 0, 110, "hid")
        V.rect(sx * p["rest_x"] - 20, sx * p["rest_x"] + 20, 0, ZS - p["ring_t"] / 2, fill="#222", alpha=0.6)
    hl, r = p["shaft_len"] / 2, p["shaft_d"] / 2
    V.rect(-hl, hl, ZS - r, ZS + r, fill="#d8d8d8", z=3)
    V.cl(-hl - 12, ZS, hl + 12, ZS)
    V.rect(p["imu_x"] - 9, p["imu_x"] + 9, ZS - 21, ZS + 21, fill="#3557a8", alpha=0.6)
    V.rect(p["hall_x"] - 6, p["hall_x"] + 6, ZS - 19, ZS + 19, fill="#777", alpha=0.6)
    band = [(a, ZS + b) for a, b in u_band(p["ring_ro"], p["ring_ri"], p["ring_leg"])]
    V.line(band, "out", close=True, fill=FILL["ring"], alpha=0.30, z=4)
    V.cl(0, GROUND - 8, 0, ZS + p["ring_leg"] + p["ring_ro"] + 10)
    V.text(0, ZS + p["ring_leg"] + p["ring_ri"] + 50, "ARCH RAISED (90 deg, LOCKED)", 5.0, bg="white", dxf=False)


def section_view(V, rollers=False):
    """Section A-A through the chain plane (x = 0), viewed from the right (+x)."""
    y0, y1 = p["plate_y0"], p["plate_y1"]
    V.rect(y0, -10, -p["plate_t"], 0, fill="#bbbbbb")
    V.rect(10, y1, -p["plate_t"], 0, fill="#bbbbbb")
    V.rect(y0, y0 + 25, GROUND, -p["plate_t"], fill="#cccccc")
    V.rect(y1 - 25, y1, GROUND, -p["plate_t"], fill="#cccccc")
    V.line([(y0 - 15, GROUND), (y1 + 15, GROUND)], "thin")
    for k in range(-11, 10):
        u = k * 25
        V.line([(u, GROUND), (u - 5, GROUND - 5)], "thin")
    # under-deck sprocket pan
    V.line([(-40, -p["plate_t"]), (-40, -20), (45, -20), (45, -p["plate_t"])], "out")
    # bearing beyond (hidden)
    V.rect(-p["brg_L"] / 2, p["brg_L"] / 2, 0, p["brg_foot"], "hid")
    V.circle(0, ZS, 34.5, "hid")
    # enclosure section
    ey0, ey1, eh, w = p["enc_y0"], p["enc_y1"], p["enc_h"], p["enc_wall"]
    V.line([(ey0, 60), (ey0, eh), (ey1, eh), (ey1, 0), (ey0, 0), (ey0, 3)], "out")
    V.rect(ey0, ey1, 0, eh, fill=FILL["enc"], alpha=0.35, z=1)
    V.rect(ey0 + w, ey1 - w, w, eh - w, "thin")
    V.rect(ey0 - 4, ey1 + 4, eh, eh + 3, "thin")
    # guard section (sloped top into the enclosure)
    gy0, gh = p["guard_y0"], p["guard_h"]
    guard = [(gy0, 0), (gy0, gh - 12), (gy0 + 12, gh), (20, gh), (ey0, eh)]
    V.line(guard, "out")
    V.line(guard + [(ey0, 0)], "out", fill=FILL["guard"], alpha=0.35, z=1)
    # shaft, sprockets, chain, motor
    V.circle(0, ZS, p["shaft_d"] / 2, fill="#d8d8d8")
    V.circle(0, ZS, OD_B / 2, fill=FILL["spr"], alpha=0.35)
    V.circle(0, ZS, PD_B / 2, "cen")
    my, mz = p["motor_y"], p["motor_z"]
    V.circle(my, mz, p["gb_d"] / 2, fill=FILL["motor"], alpha=0.6)
    V.circle(my, mz, OD_S / 2, fill=FILL["spr"], alpha=0.6)
    V.circle(my, mz, PD_S / 2, "cen")
    V.circle(my, mz, 4, "thin")
    V.cl(my - 30, mz, my + 30, mz)
    V.cl(my, mz - 30, my, mz + 30)
    V.cl(-60, ZS, 60, ZS)
    V.cl(0, ZS - 60, 0, ZS + 60)
    path = chain_path((0, ZS), PD_B / 2, (my, mz), PD_S / 2)
    V.line(path, "out")
    if rollers:
        for (u, v) in resample(path, p["chain_p"]):
            V.circle(u, v, 1.65, "thin")
    # motor bracket (L)
    V.line([(my - 30, 0), (my - 30, 3), (my + 30, 3), (my + 30, 0)], "out")
    # arch at 0 and 90 deg at the x = 0 section (b from leg+ri to leg+ro)
    b0, b1, t = p["ring_leg"] + p["ring_ri"], p["ring_leg"] + p["ring_ro"], p["ring_t"] / 2
    V.rect(-b1, -b0, ZS - t, ZS + t, fill=FILL["ring"], alpha=0.5)
    V.rect(-t, t, ZS + b0, ZS + b1, "phan")
    V.arc(0, ZS, b1, 90, 180, "phan")
    V.arc(0, ZS, b0, 90, 180, "phan")
    # arch legs/brackets beyond (phantom) and rest pad
    V.rect(p["rest_y"] - 20, p["rest_y"] + 20, 0, ZS - t, "hid")
    V.rect(p["stop_y"] - 10, p["stop_y"] + 10, 0, 110, "hid")


# --------------------------------------------------------------------------------------
# 3-D model (simple solids) - shared by the OBJ export and the isometric render
# --------------------------------------------------------------------------------------
class Model:
    def __init__(self):
        self.parts = []  # (name, color, verts Nx3, faces list of index lists, alpha)

    def add(self, name, color, verts, faces, alpha=1.0):
        self.parts.append((name, color, np.asarray(verts, float), faces, alpha))

    def box(self, name, color, x0, x1, y0, y1, z0, z1, alpha=1.0):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        self.add(name, color, v, f, alpha)

    def prism(self, name, color, prof, x0, x1, alpha=1.0):
        """Extrude a convex (y, z) profile, listed counter-clockwise, from x0 to x1."""
        n = len(prof)
        v = [(x, a, b) for x in (x0, x1) for a, b in prof]
        f = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
        f += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        self.add(name, color, v, f, alpha)

    def halfring(self, name, color, raised, c, ro, ri, t, n=40):
        """Rubber half-ring (the arch without its legs), centre c from the shaft axis."""
        def curve(r):
            return [(r * math.cos(s), c + r * math.sin(s)) for s in np.linspace(0, math.pi, n)]

        O, I = curve(ro), curve(ri)
        m = len(O)

        def X(a, b, w):
            return (a, w, ZS + b) if raised else (a, -b, ZS + w)

        v = []
        for w in (-t / 2, t / 2):
            v += [X(a, b, w) for a, b in O] + [X(a, b, w) for a, b in I]
        o0, i0, o1, i1 = 0, m, 2 * m, 3 * m
        f = []
        for k in range(m - 1):
            f.append([o0 + k, o0 + k + 1, i0 + k + 1, i0 + k])
            f.append([o1 + k, i1 + k, i1 + k + 1, o1 + k + 1])
            f.append([o0 + k, o1 + k, o1 + k + 1, o0 + k + 1])
            f.append([i0 + k, i0 + k + 1, i1 + k + 1, i1 + k])
        f.append([o0, i0, i1, o1])
        f.append([o0 + m - 1, o1 + m - 1, i1 + m - 1, i0 + m - 1])
        self.add(name, color, v, f)

    def cyl(self, name, color, c, r, h0, h1, axis="x", n=28, alpha=1.0):
        v = []
        for h in (h0, h1):
            for k in range(n):
                t = 2 * math.pi * k / n
                a, b = c[0] + r * math.cos(t), c[1] + r * math.sin(t)
                v.append((h, a, b) if axis == "x" else (a, h, b) if axis == "y" else (a, b, h))
        f = [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)]
        f += [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
        self.add(name, color, v, f, alpha)

    def uarch(self, name, color, raised):
        ro, ri, leg, t = p["ring_ro"], p["ring_ri"], p["ring_leg"], p["ring_t"]
        n = 40

        def curve(r):
            return [(r, 0), (r, leg)] + [(r * math.cos(s), leg + r * math.sin(s))
                                         for s in np.linspace(0, math.pi, n)] + [(-r, leg), (-r, 0)]

        O, I = curve(ro), curve(ri)
        m = len(O)

        def X(a, b, w):
            return (a, w, ZS + b) if raised else (a, -b, ZS + w)

        v = []
        for w in (-t / 2, t / 2):
            v += [X(a, b, w) for a, b in O] + [X(a, b, w) for a, b in I]
        o0, i0, o1, i1 = 0, m, 2 * m, 3 * m
        f = []
        for k in range(m - 1):
            f.append([o0 + k, o0 + k + 1, i0 + k + 1, i0 + k])
            f.append([o1 + k, i1 + k, i1 + k + 1, o1 + k + 1])
            f.append([o0 + k, o1 + k, o1 + k + 1, o0 + k + 1])
            f.append([i0 + k, i0 + k + 1, i1 + k + 1, i1 + k])
        f.append([o0, i0, i1, o1])
        f.append([o0 + m - 1, o1 + m - 1, i1 + m - 1, i0 + m - 1])
        self.add(name, color, v, f)


def build_model(raised, solid=False, lid=True):
    """solid=True gives opaque enclosure/guard (Windows 3D Viewer ignores transparency);
    lid=False leaves the enclosure lid off so the bays are visible."""
    M = Model()
    x = p["plate_x"]
    M.box("deck_plate", "#a9adb2", -x, x, p["plate_y0"], p["plate_y1"], -p["plate_t"], 0)
    for (a, b, c, d) in ((-x, x, p["plate_y0"], p["plate_y0"] + 25), (-x, x, p["plate_y1"] - 25, p["plate_y1"]),
                         (-x, -x + 25, p["plate_y0"], p["plate_y1"]), (x - 25, x, p["plate_y0"], p["plate_y1"])):
        M.box("frame", "#6d7177", a, b, c, d, GROUND, -p["plate_t"])
    for sx in (-1, 1):
        cx = sx * p["brg_cc"] / 2
        M.box("bearing_ucp205", "#2f7d53", cx - p["brg_A"] / 2, cx + p["brg_A"] / 2, -p["brg_L"] / 2,
              p["brg_L"] / 2, 0, p["brg_foot"])
        M.box("bearing_ucp205", "#2f7d53", cx - 17, cx + 17, -22, 22, p["brg_foot"], ZS)
        M.cyl("bearing_ucp205", "#2f7d53", (0, ZS), 34.5, cx - 17, cx + 17, "x")
        bx = sx * p["brk_x"]
        M.cyl("arch_clamp", "#7b7b7b", (0, ZS), 22.5, bx - 15, bx + 15, "x")
        if raised:
            M.box("arch_bracket", "#7b7b7b", bx - 20, bx + 20, -7.5 - 6, -7.5, ZS + 10, ZS + 70)
        else:
            M.box("arch_bracket", "#7b7b7b", bx - 20, bx + 20, -70, -10, ZS - 7.5 - 6, ZS - 7.5)
        M.box("end_stop", "#444444", bx - 12.5, bx + 12.5, p["stop_y"] - 10, p["stop_y"] + 10, 0, 110)
        M.box("rest_pad", "#222222", sx * p["rest_x"] - 20, sx * p["rest_x"] + 20, p["rest_y"] - 20,
              p["rest_y"] + 20, 0, ZS - p["ring_t"] / 2)
    M.cyl("shaft_25", "#d0d0d0", (0, ZS), p["shaft_d"] / 2, -p["shaft_len"] / 2, p["shaft_len"] / 2, "x")
    M.cyl("sprocket_big", "#8f8f8f", (0, ZS), OD_B / 2, -1.5, 1.5, "x", n=44)
    M.cyl("sprocket_big", "#8f8f8f", (0, ZS), 20, -16.5, -1.5, "x")
    M.box("imu_pod", "#3557a8", p["imu_x"] - 9, p["imu_x"] + 9, -21, 21, ZS - 21, ZS + 21)
    M.cyl("hall_collar", "#777777", (0, ZS), 19, p["hall_x"] - 6, p["hall_x"] + 6, "x")
    my, mz = p["motor_y"], p["motor_z"]
    xf = p["chain_x"] - p["motor_out"]
    M.cyl("motor_gearbox", "#bfc3c7", (my, mz), p["gb_d"] / 2, xf - p["gb_len"], xf, "x")
    M.cyl("motor_can", "#c9ccd0", (my, mz), p["can_d"] / 2, xf - p["gb_len"] - p["can_len"], xf - p["gb_len"], "x")
    M.cyl("sprocket_small", "#8f8f8f", (my, mz), OD_S / 2, -1.5, 1.5, "x", n=20)
    M.box("motor_bracket", "#555555", xf, xf + 3, my - 28, my + 28, 2, mz + 20)
    # chain strands as thin bars
    path = chain_path((0, ZS), PD_B / 2, (my, mz), PD_S / 2, n=40)
    for (a, b), (c, d) in zip(path[:-1], path[1:]):
        L = math.hypot(c - a, d - b)
        if L < 0.1:
            continue
        nx, nz = -(d - b) / L * 2, (c - a) / L * 2
        v = [(-3.5, a - nx, b - nz), (-3.5, c - nx, d - nz), (-3.5, c + nx, d + nz), (-3.5, a + nx, b + nz),
             (3.5, a - nx, b - nz), (3.5, c - nx, d - nz), (3.5, c + nx, d + nz), (3.5, a + nx, b + nz)]
        f = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
        M.add("chain_25", "#3a3a3a", v, f)
    # electronics inside the enclosure
    M.box("battery_3s2p", "#e48bd0", -195, -118, 78, 195, 3, 24)
    M.box("controller_pcb", "#2f8a4a", 30, 130, 108, 188, 10, 11.6)
    M.box("esp32_devkit", "#1b1b1b", 70, 122, 134, 162, 11.6, 22)
    M.box("ibt2_driver", "#2b66b3", 142, 192, 80, 130, 3, 46)
    ex, y0, y1, w, h = p["enc_x"], p["enc_y0"], p["enc_y1"], p["enc_wall"], p["enc_h"]
    a = 1.0 if solid else 0.28
    ec = "#7fb2d9" if solid else "#9ec9ea"
    M.box("enclosure", ec, -ex, ex, y0, y1, 0, w, a)
    M.box("enclosure", ec, -ex, ex, y0, y0 + w, w, h, a)
    M.box("enclosure", ec, -ex, ex, y1 - w, y1, w, h, a)
    M.box("enclosure", ec, -ex, -ex + w, y0, y1, w, h, a)
    M.box("enclosure", ec, ex - w, ex, y0, y1, w, h, a)
    for wx in (p["wall_bat"], p["wall_elec"]):   # bay dividers
        M.box("enclosure_divider", ec, wx - 1.5, wx + 1.5, y0 + w, y1 - w, w, h - 2, a)
    if lid:
        M.box("enclosure_lid", ec, -ex - 4, ex + 4, y0 - 4, y1 + 4, h, h + 3, a)
    g, ga = p["guard_hw"], (1.0 if solid else 0.45)
    M.box("chain_guard", "#f2c94c", -g, -g + 1.5, p["guard_y0"], y0, 0, p["guard_h"], ga)
    M.box("chain_guard", "#f2c94c", g - 1.5, g, p["guard_y0"], y0, 0, p["guard_h"], ga)
    M.box("chain_guard", "#f2c94c", -g, g, p["guard_y0"], y0, p["guard_h"] - 1.5, p["guard_h"], ga)
    M.box("chain_guard", "#f2c94c", -g, g, p["guard_y0"], p["guard_y0"] + 1.5, 0, p["guard_h"], ga)
    M.uarch("arch_rubber", "#2b2b2b", raised)
    return M


def export_obj(M, path):
    mats = {}
    with open(path, "w", encoding="utf8") as fo:
        fo.write(f"# PARKFNB barrier V2 concept assembly, units mm, z up. Rev {REV} {DATE}\n")
        fo.write(f"mtllib {os.path.basename(path)[:-4]}.mtl\n")
        base = 1
        for name, color, v, faces, alpha in M.parts:
            mname = f"m_{color.strip('#')}_{int(alpha * 100)}"
            mats[mname] = (color, alpha)
            fo.write(f"o {name}\nusemtl {mname}\n")
            for q in v:
                fo.write(f"v {q[0]:.2f} {q[1]:.2f} {q[2]:.2f}\n")
            for fc in faces:
                fo.write("f " + " ".join(str(base + i) for i in fc) + "\n")
            base += len(v)
    with open(path[:-4] + ".mtl", "w", encoding="utf8") as fm:
        for mname, (color, alpha) in mats.items():
            r, g, b = (int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
            fm.write(f"newmtl {mname}\nKd {r:.3f} {g:.3f} {b:.3f}\nKa 0.1 0.1 0.1\nd {alpha:.2f}\n\n")


def render_iso(ax, M, ox, oy, sc, cam=(1.0, -1.25, 0.95)):
    v = np.array(cam, float)
    v /= np.linalg.norm(v)
    fwd = -v
    right = np.cross(fwd, [0, 0, 1.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    light = np.array([0.35, -0.55, 0.75])
    light /= np.linalg.norm(light)
    polys, cols, depth = [], [], []
    for name, color, verts, faces, alpha in M.parts:
        rgb = np.array([int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)])
        for fc in faces:
            q = verts[fc]
            nrm = np.cross(q[1] - q[0], q[2] - q[0])
            if np.linalg.norm(nrm) < 1e-9 and len(q) > 3:
                nrm = np.cross(q[2] - q[0], q[3] - q[0])
            nn = np.linalg.norm(nrm)
            nrm = nrm / nn if nn > 1e-9 else np.array([0, 0, 1.0])
            if alpha >= 1 and np.dot(nrm, v) < -1e-6:
                continue  # back face of an opaque solid
            shade = 0.5 + 0.5 * abs(np.dot(nrm, light))
            polys.append([(ox + sc * np.dot(r, right), oy + sc * np.dot(r, up)) for r in q])
            cols.append((*np.clip(rgb * shade, 0, 1), alpha))
            depth.append(np.mean(q @ v))
    order = np.argsort(depth)
    pc = PolyCollection([polys[i] for i in order], facecolors=[cols[i] for i in order],
                        edgecolors=[(0, 0, 0, 0.18 * cols[i][3]) for i in order], linewidths=0.15, zorder=3)
    ax.add_collection(pc)


# --------------------------------------------------------------------------------------
# DXF set-up
# --------------------------------------------------------------------------------------
doc = ezdxf.new("R2010", setup=True)
doc.units = ezdxf.units.MM
doc.header["$LTSCALE"] = 4
for k, (name, color, lt) in DXF_LAYERS.items():
    if name not in doc.layers:
        doc.layers.add(name, color=color, linetype=lt)
ds = doc.dimstyles.duplicate_entry("EZDXF", "PFNB")
ds.dxf.dimtxt = 6
ds.dxf.dimasz = 4
ds.dxf.dimexe = 2
ds.dxf.dimexo = 2
ds.dxf.dimgap = 1.5
ds.dxf.dimdec = 1
ds.dxf.dimzin = 8
ds.dxf.dimtad = 1
msp = doc.modelspace()

DXF_OFF = dict(plan=(0, 0), front=(0, 520), section=(700, 520), enc=(700, 0), pcb=(1300, 0))


def dxf_label(key, s):
    x, y = DXF_OFF[key]
    msp.add_text(s, height=12, dxfattribs={"layer": "TEXT"}).set_placement(
        (x - 240, y + (360 if key in ("front", "section") else 300)), align=TextEntityAlignment.BOTTOM_LEFT)


sheets = []

# ======================================================================================
# SHEET 1 - cover, index, decisions, dimension register
# ======================================================================================
fig, ax = new_sheet(1, "COVER, KEY DECISIONS & DIMENSION REGISTER", "-")
ax.text(20, 276, "PARKFNB Smart Parking Barrier", fontsize=19, weight="bold", va="top")
ax.text(20, 266, "Prototype V2  -  Concept CAD drawing set (mechanical + enclosure + PCB + wiring + timeline)",
        fontsize=9.5, va="top", color="#333")
ax.text(20, 259.5, f"Rev {REV}  |  {DATE}  |  all dimensions in mm  |  generated by generate_cad.py (parametric - edit and re-run)",
        fontsize=6.5, va="top", color="#666")
# the cover image is drawn at the end of the script, once the Rev B shell model exists

idx = [("1", "Cover, key decisions, dimension register"), ("2", "General assembly - plan view"),
       ("3", "General assembly - front elevation + section A-A"), ("4", "Drive detail - chain, sprockets, motor mount"),
       ("5", "Common enclosure - layout and cut-outs"), ("6", "Controller PCB 100 x 80 - placement and pinout"),
       ("7", "Wiring diagram and ESP32 pin map"), ("8", "3D views and arch sweep clearance"),
       ("9", "Bill of materials and budget"), ("10", "Timeline (Day 1 = 27 Oct 2026) and release gates"),
       ("11", "REV B  Drive-over steel shell - overview"), ("12", "REV B  Shell sections, arm slit, load path"),
       ("13", "REV B  Wheel-load check, parts, budget, open items")]
table(ax, 205, 256, ["SHEET", "CONTENT"], idx, [14, 80], rh=4.3, size=5.4)
ax.text(20, 254, "REV B: sheets 11-13 add a full drive-over steel shell (ramps, tray, hatches) that covers everything.\n"
        "Sheets 2-8 show the internals with the shell removed.", fontsize=6.2, va="top", color="#a02020", weight="bold")

note_block(ax, 312, 256, "KEY V2 DECISIONS", [
    "1  Reuse V1 shaft (25 x 406), both UCP205",
    "    bearings, rubber U-arch, geared motor,",
    "    chain and both sprockets.",
    "2  Motor is re-mounted BEHIND the shaft",
    "    (rear, +y). The arch only sweeps the",
    "    front quarter, so the drive and all",
    "    electronics sit in space it never enters.",
    "3  One common rear enclosure, 3 bays:",
    "    battery | drive | electronics.",
    "4  Removable chain guard bridges the shaft",
    "    and the enclosure (no open pinch point).",
    "5  5 mm steel deck on a 25 mm angle frame;",
    "    the big sprocket dips 10 mm below the",
    "    deck through a slot into a closed pan.",
    "6  Angle: MPU6050 pod on the shaft (as in",
    "    firmware). End confirmation: 2 Hall sensors",
    "    (DOWN 0 deg / UP 90 deg) + rubber rests",
    "    at 0 deg and hard stops at 90 deg.",
    "7  Physical ON/OFF + charge jack on the",
    "    battery-bay wall; ESP32 updated by OTA.",
], size=5.5, lh=3.35)

rows = [
    ("Shaft", "dia 25 x 406 (16 in)", "M", "sketch"),
    ("Pillow blocks", "UCP205: base 140 x 38, CH 36.5, bolts 105 c/c", "C", "catalogue; sketch 130 x 30"),
    ("Bearing spacing", "130 c/c", "E", "tape photo, +/-5"),
    ("Arch (U)", "16 in wide, 8 in opening, 6 in deep opening", "M", "sketch"),
    ("Arch derived", f"R{fmt(p['ring_ro'])} / R{fmt(p['ring_ri'])}, legs {fmt(p['ring_leg'])}, reach 254", "E", "fits sketch + photo"),
    ("Arch thickness", "15", "M", "sketch (1.5 cm)"),
    ("Chain envelope", "165 x 52.5", "M", "sketch"),
    ("Chain", "#25 (6.35 pitch) roller chain", "E", "roller spacing in photo"),
    ("Sprockets", f"{p['n_big']}T (OD {OD_B:.0f}) / {p['n_small']}T (OD {OD_S:.0f})", "E", "COUNT THE TEETH"),
    ("Chain c/c", f"{C_NOM:.0f} (range 90-120)", "E", "photos + sketch"),
    ("Motor", "gearbox dia 45, can dia 36, 77.5 long", "M", "sketch 7.75 x 4.5 cm"),
    ("Motor rating", "12 V, ~30 RPM (label)", "E", "label partly hidden"),
    ("IBT-2 (BTS7960)", "50 x 50 x 43", "C", "tape approx. 50"),
    ("ESP32 DevKit", "30-pin, approx. 55 x 28", "M", "tape approx. 55"),
    ("V1 perfboard", "100 x 150", "M", "PY-10x15CM label"),
    ("V1 cell holder", "4 x 18650, approx. 80 x 77 x 21", "M", "tape approx. 80"),
    ("Electronics area", "110 x 70 (V1 allowance)", "M", "sketch"),
]
yy = table(ax, 20, 118, ["ITEM", "VALUE USED IN THIS CAD", "SRC", "BASIS"], rows, [30, 72, 9, 40], rh=4.25, size=5.1,
           bold_col0=True)
ax.text(20, yy - 3, "SRC:  M = measured by team (sketch / tape)   C = catalogue standard   E = estimated from photos, "
        "VERIFY before fabrication   D = V2 design choice", fontsize=5.0, va="top", color="#a02020")
note_block(ax, 180, 118, "HOW TO USE THIS SET", [
    "-  Every 'E' value is a parameter at the top of generate_cad.py.",
    "    Measure it on V1, edit the number, run  python generate_cad.py.",
    "    PDF, DXF and 3D model all regenerate together.",
    "-  DXF (1:1 mm, layered) opens in AutoCAD / LibreCAD / DraftSight.",
    "-  3D model (.obj) opens in Windows 3D Viewer, Blender, Fusion.",
    "-  Fabrication release only after the Sheet 10 gates are signed.",
], size=5.5, lh=3.4)
note_block(ax, 180, 88, "MEASURE ON V1 TO FREEZE THE CAD (10 min with a vernier)", [
    "1  Tooth count of both sprockets; chain pitch (rollers over 10 links / 10).",
    "2  Exact chain centre distance and motor shaft height above the deck.",
    "3  Bearing centre spacing and shaft overhang to each arch bracket.",
    "4  Arch: weight (kg), thickness, inner/outer width, depth of opening.",
    "5  Motor stall current at 12 V (clamp meter) - sets fuse, wire, switch.",
    "6  ESP32 board header row spacing (22.86 or 25.4) - sets PCB footprint.",
], size=5.5, lh=3.4)
sheets.append(fig)

# ======================================================================================
# SHEET 2 - plan view
# ======================================================================================
fig, ax = new_sheet(2, "ASSEMBLY - PLAN VIEW (SHELL REMOVED)", "1 : 2.5")
SC = 1 / 2.5
V = View(ax, 140, 160, SC, msp, *DXF_OFF["plan"])
plan_view(V)
dxf_label("plan", "PLAN VIEW (arch lowered)")
V.dim((-p["plate_x"], p["plate_y1"]), (p["plate_x"], p["plate_y1"]), 22)
V.dim((-p["anchor_x"], p["anchor_y1"]), (p["anchor_x"], p["anchor_y1"]), 34)
V.dim((-p["plate_x"], p["plate_y0"]), (-p["plate_x"], p["plate_y1"]), -40, "v")
V.dim((-p["anchor_x"], p["anchor_y0"]), (-p["anchor_x"], p["anchor_y1"]), -48, "v")
V.dim((-p["shaft_len"] / 2, 0), (p["shaft_len"] / 2, 0), -300)
V.dim((-p["ring_ri"], -p["ring_leg"]), (p["ring_ri"], -p["ring_leg"]), -235)
V.dim((-p["brg_cc"] / 2, -p["brg_L"] / 2), (p["brg_cc"] / 2, -p["brg_L"] / 2), -12)
V.dim((p["plate_x"], 0), (p["plate_x"], -p["ring_leg"] - p["ring_ro"]), 30, "v")
V.dim((p["ring_ri"], 0), (p["ring_ri"], -p["ring_leg"] - p["ring_ri"]), -18, "v")
V.dim((p["enc_x"], 0), (p["enc_x"], p["enc_y0"]), 38, "v")
V.dim((p["enc_x"], p["enc_y0"]), (p["enc_x"], p["enc_y1"]), 38, "v")
V.dim((-p["enc_x"], p["enc_y1"]), (p["enc_x"], p["enc_y1"]), 8)
V.dim((-p["guard_hw"], p["guard_y0"]), (p["guard_hw"], p["guard_y0"]), -8)
V.dim((p["brk_x"], -70), (-p["brk_x"], -70), -175)
V.text(0, -300 - 12, "", dxf=False)
balloons = [
    ((-80, -150), (-300, -150), 1), ((0, 0), (-300, -40), 2), ((-65, 40), (-300, 0), 3),
    ((-152, -40), (-300, -90), 4), ((10, -40), (60, -300 + 25), 5), ((0, 60), (-300, 50), 6),
    ((-150, 150), (-300, 150), 7), ((80, 150), (300, 160), 8), ((167, 105), (300, 120), 9),
    ((-60, 110), (-300, 100), 10), ((p["imu_x"], 15), (300, 40), 11), ((p["hall_x"], 25), (-300, 20), 12),
    ((150, -160), (300, -170), 13), ((152, 25), (300, 0), 14), ((225, -250), (300, -255), 15),
    ((0, 40), (300, 70), 16),
]
for (u, v), (bu, bv), n in balloons:
    V.balloon(u, v, bu, bv, n)
ax.text(140 - 230 * SC, 160 + 240 * SC + 12, "PLAN VIEW - arch lowered (0 deg, open)  -  barrier side at bottom, "
        "rear enclosure at top", fontsize=6.2, weight="bold")
ax.text(140 + 0, 160 - 290 * SC - 12, "A", fontsize=8, weight="bold", ha="center")
V.line([(0, -268), (0, -282)], "out")
V.line([(0, 212), (0, 228)], "out")
ax.text(140, 160 + 232 * SC + 1, "A", fontsize=8, weight="bold", ha="center")
items = [("1", "Rubber U-arch (V1, reused)"), ("2", "Shaft dia 25 x 406 (V1)"), ("3", "UCP205 pillow block x2 (V1)"),
         ("4", "Arch clamp bracket x2 (new)"), ("5", "Chain guard, 1.5 mm, removable"), ("6", "Shaft sprocket, est. 44T #25"),
         ("7", "Battery bay: 3S2P + BMS"), ("8", "Controller PCB 100 x 80"), ("9", "IBT-2 BTS7960 driver"),
         ("10", "Drive bay: geared motor (V1)"), ("11", "MPU6050 pod on shaft"), ("12", "Hall magnet collar + 2 sensors"),
         ("13", "Rubber rest pad x2 (0 deg)"), ("14", "Hard stop x2 (90 deg)"), ("15", "Anchor hole dia 12 x4 (M10)"),
         ("16", "Deck slot 20 x 80 + under-pan")]
yy = table(ax, 300, 276, ["#", "PART"], items, [8, 92], rh=4.2, size=5.2)
note_block(ax, 300, yy - 6, "NOTES", [
    "1  Deck: 5 mm MS plate, frame 25x25x3 angle all round,",
    "    zinc-rich primer + PU paint. Frame drawn hidden.",
    "2  Bearing spacing 130 is a photo estimate - set from V1.",
    "3  Arch clamp: split collar dia 45 x 30 on the shaft, 6 mm",
    "    plate along the leg, 2 x M8 through the rubber.",
    "4  Keep everything forward of the shaft (barrier side)",
    "    below z = 29 - that is where the arch lies at 0 deg.",
    "5  Enclosure sits 2 mm behind the bearing bases.",
    "6  Section A-A: see Sheet 3 (chain plane, x = 0).",
], size=5.3, lh=3.3)
sheets.append(fig)

# ======================================================================================
# SHEET 3 - front elevation + section A-A
# ======================================================================================
fig, ax = new_sheet(3, "ASSEMBLY - ELEVATION + SECTION A-A (SHELL OFF)", "1 : 3")
SC = 1 / 3
V = View(ax, 108, 150, SC, msp, *DXF_OFF["front"])
front_view(V)
dxf_label("front", "FRONT ELEVATION (arch raised 90 deg)")
top = ZS + p["ring_leg"] + p["ring_ro"]
V.dim((-p["plate_x"], GROUND), (-p["plate_x"], top), -36, "v")
V.dim((-p["plate_x"], 0), (-p["plate_x"], top), -22, "v")
V.dim((p["plate_x"], 0), (p["plate_x"], ZS), 18, "v")
V.dim((p["plate_x"], GROUND), (p["plate_x"], 0), 18, "v")
V.dim((p["plate_x"], 0), (p["plate_x"], p["enc_h"]), 34, "v")
V.dim((p["plate_x"], 0), (p["plate_x"], p["guard_h"]), 50, "v")
V.dim((-p["ring_ro"], top), (p["ring_ro"], top), 14)
V.dim((-p["ring_ri"], ZS + p["ring_leg"]), (p["ring_ri"], ZS + p["ring_leg"]), 20)
V.dim((-p["plate_x"], GROUND), (p["plate_x"], GROUND), -22)
V.dim((-p["brg_cc"] / 2, 0), (p["brg_cc"] / 2, 0), -12)
V.dim((p["ring_ri"] + 5, ZS), (p["ring_ri"] + 5, ZS + p["ring_leg"] + p["ring_ri"]), 0.01, "v",
      txt=f"{fmt(p['ring_leg'] + p['ring_ri'])}")
ax.text(108 - 245 * SC, 150 + 330 * SC + 5, "FRONT ELEVATION - viewed from the barrier side, arch raised (90 deg)",
        fontsize=6.2, weight="bold")

V2 = View(ax, 305, 150, SC, msp, *DXF_OFF["section"])
section_view(V2)
dxf_label("section", "SECTION A-A (chain plane x=0)")
V2.dim((p["plate_y0"], top), (0, top), 12, txt="270")
V2.dim((0, ZS), (0, ZS + p["ring_leg"] + p["ring_ro"]), -70, "v", txt="254")
V2.dim((0, 0), (p["motor_y"], 0), -14)
V2.dim((p["enc_y0"], p["enc_h"]), (p["enc_y1"], p["enc_h"]), 12)
V2.dim((0, p["enc_h"]), (p["enc_y0"], p["enc_h"]), 12)
V2.dim((p["plate_y1"], 0), (p["plate_y1"], p["enc_h"]), 12, "v")
V2.dim((p["guard_y0"], p["guard_h"]), (0, p["guard_h"]), 10)
V2.dim((p["plate_y0"], 0), (p["plate_y0"], ZS - p["ring_t"] / 2), -12, "v", txt="29")
V2.text(-200, ZS + 22, "ARCH 0 deg", 4.8, dxf=False)
V2.text(32, 255, "ARCH 90 deg\n(phantom)", 4.8, ha="left", color="#1f5fae", dxf=False)
V2.text(-150, 210, "SWEEP\nR152.5 - R254", 4.6, color="#1f5fae", dxf=False)
V2.text(136, 40, "ENCLOSURE\n(drive bay)", 4.6, color="#333", dxf=False)
ax.text(305 - 270 * SC, 150 + 330 * SC + 5, "SECTION A-A - through chain plane (x = 0), viewed from the right",
        fontsize=6.2, weight="bold")
note_block(ax, 20, 64, "HEIGHTS (above ground)", [
    f"Shaft axis ........................ {ZS - GROUND:.1f}",
    f"Arch top, lowered (0 deg) ......... {ZS + p['ring_t'] / 2 - GROUND:.1f}",
    f"Arch top, raised (90 deg) ......... {top - GROUND:.1f}",
    f"Enclosure lid ..................... {p['enc_h'] + 3 - GROUND:.0f}",
    f"Chain guard (highest fixed part) .. {p['guard_h'] - GROUND:.0f}",
], size=5.6, lh=3.5)
note_block(ax, 100, 64, "NOTES", [
    "1  The arch rotates 90 deg about the shaft axis. Its swept",
    "    zone is the FRONT quarter only (blue phantom). Nothing",
    "    fixed may enter it - see Sheet 8.",
    "2  Rest pads carry the arch at 0 deg so the shaft is not",
    "    loaded in bending when a wheel rolls over it.",
    "3  Hard stops take the arch at 90 deg; Hall UP sensor",
    "    must trip 2-3 deg before the stop.",
    "4  Big sprocket bottom is ~10 below deck: closed pan.",
], size=5.4, lh=3.3)
sheets.append(fig)

# ======================================================================================
# SHEET 4 - drive detail 1:1
# ======================================================================================
fig, ax = new_sheet(4, "DRIVE DETAIL - CHAIN, SPROCKETS, MOTOR MOUNT (SECTION A-A)", "1 : 1")
# only the region round the drive, at 1:1
V = View(ax, 95, 105, 1.0, clip=(18, 52, 225, 222))
section_view(V, rollers=True)
ax.add_patch(Rectangle((18, 52), 225, 222, fc="none", ec="#999", lw=0.3, ls="--"))
my, mz = p["motor_y"], p["motor_z"]
V.dim((0, ZS), (my, ZS), 62, txt=f"{p['motor_y']:.0f} (+/-6 slot)")
V.dim((my, mz), (my, ZS), 42, "v", txt=f"{ZS - mz:.0f}")
V.dim((-OD_B / 2, ZS), (OD_B / 2, ZS), 56, txt=f"OD {OD_B:.1f}")
V.dim((0, 0), (0, ZS), -62, "v")
V.dim((my - OD_S / 2, mz), (my + OD_S / 2, mz), -40, txt=f"OD {OD_S:.1f}")
V.dim((-35, -p["plate_t"]), (45, -p["plate_t"]), -22, txt="SLOT 80 (x20 wide)")
V.dim((-40, -20), (-40, 0), -10, "v")
V.text(-74, 92, "SHAFT SPROCKET", 5.5, ha="left", weight="bold")
V.text(my - 12, 66, "MOTOR SPROCKET", 5.5, ha="left", weight="bold")
V.text(122, 18, "L-BRACKET, SLOTTED\nFOR CHAIN TENSION", 5.0, ha="left")
V.text(-48, -26, "UNDER-DECK PAN 1.2 mm", 5.0, ha="left")
V.text(55, 92, "GUARD (sloped top)", 5.0, ha="left")
V.text(-70, 140, f"#25 chain, {LINKS} links, pitch 6.35 - rollers drawn to scale", 5.2, ha="left", color="#444")
ax.text(20, 280, "SECTION A-A ENLARGED  (1:1 on A3)", fontsize=7, weight="bold", va="top")

chain_rows = [
    ("Chain", "ANSI #25 / 04C, pitch 6.35 (E)"),
    ("Shaft sprocket", f"{p['n_big']}T, PD {PD_B:.1f}, OD {OD_B:.1f}, bore 25 + set screws (E)"),
    ("Motor sprocket", f"{p['n_small']}T, PD {PD_S:.1f}, OD {OD_S:.1f}, bore to motor shaft (E)"),
    ("Centre distance", f"{C_NOM:.1f} nominal; {C_EXACT:.1f} for {LINKS} links"),
    ("Chain length", f"{LINKS} links (even), {LINKS * p['chain_p']:.0f} mm"),
    ("Reduction", f"{RATIO:.2f} : 1"),
    ("Shaft speed", f"{SHAFT_RPM:.1f} RPM at {p['motor_rpm']:.0f} RPM motor"),
    ("0 -> 90 deg time", f"{T90:.1f} s (firmware MOVE_TIMEOUT 8 s)"),
    ("Arch mass (est.)", f"{ARCH_KG:.1f} kg (area x 15 mm x 1.15 g/cc x 1.4)"),
    ("Arch CG from shaft", f"{ARCH_CG:.0f} mm"),
    ("Holding torque, shaft", f"{T_SHAFT:.2f} N.m (arch horizontal, worst case)"),
    ("Needed at motor", f"{T_MOTOR_KGCM:.1f} kg.cm incl. 85 % chain eff."),
    ("Tension", "slotted bracket +/-6 mm, sag 1-2 mm mid-span"),
]
yy = table(ax, 255, 276, ["DRIVE DATA", "VALUE"], chain_rows, [38, 115], rh=4.3, size=5.2, bold_col0=True)
note_block(ax, 255, yy - 6, "NOTES", [
    "1  Tooth counts and chain c/c are photo estimates. Count the",
    "    teeth, enter n_big / n_small / motor_y in generate_cad.py.",
    "2  Same chain and sprockets as V1. Only the motor moves to the",
    "    rear: mirror its bracket about the shaft and re-tension.",
    "3  Lock both sprockets with 2 set screws on a flat (or keyway);",
    "    Loctite 243. Align sprockets to < 0.5 mm with a straight edge.",
    "4  Weigh the arch. If the motor needs more than ~50 % of its",
    "    rated torque, add a gas spring or counter-spring.",
    "5  Guard: 1.5 mm GI sheet, two halves, open-bottom slots round",
    "    the shaft, 4 x M5 to deck + 2 x M4 to the enclosure flange.",
    "6  Chain lube: dry PTFE. Inspect stretch every 5,000 cycles.",
], size=5.3, lh=3.3)
# motor bracket detail
VB = View(ax, 300, 108, 0.8)
ax.text(255, 150, "MOTOR BRACKET FOOT - TOP VIEW (1 : 1.25)", fontsize=6, weight="bold")
VB.rect(-30, 30, -15, 15, fill="#cccccc")
for sx in (-1, 1):
    VB.line([(sx * 20 - 3.25, -6), (sx * 20 - 3.25, 6)], "thin")
    VB.line([(sx * 20 + 3.25, -6), (sx * 20 + 3.25, 6)], "thin")
    VB.arc(sx * 20, 6, 3.25, 0, 180, "thin")
    VB.arc(sx * 20, -6, 3.25, 180, 360, "thin")
VB.dim((-20, 15), (20, 15), 8)
VB.dim((30, -9.25), (30, 9.25), 8, "v", txt="SLOT 12 + 6.5")
VB.text(-30, -24, "2 x M6, slots run along y (chain direction)", 4.8, ha="left")
sheets.append(fig)

# ======================================================================================
# SHEET 5 - enclosure
# ======================================================================================
fig, ax = new_sheet(5, "COMMON ENCLOSURE - LAYOUT, WALL CUT-OUTS, SEALING", "1 : 2")
SC = 0.5
ex, y0, y1, w, h = p["enc_x"], p["enc_y0"], p["enc_y1"], p["enc_wall"], p["enc_h"]
V = View(ax, 125, 160, SC, msp, DXF_OFF["enc"][0], DXF_OFF["enc"][1] - 72)
V.rect(-ex, ex, y0, y1, fill=FILL["enc"], alpha=0.5)
V.rect(-ex + w, ex - w, y0 + w, y1 - w, "thin")
for wx in (p["wall_bat"], p["wall_elec"]):
    V.rect(wx - 1.5, wx + 1.5, y0 + w, y1 - w, "out", fill="#7aa7cc")
V.rect(-195, -118, 78, 195, fill=FILL["bat"], alpha=0.6)
V.text(-156.5, 150, "3S2P 18650\nPACK + BMS\n77 x 117 x 21", 4.6)
V.rect(-180, -140, 80, 92, "thin", fill="#555", alpha=0.4)
V.text(-160, 86, "FUSE 15A", 3.8, color="white")
xf = p["chain_x"] - p["motor_out"]
my = p["motor_y"]
V.rect(xf - p["gb_len"], xf, my - p["gb_d"] / 2, my + p["gb_d"] / 2, fill=FILL["motor"])
V.rect(xf - p["gb_len"] - p["can_len"], xf - p["gb_len"], my - p["can_d"] / 2, my + p["can_d"] / 2, fill="#d4d4d4")
V.rect(xf, xf + 3, my - 28, my + 28, fill="#555")
V.rect(-1.5, 1.5, my - OD_S / 2, my + OD_S / 2, fill="#888")
V.text(-60, my, "MOTOR (V1)", 4.6)
V.rect(-12, 12, y0, y0 + w, "out", fill="white")
V.text(0, 66, "CHAIN\nOPENING", 4.0, dxf=False)
V.rect(30, 130, 108, 188, fill=FILL["pcb"], alpha=0.75)
V.text(80, 182, "CONTROLLER PCB", 4.6, color="white")
V.rect(70, 122, 134, 162, fill="#1b1b1b", alpha=0.85)
V.text(96, 148, "ESP32", 4.4, color="white")
V.rect(142, 192, 80, 130, fill=FILL["ibt"], alpha=0.8)
V.text(167, 105, "IBT-2\n+heatsink", 4.4, color="white")
for (u, v) in ((-ex + 10, y0 + 10), (ex - 10, y0 + 10), (-ex + 10, y1 - 10), (ex - 10, y1 - 10), (0, y1 - 10),
               (0, y0 + 10)):
    V.circle(u, v, 3.3, "thin")
V.dim((-ex, y1), (ex, y1), 10)
V.dim((ex, y0), (ex, y1), 10, "v")
V.dim((-ex, y0), (p["wall_bat"], y0), -10)
V.dim((p["wall_bat"], y0), (p["wall_elec"], y0), -10)
V.dim((p["wall_elec"], y0), (ex, y0), -10)
ax.text(25, 268, "TOP VIEW, LID REMOVED  (internal layout)", fontsize=6.5, weight="bold")
ax.text(25, 264, "Battery bay | Drive bay (guarded, not sealed) | Electronics bay (sealed)", fontsize=5.2, color="#444")

# front wall (y = y0, facing the shaft) viewed from the shaft side
VF = View(ax, 125, 130, SC)
VF.rect(-ex, ex, 0, h, fill=FILL["enc"], alpha=0.5)
VF.rect(-ex - 4, ex + 4, h, h + 3, "thin")
VF.rect(-12, 12, 3, 60, "out", fill="white")
for gx in (60, 95):
    VF.circle(gx, 32, 6.25, fill="white")
VF.circle(p["wall_bat"] + 0, 40, 0.01, "thin")
VF.dim((-12, 60), (12, 60), 10)
VF.dim((12, 3), (12, 60), 8, "v")
VF.dim((0, 0), (60, 0), -10)
VF.dim((60, 0), (95, 0), -10)
VF.dim((ex, 0), (ex, h), 10, "v")
VF.text(60, 18, "G1", 4.6)
VF.text(95, 18, "G2", 4.6)
ax.text(25, 168, "FRONT WALL - seen from the shaft (y = 72)", fontsize=6.5, weight="bold")

# left wall (x = -200) viewed from outside
VL = View(ax, 300, 130, SC)
VL.rect(y0, y1, 0, h, fill=FILL["enc"], alpha=0.5)
VL.rect(y0 - 4, y1 + 4, h, h + 3, "thin")
VL.rect(y1 - 60 - 15, y1 - 60 + 15, 32 - 11, 32 + 11, "out", fill="white")
VL.circle(y0 + 35, 32, 6, fill="white")
VL.circle(y0 + 75, 32, 6, fill="white")
VL.text(y1 - 60, 14, "SW1", 4.6)
VL.text(y0 + 35, 18, "J-CHG", 4.4)
VL.text(y0 + 75, 18, "VENT", 4.4)
VL.dim((y1 - 75, 21), (y1 - 45, 21), -12, txt="30")
VL.dim((y1 - 45, 21), (y1 - 45, 43), 10, "v", txt="22")
VL.dim((y0, 0), (y0 + 35, 0), -10)
VL.dim((y0 + 35, 0), (y0 + 75, 0), -10)
ax.text(255, 168, "LEFT WALL (battery bay) - seen from outside", fontsize=6.5, weight="bold")

cut = [
    ("SW1", "ON/OFF rocker, >=16 A @ 12 VDC", "Left wall", "30 x 22 rect", "IP65 boot"),
    ("J-CHG", "Charge jack 5.5/2.1 or XT30 panel", "Left wall", "dia 12", "rubber cap"),
    ("VENT", "Pressure vent, M12 membrane", "Left wall", "dia 12.2", "battery bay"),
    ("G1", "PG7 gland - Hall sensors cable", "Front wall", "dia 12.5", "6-core"),
    ("G2", "PG7 gland - IMU pod cable", "Front wall", "dia 12.5", "4-core shield"),
    ("CH", "Chain opening (drive bay)", "Front wall", "24 x 57", "under guard"),
    ("GR1", "Grommet battery -> drive bay", "Wall x=-115", "dia 10", "B+ / B-"),
    ("GR2", "Grommet drive -> electronics", "Wall x=+20", "dia 10", "motor + power"),
    ("LED", "Bi-colour status LED, panel", "Lid", "dia 8", "over PCB"),
    ("BZ", "Buzzer sound holes 4 x dia 2", "Lid", "-", "membrane inside"),
    ("FIX", "Floor to deck, M6 x6", "Floor", "dia 6.6", "EPDM gasket"),
    ("LID", "Lid screws M4 x10, EPDM 3 mm", "Lid", "dia 4.5", "per bay"),
]
table(ax, 255, 276, ["ID", "FEATURE", "WHERE", "HOLE", "NOTE"], cut, [11, 58, 22, 18, 24], rh=4.2, size=4.9,
      bold_col0=True)
note_block(ax, 255, 108, "MATERIAL & SEALING", [
    "Option A: 1.5 mm GI/SS sheet, folded + spot-welded, powder coat.",
    "Option B: 3 mm ASA/PETG 3D print (prototype) - UV-stable ASA.",
    "Battery + electronics bays sealed: full-height walls, lid gasket",
    "per bay. Drive bay is guarded but vented (chain passes through).",
    "IBT-2 heatsink faces the right wall; on metal option add a 1 mm",
    "thermal pad to the wall. Moves are ~2 s, so duty is low.",
    "Lid tamper micro-switch (GPIO 23) under the electronics-bay lid.",
    "No IP rating is claimed until a spray/dust test is done.",
], size=5.2, lh=3.3)
note_block(ax, 25, 98, "INTERNAL WIRING ROUTE", [
    "Battery (+) -> 15 A blade fuse -> SW1 -> GR1 -> drive bay bus -> GR2 -> IBT-2 B+ and PCB J1.",
    "Motor leads stay in the drive bay; IBT-2 M+/M- reach them through GR2 (1.0 mm2, twisted).",
    "Signal cables (Hall, IMU) enter only the electronics bay via G1/G2; never share a gland with power.",
    "Star ground at PCB J1 (-). Battery (-) wire 1.5 mm2 straight to IBT-2 B-, then 0.5 mm2 to PCB.",
], size=5.3, lh=3.5)
sheets.append(fig)

# ======================================================================================
# SHEET 6 - PCB
# ======================================================================================
fig, ax = new_sheet(6, "CONTROLLER PCB 100 x 80 (2-LAYER) - PLACEMENT & CONNECTORS", "1.5 : 1")
SC = 1.5
V = View(ax, 30, 140, SC, msp, *DXF_OFF["pcb"])
V.rect(0, 100, 0, 80, "elec", fill="#2f8a4a", alpha=0.22)
for (u, v) in ((4, 4), (96, 4), (4, 76), (96, 76)):
    V.circle(u, v, 1.6, "elec")
    V.circle(u, v, 3.2, "hid")
V.rect(0, 36, 0, 80, "hid")
V.text(18, 2.5, "POWER / NOISY ZONE", 4.6, color="#7a1f1f", dxf=False)
V.text(68, 2.5, "LOGIC ZONE", 4.6, color="#1f3f6f", dxf=False)
# components
comp = [
    ("J1", 2, 58, 10, 18, "BAT IN\n5.08 2P", "#444"),
    ("F2", 14, 66, 10, 6, "1A", "#a33"),
    ("Q1", 14, 56, 7, 6, "P-FET", "#333"),
    ("D1", 14, 48, 6, 4, "TVS", "#333"),
    ("U1", 4, 22, 28, 22, "BUCK 5V 3A\nLM2596S-5", "#555"),
    ("J2", 2, 4, 22, 6, "IBT-2 CTRL 8P", "#444"),
    ("U2", 38, 8, 12, 8, "74AHCT125", "#333"),
    ("BZ1", 38, 58, 12, 12, "BUZ", "#222"),
    ("Q2", 40, 50, 6, 5, "NPN", "#333"),
]
for name, u, v, wd, ht, lab, col in comp:
    V.rect(u, u + wd, v, v + ht, "elec", fill=col, alpha=0.75)
    V.text(u + wd / 2, v + ht / 2, lab, 3.6, color="white")
# ESP32 DevKit footprint, antenna end overhangs the right edge
eu0, ev0 = 48.0, 26
V.rect(eu0, eu0 + 55, ev0, ev0 + 28, "elec", fill="#1b1b1b", alpha=0.75)
for k in range(15):
    for row in (ev0 + 2.5, ev0 + 28 - 2.5):
        V.circle(eu0 + 4 + k * 2.54, row, 0.5, "elec")
V.rect(eu0 + 55 - 6, eu0 + 55, ev0 + 3, ev0 + 25, "hid")
V.text(eu0 + 22, ev0 + 14.2, "ESP32 DevKit V1 (30-pin)\non 2 x 15 female headers", 3.8, color="white")
V.text(eu0 + 4, ev0 + 14.2, "USB", 3.4, color="#ddd", rot=90)
V.rect(84, 103, 20, 60, "phan")
V.text(93, 63, "ANTENNA KEEP-OUT\nno copper both layers", 3.6, color="#1f5fae", dxf=False)
# top-edge connectors
tops = [("J4", 40, "HALL DN"), ("J5", 52, "HALL UP"), ("J6", 64, "IMU 4P"), ("J7", 77, "LED/BZ"), ("J8", 88, "TAMP")]
for name, u, lab in tops:
    V.rect(u - 4.5, u + 4.5, 74, 79, "elec", fill="#f2f2f2")
    V.text(u, 71.5, f"{name}\n{lab}", 3.2, color="#111")
# test points
for k, (u, v, lab) in enumerate([(34, 46, "VB"), (34, 40, "5V"), (48, 22, "3V3"), (60, 20, "IS"),
                                 (72, 20, "VBS"), (34, 34, "GND")]):
    V.circle(u, v, 1.0, "elec", fill="#d4a017")
    V.text(u + 1.6, v, lab, 3.2, ha="left", color="#111")
V.circle(10, 52, 1.6, "out", fill="#111")
V.text(10, 49, "STAR GND", 3.2, color="#111")
V.dim((0, 80), (100, 80), 10)
V.dim((100, 0), (100, 80), 12, "v")
V.dim((0, 0), (4, 0), -8)
V.dim((0, 4), (0, 76), -10, "v", txt="72")
V.dim((4, 0), (96, 0), -14, txt="92")
ax.text(30, 278, "PCB TOP SIDE (component placement concept)", fontsize=6.6, weight="bold", va="top")
ax.text(30, 273, "Motor current does NOT flow through this board - it goes battery -> fuse -> switch -> IBT-2 directly.",
        fontsize=5.3, va="top", color="#444")
conn = [
    ("J1", "BAT IN", "VBAT (+), GND (star)", "5.08 screw 2P"),
    ("J2", "IBT-2", "VCC5, GND, RPWM, LPWM, R_EN, L_EN, R_IS, L_IS", "2.54 8P box hdr"),
    ("J4", "HALL DOWN", "+5V, GND, OUT (0 deg)", "KK-254 3P"),
    ("J5", "HALL UP", "+5V, GND, OUT (90 deg)", "KK-254 3P"),
    ("J6", "IMU POD", "+5V, GND, SDA, SCL", "KK-254 4P"),
    ("J7", "STATUS", "LED-G, LED-R, GND", "KK-254 3P"),
    ("J8", "TAMPER", "SW, GND", "KK-254 2P"),
]
ax.text(30, 268, "SUPERSEDED: this is the early placement concept. The routed, checked PCB is in docs/barrier-v2/pcb/ "
        "(through-hole, 36 nets, KiCad + Gerber).", fontsize=5.6, va="top", color="#a02020", weight="bold")
yy = table(ax, 220, 276, ["REF", "TO", "PINS", "TYPE"], conn, [10, 22, 76, 30], rh=4.4, size=5.0, bold_col0=True)
note_block(ax, 220, yy - 6, "DESIGN RULES", [
    "1  2-layer FR4 1.6 mm, 1 oz; bottom layer = solid ground pour.",
    "2  Power zone left (x < 36), logic right; join grounds only at",
    "    STAR GND next to J1.",
    "3  ESP32 antenna overhangs the right edge; keep-out on both",
    "    layers, no screws/metal within 15 mm in the enclosure.",
    "4  RPWM/LPWM/EN via 74AHCT125 (3.3 V -> 5 V) - IBT-2 inputs",
    "    are 5 V logic. EN pulled DOWN 10k: motor OFF at boot.",
    "5  Battery sense 100k / 22k + 100 nF -> GPIO35 (12.6 V -> 2.27 V).",
    "6  R_IS + L_IS joined, 1k to GND (shunt), then 1k + 100 nF to GPIO34.",
    "7  100 nF at every IC pin + 470 uF bulk at buck input.",
    "8  Header row spacing of YOUR ESP32 board must be measured",
    "    (22.86 or 25.4) before the footprint is frozen.",
    "9  Run ERC + DRC (KiCad / EasyEDA) before ordering Gerbers.",
], size=5.2, lh=3.25)
note_block(ax, 30, 68, "LAYOUT INTENT", [
    "Left: battery in -> 1 A fuse -> reverse-polarity P-FET -> TVS (SMBJ15A) -> LM2596S-5 buck -> 5 V rail -> ESP32 VIN.",
    "Middle: 74AHCT125 next to J2 so the 5 V drive lines to the IBT-2 are short. Buzzer driven by NPN (Q2) from GPIO 19.",
    "Right: ESP32 on sockets (replaceable), ADC RC filters next to GPIO34/35, I2C pull-ups 4.7k to 3V3 near J6.",
], size=5.2, lh=3.6)
sheets.append(fig)

# ======================================================================================
# SHEET 7 - wiring + pin map
# ======================================================================================
fig, ax = new_sheet(7, "WIRING DIAGRAM & ESP32 PIN MAP", "NTS")


def blk(x, y, wd, ht, title, sub="", fc="#eef3f9", ec="#1f3f6f"):
    ax.add_patch(FancyBboxPatch((x, y), wd, ht, boxstyle="round,pad=0.4,rounding_size=1.5", fc=fc, ec=ec, lw=0.7))
    ax.text(x + wd / 2, y + ht - 3.2, title, fontsize=6, weight="bold", ha="center", va="center")
    if sub:
        ax.text(x + wd / 2, y + ht / 2 - 2.5, sub, fontsize=4.7, ha="center", va="center", color="#333",
                linespacing=1.15)


def wire(pts, color, lw=1.0, label=None, lpos=0.5, ls="-"):
    xs, ys = zip(*pts)
    ax.plot(xs, ys, color=color, lw=lw, ls=ls, solid_capstyle="round", zorder=2)
    ax.annotate("", xy=pts[-1], xytext=pts[-2], arrowprops=dict(arrowstyle="-|>", color=color, lw=lw,
                                                                mutation_scale=6), zorder=3)
    if label:
        i = max(0, min(len(pts) - 2, int(lpos * (len(pts) - 1))))
        mx, my_ = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        ax.text(mx, my_ + 1.6, label, fontsize=4.6, ha="center", color=color, bbox=dict(fc="white", ec="none", pad=0.3))


RED, ORG, BLU, GRN = "#c0392b", "#d68910", "#1f5fae", "#1d7a3a"
blk(20, 205, 46, 26, "BATTERY 3S2P", "6 x 18650, 11.1 V nom\n12.6 V full, ~5.2 Ah\n+ 3S BMS (>=15 A)", fc="#fbe7f5", ec="#a0307a")
blk(20, 168, 46, 22, "CHARGE JACK", "12.6 V CC/CV, 2 A\ninto BMS charge port", fc="#fbe7f5", ec="#a0307a")
blk(82, 210, 30, 16, "FUSE 15 A", "ATO blade, near pack", fc="#fdecea", ec=RED)
blk(126, 210, 32, 16, "SW1 ON/OFF", ">=16 A @ 12 VDC", fc="#fdecea", ec=RED)
blk(176, 196, 50, 40, "IBT-2  BTS7960", "B+ / B-  power in\nM+ / M-  to motor\nRPWM LPWM R_EN L_EN\nR_IS L_IS  VCC GND",
    fc="#e8f0fb", ec=BLU)
blk(250, 205, 44, 24, "GEARED MOTOR", "12 V, ~30 RPM (V1)\nchain to shaft", fc="#f1f1f1", ec="#555")
blk(120, 112, 88, 70, "CONTROLLER PCB", "", fc="#eaf6ee", ec=GRN)
ax.text(164, 168, "1 A fuse -> rev. P-FET -> TVS\n-> LM2596S 5 V -> ESP32 VIN\n\nESP32 DevKit V1 (3.3 V logic)\n"
        "74AHCT125 level shift -> IBT-2\nADC: GPIO34 current, GPIO35 VBAT\nI2C: GPIO21/22",
        fontsize=4.9, ha="center", va="top", linespacing=1.25)
blk(20, 120, 50, 22, "HALL DOWN (0 deg)", "A3144 / US5881 on 5 V, output\npulled up to 3V3; magnet on collar", fc="#eef3f9")
blk(20, 92, 50, 22, "HALL UP (90 deg)", "trips 2-3 deg before\nthe hard stop", fc="#eef3f9")
blk(20, 64, 50, 22, "MPU6050 POD", "on shaft, rotates with arch\nangle = main feedback", fc="#eef3f9")
blk(250, 140, 46, 22, "STATUS LED", "bi-colour, lid mounted\nG = ok, R = fault", fc="#eef3f9")
blk(250, 112, 46, 22, "BUZZER", "on PCB, NPN driven", fc="#eef3f9")
blk(250, 84, 46, 22, "LID TAMPER", "micro-switch to GND", fc="#eef3f9")
wire([(66, 218), (82, 218)], RED, 1.6)
wire([(112, 218), (126, 218)], RED, 1.6)
wire([(158, 218), (176, 218)], RED, 1.6, "1.5 mm2", 0.5)
wire([(226, 217), (250, 217)], RED, 1.4, "M+/M-  1.0 mm2", 0.5)
wire([(166, 212), (166, 182)], ORG, 0.9, "VBAT logic", 0.5)
wire([(43, 190), (43, 205)], "#a0307a", 0.9)
wire([(186, 182), (186, 196)], BLU, 0.8, "J2 8-way", 0.5)
wire([(70, 131), (120, 131)], BLU, 0.7, "J4  GPIO32", 0.5)
wire([(70, 103), (95, 103), (95, 125), (120, 125)], BLU, 0.7, "J5  GPIO33", 0.2)
wire([(70, 75), (105, 75), (105, 119), (120, 119)], BLU, 0.7, "J6  SDA21 / SCL22", 0.15)
wire([(208, 151), (250, 151)], BLU, 0.7, "J7  GPIO18 / 4", 0.5)
wire([(208, 123), (250, 123)], BLU, 0.7, "GPIO19 via Q2", 0.5)
wire([(250, 95), (230, 95), (230, 117), (208, 117)], BLU, 0.7, "J8  GPIO23", 0.2)
ax.plot([20, 30], [52, 52], color=RED, lw=1.6)
ax.text(32, 52, "battery / motor current (fused)", fontsize=5, va="center")
ax.plot([95, 105], [52, 52], color=ORG, lw=0.9)
ax.text(107, 52, "logic supply", fontsize=5, va="center")
ax.plot([140, 150], [52, 52], color=BLU, lw=0.7)
ax.text(152, 52, "signals (3.3 V / 5 V)", fontsize=5, va="center")
ax.text(20, 280, "POWER & SIGNAL ARCHITECTURE", fontsize=7, weight="bold", va="top")
pins = [
    ("GPIO25", "RPWM (IN1) - raise", "out PWM", "config.h PIN_MOTOR_IN1"),
    ("GPIO26", "LPWM (IN2) - lower", "out PWM", "config.h PIN_MOTOR_IN2"),
    ("GPIO27", "R_EN + L_EN", "out, 10k pull-down", "new - motor off at boot"),
    ("GPIO32", "Hall DOWN (0 deg)", "in, 10k pull-up", "PIN_LIMIT_DOWN = 32"),
    ("GPIO33", "Hall UP (90 deg)", "in, 10k pull-up", "PIN_LIMIT_UP = 33"),
    ("GPIO34", "Motor current R_IS+L_IS", "ADC in only", "PIN_CURRENT = 34"),
    ("GPIO35", "Battery voltage /5.55", "ADC in only", "new"),
    ("GPIO21", "I2C SDA (MPU6050)", "4.7k to 3V3", "PIN_SDA (unchanged)"),
    ("GPIO22", "I2C SCL (MPU6050)", "4.7k to 3V3", "PIN_SCL (unchanged)"),
    ("GPIO18", "Status LED green", "out", "PIN_LED -> 18"),
    ("GPIO4", "Status LED red (fault)", "out", "new"),
    ("GPIO19", "Buzzer (NPN)", "out", "PIN_BUZZER = 19"),
    ("GPIO23", "Lid tamper", "in, pull-up", "new"),
    ("GPIO2", "On-board LED", "out", "keep LOW at boot"),
]
yy = table(ax, 305, 276, ["PIN", "FUNCTION", "TYPE", "FIRMWARE (config.h)"], pins, [14, 36, 22, 30], rh=4.25, size=4.8,
           bold_col0=True)
note_block(ax, 305, yy - 6, "NOTES", [
    "Avoid strapping pins 0, 2, 12, 15 for",
    "loads. Motor pins 25/26 and I2C 21/22 are",
    "unchanged from the current firmware; set",
    "the -1 pins in config.h when V2 is wired.",
    "Fuse, switch and wire sizes are provisional",
    "until motor stall current is measured.",
], size=5.2, lh=3.3)
sheets.append(fig)

# ======================================================================================
# SHEET 8 - 3D + sweep clearance
# ======================================================================================
fig, ax = new_sheet(8, "3D VIEWS & ARCH SWEEP CLEARANCE", "NTS / 1 : 4")
render_iso(ax, build_model(raised=True), 100, 205, 0.215)
render_iso(ax, build_model(raised=False), 300, 205, 0.215)
ax.text(100, 145, "ARCH RAISED 90 deg (locked)", fontsize=6.5, weight="bold", ha="center")
ax.text(300, 145, "ARCH LOWERED 0 deg (open - car can pass)", fontsize=6.5, weight="bold", ha="center")
ax.text(20, 280, "3D ASSEMBLY (enclosure lid and guard drawn translucent)", fontsize=7, weight="bold", va="top")
V = View(ax, 110, 70, 0.25)
y0_, y1_ = p["plate_y0"], p["plate_y1"]
V.rect(y0_, y1_, -p["plate_t"], 0, fill="#bbbbbb")
b0, b1 = p["ring_leg"] + p["ring_ri"], p["ring_leg"] + p["ring_ro"]
th = np.radians(np.linspace(90, 180, 40))
swept = [(b1 * math.cos(t), ZS + b1 * math.sin(t)) for t in th] + \
        [(b0 * math.cos(t), ZS + b0 * math.sin(t)) for t in th[::-1]]
V.line(swept, "phan", close=True, fill="#1f5fae", alpha=0.15)
legq = [(0, ZS), (-b1, ZS), (-b1 * 0.0, ZS)]
V.line([(-b0, ZS - 7.5), (-b1, ZS - 7.5), (-b1, ZS + 7.5), (-b0, ZS + 7.5)], "out", close=True, fill="#333", alpha=0.5)
V.rect(-7.5, 7.5, ZS + b0, ZS + b1, "phan")
V.rect(p["enc_y0"], p["enc_y1"], 0, p["enc_h"], fill=FILL["enc"], alpha=0.6)
V.circle(p["motor_y"], p["motor_z"], p["gb_d"] / 2, fill=FILL["motor"])
V.circle(0, ZS, OD_B / 2, fill=FILL["spr"], alpha=0.5)
V.rect(10, 200, 0, 280, "hid")
V.text(105, 250, "REAR: arch\nnever enters", 5, color="#1d7a3a", dxf=False)
V.text(-170, 170, "SWEPT ZONE\n(front quarter)", 5, color="#1f5fae", dxf=False)
V.text(-150, -18, "barrier side  <-", 4.6, dxf=False)
V.text(130, -18, "->  rear", 4.6, dxf=False)
ax.text(20, 136, "SECTION AT x = 0: swept zone vs fixed parts (1 : 4)", fontsize=6.4, weight="bold")
clear = [
    ("Fixed parts behind shaft (y > 15)", "never swept", "drive, enclosure, Hall bracket, stops"),
    ("Chain guard vs arch inner edge", f"{b0 - GUARD_REACH:.0f} mm", "front guard corner to R152.5"),
    ("Arch at 0 deg vs deck", f"{ZS - p['ring_t'] / 2:.0f} mm", "rest pads fill this gap"),
    ("Arch at 90 deg vs enclosure", f"{p['enc_y0'] - p['ring_t'] / 2:.0f} mm", "front wall at y = 72"),
    ("Motor vs bearing base", f"{p['motor_y'] - p['gb_d'] / 2 - p['brg_L'] / 2:.1f} mm", "gearbox front edge to base end"),
    ("Big sprocket below deck", f"{OD_B / 2 - ZS:.1f} mm", "slot + closed pan"),
]
yy = table(ax, 215, 134, ["CHECK", "CLEARANCE", "NOTE"], clear, [62, 22, 60], rh=4.4, size=5.0, bold_col0=True)
note_block(ax, 215, yy - 6, "WHY THE MOTOR MOVES TO THE REAR", [
    "On V1 the motor sits on the barrier side, inside the arch opening. The arch",
    "sweeps a quarter-shell between R152.5 and R254 around the shaft (front only).",
    "Keeping the motor there leaves only a few mm (or less) to the arch inner",
    "edge at 0 deg with the measured sizes, and no room for a guard over it.",
    "Mounting the same motor behind the shaft (mirror the bracket) puts the",
    "whole drive in space the arch never reaches, and lets one enclosure cover",
    "motor, chain end, PCB, driver and battery. Same chain, same sprockets.",
    "Check on V1: lower the arch fully and measure the gap at the motor.",
], size=5.2, lh=3.3)
sheets.append(fig)

# ======================================================================================
# SHEET 9 - BOM + budget
# ======================================================================================
fig, ax = new_sheet(9, "BILL OF MATERIALS & BUDGET", "-")
bom = [
    ("1", "Rubber U-arch", "16 in x 8 in opening, 15 thk", "1", "Reuse V1", "Add reflective tape"),
    ("2", "Shaft", "dia 25 x 406, bright steel", "1", "Reuse V1", "Check straightness"),
    ("3", "Pillow block", "UCP205", "2", "Reuse V1", "Grease, check play"),
    ("4", "Arch clamp bracket", "split collar 45x30 + 6 mm plate", "2", "Fabricate", "MS, zinc plate"),
    ("5", "Chain guard", "1.5 mm GI, 2 halves", "1 set", "Fabricate", "laser cut + bend"),
    ("6", "Shaft sprocket", f"#25, {p['n_big']}T (est.)", "1", "Reuse V1", "count teeth"),
    ("6a", "Motor sprocket", f"#25, {p['n_small']}T (est.)", "1", "Reuse V1", ""),
    ("6b", "Roller chain", f"#25, {LINKS} links", "1", "Reuse V1", "spare link + clip"),
    ("7", "Battery pack", "3S2P 18650 + 3S BMS >=15 A", "1", "Buy", "branded cells"),
    ("7a", "Charger", "12.6 V 2 A CC/CV", "1", "Buy", ""),
    ("8", "Controller PCB", "100 x 80, 2-layer + parts", "1", "Fabricate", "JLCPCB/PCBPower"),
    ("8a", "ESP32 DevKit V1", "30-pin", "1", "Reuse V1", "on sockets"),
    ("9", "Motor driver", "IBT-2 BTS7960 module", "1", "Reuse V1", ""),
    ("10", "Geared motor", "12 V ~30 RPM", "1", "Reuse V1", "measure stall A"),
    ("10a", "Motor bracket", "L, slotted foot", "1", "Reuse/modify", "mirror to rear"),
    ("11", "IMU pod", "MPU6050 + printed clamp", "1", "Reuse + print", "ASA"),
    ("12", "Hall sensors + magnet", "A3144/US5881 x2, N52 6x3", "1 set", "Buy", "+ collar"),
    ("13", "Rest pad", "rubber 40x40x29", "2", "Buy", ""),
    ("14", "Hard stop", "25x20x110 MS + rubber face", "2", "Fabricate", ""),
    ("15", "Deck + frame", "5 mm MS plate + 25x25x3 angle", "1", "Fabricate", "primer + PU"),
    ("16", "Enclosure", "1.5 GI or 3 mm ASA, 3 bays", "1", "Fabricate", "EPDM gaskets"),
    ("17", "Switch / fuse / jack", "rocker 16 A, ATO 15 A, DC jack", "1 set", "Buy", "IP65 boot"),
    ("18", "Glands, grommets, vent", "PG7 x2, grommet x2, M12 vent", "1 set", "Buy", ""),
    ("19", "Wire + connectors", "1.5 / 1.0 / 0.5 mm2, KK-254", "1 set", "Buy", ""),
    ("20", "Fasteners", "M4-M10 SS, anchors M10 x4", "1 set", "Buy", ""),
]
yy = table(ax, 20, 276, ["#", "PART", "SPEC", "QTY", "SOURCE", "NOTE"], bom, [9, 36, 58, 12, 26, 32], rh=4.3, size=5.0)
budget = [
    ("Metal deck/frame, cut + weld + finish", "2,500 - 6,000"),
    ("Guard, brackets, stops, hardware", "1,500 - 4,000"),
    ("Shaft/bearing service, collars, fasteners", "800 - 2,500"),
    ("Motor / chain / sprockets (incremental)", "0 - 2,500"),
    ("PCB fabrication (prototype batch)", "1,500 - 3,000"),
    ("PCB components, connectors, protection", "1,000 - 3,000"),
    ("Battery pack, BMS, charger", "1,500 - 3,500"),
    ("Sensors, wiring, glands, indicators", "700 - 2,000"),
    ("Assembly, finishing, rework allowance", "1,500 - 4,000"),
    ("Subtotal", "10,960 - 30,545"),
    ("With ~15 % contingency", "12,600 - 35,100"),
]
yy2 = table(ax, 205, 276, ["BUDGET GROUP (from V2 engineering report)", "INR"], budget, [130, 45], rh=4.5, size=5.3)
note_block(ax, 205, yy2 - 6, "NOTES", [
    "Planning ranges, not quotations. Reuse of V1 parts keeps the low end",
    "realistic. Excludes engineering fees, certification, lab tests, tooling.",
    "Get 2 quotes for the deck/enclosure using Sheets 2, 3 and 5 + the DXF.",
], size=5.3, lh=3.4)
sheets.append(fig)

# ======================================================================================
# SHEET 10 - timeline + gates
# ======================================================================================
import datetime as _dt

fig, ax = new_sheet(10, "TIMELINE (DAY 1 = 27 OCT 2026) & RELEASE GATES", "-")
d1 = _dt.date(*START_DAY)
steps = [
    ("1", "Physical audit & measurements", 1, 3, "Dimension sheet; sprocket teeth, chain c/c, motor stall A, arch kg"),
    ("2", "Mechanical CAD freeze", 4, 8, "Update E-values in this CAD; review drawings Sheets 2-5"),
    ("3", "Schematic & PCB design", 6, 12, "KiCad/EasyEDA schematic, layout, BOM, ERC/DRC"),
    ("4", "Design freeze & vendor orders", 12, 14, "Gerbers, DXF/PDF to vendors; parts ordered"),
    ("5", "Fabrication & procurement", 15, 24, "PCB, deck/frame, guard, enclosure, battery received"),
    ("6", "Assembly & firmware integration", 22, 29, "Mechanics, wiring, sensors, config.h pins, OTA"),
    ("7", "Testing, fixes & pilot review", 30, 35, "100 cycles, fault tests, current/thermal, go/no-go"),
]
gx0, gy0, dw, rh = 120, 250, 7.4, 9.5
ndays = 35
for d in range(ndays):
    day = d1 + _dt.timedelta(days=d)
    x = gx0 + d * dw
    wk = day.weekday() == 6
    ax.add_patch(Rectangle((x, gy0 - rh * len(steps)), dw, rh * len(steps), fc="#f3f3f3" if wk else "white",
                           ec="#dddddd", lw=0.2))
    ax.text(x + dw / 2, gy0 + 3, str(d + 1), fontsize=4.2, ha="center", color="#333")
    if d == 0 or day.day == 1 or day.weekday() == 0:
        ax.text(x + 0.3, gy0 + 8, day.strftime("%d %b"), fontsize=4.3, color="#1f3f6f", weight="bold")
# Diwali risk band (8 Nov 2026 Lakshmi Puja; Bhai Dooj 11 Nov)
dv0 = (_dt.date(2026, 11, 7) - d1).days
dv1 = (_dt.date(2026, 11, 11) - d1).days + 1
ax.add_patch(Rectangle((gx0 + dv0 * dw, gy0 - rh * len(steps)), (dv1 - dv0) * dw, rh * len(steps), fc="#f6c344",
                       ec="none", alpha=0.25))
ax.text(gx0 + (dv0 + dv1) / 2 * dw, gy0 - rh * len(steps) - 3, "Diwali 7-11 Nov: vendor slowdown risk",
        fontsize=4.8, ha="center", color="#8a5a00", va="top")
cols_ = ["#1f5fae", "#2f7d53", "#1d6b35", "#a05a00", "#8a2be2", "#c0392b", "#555555"]
for i, (n, name, a, b, deliv) in enumerate(steps):
    y = gy0 - rh * (i + 1)
    ax.plot([20, gx0 + ndays * dw], [y, y], color="#cccccc", lw=0.3)
    ax.text(22, y + rh / 2 + 1.4, f"{n}  {name}", fontsize=5.6, weight="bold", va="center")
    ax.text(26, y + rh / 2 - 2.2, deliv, fontsize=4.2, va="center", color="#444")
    ax.add_patch(FancyBboxPatch((gx0 + (a - 1) * dw + 0.4, y + 2.2), (b - a + 1) * dw - 0.8, rh - 4.4,
                                boxstyle="round,pad=0,rounding_size=1.2", fc=cols_[i], ec="none", alpha=0.85))
    sd, ed = d1 + _dt.timedelta(days=a - 1), d1 + _dt.timedelta(days=b - 1)
    ax.text(gx0 + (a - 1) * dw + 1.2, y + rh / 2, f"D{a}-{b}  {sd.strftime('%d %b')} - {ed.strftime('%d %b')}",
            fontsize=4.3, color="white", va="center", weight="bold")
ax.plot([20, gx0 + ndays * dw], [gy0, gy0], color="#999", lw=0.4)
miles = [(3, "G1 Measurements signed"), (14, "G2 Design freeze"), (24, "G3 Parts in hand"), (35, "G4 Go / no-go")]
for d, lab in miles:
    x = gx0 + d * dw
    ax.plot([x, x], [gy0 - rh * len(steps) - 9, gy0], color="#a02020", lw=0.6, ls="--")
    ax.plot(x, gy0 - rh * len(steps) - 9, marker="D", ms=4, color="#a02020")
    ax.text(x, gy0 - rh * len(steps) - 13, lab, fontsize=4.8, ha="center", color="#a02020", weight="bold")
ax.text(20, 280, "35-DAY PLAN  (calendar days; grey = Sunday)", fontsize=7, weight="bold", va="top")
ax.text(20, 275, "Source: PARKFNB V2 CEO summary (7 steps). Indicative - depends on measurements, vendor lead times "
        "and test results; 4-6 weeks with contingency.", fontsize=5.2, va="top", color="#444")
gates = [
    ("G1  Day 3", "Every 'E' value in the Sheet 1 register measured and entered; motor stall current and arch mass known."),
    ("G2  Day 14", "Drawings re-generated and reviewed; PCB ERC/DRC clean; fuse/wire/switch sized from stall current."),
    ("G3  Day 24", "Deck, guard, enclosure and PCB inspected against drawings; battery pack and BMS tested on the bench."),
    ("G4  Day 35", "100 controlled cycles; stuck/disconnected sensor -> safe stop; timeout, low battery, power loss,"
                   "\nWi-Fi loss give no uncontrolled motion; all pinch points guarded; spray test before any IP claim."),
]
table(ax, 20, 168, ["GATE", "PASS CRITERIA (fabrication / pilot only after sign-off)"], gates, [22, 205], rh=5.2,
      size=5.3, bold_col0=True)
note_block(ax, 255, 168, "DELIVERABLES IN THIS PACKAGE", [
    "PARKFNB_V2_CAD_Drawings.pdf  (this set)",
    "PARKFNB_V2_Assembly.dxf      (1:1, layered)",
    "PARKFNB_V2_Assembly_3D*.obj  (internals, 3 variants)",
    "PARKFNB_V2S_Shell_*.obj      (Rev B shell, 3 variants)",
    "generate_cad.py              (parametric source)",
    "",
    "Still to produce after Gate 1:",
    "KiCad schematic + routed PCB + Gerbers,",
    "STEP model, harness drawing, test log.",
], size=5.3, lh=3.4)
ax.text(20, 118, "Rev B shell (sheets 11-13): steel fabrication + powder coat adds ~5-7 days. If the shell is ordered at Day 14,\n"
        "expect parts in hand ~Day 30 and Gate 4 (go / no-go) ~Day 40. Everything else on this plan is unchanged.",
        fontsize=5.6, va="top", color="#a02020", weight="bold")
sheets.append(fig)

# ======================================================================================
# REV B - DRIVE-OVER STEEL SHELL
# Everything (shaft, bearings, motor, chain, battery, PCB, driver) sits under one steel
# shell with ramps, so a car can drive over it.  Only two narrow swing arms come out,
# through 24 mm brush-sealed slits.  The rubber arch becomes a half-ring (legs removed)
# that bolts to the arms.  Coordinates as before: z = 0 is the deck top, ground = GROUND.
# ======================================================================================
S = dict(hw=265.0, slope=3.0, cover_t=6.0, side_t=4.0, hr=44.0,
         c_ring=66.0, arm_x=12.0, arm_n0=-7.5, arm_n1=32.5, arm_len=60.0, cleat_t=6.0, slit=24.0,
         car_kg=2000.0, axle=0.55, dyn=1.5, patch_w=215.0, patch_l=150.0, span=150.0,
         fy=235.0, E=210000.0, hatch_t=8.0)
ZP = ZS - p["ring_t"] / 2                      # tray top = underside of the lowered arch
ZH = ZS + S["hr"] + S["cover_t"]               # hump top
Y_T0, Y_H1 = p["plate_y0"], p["plate_y1"]
Y_F0 = Y_T0 - S["slope"] * (ZP - GROUND)       # toe of the front ramp
Y_H0 = -(S["hr"] + S["cover_t"])               # front face of the hump
Y_R1 = Y_H1 + S["slope"] * (ZH - GROUND)       # toe of the rear ramp
Y_SL = S["arm_n1"]                             # rear face of the slit = arm-up stop
BULK = (-112.0, 22.0, 136.0)                   # bulkheads (also the bay dividers)
HATCH_E = (25.0, 195.0, 95.0, 190.0)           # x0, x1, y0, y1  electronics hatch
HATCH_B = (-195.0, -122.0, 85.0, 190.0)        # battery hatch
SLOPE_DEG = math.degrees(math.atan(1 / S["slope"]))
W_SH = 2 * S["hw"]
ARM_X = p["brk_x"]
SLIT_X = (ARM_X - S["slit"] / 2, ARM_X + S["slit"] / 2)

F_WHEEL = S["car_kg"] * 9.81 * S["axle"] / 2 * S["dyn"]
P_PATCH = F_WHEEL / (S["patch_w"] * S["patch_l"])


def plate_check(t, L):
    """One-way strip, simply supported, UDL = tyre pressure.  Returns (sigma MPa, SF, deflection mm)."""
    M = P_PATCH * L * L / 8
    sig = M / (t * t / 6)
    return sig, S["fy"] / sig, 5 * P_PATCH * L**4 / (384 * S["E"] * t**3 / 12)


def poly_area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts)))) / 2


def sh_outline(slit=False):
    """Side silhouette (y, z).  slit=True gives the section through an arm slit (x = +/-152)."""
    if not slit:
        return [(Y_F0, GROUND), (Y_T0, ZP), (Y_H0, ZP), (Y_H0, ZH - 30), (Y_H0 + 30, ZH), (Y_H1, ZH), (Y_R1, GROUND)]
    return [(Y_F0, GROUND), (Y_T0, ZP), (Y_SL - 0.001, ZP), (Y_SL, ZH), (Y_H1, ZH), (Y_R1, GROUND)]


def arm_poly(theta):
    """Swing arm (flat bar on edge) at theta deg, in (y, z)."""
    th = math.radians(theta)
    d, n = (-math.cos(th), math.sin(th)), (math.sin(th), math.cos(th))
    return [(a * d[0] + b * n[0], ZS + a * d[1] + b * n[1])
            for a, b in ((0, S["arm_n0"]), (S["arm_len"], S["arm_n0"]), (S["arm_len"], S["arm_n1"]), (0, S["arm_n1"]))]


def ring_band(theta, x_sec=ARM_X):
    """Half-ring cut by the plane x = x_sec (it does not reach the inner circle there)."""
    th = math.radians(theta)
    d, n = (-math.cos(th), math.sin(th)), (math.sin(th), math.cos(th))
    r0 = S["c_ring"]
    r1 = r0 + math.sqrt(p["ring_ro"] ** 2 - x_sec ** 2)
    h = p["ring_t"] / 2
    return [(a * d[0] + b * n[0], ZS + a * d[1] + b * n[1]) for a, b in ((r0, -h), (r1, -h), (r1, h), (r0, h))]


def ground_hatch(V, u0, u1):
    V.line([(u0, GROUND), (u1, GROUND)], "thin")
    k = int(u0 // 25) - 1
    while k * 25 < u1:
        u = k * 25
        if u0 <= u - 5 and u <= u1:
            V.line([(u, GROUND), (u - 5, GROUND - 5)], "thin")
        k += 1


# ---- numbers -------------------------------------------------------------------------
SIG_C, SF_C, DEF_C = plate_check(S["cover_t"], S["span"])
SIG_H, SF_H, DEF_H = plate_check(S["hatch_t"], 170.0)
LOAD_LINE = F_WHEEL / 1.5                       # load on one bulkhead line under the tyre
P_WEB = LOAD_LINE / (6 * S["patch_l"])
P_GRD = LOAD_LINE / (25 * S["patch_l"])
RHO = 7.85e-6
_cover_len = (math.hypot(Y_T0 - Y_F0, ZP - GROUND) + (Y_H0 - Y_T0) + (ZH - 30 - ZP) + 30 * math.sqrt(2)
              + (Y_H1 - (Y_H0 + 30)) + math.hypot(Y_R1 - Y_H1, ZH - GROUND))
M_COVER = W_SH * _cover_len * S["cover_t"] * RHO
M_SIDES = 2 * poly_area(sh_outline()) * S["side_t"] * RHO
_gus = 0.5 * (Y_T0 - Y_F0) * (ZP - GROUND) + (Y_H0 - Y_T0) * (ZP - GROUND) + 0.5 * (Y_R1 - Y_H1) * (ZH - GROUND)
M_GUS = 5 * _gus * 6 * RHO
M_BULK = len(BULK) * (Y_H1 - Y_H0) * (ZH - S["cover_t"]) * 6 * RHO
M_HATCH = sum((h[1] - h[0]) * (h[3] - h[2]) for h in (HATCH_E, HATCH_B)) * S["hatch_t"] * RHO
M_SHELL = 1.12 * (M_COVER + M_SIDES + M_GUS + M_BULK + M_HATCH)


# ---- 2-D views -----------------------------------------------------------------------
def shell_side(V):
    """Side elevation (u = y along travel, v = z), arch lowered, arm positions phantom."""
    ground_hatch(V, Y_F0 - 25, Y_R1 + 25)
    V.line(sh_outline(), "out", close=True, fill="#9aa4b2", alpha=0.45)
    V.rect(Y_T0, Y_H1, GROUND, 0, "hid")
    V.rect(-p["brg_L"] / 2, p["brg_L"] / 2, 0, p["brg_H2"], "hid")
    V.rect(p["enc_y0"], p["enc_y1"], 0, p["enc_h"], "hid")
    V.circle(0, ZS, p["shaft_d"] / 2, "hid")
    for sx, (a, b, c, d) in (("E", HATCH_E), ("B", HATCH_B)):
        V.rect(c, d, ZH, ZH + 2, fill="#c9a227")
    V.line([(Y_H0, ZP), (Y_H0, ZH - 30), (Y_H0 + 30, ZH), (Y_SL, ZH)], "hid")
    V.line(ring_band(0), "out", close=True, fill=FILL["ring"], alpha=0.5)
    V.line(arm_poly(0), "out", close=True, fill="#8a8a8a", alpha=0.7)
    for th in (45, 90):
        V.line(arm_poly(th), "phan", close=True)
        V.line(ring_band(th), "phan", close=True)
    V.arc(0, ZS, S["arm_len"] + 14, 90, 180, "phan")
    V.cl(0, GROUND - 8, 0, ZS + 270)
    V.text(0, ZS + 125, "ARCH RAISED (90 deg)\nphantom", 4.6, color="#1f5fae", dxf=False)
    V.text(-190, ZP + 40, "ARCH LOWERED (0 deg)\nlies on tray, 15 mm proud", 4.6, dxf=False)
    V.text(Y_F0 + 70, ZP + 22, f"FRONT RAMP 1:{S['slope']:.0f}\n({SLOPE_DEG:.1f} deg)", 4.6, dxf=False)
    V.text(Y_H1 + 150, ZH - 25, f"REAR RAMP 1:{S['slope']:.0f}\n({SLOPE_DEG:.1f} deg)", 4.6, dxf=False)
    V.text(100, ZH - 45, "HUMP: bearings, motor,\nchain, battery, PCB, driver", 4.6, dxf=False)
    V.text(-150, 12, "TRAY", 4.6, dxf=False)
    V.text((HATCH_E[2] + HATCH_E[3]) / 2, ZH + 9, "HATCH", 4.0, dxf=False)
    V.dim((Y_F0, GROUND), (Y_R1, GROUND), -16)
    V.dim((Y_F0, GROUND), (Y_T0, GROUND), -30)
    V.dim((Y_T0, GROUND), (Y_H0, GROUND), -30)
    V.dim((Y_H0, GROUND), (Y_H1, GROUND), -30)
    V.dim((Y_H1, GROUND), (Y_R1, GROUND), -30)
    V.dim((Y_H1, GROUND), (Y_H1, ZH), 18, "v", txt=f"{ZH - GROUND:.1f}")
    V.dim((Y_T0, GROUND), (Y_T0, ZP), -18, "v", txt=f"{ZP - GROUND:.0f}")
    V.dim((Y_T0, GROUND), (Y_T0, ZS + p["ring_t"] / 2), -34, "v", txt=f"{ZS + p['ring_t'] / 2 - GROUND:.1f}")


def shell_plan(V):
    """Plan (u = y along travel, v = x across)."""
    hw = S["hw"]
    V.rect(Y_F0, Y_R1, -hw, hw, fill="#9aa4b2", alpha=0.45)
    for u in (Y_T0, Y_H0, Y_H1):
        V.line([(u, -hw), (u, hw)], "thin")
    V.rect(Y_T0, Y_H1, -p["plate_x"], p["plate_x"], "hid")
    for sx in (-1, 1):
        for ay in (p["anchor_y0"], p["anchor_y1"]):
            V.circle(ay, sx * p["anchor_x"], p["anchor_d"] / 2, "hid")
    # arch half-ring lying on the tray
    c, ro, ri = S["c_ring"], p["ring_ro"], p["ring_ri"]
    ss = np.linspace(0, math.pi, 60)
    outer = [(-c - ro * math.sin(s), ro * math.cos(s)) for s in ss]
    inner = [(-c - ri * math.sin(s), ri * math.cos(s)) for s in ss[::-1]]
    V.line(outer + inner, "out", close=True, fill=FILL["ring"], alpha=0.45)
    # slits and arms
    for sx in (-1, 1):
        V.rect(Y_H0, Y_SL, sx * SLIT_X[0], sx * SLIT_X[1], "out", fill="#222", alpha=0.7)
        V.rect(-c, -c + 6, sx * ARM_X - 42, sx * ARM_X + 42, "out", fill="#8a8a8a", alpha=0.8)
    # hatches and bulkheads
    for (a, b, c0, d0) in (HATCH_E, HATCH_B):
        V.rect(c0, d0, a, b, "out", fill="#c9a227", alpha=0.7)
        for (uu, vv) in ((c0 + 6, a + 6), (c0 + 6, b - 6), (d0 - 6, a + 6), (d0 - 6, b - 6)):
            V.circle(uu, vv, 2.0, "thin")
    for bx in BULK:
        V.line([(Y_H0, bx), (Y_H1, bx)], "hid")
    V.line([(Y_F0 - 15, 0), (Y_R1 + 15, 0)], "cen")
    V.line([(0, -hw - 15), (0, hw + 15)], "cen")
    V.text(-170, 0, "ARCH (half-ring, lowered)", 4.6, bg="white", dxf=False)
    V.text(100, -hw + 24, "BATTERY HATCH", 4.0, dxf=False)
    V.text(140, 110, "ELECTRONICS\nHATCH", 4.0, dxf=False)
    V.text(-12, ARM_X + 52, "ARM SLITS\n24 wide", 4.2, ha="center", dxf=False)
    V.dim((Y_F0, -hw), (Y_F0, hw), -22, "v", txt=f"{W_SH:.0f}")
    V.dim((Y_T0, -hw), (Y_H0, -hw), 10)
    V.dim((Y_H0, -hw), (Y_H1, -hw), 10)


def shell_section_x(V, ycut):
    """Section across the shell (u = x, v = z) at y = ycut (0 = through the shaft, 140 = through the bays)."""
    hw, t, st = S["hw"], S["cover_t"], S["side_t"]
    ground_hatch(V, -hw - 30, hw + 30)
    V.rect(-p["plate_x"], p["plate_x"], -p["plate_t"], 0, fill="#bbbbbb")
    for bx in (-p["plate_x"] + 12.5, p["plate_x"] - 12.5) + BULK:
        V.rect(bx - 12.5, bx + 12.5, GROUND, -p["plate_t"], fill="#cccccc")
    V.rect(-hw, -hw + st, GROUND, ZH, fill="#5d6673")
    V.rect(hw - st, hw, GROUND, ZH, fill="#5d6673")
    top = ZH - t
    if ycut == 0:
        segs = [(-hw, -SLIT_X[1]), (-SLIT_X[0], SLIT_X[0]), (SLIT_X[1], hw)]
    else:
        segs = [(-hw, hw)]
    for a, b in segs:
        V.rect(a, b, top, ZH, fill="#5d6673")
    if ycut == 0:
        for bx in BULK:
            V.rect(bx - 3, bx + 3, 0, ZS - 14, fill="#6f7a88")
            V.rect(bx - 3, bx + 3, ZS + 14, top, fill="#6f7a88")
        for sx in (-1, 1):
            cx = sx * p["brg_cc"] / 2
            V.rect(cx - p["brg_A"] / 2, cx + p["brg_A"] / 2, 0, p["brg_H2"], fill=FILL["brg"], alpha=0.5)
            V.rect(sx * ARM_X - 15, sx * ARM_X + 15, ZS - 22.5, ZS + 22.5, fill="#8a8a8a", alpha=0.7)
            V.rect(sx * ARM_X - 6, sx * ARM_X + 6, ZP, ZP + 40, fill="#8a8a8a", alpha=0.8)
            V.rect(sx * ARM_X - 6, sx * ARM_X + 6, ZS, ZS + S["arm_len"], "phan")
        V.rect(-p["shaft_len"] / 2, p["shaft_len"] / 2, ZS - 12.5, ZS + 12.5, fill="#d8d8d8")
    else:
        for bx in BULK:
            V.rect(bx - 3, bx + 3, 0, top, fill="#6f7a88")
        V.rect(-195, -118, 3, 24, fill=FILL["bat"], alpha=0.6)
        V.rect(30, 130, 10, 11.6, fill=FILL["pcb"], alpha=0.8)
        V.rect(70, 122, 11.6, 22, fill="#1b1b1b", alpha=0.8)
        V.rect(142, 192, 3, 46, fill=FILL["ibt"], alpha=0.7)
        for (a, b, c0, d0), col in ((HATCH_E, "#c9a227"), (HATCH_B, "#c9a227")):
            V.rect(a, b, ZH, ZH + 2, fill=col)
        V.text(-156, 33, "BATTERY", 4.4, dxf=False)
        V.text(80, 27, "PCB+ESP32", 4.4, dxf=False)
        V.text(167, 52, "IBT-2", 4.4, dxf=False)
        for k, (a, b) in enumerate(((-hw + st, BULK[0]), (BULK[0], BULK[1]), (BULK[1], BULK[2]), (BULK[2], hw - st))):
            V.dim((a, 0), (b, 0), -14 - 0 * k, txt=f"{b - a:.0f}")
    V.dim((-hw, GROUND), (hw, GROUND), -20)
    V.dim((hw, GROUND), (hw, ZH), 16, "v", txt=f"{ZH - GROUND:.1f}")


def build_shell_model(raised, cover=True):
    M = build_model(raised, solid=True, lid=False)
    drop = {"enclosure", "enclosure_divider", "enclosure_lid", "chain_guard", "rest_pad", "arch_rubber",
            "arch_bracket", "end_stop"}
    M.parts = [q for q in M.parts if q[0] not in drop]
    M.halfring("arch_rubber", "#2b2b2b", raised, S["c_ring"], p["ring_ro"], p["ring_ri"], p["ring_t"])
    L, n0, n1, ct = S["arm_len"], S["arm_n0"], S["arm_n1"], S["cleat_t"]
    for sx in (-1, 1):
        a0 = sx * ARM_X
        xa = (a0 - S["arm_x"] / 2, a0 + S["arm_x"] / 2)
        xc = (a0 - 42, a0 + 42)
        if raised:
            M.box("swing_arm", "#8a8a8a", xa[0], xa[1], n0, n1, ZS, ZS + L)
            M.box("arm_cleat", "#8a8a8a", xc[0], xc[1], n0, n1, ZS + L, ZS + L + ct)
        else:
            M.box("swing_arm", "#8a8a8a", xa[0], xa[1], -L, 0, ZS + n0, ZS + n1)
            M.box("arm_cleat", "#8a8a8a", xc[0], xc[1], -L - ct, -L, ZS + n0, ZS + n1)
    hw, st, sh, rp = S["hw"], S["side_t"], "#5d6673", "#6f7a88"
    M.prism("shell_front_ramp", rp, [(Y_F0, GROUND), (Y_T0, GROUND), (Y_T0, ZP)], -hw, hw)
    M.box("shell_tray", sh, -hw, hw, Y_T0, Y_H0, GROUND, ZP)
    if cover:
        hump = [(Y_H0, GROUND), (Y_H1, GROUND), (Y_H1, ZH), (Y_H0 + 30, ZH), (Y_H0, ZH - 30)]
        M.prism("shell_rear_ramp", rp, [(Y_H1, GROUND), (Y_R1, GROUND), (Y_H1, ZH)], -hw, hw)
        M.prism("shell_hump", sh, hump, -hw, -SLIT_X[1])
        M.prism("shell_hump", sh, hump, -SLIT_X[0], SLIT_X[0])
        M.prism("shell_hump", sh, hump, SLIT_X[1], hw)
        for sx in (-1, 1):
            a, b = sorted((sx * SLIT_X[0], sx * SLIT_X[1]))
            M.box("shell_slit_floor", sh, a, b, Y_H0, Y_H1, GROUND, ZP)
            M.box("shell_slit_rear", sh, a, b, Y_SL, Y_H1, ZP, ZH)
        for (a, b, c0, d0) in (HATCH_E, HATCH_B):
            M.box("service_hatch", "#c9a227", a, b, c0, d0, ZH, ZH + 2)
    else:
        M.box("shell_wall", sh, -hw, -hw + st, Y_H0, Y_H1, GROUND, ZH)
        M.box("shell_wall", sh, hw - st, hw, Y_H0, Y_H1, GROUND, ZH)
        M.box("shell_wall", sh, -hw, hw, Y_H0, Y_H0 + st, GROUND, ZH - 30)
        M.box("shell_wall", sh, -hw, hw, Y_H1 - st, Y_H1, GROUND, ZH)
        for bx in BULK:
            M.box("bulkhead", rp, bx - 3, bx + 3, Y_H0 + st, -15, 0, ZH - S["cover_t"])
            M.box("bulkhead", rp, bx - 3, bx + 3, 15, Y_H1 - st, 0, ZH - S["cover_t"])
        for sx in (-1, 1):
            M.box("arm_stop", "#444444", sx * ARM_X - 12.5, sx * ARM_X + 12.5, Y_SL, Y_SL + 20, 0, 60)
    return M


# ======================================================================================
# SHEET 11 - shell overview
# ======================================================================================
DXF_OFF.update(sh_side=(0, -1300), sh_plan=(0, -2100), sh_det=(1300, -1300), sh_xz0=(1300, -2100),
               sh_xz1=(2000, -2100), sh_slit=(2700, -1300))


def dxf_note(key, du, dv, s, h=12):
    x, y = DXF_OFF[key]
    msp.add_text(s, height=h, dxfattribs={"layer": "TEXT"}).set_placement((x + du, y + dv),
                                                                          align=TextEntityAlignment.BOTTOM_LEFT)


fig, ax = new_sheet(11, "REV B - DRIVE-OVER STEEL SHELL (OVERVIEW)", "1 : 4.2")
SC = 0.24
ax.text(20, 280, "SIDE ELEVATION (arch lowered, open) and PLAN - everything is under the shell", fontsize=7, weight="bold",
        va="top")
V = View(ax, 132, 190, SC, msp, *DXF_OFF["sh_side"])
shell_side(V)
dxf_note("sh_side", Y_F0, 360, "SHELL SIDE ELEVATION (arch lowered)")
V = View(ax, 132, 112, SC, msp, *DXF_OFF["sh_plan"])
shell_plan(V)
dxf_note("sh_plan", Y_F0, 300, "SHELL PLAN")
ax.text(20, 176, "PLAN", fontsize=6.4, weight="bold")
shell_rows = [
    ("Overall", f"{Y_R1 - Y_F0:.0f} x {W_SH:.0f} mm (L x W)"),
    ("Hump height", f"{ZH - GROUND:.1f} mm above ground"),
    ("Tray height", f"{ZP - GROUND:.0f} mm; arch top {ZS + p['ring_t'] / 2 - GROUND:.1f}"),
    ("Ramps", f"1:{S['slope']:.0f} ({SLOPE_DEG:.1f} deg) front and rear"),
    ("Cover plate", f"{S['cover_t']:.0f} mm S235, bulkheads <=150"),
    ("Arm slits", f"2 x {S['slit']:.0f} wide, brush lips"),
    ("Hatches", "2, 8 mm, gasket + key lock"),
    ("Shell mass", f"~{M_SHELL:.0f} kg (shell only, est.)"),
    ("Design wheel load", f"{F_WHEEL / 1000:.1f} kN (2 t car, x1.5)"),
]
yy = table(ax, 290, 280, ["SHELL", "VALUE"], shell_rows, [28, 92], rh=4.3, size=5.2, bold_col0=True)
render_iso(ax, build_shell_model(raised=True), 345, 202, 0.082)
render_iso(ax, build_shell_model(raised=False), 345, 150, 0.082)
ax.text(345, 232, "CLOSED, ARCH RAISED (locked)", fontsize=5.4, ha="center", color="#444")
ax.text(345, 178, "CLOSED, ARCH LOWERED (open - drive over)", fontsize=5.4, ha="center", color="#444")
note_block(ax, 290, 118, "WHAT CHANGED vs Rev A (open frame)", [
    "1  One steel shell covers shaft, bearings, motor, chain,",
    "    battery, PCB and driver. Only two 12 mm swing arms",
    "    leave it, through 24 mm brush-sealed slits.",
    "2  Rubber arch loses its legs (half-ring only) and bolts to",
    "    the arms. Arm bar: 12 x 40 on edge, 60 long.",
    "3  Lowered, the arch lies on the tray (replaces rest pads),",
    "    so a wheel loads the tray, not the shaft or arms.",
    "4  Chain guard now sits under the shell (<= 72 high).",
    "5  Bulkheads at x=-112, 22, 136 carry the cover to the",
    "    deck frame and also split battery | drive | electronics.",
    "6  Hatches over battery and electronics bays; anchors",
    "    stay under the shell (not reachable from outside).",
], size=5.0, lh=3.2)
sheets.append(fig)

# ======================================================================================
# SHEET 12 - sections, arm slit, load path
# ======================================================================================
fig, ax = new_sheet(12, "REV B - SHELL SECTIONS, ARM SLIT, LOAD PATH", "AS SHOWN")
SC = 0.6
V = View(ax, 95, 185, SC, msp, *DXF_OFF["sh_det"], clip=(12, 156, 188, 120))
ground_hatch(V, -140, 120)
V.line(sh_outline(slit=True), "out", close=True, fill="#9aa4b2", alpha=0.45)
V.rect(Y_T0, Y_H1, GROUND, 0, "hid")
V.rect(-p["brg_L"] / 2, p["brg_L"] / 2, 0, p["brg_H2"], "hid")
V.circle(0, ZS, p["shaft_d"] / 2, fill="#d8d8d8")
V.circle(0, ZS, 22.5, "thin")
V.line(ring_band(0), "out", close=True, fill=FILL["ring"], alpha=0.5)
V.line(arm_poly(0), "out", close=True, fill="#8a8a8a", alpha=0.7)
for th in (30, 60, 90):
    V.line(arm_poly(th), "phan", close=True)
V.line(ring_band(90), "phan", close=True)
V.arc(0, ZS, S["arm_len"] + 14, 90, 180, "phan")
V.line([(Y_SL, ZP), (Y_SL, ZH)], "out")
V.rect(Y_SL, Y_SL + 4, ZS + 5, ZS + 40, fill="#222")
V.cl(0, GROUND - 6, 0, ZH + 25)
V.cl(-40, ZS, 60, ZS)
V.text(-100, ZP + 30, "ARCH HALF-RING\nlowered", 4.4, dxf=False)
V.text(-35, ZP + 58, "ARM\n12 x 40", 4.4, dxf=False)
V.text(Y_SL + 6, ZP + 62, "RUBBER STOP\nPAD (arm up)", 4.2, ha="left", dxf=False)
V.text(30, 8, "SLIT FLOOR", 4.2, dxf=False)
V.text(70, 50, "HUMP\n(shell body)", 4.4, dxf=False)
V.dim((Y_H0, ZP), (Y_SL, ZP), -14, txt=f"SLIT {Y_SL - Y_H0:.1f}")
V.dim((Y_SL, GROUND), (Y_SL, ZH), 40, "v", txt=f"{ZH - GROUND:.1f}")
V.dim((-S["c_ring"], ZP), (0, ZP), -28, txt=f"{S['c_ring']:.0f} ring start")
V.dim((0, ZS), (0, ZH), -52, "v", txt=f"{ZH - ZS:.1f}")
ax.add_patch(Rectangle((12, 156), 188, 120, fc="none", ec="#999", lw=0.3, ls="--"))
ax.text(14, 284, "SECTION D-D THROUGH ARM SLIT (x = 152)  1 : 1.7  -  arch lowered, arm shown at 0 / 30 / 60 / 90 deg",
        fontsize=6.0, weight="bold", va="top")

V = View(ax, 305, 222, 0.38, msp, *DXF_OFF["sh_xz0"])
shell_section_x(V, 0)
dxf_note("sh_xz0", -265, 120, "SECTION E-E y=0 (through shaft)")
ax.text(205, 284, "SECTION E-E  y = 0 (through shaft and bearings)  1 : 2.6", fontsize=6.0, weight="bold", va="top")
V = View(ax, 305, 140, 0.38, msp, *DXF_OFF["sh_xz1"])
shell_section_x(V, 140)
dxf_note("sh_xz1", -265, 120, "SECTION F-F y=140 (through bays)")
ax.text(205, 180, "SECTION F-F  y = 140 (through battery, PCB, driver bays)  1 : 2.6", fontsize=6.0, weight="bold", va="top")

# slit seal detail (plan, 1.6 : 1)
V = View(ax, 60, 105, 1.6, msp, *DXF_OFF["sh_slit"])
V.rect(-30, -12, -17, 17, fill="#5d6673")
V.rect(12, 30, -17, 17, fill="#5d6673")
V.rect(-6, 6, -17, 17, fill="#8a8a8a")
for k in range(-8, 9):
    vv = k * 2.0
    V.line([(-12, vv), (-6.4, vv)], "thin")
    V.line([(12, vv), (6.4, vv)], "thin")
V.dim((-12, -17), (12, -17), -4, txt="24 slit")
V.dim((-6, 17), (6, 17), 4, txt="12 arm")
V.text(-21, 0, "COVER\n6 mm", 4.0, color="white", dxf=False)
V.text(21, 0, "COVER\n6 mm", 4.0, color="white", dxf=False)
V.text(0, -27, "BRUSH LIPS 2 x 6, nylon bristle, replaceable strip", 4.2, dxf=False)
ax.text(14, 146, "SLIT SEAL - PLAN VIEW 1.6 : 1", fontsize=6.0, weight="bold", va="top")

note_block(ax, 205, 106, "LOAD PATH (wheel on the shell)", [
    "Tyre -> 6 mm cover plate -> bulkhead / gusset webs (<=150 pitch)",
    "-> deck frame angles directly under each web -> ground.",
    "The shaft, bearings, arms, battery, PCB and driver are NOT in the",
    "load path: the cover underside clears the highest part (UCP205,",
    f"{p['brg_H2']:.0f}) by {ZH - S['cover_t'] - p['brg_H2']:.1f} mm.",
    "Arch lowered: rubber lies on the tray, wheel load goes into the tray.",
    "Frame under webs: add longitudinal angles at x = -112, 22, 136.",
], size=5.1, lh=3.2)
note_block(ax, 205, 74, "ARM SLIT, ACCESS, WATER", [
    "Slit 24 wide x L-shaped along front face, chamfer and top; two brush",
    "lips close the 6 mm gaps either side of the 12 mm arm.",
    "Tray + ramps + hump are bolted modules: M8 tamper-proof screws every",
    "~80 mm over EPDM gasket. Hatch plates have a key lock; GPIO23 tamper",
    "switch sits under the electronics hatch. Anchors are inside the shell.",
    "Weep holes (dia 8) at ground level each bay; vent membrane M12 on",
    "battery bay; deck sealed so water cannot reach the electronics bay.",
], size=5.1, lh=3.2)
sheets.append(fig)

# ======================================================================================
# SHEET 13 - checks, parts, budget, open items
# ======================================================================================
fig, ax = new_sheet(13, "REV B - WHEEL-LOAD CHECK, PARTS, BUDGET, OPEN ITEMS", "-")
chk = [
    ("Design vehicle", f"{S['car_kg']:.0f} kg, {S['axle'] * 100:.0f} % on one axle"),
    ("Wheel load", f"{F_WHEEL / 1000:.1f} kN  (static {F_WHEEL / S['dyn'] / 1000:.1f} x {S['dyn']} dynamic)"),
    ("Tyre patch", f"{S['patch_w']:.0f} x {S['patch_l']:.0f} mm  ->  {P_PATCH:.2f} MPa"),
    ("Cover plate", f"{S['cover_t']:.0f} mm S235, span {S['span']:.0f}:  {SIG_C:.0f} MPa, SF {SF_C:.1f}, defl {DEF_C:.2f} mm"),
    ("Hatch plate", f"{S['hatch_t']:.0f} mm, span 170:  {SIG_H:.0f} MPa, SF {SF_H:.1f}, defl {DEF_H:.2f} mm"),
    ("Web (6 mm)", f"{P_WEB:.1f} MPa compression under one line"),
    ("Ground bearing", f"{P_GRD:.1f} MPa under 25 mm angle (concrete / asphalt: check site)"),
    ("Not checked", "impact on raised arch, fatigue, welds, thermal, rain ingress, corrosion"),
]
yy = table(ax, 20, 276, ["LOAD CASE (hand calc)", "RESULT"], chk, [36, 130], rh=4.6, size=5.3, bold_col0=True)
ax.text(20, yy - 3, "One-way strip, simply supported, UDL = tyre pressure, S235 fy 235 MPa.  Concept check only - run FEA and a "
        "drive-over test (2 t car, 100+ passes) before any pilot.", fontsize=4.9, va="top", color="#a02020")
parts = [
    ("S1", "Front ramp plate", f"6 mm, {W_SH:.0f} x {math.hypot(Y_T0 - Y_F0, ZP - GROUND):.0f}", "1"),
    ("S2", "Tray plate", f"6 mm, {W_SH:.0f} x {Y_H0 - Y_T0:.0f}", "1"),
    ("S3", "Hump cover (front, chamfer, top)", f"6 mm, {W_SH:.0f} x {Y_H1 - Y_H0 + 60:.0f} unfolded", "1"),
    ("S4", "Rear ramp plate", f"6 mm, {W_SH:.0f} x {math.hypot(Y_R1 - Y_H1, ZH - GROUND):.0f}", "1"),
    ("S5", "Side plates", "4 mm, profile of sheet 11", "2"),
    ("S6", "Bulkheads", f"6 mm, {Y_H1 - Y_H0:.0f} x {ZH - S['cover_t']:.0f}, shaft notch", str(len(BULK))),
    ("S7", "Ramp / tray gussets", "6 mm triangles + tray webs", "5 lines"),
    ("S8", "Hatch - electronics", f"8 mm, {HATCH_E[1] - HATCH_E[0]:.0f} x {HATCH_E[3] - HATCH_E[2]:.0f}, gasket, lock", "1"),
    ("S9", "Hatch - battery", f"8 mm, {HATCH_B[1] - HATCH_B[0]:.0f} x {HATCH_B[3] - HATCH_B[2]:.0f}, gasket, lock", "1"),
    ("S10", "Swing arm + cleat", "12 x 40 on edge, 60 long; cleat 84 x 40 x 6", "2"),
    ("S11", "Brush lip strip", "nylon bristle 6 mm, slit length", "4"),
    ("S12", "Tamper screws / EPDM gasket", "M8 security, ~80 pitch / 3 mm", "set"),
    ("S13", "Deck frame upgrade", "angles at x = -112, 22, 136", "3"),
]
yy2 = table(ax, 215, 276, ["ID", "SHELL PART", "SPEC", "QTY"], parts, [10, 50, 80, 14], rh=4.3, size=5.0, bold_col0=True)
ax.text(215, yy2 - 3, f"Estimated shell mass ~{M_SHELL:.0f} kg: cover {M_COVER:.0f} + sides {M_SIDES:.0f} + gussets {M_GUS:.0f} "
        f"+ bulkheads {M_BULK:.0f} + hatches {M_HATCH:.0f} kg, +12 % welds/flanges.", fontsize=4.9, va="top")
bud = [
    ("Shell steel, cut, fold, weld (~%d kg)" % round(M_SHELL), "6,000 - 12,000"),
    ("Powder coat / zinc primer + PU", "1,500 - 3,000"),
    ("Seals, gaskets, locks, tamper screws, vent", "1,500 - 3,000"),
    ("Shell allowance (my estimate, not a quote)", "9,000 - 18,000"),
    ("Rev A planning range (sheet 9, with 15 % contingency)", "12,600 - 35,100"),
    ("Total with shell", "21,600 - 53,100"),
]
yy3 = table(ax, 20, 150, ["BUDGET (INR)", "RANGE"], bud, [110, 56], rh=4.5, size=5.3)
ax.text(20, yy3 - 3, "Steel rate and fabrication are assumptions. Get 2 quotes from drawings (sheets 11-12, DXF).",
        fontsize=4.9, va="top", color="#a02020")
note_block(ax, 215, 150, "OPEN ITEMS / RISKS (resolve before fabrication)", [
    "1  Raised arch is the locked state: a car can hit it. Arm and stop are sized",
    "    for handling only. Decide: sacrificial arm / shear bolts so the shell survives.",
    "2  Hump is 117 mm above ground: check your car's ground clearance and approach",
    "    angle (ramps are 18 deg). Option: no rear ramp if the unit sits against a kerb.",
    "3  Arm slit seals: brush wear and water ingress path. Test spray before any IP claim.",
    "4  Sealed shell = heat. Measure IBT-2 and battery temperature over 100 cycles.",
    "5  Rubber arch legs must be cut off (half-ring only): confirm on V1 before cutting.",
    "6  Frame under webs, weld design and anchor pattern need engineering sign-off.",
    "7  Tray is hollow; keep drain paths clear so water cannot pool under the arch.",
    "8  This shell protects the mechanism. It is not an emergency stop or crush protection.",
], size=5.0, lh=3.35)
sheets.append(fig)

_ax0 = sheets[0].axes[0]
render_iso(_ax0, build_shell_model(raised=True), 110, 178, 0.125)
_ax0.text(110, 128, "Rev B: fully covered drive-over shell, arch raised (locked)", fontsize=6, ha="center", color="#444")
_f2 = plt.figure(figsize=(11, 7))
_a2 = _f2.add_axes([0, 0, 1, 1])
_a2.set_xlim(0, 220)
_a2.set_ylim(0, 140)
_a2.set_aspect("equal")
_a2.axis("off")
render_iso(_a2, build_shell_model(raised=True, cover=False), 110, 70, 0.16)
_f2.savefig(os.path.join(HERE, "preview_cover_off.png"), dpi=110)
plt.close(_f2)
for nm, rs, cv in (("closed_arch_raised", True, True), ("closed_arch_down", False, True), ("cover_off", True, False)):
    export_obj(build_shell_model(raised=rs, cover=cv), os.path.join(HERE, f"PARKFNB_V2S_Shell_{nm}.obj"))
print(f"shell: {Y_R1 - Y_F0:.0f} x {W_SH:.0f}, hump {ZH - GROUND:.1f}, mass {M_SHELL:.0f} kg, wheel {F_WHEEL / 1000:.1f} kN, "
      f"cover SF {SF_C:.1f} defl {DEF_C:.2f}, hatch SF {SF_H:.1f}, ground {P_GRD:.1f} MPa")

# --------------------------------------------------------------------------------------
# Write everything
# --------------------------------------------------------------------------------------
pdf_path = os.path.join(HERE, "PARKFNB_V2_CAD_Drawings.pdf")
with PdfPages(pdf_path) as pdf:
    for i, f in enumerate(sheets, 1):
        pdf.savefig(f)
        f.savefig(os.path.join(HERE, f"preview_sheet{i:02d}.png"), dpi=110)
        plt.close(f)
doc.saveas(os.path.join(HERE, "PARKFNB_V2_Assembly.dxf"))
export_obj(build_model(raised=True, solid=True, lid=False), os.path.join(HERE, "PARKFNB_V2_Assembly_3D.obj"))
export_obj(build_model(raised=True, solid=True, lid=True), os.path.join(HERE, "PARKFNB_V2_Assembly_3D_lid_on.obj"))
export_obj(build_model(raised=False, solid=True, lid=False), os.path.join(HERE, "PARKFNB_V2_Assembly_3D_arch_down.obj"))
print(f"chain: {LINKS} links, C nominal {C_NOM:.1f}, C exact {C_EXACT:.1f}; ratio {RATIO:.2f}; "
      f"shaft {SHAFT_RPM:.1f} rpm; 90deg {T90:.2f}s")
print(f"arch {ARCH_KG:.2f} kg, CG {ARCH_CG:.0f} mm, shaft torque {T_SHAFT:.2f} Nm, motor {T_MOTOR_KGCM:.1f} kg.cm")
print("wrote", pdf_path)
