"""
The violations register: every time a car was parked over a line, or stayed longer than the lot allows, with a picture,
how long it lasted, and what the operator did about it.

A violation is OPENED by the live feed (a trusted `parking_over_line` verdict, or a bay held longer than the camera's
overstay limit) and CLOSED by the same feed (the car moved right, or left).  An operator then marks it resolved or
dismissed with a note.  Closing by the feed and resolving by a person are separate on purpose: `closed` says when the
situation ended, `status` says whether somebody has dealt with it.

One JSON file per camera under <data>/violations/, written atomically; pictures under <data>/evidence/<camera>/.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

OVER_LINE, OVERSTAY = "over_line", "overstay"
REOPEN_WITHIN_S = 600.0        # a violation that comes back this soon after it closed is the same one
STATUSES = ("open", "resolved", "dismissed")
_SAFE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")


def safe_id(vid: str) -> bool:
    """Ids end up in file names, so only plain ones are accepted (no slashes, no dots-only, no traversal)."""
    return bool(_SAFE.match(vid or "")) and vid not in (".", "..") and ".." not in vid


def load_rows(path: Path) -> list[dict]:
    """The rows of a register file.  A file that is not there is an empty register.  A file that is there but torn (a full disk, a bad
    copy) is moved aside as `<name>.corrupt-<time>` before an empty register is returned: the next write must not replace the only
    copy of the rest with one new row.  A file that cannot be read at all raises, and nothing is written over it."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        raise ValueError("not a list")
    except ValueError:
        try:
            os.replace(path, Path(path).with_name(f"{Path(path).name}.corrupt-{int(time.time())}"))
        except OSError:
            raise
        return []


