# ============================================================
# PARKING SPACE OPTIMIZER — CORE ENGINE (v3)
# v3 additions:
#   - vectorized slot placement (shapely 2 array ops) ~10x fast
#   - standard rule packs (NBC 2016 / BIS SP 73 / US-ITE)
#   - gate works on ANY edge (access evaluated in both row
#     orientations; top/bottom becomes left/right in the
#     perpendicular frame)
#   - turning / single-swing entry check with warnings
# ============================================================
import math

import numpy as np
import shapely
from pyproj import Transformer
from shapely.affinity import rotate, translate
from shapely.geometry import Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

# ------------------------------------------------------------
# STANDARD RULE PACKS
# aisle tables are widths (m) at angles [0, 45, 60, 90]
# ------------------------------------------------------------
AISLE_ANGLE_ANCHORS = [0, 45, 60, 90]
RULE_PACKS = {
    "nbc": {
        "name": "NBC 2016 (India)",
        "slot_w": 2.5, "slot_l": 5.0,
        "aisle": {"two_way": [3.6, 5.0, 5.5, 6.0],
                  "one_way": [3.0, 4.0, 5.5, 6.0]},
        "ecs_area": 23.0,
    },
    "bis": {
        "name": "BIS SP 73:2023 (comfort)",
        "slot_w": 2.75, "slot_l": 5.0,
        "aisle": {"two_way": [3.6, 5.0, 5.5, 6.0],
                  "one_way": [3.0, 4.0, 5.5, 6.0]},
        "ecs_area": 23.0,
    },
    "us_ite": {
        "name": "US / ITE practice",
        "slot_w": 2.7, "slot_l": 5.5,
        "aisle": {"two_way": [3.6, 5.5, 6.1, 7.3],
                  "one_way": [3.4, 4.0, 5.5, 7.3]},
        "ecs_area": 30.0,
    },
}
BIKE_AISLE = {"two_way": [2.5, 2.8, 2.8, 3.0],
              "one_way": [2.0, 2.2, 2.5, 3.0]}

ACCESS_LANE_WIDTHS = {"car": 6.0, "bike": 3.0}
TOUCH_TOLERANCE = 0.05
AISLE_COVERAGE_MIN = 0.80
BENCHMARK_M2 = (32.0, 37.0)  # good surface lot ~350-400 sqft/car


def aisle_width_for(angle, cfg):
    widths = cfg["aisle_table"].get(cfg["circulation"],
                                    cfg["aisle_table"]["two_way"])
    return float(np.interp(angle, AISLE_ANGLE_ANCHORS, widths))


def module_dimensions(angle, cfg):
    theta = math.radians(angle)
    stall_depth = cfg["slot_l"] * math.sin(theta) + cfg["slot_w"] * math.cos(theta)
    stall_frontage = cfg["slot_l"] * math.cos(theta) + cfg["slot_w"] * math.sin(theta)
    aisle = aisle_width_for(angle, cfg)
    return stall_depth, stall_frontage, aisle, stall_depth * 2 + aisle


def slot_row_geoms(xs, y, angle, slot_w, slot_l):
    """Vectorized: build rotated stall rectangles centred at (x, y)."""
    rot = math.radians(90 - angle)
    c, s = math.cos(rot), math.sin(rot)
    hw, hl = slot_w / 2.0, slot_l / 2.0
    base = np.array([(-hw, -hl), (hw, -hl), (hw, hl), (-hw, hl), (-hw, -hl)])
    rc = base @ np.array([[c, s], [-s, c]])  # rotate corners
    coords = np.empty((len(xs), 5, 2))
    coords[:, :, 0] = np.asarray(xs)[:, None] + rc[None, :, 0]
    coords[:, :, 1] = y + rc[None, :, 1]
    return shapely.polygons(coords)


def longest_edge_orientation(polygon):
    coords = list(polygon.exterior.coords)
    best_length, best_angle = -1.0, 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        length = math.hypot(x2 - x1, y2 - y1)
        if length > best_length:
            best_length = length
            best_angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return best_angle


