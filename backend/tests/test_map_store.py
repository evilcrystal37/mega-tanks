"""
test_map_store.py — Tests for map persistence layer.
"""
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch

from backend.map_model import Map
from backend import map_store


@pytest.fixture
def tmp_maps(tmp_path):
    """Redirect maps directory to a temp folder for each test."""
    with patch.object(map_store, "MAPS_DIR", tmp_path):
        yield tmp_path


def _make_map(name="test_map"):
    m = Map(name=name)
    m.set_tile(13, 13, 6)
    return m


def test_save_and_load(tmp_maps):
    m = _make_map()
    map_store.save_map(m)
    restored = map_store.load_map("test_map")
    assert restored.name == "test_map"
    assert restored.grid[13][13] == 6


def test_list_maps(tmp_maps):
    map_store.save_map(_make_map("alpha"))
    map_store.save_map(_make_map("beta"))
    names = map_store.list_maps()
    assert "alpha" in names
    assert "beta" in names


def test_delete_map(tmp_maps):
    map_store.save_map(_make_map("to_delete"))
    assert map_store.delete_map("to_delete") is True
    assert "to_delete" not in map_store.list_maps()


def test_delete_missing(tmp_maps):
    assert map_store.delete_map("ghost") is False


def test_load_missing_raises(tmp_maps):
    with pytest.raises(FileNotFoundError):
        map_store.load_map("nope")
