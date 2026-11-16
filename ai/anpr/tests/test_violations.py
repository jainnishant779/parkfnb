"""
The violations register: opened by the live feed, closed by the feed, resolved by a person, with pictures kept for a while.
"""
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import state_store  # noqa: E402
import violations as V  # noqa: E402
from live import LiveSession  # noqa: E402

T0 = 1_800_000_000.0
POLY = [[100, 200], [300, 200], [320, 400], [80, 400]]


@pytest.fixture
def book(tmp_path):
    return V.ViolationBook(tmp_path / "v" / "cam.json", "cam")


# ---- the book

def test_an_over_the_line_verdict_opens_one_violation_and_a_repeat_does_not_open_another(book):
    rec, created = book.open("3", V.OVER_LINE, T0, "Over the right line by 0.45 m", 0.45, "right", {"polygon": POLY, "layout_size": [1280, 720]})
    assert created and rec["id"] == f"cam-3-over_line-{int(T0)}" and rec["label"] == "P3" and rec["status"] == "open"
    again, created2 = book.open("3", V.OVER_LINE, T0 + 30, "x", 0.60)
    assert not created2 and again["id"] == rec["id"] and again["max_crossing_m"] == 0.60     # the same one, with the worst crossing
    assert len(book.list()) == 1
    assert book.open("4", V.OVER_LINE, T0)[1]                                                  # another bay: a new one
    assert book.open("3", V.OVERSTAY, T0)[1]                                                   # another kind in the same bay too


def test_closing_notes_when_it_ended_but_leaves_the_status_to_a_person(book):
    book.open("3", V.OVER_LINE, T0)
    book.open("3", V.OVERSTAY, T0)
    assert book.close_type("3", V.OVER_LINE, T0 + 600) != []
    over = book.list(kind=V.OVER_LINE)[0]
    assert over["closed"] == T0 + 600 and over["status"] == "open"                             # closed by the feed, not yet reviewed
    assert book.list(kind=V.OVERSTAY)[0]["closed"] is None
    assert book.close("3", T0 + 900) != [] and book.close("3", T0 + 1000) == []                # nothing left to close
    assert book.open("3", V.OVER_LINE, T0 + 2000)[1]                                           # a later episode is a new violation


def test_the_same_violation_coming_back_within_minutes_is_one_violation_not_a_second(book):
    first, _ = book.open("3", V.OVER_LINE, T0, "x", 0.30)
    book.close_type("3", V.OVER_LINE, T0 + 100)
    again, created = book.open("3", V.OVER_LINE, T0 + 400, "x", 0.50)                          # the verdict flickered
    assert not created and again["id"] == first["id"] and again["closed"] is None and again["max_crossing_m"] == 0.50
    book.close_type("3", V.OVER_LINE, T0 + 500)
    later, created2 = book.open("3", V.OVER_LINE, T0 + 500 + V.REOPEN_WITHIN_S + 1, "x", 0.2)   # long enough: a new one
    assert created2 and later["id"] != first["id"]
    other = book.open("4", V.OVER_LINE, T0 + 450)[1]
    assert other                                                                               # another bay never merges


def test_a_violation_a_person_has_dealt_with_is_never_reopened_by_the_feed(book):
    first, _ = book.open("3", V.OVER_LINE, T0)
    book.close_type("3", V.OVER_LINE, T0 + 50)
    book.handle(first["id"], "resolved", "told", "admin", T0 + 60)
    again, created = book.open("3", V.OVER_LINE, T0 + 100)
    assert created and again["id"] != first["id"] and book.get(first["id"])["status"] == "resolved"


def test_a_person_resolves_or_dismisses_with_a_note_and_can_reopen(book):
    rec, _ = book.open("3", V.OVER_LINE, T0)
    got = book.handle(rec["id"], "resolved", "Spoke to the driver", "admin", T0 + 60)
    assert got["status"] == "resolved" and got["note"] == "Spoke to the driver" and got["handled_by"] == "admin" and got["handled_at"] == T0 + 60
    assert book.open_count() == 0
    again = book.handle(rec["id"], "open", "", "admin", T0 + 90)
    assert again["status"] == "open" and again["handled_by"] is None and book.open_count() == 1
    assert book.handle("nope", "resolved", "", "admin", T0) is None
    with pytest.raises(ValueError):
        book.handle(rec["id"], "deleted", "", "admin", T0)
    long_note = book.handle(rec["id"], "dismissed", "x" * 900, "admin", T0)
    assert len(long_note["note"]) == 500


