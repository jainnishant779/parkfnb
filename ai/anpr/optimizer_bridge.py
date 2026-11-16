"""
Space Optimizer layout -> bays on a camera frame.

The optimizer places stalls on a satellite map (lat/lng).  To watch them with a camera we need
the same stalls in the camera's pixels.  Both pictures show the same flat ground, so four points
that appear in both are enough to map one onto the other (a homography):

    1. the optimizer's site outline gives four ground corners, in metres;
    2. the operator clicks those same four corners on the camera frame, in the same order;
    3. every stall is carried across with that mapping.

This module is pure geometry and has no web code, so it is tested without a server.
Accuracy is that of the four clicks and of the plot being flat and straight-sided; it does not
model lens distortion, so stalls near the edge of a wide-angle frame can sit a little off.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np
from shapely.geometry import Polygon

from homography import HomographyCalibrator

# Optimizer slot types that are not somewhere to park.
NON_PARKABLE = frozenset({"island", "transfer"})

# GeoJSON features that are not stalls at all.  The export also writes the site's obstacles and
# access lanes; their ids (1, 2, ...) would clash with the stalls' and they would become "bays".
GEOJSON_NOT_STALLS = frozenset({None, "site", "aisle", "entry", "exit", "obstacle", "access_lane"})

MIN_BAY_AREA_PX = 30.0       # smaller than this is a sliver, not a stall
MIN_QUAD_AREA_PX = 400.0     # the clicked corners must enclose a real area


class BridgeError(ValueError):
    """The layout or the clicked corners cannot be turned into bays; the message says why."""


def _open(ring: list, tol: float = 1e-6) -> list:
    """
    Tidy a ring: drop points that repeat the one before, and the closing point that repeats the
    first.  The optimizer's exports can end with the first corner two or three times.
    """
    out: list = []
    for p in ring:
        if not out or abs(p[0] - out[-1][0]) > tol or abs(p[1] - out[-1][1]) > tol:
            out.append(p)
    while len(out) > 1 and abs(out[0][0] - out[-1][0]) <= tol and abs(out[0][1] - out[-1][1]) <= tol:
        out.pop()
    return out


def to_metres(result: dict) -> dict:
    """
    Convert an optimizer `result` (lat/lng paths) to metres in the site's UTM zone, shifted so
    the site's south-west corner is near (0, 0).  Returns {"site", "slots", "epsg"}.
    """
    from pyproj import Transformer            # imported here: only this path needs it

    try:
        epsg = result["stats"]["epsg"]
        site_ll = result["site"]
        slots_ll = result["slots"]
    except (KeyError, TypeError) as e:
        raise BridgeError(f"optimizer result is missing {e}") from e

    tr = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)

    def ring(path):
        return _open([list(tr.transform(p["lng"], p["lat"])) for p in path])

    site = ring(site_ll)
    if len(site) < 3:
        raise BridgeError("the optimizer's site outline has fewer than 3 corners")
    ox, oy = min(p[0] for p in site), min(p[1] for p in site)

    def shift(r):
        return [[x - ox, y - oy] for x, y in r]

    slots = [{"id": s.get("id"), "type": s.get("type", "standard"), "ring": shift(ring(s["path"]))}
             for s in slots_ll]
    return {"site": shift(site), "slots": slots, "epsg": epsg}


def geojson_to_metres(fc: dict) -> dict:
    """
    The same conversion for the optimizer's GeoJSON export (the "GEOJSON" button), which is what
    people actually have on disk.  Features carry properties.kind: "site", "standard",
    "accessible", "ev", "island", "transfer", "aisle", "entry"; stalls have an "id".
    """
    from pyproj import Transformer

    feats = fc.get("features") if isinstance(fc, dict) else None
    if not isinstance(feats, list):
        raise BridgeError("this is not a GeoJSON FeatureCollection")

    def polygon(f):
        g = f.get("geometry") or {}
        return g["coordinates"][0] if g.get("type") == "Polygon" and g.get("coordinates") else None

    sites = [f for f in feats if (f.get("properties") or {}).get("kind") == "site" and polygon(f)]
    if not sites:
        raise BridgeError("the GeoJSON has no site outline (a feature with kind \"site\")")
    site_ll = _open([list(p[:2]) for p in polygon(sites[0])])
    if len(site_ll) < 3:
        raise BridgeError("the site outline has fewer than 3 corners")

    lon = sum(p[0] for p in site_ll) / len(site_ll)
    lat = sum(p[1] for p in site_ll) / len(site_ll)
    zone = int((lon + 180) // 6) + 1
    epsg = (32600 if lat >= 0 else 32700) + zone          # the UTM zone the optimizer also uses
    tr = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)

    def ring(ll):
        return _open([list(tr.transform(p[0], p[1])) for p in ll])

    site = ring(site_ll)
    ox, oy = min(p[0] for p in site), min(p[1] for p in site)

    def shift(r):
        return [[x - ox, y - oy] for x, y in r]

    slots = []
    for f in feats:
        props = f.get("properties") or {}
        kind = props.get("kind")
        if kind in GEOJSON_NOT_STALLS or not polygon(f):
            continue
        slots.append({"id": props.get("id"), "type": kind,
                      "ring": shift(ring([list(p[:2]) for p in polygon(f)]))})
    return {"site": shift(site), "slots": slots, "epsg": epsg}


def _simple_convex(points: Sequence[Sequence[float]]) -> bool:
    """True for a quadrilateral that does not cross itself and has no reflex corner."""
    poly = Polygon(points)
    if not poly.is_valid or poly.area <= 0:
        return False
    return poly.convex_hull.area - poly.area <= 1e-6 * poly.convex_hull.area


def _signed_area(points: Sequence[Sequence[float]]) -> float:
    """Shoelace area: positive when the points go anticlockwise on a y-up plane."""
    return 0.5 * sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(points, list(points[1:]) + [points[0]]))


def layout_to_bays(layout_m: dict, corners_px: Sequence[Sequence[float]],
                   site_corner_idx: Sequence[int] = (0, 1, 2, 3),
                   image_size: Sequence[float] | None = None) -> dict:
    """
    Carry the stalls of `layout_m` (from to_metres) onto the camera frame.

    corners_px       four clicked points, in the same order as the site corners picked below
    site_corner_idx  which four of the site's corners those clicks correspond to
    image_size       (width, height) of the frame; stalls whose centre is outside are not monitored

    Returns {"bays": {id: [[x, y], ...]}, "skipped": {...counts}, "warnings": [...],
             "calibrator": HomographyCalibrator}.  Raises BridgeError when the input is unusable.
    """
    site = layout_m["site"]
    if len(corners_px) != 4:
        raise BridgeError("exactly 4 corners are needed")
    try:
        src = [[float(x), float(y)] for x, y in corners_px]
    except (TypeError, ValueError) as e:
        raise BridgeError("corners must be [x, y] numbers") from e

    idx = list(site_corner_idx)
    if len(idx) != 4 or len(set(idx)) != 4 or any(not isinstance(i, int) or i < 0 or i >= len(site) for i in idx):
        raise BridgeError(f"site_corner_idx must be 4 different numbers below {len(site)}")
    dst = [site[i] for i in idx]

    if Polygon(src).area < MIN_QUAD_AREA_PX:
        raise BridgeError("the clicked corners enclose almost no area")
    if not _simple_convex(src):
        raise BridgeError("the clicked corners cross over or bend inwards: click them in the "
                          "order shown on the site outline, going round the lot")
    if not _simple_convex(dst):
        raise BridgeError("the chosen site corners do not form a simple quadrilateral")

    # The plan is y-up (east, north); an image is y-down.  A camera above the ground therefore
    # sees the lot with the opposite winding, so the same winding means the clicks went round
    # the other way and the lot would come out as a mirror image.
    if _signed_area(src) * _signed_area(dst) > 0:
        raise BridgeError("the clicked corners go round the opposite way to the numbers on the "
                          "outline, so the lot would come out mirrored: click 1, 2, 3, 4 in order")

    cal = HomographyCalibrator()
    if not cal.calibrate(src, dst):
        raise BridgeError("could not fit a view from these corners")

    skipped = {"island": 0, "transfer": 0, "too_small": 0, "outside_view": 0}
    warnings: list[str] = []
    bays: dict[str, list] = {}
    used: set[str] = set()
    counter = 0
    w, h = (float(image_size[0]), float(image_size[1])) if image_size else (None, None)

    for s in layout_m["slots"]:
        kind = str(s.get("type", "standard"))
        if kind in NON_PARKABLE:
            skipped[kind] = skipped.get(kind, 0) + 1
            continue
        ring_px = cal.ground_to_image(s["ring"])
        flat = np.array(ring_px, dtype=float)
        if not np.isfinite(flat).all() or np.abs(flat).max() > 1e5:
            raise BridgeError("these corners give an impossible view (stalls land at infinity); "
                              "check that the corners are the same four points as on the outline")
        poly = Polygon(ring_px)
        if not poly.is_valid or poly.area < MIN_BAY_AREA_PX:
            skipped["too_small"] += 1
            continue
        c = poly.centroid
        if w is not None and not (0 <= c.x <= w and 0 <= c.y <= h):
            skipped["outside_view"] += 1
            continue

        counter += 1
        sid = str(s["id"]) if s.get("id") not in (None, "") else f"Bay-{counter:02d}"
        if sid in used:
            sid = f"{sid}-{counter:02d}"
        used.add(sid)
        bays[sid] = [[round(x, 1), round(y, 1)] for x, y in ring_px]

    if skipped["outside_view"]:
        warnings.append(f"{skipped['outside_view']} stalls fall outside the camera view and are not "
                        "monitored; the camera is not seeing the whole lot")
    if skipped["too_small"]:
        warnings.append(f"{skipped['too_small']} stalls are almost edge-on at this angle and were dropped")
    if not bays:
        raise BridgeError("no parkable stalls land inside the frame with these corners")

    return {"bays": bays, "skipped": skipped, "warnings": warnings, "calibrator": cal}
