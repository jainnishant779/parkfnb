"""PARKFNB smart parking barrier - Prototype V2 (Rev E, requirements-first, car-proof) drawing set.

Scope of V2: the V1 mechanism stays as it is (shaft, UCP205 bearings, MRF 4.00-8 half-tyre arch, chain + sprockets,
12 V geared motor in its V1 position, 0-90-180 deg motion).  V2 adds packing, mounting, PCB and button, and Rev D
makes every part that a car wheel can reach wheel-load rated:
    - steel DRIVE COVER (5 mm + ribs) over motor, chain, sprocket, both bearings, Hall sensors and IMU
    - steel ELECTRONICS BOX (3 mm walls, 6 mm ribbed lid) with a polycarbonate RF window for the ESP32 Wi-Fi
    - 6 mm deck on a 25 mm angle frame, rubber edge ramps front/rear, rubber rest blocks under the lying arch
    - all cables under the deck, entering the box and the cover from below (nothing loose on top)

Run:  python generate_cad.py
Out:  PARKFNB_V2_Drawings.pdf, PARKFNB_V2_BasePlate_cut.dxf, PARKFNB_V2_SteelParts_cut.dxf,
      PARKFNB_V2_Assembly.dxf, PARKFNB_V2_Assembly_3D*.obj (+ .mtl), PARKFNB_V2_render_motor_under_cover.png,
      REQUIREMENTS.md, preview_*.png

Coordinates (mm): x along the shaft (+ right, seen from the front), y horizontal (- = front, motor side; + = rear),
z up, z = 0 = top of the deck.  The arch at 0 deg lies toward the front, at 180 deg toward the rear.
Source codes: M = measured by team, C = catalogue, E = estimated from photos (verify), D = V2 design choice.
"""
import math
import os
import datetime as dt

import numpy as np
import ezdxf

import cadlib
from cadlib import (plt, Rectangle, FancyBboxPatch, View, new_sheet, note_block, table, chain_path, resample, Model,
                    render_iso, export_obj, fmt)
from matplotlib.backends.backend_pdf import PdfPages

HERE = os.path.dirname(os.path.abspath(__file__))
cadlib.REV, cadlib.DATE, cadlib.SHEETS_TOTAL = "E", "2026-10-26", 11
cadlib.TITLE_LINE = "V2 = V1 mechanism + car-proof packing + mounting + PCB + button  |  for design review"
START = dt.date(2026, 10, 27)

# ----------------------------------------------------------------------------------------- parameters
P = dict(
    # V1 mechanism (kept)
    shaft_d=25.0, shaft_len=406.0,                                  # M
    brg_cc=130.0, brg_h=36.5, brg_L=140.0, brg_A=38.0, brg_H2=71.0, brg_J=105.0, brg_foot=15.0,   # E / C
    arch_ro=203.0, arch_ri=101.5, arch_leg=51.0, arch_w=100.0,      # M (16 in / 8 in) + E (tyre width ~4 in)
    brk_x=152.0, rest_deg=10.0,                                     # E (brackets), E (rest angle - MEASURE)
    chain_p=6.35, n_big=44, n_small=13,                             # E (count the teeth)
    motor_y=-100.0, motor_z=25.5, gb_d=45.0, gb_len=33.0, can_d=36.0, can_len=44.5, motor_out=26.0, motor_rpm=30.0,
    # deck (D)
    px0=-460.0, px1=240.0, py0=-280.0, py1=280.0, plate_t=6.0, frame_h=25.0, ramp_run=95.0,
    # steel electronics box, open bottom on a gasket, 3 mm walls, 6 mm lid with 3 ribs (D)
    bx0=-450.0, bx1=-250.0, by0=-150.0, by1=150.0, bh=85.0, bwall=3.0, blid=6.0,
    # drive cover (D)
    cx0=-112.0, cx1=92.0, cover_t=5.0, rib_x=(-62.0, 40.0),
    collar_x=33.0, imu_x=-38.0,
    # torque limiter / shear pin (Rev E): pin parallel to the shaft on a pin circle, brass, single shear
    pin_r=20.0, pin_tau=200.0, pin_collar_x=(-28.5, -16.5), arch_kg=1.4, arch_cg=129.0,
    # wheel load (D)
    car_kg=2000.0, axle=0.55, dyn=1.5, patch_w=215.0, patch_l=150.0, fy=235.0, E=210000.0,
)
p = P
ZS = p["brg_h"]
cadlib.ZS = ZS
GROUND = -(p["plate_t"] + p["frame_h"])
REACH = p["arch_leg"] + p["arch_ro"]
SWEEP_R = math.hypot(REACH, p["arch_w"] / 2)


def pdia(n):
    return p["chain_p"] / math.sin(math.pi / n)


def odia(n):
    return p["chain_p"] * (0.6 + 1 / math.tan(math.pi / n))


PD_B, PD_S, OD_B, OD_S = pdia(p["n_big"]), pdia(p["n_small"]), odia(p["n_big"]), odia(p["n_small"])
C_NOM = math.hypot(p["motor_y"], ZS - p["motor_z"])
RATIO = p["n_big"] / p["n_small"]
T90 = 0.25 * 60 / (p["motor_rpm"] / RATIO)

# drive cover side profile (y, z), outer skin, bottom open: high over sprocket + bearings, low step over the motor
COVER = [(78.0, 0.0), (78.0, 88.0), (66.0, 100.0), (-60.0, 100.0), (-78.0, 82.0), (-78.0, 62.0),
         (-130.0, 62.0), (-136.0, 56.0), (-136.0, 0.0)]
COVER_TOP = max(z for _, z in COVER)
HALLS = {"H0 (0 deg)": (26.0, ZS), "H90 (90 deg)": (0.0, ZS - 26.0), "H180 (180 deg)": (-26.0, ZS)}
LID_RIBS_Y = (-75.0, 0.0, 75.0)

# box internals (plan x, y) - heights all < 49 mm so they pass under the lid ribs
BOXPARTS = [
    ("BATTERY 4 x 18650\n(V1 holder)", -442, -365, -140, -60, "#e48bd0"),
    ("CONTROLLER PCB\n100 x 80", -432, -352, -40, 60, "#2f8a4a"),
    ("4S BMS", -340, -295, -140, -95, "#999999"),
    ("BUCK\nLM2596", -332, -311, -80, -37, "#4a7fc0"),
    ("FUSE", -324, -308, -25, 15, "#c0392b"),
    ("IBT-2", -322, -272, 85, 135, "#2b66b3"),
]
RF_WINDOW = (0.0, 70.0, 20.0, 60.0)          # on the outer wall x = bx0: y0, y1, z0, z1

# ----------------------------------------------------------------------------------------- wheel-load checks
F_WHEEL = p["car_kg"] * 9.81 * p["axle"] / 2 * p["dyn"]
P_PATCH = F_WHEEL / (p["patch_w"] * p["patch_l"])


def plate_check(t, L):
    sig = (P_PATCH * L * L / 8) / (t * t / 6)
    return sig, p["fy"] / sig, 5 * P_PATCH * L ** 4 / (384 * p["E"] * t ** 3 / 12)


def tee_check(tf, bf, tw, hw, span):
    """Rib + plate as a T beam, whole wheel load at mid-span (conservative)."""
    A1, A2 = bf * tf, tw * hw
    y1, y2 = tf / 2, tf + hw / 2
    yc = (A1 * y1 + A2 * y2) / (A1 + A2)
    I = bf * tf ** 3 / 12 + A1 * (yc - y1) ** 2 + tw * hw ** 3 / 12 + A2 * (y2 - yc) ** 2
    Z = I / (tf + hw - yc)
    sig = F_WHEEL * span / 4 / Z
    return sig, p["fy"] / sig


cover_span = max(b - a for a, b in zip((p["cx0"],) + p["rib_x"], p["rib_x"] + (p["cx1"],)))
HATCH = (-52.0, -2.0, -25.0, 25.0)               # service hatch in the cover top: x0, x1, y0, y1 (over the shear collar)
T_ARCH = p["arch_kg"] * 9.81 * p["arch_cg"] / 1000     # N.m at the shaft, arch horizontal (E: weigh the arch)


def pin_capacity(d):
    """Single-shear brass pin dia d: shear torque (N.m), equivalent push at the arch crown (N), chain pull (N)."""
    F = p["pin_tau"] * math.pi * d * d / 4
    T = F * p["pin_r"] / 1000
    return T, T / (REACH / 1000), T / (PD_B / 2000)


CHK = {
    "deck": plate_check(p["plate_t"], 150.0),
    "cover_top": plate_check(p["cover_t"], cover_span),
    "cover_rib": tee_check(p["cover_t"], 100.0, 8.0, 30.0, COVER[0][0] - COVER[-1][0] - 60),
    "lid": plate_check(p["blid"], 75.0),
    "lid_rib": tee_check(p["blid"], 100.0, 8.0, 30.0, p["bx1"] - p["bx0"] - 2 * p["bwall"]),
    "hatch": plate_check(6.0, 60.0),
}
P_GROUND = F_WHEEL / (25 * p["patch_l"])

# ----------------------------------------------------------------------------------------- base plate holes
HOLES = []


def H(i, x, y, kind, size, purpose):
    HOLES.append((i, x, y, kind, size, purpose))


for sx in (-1, 1):
    for sy in (-1, 1):
        H("A", p["px1"] - 20 if sx > 0 else p["px0"] + 20, sy * (p["py1"] - 20), "o", 12.0,
          "anchor M10, countersunk security bolt flush")
for sx in (-1, 1):
    for sy in (-1, 1):
        H("B", sx * p["brg_cc"] / 2, sy * p["brg_J"] / 2, "s", (11.0, 17.0, "x"), "UCP205 bearing M10 (slot)")
for sy in (-1, 1):
    H("M", -41.0, p["motor_y"] + sy * 18.0, "s", (6.5, 18.0, "y"), "motor bracket M6 (chain tension slot)")
for cx in (p["cx0"] + 12, (p["cx0"] + p["cx1"]) / 2, p["cx1"] - 12):
    for cy in (COVER[0][0] + 12, COVER[-1][0] - 12):
        H("K", cx, cy, "o", 9.0, "drive cover flange M8")
for dx_, dy_ in ((-70.0, -130.0), (70.0, -130.0), (-95.0, 40.0), (80.0, 30.0)):
    H("D", dx_, dy_, "o", 10.0, "drain under the cover (water out of the cover)")
H("S", p["collar_x"] + 8, 60.0, "o", 5.5, "Hall bracket M5")
H("S", p["collar_x"] + 8, -60.0, "o", 5.5, "Hall bracket M5")
for sy in (-1, 1):
    for xx in (-120.0, 0.0, 120.0):
        H("R", xx, sy * 225.0, "o", 6.5, "rest block under arch crown M6")
    for xx in (-150.0, 150.0):
        H("L", xx, sy * 110.0, "o", 6.5, "rest block under arch leg M6")
for xx in (p["bx0"] + 15, p["bx1"] - 15):
    for yy in (p["by0"] + 15, 0.0, p["by1"] - 15):
        H("X", xx, yy, "o", 9.0, "electronics box flange M8")
for yy in (100.0, 50.0, -10.0):
    H("C", p["bx1"] - 50, yy, "o", 20.0, "cable into box from below (grommet)")
H("C", p["imu_x"], 45.0, "o", 20.0, "IMU cable, inside cover (grommet)")
H("C", -100.0, -122.0, "o", 20.0, "motor cable, inside cover (grommet)")
H("C", 20.0, 45.0, "o", 20.0, "Hall cable, inside cover (grommet)")
for sy in (-1, 1):
    for xx in np.arange(p["px0"] + 60, p["px1"] - 30, 150.0):
        H("P", float(xx), sy * (p["py1"] - 15), "o", 9.0, "rubber edge ramp M8 (through the frame angle)")
CHAIN_SLOT = (-12.0, 12.0, -45.0, 35.0)


