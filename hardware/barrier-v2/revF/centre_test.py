"""Can everything live in the CENTRE of the box (|y| <= ZONE, between the bearings' ends), floor level or above the shaft?

Imports generate_revF (runs its checks first), then tries to place battery, PCB, IBT-2, BMS, buck module and fuse holder
only inside the central zone, trying the floor (under the shaft) and the level above the shaft.  python centre_test.py [zone]
"""
import sys

from shapely.geometry import box as sbox
from shapely.ops import unary_union

import generate_revF as G

ZONE = float(sys.argv[1]) if len(sys.argv) > 1 else 75.0
p = G.p
inner = unary_union([G.main, G.ear]).buffer(-p["wall"]).intersection(sbox(-500, -ZONE, 500, ZONE))
fixed = [c for c in G.components(G.XS, G.main, G.ear) if c[7] == "fixed"]
CEIL = p["top_hi"] - p["skin"]
SHAFT_BOTTOM, SHAFT_TOP = G.ZS - 12.5, G.ZS + 12.5

# (name, sizes, height, slot options as (z0))   floor slot starts at 1 (feet), upper slot starts above the shaft + 3
ITEMS = [("battery holder 80x76x21", [(80, 76), (76, 80)], 21, (1.0, SHAFT_TOP + 3)),
         ("PCB 100x80 + ESP32 (16 high)", [(100, 80), (80, 100)], 16, (SHAFT_TOP + 3, 1.0)),
         ("IBT-2 50x50x22", [(50, 50)], 22, (1.0, SHAFT_TOP + 3)),
         ("BMS 60x25x6", [(60, 25), (25, 60)], 6, (1.0, SHAFT_TOP + 3)),
         ("buck LM2596 43x21x14", [(43, 21), (21, 43)], 14, (1.0, SHAFT_TOP + 3)),
         ("fuse holder 30x15x15", [(30, 15), (15, 30)], 15, (1.0, SHAFT_TOP + 3))]
placed = list(fixed)
print(f"central zone |y| <= {ZONE:.0f}: usable plan area {inner.area:.0f} mm2, box ceiling {CEIL:.0f}, shaft z {SHAFT_BOTTOM:.1f}..{SHAFT_TOP:.1f}")
for nm, sizes, h, slots in ITEMS:
    done = None
    for z0 in slots:
        z1 = z0 + h
        if z1 > CEIL:
            continue
        r = G._find_place(placed, inner, sizes, z0, z1, (0, 0), step=2.0)
        if r is not None:
            _, x, y, dx, dy = r
            placed.append((nm, x, x + dx, y, y + dy, z0, z1, "proposed"))
            done = (x, y, dx, dy, z0, z1, "floor/under shaft" if z0 < SHAFT_BOTTOM else "above shaft")
            break
    if done:
        x, y, dx, dy, z0, z1, lvl = done
        print(f"  FITS    {nm:<32} x {x:6.1f}..{x + dx:6.1f}  y {y:6.1f}..{y + dy:6.1f}  z {z0:4.1f}..{z1:4.1f}  ({lvl})")
    else:
        print(f"  NO ROOM {nm:<32} (needs {sizes[0][0]}x{sizes[0][1]}x{h})")
