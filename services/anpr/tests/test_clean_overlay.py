"""
The picture visitors see: bay outlines only, a dark night picture lifted, and the technical
picture (boxes, track numbers) kept for the operator.
"""
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
from live import annotate_clean, bay_label, enhance_for_display  # noqa: E402

BAYS = {"1": [[40, 120], [140, 120], [150, 220], [30, 220]],
        "2": [[160, 120], [260, 120], [270, 220], [150, 220]]}


def bright(w=320, h=240, v=150):
    return np.full((h, w, 3), v, np.uint8)


# ---- night picture

def test_a_dark_picture_is_lifted_to_something_visible():
    dark = bright(v=18)
    out = enhance_for_display(dark)
    assert out.shape == dark.shape and out.dtype == np.uint8
    assert 60 < out.mean() < 170                       # visibly brighter, not blown out
    assert dark.mean() == 18                           # the input is left alone


def test_a_bright_picture_is_returned_untouched():
    day = bright(v=140)
    assert np.array_equal(enhance_for_display(day), day)


def test_the_lift_is_monotonic_so_a_darker_scene_stays_darker():
    a, b = enhance_for_display(bright(v=15)).mean(), enhance_for_display(bright(v=45)).mean()
    assert a < b


# ---- the clean overlay

def test_the_overlay_changes_only_the_bays_and_their_labels():
    frame = bright()
    out = annotate_clean(frame, BAYS, {"1": "free", "2": "occupied"})
    assert out.shape == frame.shape and np.array_equal(frame, bright())        # input untouched
    assert np.array_equal(out[0:60, :], frame[0:60, :])                        # far from any bay: identical
    assert not np.array_equal(out[120:220, 40:260], frame[120:220, 40:260])    # bays are drawn


def test_free_and_occupied_bays_get_different_colours():
    frame = bright()
    out = annotate_clean(frame, BAYS, {"1": "free", "2": "occupied"})
    free_px, taken_px = out[190, 90].astype(int), out[190, 210].astype(int)    # inside each bay, away from the label
    assert free_px[1] > free_px[2] and taken_px[2] > taken_px[1]               # green-ish vs red-ish (BGR)


LEANING = {"1": [[200, 150], [300, 150], [250, 100], [150, 100]],            # near edge at y=150, far edge at y=100, leaning left
           "2": [[300, 150], [400, 150], [350, 100], [250, 100]]}


PILL = (0.7 * np.array([40, 24, 12]) + 0.3 * 200).astype(int)             # the name pill, as blended onto a v=200 picture


def _pill_mask(img):
    return np.all(np.abs(img.astype(int) - PILL) < 10, axis=2)


def _pill_rows(img):
    """Rows holding the name pills (a dark brown that nothing else in these v=200 test pictures has)."""
    return np.where(_pill_mask(img).any(axis=1))[0]


def test_the_bay_name_sits_below_the_near_edge_not_on_the_top_corner_where_a_neighbours_car_would_be():
    frame = bright(w=640, h=240, v=200)
    out = annotate_clean(frame, LEANING, {"1": "free", "2": "free"})
    ys = _pill_rows(out)
    assert len(ys) and ys.min() >= 150, ys.min()                               # nothing above the near edge (y=150)
    # and it is centred on its own bay's near edge: bay 1's name is left of bay 2's
    xs1 = np.where(_pill_mask(out[150:200, 0:300]).any(axis=0))[0]            # the pill that belongs to bay 1 (near edge x 200-300)
    assert 200 <= xs1.mean() <= 300


def test_a_name_that_would_fall_off_the_bottom_stays_inside_the_picture():
    frame = bright(w=320, h=240, v=200)
    edge = {"1": [[100, 235], [200, 235], [180, 200], [120, 200]]}
    out = annotate_clean(frame, edge, {"1": "free"})
    assert len(_pill_rows(out)) and _pill_rows(out).max() < 240


def test_the_public_picture_has_no_gate_line_but_the_operators_still_has_it():
    from live import LineCounter, LiveSession
    frame = bright(w=320, h=240, v=100)
    counter = LineCounter((10, 120), (310, 120), (160, 20))
    public = LiveSession._draw_overlay(frame, counter, clean=True)
    operator = LiveSession._draw_overlay(frame, counter)
    assert np.array_equal(public, frame)                                       # nothing drawn for visitors
    assert not np.array_equal(operator, frame)                                 # the line, the IN arrow and the counts


def _changed(a, b, box, by=60):
    """Pixels in `box` that differ strongly from `b`: the outline (the faint tint stays under `by`)."""
    x1, y1, x2, y2 = box
    return int((np.abs(a[y1:y2, x1:x2].astype(int) - b[y1:y2, x1:x2].astype(int)).sum(axis=2) > by).sum())


