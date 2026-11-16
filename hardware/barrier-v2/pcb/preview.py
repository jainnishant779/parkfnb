"""Quick placement preview + pad-to-pad clearance check before routing."""
import itertools
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from design import *          # noqa
from placement import PLACEMENT, ANTENNA_KEEPOUT


def draw_parts(ax, parts, labels=True):
    for pt in parts:
        for it in pt.silk:
            if it[0] == "line":
                xs, ys = zip(*(it[1] + ([it[1][0]] if it[2] else [])))
                ax.plot(xs, ys, color="#777", lw=0.5)
            else:
                ax.add_patch(Circle((it[1], it[2]), it[3], fc="none", ec="#777", lw=0.5))
        for pd in pt.pads:
            if pd.shape == "r":
                ax.add_patch(Rectangle((pd.x - pd.size / 2, pd.y - pd.size / 2), pd.size, pd.size, fc="#d4a017", ec="none"))
            else:
                ax.add_patch(Circle((pd.x, pd.y), pd.size / 2, fc="#d4a017", ec="none"))
            ax.add_patch(Circle((pd.x, pd.y), pd.drill / 2, fc="white", ec="none"))
        if labels:
            ax.text((pt.bbox[0] + pt.bbox[2]) / 2, (pt.bbox[1] + pt.bbox[3]) / 2, pt.ref, fontsize=5, ha="center", va="center", color="#c00")


def pad_clearance_report(parts, clr=CLEARANCE):
    pads = [pd for pt in parts for pd in pt.pads]
    bad = []
    for a, b in itertools.combinations(pads, 2):
        if a.ref == b.ref and a.net == b.net:
            continue
        if a.net and a.net == b.net:
            continue
        d = math.hypot(a.x - b.x, a.y - b.y) - a.size / 2 - b.size / 2
        if d < clr:
            bad.append((a.ref, a.num, b.ref, b.num, round(d, 2)))
    return bad


if __name__ == "__main__":
    parts = build_parts(PLACEMENT)
    fig, ax = plt.subplots(figsize=(12, 9.6))
    ax.add_patch(Rectangle((0, 0), BOARD_W, BOARD_H, fc="#2f8a4a", alpha=0.15, ec="k"))
    x0, y0, x1, y1 = ANTENNA_KEEPOUT
    ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc="none", ec="blue", ls="--"))
    draw_parts(ax, parts)
    ax.set_xlim(-12, 112)
    ax.set_ylim(-6, 92)
    ax.set_aspect("equal")
    fig.savefig(os.path.join(HERE, "preview_placement.png"), dpi=110)
    print("pads:", sum(len(p.pads) for p in parts))
    for b in pad_clearance_report(parts):
        print("PAD CLEARANCE", b)
