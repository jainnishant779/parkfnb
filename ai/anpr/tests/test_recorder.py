"""
The measuring stick: record the lot, label it, score the system.  The numbers in the scoring tests were worked out by hand.
"""
import json
import sys
import time
from datetime import timezone
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import app as app_module  # noqa: E402
import eval_pilot as ev  # noqa: E402
import record as R  # noqa: E402

T0 = 1793300000.0
POLY = {"Bay-01": [[0, 0], [100, 0], [100, 100], [0, 100]], "Bay-02": [[100, 0], [180, 0], [180, 80], [100, 80]],
        "Bay-03": [[180, 0], [240, 0], [240, 50], [180, 50]]}


def rec(tmp_path, interval=30.0, **kw):
    return R.Recorder(tmp_path / "record", interval, tz=timezone.utc, **kw)


def line(status="VACANT", verdict=None, vehicle=None):
    return {"status": status, "reason": "x", "verdict": verdict, "vehicle_id": vehicle}


def keep(r, t, a="VACANT", b="VACANT", c="VACANT", va=None, vb=None, ids=(None, None)):
    return r.save("cam", np.full((72, 128, 3), 90, np.uint8),
                  {"light": "ok", "calibration": "ok", "polygons": POLY, "zones": {"Bay-01": "near", "Bay-02": "middle", "Bay-03": "far"},
                   "bays": {"Bay-01": line(a, va, ids[0]), "Bay-02": line(b, vb, ids[1]), "Bay-03": line(c)}}, t)


# ---- recording

def test_it_is_off_unless_an_interval_is_set(tmp_path):
    assert not rec(tmp_path, 0).enabled and not rec(tmp_path, 0).due("cam", T0)
    assert rec(tmp_path, 30).enabled


def test_a_picture_is_kept_every_interval_with_the_systems_answers(tmp_path):
    r = rec(tmp_path)
    assert r.due("cam", T0)
    name = keep(r, T0, a="OCCUPIED", va="correct")
    assert name == f"{int(T0)}.jpg" and (tmp_path / "record" / "cam" / r.day_of(T0) / name).is_file()
    assert not r.due("cam", T0 + 10) and r.due("cam", T0 + 30)
    (f,) = r.frames("cam", r.day_of(T0))
    assert f["file"] == name and f["size"] == [128, 72] and f["bays"]["Bay-01"]["verdict"] == "correct" and f["polygons"] == POLY


def test_a_name_that_could_leave_the_folder_is_never_served(tmp_path):
    r = rec(tmp_path)
    keep(r, T0)
    day = r.day_of(T0)
    assert r.jpg("cam", day, f"{int(T0)}.jpg") is not None
    for bad in ("../x.jpg", "..\\x.jpg", "a.jpg", f"{int(T0)}.png", "", "1793300000.jpg/../../x"):
        assert r.jpg("cam", day, bad) is None, bad
    assert r.jpg("cam", "../..", f"{int(T0)}.jpg") is None and r.frames("cam", "../../x") == []


def test_a_torn_last_line_does_not_hide_the_day(tmp_path):
    r = rec(tmp_path)
    keep(r, T0)
    idx = tmp_path / "record" / "cam" / r.day_of(T0) / "index.jsonl"
    idx.write_text(idx.read_text() + '{"t": 17933')                                    # a crash in the middle of a write
    assert len(r.frames("cam", r.day_of(T0))) == 1


def test_a_full_disk_stops_the_recording_instead_of_filling_it(tmp_path, monkeypatch):
    r = rec(tmp_path)
    monkeypatch.setattr(R.shutil, "disk_usage", lambda p: type("U", (), {"free": 10_000_000})())
    assert keep(r, T0) is None


def test_old_days_go_first_and_the_labels_stay(tmp_path):
    r = rec(tmp_path, max_days=2)
    for d in range(5):
        keep(r, T0 + d * 86400)
    r.add_label("cam", r.day_of(T0), f"{int(T0)}.jpg", "Bay-01", "VACANT")
    assert len(r.days("cam")) == 5
    r.prune(T0 + 4 * 86400)
    left = [d["day"] for d in r.days("cam")]
    assert left == [r.day_of(T0 + 4 * 86400), r.day_of(T0 + 3 * 86400), r.day_of(T0 + 2 * 86400)]
    assert len(r.labels("cam")) == 1


def test_the_folder_is_kept_under_its_size_limit(tmp_path):
    r = rec(tmp_path, max_mb=0.005, max_days=99)                                          # 5 KB: about a day of these tiny test pictures
    for d in range(4):
        for k in range(3):
            keep(r, T0 + d * 86400 + k * 30)
    before = r.size_mb()
    assert before > 0.005
    r.prune(T0 + 4 * 86400)
    assert r.size_mb() <= 0.005 < before and 1 <= len(r.days("cam")) < 4                  # the oldest days were dropped, the newest kept
    assert r.days("cam")[0]["day"] == r.day_of(T0 + 3 * 86400)


