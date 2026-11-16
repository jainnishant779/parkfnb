"""RS-274X Gerber + Excellon drill writer (KiCad-style file names and X2 attributes)."""
import math
import os

from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
from shapely import affinity
from shapely.geometry import Point, Polygon, LineString, box
from shapely.ops import unary_union

from design import BOARD_W, BOARD_H, VIA_D, VIA_DRILL

SCALE = 1_000_000
MASK_MARGIN = 0.05
SILK_W = 0.15


class Gerber:
    def __init__(self, func, polarity="Positive"):
        self.func, self.polarity = func, polarity
        self.ap = {}
        self.body = []
        self.cur = None

    def _d(self, key, spec):
        if key not in self.ap:
            self.ap[key] = (10 + len(self.ap), spec)
        return self.ap[key][0]

    def circle(self, d):
        return self._d(("C", round(d, 4)), f"C,{d:.4f}")

    def rect(self, w, h):
        return self._d(("R", round(w, 4), round(h, 4)), f"R,{w:.4f}X{h:.4f}")

    @staticmethod
    def _c(v):
        return int(round(v * SCALE))

    def _select(self, code):
        if self.cur != code:
            self.body.append(f"D{code}*")
            self.cur = code

    def flash(self, x, y, code):
        self._select(code)
        self.body.append(f"X{self._c(x)}Y{self._c(y)}D03*")

    def draw(self, x0, y0, x1, y1, code):
        self._select(code)
        self.body.append(f"X{self._c(x0)}Y{self._c(y0)}D02*")
        self.body.append(f"X{self._c(x1)}Y{self._c(y1)}D01*")

    def region(self, coords):
        pts = list(coords)
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        self.body.append("G36*")
        self.body.append(f"X{self._c(pts[0][0])}Y{self._c(pts[0][1])}D02*")
        for (x, y) in pts[1:]:
            self.body.append(f"X{self._c(x)}Y{self._c(y)}D01*")
        self.body.append("G37*")

    def polygon(self, pg):
        """Dark polygon with holes (holes are cleared afterwards)."""
        self.region(pg.exterior.coords)
        for h in pg.interiors:
            self.body.append("%LPC*%")
            self.region(h.coords)
            self.body.append("%LPD*%")

    def geom(self, g):
        if g.is_empty:
            return
        for pg in (g.geoms if hasattr(g, "geoms") else [g]):
            if pg.geom_type == "Polygon":
                self.polygon(pg)

    def save(self, path):
        head = ["%TF.GenerationSoftware,PARKFNB,generate_pcb,1.0*%",
                f"%TF.FileFunction,{self.func}*%", f"%TF.FilePolarity,{self.polarity}*%",
                "%FSLAX46Y46*%", "%MOMM*%", "G75*", "%LPD*%"]
        for key, (code, spec) in sorted(self.ap.items(), key=lambda kv: kv[1][0]):
            head.append(f"%ADD{code}{spec}*%")
        head.append("G01*")
        with open(path, "w", encoding="ascii", newline="\n") as fh:
            fh.write("\n".join(head + self.body + ["M02*"]) + "\n")


def text_geom(s, x, y, size=1.0, rot=0, bold=True):
    tp = TextPath((0, 0), s, size=size, prop=FontProperties(family="DejaVu Sans", weight="bold" if bold else "normal"))
    polys = [Polygon(p) for p in tp.to_polygons() if len(p) >= 3]
    g = None
    for pg in polys:
        pg = pg.buffer(0)
        g = pg if g is None else g.symmetric_difference(pg)
    if g is None:
        return Polygon()
    g = affinity.rotate(g, rot, origin=(0, 0))
    return affinity.translate(g, x, y)


def pad_geom(pd, grow=0.0):
    if pd.shape == "r":
        s = pd.size / 2 + grow
        return box(pd.x - s, pd.y - s, pd.x + s, pd.y + s)
    return Point(pd.x, pd.y).buffer(pd.size / 2 + grow, 24)