def test_a_free_bay_is_outlined_with_dashes_and_a_taken_one_solid():
    frame = bright(w=640, h=240, v=200)
    box = {"1": [[100, 60], [300, 60], [300, 140], [100, 140]]}
    free = annotate_clean(frame, box, {"1": "free"})
    taken = annotate_clean(frame, box, {"1": "occupied"})
    edge = (100, 58, 300, 63)                                                   # the far edge, a straight line
    assert 0 < _changed(free, frame, edge) < 0.8 * _changed(taken, frame, edge)


def test_the_name_carries_an_icon_that_follows_the_verdict_and_free_bays_get_the_word_free():
    frame = bright(w=640, h=240, v=200)
    box = {"1": [[100, 60], [300, 60], [300, 140], [100, 140]]}
    plain = annotate_clean(frame, box, {"1": "occupied"})
    ok = annotate_clean(frame, box, {"1": "occupied"}, {"1": "ok"})
    bad = annotate_clean(frame, box, {"1": "occupied"}, {"1": "bad"})
    free = annotate_clean(frame, box, {"1": "free"})
    ys = _pill_rows(ok)
    assert len(ys) and ys.min() >= 140                                          # still below the near edge
    green = lambda im: int(((im[..., 1] > 170) & (im[..., 0] < 130) & (im[..., 2] < 130)).sum())
    red = lambda im: int(((im[..., 2] > 200) & (im[..., 1] < 110) & (im[..., 0] < 110)).sum())
    assert green(ok) > green(plain) and red(bad) > red(plain)                   # a green tick vs a red mark
    assert _pill_mask(free).sum() > _pill_mask(plain).sum()                     # "P1 Free" is a longer pill than "P1"


def test_the_names_of_two_narrow_neighbouring_bays_do_not_cover_each_other():
    frame = bright(w=640, h=300, v=200)
    narrow = {"1": [[300, 100], [320, 100], [322, 160], [298, 160]], "2": [[322, 100], [342, 100], [344, 160], [320, 160]],
              "3": [[344, 100], [364, 100], [366, 160], [342, 160]]}
    out = annotate_clean(frame, narrow, {"1": "free", "2": "occupied", "3": "free"}, {"2": "ok"})
    mask = _pill_mask(out)
    rows = np.where(mask.any(axis=1))[0]
    bands, start = [], rows[0]
    for a, b in zip(rows, rows[1:]):                                            # separate bands of pill rows
        if b - a > 1:
            bands.append((start, a)); start = b
    bands.append((start, rows[-1]))
    assert len(bands) >= 2, bands                                                # the pills were stacked, not piled on one spot
    solo = annotate_clean(frame, {"1": narrow["1"]}, {"1": "free"})
    assert _pill_mask(out)[:, :].sum() > 2 * _pill_mask(solo).sum() * 0.9       # all three names are drawn in full, none hidden


def test_a_marked_name_stays_inside_the_picture_at_both_edges():
    frame = bright(w=320, h=240, v=200)
    edge = {"1": [[0, 200], [40, 200], [40, 238], [0, 238]], "2": [[285, 200], [319, 200], [319, 238], [285, 238]]}
    out = annotate_clean(frame, edge, {"1": "free", "2": "occupied"}, {"2": "bad"})
    assert out.shape == frame.shape and len(_pill_rows(out)) and _pill_rows(out).max() < 240


def test_the_public_picture_is_at_most_1600_wide_and_a_smaller_one_is_left_alone():
    from live import PUBLIC_MAX_WIDTH, public_size
    big = bright(w=1920, h=1080)
    small = bright(w=1280, h=720)
    out = public_size(big)
    assert out.shape[1] == PUBLIC_MAX_WIDTH == 1600 and out.shape[0] == 900
    assert public_size(small) is small


