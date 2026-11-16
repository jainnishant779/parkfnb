"""
Operator review (an admin can say what an uncertain bay really is, for a while, and the camera's own
evidence overrules it) and the feed events that appear on the timeline.
"""
import sys
import time
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import status as st  # noqa: E402
from live import LiveSession  # noqa: E402

TOKEN = "k3m9r7hp2xw5cz8abtv4n6fdsj"
COOKIE = {"Cookie": f"parkfnb_admin={TOKEN}"}
PROXY = {"X-Forwarded-For": "203.0.113.9"}
BAY = {"1": [[40, 120], [140, 120], [150, 220], [30, 220]], "2": [[160, 120], [260, 120], [270, 220], [150, 220]]}


def d(state, since=None):
    return {"state": state, "since": since or time.time() - 30, "seen_vehicle": state not in ("free", "unknown")}


# ---- the override itself

def test_an_override_wins_over_an_uncertain_reading_and_is_counted_as_that_status():
    o = st.Overrides()
    o.set("a", st.OCCUPIED, "unknown", 15)
    bays = st.compose_bays({"a": d("unknown"), "b": d("free")}, overrides=o.active({"a": d("unknown"), "b": d("free")}))
    assert bays["a"]["status"] == st.OCCUPIED and bays["a"]["flag"] == "operator"
    assert bays["a"]["reason_text"] == "Set by operator" and bays["a"]["last_status"] == st.UNCERTAIN
    s = st.summarize(bays)
    assert (s["occupied_confirmed"], s["uncertain"], s["vacant"], s["flagged"], s["review"]) == (1, 0, 1, 0, 0)


def test_an_override_keeps_a_bay_out_of_stale_and_dark_labels():
    o = st.Overrides()
    o.set("a", st.VACANT, "free", 15)
    for kw in ({"stale": True}, {"low_light": True}, {"moved": True}):
        bays = st.compose_bays({"a": d("free")}, overrides=o.active({"a": d("free")}), **kw)
        assert bays["a"]["status"] == st.VACANT and bays["a"]["flag"] == "operator"


def test_it_ends_when_time_is_up():
    o = st.Overrides()
    o.set("a", st.VACANT, "free", 10, now=1000.0)
    assert "a" in o.active({"a": d("free")}, now=1000.0 + 599)
    assert o.active({"a": d("free")}, now=1000.0 + 601) == {}


def test_it_ends_the_moment_the_camera_reads_the_bay_differently():
    o = st.Overrides()
    o.set("a", st.VACANT, "occluded", 30)
    assert "a" in o.active({"a": d("occluded")})
    assert o.active({"a": d("correct")}) == {}                         # new evidence wins
    assert o.active({"a": d("occluded")}) == {}                        # and it does not come back by itself


def test_it_ends_for_a_bay_that_no_longer_exists_and_can_be_cleared():
    o = st.Overrides()
    o.set("a", st.VACANT, "free", 5)
    o.set("b", st.VACANT, "free", 5)
    assert o.clear("b") and not o.clear("b")
    assert o.active({}) == {}


def test_the_length_is_limited_and_the_status_checked():
    o = st.Overrides()
    got = o.set("a", st.VACANT, "free", 100000, now=0.0)
    assert got["until"] == st.MAX_OVERRIDE_MIN * 60
    assert o.set("b", st.VACANT, "free", 0, now=0.0)["until"] == 60      # at least a minute
    with pytest.raises(ValueError):
        o.set("a", "STALE", "free", 5)
    with pytest.raises(ValueError):
        o.set("a", "maybe", "free", 5)


# ---- through a live session and the routes