def save_rows(path: Path, rows: list[dict]) -> None:
    """Write a register whole and safely: to a temporary file, flushed to disk, then renamed over the old one."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(json.dumps(rows, indent=1))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _label(bay: str) -> str:
    return f"P{bay}" if str(bay).isdigit() else str(bay)


class ViolationBook:
    """The register of one camera (thread safe: the live worker writes, the console reads and edits)."""

    def __init__(self, path: Path, camera_id: str):
        self.path = Path(path)
        self.camera_id = camera_id
        self._lock = threading.Lock()
        self._held_from: dict[str, float] = {}      # bay -> when it was first seen taken, for the overstay clock

    # ---- storage

    def _load(self) -> list[dict]:
        return load_rows(self.path)

    def _save(self, rows: list[dict]) -> None:
        save_rows(self.path, rows)

    # ---- the feed

    def open(self, bay: str, kind: str, now: float, detail: str = "", crossing_m: Optional[float] = None,
             side: Optional[str] = None, where: Optional[dict] = None) -> tuple[dict, bool]:
        """Open a violation for a bay, or return the one already running for it.  (record, created).
        `where` is {"polygon": the bay in picture pixels, "layout_size": [w, h]} for cutting evidence pictures later."""
        bay = str(bay)
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["bay"] == bay and r["type"] == kind and r["closed"] is None:
                    if crossing_m is not None:
                        r["max_crossing_m"] = max(r.get("max_crossing_m") or 0.0, float(crossing_m))
                        self._save(rows)
                    return dict(r), False
            for r in rows:
                # the same car again moments after it was closed (the verdict flickered, a car in front hid it for a
                # minute): the same violation going on, not a second one.  A person's decision stays as they made it.
                if (r["bay"] == bay and r["type"] == kind and r["status"] == "open" and r["closed"] is not None
                        and not r.get("layout_ended") and 0 <= now - r["closed"] <= REOPEN_WITHIN_S):
                    r["closed"] = None
                    if crossing_m is not None:
                        r["max_crossing_m"] = max(r.get("max_crossing_m") or 0.0, float(crossing_m))
                    self._save(rows)
                    return dict(r), False
            vid = f"{self.camera_id}-{bay}-{kind}-{int(now)}"
            rec = {"id": vid, "camera": self.camera_id, "bay": bay, "label": _label(bay), "type": kind,
                   "opened": now, "closed": None, "detail": detail, "side": side,
                   "max_crossing_m": None if crossing_m is None else float(crossing_m),
                   "status": "open", "note": "", "handled_by": None, "handled_at": None,
                   "evidence": False, "evidence_hq": False, **(where or {})}
            rows.append(rec)
            self._save(rows)
            return dict(rec), True

    def close(self, bay: str, now: float, kinds: tuple = (OVER_LINE, OVERSTAY)) -> list[str]:
        """The situation is over (the car moved right or left): note when.  Returns the ids it closed."""
        bay, closed = str(bay), []
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["bay"] == bay and r["type"] in kinds and r["closed"] is None:
                    r["closed"] = now
                    closed.append(r["id"])
            if closed:
                self._save(rows)
        return closed

    def close_all(self, now: float) -> int:
        """Every violation still going on ends now (the bays were re-marked).  Returns how many."""
        with self._lock:
            rows = self._load()
            n = 0
            for r in rows:
                if r["closed"] is None:
                    r["closed"] = now
                    r["layout_ended"] = True            # the bays were re-marked: a later violation in a bay of the same name is another one
                    n += 1
            if n:
                self._save(rows)
            return n

    def close_type(self, bay: str, kind: str, now: float) -> list[str]:
        return self.close(bay, now, (kind,))

    def mark_evidence(self, vid: str, hq: bool = False) -> None:
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["id"] == vid:
                    r["evidence_hq" if hq else "evidence"] = True
            self._save(rows)

    def waiting_for_hq(self, now: float, within_s: float = 180.0) -> list[dict]:
        """Violations opened in the last few minutes that have no full-resolution picture yet."""
        with self._lock:
            return [dict(r) for r in self._load()
                    if not r.get("evidence_hq") and r.get("polygon") and now - r["opened"] <= within_s]

    def close_cleared(self, slots: dict, now: float) -> list[str]:
        """
        Close an over-the-line violation whose car is no longer over the line.  The live feed closes one on a
        `parking_ok` or a freed bay, but a restart or a change of rule forgets the verdicts that came before, so
        this looks at where each bay stands now: gone from the layout, vacant, or judged and not over the line.
        A bay that is merely unclear (dark, hidden, not judged) stays as it was.  Returns the ids it closed.
        """
        with self._lock:
            open_bays = {r["bay"] for r in self._load() if r["type"] == OVER_LINE and r["closed"] is None}
        cleared = []
        for bay in open_bays:
            s = slots.get(bay)
            if s is None or s.get("status") == "VACANT":
                cleared.append(bay)
            elif s.get("status") == "OCCUPIED" and (s.get("parking") or {}).get("verdict") in ("correct", "close_to_line"):
                cleared.append(bay)
        closed = []
        for bay in cleared:
            closed += self.close_type(bay, OVER_LINE, now)
        return closed

    def check_overstay(self, slots: dict, now: float, limit_h: float) -> list[dict]:
        """Open an overstay for each bay held longer than `limit_h` hours (0 = off) and close the ones whose car has gone.
        `slots` is status.compose_bays() output.  Returns the violations that were newly opened."""
        if not limit_h or limit_h <= 0:
            return []
        opened = []
        occupied = set()
        held = self._held_from
        for bay, s in slots.items():
            # a car is "there" while the bay stays occupied.  The engine's `since` restarts on every change of verdict (a passing car
            # hides the parked one for a moment, correct -> close to the line), and a blocked or operator-marked bay keeps the clock of
            # what it was before: so the hours are counted here, from when the bay was first seen taken, and start over when it is not.
            if s.get("status") != "OCCUPIED" or s.get("flag") in ("blocked", "operator"):
                held.pop(str(bay), None)
                continue
            occupied.add(str(bay))
            epoch = s.get("since_epoch")
            if epoch is None and isinstance(s.get("since"), (int, float)):
                epoch = s["since"]                      # a hand-made slot; compose_bays gives "since" as text and the epoch apart
            start = held.setdefault(str(bay), float(epoch) if epoch else now)
            if now - start >= limit_h * 3600.0:
                hours = (now - start) / 3600.0
                rec, created = self.open(bay, OVERSTAY, now, f"Parked for over {limit_h:g} h (now {hours:.1f} h)")
                if created:
                    opened.append(rec)
        with self._lock:
            gone = [r["bay"] for r in self._load() if r["type"] == OVERSTAY and r["closed"] is None and r["bay"] not in occupied]
        for bay in set(gone):
            self.close_type(bay, OVERSTAY, now)
        return opened

    # ---- the operator

    def list(self, status: Optional[str] = None, kind: Optional[str] = None,
             since: Optional[float] = None, until: Optional[float] = None) -> list[dict]:
        """Newest first.  `since`/`until` filter on when it was opened."""
        with self._lock:
            rows = self._load()
        out = [r for r in rows
               if (not status or r["status"] == status) and (not kind or r["type"] == kind)
               and (since is None or r["opened"] >= since) and (until is None or r["opened"] < until)]
        out.sort(key=lambda r: r["opened"], reverse=True)
        return out

    def get(self, vid: str) -> Optional[dict]:
        with self._lock:
            return next((dict(r) for r in self._load() if r["id"] == vid), None)

    def handle(self, vid: str, status: str, note: str, who: str, now: float) -> Optional[dict]:
        """Mark a violation resolved or dismissed (or open again) with a note.  None if there is no such violation."""
        if status not in STATUSES:
            raise ValueError("status must be open, resolved or dismissed")
        with self._lock:
            rows = self._load()
            for r in rows:
                if r["id"] == vid:
                    r.update(status=status, note=str(note or "")[:500], handled_by=who if status != "open" else None,
                             handled_at=now if status != "open" else None, bulk=False)      # a person looked at this one
                    self._save(rows)
                    return dict(r)
        return None

    def dismiss_ended(self, note: str, who: str, now: float) -> int:
        """Dismiss every violation that is over (the car moved right or left: `closed` is set) and that nobody has dealt with.
        Those still going on are left open.  Returns how many were dismissed."""
        with self._lock:
            rows = self._load()
            n = 0
            for r in rows:
                if r["status"] == "open" and r["closed"] is not None:
                    r.update(status="dismissed", note=str(note or "")[:500], handled_by=who, handled_at=now, bulk=True)   # tidied, not judged: not an accuracy sample
                    n += 1
            if n:
                self._save(rows)
            return n

    def open_count(self) -> int:
        with self._lock:
            return sum(1 for r in self._load() if r["status"] == "open")

    def going_on_count(self) -> int:
        """Open violations whose car is still there (the rest are over and only wait for someone to look at them)."""
        with self._lock:
            return sum(1 for r in self._load() if r["status"] == "open" and r["closed"] is None)

    def prune(self, before: float) -> int:
        """Drop handled violations opened before `before`.  Unhandled ones are kept however old they are."""
        with self._lock:
            rows = self._load()
            keep = [r for r in rows if r["status"] == "open" or r["opened"] >= before]
            if len(keep) != len(rows):
                self._save(keep)
            return len(rows) - len(keep)


# ---------------------------------------------------------------- evidence pictures

def crop_around(img, polygon, margin: float = 0.4):
    """The part of `img` around a bay polygon (its bounding box grown by `margin` each way), at least 160 px wide."""
    import numpy as np
    h, w = img.shape[:2]
    pts = np.asarray(polygon, dtype=float)
    x0, y0, x1, y1 = pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()
    mx, my = (x1 - x0) * margin, (y1 - y0) * margin
    x0, x1 = max(0, int(x0 - mx)), min(w, int(x1 + mx))
    y0, y1 = max(0, int(y0 - my)), min(h, int(y1 + my))
    if x1 - x0 < 160:
        c = (x0 + x1) // 2
        x0, x1 = max(0, c - 80), min(w, c + 80)
    return img[y0:y1, x0:x1]


def prune_evidence(folder: Path, before: float) -> int:
    """Delete evidence pictures older than `before` (epoch seconds).  Returns how many were removed."""
    removed = 0
    if not Path(folder).is_dir():
        return 0
    for p in Path(folder).glob("*/*.jpg"):
        try:
            if p.stat().st_mtime < before:
                p.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def when(ts: Optional[float]) -> str:
    if ts is None:
        return ""
    try:
        return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")
    except (OSError, OverflowError, ValueError):
        return ""                                         # an impossible time must not break a list
