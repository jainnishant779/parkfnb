"""Render the written Gerber files (via gerbonara's SVG output) with matplotlib - shows exactly what a fab would see.

Each Gerber layer is rendered on its own (dark = copper/ink, clear-polarity objects erase), converted to an RGBA
image and then composited, so clear regions in one layer never erase another layer."""
import io
import re
import warnings

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb
from matplotlib.patches import Circle, PathPatch, Rectangle
from matplotlib.path import Path
from shapely.geometry import Polygon

warnings.filterwarnings("ignore")


def _draw(ax, gbr_path):
    from gerbonara import GerberFile
    svg = str(GerberFile.open(gbr_path).to_svg(fg="#000000", bg="#ffffff"))
    for m in re.finditer(r"<(path|circle|rect)\b([^>]*)/>", svg):
        tag, attrs = m.group(1), m.group(2)
        kv = dict(re.findall(r'([\w-]+)="([^"]*)"', attrs))
        fill = kv.get("fill", "").lower()
        col = "#ffffff" if fill == "#ffffff" else "#000000"
        if tag == "path":
            if fill in ("none", "") and "stroke" in kv:
                pts = re.findall(r"(-?\d+\.?\d*) (-?\d+\.?\d*)", kv["d"])
                ax.plot([float(a) for a, b in pts], [float(b) for a, b in pts], color=col,
                        lw=float(kv.get("stroke-width", 0.1)) * 2.8, solid_capstyle="round")
                continue
            d = kv["d"].replace("M", " M ").replace("L", " L ").split()
            subs, cur, i = [], [], 0
            while i < len(d):
                if d[i] == "M":
                    if len(cur) >= 3:
                        subs.append(cur)
                    cur = [(float(d[i + 1]), float(d[i + 2]))]
                    i += 3
                elif d[i] == "L":
                    cur.append((float(d[i + 1]), float(d[i + 2])))
                    i += 3
                else:
                    i += 1
            if len(cur) >= 3:
                subs.append(cur)
            g = None
            for sp in subs:                      # SVG even-odd fill
                pg = Polygon(sp).buffer(0)
                g = pg if g is None else g.symmetric_difference(pg)
            if g is None:
                continue
            for pg in (g.geoms if hasattr(g, "geoms") else [g]):
                if pg.geom_type != "Polygon" or pg.is_empty:
                    continue
                rings = [list(pg.exterior.coords)] + [list(h.coords) for h in pg.interiors]
                verts, codes = [], []
                for r in rings:
                    verts += r
                    codes += [Path.MOVETO] + [Path.LINETO] * (len(r) - 2) + [Path.CLOSEPOLY]
                ax.add_patch(PathPatch(Path(verts, codes), fc=col, ec="none"))
        elif tag == "circle":
            ax.add_patch(Circle((float(kv["cx"]), float(kv["cy"])), float(kv["r"]), fc=col, ec="none"))
        elif tag == "rect":
            if fill == "#ffffff" and float(kv.get("width", 0)) > 50:
                continue                         # page background
            ax.add_patch(Rectangle((float(kv["x"]), float(kv["y"])), float(kv["width"]), float(kv["height"]), fc=col, ec="none"))


def layer_rgba(gbr_path, xlim=(-2, 102), ylim=(-2, 82), px_per_mm=12):
    w, h = (xlim[1] - xlim[0]) * px_per_mm, (ylim[1] - ylim[0]) * px_per_mm
    fig = plt.figure(figsize=(w / 100, h / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.axis("off")
    fig.patch.set_facecolor("white")
    _draw(ax, gbr_path)
    fig.canvas.draw()
    arr = np.asarray(fig.canvas.buffer_rgba())[..., :3].astype(float)
    plt.close(fig)
    return 1.0 - arr.mean(axis=2) / 255.0          # 1 where drawn


def composite(ax, layers, xlim=(-2, 102), ylim=(-2, 82), px_per_mm=12):
    """layers: [(gbr_path, colour, opacity)]  drawn bottom to top."""
    for (path, colour, opacity) in layers:
        a = layer_rgba(path, xlim, ylim, px_per_mm) * opacity
        rgba = np.zeros(a.shape + (4,))
        rgba[..., :3] = to_rgb(colour)
        rgba[..., 3] = a
        ax.imshow(rgba, extent=(xlim[0], xlim[1], ylim[0], ylim[1]), origin="upper", interpolation="bilinear")
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal")
