"""Shared test setup."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(autouse=True)
def _isolated_state_dir(tmp_path, monkeypatch):
    """
    Tests that save bays or counts must never write into the real ./data folder, and must never
    read a layout a previous run left there.
    """
    import state_store
    monkeypatch.setattr(state_store, "DATA_DIR", tmp_path / "state")
