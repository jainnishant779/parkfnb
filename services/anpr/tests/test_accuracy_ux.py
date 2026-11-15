"""
Measuring accuracy from what operators do, and the fixes the screenshots of 28 Oct called for:
  * re-marking the bays ended nothing, so 16 "open" violations piled up about bays that no longer meant the same ground;
  * a violation did not say whose car it was;
  * the plate of a far car read U, then V, then D: whole-plate votes see three plates, the letters averaged see one.
"""
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import arrivals  # noqa: E402
import plate_ocr as po  # noqa: E402

PROXY = {"X-Forwarded-For": "203.0.113.9"}
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_"


# ---- the arithmetic

def test_the_wilson_interval_is_wide_for_few_samples_and_narrow_for_many():
    lo, hi = arrivals.wilson(5, 5)
    assert 0.5 < lo < 0.6 and hi == pytest.approx(1.0)                     # 5 of 5 is "between 57 % and 100 %", not "100 %"
    lo, hi = arrivals.wilson(90, 100)
    assert 0.82 < lo < 0.84 and 0.94 < hi < 0.96
    lo, hi = arrivals.wilson(0, 10)
    assert lo == 0.0 and 0.2 < hi < 0.34
    assert arrivals.wilson(0, 0) is None


def test_edit_distance():
    assert arrivals.edit_distance("DL8CAU7240", "DL8CAU7240") == 0
    assert arrivals.edit_distance("DL8CAV7240", "DL8CAU7240") == 1
    assert arrivals.edit_distance("", "ABC") == 3 and arrivals.edit_distance("MP09", "MP9") == 1


def rec(text, source="operator", reads=None, **kw):
    return {"id": text, "bay": "Bay-01", "arrived": 1.0, "left": None, "text": text, "source": source, "reads": reads or [], **kw}


def test_plate_accuracy_counts_what_the_reader_said_against_what_a_person_typed():
    answers = {"A": {"text": "MP09AN5254", "confirmed": True}, "B": {"text": "DL8CAV7240", "confirmed": False}, "C": None,
               "D": {"text": "KA01AB1234", "confirmed": True}}
    truth = {"A": "MP09AN5254", "B": "DL8CAU7240", "C": "UP16BX1234", "D": "KA01AB9999"}
    rows = [rec(truth[k], reads=[k]) for k in truth] + [rec("ZZ", source=None), {"id": "x", "bay": "B", "arrived": 1.0, "left": None, "text": "QQ"}]
    out = arrivals.plate_accuracy(rows, lambda r: answers[r["reads"][0]])
    assert out["checked"] == 4 and out["exact"] == 1 and out["exact_pct"] == 25.0       # only A is right; the machine's own plates are not samples
    assert out["no_answer"] == 1                                                         # C: it gave nothing
    assert out["machine_confirmed"] == 2 and out["confirmed_wrong"] == 1                 # D was confirmed and wrong: the dangerous kind
    assert out["ci_low_pct"] < 25 < out["ci_high_pct"] and out["char_pct"] == 62.5        # 10+9+0+6 letters of 40
    assert arrivals.plate_accuracy([], lambda r: None)["exact_pct"] is None


# ---- averaging the letters over the photos

def sparse(text, wrong=None):
    """The kept letters of one photo: `text`'s letter in each slot at 0.6, plus a second choice where given {slot: (letter, p_for_it)}."""
    slots = []
    for i, ch in enumerate(text):
        entry = [[ALPHABET.index(ch), 0.6]]
        if wrong and i in wrong:
            alt, p = wrong[i]
            entry = [[ALPHABET.index(alt), p], [ALPHABET.index(ch), 1.0 - p - 0.1]]
        slots.append(entry)
    return slots


needs_model = pytest.mark.skipif(not (Path(po._dir()) / po.MODEL_FILE).exists(), reason="plate OCR model file not present")


