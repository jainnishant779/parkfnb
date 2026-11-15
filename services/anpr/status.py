"""
One honest answer per bay, and how fresh the feed behind it is.

The engine (occupancy.py) keeps seven internal states.  What a viewer needs is four:

    VACANT     the bay is empty
    OCCUPIED   a car is in it (with a flag when it is parked badly)
    UNCERTAIN  we cannot tell right now (too dark, camera moved, not read yet)
    STALE      there is no fresh picture, so whatever we last knew may be out of date

Every number on the page (tiles, map, list, legend) is derived from the list this module builds, so
they cannot disagree.  Pure functions, no camera or model: easy to test.
"""
from __future__ import annotations

import os
import time
from collections import deque
from datetime import datetime
from typing import Iterable, Optional

VACANT = "VACANT"
OCCUPIED = "OCCUPIED"
UNCERTAIN = "UNCERTAIN"
STALE = "STALE"

STREAM_NOT_STARTED = "not_started"
STREAM_LIVE = "live"
STREAM_STALE = "stale"          # frames arrive but none has been processed for a while
STREAM_OFFLINE = "offline"      # no frame has arrived for a while
STREAM_ERROR = "error"          # the last frame failed and nothing has succeeded since


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


# Defaults are documented in docs/pilot-baseline.md; each can be overridden per deployment.
STALE_AFTER_S = _env_float("ANPR_STALE_AFTER_S", 15.0)     # no processed frame for this long -> STALE
LOWLIGHT_MEAN = _env_float("ANPR_LOWLIGHT_MEAN", 45.0)     # mean pixel value (0-255) below this = too dark
MOVE_PX_FRAC = _env_float("ANPR_MOVE_PX_FRAC", 0.03)       # image shift (fraction of width) = camera moved

# Plain sentences for the viewer.  Keys are reason codes.
REASON_TEXT = {
    "vacant": "Free",
    "parked": "A car is parked here",
    "wrong": "Parked across the lines",
    "suspicious": "Parked close to the line",
    "hidden": "Partly hidden by another car",
    "blocked": "Blocked by a car parked across it",
    "parked_ok": "Parked correctly",
    "unread": "Waiting for the first reading",
    "low_light": "Too dark to confirm",
    "night_seen": "Free (seen empty in the dark)",
    "night_carry": "Free: it was empty when the light went and no car has come in since",
    "camera_moved": "Camera view changed, layout needs a check",
    "stale": "No fresh picture",
    "operator": "Set by operator",
}


def status_of(state: str) -> tuple[str, Optional[str], str]:
    """Internal engine state -> (status, flag, reason code)."""
    s = (state or "").lower()
    if s == "free":
        return VACANT, None, "vacant"
    if s in ("occupied", "correct"):
        return OCCUPIED, None, "parked"
    if s == "wrong":
        return OCCUPIED, "wrong", "wrong"
    if s == "suspicious":
        return OCCUPIED, "suspicious", "suspicious"
    if s == "occluded":
        # A car is in the bay (it was matched to it); another car in front hides part of it, so only HOW it is
        # parked cannot be judged.  Whether the bay is taken is not in doubt, so it is Occupied, not Unclear.
        return OCCUPIED, None, "hidden"
    return UNCERTAIN, None, "unread"                        # unknown, or anything new


def is_low_light(mean_value: float, threshold: float = LOWLIGHT_MEAN) -> bool:
    return mean_value < threshold


