"""
Record the real lot, label it, and score the system against what a person saw.

Nothing in this system has ever been measured against the truth: no occupancy accuracy, no error in cm for "over the line", no flicker rate
per hour.  This module is the measuring stick.  It is OFF unless ANPR_RECORD_S is set.

  The recorder   every `interval_s` seconds it keeps the raw live picture (what the camera saw, no overlays) and one line saying what the
                 system answered for every bay at that moment (status, reason, verdict, how far over a line, which car).
  The labels     a person looks at a recorded picture and says, bay by bay: empty / car / car over a line, or "cannot tell".
  The truth      the labels become the CSV that tools/eval_pilot.py reads, and the recorded answers become its log, so the system that
                 was running can be scored without any replay (tools/replay_record.py replays them through new code to compare it).

Layout on disk, under <root>/<camera>/:   <day>/index.jsonl, <day>/<epoch>.jpg, labels.jsonl
Pictures show plates and people: the endpoints are admin-only, and old days are deleted (max_days, max_mb).
"""
from __future__ import annotations

import json
import re
import shutil
import statistics
import threading
import time
from datetime import datetime, tzinfo
from pathlib import Path
from typing import Optional

import cv2

_DAY = re.compile(r"^\d{8}$")
_FILE = re.compile(r"^\d{9,11}(\.\d{1,3})?\.jpg$")
STATES = ("VACANT", "OCCUPIED", "SKIP")                # SKIP: "cannot tell": it is not scored
VERDICTS = ("correct", "close_to_line", "over_line")
MIN_FREE_MB = 1000.0                                   # never fill the disk: below this much free space nothing is recorded


def safe_day(day: str) -> bool:
    return bool(_DAY.match(day or ""))


def safe_file(name: str) -> bool:
    return bool(_FILE.match(name or ""))


