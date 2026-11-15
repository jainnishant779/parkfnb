"""
Who is who: the register of vehicles by number plate, and the plate on each stay of the Sessions page.  One car that straddles
two bays, is seen again after its track id changed, or was lost by the camera for a few minutes is ONE vehicle with one visit,
not a pile of arrivals (on 28 Oct one test car made 27 arrival records).
"""
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import arrivals  # noqa: E402

PROXY = {"X-Forwarded-For": "203.0.113.9"}


def row(bay, arrived, left, text="MP09BU5540", confirmed=True, reads=2, rid=None):
    return {"id": rid or f"c-{bay}-{int(arrived)}", "bay": bay, "arrived": arrived, "left": left, "text": text,
            "confirmed": confirmed, "reads": [0] * reads}


# ---- the register

def test_arrivals_of_one_plate_close_in_time_are_one_visit_and_a_later_return_is_another():
    rows = [row("Bay-05", 1000, 1100), row("Bay-06", 1090, 1200), row("Bay-04", 1500, 1600),       # 5 and 6 overlap; 4 follows within 10 min
            row("Bay-04", 9000, 9300)]                                                             # hours later: a second visit
    (v,) = arrivals.vehicles(rows, now=10000)
    assert v["plate"] == "MP09BU5540" and v["visits"] == 2 and v["bays"] == ["Bay-04", "Bay-05", "Bay-06"]
    assert v["first_seen"] == 1000 and v["last_seen"] == 9300 and v["inside"] is False
    assert v["total_s"] == (1600 - 1000) + (9300 - 9000)                                          # the time it was here, not counted twice


def test_a_car_still_in_a_bay_is_inside_and_its_time_runs_to_now():
    (v,) = arrivals.vehicles([row("Bay-03", 1000, None)], now=1500)
    assert v["inside"] and v["last_seen"] == 1500 and v["total_s"] == 500 and v["last_bay"] == "Bay-03"


def test_each_plate_is_its_own_vehicle_newest_first_and_unread_arrivals_are_left_out():
    rows = [row("A", 100, 200, "MP09BU5540"), row("B", 500, 600, "KA01AB1234", confirmed=False),
            {"id": "x", "bay": "C", "arrived": 700, "left": 800, "text": None}]
    out = arrivals.vehicles(rows, now=1000)
    assert [v["plate"] for v in out] == ["KA01AB1234", "MP09BU5540"] and out[0]["confirmed"] is False
    assert [v["plate"] for v in arrivals.vehicles(rows, now=1000, confirmed_only=True)] == ["MP09BU5540"]


# ---- the plate on a stay

def test_a_stay_gets_the_plate_of_the_arrival_in_its_bay_at_its_time_and_not_another_bays_or_hour():
    stays = [{"bay": "Bay-05", "start": 1000, "end": 1200}, {"bay": "Bay-02", "start": 1000, "end": 1200},
             {"bay": "Bay-05", "start": 9000, "end": None}]
    rows = [row("Bay-05", 1010, 1190, "MP09BU5540"), row("Bay-05", 2000, 2100, "KA01AB1234")]
    arrivals.attach_plates(stays, rows)
    assert stays[0]["plate"] == "MP09BU5540" and stays[0]["plate_confirmed"] is True
    assert "plate" not in stays[1]                                                                 # nobody read in Bay-04
    assert "plate" not in stays[2]                                                                 # the other car left long before


def test_a_car_on_the_line_between_two_bays_gets_its_plate_from_the_neighbouring_bay_only_when_unambiguous():
    # the plate was read for the car in Bay-04; the stays pipeline called the same car Bay-05 (28 Oct)
    stay = lambda bay="Bay-05": [{"bay": bay, "start": 1000, "end": 2000}]
    s = stay(); arrivals.attach_plates(s, [row("Bay-04", 1000, 2000)])
    assert s[0]["plate"] == "MP09BU5540"
    s = stay("Bay-07"); arrivals.attach_plates(s, [row("Bay-04", 1000, 2000)])                      # three bays away: not it
    assert "plate" not in s[0]
    s = stay(); arrivals.attach_plates(s, [row("Bay-04", 1000, 2000), row("Bay-06", 1000, 2000, "KA01AB1234")])
    assert "plate" not in s[0]                                                                       # two different cars beside it: no guess
    s = stay(); arrivals.attach_plates(s, [row("Bay-04", 1900, 2100)])                              # only a tenth of the stay overlaps
    assert "plate" not in s[0]


def test_the_better_read_wins_when_two_arrivals_match_a_stay():
    stays = [{"bay": "Bay-05", "start": 1000, "end": 1500}]
    arrivals.attach_plates(stays, [row("Bay-05", 1000, 1100, "MP09BU5549", confirmed=False, reads=1), row("Bay-05", 1100, 1400, "MP09BU5540")])
    assert stays[0]["plate"] == "MP09BU5540"


# ---- over HTTP

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_arrival_books", {})
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def test_the_register_and_the_report_show_the_plate_and_visitors_cannot_see_either(client):
    book = app_module._arrival_book("phone-1")
    now = time.time()
    rec = book.open("Bay-05", 7, now - 600, [1, 2, 3, 4], [1280, 720])
    book.update(rec["id"], photo=True, text="MP09BU5540", confirmed=True, reads=[{}, {}])
    got = client.get("/console/api/vehicles").json()["vehicles"]
    assert got[0]["plate"] == "MP09BU5540" and got[0]["inside"] is True
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert visitor.get("/console/api/vehicles", headers=PROXY).status_code == 403
    assert client.get("/console/api/vehicles?confirmed_only=1").json()["vehicles"][0]["confirmed"] is True
