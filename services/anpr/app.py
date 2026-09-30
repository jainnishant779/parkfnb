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

import asyncio
import base64
import os
import time
import json
import tempfile
from pathlib import Path

import cv2
import numpy as np
import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from detector import get_detector, normalise_plate
from tracker import VehicleMOTTracker, TrackedVehicle
from homography import HomographyCalibrator
from intelligence import (
    CameraProfile, ParkingThresholds,
    STATE_FREE, STATE_OCCUPIED, STATE_CORRECT, STATE_SUSPICIOUS,
    STATE_WRONG, STATE_OCCLUDED, STATE_UNKNOWN,
)
from occupancy import (
    BayMap, BayState, Detection, OccupancyTracker, ParkingIntelligenceEngine,
    SlotDefinition, SlotRegistry, annotate, import_optimizer_layout, plan_view,
)
from segmenter import attach_silhouettes, get_segmenter
from stream import stream_manager

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
    if img is None:
        return ""
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
_mot_trackers: dict[str, VehicleMOTTracker] = {}
_calibrators: dict[str, HomographyCalibrator] = {}
_registries: dict[str, SlotRegistry] = {}
_profiles: dict[str, CameraProfile] = {}
_thresholds: dict[str, ParkingThresholds] = {}


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
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    bays = body.get("bays") or {}
    view = body.get("view", "oblique")

    if not bays:
        return JSONResponse({"error": "no bays supplied"}, status_code=400)

    profile = _profiles.setdefault(camera_id, CameraProfile(camera_id=camera_id, view_angle=view))
    thresholds = _thresholds.setdefault(camera_id, ParkingThresholds())

    # The dashboard re-sends the layout before every check.  Resetting then
    # would restart every bay's persistence timer on each frame, so a WRONG
    # could never be confirmed; only a changed layout resets.
    current = _bay_maps.get(camera_id)
    try:
        same = {k: [list(map(float, p)) for p in v] for k, v in bays.items()}
    except (TypeError, ValueError):
        same = None
    if current is not None and current.view == view and current._bay_points == same:
        return {"camera_id": camera_id, "view": view, "bays": current.bay_ids,
                "count": len(current.bay_ids), "unchanged": True}

    try:
        bm = BayMap(bays, view=view, camera_profile=profile)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # Sync to SlotRegistry
    reg = SlotRegistry(camera_id=camera_id)
    for sid, coords in bays.items():
        reg.add_slot(SlotDefinition(slot_id=sid, polygon=coords, orientation=bm.axes.get(sid, 0.0), camera_id=camera_id))
    _registries[camera_id] = reg

    _bay_maps[camera_id] = bm
    _trackers[camera_id] = OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds)
    # MOT tracker is NOT reset on bay update — preserves tracking continuity
    return {"camera_id": camera_id, "view": view,
            "bays": bm.bay_ids, "count": len(bm.bay_ids)}


@app.get("/occupancy/bays")
def get_bays(camera_id: str = "default"):
    """The layout currently registered for a camera, as it was posted."""
    bm = _bay_maps.get(camera_id)
    if bm is None:
        return JSONResponse({"error": f"no bays for '{camera_id}'"}, status_code=404)
    return {"camera_id": camera_id, "view": bm.view, "bays": bm._bay_points}


@app.post("/occupancy/import-layout")
async def import_layout(request: Request):
    """
    Direct bridge to Space Optimizer: Imports parking_layout.json
    and maps slots into camera space.
    """
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    layout = body.get("layout") or body.get("result") or body
    view = body.get("view", "oblique")
    calibrator = _calibrators.get(camera_id)

    bays, registry = import_optimizer_layout(layout, calibrator=calibrator)
    if not bays:
        return JSONResponse({"error": "No valid parking slots found in layout data"}, status_code=400)

    profile = _profiles.setdefault(camera_id, CameraProfile(camera_id=camera_id, view_angle=view))
    thresholds = _thresholds.setdefault(camera_id, ParkingThresholds())

    try:
        bm = BayMap(bays, view=view, camera_profile=profile)
    except Exception as e:
        return JSONResponse({"error": f"Invalid bay geometry: {e}"}, status_code=400)

    _registries[camera_id] = registry
    _bay_maps[camera_id] = bm
    _trackers[camera_id] = OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds)
    if camera_id in _mot_trackers:
        _mot_trackers[camera_id].reset()

    return {
        "ok": True,
        "camera_id": camera_id,
        "view": view,
        "bays_imported": len(bays),
        "bays": bm.bay_ids,
        "slots_dict": bays,
        "registry": registry.dict(),
        "calibrated_with_homography": calibrator.is_calibrated if calibrator else False
    }


