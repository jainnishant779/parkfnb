"""
The pilot scoring tool.  Every expected number below was worked out by hand from the tiny scenarios, so a
mistake in how precision, recall, false-vacant time or latency are counted shows up here.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import eval_pilot as ev  # noqa: E402


def write(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return p


def log_of(rows, tmp_path=None):
    """rows: [(video_s, {bay: status}, extras)] -> what load_log would return"""
    return [{"video_s": t, "slots": {k: v.upper() for k, v in slots.items()}, **extra} for t, slots, extra in rows]


# ---- scenario 1: one bay, one flicker, a late switch
# truth: VACANT 0-10, OCCUPIED 10-20.  reading: VACANT except a flicker at t=3, and the change only noticed at t=12.

def scenario_one():
    truth = [("1", 0, 10, ev.VACANT), ("1", 10, 20, ev.OCCUPIED)]
    rows = []
    for t in range(20):
        pred = "OCCUPIED" if (t == 3 or t >= 12) else "VACANT"
        rows.append((t, {"1": pred}, {"stream_status": "offline" if t in (5, 6) else "live", "ms_per_frame": 100 + t}))
    return truth, log_of(rows)


def test_counts_precision_recall_and_seconds_by_hand():
    rep = ev.evaluate(*scenario_one())
    o = rep["overall"]
    assert (o["tp"], o["fp"], o["fn"], o["tn"]) == (8, 1, 2, 9)
    assert o["precision"] == round(8 / 9, 4) and o["recall"] == 0.8 and o["decided_recall"] == 0.8
    assert o["false_occupied_s"] == 1.0 and o["false_vacant_s"] == 2.0 and o["samples"] == 20
    assert o["undecided_share"] == 0.0


def test_latency_is_to_the_first_of_three_readings_in_a_row():
    rep = ev.evaluate(*scenario_one())
    assert rep["per_bay"]["1"]["latencies_s"] == [2.0]                     # change at 10, held from 12
    assert rep["latency_s"] == {"transitions": 1, "missed": 0, "median": 2.0, "p90": 2.0, "missed_detail": {}}


def test_a_flicker_does_not_count_as_having_switched():
    truth = [("1", 0, 10, ev.VACANT), ("1", 10, 30, ev.OCCUPIED)]
    preds = {t: "VACANT" for t in range(30)}
    for t in (11, 12, 14, 15):
        preds[t] = "OCCUPIED"                                              # never three in a row until 20
    for t in range(20, 30):
        preds[t] = "OCCUPIED"
    rep = ev.evaluate(truth, log_of([(t, {"1": p}, {}) for t, p in preds.items()]))
    assert rep["per_bay"]["1"]["latencies_s"] == [10.0]


def test_a_change_that_is_never_reported_is_listed_not_hidden():
    truth = [("1", 0, 5, ev.VACANT), ("1", 5, 15, ev.OCCUPIED)]
    rep = ev.evaluate(truth, log_of([(t, {"1": "VACANT"}, {}) for t in range(15)]))
    assert rep["latency_s"]["missed"] == 1 and rep["latency_s"]["median"] is None
    assert rep["latency_s"]["missed_detail"] == {"1": [{"at_s": 5, "to": "OCCUPIED"}]}
    assert rep["overall"]["false_vacant_s"] == 10.0


def test_the_stream_uptime_and_inference_numbers():
    rep = ev.evaluate(*scenario_one())
    assert rep["stream_uptime"] == 0.9
    assert rep["inference_ms"]["median"] == 110 and rep["inference_ms"]["p90"] == 117     # 100..119: 90th percentile sits at 117.1
    assert rep["frames"] == 20 and rep["span_s"] == 19.0 and rep["interval_s"] == 1.0


# ---- scenario 2: saying "I cannot tell" is not a false alarm, but it is a missed car

def test_undecided_readings_are_counted_apart_and_cost_recall_but_not_precision():
    truth = [("2", 0, 6, ev.OCCUPIED), ("3", 0, 6, ev.VACANT)]
    rows = []
    for t in range(6):
        rows.append((t, {"2": "UNCERTAIN" if t < 2 else "OCCUPIED", "3": "STALE" if t < 3 else "VACANT"}, {}))
    o = ev.evaluate(truth, log_of(rows))
    bay2, bay3 = o["per_bay"]["2"], o["per_bay"]["3"]
    assert bay2["precision"] == 1.0 and bay2["recall"] == round(4 / 6, 4) and bay2["decided_recall"] == 1.0
    assert bay2["undecided_when_occupied"] == 2 and bay2["false_vacant_s"] == 0.0
    assert bay3["undecided_when_vacant"] == 3 and bay3["false_occupied_s"] == 0.0 and bay3["precision"] is None
    assert o["overall"]["undecided_share"] == round(5 / 12, 4)


def test_only_labelled_stretches_are_scored():
    truth = [("1", 5, 10, ev.OCCUPIED)]
    rep = ev.evaluate(truth, log_of([(t, {"1": "OCCUPIED"}, {}) for t in range(20)]))
    assert rep["overall"]["samples"] == 5


def test_a_gap_between_two_labelled_stretches_is_not_a_measured_change():
    truth = [("1", 0, 5, ev.VACANT), ("1", 8, 15, ev.OCCUPIED)]             # 5-8 left out (a car driving in)
    rep = ev.evaluate(truth, log_of([(t, {"1": "OCCUPIED" if t >= 6 else "VACANT"}, {}) for t in range(15)]))
    assert rep["latency_s"]["transitions"] == 0 and rep["latency_s"]["missed"] == 0


def test_a_bay_in_the_truth_but_not_in_the_run_is_reported():
    rep = ev.evaluate([("1", 0, 5, ev.VACANT), ("9", 0, 5, ev.VACANT)], log_of([(t, {"1": "VACANT"}, {}) for t in range(5)]))
    assert rep["bays_in_truth_but_not_in_log"] == ["9"]
    assert rep["per_bay"]["9"]["samples"] == 0 and rep["per_bay"]["9"]["precision"] is None


def test_percentiles():
    assert ev.percentile([], 90) is None and ev.percentile([5], 90) == 5
    assert ev.percentile([1, 2, 3, 4, 5], 50) == 3 and ev.percentile([1, 2, 3, 4, 5], 90) == pytest.approx(4.6)


# ---- files

GOOD_TRUTH = "bay_id,start_s,end_s,state\n1,0,10,vacant\n1,10,20,OCCUPIED\n"


def test_the_truth_file_is_read_and_state_is_case_free(tmp_path):
    rows = ev.load_truth(write(tmp_path, "t.csv", GOOD_TRUTH))
    assert rows == [("1", 0.0, 10.0, "VACANT"), ("1", 10.0, 20.0, "OCCUPIED")]
    assert ev.load_truth(write(tmp_path, "t2.csv", "﻿bay_id, start_s, end_s, state\n 2 , 0 , 5 , occupied\n\n"))[0][0] == "2"


@pytest.mark.parametrize("text,why", [
    ("bay,from,to,what\n1,0,5,VACANT\n", "header"),
    ("bay_id,start_s,end_s,state\n1,zero,5,VACANT\n", "numbers"),
    ("bay_id,start_s,end_s,state\n1,0,5,FULL\n", "VACANT or OCCUPIED"),
    ("bay_id,start_s,end_s,state\n,0,5,VACANT\n", "bay_id is empty"),
    ("bay_id,start_s,end_s,state\n1,5,5,VACANT\n", "after start_s"),
    ("bay_id,start_s,end_s,state\n1,0,10,VACANT\n1,5,15,OCCUPIED\n", "overlapping"),
    ("bay_id,start_s,end_s,state\n", "no rows"),
])
def test_a_bad_truth_file_says_what_is_wrong(tmp_path, text, why):
    with pytest.raises(ev.EvalError, match=why):
        ev.load_truth(write(tmp_path, "bad.csv", text))


def test_the_log_is_read_in_time_order_and_bad_lines_are_refused(tmp_path):
    lines = [json.dumps({"video_s": 2, "slots": {"1": "vacant"}}), "", json.dumps({"video_s": 1, "slots": {"1": "occupied"}, "ms_per_frame": 90})]
    log = ev.load_log(write(tmp_path, "r.jsonl", "\n".join(lines)))
    assert [r["video_s"] for r in log] == [1.0, 2.0] and log[0]["slots"] == {"1": "OCCUPIED"}
    with pytest.raises(ev.EvalError, match="line 2"):
        ev.load_log(write(tmp_path, "b.jsonl", json.dumps({"video_s": 1, "slots": {}}) + "\nnot json\n"))
    with pytest.raises(ev.EvalError, match="no frames"):
        ev.load_log(write(tmp_path, "e.jsonl", "\n"))


def test_the_command_line_writes_a_report_and_fails_cleanly(tmp_path, capsys):
    truth, log = scenario_one()
    t = write(tmp_path, "t.csv", GOOD_TRUTH)
    r = write(tmp_path, "r.jsonl", "\n".join(json.dumps({"video_s": x["video_s"], "slots": x["slots"], "stream_status": x["stream_status"],
                                                       "ms_per_frame": x["ms_per_frame"]}) for x in log))
    md, js = tmp_path / "out.md", tmp_path / "out.json"
    assert ev.main(["--truth", str(t), "--log", str(r), "--md", str(md), "--json", str(js)]) == 0
    out = capsys.readouterr().out
    assert "| Precision (occupied) | 88.9% |" in out and "| False vacant | 2.0 s (2 readings) |" in out
    assert md.read_text(encoding="utf-8").startswith("| Measure |") and json.loads(js.read_text(encoding="utf-8"))["overall"]["tp"] == 8
    assert ev.main(["--truth", str(tmp_path / "nope.csv"), "--log", str(r)]) == 2
    assert ev.main(["--truth", str(write(tmp_path, "bad.csv", "x\n")), "--log", str(r)]) == 2
