"""
Operator sign-in with an ID and a password.

  * The password is never stored: only a scrypt hash (random salt) is kept in the server's env file.
  * Signing in gives a signed cookie (user | expiry | HMAC).  Neither the password nor any token is in it, a
    tampered or expired cookie is refused, and changing the password signs everyone out.
  * Wrong tries are counted per address and overall; after too many the sign-in is locked for a while.

Only the standard library is used, so nothing new has to be installed on the server.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from typing import Optional

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1          # ~16 MB and ~50 ms per check: cheap for us, costly to guess
MIN_PASSWORD_LEN = 12
SESSION_TTL_S = 7 * 24 * 3600
USER_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
_COOKIE_VERSION = "v1"


def valid_user(user: str) -> bool:
    return bool(USER_RE.match(user or ""))


# ---------------------------------------------------------------- password hashes

def hash_password(password: str, *, salt: Optional[bytes] = None, allow_weak: bool = False) -> str:
    """'scrypt$N$r$p$<salt hex>$<hash hex>' for a password of at least MIN_PASSWORD_LEN characters.  `allow_weak` skips
    the length rule; only tools/set_admin_password.py --allow-weak uses it, on purpose, for a throw-away test setup."""
    if not password or (len(password) < MIN_PASSWORD_LEN and not allow_weak):
        raise ValueError(f"the password must be at least {MIN_PASSWORD_LEN} characters")
    salt = salt if salt is not None else secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32,
                        maxmem=64 * 1024 * 1024)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """True only for the right password; a missing or damaged hash is simply False (never an error)."""
    try:
        scheme, n, r, p, salt_hex, hash_hex = (stored or "").split("$")
        if scheme != "scrypt":
            return False
        n, r, p = int(n), int(r), int(p)
        if n > 2 ** 20 or r > 32 or p > 8:                 # a hash in the env file is trusted, but not blindly
            return False
        want = bytes.fromhex(hash_hex)
        got = hashlib.scrypt((password or "").encode("utf-8"), salt=bytes.fromhex(salt_hex), n=n, r=r, p=p,
                             dklen=len(want), maxmem=256 * 1024 * 1024)
        return hmac.compare_digest(got, want)
    except (ValueError, TypeError):
        return False


def check_login(user: str, password: str, expected_user: str, stored_hash: str) -> bool:
    """The user and the password are both always checked, so the time taken does not say which one was wrong."""
    user_ok = hmac.compare_digest((user or "").encode("utf-8"), (expected_user or "").encode("utf-8"))
    pass_ok = verify_password(password, stored_hash)
    return bool(user_ok and pass_ok and stored_hash)


def session_secret(configured: str, password_hash: str) -> bytes:
    """ANPR_SESSION_SECRET if set; otherwise derived from the password hash, so a new password ends all sessions."""
    base = configured or ("derived:" + (password_hash or ""))
    return hashlib.sha256(("parkfnb-session|" + base).encode("utf-8")).digest()


# ---------------------------------------------------------------- session cookie

def _sig(secret: bytes, body: str) -> str:
    return base64.urlsafe_b64encode(hmac.new(secret, body.encode("utf-8"), hashlib.sha256).digest()).decode().rstrip("=")


def make_session(user: str, secret: bytes, *, now: Optional[float] = None, ttl: int = SESSION_TTL_S) -> str:
    now = time.time() if now is None else now
    body = f"{_COOKIE_VERSION}.{user}.{int(now + ttl)}"
    return f"{body}.{_sig(secret, body)}"


def verify_session(cookie: str, secret: bytes, *, now: Optional[float] = None) -> Optional[str]:
    """The user a cookie belongs to, or None when it is missing, forged, from another secret, or expired."""
    now = time.time() if now is None else now
    try:
        ver, user, exp, sig = (cookie or "").split(".")
        if ver != _COOKIE_VERSION or not valid_user(user):
            return None
        if not hmac.compare_digest(sig, _sig(secret, f"{ver}.{user}.{exp}")):
            return None
        return user if int(exp) > now else None
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------- too many wrong tries

class LoginThrottle:
    """
    `per_key` wrong tries from one address within `window_s`, or `overall` from anyone, lock the sign-in for the rest of
    the window.  A right sign-in clears that address.  Pure bookkeeping: the clock is passed in so it can be tested.
    """

    def __init__(self, per_key: int = 5, overall: int = 40, window_s: int = 900):
        self.per_key, self.overall, self.window_s = per_key, overall, window_s
        self._by_key: dict[str, list[float]] = {}
        self._all: list[float] = []
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        cut = now - self.window_s
        self._all = [t for t in self._all if t > cut]
        for k in list(self._by_key):
            self._by_key[k] = [t for t in self._by_key[k] if t > cut]
            if not self._by_key[k]:
                del self._by_key[k]

    def wait_s(self, key: str, now: Optional[float] = None) -> int:
        """Seconds until this address may try again (0 = it may try now)."""
        now = time.time() if now is None else now
        with self._lock:
            self._prune(now)
            wait = 0.0
            mine = self._by_key.get(key, [])
            if len(mine) >= self.per_key:
                wait = max(wait, mine[-self.per_key] + self.window_s - now)
            if len(self._all) >= self.overall:
                wait = max(wait, self._all[-self.overall] + self.window_s - now)
            return int(wait) + (1 if wait > int(wait) else 0)

    def failed(self, key: str, now: Optional[float] = None) -> None:
        now = time.time() if now is None else now
        with self._lock:
            self._by_key.setdefault(key, []).append(now)
            self._all.append(now)
            if len(self._by_key) > 5000:                    # a flood of made-up addresses must not grow memory without bound
                self._by_key.clear()

    def succeeded(self, key: str) -> None:
        with self._lock:
            self._by_key.pop(key, None)


# ---------------------------------------------------------------- where to go after signing in

_SAFE_NEXT = re.compile(r"^/[A-Za-z0-9_\-./?=&%]*$")


def safe_next(target: str, default: str = "/") -> str:
    """Only a path on this site: never another address, a scheme, or a protocol-relative '//host'."""
    t = (target or "").strip()
    if not t or t.startswith("//") or "\\" in t or ".." in t or not _SAFE_NEXT.match(t):
        return default
    return t