@app.post("/camera/profile")
async def set_camera_profile(request: Request):
    """
    Set camera calibration profile and dynamic thresholds.
    Supports view_angle ('high', 'medium', 'low', 'topdown'),
    footprint_method, bottom_fraction, and customizable thresholds.
    """
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    profile = CameraProfile(
        camera_id=camera_id,
        view_angle=body.get("view_angle", "medium"),
        footprint_method=body.get("footprint_method", "bottom_fraction"),
        bottom_fraction=body.get("bottom_fraction"),
        site_id=body.get("site_id", "default_site"),
    )
    _profiles[camera_id] = profile

    t_data = body.get("thresholds")
    if t_data and isinstance(t_data, dict):
        _thresholds[camera_id] = ParkingThresholds(**{k: v for k, v in t_data.items() if hasattr(ParkingThresholds, k)})

    # Hot update live bay map and tracker
    if camera_id in _bay_maps:
        _bay_maps[camera_id].profile = profile
        _bay_maps[camera_id].footprint_fraction = profile.get_bottom_fraction()
    if camera_id in _trackers:
        _trackers[camera_id].profile = profile
        if camera_id in _thresholds:
            _trackers[camera_id].thresholds = _thresholds[camera_id]

    return {
        "ok": True,
        "camera_id": camera_id,
        "profile": profile.dict(),
        "thresholds": (_thresholds.get(camera_id) or ParkingThresholds()).dict()
    }


@app.get("/camera/profile/{camera_id}")
def get_camera_profile(camera_id: str):
    profile = _profiles.get(camera_id, CameraProfile(camera_id=camera_id))
    thresholds = _thresholds.get(camera_id, ParkingThresholds())
    return {
        "camera_id": camera_id,
        "profile": profile.dict(),
        "thresholds": thresholds.dict()
    }


@app.get("/parking-slots")
def get_parking_slots(camera_id: str = "default"):
    reg = _registries.get(camera_id)
    if reg:
        return reg.dict()
    bm = _bay_maps.get(camera_id)
    if bm:
        return {"camera_id": camera_id, "slots": bm.bay_ids}
    return {"camera_id": camera_id, "slots": []}


@app.post("/stream/start")
async def start_stream(request: Request):
    """Starts live RTSP stream ingestion with adaptive frame skipping."""
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    rtsp_url = body.get("rtsp_url")
    target_fps = float(body.get("target_fps", 4.0))

    if not rtsp_url:
        return JSONResponse({"error": "rtsp_url is required"}, status_code=400)

    worker = stream_manager.add_stream(camera_id=camera_id, rtsp_url=rtsp_url, target_fps=target_fps)
    return {
        "ok": True,
        "camera_id": camera_id,
        "rtsp_url": rtsp_url,
        "target_fps": target_fps,
        "is_connected": worker.is_connected,
    }


@app.post("/stream/stop")
async def stop_stream(request: Request):
    """Stops an active RTSP stream."""
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    stream_manager.remove_stream(camera_id)
    return {"ok": True, "camera_id": camera_id, "status": "stopped"}


@app.get("/stream/status")
def stream_status():
    return stream_manager.list_streams()


@app.post("/camera/homography")
async def set_homography(request: Request):
    """
    Calibrates perspective transform between 4 camera image pixel points
    and 4 metric ground plane points.
    """
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)

    camera_id = body.get("camera_id", "default")
    src = body.get("src_points")
    dst = body.get("dst_points")
    real_w = body.get("width_m", 10.0)
    real_h = body.get("height_m", 20.0)

    calib = HomographyCalibrator()
    if src and dst:
        ok = calib.calibrate(src, dst)
    elif src and len(src) == 4:
        ok = calib.calibrate_from_rectangle(src, real_w, real_h)
    else:
        return JSONResponse({"error": "Requires 4 src_points and dst_points"}, status_code=400)

    if not ok:
        return JSONResponse({"error": "Calibration calculation failed"}, status_code=400)

    _calibrators[camera_id] = calib
    return {"ok": True, "camera_id": camera_id, "calibrated": True}


