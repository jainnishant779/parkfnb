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
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from detector import get_detector, normalise_plate

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


@app.get("/", response_class=HTMLResponse)
def index():
    page = HERE / "static" / "index.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>ParkFNB ANPR</h1><p>static/index.html is missing.</p>"