def make_session(monkeypatch, camera="cam-o"):
    monkeypatch.setattr(app_module, "get_detector", lambda: type("D", (), {"model": object(), "ocr_kind": "none"})())

    class MOT:
        def __init__(self, m): pass
        def reset(self): pass
        def track_frame(self, f, conf=0.1, imgsz=640): return []
    monkeypatch.setattr(app_module, "VehicleMOTTracker", MOT)
    monkeypatch.setattr(app_module, "_mot_trackers", {})
    monkeypatch.setattr(app_module, "_move_detectors", {})
    monkeypatch.setattr(app_module, "LightGate", lambda: st.LightGate(band=0.0, hold_s=0.0, smooth=1.0))      # these tests change the light at once
    monkeypatch.setattr(app_module, "get_segmenter", lambda: type("S", (), {"attach": lambda *a, **k: None})())
    app_module._install_bays(camera, BAY, "oblique")
    return LiveSession(camera, app_module._live_process, Path("."))


def feed(session, frame, n=1):
    for _ in range(n):
        session.last_frame_at = time.time()
        out = app_module._live_process(frame, session)
        session._finish(frame, out, time.time())


BRIGHT = np.full((240, 320, 3), 140, np.uint8)
DARK = np.full((240, 320, 3), 12, np.uint8)


def test_a_dark_spell_can_be_answered_by_the_operator(monkeypatch):
    s = make_session(monkeypatch)
    feed(s, DARK, 3)
    snap = s.snapshot()
    assert [x["status"] for x in snap["slots"]] == [st.UNCERTAIN, st.UNCERTAIN]
    s.set_override("1", "OCCUPIED", 30)
    snap = s.snapshot()
    by = {x["id"]: x for x in snap["slots"]}
    assert by["1"]["status"] == st.OCCUPIED and by["1"]["flag"] == "operator" and by["1"]["override_until"]
    assert by["2"]["status"] == st.UNCERTAIN
    assert snap["slot_summary"]["occupied_confirmed"] == 1 and snap["slot_summary"]["uncertain"] == 1
    assert any(e["type"] == "operator" and e["bay_id"] == "1" and e["status"] == "OCCUPIED" for e in snap["events"])
    assert s.clear_override("1") is True and s.clear_override("1") is False
    assert {x["id"]: x["status"] for x in s.snapshot()["slots"]}["1"] == st.UNCERTAIN


def test_an_override_for_an_unknown_bay_or_before_any_frame_is_refused(monkeypatch):
    s = make_session(monkeypatch)
    with pytest.raises(KeyError):
        s.set_override("1", "VACANT", 5)                               # nothing processed yet
    feed(s, BRIGHT)
    with pytest.raises(KeyError):
        s.set_override("nope", "VACANT", 5)


