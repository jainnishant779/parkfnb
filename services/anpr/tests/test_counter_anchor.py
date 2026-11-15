"""
The "inside" count must agree with the bays.  Measured on the live lot on 27 Oct: the line counter said 1 inside while 4 cars
stood in the bays, and its day totals drifted (+4, -2, +2) because a car whose track id changed was counted twice.  The bays
are what the camera sees, so when every bay is clear to read and nobody is crossing the line, the count is put right and
the correction is logged.  The raw in and out totals are left alone.
"""
import sys
import time
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import activity_log as al  # noqa: E402
import live  # noqa: E402
from live import LiveSession  # noqa: E402


def out_with(states, calibration="ok"):
    d = {k: {"state": s, "since": time.time() - 300, "seen_vehicle": s != "free", "parking": {}} for k, s in states.items()}
    return {"tracked": [], "summary": {}, "bays": dict(states), "bay_details": d, "bay_events": [],
            "annotated": np.full((60, 80, 3), 120, np.uint8), "light": "ok", "calibration": calibration}


def feed(s, out):
    s.last_frame_at = time.time()
    s._finish(np.full((60, 80, 3), 120, np.uint8), out, time.time())


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setattr(live, "LOG_SAMPLE_S", 0.0)                  # a sample on every picture, so two pictures are two samples
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    s.set_line((0, 50), (80, 50), (40, 10), 0)
    s.counter.count_in, s.counter.count_out = 1, 0                   # the line counted one car in
    return s


FOUR = {"1": "free", "2": "free", "3": "free", "4": "occupied", "5": "occupied", "6": "occupied", "7": "occupied"}


def test_the_count_follows_the_bays_once_the_gap_has_held(session):
    assert session.snapshot()["counts"]["inside"] == 1
    feed(session, out_with(FOUR))
    assert session.snapshot()["counts"]["inside"] == 1               # one sample is not enough: a car may be on its way in
    feed(session, out_with(FOUR))
    snap = session.snapshot()
    c = snap["counts"]
    assert c["inside"] == 4 and (c["in"], c["out"]) == (1, 0)        # in and out are the raw counts and stay as they were
    assert set(c) == {"in", "out", "inside"}                          # the public counts keep their shape
    assert snap["counter_check"] == {"corrected": 1, "last_gap": -3}


def test_the_correction_is_in_the_log_and_the_totals_are_saved(session, tmp_path):
    saved = []
    session.on_counts = lambda: saved.append(session.counter.config())
    feed(session, out_with(FOUR)); feed(session, out_with(FOUR))
    row = [r for r in al.read_rows([tmp_path], "c") if r["type"] == "counter_fixed"][0]
    assert row["event"] == "Inside count put right" and "bays show 4" in row["detail"]
    assert saved and saved[-1]["start_count"] == 3                    # 3 + 1 in - 0 out = 4: survives a restart
    assert not [e for e in session.snapshot()["events"] if e["type"] == "counter_fixed"]      # the page's timeline stays quiet


def test_a_gap_that_comes_and_goes_is_not_corrected(session):
    feed(session, out_with(FOUR))
    feed(session, out_with({**FOUR, "4": "free", "5": "free", "6": "free", "7": "occupied"}))   # now the bays say 1: agrees
    feed(session, out_with(FOUR))
    assert session.snapshot()["counter_check"]["corrected"] == 0 and session.snapshot()["counts"]["inside"] == 1


def test_a_bay_that_cannot_be_read_stops_the_correction(session):
    for _ in range(3):
        feed(session, out_with(FOUR, calibration="moved"))            # every bay Unclear: the camera moved
    assert session.snapshot()["counts"]["inside"] == 1 and session.snapshot()["counter_check"]["corrected"] == 0


def test_a_car_crossing_the_line_just_now_is_left_alone(session):
    session._last_cross_t = time.time()                               # somebody is on the way in or out
    for _ in range(3):
        feed(session, out_with(FOUR))
    assert session.snapshot()["counts"]["inside"] == 1
    session._last_cross_t = time.time() - live.ANCHOR_QUIET_S - 1     # two quiet minutes later
    feed(session, out_with(FOUR)); feed(session, out_with(FOUR))
    assert session.snapshot()["counts"]["inside"] == 4


def test_a_count_too_high_comes_down_and_a_lot_that_is_empty_reads_zero(session):
    session.counter.count_in, session.counter.count_out = 9, 2        # the line double-counted: 7 inside
    empty = {k: "free" for k in FOUR}
    feed(session, out_with(empty)); feed(session, out_with(empty))
    assert session.snapshot()["counts"]["inside"] == 0 and session.snapshot()["counter_check"]["last_gap"] == 7


def test_it_can_be_switched_off(session, monkeypatch):
    monkeypatch.setattr(live, "INSIDE_FROM_BAYS", False)
    for _ in range(3):
        feed(session, out_with(FOUR))
    assert session.snapshot()["counts"]["inside"] == 1


def test_a_free_bay_blocked_by_a_car_across_it_is_not_one_more_inside(session):
    # one car lies across Bay-1 and Bay-2: Bay-2 reads occupied ("blocked") but holds no car of its own
    states = {"1": "occupied", "2": "free", "3": "free"}
    d = out_with(states)
    d["bay_details"]["2"]["blocked_by"] = "1"
    feed(session, d); feed(session, d)
    assert session.snapshot()["counts"]["inside"] == 1 and session.snapshot()["counter_check"]["corrected"] == 0


def test_reset_starts_from_zero_and_a_new_line_keeps_the_cars_that_are_inside(session):
    session.counter.start_count = -29                                # the bays corrected a drift of 30 earlier
    session.counter.count_in, session.counter.count_out = 31, 0     # so inside = 2
    assert session.counter.inside == 2
    session.reset()
    assert (session.counter.count_in, session.counter.count_out, session.counter.start_count, session.counter.inside) == (0, 0, 0, 0)
    session.counter.count_in = 1                                     # the next car in is counted (it was swallowed by the old -29)
    assert session.counter.inside == 1
    session.set_line((0, 40), (80, 40), (40, 10))                    # redrawing the line: new counts, the cars inside stay
    assert (session.counter.count_in, session.counter.inside) == (0, 1)
    session.reset(3)                                                 # an explicit start still wins
    assert session.counter.inside == 3