async def dispatch_occupancy_event(event: dict, camera_id: str):
    """Fire-and-forget background webhook to backend for occupancy and misparking alerts."""
    payload = {**event, "camera_id": camera_id}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(
                f"{BACKEND_URL}/api/access/anpr-occupancy-event",
                json=payload,
                headers={"x-anpr-token": SERVICE_TOKEN},
            )
            if r.status_code >= 400:
                print(f"[anpr] Occupancy webhook returned HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[anpr] Occupancy webhook failed: {e}")


@app.post("/occupancy/check")
async def occupancy_check(
    background_tasks: BackgroundTasks,
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

    if track:
        # Tracking mode: run YOLO+ByteTrack once, then plate-only follow-up
        mot = _mot_trackers.setdefault(camera_id, VehicleMOTTracker(det.model))
        tracked = mot.track_frame(frame, conf=conf, imgsz=imgsz)
        # Build vehicle boxes from tracked results for plate reading
        veh_boxes = [(tv.x1, tv.y1, tv.x2, tv.y2, tv.confidence) for tv in tracked] if tracked else []
        joint = det.detect_joint(frame, conf=conf, imgsz=imgsz,
                                 skip_vehicle_detection=True, vehicle_boxes=veh_boxes)
        if tracked:
            # Map detected plates to tracked vehicles
            for (px1, py1, px2, py2, pconf, pstr) in joint.plates:
                if not pstr:
                    continue
                pcx, pcy = (px1 + px2) / 2.0, (py1 + py2) / 2.0
                for tv in tracked:
                    if (tv.x1 - 10) <= pcx <= (tv.x2 + 10) and (tv.y1 - 10) <= pcy <= (tv.y2 + 10):
                        tv.plate = pstr
                        break
        perception_objects = tracked if tracked else []
    else:
        # Single-frame mode: full joint detection
        joint = det.detect_joint(frame, conf=conf, imgsz=imgsz)
        dets = []
        for idx, r in enumerate(joint.vehicles):
            d = Detection(*r)
            d.plate = joint.vehicle_plates.get(idx, "")
            d.orientation_degrees = joint.vehicle_orientations.get(idx, 0.0)
            d.orientation_confidence = joint.vehicle_confidences.get(idx, 0.0)
            dets.append(d)
        perception_objects = dets

    seg = get_segmenter()
    attached = seg.attach(frame, perception_objects, camera_id)
    image_size = (frame.shape[1], frame.shape[0])

    profile = _profiles.get(camera_id)
    thresholds = _thresholds.get(camera_id)
    observations = bm.observe(perception_objects, camera_profile=profile, thresholds=thresholds,
                              image_size=image_size)

    if track:
        tracker = _trackers.setdefault(camera_id, OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds))
        states = tracker.update(perception_objects, observations=observations)
        summary = tracker.summary()
        # Drain events and fire background webhooks
        for ev in tracker.pop_events():
            background_tasks.add_task(dispatch_occupancy_event, ev, camera_id)
    else:
        states = {
            o.bay_id: BayState(
                bay_id=o.bay_id,
                state=o.state,
                coverage=o.coverage,
                straddles=o.straddles,
                two_wheeler=o.two_wheeler,
                parking_quality=o.parking_quality,
                lateral_offset=o.lateral_offset,
                encroachments=o.encroachments,
                quality_note=o.quality_note,
                plate=o.plate,
                outside_slot_percent=o.outside_slot_percent,
                angle_error_deg=o.angle_error_deg,
                double_parking=o.double_parking,
                vehicle_id=o.vehicle_track_id,
                occlusion_state=o.occlusion_state,
                occlusion_level=o.occlusion_level,
                visible_geometry_confidence=o.visible_geometry_confidence,
                parking_confidence=o.parking_confidence,
                reason=o.reason,
                geometry_source=o.geometry_source,
                line_crossing_m=o.line_crossing_m,
                line_crossing_possible_m=o.line_crossing_possible_m,
                crossing_side=o.crossing_side,
                skew_deg=o.skew_deg,
                reason_codes=list(o.reason_codes),
                bay_relation=o.bay_relation,
            )
            for o in observations
        }
        summary = {
            "total": len(states),
            "free": sum(1 for s in states.values() if s.state == STATE_FREE),
            "empty": sum(1 for s in states.values() if s.state == STATE_FREE),
            "occupied": sum(1 for s in states.values() if s.state != STATE_FREE),
            "correctly_parked": sum(1 for s in states.values() if s.state in (STATE_CORRECT, STATE_OCCUPIED)),
            "suspicious": sum(1 for s in states.values() if s.state == STATE_SUSPICIOUS),
            "badly_parked": sum(1 for s in states.values() if s.state == STATE_WRONG),
            "wrong_parking": sum(1 for s in states.values() if s.state == STATE_WRONG),
            "double_parked": sum(1 for s in states.values() if getattr(s, "double_parking", False)),
            "occluded": sum(1 for s in states.values() if s.state == STATE_OCCLUDED),
            "unknown": sum(1 for s in states.values() if s.state == STATE_UNKNOWN),
            "bays": {k: v.dict() for k, v in states.items()},
        }

    return {
        "camera_id": camera_id,
        "view": bm.view,
        "tracked": track,
        "vehicles_detected": len(perception_objects),
        "plates_detected": len(joint.plates),
        "summary": {k: v for k, v in summary.items() if k != "bays"},
        "bays": summary["bays"],
        "observations": [o.dict() for o in observations],
        "annotated": _b64(annotate(frame, bm, states, perception_objects)),
        "total_ms": round((time.time() - t0) * 1000),
        # Whether ground-contact geometry actually ran.  Without silhouettes every
        # bay is judged by the legacy box-slice estimate (geometry_source "bbox").
        "segmentation": {
            "available": seg.available,
            "vehicles_with_silhouette": attached,
            "weights": str(seg.weights),
            "last_error": seg.last_error,
        },
        # One camera fitted from all drawn bays, and a grade per bay.  Distances
        # in metres are only as good as this; see calibration.py.
        "calibration": bm.calibration(image_size).report(),
        # Top-down layout of stalls and measured cars, metres (occupancy.plan_view).
        "plan": plan_view(bm, states),
    }


