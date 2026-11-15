"""
Tests for the IN/OUT line counter and the tunnel guard in live.py.

Pure logic: hand-built tracks, no model, no images, no server.
"""
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from live import LineCounter, is_public_allowed, came_through_tunnel  # noqa: E402


@dataclass
class T:
    """A track whose foot (bottom-centre of the box) is at (x, y)."""
    track_id: int
    x1: float
    y1: float
    x2: float
    y2: float


def car(tid, x, y):
    return T(tid, x - 40, y - 60, x + 40, y)


# Horizontal line across the frame at y=300.  The lot is above it (y<300), so a car
# moving up across the line is IN and one moving down is OUT.
def counter(**kw):
    return LineCounter((0, 300), (1000, 300), (500, 100), **kw)


def walk(c, tid, ys, x=500, t0=0.0, dt=1.0):
    events = []
    for i, y in enumerate(ys):
        events += c.update([car(tid, x, y)], now=t0 + i * dt)
    return events


def test_clean_entry_counts_once_as_in():
    c = counter()
    ev = walk(c, 1, [450, 380, 330, 270, 200])
    assert [e["type"] for e in ev] == ["in"]
    assert (c.count_in, c.count_out, c.inside) == (1, 0, 1)


def test_clean_exit_counts_once_as_out():
    c = counter(start_count=1)
    ev = walk(c, 1, [200, 270, 330, 380, 450])
    assert [e["type"] for e in ev] == ["out"]
    assert (c.count_in, c.count_out, c.inside) == (0, 1, 0)


def test_in_side_follows_the_chosen_point_not_the_line_direction():
    # Same line drawn the other way round, the lot is still above it.
    c = LineCounter((1000, 300), (0, 300), (500, 100))
    assert [e["type"] for e in walk(c, 1, [450, 380, 330, 270])] == ["in"]


def test_diagonal_line():
    c = LineCounter((0, 0), (1000, 1000), (900, 100))   # IN side is the upper-right
    ev = []
    for i, (x, y) in enumerate([(200, 500), (350, 450), (480, 420), (600, 380), (700, 300)]):
        ev += c.update([car(1, x, y)], now=float(i))
    # foot moves from below the diagonal (y > x) to above it (y < x)
    assert [e["type"] for e in ev] == ["in"]


def test_jitter_on_the_line_does_not_count():
    c = counter(min_cross_px=12)
    walk(c, 1, [330, 296, 304, 297, 305, 299, 301, 340])
    assert (c.count_in, c.count_out) == (0, 0)


def test_car_stopping_on_the_line_is_not_counted():
    c = counter()
    walk(c, 1, [420, 350, 310, 303, 303, 303, 303, 303])
    assert (c.count_in, c.count_out) == (0, 0)


def test_reversing_back_over_the_line_inside_the_cooldown_counts_once():
    c = counter(cooldown_s=3.0)
    ev = walk(c, 1, [350, 250, 350], dt=1.0)    # in, then straight back out within 2 s
    assert [e["type"] for e in ev] == ["in"]


def test_second_crossing_after_the_cooldown_is_counted():
    c = counter(cooldown_s=3.0)
    ev = walk(c, 1, [350, 250, 250, 250, 250, 350], dt=1.0)
    assert [e["type"] for e in ev] == ["in", "out"]
    assert c.inside == 0


def test_track_first_seen_beyond_the_line_is_not_counted():
    c = counter()
    assert walk(c, 1, [250, 220, 200]) == []


def test_two_cars_are_counted_independently():
    c = counter()
    for i, (a, b) in enumerate([(450, 150), (380, 220), (330, 270), (270, 330), (200, 400)]):
        c.update([car(1, 300, a), car(2, 700, b)], now=float(i))
    assert (c.count_in, c.count_out) == (1, 1)
    assert c.inside == 0


def test_synthetic_ids_are_ignored():
    c = counter()
    assert walk(c, 9001, [450, 380, 330, 270, 200]) == []


def test_expired_track_forgets_its_side():
    c = counter(expire_s=10.0)
    c.update([car(1, 500, 450)], now=0.0)
    c.update([], now=30.0)                         # long gap: the track is dropped
    # the same id reappears already beyond the line -> treated as a new track, no count
    assert c.update([car(1, 500, 200)], now=31.0) == []
    assert c.count_in == 0


def test_inside_never_goes_below_zero():
    c = counter()
    walk(c, 1, [200, 270, 330, 380, 450])          # one OUT with nobody inside
    assert c.count_out == 1
    assert c.inside == 0


def test_start_count_and_reset():
    c = counter(start_count=3)
    walk(c, 1, [450, 380, 330, 270])
    assert c.inside == 4
    c.reset()
    assert (c.count_in, c.count_out, c.inside) == (0, 0, 3)
    c.reset(start_count=0)
    assert c.inside == 0


def test_degenerate_line_is_rejected():
    with pytest.raises(ValueError):
        LineCounter((10, 10), (10, 10), (0, 0))


# ---- tunnel guard

@pytest.mark.parametrize("method,path", [
    ("GET", "/live"), ("GET", "/live/"), ("GET", "/live/state"), ("GET", "/live/frame.jpg"),
    ("GET", "/live/camera"), ("GET", "/static/live.html"), ("POST", "/live/frame"),
    ("POST", "/live/frame-raw"),
])
def test_public_routes_are_allowed(method, path):
    assert is_public_allowed(method, path)


@pytest.mark.parametrize("method,path", [
    ("POST", "/occupancy/bays"), ("GET", "/occupancy/bays"), ("POST", "/stream/start"),
    ("POST", "/live/config"), ("POST", "/live/reset"), ("GET", "/live/setup"),
    ("POST", "/occupancy/check"), ("POST", "/gate-event"), ("POST", "/detect"),
    ("GET", "/health"), ("GET", "/"), ("GET", "/occupancy"), ("DELETE", "/live/state"),
    ("PUT", "/live/frame"), ("GET", "/staticx/live.html"), ("POST", "/static/live.html"),
    ("GET", "/live/frame-raw"), ("PUT", "/live/frame-raw"),
])
def test_everything_else_is_blocked(method, path):
    assert not is_public_allowed(method, path)


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "::1", "::ffff:127.0.0.1"])
def test_loopback_addresses_are_this_machine(host):
    from live import is_loopback
    assert is_loopback(host)


@pytest.mark.parametrize("host", ["192.168.1.50", "10.0.0.7", "203.0.113.9", "2405:201::1",
                                  "::ffff:192.168.1.5", "testclient", "", None, "localhost"])
def test_anything_else_is_not(host):
    from live import is_loopback
    assert not is_loopback(host)


def test_remote_means_tunnel_or_not_loopback():
    from live import is_remote
    assert not is_remote("127.0.0.1", {"host": "localhost:8008"})
    assert is_remote("127.0.0.1", {"cf-connecting-ip": "1.2.3.4"})       # tunnel: cloudflared is local
    assert is_remote("192.168.1.50", {"host": "192.168.1.20:8008"})      # another device on the LAN
    assert is_remote(None, {})                                           # unknown client: be safe


def test_tunnel_detection_uses_cloudflare_headers():
    assert came_through_tunnel({"cf-connecting-ip": "1.2.3.4"})
    assert came_through_tunnel({"cf-ray": "abc"})
    assert not came_through_tunnel({"host": "localhost:8008"})
