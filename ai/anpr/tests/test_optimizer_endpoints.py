"""
HTTP tests for the Space Optimizer bridge routes, with the optimizer itself replaced by a stub that
returns the same JSON shapes the real one does (lat/lng paths, UTM zone in stats).
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402

TUNNEL = {"cf-connecting-ip": "203.0.113.9"}
CAM = "bridge-test"

# The "Indore Test Plot" saved in the optimizer: four corners, about 36 m by 33 m.
BOUNDARY = [{"lat": 22.71981772, "lng": 75.85805852}, {"lat": 22.72014182, "lng": 75.85803706},
            {"lat": 22.72018388, "lng": 75.85842062}, {"lat": 22.71993648, "lng": 75.85841526}]


def stall(i):
    # inside the plot: the south edge slopes up toward the east, so start well north of it
    lat0, lng0, dlat, dlng = 22.71995, 75.85808, 0.000045, 0.000030
    lng = lng0 + i * (dlng + 0.000003)
    return [{"lat": lat0, "lng": lng}, {"lat": lat0, "lng": lng + dlng},
            {"lat": lat0 + dlat, "lng": lng + dlng}, {"lat": lat0 + dlat, "lng": lng}]


RESULT = {
    "stats": {"epsg": 32643},
    "site": BOUNDARY + [BOUNDARY[0]],
    "slots": [{"id": f"S{i + 1}", "type": "standard", "path": stall(i), "center": stall(i)[0]} for i in range(6)]
             + [{"id": "I1", "type": "island", "path": stall(6), "center": stall(6)[0]}],
}

# Clicked on a 1280x720 frame, camera south of the lot looking north, corners 1..4 going round.
GOOD_CLICKS = [[200, 650], [350, 150], [950, 150], [1100, 650]]
MIRRORED_CLICKS = [GOOD_CLICKS[0], GOOD_CLICKS[3], GOOD_CLICKS[2], GOOD_CLICKS[1]]


def stub(method, path, body=None):
    if path == "/api/projects":
        return {"ok": True, "projects": [{"id": 1, "name": "Indore Test Plot", "updated": "2026-08-19"}]}
    if path == "/api/projects/1":
        return {"ok": True, "name": "Indore Test Plot",
                "data": {"boundary": BOUNDARY, "obstacles": [], "options": {}}}
    if path == "/api/optimize":
        return {"ok": True, "result": RESULT}
    raise app_module._OptimizerError("not found")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_optimizer", stub)
    monkeypatch.setattr(app_module, "_optimizer_layouts", {})
    for name in ("_bay_maps", "_trackers", "_mot_trackers", "_calibrators", "_registries", "_profiles",
                 "_thresholds"):
        monkeypatch.setattr(app_module, name, {})
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def generate(client, clicks=GOOD_CLICKS, **extra):
    return client.post("/occupancy/layout-from-optimizer", json={
        "camera_id": CAM, "project_id": 1, "corners_px": clicks, "image_size": [1280, 720], **extra})


def test_projects_are_listed(client):
    r = client.get("/optimizer/projects")
    assert r.status_code == 200 and r.json()["projects"][0]["name"] == "Indore Test Plot"


def test_a_missing_optimizer_gives_a_message_that_says_how_to_start_it(client, monkeypatch):
    def down(*a, **k):
        raise app_module._OptimizerError("The Space Optimizer is not running at http://127.0.0.1:5000. "
                                         "Start it with: cd services/space-optimizer && python app.py")
    monkeypatch.setattr(app_module, "_optimizer", down)
    r = client.get("/optimizer/projects")
    assert r.status_code == 502 and "not running" in r.json()["error"]
    assert client.post("/optimizer/site", json={"project_id": 1}).status_code == 502


def test_site_outline_comes_back_in_metres_without_the_island(client):
    r = client.post("/optimizer/site", json={"project_id": 1})
    assert r.status_code == 200
    body = r.json()
    assert len(body["site"]) == 4 and body["parkable_slots"] == 6
    xs, ys = [p[0] for p in body["site"]], [p[1] for p in body["site"]]
    assert 25 < max(xs) < 50 and 25 < max(ys) < 50


def test_site_needs_a_project_id(client):
    assert client.post("/optimizer/site", json={}).status_code == 400
    assert client.post("/optimizer/site", json={"project_id": "x"}).status_code == 400


def test_stalls_become_bays_for_the_camera(client):
    r = generate(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 6 and sorted(body["bays"]) == [f"S{i}" for i in range(1, 7)]
    assert body["skipped"]["island"] == 1

    # installed for the camera, with a calibration kept for it
    assert sorted(app_module._bay_maps[CAM].bay_ids) == sorted(body["bays"])
    assert app_module._calibrators[CAM].is_calibrated
    assert client.get(f"/occupancy/bays?camera_id={CAM}").json()["bays"].keys() == body["bays"].keys()
    # every bay is inside the frame and has area
    for ring in body["bays"].values():
        assert all(0 <= x <= 1280 and 0 <= y <= 720 for x, y in ring)


def test_mirrored_clicks_are_refused_and_the_old_layout_is_kept(client):
    assert generate(client).status_code == 200
    before = sorted(app_module._bay_maps[CAM].bay_ids)
    r = generate(client, MIRRORED_CLICKS)
    assert r.status_code == 400 and "mirrored" in r.json()["error"]
    assert sorted(app_module._bay_maps[CAM].bay_ids) == before


def _geojson():
    def ll(p):
        return [p["lng"], p["lat"]]
    ring = [ll(p) for p in BOUNDARY]
    def poly(kind, pts, **props):
        return {"type": "Feature", "properties": {"kind": kind, **props},
                "geometry": {"type": "Polygon", "coordinates": [pts + [pts[0]]]}}
    feats = [poly("site", ring + [ring[0], ring[0]])]
    for i in range(6):
        feats.append(poly("standard", [ll(p) for p in stall(i)], id=i + 1))
    feats.append(poly("island", [ll(p) for p in stall(6)], id=7))
    return {"type": "FeatureCollection", "features": feats}


def test_a_downloaded_geojson_works_without_the_optimizer_running(client, monkeypatch):
    def down(*a, **k):
        raise AssertionError("the optimizer must not be called for a GeoJSON upload")
    monkeypatch.setattr(app_module, "_optimizer", down)

    site = client.post("/optimizer/site", json={"geojson": _geojson(), "name": "yard.geojson"})
    assert site.status_code == 200, site.text
    body = site.json()
    assert body["name"] == "yard.geojson" and len(body["site"]) == 4 and body["parkable_slots"] == 6

    r = client.post("/occupancy/layout-from-optimizer", json={
        "camera_id": CAM, "layout_id": body["layout_id"], "corners_px": GOOD_CLICKS,
        "image_size": [1280, 720]})
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 6 and sorted(app_module._bay_maps[CAM].bay_ids) == [str(i) for i in range(1, 7)]


def test_a_corner_subset_can_be_chosen_for_outlines_with_extra_points(client):
    fc = _geojson()
    ring = fc["features"][0]["geometry"]["coordinates"][0]
    # a fifth point on the middle of the first edge: corners 1, 3, 4, 5 are then the real ones
    mid = [(ring[0][0] + ring[1][0]) / 2, (ring[0][1] + ring[1][1]) / 2]
    fc["features"][0]["geometry"]["coordinates"][0] = [ring[0], mid, ring[1], ring[2], ring[3], ring[0]]
    body = client.post("/optimizer/site", json={"geojson": fc}).json()
    assert len(body["site"]) == 5
    r = client.post("/occupancy/layout-from-optimizer", json={
        "camera_id": CAM, "layout_id": body["layout_id"], "corners_px": GOOD_CLICKS,
        "site_corner_idx": [0, 2, 3, 4], "image_size": [1280, 720]})
    assert r.status_code == 200, r.text


def test_geojson_problems_keep_their_own_message(client):
    r = client.post("/optimizer/site", json={"geojson": {"type": "FeatureCollection", "features": []}})
    assert r.status_code == 400 and "no site outline" in r.json()["error"]
    assert client.post("/optimizer/site", json={}).status_code == 400


def test_an_unknown_or_expired_layout_id_asks_to_show_the_outline_again(client):
    r = client.post("/occupancy/layout-from-optimizer", json={
        "camera_id": CAM, "layout_id": "gdoesnotexist", "corners_px": GOOD_CLICKS})
    assert r.status_code == 400 and "outline again" in r.json()["error"]


def test_bad_requests(client):
    assert client.post("/occupancy/layout-from-optimizer", json={"project_id": 1}).status_code == 400
    r = generate(client, GOOD_CLICKS[:3])
    assert r.status_code == 400 and "4 corners" in r.json()["error"]


def test_the_bridge_routes_are_not_available_on_the_public_link(client):
    for method, path in (("get", "/optimizer/projects"), ("post", "/optimizer/site"),
                         ("post", "/occupancy/layout-from-optimizer")):
        assert getattr(client, method)(path, headers=TUNNEL).status_code == 403


def test_the_older_import_layout_route_still_works_after_the_refactor(client):
    layout = {"slots": [{"id": "A", "ring": [[100, 100], [200, 100], [200, 220], [100, 220]]},
                        {"id": "B", "ring": [[210, 100], [310, 100], [310, 220], [210, 220]]}]}
    r = client.post("/occupancy/import-layout", json={"camera_id": CAM, "layout": layout})
    assert r.status_code == 200 and r.json()["bays_imported"] == 2
    assert sorted(app_module._bay_maps[CAM].bay_ids) == ["A", "B"]
    bad = client.post("/occupancy/import-layout", json={"camera_id": CAM, "layout": {"slots": []}})
    assert bad.status_code == 400
