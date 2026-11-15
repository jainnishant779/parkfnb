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
import hashlib
import hmac
import os
import secrets
import threading
import time
import json
import tempfile
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from detector import get_detector, normalise_plate
from tracker import VehicleMOTTracker, TrackedVehicle
from homography import HomographyCalibrator
from calibration import MIN_GOOD_BAYS, fit_site_calibration
from intelligence import (
    CameraProfile, ParkingThresholds,
    STATE_FREE, STATE_OCCUPIED, STATE_CORRECT, STATE_SUSPICIOUS,
    STATE_WRONG, STATE_OCCLUDED, STATE_UNKNOWN,
)
from occupancy import (
    BayMap, BayState, Detection, OccupancyTracker, ParkingIntelligenceEngine,
    SlotDefinition, SlotRegistry, annotate, import_optimizer_layout, plan_view,
)
from segmenter import attach_silhouettes, get_segmenter, unmatched_boxes
from stream import stream_manager
import state_store
from live import (LOG_SAMPLE_S, LiveSession, annotate_clean, draw_clean_boxes, enhance_for_display, is_public_allowed,
                  is_remote, plausible_indian_plate)
from status import (CLOSE_TO_LINE, CORRECT, JUDGED, NOT_JUDGED, OVER_LINE, UNCERTAIN, MoveDetector, VerdictHold, compose_bays,
                    LightGate, is_low_light, parking_verdict, summarize)
from bay_validation import validate_bays
import activity_log
import admin_auth
import cuboid_fit
import reports
import site_settings
import violations
import arrivals
import contact as contact_mod
import night as night_mod
import record as record_mod
import plate_ocr
from urllib.parse import urlencode
from optimizer_bridge import BridgeError, geojson_to_metres, layout_to_bays, to_metres

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
SERVICE_TOKEN = os.getenv("ANPR_SERVICE_TOKEN", "change-me-anpr-token")
DEFAULT_DEVICE = os.getenv("ANPR_DEVICE_ID", "pb-001")
# The phone page carries this key; without it nobody can feed frames through the tunnel.
# Generated from letters and digits that cannot be misread (no 0/o, 1/l/i, q/g) so a key
# typed from a screen still works; the phone link is better scanned than typed anyway.
_KEY_ALPHABET = "abcdefhjkmnprstuvwxyz23456789"
LIVE_KEY = os.getenv("LIVE_CAMERA_KEY") or "".join(secrets.choice(_KEY_ALPHABET) for _ in range(10))
MAX_LIVE_UPLOAD = 3 * 1024 * 1024
# the full-resolution photo: Caddy refuses a body over 4 MB, so stay under it with room for the form
MAX_STILL_UPLOAD = int(3.8 * 1024 * 1024)
STILL_EVERY_S = float(os.getenv("ANPR_STILL_EVERY_S", "900"))      # 0 turns the periodic photo off (it was 120: a 2-4 MB upload every two minutes held the live pictures back)

HERE = Path(__file__).parent

app = FastAPI(title="ParkFNB ANPR", version="1.0.0")

if (HERE / "static").exists():
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")


# On a server the operator is not sitting at the machine, so an admin can sign in with a long random
# token (ANPR_ADMIN_TOKEN, over HTTPS) and is then treated like a local user.  Unset = no admin login.
ADMIN_TOKEN = os.getenv("ANPR_ADMIN_TOKEN", "")
ADMIN_COOKIE = "parkfnb_admin"
if ADMIN_TOKEN and len(ADMIN_TOKEN) < 16:
    print("[anpr] ANPR_ADMIN_TOKEN is shorter than 16 characters: admin login disabled")
    ADMIN_TOKEN = ""


def _token_ok(supplied: str) -> bool:
    return bool(ADMIN_TOKEN) and hmac.compare_digest(supplied.encode(), ADMIN_TOKEN.encode())


# The normal way in: an ID and a password (see admin_auth.py; set them with tools/set_admin_password.py).
# Only a hash of the password is kept.  A signed cookie then says who is signed in.
ADMIN_USER = os.getenv("ANPR_ADMIN_USER", "admin")
ADMIN_PW_HASH = os.getenv("ANPR_ADMIN_PASSWORD_HASH", "")
SESSION_COOKIE = "parkfnb_session"
_login_throttle = admin_auth.LoginThrottle()


def _session_key() -> bytes:
    return admin_auth.session_secret(os.getenv("ANPR_SESSION_SECRET", ""), ADMIN_PW_HASH)


def _session_user(request: Request) -> str | None:
    if not ADMIN_PW_HASH:
        return None
    user = admin_auth.verify_session(request.cookies.get(SESSION_COOKIE, ""), _session_key())
    return user if user == ADMIN_USER else None          # a cookie for an ID that is no longer the admin is no cookie


def _is_admin(request: Request) -> bool:
    return _session_user(request) is not None or _token_ok(request.cookies.get(ADMIN_COOKIE, ""))


def _remote(request: Request) -> bool:
    """Not this machine (tunnel, proxy or another device), and not a signed-in admin."""
    if _is_admin(request):
        return False
    return is_remote(request.client.host if request.client else None, request.headers)


@app.middleware("http")
async def _tunnel_guard(request: Request, call_next):
    """
    A request from anywhere but this machine (the Cloudflare tunnel, or another device on the
    LAN such as an ESP32-CAM) may only reach the public live routes.  Requests from this machine
    keep full access, so the setup tools work as before.
    """
    if _remote(request) and not is_public_allowed(request.method, request.url.path):
        if request.method in ("GET", "HEAD") and request.url.path.rstrip("/") == "":
            # the site's front door is the sign-in page (then the console); the public live view is at /live.  With no
            # sign-in set up at all there is nothing to sign in to, so go to the live view.
            return RedirectResponse("/admin?next=%2F" if (ADMIN_PW_HASH or ADMIN_TOKEN) else "/live", status_code=303)
        return JSONResponse({"error": "not available on the public link"}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/static/") and "cache-control" not in response.headers:
        # The console's scripts and styles change with every deploy.  With no instruction a browser keeps them for a while
        # on its own, so an operator saw the old page after an update; "no-cache" makes it ask first (a 304 when unchanged).
        response.headers["Cache-Control"] = "no-cache"
    return response


MAX_DECODE_PIXELS = int(os.getenv("ANPR_MAX_DECODE_MP", "48")) * 1_000_000      # a phone photo is 12 MP; nothing real is bigger than this


def _image_size(raw: bytes):
    """(width, height) written in a JPEG's or PNG's header, without decoding it; None if it is neither or the header is cut."""
    if raw[:8] == b"\x89PNG\r\n\x1a\n" and len(raw) >= 24:
        return int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")
    if raw[:2] != b"\xff\xd8":
        return None
    i, n = 2, len(raw)
    while i + 9 < n:
        if raw[i] != 0xFF:
            i += 1
            continue
        marker = raw[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):           # a start-of-frame: height, then width
            return int.from_bytes(raw[i + 7:i + 9], "big"), int.from_bytes(raw[i + 5:i + 7], "big")
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + int.from_bytes(raw[i + 2:i + 4], "big")
    return None


def _decode(raw: bytes):
    if not raw:                       # cv2.imdecode raises, rather than returning None, on empty input
        return None
    size = _image_size(raw)
    if size and size[0] * size[1] > MAX_DECODE_PIXELS:
        return None                   # a 689-byte file that says it is 14000 x 14000 decoded to 1.2 GB on a 2 GB machine
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
    print(f"[anpr] live phone page: /live/camera?camera_id=phone-1&key={LIVE_KEY}")
    _restore_state()


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
        # nothing to replace; but a layout saved before picture sizes were recorded gets its size now
        saved = state_store.load_camera(camera_id)
        size = _frame_size_for(camera_id, body.get("image_size"))
        if size and not saved.get("frame_size"):
            state_store.save_camera(camera_id, {"frame_size": size})
            _remember_layout_size(camera_id, size)
        return {"camera_id": camera_id, "view": view, "bays": current.bay_ids,
                "count": len(current.bay_ids), "unchanged": True}

    errors, warnings, frame_size = _check_layout(camera_id, bays, body.get("image_size"))
    if errors:
        return JSONResponse({"error": "; ".join(errors), "errors": errors, "warnings": warnings},
                            status_code=400)
    try:
        bm = BayMap(bays, view=view, camera_profile=profile, bay_sizes=_stored_bay_sizes(camera_id, bays))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    # Sync to SlotRegistry
    reg = SlotRegistry(camera_id=camera_id)
    for sid, coords in bays.items():
        reg.add_slot(SlotDefinition(slot_id=sid, polygon=coords, orientation=bm.axes.get(sid, 0.0), camera_id=camera_id))
    _registries[camera_id] = reg

    _bay_maps[camera_id] = bm
    _trackers[camera_id] = OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds)
    _remember_layout_size(camera_id, frame_size)
    _store_layout(camera_id, bays, view, frame_size)
    _layout_changed(camera_id)
    # MOT tracker is NOT reset on bay update — preserves tracking continuity
    return {"camera_id": camera_id, "view": view,
            "bays": bm.bay_ids, "count": len(bm.bay_ids), "warnings": warnings}


@app.get("/occupancy/bays")
def get_bays(camera_id: str = "default"):
    """The layout currently registered for a camera, as it was posted."""
    bm = _bay_maps.get(camera_id)
    if bm is None:
        return JSONResponse({"error": f"no bays for '{camera_id}'"}, status_code=404)
    saved = state_store.load_camera(camera_id)
    session = _live_sessions.get(camera_id)
    line = session.counter.config() if session and session.counter else saved.get("line")
    return {"camera_id": camera_id, "view": bm.view, "bays": bm._bay_points,
            "frame_size": saved.get("frame_size"), "saved_at": saved.get("saved_at"), "line": line}


@app.get("/occupancy/bays/backups")
def list_bay_backups(camera_id: str = "default"):
    """Earlier layouts of a camera (each save keeps the one it replaced), newest first."""
    return {"camera_id": camera_id, "backups": state_store.list_backups(camera_id)}


@app.post("/occupancy/bays/restore")
async def restore_bays(request: Request):
    """Put an earlier layout back: {"camera_id", "backup": "<name from /occupancy/bays/backups>"}."""
    try:
        body = await request.json()
        camera_id, name = str(body["camera_id"]), str(body["backup"])
    except Exception:
        return JSONResponse({"error": "send camera_id and backup"}, status_code=400)
    saved = state_store.load_backup(camera_id, name)
    if not saved or not saved.get("bays"):
        return JSONResponse({"error": "no such backup"}, status_code=404)
    try:
        bm = _install_bays(camera_id, saved["bays"], saved.get("view", "oblique"))
    except Exception as e:
        return JSONResponse({"error": f"that layout cannot be used now: {e}"}, status_code=400)
    return {"ok": True, "camera_id": camera_id, "count": len(bm.bay_ids), "bays": bm.bay_ids}


@app.post("/occupancy/calibration-preview")
async def calibration_preview(request: Request):
    """
    Can parking be judged in 3D with the bays as drawn?  {"camera_id", "bays": {id: [[x, y] x4]}, "image_size": [w, h]}
    Fits the camera exactly as the live path will and answers, without saving anything: whether a camera was
    recovered, and per bay its grade, fit error in pixels and metres, and the stall size it measures.  The operator
    uses it to nudge a corner before saving.  Private: not on the public list.
    """
    try:
        body = await request.json()
        camera_id = _safe_camera_id(str(body.get("camera_id", "phone-1")))
        bays = body["bays"]
    except Exception:
        return JSONResponse({"error": "send bays and image_size"}, status_code=400)
    errors, warnings, size = _check_layout(camera_id, bays, body.get("image_size"))
    if errors:
        return JSONResponse({"error": "; ".join(errors), "errors": errors, "warnings": warnings}, status_code=400)
    if not size:
        return JSONResponse({"error": "the picture size is not known: load a frame first"}, status_code=400)
    try:
        pts = {str(k): [[float(x), float(y)] for x, y in v] for k, v in bays.items()}
        cal = fit_site_calibration(pts, (int(size[0]), int(size[1])))
    except Exception as e:                                    # a layout the fit cannot take is the operator's to fix
        return JSONResponse({"error": f"the 3D fit failed: {e}"}, status_code=400)
    report = cal.report()
    for bid, b in report["bays"].items():
        m = cal.bays[bid].margin_m
        b["margin_m"] = None if m is None else round(float(m), 2)
    good = sum(1 for b in cal.bays.values() if b.status == "good")
    return {"ok": True, "camera_id": camera_id, "image_size": list(size), "ready": cal.camera is not None,
            "good_bays": good, "total": len(cal.bays), "min_good_bays": MIN_GOOD_BAYS, "warnings": warnings, **report}


_move_detectors: dict[str, MoveDetector] = {}
_light_gates: dict[str, LightGate] = {}
_night_memory: dict[str, "night_mod.NightMemory"] = {}
MOVE_CHECK_S = 30.0          # how often a live frame is compared with the saved reference picture


def _layout_changed(camera_id: str) -> None:
    """New bays were saved, so the camera is where the operator wants it: the next live frame
    becomes the reference picture that later frames are compared with."""
    _move_detectors.pop(camera_id, None)
    _verdict_holds.pop(camera_id, None)                  # the bays are new: so are the held verdicts
    _light_gates.pop(camera_id, None)
    _night_memory.pop(camera_id, None)                   # which bay was empty is about the old bays
    _fit_caches.pop(camera_id, None)                     # a fitted box is in the old calibration's frame (and a freed object's id can be reused)
    arrivals.new_boot()                                  # the tracker's car numbers start again: an old record's number is not the same car's
    state_store.delete_ref(camera_id)
    # A bay id means a different piece of ground in every layout, so a violation or a car "still there" in Bay-04 of the OLD layout
    # is not about the new Bay-04.  On 28 Oct, re-marking the bays four times left 16 "open" violations, most about bays that no
    # longer existed as drawn.  They end here (the evidence pictures stay).
    now = time.time()
    try:
        _violation_book(camera_id).close_all(now)
        _arrival_book(camera_id).close_all(now)
    except Exception as e:                               # tidying up must never stop a layout from being saved
        print(f"[anpr] could not close the old layout's records: {type(e).__name__}: {e}")


def _camera_moved(camera_id: str, frame, session: LiveSession) -> str:
    """'moved' when the view has shifted since the bays were saved, else 'ok'."""
    now = time.time()
    det = _move_detectors.get(camera_id)
    if det is None:
        det = MoveDetector()
        png = state_store.load_ref(camera_id)
        if not (png and det.load_reference_png(png)):
            state_store.save_ref(camera_id, det.set_reference(frame))
        _move_detectors[camera_id] = det
        session.last_move_check = now
        return "ok"
    if now - session.last_move_check >= MOVE_CHECK_S:
        session.last_move_check = now
        det.check(frame)
    return "moved" if det.moved else "ok"


class LayoutError(Exception):
    """A bay layout that must not be saved (the message says why, for the operator)."""


def _frame_size_for(camera_id: str, given=None):
    """The picture size the bays are drawn on: what the page said, else what the live camera sends."""
    try:
        w, h = float(given[0]), float(given[1])
        if w > 0 and h > 0:
            return [int(w), int(h)]
    except (TypeError, ValueError, IndexError, KeyError):
        pass
    session = _live_sessions.get(camera_id)
    size = session.snapshot().get("frame_size") if session else None
    return size or None


def _check_layout(camera_id: str, bays, image_size=None):
    """(errors, warnings, frame_size) for a layout about to be saved."""
    size = _frame_size_for(camera_id, image_size)
    errors, warnings = validate_bays(bays, tuple(size) if size else None)
    return errors, warnings, size


def _store_layout(camera_id: str, bays: dict, view: str, frame_size=None) -> None:
    """Save a layout, first keeping the one it replaces so a bad edit can be undone."""
    previous = state_store.load_camera(camera_id)
    if previous.get("bays") and previous["bays"] != bays:
        state_store.backup_bays(camera_id, previous["bays"], previous.get("view", "oblique"),
                                previous.get("saved_at", ""))
    state_store.save_camera(camera_id, {"view": view, "bays": bays, "frame_size": frame_size,
                                        "saved_at": datetime.now().isoformat(timespec="seconds")})


