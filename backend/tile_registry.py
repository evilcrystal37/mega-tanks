"""
tile_registry.py — Extensible tile type definitions for Battle Tanks.

To add a new built-in tile type:
1. Add an entry in backend/tile_definitions/builtin.py (stable integer ID).
2. The tile will automatically appear in the map editor palette and
   have its properties respected by the game engine (after metadata in _enrich_builtin_tiles if needed).
"""

from dataclasses import dataclass, replace
from typing import Any, Dict


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
    extra_big: bool = False # Custom tiles (id≥100): 4×4 cell sprite; PNG frame height 64 (strip = width multiple of 64)
    lossless_sprite: bool = False # Prefer PNG upload without rescaling when dimensions match expected frame strip
    explosion_radius: int = 2  # How many tiles out the blast reaches (default: 2 = 5×5 area)
    is_system: bool = False # Excluded from map editor palette
    is_box: bool = False # Treated as 2x2 group for damage (powerup boxes)
    partial_destructible: bool = False # For big tiles: bullets only clear hit quadrant
    damage_target_id: int | None = None # ID to transform into on hit
    jaw_proof: bool = False # Indestructible even by Evil Jaw/Mushroom tanks
    walkable: bool = False # If True, tanks (and other tile-solid units) pass through; bullets still use bullet_solid
    mobile: bool = False # If True, this tile roams the grid (AI moves its footprint like skeletons); custom tiles only in practice
    creature_affinity: str | None = None # None = not a creature hazard; "ally" = hurts enemies; "enemy" = hurts player-side
    # --- Engine / editor metadata (data-driven dispatch; see tile_catalog.refresh_derived_tile_catalog)
    contact_damage: bool = False
    contact_damage_ticks_to_kill: int | None = None
    contact_damage_sound: str | None = None
    conveyor: str | None = None  # "up" | "down" | "left" | "right"
    ramp_airborne_ticks: int | None = None
    ramp_sound: str | None = None
    ice_skate_sound: bool = False
    pickup_effect: str | None = None  # letter powerups and scripted pickups sharing an effect id
    editor_placeable: bool = True
    spawn_timing: str = "manual"  # "manual" | "timed" | "never"
    random_gen: dict[str, Any] | None = None  # e.g. {"weight": 8} or {"type": "turret_2x2"}
    settings_toggle_key: str | None = None
    display_glyph: str | None = None  # optional UI glyph for editor / client


# TileType property categories (docs / sprite editor): Identity (id,name,label,color);
# Collision (tank_solid,bullet_solid,walkable,mobile); Visibility (transparent); Destruction
# (destructible,partial_destructible,damage_target_id,jaw_proof); Terrain (slippery,speed_mult);
# Hazards (is_base,is_explosive,explosion_radius); Layout (non_repeating,extra_big,lossless_sprite); Editor (is_system,is_box).
# Engine: prefer TileType metadata + tile_catalog derived sets (contact_damage, conveyor, etc.).
# Creature tiles: creature_affinity "enemy" damages player/turret/companion on contact; "ally" damages enemies / Evil Jaw.


# ---------------------------------------------------------------------------
# Registry — built-ins live in tile_definitions.builtin (stable IDs); custom entries merge at runtime.
# ---------------------------------------------------------------------------
from .tile_definitions.builtin import build_builtin_registry

TILE_REGISTRY: Dict[int, TileType] = build_builtin_registry()

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


GLASS_IDS = {GLASS, GLASS_CRACK1, GLASS_CRACK2}
MUSHROOM_BOX_IDS = {MUSHROOM_CRACK2, MUSHROOM_CRACK1, MUSHROOM_BOX}
RAINBOW_BOX_IDS = {RAINBOW_CRACK2, RAINBOW_CRACK1, RAINBOW_BOX}
CHICK_BOX_IDS = {CHICK_CRACK2, CHICK_CRACK1, CHICK_BOX}
MONEY_BOX_IDS = {MONEY_CRACK2, MONEY_CRACK1, MONEY_BOX}
SUN_BOX_IDS = {SUN_CRACK2, SUN_CRACK1, SUN_BOX}
MEGAGUN_BOX_IDS = {MEGAGUN_CRACK2, MEGAGUN_CRACK1, MEGAGUN_BOX}

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

LETTER_BOX_IDS = (
    BANANA_BOX_IDS | CLONE_BOX_IDS | FIREWORKS_BOX_IDS | JUMP_BOX_IDS |
    RAINBOW_WORLD_BOX_IDS | AIRPLANE_BOX_IDS | MAGNET_BOX_IDS | SAHUR_BOX_IDS |
    ZZZ_BOX_IDS | OCTOPUS_BOX_IDS
)

