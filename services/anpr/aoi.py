"""
The area of interest: the part of the picture that is the parking lot.

Everything the cameras need to look at closely (the cars, and later their plates) is inside the bays and a margin
around them; the rest of the picture is buildings, sky and road.  Working on that part alone (cut from a full-resolution
photo, not scaled down with the rest) gives the detector many more pixels per car for the same cost.

The box is worked out from the saved bays (so it follows them when they are re-marked) unless an operator has set one.
Boxes are {"x0", "y0", "x1", "y1"} in the pixels of the layout's picture size.
"""
from __future__ import annotations

from typing import Optional

PLATE_CHAR_HEIGHT_SHARE = 0.55         # an Indian plate (500 x 120 mm) has letters about 65 mm high: 0.55 of its height
READABLE_CHAR_PX, MARGINAL_CHAR_PX = 20.0, 14.0


def bays_aoi(bays: dict, frame_size, margin: float = 0.25) -> Optional[dict]:
    """The box around every bay, grown by `margin` of its own size each way and kept inside the picture."""
    xs, ys = [], []
    for pts in (bays or {}).values():
        for p in pts or []:
            try:
                xs.append(float(p[0]))
                ys.append(float(p[1]))
            except (TypeError, ValueError, IndexError):
                continue
    if len(xs) < 3:
        return None
    w, h = float(frame_size[0]), float(frame_size[1])
    bw, bh = max(xs) - min(xs), max(ys) - min(ys)
    x0, x1 = max(0.0, min(xs) - margin * bw), min(w, max(xs) + margin * bw)
    y0, y1 = max(0.0, min(ys) - margin * bh), min(h, max(ys) + margin * bh)
    if x1 - x0 < 16 or y1 - y0 < 16:
        return None
    return {"x0": int(x0), "y0": int(y0), "x1": int(x1), "y1": int(y1)}


def valid_aoi(box, frame_size) -> Optional[dict]:
    """A box an operator sent, checked: inside the picture, at least 5 % of it each way.  None if it is not usable."""
    try:
        x0, y0, x1, y1 = (int(round(float(box[k]))) for k in ("x0", "y0", "x1", "y1"))
    except (TypeError, ValueError, KeyError):
        return None
    w, h = int(frame_size[0]), int(frame_size[1])
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
        return None
    if (x1 - x0) < 0.05 * w or (y1 - y0) < 0.05 * h:
        return None
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def scale_aoi(box: dict, from_size, to_size) -> dict:
    """The same area in the pixels of a picture of another size (a full-resolution photo of the same view)."""
    sx, sy = to_size[0] / float(from_size[0]), to_size[1] / float(from_size[1])
    return {"x0": int(box["x0"] * sx), "y0": int(box["y0"] * sy), "x1": int(round(box["x1"] * sx)), "y1": int(round(box["y1"] * sy))}


def live_to_still(box, live_size, still_size) -> list[float]:
    """
    A box in the live frame, in the pixels of the full-resolution photo.  The phone's video is a centred crop of its
    photo (measured on 27 Oct by matching 1400 features: the 1280 x 720 frame is the middle of the 3840 x 2880 photo,
    scale 3.000 on both axes, 361 px down, 0.9 px of error), not the whole photo squeezed, so the scale is the same on both
    axes and the extra rows lie above and below.  scale_aoi() above would stretch y by 4 instead of 3 here.
    """
    lw, lh = float(live_size[0]), float(live_size[1])
    sw, sh = float(still_size[0]), float(still_size[1])
    k = min(sw / lw, sh / lh)
    ox, oy = (sw - lw * k) / 2.0, (sh - lh * k) / 2.0
    x1, y1, x2, y2 = (float(v) for v in box[:4])
    return [x1 * k + ox, y1 * k + oy, x2 * k + ox, y2 * k + oy]


def live_points_to_still(points, live_size, still_size):
    """Points ([[x, y], ...]) of the live frame, in the pixels of the full-resolution photo (same mapping as live_to_still)."""
    lw, lh = float(live_size[0]), float(live_size[1])
    sw, sh = float(still_size[0]), float(still_size[1])
    k = min(sw / lw, sh / lh)
    ox, oy = (sw - lw * k) / 2.0, (sh - lh * k) / 2.0
    return [[float(x) * k + ox, float(y) * k + oy] for x, y in points]


def plate_readability(width_px: float, height_px: float) -> dict:
    """How readable a plate of this size is: the height of its letters, and a verdict from it.
    About 20 px of letter height is what a plate reader needs; 14 to 20 is borderline; less is too small."""
    chars = float(height_px) * PLATE_CHAR_HEIGHT_SHARE
    verdict = "readable" if chars >= READABLE_CHAR_PX else "marginal" if chars >= MARGINAL_CHAR_PX else "too_small"
    return {"width_px": int(round(width_px)), "height_px": int(round(height_px)), "char_px": round(chars, 1), "verdict": verdict}
