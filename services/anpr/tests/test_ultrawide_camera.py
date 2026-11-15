"""
A phone's ultra-wide lens (about 113 degrees across, a focal length of 0.33 x the picture width) must still give a 3D
camera.  Measured on the live layout of 26 Oct: the best joint fit had f = 405 px on a 1280 px picture and was refused as
"implausible" by a lower bound of 0.35 x the width, which left the whole site without 3D until the bound was widened.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import calibration as C  # noqa: E402
from calibration import Camera  # noqa: E402

SIZE = (1280, 720)


def row_of_bays(cam, n=6, x0=-4.0, y0=8.5, width=2.5, length=5.0):
    """n bays side by side as drawn on the picture: near-left, near-right, far-right, far-left in pixels."""
    bays = {}
    for i in range(n):
        xa, xb = x0 + i * width, x0 + (i + 1) * width
        ground = np.array([(xa, y0), (xb, y0), (xb, y0 + length), (xa, y0 + length)])
        bays[f"Bay-{i + 1:02d}"] = cam.project(ground).tolist()
    return bays


@pytest.mark.parametrize("focal_frac,n", [(0.33, 6), (0.40, 6), (0.60, 4)])
def test_a_wide_or_ultra_wide_lens_gives_a_camera_and_the_bays_it_was_made_from_grade_good(focal_frac, n):
    cam = Camera(focal_px=focal_frac * SIZE[0], pitch_deg=15.0, roll_deg=0.0, height_m=4.2, image_size=SIZE)
    bays = row_of_bays(cam, n=n)
    assert all(0 < x < SIZE[0] and 0 < y < SIZE[1] for pts in bays.values() for x, y in pts), "the test scene must fit the picture"
    cal = C.fit_site_calibration(bays, SIZE)
    assert cal.camera is not None and "SITE_FIT_IMPLAUSIBLE" not in cal.flags, cal.flags
    assert cal.camera.focal_px == pytest.approx(cam.focal_px, rel=0.05)
    assert sum(b.status == C.GOOD for b in cal.bays.values()) >= n - 1


def test_a_focal_length_no_lens_has_is_still_refused():
    cam = Camera(focal_px=0.15 * SIZE[0], pitch_deg=15.0, roll_deg=0.0, height_m=4.2, image_size=SIZE)
    assert not C._plausible(cam, SIZE)
    assert C._plausible(Camera(0.33 * SIZE[0], 15.0, 0.0, 4.2, SIZE), SIZE)                 # the ultra-wide lens of the pilot phone
    assert not C._plausible(Camera(0.33 * SIZE[0], 15.0, 0.0, 1.0, SIZE), SIZE)             # a camera on the ground is still nonsense


def test_the_lower_bound_is_a_setting(monkeypatch):
    monkeypatch.setattr(C, "MIN_FOCAL_FRAC", 0.5)
    assert not C._plausible(Camera(0.33 * SIZE[0], 15.0, 0.0, 4.2, SIZE), SIZE)