BIG_BOX_IDS = (
    MUSHROOM_BOX_IDS | RAINBOW_BOX_IDS | CHICK_BOX_IDS | MONEY_BOX_IDS | SUN_BOX_IDS |
    MEGAGUN_BOX_IDS | LETTER_BOX_IDS
)

# Populated by _finalize_tile_catalog() after custom tiles load.
LETTER_PAD_IDS: frozenset[int] = frozenset()
CONVEYOR_IDS: frozenset[int] = frozenset()
LETTER_EFFECT_MAP: Dict[int, str] = {}
CONTACT_DAMAGE_TILE_IDS: frozenset[int] = frozenset()
CONVEYOR_FLOAT_DELTA: Dict[int, tuple[float, float]] = {}
BIG_BOX_OR_PAD_IDS: frozenset[int] = frozenset()
def _enrich_builtin_tiles() -> None:
    """Apply engine/editor metadata to built-in registry entries (stable numeric IDs)."""
    _toggle_rows: list[tuple[int, str, dict[str, Any] | None]] = [
        (BRICK, "tile_brick", {"weight": 8}),
        (STEEL, "tile_steel", {"weight": 3}),
        (WATER, "tile_water", {"weight": 2}),
        (FOREST, "tile_forest", {"weight": 3}),
        (ICE, "tile_ice", {"weight": 2}),
        (LAVA, "tile_lava", {"weight": 1}),
        (CONVEYOR_UP, "tile_conveyor", {"weight": 1}),
        (CONVEYOR_DOWN, "tile_conveyor", {"weight": 1}),
        (CONVEYOR_LEFT, "tile_conveyor", {"weight": 1}),
        (CONVEYOR_RIGHT, "tile_conveyor", {"weight": 1}),
        (MUD, "tile_mud", {"weight": 1}),
        (RAMP, "tile_ramp", {"weight": 1}),
        (TNT, "tile_tnt", {"weight": 1}),
        (GLASS, "tile_glass", {"weight": 1}),
        (SUNFLOWER, "tile_sunflower", {"weight": 1}),
        (AUTO_TURRET, "tile_turret", {"type": "turret_2x2"}),
        (MUSHROOM_BOX, "tile_mushroom_box", {"type": "powerup_2x2"}),
        (RAINBOW_BOX, "tile_rainbow_box", {"type": "powerup_2x2"}),
        (CHICK_BOX, "tile_chick_box", {"type": "powerup_2x2"}),
        (SPECIAL_TNT, "tile_spec_tnt", {"weight": 1}),
        (MONEY_PAD, "tile_money", None),
        (SUN_PAD, "tile_sun", None),
        (MEGAGUN_PAD, "tile_megagun", None),
        (BANANA_PAD, "tile_banana", None),
        (CLONE_PAD, "tile_clone", None),
        (FIREWORKS_PAD, "tile_fireworks", None),
        (JUMP_PAD, "tile_jump", None),
        (RAINBOW_WORLD_PAD, "tile_rainbow_world", None),
        (AIRPLANE_PAD, "tile_airplane", None),
        (MAGNET_PAD, "tile_magnet", None),
        (SAHUR_PAD, "tile_sahur", None),
        (ZZZ_PAD, "tile_zzz", None),
        (OCTOPUS_PAD, "tile_octopus", None),
    ]
    for tid, key, gen in _toggle_rows:
        if tid not in TILE_REGISTRY:
            continue
        TILE_REGISTRY[tid] = replace(
            TILE_REGISTRY[tid],
            settings_toggle_key=key,
            random_gen=gen,
        )

    TILE_REGISTRY[LAVA] = replace(
        TILE_REGISTRY[LAVA],
        contact_damage=True,
        contact_damage_ticks_to_kill=120,
        contact_damage_sound="fire",
    )
    TILE_REGISTRY[ICE] = replace(TILE_REGISTRY[ICE], ice_skate_sound=True)
    TILE_REGISTRY[RAMP] = replace(
        TILE_REGISTRY[RAMP],
        ramp_airborne_ticks=45,
        ramp_sound="unknown-3",
    )
    TILE_REGISTRY[CONVEYOR_UP] = replace(TILE_REGISTRY[CONVEYOR_UP], conveyor="up")
    TILE_REGISTRY[CONVEYOR_DOWN] = replace(TILE_REGISTRY[CONVEYOR_DOWN], conveyor="down")
    TILE_REGISTRY[CONVEYOR_LEFT] = replace(TILE_REGISTRY[CONVEYOR_LEFT], conveyor="left")
    TILE_REGISTRY[CONVEYOR_RIGHT] = replace(TILE_REGISTRY[CONVEYOR_RIGHT], conveyor="right")

    _letter_effects = (
        "banana", "clone", "fireworks", "jump", "rainbow_world",
        "airplane", "magnet", "sahur", "zzz", "octopus",
    )
    _glyphs = ("B", "C", "F", "J", "R", "A", "M", "S", "Z", "O")
    for tid in range(BANANA_PAD, OCTOPUS_BOX + 1):
        if tid not in TILE_REGISTRY:
            continue
        fam = (tid - BANANA_PAD) // 4
        TILE_REGISTRY[tid] = replace(
            TILE_REGISTRY[tid],
            pickup_effect=_letter_effects[fam],
            display_glyph=_glyphs[fam],
            editor_placeable=False,
            spawn_timing="timed",
        )

    for tid in range(MONEY_PAD, MEGAGUN_BOX + 1):
        if tid not in TILE_REGISTRY:
            continue
        TILE_REGISTRY[tid] = replace(
            TILE_REGISTRY[tid],
            editor_placeable=False,
            spawn_timing="timed",
        )

    _not_placeable = (
        BASE, GLASS_CRACK1, GLASS_CRACK2, SANDWORM_HEAD, SANDWORM_BODY,
        RAINBOW_PAD, MUSHROOM_PAD, MUSHROOM_CRACK2, MUSHROOM_CRACK1,
        RAINBOW_CRACK2, RAINBOW_CRACK1, CHICK_PAD, CHICK_CRACK2, CHICK_CRACK1,
        GOLDEN_FRAME, BONE_FRAME,
    )
    for tid in _not_placeable:
        if tid not in TILE_REGISTRY:
            continue
        TILE_REGISTRY[tid] = replace(
            TILE_REGISTRY[tid],
            editor_placeable=False,
            spawn_timing="never",
        )


