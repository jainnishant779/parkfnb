"""
28 Oct: after the camera was moved the bays ran slanted across the picture (axes 26-42 degrees).  A car lying over Bay-04 and
Bay-05 was given to Bay-04 on the flat footprint (0.275 v 0.252), then its footprint was turned to Bay-04's axis, landed 40 %
in Bay-05 and 2 % in Bay-04, and every bay read Free although the car was plainly there.  The car must go to the bay its
turned footprint covers most.
"""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from occupancy import BayMap  # noqa: E402

BAYS = {"Bay-03": [[474, 387], [642, 376], [852, 563], [611, 585]], "Bay-04": [[642, 376], [796, 367], [1028, 535], [852, 563]],
        "Bay-05": [[796, 367], [922, 367], [1200, 521], [1028, 535]], "Bay-06": [[922, 367], [1035, 357], [1280, 477], [1200, 521]]}


def car(x1, y1, x2, y2):
    return NS(x1=x1, y1=y1, x2=x2, y2=y2, confidence=0.9, track_id=1, class_name="car", vehicle_type="suv")


def test_a_car_over_two_slanted_bays_is_not_lost_between_them():
    bm = BayMap(BAYS)
    obs = {o.bay_id: o for o in bm.observe([car(754, 283, 1034, 483)], image_size=(1280, 720))}
    taken = [b for b, o in obs.items() if o.state != "free"]
    assert taken == ["Bay-05"], {b: (o.state, o.coverage) for b, o in obs.items()}      # the bay its footprint covers most
    assert obs["Bay-05"].coverage > 0.3


def test_straight_bays_are_assigned_as_before():
    flat = {"A": [[0, 100], [100, 100], [100, 200], [0, 200]], "B": [[100, 100], [200, 100], [200, 200], [100, 200]]}
    bm = BayMap(flat)
    obs = {o.bay_id: o for o in bm.observe([car(110, 20, 190, 200)], image_size=(640, 360))}
    assert obs["A"].state == "free" and obs["B"].state != "free"
