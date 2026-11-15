"""
Cars that cover more than their own bay: "parked across two bays", the bay they block, and the verdict taken from the
fitted 3D box when the silhouette cannot be trusted (two cars' outlines run together).
"""
import sys
import time
from pathlib import Path
from types import SimpleNamespace as NS

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import cuboid_fit as CF  # noqa: E402
import status as st  # noqa: E402


def ev(**kw):
    base = {"source": "mask", "camera": True, "calibration": "good", "margin_m": 0.12, "reason": "", "side": None,
            "crossing_m": 0.0, "skew_deg": None, "clearance": {}, "footprint_wl": [1.9, 4.4]}
    return {**base, **kw}


GOOD_FIT = {"quality": "good", "iou": 0.85, "visible": 1.0, "cls": "suv"}
MERGED = {"footprint_wl": [3.2, 4.7]}                                  # two outlines run together: too big for one car


# ---- across bays

def test_a_car_lying_over_two_bays_is_over_the_line_and_names_them():
    v = st.parking_verdict(ev(fit=GOOD_FIT, across=["P5", "P6"]), "wrong")
    assert v["verdict"] == st.OVER_LINE and v["side"] == "across" and v["across"] == ["P5", "P6"]
    assert v["reason_text"] == "Parked across P5 and P6" and v["source"] == "3d_fit"


def test_a_blocked_bay_stays_blocked_even_when_the_live_feed_gives_it_parking_evidence():
    # the live feed's details always carry a "parking" entry, even for a bay the camera sees as free (28 Oct, night: Bay-04 was blocked
    # by the car in Bay-05, and the page said "A car is parked here" beside a label that said "Free")
    d = {"state": "free", "since": time.time() - 60, "seen_vehicle": False, "parking": ev(), "blocked_by": "Bay-05"}
    out = st.compose_bays({"Bay-04": d})["Bay-04"]
    assert (out["status"], out["flag"], out["reason"]) == (st.OCCUPIED, "blocked", "blocked")
    assert out["reason_text"] == "Blocked by the car in Bay-05" and out["blocked_by"] == "Bay-05" and "parking" not in out


def test_across_needs_a_good_fit_and_two_bays():
    assert st.parking_verdict(ev(fit={**GOOD_FIT, "quality": "partial"}, across=["P5", "P6"]), "correct").get("side") != "across"
    assert st.parking_verdict(ev(fit=GOOD_FIT, across=["P5"]), "correct")["verdict"] == st.CORRECT
    assert st.parking_verdict(ev(fit=GOOD_FIT, across=["P5", "P6"]), "occluded")["verdict"] == st.NOT_JUDGED   # hidden: still not judged


# ---- the verdict from the fitted box when the outline is merged

def fit_ev(over=None, gap=None, margin=0.12, **kw):
    over = {"left": 0.0, "right": 0.0, "near": 0.0, "far": 0.0, **(over or {})}
    return ev(fit=GOOD_FIT, fit_over=over, fit_gap=gap or {"left": -0.4, "right": -0.5, "near": -0.2, "far": -0.1},
              margin_m=margin, **MERGED, **kw)


def test_a_merged_outline_is_judged_from_the_box_and_the_clearances_come_from_it():
    v = st.parking_verdict(fit_ev(), "wrong")
    assert v["verdict"] == st.CORRECT and v["source"] == "3d_fit"
    assert v["clearance"] == {"left": 0.4, "right": 0.5}
    assert v["reason_text"].startswith("Parked correctly: 0.40 m to the left line, 0.50 m to the right line") and "3D box" in v["reason_text"]


def test_the_box_is_placed_less_exactly_so_a_line_needs_more_before_it_is_called_crossed():
    assert st.parking_verdict(fit_ev({"right": 0.30}), "wrong")["verdict"] == st.CLOSE_TO_LINE            # 0.30 < 0.10 + 0.25
    v = st.parking_verdict(fit_ev({"right": 0.45}), "wrong")
    assert v["verdict"] == st.OVER_LINE and v["side"] == "right" and "right line by 0.45 m" in v["reason_text"]
    assert st.parking_verdict(fit_ev({"far": 0.55}), "wrong")["verdict"] == st.CLOSE_TO_LINE              # past the back line: 0.40 allowed
    v = st.parking_verdict(fit_ev({"near": 0.80}), "wrong")
    assert v["verdict"] == st.OVER_LINE and "front line (road side)" in v["reason_text"]


def test_a_far_bay_with_a_big_calibration_error_needs_a_bigger_overshoot():
    assert st.parking_verdict(fit_ev({"right": 0.45}, margin=0.40), "wrong")["verdict"] == st.CLOSE_TO_LINE   # 0.10 + 1.5 x 0.40 = 0.70


def test_without_a_good_fit_a_merged_outline_stays_not_judged():
    v = st.parking_verdict(ev(**MERGED), "wrong")
    assert v["verdict"] == st.NOT_JUDGED and "too large" in v["reason_text"]
    partial = fit_ev()
    partial["fit"] = {**GOOD_FIT, "quality": "partial"}
    assert st.parking_verdict(partial, "wrong")["verdict"] == st.NOT_JUDGED


def test_a_good_outline_is_still_judged_by_its_own_contact_not_by_the_box():
    v = st.parking_verdict(ev(fit=GOOD_FIT, fit_over={"right": 0.9, "left": 0, "near": 0, "far": 0}, reason="Over the left line by 0.3 m",
                              side="left", crossing_m=0.3), "wrong")
    assert v["verdict"] == st.OVER_LINE and v["side"] == "left" and v.get("source") != "3d_fit"