def tile_type_to_dict(t: TileType) -> dict:
    """Serialize a TileType for API responses (full field set)."""
    return {
        "id": t.id,
        "name": t.name,
        "label": t.label,
        "color": t.color,
        "tank_solid": t.tank_solid,
        "bullet_solid": t.bullet_solid,
        "destructible": t.destructible,
        "transparent": t.transparent,
        "slippery": t.slippery,
        "is_base": t.is_base,
        "speed_mult": t.speed_mult,
        "is_explosive": t.is_explosive,
        "non_repeating": t.non_repeating,
        "extra_big": t.extra_big,
        "lossless_sprite": t.lossless_sprite,
        "explosion_radius": t.explosion_radius,
        "is_system": t.is_system or not t.editor_placeable,
        "is_box": t.is_box,
        "partial_destructible": t.partial_destructible,
        "damage_target_id": t.damage_target_id,
        "jaw_proof": t.jaw_proof,
        "walkable": t.walkable,
        "mobile": t.mobile,
        "creature_affinity": t.creature_affinity,
        "contact_damage": t.contact_damage,
        "contact_damage_ticks_to_kill": t.contact_damage_ticks_to_kill,
        "contact_damage_sound": t.contact_damage_sound,
        "conveyor": t.conveyor,
        "ramp_airborne_ticks": t.ramp_airborne_ticks,
        "ramp_sound": t.ramp_sound,
        "ice_skate_sound": t.ice_skate_sound,
        "pickup_effect": t.pickup_effect,
        "editor_placeable": t.editor_placeable,
        "spawn_timing": t.spawn_timing,
        "random_gen": t.random_gen,
        "settings_toggle_key": t.settings_toggle_key,
        "display_glyph": t.display_glyph,
    }


def _finalize_tile_catalog() -> None:
    """Wire derived catalog + unions that depend on LETTER_PAD_IDS."""
    global LETTER_PAD_IDS, CONVEYOR_IDS, LETTER_EFFECT_MAP, CONTACT_DAMAGE_TILE_IDS
    global CONVEYOR_FLOAT_DELTA, BIG_BOX_OR_PAD_IDS

    from .tile_catalog import refresh_derived_tile_catalog

    refresh_derived_tile_catalog()
    from . import tile_catalog as _tc

    LETTER_PAD_IDS = _tc.LETTER_PAD_IDS
    CONVEYOR_IDS = _tc.CONVEYOR_IDS
    LETTER_EFFECT_MAP = _tc.LETTER_EFFECT_MAP
    CONTACT_DAMAGE_TILE_IDS = _tc.CONTACT_DAMAGE_TILE_IDS
    CONVEYOR_FLOAT_DELTA = _tc.CONVEYOR_FLOAT_DELTA

    BIG_BOX_OR_PAD_IDS = frozenset(
        BIG_BOX_IDS
        | {MUSHROOM_PAD, RAINBOW_PAD, CHICK_PAD, MONEY_PAD, SUN_PAD, MEGAGUN_PAD}
        | set(LETTER_PAD_IDS)
    )


