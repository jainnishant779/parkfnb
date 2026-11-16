"""Route the board, run the checks, draw a preview.  python route_test.py"""
import math
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from design import *          # noqa
from placement import PLACEMENT, ANTENNA_KEEPOUT
from router import Router
from check import run_checks


def net_order(parts):
    nets = {}
    for pt in parts:
        for pd in pt.pads:
            if pd.net and pd.net != "GND":
                nets.setdefault(pd.net, []).append(pd)
    wide = [n for n in nets if NET_W.get(n, DEFAULT_W) > 0.35]

    def span(n):
        xs = [p.x for p in nets[n]]
        ys = [p.y for p in nets[n]]
        return (max(xs) - min(xs)) + (max(ys) - min(ys))

    rest = sorted([n for n in nets if n not in wide], key=span)
    return sorted(wide, key=span) + rest


def route(parts):
    r = Router(parts, ANTENNA_KEEPOUT)
    t = time.time()
    r.route_all(net_order(parts))
    return r, time.time() - t


def draw(parts, r, plane, path):
    fig, axs = plt.subplots(1, 2, figsize=(22, 9))
    for ax, lay in zip(axs, "FB"):
        ax.add_patch(Rectangle((0, 0), BOARD_W, BOARD_H, fc="#1d4d2a" if lay == "F" else "#12351d", ec="w"))
        if lay == "B" and plane is not None:
            for pg in (plane.geoms if plane.geom_type == "MultiPolygon" else [plane]):
                ax.add_patch(Polygon(list(pg.exterior.coords), fc="#2f8a4a", ec="none", alpha=0.7))
                for h in pg.interiors:
                    ax.add_patch(Polygon(list(h.coords), fc="#12351d", ec="none"))
        col = "#e03030" if lay == "F" else "#3070e0"
        for (net, l, x0, y0, x1, y1, w) in r.tracks:
            if l == lay:
                ax.plot([x0, x1], [y0, y1], color=col, lw=w * 3.2, solid_capstyle="round")
        for (net, x, y) in r.vias:
            ax.add_patch(Circle((x, y), VIA_D / 2, fc="#c0c0c0", ec="none"))
        for pt in parts:
            for pd in pt.pads:
                if pd.shape == "r":
                    ax.add_patch(Rectangle((pd.x - pd.size / 2, pd.y - pd.size / 2), pd.size, pd.size, fc="#d4a017", ec="none"))
                else:
                    ax.add_patch(Circle((pd.x, pd.y), pd.size / 2, fc="#d4a017", ec="none"))
                ax.add_patch(Circle((pd.x, pd.y), pd.drill / 2, fc="#111", ec="none"))
            if lay == "F":
                ax.text((pt.bbox[0] + pt.bbox[2]) / 2, (pt.bbox[1] + pt.bbox[3]) / 2, pt.ref, fontsize=4.5, color="w", ha="center", va="center")
        x0, y0, x1, y1 = ANTENNA_KEEPOUT
        ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc="none", ec="#6cf", ls="--"))
        ax.set_xlim(-2, 102)
        ax.set_ylim(-2, 84)
        ax.set_aspect("equal")
        ax.set_title("TOP (F.Cu)" if lay == "F" else "BOTTOM (B.Cu + GND plane)")
    fig.savefig(path, dpi=100)
    plt.close(fig)


if __name__ == "__main__":
    parts = build_parts(PLACEMENT)
    r, dt = route(parts)
    print(f"routed in {dt:.0f}s: {len(r.tracks)} tracks, {len(r.vias)} vias, failed nets: {sorted(set(r.failed))}")
    problems, plane = run_checks(parts, r, ANTENNA_KEEPOUT)
    for p in problems[:40]:
        print(" ", p)
    draw(parts, r, plane, os.path.join(HERE, "preview_routed.png"))