class LightGate:
    """
    "Too dark to judge" without flapping.  At dusk and under a street light the brightness of the picture hovers around the
    threshold (28 Oct, 7 PM: a mean of 38-46 against a threshold of 45), and a bare `mean < 45` turned the whole lot between
    "unclear" and judged about forty times in half an hour.  The brightness is smoothed, the gate closes below `low` and opens
    again only above `high`, and it never changes twice within `hold_s`.
    """

    def __init__(self, threshold: float = LOWLIGHT_MEAN, band: float = 7.0, hold_s: float = 30.0, smooth: float = 0.2):
        self.low, self.high = threshold - band, threshold + band
        self.hold_s, self.smooth = hold_s, smooth
        self.level: Optional[float] = None
        self.state = "ok"
        self._changed = float("-inf")

    def update(self, mean_value: float, now: Optional[float] = None) -> str:
        now = time.time() if now is None else now
        self.level = mean_value if self.level is None else self.level + self.smooth * (mean_value - self.level)
        want = self.state
        if self.state == "ok" and self.level < self.low:
            want = "low"
        elif self.state == "low" and self.level > self.high:
            want = "ok"
        if want != self.state and (self.level is not None and now - self._changed >= self.hold_s or self._changed == float("-inf")):
            self.state, self._changed = want, now
        return self.state


# ---------------------------------------------------------------- is the car parked correctly?

CORRECT = "correct"
CLOSE_TO_LINE = "close_to_line"
OVER_LINE = "over_line"
NOT_JUDGED = "not_judged"
JUDGED = (CORRECT, CLOSE_TO_LINE, OVER_LINE)

# Largest footprint, in metres, that can be one car.  Bigger means two cars' outlines were joined.
MAX_CAR_WIDTH_M = _env_float("ANPR_MAX_CAR_WIDTH_M", 2.45)
MAX_CAR_LENGTH_M = _env_float("ANPR_MAX_CAR_LENGTH_M", 5.8)


def _bay_name(bay_id) -> str:
    return f"P{bay_id}" if str(bay_id).isdigit() else str(bay_id)


FIT_END_TOLERANCE_M = _env_float("ANPR_END_LINE_TOLERANCE_M", 0.40)
FIT_SIDE_MIN_M = 0.10
FIT_MIN_UNCERTAINTY_M = 0.25            # the fitted box is placed to about this accuracy at best (more far from the camera)
_LINE = {"left": "left line", "right": "right line", "near": "front line (road side)", "far": "back line"}


def _fit_verdict(ev: dict, base: dict) -> Optional[dict]:
    """
    How a car is parked, from its fitted 3D box alone.  Used when the silhouette cannot be trusted (two cars' outlines
    run together).  The box is placed less exactly than a measured contact point, so a line counts as crossed only
    beyond the usual allowance plus 1.5 times the bay's calibration error (at least 0.25 m); anything between is
    "close to the line", and the wording says it is a 3D-fit result.  None when there is no good fit to go on.
    """
    fit, over, gap = ev.get("fit") or {}, ev.get("fit_over"), ev.get("fit_gap")
    if fit.get("quality") != "good" or not over:
        return None
    u = max(FIT_MIN_UNCERTAINTY_M, 1.5 * float(ev.get("margin_m") or 0.0))
    side, side_m = max((("left", over.get("left", 0.0)), ("right", over.get("right", 0.0))), key=lambda t: t[1])
    end, end_m = max((("near", over.get("near", 0.0)), ("far", over.get("far", 0.0))), key=lambda t: t[1])
    tail = f" (3D box, ±{u:.2f} m)"
    out = {**base, "source": "3d_fit"}
    if side_m > FIT_SIDE_MIN_M + u:
        return {**out, "verdict": OVER_LINE, "side": side, "crossing_m": round(side_m, 2),
                "reason_text": f"Over the {_LINE[side]} by {side_m:.2f} m{tail}"}
    if end_m > FIT_END_TOLERANCE_M + u:
        return {**out, "verdict": OVER_LINE, "side": end, "crossing_m": round(end_m, 2),
                "reason_text": f"Over the {_LINE[end]} by {end_m:.2f} m{tail}"}
    if side_m > FIT_SIDE_MIN_M:
        return {**out, "verdict": CLOSE_TO_LINE, "reason_text": f"Close to the {_LINE[side]}{tail}"}
    if end_m > FIT_END_TOLERANCE_M:
        return {**out, "verdict": CLOSE_TO_LINE, "reason_text": f"Close to the {_LINE[end]}{tail}"}
    clearance = {k: round(-float(gap[k]), 2) for k in ("left", "right") if gap and k in gap and gap[k] < 0}
    text = "Parked correctly"
    sides = [f"{clearance[k]:.2f} m to the {k} line" for k in ("left", "right") if k in clearance]
    if sides:
        text += ": " + ", ".join(sides)
    return {**out, "verdict": CORRECT, "clearance": clearance, "reason_text": text + tail}


