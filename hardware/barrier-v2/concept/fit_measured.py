"""One-box fit check with the numbers READ FROM THE V1 TAPE PHOTOS (2026-10-27), see MEASUREMENTS.md.

Box = largest plan outline whose top corner stays SWEEP_MARGIN inside the swinging tyre.  Two tyre cases, because the
photos disagree with the earlier sketch on the tyre opening:  RI = 101.5 (sketch, 8 in)  and  RI = 80 (photos 21/34).
Motor: body runs from the chain plane toward the RIGHT bearing (photo 20), so it is checked at +x.
"""
import math

import numpy as np
from shapely.geometry import Point, Polygon, box as sbox

ZS = 36.5                      # shaft axis above the board (UCP205 centre height, photo 31 shows dome top 7.1 cm)
LEG = 51.0                     # straight leg (sketch)
SWEEP_MARGIN, WALL = 8.0, 4.0
BRG_HALF_W, BRG_HALF_L = 19.0, 70.0        # UCP205 foot: 38 along the shaft, 140 across
SPK_OD = 70.0                  # chain wrap round the shaft measured 34 mm radius in photo 23 (earlier guess: 93)
MOTOR = dict(gb_dia=38.0, gb_len=33.0, can_dia=30.0, can_len=35.0, pin=16.0, sleeve=15.0)   # photo 24 (+-3 mm)
C_DIST = 98.0                  # shaft axis to motor axis (photo 23: ~97-100 mm)


def tyre_inner_limit(x, ri, top):
    if abs(x) >= ri:
        return 0.0
    d = LEG + math.sqrt(ri ** 2 - x ** 2) - SWEEP_MARGIN
    return math.sqrt(max(d * d - (top - ZS) ** 2, 0.0))


def box_outline(ri, top, minlen=30.0):
    xs = [x for x in np.linspace(0, ri, 800) if tyre_inner_limit(x, ri, top) >= minlen]
    xw = max(xs)
    g = np.linspace(-xw, xw, 240)
    return Polygon([(x, tyre_inner_limit(x, ri, top)) for x in g[::-1]] + [(x, -tyre_inner_limit(x, ri, top)) for x in g]), xw


def check(ri, bearing_xc, top, xs_list=range(-70, 71, 5), label=""):
    poly, xw = box_outline(ri, top)
    inner = poly.buffer(-WALL)
    brg_ok = [inner.contains(sbox(s * bearing_xc - BRG_HALF_W, -BRG_HALF_L, s * bearing_xc + BRG_HALF_W, BRG_HALF_L)) for s in (-1, 1)]
    best = None
    for xs in xs_list:
        # motor in plan: sleeve left of the chain plane, gearbox + can + pin to the right (toward +x), axis at y = -C
        x0 = xs - MOTOR["sleeve"]
        x1 = xs + 6 + MOTOR["gb_len"] + MOTOR["can_len"] + MOTOR["pin"]
        m = sbox(x0, -C_DIST - MOTOR["gb_dia"] / 2, x1, -C_DIST + MOTOR["gb_dia"] / 2)
        marg = min((1 if inner.contains(Point(c)) else -1) * inner.exterior.distance(Point(c)) for c in m.exterior.coords)
        clash = max(m.intersection(sbox(s * bearing_xc - BRG_HALF_W, -BRG_HALF_L, s * bearing_xc + BRG_HALF_W, BRG_HALF_L)).area
                    for s in (-1, 1))
        gap_r = (bearing_xc - BRG_HALF_W) - (xs + 3.0 + 3.0)      # chain plane + half chain width to the near bearing
        if best is None or marg > best[0]:
            best = (marg, xs, clash, gap_r)
    print(f"{label:<46} box half-width {xw:5.1f}  bearings inside: {brg_ok}  best motor margin {best[0]:6.1f} mm "
          f"(chain plane x={best[1]:+d}, motor/bearing overlap {best[2]:.0f} mm2, sprocket-bearing gap {best[3]:.0f} mm)")


if __name__ == "__main__":
    print(f"box top = shaft axis {ZS} + sprocket radius {SPK_OD / 2:.0f} + plate/gap 8 -> {ZS + SPK_OD / 2 + 8:.1f} above the board\n")
    top = ZS + SPK_OD / 2 + 8
    for ri in (101.5, 90.0, 80.0):
        for xb in (70.0,):
            check(ri, xb, top, label=f"tyre RI {ri:5.1f}, bearings +/-{xb:.0f}")
    print("\nsame, if the big sprocket really is 93 OD (my earlier guess):")
    check(101.5, 70.0, ZS + 93 / 2 + 8, label="tyre RI 101.5, bearings +/-70, OD 93")

