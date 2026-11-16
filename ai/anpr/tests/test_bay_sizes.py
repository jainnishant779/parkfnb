"""
Real stall sizes.  Every distance the system reports is in metres of a stall assumed to be 2.5 x 5.0 m (contact.py); `BayMap(bay_sizes=)`
was never given anything.  Somebody with a tape measure can now say what the stalls are, per bay, and the calibration is fitted on that.
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import contact  # noqa: E402

ROW = {f"Bay-0{i}": [[80 + 190 * (i - 1), 400], [270 + 190 * (i - 1), 400], [290 + 190 * (i - 1), 600], [60 + 190 * (i - 1), 600]]
       for i in range(1, 5)}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    app_module._install_bays("sizes-cam", ROW, "oblique", image_size=(1280, 720))
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    app_module._layout_sizes.pop("sizes-cam", None)


def get(client):
    return client.get("/console/api/bay-sizes?camera_id=sizes-cam").json()


def test_with_nothing_measured_every_stall_is_the_default(client):
    got = get(client)
    assert got["default"] == [contact.STALL_WIDTH_M, contact.STALL_LENGTH_M]
    assert all(not b["measured"] and (b["width_m"], b["length_m"]) == (2.5, 5.0) for b in got["bays"].values())


def test_a_measured_stall_reaches_the_bay_frame_and_the_calibration(client):
    r = client.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {"Bay-02": [2.4, 4.6]}})
    assert r.status_code == 200 and r.json()["bays"]["Bay-02"] == {"width_m": 2.4, "length_m": 4.6, "measured": True}
    bm = app_module._bay_maps["sizes-cam"]
    assert bm._bay_sizes == {"Bay-02": (2.4, 4.6)}
    assert (bm.frames["Bay-02"].width_m, bm.frames["Bay-02"].length_m) == (2.4, 4.6)
    assert (bm.frames["Bay-01"].width_m, bm.frames["Bay-01"].length_m) == (2.5, 5.0)         # the others stay the default


def test_the_sizes_survive_a_restart_and_a_new_drawing_of_the_same_bays(client):
    client.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {"Bay-03": [2.3, 4.5]}})
    app_module._install_bays("sizes-cam", ROW, "oblique", restoring=True, image_size=[1280, 720])           # a restart
    assert app_module._bay_maps["sizes-cam"]._bay_sizes == {"Bay-03": (2.3, 4.5)}
    app_module._install_bays("sizes-cam", ROW, "oblique", image_size=(1280, 720))                           # the editor publishes again
    assert app_module._bay_maps["sizes-cam"]._bay_sizes == {"Bay-03": (2.3, 4.5)}


def test_null_puts_a_bay_back_to_the_default(client):
    client.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {"Bay-01": [2.2, 4.4], "Bay-02": [2.4, 4.6]}})
    client.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {"Bay-01": None}})
    assert app_module._bay_maps["sizes-cam"]._bay_sizes == {"Bay-02": (2.4, 4.6)}


def test_a_typo_or_an_unknown_bay_is_refused_and_nothing_changes(client):
    for body in ({"sizes": {"Bay-01": [25, 5.0]}}, {"sizes": {"Bay-01": [2.5, 0.5]}}, {"sizes": {"Bay-99": [2.5, 5.0]}},
                 {"sizes": {"Bay-01": "wide"}}, {"sizes": [1, 2]}, {"nothing": 1}):
        assert client.post("/console/api/bay-sizes?camera_id=sizes-cam", json=body).status_code == 400, body
    assert app_module._bay_maps["sizes-cam"]._bay_sizes == {}


def test_changing_the_metres_does_not_end_the_open_cars_and_violations(client):
    import time
    now = time.time()
    app_module._arrival_book("sizes-cam").open("Bay-01", 1, now - 60, [1, 2, 3, 4], [1280, 720])
    app_module._violation_book("sizes-cam").open("Bay-02", "over_line", now - 60, "x", 0.3, "left")
    client.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {"Bay-01": [2.4, 4.8]}})
    assert app_module._arrival_book("sizes-cam").list()[0]["left"] is None
    assert app_module._violation_book("sizes-cam").list()[0]["closed"] is None


def test_only_an_admin_may_change_the_stall_sizes(client):
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    proxy = {"X-Forwarded-For": "203.0.113.9"}
    assert visitor.get("/console/api/bay-sizes?camera_id=sizes-cam", headers=proxy).status_code == 403
    assert visitor.post("/console/api/bay-sizes?camera_id=sizes-cam", json={"sizes": {}}, headers=proxy).status_code == 403