def parking_verdict(ev: dict, engine_state: str) -> dict:
    """
    How a car is parked in its bay, shown to visitors only when the evidence is solid.

    `ev` is what the engine knew when it judged the bay (see app.py `_parking_evidence`):
        source        "mask" when the verdict rests on the car's silhouette, "bbox" for the rough box guess
        camera        whether a 3D camera could be fitted from the drawn bays
        calibration   this bay's grade: "good" | "degraded" | "rejected" | None
        margin_m      the bay's calibration error in metres (its crossings are judged beyond that)
        reason        the engine's own sentence ("Over the left line by 0.25 m ...")
        clearance     {side: metres} to each line, only sides the camera actually saw
        skew_deg, crossing_m, side
    A verdict is given only for a silhouette on a bay with a usable calibration.  Everything else is
    NOT_JUDGED with the reason, never a guess: a wrong "parked badly" on a client's page costs more
    than saying "not judged".
    """
    s = (engine_state or "").lower()
    cal = ev.get("calibration")
    base = {"calibration": cal, "margin_m": ev.get("margin_m")}
    if s == "occluded":
        return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged: partly hidden by another car"}
    if not ev.get("camera"):
        return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged: 3D calibration is not ready for this camera"}
    if cal in (None, "rejected"):
        return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged: this bay's calibration is too rough"}
    if ev.get("source") != "mask":
        return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged: waiting for a clear outline of the car"}
    fit = ev.get("fit") or {}
    if fit.get("quality") == "good" and len(ev.get("across") or []) >= 2:
        # a car that lies over two bays or more, whatever its own lines say: it blocks the others
        return {**base, "verdict": OVER_LINE, "side": "across", "crossing_m": None, "source": "3d_fit",
                "across": list(ev["across"]), "reason_text": "Parked across " + " and ".join(ev["across"])}
    wl = ev.get("footprint_wl")
    if wl and (wl[0] > MAX_CAR_WIDTH_M or wl[1] > MAX_CAR_LENGTH_M):
        # one car is not that big: the outline has joined two cars that overlap in the picture.  The fitted 3D box
        # sees each car on its own, so it can still judge this one.
        judged = _fit_verdict(ev, base)
        if judged:
            return judged
        return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged: the outline looks too large for one car (cars overlap in the picture)"}
    reason = (ev.get("reason") or "").strip()
    if s == "wrong":
        if ev.get("side") in ("near", "far") and fit.get("quality") == "good" and ev.get("fit_over"):
            # A front or back line is called crossed only when the fitted box agrees.  The silhouette's lowest points are
            # the bumper and the sills, so on a car near the threshold its reading swings by 0.1 m from frame to frame
            # (seen live: 0.58 to 0.70 m, over and correct every few seconds); the box is steadier along the car.
            u = max(FIT_MIN_UNCERTAINTY_M, 1.5 * float(ev.get("margin_m") or 0.0))
            if float(ev["fit_over"].get(ev["side"], 0.0)) <= FIT_END_TOLERANCE_M + u:
                return {**base, "verdict": CLOSE_TO_LINE, "skew_deg": ev.get("skew_deg"),
                        "reason_text": f"Possibly past the {_LINE[ev['side']]} (the 3D box does not confirm it)"}
        return {**base, "verdict": OVER_LINE, "side": ev.get("side"), "crossing_m": ev.get("crossing_m"),
                "reason_text": reason or "Over the line"}
    if s == "suspicious":
        if reason.startswith("Over the"):
            # a crossing the engine has seen but not yet held for its confirmation time: a warning, worded as one
            reason = "Possibly " + reason[0].lower() + reason[1:] + " (not yet confirmed)"
        return {**base, "verdict": CLOSE_TO_LINE, "skew_deg": ev.get("skew_deg"), "reason_text": reason or "Close to the line"}
    if s in ("correct", "occupied"):
        clearance = {k: round(float(v), 2) for k, v in (ev.get("clearance") or {}).items() if v is not None}
        text = "Parked correctly"
        sides = [f"{clearance[k]:.2f} m to the {k} line" for k in ("left", "right") if k in clearance]
        if sides:
            text += ": " + ", ".join(sides)
        out = {**base, "verdict": CORRECT, "clearance": clearance, "reason_text": text}
        if ev.get("skew_deg") is not None:
            out["skew_deg"] = ev["skew_deg"]
        return out
    return {**base, "verdict": NOT_JUDGED, "reason_text": "Not judged"}


