"""Tests for the state-code sanity check applied to plates read from the live feed."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from live import plausible_indian_plate  # noqa: E402


@pytest.mark.parametrize("plate", [
    "MH12AB1234", "KA01AB1234", "GJ05SS5555", "DL3CAB1234", "MP09CD1234", "MP09C1234",
    "UP32AB1234", "UP32A1234", "TS09EA1234", "RJ14CV0001", "mh12ab1234", "MH 12 AB 1234",
    "22BH1234AA", "21BH0001A",
])
def test_real_plates_pass(plate):
    assert plausible_indian_plate(plate)


@pytest.mark.parametrize("text", [
    "JU1N6181", "IS0PE7106", "EC05SS5555", "17907ABFS8Q", "LSOON8", "", "MH12AB123",
    "MH12AB12345", "XX12AB1234", "12MH34AB56", "22XX1234AA", "MH1234ABAB",
])
def test_garbled_reads_are_rejected(text):
    assert not plausible_indian_plate(text)
