"""
Segmenter behaviour with a fake model: matching, throttling, OOM cooldown, and
never downloading weights.  No real model needed.
"""
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import segmenter as seg_mod  # noqa: E402
from occupancy import Detection  # noqa: E402
from segmenter import Segmenter, Silhouette, attach_silhouettes  # noqa: E402


def _rect(x1, y1, x2, y2):
    return np.array([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], dtype=np.float64)


def _sil(x1, y1, x2, y2):
    return Silhouette((x1, y1, x2, y2), 0.9, _rect(x1, y1, x2, y2))


# --- matching ------------------------------------------------------------------

def test_each_detection_gets_its_own_silhouette():
    a = Detection(0, 0, 100, 100, 0.9)
    b = Detection(200, 0, 300, 100, 0.9)
    n = attach_silhouettes([a, b], [_sil(205, 5, 295, 95), _sil(5, 5, 95, 95)])
    assert n == 2
    assert a.contact_shape[:, 0].max() <= 100
    assert b.contact_shape[:, 0].min() >= 200
    assert a.contact_source == b.contact_source == "mask"


def test_mask_spanning_two_cars_goes_to_neither():
    a = Detection(0, 0, 100, 100, 0.9)
    b = Detection(100, 0, 200, 100, 0.9)
    assert attach_silhouettes([a, b], [_sil(0, 0, 200, 100)]) == 0
    assert getattr(a, "contact_shape", None) is None
    assert getattr(b, "contact_shape", None) is None


def test_poorly_overlapping_mask_is_rejected():
    a = Detection(0, 0, 100, 100, 0.9)
    assert attach_silhouettes([a], [_sil(60, 60, 160, 160)]) == 0


def test_stale_silhouette_is_cleared_when_no_longer_matched():
    """A tracked car keeps its object across frames; last frame's mask must not stick."""
    a = Detection(0, 0, 100, 100, 0.9)
    attach_silhouettes([a], [_sil(5, 5, 95, 95)])
    assert a.contact_shape is not None
    attach_silhouettes([a], [])
    assert a.contact_shape is None and a.contact_source is None


def test_one_silhouette_one_detection():
    a = Detection(0, 0, 100, 100, 0.9)
    b = Detection(2, 2, 102, 102, 0.9)          # duplicate detection of the same car
    assert attach_silhouettes([a, b], [_sil(1, 1, 101, 101)]) == 1


# --- model handling ------------------------------------------------------------

class _FakeModel:
    def __init__(self, fail=None):
        self.calls = 0
        self.fail = fail

    def predict(self, frame, **kw):
        self.calls += 1
        if self.fail:
            raise self.fail
        boxes = [SimpleNamespace(xyxy=[SimpleNamespace(tolist=lambda: [10.0, 10.0, 90.0, 90.0])],
                                 conf=[0.9])]
        return [SimpleNamespace(boxes=boxes, masks=SimpleNamespace(xy=[_rect(12, 12, 88, 88)]))]


def _segmenter(tmp_path, model):
    weights = tmp_path / "fake-seg.pt"
    weights.write_bytes(b"x")
    s = Segmenter(weights=weights, interval_s=100.0, enabled="1")
    s._model = model
    return s


def test_missing_weights_disable_without_downloading(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("must not construct a model (would trigger a download)")
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=boom))
    s = Segmenter(weights=tmp_path / "absent.pt", enabled="auto")
    assert not s.available
    assert s.segment(np.zeros((10, 10, 3), np.uint8)) == []


def test_results_are_in_frame_pixels(tmp_path):
    s = _segmenter(tmp_path, _FakeModel())
    out = s.segment(np.zeros((100, 100, 3), np.uint8))
    assert len(out) == 1
    assert out[0].outline.shape == (4, 2)
    assert out[0].box == (10.0, 10.0, 90.0, 90.0)


def test_throttled_per_camera(tmp_path):
    model = _FakeModel()
    s = _segmenter(tmp_path, model)
    frame = np.zeros((100, 100, 3), np.uint8)
    s.segment(frame, "cam-a")
    s.segment(frame, "cam-a")
    assert model.calls == 1, "second call within the interval must reuse the cache"
    s.segment(frame, "cam-b")
    assert model.calls == 2, "cameras are cached independently"


@pytest.mark.parametrize("err", [MemoryError("oom"), RuntimeError("DefaultCPUAllocator: not enough memory")])
def test_out_of_memory_backs_off(tmp_path, err):
    s = _segmenter(tmp_path, _FakeModel(fail=err))
    assert s.segment(np.zeros((10, 10, 3), np.uint8)) == []
    assert not s.available, "must stay off for the cooldown"
    assert "memory" in s.last_error.lower() or "oom" in s.last_error.lower()


def test_attach_end_to_end(tmp_path):
    s = _segmenter(tmp_path, _FakeModel())
    d = Detection(8, 8, 92, 92, 0.9)
    assert s.attach(np.zeros((100, 100, 3), np.uint8), [d]) == 1
    assert d.contact_source == "mask"