class VerdictHold:
    """
    A bay's parking verdict that does not flicker.  The raw verdict is worked out afresh every frame from a noisy
    silhouette, so a car near a threshold can read "over the line" for 6 s and "correct" for 10 s, again and again.
    The held verdict changes only after the new one has been the raw verdict, without a break, for `hold_s`: longer
    to start a violation (`to_over_s`) than to end one (`to_other_s`), so nothing is flagged on a flicker and a real
    violation clears as soon as the car is steadily right.  A bay with no car forgets its verdict.
    """

    def __init__(self, to_over_s: float = 12.0, to_other_s: float = 8.0):
        self.to_over_s, self.to_other_s = to_over_s, to_other_s
        self._d: dict = {}                       # bay -> {"held": verdict dict, "cand": name, "since": t}

    def forget(self, bay) -> None:
        self._d.pop(bay, None)

    def update(self, bay, raw: Optional[dict], now: float) -> Optional[dict]:
        """The verdict to show for this bay now, given this frame's raw one (None: no car, so nothing to hold)."""
        if raw is None:
            self._d.pop(bay, None)
            return None
        e = self._d.get(bay)
        name = raw["verdict"]
        if e is None:
            if name == OVER_LINE:                # a first reading that is a violation has to prove itself first
                self._d[bay] = {"held": {**raw, "verdict": NOT_JUDGED, "reason_text": "Checking how it is parked"},
                                "cand": OVER_LINE, "since": now, "raw": raw}
            else:
                self._d[bay] = {"held": raw, "cand": name, "since": now, "raw": raw}
            return self._d[bay]["held"]
        if name == e["held"]["verdict"] and e["held"]["reason_text"] != "Checking how it is parked":
            e.update(held=raw, cand=name, since=now, raw=raw)           # the same verdict again: keep its latest numbers
            return raw
        if name != e["cand"]:
            e.update(cand=name, since=now)                              # a different one: start timing it
        e["raw"] = raw
        need = self.to_over_s if name == OVER_LINE else self.to_other_s
        if now - e["since"] >= need:
            e.update(held=raw, cand=name)
        return e["held"]


def stream_status(age_received: Optional[float], age_processed: Optional[float],
                  error: str = "", stale_after: float = STALE_AFTER_S) -> str:
    """How healthy the feed is.  Ages are seconds since a frame arrived / was processed."""
    if age_received is None:
        return STREAM_NOT_STARTED
    if age_received >= stale_after:
        return STREAM_OFFLINE
    if age_processed is None or age_processed >= stale_after:
        return STREAM_ERROR if error else STREAM_STALE
    return STREAM_LIVE


MAX_OVERRIDE_MIN = 60


