"""
The owner dashboard's API: /owner/api/*.

An owner's browser (software/apps/owner-web) calls this directly, with a short-lived pass the Node backend signed for it (see
grant_auth.py).  Each route is scoped to ONE camera the pass names, and answers 404 for any other camera, so an owner can neither
read nor probe someone else's.  What was recorded before the owner got the camera is hidden: every route filters by the camera's
`since` time from the pass.

What an owner may do: look at their cameras (live bays, the picture, arrivals with plates, the vehicles register, violations with
their evidence pictures, reports, the activity log) and resolve or dismiss their own violations.  What stays with the ParkFNB operator
console: bay layouts, calibration, stall sizes, camera keys, site settings, the recorder, bulk dismissals.

The helpers live in app.py, which imports this module, so they are looked up at call time through _core() instead of imported (an
import at the top would be circular, and would also bind a name that the tests replace).  This is the start of splitting app.py into
routers (HANDOVER.md, section 5): routes move out, helpers and state stay where they are.
"""
from __future__ import annotations

import os
import threading
import time
from typing import NamedTuple

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

import activity_log
import arrivals
import grant_auth
import reports
import violations

router = APIRouter(prefix="/owner/api")

OWNER_REPORT_DAYS = 31                     # a report reads this many days of log lines inside one request; the console allows 93
OWNER_LOG_DAYS = 31
FRAME_GAP_S = 1.0                          # the picture is served to one owner for one camera at most this often
REPORT_TTL_S = 60.0                        # a report built a moment ago is served again: building one holds the live worker back
MAX_LIMIT = 300


def _core():
    """The app module (see the note at the top)."""
    import app as core
    return core


def _origins_from_env() -> list[str]:
    out = []
    for o in os.getenv("ANPR_OWNER_ORIGINS", "").split(","):
        o = o.strip().rstrip("/")
        if o and o != "*":                 # "*" is no allow-list at all
            out.append(o)
    return out


# The web addresses the owner dashboard is served from.  Empty means no browser page may call this API (fail closed).
OWNER_ORIGINS: list[str] = _origins_from_env()


# ---------------------------------------------------------------- errors and answers

class OwnerError(Exception):
    def __init__(self, status: int, message: str, headers: dict | None = None):
        super().__init__(message)
        self.status, self.message, self.headers = status, message, headers or {}


def _owner_error(_request, exc: OwnerError):
    return JSONResponse({"error": exc.message}, status_code=exc.status, headers={"Cache-Control": "no-store", **exc.headers})