def build_bay(polygon, base_y, angle, cfg):
    """polygon must be shapely.prepare()'d for fast vectorized covers."""
    stall_depth, frontage, aisle_width, module_depth = module_dimensions(angle, cfg)
    minx, miny, maxx, maxy = polygon.bounds

    aisle = box(minx, base_y + stall_depth, maxx, base_y + stall_depth + aisle_width)
    aisle_ratio = aisle.intersection(polygon).area / max(aisle.area, 1e-9)

    xs = np.arange(minx + frontage / 2, maxx, frontage)
    rows = []
    for row_y in (
        base_y + stall_depth / 2,
        base_y + stall_depth + aisle_width + stall_depth / 2,
    ):
        if len(xs):
            geoms = slot_row_geoms(xs, row_y, angle, cfg["slot_w"], cfg["slot_l"])
            rows.append(list(geoms[shapely.covers(polygon, geoms)]))
        else:
            rows.append([])
    return rows[0], rows[1], aisle, aisle_ratio, module_depth


def generate_layout(polygon, angle, y_offset, cfg):
    _, _, _, module_depth = module_dimensions(angle, cfg)
    _, miny, _, maxy = polygon.bounds
    all_slots, all_aisles = [], []
    y = miny + y_offset
    while y + module_depth <= maxy + 1e-9:
        row1, row2, aisle, aisle_ratio, _ = build_bay(polygon, y, angle, cfg)
        if aisle_ratio >= AISLE_COVERAGE_MIN and (row1 or row2):
            all_slots.extend(row1)
            all_slots.extend(row2)
            all_aisles.append(aisle.intersection(polygon))
        y += module_depth
    return all_slots, all_aisles


def optimize_angle(polygon, angle, cfg, n_offsets=15):
    _, _, aisle_width, module_depth = module_dimensions(angle, cfg)
    best = {"slots": [], "aisles": [], "offset": 0.0}
    for offset in np.linspace(0, module_depth, n_offsets):
        slots, aisles = generate_layout(polygon, angle, float(offset), cfg)
        if len(slots) > len(best["slots"]):
            best = {"slots": slots, "aisles": aisles, "offset": float(offset)}
    best.update(angle=angle, aisle_width=aisle_width, module_depth=module_depth)
    return best


def search_best_layout(polygon, cfg, n_offsets_coarse=11):
    shapely.prepare(polygon)
    sweep = {}
    for angle in np.arange(0, 90.01, 5.0):
        sweep[round(float(angle), 1)] = optimize_angle(
            polygon, float(angle), cfg, n_offsets_coarse
        )
    best_coarse = max(sweep.values(), key=lambda r: len(r["slots"]))
    for delta in range(-4, 5):
        angle = round(best_coarse["angle"] + delta, 1)
        if 0 <= angle <= 90 and angle not in sweep:
            sweep[angle] = optimize_angle(polygon, angle, cfg)

    best = max(sweep.values(), key=lambda r: (len(r["slots"]), r["angle"]))
    table = sorted(
        ({"angle": a, "slots": len(r["slots"])} for a, r in sweep.items()),
        key=lambda e: (-e["slots"], e["angle"]),
    )
    return best, table


