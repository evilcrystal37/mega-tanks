"""
Collision helpers extracted from GameEngine.
"""

from __future__ import annotations

from .tank import Tank


def can_big_tank_crush(tile_id: int, base_tile_id: int, mover: Tank, big_box_ids: set[int]) -> bool:
    """Shared check used by movement/collision paths."""
    base_protected = mover.is_player and tile_id == base_tile_id
    return (mover.mushroom_ticks > 0 or mover.is_big) and tile_id not in big_box_ids and not base_protected
