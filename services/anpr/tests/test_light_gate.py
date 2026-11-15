"""
28 Oct, 7 PM: the picture's brightness hovered around the "too dark" threshold (mean 38-46 against 45) and a bare `mean < 45` flipped
the whole lot between "unclear" and judged about forty times in half an hour.  The gate smooths, has a band, and holds.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from status import LightGate  # noqa: E402


def run(gate, values, step=1.0, t0=1000.0):
    return [gate.update(v, t0 + i * step) for i, v in enumerate(values)]


def test_a_brightness_that_hovers_around_the_threshold_does_not_flap():
    g = LightGate(threshold=45.0)
    states = run(g, [46, 44, 47, 43, 45, 42, 46, 44, 41, 47, 44, 45] * 10)               # 2 minutes at dusk
    assert set(states) == {"ok"}
    g = LightGate(threshold=45.0)
    states = run(g, [38, 36, 40, 35, 39, 41, 37, 40, 38, 42] * 10)                         # and the same at night: low, and stays low
    assert set(states[3:]) == {"low"} and sum(1 for a, b in zip(states, states[1:]) if a != b) <= 1


def test_it_closes_when_it_is_really_dark_and_opens_only_when_it_is_really_light():
    g = LightGate(threshold=45.0, hold_s=10.0)
    assert run(g, [120] * 5)[-1] == "ok"
    assert run(g, [10] * 40, t0=2000.0)[-1] == "low"                                       # night falls
    assert run(g, [48] * 40, t0=3000.0)[-1] == "low"                                       # a street light: above the old threshold, still not day
    assert run(g, [120] * 40, t0=4000.0)[-1] == "ok"                                       # morning


def test_a_change_is_never_followed_by_another_within_the_hold():
    g = LightGate(threshold=45.0, hold_s=30.0, smooth=1.0)                                  # no smoothing: the hold alone
    states = run(g, [10, 120, 10, 120, 10, 120], step=2.0)
    assert states == ["low"] * 6                                                           # first change is free, the rest wait 30 s
    assert g.update(120, 1000.0 + 40.0) == "ok"


def test_a_first_dark_picture_is_called_dark_at_once():
    assert LightGate().update(5.0, 1.0) == "low"
    assert LightGate().update(120.0, 1.0) == "ok"
