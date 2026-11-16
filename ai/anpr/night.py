"""
Judging the bays at night, one bay at a time.

Until 28 Oct the whole lot went "Unclear" the moment the whole picture was dark (mean brightness under 45), although at night the
street light shows the nearer bays perfectly well: on the live frame two white cars stood in Bay-05 and Bay-07 and the chalk lines of
the empty bays were plain to see, yet five bays read "Unclear".  A bay is now judged on how well it can be seen:

  seen empty    the bay's own patch is bright enough and looks like bare ground (texture of tarmac and chalk, not of a car) and no car
                was detected in it.  Measured on two real night frames: empty lit bays had mean brightness 22-30 and edge density
                1.9-2.6; a bay with a car in it 3.5-5.9 and brighter; a bay out of the light 5-7 and 1.0-1.3 (nothing to see).
  carried       too dark to see, but it was empty when the light went and no car has crossed the entry line since: still empty.
                A car that arrives is tracked even in the dark (headlights and paint show), and the entry line counts it.
  otherwise     Unclear, as before.

The numbers come from two frames of one lot: they are settings (ANPR_NIGHT_*), and the per-bay figures are kept so they can be tuned
on more nights.  Only "available" is ever claimed this way; an occupied bay is occupied because a car was seen.
"""
from __future__ import annotations

import os
from typing import Optional

import cv2
import numpy as np

VISIBLE_MEAN = float(os.getenv("ANPR_NIGHT_VISIBLE_MEAN", "18"))        # brighter than this: the ground can be seen
VISIBLE_EDGE_MIN = float(os.getenv("ANPR_NIGHT_EDGE_MIN", "1.6"))       # some texture: tarmac and chalk, not a black void
GROUND_EDGE_MAX = float(os.getenv("ANPR_NIGHT_EDGE_MAX", "3.0"))        # more than this is not bare ground: something is in the bay
MAX_CARRY_S = float(os.getenv("ANPR_NIGHT_CARRY_S", str(14 * 3600)))    # how long "empty when the light went" is believed


def bay_visibility(frame, polygons: dict) -> dict:
    """{bay: {"mean", "edge", "seen_empty"}} for each bay polygon (pixels of `frame`): how bright the patch is, its edge density (mean
    absolute Laplacian), and whether it can be called bare ground seen in the dark."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    lap = np.abs(cv2.Laplacian(cv2.GaussianBlur(gray, (3, 3), 0), cv2.CV_32F))
    out = {}
    for bay, poly in polygons.items():
        mask = np.zeros(gray.shape, np.uint8)
        cv2.fillPoly(mask, [np.asarray(poly, np.int32)], 255)
        sel = mask > 0
        if not sel.any():
            continue
        mean, edge = float(gray[sel].mean()), float(lap[sel].mean())
        out[bay] = {"mean": round(mean, 1), "edge": round(edge, 2),
                    "seen_empty": bool(mean >= VISIBLE_MEAN and VISIBLE_EDGE_MIN <= edge <= GROUND_EDGE_MAX)}
    return out


class NightMemory:
    """When each bay was last SEEN empty, so a bay that is too dark to see can still be called empty (and no longer once a car has
    come in since, or after too long)."""

    SEEN = ("vacant", "night_seen")                  # the reasons that mean "a picture showed it empty"; a carried answer does not count

    def __init__(self):
        self._seen_empty: dict[str, float] = {}

    def update(self, answers: dict, now: float) -> None:
        """Call on every picture with the answers compose_bays gave ({bay: {"status", "reason"}}).  A bay seen empty is stamped now; a
        bay that is anything but available is forgotten; a bay merely carried as empty keeps its old stamp (it must not keep itself alive)."""
        for bay, a in answers.items():
            if a.get("status") != "VACANT":
                self._seen_empty.pop(bay, None)
            elif a.get("reason") in self.SEEN:
                self._seen_empty[bay] = now

    def forget(self) -> None:
        self._seen_empty.clear()

    def carried_empty(self, bay: str, now: float, last_entry_t: float) -> bool:
        """Seen empty since the last car came through the entry line, and not too long ago."""
        t = self._seen_empty.get(bay)
        return t is not None and t >= last_entry_t and now - t <= MAX_CARRY_S