def hole_clash_check(min_web=6.0):
    """Every pair of holes must leave at least min_web mm of steel between them; also keep 10 mm to the edge."""
    out = []
    rad = lambda k, s: s / 2 if k == "o" else s[1] / 2
    for a in range(len(HOLES)):
        ia, xa, ya, ka, sa, _ = HOLES[a]
        ra = rad(ka, sa)
        if xa - ra < p["px0"] + 10 or xa + ra > p["px1"] - 10 or ya - ra < p["py0"] + 10 or ya + ra > p["py1"] - 10:
            out.append(f"{ia} ({xa:g},{ya:g}) too close to the edge")
        for b in range(a + 1, len(HOLES)):
            ib, xb, yb, kb, sb, _ = HOLES[b]
            gap = math.hypot(xa - xb, ya - yb) - ra - rad(kb, sb)
            if gap < min_web:
                out.append(f"{ia} ({xa:g},{ya:g}) vs {ib} ({xb:g},{yb:g}): web {gap:.1f} mm")
    return out


for msg in hole_clash_check():
    print("HOLE CLASH:", msg)

# ----------------------------------------------------------------------------------------- DXF
DXF_LAYERS = cadlib.DXF_LAYERS


def make_doc():
    d = ezdxf.new("R2010", setup=True)
    d.units = ezdxf.units.MM
    d.header["$LTSCALE"] = 4
    for k, (name, color, lt) in DXF_LAYERS.items():
        if name not in d.layers:
            d.layers.add(name, color=color, linetype=lt)
    ds = d.dimstyles.duplicate_entry("EZDXF", "PFNB")
    ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimexe, ds.dxf.dimexo, ds.dxf.dimgap = 6, 4, 2, 2, 1.5
    ds.dxf.dimdec, ds.dxf.dimzin, ds.dxf.dimtad = 1, 8, 1
    return d


doc = make_doc()
msp = doc.modelspace()
OFF = dict(plan=(0, 0), front=(0, 700), side=(900, 700), box=(900, 0), cover=(1500, 0))
FILL = dict(base="#e9e9e9", arch="#3b3b3b", box="#b9c3cf", cover="#8fa3b8", brg="#2f7d53", motor="#bdbdbd",
            ramp="#333333")


# ----------------------------------------------------------------------------------------- helpers
def u_outline(ro, ri, leg, n=60):
    out = [(ro, 0), (ro, leg)] + [(ro * math.cos(t), leg + ro * math.sin(t)) for t in np.linspace(0, math.pi, n)] + \
          [(-ro, leg), (-ro, 0)]
    inn = [(-ri, 0), (-ri, leg)] + [(ri * math.cos(t), leg + ri * math.sin(t)) for t in np.linspace(math.pi, 0, n)] + \
          [(ri, leg), (ri, 0)]
    return out + inn


def arch_side(theta):
    th = math.radians(theta)
    d, n = (-math.cos(th), math.sin(th)), (math.sin(th), math.cos(th))
    w = p["arch_w"] / 2
    return [(a * d[0] + b * n[0], ZS + a * d[1] + b * n[1]) for a, b in ((0, -w), (REACH, -w), (REACH, w), (0, w))]


def slot_pts(x, y, w, L, axis, n=12):
    r, h = w / 2, (L - w) / 2
    pts = [(h + r * math.cos(t), r * math.sin(t)) for t in np.linspace(-math.pi / 2, math.pi / 2, n + 1)] + \
          [(-h + r * math.cos(t), r * math.sin(t)) for t in np.linspace(math.pi / 2, 3 * math.pi / 2, n + 1)]
    if axis == "y":
        pts = [(-b, a) for a, b in pts]
    return [(x + a, y + b) for a, b in pts]


def ramp_profile_side(sign):
    """Ramp cross-section in the side view at the y = +/- edge."""
    y0 = sign * p["py1"]
    return [(y0, GROUND), (y0 + sign * p["ramp_run"], GROUND), (y0, 0.0)]


# ----------------------------------------------------------------------------------------- views
def plan_view(V, detail=True):
    for s in (-1, 1):
        V.rect(p["px0"], p["px1"], s * p["py1"], s * (p["py1"] + p["ramp_run"]), fill=FILL["ramp"], alpha=0.25)
    V.rect(p["px0"], p["px1"], p["py0"], p["py1"], fill=FILL["base"], alpha=0.6, z=1)
    V.rect(p["px0"] + 25, p["px1"] - 25, p["py0"] + 25, p["py1"] - 25, "hid")
    V.rect(-p["arch_ro"] - 12, p["arch_ro"] + 12, -REACH - 10, REACH + 10, "phan")
    for sgn in (-1, 1):
        u = [(a, sgn * b * math.cos(math.radians(p["rest_deg"]))) for a, b in u_outline(p["arch_ro"], p["arch_ri"], p["arch_leg"])]
        V.line(u, "phan", close=True, fill=FILL["arch"], alpha=0.07)
    V.rect(-p["arch_ro"], p["arch_ro"], -p["arch_w"] / 2, p["arch_w"] / 2, "out", fill=FILL["arch"], alpha=0.30)
    for s in (-1, 1):
        V.rect(-150, 150, s * 225 - 20, s * 225 + 20, "thin", fill="#222", alpha=0.25)
        for xx in (-150, 150):
            V.rect(xx - 30, xx + 30, s * 110 - 20, s * 110 + 20, "thin", fill="#222", alpha=0.25)
    hl = p["shaft_len"] / 2
    V.rect(-hl, hl, -p["shaft_d"] / 2, p["shaft_d"] / 2, fill="#d8d8d8")
    for sx in (-1, 1):
        V.rect(sx * p["brk_x"] - 20, sx * p["brk_x"] + 20, -25, 25, fill="#8a8a8a", alpha=0.6)
    V.cl(-hl - 14, 0, hl + 14, 0)
    V.cl(0, p["py0"] - 8, 0, p["py1"] + 8)
    # drive cover (solid) with hidden contents
    V.rect(p["cx0"], p["cx1"], COVER[-1][0], COVER[0][0], fill=FILL["cover"], alpha=0.75)
    V.line([(p["cx0"], -78), (p["cx1"], -78)], "thin")
    for sx in (-1, 1):
        cx = sx * p["brg_cc"] / 2
        V.rect(cx - p["brg_A"] / 2, cx + p["brg_A"] / 2, -p["brg_L"] / 2, p["brg_L"] / 2, "hid")
    my, xf = p["motor_y"], -p["motor_out"]
    V.rect(xf - p["gb_len"] - p["can_len"], xf, my - p["gb_d"] / 2, my + p["gb_d"] / 2, "hid")
    V.rect(-1.5, 1.5, -OD_B / 2, OD_B / 2, "hid")
    V.rect(p["imu_x"] - 6, p["imu_x"] + 6, -22, 22, "hid")
    V.rect(p["collar_x"] - 5, p["collar_x"] + 5, -20, 20, "hid")
    V.rect(p["pin_collar_x"][0], p["pin_collar_x"][1], -22, 22, "hid")
    V.rect(HATCH[0], HATCH[1], HATCH[2], HATCH[3], "out", fill="#5d6673", alpha=0.5)
    for (i, x, y, kind, size, purpose) in HOLES:
        if i == "D":
            V.circle(x, y, size / 2, "thin")
    for rx in p["rib_x"]:
        V.line([(rx, COVER[-1][0] + 5), (rx, COVER[0][0] - 5)], "hid")
    # steel electronics box
    V.rect(p["bx0"], p["bx1"], p["by0"], p["by1"], fill=FILL["box"], alpha=0.85)
    for ry in LID_RIBS_Y:
        V.line([(p["bx0"] + 3, ry), (p["bx1"] - 3, ry)], "hid")
    for (nm, x0, x1, y0, y1, col) in BOXPARTS:
        V.rect(x0, x1, y0, y1, "hid")
    V.line([(p["bx0"], RF_WINDOW[0]), (p["bx0"], RF_WINDOW[1])], "elec")
    for (i, x, y, kind, size, purpose) in HOLES:
        if i == "C":
            V.circle(x, y, size / 2, "hid")
        if i == "A":
            V.circle(x, y, size / 2)
    for a, b in (((p["bx1"] - 50, 100), (20, 45)), ((p["bx1"] - 50, 50), (p["imu_x"], 45)),
                 ((p["bx1"] - 50, -10), (-100, -122))):
        V.line([a, (b[0], a[1]), b], "hid")
    if detail:
        V.text(0, REACH + 22, "ARCH SWEEP ZONE 0 - 180 deg", 4.8, color="#1f5fae", dxf=False)
        V.text(-350, 165, "STEEL ELECTRONICS BOX", 4.6, dxf=False)
        V.text(0, p["py1"] + p["ramp_run"] / 2, "RUBBER EDGE RAMP", 4.4, color="white", dxf=False)
        V.text(0, -p["py1"] - p["ramp_run"] / 2, "RUBBER EDGE RAMP", 4.4, color="white", dxf=False)


def front_view(V):
    V.rect(p["px0"], p["px1"], -p["plate_t"], 0, fill="#bbbbbb")
    for (a, b) in ((p["px0"], p["px0"] + 25), (p["px1"] - 25, p["px1"]), (-137, -112), (92, 117)):
        V.rect(a, b, GROUND, -p["plate_t"], fill="#cccccc")
    V.line([(p["px0"] - 15, GROUND), (p["px1"] + 15, GROUND)], "thin")
    V.rect(p["bx0"], p["bx1"], 0, p["bh"] - p["blid"], fill=FILL["box"], alpha=0.9)
    V.rect(p["bx0"] - 3, p["bx1"] + 3, p["bh"] - p["blid"], p["bh"], fill="#8e9aa8")
    for sx in (-1, 1):
        V.rect(sx * p["brk_x"] - 20, sx * p["brk_x"] + 20, ZS - 22, ZS + 50, fill="#8a8a8a", alpha=0.7)
    hl = p["shaft_len"] / 2
    V.rect(-hl, hl, ZS - p["shaft_d"] / 2, ZS + p["shaft_d"] / 2, fill="#d8d8d8", z=3)
    V.rect(p["cx0"], p["cx1"], 0, COVER_TOP, fill=FILL["cover"], alpha=0.95, z=4)
    V.line([(p["cx0"], 62), (p["cx1"], 62)], "thin")
    band = [(a, ZS + b) for a, b in u_outline(p["arch_ro"], p["arch_ri"], p["arch_leg"])]
    V.line(band, "out", close=True, fill=FILL["arch"], alpha=0.3, z=5)
    V.cl(0, GROUND - 8, 0, ZS + REACH + 10)
    V.text(0, ZS + p["arch_leg"] + p["arch_ri"] + 50, "ARCH STANDING (90 deg) = LOCKED", 5.0, bg="white", dxf=False)
    V.text((p["cx0"] + p["cx1"]) / 2, 30, "DRIVE COVER", 4.6, color="white", dxf=False)


def side_view(V):
    for s in (-1, 1):
        V.line(ramp_profile_side(s), "out", close=True, fill=FILL["ramp"], alpha=0.5)
    V.rect(p["py0"], CHAIN_SLOT[2], -p["plate_t"], 0, fill="#bbbbbb")
    V.rect(CHAIN_SLOT[3], p["py1"], -p["plate_t"], 0, fill="#bbbbbb")
    V.rect(p["py0"], p["py0"] + 25, GROUND, -p["plate_t"], fill="#cccccc")
    V.rect(p["py1"] - 25, p["py1"], GROUND, -p["plate_t"], fill="#cccccc")
    V.line([(p["py0"] - p["ramp_run"] - 15, GROUND), (p["py1"] + p["ramp_run"] + 15, GROUND)], "thin")
    V.line([(-50, -p["plate_t"]), (-50, -20), (40, -20), (40, -p["plate_t"])], "out")
    V.rect(p["by0"], p["by1"], 0, p["bh"], "hid")
    V.rect(-p["brg_L"] / 2, p["brg_L"] / 2, 0, p["brg_foot"], "hid")
    V.circle(0, ZS, 34.5, "hid")
    V.line(COVER, "out", fill=FILL["cover"], alpha=0.45)
    t = p["cover_t"]
    V.line([(y - math.copysign(t, y) if abs(y) > 1 else y, max(z - t, 0)) for y, z in COVER], "thin")
    V.circle(0, ZS, p["shaft_d"] / 2, fill="#d8d8d8")
    V.circle(0, ZS, OD_B / 2, "hid")
    my, mz = p["motor_y"], p["motor_z"]
    V.circle(my, mz, p["gb_d"] / 2, "hid")
    V.line(chain_path((0, ZS), PD_B / 2, (my, mz), PD_S / 2), "hid")
    for s in (-1, 1):
        V.rect(s * 225 - 20, s * 225 + 20, 0, 10, fill="#222", alpha=0.5)
        V.rect(s * 110 - 20, s * 110 + 20, 0, 10, "hid")
    V.line(arch_side(90), "out", close=True, fill=FILL["arch"], alpha=0.35)
    V.line(arch_side(p["rest_deg"]), "phan", close=True)
    V.line(arch_side(180 - p["rest_deg"]), "phan", close=True)
    V.arc(0, ZS, SWEEP_R, p["rest_deg"], 180 - p["rest_deg"], "phan")
    V.cl(0, GROUND - 6, 0, ZS + SWEEP_R + 8)


