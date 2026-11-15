"""
The activity log: everything that happened at a camera, kept on disk and readable as a table or a CSV.

LiveSession appends one JSON line per event to <log dir>/<camera>-<YYYYMMDD>.jsonl (see live.py `_log`);
this module reads those files back and turns them into rows a person can read:

    time (with its UTC offset) | camera | event | bay | detail | epoch

Events: car in / out at the gate, a bay turning occupied / free, the first reading of each bay after a
start-up, the camera going offline / coming back, too dark, camera view changed, an operator's answer, and a
one-line occupancy sample every minute (so a quiet day still has a history, and occupancy over time can be
charted straight from the CSV).
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

COLUMNS = ["time", "camera", "event", "bay", "detail", "epoch"]

EVENT_NAMES = {
    "in": "Car came in", "out": "Car went out",
    "bay_occupied": "Bay occupied", "bay_freed": "Bay free",
    "bay_initial": "Bay first reading",
    "feed_offline": "Camera offline", "feed_online": "Camera back online",
    "low_light": "Too dark to judge", "light_ok": "Light is back",
    "camera_moved": "Camera view changed", "camera_ok": "Camera view back in place",
    "operator": "Operator answer",
    "parking_over_line": "Parked over the line", "parking_ok": "Parked correctly again",
    "operator_violation": "Violation reviewed",
    "counter_fixed": "Inside count put right",
    "arrival_photo": "Car photo taken on arrival",
    "plate_read": "Number plate read",
    "sample": "Occupancy sample",
}


def bay_label(bay_id) -> str:
    s = str(bay_id)
    return f"P{s}" if s.isdigit() else s


def describe(rec: dict) -> tuple[str, str, str]:
    """(event, bay, detail) in plain words for one logged record."""
    kind = rec.get("type", "")
    event = EVENT_NAMES.get(kind, kind)
    bay = bay_label(rec["bay_id"]) if rec.get("bay_id") not in (None, "") else ""
    if kind in ("in", "out"):
        detail = f"car #{rec['track_id']}" if rec.get("track_id") is not None else ""
    elif kind == "operator":
        s = rec.get("status", "")
        detail = {"VACANT": "marked available", "OCCUPIED": "marked occupied", "CLEARED": "answer cleared"}.get(s, s)
    elif kind == "bay_initial":
        detail = rec.get("status", "")
    elif kind == "sample":
        detail = (f"available {rec.get('vacant', 0)}, occupied {rec.get('occupied', 0)}, "
                  f"unclear {rec.get('unclear', 0)}, no signal {rec.get('stale', 0)}")
        if rec.get("bays"):
            detail += " | " + " ".join(f"{bay_label(k)}={v}" for k, v in rec["bays"].items())
        if rec.get("parking"):
            detail += " | parking " + " ".join(f"{bay_label(k)}={v}" for k, v in rec["parking"].items())
    elif kind == "parking_over_line":
        detail = str(rec.get("detail") or "")
    elif kind == "operator_violation":
        detail = f"{rec.get('status', '')}" + (f": {rec['note']}" if rec.get("note") else "") + (f" ({rec['who']})" if rec.get("who") else "")
    elif kind in ("bay_occupied", "bay_freed"):
        detail = f"car #{rec['track_id']}" if rec.get("track_id") not in (None, "") else ""
    elif kind == "counter_fixed":
        detail = f"the line said {rec.get('inside', 0) + rec.get('gap', 0)} inside, the bays show {rec.get('inside', 0)}"
    elif kind == "plate_read":
        detail = f"{rec.get('plate', '')} ({'confirmed' if rec.get('confirmed') else 'one read so far'}, {rec.get('reads', 1)} read(s))"
    elif kind in ("arrival_photo", "camera_moved"):
        detail = str(rec.get("detail") or "")
    else:
        detail = ""
    return event, bay, detail


def _files(dirs: Iterable[Path], camera_id: str) -> list[Path]:
    out = []
    prefix = f"{camera_id}-"
    for d in dirs:
        d = Path(d)
        if d.is_dir():
            out += [p for p in d.glob(f"{prefix}*.jsonl") if p.stem[len(prefix):].isdigit() and len(p.stem) == len(prefix) + 8]
    return sorted(set(out), key=lambda p: p.name)


def read_rows(dirs, camera_id: str, days: Optional[float] = None, now: Optional[float] = None,
              kinds: Optional[set] = None, newest_first: bool = False, limit: Optional[int] = None) -> list[dict]:
    """The log of one camera as rows.  `days` keeps only the last N days; `kinds` limits to those event types."""
    now = datetime.now().timestamp() if now is None else now
    since = None if not days else now - days * 86400
    # a day's file is named by its date, so whole files older than the window can be skipped unread
    keep_from = None if since is None else (datetime.fromtimestamp(since) - timedelta(days=1)).strftime("%Y%m%d")
    rows = []
    for path in _files(dirs if isinstance(dirs, (list, tuple)) else [dirs], camera_id):
        if keep_from and path.stem[-8:] < keep_from:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        t = float(rec["t"])
                    except (ValueError, KeyError, TypeError):
                        continue                                 # a half-written last line must not break the table
                    if since is not None and t < since:
                        continue
                    if kinds and rec.get("type") not in kinds:
                        continue
                    event, bay, detail = describe(rec)
                    rows.append({"time": datetime.fromtimestamp(t).astimezone().isoformat(timespec="seconds"),
                                 "camera": camera_id, "event": event, "bay": bay, "detail": detail,
                                 "epoch": round(t, 1), "type": rec.get("type", "")})
        except OSError:
            continue
    rows.sort(key=lambda r: r["epoch"], reverse=newest_first)
    return rows[:limit] if limit else rows


def prune_logs(dirs, days: float, now: Optional[float] = None) -> int:
    """Delete day files older than `days` days (by the date in the name).  Returns how many were removed.
    0 or less keeps everything."""
    if not days or days <= 0:
        return 0
    now = datetime.now().timestamp() if now is None else now
    cutoff = (datetime.fromtimestamp(now) - timedelta(days=days)).strftime("%Y%m%d")
    removed = 0
    for d in dirs if isinstance(dirs, (list, tuple)) else [dirs]:
        d = Path(d)
        if not d.is_dir():
            continue
        for p in d.glob("*.jsonl"):
            stamp = p.stem[-8:]
            if stamp.isdigit() and len(p.stem) > 9 and p.stem[-9] == "-" and stamp < cutoff:
                try:
                    p.unlink()
                    removed += 1
                except OSError:
                    pass
    return removed


def to_csv(rows: list[dict]) -> str:
    """CSV that opens in Excel: a header, then one row per event.  Text cells that start with = + - @ are
    quoted with a leading apostrophe so a spreadsheet never runs them as a formula."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(COLUMNS)
    for r in rows:
        w.writerow([_safe(r[c]) for c in COLUMNS])
    return buf.getvalue()


def _safe(v):
    s = str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") and not _is_number(s) else s


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False
