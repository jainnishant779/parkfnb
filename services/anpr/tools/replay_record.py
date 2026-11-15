"""
Run a recorded day of the real lot through the CURRENT code, and write the log tools/eval_pilot.py scores.

    python tools/replay_record.py --record path/to/20261030 --out run.jsonl [--sizes sizes.json] [--limit 200]

--record   a day folder copied from the server (/var/lib/parkfnb-anpr/record/<camera>/<day>: index.jsonl and the .jpg pictures)
--out      the log, one line per picture: what this code says about every bay (status, line verdict)
--sizes    optional JSON {"Bay-01": [2.4, 4.8], ...}: stall sizes to try (the calibration is fitted on them), to see what real sizes change

Then:   python tools/eval_pilot.py --truth truth.csv --log run.jsonl
(truth.csv comes from the labelling page, or GET /console/api/record/truth.csv)

The clock is the recording's own (each picture is run at the time it was taken), so the 12 s verdict hold, the night gate and the
fit cache behave as they did live.  One limit to know: the pictures are `interval` seconds apart.  At 30 s the answer for a parked car
is faithful but the tracker (made for ~1 picture a second) loses and re-finds moving cars, so ID switches and flicker are only
meaningful on a DENSE recording (ANPR_RECORD_S=1 for an hour).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--record", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sizes")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--camera", default="replay-cam")
    a = ap.parse_args(argv)

    folder = Path(a.record)
    index = folder / "index.jsonl"
    if not index.is_file():
        print(f"error: {index} not found (copy a day folder from the server)", file=sys.stderr)
        return 2
    rows = []
    for line in index.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    rows = [r for r in rows if (folder / r["file"]).is_file()]
    if a.limit:
        rows = rows[:a.limit]
    if not rows:
        print("error: no pictures in that folder", file=sys.stderr)
        return 2

    os.environ["ANPR_DATA_DIR"] = tempfile.mkdtemp(prefix="replay-")      # never touch real data
    os.environ.setdefault("ANPR_SEG_INTERVAL", "0")                        # a new silhouette for every picture, not one per 3 s of WALL time
    sys.path.insert(0, str(HERE))
    import cv2
    import app
    from live import LiveSession
    from status import compose_bays

    if a.sizes:
        app.state_store.save_camera(a.camera, {"bay_sizes": json.loads(Path(a.sizes).read_text(encoding="utf-8"))})
    first = rows[0]
    app._install_bays(a.camera, first["polygons"], "oblique", image_size=tuple(first["size"]))
    session = LiveSession(a.camera, app._live_process, Path(os.environ["ANPR_DATA_DIR"]))

    clock = [rows[0]["t"]]
    real_time = time.time
    time.time = lambda: clock[0]                                          # the recording's clock, so holds and caches see recorded time
    n = 0
    try:
        with open(a.out, "w", encoding="utf-8") as out:
            for r in rows:
                clock[0] = r["t"]
                frame = cv2.imread(str(folder / r["file"]))
                if frame is None:
                    continue
                t0 = real_time()
                res = app._live_process(frame, session)
                ms = round((real_time() - t0) * 1000)
                details = res.get("bay_details") or {}
                answers = compose_bays(details, low_light=(res.get("light") == "low"), moved=(res.get("calibration") == "moved"), now=r["t"])
                out.write(json.dumps({
                    "video_s": r["t"], "stream_status": "live", "ms_per_frame": ms, **({"zones": r["zones"]} if r.get("zones") else {}),
                    "slots": {b: x["status"] for b, x in answers.items()},
                    "verdicts": {b: (x.get("parking") or {}).get("verdict") for b, x in answers.items() if (x.get("parking") or {}).get("verdict")},
                }, separators=(",", ":")) + "\n")
                n += 1
                if n % 20 == 0:
                    print(f"  {n}/{len(rows)}", flush=True)
    finally:
        time.time = real_time
    print(f"wrote {n} lines to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