# ---- the labels

def test_a_label_needs_a_recorded_picture_a_real_bay_and_a_real_answer(tmp_path):
    r = rec(tmp_path)
    keep(r, T0)
    day, f = r.day_of(T0), f"{int(T0)}.jpg"
    ok = r.add_label("cam", day, f, "Bay-01", "occupied", "over_line", "right", by="me")
    assert ok["state"] == "OCCUPIED" and ok["verdict"] == "over_line" and ok["t"] == T0
    for args in ((day, "nope.jpg", "Bay-01", "VACANT"), (day, f, "Bay-99", "VACANT"), (day, f, "Bay-01", "MAYBE"),
                 (day, f, "Bay-01", "VACANT", "over_line"), (day, f, "Bay-01", "OCCUPIED", "sideways")):
        with pytest.raises(ValueError):
            r.add_label("cam", *args)


def test_the_latest_answer_for_a_bay_in_a_picture_wins(tmp_path):
    r = rec(tmp_path)
    keep(r, T0)
    day, f = r.day_of(T0), f"{int(T0)}.jpg"
    r.add_label("cam", day, f, "Bay-01", "VACANT")
    r.add_label("cam", day, f, "Bay-01", "OCCUPIED", "correct")
    (lab,) = r.labels("cam")
    assert lab["state"] == "OCCUPIED" and lab["verdict"] == "correct"


def test_labels_become_the_truth_csv_with_neighbours_joined_and_skips_left_out(tmp_path):
    r = rec(tmp_path)
    for k, st in enumerate(("VACANT", "VACANT", "OCCUPIED", "SKIP", "OCCUPIED")):
        keep(r, T0 + 30 * k)
        r.add_label("cam", r.day_of(T0), f"{int(T0 + 30 * k)}.jpg", "Bay-01", st, "correct" if st == "OCCUPIED" else None)
    rows = r.truth_rows("cam")
    # each picture speaks for 30 s around it: VACANT 0-60 (joined), OCCUPIED 60-90, [the skipped one is not scored], OCCUPIED 105-135
    assert [(x[0], x[1] - T0, x[2] - T0, x[3], x[4]) for x in rows] == [
        ("Bay-01", -15.0, 45.0, "VACANT", ""), ("Bay-01", 45.0, 75.0, "OCCUPIED", "correct"), ("Bay-01", 105.0, 135.0, "OCCUPIED", "correct")]
    csv = r.truth_csv("cam").splitlines()
    assert csv[0] == "bay_id,start_s,end_s,state,verdict" and len(csv) == 4


def test_the_systems_answers_are_a_log_eval_pilot_can_read(tmp_path):
    r = rec(tmp_path)
    keep(r, T0, a="OCCUPIED", va="over_line", ids=(7, None))
    (row,) = r.run_lines("cam", r.day_of(T0))
    assert row["video_s"] == T0 and row["slots"]["Bay-01"] == "OCCUPIED" and row["verdicts"] == {"Bay-01": "over_line"}
    assert row["tracks"] == {"Bay-01": 7} and row["zones"]["Bay-03"] == "far"


# ---- scoring what the labels say against what the system said

def scenario(ts, truth_rows, reads):
    truth = [(b, a, e, s) for b, a, e, s, _v in truth_rows]
    verdicts = {}
    for b, a, e, _s, v in truth_rows:
        if v:
            verdicts.setdefault(b, []).append((a, e, v))
    log = [{"video_s": t, "slots": {b: s.upper() for b, s in slots.items()}, "verdicts": vd, "tracks": tr, "zones": {"1": "near", "2": "far"}}
           for t, slots, vd, tr in zip(ts, *reads)]
    return truth, verdicts, log


def test_over_the_line_is_scored_apart_from_occupancy_and_by_zone():
    ts = [0, 10, 20, 30]
    # bay 1 is really over the line the whole time; the system says over, over, correct, not_judged.
    # bay 2 is really correct the whole time; the system says over (a false alarm), correct, correct, correct.
    truth, verdicts, log = scenario(ts, [("1", 0, 40, "OCCUPIED", "over_line"), ("2", 0, 40, "OCCUPIED", "correct")],
                                    ([{"1": "OCCUPIED", "2": "OCCUPIED"}] * 4,
                                     [{"1": "over_line", "2": "over_line"}, {"1": "over_line", "2": "correct"},
                                      {"1": "correct", "2": "correct"}, {"1": "not_judged", "2": "correct"}],
                                     [{}] * 4))
    rep = ev.evaluate(truth, log, verdict_truth=verdicts)
    v = rep["verdict_over_line"]
    assert (v["readings"], v["tp"], v["fp"], v["fn"], v["undecided_when_over"]) == (8, 2, 1, 1, 1)
    assert v["precision"] == round(2 / 3, 4) and v["recall"] == 0.5 and v["decided_recall"] == round(2 / 3, 4)
    assert rep["by_zone"]["near"]["verdict_over_line"]["recall"] == 0.5 and rep["by_zone"]["far"]["verdict_over_line"]["precision"] == 0.0


