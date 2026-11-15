"""
A bay's parking verdict must not flicker.  Measured on the live log of 27 Oct: Bay-05 read "over the back line by 0.58-0.70 m"
and "parked correctly" in turn, about 40 flips in 10 minutes, because the silhouette's lowest points swing by 0.1 m from
frame to frame and the car was right at the threshold.
"""
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import status as st  # noqa: E402
from status import CORRECT, CLOSE_TO_LINE, NOT_JUDGED, OVER_LINE, VerdictHold  # noqa: E402


def v(name, text=None, **kw):
    return {"verdict": name, "reason_text": text or name, **kw}


# ---- the hold

def test_a_flicker_between_over_and_correct_never_reaches_the_page():
    h = VerdictHold(to_over_s=12, to_other_s=8)
    shown = [h.update("b", v(CORRECT), 0.0)["verdict"]]
    t = 0.0
    for _ in range(20):                               # over for 5 s, correct for 7 s, again and again (the live pattern)
        for _ in range(5):
            t += 1
            shown.append(h.update("b", v(OVER_LINE), t)["verdict"])
        for _ in range(7):
            t += 1
            shown.append(h.update("b", v(CORRECT), t)["verdict"])
    assert set(shown) == {CORRECT}


def test_a_violation_that_lasts_is_flagged_after_the_hold_and_cleared_after_a_shorter_one():
    h = VerdictHold(to_over_s=12, to_other_s=8)
    h.update("b", v(CORRECT), 0.0)
    for t in range(1, 12):
        assert h.update("b", v(OVER_LINE), float(t))["verdict"] == CORRECT          # not yet: 11 s
    assert h.update("b", v(OVER_LINE), 13.0)["verdict"] == OVER_LINE                # 12 s without a break: flagged
    for t in range(14, 21):
        assert h.update("b", v(CORRECT), float(t))["verdict"] == OVER_LINE          # still held: 7 s
    assert h.update("b", v(CORRECT), 22.0)["verdict"] == CORRECT                    # 8 s without a break: cleared


def test_a_break_restarts_the_clock():
    h = VerdictHold(to_over_s=10, to_other_s=8)
    h.update("b", v(CORRECT), 0.0)
    for t in range(1, 9):
        h.update("b", v(OVER_LINE), float(t))
    h.update("b", v(CORRECT), 9.0)                                                   # one frame of correct
    assert h.update("b", v(OVER_LINE), 10.0)["verdict"] == CORRECT                  # the 8 s before it no longer count
    assert h.update("b", v(OVER_LINE), 19.0)["verdict"] == CORRECT
    assert h.update("b", v(OVER_LINE), 20.5)["verdict"] == OVER_LINE


def test_the_held_verdict_shows_the_latest_numbers():
    h = VerdictHold()
    h.update("b", v(CORRECT, "Parked correctly: 0.40 m to the left line"), 0.0)
    out = h.update("b", v(CORRECT, "Parked correctly: 0.42 m to the left line"), 1.0)
    assert out["reason_text"].endswith("0.42 m to the left line")


def test_a_car_arriving_with_a_violation_is_checked_first_and_one_arriving_fine_is_shown_at_once():
    h = VerdictHold(to_over_s=12)
    first = h.update("a", v(OVER_LINE, "Over the left line by 0.4 m"), 0.0)
    assert first["verdict"] == NOT_JUDGED and first["reason_text"] == "Checking how it is parked"
    assert h.update("a", v(OVER_LINE, "Over the left line by 0.4 m"), 13.0)["verdict"] == OVER_LINE
    assert h.update("c", v(CORRECT), 0.0)["verdict"] == CORRECT


def test_an_empty_bay_forgets_so_the_next_car_starts_fresh_and_bays_do_not_mix():
    h = VerdictHold()
    h.update("a", v(OVER_LINE), 0.0)
    for t in range(1, 14):
        h.update("a", v(OVER_LINE), float(t))
    assert h.update("a", v(OVER_LINE), 14.0)["verdict"] == OVER_LINE
    assert h.update("a", None, 15.0) is None                                          # the car left
    assert h.update("a", v(CORRECT), 16.0)["verdict"] == CORRECT                      # the next car is not judged by the last
    h.update("x", v(CORRECT), 0.0)
    assert h.update("y", v(OVER_LINE), 1.0)["verdict"] == NOT_JUDGED and h.update("x", v(CORRECT), 2.0)["verdict"] == CORRECT
    h.forget("x")
    assert h.update("x", v(CLOSE_TO_LINE), 3.0)["verdict"] == CLOSE_TO_LINE


# ---- compose_bays shows the held verdict

def details(parking_final=None):
    d = {"state": "wrong", "since": time.time() - 60, "seen_vehicle": True,
         "parking": {"source": "mask", "camera": True, "calibration": "good", "margin_m": 0.1, "reason": "Over the left line by 0.4 m",
                     "side": "left", "crossing_m": 0.4, "footprint_wl": [1.9, 4.4]}}
    if parking_final is not None:
        d["parking_final"] = parking_final
    return {"a": d}


def test_the_page_shows_the_held_verdict_not_this_frames():
    held = v(CORRECT, "Parked correctly: 0.30 m to the left line", clearance={"left": 0.3})
    out = st.compose_bays(details(held))["a"]
    assert out["parking"]["verdict"] == CORRECT and out["flag"] is None and out["reason"] == "parked_ok"
    assert st.compose_bays(details())["a"]["parking"]["verdict"] == OVER_LINE       # without a hold: the raw one, as before


# ---- a front or back line needs the 3D box to agree

def ev_far(fit_far, quality="good"):
    return {"source": "mask", "camera": True, "calibration": "degraded", "margin_m": 0.23, "reason": "Over the back line by 0.64 m",
            "side": "far", "crossing_m": 0.64, "footprint_wl": [1.9, 4.4],
            "fit": {"quality": quality}, "fit_over": {"left": 0.0, "right": 0.0, "near": 0.0, "far": fit_far}}


def test_a_back_line_crossing_the_box_does_not_confirm_is_only_a_warning():
    out = st.parking_verdict(ev_far(0.39), "wrong")                                  # the box puts the car 0.39 m past: allowed
    assert out["verdict"] == CLOSE_TO_LINE and "3D box does not confirm" in out["reason_text"] and "back line" in out["reason_text"]


def test_a_back_line_crossing_the_box_agrees_with_stays_a_violation():
    out = st.parking_verdict(ev_far(0.95), "wrong")                                  # 0.95 > 0.40 + 0.35
    assert out["verdict"] == OVER_LINE and out["side"] == "far"


def test_without_a_good_fit_the_silhouette_alone_decides_as_before():
    assert st.parking_verdict(ev_far(0.0, quality="partial"), "wrong")["verdict"] == OVER_LINE
    e = ev_far(0.0)
    del e["fit_over"]
    assert st.parking_verdict(e, "wrong")["verdict"] == OVER_LINE


def test_a_side_line_crossing_is_not_overruled_by_the_box():
    e = ev_far(0.0)
    e.update(side="right", reason="Over the right line by 0.4 m", crossing_m=0.4)
    assert st.parking_verdict(e, "wrong")["verdict"] == OVER_LINE