class Recorder:
    def __init__(self, root: Path, interval_s: float, max_mb: float = 1500.0, max_days: float = 14.0, quality: int = 85,
                 tz: Optional[tzinfo] = None):
        self.root, self.interval_s, self.max_mb, self.max_days, self.quality = Path(root), float(interval_s), float(max_mb), float(max_days), int(quality)
        self.tz = tz
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.interval_s > 0

    def day_of(self, t: float) -> str:
        return datetime.fromtimestamp(t, self.tz).strftime("%Y%m%d")

    # ---- recording

    def due(self, camera_id: str, now: float) -> bool:
        return self.enabled and now - self._last.get(camera_id, 0.0) >= self.interval_s

    def save(self, camera_id: str, frame, record: dict, now: float) -> Optional[str]:
        """Keep this picture and its line.  Returns the file name, or None when it was not kept (no room, or a write failed)."""
        with self._lock:
            self._last[camera_id] = now
            try:
                self.root.mkdir(parents=True, exist_ok=True)
                if shutil.disk_usage(self.root).free / 1e6 < MIN_FREE_MB:
                    return None
                folder = self.root / camera_id / self.day_of(now)
                folder.mkdir(parents=True, exist_ok=True)
                name = f"{int(now)}.jpg"
                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.quality])
                if not ok:
                    return None
                (folder / name).write_bytes(buf.tobytes())
                line = {"t": round(now, 1), "file": name, "size": [int(frame.shape[1]), int(frame.shape[0])], **record}
                with open(folder / "index.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps(line, separators=(",", ":")) + "\n")
                return name
            except OSError:
                return None

    def prune(self, now: Optional[float] = None) -> int:
        """Delete whole days: older than max_days, then the oldest until the folder is under max_mb.  Labels are kept.  Returns days removed."""
        now = time.time() if now is None else now
        with self._lock:
            days = []                                           # (day, path, size_mb) for every camera
            for cam in (p for p in self.root.glob("*") if p.is_dir()):
                for d in (p for p in cam.iterdir() if p.is_dir() and safe_day(p.name)):
                    days.append((d.name, d, sum(f.stat().st_size for f in d.iterdir() if f.is_file()) / 1e6))
            days.sort(key=lambda x: x[0])
            removed = 0
            cutoff = self.day_of(now - self.max_days * 86400)
            while days and (days[0][0] < cutoff or sum(s for _, _, s in days) > self.max_mb):
                shutil.rmtree(days.pop(0)[1], ignore_errors=True)
                removed += 1
            return removed

    def size_mb(self) -> float:
        return round(sum(f.stat().st_size for f in self.root.rglob("*") if f.is_file()) / 1e6, 3) if self.root.exists() else 0.0

    # ---- reading back

    def days(self, camera_id: str) -> list[dict]:
        base = self.root / camera_id
        if not base.exists():
            return []
        labelled = {}
        for lab in self.labels(camera_id):
            labelled.setdefault(lab["day"], set()).add(lab["file"])
        out = []
        for d in sorted((p for p in base.iterdir() if p.is_dir() and safe_day(p.name)), reverse=True):
            n = sum(1 for _ in open(d / "index.jsonl", encoding="utf-8")) if (d / "index.jsonl").exists() else 0
            out.append({"day": d.name, "frames": n, "labelled_frames": len(labelled.get(d.name, ()))})
        return out

    def frames(self, camera_id: str, day: str) -> list[dict]:
        if not safe_day(day):
            return []
        path = self.root / camera_id / day / "index.jsonl"
        if not path.exists():
            return []
        out = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                out.append(json.loads(line))
            except ValueError:
                continue                                        # a torn last line from a crash must not hide the day
        return out

    def jpg(self, camera_id: str, day: str, name: str) -> Optional[Path]:
        if not (safe_day(day) and safe_file(name)):
            return None
        p = self.root / camera_id / day / name
        return p if p.is_file() else None

    # ---- the labels

    def _labels_path(self, camera_id: str) -> Path:
        return self.root / camera_id / "labels.jsonl"

    def add_label(self, camera_id: str, day: str, file: str, bay: str, state: str, verdict: Optional[str] = None,
                  side: Optional[str] = None, by: str = "", now: Optional[float] = None) -> dict:
        """One person's answer for one bay in one picture.  Raises ValueError for anything that is not a recorded picture and a real answer."""
        state = str(state).upper()
        if state not in STATES:
            raise ValueError(f"state must be one of {', '.join(STATES)}")
        if verdict is not None and (state != "OCCUPIED" or verdict not in VERDICTS):
            raise ValueError("a verdict is only for an occupied bay: correct, close_to_line or over_line")
        row = next((f for f in self.frames(camera_id, day) if f["file"] == file), None)
        if row is None:
            raise ValueError("no such recorded picture")
        if bay not in (row.get("polygons") or {}):
            raise ValueError("no such bay in that picture")
        lab = {"day": day, "file": file, "t": row["t"], "bay": bay, "state": state, "verdict": verdict, "side": side,
               "by": by, "at": round(time.time() if now is None else now, 1)}
        with self._lock:
            p = self._labels_path(camera_id)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "a", encoding="utf-8") as f:
                f.write(json.dumps(lab, separators=(",", ":")) + "\n")
        return lab

    def labels(self, camera_id: str) -> list[dict]:
        """The latest answer for each (picture, bay), in time order."""
        p = self._labels_path(camera_id)
        if not p.exists():
            return []
        latest = {}
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                lab = json.loads(line)
            except ValueError:
                continue
            latest[(lab["file"], lab["bay"])] = lab
        return sorted(latest.values(), key=lambda x: (x["bay"], x["t"]))

    # ---- what tools/eval_pilot.py reads

    def run_lines(self, camera_id: str, day: str) -> list[dict]:
        """The system's own answers as eval_pilot's log (so what was running can be scored without a replay)."""
        out = []
        for f in self.frames(camera_id, day):
            bays = f.get("bays") or {}
            out.append({"video_s": f["t"], "stream_status": "live", **({"zones": f["zones"]} if f.get("zones") else {}),
                        "slots": {b: v.get("status") for b, v in bays.items()},
                        "verdicts": {b: v.get("verdict") for b, v in bays.items() if v.get("verdict")},
                        "tracks": {b: v.get("vehicle_id") for b, v in bays.items() if v.get("vehicle_id") is not None}})
        return out

    def truth_rows(self, camera_id: str) -> list[list]:
        """[bay_id, start_s, end_s, state, verdict] from the labels.  A labelled picture speaks for the time around it (half the gap to
        its neighbours, at most half the recording interval); neighbours that agree are joined."""
        gap = self.interval_s or 30.0
        by_bay: dict[str, list[dict]] = {}
        for lab in self.labels(camera_id):
            if lab["state"] != "SKIP":
                by_bay.setdefault(lab["bay"], []).append(lab)
        rows = []
        for bay, labs in sorted(by_bay.items()):
            times = [x["t"] for x in labs]
            gaps = [b - a for a, b in zip(times, times[1:]) if b > a]
            span = min(gap, statistics.median(gaps)) if gaps else gap
            current = None
            for lab in labs:
                a, b = lab["t"] - span / 2, lab["t"] + span / 2
                key = (lab["state"], lab.get("verdict") or "")
                if current and current[3:] == list(key) and a <= current[2] + 1e-6:
                    current[2] = b
                else:
                    if current:
                        rows.append(current)
                    current = [bay, round(a, 1), round(b, 1), *key]
            if current:
                rows.append(current)
        # a stretch must never overlap the next of its bay (labels closer than the span): cut at the midpoint
        fixed = []
        for r in rows:
            if fixed and fixed[-1][0] == r[0] and r[1] < fixed[-1][2]:
                mid = round((r[1] + fixed[-1][2]) / 2, 1)
                fixed[-1][2], r[1] = mid, mid
            fixed.append(r)
        return [r for r in fixed if r[2] > r[1]]

    def truth_csv(self, camera_id: str) -> str:
        lines = ["bay_id,start_s,end_s,state,verdict"]
        lines += [",".join(str(x) for x in r) for r in self.truth_rows(camera_id)]
        return "\r\n".join(lines) + "\r\n"