# ----------------------------------------------------------------------------------------- 3-D model
def build_model(theta=90.0, cover=True, lid=True, cover_alpha=1.0, lid_alpha=1.0):
    M = Model()
    xs = np.linspace(p["px0"], p["px1"], 8)
    ys = np.linspace(p["py0"], p["py1"], 7)
    for a, b in zip(xs[:-1], xs[1:]):
        for c, d in zip(ys[:-1], ys[1:]):
            M.box("deck", "#9aa0a6", a, b, c, d, -p["plate_t"], 0)
    for (a, b, c, d) in ((p["px0"], p["px1"], p["py0"], p["py0"] + 25), (p["px0"], p["px1"], p["py1"] - 25, p["py1"]),
                         (p["px0"], p["px0"] + 25, p["py0"], p["py1"]), (p["px1"] - 25, p["px1"], p["py0"], p["py1"])):
        M.box("frame", "#6d7177", a, b, c, d, GROUND, -p["plate_t"])
    for s in (-1, 1):
        y0 = s * p["py1"]
        prof = [(y0, GROUND), (y0 + s * p["ramp_run"], GROUND), (y0, 0.0)]
        if s < 0:
            prof = prof[::-1]
        M.prism("rubber_ramp", "#2a2a2a", prof, p["px0"], p["px1"])
        M.box("rest_block", "#222222", -150, 150, s * 225 - 20, s * 225 + 20, 0, 10)
        for xx in (-150, 150):
            M.box("rest_block", "#222222", xx - 30, xx + 30, s * 110 - 20, s * 110 + 20, 0, 10)
    for sx in (-1, 1):
        cx = sx * p["brg_cc"] / 2
        M.box("bearing_ucp205", "#2f7d53", cx - 19, cx + 19, -70, 70, 0, p["brg_foot"])
        M.cyl("bearing_ucp205", "#2f7d53", (0, ZS), 34.5, cx - 17, cx + 17, "x")
        M.cyl("arch_bracket", "#7b7b7b", (0, ZS), 22.0, sx * p["brk_x"] - 20, sx * p["brk_x"] + 20, "x")
    M.cyl("shaft", "#d0d0d0", (0, ZS), p["shaft_d"] / 2, -p["shaft_len"] / 2, p["shaft_len"] / 2, "x")
    M.cyl("sprocket_big", "#8f8f8f", (0, ZS), OD_B / 2, -1.5, 1.5, "x", n=44)
    my, mz, xf = p["motor_y"], p["motor_z"], -p["motor_out"]
    M.cyl("motor_gearbox", "#bfc3c7", (my, mz), p["gb_d"] / 2, xf - p["gb_len"], xf, "x")
    M.cyl("motor_can", "#c9ccd0", (my, mz), p["can_d"] / 2, xf - p["gb_len"] - p["can_len"], xf - p["gb_len"], "x")
    M.cyl("imu_pod", "#3557a8", (0, ZS), 22, p["imu_x"] - 6, p["imu_x"] + 6, "x")
    M.cyl("shear_collar", "#4a6fa5", (0, ZS), 22.5, p["pin_collar_x"][0], p["pin_collar_x"][1], "x")
    M.cyl("thrust_collar", "#4a6fa5", (0, ZS), 22.5, 1.5, 10.5, "x")
    M.cyl("shear_pin", "#c0392b", (0, ZS + p["pin_r"]), 1.5, p["pin_collar_x"][0] + 4, -8.5, "x", n=10)
    if cover:
        hi = COVER[:6]
        lo = [(-78.0, 0.0), (-78.0, 62.0), (-130.0, 62.0), (-136.0, 56.0), (-136.0, 0.0)]
        M.prism("drive_cover", "#8fa3b8", [(y, z) for y, z in [(78, 0), (78, 88), (66, 100), (-60, 100), (-78, 82), (-78, 0)]][::-1],
                p["cx0"], p["cx1"], cover_alpha)
        M.prism("drive_cover", "#8fa3b8", [(-78, 0), (-78, 62), (-130, 62), (-136, 56), (-136, 0)][::-1], p["cx0"], p["cx1"], cover_alpha)
    M.box("elec_box", "#b9c3cf", p["bx0"], p["bx1"], p["by0"], p["by1"], 0, p["bh"] - p["blid"])
    if lid:
        M.box("elec_box_lid", "#8e9aa8", p["bx0"] - 3, p["bx1"] + 3, p["by0"] - 3, p["by1"] + 3, p["bh"] - p["blid"], p["bh"], lid_alpha)
    M.box("rf_window", "#cfe8ff", p["bx0"] - 1.5, p["bx0"] + 0.5, RF_WINDOW[0], RF_WINDOW[1], RF_WINDOW[2], RF_WINDOW[3])
    M.uarch("arch_tyre", "#2b2b2b", theta, p["arch_ro"], p["arch_ri"], p["arch_leg"], p["arch_w"], ZS)
    return M


# ----------------------------------------------------------------------------------------- sheets
sheets = []
dxf_lab = lambda key, s, du=-300, dv=330: msp.add_text(s, height=12, dxfattribs={"layer": "TEXT"}).set_placement(
    (OFF[key][0] + du, OFF[key][1] + dv))
H_COVER, H_BOX, H_DECK = COVER_TOP - GROUND, p["bh"] - GROUND, -GROUND
H_ARCH_FLAT = ZS + p["arch_w"] / 2 - GROUND

# ======================= SHEET 1
fig, ax = new_sheet(1, "COVER AND V2 SCOPE", "-")
ax.text(20, 278, "PARKFNB Smart Parking Barrier - Prototype V2", fontsize=17, weight="bold", va="top")
ax.text(20, 268, "V1 mechanism unchanged  +  car-proof packing  +  mounting  +  PCB  +  button", fontsize=10, va="top",
        color="#333")
ax.text(20, 261.5, f"Rev E  |  {cadlib.DATE}  |  mm  |  generated by generate_cad.py (edit the parameters and re-run)",
        fontsize=6.5, va="top", color="#666")
render_iso(ax, build_model(90), 112, 192, 0.16)
ax.text(112, 134, "V2 assembly, arch standing (90 deg, locked) - nothing mechanical is exposed", fontsize=6, ha="center",
        color="#444")
idx = [("1", "Cover, scope"), ("2", "Requirements R1-R15 and conditions"), ("3", "Compliance matrix + research benchmark"),
       ("4", "General arrangement - plan"), ("5", "Front + side elevation, heights"),
       ("6", "Base deck - fabrication + hole table"), ("7", "Steel electronics box + RF window"),
       ("8", "Drive cover + wheel-load check"), ("9", "Torque limiter, manual release, water, heat"),
       ("10", "Wiring, switch, fuse, pin map"), ("11", "BOM, budget, timeline, test checklist")]
table(ax, 210, 258, ["SHEET", "CONTENT"], idx, [14, 82], rh=4.3, size=5.4)
note_block(ax, 318, 258, "REV E ADDS (requirements first)", [
    "Rev D made every part car-proof.  Rev E",
    "writes the requirements down first and",
    "checks the design against them:",
    "",
    "- R1-R15 and a compliance matrix",
    "  (sheets 2-3), with a market benchmark.",
    "- R6 anti-collision: brass SHEAR-PIN",
    "  torque limiter on the big sprocket, so",
    "  a car hitting the standing arch shears",
    "  a pin, not the gearbox or chain.",
    "- R7 manual release: hatch in the cover",
    "  top + one shear bolt to unscrew.",
    "- R8 water: gasket, drains, drip hoods.",
    "- R13 heat: white lid, air gap, test.",
    "- Motor stays in the V1 position, under",
    "  the 5 mm steel drive cover (sheet 8).",
], size=5.3, lh=3.25)
hrows = [("Deck top", f"{H_DECK:.0f}"), ("Electronics box lid", f"{H_BOX:.0f}"),
         ("Drive cover (highest fixed part)", f"{H_COVER:.0f}"), ("Arch lying down (tyre ~100 wide)", f"~{H_ARCH_FLAT:.0f}"),
         ("Arch standing (locked)", f"{ZS + REACH - GROUND:.0f}")]
yy = table(ax, 20, 122, ["HEIGHT ABOVE GROUND", "mm"], hrows, [60, 20], rh=4.4, size=5.3)
ax.text(20, yy - 3, "A car straddling the unit needs > ~150 mm ground clearance (most cars: 165-200).", fontsize=5,
        va="top", color="#a02020")
crow = [("Design wheel", f"{F_WHEEL / 1000:.1f} kN (2 t car, 55 % axle, x1.5)"),
        ("Deck 6 mm, span 150", f"SF {CHK['deck'][1]:.1f}"), (f"Cover top 5 mm, span {cover_span:.0f}", f"SF {CHK['cover_top'][1]:.1f}"),
        ("Cover rib 8x30 + plate", f"SF {CHK['cover_rib'][1]:.1f}"), ("Box lid 6 mm, span 75", f"SF {CHK['lid'][1]:.1f}"),
        ("Box lid rib 8x30 + plate", f"SF {CHK['lid_rib'][1]:.1f}")]
table(ax, 110, 122, ["WHEEL-LOAD CHECK (hand calc)", "RESULT"], crow, [44, 48], rh=4.4, size=5.1)
note_block(ax, 212, 122, "MEASURE ON V1 BEFORE CUTTING STEEL", [
    "0  Gearbox rated torque (motor label): sets the shear pin.",
    "1  Battery holder voltage (~16 V = 4S, design basis).",
    "2  Swing the arch by hand 0 -> 180: where is it closest to",
    "    the motor and chain?  The cover may only be ~15 mm",
    "    bigger than the motor/chain envelope there.",
    "3  Rest angle + height of the arch crown and legs when lying",
    "    (sets the rest-block heights).",
    "4  Bearing spacing, motor bracket holes, chain c/c, teeth.",
    "5  Motor stall current at full battery (fuse + switch).",
], size=5.2, lh=3.3)
sheets.append(fig)

