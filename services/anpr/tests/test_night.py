"""
Judging the bays at night one by one (night.py).  On 28 Oct, in the dark, two white cars stood in Bay-05 and Bay-07 and the chalk of the
empty bays was plain to see, yet five bays read "Unclear" because the whole picture's mean brightness was under 45.
The two fixtures are real frames of that lot at night; the layout is the one saved at the time.
"""
import json
import sys
import time
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import night  # noqa: E402
import status as st  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
LAYOUT = json.loads((FIX / "night_layout.json").read_text())


def frame(name):
    return cv2.imread(str(FIX / name))


# ---- what a bay looks like

def test_bays_in_the_light_are_seen_empty_bays_out_of_the_light_are_not_and_cars_are_not_bare_ground():
    v = night.bay_visibility(frame("night_two_white_cars.jpg"), LAYOUT)       # two white cars in Bay-05 and Bay-07
    assert all(v[b]["seen_empty"] for b in ("Bay-02", "Bay-03", "Bay-04"))     # lit, bare, empty: seen
    assert not v["Bay-01"]["seen_empty"] and not v["Bay-06"]["seen_empty"]     # out of the light: nothing to see
    assert not v["Bay-05"]["seen_empty"] and not v["Bay-07"]["seen_empty"]     # a car is not bare ground
    assert v["Bay-05"]["edge"] > v["Bay-03"]["edge"] > v["Bay-01"]["edge"]     # the figure that separates them


def test_a_dark_car_in_a_lit_bay_is_not_taken_for_bare_ground_either():
    v = night.bay_visibility(frame("night_two_dark_cars.jpg"), LAYOUT)         # two dark cars in Bay-03 and Bay-04
    assert not v["Bay-03"]["seen_empty"] and not v["Bay-04"]["seen_empty"]     # the edges of the car give it away
    assert v["Bay-02"]["seen_empty"]                                           # the empty lit bay beside them is still seen empty


def test_a_picture_that_is_all_black_sees_nothing():
    import numpy as np
    black = np.zeros((720, 1280, 3), np.uint8)
    assert not any(x["seen_empty"] for x in night.bay_visibility(black, LAYOUT).values())


# ---- carrying "empty" through the dark

def test_a_bay_seen_empty_before_dark_is_carried_until_a_car_comes_in():
    mem = night.NightMemory()
    mem.update({"B": {"status": "VACANT", "reason": "vacant"}}, now=1000.0)             # seen empty in the light
    assert mem.carried_empty("B", now=5000.0, last_entry_t=0.0)                        # no car has ever crossed the line
    assert mem.carried_empty("B", now=5000.0, last_entry_t=900.0)                      # the last car came before it was seen empty
    assert not mem.carried_empty("B", now=5000.0, last_entry_t=2000.0)                 # a car came in after: who knows
    assert not mem.carried_empty("B", now=1000.0 + night.MAX_CARRY_S + 1, last_entry_t=0.0)   # and not for ever
    assert not mem.carried_empty("other", now=1000.0, last_entry_t=0.0)                # never seen: nothing to carry


def test_a_carried_bay_does_not_keep_itself_alive_and_an_occupied_bay_is_forgotten():
    mem = night.NightMemory()
    mem.update({"B": {"status": "VACANT", "reason": "vacant"}, "C": {"status": "VACANT", "reason": "vacant"}}, now=1000.0)
    mem.update({"B": {"status": "VACANT", "reason": "night_carry"}, "C": {"status": "OCCUPIED", "reason": "parked"}}, now=9000.0)
    assert mem.carried_empty("B", now=9000.0, last_entry_t=2000.0) is False            # still stamped 1000: the car at 2000 counts
    assert not mem.carried_empty("C", now=9000.0, last_entry_t=0.0)                    # a car parked there: no longer empty
    mem.update({"B": {"status": "VACANT", "reason": "night_seen"}}, now=9500.0)        # seen empty in the dark: stamped again
    assert mem.carried_empty("B", now=9600.0, last_entry_t=2000.0)
    mem.forget()
    assert not mem.carried_empty("B", now=9600.0, last_entry_t=0.0)


# ---- what the page says

def details(state="free", seen_vehicle=False, **night_flags):
    return {"state": state, "since": time.time() - 60, "seen_vehicle": seen_vehicle, **({"night": night_flags} if night_flags else {})}


def test_in_the_dark_an_empty_bay_that_is_seen_or_carried_stays_available_and_says_why():
    out = st.compose_bays({"a": details(seen_empty=True, carry=False), "b": details(seen_empty=False, carry=True),
                           "c": details(seen_empty=False, carry=False), "d": details()}, low_light=True)
    assert (out["a"]["status"], out["a"]["reason"]) == (st.VACANT, "night_seen")
    assert (out["b"]["status"], out["b"]["reason"]) == (st.VACANT, "night_carry")
    assert (out["c"]["status"], out["c"]["reason"]) == (st.UNCERTAIN, "low_light")        # too dark and no evidence: unclear, as before
    assert (out["d"]["status"], out["d"]["reason"]) == (st.UNCERTAIN, "low_light")        # no night information at all: as before
    assert "seen empty in the dark" in out["a"]["reason_text"] and "no car has come in" in out["b"]["reason_text"]


def test_darkness_never_makes_a_bay_occupied_or_overrides_a_moved_camera():
    out = st.compose_bays({"o": details(state="occupied", seen_vehicle=True, seen_empty=True, carry=True),
                           "m": details(seen_empty=True, carry=True)}, low_light=True)
    assert out["o"]["status"] == st.OCCUPIED                                                # a car that is seen is a car
    out = st.compose_bays({"m": details(seen_empty=True, carry=True)}, low_light=True, moved=True)
    assert out["m"]["status"] == st.UNCERTAIN and out["m"]["reason"] == "camera_moved"     # if the camera moved, the bays are not where they were


def test_in_good_light_nothing_changes():
    out = st.compose_bays({"a": details(seen_empty=False, carry=False)}, low_light=False)
    assert (out["a"]["status"], out["a"]["reason"]) == (st.VACANT, "vacant")
