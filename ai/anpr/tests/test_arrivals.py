"""
A sharp photo of every car as it parks, and what its plate looked like in it.

The live feed knows which car (track id) stopped in which bay.  That is the moment to ask the phone for a full-resolution
photo, cut the car out of it, and look for the plate inside the cut.  Measured on 27 Oct: the live frame is the middle
of the phone's photo (scale 3.000 on both axes, 361 px down), so a box in the live frame maps to the photo without
stretching.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import aoi  # noqa: E402
import app as app_module  # noqa: E402
import arrivals  # noqa: E402

PROXY = {"X-Forwarded-For": "203.0.113.9"}


@pytest.fixture(autouse=True)
def _no_ocr(monkeypatch):
    """The server runs without an OCR engine; a developer's machine may have one, and these pictures are not plates."""
    class NoOcr:
        ocr_kind = "none"
    monkeypatch.setattr(app_module, "get_detector", lambda: NoOcr())
    monkeypatch.setattr(app_module, "ARRIVAL_SETTLE_S", 0.0)               # the tests do not wait for a car to settle
    monkeypatch.setattr(arrivals, "KEEP", arrivals.KEEP)
    # these "plates" are flat grey boxes; whether a real picture is clear enough has its own tests (test_plate_clarity.py)
    monkeypatch.setattr(app_module.plate_ocr, "clarity", lambda tile: {"edge": 99.0, "contrast": 200.0, "clear": True})


# ---- the register

def book(tmp_path):
    return arrivals.ArrivalBook(tmp_path / "arrivals" / "cam.json", "cam")


def test_a_car_that_stops_is_written_down_and_waits_for_its_photo(tmp_path):
    b = book(tmp_path)
    rec = b.open("Bay-04", 15, 1000.0, [700, 300, 900, 460], [1280, 720])
    assert rec["id"] == "cam-Bay-04-1000" and rec["label"] == "Bay-04" and rec["plate_state"] == "pending"
    assert [r["id"] for r in b.waiting(1010.0)] == [rec["id"]]
    assert b.waiting(1000.0 + arrivals.PHOTO_WITHIN_S + 1) == []                    # far too late: nobody is believed to sit unnoticed that long
    b.update(rec["id"], photo=True)
    assert b.waiting(1010.0) == []


def test_a_car_still_in_its_bay_is_still_waited_for_after_a_late_photo_but_a_car_that_left_is_not(tmp_path):
    # 29 Oct, Bay-02: the first photo came 268 s after the car parked and the old 120 s window dropped it for good (40 min "pending")
    b = book(tmp_path)
    here = b.open("Bay-02", 124, 1000.0, [248, 348, 481, 561], [1280, 720])
    assert [r["id"] for r in b.waiting(1000.0 + 268)] == [here["id"]]
    b.close("Bay-02", 1100.0)                                                       # it left: a photo now would be of an empty bay
    assert b.waiting(1000.0 + 268) == []


def test_a_reading_that_finishes_after_a_person_typed_the_plate_does_not_replace_it(tmp_path):
    # reading takes seconds; the person typed during them and the reader wrote what it had found from a record it had read BEFORE
    book = arrivals.ArrivalBook(tmp_path / "a.json", "cam")
    rec = book.open("Bay-01", 1, time.time() - 60, [1, 2, 3, 4], [1280, 720])
    snapshot = book.get(rec["id"])                                                                 # what the reader started from
    book.update(rec["id"], source="operator", text="DL8CAU7240", confirmed=True, guess=None)       # the person answers meanwhile
    out = book.update_reading(snapshot["id"], text="MP09AB1234", confirmed=False, guess=None, reads=[{"text": "MP09AB1234"}])
    assert out["text"] == "DL8CAU7240" and out["source"] == "operator" and out["confirmed"] is True
    assert out["reads"] == [{"text": "MP09AB1234"}]                                                # the reader's own opinion is still kept


def test_a_car_without_a_box_cannot_be_cut_out_and_is_not_waited_for(tmp_path):
    b = book(tmp_path)
    b.open("Bay-04", 15, 1000.0, None, None)
    assert b.waiting(1001.0) == []


