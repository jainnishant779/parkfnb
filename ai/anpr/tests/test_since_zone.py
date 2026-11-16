"""
The bay's "since" must carry its time zone.  The server runs on UTC; an operator's browser is on IST.  A time with no zone
("2026-10-27T12:29:00") is read by the browser as its own local time, so the Vehicles page said a car arrived at 12:29 PM
when it was 5:59 PM.  And the static files must be revalidated, or an operator keeps the page of the last deploy.
"""
import sys
import time
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402
import status as st  # noqa: E402


def test_since_and_the_override_end_carry_the_zone_and_are_the_right_instant():
    t = time.time() - 300
    until = time.time() + 900
    out = st.compose_bays({"a": {"state": "occupied", "since": t, "seen_vehicle": True}},
                          overrides={"a": {"status": "VACANT", "until": until}})["a"]
    for key, epoch in (("since", t), ("override_until", until)):
        parsed = datetime.fromisoformat(out[key])
        assert parsed.tzinfo is not None                                      # a zone, so no browser reads it as its own time
        assert parsed.timestamp() == pytest.approx(epoch, abs=1)              # and it is the same instant


def test_the_consoles_scripts_are_revalidated_not_kept():
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    r = c.get("/static/js/console.js")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-cache" and r.headers.get("etag")
    assert c.get("/static/js/console.js", headers={"If-None-Match": r.headers["etag"]}).status_code == 304     # cheap when unchanged
