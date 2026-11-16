"""The pass an owner's browser carries (grant_auth.py): what is accepted, and every way a token can be wrong."""
import base64
import hashlib
import hmac
import json

import pytest

import grant_auth
from grant_auth import Grant, make_grant, verify_grant

SECRET = "unit-test-secret-that-is-at-least-32-characters"
OTHER = "another-secret-that-is-also-at-least-32-chars"
NOW = 1_800_000_000
OID = "65a1b2c3d4e5f60718293a4c"
UID = "65a1b2c3d4e5f60718293a4b"


def claims(**over):
    c = {"sub": UID, "oid": OID, "scope": "owner", "cams": {"cam-a": 1_700_000_000, "cam-c": 1_700_003_600},
         "iat": NOW, "exp": NOW + 900, "iss": "parkfnb-backend", "aud": "parkfnb-anpr"}
    c.update(over)
    return {k: v for k, v in c.items() if v is not None}


def token(secret=SECRET, **over):
    return make_grant(claims(**over), secret)


def check(tok, secrets=None, now=NOW + 10):
    return verify_grant(tok, [SECRET.encode()] if secrets is None else secrets, now)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def forge(header: dict, payload: dict, secret=SECRET) -> str:
    h, p = b64(json.dumps(header).encode()), b64(json.dumps(payload).encode())
    sig = b64(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"


# ---------------------------------------------------------------- a good pass

def test_a_good_pass_gives_the_owner_and_the_cameras_with_their_since_times():
    g = check(token())
    assert isinstance(g, Grant)
    assert (g.owner_id, g.user_id, g.exp) == (OID, UID, NOW + 900)
    assert g.cams == {"cam-a": 1_700_000_000.0, "cam-c": 1_700_003_600.0}
    assert g.who == f"owner:{OID}"


def test_a_token_minted_by_the_node_backend_verifies():
    """Made once with jsonwebtoken (the library the backend signs with), so both sides are known to agree on the format."""
    node = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NWExYjJjM2Q0ZTVmNjA3MTgyOTNhNGIiLCJvaWQiOiI2NWExYjJjM2Q0ZTVmNjA3MTgyOTNhNGMi"
            "LCJzY29wZSI6Im93bmVyIiwiY2FtcyI6eyJjYW0tYSI6MTcwMDAwMDAwMCwiY2FtLWMiOjE3MDAwMDM2MDB9LCJpYXQiOjE4MDAwMDAwMDAsImV4cCI6MTgwMDAwMDkwMCwiYX"
            "VkIjoicGFya2ZuYi1hbnByIiwiaXNzIjoicGFya2ZuYi1iYWNrZW5kIn0.R9CqGoo_EjC3MRWYaBXsXwyWdEu4LQZ2Mf4bolAixmA")
    secret = b"node-minted-secret-0123456789-abcdefghijklmnop"
    g = verify_grant(node, [secret], now=1_800_000_100)
    assert g is not None and g.owner_id == OID and g.cams == {"cam-a": 1_700_000_000.0, "cam-c": 1_700_003_600.0}
    assert verify_grant(node, [SECRET.encode()], now=1_800_000_100) is None           # not under another secret
    assert verify_grant(node, [secret], now=1_800_000_900 + 31) is None                 # and not after it expired


def test_the_previous_secret_is_still_accepted_during_a_rotation():
    old = token(secret=OTHER)
    assert check(old, [SECRET.encode(), OTHER.encode()]) is not None
    assert check(old, [SECRET.encode()]) is None


# ---------------------------------------------------------------- forged or damaged

def test_a_wrong_secret_or_no_secret_is_refused(monkeypatch):
    assert check(token(secret=OTHER)) is None
    assert verify_grant(token(), [], NOW) is None
    monkeypatch.setattr(grant_auth, "GRANT_SECRETS", [])                       # none configured on this server: nothing verifies
    assert verify_grant(token(), None, NOW) is None


