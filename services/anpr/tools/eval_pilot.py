"""
Score a pilot run against hand-labelled ground truth.

    python tools/eval_pilot.py --truth truth.csv --log run.jsonl [--md report.md] [--json report.json]

truth.csv    one row per stretch of video where you know what a bay really held:
                 bay_id,start_s,end_s,state          state is VACANT or OCCUPIED, times are video seconds
             Anything not covered by a row is not scored, so label only what you are sure about
             (leave out the moment a car is driving in).
run.jsonl    one line per frame the replay sent (test_fixtures/replay_live.py --record run.jsonl):
                 {"video_s", "stream_status", "ms_per_frame", "slots": {"1": "OCCUPIED", ...}}

Positive class is OCCUPIED.  A bay the system calls UNCERTAIN or STALE is "undecided": it is neither a
false alarm nor a hit, and it is counted separately so an honest "I cannot tell" is visible, not hidden.

  precision         of the bays reported OCCUPIED, how many really were            TP / (TP + FP)
  recall            of the bays really OCCUPIED, how many were reported so         TP / (TP + FN + undecided)
  decided recall    the same, ignoring the moments the system declined to answer   TP / (TP + FN)
  false occupied    seconds a really-empty bay was reported occupied
  false vacant      seconds a really-occupied bay was reported vacant              (the dangerous one)
  latency           seconds from a real change to the system reporting it (and keeping it for 3 readings)
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

VACANT, OCCUPIED = "VACANT", "OCCUPIED"
UNDECIDED = ("UNCERTAIN", "STALE")
HOLD = 3                      # readings in a row that count as "the system has switched"


class EvalError(ValueError):
    """The truth file or the log cannot be used; the message says why."""


def percentile(values, p):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p / 100.0
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def load_truth(path):
    """[(bay_id, start_s, end_s, state)] from the CSV; raises EvalError on anything unclear."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        rd = csv.DictReader(f)
        need = {"bay_id", "start_s", "end_s", "state"}
        if not rd.fieldnames or not need <= {h.strip() for h in rd.fieldnames}:
            raise EvalError(f"{path}: the header must be bay_id,start_s,end_s,state")
        for n, r in enumerate(rd, start=2):
            r = {k.strip(): (v or "").strip() for k, v in r.items()}
            if not any(r.values()):
                continue
            try:
                a, b = float(r["start_s"]), float(r["end_s"])
            except ValueError:
                raise EvalError(f"{path} line {n}: start_s and end_s must be numbers")
            state = r["state"].upper()
            if state not in (VACANT, OCCUPIED):
                raise EvalError(f"{path} line {n}: state must be VACANT or OCCUPIED, not '{r['state']}'")
            if not r["bay_id"]:
                raise EvalError(f"{path} line {n}: bay_id is empty")
            if b <= a:
                raise EvalError(f"{path} line {n}: end_s must be after start_s")
            rows.append((r["bay_id"], a, b, state))
    if not rows:
        raise EvalError(f"{path}: no rows")
    by_bay = {}
    for bay, a, b, s in sorted(rows, key=lambda x: (x[0], x[1])):
        prev = by_bay.get(bay)
        if prev and a < prev[-1][2]:
            raise EvalError(f"{path}: bay {bay} has overlapping stretches ({prev[-1][1]}-{prev[-1][2]} and {a}-{b})")
        by_bay.setdefault(bay, []).append((bay, a, b, s))
    return rows


VERDICTS = ("correct", "close_to_line", "over_line")


def load_verdict_truth(path):
    """{bay_id: [(start_s, end_s, verdict)]} from the optional `verdict` column (only rows that have one; a person says it for a car,
    correct / close_to_line / over_line).  Empty when the file has no such column."""
    out = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        rd = csv.DictReader(f)
        if not rd.fieldnames or "verdict" not in {h.strip() for h in rd.fieldnames}:
            return out
        for n, r in enumerate(rd, start=2):
            r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
            v = r.get("verdict", "").lower()
            if not v:
                continue
            if v not in VERDICTS:
                raise EvalError(f"{path} line {n}: verdict must be one of {', '.join(VERDICTS)}, not '{v}'")
            try:
                out.setdefault(r["bay_id"], []).append((float(r["start_s"]), float(r["end_s"]), v))
            except (KeyError, ValueError):
                raise EvalError(f"{path} line {n}: start_s and end_s must be numbers")
    for v in out.values():
        v.sort()
    return out