def test_a_second_car_in_the_same_bay_closes_the_first_and_a_freed_bay_closes_it_too(tmp_path):
    b = book(tmp_path)
    b.open("Bay-04", 1, 1000.0, [1, 2, 3, 4], [1280, 720])
    b.open("Bay-04", 2, 2000.0, [1, 2, 3, 4], [1280, 720])
    rows = {r["track_id"]: r for r in b.list()}
    assert rows[1]["left"] == 2000.0 and rows[2]["left"] is None
    b.close("Bay-04", 2500.0)
    assert b.list()[0]["left"] == 2500.0 and b.waiting(2501.0) == []


def test_the_newest_arrival_comes_first_and_old_ones_are_pruned_unless_the_car_is_still_there(tmp_path):
    b = book(tmp_path)
    b.open("A", 1, 100.0, [1, 2, 3, 4], [1280, 720]); b.close("A", 150.0)
    b.open("B", 2, 200.0, [1, 2, 3, 4], [1280, 720])
    assert [r["bay"] for r in b.list()] == ["B", "A"]
    assert b.prune(1000.0) == 1                                                       # A is old and gone; B's car is still parked
    assert [r["bay"] for r in b.list()] == ["B"]


def test_ids_that_would_leave_the_evidence_folder_are_refused():
    assert arrivals.safe_id("phone-1-Bay-04-1793098281")
    for bad in ("", "../x", "a/b", "a\\b", "..", "x" * 90):
        assert not arrivals.safe_id(bad)


# ---- where the car is in the photo

def test_the_live_frame_is_the_middle_of_the_photo_not_the_photo_squeezed():
    x1, y1, x2, y2 = aoi.live_to_still([940, 447, 960, 460], [1280, 720], [3840, 2880])
    assert (x1, y1) == pytest.approx((2820, 447 * 3 + 360), abs=0.01) and (x2 - x1, y2 - y1) == pytest.approx((60, 39))
    # the Honda's plate measured on the real pair of pictures: live (940, 447) -> photo (2820, 1702), 0.9 px median error
    assert y1 == pytest.approx(1702, abs=3)
    assert aoi.live_to_still([0, 0, 1280, 720], [1280, 720], [3840, 2880]) == pytest.approx([0, 360, 3840, 2520])


def test_a_photo_of_the_same_shape_maps_by_scale_alone():
    assert aoi.live_to_still([100, 50, 200, 150], [1280, 720], [1920, 1080]) == pytest.approx([150, 75, 300, 225])


# ---- cutting the car out and looking for its plate

def fake_still(w=3840, h=2880):
    img = np.full((h, w, 3), 90, np.uint8)
    cv2.rectangle(img, (2400, 1500), (3000, 1900), (200, 200, 200), -1)              # "the car"
    return img


def rec_for(b, box=(800, 380, 1000, 470)):
    return b.open("Bay-04", 15, time.time(), list(box), [1280, 720])


def fake_runner(vehicle=True, plate=True):
    def run(crop, size):
        h, w = crop.shape[:2]
        out = []
        if vehicle:
            out.append({"cls": "vehicle", "box": [w * 0.1, h * 0.1, w * 0.9, h * 0.9], "conf": 0.9})
        if plate:
            out.append({"cls": "plate", "box": [w * 0.4, h * 0.6, w * 0.4 + 110, h * 0.6 + 40], "conf": 0.31})
        return out
    return run