@pytest.fixture
def web(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", TOKEN)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    for name in ("_bay_maps", "_trackers", "_registries"):
        monkeypatch.setattr(app_module, name, {})
    s = make_session(monkeypatch)
    feed(s, DARK, 3)
    app_module._live_sessions["cam-o"] = s
    return s


def client(host):
    return TestClient(app_module.app, client=(host, 40000))


def post(c, body, headers=None):
    return c.post("/live/bay-override", json={"camera_id": "cam-o", **body}, headers=headers or {})


def test_the_route_is_refused_to_visitors_and_open_to_admin_and_this_machine(web):
    assert post(client("203.0.113.9"), {"bay_id": "1", "status": "VACANT"}, PROXY).status_code == 403
    assert post(client("203.0.113.9"), {"bay_id": "1", "status": "VACANT"}, {**PROXY, "Cookie": "parkfnb_admin=wrong"}).status_code == 403
    r = post(client("203.0.113.9"), {"bay_id": "1", "status": "VACANT", "minutes": 20}, {**PROXY, **COOKIE})
    assert r.status_code == 200 and r.json()["ok"] and r.json()["until"] > time.time() + 19 * 60
    assert post(client("127.0.0.1"), {"bay_id": "2", "status": "occupied"}).status_code == 200      # case does not matter


def test_the_route_checks_its_input(web):
    c = client("127.0.0.1")
    assert post(c, {"bay_id": "1", "status": "STALE"}).status_code == 400
    assert post(c, {"bay_id": "1", "status": "VACANT", "minutes": "soon"}).status_code == 400
    assert post(c, {"status": "VACANT"}).status_code == 400
    assert post(c, {"bay_id": "zzz", "status": "VACANT"}).status_code == 404
    assert c.post("/live/bay-override", json={"camera_id": "nobody", "bay_id": "1", "status": "VACANT"}).status_code == 404
    assert c.post("/live/bay-override", content=b"not json").status_code == 400
    assert post(c, {"bay_id": "1", "status": "VACANT", "minutes": 99999}).json()["until"] <= time.time() + 3601


def test_clearing_through_the_route(web):
    c = client("127.0.0.1")
    post(c, {"bay_id": "1", "status": "VACANT"})
    assert post(c, {"bay_id": "1", "status": "CLEAR"}).json() == {"ok": True, "cleared": True}
    assert post(c, {"bay_id": "1", "status": "CLEAR"}).json() == {"ok": True, "cleared": False}


def test_the_page_is_told_whether_to_show_the_buttons(web):
    state = lambda c, h=None: c.get("/live/state?camera_id=cam-o", headers=h or {}).json()
    assert state(client("127.0.0.1"))["is_admin"] is True
    assert state(client("203.0.113.9"), PROXY)["is_admin"] is False
    assert state(client("203.0.113.9"), {**PROXY, **COOKIE})["is_admin"] is True
    assert "is_admin" in state(client("203.0.113.9"), PROXY)


# ---- the timeline

def test_the_feed_going_quiet_and_coming_back_is_dated_to_when_it_happened(monkeypatch):
    s = make_session(monkeypatch)
    feed(s, BRIGHT, 2)
    assert not [e for e in s.snapshot()["events"] if e["type"].startswith("feed_")]
    quiet_since = time.time() - 120
    s.last_frame_at = s.last_done_at = quiet_since                       # nothing for two minutes
    snap = s.snapshot()
    off = [e for e in snap["events"] if e["type"] == "feed_offline"]
    assert len(off) == 1 and abs(off[0]["t"] - (quiet_since + st.STALE_AFTER_S)) < 2
    s.snapshot()
    assert len([e for e in s.snapshot()["events"] if e["type"] == "feed_offline"]) == 1      # once, however often it is asked
    feed(s, BRIGHT)
    events = s.snapshot()["events"]
    assert [e["type"] for e in events if e["type"].startswith("feed_")] == ["feed_offline", "feed_online"]
    assert [e["t"] for e in events] == sorted(e["t"] for e in events)


def test_the_first_frames_after_a_start_are_not_a_recovery(monkeypatch):
    s = make_session(monkeypatch)
    s.last_frame_at = time.time()
    assert s.snapshot()["stream_status"] == "stale"                      # a frame has arrived, none processed yet
    feed(s, BRIGHT)
    assert s.snapshot()["stream_status"] == "live"
    assert [e for e in s.snapshot()["events"] if e["type"].startswith("feed_")] == []


def test_a_server_that_starts_with_a_silent_camera_does_not_invent_an_outage(monkeypatch):
    s = make_session(monkeypatch)
    snap = s.snapshot()                                                  # no frame ever: "not started"
    assert snap["stream_status"] == "not_started" and snap["events"] == []


def test_darkness_and_a_moved_camera_appear_on_the_timeline(monkeypatch):
    s = make_session(monkeypatch)
    feed(s, BRIGHT, 2)
    feed(s, DARK, 2)
    feed(s, BRIGHT, 2)
    kinds = [e["type"] for e in s.snapshot()["events"]]
    assert kinds.count("low_light") == 1 and kinds.count("light_ok") == 1 and kinds.index("low_light") < kinds.index("light_ok")
    # a moved camera: feed the page a frame the way app.py reports it
    out = {"tracked": [], "summary": {}, "bays": {"1": "free"}, "bay_events": [], "annotated": BRIGHT,
           "bay_details": {"1": d("free")}, "calibration": "moved"}
    s._finish(BRIGHT, out, time.time())
    out["calibration"] = "ok"
    s._finish(BRIGHT, out, time.time())
    kinds = [e["type"] for e in s.snapshot()["events"]]
    assert "camera_moved" in kinds and "camera_ok" in kinds
