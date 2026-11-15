"""
The bays are drawn on one picture size.  A phone that switches lens, resolution or orientation sends another size: the bays were then
laid on the wrong pixels without a word.  Same shape at another scale is resized to the layout's size; another shape makes every bay
"unclear" and makes no bay event.
"""
import sys
import time
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import live as live_module  # noqa: E402
import status as st  # noqa: E402
from live import LiveSession  # noqa: E402

BAYS = {"Bay-01": [[100, 400], [300, 400], [320, 600], [80, 600]], "Bay-02": [[300, 400], [500, 400], [520, 600], [320, 600]]}


@pytest.fixture
def cam(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    app_module._install_bays("size-cam", BAYS, "oblique", image_size=(1280, 720))
    yield "size-cam"
    app_module._layout_sizes.pop("size-cam", None)


def frame(w, h):
    return np.full((h, w, 3), 120, np.uint8)


def test_the_size_the_bays_were_drawn_on_is_remembered(cam):
    assert app_module._layout_sizes[cam] == (1280, 720)


def test_a_picture_of_the_same_size_is_left_alone(cam):
    f = frame(1280, 720)
    out, how = app_module._fit_frame_to_layout(cam, f)
    assert how == "ok" and out is f


def test_the_same_view_at_another_scale_is_resized_to_the_layouts_size(cam):
    out, how = app_module._fit_frame_to_layout(cam, frame(1920, 1080))
    assert how == "scaled" and out.shape[:2] == (720, 1280)
    out, how = app_module._fit_frame_to_layout(cam, frame(640, 360))
    assert how == "scaled" and out.shape[:2] == (720, 1280)


def test_another_shape_is_a_mismatch_not_a_guess(cam):
    for w, h in ((1280, 960), (720, 1280), (1280, 1280)):
        out, how = app_module._fit_frame_to_layout(cam, frame(w, h))
        assert how == "mismatch" and out.shape[:2] == (h, w)


def test_a_camera_with_no_size_on_record_is_not_checked():
    out, how = app_module._fit_frame_to_layout("unknown-cam", frame(333, 777))
    assert how == "ok"


def test_re_drawing_the_bays_on_a_new_size_makes_that_size_the_right_one(cam):
    bays = {"Bay-01": [[100, 300], [300, 300], [320, 500], [80, 500]]}
    app_module._install_bays(cam, bays, "oblique", image_size=(1280, 960))
    assert app_module._layout_sizes[cam] == (1280, 960)
    assert app_module._fit_frame_to_layout(cam, frame(1280, 960))[1] == "ok"
    assert app_module._fit_frame_to_layout(cam, frame(1280, 720))[1] == "mismatch"


def test_after_a_restart_the_saved_size_is_the_one_checked(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    app_module._install_bays("restart-cam", BAYS, "oblique", restoring=True, image_size=[1280, 720])
    try:
        assert app_module._layout_sizes["restart-cam"] == (1280, 720)
    finally:
        app_module._layout_sizes.pop("restart-cam", None)


class FakeTV:
    def __init__(self):
        self.track_id, self.x1, self.y1, self.x2, self.y2, self.confidence, self.plate = 1, 120, 420, 280, 560, 0.9, None


def test_a_mismatched_picture_makes_every_bay_unclear_and_no_bay_event(cam, monkeypatch, tmp_path):
    class Mot:
        def track_frame(self, frame, conf, imgsz):
            return [FakeTV()]
    monkeypatch.setitem(app_module._mot_trackers, cam, Mot())
    monkeypatch.setattr(app_module, "get_detector", lambda: type("D", (), {"model": None, "ocr_kind": "none"})())
    sess = LiveSession(cam, app_module._live_process, tmp_path)
    out = app_module._live_process(frame(1280, 960), sess)
    assert out["calibration"] == "moved" and out["bay_events"] == []
    assert out["move_check"]["resized"] == [1280, 960] and out["move_check"]["layout"] == [1280, 720]
    answers = st.compose_bays(out["bay_details"], moved=True)
    assert {a["status"] for a in answers.values()} == {st.UNCERTAIN}
    assert {a["reason"] for a in answers.values()} == {"camera_moved"}


def test_the_event_says_the_picture_changed_size(tmp_path):
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    s.last_frame_at = time.time()
    out = {"tracked": [], "summary": {}, "bays": {"1": "free"}, "bay_events": [], "light": "ok", "calibration": "moved",
           "bay_details": {"1": {"state": "free", "since": None, "seen_vehicle": False}},
           "move_check": {"moved": True, "resized": [1280, 960], "layout": [1280, 720]},
           "annotated": np.full((60, 80, 3), 120, np.uint8)}
    s._finish(np.full((60, 80, 3), 120, np.uint8), out, time.time())
    (ev,) = [e for e in s.snapshot()["events"] if e["type"] == "camera_moved"]
    assert "1280x960" in ev["detail"] and "1280x720" in ev["detail"]


def test_a_resized_frame_reports_its_own_pixel_space_to_the_hooks(tmp_path):
    got = []
    s = LiveSession("c", lambda f, o: {}, tmp_path)
    s.on_event = lambda ev, img, layout: got.append(ev)
    s.last_frame_at = time.time()
    out = {"tracked": [FakeTV()], "summary": {}, "bays": {"1": "occupied"}, "light": "ok", "calibration": "ok",
           "bay_details": {"1": {"state": "occupied", "since": time.time(), "seen_vehicle": True}},
           "bay_events": [{"event": "bay_occupied", "bay_id": "1", "track_id": 1, "previous": "free"}],
           "frame_size": [1280, 720], "annotated": np.full((60, 80, 3), 120, np.uint8)}
    s._finish(np.full((540, 960, 3), 120, np.uint8), out, time.time())              # the phone sent 960x540; the boxes are in 1280x720
    (ev,) = [e for e in got if e["type"] == "bay_occupied"]
    assert ev["frame_size"] == [1280, 720]