@needs_model
def test_a_letter_that_flips_between_photos_is_settled_by_the_average_not_by_a_three_way_tie():
    # the far plate of 28 Oct: letter 5 read U, V and D in three photos (whole-plate votes: three plates)
    reads = [{"text": "DL8CAU7240", "m": sparse("DL8CAU7240", {5: ("U", 0.45)})},
             {"text": "DL8CAV7240", "m": sparse("DL8CAU7240", {5: ("V", 0.45)})},
             {"text": "DL8CAD7240", "m": sparse("DL8CAU7240", {5: ("D", 0.4)})}]
    for r in reads:                                                                           # the letter each photo said, as the reader would store it
        r["m"][5].sort(key=lambda e: -e[1])
    reads[0]["m"][5] = [[ALPHABET.index("U"), 0.45], [ALPHABET.index("V"), 0.30]]
    reads[1]["m"][5] = [[ALPHABET.index("V"), 0.45], [ALPHABET.index("U"), 0.30]]
    reads[2]["m"][5] = [[ALPHABET.index("D"), 0.40], [ALPHABET.index("U"), 0.35]]
    fused = po.fuse(reads)
    assert fused["text"] == "DL8CAU7240" and fused["valid"] and fused["n"] == 3               # U: .45 + .30 + .35 beats V and D
    assert po.fuse(reads[:1]) is None and po.fuse([{"text": "x"}, {"text": "y"}]) is None     # one photo, or none with letters kept: nothing to average


def test_the_kept_letters_are_few_and_compact():
    import numpy as np
    m = np.zeros((10, 37), np.float32)
    m[0, 22], m[0, 5] = 0.8, 0.1
    m[1, 3] = 0.02                                                                             # under the floor
    out = po._sparse(m)
    assert out[0] == [[22, 0.8], [5, 0.1]] and out[1] == []


# ---- violations: whose car, and stale ones

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.state_store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_arrival_books", {})
    monkeypatch.setattr(app_module, "_books", {})
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    yield c
    for s in app_module._live_sessions.values():
        s.stop()


def test_a_violation_says_whose_car_it_was_and_the_csv_does_too(client):
    now = time.time()
    book = app_module._arrival_book("phone-1")
    a = book.open("Bay-05", 7, now - 600, [1, 2, 3, 4], [1280, 720])
    book.update(a["id"], photo=True, text="MP09AN5254", confirmed=True, reads=[{}, {}])
    v, _ = app_module._violation_book("phone-1").open("Bay-05", "over_line", now - 300, "Over the left line by 0.4 m", 0.4, "left")
    other, _ = app_module._violation_book("phone-1").open("Bay-02", "over_line", now - 300, "x", 0.2, "left")
    rows = {r["bay"]: r for r in client.get("/console/api/violations").json()["violations"]}
    assert rows["Bay-05"]["plate"] == "MP09AN5254" and rows["Bay-05"]["plate_confirmed"] is True
    assert "plate" not in rows["Bay-02"]                                                         # nobody read in Bay-02
    csv = client.get("/console/api/violations.csv").text.splitlines()
    assert csv[0].lstrip("﻿").split(",")[3] == "plate" and any("MP09AN5254" in line for line in csv[1:])


def test_re_marking_the_bays_ends_the_open_violations_and_the_cars_still_there(client):
    now = time.time()
    app_module._violation_book("phone-1").open("Bay-04", "over_line", now - 100, "old layout", 0.4, "left")
    app_module._arrival_book("phone-1").open("Bay-04", 1, now - 100, [1, 2, 3, 4], [1280, 720])
    app_module._layout_changed("phone-1")
    v = app_module._violation_book("phone-1").list()[0]
    assert v["closed"] is not None and v["status"] == "open"                                      # over, but still waiting for a person to look
    assert app_module._arrival_book("phone-1").list()[0]["left"] is not None


# ---- the accuracy page's numbers

def test_the_accuracy_endpoint_is_built_from_what_operators_did_and_is_private(client, monkeypatch):
    monkeypatch.setattr(app_module, "_build_report", lambda *a, **k: {"dwell": {"flickers_by_bay": {"Bay-01": 15, "Bay-05": 9}}})
    book = app_module._arrival_book("phone-1")
    now = time.time()
    r1 = book.open("Bay-01", 1, now - 900, [1, 2, 3, 4], [1280, 720])
    book.update(r1["id"], photo=True, text="DL8CAU7240", confirmed=True, source="operator",
                reads=[{"text": "DL8CAU7240", "valid": True, "mean_prob": 0.8, "min_prob": 0.6, "agree": 3, "of": 4, "rival": 0.0}] * 2)
    r2 = book.open("Bay-02", 2, now - 800, [1, 2, 3, 4], [1280, 720])
    book.update(r2["id"], photo=True, text="MP09AN5254", confirmed=True, reads=[{}])
    vb = app_module._violation_book("phone-1")
    for i, status in enumerate(("resolved", "resolved", "dismissed")):
        v, _ = vb.open(f"Bay-0{i}", "over_line", now - 500 + i, "x", 0.3, "left")
        vb.handle(v["id"], status, "", "me", now)
    v, _ = vb.open("Bay-09", "over_line", now, "x", 0.3, "left")                                   # still open
    got = client.get("/console/api/accuracy").json()
    p = got["plates"]
    assert p["checked"] == 1 and p["exact"] == 1 and p["confirmed_wrong"] == 0 and p["read_by_machine"] == 1
    assert got["violations"]["reviewed"] == 3 and got["violations"]["real"] == 2 and got["violations"]["false_alarms"] == 1
    assert got["violations"]["precision_pct"] == 66.7 and got["violations"]["open"] == 1
    assert got["bays"]["flickers_today"] == 24
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    assert visitor.get("/console/api/accuracy", headers=PROXY).status_code == 403


