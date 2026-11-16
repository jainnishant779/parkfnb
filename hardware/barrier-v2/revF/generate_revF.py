"""PARKFNB V2 - Rev F PRELIMINARY layout: ONE steel box over the V1 mechanism, tyre folds around it (0 - 90 - 180 deg).

STATUS: preliminary concept, FABRICATION HOLD.  No cut DXF / BOM is written unless every verification check passes
AND the script is run with --release.  The tyre opening (and every other number) is a parameter in P: change it,
run   python generate_revF.py   and the layout, checks and drawings are regenerated.

Coordinates (mm): x along the shaft, y front (-, motor side) / rear (+), z up from the top of the box floor (the ground is 6 mm lower).  Source codes:
M = measured on V1 (photos 2026-10-27), S = from the user's sketch, A = ASSUMED / unverified.
"""
import json
import math
import os
import sys

import numpy as np
from shapely.geometry import Point, Polygon, box as sbox
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import cadlib
from cadlib import (plt, Rectangle, View, new_sheet, note_block, table, chain_path, Model, render_iso, export_obj)
from matplotlib.backends.backend_pdf import PdfPages

RELEASE = "--release" in sys.argv
cadlib.REV, cadlib.DATE, cadlib.SHEETS_TOTAL = "F-prelim", "2026-10-27", 8
cadlib.TITLE_LINE = "Rev F PRELIMINARY - one steel box over the V1 mechanism - FABRICATION HOLD"

# ------------------------------------------------------------------------------------------------ parameters
P = dict(
    tyre_open=203.0,        # S  inner opening DIAMETER of the half tyre (sketch 8 in).  PHOTOS SUGGEST 150-170: MEASURE!
    tyre_band=101.5,        # S  radial width of the tyre band (4.00-8 tyre)
    leg=51.0,               # S  straight leg length
    tw=100.0,               # A  tyre thickness used for the sweep (conservative)
    rest_deg=10.0,          # A  tyre rest angle at 0 / 180 deg
    sweep_margin=8.0,       # design: radial clearance box corner <-> tyre
    side_clear=6.0,         # design: lateral clearance box wall <-> tyre inner edge
    wall=4.0, skin=6.0,     # steel box wall / top skin
    zs=36.5,                # M  shaft axis above the box floor (UCP205)
    brg_cc=140.0,           # M  bearing centre-to-centre
    brg_hw=19.0, brg_hl=70.0, brg_top=71.0, brg_foot=15.0,    # M/C  UCP205 foot 38 x 140, dome top 71
    spk_od=70.0,            # M  big sprocket OD (chain wrap ~34 radius)
    spk_small_od=38.0,      # M
    hub_half=15.0,          # A  sprocket hub half length
    chain_pitch=9.525,      # M  3/8 in, NOT 6.35
    c_dist=98.0,            # M  shaft axis to motor axis
    motor_z=25.5,           # A
    gb_d=38.0, gb_len=33.0, can_d=30.0, can_len=35.0, pin=16.0,   # M (+-3)
    top_hi=80.0,            # box top over bearings / sprocket (71 + 3 + skin 6)
    top_ear=52.0,           # box top over the motor (44.5 + 3 + skin 5)
    ear_y=-75.0,            # y where the low step begins (bearing feet end at -70)
    floor_t=6.0,            # box floor plate that sits directly on the ground (NO separate base plate)
    car_kg=2000.0, axle=0.55, dyn=1.5, patch_w=215.0, patch_l=150.0, fy=235.0, E=210000.0,
)
p = P
RI = p["tyre_open"] / 2
RO = RI + p["tyre_band"]
ZS = p["zs"]
cadlib.ZS = ZS
GROUND = -p["floor_t"]          # the ground is under the box floor


# ------------------------------------------------------------------------------------------------ geometry
def y_lim(x, top, ri=None):
    """Half length available at lateral position x so that the box top corner stays sweep_margin inside the tyre."""
    ri = RI if ri is None else ri
    if abs(x) >= ri:
        return 0.0
    d = p["leg"] + math.sqrt(ri * ri - x * x) - p["sweep_margin"]
    return math.sqrt(max(d * d - (top - ZS) ** 2, 0.0))


def region(top, ri=None, y_min=None, y_max=None):
    ri = RI if ri is None else ri
    xmax = ri - p["side_clear"]
    xs = np.linspace(-xmax, xmax, 260)
    pts = [(x, min(y_lim(x, top, ri), y_max if y_max is not None else 1e9)) for x in xs[::-1]]
    pts += [(x, -min(y_lim(x, top, ri), -y_min if y_min is not None else 1e9)) for x in xs]
    pg = Polygon(pts).buffer(0)
    return pg


def box_regions(ri=None):
    hi = region(p["top_hi"], ri)
    ear = region(p["top_ear"], ri)
    main = hi.intersection(sbox(-500, p["ear_y"], 500, 500))
    ear_only = ear.intersection(sbox(-500, -500, 500, p["ear_y"]))
    return main, ear_only


def tyre_slab(x, theta, ri=None):
    ri = RI if ri is None else ri
    ro = ri + p["tyre_band"]
    d_in = p["leg"] + math.sqrt(max(ri * ri - x * x, 0)) if abs(x) < ri else 0.0
    d_out = p["leg"] + math.sqrt(max(ro * ro - x * x, 0))
    t = math.radians(theta)
    d, n = (-math.cos(t), math.sin(t)), (math.sin(t), math.cos(t))
    h = p["tw"] / 2
    return Polygon([(a * d[0] + b * n[0], ZS + a * d[1] + b * n[1]) for a, b in ((d_in, -h), (d_out, -h), (d_out, h), (d_in, h))])


def sweep_clearance(main, ear, xs=(0, 30, 60, 90)):
    out = []
    for x in xs:
        rects = []
        for pg, top in ((main, p["top_hi"]), (ear, p["top_ear"])):
            seg = pg.intersection(sbox(x - 0.05, -500, x + 0.05, 500))
            if seg.is_empty:
                continue
            y0, y1 = seg.bounds[1], seg.bounds[3]
            rects.append(sbox(y0, 0, y1, top))
        if not rects:
            continue
        env = unary_union(rects)
        dmin = min(env.distance(tyre_slab(x, th)) for th in np.linspace(p["rest_deg"], 180 - p["rest_deg"], 90))
        out.append((x, dmin))
    return out


def motor_poly(xs):
    return sbox(xs - p["hub_half"], -p["c_dist"] - p["gb_d"] / 2,
                xs + 6 + p["gb_len"] + p["can_len"] + p["pin"], -p["c_dist"] + p["gb_d"] / 2)


def brg_polys():
    xc = p["brg_cc"] / 2
    return [sbox(s * xc - p["brg_hw"], -p["brg_hl"], s * xc + p["brg_hw"], p["brg_hl"]) for s in (-1, 1)]


def margin_in(pg, inner):
    return min((1 if inner.contains(Point(c)) else -1) * inner.boundary.distance(Point(c)) for c in pg.exterior.coords)


def solve_chain_plane(main, ear):
    inner_main, inner_ear = main.buffer(-p["wall"]), ear.buffer(-p["wall"])
    inner_all = unary_union([main, ear]).buffer(-p["wall"])
    xl = -p["brg_cc"] / 2 + p["brg_hw"]            # inner face of the left bearing
    xr = p["brg_cc"] / 2 - p["brg_hw"]
    best = None
    for xs in np.arange(-60, 40.1, 1.0):
        if xs - p["hub_half"] < xl + 5 or xs + 6 > xr - 5:
            continue
        m = motor_poly(xs)
        mm = margin_in(m, inner_all)
        if best is None or mm > best[0]:
            best = (mm, float(xs))
    return best