def test_the_list_filters_by_status_kind_and_when_it_was_opened_newest_first(book):
    a, _ = book.open("1", V.OVER_LINE, T0)
    b, _ = book.open("2", V.OVERSTAY, T0 + 100)
    c, _ = book.open("3", V.OVER_LINE, T0 + 200)
    book.handle(a["id"], "resolved", "", "x", T0)
    assert [r["bay"] for r in book.list()] == ["3", "2", "1"]
    assert [r["bay"] for r in book.list(status="open")] == ["3", "2"]
    assert [r["bay"] for r in book.list(kind=V.OVER_LINE)] == ["3", "1"]
    assert [r["bay"] for r in book.list(since=T0 + 50, until=T0 + 150)] == ["2"]


def test_an_overstay_opens_once_after_the_limit_and_closes_when_the_car_has_gone(book):
    slots = {"1": {"status": "OCCUPIED", "since": T0}, "2": {"status": "VACANT"}, "3": {"status": "OCCUPIED", "since": T0 + 6000}}   # bay 3 is not over 2 h until T0 + 13200
    assert book.check_overstay(slots, T0 + 3600, 2.0) == []                                   # only 1 h in
    first = book.check_overstay(slots, T0 + 2 * 3600 + 5, 2.0)
    assert [r["bay"] for r in first] == ["1"] and "over 2 h" in first[0]["detail"]
    assert book.check_overstay(slots, T0 + 3 * 3600, 2.0) == []                                # not opened a second time
    assert len(book.list(kind=V.OVERSTAY)) == 1 and book.list(kind=V.OVERSTAY)[0]["closed"] is None
    slots["1"] = {"status": "VACANT"}
    book.check_overstay(slots, T0 + 3 * 3600 + 60, 2.0)
    assert book.list(kind=V.OVERSTAY)[0]["closed"] == T0 + 3 * 3600 + 60
    assert book.check_overstay(slots, T0 + 9 * 3600, 0) == []                                  # limit 0 = off


def test_a_violation_closes_when_its_car_is_no_longer_over_the_line_even_if_no_event_said_so(book):
    book.open("2", V.OVER_LINE, T0)                                   # opened by an old rule, before a restart forgot the verdicts
    book.open("3", V.OVER_LINE, T0)
    book.open("4", V.OVER_LINE, T0)
    book.open("5", V.OVER_LINE, T0)
    book.open("6", V.OVER_LINE, T0)
    book.open("2", V.OVERSTAY, T0)                                    # another kind: not this method's business
    slots = {"2": {"status": "OCCUPIED", "parking": {"verdict": "correct"}},
             "3": {"status": "OCCUPIED", "parking": {"verdict": "over_line"}},          # still over: stays open
             "4": {"status": "OCCUPIED", "parking": {"verdict": "not_judged"}},         # cannot tell now: stays as it was
             "5": {"status": "VACANT"},
             "6": {"status": "UNCERTAIN"}}                                              # too dark: stays as it was
    closed = book.close_cleared(slots, T0 + 100)
    assert len(closed) == 2
    by_bay = {r["bay"]: r for r in book.list(kind=V.OVER_LINE)}
    assert by_bay["2"]["closed"] == T0 + 100 and by_bay["5"]["closed"] == T0 + 100
    assert all(by_bay[b]["closed"] is None for b in ("3", "4", "6"))
    assert by_bay["2"]["status"] == "open"                            # closed by the feed; a person still reviews it
    assert book.list(kind=V.OVERSTAY)[0]["closed"] is None
    assert book.close_cleared(slots, T0 + 200) == []                  # nothing more to close
    assert V.ViolationBook(book.path, "cam").close_cleared({}, T0 + 300) != []          # a bay gone from the layout closes the rest


def test_an_unclear_bay_is_not_an_overstay(book):
    assert book.check_overstay({"1": {"status": "UNCERTAIN", "since": T0}}, T0 + 10 * 3600, 1.0) == []


def test_prune_drops_old_handled_ones_but_never_an_open_one(book):
    old_open, _ = book.open("1", V.OVER_LINE, T0)
    old_done, _ = book.open("2", V.OVER_LINE, T0)
    new_done, _ = book.open("3", V.OVER_LINE, T0 + 1000)
    book.handle(old_done["id"], "resolved", "", "x", T0)
    book.handle(new_done["id"], "dismissed", "", "x", T0)
    assert book.prune(T0 + 500) == 1
    assert sorted(r["bay"] for r in book.list()) == ["1", "3"]


