"""
HTTP-level tests for the live phone feed: the tunnel guard, the camera key, and the whole
frame -> worker -> counts -> public state path.

The model is replaced by a scripted `_live_process`, so no weights are loaded and nothing
heavy runs.  TestClient is used without a `with` block, so the startup hook (which loads
the model) does not fire.
"""
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402

TUNNEL = {"cf-connecting-ip": "203.0.113.9"}


@dataclass
class T:
    track_id: int
    x1: float
    y1: float
    x2: float
    y2: float


def jpeg(w=320, h=240) -> bytes:
    img = np.full((h, w, 3), 90, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    assert ok
    return buf.tobytes()


@pytest.fixture
def client(monkeypatch, tmp_path):
    # A car walking up the frame, one step per processed frame: it crosses y=150 once.
    ys = iter([220, 200, 180, 160, 140, 120, 100, 100, 100, 100])

    def fake_process(frame, session):
        y = next(ys, 100)
        return {"tracked": [T(1, 100, y - 40, 180, y)], "summary": {}, "bays": {},
                "bay_events": [], "annotated": frame}

    monkeypatch.setattr(app_module, "_live_process", fake_process)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "LIVE_LOG_DIR", tmp_path / "live_logs")
    # requests from this machine; anything else counts as remote (see live.is_remote)
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def post_frame(c, key=None, headers=None, camera="phone-1"):
    key = app_module.LIVE_KEY if key is None else key
    return c.post("/live/frame", headers=headers or {},
                  files={"image": ("f.jpg", jpeg(), "image/jpeg")},
                  data={"camera_id": camera, "key": key})


