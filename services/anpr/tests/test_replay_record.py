"""
tools/replay_record.py: a recorded day through the current code, scored by eval_pilot.  Run in a fresh process (as it is used), so it
cannot touch this process's data folder.
"""
import json
import subprocess
import sys
from datetime import timezone
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import eval_pilot as ev  # noqa: E402
import record as R  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIX = Path(__file__).parent / "fixtures"
HAVE_WEIGHTS = (ROOT / "weights" / "best.pt").exists()
T0 = 1793300000.0


@pytest.mark.skipif(not HAVE_WEIGHTS, reason="needs the detector weights")
def test_a_recorded_day_replays_and_scores(tmp_path):
    bays = json.loads((FIX / "straddling_row_layout.json").read_text())
    frame = cv2.imread(str(FIX / "straddling_row_day.jpg"))
    r = R.Recorder(tmp_path / "record", 30, tz=timezone.utc)
    for k in range(3):                                                    # the same quiet scene three times, 30 s apart
        r.save("cam", frame, {"light": "ok", "calibration": "ok", "polygons": bays, "zones": {b: "near" for b in bays}, "bays": {}}, T0 + 30 * k)
    day = tmp_path / "record" / "cam" / r.day_of(T0)
    out = tmp_path / "run.jsonl"
    p = subprocess.run([sys.executable, str(ROOT / "tools" / "replay_record.py"), "--record", str(day), "--out", str(out)],
                       capture_output=True, text=True, timeout=900)
    assert p.returncode == 0, p.stderr[-800:]
    log = [json.loads(x) for x in out.read_text().splitlines()]
    assert [x["video_s"] for x in log] == [T0, T0 + 30, T0 + 60]
    last = log[-1]["slots"]
    assert last["Bay-02"] == "OCCUPIED" and last["Bay-03"] == "OCCUPIED" and last["Bay-05"] == "VACANT"   # the three cars, and an empty bay
    # and what a person says about it is scored
    rep =ev.evaluate([("Bay-02", T0 - 15, T0 + 75, "OCCUPIED"), ("Bay-05", T0 - 15, T0 + 75, "VACANT")], ev.load_log(out))
    assert rep["overall"]["precision"] == 1.0 and rep["overall"]["recall"] == 1.0


def test_a_folder_without_an_index_is_refused_politely(tmp_path):
    p = subprocess.run([sys.executable, str(ROOT / "tools" / "replay_record.py"), "--record", str(tmp_path), "--out", str(tmp_path / "x")],
                       capture_output=True, text=True, timeout=120)
    assert p.returncode == 2 and "index.jsonl" in p.stderr