# ------------------------------------------------------------------------------------------------ layout of the electronics (preliminary)
LEVELS = [("L1", "floor", 3, 28), ("L2", "PCB deck", 28, 52), ("L3", "ribs + top skin", 52, 80)]
COL3D = (("battery", "#e48bd0"), ("IBT", "#2b66b3"), ("PCB", "#2f8a4a"), ("BMS", "#999999"), ("buck", "#4a7fc0"), ("fuse", "#c0392b"),
         ("IMU", "#3557a8"), ("Hall", "#1d6b35"))


def ccolor(nm):
    for k, c in COL3D:
        if k in nm:
            return c
    return "#cccccc"


def _overlap3(a, b, gap=0.0):
    return (min(a[2], b[2]) + 0 > max(a[1], b[1]) - gap and min(a[4], b[4]) > max(a[3], b[3]) - gap and
            min(a[6], b[6]) > max(a[5], b[5]) - gap)


def _find_place(comps, inner_all, sizes, z0, z1, target, step=3.0):
    best = None
    minx, miny, maxx, maxy = inner_all.bounds
    for dx, dy in sizes:
        for x in np.arange(minx, maxx - dx + 0.1, step):
            for y in np.arange(miny, maxy - dy + 0.1, step):
                fp = sbox(x, y, x + dx, y + dy)
                if not inner_all.contains(fp):
                    continue
                under_step = fp.intersection(sbox(-500, -500, 500, p["ear_y"] - 0.01)).area > 1.0
                if under_step and z1 > p["top_ear"] - 5:
                    continue
                cand = ("tmp", x - 1, x + dx + 1, y - 1, y + dy + 1, z0, z1, "x")
                if any(_overlap3(cand, c) for c in comps):
                    continue
                sc = math.hypot(x + dx / 2 - target[0], y + dy / 2 - target[1])
                if best is None or sc < best[0]:
                    best = (sc, x, y, dx, dy)
    return best


# (name, size options (x, y), z0, z1, preferred centre)
SMALL = [("IBT-2 BTS7960 module 50x50 (no heatsink)", [(50, 50)], 3, 25, (0, -48)),
         ("BMS 4S 60x25", [(60, 25), (25, 60)], 3, 9, (0, 0)),
         ("buck LM2596 module 43x21", [(43, 21), (21, 43)], 3, 17, (0, 0)),
         ("fuse holder + 10 A 30x15", [(30, 15), (15, 30)], 3, 18, (0, 0))]


def components(xs, main_=None, ear_=None):
    main_ = main if main_ is None else main_
    ear_ = ear if ear_ is None else ear_
    inner = unary_union([main_, ear_]).buffer(-p["wall"])
    xc = p["brg_cc"] / 2
    spk_r = p["spk_od"] / 2
    c = []
    for s, nm in ((-1, "bearing L"), (1, "bearing R")):
        c.append((nm + " foot", s * xc - p["brg_hw"], s * xc + p["brg_hw"], -p["brg_hl"], p["brg_hl"], 0, p["brg_foot"], "fixed"))
        c.append((nm + " body", s * xc - p["brg_hw"], s * xc + p["brg_hw"], -33, 33, p["brg_foot"], p["brg_top"], "fixed"))
    c.append(("shaft", -90, 90, -12.5, 12.5, ZS - 12.5, ZS + 12.5, "fixed"))
    c.append(("big sprocket", xs - p["hub_half"], xs + 3, -spk_r, spk_r, ZS - spk_r, ZS + spk_r, "fixed"))
    c.append(("chain run to the motor", xs - 3, xs + 3, -75, -spk_r, 1.5, 60, "fixed"))
    c.append(("chain + motor sprocket + sleeve", xs - p["hub_half"], xs + 3, -p["c_dist"] - 19, -75, 1.5, 46, "fixed"))
    m = motor_poly(xs)
    c.append(("motor body", xs + 6, m.bounds[2], m.bounds[1], m.bounds[3], p["motor_z"] - p["gb_d"] / 2, p["motor_z"] + p["gb_d"] / 2, "fixed"))
    c.append(("IMU pod on the shaft", 20, 32, -22, 22, ZS - 22, ZS + 22, "fixed"))
    c.append(("Hall collar + 3-sensor bracket", 6, 16, -22, 22, ZS - 22, ZS + 22, "fixed"))
    # stacked rear block: battery on the floor (L1), PCB deck above it (L2)
    c.append(("battery holder 4x18650 (V1, 80x76x21)", -40, 40, 40, 116, 3, 24, "proposed"))
    c.append(("controller PCB 100x80 + ESP32 (deck L2)", -50, 50, 38, 118, 31, 49, "proposed"))
    for nm, sizes, z0, z1, tgt in SMALL:
        r = _find_place(c, inner, sizes, z0, z1, tgt)
        if r is None:
            c.append((nm + " - NO ROOM", 0, 1, 0, 1, z0, z1, "unplaced"))
        else:
            _, x, y, dx, dy = r
            c.append((nm, x, x + dx, y, y + dy, z0, z1, "proposed"))
    return c


def check_components(comps, main, ear):
    inner_main, inner_ear = main.buffer(-p["wall"]), ear.buffer(-p["wall"])
    inner_all = unary_union([main, ear]).buffer(-p["wall"])
    res = []
    for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
        fp = sbox(x0, y0, x1, y1)
        step_zone = fp.intersection(sbox(-500, -500, 500, p["ear_y"] - 0.01))     # the part under the low step
        if z1 > p["top_hi"] - p["skin"]:
            res.append((nm, "FAIL", f"top {z1:.0f} above the box ceiling ({p['top_hi'] - p['skin']:.0f})"))
            continue
        if not step_zone.is_empty and step_zone.area > 1.0 and z1 > p["top_ear"] - 5:
            res.append((nm, "FAIL", f"top {z1:.0f} is under the low step (ceiling {p['top_ear'] - 5:.0f})"))
            continue
        lim = p["top_ear"] - 5 if (not step_zone.is_empty and step_zone.area > 1.0) else p["top_hi"] - p["skin"]
        out = fp.difference(inner_all)
        if out.is_empty:
            res.append((nm, "PASS", f"inside the box, ceiling margin {lim - z1:.0f} mm"))
        else:
            depth = max(Point(c).distance(inner_all) for c in fp.exterior.coords)
            res.append((nm, "FAIL", f"sticks out of the box by {depth:.0f} mm"))
    # pairwise overlaps
    for i in range(len(comps)):
        for j in range(i + 1, len(comps)):
            a, b = comps[i], comps[j]
            if "shaft" in (a[0], b[0]) and any(k in (a[0] + b[0]) for k in ("bearing", "sprocket", "chain", "IMU", "Hall")):
                continue
            if min(a[2], b[2]) > max(a[1], b[1]) and min(a[4], b[4]) > max(a[3], b[3]) and min(a[6], b[6]) > max(a[5], b[5]):
                res.append((f"{a[0]} / {b[0]}", "FAIL", "components overlap"))
    return res


# ------------------------------------------------------------------------------------------------ wheel load
F_WHEEL = p["car_kg"] * 9.81 * p["axle"] / 2 * p["dyn"]
P_PATCH = F_WHEEL / (p["patch_w"] * p["patch_l"])


def plate_sf(t, L):
    sig = (P_PATCH * L * L / 8) / (t * t / 6)
    return sig, p["fy"] / sig


