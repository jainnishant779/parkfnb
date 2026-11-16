"""
The pass an owner's browser carries to the owner dashboard's API (/owner/api).

  * The Node backend (software/services/backend, POST /api/cameras/access-grant) signs it with ANPR_GRANT_SECRET, a secret it shares
    with this service and nothing else.  This service only ever verifies: it never calls the backend.
  * It is a compact HS256 token (header.payload.signature, base64url) that says which owner it is for, and for each camera the owner
    may see, the moment the owner got it (`cams: {"phone-1": <epoch s>}`).  Everything recorded before that moment stays hidden
    from the owner, so a camera that changes hands does not show the previous owner's plates to the next one.
  * It lives 15 minutes (never more than an hour), so unlinking a camera takes effect within that time.

Only the standard library is used, like admin_auth.py, so nothing new has to be installed on the server.  Verifying never raises:
anything wrong with a token is simply "no grant".
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

ISSUER = "parkfnb-backend"
AUDIENCE = "parkfnb-anpr"
SCOPE = "owner"
CAMERA_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")      # the same rule as the backend and as _safe_camera_id
_OID_RE = re.compile(r"^[0-9a-f]{24}$")               # a Mongo ObjectId
MIN_SECRET_LEN = 32
MAX_TOKEN_LEN = 4096
MAX_TTL_S = 3600                                       # a token claiming to live longer than this is refused, whatever it says
LEEWAY_S = 30                                          # clocks of two servers are never quite the same
MAX_CAMERAS = 50


def _secrets_from_env() -> list[bytes]:
    """ANPR_GRANT_SECRET, plus ANPR_GRANT_SECRET_PREV while the secret is being rotated.  A short one is ignored, so a forgotten
    placeholder can never become the key."""
    out = []
    for name in ("ANPR_GRANT_SECRET", "ANPR_GRANT_SECRET_PREV"):
        value = os.getenv(name, "").strip()
        if len(value) >= MIN_SECRET_LEN:
            out.append(value.encode("utf-8"))
    return out


# Read once at start-up.  Tests replace it.
GRANT_SECRETS: list[bytes] = _secrets_from_env()


@dataclass(frozen=True)
class Grant:
    user_id: str
    owner_id: str
    cams: dict = field(default_factory=dict)           # camera id -> the earliest moment (epoch s) the owner may see
    exp: int = 0

    @property
    def who(self) -> str:
        """What is written as "who did it" when the owner resolves a violation."""
        return f"owner:{self.owner_id}"


def _b64url_decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and v not in (float("inf"), float("-inf"))


def verify_grant(token: str, secrets: Optional[list] = None, now: Optional[float] = None) -> Optional[Grant]:
    """The Grant a token carries, or None for anything that is not a good, current pass from the backend."""
    try:
        keys = GRANT_SECRETS if secrets is None else secrets
        if not keys or not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LEN:
            return None
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header = json.loads(_b64url_decode(parts[0]))
        if not isinstance(header, dict) or header.get("alg") != "HS256":       # not "none", not another algorithm
            return None
        signature = _b64url_decode(parts[2])
        signed = (parts[0] + "." + parts[1]).encode("ascii")
        good = False
        for key in keys:                                                        # every key is tried: the time taken says nothing
            if hmac.compare_digest(hmac.new(key, signed, hashlib.sha256).digest(), signature):
                good = True
        if not good:
            return None

        claims = json.loads(_b64url_decode(parts[1]))
        if not isinstance(claims, dict) or claims.get("iss") != ISSUER or claims.get("scope") != SCOPE:
            return None
        aud = claims.get("aud")
        if not (aud == AUDIENCE or (isinstance(aud, list) and AUDIENCE in aud)):
            return None
        exp, iat = claims.get("exp"), claims.get("iat")
        if not (_is_int(exp) and _is_int(iat)):
            return None
        t = time.time() if now is None else now
        if t >= exp + LEEWAY_S or iat > t + LEEWAY_S or exp <= iat or exp - iat > MAX_TTL_S:
            return None
        oid, sub = claims.get("oid"), claims.get("sub")
        if not (isinstance(oid, str) and _OID_RE.match(oid) and isinstance(sub, str) and _OID_RE.match(sub)):
            return None
        cams = claims.get("cams")
        if not isinstance(cams, dict) or len(cams) > MAX_CAMERAS:
            return None
        clean = {}
        for cid, since in cams.items():
            if not (isinstance(cid, str) and CAMERA_RE.match(cid) and _is_number(since) and since >= 0):
                return None
            clean[cid] = float(since)
        return Grant(user_id=sub, owner_id=oid, cams=clean, exp=exp)
    except Exception:                                                           # bad base64, bad JSON, wrong types: just no grant
        return None


def make_grant(claims: dict, secret, *, alg: str = "HS256") -> str:
    """Sign `claims` the way the backend does (for tests and tools; the service itself never issues a grant)."""
    key = secret if isinstance(secret, bytes) else str(secret).encode("utf-8")
    head = _b64url_encode(json.dumps({"alg": alg, "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    body = _b64url_encode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    sig = _b64url_encode(hmac.new(key, f"{head}.{body}".encode("ascii"), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"
