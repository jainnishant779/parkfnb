"""
Close-ups instead of full photos.  On 28 Oct the console kept saying "camera offline" for 15-20 s at a time, right after the phone
was asked for a full-resolution photo: a 2-4 MB upload on a weak uplink holds the live pictures back.  The phone is now asked for
a close-up of each car that has just parked (the phone cuts it from its own photo; tens of KB), and measures how long its uploads
take so the console can show the uplink's health.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import arrivals  # noqa: E402
import live  # noqa: E402
from live import LiveSession  # noqa: E402

PROXY = {"X-Forwarded-For": "203.0.113.9"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(app_module, "ARRIVAL_SETTLE_S", 0.0)
    monkeypatch.setattr(app_module, "_crop_asked", {})
    monkeypatch.setattr(app_module, "_last_crop_at", {})
    monkeypatch.setattr(app_module, "_crops_checked", {})
    monkeypatch.setattr(app_module.plate_ocr, "clarity", lambda tile: {"edge": 99.0, "contrast": 200.0, "clear": True})   # flat grey test "plates"
    monkeypatch.setattr(app_module, "CROP_CHECK_GAP_S", 0.0)       # the pictures in these tests come one after another, not a second apart


def test_the_register_is_looked_at_once_every_few_seconds_not_on_every_picture(monkeypatch):
    monkeypatch.setattr(app_module, "CROP_CHECK_GAP_S", 3.0)
    looked = []

    class Spy:
        def want_crop(self, now, settle):
            looked.append(now)
            return []
    monkeypatch.setattr(app_module, "_arrival_book", lambda cid: Spy())
    for t in (100.0, 100.5, 101.0, 102.9, 103.1):
        app_module._crops_to_ask("cam", None, t)
    assert looked == [100.0, 103.1]


def book(tmp_path):
    return arrivals.ArrivalBook(tmp_path / "arrivals" / "cam.json", "cam")


# ---- which cars a close-up is wanted of

def test_a_car_that_has_stopped_is_wanted_and_one_that_just_arrived_or_has_left_is_not(tmp_path):
    b = book(tmp_path)
    now = 1000.0
    old = b.open("A", 1, now - 30, [1, 2, 3, 4], [1280, 720])
    new = b.open("B", 2, now - 2, [1, 2, 3, 4], [1280, 720])
    gone = b.open("C", 3, now - 30, [1, 2, 3, 4], [1280, 720]); b.close("C", now - 20)
    assert [r["id"] for r in b.want_crop(now, settle_s=8)] == [old["id"]]


def test_an_unconfirmed_plate_is_looked_at_again_after_a_pause_and_a_confirmed_one_is_left(tmp_path):
    b = book(tmp_path)
    now = 5000.0
    a = b.open("A", 1, 100.0, [1, 2, 3, 4], [1280, 720]); b.update(a["id"], photo=True, last_look=now - 10, reads=[{}])
    c = b.open("C", 3, 100.0, [1, 2, 3, 4], [1280, 720]); b.update(c["id"], photo=True, last_look=now - 100, reads=[{}, {}], confirmed=True)
    assert b.want_crop(now, recheck_gap_s=45) == []                                     # looked at 10 s ago: not yet
    assert [r["id"] for r in b.want_crop(now + 60, recheck_gap_s=45)] == [a["id"]]      # a minute later: again; the confirmed one never


# ---- the phone's reply asks for them

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_arrival_books", {})
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def frame_jpg(seed=1, w=160, h=90):
    img = np.random.default_rng(seed).integers(0, 255, (h, w, 3), dtype=np.uint8)
    return cv2.imencode(".jpg", img)[1].tobytes()


def post_frame(c, seed, **form):
    return c.post("/live/frame", files={"image": ("f.jpg", frame_jpg(seed), "image/jpeg")},
                  data={"camera_id": "phone-1", "key": app_module.LIVE_KEY, **form}).json()


def test_the_reply_to_a_picture_asks_for_a_close_up_of_each_stopped_car_but_not_twice_in_a_row(client):
    post_frame(client, 1)                                                              # creates the session
    session = app_module._live_sessions["phone-1"]
    ev = {"t": time.time() - 20, "type": "bay_occupied", "bay_id": "Bay-04", "track_id": 7, "box": [800, 380, 1000, 470], "frame_size": [1280, 720]}
    app_module._on_live_event(session, ev, None, None)
    first = post_frame(client, 2)
    assert [c["box"] for c in first["want_crops"]] == [[800, 380, 1000, 470]] and first["want_crops"][0]["frame_size"] == [1280, 720]
    assert post_frame(client, 3)["want_crops"] == []                                   # just asked: give the phone time
    assert post_frame(client, 4).get("want_still") is not True                         # and no full photo is asked for


def test_an_old_camera_page_that_sends_no_close_ups_falls_back_to_the_full_photo(client, monkeypatch):
    post_frame(client, 1)
    session = app_module._live_sessions["phone-1"]
    session.still_requested = False
    app_module._on_live_event(session, {"t": time.time() - 100, "type": "bay_occupied", "bay_id": "Bay-04", "track_id": 7, "box": [1, 2, 300, 200], "frame_size": [1280, 720]}, None, None)
    post_frame(client, 2)
    assert session.still_requested is True                                             # 100 s overdue and no close-up ever came


# ---- the close-up itself

def plate_runner(crop, size):
    h, w = crop.shape[:2]
    return [{"cls": "plate", "box": [w * 0.4, h * 0.4, w * 0.4 + 110, h * 0.4 + 40], "conf": 0.9}]


def test_a_close_up_is_stored_read_and_marks_the_arrival(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_plate_model_run", plate_runner)
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda t: {"text": "MP09AN5254", "raw": "MP09AN5254", "valid": True, "mean_prob": 0.95,
                                                                        "min_prob": 0.7, "agree": 3, "of": 4, "rival": 0.0})
    b = app_module._arrival_book("phone-1")
    rec = b.open("Bay-04", 7, time.time() - 30, [800, 380, 1000, 470], [1280, 720])
    # the phone's photo is 3840x2880 (live x3, 360 px down); it cut the car with 12 % around it
    x0, y0, x1, y1 = 2400 - 72, 1500 - 32 + 0, 3000 + 72, 1910 + 32
    car = np.full((int(y1 - y0), int(x1 - x0), 3), 90, np.uint8)
    ok, buf = cv2.imencode(".jpg", car)
    r = client.post("/live/crop", files={"image": ("c.jpg", buf.tobytes(), "image/jpeg")},
                    data={"camera_id": "phone-1", "key": app_module.LIVE_KEY, "arrival_id": rec["id"],
                          "rect": f"{x0},{y0},{x1},{y1}", "photo_size": "3840,2880"})
    assert r.status_code == 201
    deadline, got = time.time() + 10, None
    while time.time() < deadline:
        got = b.get(rec["id"])
        if got["plate_state"] != "pending":
            break
        time.sleep(0.05)
    assert got["plate_state"] == "found" and got["text"] == "MP09AN5254" and got["photo"] is True
    assert app_module._arrival_file("phone-1", rec["id"], "car").exists()
    assert app_module._last_crop_at["phone-1"] > 0                                      # the server now knows close-ups work


def test_a_close_up_with_the_wrong_key_an_unknown_arrival_or_bad_numbers_is_refused(client):
    b = app_module._arrival_book("phone-1")
    rec = b.open("Bay-04", 7, time.time(), [800, 380, 1000, 470], [1280, 720])
    ok, buf = cv2.imencode(".jpg", np.full((200, 300, 3), 90, np.uint8))
    files = {"image": ("c.jpg", buf.tobytes(), "image/jpeg")}
    good = {"camera_id": "phone-1", "key": app_module.LIVE_KEY, "arrival_id": rec["id"], "rect": "0,0,300,200", "photo_size": "3840,2880"}
    assert client.post("/live/crop", files=files, data={**good, "key": "wrong"}).status_code == 403
    assert client.post("/live/crop", files=files, data={**good, "arrival_id": "nope"}).status_code == 404
    assert client.post("/live/crop", files=files, data={**good, "arrival_id": "../x"}).status_code == 404
    assert client.post("/live/crop", files=files, data={**good, "rect": "5,5,1,1"}).status_code == 400
    assert client.post("/live/crop", files=files, data={**good, "photo_size": "zero"}).status_code == 400
    tiny = cv2.imencode(".jpg", np.zeros((10, 10, 3), np.uint8))[1].tobytes()
    assert client.post("/live/crop", files={"image": ("c.jpg", tiny, "image/jpeg")}, data=good).status_code == 400


# ---- the uplink's health

def test_the_phones_upload_times_become_the_uplinks_health(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    assert s.uplink() is None
    for ms in (900, 1000, 1100, 1000, 9000):                                            # one stall in five
        s.note_upload(ms, 170_000)
    up = s.uplink()
    assert up["n"] == 5 and up["p50_ms"] == 1000 and up["worst_ms"] == 9000 and up["last_ms"] == 9000
    assert 500 < up["kbps"] < 550                                                        # 5 x 170 KB = 6.8 Mbit over 13 s of uploading
    s.note_upload(-5, 1); s.note_upload(10**9, 1)                                        # nonsense is ignored
    assert s.uplink()["n"] == 5
    assert s.snapshot()["uplink"]["worst_ms"] == 9000
    s.stop()


def test_the_phone_reports_how_long_its_last_upload_took(client):
    post_frame(client, 1)
    post_frame(client, 2, up_ms="1234")
    post_frame(client, 3, up_ms="not a number")
    assert client.get("/live/state").json()["uplink"]["n"] == 1


# ---- old violations that were never dealt with

def test_dismiss_ended_leaves_the_ones_still_going_on(client):
    book = app_module._violation_book("phone-1")
    a, _ = book.open("Bay-01", "over_line", 1000.0); book.close("Bay-01", 1100.0)
    c, _ = book.open("Bay-02", "over_line", 1000.0)                                     # still going
    d, _ = book.open("Bay-03", "over_line", 1000.0); book.close("Bay-03", 1200.0); book.handle(d["id"], "resolved", "ok", "me", 1300.0)
    r = client.post("/console/api/violations-dismiss-ended").json()
    assert r["dismissed"] == 1 and r["open_count"] == 1
    assert book.get(a["id"])["status"] == "dismissed" and book.get(c["id"])["status"] == "open" and book.get(d["id"])["status"] == "resolved"
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert visitor.post("/console/api/violations-dismiss-ended", headers=PROXY).status_code == 403