def test_a_tampered_payload_is_refused():
    h, p, s = token().split(".")
    body = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    body["cams"]["phone-1"] = 0                                    # an owner adding a camera that is not theirs
    assert check(f"{h}.{b64(json.dumps(body).encode())}.{s}") is None


@pytest.mark.parametrize("alg", ["none", "HS512", "RS256", "hs256", ""])
def test_only_hs256_is_accepted(alg):
    assert check(forge({"alg": alg, "typ": "JWT"}, claims())) is None


def test_an_unsigned_token_is_refused():
    h, p = b64(json.dumps({"alg": "none"}).encode()), b64(json.dumps(claims()).encode())
    assert check(f"{h}.{p}.") is None
    assert check(f"{h}.{p}") is None


@pytest.mark.parametrize("bad", ["", "abc", "a.b", "a.b.c.d", "....", None, 123, b"x.y.z"])
def test_garbage_is_refused_without_raising(bad):
    assert check(bad) is None


def test_an_oversized_token_is_refused():
    assert check(token(cams={f"c{i}": 1 for i in range(10)}) + "x" * 5000) is None


# ---------------------------------------------------------------- what the claims must say

@pytest.mark.parametrize("over", [
    {"iss": "someone-else"}, {"iss": None}, {"aud": "another-service"}, {"aud": None}, {"scope": "admin"}, {"scope": None},
    {"oid": "not-an-object-id"}, {"oid": None}, {"sub": "short"}, {"sub": None},
    {"cams": None}, {"cams": []}, {"cams": "phone-1"},
    {"cams": {"bad id!": 1}}, {"cams": {"": 1}}, {"cams": {"x" * 33: 1}}, {"cams": {"../etc": 1}}, {"cams": {"cam-a": "yesterday"}},
    {"cams": {"cam-a": -5}}, {"cams": {"cam-a": True}}, {"cams": {"cam-a": float("nan")}},
    {"exp": None}, {"iat": None}, {"exp": "later"}, {"exp": NOW + 900.5}, {"exp": True},
])
def test_a_token_whose_claims_are_wrong_is_refused(over):
    assert check(token(**over)) is None


def test_the_audience_may_be_a_list():
    assert check(token(aud=["parkfnb-anpr", "other"])) is not None
    assert check(token(aud=["other"])) is None


def test_too_many_cameras_is_refused():
    assert check(token(cams={f"cam-{i}": 1 for i in range(51)})) is None
    assert check(token(cams={f"cam-{i}": 1 for i in range(50)})) is not None


def test_no_cameras_is_a_valid_pass_that_opens_nothing():
    g = check(token(cams={}))
    assert g is not None and g.cams == {}


# ---------------------------------------------------------------- time

def test_an_expired_token_is_refused_after_the_leeway():
    tok = token()
    assert verify_grant(tok, [SECRET.encode()], NOW + 900 + 29) is not None        # inside the 30 s leeway
    assert verify_grant(tok, [SECRET.encode()], NOW + 900 + 30) is None


def test_a_token_from_the_future_is_refused():
    tok = token()
    assert verify_grant(tok, [SECRET.encode()], NOW - 29) is not None
    assert verify_grant(tok, [SECRET.encode()], NOW - 31) is None


def test_a_token_claiming_a_long_life_is_refused_whatever_it_says():
    assert check(token(exp=NOW + 3601)) is None
    assert check(token(exp=NOW + 3600)) is not None
    assert check(token(exp=NOW)) is None and check(token(exp=NOW - 1)) is None


# ---------------------------------------------------------------- configuration

def test_a_short_secret_in_the_environment_is_ignored(monkeypatch):
    monkeypatch.setenv("ANPR_GRANT_SECRET", "too-short")
    monkeypatch.setenv("ANPR_GRANT_SECRET_PREV", "")
    assert grant_auth._secrets_from_env() == []
    monkeypatch.setenv("ANPR_GRANT_SECRET", SECRET)
    monkeypatch.setenv("ANPR_GRANT_SECRET_PREV", OTHER)
    assert grant_auth._secrets_from_env() == [SECRET.encode(), OTHER.encode()]
