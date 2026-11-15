"""
The arrivals register: one record for every car that stopped in a bay, with a sharp photo of that car taken as it
arrived and what the plate looked like in it.

The live feed knows which car (its track id) stopped in which bay (the `bay_occupied` event, a few seconds after the car
crossed the line).  That is the moment to ask the phone for a full-resolution photo: the car has just stopped, its front
faces the road and the camera, and nobody has walked in front of it yet.  The photo is cut around that car, and the
plate detector looks for the plate inside the cut.  It records how big the plate is and whether that is enough to read;
it reads the text only when an OCR engine is loaded (the small server runs without one, so for now the cut photo is
what an operator reads by eye).

One JSON file per camera under <data>/arrivals/, written atomically; pictures under <data>/evidence/<camera>/ (the same
folder, and the same retention, as the violations' pictures).
"""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Optional

from violations import load_rows, save_rows

KEEP = 500                      # records kept per camera (the oldest go first)
# How long a car that is still in its bay waits for its photo.  It was 120 s, and a photo that was late once (a weak uplink, a still that
# timed out, the processor busy with another car) lost that car for good: on 29 Oct Bay-02 sat "pending" for 40 minutes, its car in plain
# view, while the next photo came 268 s after it parked.  A car that has gone is not waited for at all (`left`), so this is only the
# longest anyone is believed to stay in the same bay without the register noticing a change (the same 6 h as the close-up and the
# re-look use).
PHOTO_WITHIN_S = 6 * 3600.0
_BOOT = [0.0]                     # which run of the tracker a track number belongs to: the numbers start again at 1 after a restart or a re-marked layout


def new_boot(now: Optional[float] = None) -> None:
    import time
    _BOOT[0] = time.time() if now is None else now


new_boot()
SAME_CAR_JOIN_S = 90.0            # a car (same track number) that shows up in another bay within this long is the same arrival, moved
MAX_UNCLEAR = 3                   # a plate seen dark or blurred this many times is not asked for again (the picture will not get better)
MAX_RECHECK_GAP_S = 900.0         # the wait between looks at one car doubles each time, up to this
GIVE_UP_AFTER = 3                 # looks without a single read in a real plate format: the plate is not going to be read from here


def _gives_nothing(r: dict) -> bool:
    """Looked at several times and not once read as a plate (a real format): more photos will not change that."""
    return r.get("tries", 0) >= GIVE_UP_AFTER and not any(x.get("valid") for x in (r.get("reads") or []))
_SAFE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")

# plate_state: pending (waiting for a photo), found, none_found (no plate in the cut), error
PLATE_STATES = ("pending", "found", "none_found", "error")


def _outline(points) -> Optional[list]:
    """A car's silhouette as a short polygon in live-frame pixels ([[x, y], ...], 3-60 points), or None."""
    try:
        pts = [[round(float(x), 1), round(float(y), 1)] for x, y in points]
    except (TypeError, ValueError):
        return None
    return pts if 3 <= len(pts) <= 60 else None


def safe_id(rid: str) -> bool:
    return bool(_SAFE.match(rid or "")) and ".." not in rid


def _label(bay: str) -> str:
    return f"P{bay}" if str(bay).isdigit() else str(bay)


def vehicles(rows: list[dict], now: float, gap_s: float = 600.0, confirmed_only: bool = False) -> list[dict]:
    """
    The register of vehicles, by plate, from the arrivals: one entry per plate with how many visits it made, when it was
    first and last seen, which bays it used and whether it is inside now.  Arrivals of one plate whose times overlap or lie
    within `gap_s` of each other are ONE visit: a car that straddles two bays, that is seen again after its track id changed,
    or that the camera lost for a few minutes is the same car, not several.  Newest activity first.
    """
    by_plate: dict[str, list[dict]] = {}
    for r in rows:
        if r.get("text") and (r.get("confirmed") or not confirmed_only):
            by_plate.setdefault(r["text"], []).append(r)
    out = []
    for plate, items in by_plate.items():
        spans = sorted(((r["arrived"], r["left"] if r["left"] is not None else now) for r in items))
        visits, cur = [], list(spans[0])
        for a, b in spans[1:]:
            if a <= cur[1] + gap_s:
                cur[1] = max(cur[1], b)
            else:
                visits.append(cur)
                cur = [a, b]
        visits.append(cur)
        inside = any(r["left"] is None for r in items)
        newest = max(items, key=lambda r: r["arrived"])
        out.append({"plate": plate, "confirmed": any(r.get("confirmed") for r in items), "visits": len(visits),
                    "first_seen": spans[0][0], "last_seen": max(b for _, b in spans) if not inside else now, "inside": inside,
                    "bays": sorted({r["bay"] for r in items}), "last_bay": newest["bay"], "by_person": newest.get("source") == "operator",
                    "total_s": round(sum(b - a for a, b in visits), 1), "arrival": newest["id"]})
    return sorted(out, key=lambda v: -v["last_seen"])


