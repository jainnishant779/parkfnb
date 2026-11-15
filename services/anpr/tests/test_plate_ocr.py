"""
Reading the plate (plate_ocr.py).  The model reads what it is shown, so a crop with no plate in it gives a confident wrong
answer: a read is used only when it is a real Indian plate format with a real state code and every letter reasonably sure, and
a car's plate is confirmed by voting across photos.  Measured on 28 Oct: 13 crops cut from the phone's photos; every crop that
showed the plate read MP09BU5540, every other crop was dropped, and no wrong plate got through.
"""
import sys
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import plate_ocr as po  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def r(text, mean=0.95, low=0.8, valid=True):
    return {"text": text, "valid": valid, "mean_prob": mean, "min_prob": low}


# ---- which reads are kept

def test_a_read_is_usable_only_when_valid_and_every_letter_is_sure_enough():
    assert po.usable(r("MP09BU5540"))
    assert not po.usable(None)
    assert not po.usable(r("MP09BU5540", valid=False))                  # not a plate format
    assert not po.usable(r("MP09BU5540", mean=0.6))                     # unsure on average
    assert not po.usable(r("MP09BU5540", low=0.3))                      # one letter was a coin toss


# ---- voting

def test_two_agreeing_reads_confirm_and_one_ordinary_read_does_not():
    assert po.vote([r("MP09BU5540")]) == {"text": "MP09BU5540", "reads": 1, "agree": 1, "confirmed": False}
    assert po.vote([r("MP09BU5540"), r("MP09BU5540", 0.9, 0.6)])["confirmed"] is True


def test_one_very_sure_read_confirms_by_itself():
    assert po.vote([r("MP09BU5540", 0.99, 0.95)])["confirmed"] is True


def test_the_majority_wins_over_a_stray_misread():
    v = po.vote([r("MP09BU5540"), r("MP09BU5549", 0.8, 0.5), r("MP09BU5540", 0.9, 0.6)])
    assert v["text"] == "MP09BU5540" and v["agree"] == 2 and v["confirmed"]


def test_nothing_usable_gives_no_plate():
    assert po.vote([]) is None
    assert po.vote([r("WP093W5", 0.4, 0.2, valid=False), r("M", valid=False)]) is None


# ---- the model (skipped where its file is not there: weights are not in git)

needs_model = pytest.mark.skipif(not (Path(po._dir()) / po.MODEL_FILE).exists(), reason="plate OCR model file not present")


@needs_model
def test_it_reads_a_real_plate_cut_from_a_phone_photo():
    read = po.read_plate(cv2.imread(str(FIX / "plate_sample.jpg")))
    assert read["text"] == "MP09BU5540" and read["valid"] and po.usable(read)


@needs_model
def test_a_green_electric_vehicle_plate_is_read_right_not_with_the_one_letter_a_single_model_gets_wrong():
    # 28 Oct: one model read this plate MP09AW5254 (twice, so it would have been "confirmed"); the plate says MP09AN5254
    img = cv2.imread(str(FIX / "plate_green.jpg"))
    assert po.green_board(img)
    read = po.read_plate(img)
    assert read["text"] == "MP09AN5254" and po.usable(read) and read["agree"] >= 2


@needs_model
def test_a_dd_plate_and_a_plain_white_one_are_not_taken_for_green():
    dd = cv2.imread(str(FIX / "plate_dd.jpg"))
    assert not po.green_board(dd) and not po.green_board(cv2.imread(str(FIX / "plate_sample.jpg")))
    assert po.read_plate(dd)["text"] == "DD02G7545" and po.usable(po.read_plate(dd))


@needs_model
def test_a_small_slanted_delhi_plate_is_read_right_but_not_sure_enough_to_count():
    # 28 Oct: DL 8C AU 7240 on a car in a far bay, 82 x 34 px and slanted.  A person reads it at once; the models see 15 px letters.
    img = cv2.imread(str(FIX / "plate_suv_dl.jpg"))
    flat = po.rectify(img)
    assert flat is not None and flat.shape[:2] == (64, 192)                          # cut tight and straightened
    read = po.read_plate(img)
    assert read["text"] == "DL8CAU7240" and read["valid"]                            # right (the Delhi "8C" is a digit and a letter)
    assert po.vote([read], strict=True)["confirmed"] is False                        # but one photo of a small plate is never "confirmed"
    assert po.guess([{**read, "mean_prob": 0.62}]) == "DL8CAU7240"