def test_only_a_car_close_to_a_line_or_over_it_gets_a_3d_box_and_a_tick_goes_on_the_correct_one():
    from types import SimpleNamespace as NS
    square = np.array([[10.0, 10.0], [20.0, 10.0], [20.0, 30.0], [10.0, 30.0]])
    cal = NS(camera=object(), project_stall=lambda bid, fp, h: square + h)
    rel = {"footprint_m": [[0, 0], [1.8, 0], [1.8, 4.4], [0, 4.4]]}
    states = {b: NS(bay_relation=rel) for b in "12345"}
    verdicts = {"1": "correct", "2": "close_to_line", "3": "over_line", "4": "not_judged"}
    answers = {b: {"status": "OCCUPIED", "parking": {"verdict": v}} for b, v in verdicts.items()}
    answers["5"] = {"status": "VACANT"}
    boxes = app_module._clean_boxes(cal, states, answers)
    assert sorted(b["bay"] for b in boxes) == ["2", "3"]
    marks = app_module._picture_marks(states, answers)
    assert marks == {"1": "ok", "2": "close", "3": "bad", "4": "taken"}         # a free bay has no icon
    assert app_module._picture_marks({"1": 0}, {"1": {"status": "UNCERTAIN"}}) == {"1": "unclear"}
    assert app_module._picture_marks({"1": 0}, {"1": {"status": "STALE"}}) == {"1": "unclear"}


def _solid_box(**kw):
    base = [[100, 200], [200, 200], [200, 150], [100, 150]]
    roof = [[100, 120], [200, 120], [200, 70], [100, 70]]
    return {"verdict": "correct", "base": base, "roof": roof, "faces": [True, True, False, False], **kw}


def test_a_fitted_box_tints_the_faces_turned_to_the_camera_and_leaves_the_far_ones():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=100)
    out = draw_clean_boxes(img, [_solid_box()])
    inside_front = out[175, 150].astype(int)                                         # inside the near face (base edge 0 -> 1)
    assert inside_front[1] > img[175, 150][1] + 4 and inside_front[2] < img[175, 150][2] - 3    # tinted green (BGR)
    assert np.array_equal(out[10:60, 10:300], img[10:60, 10:300])                    # nothing outside the box
    plain = draw_clean_boxes(img, [{**_solid_box(), "faces": [False] * 4}])
    assert (out[130:140, 120:180] != plain[130:140, 120:180]).any()                  # a visible face adds tint a hidden one does not


def test_the_roof_is_tinted_a_little_more_than_the_sides():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=100)
    out = draw_clean_boxes(img, [_solid_box()])
    roof_g, side_g = int(out[95, 150][1]) - 100, int(out[175, 150][1]) - 100
    assert roof_g > side_g > 0


def test_every_edge_has_a_dark_halo_so_it_stays_visible_on_a_white_car():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=240)                                                # a white car in the sun
    out = draw_clean_boxes(img, [_solid_box()])
    column = out[198:204, 150].astype(int).sum(axis=1)                              # across the near base edge (y=200)
    assert column.min() < 3 * 240 - 150                                              # the halo is far darker than the picture
    assert (np.abs(out[200, 150].astype(int) - np.array([94, 197, 34])).max() < 40)  # and the line itself keeps its colour


def test_an_estimated_box_is_blue_and_dashed_not_solid():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=100)
    solid = draw_clean_boxes(img, [_solid_box(verdict="estimated")])
    dashed = draw_clean_boxes(img, [_solid_box(verdict="estimated", estimated=True)])
    # along the roof's far edge: the columns where the dark halo of the line is (the tint of the faces is not dark)
    halo_columns = lambda o: int((o[66:75, 105:195].max(axis=2) < 85).any(axis=0).sum())
    assert 0 < halo_columns(dashed) < 0.8 * halo_columns(solid) and halo_columns(solid) > 80
    b, g, r = solid[120, 150].astype(int)                                            # the roof's near edge
    assert b > r + 60                                                                # blue (BGR)


def test_the_crossing_edge_is_thick_and_red_and_the_tag_says_how_far():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=100)
    plain = draw_clean_boxes(img, [_solid_box(verdict="over_line")])
    marked = draw_clean_boxes(img, [_solid_box(verdict="over_line", edge=1, label="45 cm over right")])
    assert (marked[160:190, 196:204].astype(int) != plain[160:190, 196:204].astype(int)).any()       # the right-hand base edge
    r_marked = marked[150:200, 198:202].astype(int)
    assert (r_marked[..., 2] > 200).any() and (r_marked[..., 0] < 120).any()                         # red
    assert not np.array_equal(marked[200:225, 100:260], plain[200:225, 100:260])                      # the tag, under the edge


def test_a_box_without_faces_is_still_drawn_as_the_older_thin_frame():
    from live import draw_clean_boxes
    img = bright(w=320, h=240, v=100)
    box = _solid_box()
    box.pop("faces")
    out = draw_clean_boxes(img, [box])
    assert not np.array_equal(out, img) and np.array_equal(out[175, 150], img[175, 150])             # edges only: no tint on the faces


