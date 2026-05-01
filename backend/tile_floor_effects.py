"""
Tank–floor tile interactions extracted from GameEngine (hazards, conveyors, pad pickups).
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from .bullet import Bullet, MISSILE_SPEED
from .map_model import GRID_HEIGHT, GRID_WIDTH
from .tank import ENEMY_TYPES
from .tile_registry import (
    CHICK_PAD,
    CONVEYOR_FLOAT_DELTA,
    EMPTY,
    LETTER_EFFECT_MAP,
    LETTER_PAD_IDS,
    MEGAGUN_PAD,
    MONEY_PAD,
    MUSHROOM_PAD,
    RAINBOW_PAD,
    SUN_PAD,
    get_tile,
)

if TYPE_CHECKING:
    from .game_engine import GameEngine

# Must match game_engine.TANK_HALF
TANK_HALF = 0.499


def apply_contact_hazard_conveyor(
    engine: "GameEngine", tank, r: int, c: int, tid: int
) -> None:
    """Contact damage, ice skate sound, ramp launch, conveyor drift."""
    tile_here = get_tile(tid)
    if tile_here.contact_damage:
        tank.lava_ticks += 1
        if tank.lava_ticks == 1:
            snd = tile_here.contact_damage_sound or "fire"
            engine.events.append({"type": "sound", "sound": snd})

        thresh = tile_here.contact_damage_ticks_to_kill or 120
        if tank.lava_ticks > thresh:
            tank.hp = 0
            tank.alive = False
            engine._add_explosion(tank.row, tank.col)
            if not tank.is_player:
                engine.events.append({"type": "sound", "sound": "enemy-explosion"})
                engine.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                engine.enemies_remaining -= 1
            else:
                engine.events.append({"type": "sound", "sound": "player-explosion"})
                engine.player_lives -= 1
                engine._player_respawn_timer = 180
    else:
        tank.lava_ticks = 0

    if tile_here.ice_skate_sound and tank.speed > 0 and engine.tick_count % 30 == 0 and tank.is_player:
        engine.events.append({"type": "sound", "sound": "ice"})

    rticks = tile_here.ramp_airborne_ticks
    if rticks and tank.airborne_ticks <= 0:
        tank.airborne_ticks = rticks
        engine.events.append({"type": "sound", "sound": tile_here.ramp_sound or "unknown-3"})

    conv = CONVEYOR_FLOAT_DELTA.get(tid)
    if conv:
        cdr, cdc = conv
        new_row = tank.row + cdr
        new_col = tank.col + cdc
        if engine._can_move_to(new_row, new_col, tank):
            tank.row = max(TANK_HALF, min(float(GRID_HEIGHT) - TANK_HALF, new_row))
            tank.col = max(TANK_HALF, min(float(GRID_WIDTH) - TANK_HALF, new_col))


def apply_pad_pickups(engine: "GameEngine", tank, r: int, c: int, tid: int) -> None:
    """Rainbow / chick / mushroom / money / sun / megagun pads and letter pads."""
    if tid == RAINBOW_PAD:
        bonus = 600 if tank.rainbow_ticks > 0 else 1800
        tank.rainbow_ticks = max(tank.rainbow_ticks, 0) + bonus
        for gr, gc in engine._find_box_group(r, c, RAINBOW_PAD, RAINBOW_PAD):
            engine.grid[gr][gc] = EMPTY
        engine.events.append({"type": "sound", "sound": "powerup-pickup"})
    elif tid == CHICK_PAD:
        for gr, gc in engine._find_box_group(r, c, CHICK_PAD, CHICK_PAD):
            engine.grid[gr][gc] = EMPTY
        engine.events.append({"type": "sound", "sound": "powerup-pickup"})
        engine._spawn_companion_for(tank)
    elif tid == MUSHROOM_PAD:
        tank.mushroom_ticks = max(tank.mushroom_ticks, 0) + 600
        for gr, gc in engine._find_box_group(r, c, MUSHROOM_PAD, MUSHROOM_PAD):
            engine.grid[gr][gc] = EMPTY
        engine.events.append({"type": "sound", "sound": "powerup-pickup"})
        engine._clear_area_for_tank(tank, force=True)
        if not engine._can_move_to(tank.row, tank.col, tank):
            freed = False
            for dr, dc in [(-0.5, 0), (0.5, 0), (0, -0.5), (0, 0.5), (-1.0, 0), (1.0, 0), (0, -1.0), (0, 1.0)]:
                nr2, nc2 = tank.row + dr, tank.col + dc
                if engine._can_move_to(nr2, nc2, tank):
                    tank.row = nr2
                    tank.col = nc2
                    freed = True
                    break
            if not freed:
                tank.mushroom_ticks = max(0, tank.mushroom_ticks - 600)
    elif tid == MONEY_PAD:
        if tank.is_player:
            if engine.golden_eagle_ticks == 0:
                engine._build_golden_arch()
            engine.golden_eagle_ticks = max(engine.golden_eagle_ticks, 0) + 1800
            for gr, gc in engine._find_box_group(r, c, MONEY_PAD, MONEY_PAD):
                engine.grid[gr][gc] = EMPTY
            engine._money_tile_pos = None
            engine._money_spawn_timer = random.randint(1200, 2400)
            engine.events.append({"type": "sound", "sound": "powerup-pickup"})
    elif tid == SUN_PAD:
        if tank.is_player:
            for gr, gc in engine._find_box_group(r, c, SUN_PAD, SUN_PAD):
                engine.grid[gr][gc] = EMPTY
            engine._sun_tile_pos = None
            engine._sun_spawn_timer = random.randint(1800, 3000)
            target = engine._find_nearest_skeleton_or_worm(tank.row, tank.col)
            if target:
                tr, tc = target
                missile = Bullet(
                    owner_id=tank.id,
                    is_player=True,
                    row=tank.row,
                    col=tank.col,
                    direction=tank.direction,
                    speed=MISSILE_SPEED,
                    power=99,
                    ttl=600,
                    is_missile=True,
                    target_row=tr,
                    target_col=tc,
                )
                engine.bullets[missile.id] = missile
            engine.events.append({"type": "sound", "sound": "powerup-pickup"})
    elif tid == MEGAGUN_PAD:
        if tank.is_player:
            tank.mega_gun_ticks = 1800
            for gr, gc in engine._find_box_group(r, c, MEGAGUN_PAD, MEGAGUN_PAD):
                engine.grid[gr][gc] = EMPTY
            engine._megagun_tile_pos = None
            engine._megagun_spawn_timer = random.randint(1800, 3000)
            engine.events.append({"type": "sound", "sound": "powerup-pickup"})
    elif tid in LETTER_PAD_IDS:
        effect = LETTER_EFFECT_MAP.get(tid)
        if effect and tank.is_player:
            engine._trigger_letter_effect(effect, r, c)