def test_the_car_is_cut_out_of_the_photo_and_its_plate_is_measured(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    b = book(tmp_path)
    rec = rec_for(b)                                                                  # live box 800..1000 x 380..470
    app_module._arrival_photo("cam", b, rec, fake_still())
    got = b.get(rec["id"])
    assert got["photo"] and got["plate_state"] == "found"
    assert got["plate"]["width_px"] == 110 and got["plate"]["height_px"] == 40 and got["plate"]["verdict"] == "readable"   # letters ~22 px
    car = cv2.imread(str(app_module._arrival_file("cam", rec["id"], "car")))
    # the box in the photo is 600 x 270 px; 12 % more each way
    assert car.shape[1] == pytest.approx(600 * 1.24, abs=3) and car.shape[0] == pytest.approx(270 * 1.24, abs=3)
    assert app_module._arrival_file("cam", rec["id"], "plate").exists()


def read(text, mean=0.96, low=0.8, valid=True):
    return {"text": text, "raw": text, "valid": valid, "mean_prob": mean, "min_prob": low}


def test_a_readable_plate_is_read_and_two_photos_agreeing_confirm_it(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: read("MP09BU5540"))
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    one = b.get(rec["id"])
    assert one["text"] == "MP09BU5540" and one["confirmed"] is False and len(one["reads"]) == 1      # one read is a candidate
    assert [r["id"] for r in b.to_recheck(time.time())] == [rec["id"]]                              # the next photo looks again
    app_module._arrival_photo("cam", b, one, fake_still())
    two = b.get(rec["id"])
    assert two["confirmed"] is True and len(two["reads"]) == 2 and two["tries"] == 2
    assert b.to_recheck(time.time()) == []                                                          # confirmed: no more looks


def test_a_misread_is_outvoted_and_a_junk_read_is_dropped(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    answers = iter([read("MP09BU5540"), read("WP098155", 0.7, 0.3, valid=False), read("MP09BU5540", 0.9, 0.6)])
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: next(answers))
    b = book(tmp_path)
    rec = rec_for(b)
    for _ in range(3):
        app_module._arrival_photo("cam", b, b.get(rec["id"]), fake_still())
    got = b.get(rec["id"])
    assert got["text"] == "MP09BU5540" and got["confirmed"] and len(got["reads"]) == 3


def test_a_box_that_is_not_the_shape_or_size_of_a_plate_is_not_one(tmp_path, monkeypatch):
    for box in ([0.2, 0.2, 0.8, 0.8], [0.45, 0.5, 0.52, 0.9]):                  # as big as the car; a tall sliver (28 Oct: "plate 794 x 388 px")
        def run(crop, size, box=box):
            h, w = crop.shape[:2]
            return [{"cls": "plate", "box": [w * box[0], h * box[1], w * box[2], h * box[3]], "conf": 0.9}]
        monkeypatch.setattr(app_module, "_plate_model_run", run)
        monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
        b = book(tmp_path)
        rec = rec_for(b)
        app_module._arrival_photo("cam", b, rec, fake_still())
        assert b.get(rec["id"])["plate_state"] == "none_found"


def test_a_car_that_is_gone_again_within_seconds_leaves_no_arrival_behind(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_arrival_books", {})
    b = app_module._arrival_book("phone-1")
    flick = b.open("Bay-02", 9, time.time(), [800, 380, 1000, 470], [1280, 720])
    real = b.open("Bay-04", 10, time.time(), [800, 380, 1000, 470], [1280, 720])
    b.close("Bay-02", time.time() + 1)                                              # gone a second later
    monkeypatch.setattr(app_module, "ARRIVAL_SETTLE_S", 8.0)                        # the sweep's rule: under 8 s is a flicker
    import cv2 as _cv2
    jpg = tmp_path / "stills"; jpg.mkdir(parents=True)
    _cv2.imwrite(str(jpg / "phone-1.jpg"), fake_still(1920, 1440))
    app_module._process_arrivals("phone-1", time.time())
    ids = {r["id"] for r in b.list()}
    assert flick["id"] not in ids and real["id"] in ids and b.get(real["id"])["photo"]
    assert not app_module._arrival_file("phone-1", flick["id"], "car").exists()     # no picture kept for it


def test_old_flickers_are_swept_but_a_short_stay_with_a_plate_is_kept(tmp_path):
    b = book(tmp_path)
    a = b.open("A", 1, 100.0, [1, 2, 3, 4], [1280, 720]); b.close("A", 103.0)       # 3 s, no plate
    c = b.open("C", 2, 200.0, [1, 2, 3, 4], [1280, 720]); b.close("C", 204.0); b.update(c["id"], text="MP09BU5540")
    d = b.open("D", 3, 300.0, [1, 2, 3, 4], [1280, 720]); b.close("D", 400.0)       # a real stay
    assert b.drop_flickers(8.0) == [a["id"]]
    assert {r["id"] for r in b.list()} == {c["id"], d["id"]}


def test_a_neighbours_plate_in_the_margin_is_not_this_cars(tmp_path, monkeypatch):
    def run(crop, size):
        h, w = crop.shape[:2]
        return [{"cls": "plate", "box": [2, h * 0.5, 2 + 110, h * 0.5 + 40], "conf": 0.9}]       # at the very edge of the cut: outside the car
    monkeypatch.setattr(app_module, "_plate_model_run", run)
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: read("KA01AB1234"))
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    got = b.get(rec["id"])
    assert got["plate_state"] == "none_found" and got["text"] is None


def test_the_plate_read_is_in_the_log(tmp_path, monkeypatch):
    import activity_log as al
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: read("MP09BU5540", 0.99, 0.95))
    monkeypatch.setattr(app_module, "_live_sessions", {})                       # not the global one: other tests share it
    s = app_module._live_session("cam")
    s._log_dir = tmp_path / "logs"
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    s.stop()
    rows = al.read_rows([tmp_path / "logs"], "cam")
    row = [x for x in rows if x["type"] == "plate_read"][0]
    assert row["event"] == "Number plate read" and "MP09BU5540" in row["detail"] and "confirmed" in row["detail"]


