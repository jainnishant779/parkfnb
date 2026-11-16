"""
"Check 3D" before saving: the operator learns whether parking can be judged with the bays as drawn.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import state_store  # noqa: E402
from calibration import fit_site_calibration  # noqa: E402
from synthetic_scene import Camera as SynCam, Stall, W, H_IMG, bay_polygon  # noqa: E402

FIXTURE = json.loads((Path(__file__).resolve().parent.parent / "test_fixtures" / "client_plot_row8.json").read_text(encoding="utf-8"))
BAYS, SIZE = FIXTURE["bays"], FIXTURE["image_size"]
TOKEN = "k3m9r7hp2xw5cz8abtv4n6fdsj"
PROXY = {"X-Forwarded-For": "203.0.113.9"}


@pytest.fixture
def local(monkeypatch):
    for name in ("_live_sessions", "_bay_maps", "_trackers", "_registries", "_move_detectors"):
        monkeypatch.setattr(app_module, name, {})
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def preview(c, bays=BAYS, size=SIZE, camera="cam-p"):
    return c.post("/occupancy/calibration-preview", json={"camera_id": camera, "bays": bays, "image_size": size})


def test_the_report_matches_what_the_live_path_will_fit(local):
    r = preview(local)
    assert r.status_code == 200
    j = r.json()
    want = fit_site_calibration({k: [list(map(float, p)) for p in v] for k, v in BAYS.items()}, tuple(SIZE))
    assert j["ready"] is (want.camera is not None) and j["total"] == len(BAYS) == 8
    assert j["good_bays"] == sum(1 for b in want.bays.values() if b.status == "good")
    assert {k: b["status"] for k, b in j["bays"].items()} == {k: b.status for k, b in want.bays.items()}
    assert j["min_good_bays"] == 2 and j["image_size"] == SIZE


def synthetic_row(n=5):
    cam = SynCam(6, 45)
    return {f"B{i}": bay_polygon(cam, Stall(x_center=-5.0 + 2.5 * i, y_near=5.0)) for i in range(n)}


def test_bays_that_match_a_real_camera_come_back_good_with_the_camera_recovered(local):
    j = preview(local, synthetic_row(), [W, H_IMG]).json()
    assert j["ready"] and j["good_bays"] == j["total"] == 5
    assert j["camera"]["height_m"] == pytest.approx(6, rel=0.01) and j["camera"]["pitch_deg"] == pytest.approx(45, abs=0.2)
    assert all(b["status"] == "good" and b["margin_m"] < 0.05 for b in j["bays"].values())


def test_one_bay_drawn_wrongly_is_picked_out_while_the_camera_is_still_recovered(local):
    bays = synthetic_row()
    bays["B2"] = bay_polygon(SynCam(6, 45), Stall(x_center=0.0, y_near=5.0, length=2.5))      # drawn half length
    j = preview(local, bays, [W, H_IMG]).json()
    assert j["ready"] and j["bays"]["B2"]["status"] != "good"
    assert sum(b["status"] == "good" for b in j["bays"].values()) == 4 == j["good_bays"]


def test_a_nudged_corner_shows_up_in_that_bays_numbers(local):
    bays = synthetic_row()
    exact = preview(local, bays, [W, H_IMG]).json()["bays"]
    moved = {k: [list(p) for p in v] for k, v in bays.items()}
    moved["B1"][1][0] += 30                                                                     # one corner, 30 px sideways
    after = preview(local, moved, [W, H_IMG]).json()["bays"]
    assert exact["B1"]["reproj_px"] < 0.1
    assert after["B1"]["reproj_px"] > 5 and after["B1"]["margin_m"] > 0.05                      # its error, in pixels and metres
    assert after["B1"]["reproj_px"] > 3 * max(after[k]["reproj_px"] for k in ("B2", "B3", "B4"))   # and it is the worst bay


def test_every_bay_reports_its_fit_error_in_pixels_and_metres_and_what_it_measures(local):
    j = preview(local).json()
    for bid, b in j["bays"].items():
        assert set(b) >= {"status", "reproj_px", "margin_m", "measured_m", "dimension_error"}
        if b["status"] != "rejected":
            assert b["margin_m"] is not None and b["margin_m"] >= 0
            assert len(b["measured_m"]) == 2
    assert j["camera"] is None or {"height_m", "pitch_deg", "focal_px"} <= set(j["camera"])


def test_nothing_is_saved_by_a_preview(local):
    preview(local)
    assert state_store.load_camera("cam-p") == {} and "cam-p" not in app_module._bay_maps
    assert state_store.list_backups("cam-p") == []


def test_a_row_the_fit_cannot_use_says_so_instead_of_pretending(local):
    one = {"1": BAYS["1"]}                                        # a single bay cannot validate a camera
    j = preview(local, one).json()
    assert j["ready"] is False and j["good_bays"] < j["min_good_bays"]


def test_a_layout_that_could_not_be_saved_cannot_be_previewed(local):
    bow = {"1": [[0, 0], [100, 0], [0, 100], [100, 100]]}
    r = preview(local, bow)
    assert r.status_code == 400 and "crosses itself" in r.json()["error"]


def test_the_picture_size_is_needed(local):
    r = local.post("/occupancy/calibration-preview", json={"camera_id": "cam-x", "bays": BAYS})
    assert r.status_code == 400 and "picture size" in r.json()["error"]


def test_the_live_picture_size_is_used_when_the_page_sends_none(local):
    class S:
        counter = None
        def snapshot(self): return {"frame_size": SIZE}
    app_module._live_sessions["cam-q"] = S()
    r = local.post("/occupancy/calibration-preview", json={"camera_id": "cam-q", "bays": BAYS})
    assert r.status_code == 200 and r.json()["image_size"] == SIZE


def test_bad_requests_get_a_plain_400(local):
    assert local.post("/occupancy/calibration-preview", content=b"nope").status_code == 400
    assert local.post("/occupancy/calibration-preview", json={"camera_id": "c"}).status_code == 400


def test_a_visitor_cannot_use_it(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", TOKEN)
    web = TestClient(app_module.app, client=("203.0.113.9", 40000))
    r = web.post("/occupancy/calibration-preview", json={"bays": BAYS, "image_size": SIZE}, headers=PROXY)
    assert r.status_code == 403
