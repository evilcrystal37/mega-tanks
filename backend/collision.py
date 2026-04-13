"""
Collision helpers extracted from GameEngine.
"""

from __future__ import annotations

from .tank import Tank


def can_big_tank_crush(tile: 'TileType', base_tile_id: int, mover: Tank, big_box_ids: set[int]) -> bool:
    """Shared check used by movement/collision paths."""
    base_protected = mover.is_player and tile.id == base_tile_id
    # Cannot crush if it's protected base, a big box powerup, or specifically marked as jaw_proof
    if tile.jaw_proof or tile.id in big_box_ids or base_protected:
        return False
    return (mover.mushroom_ticks > 0 or mover.is_big)
