"""
test_tile_registry.py — Tests for tile registry.
"""
from backend.tile_registry import get_tile, all_tiles, TILE_REGISTRY, tile_type_to_dict


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
    t = get_tile(99999)
    assert t.id == 0


def test_tile_type_to_dict_has_all_dataclass_fields():
    brick = get_tile(1)
    d = tile_type_to_dict(brick)
    for key in (
        "id", "name", "label", "color", "tank_solid", "bullet_solid", "destructible",
        "transparent", "slippery", "is_base", "speed_mult", "is_explosive", "non_repeating",
        "extra_big", "lossless_sprite",
        "explosion_radius", "is_system", "is_box", "partial_destructible",
        "damage_target_id", "jaw_proof", "walkable", "mobile", "creature_affinity",
    ):
        assert key in d
    assert d["id"] == 1
    assert d["speed_mult"] == 1.0
    assert d["is_explosive"] is False
