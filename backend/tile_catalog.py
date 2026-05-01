"""
Derived tile catalogs built from TileType fields after registry + custom tiles load.

Engine and tools should prefer these over hard-coded ID sets where possible.
"""

from __future__ import annotations

from typing import Dict, FrozenSet, Tuple

# Populated by refresh_derived_tile_catalog()
CONTACT_DAMAGE_TILE_IDS: FrozenSet[int] = frozenset()
CONVEYOR_IDS: FrozenSet[int] = frozenset()
# Per-tick float delta (row, col) matching game_engine conveyor_speed=0.02
CONVEYOR_FLOAT_DELTA: Dict[int, Tuple[float, float]] = {}
LETTER_EFFECT_MAP: Dict[int, str] = {}
LETTER_PAD_IDS: FrozenSet[int] = frozenset()
TIMED_SPAWN_TILE_IDS: FrozenSet[int] = frozenset()


def refresh_derived_tile_catalog() -> None:
    """Rebuild derived sets from TILE_REGISTRY (call after builtins enriched + custom load)."""
    global CONTACT_DAMAGE_TILE_IDS, CONVEYOR_IDS, CONVEYOR_FLOAT_DELTA
    global LETTER_EFFECT_MAP, LETTER_PAD_IDS, TIMED_SPAWN_TILE_IDS

    from .tile_registry import all_tiles

    tiles = all_tiles()

    CONTACT_DAMAGE_TILE_IDS = frozenset(t.id for t in tiles if t.contact_damage)

    conv_ids: set[int] = set()
    conv_delta: Dict[int, Tuple[float, float]] = {}
    speed = 0.02
    for t in tiles:
        c = t.conveyor
        if not c:
            continue
        conv_ids.add(t.id)
        if c == "up":
            conv_delta[t.id] = (-speed, 0.0)
        elif c == "down":
            conv_delta[t.id] = (speed, 0.0)
        elif c == "left":
            conv_delta[t.id] = (0.0, -speed)
        elif c == "right":
            conv_delta[t.id] = (0.0, speed)
    CONVEYOR_IDS = frozenset(conv_ids)
    CONVEYOR_FLOAT_DELTA = conv_delta

    LETTER_EFFECT_MAP = {t.id: t.pickup_effect for t in tiles if t.pickup_effect}
    LETTER_PAD_IDS = frozenset(
        t.id for t in tiles if t.pickup_effect and 51 <= t.id <= 90 and (t.id - 51) % 4 == 0
    )
    TIMED_SPAWN_TILE_IDS = frozenset(t.id for t in tiles if t.spawn_timing == "timed")
