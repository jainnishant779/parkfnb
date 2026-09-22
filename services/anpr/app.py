"""
ParkFNB ANPR service.

    uvicorn app:app --port 8008 --reload

    /              the demo page
    /health        readiness, for the warm-up script
    /detect        read a plate, decide nothing  (debug)
    /gate-event    read a plate, ask the backend to open the barrier

The camera is just an input. Today the browser posts the image; tomorrow
an ESP32-CAM posts to the same endpoint and nothing here changes.

This service never decides access. It reports what it saw; the backend
checks the booking, the payment and the time window, and opens the gate.
"""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import cv2
import numpy as np
import httpx
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from detector import get_detector, normalise_plate
from occupancy import (
    BayMap, BayState, Detection, OccupancyTracker, annotate,
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
SERVICE_TOKEN = os.getenv("ANPR_SERVICE_TOKEN", "change-me-anpr-token")
DEFAULT_DEVICE = os.getenv("ANPR_DEVICE_ID", "pb-001")

HERE = Path(__file__).parent

app = FastAPI(title="ParkFNB ANPR", version="1.0.0")

if (HERE / "static").exists():
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")


def _decode(raw: bytes):
    arr = np.frombuffer(raw, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _b64(img) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return f"data:image/jpeg;base64,{base64.b64encode(buf).decode()}" if ok else ""


@app.on_event("startup")
def _startup():
    d = get_detector()
    print(f"[anpr] model loaded in {d.load_ms:.0f} ms  classes={d.names}")
    print(f"[anpr] OCR engine: {d.ocr_kind}")
    print(f"[anpr] backend: {BACKEND_URL}")


@app.get("/health")
def health():
    try:
        d = get_detector()
        return {"ok": True, "model_loaded": True, "ocr": d.ocr_kind,
                "classes": d.names, "backend": BACKEND_URL}
    except Exception as e:
        return JSONResponse(
            {"ok": False, "model_loaded": False, "error": str(e)},
            status_code=503,
        )


@app.post("/detect")
async def detect(image: UploadFile = File(...)):
    """Read a plate and return it. Touches nothing else — useful for tuning."""
    frame = _decode(await image.read())
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)

    det = get_detector()
    res = det.read(frame)
    return {**res.dict(), "annotated": _b64(det.annotate(frame, res))}


@app.post("/gate-event")
async def gate_event(
    image: UploadFile = File(...),
    device_id: str = Form(DEFAULT_DEVICE),
    direction: str = Form("entry"),
):
    """
    Read the plate, hand it to the backend, relay the decision.

    The backend owns the decision. If it is unreachable the gate stays
    shut and we say so — a camera that cannot reach the backend must
    never fall back to opening the barrier.
    """
    t0 = time.time()
    frame = _decode(await image.read())
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)

    det = get_detector()
    res = det.read(frame)

    if not res.plate:
        return {
            "decision": "no_plate",
            "message": "No number plate found in the image",
            "plate": "", "valid_format": False,
            "annotated": _b64(det.annotate(frame, res, allowed=False)),
            "total_ms": round((time.time() - t0) * 1000),
            **res.dict(),
        }

    payload = {
        "plate": res.plate,
        "deviceId": device_id,
        "direction": direction,
        "ocrConfidence": round(res.ocr_conf, 3),
        "detConfidence": round(res.det_conf, 3),
        "validFormat": res.valid_format,
    }

    decision, message, booking = "error", "", None
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{BACKEND_URL}/api/access/anpr-event",
                json=payload,
                headers={"x-anpr-token": SERVICE_TOKEN},
            )
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code == 200 and body.get("success"):
            data = body.get("data", {})
            decision = "allow"
            message = data.get("message", "Barrier opening")
            booking = data.get("booking")
        else:
            decision = "deny"
            err = body.get("error", {})
            message = err.get("message") or f"Refused (HTTP {r.status_code})"
    except Exception as e:
        decision = "error"
        message = f"Backend unreachable: {e}"

    return {
        "decision": decision,
        "message": message,
        "booking": booking,
        "annotated": _b64(det.annotate(frame, res, allowed=(decision == "allow"))),
        "total_ms": round((time.time() - t0) * 1000),
        **res.dict(),
    }


