"""Sanity checks for derived tile catalog (must stay aligned with registry metadata)."""

from backend import tile_catalog as tc
from backend.tile_registry import (
    BANANA_PAD,
    CONVEYOR_RIGHT,
    LAVA,
    reload_custom_tiles_from_disk,
)


def test_derived_catalog_after_reload():
    reload_custom_tiles_from_disk()

    assert LAVA in tc.CONTACT_DAMAGE_TILE_IDS
    assert CONVEYOR_RIGHT in tc.CONVEYOR_IDS
    assert tc.CONVEYOR_FLOAT_DELTA[CONVEYOR_RIGHT] == (0.0, 0.02)
    assert BANANA_PAD in tc.LETTER_PAD_IDS
    assert tc.LETTER_EFFECT_MAP.get(BANANA_PAD) == "banana"
    assert BANANA_PAD in tc.TIMED_SPAWN_TILE_IDS
