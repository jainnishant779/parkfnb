"""
Tests for carrying Space Optimizer stalls onto a camera frame.

The "camera" is a hand-written projective matrix, applied with plain numpy, so the expected pixels
do not come from the code under test.
"""
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from optimizer_bridge import BridgeError, layout_to_bays, to_metres  # noqa: E402

# ground (metres, y up) -> image (pixels, y down): a tilted view with real perspective.  A camera
# above the ground flips the winding of the plan, so the linear part has a negative determinant.
CAMERA = np.array([[22.0, 6.0, 140.0],
                   [3.0, -11.0, 700.0],
                   [0.0004, 0.012, 1.0]])


def cam(points):
    out = []
    for x, y in points:
        u, v, w = CAMERA @ np.array([x, y, 1.0])
        out.append([u / w, v / w])
    return out


def rect(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


SITE = rect(0, 0, 40, 20)                      # a 40 x 20 m plot, corners 0..3 going round


def layout(slots=None):
    if slots is None:
        slots = [{"id": f"S{i + 1}", "type": "standard", "ring": rect(2.5 * i + 1, 2, 2.4, 5)} for i in range(8)]
    return {"site": SITE, "slots": slots, "epsg": 32643}


CORNERS = cam(SITE)


def test_stalls_land_where_the_camera_would_see_them():
    out = layout_to_bays(layout(), CORNERS)
    expected = {f"S{i + 1}": cam(rect(2.5 * i + 1, 2, 2.4, 5)) for i in range(8)}
    assert set(out["bays"]) == set(expected)
    for sid, ring in out["bays"].items():
        assert np.allclose(ring, expected[sid], atol=0.1), sid          # rounded to 0.1 px


def test_the_four_site_corners_map_exactly_to_the_clicks():
    out = layout_to_bays(layout(), CORNERS)
    back = out["calibrator"].ground_to_image(SITE)
    assert np.allclose(back, CORNERS, atol=1e-3)


def test_starting_the_clicks_at_a_different_corner_gives_the_same_bays():
    base = layout_to_bays(layout(), CORNERS)["bays"]
    # click starting from site corner 2, going round: 2, 3, 0, 1
    rotated = layout_to_bays(layout(), [CORNERS[2], CORNERS[3], CORNERS[0], CORNERS[1]],
                             site_corner_idx=(2, 3, 0, 1))["bays"]
    for sid in base:
        assert np.allclose(base[sid], rotated[sid], atol=0.1)


def test_going_round_the_other_way_is_refused_because_the_lot_would_be_mirrored():
    # the same four corners but clicked 0, 3, 2, 1 against the outline's 0, 1, 2, 3
    with pytest.raises(BridgeError, match="mirrored"):
        layout_to_bays(layout(), [CORNERS[0], CORNERS[3], CORNERS[2], CORNERS[1]])


def test_going_round_the_other_way_is_fine_if_the_site_corners_are_given_the_same_way():
    base = layout_to_bays(layout(), CORNERS)["bays"]
    rev = layout_to_bays(layout(), [CORNERS[0], CORNERS[3], CORNERS[2], CORNERS[1]],
                         site_corner_idx=(0, 3, 2, 1))["bays"]
    for sid in base:
        assert np.allclose(base[sid], rev[sid], atol=0.1)


def test_crossed_corners_are_refused_with_a_useful_message():
    crossed = [CORNERS[0], CORNERS[2], CORNERS[1], CORNERS[3]]
    with pytest.raises(BridgeError, match="cross over"):
        layout_to_bays(layout(), crossed)


def test_wrong_number_of_corners_or_bad_indices():
    with pytest.raises(BridgeError, match="4 corners"):
        layout_to_bays(layout(), CORNERS[:3])
    with pytest.raises(BridgeError, match="site_corner_idx"):
        layout_to_bays(layout(), CORNERS, site_corner_idx=(0, 1, 2, 2))
    with pytest.raises(BridgeError, match="site_corner_idx"):
        layout_to_bays(layout(), CORNERS, site_corner_idx=(0, 1, 2, 9))


def test_a_tiny_clicked_area_is_refused():
    tiny = [[10, 10], [14, 10], [14, 14], [10, 14]]
    with pytest.raises(BridgeError, match="almost no area"):
        layout_to_bays(layout(), tiny)


def test_islands_and_transfer_slots_are_not_bays():
    slots = [{"id": "A", "type": "standard", "ring": rect(1, 2, 2.4, 5)},
             {"id": "B", "type": "island", "ring": rect(4, 2, 2.4, 5)},
             {"id": "C", "type": "transfer", "ring": rect(7, 2, 2.4, 5)},
             {"id": "D", "type": "accessible", "ring": rect(10, 2, 3.6, 5)},
             {"id": "E", "type": "ev", "ring": rect(14, 2, 2.4, 5)}]
    out = layout_to_bays(layout(slots), CORNERS)
    assert sorted(out["bays"]) == ["A", "D", "E"]
    assert out["skipped"]["island"] == 1 and out["skipped"]["transfer"] == 1


def test_missing_and_duplicate_ids_get_unique_names():
    slots = [{"id": None, "type": "standard", "ring": rect(1, 2, 2.4, 5)},
             {"id": "X", "type": "standard", "ring": rect(4, 2, 2.4, 5)},
             {"id": "X", "type": "standard", "ring": rect(7, 2, 2.4, 5)},
             {"type": "standard", "ring": rect(10, 2, 2.4, 5)}]
    out = layout_to_bays(layout(slots), CORNERS)
    assert len(out["bays"]) == 4 and len(set(out["bays"])) == 4
    assert "X" in out["bays"]


def test_stalls_outside_the_frame_are_not_monitored_and_the_user_is_told():
    lo = [min(c[0] for c in CORNERS), min(c[1] for c in CORNERS)]
    hi = [max(c[0] for c in CORNERS), max(c[1] for c in CORNERS)]
    # a frame that ends halfway across the plot
    size = (lo[0] + (hi[0] - lo[0]) * 0.45, hi[1] + 50)
    out = layout_to_bays(layout(), CORNERS, image_size=size)
    assert 0 < len(out["bays"]) < 8
    assert out["skipped"]["outside_view"] == 8 - len(out["bays"])
    assert any("outside the camera view" in w for w in out["warnings"])


def test_nothing_in_frame_is_an_error():
    with pytest.raises(BridgeError, match="no parkable stalls"):
        layout_to_bays(layout(), CORNERS, image_size=(5, 5))


def test_corners_that_do_not_match_the_outline_give_an_impossible_view():
    # the right quadrilateral shape, but wildly different from the plot's: perspective explodes
    bad = [[100, 100], [101, 100], [900, 700], [100, 701]]
    with pytest.raises(BridgeError):
        layout_to_bays(layout(), bad)


# ---- lat/lng -> metres

def test_to_metres_gives_a_plausible_site_and_drops_the_closing_point():
    # the "Indore Test Plot" saved in the optimizer: about 36 m by 33 m
    boundary = [{"lat": 22.71981772, "lng": 75.85805852}, {"lat": 22.72014182, "lng": 75.85803706},
                {"lat": 22.72018388, "lng": 75.85842062}, {"lat": 22.71993648, "lng": 75.85841526}]
    closed = boundary + [boundary[0]]
    slot = [{"lat": 22.71990, "lng": 75.85810}, {"lat": 22.71990, "lng": 75.85813},
            {"lat": 22.71993, "lng": 75.85813}, {"lat": 22.71993, "lng": 75.85810}]
    res = {"stats": {"epsg": 32643}, "site": closed,
           "slots": [{"id": "S1", "type": "standard", "path": slot, "center": slot[0]}]}
    out = to_metres(res)

    assert len(out["site"]) == 4                                   # closing point dropped
    xs = [p[0] for p in out["site"]]
    ys = [p[1] for p in out["site"]]
    assert min(xs) == pytest.approx(0, abs=1e-6) and min(ys) == pytest.approx(0, abs=1e-6)
    assert 25 < max(xs) < 50 and 25 < max(ys) < 50
    # a stall about 3 m wide and 3.3 m deep
    ring = out["slots"][0]["ring"]
    w = max(p[0] for p in ring) - min(p[0] for p in ring)
    d = max(p[1] for p in ring) - min(p[1] for p in ring)
    assert 2.5 < w < 3.5 and 3.0 < d < 4.0


# ---- the optimizer's GeoJSON export

def _fc():
    """A small export in the optimizer's shape: site ring that repeats its first corner, stalls with ids."""
    def ll(p):
        return [p["lng"], p["lat"]]
    boundary = [{"lat": 22.71981772, "lng": 75.85805852}, {"lat": 22.72014182, "lng": 75.85803706},
                {"lat": 22.72018388, "lng": 75.85842062}, {"lat": 22.71993648, "lng": 75.85841526}]
    ring = [ll(p) for p in boundary]
    def poly(kind, pts, **props):
        return {"type": "Feature", "properties": {"kind": kind, **props},
                "geometry": {"type": "Polygon", "coordinates": [pts + [pts[0]]]}}
    def box(lat, lng):
        return [[lng, lat], [lng + 0.00003, lat], [lng + 0.00003, lat + 0.000045], [lng, lat + 0.000045]]
    feats = [poly("site", ring + [ring[0], ring[0]]),                  # closed, then repeated
             poly("aisle", box(22.71990, 75.85820), id=1),
             poly("standard", box(22.71995, 75.85808), id=1),
             poly("accessible", box(22.71995, 75.85812), id=2),
             poly("island", box(22.71995, 75.85816), id=3),
             {"type": "Feature", "properties": {"kind": "entry"},
              "geometry": {"type": "Point", "coordinates": ring[0]}}]
    return {"type": "FeatureCollection", "features": feats}


def test_geojson_export_converts_to_a_clean_layout_in_metres():
    from optimizer_bridge import geojson_to_metres
    out = geojson_to_metres(_fc())
    assert out["epsg"] == 32643                                  # UTM zone 43N, as the optimizer uses for Indore
    assert len(out["site"]) == 4                                 # the repeated closing corner is gone
    assert min(p[0] for p in out["site"]) == pytest.approx(0, abs=1e-6)
    assert [(s["id"], s["type"]) for s in out["slots"]] == [(1, "standard"), (2, "accessible"), (3, "island")]
    ring = out["slots"][0]["ring"]
    assert len(ring) == 4 and 2.5 < max(p[0] for p in ring) - min(p[0] for p in ring) < 3.5


def test_geojson_layout_goes_straight_into_bays():
    from optimizer_bridge import geojson_to_metres
    layout = geojson_to_metres(_fc())
    # camera south of the lot looking north, clicks going round 1..4 in the outline's order
    corners = [[200, 650], [350, 150], [950, 150], [1100, 650]]
    out = layout_to_bays(layout, corners, image_size=(1280, 720))
    assert sorted(out["bays"]) == ["1", "2"] and out["skipped"]["island"] == 1


def test_geojson_without_a_site_or_with_the_wrong_shape_is_refused():
    from optimizer_bridge import geojson_to_metres
    with pytest.raises(BridgeError, match="no site outline"):
        geojson_to_metres({"type": "FeatureCollection", "features": []})
    with pytest.raises(BridgeError, match="FeatureCollection"):
        geojson_to_metres({"hello": "world"})


def test_repeated_points_in_a_ring_are_removed():
    from optimizer_bridge import _open
    ring = [[0, 0], [10, 0], [10, 0], [10, 10], [0, 10], [0, 0], [0, 0]]
    assert _open(ring) == [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert _open([[1, 1]]) == [[1, 1]]


def test_to_metres_rejects_a_result_without_stats():
    with pytest.raises(BridgeError, match="missing"):
        to_metres({"site": [], "slots": []})
