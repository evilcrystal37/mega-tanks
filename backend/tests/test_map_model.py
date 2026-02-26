"""
test_map_model.py — Tests for Map data model.
"""
import pytest
from backend.map_model import Map, GRID_WIDTH, GRID_HEIGHT


def test_default_map_is_valid():
    m = Map(name="test")
    assert m.is_valid()
    # Default base is at (20, 16) for 33x21 grid
    assert m.find_base() == (20, 16)


def test_custom_empty_map_invalid():
    # Force an empty grid
    m = Map(name="test")
    m.grid = [[0] * GRID_WIDTH for _ in range(GRID_HEIGHT)]
    errors = m.validate()
    assert any("Base" in e for e in errors)


def test_map_two_bases_invalid():
    m = Map(name="test")
    m.set_tile(0, 0, 6) # Add a second base
    errors = m.validate()
    assert any("one" in e.lower() or "exactly" in e.lower() for e in errors)


def test_set_tile_out_of_bounds():
    m = Map(name="test")
    m.set_tile(-1, 0, 1)    # should not raise
    m.set_tile(0, GRID_WIDTH, 1)
    # Check a tile that is NOT the default bricks/base
    assert m.grid[0][0] == 0  # unchanged


def test_serialization_roundtrip():
    m = Map(name="roundtrip")
    m.set_tile(0, 0, 1)
    restored = Map.from_json(m.to_json())
    assert restored.name == m.name
    assert restored.grid == m.grid
