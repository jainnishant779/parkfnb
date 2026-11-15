"""
30 Oct: the phone's pictures reached the server every 5.0 s exactly while each upload took 0.2 s.  The page now says how its own loop runs
(time since its last picture, time to draw and encode, hidden or not) and the server keeps it with the uplink figures.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
from live import LiveSession  # noqa: E402


def test_the_phones_own_timings_are_summarised_with_the_uplink(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    s.note_upload(200, 90_000)
    for tick, enc, hidden in ((5000, 40, False), (5100, 42, False), (4900, 38, False), (5000, 900, True)):
        s.note_phone(tick, enc, hidden)
    ph = s.uplink()["phone"]
    assert ph["tick_p50_ms"] == 5000 and ph["encode_worst_ms"] == 900 and ph["hidden_share"] == 0.25 and ph["n"] == 4


def test_nonsense_timings_are_ignored(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    s.note_upload(200, 90_000)
    s.note_phone(-5, 10, False)
    s.note_phone(1e9, 10, False)
    s.note_phone(0, 10, False)                                 # the first picture has no "since the last one"
    assert "phone" not in s.uplink()


def test_the_frame_route_takes_the_new_fields_and_old_pages_still_work(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    ok, jpg = cv2.imencode(".jpg", np.random.RandomState(1).randint(0, 255, (72, 128, 3), np.uint8))
    key = app_module.LIVE_KEY

    def post(**extra):
        return c.post("/live/frame", files={"image": ("f.jpg", jpg.tobytes(), "image/jpeg")}, data={"camera_id": "tel-cam", "key": key, **extra})

    assert post(up_ms="150", tick_ms="5000", enc_ms="40", vis="v").status_code == 202
    assert post().status_code == 202                           # an old page sends none of them
    assert post(up_ms="150", tick_ms="junk", enc_ms="x").status_code == 202                 # a bad number never refuses a picture
    up = app_module._live_sessions["tel-cam"].uplink()
    assert up["phone"]["tick_p50_ms"] == 5000 and up["phone"]["n"] == 1
    for s in app_module._live_sessions.values():
        s.stop()