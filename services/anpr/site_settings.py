"""
The site's settings the operator can change from the console: the lot's name, a friendly name and zone for each camera,
how long a car may stay before it is an overstay, and how often the phone sends its full-resolution photo.

Kept in <data>/site.json (written atomically).  Everything is validated here, so the route only has to pass the body in.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

CAMERA_ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
MAX_CAMERAS = 50

DEFAULTS = {"site_name": "ParkFNB Pilot Site", "still_every_s": None, "cameras": {}}


def _text(v, limit: int, field: str) -> str:
    s = " ".join(str(v if v is not None else "").split())
    if len(s) > limit:
        raise ValueError(f"{field} is longer than {limit} characters")
    return s


def validate(body) -> dict:
    """Clean a settings body or raise ValueError saying what is wrong.  Unknown keys are refused, not ignored."""
    if not isinstance(body, dict):
        raise ValueError("send the settings as an object")
    unknown = set(body) - {"site_name", "still_every_s", "cameras"}
    if unknown:
        raise ValueError(f"unknown setting: {', '.join(sorted(unknown))}")
    out = {}
    if "site_name" in body:
        name = _text(body["site_name"], 60, "the site name")
        if not name:
            raise ValueError("the site name cannot be empty")
        out["site_name"] = name
    if "still_every_s" in body:
        v = body["still_every_s"]
        if v is None or v == "":
            out["still_every_s"] = None                      # back to the server's default
        else:
            try:
                n = float(v)
            except (TypeError, ValueError):
                raise ValueError("the photo interval must be a number of seconds")
            if n != 0 and not (30 <= n <= 3600):
                raise ValueError("the photo interval must be 0 (off) or between 30 and 3600 seconds")
            out["still_every_s"] = n
    if "cameras" in body:
        cams = body["cameras"]
        if not isinstance(cams, dict) or len(cams) > MAX_CAMERAS:
            raise ValueError("cameras must be an object of at most %d cameras" % MAX_CAMERAS)
        clean = {}
        for cid, c in cams.items():
            if not CAMERA_ID.match(str(cid)):
                raise ValueError(f"'{cid}' is not a valid camera id")
            if not isinstance(c, dict):
                raise ValueError(f"settings for {cid} must be an object")
            extra = set(c) - {"name", "zone", "overstay_h"}
            if extra:
                raise ValueError(f"unknown camera setting: {', '.join(sorted(extra))}")
            item = {"name": _text(c.get("name"), 40, "the camera name"), "zone": _text(c.get("zone"), 40, "the zone")}
            hours = c.get("overstay_h", 0)
            try:
                hours = 0.0 if hours in (None, "") else float(hours)
            except (TypeError, ValueError):
                raise ValueError("the overstay limit must be a number of hours")
            if not (0 <= hours <= 72):
                raise ValueError("the overstay limit must be 0 (off) to 72 hours")
            item["overstay_h"] = hours
            clean[str(cid)] = item
        out["cameras"] = clean
    return out


def load(path: Path) -> dict:
    """The saved settings over the defaults (a missing or damaged file gives the defaults)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        data = data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        data = {}
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULTS.items()}
    for k in DEFAULTS:
        if k in data:
            out[k] = data[k]
    return out


def save(path: Path, patch: dict) -> dict:
    """Merge a validated patch into the saved settings and write them.  `cameras` replaces per camera, not wholesale."""
    path = Path(path)
    cur = load(path)
    for k, v in patch.items():
        if k == "cameras":
            cur["cameras"] = {**cur["cameras"], **v}
        else:
            cur[k] = v
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(cur, indent=1), encoding="utf-8")
    os.replace(tmp, path)
    return cur
