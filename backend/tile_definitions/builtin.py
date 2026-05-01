"""Built-in tile registry entries (stable IDs 0–90). Merged in tile_registry.TILE_REGISTRY."""

from __future__ import annotations

from typing import Any, Dict


def build_builtin_registry() -> Dict[int, Any]:
    from ..tile_registry import TileType

    return {
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
    }
