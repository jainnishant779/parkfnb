"""
The owner dashboard's API (owner_api.py), as an owner's browser meets it: through the proxy, from the internet, with a signed pass.

What these tests protect: nobody without a good pass gets anything; a pass opens only the cameras it names (anything else is a 404, never
another owner's data); what was recorded before the owner got a camera stays hidden, plates included; the pass opens none of the
operator console; and the browser rules (CORS) let the owner dashboard in and nobody else.
"""
import json
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import grant_auth  # noqa: E402
import owner_api  # noqa: E402
import reports  # noqa: E402
import violations  # noqa: E402

SECRET = "owner-api-test-secret-that-is-32-plus-chars"
OID, OTHER_OID = "65a1b2c3d4e5f60718293a4c", "65a1b2c3d4e5f60718293a4d"
UID = "65a1b2c3d4e5f60718293a4b"
ORIGIN = "https://owner.example.test"
PROXY = {"X-Forwarded-For": "203.0.113.9"}               # what Caddy adds: with it a request counts as coming from the internet
CAM = "cam-a"

# A fixed day three days ago, in the lot's time zone: before 12:00 is the previous owner's time, from 12:00 the owner's own.
TZ = reports.site_tz()
DAY = (datetime.now(TZ) - timedelta(days=3)).date()


def at(h, m=0):
    return datetime(DAY.year, DAY.month, DAY.day, h, m, tzinfo=TZ).timestamp()


SINCE = at(12)
OLD_PLATE, NEW_PLATE = "KA01AB1234", "MP09BU5540"


def pass_for(cams=None, secret=SECRET, **over):
    now = int(time.time())
    claims = {"sub": UID, "oid": OID, "scope": "owner", "cams": {CAM: SINCE} if cams is None else cams,
              "iat": now, "exp": now + 900, "iss": "parkfnb-backend", "aud": "parkfnb-anpr"}
    claims.update(over)
    return grant_auth.make_grant({k: v for k, v in claims.items() if v is not None}, secret)


def auth(cams=None, **over):
    return {"Authorization": f"Bearer {pass_for(cams, **over)}", **PROXY}