RECORD_S = float(os.getenv("ANPR_RECORD_S", "0"))                 # keep the live picture and the system's answers every N s; 0 = off
RECORD_MAX_MB = float(os.getenv("ANPR_RECORD_MAX_MB", "1500"))
RECORD_DAYS = float(os.getenv("ANPR_RECORD_DAYS", "14"))
_recorders: dict[str, "record_mod.Recorder"] = {}
_last_record_prune = 0.0


def _recorder() -> "record_mod.Recorder":
    """The recorder for the current data folder (cached, so its "last kept" times last); its settings are read each time."""
    root = state_store.DATA_DIR / "record"
    r = _recorders.get(str(root))
    if r is None:
        r = _recorders[str(root)] = record_mod.Recorder(root, RECORD_S, RECORD_MAX_MB, RECORD_DAYS, tz=reports.site_tz())
    r.interval_s, r.max_mb, r.max_days = RECORD_S, RECORD_MAX_MB, RECORD_DAYS
    return r


def _zones_of(polygons: dict) -> dict:
    """near / middle / far for each bay, by how big it is in the picture (the near ones are big).  Errors are reported by zone: a far bay's
    mistakes must not hide in an average with the near ones."""
    areas = {}
    for k, pts in polygons.items():
        a = 0.0
        for (x1, y1), (x2, y2) in zip(pts, list(pts[1:]) + list(pts[:1])):
            a += x1 * y2 - x2 * y1
        areas[k] = abs(a) / 2.0
    order = sorted(areas, key=lambda k: -areas[k])
    n = len(order)
    return {k: ("near" if i < n / 3 else "middle" if i < 2 * n / 3 else "far") for i, k in enumerate(order)}


def _record_frame(camera_id: str, frame, layout: dict, answers: dict, states: dict, light: str, calibration: str, now: float) -> None:
    rec = _recorder()
    if not rec.due(camera_id, now):
        return
    bays = {}
    for k, a in answers.items():
        p = a.get("parking") or {}
        bays[k] = {"status": a.get("status"), "reason": a.get("reason"), "verdict": p.get("verdict"), "side": p.get("side"),
                   "crossing_m": p.get("crossing_m"), "across": p.get("across"), "source": p.get("source"),
                   "vehicle_id": getattr(states.get(k), "vehicle_id", None)}
    rec.save(camera_id, frame, {"light": light, "calibration": calibration, "bays": bays, "polygons": layout["bays"],
                                "zones": _zones_of(layout["bays"])}, now)
    global _last_record_prune
    if now - _last_record_prune > 3600:
        _last_record_prune = now
        rec.prune(now)


_layout_sizes: dict[str, tuple[int, int]] = {}     # camera id -> (width, height) of the picture its bays were drawn on
SIZE_ASPECT_TOL = 0.01                             # a picture within 1% of the layout's shape is the same view at another scale


BAY_WIDTH_RANGE_M = (1.8, 4.0)       # a stall measured outside these is a typo, not a stall
BAY_LENGTH_RANGE_M = (3.0, 7.0)


def _stored_bay_sizes(camera_id: str, bays) -> dict:
    """{bay id: (width_m, length_m)} of the stalls somebody measured on site.  A bay with no entry is the default 2.5 x 5.0 m.
    Every metre the system reports comes from these sizes, so a lot of 2.4 x 4.6 m stalls was read 4 % too wide and 8 % too long."""
    out = {}
    for bid, v in (state_store.load_camera(camera_id).get("bay_sizes") or {}).items():
        try:
            w, length = float(v[0]), float(v[1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if bid in bays and BAY_WIDTH_RANGE_M[0] <= w <= BAY_WIDTH_RANGE_M[1] and BAY_LENGTH_RANGE_M[0] <= length <= BAY_LENGTH_RANGE_M[1]:
            out[bid] = (w, length)
    return out


def _remember_layout_size(camera_id: str, size) -> None:
    """The size of the picture the bays were drawn on: a later picture of another size must not be laid over them unchecked."""
    if size and len(size) == 2 and size[0] and size[1]:
        _layout_sizes[camera_id] = (int(size[0]), int(size[1]))
    else:
        _layout_sizes.pop(camera_id, None)


def _fit_frame_to_layout(camera_id: str, frame):
    """(frame, how): "ok" (same size or no size on record), "scaled" (same view at another size: the frame is resized to the layout's, so
    the bays, the calibration, the line and the arrival boxes all stay in one pixel space) or "mismatch" (another shape: a lens or
    orientation change; the bays cannot be laid on it).  Without this a phone that switched lens laid every bay on the wrong pixels."""
    size = _layout_sizes.get(camera_id)
    h, w = frame.shape[:2]
    if not size or (w, h) == tuple(size):
        return frame, "ok"
    lw, lh = size
    if abs((w / h) / (lw / lh) - 1.0) <= SIZE_ASPECT_TOL:
        return cv2.resize(frame, (lw, lh), interpolation=cv2.INTER_AREA), "scaled"
    return frame, "mismatch"


def _install_bays(camera_id: str, bays: dict, view: str, registry: SlotRegistry | None = None,
                  restoring: bool = False, image_size=None) -> BayMap:
    """
    Make `bays` (id -> polygon in image pixels) the layout for a camera and restart its
    occupancy history.  Raises if the geometry is unusable, leaving the old layout in place.
    `restoring` is for the reload after a restart: the saved layout is trusted as it is and the
    saved reference picture stays valid.
    """
    frame_size = None
    if not restoring:
        errors, _warnings, frame_size = _check_layout(camera_id, bays, image_size)
        if errors:
            raise LayoutError("; ".join(errors))
    _remember_layout_size(camera_id, frame_size if not restoring else image_size)
    profile = _profiles.setdefault(camera_id, CameraProfile(camera_id=camera_id, view_angle=view))
    thresholds = _thresholds.setdefault(camera_id, ParkingThresholds())
    bm = BayMap(bays, view=view, camera_profile=profile, bay_sizes=_stored_bay_sizes(camera_id, bays))
    if registry is None:
        registry = SlotRegistry(camera_id=camera_id)
        for sid, coords in bays.items():
            registry.add_slot(SlotDefinition(slot_id=sid, polygon=coords,
                                             orientation=bm.axes.get(sid, 0.0), camera_id=camera_id))
    _registries[camera_id] = registry
    _bay_maps[camera_id] = bm
    _trackers[camera_id] = OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds)
    if camera_id in _mot_trackers:
        _mot_trackers[camera_id].reset()
        arrivals.new_boot()                              # its car numbers start again (also when only the stall sizes changed)
    if not restoring:
        _store_layout(camera_id, bays, view, frame_size)
        _layout_changed(camera_id)
    return bm


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

    try:
        bm = _install_bays(camera_id, bays, view, registry)
    except Exception as e:
        return JSONResponse({"error": f"Invalid bay geometry: {e}"}, status_code=400)

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
    if _live_busy():
        return _live_busy_response()
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
    if _live_busy():
        return _live_busy_response()
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
    if _live_busy():
        return _live_busy_response()
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
    """The management console (only an operator or this machine gets here; a visitor is sent to /live by the guard)."""
    page = HERE / "static" / "console.html"
    if page.exists():
        return HTMLResponse(page.read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})
    return "<h1>ParkFNB</h1><p>static/console.html is missing.</p>"


@app.get("/tools/plate-test", response_class=HTMLResponse)
def plate_test_page():
    """The single-photo plate reader test page (what / used to be)."""
    page = HERE / "static" / "index.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>ParkFNB ANPR</h1><p>static/index.html is missing.</p>"