def load_log(path):
    """The recorded frames, in time order."""
    out = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                rec["video_s"] = float(rec["video_s"])
                rec["slots"] = {str(k): str(v).upper() for k, v in (rec.get("slots") or {}).items()}
            except (ValueError, KeyError, TypeError):
                raise EvalError(f"{path} line {n}: not a recorded frame")
            out.append(rec)
    if not out:
        raise EvalError(f"{path}: no frames")
    return sorted(out, key=lambda r: r["video_s"])


def truth_at(stretches, t):
    for a, b, s in stretches:
        if a <= t < b:
            return s
    return None


def _score(pairs, interval):
    """pairs: [(truth, predicted)] -> the confusion counts and the metrics."""
    tp = fp = fn = und_occ = und_vac = tn = 0
    for truth, pred in pairs:
        if pred in UNDECIDED:
            if truth == OCCUPIED:
                und_occ += 1
            else:
                und_vac += 1
        elif truth == OCCUPIED and pred == OCCUPIED:
            tp += 1
        elif truth == VACANT and pred == OCCUPIED:
            fp += 1
        elif truth == OCCUPIED and pred == VACANT:
            fn += 1
        else:
            tn += 1
    n = len(pairs)
    div = lambda a, b: None if b == 0 else round(a / b, 4)
    return {
        "samples": n, "tp": tp, "fp": fp, "fn": fn, "tn": tn, "undecided_when_occupied": und_occ, "undecided_when_vacant": und_vac,
        "precision": div(tp, tp + fp),
        "recall": div(tp, tp + fn + und_occ),
        "decided_recall": div(tp, tp + fn),
        "false_occupied_s": round(fp * interval, 1), "false_vacant_s": round(fn * interval, 1),
        "undecided_share": div(und_occ + und_vac, n),
    }


def _first_switch(series, start, end, target):
    """Time of the first of HOLD readings in a row equal to `target` inside [start, end), or None."""
    run, first = 0, None
    for t, p in series:
        if t < start or t >= end:
            continue
        if p == target:
            run += 1
            if run == 1:
                first = t
            if run >= HOLD:
                return first
        else:
            run, first = 0, None
    return None


def _latencies(stretches, series):
    """For each real change in a bay, how long the system took to report it.  series: [(t, predicted)]."""
    out, missed = [], []
    for (a1, b1, s1), (a2, b2, s2) in zip(stretches, stretches[1:]):
        if s1 == s2 or abs(a2 - b1) > 1e-6:          # not a change, or there is a gap in the labels
            continue
        first = _first_switch(series, a2, b2, s2)
        if first is None:
            missed.append({"at_s": a2, "to": s2})
        else:
            out.append(round(first - a2, 1))
    return out, missed


def _verdict_score(pairs):
    """pairs: [(truth_is_over, predicted)] where predicted is "over" / "not_over" / None (the system gave no verdict: undecided)."""
    tp = sum(1 for t, p in pairs if t and p == "over")
    fp = sum(1 for t, p in pairs if not t and p == "over")
    fn = sum(1 for t, p in pairs if t and p == "not_over")
    und = sum(1 for t, p in pairs if t and p is None)
    tn = sum(1 for t, p in pairs if not t and p == "not_over")
    div = lambda a, b: None if b == 0 else round(a / b, 4)
    return {"readings": len(pairs), "tp": tp, "fp": fp, "fn": fn, "tn": tn, "undecided_when_over": und,
            "precision": div(tp, tp + fp), "recall": div(tp, tp + fn + und), "decided_recall": div(tp, tp + fn)}


def _stretch_index(stretches, t):
    for i, (a, b, _s) in enumerate(stretches):
        if a <= t < b:
            return i
    return None