def jpg(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    app_module._save_evidence(path, np.zeros((20, 30, 3), np.uint8))


@pytest.fixture
def client(monkeypatch):
    for name in ("_live_sessions", "_arrival_books", "_books"):
        monkeypatch.setattr(app_module, name, {})
    monkeypatch.setattr(grant_auth, "GRANT_SECRETS", [SECRET.encode()])
    monkeypatch.setattr(owner_api, "OWNER_ORIGINS", [ORIGIN])
    monkeypatch.setattr(owner_api, "_frame_seen", {})
    monkeypatch.setattr(owner_api, "_report_cache", {})
    return TestClient(app_module.app, client=("203.0.113.9", 40000))


@pytest.fixture
def world(client):
    """camera cam-a with a violation, an arrival, a picture and log lines from before the owner got it (the previous owner's) and
    after it (the owner's own)."""
    w = {}
    vbook, abook = app_module._violation_book(CAM), app_module._arrival_book(CAM)

    # Bays 5, 2 and 7 are far apart on purpose: the console gives a car on the line between two bays the plate from the next one,
    # and these tests are about time, not neighbours.  5 is the previous owner's, 2 the owner's, 7 a car carried over.
    # violations: 09:30 is the previous owner's, 13:00 is the owner's
    (w["v_old"], _) = vbook.open("5", violations.OVER_LINE, at(9, 30), "old", 0.3)
    (w["v_new"], _) = vbook.open("2", violations.OVER_LINE, at(13, 0), "new", 0.4)
    for v in (w["v_old"], w["v_new"]):
        jpg(app_module._evidence_file(CAM, v["id"]))

    # arrivals with plates
    w["a_old"] = abook.open("5", 3, at(9, 0), [1, 2, 3, 4], [1280, 720])
    abook.update(w["a_old"]["id"], text=OLD_PLATE, confirmed=True, reads=[{}, {}], photo=True, left=at(9, 40))
    w["a_new"] = abook.open("2", 8, at(13, 0), [1, 2, 3, 4], [1280, 720])
    abook.update(w["a_new"]["id"], text=NEW_PLATE, confirmed=True, reads=[{}, {}], photo=True)
    for a in (w["a_old"], w["a_new"]):
        jpg(app_module._arrival_file(CAM, a["id"], "car"))

    # a car that arrived under the previous owner and was still in its bay when the owner got the camera
    w["a_carry"] = abook.open("7", 6, at(11, 0), [1, 2, 3, 4], [1280, 720])
    abook.update(w["a_carry"]["id"], text="OLD1PLATE00", confirmed=True, reads=[{}, {}], left=at(13, 30))

    # the activity log
    lines = [
        {"t": at(9, 0), "type": "sample", "occupied": 3, "vacant": 1, "unclear": 0, "bays": {"5": "occupied"}, "parking": {}},
        {"t": at(9, 0), "type": "bay_occupied", "bay_id": "5"}, {"t": at(9, 30), "type": "bay_freed", "bay_id": "5"},
        {"t": at(13, 0), "type": "sample", "occupied": 2, "vacant": 2, "unclear": 0, "bays": {"2": "occupied"}, "parking": {}},
        {"t": at(13, 0), "type": "bay_occupied", "bay_id": "2"}, {"t": at(13, 40), "type": "bay_freed", "bay_id": "2"},
        {"t": at(13, 0), "type": "bay_occupied", "bay_id": "7"}, {"t": at(13, 30), "type": "bay_freed", "bay_id": "7"},
    ]
    logdir = app_module._live_log_dir()
    logdir.mkdir(parents=True, exist_ok=True)
    (logdir / f"{CAM}-{DAY:%Y%m%d}.jsonl").write_text("".join(json.dumps(x) + "\n" for x in lines), encoding="utf-8")

    # a live session with a picture, and events from both times
    s = app_module._live_session(CAM)
    s._jpeg, s._jpeg_local, s.frames_done = b"\xff\xd8PUBLIC", b"\xff\xd8WITH-PLATES", 5
    s._events.append({"t": at(9, 0), "type": "bay_occupied", "bay_id": "5"})
    s._events.append({"t": at(13, 0), "type": "bay_occupied", "bay_id": "2"})
    w["session"] = s
    return w


def ids(rows):
    return [r["id"] for r in rows]


# ---------------------------------------------------------------- who may ask

def test_no_pass_is_a_401_and_not_the_consoles_403(client):
    for path in ("/owner/api/cameras", f"/owner/api/cameras/{CAM}/state", f"/owner/api/cameras/{CAM}/violations"):
        r = client.get(path, headers=PROXY)
        assert r.status_code == 401 and "error" in r.json(), path
    assert client.post(f"/owner/api/cameras/{CAM}/violations/x", json={"status": "resolved"}, headers=PROXY).status_code == 401


@pytest.mark.parametrize("header", ["Bearer", "Bearer ", "Bearer garbage", "Basic abc", "token", ""])
def test_a_bad_authorization_header_is_a_401(client, header):
    assert client.get("/owner/api/cameras", headers={"Authorization": header, **PROXY}).status_code == 401


def test_a_forged_or_expired_pass_is_a_401(client):
    wrong_secret = {"Authorization": "Bearer " + pass_for(secret="x" * 40), **PROXY}
    assert client.get("/owner/api/cameras", headers=wrong_secret).status_code == 401
    old = int(time.time()) - 7200
    assert client.get("/owner/api/cameras", headers=auth(iat=old, exp=old + 900)).status_code == 401
    assert client.get("/owner/api/cameras", headers=auth(scope="admin")).status_code == 401


def test_a_server_with_no_secret_refuses_everything_with_a_503(client, monkeypatch):
    monkeypatch.setattr(grant_auth, "GRANT_SECRETS", [])
    r = client.get("/owner/api/cameras", headers=auth())
    assert r.status_code == 503


def test_the_pass_opens_none_of_the_operator_console(client, world):
    h = auth()
    for path in ("/console/api/cameras", f"/console/api/vehicles?camera_id={CAM}", f"/console/api/violations?camera_id={CAM}",
                 "/console/api/camera-link", "/live/plates", "/occupancy/bays", "/live/setup", "/console/api/site", "/"):
        r = client.get(path, headers=h, follow_redirects=False)
        assert r.status_code in (403, 303), (path, r.status_code)
    assert client.post("/live/bay-override", json={"camera_id": CAM, "bay_id": "1", "status": "OCCUPIED"}, headers=h).status_code == 403
    assert client.post("/live/reset", headers=h).status_code == 403


# ---------------------------------------------------------------- which cameras

def test_the_list_has_only_the_cameras_in_the_pass(client, world):
    app_module._live_session("someone-elses")                                  # exists on the server, not in this pass
    r = client.get("/owner/api/cameras", headers=auth({CAM: SINCE, "not-yet": SINCE}))
    assert r.status_code == 200
    rows = {c["id"]: c for c in r.json()["cameras"]}
    assert sorted(rows) == [CAM, "not-yet"]
    assert rows[CAM]["known"] is True and rows["not-yet"]["known"] is False
    assert rows[CAM]["since"] == SINCE and "still" not in rows[CAM]
    assert r.json()["timezone"] == str(TZ)
    assert "someone-elses" not in r.text and r.headers["cache-control"] == "no-store"


PATHS = ["state", "frame.jpg", "arrivals", "vehicles", "violations", "violations.csv", "report", "report.csv", "log", "log.csv",
         "arrivals/abc.jpg", "evidence/abc.jpg"]


@pytest.mark.parametrize("cam", ["phone-1", "someone-elses", "!!!", "x" * 40, "cam-a%2F..", "CAM-A", "cam-a "])
@pytest.mark.parametrize("tail", PATHS)
def test_any_camera_not_in_the_pass_is_a_404_for_every_route(client, world, cam, tail):
    app_module._live_session("phone-1")
    app_module._live_session("someone-elses")
    r = client.get(f"/owner/api/cameras/{cam}/{tail}", headers=auth())
    assert r.status_code == 404, (cam, tail, r.status_code)
    assert r.json() == {"error": "no such camera"} or r.status_code == 404
    assert "PUBLIC" not in r.text and NEW_PLATE not in r.text


def test_a_violation_cannot_be_changed_on_a_camera_outside_the_pass(client, world):
    app_module._violation_book("phone-1").open("Bay-01", violations.OVER_LINE, at(13), "x", 0.3)
    rid = app_module._violation_book("phone-1").list()[0]["id"]
    r = client.post(f"/owner/api/cameras/phone-1/violations/{rid}", json={"status": "resolved"}, headers=auth())
    assert r.status_code == 404
    assert app_module._violation_book("phone-1").get(rid)["status"] == "open"


# ---------------------------------------------------------------- live

def test_the_state_has_the_bays_and_only_events_since_the_owner_got_the_camera(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/state", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert body["camera_id"] == CAM and body["is_admin"] is False and body["since"] == SINCE and body["timezone"] == str(TZ)
    assert [e["t"] for e in body["events"]] == [at(13, 0)]                 # the 09:00 event is the previous owner's
    assert OLD_PLATE not in r.text and NEW_PLATE not in r.text            # plates are in the arrivals, not the state


def test_the_state_of_a_camera_that_has_sent_nothing_is_empty_not_an_error(client):
    r = client.get(f"/owner/api/cameras/{CAM}/state", headers=auth())
    assert r.status_code == 200 and r.json()["online"] is False and r.json()["stream_status"] == "not_started"
    assert CAM not in app_module._live_sessions                            # asking did not create a session


def test_the_picture_is_the_public_one_and_new_frames_only_when_asked_for(client, world):
    url = f"/owner/api/cameras/{CAM}/frame.jpg"
    r = client.get(url, headers=auth())
    assert r.status_code == 200 and r.content == b"\xff\xd8PUBLIC" and r.headers["x-frame-seq"] == "5"
    assert r.headers["content-type"] == "image/jpeg" and r.headers["cache-control"] == "no-store"
    r = client.get(url + "?after=5", headers=auth())
    assert r.status_code == 204 and r.headers["x-frame-seq"] == "5" and r.content == b""      # nothing new: no picture sent
    r = client.get(url + "?after=4&plates=1", headers=auth())
    assert r.status_code == 429                                                               # a second in a row, within the gap
    owner_api._frame_seen.clear()
    r = client.get(url + "?after=4&plates=1", headers=auth())
    assert r.status_code == 200 and r.content == b"\xff\xd8WITH-PLATES"


def test_the_picture_is_throttled_per_owner_and_camera(client, world, monkeypatch):
    url = f"/owner/api/cameras/{CAM}/frame.jpg"
    assert client.get(url, headers=auth()).status_code == 200
    r = client.get(url, headers=auth())
    assert r.status_code == 429 and r.headers["retry-after"] == "1"
    other = auth(oid=OTHER_OID)                                           # another owner of the same camera has their own allowance
    assert client.get(url, headers=other).status_code == 200
    monkeypatch.setattr(owner_api, "FRAME_GAP_S", 0.0)
    assert client.get(url, headers=auth()).status_code == 200


def test_no_picture_yet_is_a_404_and_creates_nothing(client):
    r = client.get(f"/owner/api/cameras/{CAM}/frame.jpg", headers=auth())
    assert r.status_code == 404 and CAM not in app_module._live_sessions


# ---------------------------------------------------------------- arrivals and vehicles: what was recorded before is hidden

def test_arrivals_show_the_plates_of_cars_that_came_since_and_never_the_ones_before(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/arrivals", headers=auth())
    assert r.status_code == 200
    got = {a["id"]: a for a in r.json()["arrivals"]}
    assert world["a_new"]["id"] in got and got[world["a_new"]["id"]]["text"] == NEW_PLATE
    assert world["a_old"]["id"] not in got and world["a_carry"]["id"] not in got
    assert OLD_PLATE not in r.text and "OLD1PLATE00" not in r.text


def test_arrival_pictures_follow_the_same_rule(client, world):
    ok = client.get(f"/owner/api/cameras/{CAM}/arrivals/{world['a_new']['id']}.jpg?kind=car", headers=auth())
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/jpeg" and ok.content[:2] == b"\xff\xd8"
    for rid in (world["a_old"]["id"], world["a_carry"]["id"], "nope", "..", "a..b"):
        assert client.get(f"/owner/api/cameras/{CAM}/arrivals/{rid}.jpg", headers=auth()).status_code == 404, rid
    assert client.get(f"/owner/api/cameras/{CAM}/arrivals/{world['a_new']['id']}.jpg?kind=secret", headers=auth()).status_code == 404
    assert client.get(f"/owner/api/cameras/{CAM}/arrivals/{world['a_new']['id']}.jpg?kind=plate", headers=auth()).status_code == 404   # none was taken


def test_the_vehicles_register_has_only_the_owners_own_vehicles(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/vehicles", headers=auth())
    assert r.status_code == 200
    assert [v["plate"] for v in r.json()["vehicles"]] == [NEW_PLATE]
    assert OLD_PLATE not in r.text and "OLD1PLATE00" not in r.text


# ---------------------------------------------------------------- violations

def test_violations_list_only_the_owners_own_with_their_own_counts(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/violations", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert ids(body["violations"]) == [world["v_new"]["id"]]
    assert body["open_count"] == 1 and body["going_on"] == 1               # the console would say 2: the old one is not theirs
    assert body["violations"][0]["plate"] == NEW_PLATE
    assert app_module._violation_book(CAM).open_count() == 2


def test_a_violation_does_not_get_the_plate_of_a_car_from_before(client, world):
    """A car that arrived at 11:00, under the previous owner, was in bay 7 at 13:00: its plate must not be put on a violation of the owner's."""
    app_module._violation_book(CAM).open("7", violations.OVER_LINE, at(13, 10), "carried over", 0.5)
    r = client.get(f"/owner/api/cameras/{CAM}/violations", headers=auth())
    mine = [v for v in r.json()["violations"] if v["bay"] == "7"]
    assert len(mine) == 1 and "plate" not in mine[0]
    assert "OLD1PLATE00" not in r.text
    local = TestClient(app_module.app, client=("127.0.0.1", 50000))                    # control: the operator does see that plate
    seen = [v for v in local.get(f"/console/api/violations?camera_id={CAM}").json()["violations"] if v["bay"] == "7"]
    assert seen[0]["plate"] == "OLD1PLATE00"


def test_the_date_range_cannot_reach_back_before_since(client, world):
    d = DAY.isoformat()
    r = client.get(f"/owner/api/cameras/{CAM}/violations?from={d}&to={d}", headers=auth())
    assert ids(r.json()["violations"]) == [world["v_new"]["id"]]
    r = client.get(f"/owner/api/cameras/{CAM}/violations?from=nonsense", headers=auth())
    assert r.status_code == 400
    r = client.get(f"/owner/api/cameras/{CAM}/violations?status=resolved", headers=auth())
    assert r.json()["violations"] == []


def test_the_violations_csv_has_the_owners_rows_only(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/violations.csv", headers=auth())
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"] == f'attachment; filename="{CAM}-violations.csv"'
    text = r.content.decode("utf-8-sig")
    assert text.count("\r\n") == 2 and ",P2," in text                       # a header and the one violation (bay 2)
    assert NEW_PLATE in text and OLD_PLATE not in text and "OLD1PLATE00" not in text


def test_evidence_pictures_follow_the_same_rule(client, world):
    ok = client.get(f"/owner/api/cameras/{CAM}/evidence/{world['v_new']['id']}.jpg", headers=auth())
    assert ok.status_code == 200 and ok.content[:2] == b"\xff\xd8"
    assert client.get(f"/owner/api/cameras/{CAM}/evidence/{world['v_new']['id']}.jpg?hq=1", headers=auth()).status_code == 200   # falls back
    for vid in (world["v_old"]["id"], "nope", "..", "a..b"):
        assert client.get(f"/owner/api/cameras/{CAM}/evidence/{vid}.jpg", headers=auth()).status_code == 404, vid


def test_an_owner_resolves_a_violation_and_it_is_recorded_as_theirs(client, world):
    vid = world["v_new"]["id"]
    r = client.post(f"/owner/api/cameras/{CAM}/violations/{vid}", json={"status": "resolved", "note": "spoke to the driver"}, headers=auth())
    assert r.status_code == 200 and r.json()["ok"] is True
    assert r.json()["violation"]["status"] == "resolved" and r.json()["open_count"] == 0
    rec = app_module._violation_book(CAM).get(vid)
    assert rec["handled_by"] == f"owner:{OID}" and rec["note"] == "spoke to the driver"
    log = client.get(f"/owner/api/cameras/{CAM}/log?kind=operator_violation&days=7", headers=auth())
    assert log.status_code == 200
    r = client.post(f"/owner/api/cameras/{CAM}/violations/{vid}", json={"status": "open"}, headers=auth())
    assert r.json()["violation"]["status"] == "open" and app_module._violation_book(CAM).get(vid)["handled_by"] is None


def test_the_previous_owners_violation_cannot_be_touched(client, world):
    vid = world["v_old"]["id"]
    r = client.post(f"/owner/api/cameras/{CAM}/violations/{vid}", json={"status": "dismissed"}, headers=auth())
    assert r.status_code == 404
    assert app_module._violation_book(CAM).get(vid)["status"] == "open"


@pytest.mark.parametrize("body", [{"status": "deleted"}, {"status": ""}, {"note": "no status"}, {}, {"status": 5}])
def test_a_bad_violation_update_is_refused_and_changes_nothing(client, world, body):
    vid = world["v_new"]["id"]
    r = client.post(f"/owner/api/cameras/{CAM}/violations/{vid}", json=body, headers=auth())
    assert r.status_code in (400, 422)
    assert app_module._violation_book(CAM).get(vid)["status"] == "open"


def test_owners_cannot_bulk_dismiss(client, world):
    r = client.post(f"/owner/api/cameras/{CAM}/violations-dismiss-ended", headers=auth())
    assert r.status_code in (404, 405)
    assert client.post("/console/api/violations-dismiss-ended", headers=auth()).status_code == 403


def test_what_an_owner_decides_does_not_count_as_an_accuracy_sample(client, world):
    """The console's accuracy page counts resolved as a real alarm and dismissed as a false one; an owner's choice is neither."""
    local = TestClient(app_module.app, client=("127.0.0.1", 50000))
    client.post(f"/owner/api/cameras/{CAM}/violations/{world['v_new']['id']}", json={"status": "dismissed"}, headers=auth())
    assert local.get(f"/console/api/accuracy?camera_id={CAM}").json()["violations"]["reviewed"] == 0
    local.post(f"/console/api/violations/{world['v_old']['id']}?camera_id={CAM}", json={"status": "resolved", "note": ""})
    got = local.get(f"/console/api/accuracy?camera_id={CAM}").json()["violations"]
    assert got["reviewed"] == 1 and got["real"] == 1


# ---------------------------------------------------------------- reports and the log

def test_the_report_starts_when_the_owner_got_the_camera(client, world):
    d = DAY.isoformat()
    r = client.get(f"/owner/api/cameras/{CAM}/report?from={(DAY - timedelta(days=1)).isoformat()}&to={d}", headers=auth())
    assert r.status_code == 200
    rep = r.json()
    assert rep["start"] == SINCE and rep["from"] == d                       # asked for two days; the first starts at 12:00
    labels = {(s["label"], round(s["start"])) for s in rep["stays"]}
    assert not any(t < SINCE for _, t in labels)                            # the 09:00-09:30 stay is not theirs
    assert {s["bay"] for s in rep["stays"]} == {"2", "7"} and len(rep["stays"]) == 2
    assert sum(b["samples"] for b in rep["occupancy"]) == 1                 # one sample after 12:00, one before
    assert rep["timezone"] == str(TZ)


def test_a_stay_does_not_get_the_plate_of_a_car_that_arrived_before(client, world):
    """Bay 7's 13:00-13:30 stay overlaps the car that arrived at 11:00; with no filter its plate would be put on the stay."""
    d = DAY.isoformat()
    rep = client.get(f"/owner/api/cameras/{CAM}/report?from={d}&to={d}", headers=auth()).json()
    by_bay = {s["bay"]: s for s in rep["stays"]}
    assert by_bay["2"]["plate"] == NEW_PLATE and "plate" not in by_bay["7"]
    csv = client.get(f"/owner/api/cameras/{CAM}/report.csv?from={d}&to={d}&table=stays", headers=auth()).content.decode("utf-8-sig")
    assert NEW_PLATE in csv and "OLD1PLATE00" not in csv and OLD_PLATE not in csv


def test_report_ranges_are_limited(client, world):
    before = (DAY - timedelta(days=2)).isoformat()
    r = client.get(f"/owner/api/cameras/{CAM}/report?from={before}&to={before}", headers=auth())
    assert r.status_code == 400 and "before" in r.json()["error"]            # wholly before they had the camera
    far = (DAY - timedelta(days=40)).isoformat()
    r = client.get(f"/owner/api/cameras/{CAM}/report?from={far}&to={DAY.isoformat()}", headers=auth())
    assert r.status_code == 400 and "31 days" in r.json()["error"]
    assert client.get(f"/owner/api/cameras/{CAM}/report?from=x", headers=auth()).status_code == 400
    assert client.get(f"/owner/api/cameras/{CAM}/report.csv?table=passwords", headers=auth()).status_code == 400


def test_one_report_is_built_at_a_time_and_a_repeat_is_served_from_memory(client, world, monkeypatch):
    d = DAY.isoformat()
    url = f"/owner/api/cameras/{CAM}/report?from={d}&to={d}"
    calls = []
    real = app_module._build_report
    monkeypatch.setattr(app_module, "_build_report", lambda *a, **k: calls.append(1) or real(*a, **k))
    assert client.get(url, headers=auth()).status_code == 200
    assert client.get(url, headers=auth()).status_code == 200
    assert len(calls) == 1                                                  # the second came from memory
    owner_api._report_cache.clear()
    assert owner_api._report_gate.acquire(blocking=False)                   # someone else's report is being built
    try:
        r = client.get(url, headers=auth())
        assert r.status_code == 429 and r.headers["retry-after"] == "5"
    finally:
        owner_api._report_gate.release()
    assert client.get(url, headers=auth()).status_code == 200               # and the gate is free again


def test_the_activity_log_has_only_rows_since_and_is_limited_to_31_days(client, world):
    r = client.get(f"/owner/api/cameras/{CAM}/log?days=7", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 5 and all(x["epoch"] >= SINCE for x in body["rows"])
    assert [x["epoch"] for x in body["rows"]] == sorted((x["epoch"] for x in body["rows"]), reverse=True)
    page = client.get(f"/owner/api/cameras/{CAM}/log?days=7&limit=2&offset=1", headers=auth()).json()
    assert len(page["rows"]) == 2 and page["offset"] == 1 and page["total"] == 5
    assert client.get(f"/owner/api/cameras/{CAM}/log?days=999999", headers=auth()).status_code == 200      # clamped, not refused
    csv = client.get(f"/owner/api/cameras/{CAM}/log.csv?days=7", headers=auth())
    assert csv.status_code == 200 and csv.content.decode("utf-8-sig").count("\n") == 6                   # a header and five rows


# ---------------------------------------------------------------- the browser rules (CORS)

def preflight(client, path, origin, method="GET"):
    return client.options(path, headers={"Origin": origin, "Access-Control-Request-Method": method,
                                         "Access-Control-Request-Headers": "authorization,content-type", **PROXY})


def test_the_owner_dashboard_may_call_the_api_from_its_own_origin(client, world):
    r = preflight(client, f"/owner/api/cameras/{CAM}/state", ORIGIN)
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == ORIGIN
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in r.headers
    r = preflight(client, f"/owner/api/cameras/{CAM}/violations/x", ORIGIN, "POST")
    assert r.status_code == 200 and "POST" in r.headers["access-control-allow-methods"]
    r = client.get(f"/owner/api/cameras/{CAM}/frame.jpg", headers={"Origin": ORIGIN, **auth()})
    assert r.headers["access-control-allow-origin"] == ORIGIN
    assert "x-frame-seq" in r.headers["access-control-expose-headers"].lower()


def test_errors_carry_the_cors_header_too_so_the_page_can_read_them(client):
    r = client.get("/owner/api/cameras", headers={"Origin": ORIGIN, **PROXY})
    assert r.status_code == 401 and r.headers["access-control-allow-origin"] == ORIGIN


def test_no_other_website_may_call_the_api(client, world):
    r = preflight(client, f"/owner/api/cameras/{CAM}/state", "https://evil.example")
    assert "access-control-allow-origin" not in r.headers
    r = client.get(f"/owner/api/cameras/{CAM}/state", headers={"Origin": "https://evil.example", **auth()})
    assert "access-control-allow-origin" not in r.headers                    # the browser then refuses to show the page the answer


def test_the_consoles_own_routes_get_no_cors_and_a_preflight_to_them_is_refused(client, world):
    r = preflight(client, "/console/api/cameras", ORIGIN)
    assert r.status_code == 403 and "access-control-allow-origin" not in r.headers
    r = client.get("/live/state", headers={"Origin": ORIGIN, **PROXY})
    assert "access-control-allow-origin" not in r.headers


def test_with_no_origins_listed_no_browser_page_may_call_the_api(client, monkeypatch):
    monkeypatch.setattr(owner_api, "OWNER_ORIGINS", [])
    r = preflight(client, "/owner/api/cameras", ORIGIN)
    assert r.status_code == 403 and "access-control-allow-origin" not in r.headers
    r = client.get("/owner/api/cameras", headers={"Origin": ORIGIN, **auth()})
    assert "access-control-allow-origin" not in r.headers


def test_a_wildcard_origin_is_not_accepted(monkeypatch):
    monkeypatch.setenv("ANPR_OWNER_ORIGINS", "*, https://owner.example.test/ ,")
    assert owner_api._origins_from_env() == ["https://owner.example.test"]


# ---------------------------------------------------------------- the rest of the app is as it was

def test_the_consoles_own_routes_still_answer_an_operator_on_this_machine(client, world):
    local = TestClient(app_module.app, client=("127.0.0.1", 50000))
    assert {c["id"] for c in local.get("/console/api/cameras").json()["cameras"]} >= {CAM}
    assert len(local.get(f"/console/api/violations?camera_id={CAM}").json()["violations"]) == 2          # the operator sees both
    assert local.get("/live/state").status_code == 200


def test_the_owner_routes_do_not_use_the_threads_of_the_live_worker_to_block(client, world):
    """Smoke: a burst of owner requests while a report holds the gate is answered (429), not hung."""
    assert owner_api._report_gate.acquire(blocking=False)
    out = []
    try:
        t = threading.Thread(target=lambda: out.append(client.get(f"/owner/api/cameras/{CAM}/report", headers=auth()).status_code))
        t.start()
        t.join(5)
    finally:
        owner_api._report_gate.release()
    assert out == [429]