def test_a_damaged_file_reads_as_empty_and_writes_leave_no_temp_file(tmp_path):
    p = tmp_path / "v.json"
    p.write_text("{not json", encoding="utf-8")
    b = V.ViolationBook(p, "cam")
    assert b.list() == []
    b.open("1", V.OVER_LINE, T0)
    assert json.loads(p.read_text(encoding="utf-8"))[0]["bay"] == "1" and not list(tmp_path.glob("*.tmp"))


def test_evidence_ids_cannot_climb_out_of_the_folder():
    for bad in ("../x", "..", "a/b", "a\\b", "", "x" * 200, "a..b", "c:evil"):
        assert not V.safe_id(bad), bad
    assert V.safe_id("phone-1-3-over_line-1800000000")


def test_the_crop_is_the_bay_with_room_around_it_and_never_leaves_the_picture():
    img = np.zeros((720, 1280, 3), np.uint8)
    c = V.crop_around(img, POLY)
    assert c.shape[0] > 200 and c.shape[1] > 220 and c.shape[0] <= 720
    tiny = V.crop_around(img, [[5, 5], [20, 5], [20, 20], [5, 20]])
    assert tiny.shape[1] >= 20 and tiny.shape[0] > 0
    edge = V.crop_around(img, [[1200, 650], [1279, 650], [1279, 719], [1200, 719]])
    assert edge.shape[0] <= 720 and edge.shape[1] <= 1280


def test_old_evidence_pictures_are_deleted_and_new_ones_kept(tmp_path):
    old, new = tmp_path / "cam" / "old.jpg", tmp_path / "cam" / "new.jpg"
    old.parent.mkdir()
    old.write_bytes(b"x"); new.write_bytes(b"x")
    long_ago = time.time() - 40 * 86400
    os.utime(old, (long_ago, long_ago))
    assert V.prune_evidence(tmp_path, time.time() - 30 * 86400) == 1 and not old.exists() and new.exists()
    assert V.prune_evidence(tmp_path / "missing", T0) == 0


# ---- through the app

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_books", {})
    monkeypatch.setattr(app_module, "_last_prune", 0.0)
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


@pytest.fixture
def session(client):
    s = app_module._live_session("phone-1")
    s.stop()
    return s


LAYOUT = {"size": [1280, 720], "bays": {"3": POLY}}


def over_event(t=None):
    return {"t": t or time.time(), "type": "parking_over_line", "bay_id": "3", "detail": "Over the right line by 0.45 m",
            "crossing_m": 0.45, "side": "right"}


def test_the_live_feed_opens_a_violation_with_a_picture_and_asks_the_phone_for_a_sharp_photo(client, session):
    frame = np.full((720, 1280, 3), 90, np.uint8)
    session.on_event(over_event(), frame, LAYOUT)
    (v,) = client.get("/console/api/violations").json()["violations"]
    assert v["bay"] == "3" and v["type"] == "over_line" and v["max_crossing_m"] == 0.45 and v["side"] == "right"
    assert v["evidence"] is True and v["evidence_hq"] is False and "polygon" not in v      # the bay's shape stays server side
    pic = client.get(f"/console/api/evidence/{v['id']}.jpg")
    assert pic.status_code == 200 and pic.headers["content-type"] == "image/jpeg"
    img = cv2.imdecode(np.frombuffer(pic.content, np.uint8), cv2.IMREAD_COLOR)
    assert img is not None and img.shape[0] > 200
    assert session.still_requested is True


def test_the_sharp_photo_arrives_and_is_cut_around_the_bay_scaled_to_its_size(client, session):
    session.on_event(over_event(), np.full((720, 1280, 3), 90, np.uint8), LAYOUT)
    big = np.full((2160, 3840, 3), 120, np.uint8)
    ok, buf = cv2.imencode(".jpg", big)
    r = client.post("/live/still", files={"image": ("s.jpg", buf.tobytes(), "image/jpeg")},
                    data={"camera_id": "phone-1", "key": app_module.LIVE_KEY})
    assert r.status_code == 201
    (v,) = client.get("/console/api/violations").json()["violations"]
    assert v["evidence_hq"] is True
    hq = cv2.imdecode(np.frombuffer(client.get(f"/console/api/evidence/{v['id']}.jpg?hq=1").content, np.uint8), cv2.IMREAD_COLOR)
    plain = cv2.imdecode(np.frombuffer(client.get(f"/console/api/evidence/{v['id']}.jpg").content, np.uint8), cv2.IMREAD_COLOR)
    assert hq.shape[1] > 2.5 * plain.shape[1]                                              # about three times the pixels


