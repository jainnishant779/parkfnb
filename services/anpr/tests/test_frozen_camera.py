"""
A phone whose camera has frozen keeps uploading the last picture it had.  On 28 Oct the console said "Live" (frame age 0.4 s,
the frame counter climbing) while eight uploads in a row had the same md5 and the picture never changed.  A real camera never
sends the same JPEG twice, so a run of identical ones is a frozen camera: it must not count as a live feed, and the phone must
be told so it can restart its camera.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import live  # noqa: E402
from live import LiveSession  # noqa: E402


def jpg(seed):
    img = np.random.default_rng(seed).integers(0, 255, (90, 160, 3), dtype=np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    return img, buf.tobytes()


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setattr(live, "FREEZE_AFTER_SAME", 4)
    s = LiveSession("c", lambda f, o: {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": f}, tmp_path)
    yield s
    s.stop()


def test_new_pictures_each_time_are_a_live_feed(session):
    for i in range(10):
        img, raw = jpg(i)
        session.submit(img, raw)
    assert session.frozen is False and session.frames_in == 10


def test_the_same_picture_over_and_over_is_a_frozen_camera_and_stops_counting_as_live(session):
    img, raw = jpg(1)
    session.submit(img, raw)
    for _ in range(5):                                            # the phone sends that picture again and again: frozen
        session.submit(img, raw)
    assert session.frozen is True
    session.last_frame_at = time.time() - 30                      # half a minute later it is still sending that picture
    for _ in range(3):
        session.submit(img, raw)
    assert time.time() - session.last_frame_at > 25               # the repeats did not make it look fresh
    snap = session.snapshot()
    assert snap["frozen"] is True and snap["online"] is False


def test_a_real_new_picture_ends_the_freeze(session):
    img, raw = jpg(1)
    for _ in range(8):
        session.submit(img, raw)
    assert session.frozen
    img2, raw2 = jpg(2)
    session.submit(img2, raw2)
    assert session.frozen is False and time.time() - session.last_frame_at < 2


def test_a_couple_of_repeats_are_not_a_freeze(session):
    img, raw = jpg(1)
    for _ in range(3):                                            # 1 first + 2 repeats: under the limit of 4
        session.submit(img, raw)
    assert session.frozen is False


def test_the_phones_reply_tells_it_the_camera_froze(monkeypatch):
    from fastapi.testclient import TestClient
    import app as app_module
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(live, "FREEZE_AFTER_SAME", 3)
    monkeypatch.setattr(app_module, "_live_process", lambda f, s: {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": f})
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    _, raw = jpg(5)
    replies = [c.post("/live/frame", files={"image": ("f.jpg", raw, "image/jpeg")}, data={"camera_id": "phone-1", "key": app_module.LIVE_KEY}).json()
               for _ in range(5)]
    assert [r["frozen"] for r in replies] == [False, False, False, True, True]
    for s in app_module._live_sessions.values():
        s.stop()
