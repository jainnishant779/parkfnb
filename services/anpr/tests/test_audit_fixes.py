"""
Defects found by the audit of 29 Oct, each with the test that would have caught it.  (The overstay clock, the torn register, the
re-marked bay, the typed plate, the counter and the stays have their tests beside the code they belong to.)
"""
import sys
import threading
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402
import bay_validation as bv  # noqa: E402


# ---- an upload that says it is enormous

def jpeg(w, h):
    img = np.full((8, 8, 3), 120, np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    raw = bytearray(buf.tobytes())
    i = raw.index(b"\xff\xc0") + 5                                  # the frame header: height, width
    raw[i:i + 2], raw[i + 2:i + 4] = h.to_bytes(2, "big"), w.to_bytes(2, "big")
    return bytes(raw)


def test_the_size_in_a_jpeg_header_is_read_without_decoding_it():
    ok, buf = cv2.imencode(".jpg", np.zeros((30, 50, 3), np.uint8))
    assert app_module._image_size(buf.tobytes()) == (50, 30)
    ok, png = cv2.imencode(".png", np.zeros((30, 50, 3), np.uint8))
    assert app_module._image_size(png.tobytes()) == (50, 30)
    assert app_module._image_size(b"not an image") is None and app_module._image_size(b"") is None


def test_a_tiny_file_that_claims_to_be_a_giant_picture_is_refused_before_it_is_decoded():
    # 689 bytes that said 14000 x 14000 decoded to 588 MB on the 2 GB server
    assert app_module._decode(jpeg(14000, 14000)) is None
    assert app_module._decode(jpeg(30000, 30000)) is None
    ok, real = cv2.imencode(".jpg", np.full((720, 1280, 3), 90, np.uint8))
    assert app_module._decode(real.tobytes()).shape == (720, 1280, 3)        # a real picture still decodes


# ---- bay names

def square(x=0):
    return [[x, 0], [x + 100, 0], [x + 100, 100], [x, 100]]


def test_a_bay_name_may_only_be_plain_because_it_ends_up_in_file_names_and_addresses():
    for bad in ("A/1", "../x", "Bay 4", "P#3", "bäy", "a\\b"):
        errors, _ = bv.validate_bays({bad: square()}, (1280, 720))
        assert any("may only use" in e for e in errors), bad
    errors, _ = bv.validate_bays({"Bay-01": square(), "P_2": square(150), "7": square(300)}, (1280, 720))
    assert not [e for e in errors if "may only use" in e]


# ---- one register object per file

def test_two_threads_asking_for_the_first_book_of_a_camera_get_the_same_one(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_books", {})
    monkeypatch.setattr(app_module, "_arrival_books", {})
    got, gate = [], threading.Barrier(8)

    def ask():
        gate.wait()
        got.append((id(app_module._violation_book("c")), id(app_module._arrival_book("c"))))

    threads = [threading.Thread(target=ask) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len(set(got)) == 1


# ---- a re-marked layout forgets the fitted boxes

def test_re_marking_the_bays_drops_the_fitted_boxes_of_the_old_frame(monkeypatch):
    monkeypatch.setitem(app_module._fit_caches, "cam-x", object())
    app_module._layout_changed("cam-x")
    assert "cam-x" not in app_module._fit_caches


def test_a_hook_that_fails_is_counted_and_logged_not_swallowed(tmp_path, capsys):
    import time
    import numpy as np
    import live as live_module
    s = live_module.LiveSession("c", lambda f, o: {}, tmp_path)
    s.on_minute = lambda slots, now: 1 / 0
    s._details = {"1": {"state": "free", "since": time.time() - 60, "seen_vehicle": False}}
    s._last_sample = 0.0
    s.last_frame_at = time.time()
    out = {"tracked": [], "summary": {}, "bays": {"1": "free"}, "bay_details": s._details, "bay_events": [],
           "annotated": np.full((60, 80, 3), 120, np.uint8), "light": "ok", "calibration": "ok"}
    s._finish(np.full((60, 80, 3), 120, np.uint8), out, time.time())
    assert s.hook_errors["on_minute"]["count"] == 1 and "ZeroDivisionError" in capsys.readouterr().out