def evaluate_access(polygon, sides, candidate_angles, cfg, gate_local=None):
    """Reserve access lane(s) first, then re-optimize the remaining area."""
    lane_width = ACCESS_LANE_WIDTHS.get(cfg["vehicle"], 6.0)
    minx, miny, maxx, maxy = polygon.bounds

    spines = []
    for side in sides:
        if side == "left":
            spines.append(box(minx, miny, minx + lane_width, maxy))
        else:
            spines.append(box(maxx - lane_width, miny, maxx, maxy))
    spine_union = unary_union(spines)

    reduced = polygon.difference(spine_union)
    if reduced.geom_type == "MultiPolygon":
        reduced = max(reduced.geoms, key=lambda g: g.area)
    if reduced.is_empty or reduced.area < 1.0:
        return None

    shapely.prepare(reduced)
    best = None
    for angle in candidate_angles:
        cand = optimize_angle(reduced, angle, cfg, n_offsets=31)
        if best is None or len(cand["slots"]) > len(best["slots"]):
            best = cand
    if not best["slots"]:
        return None

    connected_aisles = [a for a in best["aisles"] if a.intersects(spine_union)]
    connected_union = unary_union(connected_aisles) if connected_aisles else None
    reachable = []
    if connected_union is not None:
        reachable = [
            s for s in best["slots"] if s.distance(connected_union) < TOUCH_TOLERANCE
        ]

    if gate_local is not None and len(sides) > 1:
        entry_side = min(
            sides,
            key=lambda sd: abs(gate_local.x - (minx if sd == "left" else maxx)),
        )
    else:
        entry_side = sides[0]
    entry_x = minx if entry_side == "left" else maxx
    entry_y = (miny + maxy) / 2
    gate_gap = None
    if gate_local is not None:
        entry_y = min(max(gate_local.y, miny + 1), maxy - 1)
        gate_gap = Point(entry_x, entry_y).distance(gate_local)

    exit_point = None
    if len(sides) > 1:
        exit_side = "right" if entry_side == "left" else "left"
        exit_point = Point(minx if exit_side == "left" else maxx, (miny + maxy) / 2)

    return {
        "sides": sides,
        "entry_side": entry_side,
        "spines": [s.intersection(polygon) for s in spines],
        "slots": reachable,
        "aisles": connected_aisles,
        "angle": best["angle"],
        "aisle_width": best["aisle_width"],
        "module_depth": best["module_depth"],
        "entry_point": Point(entry_x, entry_y),
        "exit_point": exit_point,
        "gate_gap": gate_gap,
        "n_reachable": len(reachable),
        "n_placed": len(best["slots"]),
        "n_connected_aisles": len(connected_aisles),
        "n_total_aisles": len(best["aisles"]),
    }


# ------------------------------------------------------------
# COURTYARD / DIRECT-ACCESS LAYOUT (small plots)
# Small yards don't get an aisle grid — stalls line the plot
# edges with maneuvering aprons opening onto a shared court.
# Like ParkCAD, all stalls stay ALIGNED to the dominant axes
# (slanted edges get a clean staircase, not per-edge rotation).
# Works in the already-rotated local frame.
# ------------------------------------------------------------
COURT_INSET = 0.05


def _strip_parts(poly, lo, hi, horizontal):
    """Polygon ∩ axis strip -> polygon parts."""
    minx, miny, maxx, maxy = poly.bounds
    strip = (box(minx - 1, lo, maxx + 1, hi) if horizontal
             else box(lo, miny - 1, hi, maxy + 1))
    inter = poly.intersection(strip)
    if inter.is_empty:
        return []
    if inter.geom_type == "Polygon":
        return [inter]
    return [g for g in getattr(inter, "geoms", []) if g.geom_type == "Polygon"]


