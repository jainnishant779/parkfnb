"""
The camera-moved check compares the live picture with a small reference taken when the bays were saved.  On the live server
(27 Oct) it said "moved" for hours while the picture matched the reference to within 0.2%: cv2.phaseCorrelate (OpenCV 5)
multiplies its first argument by the window in place, so every check, one every 30 s, faded the stored reference a little
more.  After a few dozen checks the match score sank under MIN_RESPONSE and the verdict froze, whatever the camera did.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

cv2 = pytest.importorskip("cv2")
from status import MoveDetector  # noqa: E402


def scene(dx=0, dy=0, w=640, h=360, seed=3):
    """A textured picture (buildings, a wall, a road) shifted by (dx, dy) pixels."""
    rng = np.random.default_rng(seed)
    big = cv2.GaussianBlur(rng.integers(0, 255, (h + 160, w + 160), dtype=np.uint8), (0, 0), 3)
    for i in range(14):
        x, y = int(rng.integers(20, w)), int(rng.integers(20, h))
        cv2.rectangle(big, (x, y), (x + int(rng.integers(20, 90)), y + int(rng.integers(20, 70))), int(rng.integers(0, 255)), -1)
    img = big[80 - dy:80 - dy + h, 80 - dx:80 - dx + w]
    return cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_GRAY2BGR)


def detector():
    d = MoveDetector()
    d.set_reference(scene())
    return d


def test_a_check_leaves_the_reference_and_the_window_as_they_were():
    d = detector()
    ref, win = d._ref.copy(), d._win.copy()
    for _ in range(5):
        d.check(scene())
    assert np.array_equal(ref, d._ref) and np.array_equal(win, d._win)


def test_the_match_score_does_not_decay_over_many_checks():
    d = detector()
    d.check(scene())
    first = d.last_response
    for _ in range(300):                                   # 300 checks = 2.5 hours at one per 30 s
        d.check(scene())
    assert d.last_response == pytest.approx(first, abs=0.01)
    assert d.last_response > 2 * MoveDetector.MIN_RESPONSE
    assert not d.moved


def test_a_camera_that_stays_put_never_reads_as_moved_however_long_it_runs():
    d = detector()
    for i in range(400):
        d.check(scene())
        assert not d.moved, f"moved at check {i}"


def test_a_real_shift_is_flagged_after_two_checks_and_cleared_after_two_when_it_comes_back():
    d = detector()
    for _ in range(40):                                    # a long quiet spell first: this is what used to wear the reference out
        d.check(scene())
    shifted = scene(dx=45)                                 # 7% of the width
    d.check(shifted)
    assert not d.moved                                     # one reading is not enough
    d.check(shifted)
    assert d.moved
    for _ in range(60):                                    # still moved: no drift towards "ok" by itself
        d.check(shifted)
    assert d.moved and d.last_response >= MoveDetector.MIN_RESPONSE
    d.check(scene())
    assert d.moved
    d.check(scene())
    assert not d.moved                                     # back in place: the layout is trusted again


def test_an_unrelated_picture_is_not_taken_for_a_moved_camera_however_often_it_is_checked():
    d = detector()
    other = scene(seed=99)                                 # scores about 0.13 against the reference: under the bar
    for _ in range(10):
        d.check(other)
    assert not d.moved


def test_report_says_what_the_last_check_saw():
    d = detector()
    assert d.report()["shift_pct"] is None and d.report()["checks"] == 0
    d.check(scene(dx=10))
    r = d.report()
    assert r["checks"] == 1 and r["shift_pct"] == pytest.approx(10 / 640 * 100, abs=0.5) and r["limit_pct"] == 3.0
    assert r["response"] >= MoveDetector.MIN_RESPONSE and r["checked_s_ago"] is not None and r["checked_s_ago"] < 5
    assert r["moved"] is False
