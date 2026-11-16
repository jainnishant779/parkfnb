"""
The full-resolution photo: the phone is asked for one now and then, it is kept as it came for the
bay editor and evidence, and only an operator can read it back.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import state_store  # noqa: E402
from live import LiveSession  # noqa: E402

PROXY = {"X-Forwarded-For": "203.0.113.9"}


def jpeg(w=1280, h=720, v=120):
    img = np.full((h, w, 3), v, np.uint8)
    cv2.rectangle(img, (w // 4, h // 4), (w // 2, h // 2), (30, 200, 30), -1)
    ok, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def fake_process(frame, session):
    return {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": frame,
            "annotated_clean": frame, "plates": []}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_live_process", fake_process)
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))      # this machine: operator rights
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


@pytest.fixture
def visitor():
    return TestClient(app_module.app, client=("203.0.113.9", 40000))


def post_still(c, data, key=None, camera="phone-1", headers=None):
    return c.post("/live/still", files={"image": ("s.jpg", data, "image/jpeg")},
                  data={"camera_id": camera, "key": app_module.LIVE_KEY if key is None else key}, headers=headers or {})


def post_frame(c, camera="phone-1"):
    return c.post("/live/frame", files={"image": ("f.jpg", jpeg(640, 360), "image/jpeg")},
                  data={"camera_id": camera, "key": app_module.LIVE_KEY})


# ---- upload

def test_a_photo_needs_the_camera_key(client):
    assert post_still(client, jpeg(), key="wrong").status_code == 403
    assert post_still(client, jpeg(), key="").status_code == 403
    assert client.get("/console/api/still.jpg").status_code == 404                  # nothing was stored


def test_a_photo_that_is_not_a_picture_or_is_tiny_or_too_big_is_refused(client, monkeypatch):
    assert post_still(client, b"not a jpeg").status_code == 400
    assert post_still(client, jpeg(320, 180)).status_code == 400
    monkeypatch.setattr(app_module, "MAX_STILL_UPLOAD", 2000)
    assert post_still(client, jpeg()).status_code == 413
    assert client.get("/console/api/still.jpg").status_code == 404


def test_the_photo_is_kept_exactly_as_it_came_and_the_next_one_replaces_it(client):
    first, second = jpeg(1920, 1080, 90), jpeg(1920, 1080, 160)
    r = post_still(client, first)
    assert r.status_code == 201 and (r.json()["w"], r.json()["h"]) == (1920, 1080)
    got = client.get("/console/api/still.jpg")
    assert got.status_code == 200 and got.content == first and got.headers["x-still-size"] == "1920x1080"
    assert post_still(client, second).status_code == 201
    assert client.get("/console/api/still.jpg").content == second
    meta = client.get("/console/api/still-meta").json()["still"]
    assert meta["w"] == 1920 and meta["age_s"] < 5


def test_each_camera_keeps_its_own_photo_and_odd_camera_ids_are_cleaned(client):
    a, b = jpeg(1280, 720, 80), jpeg(1280, 720, 200)
    post_still(client, a, camera="cam-a")
    post_still(client, b, camera="../../etc/x")
    assert client.get("/console/api/still.jpg?camera_id=cam-a").content == a
    stills = Path(state_store.DATA_DIR) / "stills"
    assert all(p.resolve().parent == stills.resolve() for p in stills.iterdir())     # nothing escaped the folder


# ---- who can see it

def test_visitors_can_send_with_the_key_through_the_tunnel_but_cannot_read_anything_back(client, visitor):
    assert post_still(visitor, jpeg(), headers=PROXY).status_code == 201             # the phone is a remote client too
    assert post_still(visitor, jpeg(), key="wrong", headers=PROXY).status_code == 403
    for path in ("/console/api/still.jpg", "/console/api/still-meta"):
        assert visitor.get(path, headers=PROXY).status_code == 403
    assert visitor.post("/console/api/still-request", headers=PROXY).status_code == 403


# ---- asking the phone for one

def test_the_first_reply_asks_for_a_photo_then_not_again_straight_away(client):
    r = post_frame(client)
    assert r.status_code == 202 and r.json()["want_still"] is True
    assert post_frame(client).json()["want_still"] is False                          # a request is already on its way


def test_after_a_photo_arrives_the_phone_is_left_alone_until_the_interval_is_up(client, monkeypatch):
    monkeypatch.setattr(app_module, "STILL_EVERY_S", 120.0)
    post_frame(client)
    post_still(client, jpeg())
    session = app_module._live_sessions["phone-1"]
    session._still_asked_at = 0.0                                                    # past the gap between requests
    assert post_frame(client).json()["want_still"] is False                          # fresh photo
    session.last_still_at -= 121                                                     # now it is old
    session._still_asked_at = 0.0
    assert post_frame(client).json()["want_still"] is True


def test_with_the_interval_off_only_an_operators_request_asks(client, monkeypatch):
    monkeypatch.setattr(app_module, "STILL_EVERY_S", 0.0)
    assert post_frame(client).json()["want_still"] is False
    assert client.post("/console/api/still-request?camera_id=phone-1").json() == {"ok": True}
    assert post_frame(client).json()["want_still"] is True
    post_still(client, jpeg())                                                       # the photo arrived: the request is done
    app_module._live_sessions["phone-1"]._still_asked_at = 0.0
    assert post_frame(client).json()["want_still"] is False


def test_a_request_for_a_camera_that_never_sent_anything_is_a_404(client):
    assert client.post("/console/api/still-request?camera_id=nobody").status_code == 404


def test_want_still_on_a_bare_session():
    s = LiveSession("x", fake_process, Path("."))
    assert s.want_still(1000.0, 120.0) is True
    assert s.want_still(1005.0, 120.0) is False                                      # inside the 20 s gap
    s.got_still(1010.0)
    assert s.want_still(1040.0, 120.0) is False and s.want_still(1131.0, 120.0) is True
