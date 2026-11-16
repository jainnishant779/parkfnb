"""
ultralytics keeps one set of ByteTrack trackers on the model's predictor.  Two cameras sharing the model (the gate phone is planned) -- or
a re-marked layout -- would share them too: track ids and associations carried from one scene into the other.  Found 30 Oct when one test's
scene changed the next test's answer.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import tracker as T  # noqa: E402


class FakeTracker:
    def __init__(self):
        self.calls = 0


class FakePredictor:
    pass


class FakeModel:
    """Like YOLO.track(persist=True): the predictor and its trackers appear on the first call, and are reused after."""
    def __init__(self):
        self.predictor = None
        self.seen = []

    def track(self, **kw):
        if self.predictor is None:
            self.predictor = FakePredictor()
        if not hasattr(self.predictor, "trackers"):
            self.predictor.trackers = [FakeTracker()]
        self.predictor.trackers[0].calls += 1
        self.seen.append((id(self.predictor.trackers[0]), self.predictor.trackers[0].calls))
        return []


def run(mot, n=1):
    for _ in range(n):
        mot.track_frame(np.zeros((72, 128, 3), np.uint8))


def test_two_cameras_on_one_model_each_keep_their_own_trackers():
    model = FakeModel()
    a, b = T.VehicleMOTTracker(model), T.VehicleMOTTracker(model)
    run(a, 3)
    run(b, 2)                                   # a second camera starts clean, not on camera A's tracker
    run(a, 1)                                   # and A carries on from where it was
    ids = [i for i, _ in model.seen]
    counts = [c for _, c in model.seen]
    assert len(set(ids)) == 2 and counts == [1, 2, 3, 1, 2, 4]


def test_a_reset_gives_a_fresh_tracker_and_leaves_the_other_camera_alone():
    model = FakeModel()
    a, b = T.VehicleMOTTracker(model), T.VehicleMOTTracker(model)
    run(a, 2)
    run(b, 2)
    a.reset()
    run(a, 1)
    run(b, 1)
    assert [c for _, c in model.seen] == [1, 2, 1, 2, 1, 3]


def test_a_model_that_has_no_predictor_yet_is_fine():
    model = FakeModel()
    mot = T.VehicleMOTTracker(model)
    assert model.predictor is None
    run(mot, 1)
    assert model.predictor is not None