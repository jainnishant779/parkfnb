"""Build the PARKFNB V2 controller PCB: route, check, export, verify.   python build.py"""
import csv
import itertools
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from design import *            # noqa
from placement import PLACEMENT, ANTENNA_KEEPOUT
from route_test import route, net_order
from check import run_checks, copper
from export_kicad import write_kicad
from export_gerber import write_gerbers

OUT = os.path.join(HERE, "out")
PREFIX = "PARKFNB_V2_CTRL"


def make_labels(parts):
    """Silkscreen text: connector pin names, title.  (text, x, y, rot, size)"""
    P = {p.ref: p for p in parts}
    L = []

    def under(ref, names, y=1.0):
        for pd, nm in zip(P[ref].pads, names):
            L.append((nm, pd.x + 0.35, y, 90, 0.9))

    under("J2", ["RPWM", "LPWM", "EN", "EN", "IS", "IS", "5V", "GND"])
    under("J4", ["5V", "GND", "HALL"])
    under("J5", ["5V", "GND", "HALL"])
    under("J6", ["5V", "GND", "SDA", "SCL"])
    under("J7", ["LEDG", "LEDR", "GND"])
    under("J8", ["TAMP", "GND"])
    for pd, nm in zip(P["J1"].pads, ["BAT+", "GND"]):
        L.append((nm, 14.3, pd.y - 0.4, 0, 0.9))
    for pd, nm in zip(P["J3"].pads, ["VIN", "GND"]):
        L.append((nm, pd.x + 0.35, 57.4, 90, 0.9))
    for pd, nm in zip(P["J9"].pads, ["5V", "GND"]):
        L.append((nm, pd.x + 0.35, 51.4, 90, 0.9))
    L.append(("J4 HALL 0   J5 HALL 180", 33.0, 9.3, 0, 0.8))
    L.append(("J10 HALL 90", 0.9, 32.2, 0, 0.8))
    L.append(("PARKFNB V2 CTRL", 64.5, 21.0, 0, 1.1))
    L.append(("REV A  2026-10", 64.5, 18.5, 0, 0.9))
    L.append(("USB: keep clear", 64.5, 16.0, 0, 0.8))
    return L


def ref_labels(parts):
    out = []
    for pt in parts:
        if pt.fp in ("MOUNT",):
            continue
        out.append((pt.ref, pt.bbox[0], pt.bbox[3] + 0.5, 0, 0.8))
    return out


def write_bom(parts, path):
    groups = {}
    for pt in parts:
        if pt.fp == "MOUNT":
            continue
        groups.setdefault((pt.value, pt.fp), []).append(pt.ref)
    rows = []
    for (value, fp), refs in sorted(groups.items(), key=lambda kv: kv[1][0]):
        dnp = "DNP-check: fit only if the module does not already have it" if "DNP" in value else ""
        rows.append((", ".join(sorted(refs, key=lambda r: (len(r), r))), value.replace(" (DNP if IBT-2 has IS resistor)", "")
                     .replace(" (DNP if GY-521 has pull-ups)", ""), fp, len(refs), dnp))
    with open(path, "w", newline="", encoding="utf8") as fh:
        w = csv.writer(fh)
        w.writerow(["References", "Value", "Footprint (generic THT, verify)", "Qty", "Note"])
        w.writerows(rows)
        w.writerow([])
        w.writerow(["OFF-BOARD", "LM2596 buck module set to 5.1 V", "wire to J3 / J9", 1, "set output BEFORE connecting J9"])
        w.writerow(["OFF-BOARD", "IBT-2 (BTS7960) module", "J2 (8 wires)", 1, "power B+/B- direct from battery switch, not through this PCB"])
        w.writerow(["OFF-BOARD", "GY-521 (MPU6050) pod", "J6", 1, ""])
        w.writerow(["OFF-BOARD", "A3144 / US5881 Hall sensor + magnet", "J4, J10, J5", 3, "5 V supply, open-collector output; 0 / 90 / 180 deg"])
        w.writerow(["OFF-BOARD", "Status LED pair (green + red) + 330R on board", "J7", 1, "common cathode on J7.3"])
        w.writerow(["OFF-BOARD", "Lid tamper micro-switch", "J8", 1, "normally open to GND"])


def write_netlist(parts, path):
    nets = {}
    for pt in parts:
        for pd in pt.pads:
            if pd.net:
                nets.setdefault(pd.net, []).append(f"{pt.ref}.{pd.num}")
    with open(path, "w", newline="", encoding="utf8") as fh:
        w = csv.writer(fh)
        w.writerow(["Net", "Track width mm", "Pins"])
        for n in sorted(nets):
            w.writerow([n, NET_W.get(n, DEFAULT_W) if n != "GND" else "plane", " ".join(nets[n])])
    return nets


