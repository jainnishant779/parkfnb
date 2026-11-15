"""
Bay layouts are checked before they are saved, the layout they replace is kept, and a bad edit can be
undone.  Also: the optimizer GeoJSON import no longer turns obstacles into bays.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import state_store  # noqa: E402
from bay_validation import validate_bays  # noqa: E402

# phone-1 as it is saved on the pilot server (1280x720); bay 5 runs to the edge of the picture
PHONE1 = {
    "1": [[207.0, 683.0], [440.0, 657.0], [462.0, 511.0], [339.7, 511.0]],
    "2": [[673.0, 631.0], [601.0, 507.0], [462.0, 511.0], [440.0, 657.0]],
    "3": [[942.2, 605.1], [798.3, 452.2], [583.4, 480.8], [727.3, 633.7]],
    "4": [[1147.1, 557.6], [1010.1, 412.0], [788.3, 441.6], [925.3, 587.2]],
    "5": [[1023.3, 426.0], [1153.5, 564.4], [1279.0, 547.6], [1279.0, 406.9], [1266.5, 393.6]],
}
SIZE = (1280, 720)
SQ = [[100, 100], [200, 100], [200, 200], [100, 200]]


# ---- the checks

def test_the_real_pilot_layout_is_accepted():
    errors, warnings = validate_bays(PHONE1, SIZE)
    assert errors == [] and warnings == []


def test_the_clients_seven_bay_row_with_chalk_markings_is_accepted():
    fixture = json.loads((Path(__file__).resolve().parent.parent / "test_fixtures" / "client_plot_row7.json").read_text(encoding="utf-8"))
    bays = fixture["bays"]
    assert list(bays) == [str(i) for i in range(1, 8)]
    assert validate_bays(bays, tuple(fixture["image_size"])) == ([], [])
    xs = [min(p[0] for p in bays[str(i)]) for i in range(1, 8)]
    assert xs == sorted(xs)                                                    # Bay 1..7 run left to right
    front_widths = [bays[str(i)][1][0] - bays[str(i)][0][0] for i in range(1, 8)]
    assert front_widths[0] > front_widths[5]                                    # near stalls wider along road edge than far ones


def test_the_clients_eight_bay_row_on_the_second_angle_is_accepted():
    fixture = json.loads((Path(__file__).resolve().parent.parent / "test_fixtures" / "client_plot_row8.json").read_text(encoding="utf-8"))
    bays = fixture["bays"]
    assert list(bays) == [str(i) for i in range(1, 9)]
    assert validate_bays(bays, tuple(fixture["image_size"])) == ([], [])
    xs = [min(p[0] for p in bays[str(i)]) for i in range(1, 9)]
    assert xs == sorted(xs)                                                    # P1..P8 run left to right
    widths = [max(p[0] for p in bays[str(i)]) - min(p[0] for p in bays[str(i)]) for i in range(1, 9)]
    assert widths == sorted(widths, reverse=True) or widths[2] > widths[7]     # and get narrower with distance


def test_no_bays_or_wrong_types_are_refused():
    assert validate_bays({})[0] and validate_bays(None)[0] and validate_bays([SQ])[0]


@pytest.mark.parametrize("bad,why", [
    ({"a": [[0, 0], [10, 10]]}, "at least 3 corners"),
    ({"a": [[0, 0], [10, 0], [10, "x"]]}, "numbers"),
    ({"a": [[0, 0], [10, 0], [10, float("nan")]]}, "numbers"),
    ({"a": "not a list"}, "numbers"),
    ({"a": [[0, 0, 5], [10, 0, 5], [10, 10, 5]]}, "numbers"),
    ({"a": [[10, 10], [10, 10], [10, 10], [10, 10]]}, "too small"),
    ({"a": [[0, 0], [100, 0], [0, 100], [100, 100]]}, "crosses itself"),             # a bow-tie
    ({"": SQ}, "bay id"),
    ({"x" * 40: SQ}, "bay id"),
])
def test_unusable_bays_are_refused_with_a_reason(bad, why):
    errors, _ = validate_bays(bad, SIZE)
    assert errors and why in " ".join(errors), errors


def test_a_bay_outside_the_picture_is_refused_and_one_that_pokes_out_only_warned():
    assert "outside the picture" in " ".join(validate_bays({"a": [[2000, 100], [2100, 100], [2100, 200], [2000, 200]]}, SIZE)[0])
    poke = {"a": [[1200, 100], [1380, 100], [1380, 200], [1200, 200]]}                # 100 px past the edge
    errors, warnings = validate_bays(poke, SIZE)
    assert errors == [] and "outside the picture" in " ".join(warnings)


def test_the_smallest_allowed_bay_grows_with_the_picture():
    tiny = {"a": [[0, 0], [20, 0], [20, 20], [0, 20]]}                               # 400 px²
    assert validate_bays(tiny)[0] == []                                              # fine without a size
    assert "too small" in " ".join(validate_bays(tiny, (3840, 2160))[0])             # 400 < 0.05% of 4K


def test_overlapping_bays_are_warned_not_refused():
    a, b = SQ, [[150, 100], [250, 100], [250, 200], [150, 200]]                      # half covered
    errors, warnings = validate_bays({"a": a, "b": b}, SIZE)
    assert errors == [] and "overlap by 50%" in " ".join(warnings)
    touching = {"a": SQ, "b": [[200, 100], [300, 100], [300, 200], [200, 200]]}
    assert validate_bays(touching, SIZE) == ([], [])                                 # sharing an edge is normal


def test_too_many_bays_are_refused():
    many = {str(i): [[i, 0], [i + 1, 0], [i + 1, 40], [i, 40]] for i in range(300)}
    assert "too many" in validate_bays(many)[0][0]


# ---- the routes

LOCAL = ("127.0.0.1", 50000)
TOKEN = "k3m9r7hp2xw5cz8abtv4n6fdsj"
PROXY = {"X-Forwarded-For": "203.0.113.9"}


@pytest.fixture
def local(monkeypatch):
    for name in ("_live_sessions", "_bay_maps", "_trackers", "_registries", "_move_detectors"):
        monkeypatch.setattr(app_module, name, {})
    return TestClient(app_module.app, client=LOCAL)


def post(c, bays, camera="cam-b", **extra):
    return c.post("/occupancy/bays", json={"camera_id": camera, "view": "oblique", "bays": bays, **extra})


def test_a_good_layout_is_saved_with_its_picture_size_and_time(local):
    r = post(local, PHONE1, image_size=[1280, 720])
    assert r.status_code == 200 and r.json()["count"] == 5 and r.json()["warnings"] == []
    saved = state_store.load_camera("cam-b")
    assert saved["frame_size"] == [1280, 720] and saved["saved_at"].startswith("20") and len(saved["bays"]) == 5
    got = local.get("/occupancy/bays?camera_id=cam-b").json()
    assert got["frame_size"] == [1280, 720] and got["bays"].keys() == PHONE1.keys() and got["line"] is None


def test_saving_the_same_layout_again_only_fills_in_a_missing_picture_size(local):
    assert post(local, {"1": SQ}).status_code == 200                           # saved with no size known
    assert state_store.load_camera("cam-b").get("frame_size") is None
    again = post(local, {"1": SQ}, image_size=[1280, 720])
    assert again.json()["unchanged"] is True
    saved = state_store.load_camera("cam-b")
    assert saved["frame_size"] == [1280, 720] and saved["bays"] == {"1": SQ}
    assert state_store.list_backups("cam-b") == []                             # nothing was replaced, so nothing is kept
    post(local, {"1": SQ}, image_size=[640, 360])                              # a size that is already known is not overwritten
    assert state_store.load_camera("cam-b")["frame_size"] == [1280, 720]


def test_a_bad_layout_is_refused_and_the_old_one_is_untouched(local):
    assert post(local, {"1": SQ}).status_code == 200
    bad = post(local, {"1": [[0, 0], [100, 0], [0, 100], [100, 100]]})
    assert bad.status_code == 400 and "crosses itself" in bad.json()["error"] and bad.json()["errors"]
    assert state_store.load_camera("cam-b")["bays"] == {"1": SQ}
    assert local.get("/occupancy/bays?camera_id=cam-b").json()["bays"] == {"1": [[float(x), float(y)] for x, y in SQ]}


def test_the_picture_size_comes_from_the_live_camera_when_the_page_does_not_send_it(local):
    class FakeSession:
        counter = None
        def snapshot(self): return {"frame_size": [1280, 720]}
    app_module._live_sessions["cam-b"] = FakeSession()
    far = {"1": [[5000, 100], [5100, 100], [5100, 200], [5000, 200]]}
    assert "outside the picture" in post(local, far).json()["error"]


def test_each_save_keeps_the_layout_it_replaces_and_only_the_last_ten(local):
    for i in range(13):
        assert post(local, {"1": [[10 + i, 10], [110 + i, 10], [110 + i, 110], [10 + i, 110]]}).status_code == 200
    backups = local.get("/occupancy/bays/backups?camera_id=cam-b").json()["backups"]
    assert len(backups) == state_store.BACKUPS_KEPT == 10
    assert backups[0]["name"] > backups[-1]["name"]                                  # newest first
    # saving the identical layout again does not add a copy of itself
    n = len(backups)
    post(local, {"1": [[22, 10], [122, 10], [122, 110], [22, 110]]})
    assert len(local.get("/occupancy/bays/backups?camera_id=cam-b").json()["backups"]) == n


def test_a_backup_is_not_mistaken_for_a_camera(local):
    post(local, {"1": SQ})
    post(local, {"1": [[50, 50], [150, 50], [150, 150], [50, 150]]})
    assert list(state_store.load_cameras()) == ["cam-b"]


def test_an_earlier_layout_can_be_restored(local):
    post(local, {"1": SQ})
    post(local, {"1": [[300, 300], [400, 300], [400, 400], [300, 400]]})
    name = local.get("/occupancy/bays/backups?camera_id=cam-b").json()["backups"][0]["name"]
    r = local.post("/occupancy/bays/restore", json={"camera_id": "cam-b", "backup": name})
    assert r.status_code == 200 and r.json()["count"] == 1
    assert local.get("/occupancy/bays?camera_id=cam-b").json()["bays"]["1"][0] == [100.0, 100.0]
    # the layout that was replaced by the restore is itself kept, so the restore can be undone
    assert len(local.get("/occupancy/bays/backups?camera_id=cam-b").json()["backups"]) == 2


def test_restore_refuses_unknown_and_foreign_backups(local):
    post(local, {"1": SQ})
    post(local, {"1": [[50, 50], [150, 50], [150, 150], [50, 150]]})
    post(local, {"1": SQ}, camera="cam-other")
    post(local, {"1": [[60, 60], [160, 60], [160, 160], [60, 160]]}, camera="cam-other")
    other = state_store.list_backups("cam-other")[0]["name"]
    for name in ("nope.json", "../cameras/cam-b.json", other, ""):
        r = local.post("/occupancy/bays/restore", json={"camera_id": "cam-b", "backup": name})
        assert r.status_code in (400, 404), name
    assert local.post("/occupancy/bays/restore", json={"camera_id": "cam-b"}).status_code == 400


def test_a_backup_that_is_no_longer_valid_cannot_be_restored(local):
    post(local, {"1": SQ})
    post(local, {"1": [[50, 50], [150, 50], [150, 150], [50, 150]]})
    name = state_store.list_backups("cam-b")[0]["name"]
    path = state_store._backup_dir() / name
    path.write_text('{"view":"oblique","bays":{"1":[[0,0],[10,10]]}}', encoding="utf-8")
    r = local.post("/occupancy/bays/restore", json={"camera_id": "cam-b", "backup": name})
    assert r.status_code == 400 and "cannot be used" in r.json()["error"]


def test_the_new_routes_are_private(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", TOKEN)
    web = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert web.get("/occupancy/bays/backups?camera_id=x", headers=PROXY).status_code == 403
    assert web.post("/occupancy/bays/restore", json={}, headers=PROXY).status_code == 403
    assert web.post("/occupancy/bays", json={"bays": {"1": SQ}}, headers=PROXY).status_code == 403
    cookie = {"Cookie": f"parkfnb_admin={TOKEN}"}
    assert web.get("/occupancy/bays/backups?camera_id=x", headers={**PROXY, **cookie}).status_code == 200


def test_the_optimizer_import_refuses_a_layout_that_does_not_fit_the_picture(local, monkeypatch):
    def refuse(*a, **k):
        raise app_module.LayoutError("bay 1: too small (3 px², at least 25)")
    monkeypatch.setattr(app_module, "layout_to_bays", lambda *a, **k: {"bays": {"1": SQ}, "skipped": {}, "warnings": []})
    monkeypatch.setitem(app_module._optimizer_layouts, "g1", {"name": "n", "layout": {"site": []}})
    monkeypatch.setattr(app_module, "_install_bays", refuse)
    r = local.post("/occupancy/layout-from-optimizer",
                   json={"camera_id": "cam-b", "layout_id": "g1", "corners_px": [[0, 0], [1, 0], [1, 1], [0, 1]]})
    assert r.status_code == 400 and "too small" in r.json()["error"]


# ---- optimizer GeoJSON

def test_obstacles_and_access_lanes_in_the_export_are_not_bays():
    from optimizer_bridge import geojson_to_metres
    from test_optimizer_bridge import _fc
    fc = _fc()
    base = fc["features"][2]["geometry"]
    for kind, fid in (("obstacle", 1), ("access_lane", 2), ("exit", 1)):
        fc["features"].append({"type": "Feature", "properties": {"kind": kind, "id": fid}, "geometry": base})
    out = geojson_to_metres(fc)
    assert [(s["id"], s["type"]) for s in out["slots"]] == [(1, "standard"), (2, "accessible"), (3, "island")]
