"""
Run the browser checks: build the fixtures, start a throw-away server on its own data folder (it never
touches real camera data), run the three node scripts, stop the server.

    python tools/e2e/run_e2e.py              # all of them
    python tools/e2e/run_e2e.py viewer       # one of: viewer, editor, integration, log, login, console

Needs Chrome (set CHROME_PATH if it is somewhere unusual) and node 22+.  Pictures of every state land
in tools/e2e/out/.  Takes about two minutes.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ANPR = HERE.parent.parent
PORT = 8123
KEY = "testkey1234"
SUITES = {"viewer": "viewer_e2e.mjs", "editor": "occ_e2e.mjs", "integration": "integration_e2e.mjs", "log": "log_e2e.mjs",
          "login": "login_e2e.mjs", "console": "console_e2e.mjs", "phone": "phone_e2e.mjs"}
TEST_USER = "admin"
TEST_PASSWORD = "e2e-test-password-123"          # only for the throw-away test server below


def wait_up(url, seconds=120):
    end = time.time() + seconds
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=3).read()
            return True
        except Exception:
            time.sleep(1.5)
    return False


def seed_console(data_dir: Path):
    """Thirty hours of history, a violation that is open and one that was resolved, with a picture each, for the console."""
    import json
    import math
    from datetime import datetime
    sys.path.insert(0, str(ANPR))
    import cv2
    import violations

    now = time.time()
    recs, t, i = [], now - 30 * 3600, 0
    while t < now - 600:                                     # a sample a minute, up to ten minutes ago (the server adds its own)
        occ = 2 + int(2 * (1 + math.sin(i / 90.0)))
        words = {str(b + 1): ("occupied" if b < occ else "available") for b in range(7)}
        parking = {str(b + 1): ("over_line" if b == 2 and occ > 3 else "correct") for b in range(min(occ, 5))}
        recs.append({"t": t, "type": "sample", "vacant": 7 - occ, "occupied": occ, "unclear": 0, "stale": 0, "bays": words, "parking": parking})
        t += 60
        i += 1
    h = 3600.0
    for bay, a, z in (("1", 5, 3.5), ("2", 4, 1), ("4", 2, 1.5)):
        recs.append({"t": now - a * h, "type": "bay_occupied", "bay_id": bay, "track_id": int(bay)})
        recs.append({"t": now - z * h, "type": "bay_freed", "bay_id": bay, "track_id": int(bay)})
    for k in range(7):                                       # bay 5 keeps losing its car for 20 seconds: a flicker, not a car
        recs.append({"t": now - 8 * h + k * 300, "type": "bay_occupied", "bay_id": "5", "track_id": 5})
        recs.append({"t": now - 8 * h + k * 300 + 20, "type": "bay_freed", "bay_id": "5", "track_id": 5})
    recs += [{"t": now - 9 * h, "type": "feed_offline"}, {"t": now - 9 * h + 2400, "type": "feed_online"},
             {"t": now - 1.5 * h, "type": "parking_over_line", "bay_id": "3", "detail": "Over the right line by 0.45 m"},
             {"t": now - 1.4 * h, "type": "parking_ok", "bay_id": "3"}]
    logs = data_dir / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    by_day = {}
    for r in recs:
        by_day.setdefault(datetime.fromtimestamp(r["t"]).strftime("%Y%m%d"), []).append(r)
    for stamp, rows in by_day.items():
        with open(logs / f"phone-1-{stamp}.jsonl", "w", encoding="utf-8") as f:
            for r in sorted(rows, key=lambda r: r["t"]):
                f.write(json.dumps(r) + "\n")

    book = violations.ViolationBook(data_dir / "violations" / "phone-1.json", "phone-1")
    img = cv2.imread(str(HERE / "out" / "frame.jpg"))
    poly = [[560, 330], [700, 330], [720, 470], [540, 470]]
    where = {"polygon": poly, "layout_size": [img.shape[1], img.shape[0]]}
    for bay, opened, closed, status in (("3", now - 1800, None, "open"), ("2", now - 7200, now - 6000, "resolved")):
        rec, _ = book.open(bay, violations.OVER_LINE, opened, "Over the right line by 0.45 m", 0.45, "right", where)
        ev = data_dir / "evidence" / "phone-1" / f"{rec['id']}.jpg"
        ev.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ev), violations.crop_around(img, poly))
        book.mark_evidence(rec["id"])
        if closed:
            book.close(bay, closed)
            book.handle(rec["id"], status, "Spoke to the driver", "admin", closed + 60)


def start_server(data_dir: Path, seed=None):
    """A fresh server whose only saved camera is the seeded phone-1 layout."""
    (data_dir / "cameras").mkdir(parents=True)
    shutil.copy(HERE / "out" / "phone-1.json", data_dir / "cameras" / "phone-1.json")
    if seed:
        seed(data_dir)
    sys.path.insert(0, str(ANPR))
    import admin_auth
    env = {**os.environ, "ANPR_DATA_DIR": str(data_dir), "LIVE_CAMERA_KEY": KEY, "ANPR_OCR": "none", "ANPR_LOG_SAMPLE_S": "1",
           "ANPR_ADMIN_USER": TEST_USER, "ANPR_ADMIN_PASSWORD_HASH": admin_auth.hash_password(TEST_PASSWORD)}
    log = open(HERE / "out" / "server.log", "w")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(PORT)],
                            cwd=ANPR, env=env, stdout=log, stderr=log)
    if not wait_up(f"http://127.0.0.1:{PORT}/health"):
        proc.kill()
        sys.exit("the test server did not start; see tools/e2e/out/server.log")
    return proc


def post_picture(name):
    body = (HERE / "out" / name).read_bytes()
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/live/frame-raw?camera_id=phone-1", body,
                                 {"X-Camera-Key": KEY, "Content-Type": "image/jpeg"})
    urllib.request.urlopen(req, timeout=10).read()


def run(name, extra_env=None):
    print(f"\n=== {name} ===", flush=True)
    return subprocess.run(["node", str(HERE / SUITES[name])], cwd=ANPR, env={**os.environ, **(extra_env or {})}).returncode


def main(argv):
    wanted = argv or list(SUITES)
    unknown = [w for w in wanted if w not in SUITES]
    if unknown:
        sys.exit(f"unknown suite {unknown}; choose from {', '.join(SUITES)}")
    subprocess.run([sys.executable, str(HERE / "make_fixtures.py")], check=True)
    failed = []
    if "viewer" in wanted and run("viewer"):
        failed.append("viewer")
    for name in ("editor", "integration", "log", "login", "console", "phone"):
        if name not in wanted:
            continue
        with tempfile.TemporaryDirectory() as tmp:                 # each gets a fresh server and fresh data
            server = start_server(Path(tmp) / "data", seed_console if name == "console" else None)
            try:
                if name == "editor":
                    post_picture("frame.jpg")                       # the picture the bays are drawn on
                    time.sleep(2.5)
                if run(name, {"ANPR_URL": f"http://127.0.0.1:{PORT}", "ANPR_KEY": KEY,
                              "ANPR_TEST_USER": TEST_USER, "ANPR_TEST_PASSWORD": TEST_PASSWORD}):
                    failed.append(name)
            finally:
                server.terminate()
                try:
                    server.wait(15)
                except subprocess.TimeoutExpired:
                    server.kill()
    print("\nFAILED: " + ", ".join(failed) if failed else "\nall browser checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