def test_a_free_bay_blocked_by_a_car_across_it_shows_blocked_in_amber_and_a_taken_bay_has_a_thin_outline():
    frame = bright(w=640, h=240, v=200)
    box = {"1": [[100, 60], [300, 60], [300, 140], [100, 140]]}
    blocked = annotate_clean(frame, box, {"1": "blocked"}, {"1": "close"})
    free = annotate_clean(frame, box, {"1": "free"})
    taken = annotate_clean(frame, box, {"1": "occupied"})
    assert _pill_mask(blocked).sum() > _pill_mask(free).sum() * 0.9                  # "P1 Blocked" is as long a name as "P1 Free"
    amber = lambda im: int(((im[..., 2] > 200) & (im[..., 1] > 130) & (im[..., 1] < 190) & (im[..., 0] < 90)).sum())
    assert amber(blocked) > 300
    column = np.abs(taken[52:70, 200].astype(int) - frame[52:70, 200].astype(int)).sum(axis=1) > 60
    assert 0 < int(column.sum()) <= 3                                                # a 1 px line across the far edge under a car


def test_every_state_has_a_colour_and_unknown_ones_fall_back():
    for st in ("free", "occupied", "correct", "wrong", "suspicious", "occluded", "unknown", "something-new"):
        annotate_clean(bright(), BAYS, {"1": st, "2": st})                      # must not raise


def test_a_bay_label_reads_p_number_and_keeps_other_names():
    assert bay_label("3") == "P3" and bay_label("A-01") == "A-01"


def test_a_bay_at_the_edge_of_the_frame_does_not_crash():
    edge = {"1": [[0, 0], [60, 0], [60, 40], [0, 40]], "2": [[300, 200], [319, 200], [319, 239], [300, 239]]}
    out = annotate_clean(bright(), edge, {"1": "free", "2": "free"})
    assert out.shape == (240, 320, 3)


# ---- through the live feed

@dataclass
class T:
    track_id: int
    x1: float
    y1: float
    x2: float
    y2: float
    plate: str = ""
    confidence: float = 0.9


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def wait_done(c, n):
    import time
    end = time.time() + 5
    while time.time() < end:
        if c.get("/live/state").json().get("frames_processed", 0) >= n:
            return
        time.sleep(0.02)
    raise AssertionError("worker did not finish")


def jpeg_bytes(img):
    ok, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_visitors_get_the_clean_picture_and_the_operator_the_technical_one(client, monkeypatch):
    frame = bright(v=120)
    technical = frame.copy()
    cv2.rectangle(technical, (10, 10), (300, 230), (0, 255, 255), 6)           # stands in for the boxes
    clean = annotate_clean(frame, BAYS, {"1": "free", "2": "occupied"})

    def process(f, session):
        return {"tracked": [], "summary": {}, "bays": {}, "bay_events": [], "annotated": technical,
                "annotated_clean": clean, "plates": []}
    monkeypatch.setattr(app_module, "_live_process", process)

    r = client.post("/live/frame-raw?camera_id=phone-1", content=jpeg_bytes(frame),
                    headers={"X-Camera-Key": app_module.LIVE_KEY, "Content-Type": "image/jpeg"})
    assert r.status_code == 202
    wait_done(client, 1)

    def decode(b):
        return cv2.imdecode(np.frombuffer(b, np.uint8), cv2.IMREAD_COLOR)
    public = decode(client.get("/live/frame.jpg", headers={"cf-connecting-ip": "203.0.113.9"}).content)
    operator = decode(client.get("/live/frame.jpg?plates=1").content)

    # the yellow frame is only in the operator's picture
    yellow = lambda im: int(((im[..., 0] < 60) & (im[..., 1] > 200) & (im[..., 2] > 200)).sum())
    assert yellow(operator) > 500 and yellow(public) < 50


def test_with_no_bays_the_public_picture_is_the_plain_lifted_frame(client, monkeypatch):
    dark = bright(v=20)
    monkeypatch.setattr(app_module, "get_detector", lambda: type("D", (), {"model": object(), "ocr_kind": "none"})())

    class MOT:
        def __init__(self, m): pass
        def track_frame(self, f, conf=0.1, imgsz=640): return [T(1, 10, 10, 60, 60)]
    monkeypatch.setattr(app_module, "VehicleMOTTracker", MOT)
    monkeypatch.setattr(app_module, "_mot_trackers", {})
    monkeypatch.setattr(app_module, "_bay_maps", {})
    from live import LiveSession
    out = app_module._live_process(dark, LiveSession("x", app_module._live_process, Path(".")))
    assert out["annotated_clean"].mean() > 60                                  # lifted
    assert out["annotated"].mean() < 40                                        # the technical one is the raw dark frame + boxes