def wait_processed(c, n, camera="phone-1", timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if c.get(f"/live/state?camera_id={camera}").json().get("frames_processed", 0) >= n:
            return
        time.sleep(0.02)
    raise AssertionError(f"worker did not process {n} frames in {timeout}s")


# ---- guard on the real app

@pytest.mark.parametrize("method,path", [
    ("post", "/occupancy/bays"), ("get", "/occupancy/bays"), ("post", "/stream/start"),
    ("post", "/live/config"), ("post", "/live/reset"), ("get", "/live/setup"),
    ("post", "/occupancy/check"), ("post", "/gate-event"), ("get", "/health"), ("get", "/tools/plate-test"),
    ("get", "/console/api/cameras"), ("get", "/console/api/report"), ("get", "/console/api/violations"),
])
def test_tunnel_requests_to_private_routes_are_403(client, method, path):
    r = getattr(client, method)(path, headers=TUNNEL)
    assert r.status_code == 403


def test_with_a_sign_in_set_up_the_front_door_is_the_sign_in_page_not_the_live_view(client, monkeypatch):
    import admin_auth
    monkeypatch.setattr(app_module, "ADMIN_PW_HASH", admin_auth.hash_password("a-test-password-123"))
    r = client.get("/", headers=TUNNEL, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/admin?next=%2F"
    page = client.get("/", headers=TUNNEL)                                                 # followed: the sign-in form
    assert page.status_code == 200 and 'name="password"' in page.text and "Console" not in page.text
    assert client.get("/live", headers=TUNNEL).status_code == 200                          # the public view is still at /live
    monkeypatch.setattr(app_module, "ADMIN_PW_HASH", "")
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", "")
    assert client.get("/", headers=TUNNEL, follow_redirects=False).headers["location"] == "/live"   # nothing to sign in to


def test_the_front_door_sends_a_visitor_to_the_public_live_view_and_never_serves_the_console(client):
    for path in ("/", ""):
        r = client.get(path or "/", headers=TUNNEL, follow_redirects=False)
        assert r.status_code == 303 and r.headers["location"] == "/live"
        assert "Console" not in r.text
    assert client.post("/", headers=TUNNEL, follow_redirects=False).status_code in (403, 405)   # only a GET is turned into a redirect
    # this machine (an operator) gets the console itself
    r = client.get("/")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]


def test_local_requests_keep_full_access(client):
    assert client.get("/live/setup").status_code == 200
    assert client.post("/live/reset", json={}).status_code == 200


def test_public_pages_and_state_work_through_the_tunnel(client):
    assert client.get("/live", headers=TUNNEL).status_code == 200
    assert client.get("/live/camera", headers=TUNNEL).status_code == 200
    r = client.get("/live/state", headers=TUNNEL)
    assert r.status_code == 200 and r.json()["online"] is False


def test_public_state_does_not_create_sessions(client):
    for i in range(20):
        client.get(f"/live/state?camera_id=made-up-{i}", headers=TUNNEL)
    assert app_module._live_sessions == {}


def test_raw_frame_is_local_only(client):
    assert post_frame(client).status_code == 202
    wait_processed(client, 1)
    assert client.get("/live/frame.jpg?raw=1").status_code == 200
    assert client.get("/live/frame.jpg?raw=1", headers=TUNNEL).status_code == 403
    assert client.get("/live/frame.jpg", headers=TUNNEL).status_code == 200


def test_setup_page_has_the_key_but_it_is_not_public(client):
    assert app_module.LIVE_KEY in client.get("/live/setup").json()["phone_page"]
    assert client.get("/live/setup", headers=TUNNEL).status_code == 403


# ---- camera key and upload checks

def test_frame_needs_the_right_key(client):
    assert post_frame(client, key="", headers=TUNNEL).status_code == 403
    assert post_frame(client, key="wrong", headers=TUNNEL).status_code == 403
    assert post_frame(client, headers=TUNNEL).status_code == 202


def test_oversized_and_undecodable_frames_are_rejected(client):
    big = client.post("/live/frame", headers=TUNNEL, data={"key": app_module.LIVE_KEY},
                      files={"image": ("f.jpg", b"0" * (app_module.MAX_LIVE_UPLOAD + 10), "image/jpeg")})
    assert big.status_code == 413
    junk = client.post("/live/frame", headers=TUNNEL, data={"key": app_module.LIVE_KEY},
                       files={"image": ("f.jpg", b"not a jpeg", "image/jpeg")})
    assert junk.status_code == 400


def test_camera_id_is_cleaned_before_it_becomes_a_log_file_name(client):
    assert post_frame(client, camera="../../etc/passwd").status_code == 202
    assert list(app_module._live_sessions) == ["etcpasswd"]


# ---- the whole path

def test_phone_frames_become_public_counts_and_a_log(client, tmp_path):
    r = client.post("/live/config", json={"line": [[0, 150], [320, 150]], "in_point": [160, 40]})
    assert r.status_code == 200 and r.json()["line"]["p1"] == [0.0, 150.0]

    for i in range(1, 8):
        assert post_frame(client, headers=TUNNEL).status_code == 202
        wait_processed(client, i)

    s = client.get("/live/state", headers=TUNNEL).json()
    assert s["online"] is True
    assert s["counts"] == {"in": 1, "out": 0, "inside": 1}
    assert [e["type"] for e in s["events"]] == ["in"]
    assert s["line_set"] is True and s["frame_size"] == [320, 240]

    img = client.get("/live/frame.jpg", headers=TUNNEL)
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert img.headers["cache-control"] == "no-store"

    logs = list((tmp_path / "live_logs").glob("phone-1-*.jsonl"))
    assert len(logs) == 1 and '"type": "in"' in logs[0].read_text()

    assert client.post("/live/reset", json={}).status_code == 200
    s = client.get("/live/state").json()
    assert s["counts"] == {"in": 0, "out": 0, "inside": 0} and s["events"] == []


# ---- plates: local only, and read sparingly

def test_plate_text_is_local_only(client, monkeypatch):
    def with_plates(frame, session):
        return {"tracked": [T(1, 100, 60, 180, 140)], "summary": {}, "bays": {}, "bay_events": [],
                "annotated": frame, "plates": [{"track_id": 1, "plate": "MH12AB1234",
                                                "box": (100, 60, 180, 140)}]}
    monkeypatch.setattr(app_module, "_live_process", with_plates)
    assert post_frame(client).status_code == 202
    wait_processed(client, 1)

    assert client.get("/live/plates").json()["plates"] == [
        {"track_id": 1, "plate": "MH12AB1234", "valid": True}]
    assert client.get("/live/plates", headers=TUNNEL).status_code == 403

    local = client.get("/live/frame.jpg?plates=1").content
    public = client.get("/live/frame.jpg").content
    via_tunnel = client.get("/live/frame.jpg?plates=1", headers=TUNNEL).content
    assert local != public                    # the local picture carries the label
    assert via_tunnel == public               # asking for it through the tunnel changes nothing
    assert b"MH12AB1234" not in client.get("/live/state", headers=TUNNEL).content


@dataclass
class V:
    track_id: int
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float = 0.9
    plate: str = ""


class FakeJoint:
    def __init__(self, vehicle_plates):
        self.vehicle_plates = vehicle_plates


@pytest.fixture
def plate_rig(monkeypatch, tmp_path):
    """_live_process with a scripted tracker and detector, so plate scheduling can be checked."""
    state = {"vehicles": [], "calls": [], "answer": {}}

    class FakeMOT:
        def __init__(self, model): pass
        def track_frame(self, frame, conf=0.1, imgsz=640): return state["vehicles"]

    class FakeDet:
        model = object()
        ocr_kind = "easyocr"
        def detect_joint(self, frame, conf, imgsz, skip_vehicle_detection, vehicle_boxes):
            state["calls"].append((imgsz, len(vehicle_boxes), [b[0] for b in vehicle_boxes]))
            return FakeJoint({i: state["answer"].get(b[0], "") for i, b in enumerate(vehicle_boxes)})

    monkeypatch.setattr(app_module, "VehicleMOTTracker", FakeMOT)
    monkeypatch.setattr(app_module, "get_detector", lambda: FakeDet())
    monkeypatch.setattr(app_module, "_mot_trackers", {})
    monkeypatch.setattr(app_module, "_bay_maps", {})
    from live import LiveSession
    session = LiveSession("rig", app_module._live_process, tmp_path)
    frame = np.zeros((240, 320, 3), np.uint8)
    return state, session, frame


def test_plates_are_read_for_the_biggest_few_vehicles_at_high_resolution(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    # five cars, x1 doubles as the size marker: the larger the box, the closer the car
    state["vehicles"] = [V(i, 10 * i, 10, 10 * i + 20 * i, 10 + 20 * i) for i in range(1, 6)]
    state["answer"] = {10 * i: f"MH12AB100{i}" for i in range(1, 6)}
    out = app_module._live_process(frame, session)
    imgsz, n, xs = state["calls"][0]
    assert imgsz == app_module.PLATE_IMGSZ >= 1280
    assert n == app_module.PLATE_BATCH == 3
    assert sorted(v.track_id for v in state["vehicles"] if v.plate) == [3, 4, 5]
    assert {p["plate"] for p in out["plates"]} == {"MH12AB1003", "MH12AB1004", "MH12AB1005"}
    assert all(p["valid"] for p in out["plates"])


def test_a_garbled_read_is_a_guess_not_a_plate(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    state["vehicles"] = [V(1, 0, 0, 100, 100)]
    state["answer"] = {0: "17907ABFS8Q"}               # eleven characters: not an Indian plate
    out = app_module._live_process(frame, session)
    assert state["vehicles"][0].plate == ""            # never promoted to the vehicle's plate
    assert [(p["plate"], p["valid"]) for p in out["plates"]] == [("17907ABFS8Q", False)]
    # ...and it is retried, then replaced when a clean read arrives
    state["answer"] = {0: "MH12AB1234"}
    out = app_module._live_process(frame, session)
    assert state["vehicles"][0].plate == "MH12AB1234"
    assert [(p["plate"], p["valid"]) for p in out["plates"]] == [("MH12AB1234", True)]


def test_a_vehicle_that_already_has_a_plate_is_not_read_again(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    state["vehicles"] = [V(1, 0, 0, 100, 100, plate="KA01AB1234")]
    app_module._live_process(frame, session)
    assert state["calls"] == []


def test_plate_reading_is_throttled(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 60.0)
    state["vehicles"] = [V(1, 0, 0, 100, 100)]
    app_module._live_process(frame, session)
    app_module._live_process(frame, session)
    assert len(state["calls"]) == 1


def test_a_track_whose_plate_never_reads_is_given_up_on(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    state["vehicles"] = [V(1, 0, 0, 100, 100)]            # the OCR never answers
    for _ in range(app_module.PLATE_MAX_TRIES + 4):
        app_module._live_process(frame, session)
    assert len(state["calls"]) == app_module.PLATE_MAX_TRIES


def test_no_plate_work_is_done_when_the_server_has_no_ocr(plate_rig, monkeypatch):
    # ANPR_OCR=none (small servers): the expensive plate pass would find nothing, so it must not run
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    monkeypatch.setattr(type(app_module.get_detector()), "ocr_kind", "none")   # get_detector() returns a new fake each call
    state["vehicles"] = [V(1, 0, 0, 100, 100)]
    out = app_module._live_process(frame, session)
    assert state["calls"] == [] and out["plates"] == []


def test_plate_reading_can_be_switched_off(plate_rig, monkeypatch):
    state, session, frame = plate_rig
    monkeypatch.setattr(app_module, "PLATE_EVERY_S", 0.0)
    session.read_plates = False
    state["vehicles"] = [V(1, 0, 0, 100, 100)]
    app_module._live_process(frame, session)
    assert state["calls"] == []


# ---- raw JPEG upload (ESP32-CAM) and other devices on the LAN

def post_raw(c, body=None, key=None, header=True, camera="gate-1", headers=None):
    key = app_module.LIVE_KEY if key is None else key
    h = {"Content-Type": "image/jpeg", **(headers or {})}
    url = f"/live/frame-raw?camera_id={camera}"
    if header:
        h["X-Camera-Key"] = key
    else:
        url += f"&key={key}"
    return c.post(url, content=jpeg() if body is None else body, headers=h)


def test_a_bare_jpeg_with_the_key_in_a_header_is_accepted(client):
    r = post_raw(client)
    assert r.status_code == 202
    wait_processed(client, 1, camera="gate-1")
    s = client.get("/live/state?camera_id=gate-1").json()
    assert s["online"] and s["frame_size"] == [320, 240]


def test_the_key_may_also_be_in_the_query_string(client):
    assert post_raw(client, header=False).status_code == 202


def test_raw_upload_needs_the_right_key(client):
    assert post_raw(client, key="wrong").status_code == 403
    assert post_raw(client, key="").status_code == 403
    assert client.post("/live/frame-raw", content=jpeg(), headers={"Content-Type": "image/jpeg"}).status_code == 403


def test_raw_upload_rejects_oversized_and_undecodable_bodies(client):
    big = b"0" * (app_module.MAX_LIVE_UPLOAD + 10)
    assert post_raw(client, body=big).status_code == 413
    assert post_raw(client, body=b"not a jpeg").status_code == 400
    assert post_raw(client, body=b"").status_code == 400


def test_raw_upload_cleans_the_camera_id(client):
    assert post_raw(client, camera="../../x").status_code == 202
    assert list(app_module._live_sessions) == ["x"]


LAN = ("192.168.1.50", 50000)        # an ESP32-CAM or another computer on the same network


@pytest.fixture
def lan(client):
    return TestClient(app_module.app, client=LAN)


def test_a_device_on_the_lan_can_post_frames_and_view_but_nothing_else(client, lan):
    assert post_raw(lan).status_code == 202                       # the ESP32's job
    wait_processed(client, 1, camera="gate-1")
    assert lan.get("/live/state?camera_id=gate-1").status_code == 200
    assert lan.get("/live").status_code == 200

    for method, path in (("get", "/live/setup"), ("get", "/occupancy/bays?camera_id=gate-1"),
                         ("post", "/occupancy/bays"), ("post", "/live/config"), ("post", "/live/reset"),
                         ("get", "/optimizer/projects"), ("post", "/optimizer/site"),
                         ("get", "/live/plates"), ("get", "/health"), ("get", "/occupancy"), ("get", "/tools/plate-test"),
                         ("get", "/console/api/cameras")):
        assert getattr(lan, method)(path).status_code == 403, path
    assert lan.get("/", follow_redirects=False).headers["location"] == "/live"          # the front door only points at /live


def test_the_camera_key_never_reaches_a_lan_device(client, lan):
    body = lan.get("/live/setup")
    assert body.status_code == 403 and app_module.LIVE_KEY not in body.text
    assert lan.get("/live/frame.jpg?camera_id=gate-1&raw=1").status_code in (403, 404)


def test_a_lan_device_cannot_see_plate_text(client, lan):
    def with_plates(frame, session):
        return {"tracked": [T(1, 100, 60, 180, 140)], "summary": {}, "bays": {}, "bay_events": [],
                "annotated": frame, "plates": [{"track_id": 1, "plate": "MH12AB1234", "valid": True,
                                                "box": (100, 60, 180, 140)}]}
    app_module._live_sessions.clear()
    old = app_module._live_process
    app_module._live_process = with_plates
    try:
        assert post_raw(client).status_code == 202
        wait_processed(client, 1, camera="gate-1")
        assert client.get("/live/frame.jpg?camera_id=gate-1&plates=1").content != \
            lan.get("/live/frame.jpg?camera_id=gate-1&plates=1").content
        assert lan.get("/live/plates").status_code == 403
    finally:
        app_module._live_process = old


def test_the_public_state_carries_the_bay_layout_for_the_map(client, monkeypatch):
    layout = {"size": [320, 240], "bays": {"1": [[10, 10], [60, 10], [60, 80], [10, 80]]}}

    def with_layout(frame, session):
        return {"tracked": [], "summary": {"total": 1, "free": 1, "occupied": 0},
                "bays": {"1": "free"}, "bay_events": [], "annotated": frame, "layout": layout,
                "plates": [{"track_id": 1, "plate": "MH12AB1234", "valid": True, "box": (1, 1, 2, 2)}]}
    monkeypatch.setattr(app_module, "_live_process", with_layout)
    assert post_frame(client).status_code == 202
    wait_processed(client, 1)
    s = client.get("/live/state", headers=TUNNEL).json()
    assert s["layout"] == layout and s["bays"] == {"1": {"state": "free"}}
    assert "MH12AB1234" not in client.get("/live/state", headers=TUNNEL).text        # plates still never public


def test_the_state_has_no_layout_before_any_frame_and_without_bays(client):
    assert client.get("/live/state", headers=TUNNEL).json().get("layout") is None
    assert post_frame(client).status_code == 202                                     # the fake process draws no bays
    wait_processed(client, 1)
    assert client.get("/live/state", headers=TUNNEL).json()["layout"] is None


def test_one_shot_endpoints_refuse_while_a_live_feed_is_running(client):
    assert post_frame(client).status_code == 202
    wait_processed(client, 1)
    r = client.post("/occupancy/check", files={"image": ("f.jpg", jpeg(), "image/jpeg")},
                    data={"camera_id": "x"})
    assert r.status_code == 409
    assert client.post("/occupancy/auto-bays",
                       files={"image": ("f.jpg", jpeg(), "image/jpeg")}).status_code == 409