def wilson(k: int, n: int, z: float = 1.96) -> Optional[tuple[float, float]]:
    """The 95 % Wilson interval of k out of n (None for n = 0).  With few samples it is wide, and the page says so: 5 of 5 right is
    "between 57 % and 100 %", not "100 %"."""
    if n <= 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return max(0.0, c - h), min(1.0, c + h)


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def plate_accuracy(rows: list[dict], machine) -> dict:
    """
    How good is the plate reader, from the people who corrected it?  Every plate a person set (`source` "operator") is a labelled
    sample: what the person typed is the truth, `machine(record)` is what the reader alone said (or None).  Reports how many
    were exactly right, the character accuracy, how many the reader had CONFIRMED and was wrong about (the dangerous kind), how
    many it gave up on, and the 95 % interval of the exact rate.  Only plates somebody checked are counted, so it is a floor of
    the work done, not a survey of every car.
    """
    truth = [(r, r["text"]) for r in rows if r.get("source") == "operator" and r.get("text")]
    n, exact, silent, confirmed_wrong, confirmed_n, chars, char_total = len(truth), 0, 0, 0, 0, 0, 0
    for r, t in truth:
        m = machine(r)
        ans = (m or {}).get("text") if m else None
        if ans is None:
            silent += 1
        elif ans == t:
            exact += 1
        if m and m.get("confirmed"):
            confirmed_n += 1
            confirmed_wrong += 1 if ans != t else 0
        char_total += len(t)
        chars += len(t) - min(len(t), edit_distance(ans or "", t))
    ci = wilson(exact, n)
    return {"checked": n, "exact": exact, "exact_pct": None if not n else round(100.0 * exact / n, 1),
            "ci_low_pct": None if ci is None else round(100 * ci[0]), "ci_high_pct": None if ci is None else round(100 * ci[1]),
            "char_pct": None if not char_total else round(100.0 * chars / char_total, 1), "no_answer": silent,
            "machine_confirmed": confirmed_n, "confirmed_wrong": confirmed_wrong}


def attach_plates(stays: list[dict], rows: list[dict], slack_s: float = 180.0) -> None:
    """Put the plate on each stay (reports.stays) whose bay and time match an arrival that has a plate.  In place: adds
    `plate` and `plate_confirmed` to a stay when there is one.  The arrival must overlap the stay, give or take `slack_s`."""
    read = [r for r in rows if r.get("text")]

    def near(r, s):
        end = s["end"] if s.get("end") is not None else float("inf")
        return r["arrived"] <= end + slack_s and (r["left"] is None or r["left"] >= s["start"] - slack_s)

    for s in stays:
        match = [r for r in read if str(r["bay"]) == str(s.get("bay")) and near(r, s)]
        if not match:
            # A car on the line between two bays is a stay in one and an arrival in the other.  Take a neighbouring bay's
            # plate only when it is unambiguous: one plate, and it covers most of the stay.
            nb = [r for r in read if _adjacent(r["bay"], s.get("bay")) and near(r, s) and _covers(r, s, 0.6)]
            if len({r["text"] for r in nb}) == 1:
                match = nb
        if match:
            best = max(match, key=lambda r: (bool(r.get("confirmed")), len(r.get("reads") or []), r["arrived"]))
            s["plate"], s["plate_confirmed"] = best["text"], bool(best.get("confirmed"))


def _bay_no(bay) -> Optional[int]:
    m = re.search(r"(\d+)$", str(bay))
    return int(m.group(1)) if m else None


def _adjacent(a, b) -> bool:
    x, y = _bay_no(a), _bay_no(b)
    return x is not None and y is not None and abs(x - y) == 1


def _covers(r: dict, s: dict, share: float) -> bool:
    """The arrival's time covers at least `share` of the stay's."""
    s_end = s["end"] if s.get("end") is not None else max(r["left"] or 0, s["start"] + 1)
    r_end = r["left"] if r["left"] is not None else s_end
    length = max(1.0, s_end - s["start"])
    return max(0.0, min(s_end, r_end) - max(s["start"], r["arrived"])) / length >= share