def tee_sf(tf, bf, tw, hw, span):
    A1, A2 = bf * tf, tw * hw
    y1, y2 = tf / 2, tf + hw / 2
    yc = (A1 * y1 + A2 * y2) / (A1 + A2)
    I = bf * tf ** 3 / 12 + A1 * (yc - y1) ** 2 + tw * hw ** 3 / 12 + A2 * (y2 - yc) ** 2
    sig = F_WHEEL * span / 4 / (I / (tf + hw - yc))
    return sig, p["fy"] / sig


# ------------------------------------------------------------------------------------------------ run the verification
main, ear = box_regions()
inner_all = unary_union([main, ear]).buffer(-p["wall"])
best = solve_chain_plane(main, ear)
XS = best[1] if best else -30.0
MOTOR_MARGIN = best[0] if best else -99.0
comps = components(XS, main, ear)


def find_anchors(comps_, main_, ear_):
    """One M12 anchor spot per quadrant on the box floor: washer (dia 24) clear of every part, reachable from above."""
    inner_ = unary_union([main_, ear_]).buffer(-p["wall"] - 14)
    occ = unary_union([sbox(c[1], c[3], c[2], c[4]).buffer(12) for c in comps_ if c[7] != "unplaced" and c[5] < 60])
    free = inner_.difference(occ)
    out = []
    for sx, sy in ((-1, 1), (1, 1), (-1, -1), (1, -1)):
        best = None
        for x in np.arange(0, 100, 3.0):
            for y in np.arange(0, 140, 3.0):
                if free.contains(Point(sx * x, sy * y)):
                    sc = math.hypot(x, y)
                    if best is None or sc > best[0]:
                        best = (sc, sx * x, sy * y)
        if best:
            out.append((round(best[1], 1), round(best[2], 1)))
    return out


ANCH = find_anchors(comps, main, ear)


def tyre_plan(sg):
    """Plan outline of the tyre lying toward sg*y (0 deg: sg = -1, 180 deg: sg = +1)."""
    pts = [(RO, 0), (RO, p["leg"])] + [(RO * math.cos(q), p["leg"] + RO * math.sin(q)) for q in np.linspace(0, math.pi, 60)] + \
          [(-RO, p["leg"]), (-RO, 0), (-RI, 0), (-RI, p["leg"])] + \
          [(RI * math.cos(q), p["leg"] + RI * math.sin(q)) for q in np.linspace(math.pi, 0, 60)] + [(RI, p["leg"]), (RI, 0)]
    return [(a, sg * b) for a, b in Polygon(pts).buffer(0).exterior.coords]


comp_res = check_components(comps, main, ear)
sweep = sweep_clearance(main, ear)
brg_inside = all(inner_all.contains(b) for b in brg_polys())
brg_margin = min(margin_in(b, inner_all) for b in brg_polys())
SPK_GAP_L = (XS - p["hub_half"]) - (-p["brg_cc"] / 2 + p["brg_hw"])
SPK_GAP_R = (p["brg_cc"] / 2 - p["brg_hw"]) - (XS + 6)
SF = dict(top=plate_sf(p["skin"], 75.0), ear=plate_sf(5.0, 60.0), rib=tee_sf(6.0, 100.0, 8.0, 30.0, 190.0))


def status(v, ok, marginal):
    return "PASS" if v >= ok else ("MARGINAL" if v >= marginal else "FAIL")


CHECKS = [
    ("Bearings (+/-%.0f, feet 38 x 140) inside the box walls" % (p["brg_cc"] / 2), status(brg_margin, 3, 0), f"margin {brg_margin:.1f} mm"),
    ("Motor inside the low-step box", status(MOTOR_MARGIN, 3, 0),
     f"margin {MOTOR_MARGIN:.1f} mm at chain plane x = {XS:+.0f} (sprocket slid {abs(XS):.0f} mm from the centre)"),
    ("Big sprocket hub to left bearing face", status(SPK_GAP_L, 5, 2), f"{SPK_GAP_L:.1f} mm"),
    ("Chain plane + motor to right bearing face", status(SPK_GAP_R, 5, 2), f"{SPK_GAP_R:.1f} mm"),
    ("Full 10-170 deg sweep: tyre to box, min over x", status(min(d for _, d in sweep), p["sweep_margin"] - 0.5, 3),
     "min %.1f mm (%s)" % (min(d for _, d in sweep), ", ".join(f"x={x:g}: {d:.1f}" for x, d in sweep))),
    ("Lateral gap box wall to tyre inner edge", status(p["side_clear"], 5, 3), f"{p['side_clear']:.0f} mm by construction"),
] + [(f"Electronics: {n}", s, d) for n, s, d in comp_res]
CHECKS += [("Anchors: 4 x M12 floor spots free of parts (washer dia 24)", "PASS" if len(ANCH) == 4 else ("MARGINAL" if len(ANCH) == 3 else "FAIL"),
            f"{len(ANCH)} found: " + ", ".join(f"({x:g},{y:g})" for x, y in ANCH))]
CHECKS += [("Wheel load: top skin 6 mm, span 75", status(SF["top"][1], 1.5, 1.0), f"SF {SF['top'][1]:.1f}"),
           ("Wheel load: ear top 5 mm, span 60", status(SF["ear"][1], 1.5, 1.0), f"SF {SF['ear'][1]:.1f}"),
           ("Wheel load: rib 8x30 + skin, span 190", status(SF["rib"][1], 1.5, 1.0), f"SF {SF['rib'][1]:.1f}")]
ALL_PASS = all(s == "PASS" for _, s, _ in CHECKS)
HARD_FAIL = [c for c in CHECKS if c[1] == "FAIL"]


def feasibility(opening):
    ri = opening / 2
    mn, er = box_regions(ri)
    inner = unary_union([mn, er]).buffer(-p["wall"])
    xl, xr = -p["brg_cc"] / 2 + p["brg_hw"], p["brg_cc"] / 2 - p["brg_hw"]
    bi = min(margin_in(b, inner) for b in brg_polys())
    bm = None
    for xs in np.arange(-60, 40.1, 1.0):
        if xs - p["hub_half"] < xl + 5 or xs + 6 > xr - 5:
            continue
        mm = margin_in(motor_poly(xs), inner)
        bm = mm if bm is None or mm > bm else bm
    cs = [c for c in check_components(components(XS, mn, er), mn, er) if c[1] == "FAIL"]
    return bi, (bm if bm is not None else -99.0), len(cs)


RECT_LEN = 2 * y_lim(RI - p["side_clear"], p["top_hi"])      # longest plain rectangle of full width
SENS = [(o, *feasibility(o)) for o in (150.0, 160.0, 170.0, 180.0, 190.0, 203.0, 210.0, 220.0)]

print(f"tyre opening {p['tyre_open']:.0f} mm (RI {RI:.1f}), chain plane x = {XS:+.0f}")
for n, s, d in CHECKS:
    print(f"  {s:<9} {n}: {d}")
print("sensitivity (opening, bearing margin, motor margin, electronics fails):")
for o, bi, bm, nf in SENS:
    print(f"  {o:5.0f}  bearings {bi:6.1f}  motor {bm:6.1f}  electronics fails {nf}")

# ------------------------------------------------------------------------------------------------ 3-D model
def vprism(M, name, color, poly, z0, z1, alpha=1.0):
    pts = list(poly.exterior.coords)[:-1]
    if not Polygon(pts).exterior.is_ccw:
        pts = pts[::-1]
    n = len(pts)
    v = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    f = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    M.add(name, color, v, f, alpha)


