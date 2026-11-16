"""Shared drawing helpers for the PARKFNB V2 CAD scripts: sheet frame, 2-D views mirrored to DXF, tables,
simple 3-D solids, isometric render and OBJ export.  Callers set REV, DATE, SHEETS_TOTAL and TITLE_LINE."""
import math
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle, Circle, FancyBboxPatch
from matplotlib.collections import PolyCollection
import ezdxf
from ezdxf.enums import TextEntityAlignment

REV, DATE, SHEETS_TOTAL = "C", "2026-10-26", 1
TITLE_LINE = "Concept CAD for design review"
ZS = 0.0
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
    T(x0 + 3, y0 + 26.3, TITLE_LINE, fontsize=4.6, va="center", color="#444")
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

    def uarch(self, name, color, theta, ro, ri, leg, t, zs):
        """U-shaped arch (legs + semicircle) rotated theta deg about the x axis at height zs.
        theta 0 = lying toward -y, 90 = standing up, 180 = lying toward +y."""
        n = 40
        th = math.radians(theta)
        d = (-math.cos(th), math.sin(th))
        nn = (math.sin(th), math.cos(th))

        def curve(r):
            return [(r, 0), (r, leg)] + [(r * math.cos(s), leg + r * math.sin(s))
                                         for s in np.linspace(0, math.pi, n)] + [(-r, leg), (-r, 0)]

        O, I = curve(ro), curve(ri)
        m = len(O)

        def X(a, b, w):
            return (a, b * d[0] + w * nn[0], zs + b * d[1] + w * nn[1])

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


