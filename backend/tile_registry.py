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
    # NOTE: Money, Sun, and Mega Gun tiles (IDs 37-50) are timed powerups that spawn
    # dynamically during gameplay. They should NEVER be manually placeable in the map editor.
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
    43: TileType(
        id=43, name="sun_pad", label="Sun",
        color="#FF8C00",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    44: TileType(
        id=44, name="sun_crack2", label="Sun C2",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    45: TileType(
        id=45, name="sun_crack1", label="Sun C1",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    46: TileType(
        id=46, name="sun_box", label="Sun Box",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    47: TileType(
        id=47, name="megagun_pad", label="Mega Gun",
        color="#4A4A4A",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    48: TileType(
        id=48, name="megagun_crack2", label="MegaG C2",
        color="#4A4A4A",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    49: TileType(
        id=49, name="megagun_crack1", label="MegaG C1",
        color="#4A4A4A",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    50: TileType(
        id=50, name="megagun_box", label="MegaG Box",
        color="#4A4A4A",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # -----------------------------------------------------------------------
    # Letter Powerups (timed spawn only) — IDs 51–90
    # Each letter has 4 tiles: pad, crack2, crack1, box
    # -----------------------------------------------------------------------
    # B — Banana (Big Banana impact)
    51: TileType(
        id=51, name="banana_pad", label="Banana Pad",
        color="#FFE135",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    52: TileType(
        id=52, name="banana_crack2", label="Banana C2",
        color="#FFE135",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    53: TileType(
        id=53, name="banana_crack1", label="Banana C1",
        color="#FFE135",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    54: TileType(
        id=54, name="banana_box", label="Banana Box",
        color="#FFE135",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # C — Clone
    55: TileType(
        id=55, name="clone_pad", label="Clone Pad",
        color="#00CED1",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    56: TileType(
        id=56, name="clone_crack2", label="Clone C2",
        color="#00CED1",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    57: TileType(
        id=57, name="clone_crack1", label="Clone C1",
        color="#00CED1",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    58: TileType(
        id=58, name="clone_box", label="Clone Box",
        color="#00CED1",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # F — Fireworks
    59: TileType(
        id=59, name="fireworks_pad", label="Fireworks Pad",
        color="#FF1493",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    60: TileType(
        id=60, name="fireworks_crack2", label="Fireworks C2",
        color="#FF1493",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    61: TileType(
        id=61, name="fireworks_crack1", label="Fireworks C1",
        color="#FF1493",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    62: TileType(
        id=62, name="fireworks_box", label="Fireworks Box",
        color="#FF1493",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # J — Jump
    63: TileType(
        id=63, name="jump_pad", label="Jump Pad",
        color="#9370DB",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    64: TileType(
        id=64, name="jump_crack2", label="Jump C2",
        color="#9370DB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    65: TileType(
        id=65, name="jump_crack1", label="Jump C1",
        color="#9370DB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    66: TileType(
        id=66, name="jump_box", label="Jump Box",
        color="#9370DB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # R — Rainbow World
    67: TileType(
        id=67, name="rainbow_world_pad", label="Rainbow Pad",
        color="#FF69B4",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    68: TileType(
        id=68, name="rainbow_world_crack2", label="Rainbow C2",
        color="#FF69B4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    69: TileType(
        id=69, name="rainbow_world_crack1", label="Rainbow C1",
        color="#FF69B4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    70: TileType(
        id=70, name="rainbow_world_box", label="Rainbow Box",
        color="#FF69B4",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # A — Airplane
    71: TileType(
        id=71, name="airplane_pad", label="Airplane Pad",
        color="#87CEEB",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    72: TileType(
        id=72, name="airplane_crack2", label="Airplane C2",
        color="#87CEEB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    73: TileType(
        id=73, name="airplane_crack1", label="Airplane C1",
        color="#87CEEB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    74: TileType(
        id=74, name="airplane_box", label="Airplane Box",
        color="#87CEEB",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # M — Magnet
    75: TileType(
        id=75, name="magnet_pad", label="Magnet Pad",
        color="#DC143C",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    76: TileType(
        id=76, name="magnet_crack2", label="Magnet C2",
        color="#DC143C",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    77: TileType(
        id=77, name="magnet_crack1", label="Magnet C1",
        color="#DC143C",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    78: TileType(
        id=78, name="magnet_box", label="Magnet Box",
        color="#DC143C",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # S — Sahur (tum-tum runner)
    79: TileType(
        id=79, name="sahur_pad", label="Sahur Pad",
        color="#FF8C00",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    80: TileType(
        id=80, name="sahur_crack2", label="Sahur C2",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    81: TileType(
        id=81, name="sahur_crack1", label="Sahur C1",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    82: TileType(
        id=82, name="sahur_box", label="Sahur Box",
        color="#FF8C00",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # Z — Zzz (sleep)
    83: TileType(
        id=83, name="zzz_pad", label="Zzz Pad",
        color="#9932CC",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    84: TileType(
        id=84, name="zzz_crack2", label="Zzz C2",
        color="#9932CC",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    85: TileType(
        id=85, name="zzz_crack1", label="Zzz C1",
        color="#9932CC",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    86: TileType(
        id=86, name="zzz_box", label="Zzz Box",
        color="#9932CC",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # O — Octopus (base shield)
    87: TileType(
        id=87, name="octopus_pad", label="Octopus Pad",
        color="#20B2AA",
        tank_solid=False, bullet_solid=False, destructible=False, transparent=False, slippery=False,
        non_repeating=True,
    ),
    88: TileType(
        id=88, name="octopus_crack2", label="Octopus C2",
        color="#20B2AA",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    89: TileType(
        id=89, name="octopus_crack1", label="Octopus C1",
        color="#20B2AA",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    90: TileType(
        id=90, name="octopus_box", label="Octopus Box",
        color="#20B2AA",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    # -----------------------------------------------------------------------
    # Flora and Ant ecosystem (IDs 91-96)
    # -----------------------------------------------------------------------
    91: TileType(
        id=91, name="tree", label="Tree",
        color="#2e7d32",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=True, slippery=False,
        non_repeating=True,
    ),
    92: TileType(
        id=92, name="apple", label="Apple",
        color="#ff0000",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    93: TileType(
        id=93, name="ant_pile_friendly", label="F-Pile",
        color="#8B4513",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
        non_repeating=True,
    ),
    94: TileType(
        id=94, name="ant_pile_evil", label="E-Pile",
        color="#4A0E4E",
        tank_solid=True, bullet_solid=True, destructible=True, transparent=False, slippery=False,
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
SUN_PAD = 43
SUN_CRACK2 = 44
SUN_CRACK1 = 45
SUN_BOX = 46
MEGAGUN_PAD = 47
MEGAGUN_CRACK2 = 48
MEGAGUN_CRACK1 = 49
MEGAGUN_BOX = 50

# Letter Powerups — IDs 51–90
BANANA_PAD = 51
BANANA_CRACK2 = 52
BANANA_CRACK1 = 53
BANANA_BOX = 54
CLONE_PAD = 55
CLONE_CRACK2 = 56
CLONE_CRACK1 = 57
CLONE_BOX = 58
FIREWORKS_PAD = 59
FIREWORKS_CRACK2 = 60
FIREWORKS_CRACK1 = 61
FIREWORKS_BOX = 62
JUMP_PAD = 63
JUMP_CRACK2 = 64
JUMP_CRACK1 = 65
JUMP_BOX = 66
RAINBOW_WORLD_PAD = 67
RAINBOW_WORLD_CRACK2 = 68
RAINBOW_WORLD_CRACK1 = 69
RAINBOW_WORLD_BOX = 70
AIRPLANE_PAD = 71
AIRPLANE_CRACK2 = 72
AIRPLANE_CRACK1 = 73
AIRPLANE_BOX = 74
MAGNET_PAD = 75
MAGNET_CRACK2 = 76
MAGNET_CRACK1 = 77
MAGNET_BOX = 78
SAHUR_PAD = 79
SAHUR_CRACK2 = 80
SAHUR_CRACK1 = 81
SAHUR_BOX = 82
ZZZ_PAD = 83
ZZZ_CRACK2 = 84
ZZZ_CRACK1 = 85
ZZZ_BOX = 86
OCTOPUS_PAD = 87
OCTOPUS_CRACK2 = 88
OCTOPUS_CRACK1 = 89
OCTOPUS_BOX = 90

TREE = 91
APPLE = 92
ANT_PILE_FRIENDLY = 93
ANT_PILE_EVIL = 94

CONVEYOR_IDS = {CONVEYOR_UP, CONVEYOR_DOWN, CONVEYOR_LEFT, CONVEYOR_RIGHT}
GLASS_IDS = {GLASS, GLASS_CRACK1, GLASS_CRACK2}
MUSHROOM_BOX_IDS = {MUSHROOM_CRACK2, MUSHROOM_CRACK1, MUSHROOM_BOX}
RAINBOW_BOX_IDS = {RAINBOW_CRACK2, RAINBOW_CRACK1, RAINBOW_BOX}
CHICK_BOX_IDS = {CHICK_CRACK2, CHICK_CRACK1, CHICK_BOX}
MONEY_BOX_IDS = {MONEY_CRACK2, MONEY_CRACK1, MONEY_BOX}
SUN_BOX_IDS = {SUN_CRACK2, SUN_CRACK1, SUN_BOX}
MEGAGUN_BOX_IDS = {MEGAGUN_CRACK2, MEGAGUN_CRACK1, MEGAGUN_BOX}
BIG_BOX_IDS = MUSHROOM_BOX_IDS | RAINBOW_BOX_IDS | CHICK_BOX_IDS | MONEY_BOX_IDS | SUN_BOX_IDS | MEGAGUN_BOX_IDS
BIG_BOX_OR_PAD_IDS = BIG_BOX_IDS | {MUSHROOM_PAD, RAINBOW_PAD, CHICK_PAD, MONEY_PAD, SUN_PAD, MEGAGUN_PAD}

GLASS_BOX_GROUPS = {
    "mushroom": (MUSHROOM_BOX, MUSHROOM_CRACK1, MUSHROOM_CRACK2, MUSHROOM_PAD),
    "rainbow": (RAINBOW_BOX, RAINBOW_CRACK1, RAINBOW_CRACK2, RAINBOW_PAD),
    "chick": (CHICK_BOX, CHICK_CRACK1, CHICK_CRACK2, CHICK_PAD),
    "money": (MONEY_BOX, MONEY_CRACK1, MONEY_CRACK2, MONEY_PAD),
    "sun": (SUN_BOX, SUN_CRACK1, SUN_CRACK2, SUN_PAD),
    "megagun": (MEGAGUN_BOX, MEGAGUN_CRACK1, MEGAGUN_CRACK2, MEGAGUN_PAD),
    "banana": (BANANA_BOX, BANANA_CRACK1, BANANA_CRACK2, BANANA_PAD),
    "clone": (CLONE_BOX, CLONE_CRACK1, CLONE_CRACK2, CLONE_PAD),
    "fireworks": (FIREWORKS_BOX, FIREWORKS_CRACK1, FIREWORKS_CRACK2, FIREWORKS_PAD),
    "jump": (JUMP_BOX, JUMP_CRACK1, JUMP_CRACK2, JUMP_PAD),
    "rainbow_world": (RAINBOW_WORLD_BOX, RAINBOW_WORLD_CRACK1, RAINBOW_WORLD_CRACK2, RAINBOW_WORLD_PAD),
    "airplane": (AIRPLANE_BOX, AIRPLANE_CRACK1, AIRPLANE_CRACK2, AIRPLANE_PAD),
    "magnet": (MAGNET_BOX, MAGNET_CRACK1, MAGNET_CRACK2, MAGNET_PAD),
    "sahur": (SAHUR_BOX, SAHUR_CRACK1, SAHUR_CRACK2, SAHUR_PAD),
    "zzz": (ZZZ_BOX, ZZZ_CRACK1, ZZZ_CRACK2, ZZZ_PAD),
    "octopus": (OCTOPUS_BOX, OCTOPUS_CRACK1, OCTOPUS_CRACK2, OCTOPUS_PAD),
}

# Letter powerup box ID sets
BANANA_BOX_IDS = {BANANA_CRACK2, BANANA_CRACK1, BANANA_BOX}
CLONE_BOX_IDS = {CLONE_CRACK2, CLONE_CRACK1, CLONE_BOX}
FIREWORKS_BOX_IDS = {FIREWORKS_CRACK2, FIREWORKS_CRACK1, FIREWORKS_BOX}
JUMP_BOX_IDS = {JUMP_CRACK2, JUMP_CRACK1, JUMP_BOX}
RAINBOW_WORLD_BOX_IDS = {RAINBOW_WORLD_CRACK2, RAINBOW_WORLD_CRACK1, RAINBOW_WORLD_BOX}
AIRPLANE_BOX_IDS = {AIRPLANE_CRACK2, AIRPLANE_CRACK1, AIRPLANE_BOX}
MAGNET_BOX_IDS = {MAGNET_CRACK2, MAGNET_CRACK1, MAGNET_BOX}
SAHUR_BOX_IDS = {SAHUR_CRACK2, SAHUR_CRACK1, SAHUR_BOX}
ZZZ_BOX_IDS = {ZZZ_CRACK2, ZZZ_CRACK1, ZZZ_BOX}
OCTOPUS_BOX_IDS = {OCTOPUS_CRACK2, OCTOPUS_CRACK1, OCTOPUS_BOX}

# All letter box IDs (for BIG_BOX_IDS union)
LETTER_BOX_IDS = (
    BANANA_BOX_IDS | CLONE_BOX_IDS | FIREWORKS_BOX_IDS | JUMP_BOX_IDS |
    RAINBOW_WORLD_BOX_IDS | AIRPLANE_BOX_IDS | MAGNET_BOX_IDS | SAHUR_BOX_IDS |
    ZZZ_BOX_IDS | OCTOPUS_BOX_IDS
)

# All letter pad IDs
LETTER_PAD_IDS = {
    BANANA_PAD, CLONE_PAD, FIREWORKS_PAD, JUMP_PAD, RAINBOW_WORLD_PAD,
    AIRPLANE_PAD, MAGNET_PAD, SAHUR_PAD, ZZZ_PAD, OCTOPUS_PAD
}

# Update BIG_BOX_IDS to include letter boxes
BIG_BOX_IDS = MUSHROOM_BOX_IDS | RAINBOW_BOX_IDS | CHICK_BOX_IDS | MONEY_BOX_IDS | SUN_BOX_IDS | MEGAGUN_BOX_IDS | LETTER_BOX_IDS | {APPLE, ANT_PILE_FRIENDLY, ANT_PILE_EVIL}
BIG_BOX_OR_PAD_IDS = BIG_BOX_IDS | {MUSHROOM_PAD, RAINBOW_PAD, CHICK_PAD, MONEY_PAD, SUN_PAD, MEGAGUN_PAD} | LETTER_PAD_IDS

# Map tile ID to letter effect name (for pickup handling)
LETTER_EFFECT_MAP: Dict[int, str] = {
    BANANA_PAD: "banana", BANANA_CRACK2: "banana", BANANA_CRACK1: "banana", BANANA_BOX: "banana",
    CLONE_PAD: "clone", CLONE_CRACK2: "clone", CLONE_CRACK1: "clone", CLONE_BOX: "clone",
    FIREWORKS_PAD: "fireworks", FIREWORKS_CRACK2: "fireworks", FIREWORKS_CRACK1: "fireworks", FIREWORKS_BOX: "fireworks",
    JUMP_PAD: "jump", JUMP_CRACK2: "jump", JUMP_CRACK1: "jump", JUMP_BOX: "jump",
    RAINBOW_WORLD_PAD: "rainbow_world", RAINBOW_WORLD_CRACK2: "rainbow_world", RAINBOW_WORLD_CRACK1: "rainbow_world", RAINBOW_WORLD_BOX: "rainbow_world",
    AIRPLANE_PAD: "airplane", AIRPLANE_CRACK2: "airplane", AIRPLANE_CRACK1: "airplane", AIRPLANE_BOX: "airplane",
    MAGNET_PAD: "magnet", MAGNET_CRACK2: "magnet", MAGNET_CRACK1: "magnet", MAGNET_BOX: "magnet",
    SAHUR_PAD: "sahur", SAHUR_CRACK2: "sahur", SAHUR_CRACK1: "sahur", SAHUR_BOX: "sahur",
    ZZZ_PAD: "zzz", ZZZ_CRACK2: "zzz", ZZZ_CRACK1: "zzz", ZZZ_BOX: "zzz",
    OCTOPUS_PAD: "octopus", OCTOPUS_CRACK2: "octopus", OCTOPUS_CRACK1: "octopus", OCTOPUS_BOX: "octopus",
}


def get_tile(tile_id: int) -> TileType:
    """Return a TileType by ID, defaulting to empty if unknown."""
    return TILE_REGISTRY.get(tile_id, TILE_REGISTRY[0])


def all_tiles() -> list[TileType]:
    """Return all tile types sorted by ID (for palette rendering)."""
    return sorted(TILE_REGISTRY.values(), key=lambda t: t.id)
