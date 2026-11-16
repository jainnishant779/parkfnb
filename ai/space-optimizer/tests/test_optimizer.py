"""Regression + invariant tests for the layout engine.

Plots are real sites drawn in the UI (Indore, EPSG:32643). Floors are the
stall counts the engine reached when these tests were written — a change
that lowers one is a regression, a change that raises one should bump it.

Run:  cd services/space-optimizer && python -m pytest tests -q
"""
import functools
import json
import sys
from pathlib import Path

import pytest
from pyproj import Transformer
from shapely.geometry import Point, Polygon

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from optimizer import optimize  # noqa: E402

EPSG = 32643
_to_wgs = Transformer.from_crs(f"EPSG:{EPSG}", "EPSG:4326", always_xy=True)
_to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{EPSG}", always_xy=True)


def _utm(ox, oy, pts):
    out = []
    for x, y in pts:
        lon, lat = _to_wgs.transform(ox + x, oy + y)
        out.append({"lat": lat, "lng": lon})
    return out


def _lnglat(pts):
    return [{"lng": x, "lat": y} for x, y in pts]


DIAMOND = _utm(592912.84, 2513249.98,
               [(0.0, 13.80), (4.49, 0.0), (21.88, 7.43), (14.49, 21.21)])
DIAMOND_GATE = _utm(592912.84, 2513249.98, [(7.31, 1.87)])[0]

PREV = _lnglat([(75.90481747950851, 22.724006214004305),
                (75.90476784411148, 22.724119982728222),
                (75.9049087013193, 22.72418675997859),
                (75.90498516666067, 22.72407175469377)])
PREV_GATE = {"lng": 75.90483357747512, "lat": 22.724018580174526}

NOW = _lnglat([(75.904780500368, 22.724122356575567),
               (75.90481336704983, 22.723989420287936),
               (75.90498306644783, 22.724071655309004),
               (75.90491465008974, 22.724184187363022)])
NOW_GATE = {"lng": 75.90496763922987, "lat": 22.724067945459502}

LATEST = _lnglat([(75.90482009063703, 22.723998032801777),
                  (75.90498442404616, 22.724070993194278),
                  (75.90490728795615, 22.724178578786834),
                  (75.9047798457205, 22.72412787754111)])
LATEST_GATE = {"lng": 75.9049723505712, "lat": 22.72406913826952}

# 293.6 m2 site from parking_layout (3).dxf
DXF_SITE = _utm(592900, 2513200,
                [(12.0, 64.3), (27.0, 71.4), (35.19, 57.5), (16.7, 49.09)])
DXF_GATE = _utm(592900, 2513200, [(25.69, 53.18)])[0]

BIGRECT = _lnglat([(75.86, 22.72), (75.86, 22.72045),
                   (75.8608, 22.72045), (75.8608, 22.72)])

BIKE = {"vehicle": "bike", "slot_width": 1.0, "slot_length": 2.0}

# name: (boundary, gate, options, minimum stalls)
CASES = {
    "diamond_gate": (DIAMOND, DIAMOND_GATE, {}, 9),
    "prev_gate": (PREV, PREV_GATE, {}, 9),
    "now_gate": (NOW, NOW_GATE, {}, 9),
    "now_nogate": (NOW, None, {}, 10),
    "latest_gate": (LATEST, LATEST_GATE, {}, 8),
    "dxf_car_gate": (DXF_SITE, DXF_GATE, {}, 12),
    "dxf_bike_gate": (DXF_SITE, DXF_GATE, BIKE, 62),
    "bigrect": (BIGRECT, None, {}, 187),
}


@functools.lru_cache(maxsize=None)
def run(name):
    boundary, gate, extra, _ = CASES[name]
    return optimize(boundary, [], options={"rule_pack": "nbc", "gate": gate, **extra})


def _poly(path):
    return Polygon([_to_utm.transform(p["lng"], p["lat"]) for p in path])


@pytest.mark.parametrize("name", CASES)
def test_capacity_floor(name):
    assert run(name)["stats"]["n_slots"] >= CASES[name][3]


@pytest.mark.parametrize("name", CASES)
def test_stalls_inside_site(name):
    r = run(name)
    site = _poly(r["site"]).buffer(0.05)
    for s in r["slots"]:
        assert _poly(s["path"]).difference(site).area < 0.01


@pytest.mark.parametrize("name", CASES)
def test_no_overlaps(name):
    slots = [_poly(s["path"]) for s in run(name)["slots"]]
    for i, a in enumerate(slots):
        for b in slots[i + 1:]:
            assert a.intersection(b).area < 0.01


@pytest.mark.parametrize("name", CASES)
def test_stalls_off_drive_areas(name):
    r = run(name)
    if r["stats"]["layout_mode"] == "courtyard":
        pytest.skip("courtyard aprons are per-stall and abut their own stall")
    drives = [_poly(a) for a in r["aisles"] + r["spine"]]
    for s in r["slots"]:
        sp = _poly(s["path"])
        assert all(sp.intersection(d).area < 0.01 for d in drives)


@pytest.mark.parametrize("name", [n for n, c in CASES.items() if c[1]])
def test_gate_kept_clear(name):
    r = run(name)
    gate = CASES[name][1]
    g = Point(_to_utm.transform(gate["lng"], gate["lat"]))
    assert min(g.distance(_poly(s["path"])) for s in r["slots"]) >= 1.0


@pytest.mark.parametrize("name", CASES)
def test_aisle_meets_standard(name):
    assert run(name)["stats"]["turning_check"] == "ok"


@pytest.mark.parametrize("name", CASES)
def test_quality_metrics(name):
    st = run(name)["stats"]
    assert st["ideal_max_slots"] >= st["n_slots"]
    assert 0 < st["utilization_pct"] <= 100
    json.dumps(run(name))  # API must be able to serialise it


def test_bike_with_car_stall_warns():
    r = optimize(DXF_SITE, [], options={"vehicle": "bike", "slot_width": 2.5,
                                        "slot_length": 5.0, "gate": DXF_GATE})
    assert any("car-sized" in w for w in r["warnings"])


def test_bike_defaults_to_bike_stall():
    r = optimize(DXF_SITE, [], options={"vehicle": "bike", "gate": DXF_GATE})
    assert (r["stats"]["slot_width_m"], r["stats"]["slot_length_m"]) == (1.0, 2.0)