def test_the_car_moving_right_or_leaving_closes_it_and_a_bay_with_no_shape_still_registers(client, session):
    session.on_event(over_event(T0), None, None)                                           # no picture, no layout
    (v,) = client.get("/console/api/violations").json()["violations"]
    assert v["evidence"] is False and v["closed"] is None
    session.on_event({"t": T0 + 500, "type": "bay_freed", "bay_id": "3"}, None, None)
    (v,) = client.get("/console/api/violations").json()["violations"]
    assert v["closed"] == T0 + 500 and v["duration_s"] == 500.0 and v["status"] == "open"


def test_other_events_and_other_bays_do_not_touch_the_register(client, session):
    session.on_event({"t": 1.0, "type": "bay_occupied", "bay_id": "3"}, None, None)
    session.on_event({"t": 1.0, "type": "in", "track_id": 4}, None, None)
    session.on_event({"t": 1.0, "type": "parking_over_line"}, None, None)                  # no bay
    assert client.get("/console/api/violations").json()["violations"] == []


def test_an_operator_resolves_with_a_note_and_it_is_logged(client, session, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "LIVE_LOG_DIR", tmp_path / "logs")
    session._log_dir = tmp_path / "logs"
    session.on_event(over_event(), None, LAYOUT)
    (v,) = client.get("/console/api/violations").json()["violations"]
    r = client.post(f"/console/api/violations/{v['id']}", json={"status": "resolved", "note": "Driver told"})
    assert r.status_code == 200 and r.json()["violation"]["status"] == "resolved" and r.json()["open_count"] == 0
    assert client.get("/console/api/violations?status=open").json()["violations"] == []
    assert client.get("/console/api/violations?status=resolved").json()["violations"][0]["note"] == "Driver told"
    logged = [json.loads(line) for p in (tmp_path / "logs").glob("phone-1-*.jsonl") for line in p.read_text().splitlines()]
    assert any(e["type"] == "operator_violation" and e["status"] == "resolved" and e["note"] == "Driver told" for e in logged)
    assert client.post(f"/console/api/violations/{v['id']}", json={"status": "nonsense"}).status_code == 400
    assert client.post("/console/api/violations/nope-1", json={"status": "resolved"}).status_code == 404
    assert client.post("/console/api/violations/..%2Fx", json={"status": "resolved"}).status_code == 404


def test_evidence_for_a_bad_id_or_a_missing_picture_is_a_404(client):
    assert client.get("/console/api/evidence/nope.jpg").status_code == 404
    assert client.get("/console/api/evidence/a..b.jpg").status_code == 404


def test_the_csv_export_has_the_columns_and_neutralises_formulas(client, session):
    ev = over_event(T0)
    ev["detail"] = "=cmd|' /c calc'!A1"
    session.on_event(ev, None, LAYOUT)
    r = client.get("/console/api/violations.csv")
    lines = r.content.decode("utf-8-sig").split("\r\n")
    assert r.headers["content-type"].startswith("text/csv") and "violations.csv" in r.headers["content-disposition"]
    assert lines[0] == "opened,closed,bay,plate,type,minutes,max_crossing_m,status,note,handled_by,detail"
    assert "'=cmd" in lines[1] and ",P3,,over_line," in lines[1] and ",0.45," in lines[1]            # no plate was read for this one


def test_the_date_range_filter_uses_whole_local_days(client, session):
    session.on_event(over_event(time.time()), None, LAYOUT)
    assert len(client.get("/console/api/violations?from=2020-01-01&to=2020-01-02").json()["violations"]) == 0
    from datetime import datetime, timedelta
    now = datetime.now(app_module.reports.site_tz())
    today, month_ago = now.strftime("%Y-%m-%d"), (now - timedelta(days=30)).strftime("%Y-%m-%d")
    assert len(client.get(f"/console/api/violations?from={month_ago}&to={today}").json()["violations"]) == 1
    assert len(client.get(f"/console/api/violations?from={today}").json()["violations"]) == 1
    assert client.get("/console/api/violations?from=2000-01-01").json()["violations"] == []
    assert client.get("/console/api/violations?from=garbage").status_code == 400