# ======================= REQUIREMENTS + COMPLIANCE (sheets 2, 3) - written BEFORE the geometry
REQS = [
    ("R1", "V1 mechanism unchanged: shaft 25 x 406, 2 x UCP205, MRF 4.00-8 half tyre, chain, sprockets, motor in its V1 position",
     "must", "user", "MET*", "Shaft is not drilled or replaced.  *Only the big-sprocket fixing changes (bronze bush + shear collar, sheet 9)."),
    ("R2", "Motion 0 - 90 - 180 deg, standing (90) = locked, both flat ends = open", "must", "user", "MET*",
     "3 Hall sensors + IMU on the PCB.  *Firmware still clamps motion to 0-90 deg: must be changed."),
    ("R3", "A car wheel may roll over any part: deck, cover, box lid, lying arch", "2 t car, 8.1 kN wheel, SF >= 1.5",
     "user; benchmark ~2 t", "MET*", f"Hand calc SF {min(v[1] for k, v in CHK.items()):.1f} - {max(v[1] for v in CHK.values()):.1f} (sheet 8).  *Do the real drive-over test."),
    ("R4", "Nothing mechanical or electrical open to touch or splash: motor, chain, bearings, sensors, IMU, cables", "all under steel / rubber",
     "user", "MET*", "*Shaft ends + arch brackets stay outside the cover, under the lying tyre on rubber blocks (accepted)."),
    ("R5", "A straddling car must clear the unit", f"highest fixed part {H_COVER:.0f} mm; locks on the market 75-80 mm lowered", "benchmark",
     "DEVIATION", "Height is set by the V1 big sprocket on a UCP205; R1 forbids changing them.  Most cars have 165-200 mm clearance."),
    ("R6", "A car hits the STANDING arch: gearbox + chain must not break", "limiter below gearbox / chain limit", "benchmark (anti-collision)",
     "FIXED Rev E", "Brass shear-pin torque limiter on the big sprocket (sheet 9)."),
    ("R7", "Arch can be lowered by hand when the battery is dead", "1 tool, < 2 min, no cutting", "benchmark (manual release)",
     "FIXED Rev E", "Service hatch in the cover top + shear bolt that is simply unscrewed (sheet 9)."),
    ("R8", "Rain must not reach or pool on motor / electronics", "no IP claim until a spray test", "benchmark (IP67 claimed by makers)",
     "FIXED Rev E", "EPDM gasket under cover and box, drip hoods over the shaft slots, 4 deck drains, pan drain (sheet 9)."),
    ("R9", "Wi-Fi works with the steel box closed", "RSSI loss < 10 dB", "design", "MET*", "Polycarbonate RF window.  *Measure RSSI."),
    ("R10", "Switch, fuse and charge jack reachable from outside", "on the box outer wall", "user (the 'button')", "MET", "Sheet 7."),
    ("R11", "Chain and motor can be serviced", "no cutting or grinding", "design", "MET", "Cover is bolted (6 x M8), hatch for the pin."),
    ("R12", "Tamper resistance", "security screws, lid switch", "design", "MET*", "*Anchor heads: countersunk security bolts, flush with the deck."),
    ("R13", "Heat: 0 - 55 C ambient + sun on steel", "battery <= 60 C, electronics <= 70 C", "India site", "TO VERIFY",
     "White lid, 5 mm air gap under the battery holder; log box temperature in the 100-cycle test."),
    ("R14", "Cost and time", "INR 11-26k, ~32 days", "earlier plan", "MET*", "Budget on sheet 11.  *Quotes still needed."),
    ("R15", "The limiter must not let one person flip the standing arch", "shears only at >= ~100 N push on the crown",
     "design (conflicts with R6)", "TO VERIFY", "Pin diameter vs gearbox rating (sheet 9): needs the gearbox torque rating from the motor label."),
]

fig, ax = new_sheet(2, "REQUIREMENTS AND DESIGN CONDITIONS", "-")
ax.text(20, 280, "REQUIREMENTS R1 - R15  (written first; every drawing in this set is checked against them)", fontsize=7.4,
        weight="bold", va="top")
yy = table(ax, 20, 272, ["#", "REQUIREMENT", "TARGET", "SOURCE"], [(a, b, c, d) for a, b, c, d, e, f in REQS],
           [10, 190, 92, 100], rh=5.0, size=5.0, bold_col0=True)
note_block(ax, 20, yy - 8, "CONDITIONS THE DESIGN ASSUMES", [
    "Site: outdoor parking bay in India, rain + dust + sun, 0 - 55 C; cars up to ~2 t (SUV), drive-over at walking speed.",
    "The barrier is a deterrent, not a crash barrier: a vehicle at speed is NOT designed for (the shear pin gives way).",
    "Fixed by the user: V1 mechanism, V1 4 x 18650 holder (assumed 4S = 16.8 V full), box on the left, 0-90-180 deg motion.",
    "Not decided yet: gearbox rated torque (needed for R6 / R15), measured arch weight + rest angle, battery voltage.",
], size=5.4, lh=3.5)
sheets.append(fig)

fig, ax = new_sheet(3, "COMPLIANCE MATRIX + RESEARCH BENCHMARK", "-")
ax.text(20, 280, "COMPLIANCE OF THIS DESIGN (Rev E) AGAINST R1 - R15", fontsize=7.4, weight="bold", va="top")
crow = [(a, e, f) for a, b, c, d, e, f in REQS]
yy = table(ax, 20, 272, ["#", "STATUS", "HOW / WHERE / WHAT IS STILL OPEN"], crow, [10, 30, 330], rh=4.7, size=5.0, bold_col0=True)
bench = [("Lowered height", "75 - 80 mm (raised 400 - 420 mm)", "ours: 131 mm cover (R5, accepted)"),
         ("Load when lowered", "about 2 t (one listing claims 5 t)", "ours: 2 t car, hand calc, drive-over test planned"),
         ("Water", "IP67 claimed", "ours: no IP claim until a spray test"),
         ("Move time", "4 - 5 s up or down", f"ours: ~{T90:.1f} s per 90 deg estimated - firmware ramp should slow it"),
         ("Temperature", "-25 to +55 C", "ours: 0 to 55 C design, white lid, air gap"),
         ("Anti-collision", "arm yields when hit (some models)", "ours: shear-pin limiter (R6)"),
         ("Manual release", "key release", "ours: hatch + shear bolt (R7)"),
         ("Where motor + battery sit", "inside a low steel base housing", "ours: motor under the cover, battery in the steel box")]
yy = table(ax, 20, yy - 10, ["BENCHMARK: GENERIC COMMERCIAL REMOTE PARKING LOCKS", "THEY SAY", "THIS DESIGN"], bench, [110, 110, 140],
           rh=4.6, size=5.0)
ax.text(20, yy - 3, "Benchmark = seller listings (manomano, esafetysupplies, skroutz) for generic locks, not a standard and not "
        "Parkobot's datasheet: use it as orientation only.", fontsize=4.9, va="top", color="#a02020")
note_block(ax, 20, yy - 12, "ACCEPTED DEVIATIONS AND WHAT YOU MUST MEASURE ON V1", [
    "Accepted: cover 131 mm high (V1 sprocket), shaft ends + arch brackets outside the cover under the lying tyre.",
    "Measure: (1) gearbox rated torque from the motor label / datasheet  (2) arch weight and rest angles  (3) battery holder voltage",
    "  (4) motor stall current at full battery  (5) clearance between arch and the cover profile (cardboard mock-up).",
    "Without (1) the shear pin size on sheet 9 is only a starting value.",
], size=5.4, lh=3.5)
sheets.append(fig)

# ======================= SHEET 4
fig, ax = new_sheet(4, "GENERAL ARRANGEMENT - PLAN", "1 : 4.5")
SC = 0.22
V = View(ax, 152, 150, SC, msp, *OFF["plan"])
plan_view(V)
dxf_lab("plan", "V2 PLAN (Rev D)", -460, 400)
V.dim((p["px0"], p["py1"] + p["ramp_run"]), (p["px1"], p["py1"] + p["ramp_run"]), 16)
V.dim((p["px0"], p["py0"]), (p["px0"], p["py1"]), -24, "v")
V.dim((p["px1"], p["py1"]), (p["px1"], p["py1"] + p["ramp_run"]), 14, "v")
V.dim((p["bx0"], p["by0"]), (p["bx1"], p["by0"]), -16)
V.dim((p["cx0"], COVER[-1][0]), (p["cx1"], COVER[-1][0]), -16)
V.dim((p["px1"], COVER[-1][0]), (p["px1"], COVER[0][0]), 24, "v")
bl = [((0, 0), (-330, 250), 1), ((p["cx1"] - 20, 40), (230, 250), 2), ((-60, -100), (-150, -330), 3),
      ((-350, -100), (-330, -250), 4), ((p["bx0"], 35), (-500, 120), 5), ((100, 225), (230, 330), 6),
      ((150, 110), (230, 160), 7), ((p["brk_x"], 0), (230, 60), 8), ((0, p["py0"] - 40), (230, -330), 9),
      ((p["px1"] - 20, -260), (230, -250), 10)]
for (u, v), (bu, bv), n in bl:
    V.balloon(u, v, bu, bv, n)
ax.text(30, 278, "PLAN - arch standing (solid), rest positions phantom.  Everything a wheel can reach is steel or rubber.",
        fontsize=6.4, weight="bold", va="top")
items = [("1", "Shaft dia 25 x 406 (V1)"), ("2", "Steel drive cover (bearings, sprocket, chain, motor,\nHall sensors, IMU inside)"),
         ("3", "Geared motor (V1 position, under the cover)"), ("4", "Steel electronics box, 6 mm ribbed lid"),
         ("5", "Polycarbonate RF window (outer wall)"), ("6", "Rubber rest block under arch crown x2 per side"),
         ("7", "Rubber rest block under arch legs x2 per side"), ("8", "Arch bracket x2 (V1)"),
         ("9", "Rubber edge ramp front + rear"), ("10", "Anchor hole dia 12 x4")]
yy = table(ax, 300, 276, ["#", "PART"], items, [8, 92], rh=4.3, size=5.1)
note_block(ax, 300, yy - 6, "NOTES", [
    "1  The arch itself is rubber (a tyre): a wheel on",
    "    it is fine as long as the tyre rests on the blocks.",
    "2  Arch brackets and the shaft ends are under the",
    "    lying tyre; the leg blocks keep wheel load off",
    "    the shaft (87 mm overhang would bend it).",
    "3  Cables run under the deck and come up INSIDE the",
    "    box and the cover - nothing to snag or crush.",
    "4  Deck 6 mm MS on 25x25x3 angle frame + cross",
    "    members under the cover and the box edges.",
], size=5.1, lh=3.3)
sheets.append(fig)

# ======================= SHEET 3
fig, ax = new_sheet(5, "FRONT + SIDE ELEVATION, HEIGHTS", "1 : 4.5")
V = View(ax, 132, 160, SC, msp, *OFF["front"])
front_view(V)
dxf_lab("front", "FRONT ELEVATION (arch 90 deg)", -460, 340)
top = ZS + REACH
V.dim((p["px0"], GROUND), (p["px0"], top), -22, "v", txt=f"{top - GROUND:.0f}")
V.dim((p["px0"] + 0.1, GROUND), (p["px0"] + 0.1, p["bh"]), -10, "v", txt=f"{H_BOX:.0f}")
V.dim((p["px1"], GROUND), (p["px1"], COVER_TOP), 12, "v", txt=f"{H_COVER:.0f}")
V.dim((p["px1"], GROUND), (p["px1"], 0), 26, "v", txt=f"{H_DECK:.0f}")
V.dim((p["cx0"], COVER_TOP), (p["cx1"], COVER_TOP), 70)
V.dim((p["px0"], GROUND), (p["px1"], GROUND), -14)
ax.text(132 - 470 * SC, 160 + 330 * SC + 4, "FRONT ELEVATION - seen from the motor side, arch standing (90 deg)", fontsize=6.2,
        weight="bold")
V = View(ax, 330, 160, SC, msp, *OFF["side"])
side_view(V)
dxf_lab("side", "SIDE ELEVATION (0 / 90 / 180 deg)", -300, 340)
V.dim((p["py0"] - p["ramp_run"], GROUND), (p["py1"] + p["ramp_run"], GROUND), -14)
V.dim((p["py1"], GROUND), (p["py1"] + p["ramp_run"], GROUND), -26, txt=f"{p['ramp_run']:.0f} ramp")
V.text(-150, 175, f"0 deg rest (~{fmt(p['rest_deg'])} deg)", 4.6, color="#1f5fae", dxf=False)
V.text(150, 175, f"180 deg rest (~{fmt(p['rest_deg'])} deg)", 4.6, color="#1f5fae", dxf=False)
ax.text(330 - 380 * SC, 160 + 330 * SC + 4, "SIDE ELEVATION - seen from the right", fontsize=6.2, weight="bold")
note_block(ax, 20, 72, "HEIGHTS (above ground)", [f"{a} .... {b}" for a, b in hrows], size=5.6, lh=3.5)
note_block(ax, 110, 72, "NOTES", [
    "1  Highest fixed part is the drive cover over the big sprocket. Lower than V1 sprocket + board is not possible",
    "    without changing the sprocket; it is still below a normal car's ground clearance when the car straddles it.",
    "2  0 and 180 deg are the two rest positions (arch lying on the rubber blocks).  Real angle from V1 (drawn ~10 deg).",
    "3  The cover stays inside the arch opening.  Check by swinging the arch by hand before welding the cover.",
], size=5.3, lh=3.3)
sheets.append(fig)

