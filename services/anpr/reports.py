"""
Management reports from the activity log: occupancy over time, how long cars stay, parking quality,
over-the-line episodes and how much of the time the camera was usable.

Everything is worked out from the raw JSON lines in <log dir>/<camera>-<YYYYMMDD>.jsonl (see live.py `_log` and
activity_log.py), never from the sentences the log page shows.  Two rules run through all of it:

  * A gap is "no data", never "free".  Every figure that depends on the camera sees says how much of the period it
    actually saw (`coverage`).
  * A stay that was cut by the camera going offline, the picture being too dark, the view moving or a restart has an
    unknown length, so it is listed but kept out of the dwell statistics.
"""
from __future__ import annotations

import csv
import io
import json
import os
import statistics
from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path
from typing import Iterable, Optional

import activity_log

DAY = 86400.0
SAMPLE_S = float(os.getenv("ANPR_LOG_SAMPLE_S", "60"))          # how often the log gets an occupancy sample
JUDGED = ("correct", "close_to_line", "over_line")
SPAN_PAIRS = {                                                  # an interruption: the event that starts it, the one that ends it
    "offline": ("feed_offline", "feed_online"),
    "dark": ("low_light", "light_ok"),
    "moved": ("camera_moved", "camera_ok"),
}
MIN_STAY_S = float(os.getenv("ANPR_MIN_STAY_S", "180"))        # a car parks for minutes; anything shorter is the camera flickering
UNSTABLE_FLICKERS = int(os.getenv("ANPR_UNSTABLE_FLICKERS", "6"))   # this many flickers in a period flags a bay as hard to see
TABLES = ("occupancy", "bays", "stays", "episodes")
BUCKETS = {"quarter": 900, "hour": 3600, "day": 86400}


# ---------------------------------------------------------------- time

def site_tz() -> tzinfo:
    """The time zone days and hours are counted in: ANPR_TIMEZONE (default Asia/Kolkata, where the pilot is)."""
    name = os.getenv("ANPR_TIMEZONE", "Asia/Kolkata")
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name)
    except Exception:
        # no time zone database on this machine (Windows without tzdata): India has no daylight saving, so a fixed offset is exact
        if name == "Asia/Kolkata":
            return timezone(timedelta(hours=5, minutes=30), "IST")
        return timezone.utc


def parse_range(date_from: Optional[str], date_to: Optional[str], now: Optional[float] = None,
                tz: Optional[tzinfo] = None) -> tuple[float, float]:
    """[start, end) in epoch seconds for whole local days: `date_from` .. `date_to` inclusive (YYYY-MM-DD).
    Both missing means today.  A reversed range is an error."""
    tz = tz or site_tz()
    now = datetime.now().timestamp() if now is None else now
    today = datetime.fromtimestamp(now, tz).date()

    def day(s: Optional[str], default):
        if not s:
            return default
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(f"'{s}' is not a date (use YYYY-MM-DD)")

    d0, d1 = day(date_from, today), day(date_to, day(date_from, today))
    if d1 < d0:
        raise ValueError("the end date is before the start date")
    if (d1 - d0).days > 366:
        raise ValueError("a report covers at most a year")
    start = datetime(d0.year, d0.month, d0.day, tzinfo=tz).timestamp()
    nxt = d1 + timedelta(days=1)
    return start, datetime(nxt.year, nxt.month, nxt.day, tzinfo=tz).timestamp()


def auto_bucket(start: float, end: float) -> str:
    span = end - start
    return "quarter" if span <= DAY + 1 else "hour" if span <= 14 * DAY + 1 else "day"


