"""
Management reports worked out from the raw activity log: occupancy over time, stays, quality, episodes, uptime.
Times are India time (the default report zone, a fixed +5:30), so a day boundary is at 18:30 UTC.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import reports as R  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def at(day, hh, mm=0, ss=0):
    """Epoch of a time on 2026-10-<day> in India."""
    return datetime(2026, 10, day, hh, mm, ss, tzinfo=IST).timestamp()


NOW = at(26, 12)                                    # the report is read at noon on the 26th


def put(folder, camera, recs, torn=False):
    """Seed <folder>/<camera>-YYYYMMDD.jsonl the way live.py does (a file per server-local date)."""
    folder.mkdir(parents=True, exist_ok=True)
    by_file = {}
    for r in recs:
        by_file.setdefault(datetime.fromtimestamp(r["t"]).strftime("%Y%m%d"), []).append(r)
    for stamp, rows in by_file.items():
        with open(folder / f"{camera}-{stamp}.jsonl", "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
            if torn:
                f.write('{"t": 17')                  # a half-written last line


def samples(day, hh, minutes, occupied, vacant, **extra):
    return [{"t": at(day, hh, m), "type": "sample", "occupied": occupied, "vacant": vacant, "unclear": 0, "stale": 0, **extra}
            for m in range(minutes)]


@pytest.fixture(autouse=True)
def india(monkeypatch):
    monkeypatch.delenv("ANPR_TIMEZONE", raising=False)
    monkeypatch.setattr(R, "site_tz", lambda: IST)


# ---- the range

def test_no_dates_means_today_and_the_end_date_is_inclusive():
    assert R.parse_range(None, None, NOW) == (at(26, 0), at(27, 0))
    assert R.parse_range("2026-10-24", "2026-10-26", NOW) == (at(24, 0), at(27, 0))
    assert R.parse_range("2026-10-24", None, NOW) == (at(24, 0), at(25, 0))


@pytest.mark.parametrize("a,b", [("2026-10-26", "2026-10-25"), ("26/10/2026", None), ("2026-10-26", "nope"), ("2024-01-01", "2026-10-26")])
def test_a_bad_range_is_an_error_not_a_guess(a, b):
    with pytest.raises(ValueError):
        R.parse_range(a, b, NOW)


def test_the_bucket_follows_how_long_the_period_is():
    assert R.auto_bucket(at(26, 0), at(27, 0)) == "quarter"
    assert R.auto_bucket(at(20, 0), at(27, 0)) == "hour"
    assert R.auto_bucket(at(1, 0), at(31, 0)) == "day"


# ---- occupancy over time

def test_occupancy_is_the_average_over_the_buckets_samples_and_a_gap_is_no_data_not_free():
    recs = samples(26, 9, 15, occupied=2, vacant=2) + samples(26, 10, 15, occupied=4, vacant=0)
    out = R.occupancy_series(recs, at(26, 0), at(27, 0), "quarter", IST, sample_s=60, until=NOW)
    by = {b["label"][11:16]: b for b in out}
    assert len(out) == 96
    assert by["09:00"]["occupancy_pct"] == 50.0 and by["09:00"]["coverage"] == 1.0 and by["09:00"]["samples"] == 15
    assert by["10:00"]["occupancy_pct"] == 100.0
    assert by["09:30"]["occupancy_pct"] is None and by["09:30"]["coverage"] == 0.0        # nothing seen: not "0% occupied"
    assert by["14:00"]["future"] is True and by["14:00"]["coverage"] is None             # it has not happened yet
    assert by["09:00"]["future"] is False


def test_half_the_samples_is_half_the_coverage_and_unclear_bays_do_not_count_as_free():
    recs = [{"t": at(26, 9, m * 2), "type": "sample", "occupied": 1, "vacant": 1, "unclear": 2, "stale": 0} for m in range(8)]
    b = R.occupancy_series(recs, at(26, 0), at(27, 0), "quarter", IST, sample_s=60, until=NOW)[36]   # 09:00
    assert b["coverage"] == pytest.approx(8 / 15, abs=0.001)
    assert b["occupancy_pct"] == 50.0 and b["unclear_avg"] == 2.0                                      # 1 of the 2 known bays


def test_a_sample_with_no_known_bay_leaves_the_percentage_empty():
    recs = [{"t": at(26, 9, 0), "type": "sample", "occupied": 0, "vacant": 0, "unclear": 3, "stale": 0}]
    b = R.occupancy_series(recs, at(26, 0), at(27, 0), "hour", IST, sample_s=60, until=NOW)[9]
    assert b["samples"] == 1 and b["occupancy_pct"] is None


def test_days_are_local_days():
    late = {"t": at(25, 23, 59), "type": "sample", "occupied": 1, "vacant": 0, "unclear": 0, "stale": 0}
    early = {"t": at(26, 0, 1), "type": "sample", "occupied": 0, "vacant": 1, "unclear": 0, "stale": 0}
    out = R.occupancy_series([late, early], at(25, 0), at(27, 0), "day", IST, until=NOW)
    assert [(b["label"][:10], b["occupancy_pct"]) for b in out] == [("2026-10-25", 100.0), ("2026-10-26", 0.0)]


# ---- per bay

def test_each_bays_utilisation_counts_only_minutes_it_was_seen():
    recs = [{"t": at(26, 9, m), "type": "sample", "occupied": 1, "vacant": 1, "unclear": 1, "stale": 0,
             "bays": {"1": "occupied" if m < 3 else "available", "2": "unclear", "10": "occupied"}} for m in range(4)]
    u = {b["bay"]: b for b in R.bay_utilisation(recs, at(26, 0), at(27, 0))}
    assert u["1"]["utilisation_pct"] == 75.0 and u["1"]["samples"] == 4
    assert u["2"]["utilisation_pct"] is None and u["2"]["samples"] == 4                  # never seen: no figure
    assert [b["bay"] for b in R.bay_utilisation(recs, at(26, 0), at(27, 0))] == ["1", "2", "10"]   # numeric order


# ---- stays

def ev(kind, day, hh, mm=0, bay=None, **kw):
    r = {"t": at(day, hh, mm), "type": kind, **kw}
    if bay is not None:
        r["bay_id"] = bay
    return r


def test_a_stay_runs_from_occupied_to_free_and_reports_the_minutes():
    recs = [ev("bay_occupied", 26, 9, 0, "1"), ev("bay_freed", 26, 10, 30, "1")]
    (s,) = R.stays(recs, at(26, 0), at(27, 0), NOW)
    assert (s["bay"], s["dwell_s"], s["open"], s["interrupted"], s["counted"]) == ("1", 5400.0, False, False, True)
    assert s["label"] == "P1"


def test_a_stay_cut_by_an_outage_darkness_a_moved_camera_or_a_restart_is_listed_but_not_counted():
    for cut in ("feed_offline", "low_light", "camera_moved"):
        recs = [ev("bay_occupied", 26, 9, 0, "1"), ev(cut, 26, 9, 30), ev("bay_freed", 26, 10, 0, "1")]
        (s,) = R.stays(recs, at(26, 0), at(27, 0), NOW)
        assert s["interrupted"] and not s["counted"], cut
    restart = [ev("bay_initial", 26, 9, 0, "1", status="occupied"), ev("bay_freed", 26, 10, 0, "1")]
    (s,) = R.stays(restart, at(26, 0), at(27, 0), NOW)
    assert s["interrupted"] and not s["counted"]                                          # when it began is unknown
    # a car was in the bay BEFORE the restart too: the bay may have emptied and filled again while the service was down
    across = [ev("bay_occupied", 26, 9, 0, "1"), ev("bay_initial", 26, 12, 0, "1", status="occupied"), ev("bay_freed", 26, 15, 0, "1")]
    (s,) = R.stays(across, at(26, 0), at(27, 0), NOW)
    assert s["interrupted"] and not s["counted"] and not s["initial"]                     # still began at 9:00, but its length is not trusted


def test_a_car_still_there_is_an_open_stay_up_to_now_and_a_free_with_no_opening_is_ignored():
    recs = [ev("bay_freed", 26, 8, 0, "3"), ev("bay_occupied", 26, 11, 0, "2")]
    (s,) = R.stays(recs, at(26, 0), at(27, 0), NOW)
    assert s["open"] and s["end"] is None and s["dwell_s"] == 3600.0 and not s["counted"]


def test_a_stay_that_ended_before_the_period_is_not_in_it_but_one_that_began_before_and_ended_inside_is():
    recs = [ev("bay_occupied", 25, 22, 0, "1"), ev("bay_freed", 26, 1, 0, "1"),
            ev("bay_occupied", 24, 9, 0, "2"), ev("bay_freed", 24, 10, 0, "2")]
    got = R.stays(recs, at(26, 0), at(27, 0), NOW)
    assert [(s["bay"], s["dwell_s"]) for s in got] == [("1", 10800.0)]


def test_dwell_statistics_use_only_the_stays_seen_from_start_to_finish():
    recs = [ev("bay_occupied", 26, 9, 0, "1"), ev("bay_freed", 26, 9, 30, "1"),
            ev("bay_occupied", 26, 10, 0, "1"), ev("bay_freed", 26, 11, 30, "1"),
            ev("bay_occupied", 26, 9, 0, "2"), ev("feed_offline", 26, 9, 40), ev("bay_freed", 26, 12, 0, "2")]
    recs.sort(key=lambda r: r["t"])                  # the outage cuts only what is open at 09:40: bay 2's car
    d = R.dwell_summary(R.stays(recs, at(26, 0), at(27, 0), NOW))
    assert (d["n"], d["avg_s"], d["median_s"], d["max_s"], d["excluded"]) == (2, 3600.0, 3600.0, 5400.0, 1)
    assert d["per_bay"]["P1"]["n"] == 2 and "P2" not in d["per_bay"]
    empty = R.dwell_summary([])
    assert empty["n"] == 0 and empty["avg_s"] is None


def test_cars_are_counted_on_the_day_they_arrived_and_a_flicker_or_a_restart_reading_is_not_a_car():
    recs = [ev("bay_occupied", 25, 23, 30, "1"), ev("bay_freed", 26, 1, 0, "1"),              # a car, arrived on the 25th
            ev("bay_occupied", 26, 0, 30, "2"), ev("bay_freed", 26, 2, 0, "2"),               # a car, arrived on the 26th
            ev("bay_occupied", 26, 9, 0, "3"), ev("bay_freed", 26, 9, 1, "3"),                # a minute: the camera flickering
            ev("bay_initial", 26, 9, 5, "4", status="occupied"), ev("bay_freed", 26, 10, 0, "4"),   # there before the restart
            ev("bay_occupied", 26, 11, 0, "5")]                                               # still parked at noon
    recs.sort(key=lambda r: r["t"])
    st = R.stays(recs, at(25, 0), at(27, 0), NOW)
    assert R.cars_per_day(st, at(25, 0), at(27, 0), IST) == [{"date": "2026-10-25", "cars": 1}, {"date": "2026-10-26", "cars": 2}]


def test_a_stay_shorter_than_the_minimum_is_a_flicker_not_a_car_and_stays_out_of_the_averages():
    recs = [ev("bay_occupied", 26, 9, 0, "7"), ev("bay_freed", 26, 9, 0, "7")]
    recs[1]["t"] += 20                                                                         # 20 seconds
    recs += [ev("bay_occupied", 26, 10, 0, "7"), ev("bay_freed", 26, 10, 5, "7"),               # 5 minutes: a real, short stay
             ev("bay_occupied", 26, 11, 0, "7")]                                              # still there at noon: not a flicker
    (a, b, c) = R.stays(sorted(recs, key=lambda r: r["t"]), at(26, 0), at(27, 0), NOW, min_stay_s=180)
    assert (a["flicker"], a["counted"]) == (True, False)
    assert (b["flicker"], b["counted"], b["dwell_s"]) == (False, True, 300.0)
    assert (c["flicker"], c["open"], c["counted"]) == (False, True, False)
    assert R.stays([recs[0], recs[1]], at(26, 0), at(27, 0), NOW, min_stay_s=10)[0]["counted"] is True     # the limit is a setting
    d = R.dwell_summary([a, b, c])
    assert (d["n"], d["avg_s"], d["flickers"], d["still_parked"], d["cut_short"]) == (1, 300.0, 1, 1, 0)


def test_a_bay_that_keeps_flickering_is_flagged_as_hard_to_see():
    recs = []
    for i in range(8):
        recs += [ev("bay_occupied", 26, 9, i * 3, "7"), {**ev("bay_freed", 26, 9, i * 3, "7"), "t": at(26, 9, i * 3, 20)}]
    recs += [ev("bay_occupied", 26, 10, 0, "2"), {**ev("bay_freed", 26, 10, 0, "2"), "t": at(26, 10, 0, 30)}]
    d = R.dwell_summary(R.stays(sorted(recs, key=lambda r: r["t"]), at(26, 0), at(27, 0), NOW))
    assert d["flickers"] == 9 and d["n"] == 0 and d["avg_s"] is None
    assert d["unstable_bays"] == [{"label": "P7", "flickers": 8}]                              # P2's single flicker is not enough
    assert d["flickers_by_bay"] == {"P7": 8, "P2": 1}                                           # but every bay's count is there for the bay health table


# ---- quality and episodes

def test_parking_quality_counts_minutes_per_verdict_and_the_correct_share_of_judged_time():
    recs = [{"t": at(26, 9, m), "type": "sample", "occupied": 3, "vacant": 0, "unclear": 0, "stale": 0,
             "parking": {"1": "correct", "2": "correct", "3": "over_line"}} for m in range(10)]
    q = R.quality(recs, at(26, 0), at(27, 0), sample_s=60)
    assert q["minutes"] == {"correct": 20.0, "close_to_line": 0.0, "over_line": 10.0}
    assert q["judged_minutes"] == 30.0 and q["correct_pct"] == pytest.approx(66.7, abs=0.05)
    assert R.quality([], at(26, 0), at(27, 0))["correct_pct"] is None                       # nothing judged: no figure


def test_an_over_the_line_episode_ends_when_the_car_moves_right_or_leaves_and_a_restart_forgets_it():
    recs = [ev("parking_over_line", 26, 9, 0, "3", detail="Over the right line by 0.45 m"), ev("parking_ok", 26, 9, 20, "3"),
            ev("parking_over_line", 26, 10, 0, "3", detail="=1+1"), ev("bay_freed", 26, 10, 45, "3"),
            ev("parking_over_line", 26, 11, 0, "5", detail="x"),
            ev("parking_over_line", 26, 11, 30, "6", detail="y"), ev("bay_initial", 26, 11, 31, "6", status="occupied")]
    recs.sort(key=lambda r: r["t"])
    eps = R.episodes(recs, at(26, 0), at(27, 0), NOW)
    assert [(e["label"], e["duration_s"], e["ended_by"]) for e in eps] == [
        ("P3", 1200.0, "moved right"), ("P3", 2700.0, "car left"), ("P5", 3600.0, "still over")]
    assert all(e["label"] != "P6" for e in eps)


# ---- uptime and the heat grid

def test_uptime_clips_spans_to_the_period_and_an_open_outage_runs_to_now():
    recs = [ev("feed_offline", 25, 23, 0), ev("feed_online", 26, 1, 0),                    # starts before the period
            ev("low_light", 26, 11, 0)]                                                     # still dark at noon
    u = R.uptime(recs, at(26, 0), at(27, 0), NOW)
    assert u["offline"]["total_s"] == 3600.0                                               # only the hour inside the 26th
    assert u["dark"]["total_s"] == 3600.0 and u["dark"]["pct"] == pytest.approx(8.33, abs=0.01)   # 1 h of the 12 h so far
    assert u["moved"]["total_s"] == 0.0 and u["period_s"] == 43200.0


def test_the_heat_grid_is_monday_first_and_empty_where_nothing_was_sampled():
    recs = samples(26, 9, 5, occupied=1, vacant=3)                                          # Monday 26 Oct 2026, 09:xx
    grid = R.heat_grid(recs, at(26, 0), at(27, 0), IST)
    assert datetime(2026, 10, 26).weekday() == 0
    assert grid[0][9] == 25.0 and grid[0][10] is None and grid[1][9] is None and len(grid) == 7 and len(grid[0]) == 24


# ---- everything together

def test_a_whole_report_from_files_in_both_log_folders_with_a_torn_last_line(tmp_path):
    new, old = tmp_path / "logs", tmp_path / "live_logs"
    put(new, "phone-1", samples(26, 9, 10, occupied=2, vacant=2, bays={"1": "occupied", "2": "available"})
        + [ev("bay_occupied", 26, 9, 0, "1")], torn=True)
    put(old, "phone-1", [ev("bay_freed", 26, 9, 45, "1")])
    put(new, "other-cam", samples(26, 9, 10, occupied=4, vacant=0))
    rep = R.build_report([new, old], "phone-1", "2026-10-26", "2026-10-26", now=NOW, sample_s=60)
    assert (rep["from"], rep["to"], rep["bucket"]) == ("2026-10-26", "2026-10-26", "quarter")
    assert rep["peak"]["occupancy_pct"] == 50.0 and rep["peak"]["label"].endswith("09:00+05:30")
    assert [(s["bay"], s["dwell_s"]) for s in rep["stays"]] == [("1", 2700.0)]
    assert rep["dwell"]["n"] == 1 and rep["cars_per_day"] == [{"date": "2026-10-26", "cars": 1}]
    assert rep["bays"][0]["utilisation_pct"] == 100.0 and rep["busiest_bay"]["bay"] == "1"
    assert rep["coverage"] == pytest.approx(10 / 720, abs=0.001)                            # 10 samples in the 12 h so far
    json.dumps(rep)                                                                         # it goes out as JSON


def test_an_empty_period_is_a_report_with_no_figures_not_an_error(tmp_path):
    rep = R.build_report([tmp_path], "phone-1", "2026-10-26", None, now=NOW)
    assert rep["peak"] is None and rep["stays"] == [] and rep["coverage"] == 0.0 and rep["quality"]["correct_pct"] is None


def test_csv_tables_have_headers_and_formulas_are_neutralised(tmp_path):
    new = tmp_path / "logs"
    put(new, "c", [ev("parking_over_line", 26, 9, 0, "3", detail="=HYPERLINK(1)"), ev("bay_freed", 26, 9, 10, "3"),
                   ev("bay_occupied", 26, 8, 0, "3")] + samples(26, 9, 3, occupied=1, vacant=1, bays={"3": "occupied"}))
    rep = R.build_report([new], "c", "2026-10-26", None, now=NOW, sample_s=60)
    ep = R.table_csv(rep, "episodes").split("\r\n")
    assert ep[0] == "bay,start,end,minutes,ended_by,detail"
    assert "'=HYPERLINK(1)" in ep[1] and ep[1].startswith("P3,2026-10-26 09:00:00")
    assert R.table_csv(rep, "occupancy").startswith("period_start,occupancy_pct,occupied_avg,vacant_avg,unclear_avg,samples,coverage_pct\r\n")
    assert R.table_csv(rep, "bays").splitlines()[1] == "P3,100.0,3"
    assert R.table_csv(rep, "stays").splitlines()[1].startswith("P3,2026-10-26 08:00:00+05:30,2026-10-26 09:10:00+05:30,70.0,yes")   # the time zone is in the cell
    with pytest.raises(ValueError):
        R.table_csv(rep, "nope")