# ======================= SHEET 4  base deck
fig, ax = new_sheet(6, "BASE DECK - FABRICATION DRAWING + HOLE TABLE", "1 : 4.5")
V = View(ax, 152, 150, SC)
V.rect(p["px0"], p["px1"], p["py0"], p["py1"], fill="#eeeeee")
V.rect(p["px0"] + 25, p["px1"] - 25, p["py0"] + 25, p["py1"] - 25, "hid")
for xx in (p["bx1"], p["cx0"], p["cx1"]):
    V.line([(xx, p["py0"] + 25), (xx, p["py1"] - 25)], "hid")
for yy_ in (COVER[-1][0] - 20, COVER[0][0] + 20):
    V.line([(p["px0"] + 25, yy_), (p["px1"] - 25, yy_)], "hid")
V.line([(CHAIN_SLOT[0], CHAIN_SLOT[2]), (CHAIN_SLOT[1], CHAIN_SLOT[2]), (CHAIN_SLOT[1], CHAIN_SLOT[3]),
        (CHAIN_SLOT[0], CHAIN_SLOT[3])], "out", close=True, fill="white")
tags = {}
for (i, x, y, kind, size, purpose) in HOLES:
    if kind == "o":
        V.circle(x, y, size / 2, fill="white")
    else:
        V.line(slot_pts(x, y, *size), "out", close=True, fill="white")
    tags.setdefault(i, []).append((x, y))
for i, pts in tags.items():
    x, y = pts[0]
    V.text(x + 10, y + 10, i, 4.6, color="#a02020", weight="bold", dxf=False)
V.cl(p["px0"] - 10, 0, p["px1"] + 10, 0)
V.cl(0, p["py0"] - 10, 0, p["py1"] + 10)
V.dim((p["px0"], p["py1"]), (p["px1"], p["py1"]), 18)
V.dim((p["px0"], p["py0"]), (p["px0"], p["py1"]), -20, "v")
V.dim((p["px0"], p["py1"]), (0, p["py1"]), 8, txt=f"{abs(p['px0']):.0f} to shaft centre")
ax.text(30, 278, "BASE DECK  MS 6 mm  (datum = shaft centre; frame members dashed)", fontsize=6.4, weight="bold", va="top")
grp = {}
for (i, x, y, kind, size, purpose) in HOLES:
    grp.setdefault((i, kind, str(size), purpose), []).append((x, y))
rows = []
for (i, kind, size, purpose), pts in grp.items():
    if kind == "o":
        sz = f"dia {float(size):g}"
    else:
        w_, L_, a_ = eval(size)
        sz = f"slot {w_:g} x {L_:g} along {a_}"
    coords = "; ".join(f"({x:g},{y:g})" for x, y in pts[:3]) + (" ..." if len(pts) > 3 else "")
    rows.append((i, sz, len(pts), coords, purpose))
rows.append(("CS", "cut 24 x 80", 1, f"x {CHAIN_SLOT[0]:g}..{CHAIN_SLOT[1]:g}, y {CHAIN_SLOT[2]:g}..{CHAIN_SLOT[3]:g}",
             "chain slot + pan below"))
yy = table(ax, 218, 276, ["ID", "SIZE", "QTY", "POSITION (x, y)", "FOR"], rows, [8, 34, 8, 66, 74], rh=4.4, size=4.4)
note_block(ax, 218, yy - 6, "FABRICATION NOTES", [
    "1  Cut from PARKFNB_V2_BasePlate_cut.dxf (1:1 mm, layer CUT).  Plate datum = shaft centre.",
    "2  Frame 25x25x3 angle all round + cross members under the cover edges (x -112, +92, y -156, +98)",
    "    and under the box edge (x -250).  Stitch weld 30 mm every 100 mm.",
    "3  Chain pan 1.2 mm GI 34 x 90 x 15 deep under the chain slot.",
    "4  Deburr, zinc-rich primer + PU paint.  Verify every 'E' value on V1 before cutting.",
], size=5.1, lh=3.3)
sheets.append(fig)

# ======================= SHEET 5  electronics box
fig, ax = new_sheet(7, "STEEL ELECTRONICS BOX + RF WINDOW", "1 : 2")
SC2 = 0.5
V = View(ax, 505, 175, SC2, msp, *OFF["box"])
V.rect(p["bx0"], p["bx1"], p["by0"], p["by1"], fill=FILL["box"], alpha=0.4)
V.rect(p["bx0"] + 3, p["bx1"] - 3, p["by0"] + 3, p["by1"] - 3, "thin")
for ry in LID_RIBS_Y:
    V.line([(p["bx0"] + 3, ry), (p["bx1"] - 3, ry)], "hid")
for (nm, x0, x1, y0, y1, col) in BOXPARTS:
    V.rect(x0, x1, y0, y1, fill=col, alpha=0.7)
    V.text((x0 + x1) / 2, (y0 + y1) / 2, nm, 4.0, color="white" if col != "#999999" else "#111", dxf=False)
V.line([(p["bx0"], RF_WINDOW[0]), (p["bx0"], RF_WINDOW[1])], "elec")
V.text(p["bx0"] - 8, 35, "RF\nwindow", 3.8, ha="right", color="#1f5fae", dxf=False)
for (i, x, y, kind, size, purpose) in HOLES:
    if i == "C" and x < -200:
        V.circle(x, y, size / 2, "thin")
V.dim((p["bx0"], p["by1"]), (p["bx1"], p["by1"]), 8)
V.dim((p["bx1"], p["by0"]), (p["bx1"], p["by1"]), 8, "v")
ax.text(255, 278, "PLAN, LID OFF (outer wall left, shaft side right; lid ribs dashed)", fontsize=6.2, weight="bold", va="top")
VO = View(ax, 95, 210, SC2)
VO.rect(p["by0"], p["by1"], 0, p["bh"] - p["blid"], fill=FILL["box"], alpha=0.5)
VO.rect(p["by0"] - 3, p["by1"] + 3, p["bh"] - p["blid"], p["bh"], fill="#8e9aa8")
# seen from outside (looking toward +x) the +y direction is on the LEFT, so u = -y here
VO.rect(-RF_WINDOW[1], -RF_WINDOW[0], RF_WINDOW[2], RF_WINDOW[3], fill="#cfe8ff")
VO.rect(85, 115, 26, 48, fill="white")                  # switch next to the battery (battery is at y -140..-60)
VO.circle(55, 37, 6, fill="white")
VO.circle(-110, 40, 6.1, fill="white")
VO.text(-35, 40, "RF WINDOW\nPC 6 mm", 4.0, dxf=False)
VO.text(100, 17, "SW1 + cover", 3.8, dxf=False)
VO.text(55, 22, "CHARGE", 3.8, dxf=False)
VO.text(-110, 26, "VENT", 3.8, dxf=False)
VO.text(-140, 92, "+y (rear)", 3.6, ha="left", color="#555", dxf=False)
VO.text(140, 92, "-y (front)", 3.6, ha="right", color="#555", dxf=False)
VO.dim((-RF_WINDOW[1], RF_WINDOW[3]), (-RF_WINDOW[0], RF_WINDOW[3]), 10)
VO.dim((-RF_WINDOW[0], RF_WINDOW[2]), (-RF_WINDOW[0], RF_WINDOW[3]), 8, "v")
VO.dim((p["by0"], 0), (p["by1"], 0), -10)
VO.dim((p["by1"], 0), (p["by1"], p["bh"]), 22, "v")
ax.text(20, 278, "OUTER WALL (x = -450), seen from outside - the only wall without a ramp", fontsize=6.2, weight="bold", va="top")
cut = [("LID", "6 mm MS, 3 ribs 8 x 30 underneath, EPDM gasket", "-", "10 x M6 security screws"),
       ("WALLS", "3 mm MS, welded, flange to deck with gasket", "-", "6 x M8 into deck holes X"),
       ("RF", "Polycarbonate 6 mm window, bonded + clamped", "outer", "70 x 40 opening"),
       ("SW1", "ON/OFF rocker DC >= 15 A, flip-up cover", "outer", "30 x 22"),
       ("J-CHG", "Charge jack 5.5/2.1 with cap", "outer", "dia 12"),
       ("VENT", "M12 pressure vent membrane", "outer", "dia 12.2"),
       ("CABLES", "from below through deck grommets C", "base", "no glands needed")]
yy = table(ax, 20, 160, ["ID", "FEATURE", "WALL", "SIZE / FIX"], cut, [14, 82, 14, 44], rh=4.4, size=5.0)
note_block(ax, 20, yy - 6, "WHY STEEL + A WINDOW", [
    "A plastic box would crack under a wheel.  A closed steel box would block Wi-Fi.  So: steel box,",
    "6 mm ribbed lid (wheel-rated, sheet 1), and a polycarbonate window in the outer wall right in",
    "front of the ESP32 antenna.  The outer wall is vertical and has no ramp, so no wheel lands on it.",
    "Parts sit under the ribs with > 5 mm gap (tallest part IBT-2 43 mm, clear height under ribs 49 mm).",
    "Check Wi-Fi RSSI with the lid closed (test checklist sheet 8).",
], size=5.2, lh=3.3)
sheets.append(fig)

# ======================= SHEET 6  drive cover
fig, ax = new_sheet(8, "DRIVE COVER - DETAILS + WHEEL-LOAD CHECK", "1 : 1.5")
V = View(ax, 150, 110, 0.75, msp, *OFF["cover"], clip=(18, 50, 230, 228))
V.rect(-160, 100, -p["plate_t"], 0, fill="#bbbbbb")
V.line([(-50, -p["plate_t"]), (-50, -20), (40, -20), (40, -p["plate_t"])], "out")
V.line(COVER, "out", fill=FILL["cover"], alpha=0.3)
t = p["cover_t"]
inner = [(73, 0), (73, 86), (64, 95), (-58, 95), (-73, 80), (-73, 57), (-128, 57), (-131, 54), (-131, 0)]
V.line(inner, "thin")
V.rect(-58, 64, 65, 95, "hid")
V.text(3, 80, f"rib 8 x 30 (at x {p['rib_x'][0]:g} and {p['rib_x'][1]:g})", 3.8, color="#555", dxf=False)
V.rect(HATCH[2], HATCH[3], COVER_TOP - p["cover_t"], COVER_TOP, fill="white")           # service hatch opening
V.rect(HATCH[2] - 5, HATCH[3] + 5, COVER_TOP, COVER_TOP + 5, fill="#5d6673")
V.text(0, COVER_TOP + 12, "service hatch (sheet 9)", 3.8, dxf=False)
V.circle(0, ZS, p["shaft_d"] / 2, fill="#d8d8d8")
V.circle(0, ZS, OD_B / 2, fill="#9a9a9a", alpha=0.25)
V.rect(-p["brg_L"] / 2, p["brg_L"] / 2, 0, p["brg_foot"], "hid")
V.circle(0, ZS, 34.5, "hid")
my, mz = p["motor_y"], p["motor_z"]
V.circle(my, mz, p["gb_d"] / 2, fill=FILL["motor"], alpha=0.5)
V.circle(my, mz, OD_S / 2, "thin")
path = chain_path((0, ZS), PD_B / 2, (my, mz), PD_S / 2)
V.line(path, "out")
for (u, v) in resample(path, p["chain_p"]):
    V.circle(u, v, 1.65, "thin")
for nm, (hy, hz) in HALLS.items():
    V.rect(hy - 3, hy + 3, hz - 2, hz + 2, fill="#1d6b35")
    V.text(hy + (16 if hy > 0 else -16 if hy < 0 else 0), hz + (0 if hy else -7), nm, 4.2, color="#1d6b35", dxf=False)
V.dim((COVER[-1][0], 0), (COVER[0][0], 0), -14)
V.dim((COVER[0][0], 0), (COVER[0][0], COVER_TOP), 12, "v")
V.dim((COVER[-1][0], 0), (COVER[-1][0], 62), -12, "v")
V.dim((-78, 62), (-136, 62), 10, txt="58")
ax.text(20, 280, "SECTION AT x = 0 (from the right) - 5 mm cover, ribs, chain, motor, Hall sensors", fontsize=6.4,
        weight="bold", va="top")