def _pack_pass(poly, cfg, w_along, depth, apron_depth, grid_offset,
               placed, aprons, runs_map, tag):
    """One greedy pass: rest stalls against the boundary in all four
    axis directions (S=face up, N=face down, W=face right, E=face left)."""
    minx, miny, maxx, maxy = poly.bounds

    def overlaps(g, others):
        return any(g.intersection(o).area > 1e-6 for o in others)

    def try_place(slot, apron, run_key, along):
        if not poly.covers(slot) or not poly.covers(apron):
            return
        if overlaps(slot, placed) or overlaps(apron, placed):
            return
        if overlaps(slot, aprons):
            return
        placed.append(slot)
        aprons.append(apron)
        runs_map.setdefault(run_key, []).append((along, slot))

    need = COURT_INSET + depth + apron_depth
    # vertical strips: stalls resting on bottom (S) and top (N) boundary
    for x in np.arange(minx + grid_offset + w_along / 2, maxx, w_along):
        for part in _strip_parts(poly, x - w_along / 2, x + w_along / 2, False):
            pminx, pminy, pmaxx, pmaxy = part.bounds
            if pmaxy - pminy < need:
                continue
            y0 = pminy + COURT_INSET
            try_place(
                box(x - w_along / 2, y0, x + w_along / 2, y0 + depth),
                box(x - w_along / 2, y0 + depth,
                    x + w_along / 2, y0 + depth + apron_depth),
                (tag, "S", round(pminy, 0)), x,
            )
            y1 = pmaxy - COURT_INSET
            try_place(
                box(x - w_along / 2, y1 - depth, x + w_along / 2, y1),
                box(x - w_along / 2, y1 - depth - apron_depth,
                    x + w_along / 2, y1 - depth),
                (tag, "N", round(pmaxy, 0)), x,
            )
    # horizontal strips: stalls resting on left (W) and right (E) boundary
    for y in np.arange(miny + grid_offset + w_along / 2, maxy, w_along):
        for part in _strip_parts(poly, y - w_along / 2, y + w_along / 2, True):
            pminx, pminy, pmaxx, pmaxy = part.bounds
            if pmaxx - pminx < need:
                continue
            x0 = pminx + COURT_INSET
            try_place(
                box(x0, y - w_along / 2, x0 + depth, y + w_along / 2),
                box(x0 + depth, y - w_along / 2,
                    x0 + depth + apron_depth, y + w_along / 2),
                (tag, "W", round(pminx, 0)), y,
            )
            x1 = pmaxx - COURT_INSET
            try_place(
                box(x1 - depth, y - w_along / 2, x1, y + w_along / 2),
                box(x1 - depth - apron_depth, y - w_along / 2,
                    x1 - depth, y + w_along / 2),
                (tag, "E", round(pmaxx, 0)), y,
            )


def perimeter_layout(polygon, cfg, gate_local=None):
    poly = orient(polygon, sign=1.0)
    shapely.prepare(poly)
    perp_apron = aisle_width_for(90, cfg)
    par_apron = aisle_width_for(0, cfg)

    best_pack = None
    for grid_offset in (0.0, cfg["slot_w"] / 2):
        placed, aprons, runs_map = [], [], {}
        # pass 1: perpendicular stalls (rear on boundary, nose to court)
        _pack_pass(poly, cfg, cfg["slot_w"], cfg["slot_l"], perp_apron,
                   grid_offset, placed, aprons, runs_map, "perp")
        n_perp = len(placed)
        # pass 2: parallel stalls fill what's left (narrow strips etc.)
        _pack_pass(poly, cfg, cfg["slot_l"], cfg["slot_w"], par_apron,
                   grid_offset, placed, aprons, runs_map, "par")
        if best_pack is None or len(placed) > len(best_pack[0]):
            best_pack = (placed, aprons, runs_map, n_perp)

    placed, aprons, runs_map, n_perp = best_pack
    if not placed:
        return None

    # split each boundary-line group into adjacency runs
    runs, run_meta = [], []
    for (tag, _side, _rear), items in runs_map.items():
        items.sort(key=lambda t: t[0])
        pitch = (cfg["slot_w"] if tag == "perp" else cfg["slot_l"]) * 1.35
        run = [items[0][1]]
        prev = items[0][0]
        for along, slot in items[1:]:
            if along - prev <= pitch:
                run.append(slot)
            else:
                runs.append(run)
                run = [slot]
            prev = along
        runs.append(run)

    # reachability: every stall must touch the free-space court that
    # contains the gate (or the largest court when no gate is set)
    free = poly.difference(unary_union(placed))
    comps = [free] if free.geom_type == "Polygon" else [
        g for g in getattr(free, "geoms", []) if g.geom_type == "Polygon"
    ]
    if not comps:
        return None
    if gate_local is not None:
        court = min(comps, key=lambda c: c.distance(gate_local))
    else:
        court = max(comps, key=lambda c: c.area)

    reachable, kept_runs = [], []
    for run in runs:
        kept = [s for s in run if s.distance(court) < TOUCH_TOLERANCE]
        if kept:
            kept_runs.append(kept)
            reachable.extend(kept)
    if not reachable:
        return None

    # dominant stall angle + apron width for stats
    n_par = len(placed) - n_perp
    main_angle = 90.0 if n_perp >= n_par else 0.0
    main_apron = perp_apron if n_perp >= n_par else par_apron

    if gate_local is not None:
        entry_point = gate_local
    else:
        coords = list(poly.exterior.coords)
        a, b = max(zip(coords, coords[1:]),
                   key=lambda e: math.hypot(e[1][0] - e[0][0],
                                            e[1][1] - e[0][1]))
        entry_point = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    return {
        "slots": reachable,
        "runs": kept_runs,
        "aprons": [ap for ap in aprons],
        "entry_point": entry_point,
        "angle": main_angle,
        "aisle_width": main_apron,
        "n_reachable": len(reachable),
        "n_placed": len(placed),
    }


