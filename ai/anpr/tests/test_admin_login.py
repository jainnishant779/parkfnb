"""
Operator sign-in with an ID and a password: the hashing, the cookie, the lockout, the form, and that nothing
else opens the private routes (the old ANPR_PUBLIC_ADMIN switch included).
"""
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

from fastapi.testclient import TestClient  # noqa: E402

import admin_auth as aa  # noqa: E402
import app as app_module  # noqa: E402
import set_admin_password as sap  # noqa: E402

PASSWORD = "correct-horse-battery"
PROXY = {"X-Forwarded-For": "203.0.113.9"}
HASH = aa.hash_password(PASSWORD)


# ---- hashing

def test_a_password_is_hashed_with_a_random_salt_and_checked_in_full():
    h1, h2 = aa.hash_password(PASSWORD), aa.hash_password(PASSWORD)
    assert h1 != h2 and h1.startswith("scrypt$") and PASSWORD not in h1
    assert aa.verify_password(PASSWORD, h1) and aa.verify_password(PASSWORD, h2)
    for wrong in ("", "x", PASSWORD + " ", PASSWORD.upper(), PASSWORD[:-1]):
        assert not aa.verify_password(wrong, h1), wrong


def test_a_short_password_is_refused():
    with pytest.raises(ValueError, match="at least 12"):
        aa.hash_password("short")
    with pytest.raises(ValueError):
        aa.hash_password("")


@pytest.mark.parametrize("stored", ["", "nonsense", "scrypt$1$2", "md5$16384$8$1$aa$bb", "scrypt$x$8$1$aa$bb",
                                    "scrypt$16384$8$1$zz$bb", f"scrypt${2**30}$8$1$aa$bb", None])
def test_a_missing_or_damaged_hash_is_simply_a_refusal(stored):
    assert aa.verify_password(PASSWORD, stored) is False
    assert aa.check_login("admin", PASSWORD, "admin", stored or "") is False


def test_both_the_id_and_the_password_must_match():
    assert aa.check_login("admin", PASSWORD, "admin", HASH)
    assert not aa.check_login("Admin", PASSWORD, "admin", HASH)
    assert not aa.check_login("admin", "wrong-password-1", "admin", HASH)
    assert not aa.check_login("", "", "admin", HASH)


# ---- the cookie

def test_a_session_cookie_names_the_user_and_nothing_secret():
    secret = aa.session_secret("", HASH)
    c = aa.make_session("admin", secret, now=1000, ttl=60)
    assert aa.verify_session(c, secret, now=1030) == "admin"
    assert PASSWORD not in c and HASH.split("$")[-1] not in c


def test_a_cookie_that_is_expired_forged_or_from_another_secret_is_refused():
    secret = aa.session_secret("", HASH)
    c = aa.make_session("admin", secret, now=1000, ttl=60)
    assert aa.verify_session(c, secret, now=1061) is None                                  # expired
    assert aa.verify_session(c, aa.session_secret("", aa.hash_password("another-long-password")), now=1030) is None
    ver, user, exp, sig = c.split(".")
    for forged in (f"{ver}.root.{exp}.{sig}", f"{ver}.{user}.{int(exp) + 99999}.{sig}", f"{ver}.{user}.{exp}.{sig[:-2]}ab",
                   "", "v1", "v1.admin", "v1.admin.9999999999.", ".", "v2." + ".".join(c.split(".")[1:]), None):
        assert aa.verify_session(forged, secret, now=1030) is None, forged


def test_a_new_password_ends_every_session_unless_a_fixed_secret_is_set():
    old, new = aa.session_secret("", HASH), aa.session_secret("", aa.hash_password("a-brand-new-password"))
    c = aa.make_session("admin", old)
    assert aa.verify_session(c, old) == "admin" and aa.verify_session(c, new) is None
    fixed = aa.session_secret("my-own-secret", HASH)
    assert aa.verify_session(aa.make_session("admin", fixed), aa.session_secret("my-own-secret", "another")) == "admin"


# ---- the lockout

def test_five_wrong_tries_lock_that_address_for_the_window_and_it_then_opens_again():
    t = aa.LoginThrottle(per_key=5, overall=40, window_s=900)
    for i in range(4):
        t.failed("1.2.3.4", now=1000 + i)
    assert t.wait_s("1.2.3.4", now=1004) == 0
    t.failed("1.2.3.4", now=1004)
    assert 0 < t.wait_s("1.2.3.4", now=1005) <= 900
    assert t.wait_s("5.6.7.8", now=1005) == 0                          # someone else is not locked out
    assert t.wait_s("1.2.3.4", now=1000 + 899) > 0                     # locked until the oldest of the five is 15 minutes old
    assert t.wait_s("1.2.3.4", now=1000 + 902) == 0