@app.post("/occupancy/auto-bays")
async def auto_bays(image: UploadFile = File(...)):
    """Auto-detect vehicles in frame and return suggested bay polygons."""
    frame = _decode(await image.read())
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)
    det = get_detector()
    raw = det.vehicles(frame, conf=0.10, imgsz=1280)
    raw.sort(key=lambda r: r[0])
    bays = {}
    h, w = frame.shape[:2]
    for i, (x1, y1, x2, y2, conf) in enumerate(raw, 1):
        pad_x = (x2 - x1) * 0.12
        pad_y = (y2 - y1) * 0.08
        bx1 = max(0, x1 - pad_x)
        by1 = max(0, y1 - pad_y)
        bx2 = min(w, x2 + pad_x)
        by2 = min(h, y2 + pad_y)
        bays[f"Bay-{i:02d}"] = [
            [round(bx1 + pad_x * 0.5), round(by1)],
            [round(bx2 - pad_x * 0.5), round(by1)],
            [round(bx2), round(by2)],
            [round(bx1), round(by2)]
        ]
    return {"bays": bays, "count": len(bays), "view": "oblique", "img_size": [w, h]}


@app.post("/occupancy/check-video")
async def occupancy_check_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    camera_id: str = Form("venue-lot"),
    sample_fps: float = Form(1.0),
    max_duration_sec: float = Form(30.0),
    conf: float = Form(0.15),
    imgsz: int = Form(1280),
):
    """
    Process an uploaded CCTV video file end-to-end:
    Samples frames at sample_fps, runs ByteTrack MOT across consecutive frames,
    evaluates 7-state bay occupancy with temporal debouncing, and returns a
    playable timeline with annotated base64 frames and state transitions.
    """
    bm = _bay_maps.get(camera_id)
    if bm is None:
        return JSONResponse(
            {"error": f"no bays defined for camera '{camera_id}' — POST /occupancy/bays first"},
            status_code=400
        )

    t0 = time.time()
    suffix = Path(video.filename).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    cap = cv2.VideoCapture(tmp_path)
    if not cap.isOpened():
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        return JSONResponse({"error": "could not open video file"}, status_code=400)

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / fps if fps > 0 else 0.0

    step = max(1, int(round(fps / max(0.5, min(10.0, sample_fps)))))
    max_frames_to_process = int(round(min(video_duration, max_duration_sec) * sample_fps))

    det = get_detector()
    mot = _mot_trackers.setdefault(camera_id, VehicleMOTTracker(det.model))
    profile = _profiles.get(camera_id)
    thresholds = _thresholds.get(camera_id)
    tracker = _trackers.setdefault(camera_id, OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds))

    timeline = []
    frame_idx = 0
    sampled_count = 0

    try:
        while cap.isOpened() and sampled_count < max_frames_to_process:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % step == 0:
                sampled_count += 1
                timestamp_sec = round(frame_idx / fps, 2)

                # Tracking + ByteTrack
                tracked = mot.track_frame(frame, conf=conf, imgsz=imgsz)
                veh_boxes = [(tv.x1, tv.y1, tv.x2, tv.y2, tv.confidence) for tv in tracked] if tracked else []
                joint = det.detect_joint(frame, conf=conf, imgsz=imgsz,
                                         skip_vehicle_detection=True, vehicle_boxes=veh_boxes)

                # Map detected plates to tracked vehicles
                if tracked:
                    for (px1, py1, px2, py2, pconf, pstr) in joint.plates:
                        if not pstr:
                            continue
                        pcx, pcy = (px1 + px2) / 2.0, (py1 + py2) / 2.0
                        for tv in tracked:
                            if (tv.x1 - 10) <= pcx <= (tv.x2 + 10) and (tv.y1 - 10) <= pcy <= (tv.y2 + 10):
                                tv.plate = pstr
                                break

                # Video is processed faster than real time, so the wall-clock
                # throttle would reuse one frame's masks while cars move: force it.
                seg = get_segmenter()
                attach_silhouettes(tracked, seg.segment(frame, f"{camera_id}:video", force=True))

                # Observations & Temporal engine update
                observations = bm.observe(tracked, camera_profile=profile, thresholds=thresholds,
                                          image_size=(frame.shape[1], frame.shape[0]))
                states = tracker.update(tracked, observations=observations)

                # Generate annotated image
                ann_img = annotate(frame, bm, states, tracked)
                if ann_img.shape[1] > 1280:
                    scale = 1280.0 / ann_img.shape[1]
                    ann_img = cv2.resize(ann_img, None, fx=scale, fy=scale)

                snap = {
                    "frame_idx": frame_idx,
                    "timestamp_sec": timestamp_sec,
                    "summary": {
                        "total": len(states),
                        "free": sum(1 for s in states.values() if s.state == STATE_FREE),
                        "occupied": sum(1 for s in states.values() if s.state != STATE_FREE),
                        "correctly_parked": sum(1 for s in states.values() if s.state in (STATE_CORRECT, STATE_OCCUPIED)),
                        "suspicious": sum(1 for s in states.values() if s.state == STATE_SUSPICIOUS),
                        "wrong_parking": sum(1 for s in states.values() if s.state == STATE_WRONG),
                    },
                    "bays": {k: v.dict() for k, v in states.items()},
                    "plan": plan_view(bm, states),
                    "annotated": _b64(ann_img)
                }
                timeline.append(snap)

            frame_idx += 1
    finally:
        cap.release()
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    return {
        "camera_id": camera_id,
        "video_duration_sec": round(video_duration, 1),
        "total_frames": total_frames,
        "sampled_frames": len(timeline),
        "total_ms": round((time.time() - t0) * 1000),
        "final_summary": tracker.summary(),
        "timeline": timeline,
    }


@app.get("/occupancy/state")
def occupancy_state(camera_id: str = "default"):
    """Last known state without sending a new frame."""
    tracker = _trackers.get(camera_id)
    if tracker is None:
        return JSONResponse({"error": f"no tracker for '{camera_id}'"},
                            status_code=404)
    return {"camera_id": camera_id, **tracker.summary(), "plan": plan_view(tracker.map, tracker.states)}


@app.get("/", response_class=HTMLResponse)
def index():
    page = HERE / "static" / "index.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>ParkFNB ANPR</h1><p>static/index.html is missing.</p>"


@app.get("/occupancy", response_class=HTMLResponse)
def occupancy_page():
    page = HERE / "static" / "occupancy.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>Occupancy Tool</h1><p>static/occupancy.html is missing.</p>"