class ArrivalBook:
    """The arrivals of one camera (thread safe: the live worker opens and closes, a photo thread fills in)."""

    def __init__(self, path: Path, camera_id: str):
        self.path = Path(path)
        self.camera_id = camera_id
        self._lock = threading.Lock()

    def _load(self) -> list[dict]:
        return load_rows(self.path)             # a torn file is moved aside, never overwritten by one new row

    def _save(self, rows: list[dict]) -> None:
        save_rows(self.path, rows[-KEEP:])

    # ---- the feed

    def open(self, bay: str, track_id: Optional[int], now: float, box, frame_size, outline=None) -> dict:
        """A car stopped in `bay`.  Any arrival still open for that bay is closed first (the bay cannot hold two)."""
        bay = str(bay)
        with self._lock:
            rows = self._load()
            # The same car again, in the next bay, moments after it was "in" another one (a car lying over two bays, or one that shifted a
            # little): one car, one record.  It carries its plate reads over; a second record would show the plate in two bays.
            moved = None
            if track_id is not None:
                moved = next((r for r in rows if r.get("track_id") == track_id and r.get("boot") == _BOOT[0] and r["bay"] != bay
                              and (r["left"] is None or 0 <= now - r["left"] <= SAME_CAR_JOIN_S)), None)
            for r in rows:
                if r["bay"] == bay and r["left"] is None and r is not moved:
                    r["left"] = now
            if moved is not None:
                moved.update(moved_from=(moved.get("moved_from") or []) + [moved["bay"]], bay=bay, label=_label(bay), left=None,
                             box=[round(float(v), 1) for v in box] if box else moved.get("box"),
                             frame_size=[int(v) for v in frame_size] if frame_size else moved.get("frame_size"),
                             outline=_outline(outline) or moved.get("outline"))
                self._save(rows)
                return dict(moved)
            rec = {"id": f"{self.camera_id}-{bay}-{int(now)}", "camera": self.camera_id, "bay": bay, "label": _label(bay),
                   "track_id": track_id, "arrived": now, "left": None,
                   "box": [round(float(v), 1) for v in box] if box else None,
                   "frame_size": [int(v) for v in frame_size] if frame_size else None,
                   "photo": False, "plate_state": "pending", "plate": None, "text": None,
                   "confirmed": False, "reads": [], "tries": 0, "boot": _BOOT[0], "outline": _outline(outline)}
            rows = [r for r in rows if r["id"] != rec["id"]] + [rec]
            self._save(rows)
            return dict(rec)

    def dedupe_open(self, slots: dict, now: float) -> int:
        """One car is in one bay.  Of the arrivals still "there" that are the same car (the same track number, or the same CONFIRMED plate),
        keep the one in the bay the page says is taken (the newest if both are), and end the rest.  This clears what flipping between two
        bays left behind.  Returns how many were ended."""
        with self._lock:
            rows = self._load()
            groups: dict = {}
            for r in rows:
                if r["left"] is not None:
                    continue
                if r.get("track_id") is not None and r.get("boot") == _BOOT[0]:
                    groups.setdefault(("t", r["track_id"]), []).append(r)
                if r.get("confirmed") and r.get("text"):
                    groups.setdefault(("p", r["text"]), []).append(r)
            ended = set()
            for members in groups.values():
                live = [m for m in members if m["id"] not in ended]
                if len(live) < 2:
                    continue
                taken = [m for m in live if (slots.get(m["bay"]) or {}).get("status") == "OCCUPIED" and (slots.get(m["bay"]) or {}).get("flag") != "blocked"]
                keep = max(taken or live, key=lambda m: (m.get("confirmed", False), len(m.get("reads") or []), m["arrived"]))
                for m in live:
                    if m is not keep:
                        m["left"] = now
                        m["duplicate_of"] = keep["id"]
                        ended.add(m["id"])
            if ended:
                self._save(rows)
            return len(ended)

    def adopt(self, bay: str, track_id: Optional[int], now: float, box, frame_size, outline=None) -> Optional[dict]:
        """A car was already in `bay` when the service (or the layout) started: nobody saw it arrive, but its plate is still wanted.
        Written down like an arrival, marked `initial` (the time is when it was first seen, not when it parked); None when the bay
        already has a car on record."""
        bay = str(bay)
        with self._lock:
            if any(r["bay"] == bay and r["left"] is None for r in self._load()):
                return None
        rec = self.open(bay, track_id, now, box, frame_size, outline)
        return self.update(rec["id"], initial=True)

    def close(self, bay: str, now: float) -> None:
        """The car left (or the bay was freed)."""
        bay = str(bay)
        with self._lock:
            rows = self._load()
            changed = False
            for r in rows:
                if r["bay"] == bay and r["left"] is None:
                    r["left"] = now
                    changed = True
            if changed:
                self._save(rows)

    def close_all(self, now: float) -> int:
        """Every car "still there" has left now (the bays were re-marked: the old bay ids mean other ground).  Returns how many."""
        with self._lock:
            rows = self._load()
            n = 0
            for r in rows:
                if r["left"] is None:
                    r["left"] = now
                    n += 1
            if n:
                self._save(rows)
            return n

    # ---- the photo

    def waiting(self, now: float) -> list[dict]:
        """Arrivals with a box and no photo yet, from the last PHOTO_WITHIN_S seconds, oldest first."""
        with self._lock:
            return sorted((dict(r) for r in self._load()
                           if not r["photo"] and r.get("box") and r.get("frame_size")
                           and r["left"] is None and 0 <= now - r["arrived"] <= PHOTO_WITHIN_S),
                          key=lambda r: r["arrived"])

    def want_crop(self, now: float, settle_s: float = 8.0, recheck_gap_s: float = 45.0, max_reads: int = 6,
                  max_age_s: float = 6 * 3600.0) -> list[dict]:
        """
        The cars a new close-up is wanted of, oldest first: a car that has stopped (still in its bay `settle_s` after it
        arrived) and has no photo yet, then a car whose plate is not confirmed, at most every `recheck_gap_s` and `max_reads` times.
        """
        with self._lock:
            want = []
            for r in self._load():
                if r["left"] is not None or not r.get("box") or not r.get("frame_size") or now - r["arrived"] > max_age_s:
                    continue
                if not r["photo"]:
                    if now - r["arrived"] >= settle_s:
                        want.append(dict(r))
                elif (not r.get("confirmed") and len(r.get("reads") or []) < max_reads and r.get("tries", 0) < max_reads + 2
                      and r.get("unclear", 0) < MAX_UNCLEAR and not _gives_nothing(r)
                      # every look is a 12 MP photo on the phone, which holds the live pictures back for seconds (30 Oct: 0.2 fps while
                      # two cars were re-looked at every 45 s): 45 s, 90 s, 3 min, 6 min ... for the same car
                      and now - r.get("last_look", 0) >= min(MAX_RECHECK_GAP_S, recheck_gap_s * 2 ** max(0, r.get("tries", 1) - 1))):
                    want.append(dict(r))
            return sorted(want, key=lambda r: r["arrived"])

    def drop(self, rid: str) -> bool:
        with self._lock:
            rows = self._load()
            keep = [r for r in rows if r["id"] != rid]
            if len(keep) != len(rows):
                self._save(keep)
            return len(keep) != len(rows)

    def drop_flickers(self, min_s: float = 8.0) -> list[str]:
        """Forget arrivals that ended within `min_s` seconds and never had a plate read: the camera lost and found a car (or
        a scrap on the grass) for a moment, as when it was being re-aimed.  Returns the ids dropped."""
        with self._lock:
            rows = self._load()
            gone = [r["id"] for r in rows if r["left"] is not None and r["left"] - r["arrived"] < min_s and not r.get("text")]
            if gone:
                self._save([r for r in rows if r["id"] not in gone])
            return gone

    def to_recheck(self, now: float, max_reads: int = 6, max_age_s: float = 6 * 3600.0) -> list[dict]:
        """
        Cars still parked whose plate is not confirmed yet: the next full-resolution photo is another look at them (a plate
        missed or misread in one photo is usually fine in the next).  At most `max_reads` looks per car, oldest first.
        """
        with self._lock:
            return sorted((dict(r) for r in self._load()
                           if r["photo"] and r["left"] is None and r.get("box") and r.get("frame_size")
                           and not r.get("confirmed") and len(r.get("reads") or []) < max_reads
                           and r.get("tries", 0) < max_reads + 2 and r.get("unclear", 0) < MAX_UNCLEAR and now - r["arrived"] <= max_age_s),
                          key=lambda r: r["arrived"])

    def update(self, rid: str, **fields) -> Optional[dict]:
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["id"] == rid:
                    r.update(fields)
                    self._save(rows)
                    return dict(r)
        return None

    def update_reading(self, rid: str, **fields) -> Optional[dict]:
        """`update` for what the READER found.  A reading takes seconds, during which a person may have typed the plate: the record is
        looked at again here, under the lock, and a person's answer (text, confirmed, guess) is never replaced by a machine's."""
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["id"] == rid:
                    if r.get("source") == "operator":
                        for k in ("text", "confirmed", "guess", "source"):
                            fields.pop(k, None)
                    r.update(fields)
                    self._save(rows)
                    return dict(r)
        return None

    # ---- the console

    def get(self, rid: str) -> Optional[dict]:
        with self._lock:
            for r in self._load():
                if r["id"] == rid:
                    return dict(r)
        return None

    def list(self, since: Optional[float] = None, limit: int = 100) -> list[dict]:
        """Newest first."""
        with self._lock:
            rows = [dict(r) for r in self._load() if since is None or r["arrived"] >= since]
        return sorted(rows, key=lambda r: -r["arrived"])[:max(1, int(limit))]

    def prune(self, before: float) -> int:
        with self._lock:
            rows = self._load()
            keep = [r for r in rows if r["arrived"] >= before or r["left"] is None]
            if len(keep) != len(rows):
                self._save(keep)
            return len(rows) - len(keep)
