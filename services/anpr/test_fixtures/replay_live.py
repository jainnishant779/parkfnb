"""
Replay a video into the live feed, the way the phone page does: one JPEG per second to
POST /live/frame.  Lets you try the whole live path (counts, bays, /live page) without a phone.

    python test_fixtures/replay_live.py test_fixtures/cctv_live_stream.mp4 \
        --line 0,300,1000,300 --inside 500,100

--line x1,y1,x2,y2   the IN/OUT line in the video's own pixel coordinates
--inside x,y         any point inside the lot (the side cars go to when entering)
--fps 1              frames sent per second of *video* (and of wall-clock time)
--url / --key        defaults: http://localhost:8008 and the key from GET /live/setup
--record run.jsonl   after each frame is processed, write what the system said about every bay (one
                     line per frame: video second, stream status, ms/frame, status of each bay).
                     Score it with tools/eval_pilot.py against a hand-labelled truth file; see
                     docs/pilot-validation.md.

The server must be running locally.  The one-shot endpoints answer 409 while this runs.
"""
import argparse
import json
import sys
import time
import urllib.request

import cv2


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def post_json(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def post_frame(url, key, camera, jpeg):
    boundary = "----replay"
    parts = []
    for name, value in (("camera_id", camera), ("key", key)):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="f.jpg"\r\n'
                  f'Content-Type: image/jpeg\r\n\r\n').encode() + jpeg + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(f"{url}/live/frame", b"".join(parts),
                                 {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def wait_processed(url, camera, seq_before, timeout=20.0):
    """The state once the frame just sent has been processed (frame_seq moved past `seq_before`)."""
    end = time.time() + timeout
    s = get_json(f"{url}/live/state?camera_id={camera}")
    while s.get("frame_seq", 0) <= seq_before and time.time() < end:
        time.sleep(0.1)
        s = get_json(f"{url}/live/state?camera_id={camera}")
    return s


def record_line(video_s, s):
    return {"video_s": round(video_s, 2), "frame_seq": s.get("frame_seq"), "stream_status": s.get("stream_status"),
            "ms_per_frame": s.get("ms_per_frame"), "fps": s.get("fps_processed"), "light": s.get("light"),
            "calibration": s.get("calibration"),
            "slots": {b["id"]: b["status"] for b in s.get("slots", [])}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--url", default="http://localhost:8008")
    ap.add_argument("--camera", default="phone-1")
    ap.add_argument("--key", default="")
    ap.add_argument("--line", help="x1,y1,x2,y2")
    ap.add_argument("--inside", help="x,y")
    ap.add_argument("--fps", type=float, default=1.0)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--max-seconds", type=float, default=0, help="stop after this much video (0 = all)")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--record", help="write one JSON line per processed frame here, for tools/eval_pilot.py")
    a = ap.parse_args()

    key = a.key or get_json(f"{a.url}/live/setup")["phone_page"].split("key=")[1]
    if a.line and a.inside:
        x1, y1, x2, y2 = map(float, a.line.split(","))
        ix, iy = map(float, a.inside.split(","))
        post_json(f"{a.url}/live/config", {"camera_id": a.camera, "line": [[x1, y1], [x2, y2]],
                                           "in_point": [ix, iy]})
        print(f"line set: ({x1:g},{y1:g})-({x2:g},{y2:g})  inside=({ix:g},{iy:g})")

    cap = cv2.VideoCapture(a.video)
    if not cap.isOpened():
        sys.exit(f"cannot open {a.video}")
    vfps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(vfps / a.fps)))
    interval = 1.0 / a.fps
    idx = sent = 0
    rec = open(a.record, "w", encoding="utf-8") if a.record else None
    t_start = time.time()
    while True:
        ok, frame = cap.read()
        if not ok:
            if a.loop:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                idx = 0
                continue
            break
        if idx % step == 0:
            if frame.shape[1] != a.width:
                s = a.width / frame.shape[1]
                frame = cv2.resize(frame, None, fx=s, fy=s)
            good, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            seq_before = get_json(f"{a.url}/live/state?camera_id={a.camera}").get("frame_seq", 0) if rec else 0
            res = post_frame(a.url, key, a.camera, buf.tobytes())
            sent += 1
            c = res.get("counts") or {}
            print(f"t={idx / vfps:6.1f}s  sent {sent:3d}  counts in={c.get('in')} out={c.get('out')} "
                  f"inside={c.get('inside')}", flush=True)
            if rec:
                rec.write(json.dumps(record_line(idx / vfps, wait_processed(a.url, a.camera, seq_before))) + "\n")
                rec.flush()
            if a.max_seconds and idx / vfps >= a.max_seconds:
                break
            time.sleep(max(0.0, t_start + sent * interval - time.time()))
        idx += 1
    if rec:
        rec.close()
        print(f"recorded {sent} frames to {a.record}")
    s = get_json(f"{a.url}/live/state?camera_id={a.camera}")
    print("final:", json.dumps({k: s.get(k) for k in ("counts", "slot_summary", "frames_processed", "error")}))


if __name__ == "__main__":
    main()
