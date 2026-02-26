"""
tile_registry.py — Extensible tile type definitions for Battle Tanks.

To add a new tile type:
1. Add an entry to TILE_REGISTRY with a unique integer ID.
2. The tile will automatically appear in the map editor palette and
   have its properties respected by the game engine.
"""

from dataclasses import dataclass, field
from typing import Dict


@dataclass(frozen=True)
class TileType:
    id: int
    name: str
    label: str          # Short display label
    color: str          # CSS hex color for frontend rendering
    tank_solid: bool    # Impassable to tanks
    bullet_solid: bool  # Impassable to bullets
    destructible: bool  # Can be destroyed by bullets
    transparent: bool   # Tanks are hidden when inside (forest)
    slippery: bool      # Reduced friction (ice)
    is_base: bool = False  # Eagle / HQ — destroying = game loss


# ---------------------------------------------------------------------------
# Registry — single source of truth for all tile types
# ---------------------------------------------------------------------------
TILE_REGISTRY: Dict[int, TileType] = {
    0: TileType(
        id=0, name="empty", label="Empty",
        color="#1a1a2e",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    1: TileType(
        id=1, name="brick", label="Brick",
        color="#c0522a",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
    ),
    2: TileType(
        id=2, name="steel", label="Steel",
        color="#7a8fa6",
        tank_solid=True, bullet_solid=True, destructible=False, transparent=False, slippery=False,
    ),
    3: TileType(
        id=3, name="water", label="Water",
        color="#1565c0",
        tank_solid=True, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    4: TileType(
        id=4, name="forest", label="Forest",
        color="#2e7d32",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=True, slippery=False,
    ),
    5: TileType(
        id=5, name="ice", label="Ice",
        color="#80deea",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=True,
    ),
    6: TileType(
        id=6, name="base", label="Base",
        color="#f5c518",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        is_base=True,
    ),
}


def get_tile(tile_id: int) -> TileType:
    """Return a TileType by ID, defaulting to empty if unknown."""
    return TILE_REGISTRY.get(tile_id, TILE_REGISTRY[0])


def all_tiles() -> list[TileType]:
    """Return all tile types sorted by ID (for palette rendering)."""
    return sorted(TILE_REGISTRY.values(), key=lambda t: t.id)