def test_flicker_is_an_answer_that_changes_inside_a_stretch_the_person_called_steady():
    ts = list(range(0, 100, 10))
    occ = ["OCCUPIED", "OCCUPIED", "VACANT", "OCCUPIED", "OCCUPIED", "VACANT", "OCCUPIED", "OCCUPIED", "OCCUPIED", "OCCUPIED"]
    truth, verdicts, log = scenario(ts, [("1", 0, 100, "OCCUPIED", "")], ([{"1": s} for s in occ], [{}] * 10, [{}] * 10))
    rep = ev.evaluate(truth, log)
    assert rep["flicker"]["flips"] == 4                                                    # in, out, in, out
    assert rep["flicker"]["labelled_bay_hours"] == round(100 / 3600, 3)
    assert rep["flicker"]["per_bay_hour"] == round(4 / (100 / 3600), 2)


def test_a_change_the_person_also_saw_is_not_a_flicker():
    ts = [0, 10, 20, 30]
    truth, verdicts, log = scenario(ts, [("1", 0, 20, "VACANT", ""), ("1", 20, 40, "OCCUPIED", "")],
                                    ([{"1": "VACANT"}, {"1": "VACANT"}, {"1": "OCCUPIED"}, {"1": "OCCUPIED"}], [{}] * 4, [{}] * 4))
    assert ev.evaluate(truth, log)["flicker"]["flips"] == 0


def test_a_new_track_number_for_the_same_parked_car_is_counted():
    ts = [0, 10, 20, 30]
    truth, verdicts, log = scenario(ts, [("1", 0, 40, "OCCUPIED", "")], ([{"1": "OCCUPIED"}] * 4, [{}] * 4, [{"1": 5}, {"1": 5}, {"1": 9}, {"1": 9}]))
    rep = ev.evaluate(truth, log)
    assert rep["track_ids"]["switches"] == 1 and rep["flicker"]["flips"] == 0


def test_without_labels_for_verdicts_or_zones_those_parts_are_left_out():
    truth, log = [("1", 0, 20, "OCCUPIED")], [{"video_s": t, "slots": {"1": "OCCUPIED"}} for t in (0, 10)]
    rep = ev.evaluate(truth, log)
    assert rep["verdict_over_line"] is None and rep["by_zone"] is None
    assert "Over the line" not in ev.markdown(rep)


def test_the_zones_come_from_how_big_the_bay_is_in_the_picture():
    z = app_module._zones_of({"a": [[0, 0], [200, 0], [200, 200], [0, 200]], "b": [[0, 0], [100, 0], [100, 100], [0, 100]],
                              "c": [[0, 0], [20, 0], [20, 20], [0, 20]]})
    assert z == {"a": "near", "b": "middle", "c": "far"}


def test_the_recorded_files_go_straight_into_the_scoring_tool(tmp_path):
    r = rec(tmp_path)
    for k, a in enumerate(("VACANT", "VACANT", "OCCUPIED", "OCCUPIED")):
        keep(r, T0 + 30 * k, a=a, va="over_line" if a == "OCCUPIED" else None)
        r.add_label("cam", r.day_of(T0), f"{int(T0 + 30 * k)}.jpg", "Bay-01", "VACANT" if k < 2 else "OCCUPIED", "over_line" if k >= 2 else None)
    (tmp_path / "truth.csv").write_text(r.truth_csv("cam"), encoding="utf-8")
    (tmp_path / "run.jsonl").write_text("".join(json.dumps(x) + "\n" for x in r.run_lines("cam", r.day_of(T0))), encoding="utf-8")
    rep = ev.evaluate(ev.load_truth(tmp_path / "truth.csv"), ev.load_log(tmp_path / "run.jsonl"),
                      verdict_truth=ev.load_verdict_truth(tmp_path / "truth.csv"))
    assert rep["overall"]["precision"] == 1.0 and rep["overall"]["recall"] == 1.0 and rep["flicker"]["flips"] == 0
    assert rep["verdict_over_line"]["recall"] == 1.0 and rep["by_zone"]["near"]["samples"] == 4
    assert ev.main(["--truth", str(tmp_path / "truth.csv"), "--log", str(tmp_path / "run.jsonl")]) == 0


