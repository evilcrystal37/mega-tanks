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
    speed_mult: float = 1.0 # Speed multiplier for tanks (mud)
    is_explosive: bool = False # Detonates on hit (TNT)
    non_repeating: bool = False # Renders as one big block instead of 4 sub-blocks


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
    7: TileType(
        id=7, name="lava", label="Lava",
        color="#ff3300",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    8: TileType(
        id=8, name="conveyor_up", label="Conv Up",
        color="#333333",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    9: TileType(
        id=9, name="conveyor_down", label="Conv Down",
        color="#333333",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    10: TileType(
        id=10, name="conveyor_left", label="Conv Left",
        color="#333333",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    11: TileType(
        id=11, name="conveyor_right", label="Conv Right",
        color="#333333",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    12: TileType(
        id=12, name="mud", label="Sand",
        color="#c8a84b",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        speed_mult=0.25,
    ),
    13: TileType(
        id=13, name="ramp", label="Ramp",
        color="#ff9800",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
    ),
    14: TileType(
        id=14, name="tnt", label="TNT",
        color="#d32f2f",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        is_explosive=True,
        non_repeating=True,
    ),
    15: TileType(
        id=15, name="glass", label="Glass",
        color="#aaddff",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
    ),
    16: TileType(
        id=16, name="glass_crack1", label="Glass C1",
        color="#aaddff",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
    ),
    17: TileType(
        id=17, name="glass_crack2", label="Glass C2",
        color="#aaddff",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
    ),
    18: TileType(
        id=18, name="sunflower", label="Sunflower",
        color="#ffeb3b",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=True, slippery=False,
        non_repeating=True,
    ),
    20: TileType(
        id=20, name="sandworm_head", label="Worm H",
        color="#8b4513",
        tank_solid=True, bullet_solid=True, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    21: TileType(
        id=21, name="sandworm_body", label="Worm B",
        color="#a0522d",
        tank_solid=True, bullet_solid=True, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    23: TileType(
        id=23, name="rainbow_pad", label="Rainbow Pad",
        color="#aaddff",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    24: TileType(
        id=24, name="grow_mushroom", label="Mushroom",
        color="#8bc34a",
        tank_solid=False, bullet_solid=False, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    25: TileType(
        id=25, name="auto_turret", label="Auto Turret",
        color="#607d8b",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    26: TileType(
        id=26, name="mushroom_crack2", label="Mush C2",
        color="#8bc34a",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    27: TileType(
        id=27, name="mushroom_crack1", label="Mush C1",
        color="#8bc34a",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    28: TileType(
        id=28, name="mushroom_box", label="Mush Box",
        color="#8bc34a",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    29: TileType(
        id=29, name="rainbow_crack2", label="Rainbow C2",
        color="#ff69b4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    30: TileType(
        id=30, name="rainbow_crack1", label="Rainbow C1",
        color="#ff69b4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    31: TileType(
        id=31, name="rainbow_box", label="Rainbow Box",
        color="#ff69b4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
}


def get_tile(tile_id: int) -> TileType:
    """Return a TileType by ID, defaulting to empty if unknown."""
    return TILE_REGISTRY.get(tile_id, TILE_REGISTRY[0])


def all_tiles() -> list[TileType]:
    """Return all tile types sorted by ID (for palette rendering)."""
    return sorted(TILE_REGISTRY.values(), key=lambda t: t.id)
