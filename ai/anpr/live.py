"""
Live phone-camera test: IN/OUT counting and a snapshot anyone can read.

A phone posts a frame about once a second.  A worker thread per camera runs the
vehicle pipeline on the newest frame only (older unprocessed frames are dropped,
so a slow CPU falls behind in frame rate, not in time), counts cars crossing the
entry line, and keeps the latest numbers and annotated picture for the public page.

Three parts, kept separate so the logic can be tested without a model:

    LineCounter        which side of the line each track is on; counts IN / OUT
    LiveSession        frame slot, worker thread, snapshot, event log
    is_public_allowed  what a request arriving through the tunnel may touch
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import math
import os
import re
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from status import (CORRECT, JUDGED, NOT_JUDGED, OVER_LINE, STALE_AFTER_S, STREAM_ERROR, STREAM_LIVE,
                    STREAM_NOT_STARTED, STREAM_OFFLINE, STREAM_STALE, FpsMeter, Overrides, compose_bays,
                    stream_status, summarize)

# How often the log gets a one-line occupancy sample (seconds); ANPR_LOG_SAMPLE_S changes it.
try:
    LOG_SAMPLE_S = float(os.environ.get("ANPR_LOG_SAMPLE_S", 60))
except ValueError:
    LOG_SAMPLE_S = 60.0

# The cars "inside" are the cars in the bays when the bays are all clear to read (a lot with no aisle parking): the line
# can double-count a car whose track id changed, and a restart loses what was inside.  ANPR_INSIDE_FROM_BAYS=0 turns it off.
INSIDE_FROM_BAYS = os.environ.get("ANPR_INSIDE_FROM_BAYS", "1") != "0"
FREEZE_AFTER_SAME = int(os.environ.get("ANPR_FREEZE_AFTER_SAME", "10"))      # identical uploads in a row = a frozen camera
ANCHOR_QUIET_S = 120.0          # no car across the line this long: nobody is on the way in or out

# Ids at or above this come from tracker.py when ByteTrack has not assigned one
# yet.  They change every frame, so they cannot be followed across the line.
SYNTHETIC_ID_START = 9000


# ---------------------------------------------------------------- line counter

class LineCounter:
    """
    Counts cars crossing a line drawn on the image.

    The side of a track is judged from the bottom-centre of its box, which sits
    near the ground, not from the box centre, which floats with the car's height.
    A track must move `min_cross_px` past the line before its side changes, so a
    car idling on the line does not flip back and forth, and a crossing is counted
    at most once per `cooldown_s` per track.
    """

    def __init__(self, p1, p2, in_point, start_count: int = 0,
                 min_cross_px: float = 12.0, cooldown_s: float = 3.0,
                 expire_s: float = 10.0):
        self.p1 = (float(p1[0]), float(p1[1]))
        self.p2 = (float(p2[0]), float(p2[1]))
        dx, dy = self.p2[0] - self.p1[0], self.p2[1] - self.p1[1]
        self._length = float(np.hypot(dx, dy))
        if self._length < 1.0:
            raise ValueError("line points are the same point")
        self.in_point = (float(in_point[0]), float(in_point[1]))
        self._in_sign = 1 if self._signed_distance(self.in_point) > 0 else -1
        self.start_count = int(start_count)
        self.min_cross_px = float(min_cross_px)
        self.cooldown_s = float(cooldown_s)
        self.expire_s = float(expire_s)
        self.count_in = 0
        self.count_out = 0
        self._side: dict[int, int] = {}
        self._last_seen: dict[int, float] = {}
        self._last_count: dict[int, float] = {}

    def _signed_distance(self, pt) -> float:
        """Pixels from the line; positive on one side, negative on the other."""
        (x1, y1), (x2, y2) = self.p1, self.p2
        cross = (x2 - x1) * (pt[1] - y1) - (y2 - y1) * (pt[0] - x1)
        return cross / self._length

    @property
    def inside(self) -> int:
        return max(0, self.start_count + self.count_in - self.count_out)

    def reset(self, start_count: Optional[int] = None):
        if start_count is not None:
            self.start_count = int(start_count)
        self.count_in = 0
        self.count_out = 0
        self._side.clear()
        self._last_seen.clear()
        self._last_count.clear()

    def update(self, tracks, now: Optional[float] = None) -> list[dict]:
        """
        `tracks`: objects with track_id and x1, y1, x2, y2.
        Returns the crossings found in this call: {"type": "in"|"out", "track_id": n, "t": ts}.
        """
        now = time.time() if now is None else now
        events: list[dict] = []

        for tv in tracks:
            tid = int(tv.track_id)
            if tid >= SYNTHETIC_ID_START:
                continue
            foot = ((tv.x1 + tv.x2) / 2.0, tv.y2)
            d = self._signed_distance(foot)
            self._last_seen[tid] = now

            if abs(d) < self.min_cross_px:
                continue                      # on the line: keep the side it came from
            side = 1 if d > 0 else -1
            prev = self._side.get(tid)
            self._side[tid] = side
            if prev is None or prev == side:
                continue                      # first sighting, or still on the same side
            if now - self._last_count.get(tid, -1e9) < self.cooldown_s:
                continue

            self._last_count[tid] = now
            if side == self._in_sign:
                self.count_in += 1
                events.append({"type": "in", "track_id": tid, "t": now})
            else:
                self.count_out += 1
                events.append({"type": "out", "track_id": tid, "t": now})

        for tid in [t for t, ts in self._last_seen.items() if now - ts > self.expire_s]:
            self._last_seen.pop(tid, None)
            self._side.pop(tid, None)
            self._last_count.pop(tid, None)
        return events

    def config(self) -> dict:
        return {"p1": list(self.p1), "p2": list(self.p2), "in_point": list(self.in_point),
                "start_count": self.start_count}


# ---------------------------------------------------------------- live session

class LiveSession:
    """
    One camera's live feed.

    `process(frame, session)` is supplied by app.py (it owns the models and the bay
    maps) and returns a dict:

        tracked    list of TrackedVehicle
        summary    bay summary dict ({} when no bays are drawn)
        bays       {bay_id: state string}
        bay_events [{"event": ..., "bay_id": ...}]
        annotated  BGR image to show
        plates     [{"track_id": n, "plate": "MH12AB1234", "box": (x1, y1, x2, y2)}]
        layout     optional {"size": [w, h], "bays": {bay_id: [[x, y], ...]}} for the viewer's map
    """

    EVENT_RING = 50

    def __init__(self, camera_id: str, process: Callable[[np.ndarray, "LiveSession"], dict],
                 log_dir: Path):
        self.camera_id = camera_id
        self._process = process
        self._log_dir = Path(log_dir)
        self.counter: Optional[LineCounter] = None
        # Plate OCR is the slow part, so app.py runs it sparingly: only for vehicles that
        # have no plate yet, a few at a time.  These two fields are its bookkeeping.
        self.read_plates = True
        # called (from the worker thread) after an IN or OUT is counted, so the totals can be saved
        self.on_counts: Optional[Callable[[], None]] = None
        self.plate_tries: dict[int, int] = {}
        self.plate_guess: dict[int, str] = {}      # unvalidated reads, shown as guesses only
        self.last_plate_try = 0.0

        self._cv = threading.Condition()
        self._slot: Optional[np.ndarray] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False

        self._lock = threading.Lock()
        self._events: deque = deque(maxlen=self.EVENT_RING)
        self._state: dict = {}
        self._jpeg: bytes = b""
        self._jpeg_local: bytes = b""     # same picture with the plate text, never public
        self._plates: list[dict] = []
        self._raw_jpeg: bytes = b""
        self.last_frame_at = 0.0
        self._uploads: deque = deque(maxlen=60)    # (ms, bytes) of the phone's recent uploads, as it timed them
        self._phone: deque = deque(maxlen=60)      # (ms since its last picture, ms to draw and encode, page hidden) as the phone timed them
        self._last_hash: Optional[bytes] = None
        self._same_run = 0                 # how many pictures in a row were byte-for-byte the one before
        self.last_done_at = 0.0            # when a frame was last processed successfully
        self.frames_in = 0
        self.frames_done = 0
        self.last_error = ""
        self._ms: deque = deque(maxlen=10)
        self._fps = FpsMeter()
        self.last_move_check = 0.0         # app.py compares the view with the saved reference now and then
        # per-bay facts from the engine, the light level and whether the camera has moved; the
        # public per-bay status is worked out from these each time the state is asked for
        self._details: dict = {}
        self._light = "ok"
        self._calibration = "ok"
        self._move_check = None
        self._last_cross_t = 0.0               # when a car last crossed the line
        self._gap_prev: Optional[int] = None   # the counter-versus-bays gap seen at the last sample
        self.hook_errors: dict[str, dict] = {}   # hook name -> {count, last traceback, t}: kept for tests and a debugger, never published
        self._hook_logged: dict[str, float] = {}
        self.counter_fixes = 0                 # how many times the count had to be put right
        self.last_gap = 0                      # by how much it was wrong the last time
        self.overrides = Overrides()          # what an operator has said about a bay, for a while
        self._last_health: Optional[str] = None
        self._ever_live = False
        self._last_sample = 0.0                # when the log last got its one-line occupancy sample
        self._verdicts: dict = {}              # bay -> last trusted parking verdict (see _parking_events)
        self._site_cal: Optional[dict] = None  # the fitted camera in a few numbers, for the viewer
        # the full-resolution photo: the phone is asked for one now and then (and when an operator wants one)
        self.last_still_at = 0.0
        self.still_requested = False
        self._still_asked_at = 0.0
        # hooks for the management side (app.py sets them; they run on the worker thread and must never break the feed):
        #   on_event(event, clean_picture, layout) for each event of the timeline and the log,
        #   on_minute(slots, now) each time the log gets its occupancy sample
        self.on_event: Optional[Callable[[dict, Optional[np.ndarray], Optional[dict]], None]] = None
        self.on_minute: Optional[Callable[[dict, float], None]] = None
        self._last_slots: dict = {}

    # ---- full-resolution photo

    STILL_ASK_GAP_S = 20.0                 # do not ask again while the last request may still be on its way

    def want_still(self, now: float, every_s: float) -> bool:
        """True when the phone's next reply should ask it for a full-resolution photo."""
        if now - self._still_asked_at < self.STILL_ASK_GAP_S:
            return False
        if self.still_requested or (every_s > 0 and now - self.last_still_at >= every_s):
            self._still_asked_at = now
            return True
        return False

    def got_still(self, now: float) -> None:
        self.last_still_at = now
        self.still_requested = False

    # ---- input

    def submit(self, frame: np.ndarray, raw_jpeg: bytes = b"") -> None:
        """Hand over the newest frame, replacing one that has not been processed yet."""
        with self._lock:
            self.frames_in += 1
            # A phone whose camera has frozen keeps uploading the last picture it had (28 Oct: 8 uploads in a row, the same
            # md5, and the page said "Live" for as long as it went on).  A real camera never sends the same JPEG twice
            # (sensor noise), so a long run of identical ones is a frozen camera: it is not a new picture, does not make the
            # feed "live", and is not processed again.
            digest = hashlib.md5(raw_jpeg).digest() if raw_jpeg else None
            self._same_run = self._same_run + 1 if (digest is not None and digest == self._last_hash) else 0
            self._last_hash = digest
            if self._same_run >= FREEZE_AFTER_SAME:
                return
            self.last_frame_at = time.time()
            if raw_jpeg:
                self._raw_jpeg = raw_jpeg
        with self._cv:
            self._slot = frame
            self._cv.notify()
        self._ensure_thread()

    def note_upload(self, ms: float, size: int) -> None:
        """How long the phone says its last picture took to upload (its own stopwatch), with that picture's size."""
        if 0 < ms < 600_000:
            with self._lock:
                self._uploads.append((float(ms), int(size)))

    def note_phone(self, tick_ms: float, enc_ms: float, hidden: bool) -> None:
        """What the phone page says about its own loop: the time since its last picture was taken, how long drawing and encoding this one
        took, and whether the page was hidden.  30 Oct: the pictures came every 5.0 s exactly with uploads of 0.2 s, and nothing on the
        server could say why."""
        if 0 <= tick_ms < 600_000 and 0 <= enc_ms < 600_000:
            with self._lock:
                self._phone.append((float(tick_ms), float(enc_ms), bool(hidden)))

    def uplink(self) -> Optional[dict]:
        with self._lock:
            ups = list(self._uploads)
            ph = list(self._phone)
        if not ups:
            return None
        ms = sorted(u[0] for u in ups)
        total_kbit, total_s = sum(u[1] for u in ups) * 8 / 1000.0, sum(u[0] for u in ups) / 1000.0
        out = {"last_ms": round(ups[-1][0]), "p50_ms": round(ms[len(ms) // 2]), "p95_ms": round(ms[min(len(ms) - 1, int(len(ms) * 0.95))]),
               "worst_ms": round(ms[-1]), "kbps": round(total_kbit / total_s) if total_s else None, "n": len(ups)}
        ticks = sorted(p[0] for p in ph if p[0] > 0)
        if ticks:
            enc = sorted(p[1] for p in ph)
            out["phone"] = {"tick_p50_ms": round(ticks[len(ticks) // 2]), "tick_p95_ms": round(ticks[min(len(ticks) - 1, int(len(ticks) * 0.95))]),
                            "encode_p50_ms": round(enc[len(enc) // 2]), "encode_worst_ms": round(enc[-1]),
                            "hidden_share": round(sum(1 for p in ph if p[2]) / len(ph), 2), "n": len(ph)}
        return out

    @property
    def frozen(self) -> bool:
        """The phone is uploading the same picture again and again (its camera has frozen)."""
        return self._same_run >= FREEZE_AFTER_SAME

    def _ensure_thread(self):
        if self._thread and self._thread.is_alive():
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True,
                                        name=f"live-{self.camera_id}")
        self._thread.start()

    def stop(self):
        self._running = False
        with self._cv:
            self._cv.notify_all()

    def is_active(self, within_s: float = 10.0) -> bool:
        return (time.time() - self.last_frame_at) < within_s

    # ---- config

    def set_line(self, p1, p2, in_point, start_count: Optional[int] = None) -> None:
        keep = self.counter.inside if self.counter else 0       # a new line counts from zero, with the cars that are inside now
        counter = LineCounter(p1, p2, in_point,
                              start_count=keep if start_count is None else start_count)
        with self._lock:
            self.counter = counter

    def reset(self, start_count: Optional[int] = None) -> None:
        with self._lock:
            if self.counter:
                # a reset zeroes everything.  It used to keep the old start figure, and once the bays had corrected that to e.g. -29 the
                # next entries were swallowed (inside is never below 0) until the following correction; the bays correct it again within
                # minutes, from a clean zero.
                self.counter.reset(0 if start_count is None else start_count)
            self._events.clear()
            self.plate_tries.clear()
            self.plate_guess.clear()

    # ---- worker

    def _loop(self):
        while self._running:
            with self._cv:
                if self._slot is None and self._running:
                    self._cv.wait(timeout=1.0)
                frame, self._slot = self._slot, None
            if frame is None:
                self._watch()                            # no picture this second: still notice an outage
                continue
            t0 = time.time()
            try:
                out = self._process(frame, self)
                self._finish(frame, out, t0)
                with self._lock:
                    self.last_error = ""                 # a frame went through: the feed is healthy again
            except Exception as e:                       # one bad frame must not kill the feed
                with self._lock:
                    self.last_error = f"{type(e).__name__}: {e}"

    def _watch(self) -> None:
        """Called every second the worker has no picture: records the feed going quiet in the log even when
        nobody has the page open (the timeline and the log would otherwise only learn of it on the next poll)."""
        now = time.time()
        with self._lock:
            age = (now - self.last_frame_at) if self.last_frame_at else None
            age_done = (now - self.last_done_at) if self.last_done_at else None
            noted = self._note_health(stream_status(age, age_done, self.last_error), now)
        if noted:
            self._log([noted])

    def _parking_events(self, details: dict, light: str, calibration: str, now: float) -> list[dict]:
        """
        "Parked over the line" / "Parked correctly again" for the timeline and the log.  Only when the trusted
        verdict (status.parking_verdict) changes: a bay that merely goes in and out of "not judged" (the outline of
        the car missing for a moment) keeps its last verdict, so it never repeats an alarm.  The first verdict seen
        after a start-up is not news either.
        """
        slots = compose_bays(details, low_light=(light == "low"), moved=(calibration == "moved"), now=now)
        events = []
        for bid, item in slots.items():
            p = item.get("parking")
            verdict = None if p is None else p["verdict"]
            if verdict == NOT_JUDGED:
                continue
            key = verdict or "none"
            prev = self._verdicts.get(bid)
            self._verdicts[bid] = key
            if prev is None or prev == key:
                continue
            if key == OVER_LINE:
                events.append({"t": now, "type": "parking_over_line", "bay_id": bid, "detail": p["reason_text"],
                               "crossing_m": p.get("crossing_m"), "side": p.get("side")})
            elif key == CORRECT and prev == OVER_LINE:
                events.append({"t": now, "type": "parking_ok", "bay_id": bid})
        for bid in [b for b in self._verdicts if b not in slots]:
            del self._verdicts[bid]                                   # the layout changed: forget bays that are gone
        return events

    def _hook_failed(self, name: str) -> None:
        """A hook (the registers, the minute tidy-up, saving the counts) raised.  The feed carries on; the traceback goes to the journal
        (at most once a minute per hook), so a hook that fails every time cannot hide: the overstay clock was dead for a day, and with
        it the daily clean-up, because nothing said so."""
        import traceback
        now = time.time()
        self.hook_errors[name] = {"count": self.hook_errors.get(name, {}).get("count", 0) + 1, "last": f"{traceback.format_exc(limit=3)}"[-400:],
                                  "t": now}
        if now - self._hook_logged.get(name, 0) >= 60:
            self._hook_logged[name] = now
            print(f"[{self.camera_id}] hook {name} failed:\n{traceback.format_exc()}", flush=True)

    def _anchor_counter(self, now: float) -> Optional[dict]:
        """
        Put the "inside" count right when the bays say otherwise.  Measured on 27 Oct: the counter said 1 inside while 4
        cars stood in the bays, and the day's in/out totals drifted by +4, -2 and +2.  The bays are what the camera sees,
        so when every bay is clear to read, nobody has crossed the line for two minutes and the gap has held over two
        samples, the count is moved to the number of occupied bays.  Raw in/out totals are untouched.  Returns the log
        event (type counter_fixed) or None.
        """
        counter = self.counter
        if not INSIDE_FROM_BAYS or counter is None or not self._last_slots:
            return None
        statuses = [v["status"] for v in self._last_slots.values()]
        if any(s in ("UNCERTAIN", "STALE") for s in statuses) or now - self._last_cross_t < ANCHOR_QUIET_S:
            self._gap_prev = None
            return None
        # a free bay under a car that lies across it reads "occupied" (blocked), but it holds no car of its own: it is not one more inside
        occupied = sum(1 for v in self._last_slots.values() if v["status"] == "OCCUPIED" and v.get("flag") != "blocked")
        gap = counter.inside - occupied
        if gap == 0:
            self._gap_prev = None
            return None
        if self._gap_prev != gap:
            self._gap_prev = gap                       # first sight of this gap: wait for the next sample to agree
            return None
        counter.start_count = occupied - (counter.count_in - counter.count_out)
        self._gap_prev = None
        self.counter_fixes += 1
        self.last_gap = gap
        return {"t": now, "type": "counter_fixed", "gap": gap, "inside": occupied}

    def _sample(self, now: float) -> Optional[dict]:
        """One line of occupancy for the log, at most every LOG_SAMPLE_S; None when it is not time yet."""
        if now - self._last_sample < LOG_SAMPLE_S or not self._details:
            return None
        self._last_sample = now
        slots = compose_bays(self._details, low_light=(self._light == "low"), moved=(self._calibration == "moved"), now=now)
        words = {"VACANT": "available", "OCCUPIED": "occupied", "UNCERTAIN": "unclear", "STALE": "no signal"}
        self._last_slots = slots
        s = summarize(slots)
        rec = {"t": now, "type": "sample", "vacant": s["vacant"], "occupied": s["occupied_confirmed"],
               "unclear": s["uncertain"], "stale": s["stale"], "bays": {k: words[v["status"]] for k, v in slots.items()}}
        judged = {k: v["parking"]["verdict"] for k, v in slots.items() if (v.get("parking") or {}).get("verdict") in JUDGED}
        if judged:
            rec["parking"] = judged
        return rec

    def _finish(self, frame: np.ndarray, out: dict, t0: float):
        now = time.time()
        # the pixel space the boxes are in: the phone's own, unless the process resized the frame to the size the bays were drawn on
        pix_size = list(out.get("frame_size") or [int(frame.shape[1]), int(frame.shape[0])])
        new_events: list[dict] = []
        log_only: list[dict] = []                     # goes to the log but not to the page's timeline
        counter = self.counter
        if counter is not None:
            for ev in counter.update(out.get("tracked", []), now):
                new_events.append({"t": ev["t"], "type": ev["type"], "track_id": ev["track_id"]})
                self._last_cross_t = now
        for ev in out.get("bay_events", []):
            kind = ev.get("event")
            if kind in ("bay_occupied", "bay_freed"):
                if ev.get("previous") == "unknown":
                    # the first reading of a bay since start-up is what it is, not something that just happened
                    log_only.append({"t": now, "type": "bay_initial", "bay_id": ev.get("bay_id"), "track_id": ev.get("track_id"),
                                     "status": "occupied" if kind == "bay_occupied" else "available"})
                else:
                    new_events.append({"t": now, "type": kind, "bay_id": ev.get("bay_id"), "track_id": ev.get("track_id")})
        # the timeline also tells when the picture got too dark to judge, or the camera was moved
        light, calibration = out.get("light", "ok"), out.get("calibration", "ok")
        new_events += self._parking_events(out.get("bay_details") or {}, light, calibration, now)
        if light != self._light:
            new_events.append({"t": now, "type": "low_light" if light == "low" else "light_ok"})
        if calibration != self._calibration:
            mc = out.get("move_check") or {}
            new_events.append({"t": now, "type": "camera_moved" if calibration == "moved" else "camera_ok",
                               **({"shift_pct": mc["shift_pct"], "response": mc["response"]} if mc.get("shift_pct") is not None else {}),
                               **({"detail": f"The picture is now {mc['resized'][0]}x{mc['resized'][1]}; the bays were drawn on "
                                             f"{mc['layout'][0]}x{mc['layout'][1]}"} if mc.get("resized") else {})})

        # Visitors get the clean picture when the process made one (bay outlines only); the
        # technical picture (boxes, track numbers, % outside) stays for the operator.
        technical = self._draw_overlay(out["annotated"], counter)
        if out.get("annotated_clean") is not None:
            img = self._draw_overlay(out["annotated_clean"], counter, clean=True)
        else:
            img = technical
        ok, buf = cv2.imencode(".jpg", public_size(img), [cv2.IMWRITE_JPEG_QUALITY, 80])

        # The public picture carries no OCR text; the local one labels each plate.
        plates = [p for p in out.get("plates", []) if p.get("plate")]
        local = technical.copy()
        for p in plates:
            valid = p.get("valid", True)
            x1, y1 = int(p["box"][0]), int(p["box"][1])
            label = p["plate"] if valid else f"{p['plate']} ?"      # a guess is marked as one
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            top = max(0, y1 - th - 10)
            cv2.rectangle(local, (x1, top), (x1 + tw + 8, top + th + 8), (0, 0, 0), -1)
            cv2.putText(local, label, (x1 + 4, top + th + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (80, 255, 255) if valid else (0, 165, 255), 2, cv2.LINE_AA)
        ok_local, buf_local = cv2.imencode(".jpg", local, [cv2.IMWRITE_JPEG_QUALITY, 80])

        self._ms.append((time.time() - t0) * 1000)
        summary = out.get("summary") or {}
        state = {
            "camera_id": self.camera_id,
            "frame_size": pix_size,
            "vehicles_in_view": len(out.get("tracked", [])),
            "counts": ({"in": counter.count_in, "out": counter.count_out,
                        "inside": counter.inside} if counter else None),
            "line_set": counter is not None,
            "bays": {k: {"state": v} for k, v in (out.get("bays") or {}).items()},
            "layout": out.get("layout"),
            "bay_summary": {k: summary.get(k) for k in
                            ("total", "free", "occupied", "wrong_parking", "suspicious")
                            if k in summary},
            "ms_per_frame": round(sum(self._ms) / len(self._ms)),
            "updated_at": now,
        }
        bays_now = out.get("bays") or {}
        with self._lock:
            self.frames_done += 1
            self.last_done_at = now
            self._fps.tick(now)
            self._details = out.get("bay_details") or {k: {"state": v} for k, v in bays_now.items()}
            self._light = out.get("light", "ok")
            self._calibration = out.get("calibration", "ok")
            self._move_check = out.get("move_check")
            self._site_cal = out.get("site_calibration")
            sample = self._sample(now)
            fixed = self._anchor_counter(now) if sample else None
            if fixed:
                log_only.append(fixed)                           # to the log, not the page's timeline
            came_back = self._note_health(STREAM_LIVE, now)     # a picture was just processed: the feed is live (and a recovery is recorded)
            self._state = state
            if ok:
                self._jpeg = buf.tobytes()
            if ok_local:
                self._jpeg_local = buf_local.tobytes()
            self._plates = [{"track_id": p["track_id"], "plate": p["plate"],
                             "valid": p.get("valid", True)} for p in plates]
            for ev in new_events:
                self._events.append(ev)
        self._log(new_events + log_only + ([sample] if sample else []) + ([came_back] if came_back else []))
        if self.on_event:
            boxes = {int(t.track_id): (t.x1, t.y1, t.x2, t.y2) for t in out.get("tracked", []) if getattr(t, "track_id", None) is not None}
            shapes = {int(t.track_id): getattr(t, "contact_shape", None) for t in out.get("tracked", []) if getattr(t, "track_id", None) is not None}
            for ev in new_events + log_only:
                if (ev.get("type") == "bay_occupied" or (ev.get("type") == "bay_initial" and ev.get("status") == "occupied")) \
                        and ev.get("track_id") in boxes:
                    # where the car is in this picture, for the hook only (the log and the timeline do not carry it)
                    ev = {**ev, "box": [float(v) for v in boxes[int(ev["track_id"])]], "frame_size": pix_size}
                    outline = simplify_outline(shapes.get(int(ev["track_id"])))
                    if outline:
                        ev["outline"] = outline            # the car's own shape: which plate in a close-up is ITS plate, not a neighbour's
                try:
                    self.on_event(ev, out.get("annotated_clean"), out.get("layout"))
                except Exception:
                    self._hook_failed("on_event")            # the register must never break the feed, but it must not fail unseen
        if self.on_minute and sample:
            try:
                self.on_minute(self._last_slots, now)
            except Exception:
                self._hook_failed("on_minute")
        if self.on_counts and (fixed or any(ev["type"] in ("in", "out") for ev in new_events)):
            try:
                self.on_counts()
            except Exception:
                self._hook_failed("on_counts")               # saving must never break the feed

    def restore_counts(self, count_in: int, count_out: int) -> None:
        """Put saved IN/OUT totals back after a restart (needs the line to be set first)."""
        with self._lock:
            if self.counter:
                self.counter.count_in = max(0, int(count_in))
                self.counter.count_out = max(0, int(count_out))

    @staticmethod
    def _draw_overlay(img: np.ndarray, counter: Optional[LineCounter], clean: bool = False) -> np.ndarray:
        img = img.copy()
        if counter is None:
            return img
        if clean:
            # visitors: nothing.  The gate line lies along the kerb and cut across every bay; its counts are in the
            # page's tiles, and the operator's own picture still shows the line and the IN arrow.
            return img
        p1 = tuple(int(v) for v in counter.p1)
        p2 = tuple(int(v) for v in counter.p2)
        cv2.line(img, p1, p2, (255, 200, 0), 3, cv2.LINE_AA)
        # arrow from the middle of the line toward the IN side
        mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)
        d = counter._signed_distance(counter.in_point)
        nx, ny = (p2[1] - p1[1]), -(p2[0] - p1[0])           # a normal to the line
        norm = float(np.hypot(nx, ny)) or 1.0
        sign = 1 if d > 0 else -1
        # normal (nx, ny) points to the negative side; flip when IN is the positive side
        sx, sy = (-nx if sign > 0 else nx) / norm, (-ny if sign > 0 else ny) / norm
        tip = (int(mid[0] + sx * 45), int(mid[1] + sy * 45))
        cv2.arrowedLine(img, mid, tip, (0, 220, 0), 3, cv2.LINE_AA, tipLength=0.4)
        label = f"IN {counter.count_in}   OUT {counter.count_out}   INSIDE {counter.inside}"
        cv2.rectangle(img, (8, 8), (8 + 12 * len(label), 40), (0, 0, 0), -1)
        cv2.putText(img, label, (14, 31), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (255, 255, 255), 2, cv2.LINE_AA)
        return img

    def _log(self, events: list[dict]):
        """Append to live_logs/<camera>-<date>.jsonl so a test run can be reviewed later."""
        if not events:
            return
        try:
            self._log_dir.mkdir(parents=True, exist_ok=True)
            name = f"{self.camera_id}-{datetime.now():%Y%m%d}.jsonl"
            with open(self._log_dir / name, "a", encoding="utf-8") as f:
                for ev in events:
                    f.write(json.dumps({**ev, "iso": datetime.fromtimestamp(ev["t"]).isoformat(
                        timespec="seconds")}) + "\n")
        except OSError:
            pass                                             # logging must never break the feed

    # ---- output

    def set_override(self, bay_id: str, status: str, minutes: float = 15) -> dict:
        """An operator's answer for one bay.  KeyError if the bay is not one the camera knows."""
        with self._lock:
            d = self._details.get(bay_id)
            if d is None:
                raise KeyError(bay_id)
            o = self.overrides.set(bay_id, status, d.get("state"), minutes)
            ev = {"t": time.time(), "type": "operator", "bay_id": bay_id, "status": status}
            self._events.append(ev)
        self._log([ev])
        return o

    def note(self, event: dict) -> None:
        """Write an event to the log (not to the page's timeline); for the management side's own happenings."""
        self._log([event])

    def clear_override(self, bay_id: str) -> bool:
        with self._lock:
            cleared = self.overrides.clear(bay_id)
            if cleared:
                self._events.append({"t": time.time(), "type": "operator", "bay_id": bay_id, "status": "CLEARED"})
        return cleared

    def _note_health(self, health: str, now: float) -> Optional[dict]:
        """Record the feed going quiet or coming back (caller holds the lock); returns the new event.
        An outage is dated to when the frames stopped, not to when somebody next looked."""
        prev, self._last_health = self._last_health, (health if health != STREAM_NOT_STARTED else self._last_health)
        was_live = self._ever_live
        if health == STREAM_LIVE:
            self._ever_live = True                       # the first time it comes up is a start, not a recovery
        if prev is None or health == prev or health == STREAM_NOT_STARTED:
            return None
        ev = None
        if prev == STREAM_LIVE:
            t = min(now, max(self.last_frame_at, self.last_done_at) + STALE_AFTER_S)
            ev = {"t": t, "type": "feed_offline"}
        elif health == STREAM_LIVE and was_live:
            ev = {"t": now, "type": "feed_online"}
        if ev:
            self._events.append(ev)
        return ev

    def snapshot(self) -> dict:
        now = time.time()
        with self._lock:
            state = dict(self._state)
            age = (now - self.last_frame_at) if self.last_frame_at else None
            age_done = (now - self.last_done_at) if self.last_done_at else None
            err = self.last_error
            health = stream_status(age, age_done, err)
            noted = self._note_health(health, now)
            events = sorted(list(self._events)[-20:], key=lambda e: e["t"])
            line_set = self.counter is not None
            counts = ({"in": self.counter.count_in, "out": self.counter.count_out,
                       "inside": self.counter.inside} if self.counter else None)
            counter_check = {"corrected": self.counter_fixes, "last_gap": self.last_gap} if self.counter else None
            details, light, calibration = dict(self._details), self._light, self._calibration
            site_cal, move_check = self._site_cal, self._move_check
            overrides = self.overrides.active(details, now)
            fps = self._fps.fps(now)
            seq = self.frames_done
        if noted:
            self._log([noted])
        slots = compose_bays(details, stale=health in (STREAM_OFFLINE, STREAM_STALE, STREAM_ERROR),
                             low_light=(light == "low"), moved=(calibration == "moved"), now=now,
                             overrides=overrides)
        return {
            "camera_id": self.camera_id,
            "online": age is not None and age < 8.0,
            "age_s": None if age is None else round(age, 1),
            **state,
            # the line can be set before the first frame is processed
            "line_set": line_set,
            "counts": counts,
            "counter_check": counter_check,                 # how often "inside" had to be put right to match the bays, and by how much last time
            "events": events,
            "frozen": self.frozen,                          # the phone keeps sending one picture: its camera is stuck
            "uplink": self.uplink(),                        # how long the phone's recent uploads took (None until it reports)
            "frames_received": self.frames_in,
            "frames_processed": self.frames_done,
            "error": err,
            # how fresh and healthy the feed is, and the per-bay answer every page number comes from
            "stream_status": health,
            "frame_age_s": None if age_done is None else round(age_done, 1),
            "fps_processed": fps,
            "frame_seq": seq,
            "light": light,
            "calibration": calibration,
            "move_check": move_check,                      # what the last view-versus-reference comparison measured (None before the first)
            "slots": [{"id": bid, **item} for bid, item in slots.items()],
            "slot_summary": summarize(slots),
            "site_calibration": site_cal,                  # the 3D camera fitted from the bays (None until the first picture)
        }

    def jpeg(self, local: bool = False) -> bytes:
        """The latest picture; `local=True` is the one with plate text (local requests only)."""
        return self.jpeg_with_seq(local)[0]

    def jpeg_with_seq(self, local: bool = False) -> tuple[bytes, int]:
        """The picture and the number of the frame it belongs to (same as `frame_seq` in the state)."""
        with self._lock:
            return ((self._jpeg_local or self._jpeg) if local else self._jpeg), self.frames_done

    def plates(self) -> list[dict]:
        with self._lock:
            return list(self._plates)

    def raw_jpeg(self) -> bytes:
        with self._lock:
            return self._raw_jpeg


# ---------------------------------------------------------------- the picture shown to visitors

# BGR.  Free is green, a car in the bay red, a car that needs a look orange or amber.
_STATE_COLOR = {
    "free": (94, 197, 34), "occupied": (68, 68, 239), "correct": (68, 68, 239),
    "wrong": (60, 146, 251), "suspicious": (36, 165, 245),
    "occluded": (196, 160, 148), "unknown": (196, 160, 148),
    "uncertain": (36, 165, 245),         # the page's "Unclear" (too dark, or the view is blocked): amber, never green
    "blocked": (36, 165, 245),           # free, but a car parked across two bays lies over it
}


def simplify_outline(shape, max_points: int = 48):
    """A silhouette ((N, 2) pixels) as a short polygon [[x, y], ...] of at most `max_points`, or None when there is none."""
    if shape is None:
        return None
    try:
        pts = np.asarray(shape, np.float32).reshape(-1, 2)
        if len(pts) < 3:
            return None
        eps = 0.004 * float(cv2.arcLength(pts.reshape(-1, 1, 2), True))
        approx = cv2.approxPolyDP(pts.reshape(-1, 1, 2), eps, True).reshape(-1, 2)
        while len(approx) > max_points:
            eps *= 1.4
            approx = cv2.approxPolyDP(pts.reshape(-1, 1, 2), eps, True).reshape(-1, 2)
        return [[round(float(x), 1), round(float(y), 1)] for x, y in approx] if len(approx) >= 3 else None
    except (ValueError, cv2.error):
        return None


def enhance_for_display(frame: np.ndarray, target: float = 95.0) -> np.ndarray:
    """
    Lift a dark picture (night) so a person can see it.  Only for what visitors look at;
    detection always runs on the untouched frame.  A bright enough picture is returned as is.
    """
    mean = float(frame.mean())
    if mean >= 70.0:
        return frame
    gamma = math.log(target / 255.0) / math.log(max(mean, 1.0) / 255.0)
    gamma = min(1.0, max(0.45, gamma))
    lut = ((np.arange(256) / 255.0) ** gamma * 255.0).astype(np.uint8)
    out = cv2.LUT(frame, lut)
    lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
    lab[..., 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lab[..., 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def bay_label(bay_id: str) -> str:
    return f"P{bay_id}" if str(bay_id).isdigit() else str(bay_id)


_MARK_COLOR = {"ok": (94, 197, 34), "close": (36, 165, 245), "bad": (68, 68, 239),
               "taken": (68, 68, 239), "unclear": (196, 160, 148)}       # BGR: what the little icon on a bay's name shows


def _dashed_poly(img: np.ndarray, poly: np.ndarray, col, thick: int, dash: float, gap: float) -> None:
    """A closed outline drawn as dashes, so an empty bay reads as 'open' and a taken one as solid."""
    pts = poly.astype(np.float64)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        length = float(np.hypot(*(b - a)))
        if length < 1.0:
            continue
        d = 0.0
        while d < length:
            e = min(d + dash, length)
            p0, p1 = a + (b - a) * (d / length), a + (b - a) * (e / length)
            cv2.line(img, tuple(np.round(p0).astype(int)), tuple(np.round(p1).astype(int)), col, thick, cv2.LINE_AA)
            d += dash + gap


def _draw_icon(img: np.ndarray, mark: str, cx: int, cy: int, r: int, col) -> None:
    """The mark on a bay's name: a tick, an exclamation, a question mark or a plain dot, inside a coloured disc."""
    cv2.circle(img, (cx, cy), r, col, -1, cv2.LINE_AA)
    white, t = (255, 255, 255), max(1, int(round(r / 5)))
    if mark == "ok":
        cv2.polylines(img, [np.array([[cx - r * 0.5, cy + r * 0.05], [cx - r * 0.12, cy + r * 0.45],
                                      [cx + r * 0.55, cy - r * 0.4]]).astype(np.int32)], False, white, t, cv2.LINE_AA)
    elif mark in ("bad", "close"):
        cv2.line(img, (cx, int(cy - r * 0.55)), (cx, int(cy + r * 0.1)), white, t, cv2.LINE_AA)
        cv2.circle(img, (cx, int(cy + r * 0.5)), max(1, t // 2 + 1), white, -1, cv2.LINE_AA)
    elif mark == "unclear":
        cv2.putText(img, "?", (int(cx - r * 0.35), int(cy + r * 0.42)), cv2.FONT_HERSHEY_SIMPLEX, r / 13.0, white, t, cv2.LINE_AA)
    else:
        cv2.circle(img, (cx, cy), max(2, int(r * 0.3)), white, -1, cv2.LINE_AA)


def annotate_clean(frame: np.ndarray, bays: dict, states: dict, marks: Optional[dict] = None) -> np.ndarray:
    """
    The picture for visitors: each bay as a faint coloured area with a thin outline (dashed while it is free) and a small
    name pill below its near edge, nothing else.  No detection boxes, track numbers or percentages (those are for the
    operator and come from the technical picture).
    `bays` is {id: [[x, y], ...]} in pixels of this frame, `states` {id: "free"|"occupied"|...}.
    `marks` is {id: "ok"|"close"|"bad"|"taken"|"unclear"} for the icon on the name: a tick for a car parked
    correctly, ! for one at or over a line, ? for a bay that cannot be judged, a dot for a car with no verdict yet.
    A free bay gets the word Free instead of an icon.
    """
    img = frame.copy()
    h, w = img.shape[:2]
    k = max(0.6, w / 1280.0)
    marks = marks or {}
    tint = img.copy()
    polys = {}
    for bid, pts in bays.items():
        poly = np.array(pts, np.int32)
        polys[bid] = poly
        cv2.fillPoly(tint, [poly], _STATE_COLOR.get(states.get(bid, "unknown"), _STATE_COLOR["unknown"]))
    img = cv2.addWeighted(tint, 0.12, img, 0.88, 0)
    font, fscale, fthick = cv2.FONT_HERSHEY_SIMPLEX, 0.6 * k, max(1, int(round(1.5 * k)))
    placed = []                                    # the name pills already drawn, so a narrow far bay's name never lands on its neighbour's
    for bid, poly in polys.items():
        state = states.get(bid, "unknown")
        col = _STATE_COLOR.get(state, _STATE_COLOR["unknown"])
        edge = max(1, int(round(1.5 * k)))
        if state == "free":
            _dashed_poly(img, poly, col, edge, 9 * k, 6 * k)
        else:
            # under a car the bay's outline steps back: the car's own box is the main shape there
            cv2.polylines(img, [poly], True, col, max(1, int(round(1.0 * k))), cv2.LINE_AA)
        text = bay_label(bid) + (" Free" if state == "free" else " Blocked" if state == "blocked" else "")
        mark = marks.get(bid)
        (tw, th), base = cv2.getTextSize(text, font, fscale, fthick)
        r = int(round(th * 0.62))
        icon_w = (2 * r + 6) if mark else 0
        pw, ph = tw + 14 + icon_w, th + base + 8
        # The pill sits just below the bay's near edge (its two lowest corners, the road side), centred on it.  The
        # old spot, the top-left corner, landed on the neighbour's car whenever the bays lean (they do, in perspective).
        near = poly[np.argsort(poly[:, 1])[-2:]]
        x = int(min(max(near[:, 0].mean() - pw / 2, 2), w - pw - 2))
        y = int(min(max(near[:, 1].max() + 4 * k, 2), h - ph - 2))
        for _ in range(4):                         # far bays are narrow in perspective: drop a name below the one it would cover
            hit = next((r for r in placed if x < r[2] and x + pw > r[0] and y < r[3] and y + ph > r[1]), None)
            if hit is None:
                break
            y = int(min(hit[3] + 3, h - ph - 2))
        placed.append((x, y, x + pw, y + ph))
        pill = img.copy()
        cv2.rectangle(pill, (x, y), (x + pw, y + ph), (40, 24, 12), -1)
        img = cv2.addWeighted(pill, 0.7, img, 0.3, 0)
        tx = x + 7
        if mark:
            _draw_icon(img, mark, x + 5 + r, y + ph // 2, r, _MARK_COLOR.get(mark, _MARK_COLOR["unclear"]))
            tx = x + 5 + 2 * r + 6
        cv2.putText(img, text, (tx, y + th + 3), font, fscale, (255, 255, 255), fthick, cv2.LINE_AA)
    return img


_VERDICT_COLOR = {CORRECT: (94, 197, 34), "close_to_line": (36, 165, 245), OVER_LINE: (68, 68, 239),
                  "estimated": (235, 140, 40)}       # BGR: green, amber, red, blue (a box fitted to a car that is partly hidden)
_HALO = (20, 20, 20)


def _edge_line(img, p, q, col, thick, dashed=False, k=1.0):
    p, q = (int(p[0]), int(p[1])), (int(q[0]), int(q[1]))
    if not dashed:
        cv2.line(img, p, q, col, thick, cv2.LINE_AA)
        return
    length = float(np.hypot(q[0] - p[0], q[1] - p[1]))
    if length < 1:
        return
    k = max(k, 1.0)                    # the pattern keeps its gaps wider than the halo, even on a small picture
    d, step = 0.0, 17 * k                  # round line ends add half the thickness each side, so the gap is wide
    while d < length:
        a = (p[0] + (q[0] - p[0]) * d / length, p[1] + (q[1] - p[1]) * d / length)
        e = min(d + 7 * k, length)
        b = (p[0] + (q[0] - p[0]) * e / length, p[1] + (q[1] - p[1]) * e / length)
        cv2.line(img, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), col, thick, cv2.LINE_AA)
        d += step


def draw_clean_boxes(img: np.ndarray, boxes: list) -> np.ndarray:
    """
    The visitors' 3D box: each car as a solid-looking block, so it is clear which car a verdict is about.
    Green when it is parked correctly, amber when close to a line, red when over one, blue and dashed when the box is
    only an estimate (the car is partly hidden).  The faces turned to the camera are tinted (sides lightly, the roof a
    little more), every edge has a dark halo so it stays visible on a white car, the edge that crosses a line is drawn
    thick and red, and a car that is over a line carries a short tag ("13 cm over front", "across 2 bays").
    `boxes` is [{"verdict", "base": 4 x [x, y], "roof": 4 x [x, y]}] in pixels of this picture, and optionally
    "faces" (which of the 4 side faces are turned to the camera), "estimated", "edge" (the base edge that crosses a
    line) and "label".  Without "faces" the box is drawn as a thin frame (the older style).
    """
    if not boxes:
        return img
    h, w = img.shape[:2]
    k = max(0.6, w / 1280.0)
    out = img.copy()
    todo = []
    for b in boxes:
        col = _VERDICT_COLOR.get(b["verdict"])
        base, roof = np.asarray(b["base"], np.float64), np.asarray(b["roof"], np.float64)
        if col is None or not (np.isfinite(base).all() and np.isfinite(roof).all()):
            continue
        todo.append((b, col, np.round(base).astype(np.int32), np.round(roof).astype(np.int32)))
    if not todo:
        return img
    # 1. the tinted faces, blended in two layers: the sides, then the roofs a little stronger
    if any(b.get("faces") is not None for b, *_ in todo):
        sides = out.copy()
        for b, col, base_i, roof_i in todo:
            for i, shown in enumerate(b.get("faces") or []):
                if shown:
                    j = (i + 1) % 4
                    cv2.fillConvexPoly(sides, np.array([base_i[i], base_i[j], roof_i[j], roof_i[i]]), col)
        out = cv2.addWeighted(sides, 0.20, out, 0.80, 0)
        roofs = out.copy()
        for b, col, base_i, roof_i in todo:
            if b.get("faces") is not None:
                cv2.fillConvexPoly(roofs, roof_i, col)
        out = cv2.addWeighted(roofs, 0.30, out, 0.70, 0)
    # 2. the edges: a dark halo first, then the colour
    t = max(2, int(round(2 * k)))
    for b, col, base_i, roof_i in todo:
        dashed, faces = bool(b.get("estimated")), b.get("faces")
        lines = []
        for i in range(4):
            j = (i + 1) % 4
            lines.append((roof_i[i], roof_i[j]))
            if faces is None or faces[i] or faces[(i - 1) % 4]:           # a pillar between two faces, one at least visible
                lines.append((base_i[i], roof_i[i]))
            if faces is None or faces[i]:
                lines.append((base_i[i], base_i[j]))
        for p, q in lines:
            _edge_line(out, p, q, _HALO, t + 2, dashed, k)
        for p, q in lines:
            _edge_line(out, p, q, col, t, dashed, k)
        edge = b.get("edge")
        if edge is not None and b["verdict"] == OVER_LINE:                # the edge that crosses the line
            p, q = base_i[edge], base_i[(edge + 1) % 4]
            _edge_line(out, p, q, _HALO, t + 5, False, k)
            _edge_line(out, p, q, _VERDICT_COLOR[OVER_LINE], t + 2, False, k)
    # 3. the tags
    font, fscale, fthick = cv2.FONT_HERSHEY_SIMPLEX, 0.5 * k, max(1, int(round(1.4 * k)))
    for b, col, base_i, roof_i in todo:
        label = b.get("label")
        if not label:
            continue
        edge = b.get("edge")
        anchor = ((base_i[edge] + base_i[(edge + 1) % 4]) / 2.0 if edge is not None else base_i.mean(axis=0))
        (tw, th), bl = cv2.getTextSize(label, font, fscale, fthick)
        x = int(min(max(anchor[0] - tw / 2 - 6, 2), w - tw - 14))
        y = int(min(max(anchor[1] + 6 * k, 2), h - th - bl - 10))
        pill = out.copy()
        cv2.rectangle(pill, (x, y), (x + tw + 12, y + th + bl + 6), (30, 30, 200), -1)
        out = cv2.addWeighted(pill, 0.85, out, 0.15, 0)
        cv2.putText(out, label, (x + 6, y + th + 2), font, fscale, (255, 255, 255), fthick, cv2.LINE_AA)
    return out

PUBLIC_MAX_WIDTH = 1600        # the picture visitors download; the camera now sends more than this


def public_size(img: np.ndarray) -> np.ndarray:
    """Visitors get at most PUBLIC_MAX_WIDTH pixels across, so a sharper camera does not cost them more data."""
    h, w = img.shape[:2]
    if w <= PUBLIC_MAX_WIDTH:
        return img
    return cv2.resize(img, (PUBLIC_MAX_WIDTH, int(round(h * PUBLIC_MAX_WIDTH / w))), interpolation=cv2.INTER_AREA)


# ---------------------------------------------------------------- plate sanity

# Registration prefixes in use in India.  normalise_plate() fixes look-alike characters,
# which is right for a real plate but lets a garbled read through ("IS0PE7106" fits the
# letters-digits-letters-digits shape), so a plate must also start with a real state code.
INDIA_STATE_CODES = frozenset("""
    AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR
    PB PY RJ SK TN TR TS UA UK UP WB
""".split())
# district is one or two digits (Delhi writes "DL 3C AB 1234": district 3, series CAB)
_STANDARD_PLATE = re.compile(r"^([A-Z]{2})\d{1,2}[A-Z]{1,3}\d{4}$")
_BH_PLATE = re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")


def plausible_indian_plate(text: str) -> bool:
    """True for a standard plate with a real state code, or a Bharat (BH) series plate."""
    t = "".join(text.upper().split())
    m = _STANDARD_PLATE.match(t)
    if m:
        return m.group(1) in INDIA_STATE_CODES
    return bool(_BH_PLATE.match(t))


# ---------------------------------------------------------------- tunnel guard

# What a request that arrived through the Cloudflare tunnel may touch.  Everything
# else (bay layouts, stream URLs, config, the model endpoints) answers 403.
# /admin and /admin/logout are open to everyone only to ask for a token or to clear the cookie:
# the route itself checks the token and gives nothing away without it.
_PUBLIC_GET = {"/live", "/live/state", "/live/frame.jpg", "/live/camera", "/admin", "/admin/logout"}
# both upload routes are protected by the camera key; frame-raw is for devices (ESP32-CAM) that
# post a bare JPEG instead of a form
_PUBLIC_POST = {"/live/frame", "/live/frame-raw", "/live/still", "/live/crop", "/admin"}      # /admin: the sign-in form (it checks the ID and password itself); /live/still: the phone's full-resolution photo, also key-protected


# The owner dashboard's API.  A visitor may reach it, but only a signed pass from the backend gets an answer: every route of it
# checks the pass itself (owner_api.owner_grant) and answers 401 without one.  See owner_api.py and grant_auth.py.
_PUBLIC_PREFIXES = ("/owner/api/",)


def is_public_allowed(method: str, path: str) -> bool:
    """True when `method path` may be served to a visitor coming through the tunnel."""
    method = method.upper()
    path = path.rstrip("/") or "/"
    if path.startswith(_PUBLIC_PREFIXES) and method in ("GET", "HEAD", "POST"):
        return True
    if method in ("GET", "HEAD"):
        return path in _PUBLIC_GET or path.startswith("/static/")
    if method == "POST":
        return path in _PUBLIC_POST
    return False


def came_through_tunnel(headers) -> bool:
    """Cloudflare adds these to everything it forwards; a local request has neither."""
    return "cf-connecting-ip" in headers or "cf-ray" in headers


def is_loopback(host: str | None) -> bool:
    """True only for this machine itself (127.0.0.0/8, ::1, or the IPv4-mapped form of those)."""
    try:
        ip = ipaddress.ip_address(host or "")
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    return ip.is_loopback or bool(mapped and mapped.is_loopback)


_PROXY_HEADERS = ("x-forwarded-for", "x-real-ip", "forwarded", "x-forwarded-host")


def came_through_proxy(headers) -> bool:
    """A reverse proxy on this machine (Caddy, nginx) adds these; direct local use does not."""
    return any(h in headers for h in _PROXY_HEADERS)


def is_remote(client_host: str | None, headers) -> bool:
    """
    A request that is not from this machine: through the Cloudflare tunnel or a reverse proxy,
    or from another device on the network (the server listens on the LAN so an ESP32-CAM can
    post to it).  Remote requests may only reach the public routes; the setup tools, bay layouts
    and the camera key stay local.

    A proxy running on the same machine connects from 127.0.0.1, so the address alone would make
    every visitor look local: the proxy headers are what give it away.  Someone adding such a
    header by hand only makes their own request look more remote, never less.
    """
    return came_through_tunnel(headers) or came_through_proxy(headers) or not is_loopback(client_host)
