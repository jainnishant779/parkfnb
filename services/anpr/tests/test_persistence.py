"""
State that must survive a restart (bays, IN/OUT line, totals, plate setting), the proxy-header rule,
and the switch that turns OCR off for small servers.
"""
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import state_store  # noqa: E402

CAM = "persist-1"
BAYS = {"A1": [[100, 100], [200, 100], [200, 220], [100, 220]],
        "A2": [[210, 100], [310, 100], [310, 220], [210, 220]]}


# ---- the store itself

def test_save_and_load_roundtrip_and_merge():
    state_store.save_camera(CAM, {"view": "oblique", "bays": BAYS})
    state_store.save_camera(CAM, {"line": {"p1": [0, 1], "p2": [2, 3], "in_point": [4, 5]}})
    st = state_store.load_camera(CAM)
    assert st["bays"] == BAYS and st["view"] == "oblique" and st["line"]["in_point"] == [4, 5]
    state_store.save_camera(CAM, {"line": None})
    assert state_store.load_camera(CAM)["line"] is None and state_store.load_camera(CAM)["bays"] == BAYS


def test_no_temporary_files_are_left_behind():
    for i in range(5):
        state_store.save_camera(CAM, {"n": i})
    assert [p.name for p in (state_store.DATA_DIR / "cameras").iterdir()] == [f"{CAM}.json"]


def test_camera_ids_are_made_safe_for_file_names():
    state_store.save_camera("../../evil", {"x": 1})
    assert [p.name for p in (state_store.DATA_DIR / "cameras").iterdir()] == ["evil.json"]
    assert state_store.load_camera("../../evil") == {"x": 1}


def test_a_missing_or_corrupt_file_reads_as_empty():
    assert state_store.load_camera("nothing-here") == {}
    folder = state_store.DATA_DIR / "cameras"
    folder.mkdir(parents=True)
    (folder / "broken.json").write_text("{not json", encoding="utf-8")
    (folder / "list.json").write_text("[1, 2]", encoding="utf-8")
    assert state_store.load_camera("broken") == {} and state_store.load_camera("list") == {}
    assert state_store.load_cameras() == {}


def test_saving_never_raises_even_when_the_disk_is_unusable(monkeypatch, tmp_path):
    blocker = tmp_path / "a-file"
    blocker.write_text("x")
    monkeypatch.setattr(state_store, "DATA_DIR", blocker / "inside")      # cannot create a folder in a file
    state_store.save_camera(CAM, {"a": 1})                               # must only print
    assert state_store.load_cameras() == {}


# ---- through the app

@dataclass
class T:
    track_id: int
    x1: float
    y1: float
    x2: float
    y2: float


@pytest.fixture
def client(monkeypatch):
    for name in ("_bay_maps", "_trackers", "_mot_trackers", "_calibrators", "_registries", "_profiles",
                 "_thresholds", "_live_sessions"):
        monkeypatch.setattr(app_module, name, {})
    yield TestClient(app_module.app, client=("127.0.0.1", 50000))
    for s in app_module._live_sessions.values():
        s.stop()


def forget_everything():
    """What a restart does to the in-memory state."""
    for s in app_module._live_sessions.values():
        s.stop()
    for d in (app_module._bay_maps, app_module._trackers, app_module._live_sessions,
              app_module._registries, app_module._profiles, app_module._thresholds):
        d.clear()


def test_bays_line_totals_and_plate_setting_come_back_after_a_restart(client):
    assert client.post("/occupancy/bays", json={"camera_id": CAM, "view": "oblique", "bays": BAYS}).status_code == 200
    assert client.post("/live/config", json={"camera_id": CAM, "line": [[0, 150], [320, 150]],
                                              "in_point": [160, 40], "read_plates": False}).status_code == 200
    session = app_module._live_session(CAM)
    session.counter.count_in, session.counter.count_out = 7, 2
    app_module._save_live(session)

    forget_everything()
    assert CAM not in app_module._bay_maps
    app_module._restore_state()

    assert sorted(app_module._bay_maps[CAM].bay_ids) == ["A1", "A2"]
    s = app_module._live_sessions[CAM]
    assert s.counter.config()["in_point"] == [160.0, 40.0]
    assert (s.counter.count_in, s.counter.count_out, s.counter.inside) == (7, 2, 5)
    assert s.read_plates is False