def test_a_bulk_dismissal_does_not_count_as_a_false_alarm(client, monkeypatch):
    monkeypatch.setattr(app_module, "_build_report", lambda *a, **k: {"dwell": {"flickers_by_bay": {}}})
    vb = app_module._violation_book("phone-1")
    v, _ = vb.open("Bay-01", "over_line", time.time() - 100, "x", 0.3, "left")
    vb.close("Bay-01", time.time())
    client.post("/console/api/violations-dismiss-ended")
    out = client.get("/console/api/accuracy").json()["violations"]
    assert out["reviewed"] == 0 and out["precision_pct"] is None                                  # nobody judged it: no claim either way


def test_the_bulk_mark_is_a_flag_not_a_word_in_the_note(client, monkeypatch):
    # it used to be "in bulk" in the note, which a person can type and the note box came pre-filled with it
    monkeypatch.setattr(app_module, "_build_report", lambda *a, **k: {"dwell": {"flickers_by_bay": {}}})
    vb = app_module._violation_book("phone-1")
    now = time.time()
    v, _ = vb.open("Bay-01", "over_line", now - 100, "x", 0.3, "left")
    vb.close("Bay-01", now)
    client.post("/console/api/violations-dismiss-ended")
    assert vb.get(v["id"])["bulk"] is True
    vb.handle(v["id"], "open", "", "me", now)                                                      # reopened ...
    vb.handle(v["id"], "dismissed", "Dismissed in bulk: it was already over", "me", now)          # ... and a person says false alarm
    assert vb.get(v["id"])["bulk"] is False
    out = client.get("/console/api/accuracy").json()["violations"]
    assert out["reviewed"] == 1 and out["false_alarms"] == 1                                       # now it is a judgement


def test_an_overstay_is_not_a_system_error(client, monkeypatch):
    monkeypatch.setattr(app_module, "_build_report", lambda *a, **k: {"dwell": {"flickers_by_bay": {}}})
    vb = app_module._violation_book("phone-1")
    now = time.time()
    o, _ = vb.open("Bay-02", "overstay", now - 100, "Parked for over 1 h", None, None)
    vb.handle(o["id"], "dismissed", "they have a permit", "me", now)
    out = client.get("/console/api/accuracy").json()["violations"]
    assert out["reviewed"] == 0 and out["false_alarms"] == 0


def test_open_violations_say_how_many_are_still_going_on(client):
    vb = app_module._violation_book("phone-1")
    now = time.time()
    vb.open("Bay-01", "over_line", now - 100, "x", 0.3, "left")
    vb.open("Bay-02", "over_line", now - 100, "x", 0.3, "left")
    vb.close("Bay-02", now)
    got = client.get("/console/api/violations?status=open").json()
    assert got["open_count"] == 2 and got["going_on"] == 1


def test_taking_a_typed_plate_back_is_not_logged_as_a_confirmation(client):
    book = app_module._arrival_book("phone-1")
    a = book.open("Bay-03", 3, time.time() - 60, [1, 2, 3, 4], [1280, 720])
    book.update(a["id"], photo=True, text="MP09AN5254", confirmed=True, source="operator")
    class Session:
        notes = []
        def note(self, e): self.notes.append(e)
        def stop(self): pass
    s = Session()
    app_module._live_sessions["phone-1"] = s
    client.post(f"/console/api/arrival/{a['id']}/plate", json={"plate": ""})
    assert s.notes == []                                                                           # nothing was confirmed
    client.post(f"/console/api/arrival/{a['id']}/plate", json={"plate": "DL8CAU7240"})
    assert len(s.notes) == 1 and s.notes[0]["plate"] == "DL8CAU7240"