def test_someone_who_keeps_trying_never_gets_more_than_five_tries_in_any_fifteen_minutes():
    t = aa.LoginThrottle(per_key=5, overall=10_000, window_s=900)
    tries = []
    for now in range(0, 7200):                                         # two hours, trying every second whenever allowed
        if t.wait_s("attacker", now=now) == 0:
            t.failed("attacker", now=now)
            tries.append(now)
    assert len(tries) < 50
    for start in range(0, 7200 - 900):
        assert sum(1 for x in tries if start <= x < start + 900) <= 5, start


def test_a_right_sign_in_clears_the_count_and_too_many_overall_lock_everyone():
    t = aa.LoginThrottle(per_key=3, overall=6, window_s=100)
    t.failed("a", now=0); t.failed("a", now=1)
    t.succeeded("a")
    t.failed("a", now=2)
    assert t.wait_s("a", now=3) == 0
    for i in range(6):
        t.failed(f"ip{i}", now=10 + i)
    assert t.wait_s("somebody-new", now=20) > 0                        # spread over many addresses: still locked
    assert t.wait_s("somebody-new", now=200) == 0


# ---- where to go next

@pytest.mark.parametrize("target,ok", [
    ("/live", True), ("/live?camera_id=phone-1", True), ("/occupancy?camera=phone-1", True),
    ("https://evil.example/x", False), ("//evil.example", False), ("/\\evil.example", False), ("javascript:alert(1)", False),
    ("/../etc/passwd", False), ("", False), ("live", False), ("/live<script>", False),
])
def test_only_a_page_on_this_site_is_accepted_as_next(target, ok):
    got = aa.safe_next(target, "/default")
    assert (got == target) if ok else (got == "/default")


# ---- the form and the routes