def build(theta, box_alpha=1.0, with_box=True):
    M = Model()
    for s in (-1, 1):
        cx = s * p["brg_cc"] / 2
        M.box("bearing", "#2f7d53", cx - p["brg_hw"], cx + p["brg_hw"], -p["brg_hl"], p["brg_hl"], 0, p["brg_foot"])
        M.cyl("bearing", "#2f7d53", (0, ZS), 34.5, cx - 17, cx + 17, "x")
        M.cyl("arch_bracket", "#7b7b7b", (0, ZS), 22.0, s * 152 - 18, s * 152 + 18, "x")
    M.cyl("shaft", "#d0d0d0", (0, ZS), 12.5, -203, 203, "x")
    M.cyl("sprocket", "#8f8f8f", (XS, ZS), p["spk_od"] / 2, XS - 3, XS + 3, "x", n=40)
    M.cyl("hub", "#b08d57", (XS, ZS), 22, XS - p["hub_half"], XS - 3, "x")
    xm = XS + 6
    M.cyl("gearbox", "#bfc3c7", (-p["c_dist"], p["motor_z"]), p["gb_d"] / 2, xm, xm + p["gb_len"], "x")
    M.cyl("motor", "#c9ccd0", (-p["c_dist"], p["motor_z"]), p["can_d"] / 2, xm + p["gb_len"], xm + p["gb_len"] + p["can_len"], "x")
    path = chain_path((0, ZS), 0.5 * (p["spk_od"] - p["chain_pitch"] * 0.6), (-p["c_dist"], p["motor_z"]), 14.0, 20)
    for (a, b), (c, d) in zip(path[:-1], path[1:]):
        L = math.hypot(c - a, d - b)
        if L > 0.1:
            nx, nz = -(d - b) / L * 2, (c - a) / L * 2
            v = [(XS - 3, a - nx, b - nz), (XS - 3, c - nx, d - nz), (XS - 3, c + nx, d + nz), (XS - 3, a + nx, b + nz),
                 (XS + 3, a - nx, b - nz), (XS + 3, c - nx, d - nz), (XS + 3, c + nx, d + nz), (XS + 3, a + nx, b + nz)]
            M.add("chain", "#3a3a3a", v, [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
    for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
        if kind == "proposed":
            col = ccolor(nm)
            M.box(nm, col, x0, x1, y0, y1, z0, z1)
    if with_box:
        vprism(M, "steel_box_main", "#8fa3b8", main, GROUND, p["top_hi"], box_alpha)
        vprism(M, "steel_box_step", "#8fa3b8", ear, GROUND, p["top_ear"], box_alpha)
        M.box("qr_plate", "#f2f2f2", -40, 40, -48, -8, p["top_hi"], p["top_hi"] + 0.6)
    M.uarch("tyre", "#2b2b2b", theta, RO, RI, p["leg"], p["tw"], ZS)
    return M


# ------------------------------------------------------------------------------------------------ drawings
sheets = []
COL = {"PASS": "#1d7a3a", "MARGINAL": "#b07000", "FAIL": "#b02020"}


def stat_table(ax, x, y, rows, widths, size=4.9, rh=4.1):
    yy = table(ax, x, y, ["CHECK", "STATUS", "RESULT"], rows, widths, rh=rh, size=size)
    return yy


# ---- sheet 1
fig, ax = new_sheet(1, "REV F PRELIMINARY: COVER, STATUS, PARAMETERS", "-")
ax.text(20, 279, "PARKFNB V2 - Rev F  PRELIMINARY CONCEPT", fontsize=16, weight="bold", va="top")
ax.text(20, 270, "One steel box over shaft, bearings, motor, chain and electronics; the tyre folds around it (0 - 90 - 180 deg).",
        fontsize=8.5, va="top", color="#333")
ax.text(20, 263.5, "STATUS:  FABRICATION HOLD - cut files, BOM and final drawings are NOT released until every check below passes "
        "and the 'A' values are measured.", fontsize=7.2, va="top", color="#a02020", weight="bold")
render_iso(ax, build(90, 0.35), 100, 172, 0.15)
ax.text(100, 118, "arch standing (90 deg, locked); box drawn 65 % transparent", fontsize=6, ha="center", color="#444")
prm = [("Tyre opening (inner diameter)", f"{p['tyre_open']:.0f} mm", "S - PHOTOS SAY 150-170, MEASURE"),
       ("Tyre band / straight leg", f"{p['tyre_band']:.1f} / {p['leg']:.0f} mm", "S"),
       ("Bearing centre-to-centre", f"{p['brg_cc']:.0f} mm", "M"),
       ("Bearing foot (along shaft x across)", "38 x 140; dome top 71", "M / catalogue"),
       ("Shaft axis above the box floor", f"{ZS} mm", "M"),
       ("Chain pitch", "9.525 mm (3/8 in)", "M"),
       ("Big sprocket / small sprocket OD", f"{p['spk_od']:.0f} / {p['spk_small_od']:.0f} mm; teeth unknown", "M"),
       ("Shaft to motor axis", f"{p['c_dist']:.0f} mm", "M"),
       ("Motor gearbox / can dia, plate to pin", f"{p['gb_d']:.0f} / {p['can_d']:.0f} dia, 84 long", "M +-3"),
       ("Box top (over bearings) / over motor", f"{p['top_hi']:.0f} / {p['top_ear']:.0f} above the box floor", "design"),
       ("Chain plane (solved)", f"x = {XS:+.0f} mm (slide the sprocket on the shaft)", "design"),
       ("Battery", "4 x 18650, series/parallel unknown", "A"),
       ("Tyre thickness used for the sweep", f"{p['tw']:.0f} mm", "A - conservative"),
       ("Rest angle at 0 / 180", f"{p['rest_deg']:.0f} deg", "A - MEASURE")]
table(ax, 205, 258, ["PARAMETER", "VALUE", "SOURCE"], prm, [60, 62, 58], rh=4.2, size=4.8)
yy = stat_table(ax, 20, 112, [(n[:58], s, d[:70]) for n, s, d in CHECKS[:11]], [78, 16, 86], size=4.5, rh=3.8)
sheets.append(fig)

# ---- sheet 2: verification
fig, ax = new_sheet(2, "VERIFICATION: FULL SWEEP, FIT, OPENING SENSITIVITY", "1 : 3")
SC = 0.3
V = View(ax, 120, 150, SC)
px, py = RO, p["leg"] + RO            # tyre footprint: there is no base plate
V.rect(-px, px, -py, py, "phan")
for sg in (-1, 1):
    ang = p["rest_deg"]
    t = Polygon([(a, sg * b * math.cos(math.radians(ang))) for a, b in
                 list(Polygon([(RO, 0), (RO, p["leg"])] + [(RO * math.cos(q), p["leg"] + RO * math.sin(q)) for q in np.linspace(0, math.pi, 50)] +
                              [(-RO, p["leg"]), (-RO, 0), (-RI, 0), (-RI, p["leg"])] +
                              [(RI * math.cos(q), p["leg"] + RI * math.sin(q)) for q in np.linspace(math.pi, 0, 50)] + [(RI, p["leg"]), (RI, 0)]).buffer(0).exterior.coords)])
    V.line(list(t.exterior.coords), "phan", close=True, fill="#333", alpha=0.10)
for pg, top, col in ((main, p["top_hi"], "#8fa3b8"), (ear, p["top_ear"], "#b9c8d8")):
    V.line(list(pg.exterior.coords), "out", close=True, fill=col, alpha=0.9)
V.line(list(inner_all.exterior.coords), "hid", close=True)
for b in brg_polys():
    V.line(list(b.exterior.coords), "thin", close=True, fill="#2f7d53", alpha=0.45)
V.line(list(motor_poly(XS).exterior.coords), "out", close=True, fill="#bdbdbd", alpha=0.8)
V.rect(-203, 203, -12.5, 12.5, fill="#d8d8d8", alpha=0.7)
V.circle(XS, 0, p["spk_od"] / 2, "thin", fill="#9a9a9a", alpha=0.35)
for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
    if kind == "proposed":
        V.rect(x0, x1, y0, y1, "elec")
V.text(0, 262, "tyre lying at 180 deg (dashed)", 4.6, color="#1f5fae", dxf=False)
V.text(0, -262, "tyre lying at 0 deg (dashed)", 4.6, color="#1f5fae", dxf=False)
V.text(XS + 40, -98, "MOTOR", 4.4, dxf=False)
ax.text(20, 280, f"PLAN with the tyre opening = {p['tyre_open']:.0f} mm (parameter P['tyre_open'])", fontsize=6.6, weight="bold", va="top")
sw = [(f"x = {x:g}", f"{d:.1f} mm", "PASS" if d >= p["sweep_margin"] - 0.5 else "FAIL") for x, d in sweep]
table(ax, 215, 276, ["SWEEP (10 -> 170 deg)", "MIN GAP TYRE-BOX", "STATUS"], sw, [50, 70, 40], rh=4.3, size=5.0)
srow = [(f"{o:.0f} mm", f"{bi:.1f}", f"{bm:.1f}", str(nf),
         "FEASIBLE" if bi >= 3 and bm >= 3 and nf == 0 else ("MARGINAL" if bi >= 0 and bm >= 0 and nf == 0 else "NO")) for o, bi, bm, nf in SENS]
yy = table(ax, 215, 238, ["OPENING", "BEARING MARGIN", "MOTOR MARGIN", "ELEC FAILS", "RESULT"], srow, [28, 36, 36, 28, 32], rh=4.3, size=5.0)
note_block(ax, 215, yy - 8, "READING THIS", [
    "Margin = distance from the part to the inner face of the box wall (mm); negative = sticks out.",
    "The box outline is NOT a plain rectangle: it is cut back at the corners so the swinging tyre",
    f"stays 8 mm clear at every angle.  A plain full-width rectangle would be only {RECT_LEN:.0f} mm long.",
    "The photos suggest the opening is 150-170 mm: every row below ~190 fails.  Measuring the",
    "opening decides the whole concept - change P['tyre_open'] and rerun.",
    "Electronics layout: 3 levels, sheet 6.",
], size=5.0, lh=3.3)
sheets.append(fig)

# ---- sheet 3: GA plan
fig, ax = new_sheet(3, "GENERAL ARRANGEMENT - PLAN (PRELIMINARY)", "1 : 2.5")
SC = 0.28
V = View(ax, 140, 150, SC)
for sg in (-1, 1):
    V.line(tyre_plan(sg), "phan", close=True, fill="#333333", alpha=0.20)
V.text(0, -py + 12, "tyre lying at 0 deg (on the ground)", 4.4, color="#1f5fae", dxf=False)
V.text(0, py - 12, "tyre lying at 180 deg", 4.4, color="#1f5fae", dxf=False)
V.line(list(main.exterior.coords), "out", close=True, fill="#8fa3b8", alpha=0.85)
V.line(list(ear.exterior.coords), "out", close=True, fill="#b9c8d8", alpha=0.9)
V.line(list(inner_all.exterior.coords), "hid", close=True)
V.rect(-203, 203, -12.5, 12.5, fill="#d8d8d8", alpha=0.8)
for sx in (-1, 1):
    V.rect(sx * 152 - 18, sx * 152 + 18, -25, 25, fill="#8a8a8a", alpha=0.7)
for b in brg_polys():
    V.line(list(b.exterior.coords), "thin", close=True, fill="#2f7d53", alpha=0.45)
V.circle(XS, 0, p["spk_od"] / 2, "thin", fill="#9a9a9a", alpha=0.4)
V.line(list(motor_poly(XS).exterior.coords), "out", close=True, fill="#bdbdbd", alpha=0.9)
for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
    if kind == "proposed":
        col = ccolor(nm)
        V.rect(x0, x1, y0, y1, "out", fill=col, alpha=0.55)
        V.text((x0 + x1) / 2, (y0 + y1) / 2, nm.split(" (")[0].split(" 50")[0].split(" 100")[0], 4.0, color="#111", dxf=False)
for (ax_, ay_) in ANCH:
    V.circle(ax_, ay_, 7.0, "out", fill="#ffffff", alpha=0.9)
    V.text(ax_, ay_ - 13, "M12", 3.6, dxf=False)
V.rect(-40, 40, -48, -8, "out", fill="#ffffff", alpha=0.9)
V.text(0, -28, "QR PLATE", 4.4, dxf=False)
V.text(XS + 40, -100, "MOTOR\n(low step)", 4.4, dxf=False)
V.text(0, p["tyre_open"] / 2 + 150, "ARCH SWEEP 0 - 180 deg", 4.6, color="#1f5fae", dxf=False)
V.dim((-px, py), (px, py), 10)
V.dim((-px, -py), (-px, py), -16, "v")
bxm = main.bounds
V.dim((bxm[0], 0), (bxm[2], 0), 118, txt=f"box {bxm[2] - bxm[0]:.0f}")
V.dim((XS, 0), (XS + 1, 0), 0.1, txt="")
ax.text(20, 280, "PLAN - box outline derived from the tyre sweep; chain plane slid to x = %+.0f" % XS, fontsize=6.6, weight="bold", va="top")
yy = table(ax, 255, 276, ["ITEM", "VALUE"], [
    ("Box (main) top / step top", f"{p['top_hi']:.0f} / {p['top_ear']:.0f} above the box floor"),
    ("Box length at x = 0 (front-rear)", f"{(y_lim(0, p['top_hi']) + y_lim(0, p['top_ear'])):.0f} mm"),
    ("Box width (outer)", f"{bxm[2] - bxm[0]:.0f} mm"),
    ("Base plate", "NONE: the 6 mm box floor sits on the ground"),
    ("Tyre footprint (lying)", f"{2 * px:.0f} x {2 * py:.0f} mm, rests on the ground"),
    ("Shaft ends / brackets", "outside the box, x = +/-101 ... +/-203"),
    ("Rest pads", "2 loose rubber strips on the ground under the tyre crown (optional)"),
    ("Anchors", f"{len(ANCH)} x M12 through the box floor, INSIDE the box (lids off to reach)")], [58, 98], rh=4.3, size=5.0)
note_block(ax, 255, yy - 8, "NOTES", [
    f"1  Plain rectangular box rejected: full width it would be only {RECT_LEN:.0f} mm long.  The bullet shape follows the tyre sweep.",
    "2  Electronics layout: 3 levels, see sheet 6 (V1 4-cell holder fits; IBT-2, BMS, buck, fuse in the centre floor).",
    "3  Shaft passes through both side walls with labyrinth seals; brackets stay outside.",
    "4  Everything the wheel can reach is steel or rubber; see sheet 5 for the wheel-load check.",
], size=5.0, lh=3.3)
sheets.append(fig)

# ---- sheet 4: elevations
fig, ax = new_sheet(4, "ELEVATIONS: 90 / 0 DEG, QR WINDOW, DON'T TOUCH LABEL", "1 : 3")
SC = 0.3
V = View(ax, 120, 150, SC)
V.line([(-px - 15, GROUND), (px + 15, GROUND)], "thin")
xw = main.bounds[2]
V.rect(-xw, xw, 0, p["top_hi"], fill="#8fa3b8", alpha=0.95)
V.rect(-xw, xw, 0, p["top_ear"], fill="#b9c8d8", alpha=0.0)
V.rect(-35, 35, 18, 38, "out", fill="#ffffff", alpha=0.95)
V.text(0, 28, "DON'T TOUCH", 4.2, weight="bold", dxf=False)
for s in (-1, 1):
    V.rect(s * 152 - 18, s * 152 + 18, ZS - 22, ZS + 22, fill="#8a8a8a", alpha=0.8)
V.rect(-203, 203, ZS - 12.5, ZS + 12.5, fill="#d8d8d8", alpha=0.9)
band = [(a, ZS + b) for a, b in
        [(RO, 0), (RO, p["leg"])] + [(RO * math.cos(q), p["leg"] + RO * math.sin(q)) for q in np.linspace(0, math.pi, 50)] +
        [(-RO, p["leg"]), (-RO, 0), (-RI, 0), (-RI, p["leg"])] + [(RI * math.cos(q), p["leg"] + RI * math.sin(q)) for q in np.linspace(math.pi, 0, 50)] +
        [(RI, p["leg"]), (RI, 0)]]
V.line(band, "out", close=True, fill="#3b3b3b", alpha=0.3)
V.text(0, ZS + p["leg"] + RI + 40, "FRONT, arch standing 90 deg (LOCKED)", 5.0, bg="white", dxf=False)
V.dim((-px, GROUND), (-px, ZS + p["leg"] + RO), -22, "v")
V.dim((px, GROUND), (px, p["top_hi"]), 14, "v", txt=f"{p['top_hi'] - GROUND:.0f}")
ax.text(20, 280, "FRONT ELEVATION (from the motor side), arch standing", fontsize=6.4, weight="bold", va="top")
V = View(ax, 330, 150, SC)
V.line([(-py - 15, GROUND), (py + 15, GROUND)], "thin")
yl0 = y_lim(0, p["top_hi"])
V.rect(-yl0, yl0, 0, p["top_hi"], fill="#8fa3b8", alpha=0.9)
ye = y_lim(0, p["top_ear"])
V.rect(-ye, p["ear_y"], 0, p["top_ear"], fill="#b9c8d8", alpha=0.95)
V.rect(-yl0, p["ear_y"], p["top_ear"], p["top_hi"], fill="white", alpha=0.0)
V.circle(0, ZS, 12.5, fill="#d8d8d8")
V.circle(-p["c_dist"], p["motor_z"], p["gb_d"] / 2, fill="#c9ccd0")
V.circle(0, ZS, p["spk_od"] / 2, "hid")
V.rect(-40, 0, p["top_hi"], p["top_hi"] + 1.2, "out", fill="#f2f2f2")
for th, col in ((p["rest_deg"], "#1f5fae"), (90, "#222"), (180 - p["rest_deg"], "#1f5fae")):
    t = math.radians(th)
    d, nrm = (-math.cos(t), math.sin(t)), (math.sin(t), math.cos(t))
    a0, a1 = p["leg"] + RI, p["leg"] + RO
    V.line([(a * d[0] + b * nrm[0], ZS + a * d[1] + b * nrm[1]) for a, b in
            ((a0, -p["tw"] / 2), (a1, -p["tw"] / 2), (a1, p["tw"] / 2), (a0, p["tw"] / 2))], "phan", close=True, fill=col, alpha=0.12)
V.text(-170, 215, "180 deg", 4.6, color="#1f5fae", dxf=False)
V.text(170, 215, "0 deg", 4.6, color="#1f5fae", dxf=False)
V.text(0, 295, "90 deg", 4.6, dxf=False)
V.text(-ye + 20, 62, "LOW STEP", 4.2, dxf=False)
V.text(0, -20, "QR plate flush in the top skin", 4.0, dxf=False)
ax.text(205, 280, "SIDE SECTION through x = 0 with the tyre at 10 / 90 / 170 deg", fontsize=6.4, weight="bold", va="top")
note_block(ax, 20, 70, "FRONT PANEL", [
    "QR plate: 3 mm aluminium, printed + clear laminate, FLUSH in the top skin, 80 x 40 (readable by the driver).",
    "DON'T TOUCH label: engraved 3 mm plate flush on the box front, 70 x 20.  Neither can be driven over loose.",
    "Switch, fuse, charge jack: on the REAR end wall (sheet 5), away from the tyre sweep side.",
], size=5.1, lh=3.4)
sheets.append(fig)

# ---- sheet 5: construction
fig, ax = new_sheet(5, "BOX CONSTRUCTION, COMPARTMENTS, WHEEL-LOAD CHECK", "AS SHOWN")
rows = [("Drive compartment (front, y < -75)", "motor, chain, small sprocket; drains dia 10; low step 52"),
        ("Centre (bearings, shaft, big sprocket)", "top 80; shaft seals both sides; hatch for the shear collar"),
        ("Electronics compartment (rear + centre floor)", "battery, PCB deck, IBT-2, BMS, buck, fuse; gasket + vent; RF window in the rear wall"),
        ("Walls / skin", "4 mm walls welded to the 6 mm floor plate that sits ON THE GROUND (no base plate); 6 mm top skin; 2 ribs 8 x 30"),
        ("QR + label", "flush plates, see sheet 4"), ("Service", "top skin lifts off (12 x M8 security); anchors are inside, reached with the lids off")]
yy = table(ax, 20, 276, ["PART", "DESCRIPTION"], rows, [60, 160], rh=4.5, size=5.2)
sf_rows = [("Design wheel", f"{F_WHEEL / 1000:.1f} kN (2 t car, 55 % axle, x1.5)"),
           ("Top skin 6 mm, span 75", f"{SF['top'][0]:.0f} MPa, SF {SF['top'][1]:.1f}"),
           ("Step top 5 mm, span 60", f"{SF['ear'][0]:.0f} MPa, SF {SF['ear'][1]:.1f}"),
           ("Rib 8 x 30 + skin, span 190", f"{SF['rib'][0]:.0f} MPa, SF {SF['rib'][1]:.1f} (all load on one rib)")]
yy = table(ax, 20, yy - 8, ["WHEEL-LOAD CHECK (hand calc)", "RESULT"], sf_rows, [70, 120], rh=4.5, size=5.2)
note_block(ax, 20, yy - 8, "NOT YET DONE", [
    "Impact on the standing arch / shear-pin limiter: carry over from Rev E sheet 9 once the box is frozen.",
    "Water: gasket, drains, drip hoods - carry over from Rev E sheet 9.  Heat: white powder coat, battery air gap.",
    "Cable routing under the deck, switch / jack cut-outs, hole tables: only after the opening is measured.",
], size=5.1, lh=3.4)
cx = View(ax, 330, 160, 0.42)
cx.line(list(main.exterior.coords), "out", close=True, fill="#8fa3b8", alpha=0.5)
cx.line(list(ear.exterior.coords), "out", close=True, fill="#b9c8d8", alpha=0.6)
cx.line([(-xw, p["ear_y"]), (xw, p["ear_y"])], "cen")
cx.line([(-xw, 25), (xw, 25)], "cen")
cx.text(0, 150, "ELECTRONICS COMPARTMENT", 4.4, dxf=False)
cx.text(0, -150, "DRIVE COMPARTMENT", 4.4, dxf=False)
cx.text(0, 8, "SHAFT / BEARINGS", 4.0, dxf=False)
ax.text(255, 280, "PLAN: compartment split (preliminary)", fontsize=6.4, weight="bold", va="top")
sheets.append(fig)

# ---- sheet 6: internal layers
def short(nm):
    return nm.split(" (")[0].replace(" module", "").replace(" holder", "")[:20]


def level_parts(lo, hi):
    out = []
    for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
        if kind == "unplaced":
            continue
        if z1 > lo and z0 < hi:
            out.append((nm, x0, x1, y0, y1, z0, z1, kind))
    return out


def draw_level(V, lo, hi, tag):
    V.line(list(main.exterior.coords), "out", close=True, fill="#dfe6ee", alpha=0.9)
    V.line(list(ear.exterior.coords), "out", close=True, fill="#eef2f6", alpha=0.9)
    V.line(list(inner_all.exterior.coords), "hid", close=True)
    for (nm, x0, x1, y0, y1, z0, z1, kind) in level_parts(lo, hi):
        if kind == "fixed":
            col = "#2f7d53" if "bearing" in nm else "#b8b8b8"
            V.rect(x0, x1, y0, y1, "thin", fill=col, alpha=0.55)
        else:
            V.rect(x0, x1, y0, y1, "out", fill=ccolor(nm), alpha=0.7)
            V.text((x0 + x1) / 2, (y0 + y1) / 2, short(nm), 3.4, color="#111", dxf=False)
    V.text(0, 150, tag, 4.6, weight="bold", dxf=False)


fig, ax = new_sheet(6, "INTERNAL LAYOUT: THREE LEVELS, STACK SECTION", "1 : 2")
SCL = 0.5
for k, (lv, nm_, lo, hi) in enumerate(LEVELS):
    Vl = View(ax, 70 + k * 108, 207, SCL)
    draw_level(Vl, lo, hi, f"{lv} {nm_}  z {lo:.0f} - {min(hi, p['top_hi'] - p['skin']):.0f}")
ax.text(20, 281, "PLAN OF EACH LEVEL (box outline, parts whose height falls in that level; grey = V1 mechanism)", fontsize=6.4, weight="bold", va="top")
lrows = [("L1  floor  z 3 - 26", "battery (rear, y 40..116), IBT-2 (front centre), BMS, buck, fuse (centre) - under the shaft, which starts at z 24"),
         ("L2  PCB deck  z 31 - 49", "controller PCB 100x80 on 4 x M3 x 28 posts standing on the box floor beside the battery; ESP32 antenna faces the rear RF window"),
         ("L3  z 52 - 74", "NO electronics: only the 6 mm top skin and ribs (8 x 30 at x = +/-62), so the wheel load never reaches a board"),
         ("Centre line", "shaft z 24 - 49, big sprocket, bearing domes up to z 71 - nothing else can use the middle above z 24")]
table(ax, 222, 128, ["LEVEL", "CONTENT"], lrows, [28, 160], rh=5.0, size=4.4)
SV = View(ax, 120, 78, 0.55)
SV.rect(-135, 135, -6, 0, fill="#bbbbbb")
SV.rect(-135, 135, 0, p["top_hi"], "out", fill="#dfe6ee", alpha=0.5)
SV.rect(-120, p["ear_y"], 0, p["top_ear"], "out", fill="#eef2f6", alpha=0.8)
SV.line([(-135, p["top_hi"] - p["skin"]), (135, p["top_hi"] - p["skin"])], "cen")
for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
    if kind == "unplaced" or not (x0 <= 0 <= x1 or x0 <= 1 <= x1):
        continue
    col = ccolor(nm) if kind == "proposed" else ("#2f7d53" if "bearing" in nm else "#c8c8c8")
    if "shaft" in nm:
        SV.circle(0, ZS, 12.5, "out", fill="#d8d8d8")
        continue
    SV.rect(y0, y1, z0, z1, "out" if kind == "proposed" else "thin", fill=col, alpha=0.7)
    if kind == "proposed":
        SV.text((y0 + y1) / 2, (z0 + z1) / 2, short(nm), 3.4, dxf=False)
SV.dim((40, 3), (40, 24), -30, "v", txt="21")
SV.dim((120, 31), (120, 49), 14, "v", txt="PCB 18")
SV.dim((135, 0), (135, p["top_hi"] - p["skin"]), 16, "v", txt=f"{p['top_hi'] - p['skin']:.0f}")
ax.text(20, 128, "SECTION AT x = 0 (y across, z up): battery on the floor, PCB deck above it, IBT-2 and small modules in front", fontsize=6.0, weight="bold", va="top")
note_block(ax, 20, 52, "HOW THE LEVELS ARE BUILT", [
    "L1: 3 mm steel tray bolted to the box floor; battery strapped with 2 straps + foam; IBT-2 on 4 x M3 posts, 3 mm thermal pad to the tray.",
    "L2: PCB on 4 x M3 x 28 posts that stand on the box floor at the PCB corners (x = +/-46), clear of the battery (x +/-40).  Battery top 24 to PCB underside 31 = 7 mm (solder leads stick out 2.5).",
    "Antenna end of the PCB points at the rear wall, 6 mm from the RF window (PC 6 mm).  No steel between the antenna and the window.",
    "Centre floor: BMS, buck module and fuse holder under the shaft (z 1 - 18; shaft bottom is z 24, so 6+ mm clearance).",
], size=4.9, lh=3.2)
sheets.append(fig)

# ---- sheet 7: cables, service, exploded view
def centre_of(kw):
    for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
        if kw in nm and kind != "unplaced":
            return ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    return None


REAR_Y = y_lim(0, p["top_hi"]) - p["wall"] - 5
PORTS = {"battery": centre_of("battery"), "BMS": centre_of("BMS"), "fuse": centre_of("fuse"), "IBT-2": centre_of("IBT"),
         "PCB": centre_of("PCB"), "buck": centre_of("buck"), "motor": centre_of("motor body"), "Hall": centre_of("Hall"),
         "IMU": centre_of("IMU"), "SW1": (0.0, REAR_Y, 40.0), "jack": (30.0, REAR_Y - 8, 40.0)}


def wire_len(a, b, slack=40.0):
    pa, pb = PORTS[a], PORTS[b]
    return sum(abs(u - v) for u, v in zip(pa, pb)) + slack


WIRES = [("W1", "cells -> BMS (balance + P-/B-)", "battery", "BMS", "5-wire balance + 1.5 mm2"),
         ("W2", "BMS P+ -> fuse holder", "BMS", "fuse", "1.5 mm2"),
         ("W3", "fuse -> ON/OFF switch SW1 (rear wall)", "fuse", "SW1", "1.5 mm2"),
         ("W4", "SW1 -> IBT-2 B+ (and PCB J1 via 1 A PTC)", "SW1", "IBT-2", "1.5 mm2 + 0.75 mm2"),
         ("W5", "BMS P- -> IBT-2 B- (star) and PCB GND", "BMS", "IBT-2", "1.5 mm2"),
         ("W6", "IBT-2 M+/M- -> motor", "IBT-2", "motor", "1.0 mm2 twisted, ferrite"),
         ("W7", "IBT-2 logic 8-pin <-> PCB J2", "IBT-2", "PCB", "8-way ribbon, 5 V logic"),
         ("W8", "buck module in/out <-> PCB J3/J9", "buck", "PCB", "0.75 mm2"),
         ("W9", "Hall sensors x3 -> PCB J4 / J10 / J5", "Hall", "PCB", "3 x 3-core, shielded"),
         ("W10", "IMU pod -> PCB J6", "IMU", "PCB", "4-core shielded"),
         ("W11", "charge jack (rear wall) -> BMS charge port", "jack", "BMS", "1.0 mm2")]
fig, ax = new_sheet(7, "CABLES, SERVICE ACCESS, HEAT, EXPLODED VIEW", "NTS")
ax.text(20, 281, "CABLE LIST (lengths from the placed positions + 40 mm slack)", fontsize=6.6, weight="bold", va="top")
wrows = [(w, d, f"{wire_len(a, b):.0f} mm", c) for w, d, a, b, c in WIRES]
yy = table(ax, 20, 273, ["ID", "FROM -> TO", "LENGTH", "WIRE"], wrows, [12, 100, 20, 56], rh=4.6, size=5.0, head_fc="#1f3f6f")
note_block(ax, 20, yy - 8, "ROUTING RULES", [
    "Motor and battery cables run along the LEFT inner wall in a 15 x 15 duct; signal cables (Hall, IMU, ribbon) along the RIGHT wall.",
    "Never share a duct: motor current noise corrupts the Hall and IMU lines.  Cable ties on the duct, grommets where a cable crosses a bulkhead.",
    "Star ground at the PCB J1 terminal.  SW1 and the charge jack sit on the rear wall panel, 100 x 40, away from the tyre sweep side.",
    "Hall and IMU cables leave the centre floor through a 20 mm grommet in the 3 mm tray, so no cable crosses the shaft path.",
], size=5.0, lh=3.3)
note_block(ax, 20, 105, "SERVICE ORDER (what you open to reach what)", [
    "1  Unbolt the REAR LID (rear 160 x 110 of the top skin, 8 x M8 security): reaches the PCB (L2), battery below it, SW1, fuse.",
    "2  Unbolt the CENTRE HATCH (shear collar, Rev E sheet 9): reaches the big sprocket, chain, IMU and Hall collar.",
    "3  Unbolt the FRONT STEP lid: reaches the motor and IBT-2.  Every lid is 6 mm + ribs, wheel-rated, gasketed.",
    "Heat: IBT-2 on a thermal pad to the 3 mm steel tray; battery on 5 mm air gap; white powder coat; log temperatures in the 100-cycle test.",
], size=5.0, lh=3.3)
def build_exploded():
    M = Model()
    for (nm, x0, x1, y0, y1, z0, z1, kind) in comps:
        if kind == "unplaced":
            continue
        lift = 38.0 if (kind == "proposed" and z0 >= 26) else 0.0
        col = ccolor(nm) if kind == "proposed" else ("#2f7d53" if "bearing" in nm else "#9a9a9a")
        M.box(nm, col, x0, x1, y0, y1, z0 + lift, z1 + lift)
    M.box("rear_panel", "#8fa3b8", -50, 50, REAR_Y, REAR_Y + 4, 25, 60)
    return M


render_iso(ax, build_exploded(), 318, 178, 0.27)
ax.text(318, 112, "EXPLODED: PCB deck (L2) lifted 38 mm above the battery floor (L1); box hidden", fontsize=5.6, ha="center", color="#444")
sheets.append(fig)

# ---- sheet 6: hold register
fig, ax = new_sheet(8, "HOLD REGISTER AND RELEASE GATES", "-")
ax.text(20, 280, "VERIFICATION RESULT (all automatic checks)", fontsize=7.2, weight="bold", va="top")
yy = stat_table(ax, 20, 272, [(n[:62], s, d[:96]) for n, s, d in CHECKS], [90, 18, 130], size=4.6, rh=4.0)
gates = [("G0", "Measure the tyre opening, rest angle, tooth counts, motor dia, battery voltage (MEASUREMENTS.md)"),
         ("G1", "All checks above PASS with the measured numbers (no FAIL, no MARGINAL)"),
         ("G2", "Cardboard + wood mock-up of the box outline: swing the arch 0 -> 180 by hand, nothing touches"),
         ("G3", "Real drive-over test and shear-pin test on the first box (Rev E checklist)"),
         ("G4", "Only then: run  python generate_revF.py --release  -> cut DXFs + BOM are written")]
table(ax, 20, yy - 8, ["GATE", "CRITERION"], gates, [14, 226], rh=4.6, size=5.2)
sheets.append(fig)

# ------------------------------------------------------------------------------------------------ write
pdf = os.path.join(HERE, "PARKFNB_V2_RevF_PRELIMINARY.pdf")
with PdfPages(pdf) as pp:
    for i, f in enumerate(sheets, 1):
        pp.savefig(f)
        f.savefig(os.path.join(HERE, f"preview_revF_{i}.png"), dpi=100)
        plt.close(f)
export_obj(build(90), os.path.join(HERE, "PARKFNB_V2_RevF_3D_arch90.obj"))
export_obj(build(p["rest_deg"]), os.path.join(HERE, "PARKFNB_V2_RevF_3D_arch0.obj"))
export_obj(build(90, with_box=False), os.path.join(HERE, "PARKFNB_V2_RevF_3D_INTERNALS_box_hidden.obj"))
with open(os.path.join(HERE, "revF_checks.json"), "w", encoding="utf8") as fh:
    json.dump(dict(parameters=p, chain_plane_x=XS, checks=[dict(name=n, status=s, detail=d) for n, s, d in CHECKS],
                   sensitivity=[dict(opening=o, bearing_margin=bi, motor_margin=bm, electronics_fails=nf) for o, bi, bm, nf in SENS]),
              fh, indent=1)
if RELEASE and ALL_PASS:
    print("RELEASE requested and all checks pass: cut DXFs / BOM would be written here (not implemented in the preliminary).")
elif RELEASE:
    print("RELEASE refused: %d check(s) FAIL, %d not PASS." % (len(HARD_FAIL), sum(1 for c in CHECKS if c[1] != "PASS")))
print("wrote", pdf)


def render_top_view(path):
    """Plan view from above on white, like the user's reference picture: tyre lying at 0 deg, box, brackets, QR plate."""
    import matplotlib.patches as mpl_p
    f = plt.figure(figsize=(9, 8))
    a = f.add_axes([0, 0, 1, 1])
    a.set_aspect("equal")
    a.axis("off")
    a.set_xlim(-RO - 25, RO + 25)
    a.set_ylim(-(p["leg"] + RO) - 20, max(y_lim(0, p["top_hi"]), 150) + 25)
    a.add_patch(mpl_p.Rectangle((-203, -12.5), 406, 25, fc="#e8e8e8", ec="none", zorder=1))
    a.add_patch(mpl_p.Polygon(tyre_plan(-1), fc="#161616", ec="none", zorder=2))
    for s in (-1, 1):
        a.add_patch(mpl_p.Rectangle((s * 152 - 18, -14), 36, 28, fc="#666666", ec="none", zorder=3))
    for pg, z in ((main, 4), (ear, 4)):
        a.add_patch(mpl_p.Polygon(list(pg.exterior.coords), fc="#6b7d93", ec="#51627a", lw=1.2, alpha=0.97, zorder=z))
    a.add_patch(mpl_p.Rectangle((-40, -48), 80, 40, fc="#c9c9c9", ec="none", zorder=5))
    f.savefig(path, dpi=130, facecolor="white")
    plt.close(f)


render_top_view(os.path.join(HERE, "PARKFNB_V2_RevF_top_view_no_base.png"))
_f = plt.figure(figsize=(9, 7))
_a = _f.add_axes([0, 0, 1, 1])
_a.set_xlim(0, 100)
_a.set_ylim(0, 75)
_a.set_aspect("equal")
_a.axis("off")
render_iso(_a, build(p["rest_deg"]), 50, 30, 0.1, cam=(0.9, -1.3, 0.9))
_f.savefig(os.path.join(HERE, "PARKFNB_V2_RevF_iso_no_base.png"), dpi=120, facecolor="white")
plt.close(_f)
