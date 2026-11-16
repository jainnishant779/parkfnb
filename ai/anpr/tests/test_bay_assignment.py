"""
Which bay a car belongs to.  On 29 Oct (a day frame of the lot, cars parked loosely so that three of four straddle a line) the box-slice
rule gave three of the four cars to the bay one to the right: `coverage` is a share of the BAY, and a far bay is small in the picture.
Every verdict, plate and "blocked" then followed the wrong bay.  A car now goes to the bay holding most of its footprint on the ground.
"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import arrivals  # noqa: E402
from live import LiveSession  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
HAVE_WEIGHTS = (Path(__file__).resolve().parent.parent / "weights" / "best.pt").exists()


@pytest.mark.skipif(not HAVE_WEIGHTS, reason="needs the detector weights")
def test_cars_straddling_a_line_go_to_the_bay_they_mostly_stand_in(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    bays = json.loads((FIX / "straddling_row_layout.json").read_text())
    app_module._install_bays("assign-cam", bays, "oblique", image_size=(1280, 720))
    frame = cv2.imread(str(FIX / "straddling_row_day.jpg"))
    sess = LiveSession("assign-cam", app_module._live_process, tmp_path)
    for _ in range(3):
        out = app_module._live_process(frame, sess)
    taken = {b for b, s in out["bays"].items() if s != "free"}
    # Hatchback in Bay-02 (clean), Range Rover mostly in Bay-03 (a third over into Bay-04), i20 in Bay-04, a sideways sedan at 06/07
    assert {"Bay-02", "Bay-03", "Bay-04"} <= taken
    assert "Bay-05" not in taken                                         # nobody stands in Bay-05: it was "wrong" under the old rule
    assert out["bay_details"]["Bay-03"]["parking"]["across"] == ["Bay-03", "Bay-04"]     # the Range Rover, over its right line


# ---- cars that were already there

def test_a_car_already_in_its_bay_when_the_service_starts_is_written_down_for_its_plate(tmp_path):
    book = arrivals.ArrivalBook(tmp_path / "a.json", "cam")
    rec = book.adopt("Bay-03", 2, time.time(), [525, 264, 750, 482], [1280, 720])
    assert rec["initial"] is True and rec["plate_state"] == "pending" and [r["id"] for r in book.waiting(time.time())] == [rec["id"]]
    assert book.adopt("Bay-03", 9, time.time() + 5, [1, 2, 3, 4], [1280, 720]) is None       # the bay has a car on record already


def test_the_live_feed_hands_over_the_box_of_a_car_that_was_there_at_start(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_arrival_books", {})
    session = type("S", (), {"camera_id": "cam"})()
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_initial", "bay_id": "Bay-02", "track_id": 3, "status": "occupied",
                                        "box": [298, 329, 513, 526], "frame_size": [1280, 720]}, None, None)
    app_module._on_live_event(session, {"t": time.time(), "type": "bay_initial", "bay_id": "Bay-01", "track_id": None, "status": "available"},
                              None, None)
    rows = app_module._arrival_book("cam").list()
    assert [(r["bay"], r["initial"]) for r in rows] == [("Bay-02", True)]


def test_the_records_made_under_the_old_assignment_end_once(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_arrival_books", {})
    monkeypatch.setattr(app_module, "_books", {})
    monkeypatch.setattr(app_module.state_store, "load_cameras", lambda: {"cam": {}})
    now = time.time()
    app_module._arrival_book("cam").open("Bay-04", 1, now - 100, [1, 2, 3, 4], [1280, 720])
    app_module._violation_book("cam").open("Bay-05", "over_line", now - 100, "x", 0.4, "left")
    app_module._migrate_assignment()
    assert app_module._arrival_book("cam").list()[0]["left"] is not None
    assert app_module._violation_book("cam").list()[0]["closed"] is not None
    app_module._arrival_book("cam").open("Bay-04", 2, now, [1, 2, 3, 4], [1280, 720])        # a new car under the new rule ...
    app_module._migrate_assignment()
    assert [r for r in app_module._arrival_book("cam").list() if r["left"] is None]          # ... is not touched by the next start


@pytest.mark.skipif(not HAVE_WEIGHTS, reason="needs the detector weights")
def test_a_car_parked_at_an_angle_across_two_bays_is_not_called_free(tmp_path, monkeypatch):
    # 30 Oct: a Fortuner stood diagonally over Bay-05/06 and both read "Available": its box-slice footprint lay outside the bay, and the
    # "minimal coverage, free" shortcut never looked at the ground footprint the silhouette gives
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    bays = json.loads((FIX / "angled_suv_layout.json").read_text())
    app_module._install_bays("angle-cam", bays, "oblique", image_size=(1280, 720))
    frame = cv2.imread(str(FIX / "angled_suv_day.jpg"))
    sess = LiveSession("angle-cam", app_module._live_process, tmp_path)
    for _ in range(3):
        out = app_module._live_process(frame, sess)
    taken = {b for b, s in out["bays"].items() if s != "free"}
    assert {"Bay-02", "Bay-03", "Bay-05"} <= taken                      # the Brezza, the Range Rover and the Fortuner
    assert out["bay_details"]["Bay-05"]["state"] != "free" and out["bay_details"]["Bay-01"]["state"] == "free"


# ---- a car over two bays stays in the one it had (30 Oct: its bay flipped and its plate was written down in both)

def test_a_car_over_two_bays_almost_equally_keeps_its_bay():
    from occupancy import sticky_owner as sticky
    scores = {"Bay-05": 0.64, "Bay-06": 0.51}
    assert sticky(scores, "Bay-05", "Bay-06") == "Bay-06"               # it was in 06, 05 is only 13 points more: stay
    assert sticky({"Bay-05": 0.40, "Bay-06": 0.60}, "Bay-06", "Bay-05") == "Bay-06"        # clearly more in 06 now: it moved
    assert sticky(scores, "Bay-05", None) == "Bay-05" and sticky(scores, "Bay-05", "Bay-05") == "Bay-05"   # a new car, or no change
    assert sticky({"Bay-05": 0.9, "Bay-06": 0.1}, "Bay-05", "Bay-06") == "Bay-05"           # it had hardly any of the old bay left
    assert sticky({}, None, "Bay-06") is None and sticky(scores, "Bay-05", "Bay-99") == "Bay-05"