@pytest.fixture
def web(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", "")
    monkeypatch.setattr(app_module, "ADMIN_USER", "admin")
    monkeypatch.setattr(app_module, "ADMIN_PW_HASH", HASH)
    monkeypatch.setattr(app_module, "_login_throttle", aa.LoginThrottle())
    for name in ("_live_sessions", "_bay_maps", "_trackers", "_registries"):
        monkeypatch.setattr(app_module, name, {})
    return TestClient(app_module.app, client=("203.0.113.9", 40000), follow_redirects=False)


def sign_in(web, user="admin", password=PASSWORD, nxt=""):
    return web.post("/admin", data={"user": user, "password": password, "next": nxt}, headers=PROXY)


def session_cookie(r):
    m = re.search(r"parkfnb_session=([^;]+)", r.headers.get("set-cookie", ""))
    return {"Cookie": f"parkfnb_session={m.group(1)}"} if m else None


def test_the_right_id_and_password_sign_in_with_a_locked_down_cookie(web):
    r = sign_in(web)
    assert r.status_code == 303 and r.headers["location"] == "/"
    cookie = r.headers["set-cookie"].lower()
    assert "parkfnb_session=" in cookie and "httponly" in cookie and "secure" in cookie and "samesite=strict" in cookie
    assert PASSWORD not in r.headers["set-cookie"] and HASH not in r.headers["set-cookie"]


def test_a_signed_in_operator_can_use_the_private_routes_and_a_visitor_still_cannot(web):
    cookie = session_cookie(sign_in(web))
    assert web.get("/occupancy", headers=PROXY).status_code == 403
    assert web.get("/occupancy", headers={**PROXY, **cookie}).status_code == 200
    assert web.get("/live/setup", headers={**PROXY, **cookie}).status_code == 200
    assert web.get("/live/state", headers={**PROXY, **cookie}).json()["is_admin"] is True
    assert web.get("/live/state", headers=PROXY).json()["is_admin"] is False


def test_wrong_id_or_password_gets_the_same_plain_answer_and_no_cookie(web):
    for user, pw in (("admin", "wrong-password-1"), ("root", PASSWORD), ("", ""), ("admin", "")):
        r = sign_in(web, user, pw)
        assert r.status_code == 303 and "set-cookie" not in r.headers
        q = parse_qs(urlparse(r.headers["location"]).query)
        assert urlparse(r.headers["location"]).path == "/admin" and q["error"] == ["wrong"]


def test_the_sixth_try_is_locked_even_with_the_right_password(web):
    for _ in range(5):
        sign_in(web, password="wrong-password-1")
    r = sign_in(web)
    assert "set-cookie" not in r.headers
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["error"] == ["locked"] and int(q["wait"][0]) >= 1
    other = TestClient(app_module.app, client=("198.51.100.7", 40000), follow_redirects=False)      # another address is fine
    assert other.post("/admin", data={"user": "admin", "password": PASSWORD}, headers={"X-Forwarded-For": "198.51.100.7"}).headers.get("set-cookie")


def test_the_form_sends_you_where_you_were_but_never_off_the_site(web):
    assert sign_in(web, nxt="/live?camera_id=phone-1").headers["location"] == "/live?camera_id=phone-1"
    assert sign_in(web, nxt="https://evil.example").headers["location"] == "/"
    assert sign_in(web, nxt="//evil.example").headers["location"] == "/"
    bad = sign_in(web, password="wrong-password-1", nxt="//evil.example")
    assert parse_qs(urlparse(bad.headers["location"]).query)["next"] == ["/"]


def test_the_sign_in_page_is_shown_to_visitors_and_skipped_for_signed_in_operators(web):
    page = web.get("/admin", headers=PROXY)
    assert page.status_code == 200 and "Sign in" in page.text and 'name="password"' in page.text
    assert PASSWORD not in page.text and HASH not in page.text
    cookie = session_cookie(sign_in(web))
    again = web.get("/admin?next=/live", headers={**PROXY, **cookie})
    assert again.status_code == 303 and again.headers["location"] == "/live"


def test_a_cookie_for_an_id_that_is_no_longer_the_admin_is_no_cookie(web, monkeypatch):
    cookie = session_cookie(sign_in(web))
    monkeypatch.setattr(app_module, "ADMIN_USER", "someone-else")
    assert web.get("/occupancy", headers={**PROXY, **cookie}).status_code == 403


def test_a_forged_or_old_style_cookie_opens_nothing(web):
    for c in ("parkfnb_session=v1.admin.9999999999.AAAA", "parkfnb_session=admin", f"parkfnb_admin={PASSWORD}", "parkfnb_admin=x" * 3):
        assert web.get("/occupancy", headers={**PROXY, "Cookie": c}).status_code == 403, c


def test_signing_out_clears_both_cookies_and_can_send_you_back(web):
    plain = web.get("/admin/logout", headers=PROXY)
    assert plain.status_code == 200 and plain.json() == {"ok": True}
    assert "parkfnb_session" in plain.headers["set-cookie"] and "parkfnb_admin" in plain.headers["set-cookie"]
    back = web.get("/admin/logout?next=/live%3Fcamera_id%3Dphone-1", headers=PROXY)
    assert back.status_code == 303 and back.headers["location"] == "/live?camera_id=phone-1"
    assert web.get("/admin/logout?next=https://evil.example", headers=PROXY).headers["location"] == "/live"


def test_the_old_public_admin_switch_opens_nothing_any_more(web, monkeypatch):
    monkeypatch.setenv("ANPR_PUBLIC_ADMIN", "1")
    assert web.get("/occupancy", headers=PROXY).status_code == 403
    assert web.get("/live/setup", headers=PROXY).status_code == 403
    assert web.get("/live/state", headers=PROXY).json()["is_admin"] is False
    assert web.get("/admin?token=anything", headers=PROXY).status_code == 200            # just the sign-in page, no cookie
    assert "set-cookie" not in web.get("/admin?token=anything", headers=PROXY).headers


def test_with_no_password_and_no_token_there_is_no_sign_in_at_all(monkeypatch):
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", "")
    monkeypatch.setattr(app_module, "ADMIN_PW_HASH", "")
    c = TestClient(app_module.app, client=("203.0.113.9", 40000), follow_redirects=False)
    assert c.get("/admin", headers=PROXY).status_code == 403
    assert c.post("/admin", data={"user": "admin", "password": PASSWORD}, headers=PROXY).status_code == 403


def test_the_old_token_link_still_works_only_while_a_token_is_configured(web, monkeypatch):
    token = "k3m9r7hp2xw5cz8abtv4n6fdsj"
    assert web.get(f"/admin?token={token}", headers=PROXY).status_code == 200            # no token configured: just the page
    monkeypatch.setattr(app_module, "ADMIN_TOKEN", token)
    r = web.get(f"/admin?token={token}", headers=PROXY)
    assert r.status_code == 303 and f"parkfnb_admin={token}" in r.headers["set-cookie"]
    assert web.get("/admin?token=wrong", headers=PROXY).status_code == 200 and "set-cookie" not in web.get("/admin?token=wrong", headers=PROXY).headers


def test_every_private_route_stays_closed_to_a_visitor(web):
    for path in ("/occupancy", "/occupancy/bays?camera_id=phone-1", "/occupancy/bays/backups?camera_id=phone-1", "/live/setup",
                 "/live/plates?camera_id=phone-1", "/live/log", "/live/log.json", "/live/log.csv"):
        assert web.get(path, headers=PROXY).status_code == 403, path
    assert web.post("/live/bay-override", json={}, headers=PROXY).status_code == 403
    assert web.post("/occupancy/bays", json={}, headers=PROXY).status_code == 403


# ---- the password tool

def test_the_tool_writes_only_the_two_lines_and_keeps_everything_else(tmp_path):
    env = tmp_path / "parkfnb-anpr.env"
    env.write_text("ANPR_DATA_DIR=/var/lib/x\nLIVE_CAMERA_KEY=abc\nANPR_ADMIN_USER=old\nANPR_ADMIN_PASSWORD_HASH=oldhash\nOMP=1\n", encoding="utf-8")
    os.chmod(env, 0o600)
    stdin_backup = sys.stdin
    import io
    sys.stdin = io.StringIO(PASSWORD + "\n")
    try:
        assert sap.main(["--user", "boss", "--env", str(env), "--password-stdin"]) == 0
    finally:
        sys.stdin = stdin_backup
    lines = env.read_text(encoding="utf-8").splitlines()
    assert lines[:2] == ["ANPR_DATA_DIR=/var/lib/x", "LIVE_CAMERA_KEY=abc"] and lines[-1] == "OMP=1"
    assert "ANPR_ADMIN_USER=boss" in lines and sum(l.startswith("ANPR_ADMIN_PASSWORD_HASH=") for l in lines) == 1
    new_hash = next(l for l in lines if l.startswith("ANPR_ADMIN_PASSWORD_HASH=")).split("=", 1)[1]
    assert aa.verify_password(PASSWORD, new_hash) and PASSWORD not in env.read_text(encoding="utf-8")
    assert not list(tmp_path.glob("parkfnb-anpr.env.*"))                                  # no temp file left behind


def test_the_tool_adds_the_lines_to_a_file_that_has_none_and_refuses_bad_input(tmp_path, capsys):
    env = tmp_path / "e.env"
    env.write_text("A=1", encoding="utf-8")
    sap.write_env(env, "admin", HASH)
    assert env.read_text(encoding="utf-8").splitlines() == ["A=1", "ANPR_ADMIN_USER=admin", f"ANPR_ADMIN_PASSWORD_HASH={HASH}"]
    assert sap.main(["--user", "bad user!"]) == 2
    import io
    sys.stdin = io.StringIO("short\n")
    try:
        assert sap.main(["--password-stdin"]) == 2
    finally:
        sys.stdin = sys.__stdin__
    assert "at least 12" in capsys.readouterr().err


def test_a_short_password_is_only_possible_with_the_explicit_testing_flag_and_it_warns(tmp_path, capsys):
    import io
    env = tmp_path / "w.env"
    env.write_text("A=1\n", encoding="utf-8")
    for args, want in ((["--password-stdin", "--env", str(env)], 2), (["--password-stdin", "--allow-weak", "--env", str(env)], 0)):
        sys.stdin = io.StringIO("admin\n")
        try:
            assert sap.main(args) == want
        finally:
            sys.stdin = sys.__stdin__
    err = capsys.readouterr().err
    assert "--allow-weak" in err and "WARNING" in err                                 # refused with the way out, then warned
    stored = [l for l in env.read_text(encoding="utf-8").splitlines() if l.startswith("ANPR_ADMIN_PASSWORD_HASH=")][0].split("=", 1)[1]
    assert aa.check_login("admin", "admin", "admin", stored) and not aa.check_login("admin", "Admin", "admin", stored)
    with pytest.raises(ValueError):
        aa.hash_password("admin")                                                      # the library default still refuses
    with pytest.raises(ValueError):
        aa.hash_password("", allow_weak=True)                                          # and an empty password is never allowed


def test_a_generated_password_is_strong_readable_and_works(tmp_path, capsys):
    env = tmp_path / "g.env"
    env.write_text("", encoding="utf-8")
    assert sap.main(["--generate", "--env", str(env)]) == 0
    out = capsys.readouterr().out
    pw = re.search(r"Password: (\S+)", out).group(1)
    assert re.fullmatch(r"([a-z2-9]{5}-){3}[a-z2-9]{5}", pw) and not set(pw) & set("ilo01")
    h = next(l for l in env.read_text(encoding="utf-8").splitlines() if l.startswith("ANPR_ADMIN_PASSWORD_HASH=")).split("=", 1)[1]
    assert aa.verify_password(pw, h)
