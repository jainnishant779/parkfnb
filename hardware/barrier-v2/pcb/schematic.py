"""Netlist-driven schematic pages (net-flag style): every part is drawn with its real pin nets, so the drawing
cannot disagree with the PCB."""
import math

from matplotlib.patches import Circle, Rectangle, Polygon

from design import ESP_NAMES_L, ESP_NAMES_R

INK = "#111111"
NETC = "#1f4f9f"


def flag(ax, x, y, net, side):
    if not net:
        ax.text(x + (-1.2 if side == "L" else 1.2), y, "NC", fontsize=4.6, ha="right" if side == "L" else "left", va="center", color="#999")
        return
    col = "#a02020" if net == "GND" else NETC
    ax.text(x + (-1.2 if side == "L" else 1.2), y, net, fontsize=5.4, ha="right" if side == "L" else "left", va="center",
            color=col, weight="bold")


def lead(ax, x0, x1, y):
    ax.plot([x0, x1], [y, y], color=INK, lw=0.5, solid_capstyle="butt")


def two_pin(ax, pt, x, y):
    """Symbol in the middle of a 2-pin cell.  Pin x positions: x (left) .. x+20 (right).  Returns height used."""
    kind = pt.fp
    n1 = pt.pins.get("1", "")
    n2 = pt.pins.get("2", "")
    xl, xr, xm = x, x + 20, x + 10
    swap = kind in ("D41", "DO15", "D35", "LED3")        # diodes: anode left (pin 2), cathode right (pin 1)
    left, right = (n2, n1) if swap else (n1, n2)
    lead(ax, xl, xm - 4, y)
    lead(ax, xm + 4, xr, y)
    if kind in ("R",):
        ax.add_patch(Rectangle((xm - 4, y - 1.3), 8, 2.6, fc="white", ec=INK, lw=0.5))
    elif kind == "PTC":
        ax.add_patch(Rectangle((xm - 4, y - 1.3), 8, 2.6, fc="white", ec=INK, lw=0.5))
        ax.plot([xm - 3, xm + 3], [y - 2.2, y + 2.2], color=INK, lw=0.5)
    elif kind in ("C100N",):
        lead(ax, xm - 4, xm - 0.6, y)
        lead(ax, xm + 0.6, xm + 4, y)
        ax.plot([xm - 0.6, xm - 0.6], [y - 2.2, y + 2.2], color=INK, lw=0.7)
        ax.plot([xm + 0.6, xm + 0.6], [y - 2.2, y + 2.2], color=INK, lw=0.7)
    elif kind in ("C470", "C220"):
        ax.plot([xm - 0.6, xm - 0.6], [y - 2.2, y + 2.2], color=INK, lw=0.7)
        ax.add_patch(Rectangle((xm + 0.6, y - 2.2), 2.4, 4.4, fc="white", ec=INK, lw=0.6))
        lead(ax, xm - 4, xm - 0.6, y)
        lead(ax, xm + 3, xm + 4, y)
        ax.text(xm - 2.4, y + 3.0, "+", fontsize=6, ha="center", va="center")
    elif kind in ("D41", "DO15", "D35", "LED3"):
        tri = Polygon([(xm - 2.5, y - 2.2), (xm - 2.5, y + 2.2), (xm + 2.0, y)], closed=True, fc="white", ec=INK, lw=0.6)
        ax.add_patch(tri)
        ax.plot([xm + 2.0, xm + 2.0], [y - 2.4, y + 2.4], color=INK, lw=0.8)
        if kind == "DO15":
            ax.plot([xm + 2.0, xm + 3.0], [y + 2.4, y + 3.2], color=INK, lw=0.6)
            ax.plot([xm + 2.0, xm + 1.0], [y - 2.4, y - 3.2], color=INK, lw=0.6)
        if kind == "LED3":
            for dx in (-1.2, 0.4):
                ax.annotate("", xy=(xm + dx + 3, y + 5), xytext=(xm + dx, y + 2.5), arrowprops=dict(arrowstyle="-|>", lw=0.4, color=INK, mutation_scale=3))
    elif kind == "BUZZER":
        ax.add_patch(Circle((xm, y), 3, fc="white", ec=INK, lw=0.6))
        ax.text(xm, y, "BZ", fontsize=4.5, ha="center", va="center")
    elif kind == "TP":
        ax.add_patch(Circle((xm, y), 1.4, fc="white", ec=INK, lw=0.6))
    flag(ax, xl, y, left, "L")
    if kind != "TP":
        flag(ax, xr, y, right, "R")
    ax.text(xm, y + 4.6, f"{pt.ref}  {pt.value.split(' (')[0]}", fontsize=5.4, ha="center", va="center", weight="bold")
    return 9.0