# ---- the bay that is blocked

def details(**per_bay):
    return {k: {"state": s, "since": None, **extra} for k, (s, extra) in per_bay.items()}


def test_a_free_bay_under_a_car_that_lies_across_it_is_occupied_and_blocked():
    out = st.compose_bays(details(P5=("free", {"blocked_by": "P6"}), P6=("occupied", {}), P7=("free", {})))
    assert out["P5"]["status"] == st.OCCUPIED and out["P5"]["flag"] == "blocked" and out["P5"]["blocked_by"] == "P6"
    assert out["P5"]["reason_text"] == "Blocked by the car in P6" and out["P7"]["status"] == st.VACANT
    s = st.summarize(out)
    assert s["blocked"] == 1 and s["occupied_confirmed"] == 2 and s["vacant"] == 1
    assert s["total"] == s["vacant"] + s["occupied_confirmed"] + s["uncertain"] + s["stale"]       # the counts still add up
    assert s["flagged"] == 0                                                                        # blocking is not a parking fault


def test_the_caller_can_pass_the_blocked_map_instead():
    out = st.compose_bays(details(P5=("free", {}), P6=("occupied", {})), blocked={"P5": "P6"})
    assert out["P5"]["flag"] == "blocked"


def test_blocked_gives_way_to_an_operators_answer_a_moved_camera_and_a_lost_feed():
    d = details(P5=("free", {"blocked_by": "P6"}))
    assert st.compose_bays(d, overrides={"P5": {"status": st.VACANT, "until": time.time() + 600}})["P5"]["flag"] == "operator"
    assert st.compose_bays(d, moved=True)["P5"]["status"] == st.UNCERTAIN
    assert st.compose_bays(d, stale=True)["P5"]["status"] == st.STALE


def test_an_occupied_bay_is_never_changed_by_a_blocked_note():
    out = st.compose_bays(details(P5=("occupied", {"blocked_by": "P6"})))
    assert out["P5"]["flag"] is None and "blocked_by" not in out["P5"]


# ---- from the fits to the blocked map (the app's helpers, with stand-in fits)

class FlatCal:
    def __init__(self, n=3):
        self.bays = {f"B{i}": NS(frame=NS(width_m=2.5, length_m=5.0)) for i in range(n)}
        self._i = {f"B{i}": i for i in range(n)}

    def stall_to_world(self, bay_id, pts):
        return np.asarray(pts, float) + (self._i[bay_id] * 2.5, 10.0)


def fake_fit(cx, cy, yaw, quality="good"):
    base = CF._corners(cx, cy, np.radians(yaw), 4.4, 1.8)[0]
    return NS(quality=quality, base_world=base, footprint=CF.Polygon([tuple(p) for p in base]), iou=0.85, visible_share=1.0, cls="suv", ms=100.0)


def test_a_car_across_b0_and_b1_blocks_nothing_it_owns_but_a_free_neighbour_is_blocked():
    cal = FlatCal(3)
    states = {"B0": NS(state="occupied"), "B1": NS(state="free"), "B2": NS(state="free")}
    fits = {"B0": fake_fit(2.5, 12.5, 90)}                                  # the car stands on the line between B0 and B1 (half in each)
    assert app_module._blocked_by_fits(fits, states, cal) == {"B1": "B0"}
    states["B1"] = NS(state="occupied")                                     # B1 has its own car: nothing to block
    assert app_module._blocked_by_fits(fits, states, cal) == {}
    states["B1"] = NS(state="free")
    assert app_module._blocked_by_fits({"B0": fake_fit(2.5, 12.5, 90, "partial")}, states, cal) == {}   # only a good fit may block


def test_a_car_inside_its_bay_blocks_nothing():
    cal = FlatCal(3)
    states = {"B0": NS(state="free"), "B1": NS(state="occupied"), "B2": NS(state="free")}
    assert app_module._blocked_by_fits({"B1": fake_fit(3.75, 12.5, 90)}, states, cal) == {}


def test_the_evidence_names_the_bays_a_good_fit_lies_over_and_gives_the_gaps():
    cal = FlatCal(3)
    e = app_module._fit_evidence(cal, "B0", fake_fit(2.5, 12.5, 90))
    assert e["across"] == ["B0", "B1"] and e["fit"]["quality"] == "good"
    assert e["fit_over"]["right"] > 0.5 and e["fit_gap"]["left"] < 0
    assert app_module._fit_evidence(cal, "B0", fake_fit(2.5, 12.5, 90, "partial"))["across"] == []      # a guess never says "across"
    assert app_module._fit_evidence(cal, "B0", None) == {}


def test_the_tag_on_a_box_says_how_far_and_over_which_line():
    label = app_module._box_label
    assert label({"verdict": st.OVER_LINE, "side": "near", "crossing_m": 0.62}) == "62 cm over front"
    assert label({"verdict": st.OVER_LINE, "side": "right", "crossing_m": 0.31}) == "31 cm over right"
    assert label({"verdict": st.OVER_LINE, "side": "across", "across": ["P5", "P6"]}) == "across 2 bays"
    assert label({"verdict": st.CORRECT}) is None and label({"verdict": st.CLOSE_TO_LINE, "side": "left", "crossing_m": 0.2}) is None
