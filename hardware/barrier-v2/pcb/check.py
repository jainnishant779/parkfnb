"""Design-rule and connectivity checks on the routed board (shapely).

Checks: copper-to-copper clearance per layer, copper-to-edge and mounting holes, hole-to-hole, annular ring,
track width, per-net connectivity (tracks, vias, through-hole pads) and the bottom GND plane with thermal spokes."""
import itertools
import math

from shapely.geometry import Point, LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from design import BOARD_W, BOARD_H, CLEARANCE, VIA_D, VIA_DRILL

EDGE = 0.4
THERMAL_GAP = 0.4
SPOKE = 0.5
MIN_TRACK = 0.2
MIN_ANNULAR = 0.2


def pad_shape(pd, grow=0.0):
    if pd.shape == "r":
        s = pd.size / 2 + grow
        return box(pd.x - s, pd.y - s, pd.x + s, pd.y + s)
    return Point(pd.x, pd.y).buffer(pd.size / 2 + grow, 24)


def copper(parts, router):
    """{layer: [(net, geom, kind, name)]}.  Every through-hole pad appears on both layers."""
    cu = {"F": [], "B": []}
    for pt in parts:
        for pd in pt.pads:
            for lay in "FB":
                cu[lay].append((pd.net or f"#nc:{pd.ref}.{pd.num}", pad_shape(pd), "pad", f"{pd.ref}.{pd.num}"))
    for (net, lay, x0, y0, x1, y1, w) in router.tracks:
        cu[lay].append((net, LineString([(x0, y0), (x1, y1)]).buffer(w / 2, 16), "track", ""))
    for k, (net, x, y) in enumerate(router.vias):
        for lay in "FB":
            cu[lay].append((net, Point(x, y).buffer(VIA_D / 2, 24), "via", f"via{k}"))
    return cu


def plane_geometry(parts, router, antenna):
    """Bottom GND plane: board inset, minus foreign copper + clearance, minus keep-outs, GND pads on thermal spokes."""
    foreign = []
    for (net, g, kind, name) in copper(parts, router)["B"]:
        if net != "GND":
            foreign.append(g.buffer(CLEARANCE, 16))
    for pt in parts:
        if pt.fp == "MOUNT":
            foreign.append(Point(pt.x, pt.y).buffer(3.0 + 0.25, 32))
    foreign.append(box(*antenna).buffer(0.1))
    plane = box(EDGE + 0.1, EDGE + 0.1, BOARD_W - EDGE - 0.1, BOARD_H - EDGE - 0.1).difference(unary_union(foreign))
    reliefs = []
    for pt in parts:
        for pd in pt.pads:
            if pd.net != "GND":
                continue
            r = pd.size / 2
            ring = Point(pd.x, pd.y).buffer(r + THERMAL_GAP, 24).difference(Point(pd.x, pd.y).buffer(r, 24))
            spokes = unary_union([box(pd.x - SPOKE / 2, pd.y - 3 * r - 1, pd.x + SPOKE / 2, pd.y + 3 * r + 1),
                                  box(pd.x - 3 * r - 1, pd.y - SPOKE / 2, pd.x + 3 * r + 1, pd.y + SPOKE / 2)])
            reliefs.append(ring.difference(spokes))
    return plane.difference(unary_union(reliefs))