def test_the_detector_is_given_the_cut_enlarged_and_a_vehicle_is_not_required(tmp_path, monkeypatch):
    seen = []

    def run(crop, size):
        seen.append((crop.shape[1], size))
        return fake_runner(vehicle=False, plate=True)(crop, size)                     # the model rarely calls a tight cut a vehicle
    monkeypatch.setattr(app_module, "_plate_model_run", run)
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    assert b.get(rec["id"])["plate_state"] == "found"
    assert seen == [(seen[0][0], app_module.ARRIVAL_DETECT_IMGSZ)] and app_module.ARRIVAL_DETECT_IMGSZ > seen[0][0]    # asked for at a larger size than the cut


def test_a_car_whose_plate_is_not_found_still_keeps_its_photo(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner(plate=False))
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    got = b.get(rec["id"])
    assert got["plate_state"] == "none_found" and got["photo"]
    assert app_module._arrival_file("cam", rec["id"], "car").exists()                 # an operator can still read it by eye
    assert not app_module._arrival_file("cam", rec["id"], "plate").exists()


def test_a_small_plate_is_called_too_small_and_not_read(tmp_path, monkeypatch):
    def tiny(crop, size):
        h, w = crop.shape[:2]
        return [{"cls": "vehicle", "box": [0, 0, w, h], "conf": 0.9}, {"cls": "plate", "box": [w * 0.4, h * 0.6, w * 0.4 + 66, h * 0.6 + 18], "conf": 0.2}]
    monkeypatch.setattr(app_module, "_plate_model_run", tiny)
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    b = book(tmp_path)
    rec = rec_for(b)
    app_module._arrival_photo("cam", b, rec, fake_still())
    got = b.get(rec["id"])
    assert got["plate"]["verdict"] == "too_small" and got["text"] is None             # 66 x 18 px: letters about 10 px


# ---- the whole path, over HTTP

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_arrival_books", {})
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def jpeg(w, h, v=120):
    img = fake_still(w, h) if w > 2000 else np.full((h, w, 3), v, np.uint8)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 60])
    return buf.tobytes()


