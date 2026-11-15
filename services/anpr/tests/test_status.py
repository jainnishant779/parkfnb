"""
The four-state answer per bay (VACANT / OCCUPIED / UNCERTAIN / STALE), the feed health, the numbers
that must add up, the dark-scene guard and the moved-camera check.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import status as st  # noqa: E402
from intelligence import STATE_CORRECT, STATE_FREE  # noqa: E402
from live import LiveSession  # noqa: E402
from occupancy import BayMap, BayObservation, ParkingIntelligenceEngine  # noqa: E402

BAY = "Bay-01"


# ---- state -> status

@pytest.mark.parametrize("state,status,flag", [
    ("free", st.VACANT, None), ("occupied", st.OCCUPIED, None), ("correct", st.OCCUPIED, None),
    ("wrong", st.OCCUPIED, "wrong"), ("suspicious", st.OCCUPIED, "suspicious"),
    ("occluded", st.OCCUPIED, None), ("unknown", st.UNCERTAIN, None), ("brand-new", st.UNCERTAIN, None),
])
def test_every_engine_state_maps_to_one_status(state, status, flag):
    got, got_flag, code = st.status_of(state)
    assert (got, got_flag) == (status, flag) and code in st.REASON_TEXT


def details(**states):
    return {k: {"state": v, "since": time.time() - 90, "seen_vehicle": v not in ("free", "unknown")}
            for k, v in states.items()}


# ---- compose + summary

def test_the_counts_always_add_up_to_the_total():
    d = details(a="free", b="correct", c="wrong", d="occluded", e="unknown")
    for kw in ({}, {"stale": True}, {"low_light": True}, {"moved": True}):
        s = st.summarize(st.compose_bays(d, **kw))
        assert s["vacant"] + s["occupied_confirmed"] + s["uncertain"] + s["stale"] == s["total"] == 5


def test_a_parked_badly_bay_is_occupied_with_a_flag_and_counts_for_review_once():
    bays = st.compose_bays(details(a="free", b="wrong", c="unknown"))
    s = st.summarize(bays)
    assert bays["b"]["status"] == st.OCCUPIED and bays["b"]["flag"] == "wrong"
    assert (s["occupied_confirmed"], s["flagged"], s["uncertain"], s["review"]) == (1, 1, 1, 2)


def test_a_car_partly_hidden_by_another_still_makes_the_bay_occupied_and_needs_no_review():
    bays = st.compose_bays(details(a="free", b="occluded"))
    assert bays["b"]["status"] == st.OCCUPIED and bays["b"]["flag"] is None
    assert bays["b"]["reason_text"] == "Partly hidden by another car"
    s = st.summarize(bays)
    assert (s["occupied_confirmed"], s["uncertain"], s["review"]) == (1, 0, 0)


def test_when_the_feed_is_stale_no_bay_claims_to_be_vacant_or_occupied():
    bays = st.compose_bays(details(a="free", b="correct"), stale=True)
    assert {b["status"] for b in bays.values()} == {st.STALE}
    assert bays["a"]["last_status"] == st.VACANT and bays["b"]["last_status"] == st.OCCUPIED
    assert st.summarize(bays)["review"] == 0                      # a stale bay is not "needs a look"


def test_a_stale_bay_remembers_what_it_last_was_trusted_to_be_not_the_raw_reading():
    d = details(a="free", b="correct")
    moved = st.compose_bays(d, stale=True, moved=True)                 # the camera had moved, then the feed stopped
    assert {b["status"] for b in moved.values()} == {st.STALE}
    assert {b["last_status"] for b in moved.values()} == {st.UNCERTAIN}
    dark = st.compose_bays(d, stale=True, low_light=True)              # dark, then the feed stopped
    assert dark["a"]["last_status"] == st.UNCERTAIN and dark["b"]["last_status"] == st.OCCUPIED
    both = st.compose_bays(d, stale=True, moved=True, low_light=True)
    assert {b["last_status"] for b in both.values()} == {st.UNCERTAIN}


def test_in_the_dark_a_bay_with_no_car_seen_is_uncertain_not_vacant():
    d = details(a="free", b="correct")
    d["b"]["seen_vehicle"] = True
    bays = st.compose_bays(d, low_light=True)
    assert bays["a"]["status"] == st.UNCERTAIN and bays["a"]["reason"] == "low_light"
    assert bays["b"]["status"] == st.OCCUPIED                      # a car actually seen is still a car


def test_a_moved_camera_makes_every_bay_uncertain_whatever_was_seen():
    bays = st.compose_bays(details(a="free", b="correct"), moved=True)
    assert {b["reason"] for b in bays.values()} == {"camera_moved"}


def test_a_bay_carries_since_and_how_long_it_has_held():
    b = st.compose_bays(details(a="correct"))["a"]
    assert b["held_s"] == 90 and b["since"].startswith("20")


# ---- feed health

def test_stream_status_follows_the_ages():
    assert st.stream_status(None, None) == st.STREAM_NOT_STARTED
    assert st.stream_status(1.0, 1.0) == st.STREAM_LIVE
    assert st.stream_status(40.0, 40.0) == st.STREAM_OFFLINE         # nothing arriving
    assert st.stream_status(2.0, 30.0) == st.STREAM_STALE             # arriving, not being processed
    assert st.stream_status(2.0, 30.0, "ValueError: x") == st.STREAM_ERROR
    assert st.stream_status(2.0, None) == st.STREAM_STALE


def test_fps_over_the_recent_window():
    m = st.FpsMeter(window_s=10)
    for i in range(6):
        m.tick(100 + i * 0.5)                                         # 2 fps
    assert m.fps(now=103) == 2.0
    assert st.FpsMeter().fps() == 0.0
    assert m.fps(now=500) == 0.0                                      # long ago = nothing recent


def test_low_light_threshold():
    assert st.is_low_light(20) and not st.is_low_light(120)


# ---- engine: details follow the held state, dark hold, dwell

def obs(state, coverage=0.5):
    return BayObservation(bay_id=BAY, state=state, coverage=coverage, vehicle_index=0,
                          parking_quality="correct", reason=("Slot is empty" if state == STATE_FREE else "inside its lines"),
                          vehicle_track_id=None if state == STATE_FREE else 7)


def engine(**kw):
    return ParkingIntelligenceEngine(BayMap({BAY: [[0, 0], [100, 0], [100, 200], [0, 200]]}, view="medium"), **kw)


def pump(e, o, n=1, **kw):
    for _ in range(n):
        e.update([], observations=[o], **kw)
    return e.states[BAY]


def test_a_taken_bay_never_shows_slot_is_empty_after_one_missed_detection():
    e = engine()
    pump(e, obs(STATE_CORRECT), 4)
    s = pump(e, obs(STATE_FREE, coverage=0.0))                         # one frame, car not seen
    assert s.state == STATE_CORRECT and s.reason == "inside its lines" and s.coverage == 0.5
    assert s.seen_vehicle is False                                    # but the engine knows what the frame saw


def test_one_missed_detection_does_not_flip_the_bay():
    e = engine()
    pump(e, obs(STATE_CORRECT), 4)
    assert pump(e, obs(STATE_FREE)).state == STATE_CORRECT
    assert pump(e, obs(STATE_CORRECT)).state == STATE_CORRECT


def test_in_the_dark_empty_readings_cannot_free_a_taken_bay():
    e = engine()
    pump(e, obs(STATE_CORRECT), 4)
    s = pump(e, obs(STATE_FREE), 20, hold_free=True)                   # a long dark spell, nothing detected
    assert s.state == STATE_CORRECT
    s = pump(e, obs(STATE_FREE), 6)                                    # light is back and it really is empty
    assert s.state == STATE_FREE


def test_hold_free_does_not_stop_a_free_bay_becoming_taken():
    e = engine()
    pump(e, obs(STATE_FREE), 6)
    assert pump(e, obs(STATE_CORRECT), 4, hold_free=True).state == STATE_CORRECT


def test_a_just_taken_bay_is_not_freed_before_the_dwell_time_but_a_car_arriving_is_shown_at_once():
    e = engine(min_dwell_s=30)
    pump(e, obs(STATE_FREE), 6)
    assert pump(e, obs(STATE_CORRECT), 3).state == STATE_CORRECT        # arrival: no delay
    assert pump(e, obs(STATE_FREE), 8).state == STATE_CORRECT          # too soon to free it
    e.states[BAY].since -= 60                                          # 60 s later
    assert pump(e, obs(STATE_FREE), 1).state == STATE_FREE


def test_agreement_is_the_share_of_recent_readings_that_agree():
    e = engine()
    assert e.agreement(BAY) is None
    pump(e, obs(STATE_CORRECT), 5)
    pump(e, obs(STATE_FREE), 1)
    assert e.agreement(BAY) == round(5 / 6, 2)


def test_the_votes_can_be_set_by_environment(monkeypatch):
    monkeypatch.setenv("ANPR_OCCUPY_VOTES", "2")
    monkeypatch.setenv("ANPR_FREE_VOTES", "4")
    e = engine()
    assert (e.occupy_votes, e.free_votes) == (2, 4)


# ---- moved camera

def scene(w=640, h=360, seed=3):
    """A textured picture with structure at every scale, like a real yard."""
    rng = np.random.default_rng(seed)
    img = cv2.GaussianBlur((rng.random((h, w)) * 255).astype(np.uint8), (0, 0), 3)
    for _ in range(30):
        x, y = int(rng.integers(0, w - 60)), int(rng.integers(0, h - 40))
        cv2.rectangle(img, (x, y), (x + int(rng.integers(15, 60)), y + int(rng.integers(10, 40))),
                      int(rng.integers(30, 230)), -1)
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)


def shift(img, dx, dy):
    return cv2.warpAffine(img, np.float32([[1, 0, dx], [0, 1, dy]]), (img.shape[1], img.shape[0]),
                          borderMode=cv2.BORDER_REFLECT)


def test_a_camera_that_has_not_moved_is_ok_even_after_a_change_of_light():
    base = scene()
    d = st.MoveDetector()
    d.set_reference(base)
    for frame in (base, cv2.convertScaleAbs(base, alpha=0.35, beta=0), shift(base, 1, 1)):
        for _ in range(3):
            assert d.check(frame) is False


def test_a_sideways_shift_is_noticed_after_two_checks_and_clears_when_it_returns():
    base = scene()
    d = st.MoveDetector()
    d.set_reference(base)
    moved = shift(base, 60, 20)                                        # 9% of the width
    assert d.check(moved) is False                                     # one reading is not enough
    assert d.check(moved) is True
    assert d.check(base) is True and d.check(base) is False            # back in place: clears


def test_a_picture_with_nothing_in_common_gives_no_verdict():
    d = st.MoveDetector()
    d.set_reference(scene(seed=3))
    other = scene(seed=99)
    assert d.check(other) is False and d.check(other) is False         # weak match: no false alarm


def test_the_reference_survives_a_round_trip_through_png():
    base = scene()
    a = st.MoveDetector()
    png = a.set_reference(base)
    b = st.MoveDetector()
    assert b.load_reference_png(png) and b.has_reference
    assert b.check(shift(base, 60, 0)) is False and b.check(shift(base, 60, 0)) is True
    assert st.MoveDetector().load_reference_png(b"not a png") is False


# ---- through the live path

class Veh:
    def __init__(self, tid, x1, y1, x2, y2):
        self.track_id, self.x1, self.y1, self.x2, self.y2 = tid, x1, y1, x2, y2
        self.plate, self.confidence = "", 0.9


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def run_process(monkeypatch, frames, camera="cam-t"):
    """Push frames through the real _live_process with a fake detector, return the last snapshot."""
    monkeypatch.setattr(app_module, "get_detector", lambda: type("D", (), {"model": object(), "ocr_kind": "none"})())

    class MOT:
        def __init__(self, m): pass
        def reset(self): pass
        def track_frame(self, f, conf=0.1, imgsz=640): return []
    monkeypatch.setattr(app_module, "VehicleMOTTracker", MOT)
    monkeypatch.setattr(app_module, "_mot_trackers", {})
    monkeypatch.setattr(app_module, "_move_detectors", {})
    monkeypatch.setattr(app_module, "LightGate", lambda: st.LightGate(band=0.0, hold_s=0.0, smooth=1.0))
    monkeypatch.setattr(app_module, "get_segmenter", lambda: type("S", (), {"attach": lambda *a, **k: None})())
    app_module._install_bays(camera, {"1": [[40, 120], [140, 120], [150, 220], [30, 220]]}, "oblique")
    session = LiveSession(camera, app_module._live_process, Path("."))
    out = None
    for f in frames:
        session.last_frame_at = time.time()                            # what submit() would have recorded
        out = app_module._live_process(f, session)
        session._finish(f, out, time.time())
    return session, out


def test_a_dark_frame_reports_low_light_and_the_bay_is_not_called_vacant(monkeypatch):
    dark = np.full((240, 320, 3), 12, np.uint8)
    session, out = run_process(monkeypatch, [dark] * 3)
    snap = session.snapshot()
    assert out["light"] == "low" and snap["light"] == "low"
    assert snap["slots"][0]["status"] == st.UNCERTAIN and snap["slots"][0]["reason"] == "low_light"
    assert snap["slot_summary"]["vacant"] == 0 and snap["bays"] == {"1": {"state": snap["bays"]["1"]["state"]}}


def test_a_bright_frame_with_no_car_reads_vacant_once_settled(monkeypatch):
    bright = np.full((240, 320, 3), 140, np.uint8)
    session, _ = run_process(monkeypatch, [bright] * 8)
    snap = session.snapshot()
    assert snap["slots"][0]["status"] == st.VACANT and snap["light"] == "ok"
    assert snap["slot_summary"] == {"total": 1, "vacant": 1, "occupied_confirmed": 0, "uncertain": 0,
                                    "stale": 0, "flagged": 0, "review": 0, "parked_correctly": 0,
                                    "close_to_line": 0, "over_line": 0, "not_judged": 0, "blocked": 0}
    assert snap["stream_status"] == st.STREAM_LIVE and snap["frame_seq"] == 8 and snap["fps_processed"] >= 0


def test_the_feed_going_quiet_turns_every_bay_stale_and_it_recovers(monkeypatch):
    bright = np.full((240, 320, 3), 140, np.uint8)
    session, _ = run_process(monkeypatch, [bright] * 8)
    session.last_done_at -= 60
    session.last_frame_at -= 60                                        # nothing for a minute
    snap = session.snapshot()
    assert snap["stream_status"] == st.STREAM_OFFLINE
    assert snap["slots"][0]["status"] == st.STALE and snap["slot_summary"]["stale"] == 1
    assert snap["slots"][0]["last_status"] == st.VACANT               # the last answer is kept, not erased
    session.last_done_at = session.last_frame_at = time.time()         # frames flow again
    assert session.snapshot()["slots"][0]["status"] == st.VACANT


def test_a_failed_frame_is_reported_and_cleared_by_the_next_good_one(monkeypatch):
    calls = {"n": 0}

    def flaky(frame, session):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": frame}
    s = LiveSession("cam-e", flaky, Path("."))
    f = np.full((60, 80, 3), 120, np.uint8)
    s.submit(f)
    end = time.time() + 5
    while "RuntimeError" not in s.snapshot()["error"] and time.time() < end:
        time.sleep(0.02)
    assert "boom" in s.snapshot()["error"]
    s.submit(f)
    end = time.time() + 5
    while s.snapshot()["error"] and time.time() < end:
        time.sleep(0.02)
    s.stop()
    assert s.snapshot()["error"] == "" and s.snapshot()["frames_processed"] == 1


def test_the_picture_paints_an_unclear_bay_amber_not_green(monkeypatch):
    """At night a bay with no car seen is 'unclear' on the page; the picture must say the same."""
    import cv2 as _cv2
    session, out = run_process(monkeypatch, [np.full((240, 320, 3), 12, np.uint8)] * 3)
    ok, buf = _cv2.imencode(".jpg", out["annotated_clean"])
    img = _cv2.imdecode(np.frombuffer(buf.tobytes(), np.uint8), _cv2.IMREAD_COLOR)
    b, g, r = [int(v) for v in img[200, 90]]                      # inside bay 1, away from its label
    assert r > g > b or (r > b and g > b), (b, g, r)               # amber (red+green over blue), not the green of vacant
    assert not (g > r + 20 and g > b + 20), (b, g, r)


def test_the_camera_moving_after_the_bays_were_saved_makes_them_uncertain(monkeypatch):
    base = scene(320, 240)
    monkeypatch.setattr(app_module, "MOVE_CHECK_S", 0.0)
    session, _ = run_process(monkeypatch, [base])                      # the first frame becomes the reference
    assert session.snapshot()["calibration"] == "ok"
    for _ in range(3):
        out = app_module._live_process(shift(base, 30, 10), session)
        session._finish(base, out, time.time())
    snap = session.snapshot()
    assert snap["calibration"] == "moved" and snap["slots"][0]["reason"] == "camera_moved"
    # the operator saves the bays again: the new view is the reference, so the warning clears
    app_module._install_bays("cam-t", {"1": [[40, 120], [140, 120], [150, 220], [30, 220]]}, "oblique")
    out = app_module._live_process(shift(base, 30, 10), session)
    session._finish(base, out, time.time())
    assert session.snapshot()["calibration"] == "ok"


def test_a_restart_keeps_the_reference_so_a_moved_camera_is_still_caught(monkeypatch):
    base = scene(320, 240)
    session, _ = run_process(monkeypatch, [base])
    assert app_module.state_store.load_ref("cam-t")                    # saved next to the bays
    monkeypatch.setattr(app_module, "_move_detectors", {})             # "restart"
    app_module._install_bays("cam-t", {"1": [[40, 120], [140, 120], [150, 220], [30, 220]]}, "oblique",
                             restoring=True)
    assert app_module.state_store.load_ref("cam-t")                    # restoring must not throw it away


def test_the_public_state_has_the_new_fields_and_the_old_ones(client):
    s = client.get("/live/state?camera_id=nobody").json()
    for key in ("online", "age_s", "counts", "line_set", "bays", "bay_summary", "events", "frames_received",
                "frames_processed", "error", "stream_status", "frame_age_s", "fps_processed", "frame_seq",
                "light", "calibration", "slots", "slot_summary"):
        assert key in s, key
    assert s["stream_status"] == "not_started" and s["slot_summary"]["total"] == 0


def test_the_picture_says_which_frame_it_belongs_to(client, monkeypatch):
    f = np.full((60, 80, 3), 120, np.uint8)
    ok, buf = cv2.imencode(".jpg", f)
    monkeypatch.setattr(app_module, "_live_process",
                        lambda fr, se: {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": fr})
    r = client.post("/live/frame-raw?camera_id=cam-h", content=buf.tobytes(),
                    headers={"X-Camera-Key": app_module.LIVE_KEY, "Content-Type": "image/jpeg"})
    assert r.status_code == 202
    end = time.time() + 5
    while client.get("/live/state?camera_id=cam-h").json()["frame_seq"] < 1 and time.time() < end:
        time.sleep(0.02)
    r = client.get("/live/frame.jpg?camera_id=cam-h")
    assert r.status_code == 200 and r.headers["x-frame-seq"] == "1"
