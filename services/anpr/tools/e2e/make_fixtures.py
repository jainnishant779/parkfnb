"""
Everything the browser tests need that is not code, built in tools/e2e/out/ (git-ignored):

  state_<scenario>.json   what /live/state answers in each situation, made with the real status.py
  frame.jpg / night.jpg   a drawn yard in daylight and in the dark (no real footage is ever used or stored)
  phone-1.json            a saved layout (5 bays on a 1280x720 picture) to seed a test server with
"""
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
import status as st  # noqa: E402

OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

BAYS = {
    "1": [[207.0, 683.0], [440.0, 657.0], [462.0, 511.0], [339.7, 511.0]],
    "2": [[673.0, 631.0], [601.0, 507.0], [462.0, 511.0], [440.0, 657.0]],
    "3": [[942.2, 605.1], [798.3, 452.2], [583.4, 480.8], [727.3, 633.7]],
    "4": [[1147.1, 557.6], [1010.1, 412.0], [788.3, 441.6], [925.3, 587.2]],
    "5": [[1023.3, 426.0], [1153.5, 564.4], [1279.0, 547.6], [1279.0, 406.9], [1266.5, 393.6]],
}
LAYOUT = {"size": [1280, 720], "bays": BAYS}
NOW = time.time()


def yard(dark: bool) -> np.ndarray:
    """A plain drawn yard: sky, wall, tarmac and two boxes for cars.  Texture so frames are not flat."""
    rng = np.random.default_rng(7)
    img = np.zeros((720, 1280, 3), np.uint8)
    img[:300] = (170, 150, 120)
    img[300:] = (95, 95, 100)
    cv2.rectangle(img, (380, 60), (820, 300), (200, 205, 210), -1)
    for x in range(420, 800, 90):
        cv2.rectangle(img, (x, 90), (x + 40, 150), (60, 70, 90), -1)
    cv2.rectangle(img, (480, 520), (640, 640), (40, 60, 150), -1)
    cv2.rectangle(img, (700, 470), (900, 600), (200, 200, 205), -1)
    img = cv2.add(img, (rng.random(img.shape) * 18).astype(np.uint8))
    if dark:
        img = (img.astype(np.float32) * 0.08).astype(np.uint8)
    return img


cv2.imwrite(str(OUT / "frame.jpg"), yard(False))
cv2.imwrite(str(OUT / "night.jpg"), yard(True))


def det(state, held=600, seen=None, agree=1.0, parking=None):
    d = {"state": state, "since": NOW - held, "seen_vehicle": state not in ("free", "unknown") if seen is None else seen, "agreement": agree}
    if parking is not None:
        d["parking"] = parking
    return d


def pk(**kw):
    """What the engine knew about how a bay is parked (see app._parking_evidence)."""
    return {"source": "mask", "camera": True, "calibration": "good", "margin_m": 0.12, "reason": "", "side": None,
            "crossing_m": 0.0, "skew_deg": None, "clearance": {}, **kw}


MIXED = {"1": det("free", 1800), "2": det("correct", 900, agree=0.83), "3": det("wrong", 300),
         "4": det("unknown", 40, agree=0.5), "5": det("free", 5000)}


def state(details, **kw):
    health = kw.pop("stream_status", "live")
    slots = st.compose_bays(details, stale=kw.pop("stale", False), low_light=kw.get("light") == "low",
                            moved=kw.get("calibration") == "moved", now=NOW)
    base = {
        "camera_id": "phone-1", "online": health == "live", "age_s": 0.6 if health == "live" else 95.0,
        "frame_size": [1280, 720], "vehicles_in_view": 3, "counts": None, "line_set": False,
        "bays": {k: {"state": v["state"]} for k, v in details.items()}, "layout": LAYOUT,
        "bay_summary": {"total": 5}, "ms_per_frame": 147, "updated_at": NOW,
        "events": [
            {"t": NOW - 900, "type": "bay_occupied", "bay_id": "2"},
            {"t": NOW - 700, "type": "low_light"},
            {"t": NOW - 500, "type": "light_ok"},
            {"t": NOW - 300, "type": "bay_occupied", "bay_id": "3"},
            {"t": NOW - 120, "type": "operator", "bay_id": "4", "status": "VACANT"},
            {"t": NOW - 60, "type": "feed_offline"}, {"t": NOW - 30, "type": "feed_online"},
        ],
        "frames_received": 8315, "frames_processed": 8315, "error": "",
        "stream_status": health, "frame_age_s": 0.4 if health == "live" else 95.0, "fps_processed": 1.8,
        "frame_seq": 8315, "light": "ok", "calibration": "ok",
        "slots": [{"id": k, **v} for k, v in slots.items()], "slot_summary": st.summarize(slots), "is_admin": False,
        "site_calibration": None,
    }
    base.update(kw)
    return base


# bays judged in 3D: 2 parked correctly, 3 over the left line, 4 at an angle, 5 occupied but no outline of the car yet
PARKING = {"1": det("free", 1800),
           "2": det("correct", 900, parking=pk(clearance={"left": 0.42, "right": 0.5})),
           "3": det("wrong", 300, parking=pk(reason="Over the left line by 0.25 m", side="left", crossing_m=0.25)),
           "4": det("suspicious", 200, parking=pk(reason="Parked at 21° to the bay, inside its lines", skew_deg=21.0, calibration="degraded", margin_m=0.22)),
           "5": det("correct", 5000, parking=pk(source="bbox"))}
SITE_CAL = {"ready": True, "method": "site", "camera": {"focal_px": 822, "pitch_deg": 15.1, "roll_deg": 0.5, "height_m": 8.0},
            "good_bays": 4, "total": 5, "flags": [], "bays": {}}


SCENARIOS = {
    "live": state(MIXED),
    "admin": {**state(MIXED), "is_admin": True},
    "night": state({k: det("free" if k in ("1", "5") else "correct", 4000, seen=k not in ("1", "5")) for k in MIXED}, light="low"),
    "offline": state(MIXED, stale=True, stream_status="offline"),
    "stalled": state(MIXED, stale=True, stream_status="stale"),
    "error": state(MIXED, stale=True, stream_status="error", error="RuntimeError: boom"),
    "moved": state(MIXED, calibration="moved"),
    "notstarted": {**state({}, stream_status="not_started"), "age_s": None, "frame_age_s": None, "frames_received": 0,
                   "frames_processed": 0, "layout": None, "events": []},
    "nobays": {**state({}), "layout": None, "events": []},
    "gate": {**state(MIXED), "line_set": True, "counts": {"in": 12, "out": 7, "inside": 5}},
    "parking": {**state(PARKING), "site_calibration": SITE_CAL,
                "events": [{"t": NOW - 300, "type": "parking_over_line", "bay_id": "3", "detail": "Over the left line by 0.25 m"},
                           {"t": NOW - 200, "type": "parking_ok", "bay_id": "2"}]},
}
SCENARIOS["parking_admin"] = {**SCENARIOS["parking"], "is_admin": True}
for name, s in SCENARIOS.items():
    (OUT / f"state_{name}.json").write_text(json.dumps(s), encoding="utf-8")

(OUT / "phone-1.json").write_text(json.dumps({
    "view": "oblique", "bays": BAYS, "frame_size": [1280, 720], "saved_at": "2026-10-22T20:00:00",
    "line": {"p1": [100, 300], "p2": [600, 300], "in_point": [350, 500], "start_count": 0},
}), encoding="utf-8")
print("fixtures written to", OUT)
