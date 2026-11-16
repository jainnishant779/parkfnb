"""
Behavioural tests for the temporal state machine in ParkingIntelligenceEngine.

Drives the engine with hand-built BayObservation objects, so no YOLO weights,
no images and no OCR -- it runs in milliseconds and is safe on a low-memory box.
The fixture suite in test_fixtures/ covers the real-image path separately.
"""
import sys
import time
from pathlib import Path

import pytest
from shapely.geometry import box as shapely_box

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from intelligence import (  # noqa: E402
    STATE_CORRECT,
    STATE_OCCLUDED,
    STATE_SUSPICIOUS,
    STATE_WRONG,
)
from occupancy import BayMap, BayObservation, ParkingIntelligenceEngine  # noqa: E402


BAY_ID = "Bay-01"


def _engine():
    bays = {BAY_ID: [[0, 0], [100, 0], [100, 200], [0, 200]]}
    return ParkingIntelligenceEngine(BayMap(bays, view="medium"))


def _obs(state, outside_pct=0.0, occlusion=0.0, occl_state="visible", quality="correct"):
    return BayObservation(
        bay_id=BAY_ID,
        state=state,
        coverage=0.5,
        vehicle_index=0,
        parking_quality=quality,
        outside_slot_percent=outside_pct,
        occlusion_level=occlusion,
        occlusion_state=occl_state,
        vehicle_track_id=1,
    )


def _pump(engine, obs, times=1):
    """Feed the same observation N times, bypassing detection entirely."""
    for _ in range(times):
        engine.update([], observations=[obs])
    return engine.states[BAY_ID]


# --- bootstrap behaviour ----------------------------------------------------

def test_borderline_wrong_is_debounced_on_first_frame():
    """A car mid-manoeuvre must not fire WRONG on the very first frame."""
    st = _pump(_engine(), _obs(STATE_WRONG, outside_pct=30.0))
    assert st.state == STATE_SUSPICIOUS
    assert st.wrong_since is not None


def test_extreme_violation_is_wrong_immediately():
    """Half the car outside its bay needs no benefit of the doubt."""
    st = _pump(_engine(), _obs(STATE_WRONG, outside_pct=60.0))
    assert st.state == STATE_WRONG


def test_correct_parking_sets_no_timer():
    st = _pump(_engine(), _obs(STATE_CORRECT))
    assert st.state == STATE_CORRECT
    assert st.wrong_since is None


# --- the Phase 3 fix: occlusion must not reset the violation timer ----------

def test_occlusion_preserves_the_violation_timer():
    """
    A car that is already mis-parked stays mis-parked when a van drives in
    front of it.  Before the fix, `wrong_since` was cleared here, so a vehicle
    in a busy lane could dodge the persistence threshold forever.
    """
    eng = _engine()
    violating = _obs(STATE_WRONG, outside_pct=30.0, quality="wrong")

    # Build up a violation history so we are past the bootstrap branch.
    _pump(eng, violating, times=4)
    timer_before = eng.states[BAY_ID].wrong_since
    assert timer_before is not None

    # Now something blocks the view.
    st = _pump(eng, _obs(STATE_OCCLUDED, occlusion=0.8, occl_state="heavily_occluded"))

    assert st.state == STATE_OCCLUDED
    assert st.wrong_since == timer_before, "occlusion must not restart the clock"


def test_violation_confirms_after_persistence_window():
    """Once the violation has persisted long enough it is confirmed WRONG."""
    eng = _engine()
    eng.thresholds.min_persistence_seconds = 0.05
    violating = _obs(STATE_WRONG, outside_pct=30.0, quality="wrong")

    st = _pump(eng, violating, times=4)
    assert st.state == STATE_SUSPICIOUS      # not yet persisted

    time.sleep(0.06)
    st = _pump(eng, violating)
    assert st.state == STATE_WRONG


def test_corrected_parking_clears_the_timer():
    """A driver who straightens up is forgiven -- that is what clears it."""
    eng = _engine()
    _pump(eng, _obs(STATE_WRONG, outside_pct=30.0, quality="wrong"), times=4)
    assert eng.states[BAY_ID].wrong_since is not None

    st = _pump(eng, _obs(STATE_CORRECT), times=4)
    assert st.state == STATE_CORRECT
    assert st.wrong_since is None


def test_occluded_then_clear_still_confirms_the_violation():
    """
    End to end: violate, get briefly occluded, come back still violating.
    The occluded frames must not have bought the vehicle a fresh clock.
    """
    eng = _engine()
    eng.thresholds.min_persistence_seconds = 0.05
    violating = _obs(STATE_WRONG, outside_pct=30.0, quality="wrong")

    _pump(eng, violating, times=4)
    _pump(eng, _obs(STATE_OCCLUDED, occlusion=0.8, occl_state="heavily_occluded"), times=2)
    time.sleep(0.06)

    st = _pump(eng, violating)
    assert st.state == STATE_WRONG