@app.post("/normalise")
def normalise(text: str = Form(...)):
    """Expose the plate normaliser on its own — handy when demoing the logic."""
    plate, valid = normalise_plate(text)
    return {"input": text, "plate": plate, "valid_format": valid}


# ---------------------------------------------------------------- occupancy

# Bay layouts, keyed by camera. Drawn once at install and, in production,
# stored in the backend — held here so the service can run standalone.
_bay_maps: dict[str, BayMap] = {}
_trackers: dict[str, OccupancyTracker] = {}


@app.post("/occupancy/bays")
async def define_bays(request: Request):
    """
    Register the bays for a camera.

        {"camera_id": "cam-1",
         "view": "oblique" | "topdown",
         "bays": {"A-01": [[x,y],[x,y],[x,y],[x,y]], ...}}

    Replaces any previous layout for that camera and resets its tracker,
    because bay ids and history would otherwise disagree.
    """
    body = await request.json()
    camera_id = body.get("camera_id", "default")
    bays = body.get("bays") or {}
    view = body.get("view", "oblique")

    if not bays:
        return JSONResponse({"error": "no bays supplied"}, status_code=400)

    try:
        bm = BayMap(bays, view=view)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    _bay_maps[camera_id] = bm
    _trackers[camera_id] = OccupancyTracker(bm)
    return {"camera_id": camera_id, "view": view,
            "bays": bm.bay_ids, "count": len(bm.bay_ids)}


@app.post("/occupancy/check")
async def occupancy_check(
    image: UploadFile = File(...),
    camera_id: str = Form("default"),
    track: bool = Form(True),
    conf: float = Form(0.10),
    imgsz: int = Form(1280),
):
    """
    One frame in, bay states out.

    `track=true` folds the frame into that camera's rolling window and
    returns the debounced state — what you want in production, because a
    car driving past should not flip a bay. `track=false` returns the raw
    single-frame reading, which is what you want while tuning.
    """
    bm = _bay_maps.get(camera_id)
    if bm is None:
        return JSONResponse(
            {"error": f"no bays defined for camera '{camera_id}' — "
                      f"POST /occupancy/bays first"}, status_code=400)

    frame = _decode(await image.read())
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)

    t0 = time.time()
    det = get_detector()
    raw = det.vehicles(frame, conf=conf, imgsz=imgsz)
    dets = [Detection(*r) for r in raw]

    observations = bm.observe(dets)

    if track:
        tracker = _trackers.setdefault(camera_id, OccupancyTracker(bm))
        states = tracker.update(dets)
        summary = tracker.summary()
    else:
        states = {o.bay_id: BayState(o.bay_id, o.state, coverage=o.coverage,
                                     straddles=o.straddles,
                                     two_wheeler=o.two_wheeler)
                  for o in observations}
        summary = {
            "total": len(states),
            "occupied": sum(1 for s in states.values() if s.state == "occupied"),
            "empty": sum(1 for s in states.values() if s.state == "empty"),
            "badly_parked": sum(1 for s in states.values()
                                if s.state == "badly_parked"),
            "unknown": sum(1 for s in states.values() if s.state == "unknown"),
            "bays": {k: v.dict() for k, v in states.items()},
        }

    return {
        "camera_id": camera_id,
        "view": bm.view,
        "tracked": track,
        "vehicles_detected": len(dets),
        "summary": {k: v for k, v in summary.items() if k != "bays"},
        "bays": summary["bays"],
        "observations": [o.dict() for o in observations],
        "annotated": _b64(annotate(frame, bm, states, dets)),
        "total_ms": round((time.time() - t0) * 1000),
    }


@app.get("/occupancy/state")
def occupancy_state(camera_id: str = "default"):
    """Last known state without sending a new frame."""
    tracker = _trackers.get(camera_id)
    if tracker is None:
        return JSONResponse({"error": f"no tracker for '{camera_id}'"},
                            status_code=404)
    return {"camera_id": camera_id, **tracker.summary()}


@app.get("/", response_class=HTMLResponse)
def index():
    page = HERE / "static" / "index.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>ParkFNB ANPR</h1><p>static/index.html is missing.</p>"
