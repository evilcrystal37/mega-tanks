"""
test_tile_registry.py — Tests for tile registry.
"""
from backend.tile_registry import get_tile, all_tiles, TILE_REGISTRY


def test_all_tiles_sorted():
    tiles = all_tiles()
    ids = [t.id for t in tiles]
    assert ids == sorted(ids)


def test_get_known_tile():
    brick = get_tile(1)
    assert brick.name == "brick"
    assert brick.tank_solid is True
    assert brick.bullet_solid is True
    assert brick.destructible is True


def test_base_tile_is_base():
    base = get_tile(6)
    assert base.is_base is True
    assert base.destructible is True


def test_ice_is_slippery():
    ice = get_tile(5)
    assert ice.slippery is True
    assert ice.tank_solid is False


def test_unknown_tile_defaults_to_empty():
    t = get_tile(999)
    assert t.id == 0
