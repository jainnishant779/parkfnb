"""
A car half hidden behind another one: the tracking model misses it, the segmentation model finds it, and it is counted
as its own car with a stable id.  Measured on the live frame of 26 Oct: the tracking model saw 2 cars, the COCO model 3.
"""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from segmenter import Silhouette, unmatched_boxes  # noqa: E402
from tracker import OCCLUSION_HEAVY, OCCLUSION_PARTIAL, OCCLUSION_VISIBLE, VehicleMOTTracker  # noqa: E402


def sil(x1, y1, x2, y2, conf):
    return Silhouette((x1, y1, x2, y2), conf, np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], float))


def det(x1, y1, x2, y2):
    return NS(x1=x1, y1=y1, x2=x2, y2=y2)


INNOVA = det(935, 340, 1169, 446)                    # what the tracking model saw on the 26 Oct frame
CRETA = sil(1041, 330, 1242, 431, 0.56)              # what only the segmentation model saw (behind the Innova)


def test_a_car_only_the_second_model_saw_is_added_and_the_same_cars_are_not_added_twice():
    found = unmatched_boxes([sil(933, 345, 1163, 444, 0.87), CRETA, sil(596, 381, 724, 518, 0.82)],
                            [INNOVA, det(593, 379, 724, 518)])
    assert found == [(1041, 330, 1242, 431, 0.56)]


def test_a_piece_of_a_car_or_an_unsure_find_is_not_a_car():
    piece = sil(1000, 360, 1100, 430, 0.9)           # inside the Innova's box: a part of it, not another car
    assert unmatched_boxes([piece], [INNOVA]) == []
    assert unmatched_boxes([sil(1153, 366, 1242, 428, 0.16)], [INNOVA]) == []          # far too unsure
    assert unmatched_boxes([sil(2, 0, 557, 353, 0.29)], []) == []                       # the building it once called a car
    assert unmatched_boxes([CRETA], [INNOVA], min_conf=0.6) == []                       # the threshold is a setting


def test_a_scrap_of_litter_the_size_of_a_hand_is_not_a_car():
    wrapper = sil(180, 394, 210, 409, 0.58)                  # 30 x 15 px on a 1280 x 720 picture, called a car on 28 Oct
    assert unmatched_boxes([wrapper], [], image_size=(1280, 720)) == []
    assert unmatched_boxes([sil(180, 394, 300, 470, 0.58)], [], image_size=(1280, 720)) != []        # a car-sized find still counts
    assert unmatched_boxes([wrapper], []) != []                                                       # no picture size given: as before


def test_an_extra_car_keeps_its_id_from_one_refresh_to_the_next_and_is_marked_hidden_behind_the_nearer_one():
    mot = VehicleMOTTracker(model=None)
    innova = NS(x1=935, y1=340, x2=1169, y2=446, area=(1169 - 935) * (446 - 340))
    (a,) = mot.add_extra([(1041, 330, 1242, 431, 0.56)], [innova], now=100.0)
    (b,) = mot.add_extra([(1045, 332, 1244, 433, 0.60)], [innova], now=103.0)           # moved a few pixels: the same car
    assert a.track_id == b.track_id >= VehicleMOTTracker.EXTRA_ID_BASE
    assert b.occlusion_state in (OCCLUSION_PARTIAL, OCCLUSION_HEAVY) and getattr(b, "source") == "seg"
    (c,) = mot.add_extra([(100, 400, 300, 500, 0.9)], [innova], now=104.0)              # somewhere else: a new car
    assert c.track_id != a.track_id and c.occlusion_state == OCCLUSION_VISIBLE


def test_an_extra_car_that_is_gone_is_forgotten_after_the_usual_time():
    mot = VehicleMOTTracker(model=None, max_lost_seconds=5.0)
    (a,) = mot.add_extra([(1041, 330, 1242, 431, 0.56)], [], now=100.0)
    assert mot.add_extra([], [], now=103.0) == [] and a.track_id in mot._extra           # a moment: still remembered
    mot.add_extra([], [], now=110.0)
    assert a.track_id not in mot._extra
