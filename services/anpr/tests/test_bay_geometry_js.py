"""
The bay editor's geometry (static/bay-geometry.js) run under node and checked against numpy ground
truth: a row of equal stalls on the ground, seen by a tilted camera, must be split the way the camera
sees it (near stalls wider than far ones), not in equal pixel steps.
"""
import json
import random
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bay_validation import validate_bays  # noqa: E402

JS = Path(__file__).resolve().parent.parent / "static" / "bay-geometry.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node is not installed")


def js(fn, *args):
    code = ("const g=require(process.argv[1]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
            "const a=JSON.parse(s);process.stdout.write(JSON.stringify(g[a.fn](...a.args)));});")
    r = subprocess.run([NODE, "-e", code, str(JS)], input=json.dumps({"fn": fn, "args": args}),
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


# a camera ~6 m up and 12 m back from a row of stalls, tilted down: a plain projective map from ground (m)
# to picture (px).  Rows far away are smaller.
CAM = np.array([[900.0, 380.0, 640.0], [0.0, 160.0, 760.0], [0.0, 0.62, 1.0]])


def project(pts):
    out = []
    for x, y in pts:
        v = CAM @ np.array([x, y, 1.0])
        out.append((v[0] / v[2], v[1] / v[2]))
    return out


def ground_row(n, along_x=True, stall_w=2.5, depth=5.0):
    """n stalls as ground polygons [TL, TR, BR, BL] in picture order after projection."""
    stalls = []
    for i in range(n):
        a, b = i * stall_w, (i + 1) * stall_w
        ring = [(a, depth), (b, depth), (b, 0), (a, 0)] if along_x else [(0, a), (depth, a), (depth, b), (0, b)]
        stalls.append(project(ring))
    return stalls


def order_like_js(poly):
    return js("orderQuad", [list(p) for p in poly])


def close(a, b, tol=0.8):
    return all(abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol for p, q in zip(a, b))


@pytest.mark.parametrize("n", [1, 2, 5, 10])
def test_the_row_is_split_the_way_the_camera_sees_it(n):
    truth = ground_row(n)
    outer = [truth[0][0], truth[-1][1], truth[-1][2], truth[0][3]]               # the 4 outer corners
    got = js("splitRow", [list(p) for p in outer], n, 0)
    assert len(got) == n
    for g, t in zip(got, truth):
        assert close(sorted(g), sorted(order_like_js(t))), (g, t)


def test_far_stalls_are_narrower_than_near_ones_unlike_an_even_pixel_split():
    n = 6
    truth = ground_row(n)
    outer = [truth[0][0], truth[-1][1], truth[-1][2], truth[0][3]]
    got = js("splitRow", [list(p) for p in outer], n, 0)
    width = lambda poly: max(p[0] for p in poly) - min(p[0] for p in poly)
    widths = [width(g) for g in got]
    assert max(widths) / min(widths) > 1.05, widths                              # perspective is in there
    # the old method: equal steps along the top and bottom edges
    top0, top1 = np.array(outer[0]), np.array(outer[1])
    even_x = [top0[0] + (top1[0] - top0[0]) * k / n for k in range(n + 1)]
    truth_x = [min(p[0] for p in truth[0])] + [max(p[0] for p in s) for s in truth]
    assert max(abs(a - b) for a, b in zip(even_x, truth_x)) > 3                  # an even split would be off by several px
    assert max(abs(g[1][0] - t[1][0]) for g, t in zip(got, [order_like_js(s) for s in truth])) < 1.0


def test_click_order_does_not_matter():
    n = 5
    truth = ground_row(n)
    outer = [list(p) for p in (truth[0][0], truth[-1][1], truth[-1][2], truth[0][3])]
    ref = js("splitRow", outer, n, 0)
    rng = random.Random(4)
    for _ in range(6):
        shuffled = outer[:]
        rng.shuffle(shuffled)
        assert js("splitRow", shuffled, n, 0) == ref


def test_a_row_running_up_the_picture_is_split_too():
    n = 4
    truth = ground_row(n, along_x=False)                                         # stalls stacked away from the camera
    outer = [truth[0][0], truth[0][1], truth[-1][2], truth[-1][3]]
    # the first stall's far corners are not "outer" any more: take the hull of all stall corners
    pts = np.array([p for s in truth for p in s])
    hull = [pts[pts[:, 0].argmin()], pts[pts[:, 1].argmin()], pts[pts[:, 0].argmax()], pts[pts[:, 1].argmax()]]
    got = js("splitRow", [list(map(float, p)) for p in outer], n, 0)
    assert len(got) == n and all(len(g) == 4 for g in got)
    ys = [sum(p[1] for p in g) / 4 for g in got]
    assert ys == sorted(ys) or ys == sorted(ys, reverse=True)                    # stalls come in order along the row
    assert hull is not None


def test_a_gap_between_stalls_shrinks_each_stall_but_keeps_the_rhythm():
    n = 4
    truth = ground_row(n)
    outer = [list(p) for p in (truth[0][0], truth[-1][1], truth[-1][2], truth[0][3])]
    tight = js("splitRow", outer, n, 0)
    gapped = js("splitRow", outer, n, 0.2)
    area = lambda p: js("area", p)
    for t, g in zip(tight, gapped):
        assert 0.7 < area(g) / area(t) < 0.9
    centres = [js("centroid", g) for g in gapped]
    centres0 = [js("centroid", t) for t in tight]
    assert all(abs(a[0] - b[0]) < 1.0 and abs(a[1] - b[1]) < 1.0 for a, b in zip(centres, centres0))


def test_bad_input_gives_null_not_a_crash():
    assert js("splitRow", [[0, 0], [1, 1]], 3, 0) is None
    assert js("splitRow", [[0, 0], [10, 0], [10, 10], [0, 10]], 0, 0) is None
    assert js("splitRow", [[0, 0], [10, 0], [20, 0], [30, 0]], 3, 0) is None      # all on one line


# ---- validation: the page and the server must agree

PHONE1 = {
    "1": [[207.0, 683.0], [440.0, 657.0], [462.0, 511.0], [339.7, 511.0]],
    "2": [[673.0, 631.0], [601.0, 507.0], [462.0, 511.0], [440.0, 657.0]],
    "3": [[942.2, 605.1], [798.3, 452.2], [583.4, 480.8], [727.3, 633.7]],
    "4": [[1147.1, 557.6], [1010.1, 412.0], [788.3, 441.6], [925.3, 587.2]],
    "5": [[1023.3, 426.0], [1153.5, 564.4], [1279.0, 547.6], [1279.0, 406.9], [1266.5, 393.6]],
}
SIZE = [1280, 720]
CASES = {
    "good": [[100, 100], [200, 100], [200, 200], [100, 200]],
    "triangle": [[100, 100], [200, 100], [150, 200]],
    "two points": [[0, 0], [10, 10]],
    "bow-tie": [[0, 0], [100, 0], [0, 100], [100, 100]],
    "tiny": [[0, 0], [3, 0], [3, 3], [0, 3]],
    "outside": [[2000, 100], [2100, 100], [2100, 200], [2000, 200]],
    "pokes out": [[1200, 100], [1380, 100], [1380, 200], [1200, 200]],
    "not numbers": [[0, 0], [10, 0], [10, "x"]],
}


@pytest.mark.parametrize("name", list(CASES))
def test_the_page_and_the_server_agree_on_each_bay(name):
    poly = CASES[name]
    page = js("validateBay", "a", poly, SIZE)
    errors, warnings = validate_bays({"a": poly}, tuple(SIZE))
    assert bool(page["errors"]) == bool(errors), (name, page, errors)
    assert bool(page["warnings"]) == bool(warnings), (name, page, warnings)


def test_the_real_pilot_layout_has_no_issues_on_the_page_either():
    got = js("validateAll", PHONE1, SIZE)
    assert all(not v["errors"] and not v["warnings"] for v in got.values()), got


def test_overlap_is_flagged_on_both_bays_and_touching_is_not():
    a = [[100, 100], [200, 100], [200, 200], [100, 200]]
    half = [[150, 100], [250, 100], [250, 200], [150, 200]]
    touch = [[200, 100], [300, 100], [300, 200], [200, 200]]
    got = js("validateAll", {"a": a, "b": half}, SIZE)
    assert "overlaps b by 50%" in got["a"]["warnings"][0] and "overlaps a by 50%" in got["b"]["warnings"][0]
    assert js("validateAll", {"a": a, "b": touch}, SIZE)["a"]["warnings"] == []


# ---- editing helpers

def test_hit_test_prefers_a_corner_then_the_smallest_bay_containing_the_point():
    bays = {"big": [[0, 0], [300, 0], [300, 300], [0, 300]], "small": [[100, 100], [200, 100], [200, 200], [100, 200]]}
    assert js("hitTest", bays, 103, 98, 10) == {"id": "small", "vertex": 0}
    assert js("hitTest", bays, 150, 150, 10) == {"id": "small", "vertex": None}
    assert js("hitTest", bays, 20, 250, 10) == {"id": "big", "vertex": None}
    assert js("hitTest", bays, 900, 900, 10) is None


def test_ids_stay_unique_and_count_on():
    assert js("uniqueId", {"A": 1}, "B") == "B" and js("uniqueId", {"A": 1, "A-2": 1}, "A") == "A-3"
    assert js("nextId", {"A-07": 1}, "A-07") == "A-08"
    assert js("nextId", {"A-07": 1, "A-08": 1}, "A-07") == "A-09"
    assert js("nextId", {}, "stall") == "stall-2" and js("nextId", {"1": 1}, "1") == "2"


def test_a_duplicate_of_an_end_bay_extends_the_row_without_landing_on_a_neighbour():
    truth = ground_row(4)
    bays = {str(i + 1): [[round(x), round(y)] for x, y in s] for i, s in enumerate(truth)}
    for end in ("1", "4"):
        copy = js("duplicateBay", bays, end)
        report = js("validateAll", {**bays, "new": copy}, None)                  # this test scene is wider than a real frame
        assert report["new"]["errors"] == []
        assert not any("overlaps" in w for w in report["new"]["warnings"]), (end, report["new"])
    alone = js("duplicateBay", {"x": [[100, 100], [200, 100], [200, 200], [100, 200]]}, "x")
    assert min(p[0] for p in alone) >= 200 - 1                                    # moved right by its own width


def test_insert_bay_bridges_gap_or_steps_along_row():
    # Two bays with a gap (e.g. bay 1 and bay 3, missing bay 2)
    bays = {
        "1": [[100, 100], [200, 100], [200, 200], [100, 200]],
        "3": [[300, 100], [400, 100], [400, 200], [300, 200]],
    }
    inserted = js("insertBay", bays, "1")
    assert inserted is not None and len(inserted) == 4
    # The inserted bay should lie between 100 and 400
    mid_x = sum(p[0] for p in inserted) / 4
    assert 180 < mid_x < 320