def verify_kicad(path, parts, router):
    """Re-read the .kicad_pcb with kiutils and rebuild the connectivity independently."""
    from kiutils.board import Board
    from shapely.geometry import Point, LineString, box

    b = Board.from_file(path)
    msgs = []
    pads = []
    for fp in b.footprints:
        for pd in fp.pads:
            if pd.type != "thru_hole":
                continue
            x, y = fp.position.X + pd.position.X, fp.position.Y + pd.position.Y
            r = pd.size.X / 2
            g = box(x - r, y - r, x + r, y + r) if pd.shape == "rect" else Point(x, y).buffer(r, 16)
            pads.append((pd.net.name if pd.net else "", f"{fp.properties['Reference']}.{pd.number}", g))
    items = []   # (layer, net, geom, kind)
    for name, pnm, g in pads:
        for lay in ("F.Cu", "B.Cu"):
            items.append((lay, name, g, "pad:" + pnm))
    for s in b.traceItems:
        if s.__class__.__name__ == "Segment":
            items.append((s.layer, s.net and b.nets[s.net].name or "", LineString([(s.start.X, s.start.Y), (s.end.X, s.end.Y)]).buffer(s.width / 2, 8), "seg"))
        elif s.__class__.__name__ == "Via":
            g = Point(s.position.X, s.position.Y).buffer(s.size / 2, 16)
            for lay in ("F.Cu", "B.Cu"):
                items.append((lay, b.nets[s.net].name, g, "via"))
    parent = list(range(len(items)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    from shapely.strtree import STRtree
    tree = STRtree([it[2] for it in items])
    for i, it in enumerate(items):
        for j in tree.query(it[2]):
            if j > i and items[j][0] == it[0] and it[2].intersects(items[j][2]):
                parent[find(i)] = find(j)
    # holes join layers
    key_pos = {}
    for i, it in enumerate(items):
        if it[3].startswith("pad:") or it[3] == "via":
            key = (it[3], round(it[2].centroid.x, 2), round(it[2].centroid.y, 2))
            key_pos.setdefault(key, []).append(i)
    for v in key_pos.values():
        for a in v[1:]:
            parent[find(a)] = find(v[0])
    comp_nets = {}
    for i, it in enumerate(items):
        if it[1]:
            comp_nets.setdefault(find(i), set()).add(it[1])
    shorts = [sorted(v) for v in comp_nets.values() if len(v) > 1]
    msgs.append(f"kiutils parsed OK: {len(b.footprints)} footprints, {len(pads)} through-hole pads, "
                f"{sum(1 for s in b.traceItems if s.__class__.__name__ == 'Segment')} segments, "
                f"{sum(1 for s in b.traceItems if s.__class__.__name__ == 'Via')} vias, {len(b.zones)} zones, {len(b.nets)} nets")
    msgs.append("independent short check (different nets touching): " + ("NONE" if not shorts else str(shorts)))
    # every non-GND net must be one component
    by_net = {}
    for i, it in enumerate(items):
        if it[3].startswith("pad:") and it[1] and it[1] != "GND":
            by_net.setdefault(it[1], set()).add(find(i))
    opens = {n: len(c) for n, c in by_net.items() if len(c) > 1}
    msgs.append("independent open check (net split in pieces): " + ("NONE" if not opens else str(opens)))
    return msgs, (not shorts and not opens)


def verify_gerbers(files):
    from gerbonara import GerberFile, ExcellonFile
    msgs = []
    for p in files:
        name = os.path.basename(p)
        try:
            if name.endswith(".drl"):
                f = ExcellonFile.open(p)
                msgs.append(f"{name}: {len(list(f.objects))} drill hits")
            else:
                f = GerberFile.open(p)
                bb = f.bounding_box("mm")
                msgs.append(f"{name}: {len(list(f.objects))} objects, bbox "
                            f"({bb[0][0]:.1f},{bb[0][1]:.1f})-({bb[1][0]:.1f},{bb[1][1]:.1f}) mm")
        except Exception as e:        # noqa
            msgs.append(f"{name}: FAILED TO READ {e}")
    return msgs


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = build_parts(PLACEMENT)
    t = time.time()
    router, dt = route(parts)
    print(f"routing: {len(router.tracks)} tracks, {len(router.vias)} vias in {dt:.0f}s; failed: {sorted(set(router.failed))}")
    problems, plane = run_checks(parts, router, ANTENNA_KEEPOUT)
    for p in problems:
        print("  DRC:", p)
    labels, refs = make_labels(parts), ref_labels(parts)
    nets = write_netlist(parts, os.path.join(OUT, f"{PREFIX}_netlist.csv"))
    write_bom(parts, os.path.join(OUT, f"{PREFIX}_BOM.csv"))
    kpath = os.path.join(OUT, f"{PREFIX}.kicad_pcb")
    write_kicad(kpath, parts, router, ANTENNA_KEEPOUT, labels, set(nets) | set())
    gfiles, silk = write_gerbers(os.path.join(OUT, "gerbers"), PREFIX, parts, router, plane, ANTENNA_KEEPOUT, labels, refs)
    kmsg, kok = verify_kicad(kpath, parts, router)
    gmsg = verify_gerbers(gfiles)
    for m in kmsg + gmsg:
        print(" ", m)
    return dict(parts=parts, router=router, plane=plane, silk=silk, problems=problems, labels=labels, refs=refs,
                nets=nets, kmsg=kmsg, gmsg=gmsg, kok=kok, gfiles=gfiles)


if __name__ == "__main__":
    main()