def evaluate(truth, log, verdict_truth=None, zones=None):
    """truth: from load_truth, log: from load_log -> a dict of everything worth reporting.
    verdict_truth (load_verdict_truth) adds the "over the line" scores; `zones` ({bay: near|middle|far}, or taken from the log's own
    "zones") splits every figure by distance from the camera: a far bay's mistakes must not hide in an average."""
    zones = zones or next((r["zones"] for r in log if r.get("zones")), None) or {}
    by_bay = {}
    for bay, a, b, s in truth:
        by_bay.setdefault(bay, []).append((a, b, s))
    for v in by_bay.values():
        v.sort()
    times = [r["video_s"] for r in log]
    gaps = [b - a for a, b in zip(times, times[1:]) if b > a]
    interval = statistics.median(gaps) if gaps else 1.0

    per_bay, all_pairs, lat, missed = {}, [], [], {}
    zone_pairs, flips_by_bay, ids_by_bay, covered_s, occupied_s = {}, {}, {}, {}, {}
    verdict_pairs, verdict_zone = [], {}
    verdicts_by_bay = verdict_truth or {}
    for bay, stretches in by_bay.items():
        pairs, series = [], []
        flips = ids = 0
        prev = None                                        # (stretch index, predicted, track id) of the last reading inside the labels
        for rec in log:
            pred = rec["slots"].get(bay)
            if pred is None:
                continue
            series.append((rec["video_s"], pred))
            t = truth_at(stretches, rec["video_s"])
            if t is not None:
                pairs.append((t, pred))
            # flicker: the answer changes between two readings that lie in ONE stretch the person labelled as steady
            si = _stretch_index(stretches, rec["video_s"])
            tid = (rec.get("tracks") or {}).get(bay)
            if si is not None and pred in (VACANT, OCCUPIED):
                if prev and prev[0] == si:
                    if prev[1] != pred:
                        flips += 1
                    elif pred == OCCUPIED and tid is not None and prev[2] is not None and tid != prev[2]:
                        ids += 1                           # the same parked car, a new track number
                prev = (si, pred, tid)
            else:
                prev = None
            # the line verdict, where a person said what the car did
            vs = verdicts_by_bay.get(bay)
            if vs and t == OCCUPIED:
                tv = next((v for a, b, v in vs if a <= rec["video_s"] < b), None)
                if tv is not None:
                    pv = (rec.get("verdicts") or {}).get(bay)
                    p = None if (pred != OCCUPIED or pv in (None, "not_judged")) else ("over" if pv == "over_line" else "not_over")
                    verdict_pairs.append((tv == "over_line", p))
                    verdict_zone.setdefault(zones.get(bay, "all"), []).append((tv == "over_line", p))
        per_bay[bay] = _score(pairs, interval)
        all_pairs += pairs
        zone_pairs.setdefault(zones.get(bay, "all"), []).extend(pairs)
        flips_by_bay[bay], ids_by_bay[bay] = flips, ids
        covered_s[bay] = sum(b - a for a, b, _s in stretches)
        occupied_s[bay] = sum(b - a for a, b, s in stretches if s == OCCUPIED)
        per_bay[bay]["flickers"], per_bay[bay]["id_switches"] = flips, ids
        l, m = _latencies(stretches, series)
        per_bay[bay]["latencies_s"] = l
        lat += l
        if m:
            missed[bay] = m

    unknown = sorted(set(by_bay) - {b for r in log for b in r["slots"]})
    live = [r for r in log if r.get("stream_status", "live") == "live"]
    ms = [r["ms_per_frame"] for r in log if r.get("ms_per_frame")]
    span = (times[-1] - times[0]) if len(times) > 1 else 0
    hours = sum(covered_s.values()) / 3600.0
    occ_hours = sum(occupied_s.values()) / 3600.0
    return {
        "frames": len(log), "span_s": round(span, 1), "interval_s": round(interval, 2),
        "overall": _score(all_pairs, interval),
        "flicker": {"flips": sum(flips_by_bay.values()), "labelled_bay_hours": round(hours, 3),
                    "per_bay_hour": None if hours <= 0 else round(sum(flips_by_bay.values()) / hours, 2)},
        "track_ids": {"switches": sum(ids_by_bay.values()), "occupied_bay_hours": round(occ_hours, 3),
                      "per_occupied_bay_hour": None if occ_hours <= 0 else round(sum(ids_by_bay.values()) / occ_hours, 2)},
        "verdict_over_line": _verdict_score(verdict_pairs) if verdict_pairs else None,
        "by_zone": {z: {**_score(p, interval), **({"verdict_over_line": _verdict_score(verdict_zone[z])} if z in verdict_zone else {})}
                    for z, p in sorted(zone_pairs.items())} if zones else None,
        "per_bay": per_bay,
        "latency_s": {"transitions": len(lat), "missed": sum(len(v) for v in missed.values()),
                      "median": None if not lat else round(statistics.median(lat), 1),
                      "p90": None if not lat else round(percentile(lat, 90), 1),
                      "missed_detail": missed},
        "stream_uptime": round(len(live) / len(log), 4),
        "inference_ms": {"median": None if not ms else round(statistics.median(ms)), "p90": None if not ms else round(percentile(ms, 90))},
        "bays_in_truth_but_not_in_log": unknown,
    }