def test_the_overstay_limit_is_a_setting_per_camera_and_the_minute_hook_applies_it(client, session):
    client.post("/console/api/site", json={"cameras": {"phone-1": {"overstay_h": 2}}})
    import status as st
    # what the live worker really hands over: compose_bays output, whose "since" is a text with a zone (a float here hid the bug that
    # stopped the overstay clock, and the daily tidy-up after it, on 28 Oct)
    slots = st.compose_bays({"1": {"state": "occupied", "since": time.time() - 3 * 3600, "seen_vehicle": True}})
    assert isinstance(slots["1"]["since"], str)
    app_module._on_live_minute(session, slots, time.time())
    (v,) = client.get("/console/api/violations?type=overstay").json()["violations"]
    assert v["bay"] == "1" and "over 2 h" in v["detail"]
    client.post("/console/api/site", json={"cameras": {"phone-1": {"overstay_h": 0}}})
    app_module._site_cache["key"] = None
    app_module._on_live_minute(session, st.compose_bays({"2": {"state": "occupied", "since": time.time() - 9 * 3600, "seen_vehicle": True}}), time.time())
    assert len(client.get("/console/api/violations?type=overstay").json()["violations"]) == 1       # off: nothing new


def test_the_overstay_clock_ignores_a_change_of_verdict_and_a_blocked_bay(tmp_path):
    book = V.ViolationBook(tmp_path / "cam.json", "cam")
    now = time.time()
    taken = lambda since, **kw: {"status": "OCCUPIED", "flag": None, "since_epoch": since, **kw}
    book.check_overstay({"1": taken(now - 3 * 3600)}, now - 3 * 3600 + 60, 99)                      # first seen taken 3 h ago
    # a minute ago the verdict changed (correct -> close to the line), so the engine's "since" is new; the car has been there 3 h
    opened = book.check_overstay({"1": taken(now - 60), "2": taken(now - 9 * 3600, flag="blocked")}, now, 2)
    assert [r["bay"] for r in opened] == ["1"]                                                     # a blocked bay is no car's stay
    gone = book.check_overstay({"1": {"status": "VACANT"}}, now + 60, 2)                           # the car left: the clock starts over
    assert gone == [] and "1" not in book._held_from


def test_a_torn_register_is_moved_aside_not_overwritten(tmp_path):
    p = tmp_path / "cam.json"
    book = V.ViolationBook(p, "cam")
    now = time.time()
    for i in range(5):
        book.open(f"B{i}", "over_line", now - 100 + i)
    p.write_text(p.read_text()[:-40])                                                               # a torn write
    book.open("B9", "over_line", now)                                                               # the next write used to leave 1 row of 6
    assert len(book.list()) == 1
    (kept,) = [f for f in tmp_path.iterdir() if ".corrupt-" in f.name]
    assert kept.read_text().startswith("[")                                                         # what was there is still there


def test_a_violation_in_a_re_marked_bay_is_a_new_one_not_the_old_one_reopened(tmp_path):
    book = V.ViolationBook(tmp_path / "cam.json", "cam")
    now = time.time()
    old, _ = book.open("Bay-04", "over_line", now - 120, "old layout", 0.4, "left")
    book.close_all(now - 60)                                                                        # the bays were re-marked
    new, created = book.open("Bay-04", "over_line", now, "new layout", 0.3, "left")
    assert created and new["id"] != old["id"] and new["detail"] == "new layout"


def test_visitors_cannot_see_or_change_anything_in_the_register(client, session):
    session.on_event(over_event(), None, LAYOUT)
    v = client.get("/console/api/violations").json()["violations"][0]
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    proxy = {"X-Forwarded-For": "203.0.113.9"}
    for path in ("/console/api/violations", "/console/api/violations.csv", f"/console/api/evidence/{v['id']}.jpg",
                 "/console/api/report", "/console/api/cameras"):
        assert visitor.get(path, headers=proxy).status_code == 403, path
    assert visitor.post(f"/console/api/violations/{v['id']}", json={"status": "resolved"}, headers=proxy).status_code == 403
    assert client.get("/console/api/violations").json()["violations"][0]["status"] == "open"