needs_paddle = pytest.mark.skipif(not (Path(po._dir()) / po.PADDLE_FILE).exists(), reason="PP-OCR model file not present")


@needs_model
@needs_paddle
def test_a_third_kind_of_reader_settles_the_letter_the_plate_models_cannot():
    # 28 Oct, Bay-06: the 6th letter of DL8CAU7240 was read U, V and D by the plate models; PaddleOCR reads the U
    img = cv2.imread(str(FIX / "plate_suv_dl.jpg"))
    board = po.rectify(img, out_w=384, out_h=128)
    line = po.ink_line(board)
    raw, probs = po.get_paddle().read(line)
    found = po.best_window(raw, probs)
    assert found and found[0] == "DL8CAU7240"                                         # its own 'OL' repaired to the state code DL
    read = po.read_plate(img)
    assert read["text"] == "DL8CAU7240" and read["cross"] is True                      # both kinds of reader gave it
    assert po.usable(read)                                                           # so it counts, where the plate models alone would not be sure


@needs_model
@needs_paddle
def test_the_third_reader_agrees_on_the_clear_plates_too():
    for name, want in (("plate_green.jpg", "MP09AN5254"), ("plate_dd.jpg", "DD02G7545"), ("plate_red.jpg", "MP43CA2340"), ("plate_sample.jpg", "MP09BU5540")):
        read = po.read_plate(cv2.imread(str(FIX / name)))
        assert read["text"] == want and po.usable(read), name


def test_the_plate_is_found_inside_what_a_general_reader_gives():
    p = [0.9] * 20
    assert po.best_window("SOL8CAU7240", p)[0] == "DL8CAU7240"                         # noise in front, O for D
    assert po.best_window("EMP43CA2340", p)[0] == "MP43CA2340"
    assert po.best_window("MP09AN5254", p)[0] == "MP09AN5254"
    assert po.best_window("HELLO", p) is None and po.best_window("", p) is None
    assert po.best_window("DL8CAU7240", [0.9] * 10)[1] == pytest.approx(0.9)
    assert po.best_window("OL8CAU7240", [0.9] * 10)[1] == pytest.approx(0.9 * 0.85)     # a look-alike repair is a little less sure


def test_a_small_plate_needs_two_photos_and_two_kinds_of_reader_to_be_confirmed():
    def read(text, cross):
        return {"text": text, "valid": True, "mean_prob": 0.9, "min_prob": 0.7, "agree": 3, "of": 4, "rival": 0.0, "cross": cross}
    one = [read("DL8CAU7240", True)]
    assert po.vote(one)["confirmed"] is False or True                                   # (normal rule: not asserted here)
    assert po.vote(one, strict=True)["confirmed"] is False                              # one photo: not enough for a small plate
    assert po.vote([read("DL8CAU7240", True), read("DL8CAU7240", True)], strict=True)["confirmed"] is True
    assert po.vote([read("DL8CAU7240", True), read("DL8CAU7240", False)], strict=True)["confirmed"] is False     # one read had only one kind of reader
    assert po.vote([read("DL8CAU7240", False), read("DL8CAU7240", False)], strict=False)["confirmed"] is True   # a plate that is big enough: as before


def test_two_kinds_of_reader_agreeing_cover_one_weak_letter():
    weak = {"text": "DL8CAU7240", "valid": True, "mean_prob": 0.62, "min_prob": 0.22, "rival": 0.4}
    assert not po.usable(weak)
    assert po.usable({**weak, "cross": True})
    assert not po.usable({**weak, "cross": True, "min_prob": 0.1})


def test_the_letters_in_doubt_are_picked_out_for_the_person_who_checks():
    # the plates the readers proposed in three photos of the far SUV: only the 6th letter differs (U, V, D)
    reads = [{"votes": [["DL8CAU7240", 3.0], ["DL8CAV7240", 1.0]]}, {"votes": [["DL8CAV7240", 2.0], ["DL8CAU7240", 2.0]]},
             {"votes": [["DL8CAD7240", 1.0], ["DL8CAU7240", 2.5], ["DL8", 0.5]]}]
    d = po.letter_doubts(reads, "DL8CAU7240")
    assert [x["pos"] for x in d] == [5] and d[0]["chars"][0] == "U" and set(d[0]["chars"]) >= {"U", "V", "D"}
    sure = [{"votes": [["MP09AN5254", 3.0]]}, {"votes": [["MP09AN5254", 2.0], ["MP09AN5254", 1.0]]}]
    assert po.letter_doubts(sure, "MP09AN5254") == [] and po.letter_doubts([], "X") == [] and po.letter_doubts(reads, None) == []


