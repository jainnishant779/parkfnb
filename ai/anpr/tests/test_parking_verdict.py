"""
"Is this car parked correctly?" as the visitors see it: shown only on solid evidence (a silhouette on a bay with a
usable calibration), and never as a guess.  Also the clean 3D box on the public picture and the timeline events.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import status as st  # noqa: E402
from live import LiveSession, draw_clean_boxes  # noqa: E402

GOOD = dict(source="mask", camera=True, calibration="good", margin_m=0.12)


def ev(**kw):
    return {**GOOD, "reason": "", "side": None, "crossing_m": 0.0, "skew_deg": None, "clearance": {}, **kw}


# ---- the gate

@pytest.mark.parametrize("engine", ["correct", "occupied"])
def test_a_silhouette_on_a_good_bay_that_sits_inside_its_lines_is_parked_correctly(engine):
    v = st.parking_verdict(ev(clearance={"left": 0.421, "right": 0.5, "near": 0.9}), engine)
    assert v["verdict"] == st.CORRECT and v["clearance"] == {"left": 0.42, "right": 0.5, "near": 0.9}
    assert v["reason_text"] == "Parked correctly: 0.42 m to the left line, 0.50 m to the right line"


def test_a_correct_verdict_without_distances_still_says_correct():
    assert st.parking_verdict(ev(), "correct")["reason_text"] == "Parked correctly"


def test_over_the_line_uses_the_engines_own_sentence_and_names_the_side():
    v = st.parking_verdict(ev(reason="Over the left line by 0.25 m", side="left", crossing_m=0.25), "wrong")
    assert v["verdict"] == st.OVER_LINE and v["side"] == "left" and v["crossing_m"] == 0.25
    assert v["reason_text"] == "Over the left line by 0.25 m"


def test_close_to_the_line_and_a_slanted_car_are_a_warning_not_an_alarm():
    v = st.parking_verdict(ev(reason="Parked at 21° to the bay, inside its lines", skew_deg=21.0), "suspicious")
    assert v["verdict"] == st.CLOSE_TO_LINE and "21°" in v["reason_text"]


def test_a_crossing_still_waiting_for_its_confirmation_is_worded_as_a_possibility():
    v = st.parking_verdict(ev(reason="Over the far line by 0.20 m", side="far", crossing_m=0.2), "suspicious")
    assert v["verdict"] == st.CLOSE_TO_LINE
    assert v["reason_text"] == "Possibly over the far line by 0.20 m (not yet confirmed)"


@pytest.mark.parametrize("engine", ["wrong", "suspicious", "correct", "occupied"])
def test_a_box_only_guess_is_never_a_verdict(engine):
    v = st.parking_verdict(ev(source="bbox", reason="26% of vehicle outside slot lines"), engine)
    assert v["verdict"] == st.NOT_JUDGED and "outline of the car" in v["reason_text"]


@pytest.mark.parametrize("cal", [None, "rejected"])
def test_a_bay_with_no_usable_calibration_is_not_judged(cal):
    v = st.parking_verdict(ev(calibration=cal), "wrong")
    assert v["verdict"] == st.NOT_JUDGED and "too rough" in v["reason_text"]


def test_without_a_3d_camera_nothing_is_judged():
    v = st.parking_verdict(ev(camera=False), "wrong")
    assert v["verdict"] == st.NOT_JUDGED and "not ready" in v["reason_text"]


@pytest.mark.parametrize("wl", [[2.86, 5.52], [1.9, 6.4], [2.6, 4.3]])
def test_an_outline_too_big_for_one_car_is_two_cars_joined_and_is_not_judged(wl):
    v = st.parking_verdict(ev(footprint_wl=wl, reason="Occupying another bay: tyres/bumper 6 (0.27 m) inside it"), "wrong")
    assert v["verdict"] == st.NOT_JUDGED and "too large for one car" in v["reason_text"]


@pytest.mark.parametrize("wl", [[1.8, 4.3], [2.1, 5.0], [2.45, 5.8], None])
def test_a_footprint_the_size_of_one_car_is_judged_as_usual(wl):
    v = st.parking_verdict(ev(footprint_wl=wl, reason="Over the left line by 0.25 m", side="left", crossing_m=0.25), "wrong")
    assert v["verdict"] == st.OVER_LINE


def test_a_car_hidden_by_another_is_not_judged():
    assert st.parking_verdict(ev(), "occluded")["verdict"] == st.NOT_JUDGED


def test_a_degraded_bay_still_gets_a_verdict_because_the_engine_already_allowed_for_its_error():
    v = st.parking_verdict(ev(calibration="degraded", margin_m=0.22, reason="Over the right line by 0.40 m (clear of this bay's ±0.22 m calibration error)",
                              side="right", crossing_m=0.4), "wrong")
    assert v["verdict"] == st.OVER_LINE and v["calibration"] == "degraded" and v["margin_m"] == 0.22


# ---- how it reaches the page

def details(**bays):
    return {k: {"state": s, "since": time.time() - 60, "seen_vehicle": s != "free", "parking": p} for k, (s, p) in bays.items()}


def test_the_public_flag_follows_the_verdict_not_the_raw_state():
    slots = st.compose_bays(details(
        a=("wrong", ev(source="bbox")),                                           # a box guess: no flag
        b=("wrong", ev(reason="Over the left line by 0.25 m", side="left", crossing_m=0.25)),
        c=("suspicious", ev(reason="Possibly on the left line (up to 0.15 m)")),
        d=("correct", ev(clearance={"left": 0.4, "right": 0.5})),
        e=("free", ev(source="bbox"))))
    assert [slots[k]["flag"] for k in "abcde"] == [None, "wrong", "suspicious", None, None]
    assert [slots[k]["status"] for k in "abcde"] == ["OCCUPIED"] * 4 + ["VACANT"]
    assert slots["a"]["parking"]["verdict"] == st.NOT_JUDGED and slots["a"]["reason"] == "parked"
    # and the sentence says only that a car is there: never "Parked across the lines" for a box-only guess
    assert slots["a"]["reason_text"] == "A car is parked here"
    assert all("across the lines" not in slots[k]["reason_text"] for k in "ace")
    assert slots["b"]["reason_text"] == "Over the left line by 0.25 m" and slots["d"]["reason"] == "parked_ok"
    assert "parking" not in slots["e"]                                            # a free bay has no parking


def test_the_summary_counts_each_verdict_and_stays_consistent():
    slots = st.compose_bays(details(
        a=("wrong", ev(source="bbox")), b=("wrong", ev(reason="Over the left line")), c=("suspicious", ev()),
        d=("correct", ev()), e=("correct", ev()), f=("free", ev()), g=("unknown", ev())))
    s = st.summarize(slots)
    assert (s["parked_correctly"], s["close_to_line"], s["over_line"], s["not_judged"]) == (2, 1, 1, 1)
    assert s["occupied_confirmed"] == 5 and s["flagged"] == 2 and s["review"] == 3
    assert s["vacant"] + s["occupied_confirmed"] + s["uncertain"] + s["stale"] == s["total"] == 7


def test_without_3d_evidence_the_old_behaviour_is_unchanged():
    slots = st.compose_bays({"a": {"state": "wrong", "since": time.time()}, "b": {"state": "correct", "since": time.time()}})
    assert slots["a"]["flag"] == "wrong" and "parking" not in slots["a"] and "parking" not in slots["b"]


def test_an_operator_answer_or_a_stale_feed_carries_no_verdict():
    d = details(a=("correct", ev()))
    over = st.compose_bays(d, overrides={"a": {"status": "OCCUPIED", "until": time.time() + 600}})
    assert over["a"]["flag"] == "operator" and "parking" not in over["a"]
    assert "parking" not in st.compose_bays(d, stale=True)["a"]


def test_dark_or_a_moved_camera_hides_the_verdict_with_the_rest():
    d = details(a=("correct", ev()))
    assert "parking" not in st.compose_bays(d, moved=True)["a"]


# ---- the clean 3D box

def test_the_box_is_green_amber_or_red_by_verdict_and_leaves_the_rest_of_the_picture_alone():
    img = np.full((240, 320, 3), 100, np.uint8)
    base = [[40, 200], [120, 200], [120, 150], [40, 150]]
    roof = [[48, 130], [128, 130], [128, 90], [48, 90]]
    for verdict, want in (("correct", (94, 197, 34)), ("close_to_line", (36, 165, 245)), ("over_line", (68, 68, 239))):
        out = draw_clean_boxes(img, [{"verdict": verdict, "base": base, "roof": roof}])
        px = out[200, 80].astype(int)                                              # on the base's near edge
        assert np.abs(px - np.array(want)).max() < 40, (verdict, px)
        assert np.array_equal(out[10:60, 200:300], img[10:60, 200:300])
    assert np.array_equal(img, np.full((240, 320, 3), 100, np.uint8))                # the input is not touched


def test_no_box_for_a_verdict_that_is_not_judged_or_for_broken_points():
    img = np.full((60, 80, 3), 100, np.uint8)
    assert draw_clean_boxes(img, []) is img
    bad = {"verdict": "correct", "base": [[float("nan"), 1]] * 4, "roof": [[1, 1]] * 4}
    unk = {"verdict": "not_judged", "base": [[1, 1], [9, 1], [9, 9], [1, 9]], "roof": [[1, 1], [9, 1], [9, 9], [1, 9]]}
    assert np.array_equal(draw_clean_boxes(img, [bad, unk]), img)


# ---- the timeline

def out_with(per_bay, light="ok"):
    frame = np.full((60, 80, 3), 120, np.uint8)
    d = {k: {"state": s, "since": time.time() - 30, "seen_vehicle": s != "free", "parking": p} for k, (s, p) in per_bay.items()}
    return {"tracked": [], "summary": {}, "bays": {k: v["state"] for k, v in d.items()}, "bay_details": d,
            "bay_events": [], "annotated": frame, "light": light}


def feed(s, out):
    s.last_frame_at = time.time()
    s._finish(np.full((60, 80, 3), 120, np.uint8), out, time.time())


def kinds(s):
    return [e["type"] for e in s.snapshot()["events"] if e["type"].startswith("parking_")]


OVER = ev(reason="Over the left line by 0.25 m", side="left", crossing_m=0.25)


def test_over_the_line_is_announced_once_and_a_return_to_correct_is_too(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("correct", ev())}))                                    # the first reading is not news
    assert kinds(s) == []
    feed(s, out_with({"1": ("wrong", OVER)}))
    feed(s, out_with({"1": ("wrong", OVER)}))                                      # still over: no repeat
    assert kinds(s) == ["parking_over_line"]
    ev1 = [e for e in s.snapshot()["events"] if e["type"] == "parking_over_line"][0]
    assert ev1["bay_id"] == "1" and ev1["detail"] == "Over the left line by 0.25 m"
    feed(s, out_with({"1": ("correct", ev())}))
    assert kinds(s) == ["parking_over_line", "parking_ok"]


def test_the_outline_flickering_in_and_out_does_not_repeat_the_alarm(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("correct", ev())}))
    feed(s, out_with({"1": ("wrong", OVER)}))
    for _ in range(3):
        feed(s, out_with({"1": ("wrong", ev(source="bbox"))}))                     # not judged for a moment
        feed(s, out_with({"1": ("wrong", OVER)}))
    assert kinds(s) == ["parking_over_line"]


def test_a_bad_parker_driving_off_is_not_reported_as_parked_correctly(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("correct", ev())}))
    feed(s, out_with({"1": ("wrong", OVER)}))
    feed(s, out_with({"1": ("free", ev(source="bbox"))}))
    assert kinds(s) == ["parking_over_line"]


def test_a_car_that_arrives_already_over_the_line_is_announced(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("free", ev(source="bbox"))}))
    feed(s, out_with({"1": ("wrong", OVER)}))
    assert kinds(s) == ["parking_over_line"]


def test_the_events_are_in_the_log_and_the_minute_sample_lists_the_verdicts(tmp_path):
    import activity_log as al
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("correct", ev()), "2": ("correct", ev())}))
    feed(s, out_with({"1": ("wrong", OVER), "2": ("correct", ev())}))
    rows = al.read_rows([tmp_path], "c")
    over = [r for r in rows if r["type"] == "parking_over_line"][0]
    assert (over["event"], over["bay"], over["detail"]) == ("Parked over the line", "P1", "Over the left line by 0.25 m")
    sample = [r for r in rows if r["type"] == "sample"][0]
    assert "parking P1=correct P2=correct" in sample["detail"]


def test_a_restart_does_not_announce_what_was_already_there(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    feed(s, out_with({"1": ("wrong", OVER)}))                                      # first sight of a bay that is over the line
    assert kinds(s) == []