def test_a_layout_posted_again_unchanged_is_still_saved_once_and_correct(client):
    body = {"camera_id": CAM, "view": "oblique", "bays": BAYS}
    client.post("/occupancy/bays", json=body)
    client.post("/occupancy/bays", json=body)                      # the page resends it before every check
    assert state_store.load_camera(CAM)["bays"] == BAYS


def test_an_optimizer_layout_is_saved_too(client):
    layout = {"slots": [{"id": "A", "ring": [[100, 100], [200, 100], [200, 220], [100, 220]]}]}
    assert client.post("/occupancy/import-layout", json={"camera_id": CAM, "layout": layout}).status_code == 200
    assert list(state_store.load_camera(CAM)["bays"]) == ["A"]


def test_reset_is_saved(client):
    client.post("/live/config", json={"camera_id": CAM, "line": [[0, 150], [320, 150]], "in_point": [160, 40]})
    session = app_module._live_session(CAM)
    session.counter.count_in = 4
    app_module._save_live(session)
    client.post("/live/reset", json={"camera_id": CAM})
    assert state_store.load_camera(CAM)["counts"] == {"in": 0, "out": 0}


def test_totals_are_saved_when_a_car_crosses_the_line(client, monkeypatch):
    ys = iter([220, 200, 180, 160, 140, 120, 100, 100, 100, 100])

    def fake_process(frame, session):
        y = next(ys, 100)
        return {"tracked": [T(1, 100, y - 40, 180, y)], "summary": {}, "bays": {}, "bay_events": [],
                "annotated": frame}
    monkeypatch.setattr(app_module, "_live_process", fake_process)
    client.post("/live/config", json={"camera_id": CAM, "line": [[0, 150], [320, 150]], "in_point": [160, 40]})
    ok, buf = cv2.imencode(".jpg", np.full((240, 320, 3), 90, np.uint8))
    for i in range(1, 8):
        r = client.post(f"/live/frame-raw?camera_id={CAM}", content=buf.tobytes(),
                        headers={"X-Camera-Key": app_module.LIVE_KEY, "Content-Type": "image/jpeg"})
        assert r.status_code == 202
        end = time.time() + 5
        while time.time() < end and client.get(f"/live/state?camera_id={CAM}").json()["frames_processed"] < i:
            time.sleep(0.02)
    assert state_store.load_camera(CAM)["counts"] == {"in": 1, "out": 0}


def test_one_unreadable_saved_camera_does_not_stop_the_others(client):
    state_store.save_camera("good", {"view": "oblique", "bays": BAYS})
    state_store.save_camera("bad", {"view": "oblique", "bays": {"X": [[1, 1]]}})      # not a polygon
    app_module._restore_state()
    assert "good" in app_module._bay_maps and "bad" not in app_module._bay_maps


# ---- proxy headers: a reverse proxy on this machine must not make visitors look local

@pytest.mark.parametrize("header", ["X-Forwarded-For", "X-Real-IP", "Forwarded", "X-Forwarded-Host"])
def test_a_request_with_proxy_headers_is_treated_as_remote_even_from_loopback(client, header):
    assert client.get("/live/setup").status_code == 200                              # genuinely local
    r = client.get("/live/setup", headers={header: "203.0.113.9"})
    assert r.status_code == 403 and app_module.LIVE_KEY not in r.text
    assert client.get("/live/state", headers={header: "203.0.113.9"}).status_code == 200   # public stays public


def test_proxy_header_rule_in_is_remote():
    from live import is_remote
    assert not is_remote("127.0.0.1", {"host": "localhost:8008"})
    assert is_remote("127.0.0.1", {"x-forwarded-for": "198.51.100.4"})
    assert is_remote("127.0.0.1", {"forwarded": "for=198.51.100.4"})


# ---- OCR switch for small servers

def test_ocr_can_be_switched_off_without_importing_any_ocr_engine(monkeypatch):
    monkeypatch.setenv("ANPR_OCR", "none")
    for name in ("easyocr", "paddleocr"):
        monkeypatch.setitem(sys.modules, name, None)                  # importing either would now fail
    from detector import Detector
    assert Detector._load_ocr() == ("none", None)
    for value in ("off", "0", "false", "NONE"):
        monkeypatch.setenv("ANPR_OCR", value)
        assert Detector._load_ocr() == ("none", None)