def box_part(ax, pt, x, y, names=None, width=46, split=None, title=None):
    """Connector / IC.  y is the top.  Pins listed vertically; pins after `split` go on the right side."""
    pads = sorted(pt.pads, key=lambda q: int(q.num))
    n = len(pads)
    split = n if split is None else split
    left = pads[:split]
    right = pads[split:]
    rows = max(len(left), len(right))
    h = rows * 4.0 + 6.0
    ax.add_patch(Rectangle((x, y - h), width, h, fc="#f7f7f2", ec=INK, lw=0.7))
    ax.text(x + width / 2, y - 3.0, title or f"{pt.ref}  {pt.value}", fontsize=5.6, ha="center", va="center", weight="bold")
    for k, pd in enumerate(left):
        yy = y - 6.0 - k * 4.0
        lead(ax, x - 6, x, yy)
        nm = names[pads.index(pd)] if names else ""
        ax.text(x + 1.2, yy, f"{pd.num} {nm}", fontsize=4.8, ha="left", va="center")
        flag(ax, x - 6, yy, pd.net, "L")
    for k, pd in enumerate(right):
        yy = y - 6.0 - k * 4.0
        lead(ax, x + width, x + width + 6, yy)
        nm = names[pads.index(pd)] if names else ""
        ax.text(x + width - 1.2, yy, f"{nm} {pd.num}", fontsize=4.8, ha="right", va="center")
        flag(ax, x + width + 6, yy, pd.net, "R")
    return h


def three_pin_q(ax, pt, x, y):
    ax.add_patch(Rectangle((x + 8, y - 8), 18, 16, fc="#f7f7f2", ec=INK, lw=0.7))
    ax.text(x + 17, y + 4.5, f"{pt.ref}  {pt.value}", fontsize=5.4, ha="center", weight="bold")
    for k, (nm, pd) in enumerate(zip(["C", "B", "E"], pt.pads)):
        yy = y + 4 - k * 6
        lead(ax, x + 2, x + 8, yy)
        ax.text(x + 9.2, yy, f"{pd.num} {nm}", fontsize=4.8, va="center")
        flag(ax, x + 2, yy, pd.net, "L")
    return 18.0


def draw_groups(ax, parts, groups, x0, y0, col_w, rows_limit):
    """groups: list of (title, [refs], column index).  Simple top-down stacking per column."""
    P = {p.ref: p for p in parts}
    ycur = {}
    for title, refs, col in groups:
        x = x0 + col * col_w
        y = ycur.get(col, y0)
        ax.text(x, y, title, fontsize=6.6, weight="bold", color="#1f3f6f", va="top")
        ax.plot([x, x + col_w - 12], [y - 4.0, y - 4.0], color="#1f3f6f", lw=0.5)
        y -= 10
        for ref in refs:
            pt = P[ref]
            if pt.fp in ("R", "C100N", "C470", "C220", "D41", "DO15", "D35", "LED3", "PTC", "TP", "BUZZER"):
                y -= 6
                y -= two_pin(ax, pt, x + 24, y) - 3
            elif pt.fp == "TO92":
                y -= 14
                y -= three_pin_q(ax, pt, x + 20, y - 0)
            elif pt.fp == "DIP14":
                nm = ["/OE1", "1A", "1Y", "/OE2", "2A", "2Y", "GND", "3Y", "3A", "/OE3", "4Y", "4A", "/OE4", "VCC"]
                y -= box_part(ax, pt, x + 24, y, nm, 40, 7, "U2  74AHCT125N  (5 V)") + 5
            elif pt.fp == "ESP32":
                nm = [f"{a}" for a in ESP_NAMES_L] + [f"{b}" for b in ESP_NAMES_R]
                y -= box_part(ax, pt, x + 24, y, nm, 40, 15, "ESP1  ESP32 DevKit V1 (30-pin, USB at bottom)") + 5
            else:                                   # headers / screw terminals
                names = {"J1": ["BAT+", "GND"], "J2": ["RPWM", "LPWM", "R_EN", "L_EN", "R_IS", "L_IS", "VCC", "GND"],
                         "J3": ["VIN", "GND"], "J9": ["5V", "GND"], "J4": ["+5V", "GND", "OUT"], "J5": ["+5V", "GND", "OUT"], "J10": ["+5V", "GND", "OUT"],
                         "J6": ["+5V", "GND", "SDA", "SCL"], "J7": ["LED G", "LED R", "GND"], "J8": ["SW", "GND"]}.get(ref)
                y -= box_part(ax, pt, x + 24, y, names, 30) + 5
            y -= 3
        ycur[col] = y - 8