def _pct(v):
    return "–" if v is None else f"{v * 100:.1f}%"


def _secs(v):
    return "–" if v is None else f"{v} s"


def markdown(rep):
    o = rep["overall"]
    lines = [
        "| Measure | Value |", "|---|---|",
        f"| Frames scored / video length | {o['samples']} bay-readings from {rep['frames']} frames, {rep['span_s']} s (one every {rep['interval_s']} s) |",
        f"| Precision (occupied) | {_pct(o['precision'])} |",
        f"| Recall (occupied, undecided counted as missed) | {_pct(o['recall'])} |",
        f"| Recall among decided readings | {_pct(o['decided_recall'])} |",
        f"| False occupied | {o['false_occupied_s']} s ({o['fp']} readings) |",
        f"| False vacant | {o['false_vacant_s']} s ({o['fn']} readings) |",
        f"| Undecided (unclear / no signal) | {_pct(o['undecided_share'])} of readings |",
        f"| Change latency, median / p90 | {_secs(rep['latency_s']['median'])} / {_secs(rep['latency_s']['p90'])} over {rep['latency_s']['transitions']} changes ({rep['latency_s']['missed']} never reported) |",
        f"| Flicker: answer changed inside a steady stretch | {rep['flicker']['flips']} times, {rep['flicker']['per_bay_hour']} per labelled bay-hour |",
        f"| Same parked car, new track number | {rep['track_ids']['switches']} times, {rep['track_ids']['per_occupied_bay_hour']} per occupied bay-hour |",
        *([f"| Over the line: precision / recall (undecided counted as missed) | {_pct(rep['verdict_over_line']['precision'])} / "
           f"{_pct(rep['verdict_over_line']['recall'])} over {rep['verdict_over_line']['readings']} readings "
           f"(tp {rep['verdict_over_line']['tp']}, fp {rep['verdict_over_line']['fp']}, fn {rep['verdict_over_line']['fn']}, "
           f"no verdict {rep['verdict_over_line']['undecided_when_over']}) |"] if rep.get("verdict_over_line") else []),
        f"| Stream uptime | {_pct(rep['stream_uptime'])} |",
        f"| Inference, median / p90 per frame | {rep['inference_ms']['median']} ms / {rep['inference_ms']['p90']} ms |",
        "", "| Bay | Readings | Precision | Recall | False occupied | False vacant | Undecided |", "|---|---|---|---|---|---|---|",
    ]
    for bay, s in sorted(rep["per_bay"].items()):
        lines.append(f"| {bay} | {s['samples']} | {_pct(s['precision'])} | {_pct(s['recall'])} | {s['false_occupied_s']} s | {s['false_vacant_s']} s | {_pct(s['undecided_share'])} |")
    if rep.get("by_zone"):
        lines += ["", "| Zone | Readings | Precision | Recall | False occupied | False vacant | Over-the-line precision / recall |", "|---|---|---|---|---|---|---|"]
        for z, s in rep["by_zone"].items():
            v = s.get("verdict_over_line")
            lines.append(f"| {z} | {s['samples']} | {_pct(s['precision'])} | {_pct(s['recall'])} | {s['false_occupied_s']} s | {s['false_vacant_s']} s | "
                         f"{'–' if not v else _pct(v['precision']) + ' / ' + _pct(v['recall'])} |")
    if rep["bays_in_truth_but_not_in_log"]:
        lines += ["", "Bays in the truth file but never reported: " + ", ".join(rep["bays_in_truth_but_not_in_log"])]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--md")
    ap.add_argument("--json")
    ap.add_argument("--zones", help='optional JSON {"Bay-01": "near", ...}; the log\'s own "zones" are used when this is not given')
    a = ap.parse_args(argv)
    try:
        zones = json.loads(Path(a.zones).read_text(encoding="utf-8")) if a.zones else None
        rep = evaluate(load_truth(a.truth), load_log(a.log), verdict_truth=load_verdict_truth(a.truth), zones=zones)
    except (EvalError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    md = markdown(rep)
    print(md)
    if a.md:
        Path(a.md).write_text(md + "\n", encoding="utf-8")
    if a.json:
        Path(a.json).write_text(json.dumps(rep, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