def _json(body, status: int = 200) -> JSONResponse:
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def _csv(text: str, name: str) -> Response:
    return Response("﻿" + text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


# ---------------------------------------------------------------- who is asking, and which camera

class Owned(NamedTuple):
    cid: str                               # a camera id the pass names
    since: float                           # nothing recorded before this may be shown
    grant: grant_auth.Grant


def owner_grant(authorization: str | None = Header(None)) -> grant_auth.Grant:
    """The signed pass in `Authorization: Bearer <pass>`.  503 when this server has no secret to check it with, 401 for no pass or a
    bad, expired or forged one."""
    if not grant_auth.GRANT_SECRETS:
        raise OwnerError(503, "owner access is not set up on this server")
    token = ""
    if authorization and authorization[:7].lower() == "bearer ":
        token = authorization[7:].strip()
    g = grant_auth.verify_grant(token, grant_auth.GRANT_SECRETS)
    if g is None:
        raise OwnerError(401, "sign in again", {"WWW-Authenticate": "Bearer"})
    return g


def owned_camera(camera_id: str, g: grant_auth.Grant = Depends(owner_grant)) -> Owned:
    """A camera the pass names.  Any other id (made-up, someone else's, or not even a valid id) is a 404 and nothing more; the id is
    never passed through _safe_camera_id, which would turn a bad one into "phone-1"."""
    if not grant_auth.CAMERA_RE.match(camera_id or "") or camera_id not in g.cams:
        raise OwnerError(404, "no such camera")
    return Owned(camera_id, g.cams[camera_id], g)


# ---------------------------------------------------------------- the cameras

@router.get("/cameras")
def list_cameras(g: grant_auth.Grant = Depends(owner_grant)):
    """The owner's cameras with what each is sending now.  A camera this server has not heard of yet is listed as not known."""
    core = _core()
    saved = core.state_store.load_cameras()
    site_cameras = core._site().get("cameras") or {}
    out = []
    for cid in sorted(g.cams):
        row = core._camera_row(cid, saved)
        row.pop("still", None)             # the operator's full-resolution photo: not part of the owner's view
        meta = site_cameras.get(cid) or {}
        row.update(known=cid in saved or cid in core._live_sessions, name=meta.get("name") or "", zone=meta.get("zone") or "",
                   overstay_h=meta.get("overstay_h") or 0, since=g.cams[cid])
        out.append(row)
    return _json({"timezone": str(reports.site_tz()), "cameras": out})


@router.get("/cameras/{camera_id}/state")
def camera_state(o: Owned = Depends(owned_camera)):
    """The live state of one camera: the bays and their verdicts, counts, health.  No plates in it (they are in the arrivals)."""
    snap = _core()._state_snapshot(o.cid)
    snap["is_admin"] = False
    snap["since"] = o.since
    snap["timezone"] = str(reports.site_tz())
    snap["events"] = [e for e in (snap.get("events") or []) if float(e.get("t", 0) or 0) >= o.since]
    return _json(snap)


_frame_seen: dict[tuple[str, str], float] = {}
_frame_lock = threading.Lock()


def _frame_due(owner_id: str, cid: str) -> bool:
    """False when this owner was served this camera's picture less than FRAME_GAP_S ago (a second tab, or a runaway script)."""
    now = time.monotonic()
    with _frame_lock:
        if len(_frame_seen) > 1000:
            for k in [k for k, t in _frame_seen.items() if now - t > 60]:
                del _frame_seen[k]
        if now - _frame_seen.get((owner_id, cid), -1e9) < FRAME_GAP_S:
            return False
        _frame_seen[(owner_id, cid)] = now
        return True


@router.get("/cameras/{camera_id}/frame.jpg")
def camera_frame(after: int | None = Query(None), plates: int = 0, o: Owned = Depends(owned_camera)):
    """The latest picture with the bays drawn on it.  `after=<frame number>` answers 204 (nothing new) until a newer frame exists, so
    a page that polls costs almost nothing while the camera is quiet.  `plates=1` also writes the plate text on it."""
    session = _core()._live_sessions.get(o.cid)          # never _live_session(): that creates one
    if session is None:
        return _json({"error": "no frame yet"}, 404)
    data, seq = session.jpeg_with_seq(local=bool(plates))
    if not data:
        return _json({"error": "no frame yet"}, 404)
    if after is not None and seq <= after:
        return Response(status_code=204, headers={"X-Frame-Seq": str(seq), "Cache-Control": "no-store"})
    if not _frame_due(o.grant.owner_id, o.cid):
        raise OwnerError(429, "one picture a second is enough", {"Retry-After": "1", "X-Frame-Seq": str(seq)})
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store", "X-Frame-Seq": str(seq)})


# ---------------------------------------------------------------- arrivals and vehicles (with plates)

@router.get("/cameras/{camera_id}/arrivals")
def camera_arrivals(limit: int = 60, o: Owned = Depends(owned_camera)):
    core = _core()
    rows = core._arrival_book(o.cid).list(since=o.since, limit=min(max(1, limit), MAX_LIMIT))
    return _json({"camera_id": o.cid, "enabled": core.ARRIVAL_PHOTOS, "arrivals": [core._arrival_view(r, o.cid) for r in rows]})


@router.get("/cameras/{camera_id}/arrivals/{rid}.jpg")
def camera_arrival_photo(rid: str, kind: str = "car", o: Owned = Depends(owned_camera)):
    core = _core()
    if kind not in ("car", "plate") or not arrivals.safe_id(rid):
        return _json({"error": "no such picture"}, 404)
    rec = core._arrival_book(o.cid).get(rid)
    if rec is None or rec["arrived"] < o.since:
        return _json({"error": "no such picture"}, 404)
    path = core._arrival_file(o.cid, rid, kind)
    if not path.exists():
        return _json({"error": "no such picture"}, 404)
    return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


@router.get("/cameras/{camera_id}/vehicles")
def camera_vehicles(confirmed_only: int = 0, o: Owned = Depends(owned_camera)):
    """The register of vehicles by plate: visits, first and last seen, bays used, inside now."""
    rows = _core()._arrival_book(o.cid).list(since=o.since, limit=arrivals.KEEP)
    return _json({"camera_id": o.cid, "vehicles": arrivals.vehicles(rows, time.time(), confirmed_only=bool(confirmed_only))})


# ---------------------------------------------------------------- violations

def _violations_for(o: Owned, status: str, kind: str, date_from, date_to) -> list[dict]:
    core = _core()
    try:
        start, until = core._range_epoch(date_from, date_to)
    except ValueError as e:
        raise OwnerError(400, str(e))
    return core._violation_rows(o.cid, status, kind, max(start or 0.0, o.since), until, plates_since=o.since)


@router.get("/cameras/{camera_id}/violations")
def camera_violations(status: str = "", type: str = "", date_from: str | None = Query(None, alias="from"),
                      date_to: str | None = Query(None, alias="to"), o: Owned = Depends(owned_camera)):
    rows = _violations_for(o, status, type, date_from, date_to)
    mine = _core()._violation_book(o.cid).list(since=o.since)            # the counts are of the owner's own history only
    return _json({"camera_id": o.cid, "violations": rows,
                  "open_count": sum(1 for r in mine if r["status"] == "open"),
                  "going_on": sum(1 for r in mine if r["status"] == "open" and r["closed"] is None)})


@router.get("/cameras/{camera_id}/violations.csv")
def camera_violations_csv(status: str = "", type: str = "", date_from: str | None = Query(None, alias="from"),
                          date_to: str | None = Query(None, alias="to"), o: Owned = Depends(owned_camera)):
    return _csv(_core()._violations_csv(_violations_for(o, status, type, date_from, date_to)), f"{o.cid}-violations.csv")


class ViolationUpdate(BaseModel):
    status: str                            # open, resolved or dismissed
    note: str = ""


@router.post("/cameras/{camera_id}/violations/{vid}")
def camera_violation_update(vid: str, body: ViolationUpdate, o: Owned = Depends(owned_camera)):
    """Resolve, dismiss or reopen one of the owner's violations, with a note.  It is recorded as done by `owner:<id>`."""
    core = _core()
    if not violations.safe_id(vid):
        return _json({"error": "no such violation"}, 404)
    rec = core._violation_book(o.cid).get(vid)
    if rec is None or rec["opened"] < o.since:
        return _json({"error": "no such violation"}, 404)
    rec, err, code = core._handle_violation(o.cid, vid, body.status, body.note, o.grant.who)
    if err:
        return _json({"error": err}, code)
    mine = core._violation_book(o.cid).list(since=o.since)
    return _json({"ok": True, "violation": core._violation_view(rec), "open_count": sum(1 for r in mine if r["status"] == "open")})


@router.get("/cameras/{camera_id}/evidence/{vid}.jpg")
def camera_evidence(vid: str, hq: int = 0, o: Owned = Depends(owned_camera)):
    """The picture kept with a violation (the full-resolution one when it exists and `hq=1`)."""
    core = _core()
    if not violations.safe_id(vid):
        return _json({"error": "no such picture"}, 404)
    rec = core._violation_book(o.cid).get(vid)
    if rec is None or rec["opened"] < o.since:
        return _json({"error": "no such picture"}, 404)
    path = core._evidence_file(o.cid, vid, hq=bool(hq))
    if hq and not path.exists():
        path = core._evidence_file(o.cid, vid)
    if not path.exists():
        return _json({"error": "no such picture"}, 404)
    return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


# ---------------------------------------------------------------- reports

_report_gate = threading.Semaphore(1)       # one report at a time: building one reads days of log lines and holds the GIL against the live worker
_report_cache: dict[tuple, tuple[float, dict]] = {}
_report_lock = threading.Lock()


def _owner_report(o: Owned, date_from, date_to, bucket) -> dict:
    key = (o.cid, date_from or "", date_to or "", bucket or "", o.since)
    now = time.monotonic()
    with _report_lock:
        hit = _report_cache.get(key)
        if hit and now - hit[0] < REPORT_TTL_S:
            return hit[1]
    if not _report_gate.acquire(blocking=False):
        raise OwnerError(429, "another report is being built; try again in a few seconds", {"Retry-After": "5"})
    try:
        rep = _core()._build_report(o.cid, date_from, date_to, bucket, since=o.since, max_days=OWNER_REPORT_DAYS)
    except ValueError as e:
        raise OwnerError(400, str(e))
    finally:
        _report_gate.release()
    with _report_lock:
        if len(_report_cache) >= 64:
            _report_cache.pop(min(_report_cache, key=lambda k: _report_cache[k][0]))
        _report_cache[key] = (now, rep)
    return rep


@router.get("/cameras/{camera_id}/report")
def camera_report(date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
                  bucket: str = "", o: Owned = Depends(owned_camera)):
    """Occupancy over time, stays (with plates), parking quality, episodes and uptime for up to 31 days."""
    return _json(_owner_report(o, date_from, date_to, bucket))


@router.get("/cameras/{camera_id}/report.csv")
def camera_report_csv(date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
                      bucket: str = "", table: str = "occupancy", o: Owned = Depends(owned_camera)):
    if table not in reports.TABLES:
        return _json({"error": f"table must be one of {', '.join(reports.TABLES)}"}, 400)
    rep = _owner_report(o, date_from, date_to, bucket)
    return _csv(reports.table_csv(rep, table), f"{o.cid}-{table}-{rep['from']}-{rep['to']}.csv")


# ---------------------------------------------------------------- activity log

def _log_for(o: Owned, days: float, kind: str, newest_first: bool) -> list[dict]:
    days = min(max(days, 0.01), OWNER_LOG_DAYS)
    return [r for r in _core()._log_rows(o.cid, days, kind, newest_first=newest_first) if r["epoch"] >= o.since]


@router.get("/cameras/{camera_id}/log")
def camera_log(days: float = 7, kind: str = "", limit: int = 500, offset: int = 0, o: Owned = Depends(owned_camera)):
    rows = _log_for(o, days, kind, True)
    limit, offset = min(max(limit, 1), 5000), max(offset, 0)
    return _json({"camera_id": o.cid, "total": len(rows), "offset": offset, "rows": rows[offset: offset + limit]})


@router.get("/cameras/{camera_id}/log.csv")
def camera_log_csv(days: float = 7, kind: str = "", o: Owned = Depends(owned_camera)):
    return _csv(activity_log.to_csv(_log_for(o, days, kind, False)), f"parkfnb-{o.cid}-log.csv")


# ---------------------------------------------------------------- cross-origin access

class OwnerCORS:
    """CORS for /owner/api/ and nothing else.  An ASGI wrapper rather than the stock middleware on the whole app, so the console's
    own routes never get a CORS header.  Allowed origins are ANPR_OWNER_ORIGINS (read at start-up); none listed means none allowed.
    No cookies are involved (the pass travels in a header), so credentials are off.

    Added AFTER the tunnel guard in app.py, which makes it the outer layer: it answers a browser's preflight request itself,
    before the guard (which would refuse an OPTIONS from the internet) sees it."""

    def __init__(self, app):
        self.app = app
        self._built: tuple | None = None

    def _cors(self):
        key = tuple(OWNER_ORIGINS)
        if self._built is None or self._built[0] != key:
            self._built = (key, CORSMiddleware(
                self.app, allow_origins=list(key), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],
                expose_headers=["X-Frame-Seq", "Content-Disposition", "Retry-After"], allow_credentials=False, max_age=600))
        return self._built[1]

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/owner/api/") and OWNER_ORIGINS:
            await self._cors()(scope, receive, send)
        else:
            await self.app(scope, receive, send)


def install(app) -> None:
    """Mount the routes, the error answers and the CORS layer.  Call once, at the end of app.py (after the tunnel guard)."""
    app.include_router(router)
    app.add_exception_handler(OwnerError, _owner_error)
    app.add_middleware(OwnerCORS)