class Overrides:
    """
    What an operator says about a bay ("it is vacant", "it is occupied") when the camera cannot tell.
    It lasts a few minutes, and ends early the moment the detector's own debounced state for that bay
    changes: new evidence from the camera always wins over a hand-set answer.
    """

    def __init__(self):
        self._d: dict[str, dict] = {}

    def set(self, bay_id: str, status: str, base_state: str, minutes: float, now: Optional[float] = None) -> dict:
        if status not in (VACANT, OCCUPIED):
            raise ValueError("status must be VACANT or OCCUPIED")
        now = time.time() if now is None else now
        minutes = min(MAX_OVERRIDE_MIN, max(1.0, float(minutes)))
        self._d[bay_id] = {"status": status, "base_state": base_state, "set_at": now, "until": now + minutes * 60}
        return dict(self._d[bay_id])

    def clear(self, bay_id: str) -> bool:
        return self._d.pop(bay_id, None) is not None

    def active(self, details: dict, now: Optional[float] = None) -> dict:
        """The overrides still in force; expired ones, ones for bays that are gone and ones the
        detector has since contradicted are dropped here."""
        now = time.time() if now is None else now
        for bid in list(self._d):
            o = self._d[bid]
            d = details.get(bid)
            if now >= o["until"] or d is None or d.get("state") != o["base_state"]:
                del self._d[bid]
        return {k: dict(v) for k, v in self._d.items()}


def compose_bays(details: dict, *, stale: bool = False, low_light: bool = False,
                 moved: bool = False, now: Optional[float] = None, overrides: Optional[dict] = None,
                 blocked: Optional[dict] = None) -> dict:
    """
    details: {bay_id: {"state", "since", "confidence", "agreement", "seen_vehicle"}} from the engine.
    overrides: {bay_id: {"status", "until"}} from Overrides.active().
    blocked: {bay_id: the bay whose car lies over it}.  A bay that is free but blocked is Occupied (flag "blocked"):
    nobody can park in it.
    Returns {bay_id: {...}} with the old `state` kept and `status`, `flag`, `since`, `reason`... added.
    """
    now = time.time() if now is None else now
    overrides = overrides or {}
    blocked = blocked or {}
    out = {}
    for bid, d in details.items():
        raw = d.get("state", "unknown")
        status, flag, code = status_of(raw)
        last_status = None
        until = None
        if bid in overrides:
            last_status, status, flag, code = status, overrides[bid]["status"], "operator", "operator"
            until = overrides[bid]["until"]
        else:
            if moved:
                last_status, status, flag, code = status, UNCERTAIN, None, "camera_moved"
            elif low_light and not d.get("seen_vehicle") and status != UNCERTAIN:
                # Dark.  An empty bay is still empty if it can be SEEN to be (night.bay_visibility), or if it was empty when the light
                # went and no car has come in since (night.NightMemory).  Anything else: too dark to say.
                nt = d.get("night") or {}
                if status == VACANT and nt.get("seen_empty"):
                    code = "night_seen"
                elif status == VACANT and nt.get("carry"):
                    code = "night_carry"
                else:
                    last_status, status, flag, code = status, UNCERTAIN, None, "low_light"
            if stale:
                # No picture any more.  What the bay "last was" is what we last TRUSTED: a bay that was
                # unclear because the camera had moved stays unclear, it does not fall back to the raw reading.
                last_status, status, flag, code = status, STALE, None, "stale"
        reason_text = REASON_TEXT[code]
        blocked_by = None
        by = blocked.get(bid) or d.get("blocked_by")           # the caller's map, or what the engine's details carry
        if status == VACANT and by and bid not in overrides:
            # free by the camera, but a car parked across two bays lies over this one
            status, flag, code, blocked_by = OCCUPIED, "blocked", "blocked", by
            reason_text = f"Blocked by the car in {_bay_name(blocked_by)}"
        parking = None
        if status == OCCUPIED and bid not in overrides and "parking" in d and blocked_by is None:
            # (a blocked bay has no car of its own to judge: the live feed's details always carry a "parking" entry, and judging it
            # wiped "Blocked by the car in Bay-05" and made the page say "a car is parked here" beside a label that said "Free")
            # With 3D evidence the public flag follows the trusted verdict, not the engine's raw guess.
            parking = d.get("parking_final") or parking_verdict(d["parking"], raw)       # the held verdict, when the feed keeps one
            v = parking["verdict"]
            flag = {OVER_LINE: "wrong", CLOSE_TO_LINE: "suspicious"}.get(v)
            if v in JUDGED:
                code = {OVER_LINE: "wrong", CLOSE_TO_LINE: "suspicious", CORRECT: "parked_ok"}[v]
                reason_text = parking["reason_text"]
            elif raw != "occluded":
                code = "parked"                         # not judged: say only that a car is there, never the engine's guess
                reason_text = REASON_TEXT[code]
        since = d.get("since")
        item = {
            "state": raw,
            "status": status,
            "flag": flag,
            "reason": code,
            "reason_text": reason_text,
            # with the zone ("...+00:00"): the server runs on UTC and an operator's browser on IST.  Without it the browser
            # read the server's clock as its own and the Vehicles page said a car arrived 5 h 30 min before it did.
            "since": None if since is None else datetime.fromtimestamp(since).astimezone().isoformat(timespec="seconds"),
            "since_epoch": since,
            "held_s": None if since is None else max(0, round(now - since)),
            "confidence": d.get("confidence"),
            "agreement": d.get("agreement"),
        }
        if parking is not None:
            item["parking"] = parking
        if blocked_by is not None:
            item["blocked_by"] = blocked_by
        if last_status:
            item["last_status"] = last_status
        if until is not None:
            item["override_until"] = datetime.fromtimestamp(until).astimezone().isoformat(timespec="seconds")
        out[bid] = item
    return out