def test_a_car_parking_asks_for_a_photo_and_the_photo_arriving_fills_in_its_record(client):
    r = client.post("/live/frame", files={"image": ("f.jpg", jpeg(640, 360), "image/jpeg")},
                    data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    session = app_module._live_sessions["phone-1"]
    session.still_requested = False
    ev = {"t": time.time(), "type": "bay_occupied", "bay_id": "Bay-04", "track_id": 15, "box": [800, 380, 1000, 470], "frame_size": [1280, 720]}
    app_module._on_live_event(session, ev, None, None)
    assert session.still_requested is False                                           # no full photo: a close-up of the car is asked for
    # the photo comes in as a full still here (an old camera page): it still works
    assert client.get("/console/api/arrivals").json()["arrivals"][0]["plate_state"] == "pending"

    r = client.post("/live/still", files={"image": ("s.jpg", jpeg(3840, 2880), "image/jpeg")},
                    data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    assert r.status_code == 201
    deadline = time.time() + 10
    row = None
    while time.time() < deadline:                                                      # the cut is made on a thread of its own
        row = client.get("/console/api/arrivals").json()["arrivals"][0]
        if row["plate_state"] != "pending":
            break
        time.sleep(0.1)
    assert row["plate_state"] == "found" and row["car_photo"] and row["plate_photo"] and row["bay"] == "Bay-04"
    assert row["box"] == [800, 380, 1000, 470] and row["arrived_iso"]                 # the box lets the console write the plate over the car
    car = client.get(f"/console/api/arrival/{row['id']}.jpg?kind=car")
    assert car.status_code == 200 and car.headers["content-type"] == "image/jpeg"
    assert client.get(f"/console/api/arrival/{row['id']}.jpg?kind=plate").status_code == 200

    app_module._on_live_event(session, {"t": time.time(), "type": "bay_freed", "bay_id": "Bay-04", "track_id": None}, None, None)
    assert client.get("/console/api/arrivals").json()["arrivals"][0]["left_iso"]        # the car left


def test_the_arrival_pictures_are_for_operators_only_and_ids_cannot_climb_out(client):
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert visitor.get("/console/api/arrivals", headers=PROXY).status_code == 403
    assert visitor.get("/console/api/arrival/x.jpg", headers=PROXY).status_code == 403
    assert client.get("/console/api/arrival/..%2F..%2Fstill.jpg").status_code == 404
    assert client.get("/console/api/arrival/ok-id.jpg?kind=../../x").status_code == 404
    assert client.get("/console/api/arrival/ok-id.jpg").status_code == 404            # nothing there


def test_a_bay_that_reads_vacant_closes_a_car_whose_free_event_was_lost(client):
    client.post("/live/frame", files={"image": ("f.jpg", jpeg(640, 360), "image/jpeg")}, data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    session = app_module._live_sessions["phone-1"]
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_occupied", "bay_id": "Bay-03", "track_id": 1, "box": [1, 2, 30, 40], "frame_size": [1280, 720]}, None, None)
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_occupied", "bay_id": "Bay-04", "track_id": 2, "box": [1, 2, 30, 40], "frame_size": [1280, 720]}, None, None)
    app_module._on_live_minute(session, {"Bay-03": {"status": "VACANT"}, "Bay-04": {"status": "OCCUPIED"}}, time.time())
    rows = {r["bay"]: r for r in client.get("/console/api/arrivals").json()["arrivals"]}
    assert rows["Bay-03"]["left"] is not None and rows["Bay-04"]["left"] is None


def test_a_blocked_bay_has_no_car_of_its_own_so_its_arrival_ends(client):
    # 30 Oct: "blocked" counts as occupied, so the record of the car that used to be read in that bay stayed "still there" with its plate
    client.post("/live/frame", files={"image": ("f.jpg", jpeg(640, 360), "image/jpeg")}, data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    session = app_module._live_sessions["phone-1"]
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_occupied", "bay_id": "Bay-06", "track_id": 1, "box": [1, 2, 30, 40], "frame_size": [1280, 720]}, None, None)
    app_module._on_live_minute(session, {"Bay-06": {"status": "OCCUPIED", "flag": "blocked"}}, time.time())
    assert client.get("/console/api/arrivals").json()["arrivals"][0]["left"] is not None


def test_plates_stored_by_an_older_reader_are_read_again_from_their_saved_picture(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_arrival_books", {})
    b = app_module._arrival_book("cam")
    old = b.open("Bay-04", 1, time.time() - 600, [1, 2, 3, 4], [1280, 720])
    b.update(old["id"], photo=True, text="MP09AW5254", confirmed=True, reads=[{"text": "MP09AW5254", "mean_prob": 0.97, "min_prob": 0.9, "valid": True}] * 2)
    clean = b.open("Bay-05", 2, time.time() - 500, [1, 2, 3, 4], [1280, 720])
    b.update(clean["id"], photo=True, text="DD02G7545", confirmed=True, rv=app_module.plate_ocr.READER_VERSION, reads=[{}])
    gone = b.open("Bay-06", 3, time.time() - 400, [1, 2, 3, 4], [1280, 720])
    b.update(gone["id"], photo=True, text="KA01AB1234", confirmed=True, reads=[{}])                 # its picture was pruned
    app_module._save_evidence(app_module._arrival_file("cam", old["id"], "plate"), np.full((40, 120, 3), 90, np.uint8))
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda img: {"text": "MP09AN5254", "raw": "MP09AN5254", "valid": True, "mean_prob": 0.94,
                                                                          "min_prob": 0.6, "agree": 3, "of": 4, "rival": 0.1})
    assert app_module._reread_stored_plates("cam") == 2                                              # the up-to-date one is left alone
    assert b.get(old["id"])["text"] == "MP09AN5254" and b.get(old["id"])["rv"] == app_module.plate_ocr.READER_VERSION
    assert b.get(clean["id"])["text"] == "DD02G7545"
    g = b.get(gone["id"])
    assert g["text"] is None and g["confirmed"] is False                                             # nothing to read it again from: not kept
    assert app_module._reread_stored_plates("cam") == 0                                              # and it is done once


def test_an_unsure_read_is_kept_as_a_guess_and_a_person_can_confirm_or_correct_it(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner())
    unsure = {"text": "DL8CAU7240", "raw": "DLBEAU7240", "valid": True, "mean_prob": 0.62, "min_prob": 0.2, "agree": 2, "of": 9, "rival": 0.56}
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: unsure)
    b = app_module._arrival_book("phone-1")
    rec = rec_for(b)
    app_module._arrival_photo("phone-1", b, rec, fake_still())
    got = b.get(rec["id"])
    assert got["text"] is None and got["confirmed"] is False and got["guess"] == "DL8CAU7240"          # not the plate, but shown with a "?"
    row = client.get("/console/api/arrivals").json()["arrivals"][0]
    assert row["guess"] == "DL8CAU7240" and row["text"] is None and row["box"]

    r = client.post(f"/console/api/arrival/{rec['id']}/plate", json={"plate": "dl 8c au-7240"})
    assert r.status_code == 200 and r.json()["arrival"]["text"] == "DL8CAU7240" and r.json()["arrival"]["confirmed"] is True
    assert b.get(rec["id"])["source"] == "operator" and b.get(rec["id"])["guess"] is None
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: {**unsure, "text": "DL88AU7240"})    # a later bad read
    app_module._arrival_photo("phone-1", b, b.get(rec["id"]), fake_still())
    assert b.get(rec["id"])["text"] == "DL8CAU7240"                                                     # does not change what a person said

    assert client.post(f"/console/api/arrival/{rec['id']}/plate", json={"plate": "AB"}).status_code == 400
    assert client.post("/console/api/arrival/nope/plate", json={"plate": "DL8CAU7240"}).status_code == 404
    r = client.post(f"/console/api/arrival/{rec['id']}/plate", json={"plate": ""})                      # take the answer back
    assert r.json()["arrival"]["text"] is None and r.json()["arrival"]["guess"] == "DL8CAU7240"       # the readings decide again (a tie: the first)
    assert b.get(rec["id"])["source"] is None
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert visitor.post(f"/console/api/arrival/{rec['id']}/plate", json={"plate": "X"}, headers=PROXY).status_code == 403


def test_arrival_photos_can_be_switched_off(client, monkeypatch):
    monkeypatch.setattr(app_module, "ARRIVAL_PHOTOS", False)
    client.post("/live/frame", files={"image": ("f.jpg", jpeg(640, 360), "image/jpeg")}, data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    session = app_module._live_sessions["phone-1"]
    session.still_requested = False
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_occupied", "bay_id": "Bay-04", "track_id": 15}, None, None)
    assert session.still_requested is False
    assert client.get("/console/api/arrivals").json()["arrivals"] == []


# ---- 30 Oct: every look is a 12 MP photo on the phone; two cars re-looked at every 45 s held the live feed to 0.2 fps

def looked(book, tries, reads=(), **kw):
    rec = book.open("Bay-06", 3, 1000.0, [10, 10, 200, 100], [1280, 720])
    book.update(rec["id"], photo=True, tries=tries, last_look=2000.0, plate_state="found", reads=list(reads), **kw)
    return rec


def test_the_wait_between_looks_at_the_same_car_doubles(tmp_path):
    b = book(tmp_path)
    ok = [{"text": "MP09AB1234", "valid": True}]
    looked(b, 1, ok)
    assert b.want_crop(2000.0 + 44) == [] and len(b.want_crop(2000.0 + 46)) == 1               # 45 s after the first look
    b.update("cam-Bay-06-1000", tries=2)
    assert b.want_crop(2000.0 + 89) == [] and len(b.want_crop(2000.0 + 91)) == 1               # 90 s after the second
    b.update("cam-Bay-06-1000", tries=3)
    assert b.want_crop(2000.0 + 179) == [] and len(b.want_crop(2000.0 + 181)) == 1
    b.update("cam-Bay-06-1000", tries=7)
    assert len(b.want_crop(2000.0 + arrivals.MAX_RECHECK_GAP_S + 1)) == 1                       # never more than 15 min


def test_a_car_looked_at_three_times_without_one_real_plate_is_given_up_on(tmp_path):
    b = book(tmp_path)
    junk = [{"text": "3", "valid": False}, {"text": "CWC6454", "valid": False}, {"text": "SF9216", "valid": False}]
    looked(b, 2, junk)
    assert len(b.want_crop(5000.0)) == 1                                                        # two looks: one more try
    b.update("cam-Bay-06-1000", tries=3)
    assert b.want_crop(9000.0) == []                                                            # three looks, nothing like a plate: stop
    b.update("cam-Bay-06-1000", reads=junk + [{"text": "MP09AB1234", "valid": True}])
    assert len(b.want_crop(9000.0)) == 1                                                        # one real read and it is worth another look


# ---- 30 Oct: one Fortuner over Bay-05/06 was written down in both bays with the same plate

def test_the_same_car_in_the_next_bay_moments_later_is_one_arrival_carrying_its_reads(tmp_path):
    b = book(tmp_path)
    first = b.open("Bay-05", 3, 1000.0, [10, 10, 200, 100], [1280, 720])
    b.update(first["id"], photo=True, tries=2, reads=[{"text": "MP09ZE0558", "valid": True}], text="MP09ZE0558", plate_state="found")
    b.close("Bay-05", 1020.0)                                                       # the engine's bay for the car flipped ...
    moved = b.open("Bay-06", 3, 1021.0, [30, 10, 220, 100], [1280, 720])           # ... and "a car arrived" in the next one
    assert moved["id"] == first["id"] and moved["bay"] == "Bay-06" and moved["left"] is None and moved["moved_from"] == ["Bay-05"]
    assert moved["text"] == "MP09ZE0558" and len(moved["reads"]) == 1 and moved["box"] == [30.0, 10.0, 220.0, 100.0]
    assert len(b.list()) == 1


def test_a_different_car_or_a_much_later_one_is_a_new_arrival(tmp_path):
    b = book(tmp_path)
    b.open("Bay-05", 3, 1000.0, [10, 10, 200, 100], [1280, 720])
    b.close("Bay-05", 1020.0)
    other = b.open("Bay-06", 4, 1021.0, [30, 10, 220, 100], [1280, 720])             # another track number: another car
    assert other["bay"] == "Bay-06" and len(b.list()) == 2
    late = b.open("Bay-07", 3, 1020.0 + arrivals.SAME_CAR_JOIN_S + 5, [30, 10, 220, 100], [1280, 720])    # the same number, long after
    assert late["bay"] == "Bay-07" and len(b.list()) == 3


def test_track_numbers_of_an_earlier_run_are_not_the_same_car(tmp_path):
    # after a restart or a re-marked layout the tracker counts from 1 again
    b = book(tmp_path)
    b.open("Bay-05", 3, 1000.0, [10, 10, 200, 100], [1280, 720])
    arrivals.new_boot(2000.0)
    try:
        new = b.open("Bay-06", 3, 1010.0, [30, 10, 220, 100], [1280, 720])
        assert new["bay"] == "Bay-06" and len(b.list()) == 2
        assert b.dedupe_open({}, 1011.0) == 0
    finally:
        arrivals.new_boot()


def test_what_flipping_left_behind_is_cleaned_up_one_car_in_one_bay(tmp_path):
    b = book(tmp_path)
    a = b.open("Bay-05", 3, 1000.0, [1, 2, 3, 4], [1280, 720])
    c = b.open("Bay-06", 4, 1001.0, [1, 2, 3, 4], [1280, 720])
    # (older data: the two are the same car, found by the plate that both read and confirmed)
    b.update(a["id"], confirmed=True, text="MP09ZE0558", reads=[{}, {}])
    b.update(c["id"], confirmed=True, text="MP09ZE0558", reads=[{}])
    slots = {"Bay-05": {"status": "VACANT"}, "Bay-06": {"status": "OCCUPIED", "flag": None}}
    assert b.dedupe_open(slots, 2000.0) == 1
    rows = {r["bay"]: r for r in b.list()}
    assert rows["Bay-06"]["left"] is None and rows["Bay-05"]["left"] == 2000.0 and rows["Bay-05"]["duplicate_of"] == rows["Bay-06"]["id"]
    assert b.dedupe_open(slots, 2001.0) == 0


def test_two_different_cars_with_different_plates_are_left_alone(tmp_path):
    b = book(tmp_path)
    a = b.open("Bay-05", 3, 1000.0, [1, 2, 3, 4], [1280, 720])
    c = b.open("Bay-06", 4, 1001.0, [1, 2, 3, 4], [1280, 720])
    b.update(a["id"], confirmed=True, text="MP09ZE0558")
    b.update(c["id"], confirmed=True, text="MP09WB9021")
    assert b.dedupe_open({"Bay-05": {"status": "OCCUPIED"}, "Bay-06": {"status": "OCCUPIED"}}, 2000.0) == 0


# ---- 30 Oct: the Fortuner's plate was written on the black car behind it (its box contains the plate; its outline does not)

def test_a_neighbours_plate_inside_the_cars_box_is_not_the_cars_plate(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "_plate_model_run", fake_runner(vehicle=False, plate=True))        # a plate at (w*0.4, h*0.6), 110 x 40
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    b = book(tmp_path)
    car = np.full((400, 700, 3), 90, np.uint8)
    inner = (0, 0, 700, 400)                                                                            # the car's BOX covers the whole cut
    # the car's own outline is the left half only; the plate (centre about x=335) is on the right half: the car in front of it
    rec = rec_for(b)
    app_module._arrival_car("cam", b, rec, car, inner, outline=[[0, 0], [250, 0], [250, 400], [0, 400]])
    assert b.get(rec["id"])["plate_state"] == "none_found" and b.get(rec["id"])["plate"] is None
    # the same plate with an outline that does cover it is the car's own
    rec2 = b.open("Bay-05", 9, time.time(), [800, 380, 1000, 470], [1280, 720])
    app_module._arrival_car("cam", b, rec2, car, inner, outline=[[200, 100], [600, 100], [600, 400], [200, 400]])
    assert b.get(rec2["id"])["plate_state"] == "found"
    # and with no outline (a record from before) the box rule is what it was
    rec3 = b.open("Bay-03", 11, time.time(), [800, 380, 1000, 470], [1280, 720])
    app_module._arrival_car("cam", b, rec3, car, inner)
    assert b.get(rec3["id"])["plate_state"] == "found"


def test_the_outline_is_kept_short_and_stays_out_of_the_pages(tmp_path):
    import live
    ring = np.array([[100 + 90 * np.cos(a), 100 + 40 * np.sin(a)] for a in np.linspace(0, 2 * np.pi, 400, endpoint=False)], np.float32)
    short = live.simplify_outline(ring)
    assert 3 <= len(short) <= 48 and live.simplify_outline(None) is None and live.simplify_outline(np.zeros((2, 2))) is None
    b = book(tmp_path)
    rec = b.open("Bay-05", 3, 1000.0, [1, 2, 3, 4], [1280, 720], outline=short)
    assert b.get(rec["id"])["outline"] == short
    assert "outline" not in app_module._arrival_view(b.get(rec["id"]), "cam")                           # not sent to the browser
    assert b.open("Bay-06", 4, 1001.0, [1, 2, 3, 4], [1280, 720], outline=[[1, 2]])["outline"] is None   # nonsense is dropped, not stored


def test_a_cut_from_a_photo_gets_the_outline_in_its_own_pixels():
    pts = aoi.live_points_to_still([[100, 50], [200, 150]], [1280, 720], [3840, 2880])
    assert sum(pts, []) == pytest.approx([300, 50 * 3 + 360, 600, 150 * 3 + 360])                      # the same mapping as the box
