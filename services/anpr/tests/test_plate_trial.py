"""
The area of interest and the plate trial: how big are the plates on a full-resolution photo of the lot, measured, not guessed.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import aoi  # noqa: E402
import app as app_module  # noqa: E402
import state_store  # noqa: E402

BAYS = {"1": [[400, 540], [600, 520], [580, 430], [480, 430]], "2": [[600, 520], [760, 500], [680, 420], [580, 430]]}


# ---- the area of interest

def test_the_area_is_the_bays_and_a_margin_kept_inside_the_picture():
    box = aoi.bays_aoi(BAYS, (1280, 720))
    assert box == {"x0": 310, "y0": 390, "x1": 850, "y1": 570}                  # bbox 400..760 x 420..540, grown by 25 % of its own size each way
    edge = aoi.bays_aoi({"1": [[10, 10], [300, 10], [300, 200], [10, 200]]}, (1280, 720))
    assert edge["x0"] == 0 and edge["y0"] == 0                                    # never outside the picture


def test_no_bays_or_a_sliver_gives_no_area():
    assert aoi.bays_aoi({}, (1280, 720)) is None and aoi.bays_aoi(None, (1280, 720)) is None
    assert aoi.bays_aoi({"1": [[5, 5], [6, 5]]}, (1280, 720)) is None
    assert aoi.bays_aoi({"1": [["x", 1], [2, "y"], [3, 3]]}, (1280, 720)) is None


def test_an_operators_box_is_checked_and_a_photo_of_the_same_view_scales_it():
    assert aoi.valid_aoi({"x0": 100, "y0": 200, "x1": 900, "y1": 600}, (1280, 720)) == {"x0": 100, "y0": 200, "x1": 900, "y1": 600}
    for bad in ({"x0": 900, "y0": 0, "x1": 100, "y1": 600}, {"x0": 0, "y0": 0, "x1": 2000, "y1": 600}, {"x0": 0, "y0": 0, "x1": 20, "y1": 20},
                {"x0": "a"}, None, [1, 2, 3, 4]):
        assert aoi.valid_aoi(bad, (1280, 720)) is None
    assert aoi.scale_aoi({"x0": 310, "y0": 390, "x1": 850, "y1": 570}, (1280, 720), (3840, 2160)) == {"x0": 930, "y0": 1170, "x1": 2550, "y1": 1710}


def test_plate_size_to_letter_height_to_verdict():
    r = aoi.plate_readability(150, 40)                                           # a plate 150 x 40 px: letters ~22 px
    assert r == {"width_px": 150, "height_px": 40, "char_px": 22.0, "verdict": "readable"}
    assert aoi.plate_readability(100, 30)["verdict"] == "marginal"               # ~16.5 px
    assert aoi.plate_readability(36, 9)["verdict"] == "too_small"                # what the live camera gave: ~5 px letters
    assert aoi.plate_readability(100, 36)["char_px"] == 19.8 and aoi.plate_readability(100, 36)["verdict"] == "marginal"


# ---- looking in tiles

def test_a_wide_picture_is_searched_in_overlapping_tiles_and_boxes_come_back_in_its_own_pixels():
    calls = []

    def run(part, size):
        calls.append((part.shape[1], size))
        return [{"cls": "plate", "box": [10.0, 20.0, 60.0, 40.0], "conf": 0.5}] if len(calls) == 2 else []
    crop = np.zeros((300, 4000, 3), np.uint8)
    out = app_module.tiled_detect(crop, run, tile=1600)
    assert len(calls) >= 3 and all(w <= 1600 for w, _ in calls)
    assert out[0]["box"][0] > 1000                                               # the second tile's box, shifted by its offset
    assert all(size % 32 == 0 for _, size in calls)


def test_the_same_plate_seen_in_two_tiles_is_kept_once():
    crop = np.zeros((200, 2400, 3), np.uint8)
    seen = {"n": 0}

    def run(part, size):
        seen["n"] += 1
        x = 1250 if seen["n"] == 1 else 450                                      # one plate at x=1250..1300, seen from both tiles (the second starts at 800)
        return [{"cls": "plate", "box": [x, 50.0, x + 50, 70.0], "conf": 0.4 + 0.1 * seen["n"]}]
    out = app_module.tiled_detect(crop, run, tile=1600)
    assert len(out) == 1 and out[0]["conf"] == pytest.approx(0.6)               # the more confident one (0.5 and 0.6 were seen)


def test_a_narrow_picture_is_one_pass():
    calls = []
    app_module.tiled_detect(np.zeros((300, 900, 3), np.uint8), lambda p, s: calls.append(s) or [])
    assert len(calls) == 1


# ---- the route

def jpeg(w, h):
    img = np.full((h, w, 3), 120, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def send_still(c, w=3840, h=2160):
    return c.post("/live/still", files={"image": ("s.jpg", jpeg(w, h), "image/jpeg")},
                  data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})


def test_no_photo_yet_is_a_clear_404(client):
    r = client.post("/console/api/plate-trial")
    assert r.status_code == 404 and "full-resolution photo" in r.json()["error"]


def test_the_trial_cuts_the_area_at_full_resolution_and_reports_each_plate_with_its_size(client, monkeypatch):
    state_store.save_camera("phone-1", {"bays": BAYS, "frame_size": [1280, 720]})
    assert send_still(client).status_code == 201
    seen = {}

    def fake(part, size):
        seen["shape"] = part.shape
        return [{"cls": "vehicle", "box": [100.0, 100.0, 900.0, 400.0], "conf": 0.9},
                {"cls": "plate", "box": [300.0, 200.0, 360.0, 218.0], "conf": 0.31},          # 60 x 18: too small
                {"cls": "plate", "box": [700.0, 100.0, 860.0, 140.0], "conf": 0.62}]          # 160 x 40: readable
    monkeypatch.setattr(app_module, "_plate_model_run", fake)
    monkeypatch.setattr(app_module, "PLATE_TILE_PX", 4000)                        # one pass over the whole area
    r = client.post("/console/api/plate-trial").json()
    assert seen["shape"][:2] == (540, 1620)                                       # the area, cut from the 3840 x 2160 photo
    assert r["still"]["w"] == 3840 and r["aoi"] == {"x0": 930, "y0": 1170, "x1": 2550, "y1": 1710}
    assert r["crop"] == {"w": 1620, "h": 540} and r["vehicles"] == 1 and r["readable"] == 1
    best, small = r["plates"]                                                     # most confident first
    assert best["verdict"] == "readable" and best["width_px"] == 160 and best["char_px"] == 22.0
    assert best["box"] == [700 + 930, 100 + 1170, 860 + 930, 140 + 1170]       # back in the photo's own pixels
    assert small["verdict"] == "too_small"
    pic = client.get(f"/console/api/plate-trial/{best['file']}.jpg")
    assert pic.status_code == 200 and pic.headers["content-type"] == "image/jpeg"
    assert cv2.imdecode(np.frombuffer(pic.content, np.uint8), cv2.IMREAD_COLOR).shape[1] > 160    # the plate with a margin


def test_with_no_bays_saved_the_whole_photo_is_searched_and_no_plates_is_an_answer(client, monkeypatch):
    send_still(client, 1920, 1080)
    monkeypatch.setattr(app_module, "_plate_model_run", lambda part, size: [])
    r = client.post("/console/api/plate-trial").json()
    assert r["aoi"] == {"x0": 0, "y0": 0, "x1": 1920, "y1": 1080} and r["plates"] == [] and r["readable"] == 0


def test_one_trial_at_a_time_and_old_crops_are_pruned(client, monkeypatch):
    send_still(client, 1920, 1080)
    monkeypatch.setattr(app_module, "_plate_model_run", lambda part, size: [
        {"cls": "plate", "box": [10.0, 10.0, 70.0, 30.0], "conf": 0.5}])
    assert app_module._plate_trial_lock.acquire(blocking=False)
    try:
        assert client.post("/console/api/plate-trial").status_code == 429
    finally:
        app_module._plate_trial_lock.release()
    monkeypatch.setattr(app_module, "PLATE_TRIAL_KEEP", 2)
    for _ in range(4):
        client.post("/console/api/plate-trial")
    assert len(list((state_store.DATA_DIR / "plate_trials" / "phone-1").glob("*.jpg"))) <= 2


def test_the_trial_and_its_pictures_are_for_operators_only(client, monkeypatch):
    send_still(client, 1920, 1080)
    monkeypatch.setattr(app_module, "_plate_model_run", lambda part, size: [
        {"cls": "plate", "box": [10.0, 10.0, 70.0, 30.0], "conf": 0.5}])
    name = client.post("/console/api/plate-trial").json()["plates"][0]["file"]
    visitor, proxy = TestClient(app_module.app, client=("203.0.113.9", 40000)), {"X-Forwarded-For": "203.0.113.9"}
    assert visitor.post("/console/api/plate-trial", headers=proxy).status_code == 403
    assert visitor.get(f"/console/api/plate-trial/{name}.jpg", headers=proxy).status_code == 403
    assert visitor.get("/console/api/aoi", headers=proxy).status_code == 403
    assert client.get("/console/api/plate-trial/..%2Fx.jpg").status_code == 404
    assert client.get("/console/api/plate-trial/nope.jpg").status_code == 404


def test_the_area_route_follows_the_saved_bays(client):
    assert client.get("/console/api/aoi").json()["aoi"] is None
    state_store.save_camera("phone-1", {"bays": BAYS, "frame_size": [1280, 720]})
    j = client.get("/console/api/aoi").json()
    assert j["aoi"] == {"x0": 310, "y0": 390, "x1": 850, "y1": 570} and j["layout_size"] == [1280, 720]
