"""
Fair verdicts: a bumper past the front (road side) or back line is not a violation, a car over a side line is, and a
good bay's calibration error is taken off before either is judged.  Measured on the live frame of 26 Oct: a correctly
parked hatchback in Bay-02 was reported "Over the near line by 0.13 m".
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from synthetic_scene import Camera, Stall, W, H_IMG, bay_polygon, parked, render_mask  # noqa: E402
from contact import ContactReport, analyse_contact, bay_frame  # noqa: E402
from intelligence import (STATE_CORRECT, STATE_SUSPICIOUS, STATE_WRONG, ParkingThresholds,  # noqa: E402
                          _classify_from_contact, _reported_crossing)

CFG = ParkingThresholds()


def good(per_side=None, margin=0.11, **kw):
    """A hand-built report for a good bay: the certain crossing per side, and the bay's calibration error."""
    per_side = {"left": 0.0, "right": 0.0, "near": 0.0, "far": 0.0, **(per_side or {})}
    worst = max(per_side, key=per_side.get)
    return ContactReport(crossing_m=per_side[worst], crossing_side=worst if per_side[worst] else None,
                         crossing_per_side=per_side, upper_per_side=dict(per_side), n_points=6,
                         calibration_status="good", calibration_margin_m=margin, **kw)


def verdict(rep):
    return _classify_from_contact(rep, CFG)


# ---- the front and back lines allow bumper overhang

def test_a_bumper_a_hand_span_past_the_front_line_is_parked_correctly():
    state, _, why = verdict(good({"near": 0.13}))                                       # the real Bay-02 reading
    assert state == STATE_CORRECT, why
    assert verdict(good({"near": 0.38}, margin=0.0))[0] == STATE_CORRECT                 # right at the allowance
    assert verdict(good({"far": 0.30}))[0] == STATE_CORRECT                              # and past the back line too


def test_far_past_the_front_line_is_a_violation_and_says_front_line():
    state, _, why = verdict(good({"near": 0.62}))
    assert state == STATE_WRONG and "front line (road side)" in why[0] and "0.62" in why[0]
    assert verdict(good({"far": 0.70}))[0] == STATE_WRONG and "back line" in verdict(good({"far": 0.70}))[2][0]


def test_between_the_allowance_and_the_calibration_error_it_is_a_warning_not_a_violation():
    state, _, why = verdict(good({"near": 0.45}, margin=0.11))                           # 0.45 - 0.11 = 0.34: still allowed
    assert state == STATE_SUSPICIOUS and "Reaching past the front line" in why[0]


# ---- the side lines are strict, with the calibration error taken off (also on good bays)

def test_a_side_crossing_inside_the_calibration_error_is_only_a_warning_on_a_good_bay():
    state, _, why = verdict(good({"right": 0.15}, margin=0.11))                          # 0.15 - 0.11 = 0.04 < 0.10
    assert state == STATE_SUSPICIOUS and "right line" in why[0]


def test_a_side_crossing_beyond_the_calibration_error_is_a_violation():
    state, _, why = verdict(good({"right": 0.25}, margin=0.11))
    assert state == STATE_WRONG and "right line" in why[0] and "0.25" in why[0] and "±0.11" in why[0]
    assert verdict(good({"left": 0.12}, margin=0.0))[0] == STATE_WRONG                   # no known error: the plain 0.10 m


def test_a_side_crossing_hides_behind_a_larger_front_overhang_no_longer():
    state, _, why = verdict(good({"near": 0.30, "right": 0.30}, margin=0.0))
    assert state == STATE_WRONG and "right line" in why[0]


def test_intruding_into_the_next_bay_still_counts_and_a_lone_touch_is_a_warning():
    assert verdict(good(straddle={"Bay-03": 0.40}))[0] == STATE_WRONG
    assert verdict(good(straddle={"Bay-03": 0.15}, margin=0.11))[0] == STATE_SUSPICIOUS


def test_a_loosely_fitted_bay_with_no_known_error_stays_a_warning():
    rep = good({"right": 0.40}, margin=None)
    rep.calibration_status = "degraded"
    state, _, why = verdict(rep)
    assert state == STATE_SUSPICIOUS and "approximate" in why[0]


def test_the_crossing_that_is_shown_is_the_one_that_broke_the_rule():
    m, side = _reported_crossing(good({"near": 0.35, "right": 0.14}), CFG)
    assert (m, side) == (0.14, "right")                                                  # 0.04 over its limit beats 0.05 under
    m, side = _reported_crossing(good({"near": 0.70, "right": 0.05}), CFG)
    assert (m, side) == (0.70, "near")
    assert _reported_crossing(ContactReport(crossing_m=0.3, crossing_side="left"), CFG) == (0.3, "left")   # a hand-built report


def test_the_over_reporting_possible_bound_never_warns_about_the_front_or_back_line():
    rep = good({"near": 0.16})
    rep.upper_per_side = {"left": 0.0, "right": 0.0, "near": 0.69, "far": 0.50}          # what the live Bay-02 gave
    rep.inferred_per_side = {"left": 0.0, "right": 0.0, "near": 0.60}
    state, _, why = verdict(rep)
    assert state == STATE_CORRECT, why
    rep.upper_per_side["right"] = 0.40                                                    # the same bound on a side line does warn
    assert verdict(rep)[0] == STATE_SUSPICIOUS


def test_the_allowance_is_a_setting():
    strict = ParkingThresholds(end_line_tolerance_m=0.10)
    assert _classify_from_contact(good({"near": 0.30}, margin=0.0), strict)[0] == STATE_WRONG
    assert _classify_from_contact(good({"near": 0.30}, margin=0.0), CFG)[0] == STATE_CORRECT


# ---- end to end on rendered scenes (a known camera, a known car)

CAM, STALL = Camera(6, 45), Stall(x_center=3.0, y_near=4.0)


def analyse(car):
    return analyse_contact(render_mask(CAM, car), "B", {"B": bay_frame(bay_polygon(CAM, STALL))}, (W, H_IMG))


@pytest.mark.parametrize("over,expect", [(0.0, STATE_CORRECT), (0.25, STATE_CORRECT), (0.80, STATE_WRONG)])
def test_a_car_pushed_toward_the_front_line_is_judged_by_how_far(over, expect):
    rep = analyse(parked(STALL, rear_gap=-over))                 # the car's near end is `over` metres past the front line
    state, _, why = verdict(rep)
    assert state == expect, (over, why)
    if over >= 0.6:
        assert "front line" in why[0]


def test_a_nose_past_the_chalk_is_not_counted_as_outside_the_bay():
    inside, over = analyse(parked(STALL)), analyse(parked(STALL, rear_gap=-0.30))
    assert inside.outside_ratio < 0.02 and over.outside_ratio < 0.02                     # the 25 % rule never sees an overhang


def test_a_car_over_the_side_line_is_a_violation_whatever_it_does_at_the_ends():
    rep = analyse(parked(STALL, dx=-0.6, rear_gap=-0.30))        # 0.25 m over the left line and a nose past the front line
    state, _, why = verdict(rep)
    assert state == STATE_WRONG and "left line" in why[0], why
