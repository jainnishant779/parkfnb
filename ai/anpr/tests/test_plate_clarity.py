"""
A plate picture can be big enough and still unreadable.  29 Oct, Bay-07: a dark 81 x 60 px tile (mean brightness 29) counted as "readable"
by size, went to the readers, and came back as "3", "CWC6454" and "SF9216" for one car.  Now a dark or blurred tile is "unclear_photo":
no reading, and no more than three more looks.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import arrivals  # noqa: E402
import plate_ocr as po  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
CLEAN = ["plate_dd.jpg", "plate_green.jpg", "plate_partial.jpg", "plate_red.jpg", "plate_sample.jpg", "plate_suv_dl.jpg", "plate_clear_bay02.jpg"]


@pytest.mark.parametrize("name", CLEAN)
def test_the_clean_plates_of_this_lot_are_clear(name):
    c = po.clarity(cv2.imread(str(FIX / name)))
    assert c["clear"], (name, c)


def test_the_dark_plate_of_bay_07_is_not_clear():
    c = po.clarity(cv2.imread(str(FIX / "plate_dark_bay07.jpg")))
    assert not c["clear"] and c["edge"] < po.CLARITY_MIN_EDGE


def test_a_clean_plate_blurred_or_darkened_stops_being_clear():
    img = cv2.imread(str(FIX / "plate_sample.jpg"))
    assert po.clarity(img)["clear"]
    assert not po.clarity(cv2.GaussianBlur(img, (0, 0), 4))["clear"]                 # out of focus
    assert not po.clarity((img * 0.15).astype(np.uint8))["clear"]                     # a quarter of the light
    assert not po.clarity(np.full((60, 140, 3), 90, np.uint8))["clear"]               # nothing in it at all


def test_a_tiny_tile_does_not_crash_it():
    assert po.clarity(np.zeros((2, 2, 3), np.uint8))["clear"] is False


# ---- in the arrival flow

def car_with_plate(tile_file):
    car = np.full((400, 700, 3), 70, np.uint8)
    tile = cv2.imread(str(FIX / tile_file))
    tile = cv2.resize(tile, (150, 50))
    car[260:310, 280:430] = tile
    return car


def plate_runner(crop, size):
    return [{"cls": "plate", "box": [280, 260, 430, 310], "conf": 0.8}]


@pytest.fixture
def arrival(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_plate_model_run", plate_runner)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    calls = []
    monkeypatch.setattr(app_module.plate_ocr, "read_plate", lambda tile: calls.append(1) or None)
    book = arrivals.ArrivalBook(tmp_path / "a.json", "cam")
    rec = book.open("Bay-07", 5, time.time(), [10, 10, 200, 100], [1280, 720])
    return book, rec, calls


def test_an_unclear_plate_is_not_sent_to_the_readers_and_says_why(arrival):
    book, rec, calls = arrival
    app_module._arrival_car("cam", book, rec, car_with_plate("plate_dark_bay07.jpg"), (0, 0, 700, 400))
    got = book.get(rec["id"])
    assert calls == [] and got["plate"]["verdict"] == "unclear_photo" and got["plate"]["size_verdict"] in ("readable", "marginal")
    assert got["text"] is None and got["reads"] == [] and got["unclear"] == 1 and got["plate"]["clarity"]["clear"] is False


def test_a_clean_plate_is_read_as_before(arrival):
    book, rec, calls = arrival
    app_module._arrival_car("cam", book, rec, car_with_plate("plate_clear_bay02.jpg"), (0, 0, 700, 400))
    got = book.get(rec["id"])
    assert calls == [1] and got["plate"]["verdict"] in ("readable", "marginal") and got.get("unclear", 0) == 0


def test_after_three_unclear_looks_the_car_is_not_asked_about_again(tmp_path):
    book = arrivals.ArrivalBook(tmp_path / "a.json", "cam")
    rec = book.open("Bay-07", 5, 1000.0, [10, 10, 200, 100], [1280, 720])
    book.update(rec["id"], photo=True, tries=1, last_look=1000.0, unclear=arrivals.MAX_UNCLEAR - 1, plate_state="found")
    assert [r["id"] for r in book.want_crop(2000.0)] == [rec["id"]] and [r["id"] for r in book.to_recheck(2000.0)] == [rec["id"]]
    book.update(rec["id"], unclear=arrivals.MAX_UNCLEAR)
    assert book.want_crop(2000.0) == [] and book.to_recheck(2000.0) == []


def test_a_marginal_size_plate_keeps_the_strict_vote_when_a_later_look_is_unclear():
    assert app_module._strict_plate({"verdict": "marginal"}) and not app_module._strict_plate({"verdict": "readable"})
    assert app_module._strict_plate({"verdict": "unclear_photo", "size_verdict": "marginal"})
    assert not app_module._strict_plate({"verdict": "unclear_photo", "size_verdict": "readable"}) and not app_module._strict_plate(None)