def _bucket_start(t: float, bucket: str, tz: tzinfo) -> float:
    dt = datetime.fromtimestamp(t, tz)
    if bucket == "day":
        dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    elif bucket == "hour":
        dt = dt.replace(minute=0, second=0, microsecond=0)
    else:
        dt = dt.replace(minute=dt.minute // 15 * 15, second=0, microsecond=0)
    return dt.timestamp()


# ---------------------------------------------------------------- reading

def read_records(dirs, camera_id: str, start: float, end: float, lookback_s: float = DAY) -> list[dict]:
    """The raw log records of one camera with start - lookback_s <= t < end, oldest first.  The lookback gives
    the stay pairing the openings that happened just before the period."""
    lo = start - lookback_s
    # a day's file is named by the server's local date; look one day either side so no zone mismatch hides a record
    first = (datetime.fromtimestamp(lo) - timedelta(days=1)).strftime("%Y%m%d")
    last = (datetime.fromtimestamp(end) + timedelta(days=1)).strftime("%Y%m%d")
    out = []
    for path in activity_log._files(dirs if isinstance(dirs, (list, tuple)) else [dirs], camera_id):
        if not (first <= path.stem[-8:] <= last):
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
                        continue                                 # a half-written last line must not break a report
                    if lo <= t < end:
                        rec["t"] = t
                        out.append(rec)
        except OSError:
            continue
    out.sort(key=lambda r: r["t"])
    return out


# ---------------------------------------------------------------- the figures

def occupancy_series(records: list[dict], start: float, end: float, bucket: str, tz: tzinfo,
                     sample_s: float = SAMPLE_S, until: float = float("inf")) -> list[dict]:
    """One entry per bucket from `start` to `end`.  `occupancy_pct` is occupied / (occupied + available) averaged over
    the samples in the bucket; `coverage` is the share of the bucket (up to `until`, normally now) the camera was
    sampled (0 = no data).  A bucket that has not happened yet is `future` and has no coverage figure."""
    step = BUCKETS[bucket]
    cells: dict[float, list[dict]] = {}
    for r in records:
        if r.get("type") == "sample" and start <= r["t"] < end:
            cells.setdefault(_bucket_start(r["t"], bucket, tz), []).append(r)
    out = []
    t = _bucket_start(start, bucket, tz)
    while t < end:
        nxt = _bucket_start(t + step * 1.5, bucket, tz)             # the next boundary (a day can be 23 or 25 hours)
        lo, hi = max(t, start), min(nxt, end, until)
        rows = cells.get(t, [])
        pcts = [r["occupied"] / (r["occupied"] + r["vacant"]) * 100.0 for r in rows if r.get("occupied", 0) + r.get("vacant", 0) > 0]
        n = len(rows)
        out.append({
            "t": t, "label": datetime.fromtimestamp(t, tz).isoformat(timespec="minutes"), "samples": n,
            "occupancy_pct": round(sum(pcts) / len(pcts), 1) if pcts else None,
            "occupied_avg": round(sum(r.get("occupied", 0) for r in rows) / n, 2) if n else None,
            "vacant_avg": round(sum(r.get("vacant", 0) for r in rows) / n, 2) if n else None,
            "unclear_avg": round(sum(r.get("unclear", 0) for r in rows) / n, 2) if n else None,
            "coverage": None if hi <= lo else round(min(1.0, n * sample_s / (hi - lo)), 3),
            "future": lo >= until,
        })
        t = nxt
    return out


def bay_utilisation(records: list[dict], start: float, end: float) -> list[dict]:
    """Per bay: the share of its sampled minutes it was occupied (unclear and no-signal minutes are left out)."""
    tally: dict[str, dict] = {}
    for r in records:
        if r.get("type") != "sample" or not (start <= r["t"] < end):
            continue
        for bay, word in (r.get("bays") or {}).items():
            c = tally.setdefault(str(bay), {"occupied": 0, "available": 0, "other": 0})
            c[word if word in ("occupied", "available") else "other"] += 1
    out = []
    for bay in sorted(tally, key=lambda b: (not str(b).isdigit(), int(b) if str(b).isdigit() else 0, str(b))):
        c = tally[bay]
        seen = c["occupied"] + c["available"]
        out.append({"bay": bay, "label": activity_log.bay_label(bay), "samples": seen + c["other"],
                    "utilisation_pct": round(c["occupied"] / seen * 100.0, 1) if seen else None})
    return out


def stays(records: list[dict], start: float, end: float, now: Optional[float] = None,
          min_stay_s: float = MIN_STAY_S) -> list[dict]:
    """
    Each time a car sat in a bay: bay, start, end, dwell_s.  `records` may begin before `start`; a stay is reported when
    it ended inside the period (or is still going).

      * `interrupted`: cut by an outage, darkness, a moved camera or a restart; its real length is unknown.
      * `initial`: the first thing seen after a start-up, not an arrival.
      * `flicker`: over before `min_stay_s`.  A car does not park for seconds, so this is the camera losing and
        finding the car again (usually another car in front of it), not a car coming and going.

    Only a `counted` stay (seen from start to finish, not a flicker) goes into the dwell statistics.
    """
    now = datetime.now().timestamp() if now is None else now
    open_: dict[str, dict] = {}
    done: list[dict] = []
    for r in records:
        kind, bay, t = r.get("type"), r.get("bay_id"), r["t"]
        if kind == "bay_occupied" and bay is not None:
            open_.setdefault(str(bay), {"bay": str(bay), "start": t, "interrupted": False, "initial": False})
        elif kind == "bay_freed" and bay is not None:
            s = open_.pop(str(bay), None)
            if s is not None:
                s.update(end=t, dwell_s=round(t - s["start"], 1), open=False)
                done.append(s)
        elif kind == "bay_initial" and bay is not None:
            if r.get("status") == "occupied":
                # when it was first seen, not when it began.  If a stay was already open the service restarted (or the bays were
                # re-marked) while the bay was taken: the car may have left and another arrived in the gap, so the stay is cut short.
                if str(bay) in open_:
                    open_[str(bay)]["interrupted"] = True
                else:
                    open_[str(bay)] = {"bay": str(bay), "start": t, "interrupted": True, "initial": True}
            else:
                open_.pop(str(bay), None)
        elif kind in ("feed_offline", "low_light", "camera_moved"):
            for s in open_.values():
                s["interrupted"] = True
    result = [s for s in done if start <= s["end"] < end]
    for s in open_.values():
        if s["start"] < end:
            result.append({**s, "end": None, "dwell_s": round(min(now, end) - s["start"], 1), "open": True})
    result.sort(key=lambda s: s["start"])
    for s in result:
        s["label"] = activity_log.bay_label(s["bay"])
        s["flicker"] = bool(not s["open"] and s["dwell_s"] < min_stay_s)
        s["counted"] = bool(not s["interrupted"] and not s["open"] and not s["flicker"])
    return result


def is_car(s: dict, min_stay_s: float = MIN_STAY_S) -> bool:
    """A stay that was a real car arriving: not a flicker, not the first reading after a start-up."""
    return not s["flicker"] and not s["initial"] and s["dwell_s"] >= min_stay_s


def dwell_summary(stay_list: list[dict], unstable_after: int = UNSTABLE_FLICKERS) -> dict:
    """Count, average, median and longest stay over the stays that were seen from start to finish, how many were left
    out and why, and the bays that kept flickering (the camera cannot see them steadily)."""
    counted = [s["dwell_s"] for s in stay_list if s["counted"]]
    per_bay: dict[str, list[float]] = {}
    flickers: dict[str, int] = {}
    for s in stay_list:
        if s["counted"]:
            per_bay.setdefault(s["label"], []).append(s["dwell_s"])
        if s["flicker"]:
            flickers[s["label"]] = flickers.get(s["label"], 0) + 1
    pack = lambda xs: {"n": len(xs), "avg_s": round(sum(xs) / len(xs), 1), "median_s": round(statistics.median(xs), 1),
                       "max_s": round(max(xs), 1)} if xs else {"n": 0, "avg_s": None, "median_s": None, "max_s": None}
    return {**pack(counted), "per_bay": {k: pack(v) for k, v in per_bay.items()},
            "excluded": sum(1 for s in stay_list if not s["counted"]),
            "flickers": sum(flickers.values()), "flickers_by_bay": flickers, "cut_short": sum(1 for s in stay_list if s["interrupted"] and not s["flicker"] and not s["open"]),
            "still_parked": sum(1 for s in stay_list if s["open"]), "min_stay_s": MIN_STAY_S,
            "unstable_bays": [{"label": k, "flickers": v} for k, v in sorted(flickers.items(), key=lambda kv: -kv[1]) if v >= unstable_after]}


def cars_per_day(stay_list: list[dict], start: float, end: float, tz: tzinfo, min_stay_s: float = MIN_STAY_S) -> list[dict]:
    """Cars that parked per local day, from the stays: a car that stayed at least `min_stay_s` (or is still there past
    it), counted on the day it arrived.  A flicker is not a car, and the first reading after a start-up is not an arrival."""
    days: dict[str, int] = {}
    t = start
    while t < end:
        days[datetime.fromtimestamp(t, tz).strftime("%Y-%m-%d")] = 0
        t = _bucket_start(t + DAY * 1.5, "day", tz)
    for s in stay_list:
        if start <= s["start"] < end and is_car(s, min_stay_s):
            k = datetime.fromtimestamp(s["start"], tz).strftime("%Y-%m-%d")
            days[k] = days.get(k, 0) + 1
    return [{"date": k, "cars": v} for k, v in sorted(days.items())]


def quality(records: list[dict], start: float, end: float, sample_s: float = SAMPLE_S) -> dict:
    """Minutes spent in each parking verdict (judged bays only) and the share parked correctly."""
    minutes = {k: 0.0 for k in JUDGED}
    for r in records:
        if r.get("type") == "sample" and start <= r["t"] < end:
            for v in (r.get("parking") or {}).values():
                if v in minutes:
                    minutes[v] += sample_s / 60.0
    total = sum(minutes.values())
    return {"minutes": {k: round(v, 1) for k, v in minutes.items()}, "judged_minutes": round(total, 1),
            "correct_pct": round(minutes["correct"] / total * 100.0, 1) if total else None}


def episodes(records: list[dict], start: float, end: float, now: Optional[float] = None) -> list[dict]:
    """Over-the-line episodes: from a `parking_over_line` event to the verdict clearing or the bay emptying."""
    now = datetime.now().timestamp() if now is None else now
    open_: dict[str, dict] = {}
    out: list[dict] = []

    def close(bay, t, why):
        e = open_.pop(bay, None)
        if e is not None:
            e.update(end=t, duration_s=round(t - e["start"], 1), ended_by=why)
            out.append(e)

    for r in records:
        kind, bay = r.get("type"), r.get("bay_id")
        bay = None if bay is None else str(bay)
        if kind == "parking_over_line" and bay is not None:
            open_.setdefault(bay, {"bay": bay, "start": r["t"], "detail": str(r.get("detail") or "")})
        elif kind == "parking_ok" and bay is not None:
            close(bay, r["t"], "moved right")
        elif kind == "bay_freed" and bay is not None:
            close(bay, r["t"], "car left")
        elif kind == "bay_initial" and bay is not None:
            open_.pop(bay, None)                                  # a restart forgets the verdicts, so the episode's end is unknown
    result = [e for e in out if start <= e["start"] < end]
    result += [{**e, "end": None, "duration_s": round(min(now, end) - e["start"], 1), "ended_by": "still over"}
               for e in open_.values() if start <= e["start"] < end]
    result.sort(key=lambda e: e["start"])
    for e in result:
        e["label"] = activity_log.bay_label(e["bay"])
    return result


def uptime(records: list[dict], start: float, end: float, now: Optional[float] = None) -> dict:
    """How long the camera was offline, too dark to judge, or moved, within the period (and as a share of it)."""
    now = datetime.now().timestamp() if now is None else now
    horizon = min(end, now)
    period = max(horizon - start, 1.0)
    out = {}
    for name, (on, off) in SPAN_PAIRS.items():
        spans, opened = [], None
        for r in records:
            if r.get("type") == on and opened is None:
                opened = r["t"]
            elif r.get("type") == off and opened is not None:
                spans.append((opened, r["t"]))
                opened = None
        if opened is not None:
            spans.append((opened, horizon))
        clipped = [(max(a, start), min(b, horizon)) for a, b in spans if b > start and a < horizon]
        total = sum(b - a for a, b in clipped)
        out[name] = {"total_s": round(total, 1), "pct": round(total / period * 100.0, 2),
                     "spans": [{"start": a, "end": b} for a, b in clipped][-50:]}
    out["period_s"] = round(period, 1)
    return out


def heat_grid(records: list[dict], start: float, end: float, tz: tzinfo) -> list[list[Optional[float]]]:
    """7 rows (Monday first) x 24 hours of average occupancy %, None where there is no sample."""
    acc = [[[0.0, 0] for _ in range(24)] for _ in range(7)]
    for r in records:
        if r.get("type") == "sample" and start <= r["t"] < end and r.get("occupied", 0) + r.get("vacant", 0) > 0:
            d = datetime.fromtimestamp(r["t"], tz)
            cell = acc[d.weekday()][d.hour]
            cell[0] += r["occupied"] / (r["occupied"] + r["vacant"]) * 100.0
            cell[1] += 1
    return [[round(s / n, 1) if n else None for s, n in row] for row in acc]


def build_report(dirs, camera_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None,
                 bucket: Optional[str] = None, now: Optional[float] = None, sample_s: float = SAMPLE_S) -> dict:
    """Everything the Reports page shows, for one camera and a range of whole local days."""
    tz = site_tz()
    now = datetime.now().timestamp() if now is None else now
    start, end = parse_range(date_from, date_to, now, tz)
    bucket = bucket if bucket in BUCKETS else auto_bucket(start, end)
    records = read_records(dirs, camera_id, start, end)
    inside = [r for r in records if r["t"] >= start]
    series = occupancy_series(inside, start, end, bucket, tz, sample_s, until=now)
    st = stays(records, start, end, now)
    seen = [b for b in series if b["occupancy_pct"] is not None]
    peak = max(seen, key=lambda b: b["occupancy_pct"]) if seen else None
    util = bay_utilisation(inside, start, end)
    busiest = max((b for b in util if b["utilisation_pct"] is not None), key=lambda b: b["utilisation_pct"], default=None)
    horizon = min(end, now)
    expected = max((horizon - start) / sample_s, 1.0)
    return {
        "camera_id": camera_id, "from": datetime.fromtimestamp(start, tz).strftime("%Y-%m-%d"),
        "to": datetime.fromtimestamp(end - 1, tz).strftime("%Y-%m-%d"), "start": start, "end": end, "bucket": bucket,
        "timezone": str(tz), "generated_at": now,
        "coverage": round(min(1.0, sum(b["samples"] for b in series) / expected), 3),
        "occupancy": series, "peak": peak, "bays": util, "busiest_bay": busiest,
        "stays": st, "dwell": dwell_summary(st), "cars_per_day": cars_per_day(st, start, end, tz),
        "quality": quality(inside, start, end, sample_s), "episodes": episodes(records, start, end, now),
        "uptime": uptime(inside, start, end, now), "heat": heat_grid(inside, start, end, tz),
    }


# ---------------------------------------------------------------- CSV

def _hhmm(epoch: Optional[float], tz: tzinfo) -> str:
    return "" if epoch is None else datetime.fromtimestamp(epoch, tz).isoformat(sep=" ", timespec="seconds")


def table_rows(report: dict, table: str) -> tuple[list[str], list[list]]:
    """(columns, rows) of one of TABLES, from a report built by build_report."""
    tz = site_tz()
    if table == "occupancy":
        return (["period_start", "occupancy_pct", "occupied_avg", "vacant_avg", "unclear_avg", "samples", "coverage_pct"],
                [[b["label"], b["occupancy_pct"], b["occupied_avg"], b["vacant_avg"], b["unclear_avg"], b["samples"],
                  "" if b["coverage"] is None else round(b["coverage"] * 100)] for b in report["occupancy"]])
    if table == "bays":
        return (["bay", "utilisation_pct", "samples"], [[b["label"], b["utilisation_pct"], b["samples"]] for b in report["bays"]])
    if table == "stays":
        return (["bay", "start", "end", "dwell_minutes", "counted_in_averages", "plate", "note"],
                [[s["label"], _hhmm(s["start"], tz), _hhmm(s["end"], tz), round(s["dwell_s"] / 60.0, 1), "yes" if s["counted"] else "no",
                  (s.get("plate") or "") + ("" if s.get("plate_confirmed") or not s.get("plate") else " (unconfirmed)"),
                  "still parked" if s["open"] else "short flicker, not counted as a car" if s["flicker"]
                  else "cut short (outage, dark, moved camera or restart)" if s["interrupted"] else ""]
                 for s in report["stays"]])
    if table == "episodes":
        return (["bay", "start", "end", "minutes", "ended_by", "detail"],
                [[e["label"], _hhmm(e["start"], tz), _hhmm(e["end"], tz), round(e["duration_s"] / 60.0, 1), e["ended_by"], e["detail"]]
                 for e in report["episodes"]])
    raise ValueError(f"no such table '{table}'")


def table_csv(report: dict, table: str) -> str:
    """The table as CSV that opens in Excel (text cells that look like formulas are neutralised)."""
    cols, rows = table_rows(report, table)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(cols)
    for row in rows:
        w.writerow(["" if v is None else activity_log._safe(v) for v in row])
    return buf.getvalue()