def _connectivity(net, cu):
    """Return list of groups of pad names that are not connected to each other."""
    items = [(lay, g, kind, nm) for lay in "FB" for (n, g, kind, nm) in cu[lay] if n == net]
    parent = list(range(len(items)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find(a)] = find(b)

    for a, b in itertools.combinations(range(len(items)), 2):
        la, ga, ka, na = items[a]
        lb, gb, kb, nb = items[b]
        if la == lb and ga.intersects(gb):
            union(a, b)
        elif la != lb and ka == kb and ka in ("pad", "via") and na == nb:
            union(a, b)                      # the hole of a through-hole pad / via joins F and B
    groups = {}
    for k, (lay, g, kind, nm) in enumerate(items):
        if kind == "pad":
            groups.setdefault(find(k), set()).add(nm)
    return [sorted(v) for v in groups.values()] if len(groups) > 1 else []


def run_checks(parts, router, antenna, verbose=True):
    problems = []
    cu = copper(parts, router)
    for lay in "FB":
        items = cu[lay]
        tree = STRtree([g for (_, g, _, _) in items])
        for i, (net, g, kind, nm) in enumerate(items):
            for j in tree.query(g.buffer(CLEARANCE)):
                if j <= i:
                    continue
                n2, g2, k2, nm2 = items[j]
                if net == n2 and not net.startswith("#nc"):
                    continue
                d = g.distance(g2)
                if d < CLEARANCE - 1e-3:
                    problems.append(f"CLEARANCE {lay}: {net} {nm} vs {n2} {nm2} = {d:.3f}")
        ko = box(*antenna)
        holes = [(pt.ref, Point(pt.x, pt.y).buffer(3.0)) for pt in parts if pt.fp == "MOUNT"]
        for (net, g, kind, nm) in items:
            if g.intersects(ko):
                problems.append(f"ANTENNA KEEP-OUT {lay}: {net} {nm}")
            for ref, hole in holes:
                if g.intersects(hole):
                    problems.append(f"MOUNT HOLE {ref} {lay}: {net} {nm}")
    inner = box(EDGE, EDGE, BOARD_W - EDGE, BOARD_H - EDGE)
    for lay in "FB":
        for (net, g, kind, nm) in cu[lay]:
            if not inner.contains(g):
                problems.append(f"EDGE {lay}: {net} {nm}")
    for (net, lay, x0, y0, x1, y1, w) in router.tracks:
        if w < MIN_TRACK:
            problems.append(f"TRACK WIDTH {net} {w}")
    if (VIA_D - VIA_DRILL) / 2 < MIN_ANNULAR - 1e-9:
        problems.append("VIA ANNULAR RING")
    for pt in parts:
        for pd in pt.pads:
            if pd.drill and (pd.size - pd.drill) / 2 < MIN_ANNULAR:
                problems.append(f"PAD ANNULAR RING {pd.ref}.{pd.num}")
    holes = [(pd.x, pd.y, pd.drill, f"{pd.ref}.{pd.num}") for pt in parts for pd in pt.pads if pd.drill] + \
            [(x, y, VIA_DRILL, f"via{k}") for k, (_, x, y) in enumerate(router.vias)]
    for a, b in itertools.combinations(holes, 2):
        d = math.hypot(a[0] - b[0], a[1] - b[1]) - a[2] / 2 - b[2] / 2
        if d < 0.3:
            problems.append(f"HOLE-TO-HOLE {a[3]} vs {b[3]} = {d:.2f}")
    nets = {pd.net for pt in parts for pd in pt.pads if pd.net and pd.net != "GND"}
    for net in sorted(nets):
        n_pads = sum(1 for pt in parts for pd in pt.pads if pd.net == net)
        if n_pads < 2:
            continue
        groups = _connectivity(net, cu)
        if groups:
            problems.append(f"UNCONNECTED {net}: " + " | ".join(",".join(g) for g in groups))
    plane = plane_geometry(parts, router, antenna)
    polys = list(plane.geoms) if plane.geom_type == "MultiPolygon" else [plane]
    areas = sorted(((pg.area, i) for i, pg in enumerate(polys)), reverse=True)
    main = polys[areas[0][1]] if areas else None
    for pt in parts:
        for pd in pt.pads:
            if pd.net == "GND" and (main is None or not main.intersects(Point(pd.x, pd.y).buffer(pd.size / 2 + 0.2))):
                problems.append(f"GND PLANE: {pd.ref}.{pd.num} not on the main plane")
    if verbose:
        print(f"checks: {len(problems)} problem(s); plane pieces {len(polys)}, "
              f"main {areas[0][0]:.0f} mm2" if areas else "no plane")
    return problems, plane