def test_a_verdict_that_is_not_one_of_the_three_is_refused(tmp_path):
    (tmp_path / "t.csv").write_text("bay_id,start_s,end_s,state,verdict\n1,0,10,OCCUPIED,sideways\n", encoding="utf-8")
    with pytest.raises(ev.EvalError):
        ev.load_verdict_truth(tmp_path / "t.csv")


# ---- the app

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "RECORD_S", 30.0)
    monkeypatch.setattr(app_module, "_recorders", {})
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def answers():
    return {"Bay-01": {"status": "OCCUPIED", "reason": "wrong", "parking": {"verdict": "over_line", "side": "right", "crossing_m": 0.31,
                                                                              "source": "mask", "across": []}},
            "Bay-02": {"status": "VACANT", "reason": "vacant"}}


def test_the_live_loop_hands_each_picture_and_the_page_answers_to_the_recorder(client):
    states = {"Bay-01": type("S", (), {"vehicle_id": 4})()}
    layout = {"size": [128, 72], "bays": {k: POLY[k] for k in ("Bay-01", "Bay-02")}}
    app_module._record_frame("cam", np.full((72, 128, 3), 90, np.uint8), layout, answers(), states, "ok", "ok", T0)
    app_module._record_frame("cam", np.full((72, 128, 3), 90, np.uint8), layout, answers(), states, "ok", "ok", T0 + 5)      # too soon
    (f,) = app_module._recorder().frames("cam", app_module._recorder().day_of(T0))
    b = f["bays"]["Bay-01"]
    assert (b["status"], b["verdict"], b["side"], b["crossing_m"], b["vehicle_id"]) == ("OCCUPIED", "over_line", "right", 0.31, 4)
    assert set(f["zones"]) == {"Bay-01", "Bay-02"}


def test_the_pages_and_files_work_for_an_operator_and_not_for_a_visitor(client):
    r = app_module._recorder()
    keep_t = time.time() - 120
    r.save("cam", np.full((72, 128, 3), 90, np.uint8), {"light": "ok", "calibration": "ok", "polygons": POLY, "zones": {},
                                                         "bays": {"Bay-01": line("VACANT"), "Bay-02": line(), "Bay-03": line()}}, keep_t)
    day, f = r.day_of(keep_t), f"{int(keep_t)}.jpg"
    st = client.get("/console/api/record/status?camera_id=cam").json()
    assert st["on"] and st["days"][0]["frames"] == 1
    got = client.get(f"/console/api/record/frames?camera_id=cam&day={day}").json()
    assert got["frames"][0]["file"] == f and got["labels"] == {}
    assert client.get(f"/console/api/record/frame/{day}/{f}?camera_id=cam").headers["content-type"] == "image/jpeg"
    assert client.get(f"/console/api/record/frame/{day}/..%2Fx.jpg?camera_id=cam").status_code == 404
    ok = client.post("/console/api/record/label?camera_id=cam", json={"day": day, "file": f, "bay": "Bay-01", "state": "VACANT"})
    assert ok.status_code == 200 and ok.json()["label"]["by"] == "this machine"
    assert client.post("/console/api/record/label?camera_id=cam", json={"day": day, "file": f, "bay": "Bay-99", "state": "VACANT"}).status_code == 400
    assert client.post("/console/api/record/label?camera_id=cam", json={"day": day}).status_code == 400
    assert client.get(f"/console/api/record/frames?camera_id=cam&day={day}").json()["labels"][f]["Bay-01"]["state"] == "VACANT"
    assert client.get("/console/api/record/truth.csv?camera_id=cam").text.splitlines()[0] == "bay_id,start_s,end_s,state,verdict"
    assert client.get(f"/console/api/record/run.jsonl?camera_id=cam&day={day}").text.count("\n") == 1
    assert client.get("/console/api/record/frames?camera_id=cam&day=../x").status_code == 400
    assert "Label what you SEE" in client.get("/label").text
    visitor, proxy = TestClient(app_module.app, client=("203.0.113.9", 40000)), {"X-Forwarded-For": "203.0.113.9"}
    for path in ("/console/api/record/status", f"/console/api/record/frames?day={day}", f"/console/api/record/frame/{day}/{f}",
                 "/console/api/record/truth.csv", f"/console/api/record/run.jsonl?day={day}", "/label"):
        assert visitor.get(path, headers=proxy).status_code == 403, path
    assert visitor.post("/console/api/record/label", json={}, headers=proxy).status_code == 403