def get_tile(tile_id: int) -> TileType:
    """Return a TileType by ID, defaulting to empty if unknown."""
    return TILE_REGISTRY.get(tile_id, TILE_REGISTRY[0])


def all_tiles() -> list[TileType]:
    """Return all tile types sorted by ID (for palette rendering)."""
    return sorted(TILE_REGISTRY.values(), key=lambda t: t.id)


def _normalize_creature_affinity(raw) -> str | None:
    if raw is None or raw == "":
        return None
    s = str(raw).strip().lower()
    if s in ("ally", "friendly", "player"):
        return "ally"
    if s in ("enemy", "hostile", "foe"):
        return "enemy"
    return None


def load_custom_tiles() -> None:
    """Load custom tiles from maps/custom_tiles.json and re-register them."""
    import json
    from pathlib import Path
    
    project_root = Path(__file__).resolve().parent.parent
    custom_tiles_path = project_root / "maps" / "custom_tiles.json"
    
    if custom_tiles_path.exists():
        try:
            with open(custom_tiles_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            for tile_data in data:
                tile_id = tile_data.get("id")
                if tile_id is not None:
                    # Provide defaults for older json files
                    kwargs = {
                        "id": tile_id,
                        "name": tile_data.get("name", f"custom_{tile_id}"),
                        "label": tile_data.get("label", f"Tile {tile_id}"),
                        "color": tile_data.get("color", "#ff00ff"),
                        "tank_solid": tile_data.get("tank_solid", True),
                        "bullet_solid": tile_data.get("bullet_solid", True),
                        "destructible": tile_data.get("destructible", True),
                        "transparent": tile_data.get("transparent", False),
                        "slippery": tile_data.get("slippery", False),
                        "is_base": tile_data.get("is_base", False),
                        "speed_mult": tile_data.get("speed_mult", 1.0),
                        "is_explosive": tile_data.get("is_explosive", False),
                        "non_repeating": tile_data.get("non_repeating", False),
                        "extra_big": tile_data.get("extra_big", False),
                        "lossless_sprite": tile_data.get("lossless_sprite", False),
                        "explosion_radius": tile_data.get("explosion_radius", 2),
                        "is_system": tile_data.get("is_system", False),
                        "is_box": tile_data.get("is_box", False),
                        "partial_destructible": tile_data.get("partial_destructible", False),
                        "damage_target_id": tile_data.get("damage_target_id"),
                        "jaw_proof": tile_data.get("jaw_proof", False),
                        "walkable": tile_data.get("walkable", False),
                        "mobile": tile_data.get("mobile", False),
                        "creature_affinity": _normalize_creature_affinity(tile_data.get("creature_affinity")),
                        "contact_damage": tile_data.get("contact_damage", False),
                        "contact_damage_ticks_to_kill": tile_data.get("contact_damage_ticks_to_kill"),
                        "contact_damage_sound": tile_data.get("contact_damage_sound"),
                        "conveyor": tile_data.get("conveyor"),
                        "ramp_airborne_ticks": tile_data.get("ramp_airborne_ticks"),
                        "ramp_sound": tile_data.get("ramp_sound"),
                        "ice_skate_sound": tile_data.get("ice_skate_sound", False),
                        "pickup_effect": tile_data.get("pickup_effect"),
                        "editor_placeable": tile_data.get("editor_placeable", True),
                        "spawn_timing": tile_data.get("spawn_timing", "manual"),
                        "random_gen": tile_data.get("random_gen"),
                        "settings_toggle_key": tile_data.get("settings_toggle_key"),
                        "display_glyph": tile_data.get("display_glyph"),
                    }
                    TILE_REGISTRY[tile_id] = TileType(**kwargs)
        except Exception as e:
            print(f"Failed to load custom tiles: {e}")


def reload_custom_tiles_from_disk() -> None:
    """Reload maps/custom_tiles.json and rebuild derived catalog (API use)."""
    load_custom_tiles()
    _finalize_tile_catalog()


_enrich_builtin_tiles()
load_custom_tiles()
_finalize_tile_catalog()