chk = [("Design wheel load", f"{F_WHEEL / 1000:.2f} kN  (2 t car, {p['axle'] * 100:.0f} % axle, x{p['dyn']} dynamic)"),
       ("Tyre patch", f"{p['patch_w']:.0f} x {p['patch_l']:.0f} mm -> {P_PATCH:.2f} MPa"),
       (f"Cover top 5 mm, span {cover_span:.0f}", f"{CHK['cover_top'][0]:.0f} MPa, SF {CHK['cover_top'][1]:.1f}, "
                                                    f"defl {CHK['cover_top'][2]:.2f} mm"),
       ("Cover rib 8x30 + plate", f"{CHK['cover_rib'][0]:.0f} MPa, SF {CHK['cover_rib'][1]:.1f} (all load on one rib)"),
       ("Deck 6 mm, span 150", f"{CHK['deck'][0]:.0f} MPa, SF {CHK['deck'][1]:.1f}, defl {CHK['deck'][2]:.2f} mm"),
       ("Box lid 6 mm, span 75", f"{CHK['lid'][0]:.0f} MPa, SF {CHK['lid'][1]:.1f}"),
       ("Box lid rib 8x30 + plate", f"{CHK['lid_rib'][0]:.0f} MPa, SF {CHK['lid_rib'][1]:.1f}"),
       ("Service hatch 6 mm, span 60", f"{CHK['hatch'][0]:.0f} MPa, SF {CHK['hatch'][1]:.1f} (on a 20x3 angle ledge)"),
       ("Ground under frame", f"{P_GROUND:.1f} MPa on 25 mm angle (concrete / paver OK)"),
       ("Not checked", "impact at speed, fatigue, welds, the arch itself when standing")]
yy = table(ax, 250, 276, ["CHECK (S235, fy 235)", "RESULT"], chk, [42, 116], rh=4.5, size=4.8)
ax.text(250, yy - 3, "One-way strip / T-beam, simply supported.  Concept check: do a real drive-over test before a pilot.",
        fontsize=4.8, va="top", color="#a02020")
note_block(ax, 250, yy - 12, "COVER DETAILS", [
    f"Length x {p['cx0']:g} .. {p['cx1']:g} ({p['cx1'] - p['cx0']:g}); welded from 5 mm MS: 2 end plates (profile",
    "shown), skin strips along the profile, 2 ribs 8 x 30 under the top, 25 mm flange at the bottom.",
    "End plates: bottom-open slot dia 32 for the shaft + brush strip; the shaft turns, the cover does not.",
    "Bolted to the deck with 6 x M8 (holes K) so it lifts off for chain service.",
    "Inside: both UCP205, big sprocket on its shear collar (sheet 9), chain, motor, Hall collar at x = 33 with",
    f"3 sensors, IMU pod moved from the shaft end to x = {p['imu_x']:g} (between left bearing and shear collar).",
    f"Top plate: {HATCH[1] - HATCH[0]:g} x {HATCH[3] - HATCH[2]:g} service hatch opening over the shear pin, 20 x 3 angle ledge, drains in the deck.",
    "Clearance to the arch: the cover is only a few mm outside the V1 motor/chain envelope -",
    "swing the arch by hand over a cardboard mock-up of this profile before welding.",
], size=5.0, lh=3.2)
sheets.append(fig)

# ======================= SHEET 9  anti-collision, manual release, water, thermal
fig, ax = new_sheet(9, "TORQUE LIMITER, MANUAL RELEASE, WATER, HEAT", "AS SHOWN")
ax.text(20, 281, "A  TORQUE LIMITER on the big sprocket (axial section, 1.35 : 1) - R6 / R15", fontsize=6.6, weight="bold", va="top")
VA = View(ax, 101, 214, 1.35)
BR, HUB, COL, PINC = "#b08d57", "#9a9a9a", "#4a6fa5", "#c0392b"
rr = p["shaft_d"] / 2
cx_a, cx_b = p["pin_collar_x"]
VA.rect(-60, 50, -rr, rr, fill="#d8d8d8")                         # shaft (not drilled)
for sgn in (-1, 1):
    VA.rect(-16.5, 1.5, sgn * rr, sgn * (rr + 2), fill=BR)        # bronze bush OD 29
    VA.rect(-16.5, -1.5, sgn * (rr + 2), sgn * 20, fill=HUB)      # sprocket hub OD 40
    VA.rect(-1.5, 1.5, sgn * (rr + 2), sgn * 30, fill=HUB)        # sprocket plate (continues to OD 93)
    VA.rect(cx_a, cx_b, sgn * rr, sgn * 22.5, fill=COL)           # split collar clamped to the shaft
    VA.rect(1.5, 10.5, sgn * rr, sgn * 22.5, fill=COL, alpha=0.6)  # thrust collar (keeps the sprocket in place)
    VA.rect(cx_a + 4, -8.5, sgn * (p["pin_r"] - 1.5), sgn * (p["pin_r"] + 1.5), fill=PINC)   # brass pin dia 3
VA.line([(cx_b, -26), (cx_b, 26)], "cen")
VA.cl(-64, 0, 54, 0)
VA.text(-58, -24, "SHAFT dia 25\n(not drilled)", 4.2, ha="left", dxf=False)
VA.text(-4, 38, "bronze bush ID 25 / OD 29\nsprocket + hub turn free on it", 4.0, dxf=False)
VA.text(-38, -36, "SPLIT COLLAR clamped\nto the shaft (dia 45 x 12)", 4.0, color=COL, dxf=False)
VA.text(cx_b - 1, 28, "SHEAR PLANE", 4.0, color=PINC, weight="bold", dxf=False)
VA.text(34, 28, "thrust collar", 4.0, dxf=False)
VA.text(6, -34, f"BRASS PIN dia 3 x 16 at r = {p['pin_r']:g}\n(parallel to the shaft)", 4.0, ha="left", color=PINC, dxf=False)
VA.dim((-30, 0), (-30, p["pin_r"]), 0.01, "v", txt=f"r {p['pin_r']:g}")

pins = [("pin dia", "shear torque", "push at arch crown", "chain pull", "x running torque")]
prow = []
for d in (2.0, 2.5, 3.0, 4.0):
    T, Fp, Fc = pin_capacity(d)
    prow.append((f"{d:g} mm", f"{T:.0f} N.m", f"{Fp:.0f} N  (~{Fp / 9.81:.0f} kgf)", f"{Fc:.0f} N", f"{T / T_ARCH:.0f}x"))
yy = table(ax, 235, 276, ["BRASS PIN", "SHEARS AT", "PUSH AT ARCH CROWN", "CHAIN PULL", "vs RUNNING"], prow, [20, 24, 46, 24, 24],
           rh=4.6, size=5.0)
ax.text(235, yy - 3, f"Brass shear strength assumed {p['pin_tau']:.0f} MPa (single shear), running torque {T_ARCH:.1f} N.m "
        f"(arch {p['arch_kg']} kg, CG {p['arch_cg']:.0f} mm: both estimates).", fontsize=4.8, va="top", color="#a02020")
note_block(ax, 235, yy - 10, "HOW TO CHOOSE THE PIN (R6, R15)", [
    "Rule: the pin must hold at least 3 x the running torque AND shear before the gearbox or the chain is overloaded.",
    "Start with dia 3 (about 110 N push at the crown).  Then:",
    "1  Read the gearbox rated output torque from the motor label / datasheet.  Shear torque must be < 60 % of it.",
    "2  Compare the chain pull with the breaking load in your #25 chain's datasheet (use < 30 %).",
    "3  Test: spring scale on the arch crown of the standing arch, pull sideways until the pin shears, 3 pins.",
    "    Use the average force; change the diameter until it is about 100 - 150 N.",
    "A person cannot flip the arch easily, a car pushing it shears the pin: gearbox + chain survive.",
    "After a shear the arch falls gently onto the rubber rest blocks; firmware sees 'moving but no angle",
    "change' and raises a fault.  Replace the pin (spares in the box), re-home with the 'cal' command.",
], size=5.0, lh=3.25)

ax.text(20, 164, "B  SIDE SECTION: service hatch, manual release, water path", fontsize=6.6, weight="bold", va="top")
VB = View(ax, 140, 50, 0.8)
VB.rect(-150, 95, -p["plate_t"], 0, fill="#bbbbbb")
VB.line(COVER, "out", fill=FILL["cover"], alpha=0.3)
hy0, hy1 = HATCH[2], HATCH[3]
VB.rect(hy0, hy1, COVER_TOP - p["cover_t"], COVER_TOP, fill="white")
VB.rect(hy0 - 5, hy1 + 5, COVER_TOP, COVER_TOP + 5, fill="#5d6673")            # lift-off hatch plate, 4 security screws
VB.text(0, COVER_TOP + 12, "SERVICE HATCH (lift-off, 4 x M5 security)", 4.2, dxf=False)
VB.circle(0, ZS, p["shaft_d"] / 2, fill="#d8d8d8")
VB.circle(0, ZS, OD_B / 2, "hid")
VB.circle(0, ZS + p["pin_r"], 2.5, fill=PINC)
VB.line([(0, COVER_TOP - p["cover_t"]), (0, ZS + p["pin_r"] + 3)], "elec")
VB.text(12, ZS + p["pin_r"] + 26, "shear bolt (pin at 12 o'clock\nwhen the arch stands)", 4.0, ha="left", color=PINC, dxf=False)
my, mz = p["motor_y"], p["motor_z"]
VB.circle(my, mz, p["gb_d"] / 2, fill=FILL["motor"], alpha=0.5)
for (i, x, y, kind, size, purpose) in HOLES:
    if i == "D" and abs(x) < 120:
        pass
for dy_ in (-130.0, 40.0, 30.0):
    VB.line([(dy_, 0), (dy_, -p["plate_t"] - 14)], "elec")
    VB.text(dy_, -p["plate_t"] - 20, "D", 4.0, color="#1d6b35", dxf=False)
VB.line([(-45, -p["plate_t"]), (-45, -20), (40, -20), (40, -p["plate_t"])], "out")
VB.circle(-5, -20, 5, "elec")
VB.text(-5, -34, "pan drain dia 10", 4.0, color="#1d6b35", dxf=False)
VB.line([(COVER[0][0] + 2, 0), (COVER[-1][0] - 2, 0)], "thin")
VB.text(-35, 6, "EPDM gasket under the cover flange", 4.0, dxf=False)
VB.text(-148, 118, "WATER: rain on the shaft slots runs down the\nend plates onto the deck, out of 4 drains (D)\n"
        "and the chain pan.  Drip hood over each slot.", 4.0, ha="left", color="#1d6b35", dxf=False)
VB.dim((hy0, COVER_TOP + 5), (hy1, COVER_TOP + 5), 18, txt=f"{hy1 - hy0:g} x {HATCH[1] - HATCH[0]:g} opening")

note_block(ax, 235, 150, "C  MANUAL RELEASE (battery dead, arch standing) - R7", [
    "1  Switch OFF.  2  Undo the 4 security screws, lift the hatch (the pin is directly below).",
    "3  Unscrew the shear bolt (M3 hex key, bolt is parallel to the shaft - use a ball-end key).",
    "4  The arch now turns free: lower it by hand to 0 or 180 deg.   5  Fit a spare pin, refit the hatch.",
    "Everything from step 1 to 4 takes < 2 min with one tool.  Keep the key tool + 5 spare pins in the box.",
], size=5.0, lh=3.3)
note_block(ax, 235, 125, "D  WATER (R8) - no IP rating is claimed until the spray test passes", [
    "Gasket: EPDM 3 mm under the cover flange and the box flange; vent membrane M12 on the box.",
    "Cover: shaft slots in the end plates with brush strip + drip hood; 4 deck drains dia 10 inside the cover;",
    "chain pan drain dia 10; motor terminals point down; box cables enter from below (drip loop).",
    "Deck is flat: water leaves through the drains, not over the cover.  Keep the drains clear of mud.",
], size=5.0, lh=3.3)
note_block(ax, 235, 97, "E  HEAT (R13)", [
    "Steel in the Indian sun can reach 70 C+.  Box lid powder-coated white; battery holder on 5 mm spacers",
    "(air gap, not touching the floor); IBT-2 heatsink faces an air gap.  Log battery + IBT-2 temperature during",
    "the 100-cycle test in the sun.  Limit: battery 60 C (charging off above 45 C: add an NTC later).",
], size=5.0, lh=3.3)
sheets.append(fig)

