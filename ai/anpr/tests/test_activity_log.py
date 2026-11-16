"""
The activity log: what is written when things happen, how it is read back as rows and as a CSV, and who may
see it (the operator only).
"""
import csv
import io
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import activity_log as al  # noqa: E402
import app as app_module  # noqa: E402
import live as live_module  # noqa: E402
import state_store  # noqa: E402
from live import LiveSession  # noqa: E402

TOKEN = "k3m9r7hp2xw5cz8abtv4n6fdsj"
COOKIE = {"Cookie": f"parkfnb_admin={TOKEN}"}
PROXY = {"X-Forwarded-For": "203.0.113.9"}
NOW = time.time()


def put(folder, camera, day_offset, records):
    """Write records to <folder>/<camera>-<date>.jsonl for the day `day_offset` days ago."""
    folder.mkdir(parents=True, exist_ok=True)
    day = datetime.fromtimestamp(NOW) - timedelta(days=day_offset)
    path = folder / f"{camera}-{day:%Y%m%d}.jsonl"
    with open(path, "a", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return path


# ---- words

@pytest.mark.parametrize("rec,expect", [
    ({"type": "in", "track_id": 12}, ("Car came in", "", "car #12")),
    ({"type": "out", "track_id": 3}, ("Car went out", "", "car #3")),
    ({"type": "bay_occupied", "bay_id": "3", "track_id": 7}, ("Bay occupied", "P3", "car #7")),
    ({"type": "bay_freed", "bay_id": "A-04"}, ("Bay free", "A-04", "")),
    ({"type": "bay_initial", "bay_id": "1", "status": "available"}, ("Bay first reading", "P1", "available")),
    ({"type": "operator", "bay_id": "4", "status": "OCCUPIED"}, ("Operator answer", "P4", "marked occupied")),
    ({"type": "operator", "bay_id": "4", "status": "CLEARED"}, ("Operator answer", "P4", "answer cleared")),
    ({"type": "feed_offline"}, ("Camera offline", "", "")),
    ({"type": "feed_online"}, ("Camera back online", "", "")),
    ({"type": "low_light"}, ("Too dark to judge", "", "")),
    ({"type": "camera_moved"}, ("Camera view changed", "", "")),
    ({"type": "something_new"}, ("something_new", "", "")),
])
def test_each_record_is_put_in_plain_words(rec, expect):
    assert al.describe(rec) == expect


def test_a_sample_line_reads_as_counts_and_each_bay():
    ev, bay, detail = al.describe({"type": "sample", "vacant": 2, "occupied": 3, "unclear": 0, "stale": 0,
                                   "bays": {"1": "available", "2": "occupied"}})
    assert ev == "Occupancy sample" and bay == ""
    assert detail.startswith("available 2, occupied 3, unclear 0, no signal 0") and "P1=available P2=occupied" in detail


# ---- reading

def test_rows_come_back_in_time_order_with_the_time_zone_and_epoch(tmp_path):
    put(tmp_path, "phone-1", 0, [{"t": NOW - 60, "type": "bay_freed", "bay_id": "2"}, {"t": NOW - 120, "type": "in", "track_id": 1}])
    rows = al.read_rows([tmp_path], "phone-1", now=NOW)
    assert [r["event"] for r in rows] == ["Car came in", "Bay free"]
    r = rows[0]
    assert r["camera"] == "phone-1" and r["epoch"] == round(NOW - 120, 1)
    assert datetime.fromisoformat(r["time"]).utcoffset() is not None          # the offset is in the text
    assert [x["epoch"] for x in al.read_rows([tmp_path], "phone-1", now=NOW, newest_first=True)] == [rows[1]["epoch"], rows[0]["epoch"]]


def test_the_period_the_event_kinds_and_the_limit(tmp_path):
    put(tmp_path, "c1", 5, [{"t": NOW - 5 * 86400, "type": "in", "track_id": 1}])
    put(tmp_path, "c1", 0, [{"t": NOW - 30, "type": "in", "track_id": 2}, {"t": NOW - 20, "type": "bay_freed", "bay_id": "1"},
                            {"t": NOW - 10, "type": "feed_offline"}])
    assert len(al.read_rows([tmp_path], "c1", now=NOW)) == 4                               # no limit on days: everything
    assert len(al.read_rows([tmp_path], "c1", days=1, now=NOW)) == 3
    assert [r["event"] for r in al.read_rows([tmp_path], "c1", kinds={"in"}, now=NOW)] == ["Car came in", "Car came in"]
    assert len(al.read_rows([tmp_path], "c1", newest_first=True, limit=2, now=NOW)) == 2


def test_cameras_do_not_mix_even_when_one_name_starts_like_another(tmp_path):
    put(tmp_path, "phone-1", 0, [{"t": NOW, "type": "in", "track_id": 1}])
    put(tmp_path, "phone-1-b", 0, [{"t": NOW, "type": "out", "track_id": 2}])
    put(tmp_path, "gate-1", 0, [{"t": NOW, "type": "in", "track_id": 3}])
    assert [r["detail"] for r in al.read_rows([tmp_path], "phone-1", now=NOW)] == ["car #1"]


def test_several_folders_are_merged_so_old_history_is_kept(tmp_path):
    put(tmp_path / "new", "c1", 0, [{"t": NOW - 5, "type": "in", "track_id": 2}])
    put(tmp_path / "old", "c1", 1, [{"t": NOW - 86400, "type": "in", "track_id": 1}])
    assert [r["detail"] for r in al.read_rows([tmp_path / "new", tmp_path / "old", tmp_path / "missing"], "c1", now=NOW)] == ["car #1", "car #2"]


def test_a_half_written_or_damaged_line_does_not_break_the_log(tmp_path):
    path = put(tmp_path, "c1", 0, [{"t": NOW - 10, "type": "in", "track_id": 1}])
    with open(path, "a", encoding="utf-8") as f:
        f.write('{"t": 12\n')                 # cut off
        f.write("not json at all\n")
        f.write('{"no_time": true}\n')
        f.write(json.dumps({"t": NOW - 5, "type": "out", "track_id": 2}) + "\n")
    assert [r["event"] for r in al.read_rows([tmp_path], "c1", now=NOW)] == ["Car came in", "Car went out"]


def test_an_empty_or_missing_folder_is_just_an_empty_log(tmp_path):
    assert al.read_rows([tmp_path / "nope"], "c1") == [] and al.read_rows([tmp_path], "c1") == []


# ---- csv

def test_the_csv_has_a_header_and_one_row_per_event_and_survives_awkward_text():
    rows = [{"time": "2026-10-23T11:00:00+00:00", "camera": "c1", "event": "Bay free", "bay": "P1", "detail": 'a, "quoted"\nthing', "epoch": 1.0}]
    out = al.to_csv(rows)
    back = list(csv.reader(io.StringIO(out)))
    assert back[0] == al.COLUMNS and back[1][4] == 'a, "quoted"\nthing' and len(back) == 2


def test_a_cell_that_starts_like_a_formula_is_neutralised():
    out = al.to_csv([{"time": "t", "camera": "c", "event": "e", "bay": "=1+1", "detail": "@SUM(A1)", "epoch": -5.0},
                     {"time": "t", "camera": "c", "event": "e", "bay": "+x", "detail": "-cmd", "epoch": 2.5}])
    cells = [c for row in list(csv.reader(io.StringIO(out)))[1:] for c in row]
    assert "'=1+1" in cells and "'@SUM(A1)" in cells and "'+x" in cells and "'-cmd" in cells
    assert "-5.0" in cells and "2.5" in cells                                  # real numbers are left alone


# ---- what a session writes

class Det:                                      # a stand-in for the engine's per-bay facts
    @staticmethod
    def of(state, since=None):
        return {"state": state, "since": since or time.time() - 30, "seen_vehicle": state not in ("free", "unknown")}


def out_with(events=(), details=None, light="ok"):
    frame = np.full((60, 80, 3), 120, np.uint8)
    d = details or {"1": Det.of("free"), "2": Det.of("correct")}
    return {"tracked": [], "summary": {}, "bays": {k: v["state"] for k, v in d.items()}, "bay_details": d,
            "bay_events": list(events), "annotated": frame, "light": light}


def finish(s, out):
    s.last_frame_at = time.time()
    s._finish(np.full((60, 80, 3), 120, np.uint8), out, time.time())


def logged(tmp_path, camera):
    return al.read_rows([tmp_path], camera)


def test_bay_changes_are_logged_with_the_car_and_the_page_timeline_gets_them(tmp_path):
    s = LiveSession("c1", lambda f, se: {}, tmp_path)
    finish(s, out_with([{"event": "bay_occupied", "bay_id": "3", "track_id": 7, "previous": "free"},
                        {"event": "bay_freed", "bay_id": "2", "track_id": None, "previous": "correct"}]))
    rows = {r["event"]: r for r in logged(tmp_path, "c1") if r["type"] != "sample"}
    assert rows["Bay occupied"]["detail"] == "car #7" and rows["Bay occupied"]["bay"] == "P3" and rows["Bay free"]["bay"] == "P2"
    assert [e["type"] for e in s.snapshot()["events"]] == ["bay_occupied", "bay_freed"]


def test_the_first_reading_after_a_start_goes_to_the_log_but_not_the_timeline(tmp_path):
    s = LiveSession("c1", lambda f, se: {}, tmp_path)
    finish(s, out_with([{"event": "bay_freed", "bay_id": "1", "previous": "unknown"},
                        {"event": "bay_occupied", "bay_id": "2", "previous": "unknown"}]))
    rows = [r for r in logged(tmp_path, "c1") if r["type"] == "bay_initial"]
    assert [(r["bay"], r["detail"]) for r in rows] == [("P1", "available"), ("P2", "occupied")]
    assert s.snapshot()["events"] == []                                       # no "P1 available, the car left" at start-up


def test_an_occupancy_sample_is_written_once_a_minute_and_not_before_there_is_anything_to_say(tmp_path, monkeypatch):
    s = LiveSession("c1", lambda f, se: {}, tmp_path)
    finish(s, {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": np.zeros((6, 8, 3), np.uint8)})
    assert [r for r in logged(tmp_path, "c1") if r["type"] == "sample"] == []     # no bays: nothing to sample
    finish(s, out_with())
    samples = [r for r in logged(tmp_path, "c1") if r["type"] == "sample"]
    assert len(samples) == 1 and "available 1, occupied 1" in samples[0]["detail"] and "P1=available P2=occupied" in samples[0]["detail"]
    finish(s, out_with())                                                          # a second later: not again
    assert len([r for r in logged(tmp_path, "c1") if r["type"] == "sample"]) == 1
    monkeypatch.setattr(live_module, "LOG_SAMPLE_S", 0.0)
    finish(s, out_with())
    assert len([r for r in logged(tmp_path, "c1") if r["type"] == "sample"]) == 2


def test_the_sample_says_unclear_in_the_dark(tmp_path):
    s = LiveSession("c1", lambda f, se: {}, tmp_path)
    finish(s, out_with(light="low", details={"1": Det.of("free"), "2": Det.of("correct")}))
    sample = [r for r in logged(tmp_path, "c1") if r["type"] == "sample"][0]
    assert "unclear 1" in sample["detail"] and "P1=unclear" in sample["detail"] and "P2=occupied" in sample["detail"]


def test_an_outage_is_logged_by_the_worker_even_if_nobody_opens_the_page(tmp_path):
    s = LiveSession("c1", lambda f, se: {}, tmp_path)
    finish(s, out_with())
    s._watch()                                                                     # a second with a live feed: nothing to say
    assert [r["event"] for r in logged(tmp_path, "c1") if r["type"].startswith("feed_")] == []
    s.last_frame_at = s.last_done_at = time.time() - 120
    s._watch()
    s._watch()                                                                     # once, however long it lasts
    finish(s, out_with())                                                          # and it comes back
    s._watch()
    assert [r["event"] for r in logged(tmp_path, "c1") if r["type"].startswith("feed_")] == ["Camera offline", "Camera back online"]


def test_the_worker_thread_itself_notices_an_outage(tmp_path):
    frame = np.full((60, 80, 3), 120, np.uint8)
    s = LiveSession("c1", lambda f, se: out_with(), tmp_path)
    s.submit(frame)
    end = time.time() + 5
    while s.frames_done < 1 and time.time() < end:
        time.sleep(0.02)
    s.last_frame_at = s.last_done_at = time.time() - 120
    end = time.time() + 5
    while time.time() < end and not [r for r in logged(tmp_path, "c1") if r["type"] == "feed_offline"]:
        time.sleep(0.1)
    s.stop()
    assert [r for r in logged(tmp_path, "c1") if r["type"] == "feed_offline"]


# ---- the routes

@pytest.fixture
def web(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", TOKEN)
    monkeypatch.setattr(app_module, "LIVE_LOG_DIR", tmp_path / "logs")
    monkeypatch.setattr(app_module, "LEGACY_LOG_DIR", tmp_path / "old")
    put(tmp_path / "logs", "phone-1", 0, [{"t": NOW - 30, "type": "in", "track_id": 1}, {"t": NOW - 20, "type": "bay_freed", "bay_id": "2"},
                                          {"t": NOW - 10, "type": "feed_offline"}])
    put(tmp_path / "old", "phone-1", 3, [{"t": NOW - 3 * 86400, "type": "out", "track_id": 9}])
    return tmp_path


def client(host="127.0.0.1"):
    return TestClient(app_module.app, client=(host, 40000))


def test_the_log_is_private(web):
    for path in ("/live/log", "/live/log.json?camera_id=phone-1", "/live/log.csv?camera_id=phone-1"):
        assert client("203.0.113.9").get(path, headers=PROXY).status_code == 403, path
        assert client("203.0.113.9").get(path, headers={**PROXY, "Cookie": "parkfnb_admin=wrong"}).status_code == 403, path
        assert client("203.0.113.9").get(path, headers={**PROXY, **COOKIE}).status_code == 200, path
        assert client().get(path).status_code == 200, path


def test_the_json_pages_and_filters(web):
    c = client()
    j = c.get("/live/log.json?camera_id=phone-1&days=0").json()
    assert j["total"] == 4 and [r["event"] for r in j["rows"]][0] == "Camera offline"          # newest first, old folder merged
    assert c.get("/live/log.json?camera_id=phone-1&days=1").json()["total"] == 3
    assert c.get("/live/log.json?camera_id=phone-1&days=0&kind=in,out").json()["total"] == 2
    page = c.get("/live/log.json?camera_id=phone-1&days=0&limit=2&offset=1").json()
    assert page["total"] == 4 and page["offset"] == 1 and len(page["rows"]) == 2
    assert c.get("/live/log.json?camera_id=nobody").json()["total"] == 0


def test_the_csv_is_a_download_that_opens_in_a_spreadsheet(web):
    r = client().get("/live/log.csv?camera_id=phone-1&days=0")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert 'attachment; filename="parkfnb-phone-1-' in r.headers["content-disposition"]
    assert r.content.startswith(b"\xef\xbb\xbf")                                               # the mark Excel needs for UTF-8
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert rows[0] == al.COLUMNS and len(rows) == 5
    assert [row[2] for row in rows[1:]] == ["Car went out", "Car came in", "Bay free", "Camera offline"]   # oldest first


def test_a_strange_camera_id_cannot_reach_other_files(web):
    c = client()
    assert c.get("/live/log.json?camera_id=../../etc/passwd").json()["total"] == 0
    assert c.get("/live/log.csv?camera_id=phone-1%2F..%2F..").status_code == 200


def test_the_log_page_is_served_and_asks_for_a_sign_in_without_leaking_anything(web):
    r = client("203.0.113.9").get("/live/log", headers=PROXY)
    assert r.status_code == 403
    page = client().get("/live/log")
    assert page.status_code == 200 and "Activity log" in page.text and "Download CSV" in page.text


def test_the_log_lives_in_the_data_folder_by_default(monkeypatch):
    monkeypatch.setattr(app_module, "LIVE_LOG_DIR", None)
    assert app_module._live_log_dir() == state_store.DATA_DIR / "logs"
