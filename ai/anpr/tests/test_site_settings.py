"""The site's settings: validated whole, merged per camera, saved atomically, and applied by the app."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import site_settings as S  # noqa: E402


# ---- validation

def test_a_good_body_is_cleaned_and_spaces_are_tidied():
    got = S.validate({"site_name": "  Indore   Pilot ", "still_every_s": "120",
                      "cameras": {"phone-1": {"name": " Front  row", "zone": "A", "overstay_h": "4"}}})
    assert got == {"site_name": "Indore Pilot", "still_every_s": 120.0,
                   "cameras": {"phone-1": {"name": "Front row", "zone": "A", "overstay_h": 4.0}}}


@pytest.mark.parametrize("body,why", [
    ([], "object"), ({"nope": 1}, "unknown setting"), ({"site_name": "  "}, "empty"), ({"site_name": "x" * 61}, "longer"),
    ({"still_every_s": 5}, "between 30 and 3600"), ({"still_every_s": "soon"}, "number"), ({"still_every_s": 99999}, "between 30"),
    ({"cameras": []}, "object"), ({"cameras": {"../x": {}}}, "not a valid camera id"), ({"cameras": {"a b": {}}}, "not a valid camera id"),
    ({"cameras": {"c": []}}, "must be an object"), ({"cameras": {"c": {"colour": "red"}}}, "unknown camera setting"),
    ({"cameras": {"c": {"overstay_h": 100}}}, "0 (off) to 72"), ({"cameras": {"c": {"overstay_h": -1}}}, "0 (off) to 72"),
    ({"cameras": {"c": {"overstay_h": "long"}}}, "number of hours"), ({"cameras": {"c": {"name": "n" * 41}}}, "longer"),
    ({"cameras": {f"c{i}": {} for i in range(51)}}, "at most"),
])
def test_anything_wrong_is_refused_with_a_reason(body, why):
    with pytest.raises(ValueError, match=why.replace("(", r"\(").replace(")", r"\)")):
        S.validate(body)


def test_zero_and_blank_mean_off_and_default():
    assert S.validate({"still_every_s": 0})["still_every_s"] == 0.0               # off
    assert S.validate({"still_every_s": ""})["still_every_s"] is None             # the server's default
    assert S.validate({"cameras": {"c": {}}})["cameras"]["c"]["overstay_h"] == 0.0


# ---- storage

def test_the_defaults_come_back_for_a_missing_or_damaged_file(tmp_path):
    assert S.load(tmp_path / "none.json") == S.DEFAULTS
    p = tmp_path / "site.json"
    p.write_text("{oops", encoding="utf-8")
    assert S.load(p)["site_name"] == S.DEFAULTS["site_name"]
    p.write_text("[1, 2]", encoding="utf-8")
    assert S.load(p) == S.DEFAULTS


def test_saving_merges_cameras_one_by_one_and_leaves_no_temp_file(tmp_path):
    p = tmp_path / "d" / "site.json"
    S.save(p, {"site_name": "A", "cameras": {"c1": {"name": "One", "zone": "", "overstay_h": 2.0}}})
    got = S.save(p, {"cameras": {"c2": {"name": "Two", "zone": "B", "overstay_h": 0.0}}})
    assert got["site_name"] == "A" and sorted(got["cameras"]) == ["c1", "c2"] and got["cameras"]["c1"]["overstay_h"] == 2.0
    assert json.loads(p.read_text(encoding="utf-8")) == got and not list(p.parent.glob("*.tmp"))
    assert S.DEFAULTS["cameras"] == {}                                             # the defaults themselves are never edited


# ---- through the app

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "STILL_EVERY_S", 120.0)
    app_module._site_cache["key"] = None
    return TestClient(app_module.app, client=("127.0.0.1", 50000))


def test_the_settings_round_trip_and_unknown_cameras_are_listed_so_they_can_be_named(client):
    first = client.get("/console/api/site").json()
    assert first["site_name"] == S.DEFAULTS["site_name"] and first["still_default_s"] == 120.0 and first["still_every_s"] is None
    r = client.post("/console/api/site", json={"site_name": "Indore Pilot", "cameras": {"gate-1": {"name": "Gate", "zone": "Entry", "overstay_h": 3}}})
    assert r.status_code == 200
    got = client.get("/console/api/site").json()
    assert got["site_name"] == "Indore Pilot"
    assert {"id": "gate-1", "name": "Gate", "zone": "Entry", "overstay_h": 3.0} in got["cameras"]


def test_a_bad_body_changes_nothing(client):
    client.post("/console/api/site", json={"site_name": "Keep me"})
    assert client.post("/console/api/site", json={"site_name": "New", "cameras": {"c": {"overstay_h": 999}}}).status_code == 400
    assert client.post("/console/api/site", content=b"not json").status_code == 400
    assert client.get("/console/api/site").json()["site_name"] == "Keep me"          # refused whole, not half applied


def test_the_photo_interval_setting_reaches_the_phones_reply(client, monkeypatch):
    monkeypatch.setattr(app_module, "_live_process", lambda f, s: {"tracked": [], "summary": {}, "bays": {}, "bay_events": [],
                                                                    "annotated": f, "annotated_clean": f, "plates": []})
    import cv2, numpy as np
    ok, buf = cv2.imencode(".jpg", np.full((360, 640, 3), 90, np.uint8))
    post = lambda: client.post("/live/frame", files={"image": ("f.jpg", buf.tobytes(), "image/jpeg")},
                               data={"camera_id": "phone-1", "key": app_module.LIVE_KEY}).json()["want_still"]
    client.post("/console/api/site", json={"still_every_s": 0})
    assert post() is False                                                           # off: no periodic photo
    client.post("/console/api/site", json={"still_every_s": 60})
    app_module._live_sessions["phone-1"]._still_asked_at = 0.0
    assert post() is True
    assert app_module._still_every_s() == 60.0
    client.post("/console/api/site", json={"still_every_s": ""})
    assert app_module._still_every_s() == 120.0                                      # back to the server's default (set above)
    for s in app_module._live_sessions.values():
        s.stop()


def test_the_camera_link_is_for_operators_only(client):
    assert "key=" in client.get("/console/api/camera-link?camera_id=gate-1").json()["phone_page"]
    visitor = TestClient(app_module.app, client=("203.0.113.9", 40000))
    for path in ("/console/api/camera-link", "/console/api/site"):
        assert visitor.get(path, headers={"X-Forwarded-For": "203.0.113.9"}).status_code == 403
    assert visitor.post("/console/api/site", json={"site_name": "x"}, headers={"X-Forwarded-For": "203.0.113.9"}).status_code == 403