def silk_geometry(parts, labels, ref_labels):
    g = []
    for pt in parts:
        if pt.fp == "MOUNT":
            continue
        for it in pt.silk:
            if it[0] == "line":
                pts = it[1] + ([it[1][0]] if it[2] else [])
                g.append(LineString(pts).buffer(SILK_W / 2, 4))
            else:
                g.append(Point(it[1], it[2]).buffer(it[3], 32).exterior.buffer(SILK_W / 2, 4))
    for (txt, x, y, rot, size) in labels + ref_labels:
        g.append(text_geom(txt, x, y, size * 1.15, rot))
    return unary_union(g)


def write_gerbers(outdir, prefix, parts, router, plane, antenna, labels, ref_labels):
    os.makedirs(outdir, exist_ok=True)
    files = []

    def path(name):
        p = os.path.join(outdir, f"{prefix}-{name}")
        files.append(p)
        return p

    pads = [pd for pt in parts for pd in pt.pads]
    # ---- copper
    for lay, func, name in (("F", "Copper,L1,Top", "F_Cu.gbr"), ("B", "Copper,L2,Bot", "B_Cu.gbr")):
        g = Gerber(func)
        if lay == "B":
            g.geom(plane)
        for pd in pads:
            if pd.shape == "r":
                g.flash(pd.x, pd.y, g.rect(pd.size, pd.size))
            else:
                g.flash(pd.x, pd.y, g.circle(pd.size))
        for (net, l, x0, y0, x1, y1, w) in router.tracks:
            if l == lay:
                g.draw(x0, y0, x1, y1, g.circle(w))
        for (net, x, y) in router.vias:
            g.flash(x, y, g.circle(VIA_D))
        g.save(path(name))
    # ---- solder mask (openings are dark)
    for lay, func, name in (("F", "Soldermask,Top", "F_Mask.gbr"), ("B", "Soldermask,Bot", "B_Mask.gbr")):
        g = Gerber(func, "Negative")
        for pd in pads:
            s = pd.size + 2 * MASK_MARGIN
            if pd.shape == "r":
                g.flash(pd.x, pd.y, g.rect(s, s))
            else:
                g.flash(pd.x, pd.y, g.circle(s))
        g.save(path(name))
    # ---- silkscreen (top), clipped away from pad openings
    silk = silk_geometry(parts, labels, ref_labels)
    clip = unary_union([pad_geom(pd, MASK_MARGIN + 0.15) for pd in pads] +
                       [Point(pt.x, pt.y).buffer(1.7, 16) for pt in parts if pt.fp == "MOUNT"])
    silk = silk.difference(clip).intersection(box(0.3, 0.3, BOARD_W - 0.3, BOARD_H - 0.3))
    g = Gerber("Legend,Top")
    g.geom(silk)
    g.save(path("F_Silkscreen.gbr"))
    # ---- board outline
    g = Gerber("Profile,NP")
    a = g.circle(0.1)
    c = [(0, 0), (BOARD_W, 0), (BOARD_W, BOARD_H), (0, BOARD_H), (0, 0)]
    for p0, p1 in zip(c[:-1], c[1:]):
        g.draw(*p0, *p1, a)
    g.save(path("Edge_Cuts.gbr"))
    # ---- drill files
    def drill(func, holes, name):
        tools = sorted({round(d, 3) for (_, _, d) in holes})
        lines = ["M48", "; DRILL file {PARKFNB generate_pcb} date 2026-10-26", f"; #@! TF.FileFunction,{func}",
                 "FMAT,2", "METRIC", ""]
        for i, d in enumerate(tools):
            lines.append(f"T{i + 1}C{d:.3f}")
        lines += ["%", "G90", "G05"]
        for i, d in enumerate(tools):
            lines.append(f"T{i + 1}")
            for (x, y, dd) in holes:
                if round(dd, 3) == d:
                    lines.append(f"X{x:.3f}Y{y:.3f}")
        lines.append("M30")
        with open(path(name), "w", encoding="ascii", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")

    pth = [(pd.x, pd.y, pd.drill) for pd in pads if pd.drill] + [(x, y, VIA_DRILL) for (_, x, y) in router.vias]
    drill("Plated,1,2,PTH", pth, "PTH.drl")
    drill("NonPlated,1,2,NPTH", [(pt.x, pt.y, 3.2) for pt in parts if pt.fp == "MOUNT"], "NPTH.drl")
    return files, silk
