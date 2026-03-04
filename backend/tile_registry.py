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
    explosion_radius: int = 2  # How many tiles out the blast reaches (default: 2 = 5×5 area)


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
    32: TileType(
        id=32, name="chick_pad", label="Chick",
        color="#ffee58",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    33: TileType(
        id=33, name="chick_crack2", label="Chick C2",
        color="#ffee58",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    34: TileType(
        id=34, name="chick_crack1", label="Chick C1",
        color="#ffee58",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    35: TileType(
        id=35, name="chick_box", label="Chick Box",
        color="#ffee58",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    36: TileType(
        id=36, name="special_tnt", label="Special TNT",
        color="#d32f2f",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        is_explosive=True,
        non_repeating=True,
        explosion_radius=7,
    ),
    37: TileType(
        id=37, name="money_pad", label="Money",
        color="#FFD700",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    38: TileType(
        id=38, name="money_crack2", label="Money C2",
        color="#FFD700",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    39: TileType(
        id=39, name="money_crack1", label="Money C1",
        color="#FFD700",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    40: TileType(
        id=40, name="money_box", label="Money Box",
        color="#FFD700",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    41: TileType(
        id=41, name="golden_frame", label="Gold Frame",
        color="#DAA520",
        tank_solid=True, bullet_solid=True, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    42: TileType(
        id=42, name="bone_frame", label="Bone Frame",
        color="#F5F5DC",
        tank_solid=True, bullet_solid=True, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
}

# ---------------------------------------------------------------------------
# Tile ID constants and groups
# ---------------------------------------------------------------------------
EMPTY = 0
BRICK = 1
STEEL = 2
WATER = 3
FOREST = 4
ICE = 5
BASE = 6
LAVA = 7
CONVEYOR_UP = 8
CONVEYOR_DOWN = 9
CONVEYOR_LEFT = 10
CONVEYOR_RIGHT = 11
MUD = 12
RAMP = 13
TNT = 14
GLASS = 15
GLASS_CRACK1 = 16
GLASS_CRACK2 = 17
SUNFLOWER = 18
SANDWORM_HEAD = 20
SANDWORM_BODY = 21
RAINBOW_PAD = 23
MUSHROOM_PAD = 24
AUTO_TURRET = 25
MUSHROOM_CRACK2 = 26
MUSHROOM_CRACK1 = 27
MUSHROOM_BOX = 28
RAINBOW_CRACK2 = 29
RAINBOW_CRACK1 = 30
RAINBOW_BOX = 31
CHICK_PAD = 32
CHICK_CRACK2 = 33
CHICK_CRACK1 = 34
CHICK_BOX = 35
SPECIAL_TNT = 36
MONEY_PAD = 37
MONEY_CRACK2 = 38
MONEY_CRACK1 = 39
MONEY_BOX = 40
GOLDEN_FRAME = 41
BONE_FRAME = 42

CONVEYOR_IDS = {CONVEYOR_UP, CONVEYOR_DOWN, CONVEYOR_LEFT, CONVEYOR_RIGHT}
GLASS_IDS = {GLASS, GLASS_CRACK1, GLASS_CRACK2}
MUSHROOM_BOX_IDS = {MUSHROOM_CRACK2, MUSHROOM_CRACK1, MUSHROOM_BOX}
RAINBOW_BOX_IDS = {RAINBOW_CRACK2, RAINBOW_CRACK1, RAINBOW_BOX}
CHICK_BOX_IDS = {CHICK_CRACK2, CHICK_CRACK1, CHICK_BOX}
MONEY_BOX_IDS = {MONEY_CRACK2, MONEY_CRACK1, MONEY_BOX}
BIG_BOX_IDS = MUSHROOM_BOX_IDS | RAINBOW_BOX_IDS | CHICK_BOX_IDS | MONEY_BOX_IDS
BIG_BOX_OR_PAD_IDS = BIG_BOX_IDS | {MUSHROOM_PAD, RAINBOW_PAD, CHICK_PAD, MONEY_PAD}

GLASS_BOX_GROUPS = {
    "mushroom": (MUSHROOM_BOX, MUSHROOM_CRACK1, MUSHROOM_CRACK2, MUSHROOM_PAD),
    "rainbow": (RAINBOW_BOX, RAINBOW_CRACK1, RAINBOW_CRACK2, RAINBOW_PAD),
    "chick": (CHICK_BOX, CHICK_CRACK1, CHICK_CRACK2, CHICK_PAD),
    "money": (MONEY_BOX, MONEY_CRACK1, MONEY_CRACK2, MONEY_PAD),
}


def get_tile(tile_id: int) -> TileType:
    """Return a TileType by ID, defaulting to empty if unknown."""
    return TILE_REGISTRY.get(tile_id, TILE_REGISTRY[0])


def all_tiles() -> list[TileType]:
    """Return all tile types sorted by ID (for palette rendering)."""
    return sorted(TILE_REGISTRY.values(), key=lambda t: t.id)
