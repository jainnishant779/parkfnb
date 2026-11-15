"""
Admin sign-in for a server the operator is not sitting at: a long random token, over HTTPS, gives an
HttpOnly cookie, and a signed-in admin is treated like a local user.  Everyone else stays remote.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402

TOKEN = "k3m9r7hp2xw5cz8abtv4n6fdsj"            # 26 chars
COOKIE = {"Cookie": f"parkfnb_admin={TOKEN}"}
PROXY = {"X-Forwarded-For": "203.0.113.9"}        # what Caddy adds to every visitor's request


@pytest.fixture
def web(monkeypatch):
    """A visitor reaching the server through the reverse proxy (not from this machine)."""
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", TOKEN)
    monkeypatch.setattr(app_module, "_live_sessions", {})
    monkeypatch.setattr(app_module, "_bay_maps", {})
    monkeypatch.setattr(app_module, "_trackers", {})
    return TestClient(app_module.app, client=("203.0.113.9", 40000), follow_redirects=False)


def test_without_signing_in_a_visitor_gets_only_the_public_routes(web):
    assert web.get("/live/setup", headers=PROXY).status_code == 403
    assert web.get("/occupancy", headers=PROXY).status_code == 403
    assert web.post("/live/config", json={}, headers=PROXY).status_code == 403
    assert web.get("/live/state", headers=PROXY).status_code == 200


def test_the_right_token_sets_a_locked_down_cookie_and_opens_the_bay_tool(web):
    r = web.get(f"/admin?token={TOKEN}", headers=PROXY)
    assert r.status_code == 303 and r.headers["location"] == "/"                   # the console, the operator's home
    cookie = r.headers["set-cookie"].lower()
    assert f"parkfnb_admin={TOKEN}".lower() in cookie
    assert "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie


def test_a_wrong_or_missing_token_gives_nothing(web):
    for q in ("", "?token=", "?token=wrong", f"?token={TOKEN[:-1]}", f"?token={TOKEN}x"):
        r = web.get("/admin" + q, headers=PROXY)
        assert r.status_code == 403 and "set-cookie" not in r.headers, q


def test_a_signed_in_admin_can_use_the_private_routes_from_anywhere(web):
    assert web.get("/live/setup", headers={**PROXY, **COOKIE}).status_code == 200
    assert web.get("/occupancy", headers={**PROXY, **COOKIE}).status_code == 200
    r = web.post("/live/config", json={"camera_id": "x", "line": [[0, 150], [320, 150]], "in_point": [160, 40]},
                 headers={**PROXY, **COOKIE})
    assert r.status_code == 200


def test_a_wrong_cookie_is_still_a_visitor(web):
    bad = {"Cookie": "parkfnb_admin=" + "z" * 26}
    assert web.get("/live/setup", headers={**PROXY, **bad}).status_code == 403


def test_logout_clears_the_cookie(web):
    r = web.get("/admin/logout", headers=PROXY)
    assert r.status_code == 200 and "parkfnb_admin" in r.headers["set-cookie"]
    assert 'max-age=0' in r.headers["set-cookie"].lower() or "expires" in r.headers["set-cookie"].lower()


def test_with_no_token_configured_admin_login_does_not_exist(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", "")
    c = TestClient(app_module.app, client=("203.0.113.9", 40000), follow_redirects=False)
    assert c.get("/admin?token=", headers=PROXY).status_code == 403
    assert c.get("/admin?token=anything", headers=PROXY).status_code == 403
    assert c.get("/live/setup", headers={**PROXY, "Cookie": "parkfnb_admin="}).status_code == 403


def test_the_key_is_shown_to_an_admin_only(web):
    assert app_module.LIVE_KEY in web.get("/live/setup", headers={**PROXY, **COOKIE}).text
    assert app_module.LIVE_KEY not in web.get("/live/setup", headers=PROXY).text


def test_the_admin_routes_are_the_only_new_public_ones():
    from live import is_public_allowed
    assert is_public_allowed("GET", "/admin") and is_public_allowed("GET", "/admin/logout")
    assert is_public_allowed("POST", "/admin")                                  # the sign-in form (it checks the password itself)
    assert not is_public_allowed("GET", "/admin/x") and not is_public_allowed("POST", "/admin/x")
    assert not is_public_allowed("PUT", "/admin") and not is_public_allowed("DELETE", "/admin")