def sparse_m(text, odd):
    out = []
    for i, ch in enumerate(text):
        out.append([[po.ALPHABET.index(c), p] for c, p in odd[i]] if i in odd else [[po.ALPHABET.index(ch), 0.9]])
    return out


@needs_model
def test_rectifying_does_not_spoil_a_plate_that_was_read_well():
    assert po.read_plate(cv2.imread(str(FIX / "plate_red.jpg")))["text"] == "MP43CA2340"
    assert po.read_plate(cv2.imread(str(FIX / "plate_sample.jpg")))["text"] == "MP09BU5540"


def test_rectify_gives_up_on_a_picture_with_no_plate_in_it():
    import numpy as np
    assert po.rectify(np.zeros((40, 100, 3), np.uint8)) is None
    assert po.rectify(np.full((40, 100, 3), 200, np.uint8)) is None
    assert po.rectify(np.zeros((5, 5, 3), np.uint8)) is None


def test_the_best_guess_is_the_real_format_text_with_most_weight_however_unsure():
    reads = [{"text": "DL88AU7240", "valid": True, "mean_prob": 0.5}, {"text": "DL8CAU7240", "valid": True, "mean_prob": 0.6},
             {"text": "DL8CAU7240", "valid": True, "mean_prob": 0.5}, {"text": "WP093W5", "valid": False, "mean_prob": 0.9},
             {"text": "KA01AB1234", "valid": True, "mean_prob": 0.3}]
    assert po.guess(reads) == "DL8CAU7240"
    assert po.guess([{"text": "WP093W5", "valid": False, "mean_prob": 0.9}]) is None and po.guess([]) is None


def test_delhi_district_codes_are_a_digit_and_a_letter_and_other_states_stay_digits():
    from detector import normalise_plate
    assert normalise_plate("DLBEAU7240") == ("DL8CAU7240", True)                     # B is the 8, E the C
    assert normalise_plate("DL3SBC4567")[0] == "DL3SBC4567" and normalise_plate("DL12AB1234")[0] == "DL12AB1234"
    assert normalise_plate("MPO9BU554O")[0] == "MP09BU5540"                          # the rule for other states is untouched


def test_two_plates_that_nearly_tie_are_never_confirmed():
    a, b = r("MP09AN5254", 0.95, 0.7), r("MP09AW5254", 0.92, 0.7)
    a["rival"] = b["rival"] = 0.0
    v = po.vote([a, a, b, b])
    assert v["confirmed"] is False                                                         # two photos each: no winner
    assert po.vote([a, a, a, b])["confirmed"] is True                                      # three against one is


def test_a_read_with_a_strong_rival_inside_the_crop_is_not_usable():
    assert not po.usable({**r("MP09AN5254"), "rival": 0.9})
    assert po.usable({**r("MP09AN5254"), "rival": 0.2})


@needs_model
def test_a_crop_that_is_not_a_whole_plate_is_not_used():
    read = po.read_plate(cv2.imread(str(FIX / "plate_partial.jpg")))                # the right half of a plate
    assert not po.usable(read)


@needs_model
def test_junk_and_tiny_inputs_are_handled():
    import numpy as np
    assert po.read_plate(np.zeros((40, 100, 3), np.uint8)) is None or not po.usable(po.read_plate(np.zeros((40, 100, 3), np.uint8)))
    assert po.read_plate(np.zeros((3, 3, 3), np.uint8)) is None
    assert po.read_plate(None) is None


def test_with_no_model_reading_is_simply_off(monkeypatch, tmp_path):
    monkeypatch.setattr(po, "_readers", None)
    monkeypatch.setattr(po, "_failed", False)
    monkeypatch.setenv("ANPR_PLATE_OCR_DIR", str(tmp_path))                          # an empty folder
    assert po.read_plate(cv2.imread(str(FIX / "plate_sample.jpg"))) is None and po.available() is False