def summarize(bays: dict) -> dict:
    """Counts that always add up: vacant + occupied + uncertain + stale == total."""
    vals = list(bays.values())
    occupied = [b for b in vals if b["status"] == OCCUPIED]
    uncertain = sum(1 for b in vals if b["status"] == UNCERTAIN)
    flagged = sum(1 for b in occupied if b.get("flag") in ("wrong", "suspicious"))      # not "operator"
    verdicts = [(b.get("parking") or {}).get("verdict") for b in occupied]
    return {
        "total": len(vals),
        "vacant": sum(1 for b in vals if b["status"] == VACANT),
        "occupied_confirmed": len(occupied),
        "uncertain": uncertain,
        "stale": sum(1 for b in vals if b["status"] == STALE),
        "flagged": flagged,
        "review": flagged + uncertain,
        # how the occupied bays are parked (only those with 3D evidence are counted here)
        "parked_correctly": verdicts.count(CORRECT),
        "close_to_line": verdicts.count(CLOSE_TO_LINE),
        "over_line": verdicts.count(OVER_LINE),
        "not_judged": verdicts.count(NOT_JUDGED),
        "blocked": sum(1 for b in occupied if b.get("flag") == "blocked"),     # counted in occupied_confirmed too
    }


class MoveDetector:
    """
    Notices that the camera has been knocked or re-aimed, which would put every saved bay in the
    wrong place.  The frame is compared with a small reference picture taken when the bays were
    saved.  Only a confident sideways/vertical shift counts; a weak match (night against day,
    a different scene) says nothing, so a change of light never raises a false alarm.
    """

    WIDTH = 160                 # comparison size
    MIN_RESPONSE = 0.20         # phase-correlation peak strength needed to trust a measured shift (the same view scores
                                # 0.4-0.6, even with cars coming and going; two unrelated pictures reach about 0.13)
    CONFIRM = 2                 # consecutive checks that agree before the verdict changes

    def __init__(self, move_frac: float = MOVE_PX_FRAC):
        self.move_frac = move_frac
        self._ref = None
        self._win = None
        self.moved = False
        self._streak = 0
        self.last_shift_frac: Optional[float] = None
        self.last_response: Optional[float] = None
        self.last_checked: Optional[float] = None
        self.checks = 0

    def report(self) -> dict:
        """What the last comparison saw, for the operator: shift as a share of the picture width, how sure the match was."""
        now = time.time()
        return {"moved": self.moved, "shift_pct": None if self.last_shift_frac is None else round(self.last_shift_frac * 100, 2),
                "limit_pct": round(self.move_frac * 100, 2), "response": self.last_response, "min_response": self.MIN_RESPONSE,
                "checks": self.checks, "checked_s_ago": None if self.last_checked is None else round(now - self.last_checked, 1)}

    @classmethod
    def thumbnail(cls, frame):
        """Small grey picture, light-normalised, used for the comparison and saved as the reference."""
        import cv2
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
        h = max(1, round(grey.shape[0] * cls.WIDTH / grey.shape[1]))
        small = cv2.resize(grey, (cls.WIDTH, h), interpolation=cv2.INTER_AREA)
        return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4)).apply(small)

    @property
    def has_reference(self) -> bool:
        return self._ref is not None

    def set_reference(self, frame) -> bytes:
        """Use `frame` as the 'camera is where it should be' picture; returns it as PNG bytes to store."""
        import cv2
        import numpy as np
        thumb = self.thumbnail(frame)
        self._load(thumb)
        ok, png = cv2.imencode(".png", thumb)
        self.moved, self._streak = False, 0
        return png.tobytes() if ok else b""

    def load_reference_png(self, png: bytes) -> bool:
        import cv2
        import numpy as np
        thumb = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
        if thumb is None or thumb.size == 0:
            return False
        self._load(thumb)
        return True

    def _load(self, thumb) -> None:
        import cv2
        import numpy as np
        self._ref = np.float32(thumb)
        self._win = cv2.createHanningWindow((thumb.shape[1], thumb.shape[0]), cv2.CV_32F)

    def check(self, frame) -> bool:
        """Compare a live frame with the reference; returns whether the camera is judged moved."""
        import cv2
        import numpy as np
        if self._ref is None:
            return False
        thumb = self.thumbnail(frame)
        if thumb.shape != self._ref.shape:
            thumb = cv2.resize(thumb, (self._ref.shape[1], self._ref.shape[0]))
        # OpenCV 5 multiplies its first argument by the window in place.  Handed the stored reference itself it faded by
        # about 7% of its peak response at every check (one every 30 s), until the response sank under MIN_RESPONSE and
        # the verdict froze for good, "moved" or "ok", whatever the camera did.  Give it a copy, always.
        (dx, dy), response = cv2.phaseCorrelate(self._ref.copy(), np.float32(thumb), self._win.copy())
        shift = float(np.hypot(dx, dy)) / self._ref.shape[1]
        self.last_shift_frac, self.last_response = round(shift, 4), round(float(response), 3)
        self.last_checked = time.time()
        self.checks += 1
        if response < self.MIN_RESPONSE:
            return self.moved                       # not enough in common to say: keep the verdict
        verdict = shift >= self.move_frac
        if verdict == self.moved:
            self._streak = 0
        else:
            self._streak += 1
            if self._streak >= self.CONFIRM:
                self.moved, self._streak = verdict, 0
        return self.moved


class FpsMeter:
    """Processed frames per second over the last few seconds."""

    def __init__(self, window_s: float = 10.0, keep: int = 64):
        self.window_s = window_s
        self._t: deque = deque(maxlen=keep)

    def tick(self, t: Optional[float] = None) -> None:
        self._t.append(time.time() if t is None else t)

    def fps(self, now: Optional[float] = None) -> float:
        now = time.time() if now is None else now
        recent = [t for t in self._t if now - t <= self.window_s]
        if len(recent) < 2 or recent[-1] == recent[0]:
            return 0.0
        return round((len(recent) - 1) / (recent[-1] - recent[0]), 2)
