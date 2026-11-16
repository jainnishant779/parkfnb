"""
Is this set of bays usable?  Used before a layout is saved, so a mis-drawn bay is refused with a clear
reason instead of silently producing wrong occupancy later.

`validate_bays` returns (errors, warnings).  Errors mean the layout must not be saved; warnings are
shown to the operator but do not block (a bay cut off by the edge of the picture is normal).
"""
from __future__ import annotations

import math
import re
from typing import Optional

from shapely.geometry import Polygon, box
from shapely.validation import explain_validity

MAX_BAYS = 200
MAX_ID_LEN = 32
MIN_POINTS = 3
MIN_AREA_PX = 25.0                 # absolute floor, whatever the picture size
MIN_AREA_FRAC = 0.0005             # of the picture, when its size is known
OUTSIDE_WARN_FRAC = 0.02           # a corner this far outside the picture (of its width/height) is odd
OVERLAP_WARN = 0.30                # share of the smaller bay covered by a neighbour


def _points(raw) -> Optional[list[tuple[float, float]]]:
    """[[x, y], ...] as floats, or None when it is not that."""
    if not isinstance(raw, (list, tuple)):
        return None
    pts = []
    for p in raw:
        if not isinstance(p, (list, tuple)) or len(p) != 2:
            return None
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError):
            return None
        if not (math.isfinite(x) and math.isfinite(y)):
            return None
        pts.append((x, y))
    return pts


def validate_bays(bays, image_size: Optional[tuple[float, float]] = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(bays, dict) or not bays:
        return ["no bays supplied"], warnings
    if len(bays) > MAX_BAYS:
        return [f"too many bays ({len(bays)}, the most allowed is {MAX_BAYS})"], warnings

    w = h = 0.0
    frame = None
    if image_size and image_size[0] and image_size[1]:
        w, h = float(image_size[0]), float(image_size[1])
        frame = box(0, 0, w, h)

    polys: dict[str, Polygon] = {}
    for bid, raw in bays.items():
        name = str(bid)
        if not name.strip() or len(name) > MAX_ID_LEN:
            errors.append(f"bay id '{name[:20]}' must be 1-{MAX_ID_LEN} characters")
            continue
        # a bay's name ends up in file names and web addresses (the car photos, the register ids): letters, digits, - and _ only.
        # "A/1" and "../x" passed before and then could not be opened (404) or wrote outside their folder.
        if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            errors.append(f"bay id '{name[:20]}' may only use letters, digits, - and _")
            continue
        pts = _points(raw)
        if pts is None:
            errors.append(f"bay {name}: corners must be [x, y] numbers")
            continue
        if len(pts) < MIN_POINTS:
            errors.append(f"bay {name}: needs at least {MIN_POINTS} corners (has {len(pts)})")
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            why = explain_validity(poly).lower()
            if "too few points" in why:                       # every corner is the same place
                errors.append(f"bay {name}: too small (its corners are all in the same place)")
            else:
                errors.append(f"bay {name}: the outline crosses itself")
            continue
        min_area = max(MIN_AREA_PX, MIN_AREA_FRAC * w * h)
        if poly.area < min_area:
            errors.append(f"bay {name}: too small ({poly.area:.0f} px², at least {min_area:.0f})")
            continue
        if frame is not None:
            if not poly.intersects(frame) or poly.intersection(frame).area < 0.5 * min_area:
                errors.append(f"bay {name}: it is outside the picture")
                continue
            minx, miny, maxx, maxy = poly.bounds
            far = max(-minx, maxx - w) / w, max(-miny, maxy - h) / h
            if max(far) > OUTSIDE_WARN_FRAC:
                warnings.append(f"bay {name}: a corner is {max(far) * 100:.0f}% outside the picture")
        polys[name] = poly

    names = list(polys)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = polys[names[i]], polys[names[j]]
            if not a.intersects(b):
                continue
            share = a.intersection(b).area / min(a.area, b.area)
            if share > OVERLAP_WARN:
                warnings.append(f"bays {names[i]} and {names[j]} overlap by {share * 100:.0f}%")
    return errors, warnings