# ======================= SHEET 10  wiring
fig, ax = new_sheet(10, "WIRING, ON/OFF SWITCH, FUSE, PIN MAP", "NTS")


def blk(x, y, wd, ht, title, sub="", fc="#eef3f9", ec="#1f3f6f"):
    ax.add_patch(FancyBboxPatch((x, y), wd, ht, boxstyle="round,pad=0.4,rounding_size=1.5", fc=fc, ec=ec, lw=0.7))
    ax.text(x + wd / 2, y + ht - 3.2, title, fontsize=6, weight="bold", ha="center", va="center")
    if sub:
        ax.text(x + wd / 2, y + ht / 2 - 2.5, sub, fontsize=4.7, ha="center", va="center", color="#333", linespacing=1.15)


def wire(pts, color, lw=1.0, label=None):
    xs, ys = zip(*pts)
    ax.plot(xs, ys, color=color, lw=lw, solid_capstyle="round", zorder=2)
    ax.annotate("", xy=pts[-1], xytext=pts[-2], arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, mutation_scale=6), zorder=3)
    if label:
        mx, my_ = (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2
        ax.text(mx, my_ + 1.6, label, fontsize=4.6, ha="center", color=color, bbox=dict(fc="white", ec="none", pad=0.3))


RED, ORG, BLU, PNK = "#c0392b", "#d68910", "#1f5fae", "#a0307a"
blk(20, 214, 44, 24, "BATTERY (V1 holder)", "4 x 18650, assumed 4S\n14.8 V nom / 16.8 V full", fc="#fbe7f5", ec=PNK)
blk(76, 214, 34, 24, "4S BMS", ">= 20 A, balance\n(new - V1 has none)", fc="#fbe7f5", ec=PNK)
blk(122, 218, 26, 16, "FUSE", "10 A blade (set from\nstall current)", fc="#fdecea", ec=RED)
blk(160, 218, 30, 16, "SW1 ON/OFF", "box outer wall\n>= 15 A DC", fc="#fdecea", ec=RED)
blk(205, 206, 46, 36, "IBT-2  BTS7960", "B+/B-  in\nM+/M-  to motor\n8-pin logic to PCB J2", fc="#e8f0fb", ec=BLU)
blk(266, 214, 40, 24, "GEARED MOTOR", "under drive cover\nPWM limited for 4S", fc="#f1f1f1", ec="#555")
blk(76, 176, 34, 22, "CHARGE JACK", "16.8 V CC/CV 2 A\ninto BMS P+/P-", fc="#fbe7f5", ec=PNK)
blk(140, 112, 88, 70, "CONTROLLER PCB (pcb/)", "", fc="#eaf6ee", ec="#1d7a3a")
ax.text(184, 168, "J1 battery 7-17 V -> PTC -> diode -> TVS\nJ3/J9 -> LM2596 module (5.1 V)\nESP32 DevKit + 74AHCT125\n"
        "J2 -> IBT-2   J6 -> IMU\nJ4 / J10 / J5 -> Hall 0 / 90 / 180\nJ7 LED   J8 tamper (optional)", fontsize=4.9,
        ha="center", va="top", linespacing=1.3)
blk(20, 132, 54, 20, "HALL 0 deg  (J4)", "under drive cover", fc="#eef3f9")
blk(20, 106, 54, 20, "HALL 90 deg (J10)", "LOCKED, under cover", fc="#eef3f9")
blk(20, 80, 54, 20, "HALL 180 deg (J5)", "under drive cover", fc="#eef3f9")
blk(20, 54, 54, 20, "MPU6050 POD (J6)", "on shaft, under cover", fc="#eef3f9")
blk(262, 140, 44, 20, "STATUS LED (J7)", "behind RF window", fc="#eef3f9")
blk(262, 112, 44, 20, "LID TAMPER (J8)", "optional", fc="#eef3f9")
wire([(64, 226), (76, 226)], PNK, 1.6)
wire([(110, 226), (122, 226)], RED, 1.6)
wire([(148, 226), (160, 226)], RED, 1.6)
wire([(190, 226), (205, 226)], RED, 1.6, "1.5 mm2")
wire([(251, 226), (266, 226)], RED, 1.4, "1.0 mm2")
wire([(175, 218), (175, 182)], ORG, 0.9, "J1")
wire([(93, 198), (93, 214)], PNK, 0.9)
wire([(228, 182), (228, 206)], BLU, 0.8)
for yb, yt, lab in ((142, 140, "J4 GPIO32"), (116, 125, "J10 GPIO13"), (90, 118, "J5 GPIO33"), (64, 114, "J6 SDA21/SCL22")):
    wire([(74, yb), (110, yb), (110, yt), (140, yt)], BLU, 0.7, lab)
wire([(228, 150), (262, 150)], BLU, 0.7, "GPIO18 / 4")
wire([(262, 122), (228, 122)], BLU, 0.7, "GPIO23")
pins = [("GPIO25", "RPWM (raise)", "PIN_MOTOR_IN1 25"), ("GPIO26", "LPWM (lower)", "PIN_MOTOR_IN2 26"),
        ("GPIO27", "IBT-2 EN", "NEW: HIGH while moving"), ("GPIO32", "Hall 0 deg", "NEW"), ("GPIO13", "Hall 90 deg (locked)", "NEW"),
        ("GPIO33", "Hall 180 deg", "NEW"), ("GPIO34", "motor current", "PIN_CURRENT 34"), ("GPIO35", "battery voltage", "NEW"),
        ("GPIO21/22", "IMU SDA / SCL", "unchanged"), ("GPIO18 / 4", "LED green / red", "PIN_LED 18"),
        ("GPIO19", "buzzer", "PIN_BUZZER 19"), ("GPIO23", "tamper", "NEW, optional")]
yy = table(ax, 318, 276, ["PIN", "FUNCTION", "FIRMWARE"], pins, [20, 34, 34], rh=4.3, size=4.8)
note_block(ax, 318, yy - 6, "FIRMWARE (180 deg)", [
    "config.h is set for 0-90 deg today",
    "(ANGLE_SECURE 90, startMove clamps 0..90).",
    "For 0-90-180: two open targets (0, 180),",
    "locked = 90, read 3 Hall inputs, and",
    "PWM_MAX ~180 so a 4S pack gives ~12 V",
    "average to the 12 V motor.",
], size=5.1, lh=3.3)
ax.plot([20, 30], [40, 40], color=RED, lw=1.6)
ax.text(32, 40, "battery / motor current", fontsize=5, va="center")
ax.plot([90, 100], [40, 40], color=ORG, lw=0.9)
ax.text(102, 40, "logic supply", fontsize=5, va="center")
ax.plot([135, 145], [40, 40], color=BLU, lw=0.7)
ax.text(147, 40, "signals (all cables under the deck)", fontsize=5, va="center")
ax.text(20, 280, "POWER AND SIGNALS  (switch and fuse are in the battery lead, so they cut the motor too)", fontsize=6.8,
        weight="bold", va="top")
sheets.append(fig)

# ======================= SHEET 8  BOM etc
fig, ax = new_sheet(11, "BOM, BUDGET, TIMELINE, TEST CHECKLIST", "-")
bom = [("Base deck MS 6 mm 700 x 560 + 25x25x3 angle frame + cross members", "1", "fabricate", "laser cut from DXF"),
       ("Drive cover 5 mm MS welded (end plates, skin, 2 ribs, flange)", "1", "fabricate", "SteelParts DXF"),
       ("Electronics box 3 mm MS walls + 6 mm lid with 3 ribs", "1", "fabricate", "SteelParts DXF"),
       ("Polycarbonate 6 mm RF window 90 x 60", "1", "buy", "bonded + clamped"),
       ("Rubber edge ramp ~31 mm high, 700 long", "2", "buy", "M8 bolts"),
       ("Rubber rest blocks (crown 300x40, legs 60x40)", "8", "buy", "height from V1"),
       ("Chain pan 1.2 mm GI with dia 10 drain, brush strip + drip hood for shaft slots", "1 set", "buy/fab", ""),
       ("Torque limiter: split collar dia 45, thrust collar, bronze bush ID25/OD29 x 18", "1 set", "fab/buy", "sprocket fixing only"),
       ("Brass pins dia 2 / 3 / 4 x 16 (shear test) + M3 shear bolt", "10 + 5", "buy", "spares in the box"),
       ("Service hatch plate 6 mm 60 x 60 + 20x3 angle ledge + 4 M5 security screws", "1", "fabricate", "SteelParts DXF"),
       ("ON/OFF switch DC >= 15 A + flip cover", "1", "buy", "the 'button'"),
       ("Blade fuse holder + 10 A fuse", "1", "buy", "final rating after stall test"),
       ("4S BMS >= 20 A + 16.8 V 2 A charger + jack", "1 set", "buy", "V1 holder has no BMS"),
       ("Grommets x6, M12 vent, EPDM gasket, security screws", "1 set", "buy", ""),
       ("16 mm PVC conduit, cable 1.5/1.0/0.5 mm2", "1 set", "buy", "under the deck"),
       ("Controller PCB + parts (pcb/BOM)", "1", "fabricate", "Gerbers in pcb/out"),
       ("Split collar dia 25 + N52 magnet + 3 Hall sensors", "1 set", "buy", ""),
       ("Fasteners M5/M6/M8/M10, anchors M10 x4", "1 set", "buy", ""),
       ("Shaft, bearings, tyre, chain, sprockets, motor, IBT-2, ESP32, IMU, battery", "-", "reuse V1", "")]
yy = table(ax, 20, 276, ["ITEM", "QTY", "SOURCE", "NOTE"], bom, [112, 14, 22, 40], rh=4.2, size=4.9)
bud = [("Base deck + frame, cut + weld + paint", "2,500 - 5,000"), ("Drive cover, welded + painted", "1,500 - 3,500"),
       ("Steel box + lid + PC window + gasket", "1,500 - 3,500"), ("Rubber ramps + rest blocks", "1,000 - 2,500"),
       ("Switch, fuse, BMS, charger, jack", "1,200 - 2,800"), ("PCB fabrication + components", "2,000 - 4,500"),
       ("Collar, magnet, Hall, conduit, cable, grommets", "600 - 1,500"), ("Fasteners, anchors", "400 - 1,000"),
       ("Torque limiter, shear pins, hatch, drains, gasket", "800 - 1,800"),
       ("Total (planning range, not a quote)", "11,500 - 26,100")]
table(ax, 20, yy - 8, ["BUDGET (INR)", "RANGE"], bud, [120, 48], rh=4.4, size=5.1)
steps = [("1", "Measurements on V1", 1, 3), ("2", "Requirements + CAD freeze (this set)", 4, 7),
         ("3", "PCB update + review", 4, 10), ("4", "Cardboard mock-up of cover, freeze, orders", 8, 12),
         ("5", "Fabrication + parts", 13, 23), ("6", "Assembly + wiring + firmware", 22, 27),
         ("7", "Testing incl. drive-over + shear test", 27, 32)]
gx0, gy0, dw, rh = 222, 262, 5.2, 8.0
for d in range(32):
    day = START + dt.timedelta(days=d)
    x = gx0 + d * dw
    ax.add_patch(Rectangle((x, gy0 - rh * len(steps)), dw, rh * len(steps), fc="#f3f3f3" if day.weekday() == 6 else "white",
                           ec="#ddd", lw=0.2))
    if d % 3 == 0:
        ax.text(x + 0.2, gy0 + 2.5, day.strftime("%d %b"), fontsize=3.9, color="#1f3f6f")
dv0 = (dt.date(2026, 11, 7) - START).days
ax.add_patch(Rectangle((gx0 + dv0 * dw, gy0 - rh * len(steps)), 5 * dw, rh * len(steps), fc="#f6c344", ec="none", alpha=0.25))
cols = ["#1f5fae", "#2f7d53", "#1d6b35", "#a05a00", "#8a2be2", "#c0392b", "#555"]
for i, (n, name, a, b) in enumerate(steps):
    y = gy0 - rh * (i + 1)
    ax.add_patch(Rectangle((gx0 + (a - 1) * dw, y + 1.6), (b - a + 1) * dw, rh - 3.2, fc=cols[i], ec="none"))
    ax.text(gx0 - 2, y + rh / 2, f"{n} {name}", fontsize=4.5, ha="right", va="center")
    ax.text(gx0 + (a - 1) * dw + 1, y + rh / 2, f"D{a}-{b}", fontsize=3.8, color="white", va="center", weight="bold")
ax.text(gx0 + (dv0 + 2.5) * dw, gy0 - rh * len(steps) - 3, "Diwali 7-11 Nov", fontsize=4.4, ha="center", color="#8a5a00")
ax.text(222, 279, f"TIMELINE - 32 days, Day 1 = {START.strftime('%d %b %Y')}", fontsize=6.6, weight="bold", va="top")
note_block(ax, 222, 190, "TEST CHECKLIST (step 7)", [
    "[ ] Arch swung by hand 0 -> 180 deg over the cover and box: no contact anywhere.",
    "[ ] Switch OFF cuts motor and electronics; fuse blows on a short (bench test).",
    "[ ] Hall 0 / 90 / 180 trip at the right angle; IMU angle agrees within 3 deg.",
    "[ ] Wi-Fi RSSI with the steel lid closed (RF window) vs. lid open: < 10 dB worse.",
    "[ ] 100 cycles 0 -> 90 -> 180 -> 90 -> 0: log current, time, battery voltage, temperatures.",
    "[ ] DRIVE-OVER TEST: a 2 t car rolls one wheel slowly over the deck, the cover, the box lid",
    "     and the lying arch, 20 passes each.  Then check: no dent > 1 mm, shaft runs true,",
    "     bearings turn freely, box dry inside, unit still works.",
    "[ ] SHEAR-PIN TEST: spring scale at the arch crown, push the standing arch sideways until the pin shears,",
    "     3 pins; record the force (target ~100-150 N).  Chain and gearbox undamaged?  Replace pin, repeat.",
    "[ ] MANUAL RELEASE: battery out, hatch off, bolt out, arch lowered by hand in < 2 min.",
    "[ ] Spray test on the box and cover: dry inside, drains run clear.  Sun test: log battery + IBT-2 temperature.",
], size=5.2, lh=3.45)
sheets.append(fig)

# ----------------------------------------------------------------------------------------- cut files
cut = ezdxf.new("R2010", setup=True)
cut.units = ezdxf.units.MM
cut.layers.add("CUT", color=1)
cut.layers.add("MARK", color=3)
cm = cut.modelspace()
ox, oy = -p["px0"], -p["py0"]
cm.add_lwpolyline([(0, 0), (p["px1"] - p["px0"], 0), (p["px1"] - p["px0"], p["py1"] - p["py0"]), (0, p["py1"] - p["py0"])],
                  close=True, dxfattribs={"layer": "CUT"})
x0, x1, y0, y1 = CHAIN_SLOT
cm.add_lwpolyline([(x0 + ox, y0 + oy), (x1 + ox, y0 + oy), (x1 + ox, y1 + oy), (x0 + ox, y1 + oy)], close=True,
                  dxfattribs={"layer": "CUT"})
for (i, x, y, kind, size, purpose) in HOLES:
    if kind == "o":
        cm.add_circle((x + ox, y + oy), size / 2, dxfattribs={"layer": "CUT"})
    else:
        cm.add_lwpolyline([(a + ox, b + oy) for a, b in slot_pts(x, y, *size)], close=True, dxfattribs={"layer": "CUT"})
cm.add_text("PARKFNB V2 BASE DECK MS 6mm (Rev D) - cross = shaft centre", height=8, dxfattribs={"layer": "MARK"}).set_placement((20, 20))
cm.add_line((ox - 10, oy), (ox + 10, oy), dxfattribs={"layer": "MARK"})
cm.add_line((ox, oy - 10), (ox, oy + 10), dxfattribs={"layer": "MARK"})
cut.saveas(os.path.join(HERE, "PARKFNB_V2_BasePlate_cut.dxf"))

sp = ezdxf.new("R2010", setup=True)
sp.units = ezdxf.units.MM
sp.layers.add("CUT", color=1)
sp.layers.add("MARK", color=3)
sm = sp.modelspace()
lab = lambda s, x, y: sm.add_text(s, height=6, dxfattribs={"layer": "MARK"}).set_placement((x, y))
for k in range(2):                                     # cover end plates (5 mm), shaft slot open at the bottom
    dx_ = k * 260 + 140
    prof = [(dx_ + y, z) for y, z in COVER]
    sm.add_lwpolyline(prof, close=True, dxfattribs={"layer": "CUT"})
    sm.add_circle((dx_, ZS), 16, dxfattribs={"layer": "CUT"})
    lab(f"COVER END PLATE {k + 1}  5 mm  (cut shaft slot from bottom to dia 32)", dx_ - 130, -14)
skin = [(math.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(COVER[:-1], COVER[1:])]
yy0 = -60
for k, L in enumerate(skin):
    W = p["cx1"] - p["cx0"]
    sm.add_lwpolyline([(0, yy0), (L, yy0), (L, yy0 - W), (0, yy0 - W)], close=True, dxfattribs={"layer": "CUT"})
    lab(f"COVER SKIN {k + 1}: {L:.0f} x {W:.0f} x 5", L + 8, yy0 - W / 2)
    if abs(L - 126.0) < 1.0:                              # the flat top skin: cut the service-hatch opening
        u0, u1 = COVER[2][0] - HATCH[3], COVER[2][0] - HATCH[2]
        w0, w1 = HATCH[0] - p["cx0"], HATCH[1] - p["cx0"]
        sm.add_lwpolyline([(u0, yy0 - w0), (u1, yy0 - w0), (u1, yy0 - w1), (u0, yy0 - w1)], close=True, dxfattribs={"layer": "CUT"})
        lab("HATCH OPENING 50 x 50 (cut)", u1 + 4, yy0 - (w0 + w1) / 2)
    yy0 -= W + 20
for k in range(2):
    sm.add_lwpolyline([(600, -60 - k * 50), (600 + 140, -60 - k * 50), (740, -90 - k * 50), (600, -90 - k * 50)], close=True,
                      dxfattribs={"layer": "CUT"})
    lab("COVER RIB 8 x 30 (trim to fit)", 750, -78 - k * 50)
sm.add_lwpolyline([(600, -240), (660, -240), (660, -300), (600, -300)], close=True, dxfattribs={"layer": "CUT"})
lab("HATCH PLATE 6 mm 60 x 60 (4 x M5 holes to suit)", 668, -270)
sm.add_lwpolyline([(600, -320), (680, -320), (680, -323), (600, -323)], close=True, dxfattribs={"layer": "CUT"})
lab("HATCH LEDGE ANGLE 20 x 3, 4 pieces, weld under the opening", 688, -321)
bw, bl_ = p["bx1"] - p["bx0"] + 6, p["by1"] - p["by0"] + 6
sm.add_lwpolyline([(900, 0), (900 + bw, 0), (900 + bw, bl_), (900, bl_)], close=True, dxfattribs={"layer": "CUT"})
lab(f"BOX LID 6 mm  {bw:.0f} x {bl_:.0f}  (10 x M6 holes to suit)", 900, bl_ + 8)
for k, (Lw, Hw, nm) in enumerate([(p["by1"] - p["by0"], p["bh"] - p["blid"], "BOX SIDE WALL (x2)"),
                                  (p["bx1"] - p["bx0"], p["bh"] - p["blid"], "BOX END WALL (x2, outer one with RF window)")]):
    yb = -60 - k * (Hw + 40)
    sm.add_lwpolyline([(900, yb), (900 + Lw, yb), (900 + Lw, yb - Hw), (900, yb - Hw)], close=True, dxfattribs={"layer": "CUT"})
    lab(f"{nm} 3 mm {Lw:.0f} x {Hw:.0f}", 900 + Lw + 8, yb - Hw / 2)
yb = -60 - (p["bh"] - p["blid"] + 40)
sm.add_lwpolyline([(900 + p["by1"] - RF_WINDOW[1], yb - RF_WINDOW[2]), (900 + p["by1"] - RF_WINDOW[0], yb - RF_WINDOW[2]),
                   (900 + p["by1"] - RF_WINDOW[0], yb - RF_WINDOW[3]), (900 + p["by1"] - RF_WINDOW[1], yb - RF_WINDOW[3])],
                  close=True, dxfattribs={"layer": "CUT"})
sp.saveas(os.path.join(HERE, "PARKFNB_V2_SteelParts_cut.dxf"))

# ----------------------------------------------------------------------------------------- write
for old in ("PARKFNB_V2_ChainGuard_flat.dxf",):
    if os.path.exists(os.path.join(HERE, old)):
        os.remove(os.path.join(HERE, old))
pdf_path = os.path.join(HERE, "PARKFNB_V2_Drawings.pdf")
with PdfPages(pdf_path) as pdf:
    for i, f in enumerate(sheets, 1):
        pdf.savefig(f)
        f.savefig(os.path.join(HERE, f"preview_sheet{i:02d}.png"), dpi=110)
        plt.close(f)
doc.saveas(os.path.join(HERE, "PARKFNB_V2_Assembly.dxf"))
export_obj(build_model(90), os.path.join(HERE, "PARKFNB_V2_Assembly_3D.obj"))
export_obj(build_model(p["rest_deg"]), os.path.join(HERE, "PARKFNB_V2_Assembly_3D_arch_0deg.obj"))
export_obj(build_model(90, cover=False, lid=False), os.path.join(HERE, "PARKFNB_V2_Assembly_3D_INTERNALS_covers_hidden.obj"))
for stale in ("PARKFNB_V2_Assembly_3D_covers_off.obj", "PARKFNB_V2_Assembly_3D_covers_off.mtl"):
    if os.path.exists(os.path.join(HERE, stale)):
        os.remove(os.path.join(HERE, stale))
# render: drive cover translucent, so the motor is visibly INSIDE the cover
figm = plt.figure(figsize=(11, 7))
axm = figm.add_axes([0, 0, 1, 1])
axm.set_xlim(0, 220)
axm.set_ylim(0, 140)
axm.set_aspect("equal")
axm.axis("off")
render_iso(axm, build_model(90, cover_alpha=0.30, lid_alpha=0.30), 110, 62, 0.19, cam=(0.9, -1.3, 0.8))
axm.text(110, 6, "Rev E: drive cover and box lid drawn 70 % transparent - motor, chain, sprocket, bearings are INSIDE",
         fontsize=8, ha="center", color="#333")
figm.savefig(os.path.join(HERE, "PARKFNB_V2_render_motor_under_cover.png"), dpi=120)
plt.close(figm)
with open(os.path.join(HERE, "REQUIREMENTS.md"), "w", encoding="utf8") as fh:
    fh.write("# PARKFNB V2 - requirements and compliance (Rev E)\n\nGenerated by generate_cad.py from the table on sheets 2-3.\n\n"
             "| # | Requirement | Target | Source | Status | How / where / still open |\n|---|---|---|---|---|---|\n")
    for r in REQS:
        fh.write("| " + " | ".join(str(c).replace("|", "/") for c in r) + " |\n")
    fh.write("\nStatus: MET = designed in, MET* = designed in but needs a check (see last column), FIXED Rev E = added in this revision, "
             "DEVIATION = accepted deviation, TO VERIFY = open.\n")
print(f"wheel {F_WHEEL / 1000:.2f} kN; SF deck {CHK['deck'][1]:.1f} cover {CHK['cover_top'][1]:.1f} rib {CHK['cover_rib'][1]:.1f} "
      f"lid {CHK['lid'][1]:.1f} lidrib {CHK['lid_rib'][1]:.1f}; heights deck {H_DECK:.0f} box {H_BOX:.0f} cover {H_COVER:.0f} "
      f"arch flat ~{H_ARCH_FLAT:.0f}; holes {len(HOLES)}")
print("wrote", pdf_path)