@app.get("/console/api/cameras")
def console_cameras():
    """Every camera the console can show: saved layouts plus any that are sending right now."""
    saved = state_store.load_cameras()
    out = []
    for cid in sorted(set(saved) | set(_live_sessions)):
        st = saved.get(cid) or {}
        s = _live_sessions.get(cid)
        snap = s.snapshot() if s else {}
        out.append({"id": cid, "bays": len(st.get("bays") or {}), "saved_at": st.get("saved_at"),
                    "layout_size": st.get("frame_size"), "online": bool(snap.get("online")),
                    "stream_status": snap.get("stream_status", "not_started"),
                    "frame_age_s": snap.get("frame_age_s"), "age_s": snap.get("age_s"), "fps": snap.get("fps_processed"),
                    "frozen": bool(snap.get("frozen")), "uplink": snap.get("uplink"),
                    "light": snap.get("light", "ok"), "calibration": snap.get("calibration", "ok"),
                    "site_calibration": snap.get("site_calibration"),
                    "slot_summary": snap.get("slot_summary"), "still": _read_still_meta(cid)})
    return JSONResponse({"cameras": out}, headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- reports

MAX_REPORT_DAYS = 93              # a longer range would read months of log lines inside one request


@app.get("/console/api/report")
def console_report(camera_id: str = "phone-1", date_from: str | None = Query(None, alias="from"),
                   date_to: str | None = Query(None, alias="to"), bucket: str = ""):
    """Occupancy over time, stays, parking quality, episodes and uptime for whole local days (admin or this machine only)."""
    try:
        rep = _build_report(camera_id, date_from, date_to, bucket)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse(rep, headers={"Cache-Control": "no-store"})


def _build_report(camera_id, date_from, date_to, bucket):
    start, end = reports.parse_range(date_from, date_to)
    if end - start > MAX_REPORT_DAYS * 86400:
        raise ValueError(f"a report covers at most {MAX_REPORT_DAYS} days")
    cid = _safe_camera_id(camera_id)
    rep = reports.build_report([_live_log_dir(), LEGACY_LOG_DIR], cid, date_from, date_to, bucket or None, sample_s=LOG_SAMPLE_S)
    try:
        arrivals.attach_plates(rep["stays"], _arrival_book(cid).list(limit=arrivals.KEEP))       # which car each stay was
    except Exception as e:                                                                       # the plate is an extra column
        print(f"[anpr] could not attach plates to the stays: {type(e).__name__}: {e}")
    return rep


@app.get("/console/api/report.csv")
def console_report_csv(camera_id: str = "phone-1", date_from: str | None = Query(None, alias="from"),
                       date_to: str | None = Query(None, alias="to"), bucket: str = "", table: str = "occupancy"):
    if table not in reports.TABLES:
        return JSONResponse({"error": f"table must be one of {', '.join(reports.TABLES)}"}, status_code=400)
    try:
        rep = _build_report(camera_id, date_from, date_to, bucket)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    name = f"{_safe_camera_id(camera_id)}-{table}-{rep['from']}-{rep['to']}.csv"
    return Response("﻿" + reports.table_csv(rep, table), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


# ---------------------------------------------------------------- violations

_books: dict[str, "violations.ViolationBook"] = {}
_last_prune = 0.0
PRUNE_EVERY_S = 6 * 3600.0
LOG_RETENTION_DAYS = float(os.getenv("ANPR_LOG_RETENTION_DAYS", "180"))
EVIDENCE_DAYS = float(os.getenv("ANPR_EVIDENCE_DAYS", "30"))


_book_lock = threading.Lock()


def _violation_book(camera_id: str) -> "violations.ViolationBook":
    path = state_store.DATA_DIR / "violations" / f"{camera_id}.json"
    with _book_lock:                       # the live worker and an HTTP thread could both make the first one: two locks, lost updates
        book = _books.get(str(path))
        if book is None:
            book = _books[str(path)] = violations.ViolationBook(path, camera_id)
        return book


def _evidence_file(camera_id: str, vid: str, hq: bool = False) -> Path:
    return state_store.DATA_DIR / "evidence" / camera_id / f"{vid}{'-hq' if hq else ''}.jpg"


def _save_evidence(path: Path, img) -> None:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(buf.tobytes())
    os.replace(tmp, path)


def _on_live_event(session: LiveSession, ev: dict, img, layout) -> None:
    """The live feed's events feed the register: an over-the-line verdict opens a violation (with a picture), the car
    moving right or leaving closes it."""
    kind, bay, cid = ev.get("type"), ev.get("bay_id"), session.camera_id
    if bay is not None and ARRIVAL_PHOTOS:
        if kind == "bay_occupied":
            _on_arrival(session, ev)
            return
        if kind == "bay_initial":
            # a car already there when the service or the layout started: nobody saw it arrive, but its plate is still wanted
            if ev.get("status") == "occupied" and ev.get("box"):
                _arrival_book(cid).adopt(bay, ev.get("track_id"), ev["t"], ev.get("box"), ev.get("frame_size"), ev.get("outline"))
            return
        if kind == "bay_freed":
            _arrival_book(cid).close(bay, ev["t"])
    if bay is None or kind not in ("parking_over_line", "parking_ok", "bay_freed"):
        return
    book = _violation_book(cid)
    if kind == "parking_over_line":
        poly = ((layout or {}).get("bays") or {}).get(str(bay))
        where = {"polygon": poly, "layout_size": (layout or {}).get("size")} if poly else None
        rec, created = book.open(bay, violations.OVER_LINE, ev["t"], ev.get("detail") or "", ev.get("crossing_m"),
                                 ev.get("side"), where)
        if created:
            if img is not None and poly:
                _save_evidence(_evidence_file(cid, rec["id"]), violations.crop_around(img, poly))
                book.mark_evidence(rec["id"])
            session.still_requested = True               # a sharp picture of the car for the record
            session._still_asked_at = 0.0
    elif kind == "parking_ok":
        book.close_type(bay, violations.OVER_LINE, ev["t"])
    else:
        book.close(bay, ev["t"])


# ---------------------------------------------------------------- arrivals: a sharp photo of each car as it parks

ARRIVAL_PHOTOS = os.getenv("ANPR_ARRIVAL_PHOTOS", "1") != "0"
_arrival_books: dict[str, "arrivals.ArrivalBook"] = {}
CAR_PHOTO_MARGIN = 0.12              # the cut around the car, as a share of the car's own size each way
ARRIVAL_SETTLE_S = float(os.getenv("ANPR_ARRIVAL_SETTLE_S", "8"))               # the car must still be in its bay this long after it stopped
ARRIVAL_DETECT_IMGSZ = int(os.getenv("ANPR_ARRIVAL_DETECT_IMGSZ", "1280"))     # 1920 finds the same plates and needs far more memory


def _arrival_book(camera_id: str) -> "arrivals.ArrivalBook":
    path = state_store.DATA_DIR / "arrivals" / f"{camera_id}.json"
    with _book_lock:
        book = _arrival_books.get(str(path))
        if book is None:
            book = _arrival_books[str(path)] = arrivals.ArrivalBook(path, camera_id)
        return book


def _arrival_file(camera_id: str, rid: str, kind: str) -> Path:
    return state_store.DATA_DIR / "evidence" / camera_id / f"arrival-{rid}-{kind}.jpg"


def _on_arrival(session: LiveSession, ev: dict) -> None:
    """A car stopped in a bay: write it down with where it is in the picture, and ask the phone for a sharp photo."""
    cid = session.camera_id
    # No full photo is asked for: the phone is asked for a close-up of just this car (see _crops_to_ask), a few dozen times
    # smaller to upload.  If no close-up arrives (an old camera page), _crops_to_ask falls back to the full photo.
    _arrival_book(cid).open(ev["bay_id"], ev.get("track_id"), ev["t"], ev.get("box"), ev.get("frame_size"), ev.get("outline"))


_arrival_lock = threading.Lock()
SLOW_FRAME_S = float(os.getenv("ANPR_SLOW_FRAME_S", "2.5"))     # a live frame slower than this is written to the service log with its stages
_crop_asked: dict[str, float] = {}           # arrival id -> when the phone was last asked for a close-up of it
CROP_ASK_GAP_S = 12.0                        # ask again for a close-up that has not come after this long
CROP_FALLBACK_S = 40.0                       # a close-up this overdue, and none seen lately: ask for the full photo instead
MAX_CROPS_PER_REPLY = 3
CROP_CHECK_GAP_S = 3.0
_crops_checked: dict[str, float] = {}        # camera id -> when the register was last looked at for close-ups to ask for
_last_crop_at: dict[str, float] = {}         # camera id -> when a close-up last arrived


def _crops_to_ask(camera_id: str, session: LiveSession, now: float) -> list[dict]:
    """What to tell the phone in the reply to its picture: the cars to send a close-up of ({id, box, frame_size}).  The phone
    takes one photo and cuts each car from it at full resolution, so what it uploads is a few dozen KB, not the 2-4 MB photo."""
    if not ARRIVAL_PHOTOS:
        return []
    # every picture of every camera comes through here, and each look reads the whole register file (hundreds of KB, ~0.3 s on a full
    # one): once every few seconds is plenty for a close-up that waits ARRIVAL_SETTLE_S anyway
    if now - _crops_checked.get(camera_id, 0.0) < CROP_CHECK_GAP_S:
        return []
    _crops_checked[camera_id] = now
    book = _arrival_book(camera_id)
    out = []
    for r in book.want_crop(now, ARRIVAL_SETTLE_S):
        if now - _crop_asked.get(r["id"], 0.0) < CROP_ASK_GAP_S:
            continue
        out.append({"id": r["id"], "box": r["box"], "frame_size": r["frame_size"]})
        _crop_asked[r["id"]] = now
        if len(out) >= MAX_CROPS_PER_REPLY:
            break
        if (not r["photo"] and now - r["arrived"] > CROP_FALLBACK_S and now - _last_crop_at.get(camera_id, 0.0) > 300.0):
            session.still_requested = True                         # an old camera page that cannot send close-ups
    for k in [k for k, t in _crop_asked.items() if now - t > 3600.0]:
        _crop_asked.pop(k, None)
    return out


def _kick_arrival_photos(camera_id: str, now: float) -> None:
    """A full-resolution photo has arrived: if cars are waiting for theirs, cut them out on a thread of their own (the
    plate detector takes seconds on this CPU and the upload must not wait for it)."""
    book = _arrival_book(camera_id) if ARRIVAL_PHOTOS else None
    if book is not None and (book.waiting(now) or book.to_recheck(now)):
        threading.Thread(target=_process_arrivals, args=(camera_id, now), daemon=True, name=f"arrivals-{camera_id}").start()


def _process_arrivals(camera_id: str, now: float) -> None:
    if not _arrival_lock.acquire(timeout=120):
        return
    try:
        book = _arrival_book(camera_id)
        jpg, _ = _still_paths(camera_id)
        still = cv2.imdecode(np.frombuffer(jpg.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        if still is None:
            return
        fresh = book.waiting(now)
        seen = {r["id"] for r in fresh}
        # cars that already had a photo but no confirmed plate get another look in this one
        for rec in fresh + [r for r in book.to_recheck(now) if r["id"] not in seen]:
            try:
                if not rec.get("photo"):
                    # A car that is gone again within a few seconds was a flicker (the camera being re-aimed, a scrap on the
                    # grass called a car), not an arrival: do not keep a record or pictures for it.
                    time.sleep(max(0.0, ARRIVAL_SETTLE_S - (time.time() - rec["arrived"])))
                    now_rec = book.get(rec["id"])
                    if now_rec is None or now_rec["left"] is not None:
                        book.drop(rec["id"])
                        continue
                _arrival_photo(camera_id, book, rec, still)
            except Exception as e:                                 # one car's trouble must not stop the next
                book.update(rec["id"], photo=True, plate_state="error", error=f"{type(e).__name__}: {e}"[:160])
        book.drop_flickers(ARRIVAL_SETTLE_S)
    finally:
        _arrival_lock.release()


def _arrival_photo(camera_id: str, book: "arrivals.ArrivalBook", rec: dict, still) -> None:
    """Cut the car out of the photo, look for its plate, and write down how big it is and whether that is enough to read."""
    h, w = still.shape[:2]
    bx1, by1, bx2, by2 = aoi_tools.live_to_still(rec["box"], rec["frame_size"], (w, h))
    mx, my = CAR_PHOTO_MARGIN * (bx2 - bx1), CAR_PHOTO_MARGIN * (by2 - by1)
    x0, y0, x1, y1 = max(0, int(bx1 - mx)), max(0, int(by1 - my)), min(w, int(bx2 + mx)), min(h, int(by2 + my))
    car = still[y0:y1, x0:x1]
    if car.size == 0:
        book.update(rec["id"], photo=True, plate_state="error", error="the car is outside the photo")
        return
    outline = None
    if rec.get("outline"):                                                                  # the car's own shape inside the cut
        outline = [[x - x0, y - y0] for x, y in aoi_tools.live_points_to_still(rec["outline"], rec["frame_size"], (w, h))]
    _arrival_car(camera_id, book, rec, car, (bx1 - x0, by1 - y0, bx2 - x0, by2 - y0), outline)      # the car's own box inside the cut


def _strict_plate(plate) -> bool:
    """A borderline-size plate needs the stricter vote.  The size verdict is kept apart from "unclear_photo", which replaces `verdict`
    when the picture is dark or blurred: a plate that was marginal in size stays marginal for the vote."""
    p = plate or {}
    return (p.get("size_verdict") or p.get("verdict")) == "marginal"


def _arrival_car(camera_id: str, book: "arrivals.ArrivalBook", rec: dict, car, inner, outline=None) -> None:
    """The picture of one car (cut from a full photo here, or by the phone itself: see /live/crop), `inner` being the car's own
    box inside it and `outline` (when known) its own shape: find its plate, read it, vote."""
    first = not rec.get("photo")
    tries = int(rec.get("tries", 0)) + 1
    if first:
        _save_evidence(_arrival_file(camera_id, rec["id"], "car"), car)
    # The cut is only about 600 x 350 px: handed over at that size the plate (60 x 17 px) is not found, so the detector is
    # given it enlarged (measured on the 27 Oct photo: all four cars' plates found at 1280, none at the native size).
    # A vehicle is not asked for: the model rarely calls a tight cut of a car a vehicle.
    plates = sorted((d for d in _plate_model_run(car, ARRIVAL_DETECT_IMGSZ) if d["cls"] == "plate"), key=lambda d: -d["conf"])
    # The cut has a margin, so a neighbour's plate can be in it: a plate belongs to this car when its centre is in the car's box.
    own = [d for d in plates if inner[0] <= (d["box"][0] + d["box"][2]) / 2 <= inner[2] and inner[1] <= (d["box"][1] + d["box"][3]) / 2 <= inner[3]]
    # A box is not the car: boxes of cars side by side overlap, and a neighbour's plate lies inside this one (30 Oct: the Fortuner's plate
    # was written on the black car behind it).  With the car's own outline a plate counts only if it is on the car, give or take the
    # edge of a mask (4 % of the car's width).
    if outline is not None and len(outline) >= 3:
        poly = np.asarray(outline, np.float32).reshape(-1, 1, 2)
        slack = 0.04 * max(1.0, inner[2] - inner[0])
        own = [d for d in own if cv2.pointPolygonTest(poly, (float((d["box"][0] + d["box"][2]) / 2), float((d["box"][1] + d["box"][3]) / 2)), True) >= -slack]
    # a number plate is a wide, short rectangle a fraction of the car's width: a box that is huge or the wrong shape is not one
    car_w = max(1.0, inner[2] - inner[0])
    own = [d for d in own if 1.5 <= (d["box"][2] - d["box"][0]) / max(1.0, d["box"][3] - d["box"][1]) <= 7.0
           and (d["box"][2] - d["box"][0]) <= 0.45 * car_w]
    plates = own
    session = _live_sessions.get(camera_id)
    if not plates:
        # a plate found on an earlier look stays; only a car with none so far is marked as having none
        book.update(rec["id"], photo=True, tries=tries, last_look=time.time(), **({} if rec.get("plate") else {"plate_state": "none_found"}))
        return
    px0, py0, px1, py1 = (int(v) for v in plates[0]["box"])
    pad_x, pad_y = int(0.15 * (px1 - px0)), int(0.3 * (py1 - py0))
    tile = car[max(0, py0 - pad_y):py1 + pad_y, max(0, px0 - pad_x):px1 + pad_x]
    plate = {"conf": round(plates[0]["conf"], 2), **aoi_tools.plate_readability(px1 - px0, py1 - py0)}
    # big enough is not clear enough: a dark or blurred plate is not sent to the readers (they invent letters from it) and is not
    # asked for again more than a few times
    unclear = rec.get("unclear", 0)
    if tile.size and plate["verdict"] != "too_small":
        plate["clarity"] = plate_ocr.clarity(tile)
        if not plate["clarity"]["clear"]:
            plate["size_verdict"], plate["verdict"] = plate["verdict"], "unclear_photo"
            unclear += 1
    reads = list(rec.get("reads") or [])
    read = None
    if tile.size and plate["verdict"] not in ("too_small", "unclear_photo"):
        try:
            read = plate_ocr.read_plate(tile)                                      # reading is an extra: it never stops the rest
        except Exception as e:
            print(f"[anpr] plate read failed: {type(e).__name__}: {e}")
    if read is not None:
        reads = (reads + [{k: read.get(k) for k in ("text", "valid", "mean_prob", "min_prob", "agree", "of", "rival", "cross", "m", "votes")}
                          | {"t": round(time.time())}])[-8:]
    # keep the sharpest crop seen: the first one, then any that was read better than the best so far
    best_before = max((r["mean_prob"] for r in rec.get("reads") or [] if plate_ocr.usable(r)), default=0.0)
    if tile.size and (first or not rec.get("plate") or (plate_ocr.usable(read) and read["mean_prob"] > best_before)):
        _save_evidence(_arrival_file(camera_id, rec["id"], "plate"), tile)
    if rec.get("source") == "operator":
        # a person has said what this plate is: the pictures are still kept and the answer is not touched, but the reader keeps its own
        # opinion beside it, so a person who was wrong (or the reader) can be told ("the reader now says ...")
        said = plate_ocr.vote(reads, strict=_strict_plate(plate))
        book.update(rec["id"], photo=True, tries=tries, last_look=time.time(), plate_state="found", plate=plate, reads=reads, unclear=unclear,
                    machine=({"text": said["text"], "confirmed": bool(said["confirmed"])} if said else None))
        return
    consensus = plate_ocr.vote(reads, strict=_strict_plate(plate))
    text = consensus["text"] if consensus else None
    confirmed = bool(consensus and consensus["confirmed"])
    # A second, independent method: the letters of every photo averaged, then decoded.  It cannot make a plate, but it can stop one
    # being confirmed when it disagrees, and it gives the best guess when the vote has nothing.
    fused = plate_ocr.fuse(reads)
    guess = None
    if fused and fused["valid"]:
        if consensus and fused["text"] != consensus["text"]:
            confirmed = False
        elif not consensus and fused["mean_prob"] >= 0.45:
            guess = fused["text"]
    if text is None and guess is None:
        guess = plate_ocr.guess(reads)
    out = book.update_reading(rec["id"], photo=True, tries=tries, last_look=time.time(), plate_state="found", plate=plate, reads=reads,
                              unclear=unclear, text=text, confirmed=confirmed, guess=None if text else guess, rv=plate_ocr.READER_VERSION)
    if session is not None:
        session.note({"t": time.time(), "type": "arrival_photo", "bay_id": rec["bay"],
                      "detail": f"plate {plate['width_px']}x{plate['height_px']} px, {plate['verdict'].replace('_', ' ')}"})
        # (a person may have typed the plate while this was being read: then theirs stands and this reading says nothing new)
        if text and not (out or {}).get("source") == "operator" and (text != rec.get("text") or confirmed != bool(rec.get("confirmed"))):
            session.note({"t": time.time(), "type": "plate_read", "bay_id": rec["bay"], "plate": text, "confirmed": confirmed,
                          "reads": len(reads)})


def _reread_stored_plates(camera_id: str) -> int:
    """
    After the way plates are read changed (plate_ocr.READER_VERSION), read again the saved plate picture of each arrival that was
    read the old way.  The first reader confirmed MP09AW5254 for a green plate that says MP09AN5254, and that answer was stored.
    A plate that the new reader cannot read is cleared rather than kept.  Returns how many arrivals were looked at.
    """
    book, n = _arrival_book(camera_id), 0
    for rec in book.list(limit=arrivals.KEEP):
        if rec.get("rv") == plate_ocr.READER_VERSION or not (rec.get("text") or rec.get("reads")):
            continue
        path = _arrival_file(camera_id, rec["id"], "plate")
        img = cv2.imread(str(path)) if path.exists() else None
        read = plate_ocr.read_plate(img) if img is not None else None
        reads = ([{k: read.get(k) for k in ("text", "valid", "mean_prob", "min_prob", "agree", "of", "rival", "cross", "m", "votes")} | {"t": round(time.time())}]
                 if read else [])
        consensus = plate_ocr.vote(reads, strict=_strict_plate(rec.get("plate")))
        if rec.get("source") == "operator":
            book.update(rec["id"], reads=reads, rv=plate_ocr.READER_VERSION)           # a person's answer stays
            n += 1
            continue
        # a plate that was confirmed before and that the current reader gives again stays confirmed (this pass has only the one saved
        # picture to go on, where the earlier confirmation had several photos)
        kept = bool(rec.get("confirmed") and consensus and consensus["text"] == rec.get("text"))
        book.update_reading(rec["id"], reads=reads, text=consensus["text"] if consensus else None,
                            confirmed=bool(consensus and consensus["confirmed"]) or kept, guess=None if consensus else plate_ocr.guess(reads),
                            rv=plate_ocr.READER_VERSION)
        n += 1
    return n


def _arrival_view(rec: dict, camera_id: str) -> dict:
    out = {k: v for k, v in rec.items() if k not in ("reads", "outline")}
    out["reads"] = [{k: v for k, v in r.items() if k in ("text", "valid", "mean_prob", "t")} for r in rec.get("reads") or []]
    try:
        out["doubts"] = plate_ocr.letter_doubts(rec.get("reads") or [], rec.get("text") or rec.get("guess"))      # the letters to look at
    except Exception:
        out["doubts"] = []
    out["arrived_iso"], out["left_iso"] = violations.when(rec["arrived"]), violations.when(rec["left"])
    out["car_photo"] = bool(rec.get("photo")) and _arrival_file(camera_id, rec["id"], "car").exists()
    out["plate_photo"] = _arrival_file(camera_id, rec["id"], "plate").exists()
    return out


@app.get("/console/api/arrivals")
def console_arrivals(camera_id: str = "phone-1", limit: int = 60):
    cid = _safe_camera_id(camera_id)
    rows = _arrival_book(cid).list(limit=min(max(1, limit), 300))
    return JSONResponse({"camera_id": cid, "enabled": ARRIVAL_PHOTOS, "arrivals": [_arrival_view(r, cid) for r in rows]},
                        headers={"Cache-Control": "no-store"})


@app.post("/console/api/arrival/{rid}/plate")
async def console_arrival_plate(rid: str, request: Request, camera_id: str = "phone-1"):
    """
    An operator says what a car's plate is, reading it from the picture: {"plate": "DL8CAU7240"}.  It counts as confirmed and no
    later read changes it.  An empty plate takes the person's answer back and lets the readings decide again.
    """
    cid = _safe_camera_id(camera_id)
    if not arrivals.safe_id(rid):
        return JSONResponse({"error": "no such arrival"}, status_code=404)
    try:
        body = await request.json()
        typed = str(body.get("plate", ""))
    except Exception:
        return JSONResponse({"error": "send {\"plate\": \"...\"}"}, status_code=400)
    book = _arrival_book(cid)
    rec = book.get(rid)
    if rec is None:
        return JSONResponse({"error": "no such arrival"}, status_code=404)
    who = _session_user(request) or "this machine"
    clean = "".join(c for c in typed.upper() if c.isalnum())
    if not clean:                                                       # take the answer back
        consensus = plate_ocr.vote(rec.get("reads") or [], strict=_strict_plate(rec.get("plate")))
        out = book.update(rid, source=None, text=consensus["text"] if consensus else None,
                          confirmed=bool(consensus and consensus["confirmed"]),
                          guess=None if consensus else plate_ocr.guess(rec.get("reads") or []))
    else:
        if not 5 <= len(clean) <= 12:
            return JSONResponse({"error": "a plate is 5 to 12 letters and digits"}, status_code=400)
        from detector import normalise_plate
        plate, ok = normalise_plate(clean)
        out = book.update(rid, source="operator", text=plate if ok else clean, confirmed=True, guess=None, plate_state="found")
    session = _live_sessions.get(cid)
    if clean and session is not None and out and out.get("text"):          # a plate taken back is not a plate someone confirmed
        session.note({"t": time.time(), "type": "plate_read", "bay_id": out["bay"], "plate": out["text"], "confirmed": True, "reads": 0,
                      "by": who})
    return {"ok": True, "arrival": _arrival_view(out, cid)}


@app.get("/console/api/accuracy")
def console_accuracy(camera_id: str = "phone-1"):
    """
    How accurate the system is, measured from what the operators did (admin only):
      plates       a plate a person typed is a labelled sample: how often did the reader alone say the same?
      violations   how many reviewed violations were real (resolved) and how many a false alarm (dismissed)
      bays         how often an operator had to overrule a bay today, and how often a bay flickered
    Small numbers come with their interval: 4 of 4 is "between 51 % and 100 %".
    """
    cid = _safe_camera_id(camera_id)

    def machine(rec: dict):
        reads = rec.get("reads") or []
        v = plate_ocr.vote(reads)
        if v:
            return {"text": v["text"], "confirmed": v["confirmed"]}
        g = plate_ocr.guess(reads)
        return {"text": g, "confirmed": False} if g else None

    rows = _arrival_book(cid).list(limit=arrivals.KEEP)
    plates = arrivals.plate_accuracy(rows, machine)
    plates["read_by_machine"] = sum(1 for r in rows if r.get("text") and r.get("source") != "operator")
    plates["confirmed_by_machine"] = sum(1 for r in rows if r.get("confirmed") and r.get("source") != "operator")
    vio = _violation_book(cid).list()
    # Only "over the line" is something the system can get wrong; an overstay is a clock.  Tidied-up (bulk) dismissals were never judged.
    # (Records dismissed in bulk before the flag existed carry the note's first words instead.)
    judged = [v for v in vio if v["type"] == violations.OVER_LINE and not v.get("bulk")
              and not (v.get("bulk") is None and (v.get("note") or "").startswith("Dismissed in bulk"))]
    real, false = sum(1 for v in judged if v["status"] == "resolved"), sum(1 for v in judged if v["status"] == "dismissed")
    ci = arrivals.wilson(real, real + false)
    violations_out = {"reviewed": real + false, "real": real, "false_alarms": false, "open": sum(1 for v in vio if v["status"] == "open"),
                      "precision_pct": None if not (real + false) else round(100.0 * real / (real + false), 1),
                      "ci_low_pct": None if ci is None else round(100 * ci[0]), "ci_high_pct": None if ci is None else round(100 * ci[1])}
    try:
        today = datetime.now(reports.site_tz()).strftime("%Y-%m-%d")           # the day as the lot lives it, not the server's
        rep = _build_report(cid, today, today, "")
        flick = rep["dwell"]["flickers_by_bay"]
        overrides = len([r for r in activity_log.read_rows([_live_log_dir(), LEGACY_LOG_DIR], cid, days=1, kinds={"operator"})
                         if r.get("status") in ("VACANT", "OCCUPIED")])
        bays_out = {"flickers_today": sum(flick.values()), "flickers_by_bay": flick, "operator_overrides_today": overrides}
    except Exception as e:
        bays_out = {"error": f"{type(e).__name__}: {e}"}
    return JSONResponse({"camera_id": cid, "plates": plates, "violations": violations_out, "bays": bays_out},
                        headers={"Cache-Control": "no-store"})


@app.get("/console/api/vehicles")
def console_vehicles(camera_id: str = "phone-1", confirmed_only: int = 0):
    """The register of vehicles by plate: visits, first and last seen, bays used, inside now (admin only)."""
    cid = _safe_camera_id(camera_id)
    rows = _arrival_book(cid).list(limit=arrivals.KEEP)
    return JSONResponse({"camera_id": cid, "vehicles": arrivals.vehicles(rows, time.time(), confirmed_only=bool(confirmed_only))},
                        headers={"Cache-Control": "no-store"})


@app.get("/console/api/arrival/{rid}.jpg")
def console_arrival_photo(rid: str, camera_id: str = "phone-1", kind: str = "car"):
    cid = _safe_camera_id(camera_id)
    if kind not in ("car", "plate") or not arrivals.safe_id(rid):
        return JSONResponse({"error": "no such picture"}, status_code=404)
    path = _arrival_file(cid, rid, kind)
    if not path.exists():
        return JSONResponse({"error": "no such picture"}, status_code=404)
    return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


def _on_live_minute(session: LiveSession, slots: dict, now: float) -> None:
    """Once a sample: overstays, and the daily tidy-up of old logs, violations and pictures."""
    cid = session.camera_id

    # Each step on its own: the live worker swallows what escapes from here, so one step that fails (the overstay clock did, from 28 Oct,
    # when `since` became a string) used to stop every step after it, the daily tidy-up included, without a word anywhere.
    def step(name, fn):
        try:
            fn()
        except Exception:
            import traceback
            print(f"[{cid}] minute hook '{name}' failed:\n{traceback.format_exc()}", flush=True)

    def tidy():
        global _last_prune
        if now - _last_prune < PRUNE_EVERY_S:
            return
        _last_prune = now
        cutoff = now - EVIDENCE_DAYS * 86400
        step("prune logs", lambda: activity_log.prune_logs([_live_log_dir(), LEGACY_LOG_DIR], LOG_RETENTION_DAYS, now))
        step("prune pictures", lambda: violations.prune_evidence(state_store.DATA_DIR / "evidence", cutoff))
        step("prune violations", lambda: _violation_book(cid).prune(cutoff))
        step("prune arrivals", lambda: _arrival_book(cid).prune(cutoff))

    def arrivals_tidy():
        # a restart or a hidden car can lose the "bay freed" event: a bay that reads vacant now has no car that "is still there"
        book = _arrival_book(cid)
        for bay, s in slots.items():
            if s.get("status") == "VACANT" or s.get("flag") == "blocked":      # "blocked" is a free bay under another car: no car of its own
                book.close(bay, now)
        book.drop_flickers(ARRIVAL_SETTLE_S)
        book.dedupe_open(slots, now)                      # the same car written down in two bays

    def overstays():
        limit_h = float((_site().get("cameras", {}).get(cid) or {}).get("overstay_h") or 0)
        if limit_h:
            _violation_book(cid).check_overstay(slots, now, limit_h)

    step("close cleared", lambda: _violation_book(cid).close_cleared(slots, now))   # a car no longer over the line closes its violation
    if ARRIVAL_PHOTOS:
        step("arrivals", arrivals_tidy)
    step("overstay", overstays)
    tidy()


def _attach_hq_evidence(camera_id: str, still, now: float) -> None:
    """A full-resolution photo has arrived: cut it around each recent violation that has no sharp picture yet."""
    book = _violation_book(camera_id)
    h, w = still.shape[:2]
    for rec in book.waiting_for_hq(now):
        size = rec.get("layout_size")
        if not size or not size[0] or not size[1]:
            continue
        sx, sy = w / float(size[0]), h / float(size[1])
        poly = [[x * sx, y * sy] for x, y in rec["polygon"]]
        _save_evidence(_evidence_file(camera_id, rec["id"], hq=True), violations.crop_around(still, poly, 0.5))
        book.mark_evidence(rec["id"], hq=True)


def _violation_view(rec: dict) -> dict:
    out = {k: v for k, v in rec.items() if k not in ("polygon", "layout_size")}
    out["opened_iso"], out["closed_iso"] = violations.when(rec["opened"]), violations.when(rec["closed"])
    out["duration_s"] = round((rec["closed"] or time.time()) - rec["opened"], 1)
    return out


def _range_epoch(date_from, date_to):
    if not date_from and not date_to:
        return None, None
    start, end = reports.parse_range(date_from, date_to)
    return start, end


@app.get("/console/api/violations")
def console_violations(camera_id: str = "phone-1", status: str = "", type: str = "",
                       date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to")):
    cid = _safe_camera_id(camera_id)
    try:
        since, until = _range_epoch(date_from, date_to)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    book = _violation_book(cid)
    rows = [_violation_view(r) for r in book.list(status or None, type or None, since, until)]
    _add_plates(cid, rows)
    return JSONResponse({"camera_id": cid, "violations": rows,
                         "open_count": book.open_count(), "going_on": book.going_on_count()}, headers={"Cache-Control": "no-store"})


def _add_plates(camera_id: str, views: list[dict]) -> None:
    """Whose car it was: the plate of the car that was in the violation's bay at the time (the same matching as the Sessions page)."""
    try:
        spans = [{"bay": v["bay"], "start": v["opened"], "end": v["closed"], "view": v} for v in views]
        arrivals.attach_plates(spans, _arrival_book(camera_id).list(limit=arrivals.KEEP))
        for s in spans:
            if s.get("plate"):
                s["view"]["plate"], s["view"]["plate_confirmed"] = s["plate"], s["plate_confirmed"]
    except Exception as e:                                         # the plate is an extra column
        print(f"[anpr] could not attach plates to the violations: {type(e).__name__}: {e}")


@app.get("/console/api/violations.csv")
def console_violations_csv(camera_id: str = "phone-1", status: str = "", type: str = "",
                           date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to")):
    import csv as _csv
    import io as _io
    cid = _safe_camera_id(camera_id)
    try:
        since, until = _range_epoch(date_from, date_to)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    buf = _io.StringIO()
    w = _csv.writer(buf, lineterminator="\r\n")
    w.writerow(["opened", "closed", "bay", "plate", "type", "minutes", "max_crossing_m", "status", "note", "handled_by", "detail"])
    views = [_violation_view(r) for r in _violation_book(cid).list(status or None, type or None, since, until)]
    _add_plates(cid, views)
    for v in views:
        w.writerow([activity_log._safe(x) for x in (
            v["opened_iso"], v["closed_iso"], v["label"], (v.get("plate") or "") + ("" if v.get("plate_confirmed") or not v.get("plate") else " (unconfirmed)"),
            v["type"], round(v["duration_s"] / 60.0, 1),
            "" if v["max_crossing_m"] is None else round(v["max_crossing_m"], 2), v["status"], v["note"],
            v["handled_by"] or "", v["detail"])])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{cid}-violations.csv"', "Cache-Control": "no-store"})


@app.post("/console/api/violations-dismiss-ended")
def console_violations_dismiss_ended(request: Request, camera_id: str = "phone-1"):
    """Dismiss every violation that is already over and was never dealt with (the list of old ones that had piled up)."""
    cid = _safe_camera_id(camera_id)
    who = _session_user(request) or "this machine"
    n = _violation_book(cid).dismiss_ended("Dismissed in bulk: it was already over", who, time.time())
    session = _live_sessions.get(cid)
    if n and session is not None:
        session._log([{"t": time.time(), "type": "operator_violation", "status": "dismissed", "note": f"{n} ended violations dismissed in bulk", "who": who}])
    return {"ok": True, "dismissed": n, "open_count": _violation_book(cid).open_count()}


@app.post("/console/api/violations/{vid}")
async def console_violation_update(vid: str, request: Request, camera_id: str = "phone-1"):
    """An operator resolves or dismisses a violation (or reopens it), with a note: {"status", "note"}."""
    if not violations.safe_id(vid):
        return JSONResponse({"error": "no such violation"}, status_code=404)
    try:
        body = await request.json()
        status, note = str(body.get("status", "")), str(body.get("note", ""))
    except Exception:
        return JSONResponse({"error": "send status and note"}, status_code=400)
    cid = _safe_camera_id(camera_id)
    who = _session_user(request) or "this machine"
    try:
        rec = _violation_book(cid).handle(vid, status, note, who, time.time())
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if rec is None:
        return JSONResponse({"error": "no such violation"}, status_code=404)
    session = _live_sessions.get(cid)
    if session is not None:
        session._log([{"t": time.time(), "type": "operator_violation", "bay_id": rec["bay"], "status": status,
                       "note": rec["note"], "who": who}])
    return {"ok": True, "violation": _violation_view(rec), "open_count": _violation_book(cid).open_count()}


@app.get("/console/api/evidence/{vid}.jpg")
def console_evidence(vid: str, camera_id: str = "phone-1", hq: int = 0):
    """The picture kept with a violation (the full-resolution one when it exists and `hq=1`)."""
    cid = _safe_camera_id(camera_id)
    if not violations.safe_id(vid):
        return JSONResponse({"error": "no such picture"}, status_code=404)
    path = _evidence_file(cid, vid, hq=bool(hq))
    if hq and not path.exists():
        path = _evidence_file(cid, vid)
    if not path.exists():
        return JSONResponse({"error": "no such picture"}, status_code=404)
    return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


@app.get("/occupancy", response_class=HTMLResponse)
def occupancy_page():
    page = HERE / "static" / "occupancy.html"
    if page.exists():
        return page.read_text(encoding="utf-8")
    return "<h1>Occupancy Tool</h1><p>static/occupancy.html is missing.</p>"


# ------------------------------------------------------- Space Optimizer bridge
#
# The optimizer (services/space-optimizer, Flask) lays stalls out on a map.  These routes pull a
# saved project from it, run it, and carry the stalls onto a camera frame from four clicked
# corners (see optimizer_bridge.py).  The optimizer's address comes from the environment, never
# from a request, so these routes cannot be pointed at another machine.  Like every route that is
# not a public live page, they are refused for visitors on the tunnel.

OPTIMIZER_URL = os.getenv("OPTIMIZER_URL", "http://127.0.0.1:5000").rstrip("/")
_optimizer_layouts: dict[str, dict] = {}


class _OptimizerError(RuntimeError):
    pass


def _optimizer(method: str, path: str, body: dict | None = None) -> dict:
    """Call the optimizer and return its JSON; raise _OptimizerError with a readable message."""
    try:
        with httpx.Client(timeout=90.0) as client:
            r = client.request(method, f"{OPTIMIZER_URL}{path}", json=body)
        data = r.json()
    except httpx.HTTPError:
        raise _OptimizerError(f"The Space Optimizer is not running at {OPTIMIZER_URL}. Start it with: "
                              "cd services/space-optimizer && python app.py") from None
    except ValueError:
        raise _OptimizerError("The Space Optimizer sent something that is not JSON") from None
    if r.status_code >= 400 or not data.get("ok", True):
        raise _OptimizerError(data.get("error") or f"The Space Optimizer answered HTTP {r.status_code}")
    return data


def _remember_layout(key: str, name: str, layout: dict) -> str:
    """Keep a converted layout so the page can refer to it by id; the oldest are dropped."""
    if len(_optimizer_layouts) >= 8 and key not in _optimizer_layouts:
        _optimizer_layouts.pop(next(iter(_optimizer_layouts)))
    _optimizer_layouts[key] = {"name": name, "layout": layout}
    return key


def _optimizer_layout(project_id: int) -> tuple[str, str, dict]:
    """Run a saved optimizer project; returns (layout_id, name, layout in metres)."""
    project = _optimizer("GET", f"/api/projects/{int(project_id)}")
    data = project["data"]
    key = f"p{project_id}:{hashlib.sha1(json.dumps(data, sort_keys=True).encode()).hexdigest()[:12]}"
    if key not in _optimizer_layouts:
        result = _optimizer("POST", "/api/optimize", {
            "boundary": data.get("boundary", []), "obstacles": data.get("obstacles", []),
            "options": data.get("options") or {},
        })["result"]
        _remember_layout(key, project["name"], to_metres(result))
    return key, _optimizer_layouts[key]["name"], _optimizer_layouts[key]["layout"]


def _geojson_layout(fc: dict, name: str) -> tuple[str, str, dict]:
    """The optimizer's GeoJSON export as a layout; returns (layout_id, name, layout in metres)."""
    key = "g" + hashlib.sha1(json.dumps(fc, sort_keys=True).encode()).hexdigest()[:12]
    if key not in _optimizer_layouts:
        _remember_layout(key, name, geojson_to_metres(fc))
    return key, _optimizer_layouts[key]["name"], _optimizer_layouts[key]["layout"]


@app.get("/optimizer/projects")
def optimizer_projects():
    try:
        return {"projects": _optimizer("GET", "/api/projects")["projects"], "optimizer": OPTIMIZER_URL}
    except _OptimizerError as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/optimizer/site")
async def optimizer_site(request: Request):
    """
    The site outline of a layout, in metres, so the page can show which corner is number
    1, 2, 3, 4... before the operator clicks them on the camera frame.  The layout is either a
    saved optimizer project {"project_id": 1} or the optimizer's GeoJSON export
    {"geojson": {...}, "name": "yard.geojson"}.  The reply's layout_id is what to pass next.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    loop = asyncio.get_running_loop()
    try:
        if isinstance(body.get("geojson"), dict):
            lid, name, layout = _geojson_layout(body["geojson"], str(body.get("name") or "GeoJSON")[:80])
        else:
            lid, name, layout = await loop.run_in_executor(None, _optimizer_layout, int(body["project_id"]))
    except BridgeError as e:                      # first: it is a ValueError too
        return JSONResponse({"error": str(e)}, status_code=400)
    except (ValueError, KeyError, TypeError):
        return JSONResponse({"error": "send a project_id or a geojson"}, status_code=400)
    except _OptimizerError as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    parkable =[s for s in layout["slots"] if s["type"] not in ("island", "transfer")]
    return {"layout_id": lid, "name": name, "site": layout["site"],
            "parkable_slots": len(parkable), "slots": [s["ring"] for s in parkable]}


@app.post("/occupancy/layout-from-optimizer")
async def layout_from_optimizer(request: Request):
    """
    Turn an optimizer layout into bays on this camera's frame.

        {"camera_id": "phone-1",
         "layout_id": "g1a2b3...",                       # from /optimizer/site (or "project_id": 1)
         "corners_px": [[x,y],[x,y],[x,y],[x,y]],       # clicked in the order shown for the site
         "site_corner_idx": [0,1,2,3],                   # optional: which site corners those are
         "image_size": [1280, 720], "view": "oblique"}
    """
    try:
        body = await request.json()
        corners = body["corners_px"]
    except (ValueError, KeyError, TypeError):
        return JSONResponse({"error": "corners_px is required"}, status_code=400)
    camera_id = _safe_camera_id(body.get("camera_id", "phone-1"))
    view = body.get("view", "oblique")

    try:
        lid = body.get("layout_id")
        if lid is not None:
            if lid not in _optimizer_layouts:
                return JSONResponse({"error": "that layout is no longer loaded: show the lot "
                                              "outline again (step 1)"}, status_code=400)
            name, layout = _optimizer_layouts[lid]["name"], _optimizer_layouts[lid]["layout"]
        else:
            _, name, layout = await asyncio.get_running_loop().run_in_executor(
                None, _optimizer_layout, int(body["project_id"]))
        out = layout_to_bays(layout, corners, body.get("site_corner_idx") or (0, 1, 2, 3),
                             body.get("image_size"))
        bm = _install_bays(camera_id, out["bays"], view, image_size=body.get("image_size"))
    except (BridgeError, LayoutError) as e:        # BridgeError first matters: it is a ValueError too
        return JSONResponse({"error": str(e)}, status_code=400)
    except (KeyError, TypeError, ValueError):
        return JSONResponse({"error": "send a layout_id (or project_id) and corners_px"}, status_code=400)
    except _OptimizerError as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    except Exception as e:                                   # BayMap refused the geometry
        return JSONResponse({"error": f"Invalid bay geometry: {e}"}, status_code=400)

    _calibrators[camera_id] = out["calibrator"]
    return {"ok": True, "camera_id": camera_id, "project": name, "count": len(bm.bay_ids),
            "bays": out["bays"], "skipped": out["skipped"], "warnings": out["warnings"]}


# ------------------------------------------------------------------- live test
#
# A phone posts frames to /live/frame; a worker thread runs the pipeline and keeps
# the newest numbers and picture for /live.  One model serves everything, and
# ByteTrack keeps its state on it, so the one-shot endpoints above refuse to run
# while a live feed is arriving (see _live_busy).

_live_sessions: dict[str, LiveSession] = {}
_live_lock = threading.Lock()
LIVE_LOG_DIR: Path | None = None        # None: the data folder's "logs" (survives code updates and rollbacks)
LEGACY_LOG_DIR = HERE / "live_logs"       # where earlier versions wrote; still read, so no history is lost


def _live_log_dir() -> Path:
    return LIVE_LOG_DIR or (state_store.DATA_DIR / "logs")

PLATE_EVERY_S = float(os.getenv("LIVE_PLATE_EVERY_S", "2.5"))   # between OCR attempts
PLATE_BATCH = int(os.getenv("LIVE_PLATE_BATCH", "3"))            # vehicles read per attempt
PLATE_MAX_TRIES = 6                                              # per track, then give up on it
PLATE_IMGSZ = int(os.getenv("LIVE_PLATE_IMGSZ", "1280"))
# Size the live picture is shown to the vehicle detector at.  640 misses cars in shadow (a white SUV in shade scored
# 0.16, below what the tracker needs); 960 found it at 0.54 for about 70 ms more per picture.  ANPR_LIVE_IMGSZ changes it.
LIVE_IMGSZ = int(os.getenv("ANPR_LIVE_IMGSZ", "960"))
SEG_EXTRA_VEHICLES = os.getenv("ANPR_SEG_EXTRA_VEHICLES", "1").lower() not in ("0", "false", "off")


def _live_busy() -> bool:
    return any(s.is_active() for s in _live_sessions.values())


def _live_busy_response():
    return JSONResponse(
        {"error": "a live phone feed is running; stop it (or wait 10 s) before using this "
                  "endpoint, because both share one model"},
        status_code=409,
    )


_verdict_holds: dict[str, VerdictHold] = {}              # per camera: the parking verdicts, held steady for a few seconds
FIT_ENABLED = os.getenv("ANPR_3D_FIT", "1").lower() not in ("0", "false", "off")
ACROSS_MIN_SHARE = 0.25            # a car with this share of its footprint in another bay lies over that bay
_fit_caches: dict[str, cuboid_fit.FitCache] = {}


def _car_fits(camera_id: str, tracked: list, states: dict, cal) -> dict:
    """The fitted 3D box of the car in each occupied bay ({bay_id: CarFit}); fitted once and kept while the car sits still."""
    if not FIT_ENABLED or cal.camera is None:
        return {}
    cars = [(tv.track_id, (tv.x1, tv.y1, tv.x2, tv.y2), tv.contact_shape) for tv in tracked
            if getattr(tv, "contact_shape", None) is not None]
    by_track = _fit_caches.setdefault(camera_id, cuboid_fit.FitCache()).update(cal.camera, id(cal), cars, time.time())
    out = {}
    for bid, st in states.items():
        fit = by_track.get(getattr(st, "vehicle_id", None)) if st.state != "free" else None
        if fit is not None:
            out[bid] = fit
    return out


def _fit_evidence(cal, bid: str, fit) -> dict:
    """What the fitted box says about its bay: its quality, how far it reaches past each line, the bays it lies over."""
    corners = cuboid_fit.bay_world_polygon(cal, bid) if fit is not None else None
    if corners is None:
        return {}
    rnd = lambda d: {k: round(v, 3) for k, v in d.items()}
    overlaps = cuboid_fit.bay_overlaps(cal, fit.footprint)
    across = ([_bay_label(b) for b, s in sorted(overlaps.items()) if s >= ACROSS_MIN_SHARE]
              if fit.quality == "good" else [])
    return {"fit": {"quality": fit.quality, "iou": round(fit.iou, 2), "visible": round(fit.visible_share, 2),
                    "cls": fit.cls, "ms": round(fit.ms)},
            "fit_over": rnd(cuboid_fit.edge_overshoot(corners, fit.base_world)),
            "fit_gap": rnd(cuboid_fit.edge_overshoot(corners, fit.base_world, signed=True)),
            "across": across, "fit_overlaps": overlaps}


def _bay_label(bay_id) -> str:
    return f"P{bay_id}" if str(bay_id).isdigit() else str(bay_id)


def _blocked_by_fits(fits: dict, states: dict, cal) -> dict:
    """{free bay: the bay whose car lies over it}: a car parked across two bays blocks the other one."""
    blocked = {}
    for bid, fit in fits.items():
        if fit.quality != "good":
            continue
        for other, share in cuboid_fit.bay_overlaps(cal, fit.footprint).items():
            if other != bid and share >= ACROSS_MIN_SHARE and getattr(states.get(other), "state", None) == "free":
                blocked[other] = bid
    return blocked


def _parking_evidence(st, bc, camera_ok: bool) -> dict:
    """
    What the engine knew about how this bay is parked, in the small form status.parking_verdict wants:
    whether the verdict rests on the car's silhouette, how well the bay is calibrated, the engine's own
    sentence, and the distances to the lines on the sides the camera really saw.
    """
    clearance = {}
    for side, c in ((st.bay_relation or {}).get("clearance") or {}).items():
        if c.get("source") == "measured" and c.get("seen_m") is not None:
            clearance[side] = round(float(c["seen_m"]), 3)
    margin = getattr(bc, "margin_m", None) if bc is not None else None
    wl = None
    fp = (st.bay_relation or {}).get("footprint_m")
    if fp and len(fp) == 4:                                  # near-left, near-right, far-right, far-left, in metres
        p = np.asarray(fp, dtype=np.float64)
        wl = [round(float(np.linalg.norm(p[1] - p[0])), 2), round(float(np.linalg.norm(p[3] - p[0])), 2)]
    return {
        "source": st.geometry_source,
        "camera": bool(camera_ok),
        "calibration": bc.status if bc is not None else None,
        "margin_m": None if margin is None else round(float(margin), 3),
        "reason": st.reason,
        "side": st.crossing_side,
        "crossing_m": round(float(st.line_crossing_m), 3),
        "skew_deg": None if st.skew_deg is None else round(float(st.skew_deg), 1),
        "clearance": clearance,
        "footprint_wl": wl,
    }


def _site_calibration(cal) -> dict:
    """The camera model in a few numbers, for the viewer's health strip and the operator."""
    rep = cal.report()
    good = sum(1 for b in cal.bays.values() if b.status == "good")
    return {
        "ready": cal.camera is not None,
        "method": cal.method,
        "camera": rep["camera"],
        "good_bays": good,
        "total": len(cal.bays),
        "flags": rep["flags"],
        "bays": {k: {"status": b.status, "reproj_px": round(b.reproj_px, 1),
                     "margin_m": None if b.margin_m is None else round(float(b.margin_m), 2)}
                 for k, b in cal.bays.items()},
    }


def _picture_state(raw: str, answer: dict) -> str:
    """The colour state of a bay on the visitors' picture: the same answer the page gives."""
    if answer["status"] == UNCERTAIN:
        return "uncertain"
    if answer.get("flag") == "blocked":
        return "blocked"                               # free by the camera, but a car lies across it
    if raw in ("wrong", "suspicious"):
        # amber / orange only when the page flags it too (a trusted 3D verdict), never on a box-only guess
        return raw if answer.get("flag") in ("wrong", "suspicious") else "occupied"
    return "occupied" if raw == "occluded" else raw


def _picture_marks(states: dict, answers: dict) -> dict:
    """The icon on each bay's name on the visitors' picture: ok (parked correctly), close / bad (at / over a line),
    unclear (cannot be judged or seen), taken (a car, no verdict yet).  Nothing for a free bay."""
    out = {}
    for bid, st in states.items():
        a = answers.get(bid) or {}
        status = a.get("status")
        if status == "VACANT":
            continue
        verdict = (a.get("parking") or {}).get("verdict")
        if status == "OCCUPIED" and a.get("flag") == "blocked":
            out[bid] = "close"
        elif status == "OCCUPIED" and verdict == CORRECT:
            out[bid] = "ok"
        elif status == "OCCUPIED" and verdict == OVER_LINE:
            out[bid] = "bad"
        elif status == "OCCUPIED" and verdict == CLOSE_TO_LINE:
            out[bid] = "close"
        elif status == "OCCUPIED" and verdict in (None, NOT_JUDGED):
            out[bid] = "taken"
        else:
            out[bid] = "unclear"                      # UNCERTAIN or STALE
    return out


def _box_label(parking: dict) -> str | None:
    """The short tag beside a box that is over a line: how far, and which line."""
    if (parking or {}).get("verdict") != OVER_LINE:
        return None
    if parking.get("side") == "across":
        return f"across {len(parking.get('across') or []) or 2} bays"
    m, side = parking.get("crossing_m"), parking.get("side")
    where = {"near": "front", "far": "back", "left": "left", "right": "right"}.get(side or "", "")
    return f"{round(float(m) * 100)} cm over {where}".strip() if m else None


def _clean_boxes(cal, states: dict, answers: dict, fits: dict | None = None) -> list[dict]:
    """
    The 3D box of each parked car, in picture pixels, for the visitors' picture.
    A car with a fitted box (see cuboid_fit.py) gets that box, solid when the fit is good, dashed and blue ("estimated")
    when part of the car is hidden behind another one; its colour is its verdict (green correct, amber close to a line,
    red over it), and a car that is over a line carries a tag saying how far.  A car without a usable fit that is close
    to a line or over it gets the older box built from its measured footprint.
    Nothing for a bay that is Unclear, or whose car was not seen well enough to say anything.
    """
    from contact import VEHICLE_HEIGHT_PRIOR_M
    out = []
    if cal.camera is None:
        return out
    fits = fits or {}
    for bid, st in states.items():
        a = answers.get(bid) or {}
        if a.get("status") != "OCCUPIED" or a.get("flag") == "blocked":
            continue
        parking = a.get("parking") or {}
        verdict = parking.get("verdict")
        fit = fits.get(bid)
        grade = getattr(getattr(cal, "bays", {}).get(bid), "status", None)
        if grade == "rejected" or (fit is not None and fit.quality == "partial" and grade != "good"):
            # On 27 Oct the boxes drawn on Bay-05 to Bay-07 (calibration rejected / degraded: 7-8 px of error, the lens
            # distortion at the picture's edge) sat beside their cars.  A box in the wrong place is worse than none: those
            # bays keep their outline and their "occupied, not judged" mark.
            continue
        if fit is not None and fit.quality in ("good", "partial"):
            shown = verdict if (fit.quality == "good" and verdict in JUDGED) else "estimated"
            box = {"bay": bid, "verdict": shown, "base": fit.base_px.tolist(), "roof": fit.roof_px.tolist(),
                   "faces": cuboid_fit.camera_facing_sides(fit.base_world),
                   "label": _box_label(parking) if shown == OVER_LINE else None, "estimated": fit.quality == "partial"}
            corners = cuboid_fit.bay_world_polygon(cal, bid)
            if corners is not None and parking.get("side") in ("left", "right", "near", "far"):
                box["edge"] = cuboid_fit.edge_towards(corners, fit.base_world, parking["side"])
            out.append(box)
            continue
        rel = st.bay_relation
        if verdict not in (OVER_LINE, CLOSE_TO_LINE) or not rel or not rel.get("footprint_m"):
            continue
        fp = np.asarray(rel["footprint_m"], dtype=np.float64)
        base, roof = cal.project_stall(bid, fp, 0.0), cal.project_stall(bid, fp, VEHICLE_HEIGHT_PRIOR_M)
        if base is None or roof is None or not (np.isfinite(base).all() and np.isfinite(roof).all()):
            continue
        out.append({"bay": bid, "verdict": verdict, "base": base.tolist(), "roof": roof.tolist()})
    return out


def _live_process(frame, session: LiveSession) -> dict:
    """The track path of /occupancy/check, trimmed for a one-frame-a-second feed."""
    camera_id = session.camera_id
    frame, size_fit = _fit_frame_to_layout(camera_id, frame)
    det = get_detector()
    mot = _mot_trackers.setdefault(camera_id, VehicleMOTTracker(det.model))
    t_stage = {"t0": time.perf_counter()}
    tracked = mot.track_frame(frame, conf=0.15, imgsz=LIVE_IMGSZ) or []
    t_stage["track"] = time.perf_counter()

    # Plate OCR costs seconds on this CPU, so do it only for vehicles that have no plate
    # yet, the biggest (closest) few, at most every PLATE_EVERY_S, and at the higher
    # resolution small plates need.  A track keeps the plate it was given.
    if session.read_plates and tracked and det.ocr_kind != "none":
        now = time.time()
        need = [tv for tv in tracked
                if not tv.plate and session.plate_tries.get(tv.track_id, 0) < PLATE_MAX_TRIES]
        if need and now - session.last_plate_try >= PLATE_EVERY_S:
            session.last_plate_try = now
            need.sort(key=lambda tv: (tv.x2 - tv.x1) * (tv.y2 - tv.y1), reverse=True)
            need = need[:PLATE_BATCH]
            for tv in need:
                session.plate_tries[tv.track_id] = session.plate_tries.get(tv.track_id, 0) + 1
            boxes = [(tv.x1, tv.y1, tv.x2, tv.y2, tv.confidence) for tv in need]
            joint = det.detect_joint(frame, conf=0.15, imgsz=PLATE_IMGSZ,
                                     skip_vehicle_detection=True, vehicle_boxes=boxes)
            for idx, plate_text in joint.vehicle_plates.items():
                if not plate_text or idx >= len(need):
                    continue
                text, valid = normalise_plate(plate_text)
                if valid and plausible_indian_plate(text):
                    need[idx].plate = text
                else:
                    # Garbled reads (wrong length, impossible letters) are not plates.  Keep
                    # the last one as a guess so it can be shown as such, and try again.
                    session.plate_guess[need[idx].track_id] = text
    plates = [{"track_id": tv.track_id, "plate": tv.plate, "valid": True,
               "box": (tv.x1, tv.y1, tv.x2, tv.y2)} for tv in tracked if tv.plate]
    plates += [{"track_id": tv.track_id, "plate": session.plate_guess[tv.track_id], "valid": False,
                "box": (tv.x1, tv.y1, tv.x2, tv.y2)}
               for tv in tracked if not tv.plate and tv.track_id in session.plate_guess]

    bm = _bay_maps.get(camera_id)
    if bm is None:
        # No bays drawn: the line counter still works, so just show the boxes.
        img = frame.copy()
        for tv in tracked:
            cv2.rectangle(img, (int(tv.x1), int(tv.y1)), (int(tv.x2), int(tv.y2)), (0, 200, 255), 2)
            cv2.putText(img, f"#{tv.track_id}", (int(tv.x1), max(14, int(tv.y1) - 4)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 2, cv2.LINE_AA)
        return {"tracked": tracked, "summary": {}, "bays": {}, "bay_events": [],
                "annotated": img, "annotated_clean": enhance_for_display(frame), "plates": plates}

    if size_fit == "mismatch":
        # The picture is another shape than the one the bays were drawn on (the phone changed lens or turned): laying the bays on it
        # would judge every car against the wrong ground.  Every bay is "unclear" and no bay event is made until the picture is back
        # (or the bays are drawn again).
        h, w = frame.shape[:2]
        lw, lh = _layout_sizes[camera_id]
        img = frame.copy()
        for tv in tracked:
            cv2.rectangle(img, (int(tv.x1), int(tv.y1)), (int(tv.x2), int(tv.y2)), (0, 200, 255), 2)
        return {"tracked": tracked, "summary": {}, "bays": {k: "free" for k in bm.polygons}, "bay_events": [],
                "bay_details": {k: {"state": "free", "since": None, "seen_vehicle": False} for k in bm.polygons},
                "light": "ok", "calibration": "moved",
                "move_check": {"moved": True, "resized": [int(w), int(h)], "layout": [int(lw), int(lh)]},
                "annotated": img, "annotated_clean": enhance_for_display(frame), "plates": plates}

    seg = get_segmenter()
    # A car half hidden behind another one is often missed by the tracking model (trained on close-up plate pictures)
    # but found by the segmentation model, which runs here anyway for the silhouettes: count it as a car too.
    if SEG_EXTRA_VEHICLES and getattr(seg, "available", False):
        tracked = tracked + mot.add_extra(unmatched_boxes(seg.segment(frame, camera_id), tracked, image_size=(frame.shape[1], frame.shape[0])), tracked)
    seg.attach(frame, tracked, camera_id)
    t_stage["seg"] = time.perf_counter()
    profile = _profiles.get(camera_id)
    thresholds = _thresholds.get(camera_id)
    observations = bm.observe(tracked, camera_profile=profile, thresholds=thresholds,
                              image_size=(frame.shape[1], frame.shape[0]))
    tracker = _trackers.setdefault(
        camera_id, OccupancyTracker(bm, camera_profile=profile, thresholds=thresholds))
    # Too dark for the detector to see an empty bay reliably: do not let "nothing detected" free a bay.
    light = _light_gates.setdefault(camera_id, LightGate()).update(float(frame[::8, ::8].mean()))
    calibration = _camera_moved(camera_id, frame, session)
    states = tracker.update(tracked, observations=observations, hold_free=(light == "low"))
    cal = bm.calibration((frame.shape[1], frame.shape[0]))
    # a 3D box fitted to each car (kept while it sits still): it sees each car on its own, even one half hidden behind
    # another, and which bays it lies over
    try:
        fits = _car_fits(camera_id, tracked, states, cal)
    except Exception as e:                                   # the box is an extra: never let it stop the feed
        print(f"[anpr] 3D fit failed: {type(e).__name__}: {e}")
        fits = {}
    t_stage["fit"] = time.perf_counter()
    blocked = _blocked_by_fits(fits, states, cal)
    details = {k: {"state": v.state, "since": v.since, "seen_vehicle": v.seen_vehicle,
                   "agreement": tracker.agreement(k),
                   "confidence": round(v.parking_confidence, 2) if v.state != "free" else None,
                   "parking": {**_parking_evidence(v, cal.bays.get(k), cal.camera is not None),
                               **_fit_evidence(cal, k, fits.get(k))},
                   **({"blocked_by": blocked[k]} if k in blocked else {})}
               for k, v in states.items()}
    # In the dark each bay is judged on how well it can be seen (night.py), not the whole picture on its brightness
    night_mem = _night_memory.setdefault(camera_id, night_mod.NightMemory())
    if light == "low":
        try:
            vis = night_mod.bay_visibility(frame, dict(bm._bay_points))
            for k, v in vis.items():
                if k in details:
                    details[k]["night"] = {**v, "carry": night_mem.carried_empty(k, time.time(), getattr(session, "_last_cross_t", 0.0))}
        except Exception as e:                                           # the night rule is an extra: without it the bays are just "unclear"
            print(f"[anpr] night visibility failed: {type(e).__name__}: {e}")
    # The parking verdict is worked out afresh from a noisy silhouette every frame; hold it steady so a car near a
    # threshold does not flip between "over the line" and "correct" every few seconds.
    hold, now_t = _verdict_holds.setdefault(camera_id, VerdictHold()), time.time()
    for k, d in details.items():
        held = hold.update(k, parking_verdict(d["parking"], states[k].state) if states[k].state != "free" else None, now_t)
        if held is not None:
            d["parking_final"] = held
    layout = {"size": [int(frame.shape[1]), int(frame.shape[0])],
              "bays": {k: [[round(float(x), 1), round(float(y), 1)] for x, y in pts]
                       for k, pts in bm._bay_points.items()}}
    bay_states = {k: v.state for k, v in states.items()}
    # The picture is coloured by the same answer the page gives, so an "unclear" bay (too dark, view
    # blocked, camera moved) is never painted green on the picture while the numbers say unclear.
    answers = compose_bays(details, low_light=(light == "low"), moved=(calibration == "moved"))
    if calibration != "moved":
        night_mem.update(answers, now_t)
    # A bay is coloured "wrong"/"suspicious" only when the page says so too (a trusted 3D verdict), never on a box guess.
    picture_states = {k: _picture_state(s, answers[k]) for k, s in bay_states.items()}
    clean = annotate_clean(enhance_for_display(frame), layout["bays"], picture_states, _picture_marks(bay_states, answers))
    if light != "low" and calibration != "moved":
        clean = draw_clean_boxes(clean, _clean_boxes(cal, states, answers, fits))
    if RECORD_S > 0:
        try:
            _record_frame(camera_id, frame, layout, answers, states, light, calibration, now_t)
        except Exception as e:                                       # the recording is an extra: never let it stop the feed
            print(f"[anpr] recording failed: {type(e).__name__}: {e}")
    t_stage["end"] = time.perf_counter()
    if t_stage["end"] - t_stage["t0"] > SLOW_FRAME_S:
        # where the time went, for the next time the console shows "speed 0.0 fps" (28 Oct: a frame took 11 s and nobody knew why)
        keys = ["t0", "track", "seg", "fit", "end"]
        parts = " ".join(f"{b}={t_stage[b] - t_stage[a]:.1f}s" for a, b in zip(keys, keys[1:]))
        print(f"[anpr] slow frame {t_stage['end'] - t_stage['t0']:.1f}s ({len(tracked)} cars): {parts}, "
              f"arrivals thread {'busy' if _arrival_lock.locked() else 'idle'}")
    return {
        "tracked": tracked,
        "summary": tracker.summary(),
        "bays": bay_states,
        "bay_details": details,
        "light": light,
        "calibration": calibration,
        "move_check": _move_detectors[camera_id].report() if camera_id in _move_detectors else None,
        "bay_events": tracker.pop_events(),
        "annotated": annotate(frame, bm, states, tracked),
        # what visitors see: bay outlines only, and a dark (night) picture lifted so it can be seen
        "annotated_clean": clean,
        # the pixel space everything above is in, when it is not the phone's own (the frame was resized to the layout's size)
        **({"frame_size": [int(frame.shape[1]), int(frame.shape[0])]} if size_fit == "scaled" else {}),
        "site_calibration": _site_calibration(cal),
        "plates": plates,
        # where each bay is in the picture, for the viewer's map (pixels of this frame)
        "layout": layout,
    }


def _save_live(session: LiveSession) -> None:
    """Keep the line, the IN/OUT totals and the plate setting across a restart."""
    c = session.counter
    state_store.save_camera(session.camera_id, {
        "line": c.config() if c else None,
        "counts": {"in": c.count_in, "out": c.count_out} if c else None,
        "read_plates": session.read_plates,
    })


def _live_session(camera_id: str) -> LiveSession:
    with _live_lock:
        s = _live_sessions.get(camera_id)
        if s is None:
            s = _live_sessions[camera_id] = LiveSession(camera_id, _live_process, _live_log_dir())
            s.on_counts = lambda s=s: _save_live(s)
            s.on_event = lambda ev, img, layout, s=s: _on_live_event(s, ev, img, layout)
            s.on_minute = lambda slots, now, s=s: _on_live_minute(s, slots, now)
        return s


ASSIGN_VERSION = "3"      # bump when the way a car is given its bay (or its plate) changes: the records made under the old way name the wrong bays
                          # (3, 30 Oct: a plate is the car's only if it is on the car's outline; before, a neighbour's plate inside the box
                          # was written on the car behind it, and those records carry reads that cannot be told apart from the right ones)


def _migrate_assignment() -> None:
    """Version 2 (29 Oct) gives a car the bay holding most of its footprint on the ground; before, a car straddling two bays went to
    the smaller, farther one, so the open arrivals (and their plates) and open violations name bays the cars were not in.  Once, on the
    first start with the new rule, they end; the cars still there are written down again (see `adopt`) under their right bays."""
    marker = state_store.DATA_DIR / "assign_version"
    try:
        if marker.read_text(encoding="utf-8").strip() == ASSIGN_VERSION:
            return
    except OSError:
        pass
    now = time.time()
    for cid in list(state_store.load_cameras()):
        n_a = _arrival_book(cid).close_all(now)
        n_v = _violation_book(cid).close_all(now)
        print(f"[anpr] bay assignment v{ASSIGN_VERSION}: ended {n_a} arrival(s) and {n_v} violation(s) of '{cid}' made under the old rule")
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(ASSIGN_VERSION, encoding="utf-8")


def _restore_state() -> None:
    """After a restart: bring back each camera's bays, line, totals and plate setting."""
    for cid, st in state_store.load_cameras().items():
        try:
            if st.get("bays"):
                _install_bays(cid, st["bays"], st.get("view", "oblique"), restoring=True, image_size=st.get("frame_size"))
            session = _live_session(cid)
            line = st.get("line")
            if line:
                session.set_line(line["p1"], line["p2"], line["in_point"], line.get("start_count", 0))
                counts = st.get("counts") or {}
                session.restore_counts(counts.get("in", 0), counts.get("out", 0))
            if "read_plates" in st:
                session.read_plates = bool(st["read_plates"])
            print(f"[anpr] restored '{cid}': {len(st.get('bays') or {})} bays, line={'yes' if line else 'no'}")
        except Exception as e:                       # one bad file must not stop the server
            print(f"[anpr] could not restore '{cid}': {e}")
    try:
        _migrate_assignment()
    except Exception as e:
        print(f"[anpr] could not close the records made under the old bay assignment: {type(e).__name__}: {e}")
    if ARRIVAL_PHOTOS:
        def reread():
            for cid in list(state_store.load_cameras()):
                try:
                    n = _reread_stored_plates(cid)
                    if n:
                        print(f"[anpr] read again {n} stored plate(s) of '{cid}' with the current reader")
                except Exception as e:
                    print(f"[anpr] could not re-read stored plates of '{cid}': {type(e).__name__}: {e}")
        threading.Thread(target=reread, daemon=True, name="plate-reread").start()


def _safe_camera_id(raw: str) -> str:
    """Camera ids end up in log file names, so keep them plain."""
    cleaned = "".join(c for c in (raw or "") if c.isalnum() or c in "-_")[:32]
    return cleaned or "phone-1"


def _key_ok(supplied: str) -> bool:
    return hmac.compare_digest(supplied.encode(), LIVE_KEY.encode())


def _accept_live_frame(raw: bytes, camera_id: str, up_ms: str = "", tick_ms: str = "", enc_ms: str = "", vis: str = "") -> JSONResponse:
    """Decode an uploaded JPEG and hand it to that camera's worker."""
    if len(raw) > MAX_LIVE_UPLOAD:
        return JSONResponse({"error": "frame too large"}, status_code=413)
    frame = _decode(raw)
    if frame is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)
    session = _live_session(_safe_camera_id(camera_id))
    try:
        session.note_upload(float(up_ms), len(raw))
    except (TypeError, ValueError):
        pass
    try:
        if tick_ms:
            session.note_phone(float(tick_ms), float(enc_ms or 0), vis == "h")
    except (TypeError, ValueError):
        pass
    session.submit(frame, raw)
    return JSONResponse({"ok": True, "counts": session.snapshot().get("counts"), "frozen": session.frozen,
                         "want_still": session.want_still(time.time(), _still_every_s()),
                         "want_crops": _crops_to_ask(_safe_camera_id(camera_id), session, time.time())}, status_code=202)


_site_cache: dict = {"key": None, "value": None}


def _site_path() -> Path:
    return state_store.DATA_DIR / "site.json"


def _site() -> dict:
    """The saved site settings, re-read only when the file changes (this runs for every uploaded frame)."""
    path = _site_path()
    try:
        key = (str(path), path.stat().st_mtime_ns)
    except OSError:
        key = (str(path), None)
    if _site_cache["key"] != key:
        _site_cache["key"], _site_cache["value"] = key, site_settings.load(path)
    return _site_cache["value"]


def _still_every_s() -> float:
    v = _site().get("still_every_s")
    return STILL_EVERY_S if v is None else float(v)


def _still_paths(camera_id: str) -> tuple[Path, Path]:
    d = state_store.DATA_DIR / "stills"
    return d / f"{camera_id}.jpg", d / f"{camera_id}.json"


def _read_still_meta(camera_id: str) -> dict | None:
    jpg, meta = _still_paths(camera_id)
    if not jpg.exists() or not meta.exists():
        return None
    try:
        m = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    m["age_s"] = round(max(0.0, time.time() - float(m.get("t", 0))), 1)
    return m


@app.post("/live/still")
async def live_still(image: UploadFile = File(...), camera_id: str = Form("phone-1"), key: str = Form("")):
    """
    The phone's full-resolution photo, sent when its last reply asked for one.  Kept as it came (never
    re-encoded) for the bay editor, evidence pictures and plate trials; only the latest per camera is kept.
    """
    if not _key_ok(key):
        return JSONResponse({"error": "bad camera key"}, status_code=403)
    raw = await image.read(MAX_STILL_UPLOAD + 1)
    if len(raw) > MAX_STILL_UPLOAD:
        return JSONResponse({"error": "photo too large"}, status_code=413)
    img = _decode(raw)
    if img is None:
        return JSONResponse({"error": "could not decode image"}, status_code=400)
    h, w = img.shape[:2]
    if w < 640 or h < 360:
        return JSONResponse({"error": "photo too small"}, status_code=400)
    cid = _safe_camera_id(camera_id)
    jpg, meta = _still_paths(cid)
    jpg.parent.mkdir(parents=True, exist_ok=True)
    now = time.time()
    for path, data in ((jpg, raw), (meta, json.dumps({"t": now, "w": w, "h": h, "bytes": len(raw)}).encode())):
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)
    session = _live_sessions.get(cid)
    if session is not None:
        session.got_still(now)
    try:
        _attach_hq_evidence(cid, img, now)
    except Exception:
        pass                                             # a missing evidence picture must not fail the upload
    try:
        _kick_arrival_photos(cid, now)
    except Exception:
        pass
    return JSONResponse({"ok": True, "w": w, "h": h}, status_code=201)


MAX_CROP_UPLOAD = 1_500_000


@app.post("/live/crop")
async def live_crop(image: UploadFile = File(...), camera_id: str = Form("phone-1"), key: str = Form(""),
                    arrival_id: str = Form(""), rect: str = Form(""), photo_size: str = Form("")):
    """
    A close-up of one parked car, cut by the phone from its full-resolution photo and sent on its own (tens of KB instead of the
    2-4 MB photo, which on a weak uplink held back the live pictures for ten seconds and more).  `rect` is "x0,y0,x1,y1" of the
    cut in the photo, `photo_size` "w,h" of the photo: with the arrival's box in the live picture they say where the car is in
    the cut.  The plate is looked for and read on a thread of its own.
    """
    if not _key_ok(key):
        return JSONResponse({"error": "bad camera key"}, status_code=403)
    cid = _safe_camera_id(camera_id)
    if not arrivals.safe_id(arrival_id):
        return JSONResponse({"error": "no such arrival"}, status_code=404)
    raw = await image.read(MAX_CROP_UPLOAD + 1)
    if len(raw) > MAX_CROP_UPLOAD:
        return JSONResponse({"error": "picture too large"}, status_code=413)
    book = _arrival_book(cid)
    rec = book.get(arrival_id)
    if rec is None or not rec.get("box"):
        return JSONResponse({"error": "no such arrival"}, status_code=404)
    car = _decode(raw)
    if car is None or min(car.shape[:2]) < 40:
        return JSONResponse({"error": "could not decode image"}, status_code=400)
    try:
        x0, y0, x1, y1 = (float(v) for v in rect.split(","))
        pw, ph = (float(v) for v in photo_size.split(","))
        if not (pw > 0 and ph > 0 and x1 > x0 and y1 > y0):
            raise ValueError
    except ValueError:
        return JSONResponse({"error": "send rect (x0,y0,x1,y1) and photo_size (w,h)"}, status_code=400)
    bx1, by1, bx2, by2 = aoi_tools.live_to_still(rec["box"], rec["frame_size"], (pw, ph))
    sx, sy = car.shape[1] / (x1 - x0), car.shape[0] / (y1 - y0)                 # the cut as received v as announced (normally 1)
    inner = ((bx1 - x0) * sx, (by1 - y0) * sy, (bx2 - x0) * sx, (by2 - y0) * sy)
    outline = None
    if rec.get("outline"):
        outline = [[(x - x0) * sx, (y - y0) * sy] for x, y in aoi_tools.live_points_to_still(rec["outline"], rec["frame_size"], (pw, ph))]
    now = time.time()
    _last_crop_at[cid] = now
    _crop_asked[arrival_id] = now
    threading.Thread(target=_process_crop, args=(cid, arrival_id, car, inner, outline), daemon=True, name=f"crop-{cid}").start()
    return JSONResponse({"ok": True}, status_code=201)


def _process_crop(camera_id: str, arrival_id: str, car, inner, outline=None) -> None:
    if not _arrival_lock.acquire(timeout=120):
        return
    try:
        book = _arrival_book(camera_id)
        rec = book.get(arrival_id)
        if rec is None:
            return
        try:
            _arrival_car(camera_id, book, rec, car, inner, outline)
        except Exception as e:
            book.update(arrival_id, photo=True, plate_state="error", error=f"{type(e).__name__}: {e}"[:160])
    finally:
        _arrival_lock.release()


@app.get("/console/api/site")
def console_site():
    """The site settings the console edits, with every camera the console knows (so a new camera can be named)."""
    s = _site()
    known = sorted(set(state_store.load_cameras()) | set(_live_sessions) | set(s["cameras"]))
    cams = [{"id": cid, "name": (s["cameras"].get(cid) or {}).get("name", ""), "zone": (s["cameras"].get(cid) or {}).get("zone", ""),
             "overstay_h": (s["cameras"].get(cid) or {}).get("overstay_h", 0)} for cid in known]
    return JSONResponse({"site_name": s["site_name"], "still_every_s": s["still_every_s"], "still_default_s": STILL_EVERY_S,
                         "timezone": str(reports.site_tz()), "cameras": cams, "retention": {"log_days": LOG_RETENTION_DAYS, "evidence_days": EVIDENCE_DAYS}},
                        headers={"Cache-Control": "no-store"})


@app.post("/console/api/site")
async def console_site_update(request: Request):
    """Change the site name, camera names and zones, overstay limits or the photo interval.  Anything invalid is refused whole."""
    try:
        clean = site_settings.validate(await request.json())
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception:
        return JSONResponse({"error": "send the settings as JSON"}, status_code=400)
    site_settings.save(_site_path(), clean)
    return console_site()


@app.get("/console/api/bay-sizes")
def console_bay_sizes(camera_id: str = "phone-1"):
    """The stall size each bay is judged against, and whether somebody measured it (admin only)."""
    cid = _safe_camera_id(camera_id)
    bm = _bay_maps.get(cid)
    if bm is None:
        return JSONResponse({"error": "no bays for this camera"}, status_code=404)
    mine = _stored_bay_sizes(cid, bm.polygons)
    return JSONResponse({"camera_id": cid, "default": [contact_mod.STALL_WIDTH_M, contact_mod.STALL_LENGTH_M],
                         "ranges": {"width_m": list(BAY_WIDTH_RANGE_M), "length_m": list(BAY_LENGTH_RANGE_M)},
                         "bays": {b: {"width_m": mine.get(b, (contact_mod.STALL_WIDTH_M, contact_mod.STALL_LENGTH_M))[0],
                                      "length_m": mine.get(b, (contact_mod.STALL_WIDTH_M, contact_mod.STALL_LENGTH_M))[1],
                                      "measured": b in mine} for b in bm.polygons}},
                        headers={"Cache-Control": "no-store"})


@app.post("/console/api/bay-sizes")
async def console_bay_sizes_set(request: Request, camera_id: str = "phone-1"):
    """Say what the stalls really measure: {"sizes": {"Bay-01": [2.4, 4.8], "Bay-02": null}} (null = back to the default).  The bays
    stay where they are drawn; only the metres change, so the calibration is fitted again and every distance with it."""
    cid = _safe_camera_id(camera_id)
    bm = _bay_maps.get(cid)
    if bm is None:
        return JSONResponse({"error": "no bays for this camera"}, status_code=404)
    try:
        body = await request.json()
        wanted = body["sizes"]
        if not isinstance(wanted, dict):
            raise TypeError
    except Exception:
        return JSONResponse({"error": 'send {"sizes": {"Bay-01": [width_m, length_m]}}'}, status_code=400)
    sizes = {b: [w, length] for b, (w, length) in _stored_bay_sizes(cid, bm.polygons).items()}
    for bid, v in wanted.items():
        if bid not in bm.polygons:
            return JSONResponse({"error": f"no bay '{str(bid)[:20]}'"}, status_code=400)
        if v is None:
            sizes.pop(bid, None)
            continue
        try:
            w, length = float(v[0]), float(v[1])
        except (TypeError, ValueError, IndexError):
            return JSONResponse({"error": f"{bid}: send [width_m, length_m]"}, status_code=400)
        if not (BAY_WIDTH_RANGE_M[0] <= w <= BAY_WIDTH_RANGE_M[1] and BAY_LENGTH_RANGE_M[0] <= length <= BAY_LENGTH_RANGE_M[1]):
            return JSONResponse({"error": f"{bid}: a stall is {BAY_WIDTH_RANGE_M[0]}-{BAY_WIDTH_RANGE_M[1]} m wide and "
                                          f"{BAY_LENGTH_RANGE_M[0]}-{BAY_LENGTH_RANGE_M[1]} m long"}, status_code=400)
        sizes[bid] = [round(w, 2), round(length, 2)]
    state_store.save_camera(cid, {"bay_sizes": sizes})
    saved = state_store.load_camera(cid)
    # the same bays at the same places: only the metres are new, so the records of open cars and violations stay as they are
    _install_bays(cid, bm._bay_points, bm.view, restoring=True, image_size=saved.get("frame_size"))
    _fit_caches.pop(cid, None)
    _verdict_holds.pop(cid, None)
    return console_bay_sizes(cid)


# ---------------------------------------------------------------- the measuring stick: record, label, score (admin only)

@app.get("/label", response_class=HTMLResponse)
def label_page():
    page = HERE / "static" / "label.html"
    return page.read_text(encoding="utf-8") if page.exists() else "<h1>static/label.html is missing.</h1>"


@app.get("/console/api/record/status")
def console_record_status(camera_id: str = "phone-1"):
    cid = _safe_camera_id(camera_id)
    r = _recorder()
    return JSONResponse({"camera_id": cid, "on": r.enabled, "every_s": r.interval_s, "size_mb": r.size_mb(), "max_mb": r.max_mb,
                         "max_days": r.max_days, "days": r.days(cid),
                         "how": "set ANPR_RECORD_S (seconds between pictures; 1 for a dense hour, 30 for a day) in /etc/parkfnb-anpr.env and restart"},
                        headers={"Cache-Control": "no-store"})


@app.get("/console/api/record/frames")
def console_record_frames(camera_id: str = "phone-1", day: str = ""):
    cid = _safe_camera_id(camera_id)
    if not record_mod.safe_day(day):
        return JSONResponse({"error": "day must look like 20261029"}, status_code=400)
    labels = {}
    for lab in _recorder().labels(cid):
        if lab["day"] == day:
            labels.setdefault(lab["file"], {})[lab["bay"]] = {k: lab[k] for k in ("state", "verdict", "side")}
    return JSONResponse({"camera_id": cid, "day": day, "frames": _recorder().frames(cid, day), "labels": labels},
                        headers={"Cache-Control": "no-store"})


@app.get("/console/api/record/frame/{day}/{name}")
def console_record_picture(day: str, name: str, camera_id: str = "phone-1"):
    p = _recorder().jpg(_safe_camera_id(camera_id), day, name)
    if p is None:
        return JSONResponse({"error": "no such picture"}, status_code=404)
    return Response(p.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


@app.post("/console/api/record/label")
async def console_record_label(request: Request, camera_id: str = "phone-1"):
    """One person's answer for one bay in one recorded picture: {"day", "file", "bay", "state": VACANT|OCCUPIED|SKIP, "verdict"?, "side"?}."""
    cid = _safe_camera_id(camera_id)
    try:
        b = await request.json()
        lab = _recorder().add_label(cid, str(b["day"]), str(b["file"]), str(b["bay"]), str(b["state"]),
                                    b.get("verdict") or None, b.get("side") or None, _session_user(request) or "this machine")
    except (KeyError, TypeError):
        return JSONResponse({"error": "send day, file, bay and state"}, status_code=400)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return {"ok": True, "label": lab}


@app.get("/console/api/record/truth.csv")
def console_record_truth(camera_id: str = "phone-1"):
    """The labels as the CSV tools/eval_pilot.py reads (--truth)."""
    cid = _safe_camera_id(camera_id)
    return Response(_recorder().truth_csv(cid), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{cid}-truth.csv"', "Cache-Control": "no-store"})


@app.get("/console/api/record/run.jsonl")
def console_record_run(camera_id: str = "phone-1", day: str = ""):
    """What the system answered, as the log tools/eval_pilot.py reads (--log): the deployed system scored without any replay."""
    cid = _safe_camera_id(camera_id)
    if not record_mod.safe_day(day):
        return JSONResponse({"error": "day must look like 20261029"}, status_code=400)
    text = "".join(json.dumps(x, separators=(",", ":")) + "\n" for x in _recorder().run_lines(cid, day))
    return Response(text, media_type="application/x-ndjson",
                    headers={"Content-Disposition": f'attachment; filename="{cid}-{day}-run.jsonl"', "Cache-Control": "no-store"})


@app.get("/console/api/camera-link")
def console_camera_link(camera_id: str = "phone-1"):
    """The page to open on the phone for a camera (it carries the camera key, so it is for operators only)."""
    cid = _safe_camera_id(camera_id)
    return JSONResponse({"camera_id": cid, "phone_page": f"/live/camera?camera_id={cid}&key={LIVE_KEY}"},
                        headers={"Cache-Control": "no-store"})


@app.get("/console/api/still.jpg")
def console_still(camera_id: str = "phone-1"):
    """The latest full-resolution photo (admin or this machine only: it is not on the public list)."""
    cid = _safe_camera_id(camera_id)
    meta = _read_still_meta(cid)
    if meta is None:
        return JSONResponse({"error": "no photo yet"}, status_code=404)
    jpg, _ = _still_paths(cid)
    return Response(jpg.read_bytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "no-store", "X-Still-Age": str(meta["age_s"]),
                             "X-Still-Size": f"{meta['w']}x{meta['h']}"})


# ---------------------------------------------------------------- area of interest and the plate trial

import aoi as aoi_tools                                      # noqa: E402

PLATE_TILE_PX = 1600                  # the plate trial looks at the area in tiles this wide, so a big photo stays within memory
PLATE_TRIAL_KEEP = 40                 # crops kept per camera
_plate_trial_lock = threading.Lock()


def _camera_layout(camera_id: str) -> tuple[dict, list]:
    """(the saved bays, the picture size they are drawn on) of a camera."""
    st = state_store.load_camera(camera_id)
    return st.get("bays") or {}, list(st.get("frame_size") or [1280, 720])


def _camera_aoi(camera_id: str) -> tuple[dict | None, list]:
    bays, size = _camera_layout(camera_id)
    return aoi_tools.bays_aoi(bays, size), size


@app.get("/console/api/aoi")
def console_aoi(camera_id: str = "phone-1"):
    """The area of interest of a camera: its bays and a margin, in the pixels of the layout's picture."""
    cid = _safe_camera_id(camera_id)
    box, size = _camera_aoi(cid)
    return JSONResponse({"camera_id": cid, "aoi": box, "layout_size": size}, headers={"Cache-Control": "no-store"})


def _plate_model_run(crop, imgsz: int) -> list[dict]:
    """Vehicles and plates the detector finds in one picture, at a low confidence (it is a measurement, not a verdict).
    A model of its own, kept loaded and used by one call at a time: the live feed's model is not made to be shared between threads.
    (It used to be loaded afresh for every call, a second or two of CPU and a burst of memory each time on the 2 GB server,
    right while the live frames were being processed.)"""
    import detector as D
    global _plate_yolo
    with _plate_yolo_lock:
        if _plate_yolo is None:
            from ultralytics import YOLO
            _plate_yolo = YOLO(str(D._resolve_weights()))
        r = _plate_yolo.predict(crop, conf=0.05, imgsz=imgsz, device=D.DEVICE, verbose=False)[0]
    out = []
    for b in r.boxes:
        cls_id = int(b.cls[0])
        if cls_id in (D.VEHICLE_CLS, D.PLATE_CLS):
            out.append({"cls": "plate" if cls_id == D.PLATE_CLS else "vehicle",
                        "box": [float(v) for v in b.xyxy[0].tolist()], "conf": float(b.conf[0])})
    return out


_plate_yolo = None
_plate_yolo_lock = threading.Lock()


def tiled_detect(crop, run, tile: int = PLATE_TILE_PX, overlap: float = 0.15) -> list[dict]:
    """`run(picture, imgsz)` over a wide picture in overlapping tiles; boxes come back in the picture's own pixels and the
    same object seen in two tiles is kept once (the more confident)."""
    h, w = crop.shape[:2]
    step = max(1, int(tile * (1 - overlap)))
    xs = list(range(0, max(1, w - tile) + 1, step)) or [0]
    if xs[-1] + tile < w:
        xs.append(w - tile)
    found = []
    for x in xs:
        part = crop[:, x:x + tile]
        size = int(-(-max(part.shape[:2]) // 32) * 32)
        for d in run(part, size):
            bx = d["box"]
            found.append({**d, "box": [bx[0] + x, bx[1], bx[2] + x, bx[3]]})
    keep = []
    for d in sorted(found, key=lambda d: -d["conf"]):
        if not any(k["cls"] == d["cls"] and _box_overlap(k["box"], d["box"]) > 0.5 for k in keep):
            keep.append(d)
    return keep


def _box_overlap(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


@app.post("/console/api/plate-trial")
def console_plate_trial(camera_id: str = "phone-1"):
    """
    How big are the number plates on the latest full-resolution photo?  Cuts the area of interest out of the photo at its
    own resolution, looks for plates at low confidence, and reports each one's size in pixels, the height of its letters
    and whether that is enough to read.  It reads nothing: it answers "can this camera ever read a plate?".
    """
    cid = _safe_camera_id(camera_id)
    jpg, _ = _still_paths(cid)
    meta = _read_still_meta(cid)
    if meta is None:
        return JSONResponse({"error": "no full-resolution photo yet: reload the phone's camera page, then press Take a full-resolution photo"},
                            status_code=404)
    if not _plate_trial_lock.acquire(blocking=False):
        return JSONResponse({"error": "a plate trial is already running"}, status_code=429)
    try:
        t0 = time.perf_counter()
        still = cv2.imdecode(np.frombuffer(jpg.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
        if still is None:
            return JSONResponse({"error": "the stored photo could not be read"}, status_code=500)
        h, w = still.shape[:2]
        box, layout_size = _camera_aoi(cid)
        area = aoi_tools.scale_aoi(box, layout_size, (w, h)) if box else {"x0": 0, "y0": 0, "x1": w, "y1": h}
        crop = still[area["y0"]:area["y1"], area["x0"]:area["x1"]]
        found = tiled_detect(crop, _plate_model_run, tile=PLATE_TILE_PX)
        folder = state_store.DATA_DIR / "plate_trials" / cid
        folder.mkdir(parents=True, exist_ok=True)
        stamp = int(time.time())
        plates = []
        for i, d in enumerate(sorted((d for d in found if d["cls"] == "plate"), key=lambda d: -d["conf"])[:12]):
            x0, y0, x1, y1 = d["box"]
            pad_x, pad_y = 0.15 * (x1 - x0), 0.3 * (y1 - y0)
            tile = crop[max(0, int(y0 - pad_y)):int(y1 + pad_y), max(0, int(x0 - pad_x)):int(x1 + pad_x)]
            name = f"{cid}-{stamp}-{i}"
            if tile.size:
                _save_evidence(folder / f"{name}.jpg", tile)
            plates.append({"file": name, "conf": round(d["conf"], 2),
                           "box": [int(x0) + area["x0"], int(y0) + area["y0"], int(x1) + area["x0"], int(y1) + area["y0"]],
                           **aoi_tools.plate_readability(x1 - x0, y1 - y0)})
        for old in sorted(folder.glob("*.jpg"), key=lambda p: p.stat().st_mtime)[:-PLATE_TRIAL_KEEP]:
            old.unlink(missing_ok=True)
        return JSONResponse({"camera_id": cid, "still": {"w": w, "h": h, "age_s": meta["age_s"]}, "aoi": area,
                             "crop": {"w": int(crop.shape[1]), "h": int(crop.shape[0])},
                             "vehicles": sum(1 for d in found if d["cls"] == "vehicle"), "plates": plates,
                             "readable": sum(1 for p in plates if p["verdict"] == "readable"),
                             "ms": round((time.perf_counter() - t0) * 1000)}, headers={"Cache-Control": "no-store"})
    finally:
        _plate_trial_lock.release()


@app.get("/console/api/plate-trial/{name}.jpg")
def console_plate_trial_crop(name: str, camera_id: str = "phone-1"):
    cid = _safe_camera_id(camera_id)
    if not violations.safe_id(name):
        return JSONResponse({"error": "no such picture"}, status_code=404)
    path = state_store.DATA_DIR / "plate_trials" / cid / f"{name}.jpg"
    if not path.exists():
        return JSONResponse({"error": "no such picture"}, status_code=404)
    return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


@app.get("/console/api/still-meta")
def console_still_meta(camera_id: str = "phone-1"):
    cid = _safe_camera_id(camera_id)
    return JSONResponse({"camera_id": cid, "still": _read_still_meta(cid), "every_s": STILL_EVERY_S},
                        headers={"Cache-Control": "no-store"})


@app.post("/console/api/still-request")
def console_still_request(camera_id: str = "phone-1"):
    """An operator wants a fresh full-resolution photo: the phone is asked on its next upload."""
    session = _live_sessions.get(_safe_camera_id(camera_id))
    if session is None:
        return JSONResponse({"error": "no such camera"}, status_code=404)
    session.still_requested = True
    session._still_asked_at = 0.0
    return {"ok": True}


@app.post("/live/frame")
async def live_frame(image: UploadFile = File(...), camera_id: str = Form("phone-1"),
                     key: str = Form(""), up_ms: str = Form(""), tick_ms: str = Form(""), enc_ms: str = Form(""), vis: str = Form("")):
    """The phone posts a JPEG about once a second; `up_ms` is how long its previous upload took (a measurement of its uplink), `tick_ms` the
    time since its previous picture was taken, `enc_ms` how long drawing and encoding this one took and `vis` whether the page was visible."""
    if not _key_ok(key):
        return JSONResponse({"error": "bad camera key"}, status_code=403)
    return _accept_live_frame(await image.read(MAX_LIVE_UPLOAD + 1), camera_id, up_ms, tick_ms, enc_ms, vis)


@app.post("/live/frame-raw")
async def live_frame_raw(request: Request, camera_id: str = "phone-1", key: str = ""):
    """
    For devices that cannot build a form (an ESP32-CAM): the request body is the JPEG itself,
    Content-Type image/jpeg.  The camera key goes in the X-Camera-Key header (or ?key=).
    """
    if not _key_ok(request.headers.get("x-camera-key") or key):
        return JSONResponse({"error": "bad camera key"}, status_code=403)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_LIVE_UPLOAD:
        return JSONResponse({"error": "frame too large"}, status_code=413)
    body = bytearray()
    async for chunk in request.stream():                 # never hold more than the limit
        body += chunk
        if len(body) > MAX_LIVE_UPLOAD:
            return JSONResponse({"error": "frame too large"}, status_code=413)
    return _accept_live_frame(bytes(body), camera_id)


@app.get("/live/state")
def live_state(request: Request, camera_id: str = "phone-1"):
    # Read-only and public: look a session up, never create one, so a visitor
    # cannot grow memory by asking for made-up camera ids.
    cid = _safe_camera_id(camera_id)
    session = _live_sessions.get(cid)
    snap = session.snapshot() if session else {
        "camera_id": cid, "online": False, "age_s": None, "counts": None, "line_set": False,
        "bays": {}, "bay_summary": {}, "events": [], "frames_received": 0,
        "frames_processed": 0, "error": "",
        "stream_status": "not_started", "frame_age_s": None, "fps_processed": 0.0, "frame_seq": 0,
        "light": "ok", "calibration": "ok", "slots": [], "slot_summary": summarize({}), "site_calibration": None,
    }
    # only the requester's own rights: the page shows the operator buttons to a signed-in admin or
    # to this machine, never to a visitor (the route itself is refused to them as well)
    snap["is_admin"] = not _remote(request)
    return JSONResponse(snap, headers={"Cache-Control": "no-store"})


@app.post("/live/bay-override")
async def live_bay_override(request: Request):
    """
    An operator's answer for one bay when the camera cannot tell:
        {"camera_id", "bay_id", "status": "VACANT" | "OCCUPIED", "minutes": 15}
    or {"camera_id", "bay_id", "status": "CLEAR"} to take it back.  It lasts up to 60 minutes and ends
    early when the camera's own reading of that bay changes.  Not on the public list: admin or local only.
    """
    try:
        body = await request.json()
        cid, bay_id = _safe_camera_id(str(body.get("camera_id", "phone-1"))), str(body["bay_id"])
        status = str(body.get("status", "")).upper()
    except Exception:
        return JSONResponse({"error": "send camera_id, bay_id and status"}, status_code=400)
    session = _live_sessions.get(cid)
    if session is None:
        return JSONResponse({"error": "no such camera"}, status_code=404)
    if status in ("CLEAR", "CLEARED", ""):
        return {"ok": True, "cleared": session.clear_override(bay_id)}
    if status not in ("VACANT", "OCCUPIED"):
        return JSONResponse({"error": "status must be VACANT, OCCUPIED or CLEAR"}, status_code=400)
    try:
        minutes = float(body.get("minutes", 15))
    except (TypeError, ValueError):
        return JSONResponse({"error": "minutes must be a number"}, status_code=400)
    try:
        o = session.set_override(bay_id, status, minutes)
    except KeyError:
        return JSONResponse({"error": "no such bay"}, status_code=404)
    return {"ok": True, "bay_id": bay_id, "status": status, "until": o["until"]}


@app.get("/live/frame.jpg")
def live_frame_jpg(request: Request, camera_id: str = "phone-1", raw: int = 0, plates: int = 0):
    session = _live_sessions.get(_safe_camera_id(camera_id))
    if session is None:
        return JSONResponse({"error": "no frame yet"}, status_code=404)
    if raw:
        if _remote(request):
            return JSONResponse({"error": "not available on the public link"}, status_code=403)
        data, seq = session.raw_jpeg(), session.frames_done
    else:
        # ?plates=1 adds the plate text, but only for requests from this machine; anyone
        # else (tunnel or LAN) asking for it just gets the ordinary picture.
        data, seq = session.jpeg_with_seq(local=bool(plates) and not _remote(request))
    if not data:
        return JSONResponse({"error": "no frame yet"}, status_code=404)
    return Response(data, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store", "X-Frame-Seq": str(seq)})


@app.get("/live/plates")
def live_plates(camera_id: str = "phone-1"):
    """Local only (not in the tunnel's allow-list): the plates read so far on this camera."""
    session = _live_sessions.get(_safe_camera_id(camera_id))
    return {"camera_id": _safe_camera_id(camera_id),
            "read_plates": session.read_plates if session else None,
            "plates": session.plates() if session else []}


@app.post("/live/config")
async def live_config(request: Request):
    """
    Local only (the tunnel guard blocks it).  Any of:
        {"camera_id": "phone-1",
         "line": [[x,y],[x,y]], "in_point": [x,y], "start_count": 0,
         "read_plates": false}
    `in_point` is any point inside the lot, i.e. on the side a car ends up on after it
    has entered.  A car crossing toward that side counts IN, the other way OUT.
    """
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"invalid json: {e}"}, status_code=400)
    session = _live_session(_safe_camera_id(body.get("camera_id", "phone-1")))
    if "line" in body:
        try:
            (p1, p2), in_point = body["line"], body["in_point"]
            session.set_line(p1, p2, in_point, body.get("start_count"))
        except (KeyError, TypeError, ValueError) as e:
            return JSONResponse({"error": f"bad line: {e}"}, status_code=400)
    elif "start_count" in body and session.counter:
        session.reset(int(body["start_count"]))
    if "read_plates" in body:
        session.read_plates = bool(body["read_plates"])
    _save_live(session)
    return {"ok": True, "line": session.counter.config() if session.counter else None,
            "read_plates": session.read_plates}


@app.post("/live/reset")
async def live_reset(request: Request):
    """Local only: zero IN/OUT and clear recent events."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    session = _live_session(_safe_camera_id(body.get("camera_id", "phone-1")))
    session.reset()
    _save_live(session)
    return {"ok": True}


@app.get("/admin")
def admin_login(request: Request, token: str = "", next: str = ""):
    """
    The sign-in page (ID and password).  `/admin?token=...` still works while an ANPR_ADMIN_TOKEN is set (older
    links); with neither a password nor a token configured there is no sign-in at all.
    """
    if token and _token_ok(token):
        r = RedirectResponse(admin_auth.safe_next(next), status_code=303)
        r.set_cookie(ADMIN_COOKIE, ADMIN_TOKEN, httponly=True, secure=True, samesite="strict",
                     max_age=7 * 24 * 3600, path="/")
        return r
    if not ADMIN_PW_HASH:
        return JSONResponse({"error": "not available"}, status_code=403)
    if _session_user(request):
        return RedirectResponse(admin_auth.safe_next(next), status_code=303)
    page = HERE / "static" / "admin-login.html"
    return HTMLResponse(page.read_text(encoding="utf-8") if page.exists() else "<h1>static/admin-login.html is missing.</h1>")


@app.post("/admin")
async def admin_sign_in(request: Request):
    """Check the ID and password.  Always answers with a redirect back to the page (never says which part was wrong)."""
    if not ADMIN_PW_HASH:
        return JSONResponse({"error": "not available"}, status_code=403)
    try:
        form = await request.form()
        user, password, nxt = str(form.get("user", "")), str(form.get("password", "")), str(form.get("next", ""))
    except Exception:
        user, password, nxt = "", "", ""
    nxt = admin_auth.safe_next(nxt)
    back = lambda err, **q: RedirectResponse("/admin?" + urlencode({"error": err, "next": nxt, **q}), status_code=303)
    who = request.client.host if request.client else "?"
    wait = _login_throttle.wait_s(who)
    if wait:
        return back("locked", wait=max(1, round(wait / 60)))
    if len(password) > 256 or len(user) > 64 or not admin_auth.check_login(user, password, ADMIN_USER, ADMIN_PW_HASH):
        _login_throttle.failed(who)
        print(f"[anpr] failed admin sign-in from {who}")
        return back("wrong")
    _login_throttle.succeeded(who)
    print(f"[anpr] admin signed in from {who}")
    r = RedirectResponse(nxt, status_code=303)
    r.set_cookie(SESSION_COOKIE, admin_auth.make_session(ADMIN_USER, _session_key()), httponly=True, secure=True,
                 samesite="strict", max_age=admin_auth.SESSION_TTL_S, path="/")
    return r


@app.get("/admin/logout")
def admin_logout(next: str = ""):
    """Signs out.  With ?next=/live it then goes back there; without it answers {"ok": true} (as before)."""
    r = RedirectResponse(admin_auth.safe_next(next, "/live"), status_code=303) if next else JSONResponse({"ok": True})
    r.delete_cookie(ADMIN_COOKIE, path="/")
    r.delete_cookie(SESSION_COOKIE, path="/")
    return r


@app.get("/live", response_class=HTMLResponse)
def live_page():
    page = HERE / "static" / "live.html"
    return page.read_text(encoding="utf-8") if page.exists() else "<h1>static/live.html is missing.</h1>"


def _log_rows(camera_id: str, days: float, kind: str = "", newest_first: bool = True, limit=None):
    kinds = {k.strip() for k in kind.split(",") if k.strip()} or None
    days = min(max(days, 0.0), 3650.0)                 # 0 = everything
    return activity_log.read_rows([_live_log_dir(), LEGACY_LOG_DIR], _safe_camera_id(camera_id), days=days or None,
                                  kinds=kinds, newest_first=newest_first, limit=limit)


@app.get("/live/log.json")
def live_log_json(camera_id: str = "phone-1", days: float = 7, kind: str = "", limit: int = 500, offset: int = 0):
    """The activity log as JSON (newest first), for the log page.  Admin or this machine only."""
    rows = _log_rows(camera_id, days, kind)
    limit = min(max(limit, 1), 5000)
    page = rows[max(offset, 0): max(offset, 0) + limit]
    return JSONResponse({"camera_id": _safe_camera_id(camera_id), "total": len(rows), "offset": max(offset, 0), "rows": page},
                        headers={"Cache-Control": "no-store"})


@app.get("/live/log.csv")
def live_log_csv(camera_id: str = "phone-1", days: float = 7, kind: str = ""):
    """The activity log as a CSV file (oldest first, opens in Excel).  Admin or this machine only."""
    cid = _safe_camera_id(camera_id)
    body = activity_log.to_csv(_log_rows(cid, days, kind, newest_first=False))
    name = f"parkfnb-{cid}-{datetime.now():%Y%m%d-%H%M}.csv"
    return Response("﻿" + body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@app.get("/live/log", response_class=HTMLResponse)
def live_log_page():
    page = HERE / "static" / "log.html"
    return page.read_text(encoding="utf-8") if page.exists() else "<h1>static/log.html is missing.</h1>"


@app.get("/live/camera", response_class=HTMLResponse)
def live_camera_page():
    page = HERE / "static" / "live-camera.html"
    return page.read_text(encoding="utf-8") if page.exists() else "<h1>static/live-camera.html is missing.</h1>"


@app.get("/live/setup")
def live_setup():
    """Local only: where the phone link and key are (the key is never on a public route)."""
    return {"phone_page": f"/live/camera?camera_id=phone-1&key={LIVE_KEY}",
            "viewer_page": "/live", "log_dir": str(_live_log_dir())}