# ------------------------------------------------------------
# STALL CLASSIFICATION (striping plan)
# ------------------------------------------------------------
def group_rows(slots, frontage):
    rows = {}
    for s in slots:
        c = s.centroid
        rows.setdefault(round(c.y / 0.5), []).append(s)
    runs = []
    for _, row in rows.items():
        row.sort(key=lambda s: s.centroid.x)
        run = [row[0]]
        for prev, cur in zip(row, row[1:]):
            if cur.centroid.x - prev.centroid.x <= frontage * 1.35:
                run.append(cur)
            else:
                runs.append(run)
                run = [cur]
        runs.append(run)
    return runs


def classify_slots(slots, entry_point, frontage, accessible_pct, ev_pct,
                   island_every, runs=None):
    if runs is None:
        runs = group_rows(slots, frontage)
    else:
        runs = [list(r) for r in runs]
    records = {}

    if island_every and island_every > 0:
        for run in runs:
            kept = []
            for i, s in enumerate(run):
                if (i + 1) % (island_every + 1) == 0:
                    records[id(s)] = "island"
                else:
                    kept.append(s)
            run[:] = kept

    n_parking = sum(len(r) for r in runs)
    n_acc = 0
    if accessible_pct and accessible_pct > 0 and n_parking >= 3:
        n_acc = max(2, math.ceil(accessible_pct / 100.0 * n_parking))
        n_acc = min(n_acc, n_parking // 2)

    if n_acc > 0:
        runs_by_entry = sorted(
            (r for r in runs if len(r) >= 2),
            key=lambda r: min(s.centroid.distance(entry_point) for s in r),
        )
        need = n_acc
        for run in runs_by_entry:
            if need <= 0:
                break
            if run and run[0].centroid.distance(entry_point) > run[-1].centroid.distance(entry_point):
                run.reverse()
            while need > 0 and len(run) >= 2:
                if need >= 2 and len(run) >= 3:
                    a1, t, a2 = run[0], run[1], run[2]
                    del run[:3]
                    records[id(a1)] = records[id(a2)] = "accessible"
                    records[id(t)] = "transfer"
                    need -= 2
                else:
                    a1, t = run[0], run[1]
                    del run[:2]
                    records[id(a1)] = "accessible"
                    records[id(t)] = "transfer"
                    need -= 1

    remaining = [s for run in runs for s in run]
    if ev_pct and ev_pct > 0 and remaining:
        n_ev = min(math.ceil(ev_pct / 100.0 * n_parking), len(remaining))
        remaining.sort(key=lambda s: s.centroid.distance(entry_point))
        for s in remaining[:n_ev]:
            records[id(s)] = "ev"

    return [{"geom": s, "type": records.get(id(s), "standard")} for s in slots]


# ------------------------------------------------------------
# FULL PIPELINE
# ------------------------------------------------------------
def optimize(boundary_latlng, obstacle_latlng_lists, options=None):
    opt = options or {}
    pack_key = opt.get("rule_pack") or "nbc"
    pack = RULE_PACKS.get(pack_key, RULE_PACKS["nbc"])
    vehicle = opt.get("vehicle") or "car"
    cfg = {
        "slot_w": float(opt.get("slot_width") or pack["slot_w"]),
        "slot_l": float(opt.get("slot_length") or pack["slot_l"]),
        "vehicle": vehicle,
        "circulation": opt.get("circulation") or "two_way",
        "aisle_table": BIKE_AISLE if vehicle == "bike" else pack["aisle"],
    }
    access_mode = opt.get("access") or "single"
    accessible_pct = float(opt.get("accessible_pct") or 0)
    ev_pct = float(opt.get("ev_pct") or 0)
    island_every = int(opt.get("island_every") or 0)
    gate = opt.get("gate")

    if len(boundary_latlng) < 3:
        raise ValueError("Boundary needs at least 3 corners.")
    warnings = []

    # ---- coordinate system -------------------------------------------------
    lats = np.array([p["lat"] for p in boundary_latlng])
    lons = np.array([p["lng"] for p in boundary_latlng])
    utm_zone = int(math.floor((float(np.mean(lons)) + 180) / 6) + 1)
    epsg = (32600 if float(np.mean(lats)) >= 0 else 32700) + utm_zone
    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    to_wgs = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)

    def latlng_to_poly(points):
        poly = Polygon([to_utm.transform(p["lng"], p["lat"]) for p in points])
        return poly if poly.is_valid else poly.buffer(0)

    site = latlng_to_poly(boundary_latlng)
    if site.is_empty or site.area < 1.0:
        raise ValueError("Boundary polygon is degenerate (self-intersecting or tiny).")

    obstacles = []
    for pts in obstacle_latlng_lists:
        if len(pts) < 3:
            continue
        obs = latlng_to_poly(pts).intersection(site)
        if not obs.is_empty:
            obstacles.append(obs)
    obstacles_union = unary_union(obstacles) if obstacles else None

    usable = site.difference(obstacles_union) if obstacles_union is not None else site
    if usable.geom_type == "MultiPolygon":
        warnings.append("Obstacles split the plot; optimizing the largest piece only.")
        usable = max(usable.geoms, key=lambda g: g.area)

    # ---- both orientations -------------------------------------------------
    edge_angle = longest_edge_orientation(site)
    origin = site.centroid
    gate_utm = None
    if gate and "lat" in gate and "lng" in gate:
        gx, gy = to_utm.transform(gate["lng"], gate["lat"])
        gate_utm = Point(gx, gy)

    orientations = []
    for rot in (edge_angle, edge_angle + 90.0):
        loc = rotate(usable, -rot, origin=origin, use_radians=False)
        b, table = search_best_layout(loc, cfg)
        g_loc = (
            rotate(gate_utm, -rot, origin=origin, use_radians=False)
            if gate_utm is not None else None
        )
        orientations.append({"rot": rot, "local": loc, "best": b,
                             "table": table, "gate_local": g_loc})

    # ---- bay mode: circulation-first access, per orientation ---------------
    # With a gate, BOTH orientations are tried so a gate on any edge lands
    # on a left/right spine in one of the frames.
    candidates = []
    for o in orientations:
        if not o["best"]["slots"]:
            continue
        cand_angles = [e["angle"] for e in o["table"][:3]]
        if access_mode == "loop":
            side_sets = [("left", "right")]
        elif o["gate_local"] is not None:
            minx, _, maxx, _ = o["local"].bounds
            gl = o["gate_local"]
            side = "left" if abs(gl.x - minx) <= abs(gl.x - maxx) else "right"
            side_sets = [(side,)]
        else:
            side_sets = [("left",), ("right",)]
        for sides in side_sets:
            c = evaluate_access(o["local"], sides, cand_angles, cfg,
                                o["gate_local"])
            if c:
                c["orientation"] = o
                candidates.append(c)

    def score(c):
        gap = c["gate_gap"] if c["gate_gap"] is not None else 0.0
        return (c["n_reachable"], -gap)

    bay_final = max(candidates, key=score) if candidates else None
    if bay_final is not None and bay_final["n_reachable"] == 0:
        bay_final = None

    # ---- courtyard mode: aligned direct-access stalls ----------------------
    # Small plots (house compounds) can't afford an aisle grid; stalls line
    # the edges with maneuvering aprons, ALIGNED to the dominant axes.
    # Both orientations are tried; both modes compete; best count wins.
    courtyard = None
    courtyard_o = None
    for o in orientations:
        pl = perimeter_layout(o["local"], cfg, o["gate_local"])
        if pl and (courtyard is None
                   or pl["n_reachable"] > courtyard["n_reachable"]):
            courtyard = pl
            courtyard_o = o

    bay_n = bay_final["n_reachable"] if bay_final else 0
    court_n = courtyard["n_reachable"] if courtyard else 0
    if bay_n == 0 and court_n == 0:
        raise ValueError(
            "No layout fits — plot may be too small for even one stall "
            "plus maneuvering space."
        )
    layout_mode = "bay" if bay_n > court_n else "courtyard"

    if layout_mode == "bay":
        final = bay_final
        local = final["orientation"]["local"]
        dominant = final["orientation"]["rot"]
        angle_table = final["orientation"]["table"]
        final_runs = None
        display_aisles = final["aisles"]
        display_spines = final["spines"]
        exit_pt = final["exit_point"]
        entry_side = final["entry_side"]

        dropped = final["n_placed"] - final["n_reachable"]
        if dropped > 0:
            warnings.append(f"{dropped} stalls dropped by reachability check.")
        if final["n_connected_aisles"] < final["n_total_aisles"]:
            warnings.append(
                "Some aisle bays are not connected to the access lane."
            )
        if access_mode == "single":
            warnings.append(
                "Single-entry aisles dead-end at the far side; use Loop "
                "access for flow-through circulation on busy sites."
            )
    else:
        final = courtyard
        local = courtyard_o["local"]
        dominant = courtyard_o["rot"]
        angle_table = courtyard_o["table"]
        final_runs = final["runs"]
        display_aisles = final["aprons"]
        display_spines = []
        exit_pt = None
        entry_side = "gate"
        warnings.append(
            "Courtyard mode: small plot — stalls park directly off the "
            "shared court (no aisle grid). Maneuvering aprons shown dashed."
        )
        if gate_utm is None:
            warnings.append(
                "No gate set — longest edge assumed to face the road. "
                "Use SET GATE for an accurate entry."
            )
        dropped = final["n_placed"] - final["n_reachable"]
        if dropped > 0:
            warnings.append(f"{dropped} stalls dropped (court not reachable).")

    # ---- turning / single-swing entry check --------------------------------
    std_aisle = float(np.interp(final["angle"], AISLE_ANGLE_ANCHORS,
                                cfg["aisle_table"][cfg["circulation"]]))
    turning_ok = final["aisle_width"] >= std_aisle - 1e-6
    if not turning_ok:
        warnings.append(
            f"Aisle {final['aisle_width']:.1f} m is below the "
            f"{std_aisle:.1f} m standard for {final['angle']:.0f} deg — "
            "entry will need multi-point turns."
        )

    # ---- striping plan ------------------------------------------------------
    _, frontage, _, _ = module_dimensions(final["angle"], cfg)
    classified = classify_slots(
        final["slots"], final["entry_point"], frontage,
        accessible_pct, ev_pct, island_every, runs=final_runs,
    )

    # ---- back to lat/lng ---------------------------------------------------
    def local_poly_to_latlng(geom):
        true_utm = rotate(geom, dominant, origin=origin, use_radians=False)
        return [
            {"lat": lat, "lng": lon}
            for lon, lat in (
                to_wgs.transform(x, y) for x, y in true_utm.exterior.coords
            )
        ]

    def local_point_to_latlng(point):
        true_utm = rotate(point, dominant, origin=origin, use_radians=False)
        lon, lat = to_wgs.transform(true_utm.x, true_utm.y)
        return {"lat": lat, "lng": lon}

    def utm_poly_to_latlng(geom):
        return [
            {"lat": lat, "lng": lon}
            for lon, lat in (to_wgs.transform(x, y) for x, y in geom.exterior.coords)
        ]

    def flatten_polys(geom):
        if geom.is_empty:
            return []
        if geom.geom_type == "Polygon":
            return [geom]
        return [g for g in geom.geoms if g.geom_type == "Polygon"]

    parking_types = {"standard", "accessible", "ev"}
    order = sorted(
        range(len(classified)),
        key=lambda i: (
            round(classified[i]["geom"].centroid.y / 0.5),
            classified[i]["geom"].centroid.x,
        ),
    )
    slots_latlng = []
    counter = 0
    for i in order:
        rec = classified[i]
        entry = {
            "type": rec["type"],
            "path": local_poly_to_latlng(rec["geom"]),
            "center": local_point_to_latlng(rec["geom"].centroid),
        }
        if rec["type"] in parking_types:
            counter += 1
            entry["id"] = counter
        slots_latlng.append(entry)

    n_by_type = {}
    for rec in classified:
        n_by_type[rec["type"]] = n_by_type.get(rec["type"], 0) + 1
    n_parking = sum(n_by_type.get(t, 0) for t in parking_types)

    aisle_paths = [
        local_poly_to_latlng(g) for a in display_aisles for g in flatten_polys(a)
    ]
    spine_paths = [
        local_poly_to_latlng(g) for sp in display_spines for g in flatten_polys(sp)
    ]
    obstacle_paths = [
        utm_poly_to_latlng(g) for o in obstacles for g in flatten_polys(o)
    ]
    center_lon, center_lat = to_wgs.transform(origin.x, origin.y)
    area_per_slot = round(usable.area / n_parking, 1) if n_parking else None

    return {
        "site": utm_poly_to_latlng(site),
        "obstacles": obstacle_paths,
        "slots": slots_latlng,
        "aisles": aisle_paths,
        "spine": spine_paths,
        "entry": local_point_to_latlng(final["entry_point"]),
        "exit": local_point_to_latlng(exit_pt) if exit_pt is not None else None,
        "center": {"lat": center_lat, "lng": center_lon},
        "stats": {
            "epsg": epsg,
            "rule_pack": pack["name"],
            "plot_area_m2": round(site.area, 2),
            "obstacle_area_m2": round(
                obstacles_union.area if obstacles_union is not None else 0.0, 2
            ),
            "usable_area_m2": round(usable.area, 2),
            "perimeter_m": round(site.length, 2),
            "n_slots": n_parking,
            "n_standard": n_by_type.get("standard", 0),
            "n_accessible": n_by_type.get("accessible", 0),
            "n_ev": n_by_type.get("ev", 0),
            "n_islands": n_by_type.get("island", 0),
            "n_transfer": n_by_type.get("transfer", 0),
            "angle": final["angle"],
            "layout_mode": layout_mode,
            "circulation": cfg["circulation"],
            "access_mode": access_mode,
            "access_side": entry_side,
            "aisle_width_m": round(final["aisle_width"], 2),
            "module_depth_m": round(final.get("module_depth", 0.0), 2),
            "slot_width_m": cfg["slot_w"],
            "slot_length_m": cfg["slot_l"],
            "vehicle": cfg["vehicle"],
            "turning_check": "ok" if turning_ok else "tight",
            "area_per_slot_m2": area_per_slot,
            "benchmark_m2": list(BENCHMARK_M2),
            "ecs_upper_bound": round(site.area / pack["ecs_area"], 1),
        },
        "angle_table": angle_table[:10],
        "warnings": warnings,
    }
