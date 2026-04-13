"""
game_engine.py — Core game loop, physics, collision detection.

The engine runs as an asyncio background task, emitting state snapshots
to all connected WebSocket clients every tick (~60Hz target via 16ms sleep).
"""

from __future__ import annotations

import asyncio
import math
import random
import time
from typing import Callable, Dict, List, Optional, Awaitable

from .bullet import Bullet, MISSILE_SPEED
from .bullet_manager import BulletManager
from .enemy_spawner import EnemySpawner
from .ai_controller import AIController
from .powerup_manager import PowerupManager
from .sandworm_controller import SandwormController
from .skeleton_controller import SkeletonController
from .mobile_tile_controller import MobileTileController
from .explosion_manager import ExplosionManager
from .collision import can_big_tank_crush
from .map_model import Map, GRID_WIDTH, GRID_HEIGHT
from .tank import Tank, make_player_tank, make_enemy_tank, ENEMY_TYPES, TANK_SPEED
from .input_recorder import InputRecorder
from .tile_registry import (
    AUTO_TURRET,
    BASE,
    BIG_BOX_IDS,
    BIG_BOX_OR_PAD_IDS,
    BRICK,
    CHICK_BOX,
    CHICK_BOX_IDS,
    CHICK_PAD,
    CONVEYOR_DOWN,
    CONVEYOR_IDS,
    CONVEYOR_LEFT,
    CONVEYOR_RIGHT,
    CONVEYOR_UP,
    EMPTY,
    GOLDEN_FRAME,
    GLASS,
    GLASS_CRACK1,
    GLASS_CRACK2,
    ICE,
    LAVA,
    MEGAGUN_BOX,
    MEGAGUN_BOX_IDS,
    MEGAGUN_PAD,
    MONEY_BOX,
    MONEY_BOX_IDS,
    MONEY_PAD,
    MUD,
    MUSHROOM_BOX,
    MUSHROOM_BOX_IDS,
    MUSHROOM_PAD,
    RAINBOW_BOX,
    RAINBOW_BOX_IDS,
    RAINBOW_PAD,
    RAMP,
    STEEL,
    SUN_BOX,
    SUN_BOX_IDS,
    SUN_PAD,
    SUNFLOWER,
    # Letter powerups
    BANANA_PAD, BANANA_BOX_IDS,
    CLONE_PAD, CLONE_BOX_IDS,
    FIREWORKS_PAD, FIREWORKS_BOX_IDS,
    JUMP_PAD, JUMP_BOX_IDS,
    RAINBOW_WORLD_PAD, RAINBOW_WORLD_BOX_IDS,
    AIRPLANE_PAD, AIRPLANE_BOX_IDS,
    MAGNET_PAD, MAGNET_BOX_IDS,
    SAHUR_PAD, SAHUR_BOX_IDS,
    ZZZ_PAD, ZZZ_BOX_IDS,
    OCTOPUS_PAD, OCTOPUS_BOX_IDS,
    LETTER_BOX_IDS,
    LETTER_PAD_IDS,
    LETTER_EFFECT_MAP,
    get_tile,
)

# Tick interval — ~60 FPS
TICK_INTERVAL = 1 / 60

# Tank collision half-extent (≈1×1 box) — tile-sized, fits exactly in 1-tile gaps
TANK_HALF = 0.499

# Custom creature tiles — contact damage cooldown (similar to skeletons)
CREATURE_TILE_CONTACT_INTERVAL = 60

# Enemy spawn columns (top row spawn points)
SPAWN_COLS = [0.5, GRID_WIDTH // 2 + 0.5, GRID_WIDTH - 0.5]

# Enemy type progression (repeating pattern, like the original)
ENEMY_SEQUENCE = ["basic", "basic", "fast", "basic", "armor", "power", "fast", "armor"]


class GameEngine:
    def __init__(self, map_obj: Map, mode_name: str = "construction_play", settings: Optional[dict] = None) -> None:
        from .mode_registry import get_mode

        # Seeded random for deterministic simulation (multiplayer safe)
        seed = settings.get("seed", int(time.time() * 1000)) if settings else int(time.time() * 1000)
        self.random = random.Random(seed)

        self.map = map_obj
        self.mode = get_mode(mode_name)
        self.grid: List[List[int]] = [row[:] for row in map_obj.grid]  # mutable copy
        self._settings: dict = settings or {}
        self._friendly_mode: bool = False

        # State — set by mode.on_start()
        self.total_enemies: int = 20
        self.enemies_remaining: int = 20
        self.player_lives: int = 3

        self.player: Optional[Tank] = None
        self.enemies: Dict[str, Tank] = {}
        self.turrets: Dict[str, Tank] = {}
        self.evil_jaws: Dict[str, Tank] = {}
        self.rainbow_trails: dict = {}
        self.bullets: Dict[str, Bullet] = {}
        self.explosions: List[dict] = []  # {"row": r, "col": c, "ticks": t}

        self.score: int = 0
        self.tick_count: int = 0
        self.running: bool = False
        self.paused: bool = False
        self.result: Optional[str] = None  # "victory" | "defeat"
        
        # Defeat sequence state
        self._defeat_ticks: int = 0
        self._defeat_bricks: List[tuple[int, int]] = []
        
        # TNT chain explosion queue
        self._pending_tnt: List[tuple[int, int, int, int]] = []  # (row, col, ticks, radius)
        
        # Sandworm state (Snake-like)
        self.sandworm: dict = {
            "active": False,
            "parts": [],  # List of dicts: [{"row": r, "col": c, "type": "head"|"body"}]
            "direction": "up",
            "timer": random.randint(300, 600),
            "despawning": False,
            "length": 4,
            "mud_immunity": 0,
            "dir_timer": 0,
            "hp": 5,
        }
        
        # Dropped items (reserved for future use)
        self.items: List[dict] = []

        # Golden Eagle effect
        self.golden_eagle_ticks: int = 0
        self._money_spawn_timer: int = random.randint(600, 1200)   # 10–20s initial delay
        self._money_tile_pos: Optional[tuple[int, int]] = None     # (top-left row, col) when active
        self._money_tile_timer: int = 0
        self._saved_eagle_tiles: Dict[tuple[int, int], int] = {}

        # Sun tile (homing missile powerup)
        self._sun_spawn_timer: int = random.randint(900, 1800)
        self._sun_tile_pos: Optional[tuple[int, int]] = None
        self._sun_tile_timer: int = 0

        # Mega Gun tile (dual grenade launcher powerup)
        self._megagun_spawn_timer: int = random.randint(1200, 2400)
        self._megagun_tile_pos: Optional[tuple[int, int]] = None
        self._megagun_tile_timer: int = 0

        # Events to broadcast
        self.events: List[dict] = []

        # Callbacks
        self._state_callbacks: List[Callable[[dict], Awaitable[None]]] = []

        # Spawn queue
        self._enemies_spawned: int = 0
        self._spawn_cooldown: int = 0
        self._max_active_enemies: int = 4
        self._spawn_interval: int = 90

        # Player respawn
        self._player_respawn_timer: int = 0

        # Base position cache
        self._base_pos: Optional[tuple[int, int]] = None

        # Player input (stored for continuous movement each tick)
        self._player_direction: Optional[str] = None
        self._player_fire: bool = False
        self._last_grid_snapshot: Optional[List[List[int]]] = None
        self._creature_tile_contact_cd: Dict[str, int] = {}

        # Input recorder for Clone effect
        self._input_recorder = InputRecorder(max_frames=1200)

        # Letter powerup effects state
        self.rainbow_world_ticks: int = 0       # R — Rainbow world transform
        self.base_shield_ticks: int = 0         # O — Octopus base shield
        self.clone_tank: Optional[Tank] = None  # C — Clone tank
        self.bananas: List[dict] = []           # B — Banana impacts: [{row, col, phase, ttl}]
        self.fireworks: List[dict] = []         # F — Fireworks bursts
        self.jump_active: bool = False          # J — Jump ability (derived from player.jump_ticks)
        self.airplanes: List[dict] = []         # A — Airplane drops
        self.bombs: List[dict] = []             # A — Airplane bombs: [{row, col, target_row, ttl}]
        self.magnets: List[dict] = []           # M — Magnet pull zones
        self.sahur_runners: List[dict] = []     # S — Sahur runners
        self.evil_jaws: Dict[str, Tank] = {}    # Custom: Evil Jaws from teeth

        # Subsystems
        self.bullet_manager = BulletManager(self)
        self.enemy_spawner = EnemySpawner(self)
        self.ai_controller = AIController(self)
        self.powerup_manager = PowerupManager(self)
        self.sandworm_controller = SandwormController(self)
        self.skeleton_ctrl = SkeletonController(self)
        self.mobile_tile_ctrl = MobileTileController(self)
        self.explosion_manager = ExplosionManager(self)


    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def subscribe(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        self._state_callbacks.append(callback)

    def unsubscribe(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        self._state_callbacks = [cb for cb in self._state_callbacks if cb is not callback]

    async def start(self) -> None:
        self._setup()
        self.mode.on_start(self)
        self._apply_settings()
        self.running = True
        asyncio.create_task(self._loop())

    def stop(self) -> None:
        self.running = False

    def player_input(self, direction: Optional[str], fire: bool) -> None:
        """Called by the WebSocket handler with player input. Stores state for continuous movement each tick."""
        primary_dir = None
        if direction:
            primary_dir = direction.split('-')[0]
        self._player_direction = primary_dir
        self._player_fire = fire

    def toggle_pause(self) -> None:
        if self.result is None:
            self.paused = not self.paused

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _setup(self) -> None:
        base = self.map.find_base()
        if base:
            self._base_pos = base
            # Battle City style: base at bottom center, player to its left
            self.player = make_player_tank(float(base[0]) + 0.5, float(base[1] - 4) + 0.5)
        else:
            # Fallback for rectangular
            self.player = make_player_tank(float(GRID_HEIGHT - 1) + 0.5, float(GRID_WIDTH // 2 - 4) + 0.5)
        self._clear_area_for_tank(self.player)

        # Parse Auto-Turrets — treated as 2×2 blocks.
        # Scan only even positions so each block is registered once.
        for r in range(0, GRID_HEIGHT, 2):
            for c in range(0, GRID_WIDTH, 2):
                if self.grid[r][c] == AUTO_TURRET:
                    # Clear all 4 cells of the block
                    for dr in range(2):
                        for dc in range(2):
                            if r + dr < GRID_HEIGHT and c + dc < GRID_WIDTH:
                                self.grid[r + dr][c + dc] = 0
                    turret = Tank(
                        row=r + 1.0,   # centre of the 2×2 block
                        col=c + 1.0,
                        tank_type="turret",
                        is_player=True,
                        speed=0.0,
                        hp=5,
                        color="#607d8b"
                    )
                    self.turrets[turret.id] = turret

        self.mobile_tile_ctrl.init_from_grid()

    def _apply_settings(self) -> None:
        """Apply user-provided settings after mode defaults are set."""
        s = self._settings
        if not s:
            return

        if "total_enemies" in s:
            self.total_enemies = s["total_enemies"]
            self.enemies_remaining = s["total_enemies"]
        if "player_lives" in s:
            self.player_lives = s["player_lives"]
        if "max_active_enemies" in s:
            self._max_active_enemies = s["max_active_enemies"]
        if "spawn_interval" in s:
            self._spawn_interval = s["spawn_interval"]
        if "friendly_mode" in s:
            self._friendly_mode = bool(s["friendly_mode"])

        if self.player:
            if "tank_speed" in s:
                self.player.speed = s["tank_speed"]
            if "player_fire_rate" in s:
                self.player.fire_rate = s["player_fire_rate"]
            if "bullet_speed" in s:
                self.player.custom_bullet_speed = s["bullet_speed"]

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        while self.running:
            t0 = time.monotonic()
            self._tick()
            state = self._build_state()
            self.events.clear()
            await self._emit(state)
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, TICK_INTERVAL - elapsed))

    # ------------------------------------------------------------------
    # Tile Settings Helpers
    # ------------------------------------------------------------------

    def _is_timed_tile_enabled(self, tile_key: str) -> bool:
        """Check if a timed tile type is enabled in tile settings."""
        tile_settings = self._settings.get('tile_settings', {})
        return tile_settings.get(tile_key, True)  # Default to True if not set

    def _is_money_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_money')

    def _is_sun_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_sun')

    def _is_megagun_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_megagun')

    # Letter powerup tile settings
    def _is_banana_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_banana')

    def _is_clone_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_clone')

    def _is_fireworks_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_fireworks')

    def _is_jump_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_jump')

    def _is_rainbow_world_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_rainbow_world')

    def _is_airplane_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_airplane')

    def _is_magnet_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_magnet')

    def _is_sahur_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_sahur')

    def _is_zzz_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_zzz')

    def _is_octopus_enabled(self) -> bool:
        return self._is_timed_tile_enabled('tile_octopus')

    def _tick(self) -> None:
        if not self.running:
            return
        if self.paused:
            return
        self.tick_count += 1
        
        # Handle defeat sequence
        if self.result == "defeat":
            self.explosion_manager.tick_defeat_sequence()
            return

        # Player cooldowns and continuous movement
        if self.player and self.player.alive:
            self.player.tick_cooldown()
            if self._player_direction:
                self._move_tank(self.player, self._player_direction)
            if self._player_fire:
                self._try_fire(self.player)
            self._check_item_collection(self.player)
        else:
            self._handle_player_respawn()

        # Enemy cooldowns + AI
        self.ai_controller.tick_enemies()

        # Companion cooldowns + AI + lifetime countdown
        self.ai_controller.tick_companions()

        # Tile effects on tanks (Lava, Jump ramp etc)
        active_tanks = list(self.enemies.values()) + ([self.player] if self.player and self.player.alive else [])
        active_tanks += [t.companion for t in active_tanks if t.companion and t.companion.alive]
        for tank in active_tanks:
            if not tank.alive:
                continue
                
            was_airborne = tank.airborne_ticks > 0
            if tank.airborne_ticks > 0:
                tank.airborne_ticks -= 1
                if tank.airborne_ticks == 0:
                    # Just landed! Destroy any destructible solid tiles under the tank so it doesn't get stuck.
                    self._clear_area_for_tank(tank, force=True)

            r, c = int(tank.row), int(tank.col)
            if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                tid = self.grid[r][c]
                # Lava check
                if tid == LAVA:
                    tank.lava_ticks += 1
                    if tank.lava_ticks == 1:
                        self.events.append({"type": "sound", "sound": "fire"})
                        
                    if tank.lava_ticks > 120:
                        tank.hp = 0
                        tank.alive = False
                        self._add_explosion(tank.row, tank.col)
                        if not tank.is_player:
                            self.events.append({"type": "sound", "sound": "enemy-explosion"})
                            self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                            self.enemies_remaining -= 1
                        else:
                            self.events.append({"type": "sound", "sound": "player-explosion"})
                            self.player_lives -= 1
                            self._player_respawn_timer = 180
                else:
                    tank.lava_ticks = 0
                    
                # Ice check (skating sound when moving)
                if tid == ICE and tank.speed > 0 and self.tick_count % 30 == 0 and tank.is_player:
                    self.events.append({"type": "sound", "sound": "ice"})
                    
                # Ramp check
                if tid == RAMP and tank.airborne_ticks <= 0:
                    tank.airborne_ticks = 45
                    self.events.append({"type": "sound", "sound": "unknown-3"}) # Jump sound
                    
                # Conveyor check
                if tid in CONVEYOR_IDS:
                    conv_speed = 0.02
                    cdr, cdc = 0.0, 0.0
                    if tid == CONVEYOR_UP:
                        cdr = -conv_speed
                    elif tid == CONVEYOR_DOWN:
                        cdr = conv_speed
                    elif tid == CONVEYOR_LEFT:
                        cdc = -conv_speed
                    elif tid == CONVEYOR_RIGHT:
                        cdc = conv_speed
                    
                    new_row = tank.row + cdr
                    new_col = tank.col + cdc
                    if self._can_move_to(new_row, new_col, tank):
                        tank.row = max(TANK_HALF, min(float(GRID_HEIGHT) - TANK_HALF, new_row))
                        tank.col = max(TANK_HALF, min(float(GRID_WIDTH) - TANK_HALF, new_col))

                # Buffs
                if tid == RAINBOW_PAD:
                    # Rainbow: 30s base (first pickup) + 10s per additional pickup
                    bonus = 600 if tank.rainbow_ticks > 0 else 1800
                    tank.rainbow_ticks = max(tank.rainbow_ticks, 0) + bonus
                    for gr, gc in self._find_box_group(r, c, RAINBOW_PAD, RAINBOW_PAD):
                        self.grid[gr][gc] = EMPTY
                    self.events.append({"type": "sound", "sound": "powerup-pickup"})
                elif tid == CHICK_PAD:
                    # Chick collected by driving over it
                    for gr, gc in self._find_box_group(r, c, CHICK_PAD, CHICK_PAD):
                        self.grid[gr][gc] = EMPTY
                    self.events.append({"type": "sound", "sound": "powerup-pickup"})
                    self._spawn_companion_for(tank)
                elif tid == MUSHROOM_PAD:
                    # Mushroom collected
                    tank.mushroom_ticks = max(tank.mushroom_ticks, 0) + 600
                    for gr, gc in self._find_box_group(r, c, MUSHROOM_PAD, MUSHROOM_PAD):
                        self.grid[gr][gc] = EMPTY
                    self.events.append({"type": "sound", "sound": "powerup-pickup"})
                    self._clear_area_for_tank(tank, force=True)
                    # Position correction: if tank can't fit in 2x size, nudge it to a clear spot
                    if not self._can_move_to(tank.row, tank.col, tank):
                        freed = False
                        for dr, dc in [(-0.5, 0), (0.5, 0), (0, -0.5), (0, 0.5),
                                       (-1.0, 0), (1.0, 0), (0, -1.0), (0, 1.0)]:
                            nr2, nc2 = tank.row + dr, tank.col + dc
                            if self._can_move_to(nr2, nc2, tank):
                                tank.row = nr2
                                tank.col = nc2
                                freed = True
                                break
                        if not freed:
                            tank.mushroom_ticks = max(0, tank.mushroom_ticks - 600)
                elif tid == MONEY_PAD:
                    # Money collected
                    if tank.is_player:
                        if self.golden_eagle_ticks == 0:
                            self._build_golden_arch()
                        self.golden_eagle_ticks = max(self.golden_eagle_ticks, 0) + 1800  # 30s, stackable
                        for gr, gc in self._find_box_group(r, c, MONEY_PAD, MONEY_PAD):
                            self.grid[gr][gc] = EMPTY
                        self._money_tile_pos = None
                        self._money_spawn_timer = random.randint(1200, 2400)
                        self.events.append({"type": "sound", "sound": "powerup-pickup"})
                elif tid == SUN_PAD:
                    if tank.is_player:
                        for gr, gc in self._find_box_group(r, c, SUN_PAD, SUN_PAD):
                            self.grid[gr][gc] = EMPTY
                        self._sun_tile_pos = None
                        self._sun_spawn_timer = random.randint(1800, 3000)
                        target = self._find_nearest_skeleton_or_worm(tank.row, tank.col)
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
                            self.bullets[missile.id] = missile
                        self.events.append({"type": "sound", "sound": "powerup-pickup"})
                elif tid == MEGAGUN_PAD:
                    if tank.is_player:
                        tank.mega_gun_ticks = 1800  # 30 seconds
                        for gr, gc in self._find_box_group(r, c, MEGAGUN_PAD, MEGAGUN_PAD):
                            self.grid[gr][gc] = EMPTY
                        self._megagun_tile_pos = None
                        self._megagun_spawn_timer = random.randint(1800, 3000)
                        self.events.append({"type": "sound", "sound": "powerup-pickup"})

                # Letter powerup pad pickup
                elif tid in LETTER_PAD_IDS:
                    effect = LETTER_EFFECT_MAP.get(tid)
                    if effect and tank.is_player:
                        self._trigger_letter_effect(effect, r, c)

            # Apply ticking buffs
            if tank.rainbow_ticks > 0:
                tank.rainbow_ticks -= 1
                # Store continuous trail points
                if 0 <= tank.row < GRID_HEIGHT and 0 <= tank.col < GRID_WIDTH:
                    tank_key = tank.id
                    if tank_key not in self.rainbow_trails:
                        self.rainbow_trails[tank_key] = {"points": [], "ticks": 120}
                    
                    # Only add point if moved significantly to reduce payload size
                    pts = self.rainbow_trails[tank_key]["points"]
                    if not pts or abs(pts[-1]["row"] - tank.row) > 0.01 or abs(pts[-1]["col"] - tank.col) > 0.01:
                        self.rainbow_trails[tank_key]["points"].append({
                            "row": round(tank.row, 3),
                            "col": round(tank.col, 3),
                            "tick": self.tick_count
                        })
                    
                    # Limit trail length to avoid huge WebSocket payloads
                    max_points = 80
                    if len(self.rainbow_trails[tank_key]["points"]) > max_points:
                        self.rainbow_trails[tank_key]["points"] = self.rainbow_trails[tank_key]["points"][-max_points:]
                    
                    # Keep trail visible for full remaining rainbow duration + 2s fade-out
                    self.rainbow_trails[tank_key]["ticks"] = tank.rainbow_ticks + 120

            if tank.mushroom_ticks > 0:
                tank.mushroom_ticks -= 1

            if tank.mega_gun_ticks > 0:
                tank.mega_gun_ticks -= 1

        # Roaming mobile tiles before creature contact uses grid positions
        self.mobile_tile_ctrl.tick()

        self._tick_creature_tiles()

        # Move bullets
        self.bullet_manager.tick()

        # Update explosions
        self.explosion_manager.tick()

        # Update sandworm
        self.sandworm_controller.tick()

        # Update skeleton creatures
        self.skeleton_ctrl.tick()

        # Spawn enemies
        self.enemy_spawner.tick()

        # Tick turrets
        self.ai_controller.tick_turrets()

        # Tick rainbow trails
        self._tick_rainbow_trails()

        # Tick money tile and timed powerups
        self.powerup_manager.tick()

        # Tick letter powerup effects
        self._tick_letter_buffs()
        self._tick_bananas()
        self._tick_clone()
        self._tick_fireworks()
        self._tick_airplanes()
        self._tick_bombs()
        self._tick_magnets()
        self._tick_sahur_runners()
        self._tick_evil_jaws()

        # Record player input for clone effect
        if self.player and self.player.alive:
            self._input_recorder.record(self._player_direction, self._player_fire)

        # Check win/loss
        self._check_end_conditions()
        self.mode.on_tick(self)

    def _check_item_collection(self, tank: Tank) -> None:
        remaining_items = []
        for item in self.items:
            if abs(tank.row - item["row"]) < 0.8 and abs(tank.col - item["col"]) < 0.8:
                self.events.append({"type": "sound", "sound": "powerup-pickup"})
            else:
                remaining_items.append(item)
        self.items = remaining_items

    def _get_all_tanks(self, alive_only: bool = False) -> list[Tank]:
        tanks = list(self.enemies.values()) + ([self.player] if self.player else [])
        if alive_only:
            tanks = [t for t in tanks if t and t.alive]
        return tanks

    def _spawn_companion_for(self, tank: Tank) -> None:
        """Spawn companion near owner if missing/dead and refresh duration."""
        if tank.tank_type == "companion":
            return
        if tank.companion is None or not tank.companion.alive:
            dir_offsets = {
                "up": (2.0, 0.0),
                "down": (-2.0, 0.0),
                "left": (0.0, 2.0),
                "right": (0.0, -2.0),
            }
            cdr, cdc = dir_offsets.get(tank.direction, (2.0, 0.0))
            comp_row = max(1.0, min(float(GRID_HEIGHT) - 1.0, tank.row + cdr))
            comp_col = max(1.0, min(float(GRID_WIDTH) - 1.0, tank.col + cdc))
            tank.companion = Tank(
                row=comp_row,
                col=comp_col,
                direction=tank.direction,
                speed=tank.speed * 1.5,
                hp=999,
                is_player=tank.is_player,
                fire_rate=40,
                bullet_limit=1,
                tank_type="companion",
                color="#ffee58",
            )
            tank.companion_orbit_angle = 0.0
        tank.companion_ticks += 1800

    # ------------------------------------------------------------------
    # Spawner
    # ------------------------------------------------------------------

    def _tick_spawner(self) -> None:
        if self._enemies_spawned >= self.total_enemies:
            return
        if len([e for e in self.enemies.values() if e.alive]) >= self._max_active_enemies:
            return
        if self._spawn_cooldown > 0:
            self._spawn_cooldown -= 1
            return
        enemy_type = ENEMY_SEQUENCE[self._enemies_spawned % len(ENEMY_SEQUENCE)]

        # Try each spawn column; skip if blocked by solid tiles (e.g., water) or tanks.
        spawn_row = 0.5
        start_idx = self._enemies_spawned % len(SPAWN_COLS)
        col = SPAWN_COLS[start_idx]

        enemy = make_enemy_tank(spawn_row, float(col), enemy_type)

        # Apply per-enemy settings overrides (affects speed / bullet speed used in movement checks).
        s = self._settings
        if "enemy_speed_mult" in s:
            enemy.speed *= s["enemy_speed_mult"]
        if "enemy_fire_rate" in s:
            enemy.fire_rate = s["enemy_fire_rate"]
        if "bullet_speed" in s:
            enemy.custom_bullet_speed = s["bullet_speed"]

        self._clear_area_for_tank(enemy)
        if self._can_move_to(enemy.row, enemy.col, enemy):
            self.enemies[enemy.id] = enemy
            self._enemies_spawned += 1
            self._spawn_cooldown = self._spawn_interval
        else:
            # Nothing free right now (e.g., all spawn points blocked); try again soon.
            self._spawn_cooldown = min(self._spawn_interval, 20)

    # ------------------------------------------------------------------
    # AI
    # ------------------------------------------------------------------

    def _tick_rainbow_trails(self) -> None:
        to_delete = []
        for k, v in self.rainbow_trails.items():
            v["ticks"] -= 1
            if v["ticks"] <= 0:
                to_delete.append(k)
            else:
                # Fade out old points gradually
                cutoff_tick = self.tick_count - v["ticks"]
                v["points"] = [p for p in v["points"] if p["tick"] >= cutoff_tick]
        for k in to_delete:
            del self.rainbow_trails[k]

    def _tick_money_tile(self) -> None:
        if self._money_tile_pos is not None:
            self._money_tile_timer -= 1
            if self._money_tile_timer <= 0:
                # Remove tile
                r, c = self._money_tile_pos
                for gr in range(r, r + 2):
                    for gc in range(c, c + 2):
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH and self.grid[gr][gc] in MONEY_BOX_IDS | {MONEY_PAD}:
                            self.grid[gr][gc] = EMPTY
                self._money_tile_pos = None
                self._money_spawn_timer = random.randint(1200, 2400)
        else:
            self._money_spawn_timer -= 1
            if self._money_spawn_timer <= 0 and self._is_money_enabled():
                # Find valid 2x2 empty block
                valid_spots = []
                base_r, base_c = self._base_pos if self._base_pos else (GRID_HEIGHT - 1, GRID_WIDTH // 2)
                for r in range(0, GRID_HEIGHT - 1, 2):
                    for c in range(0, GRID_WIDTH - 1, 2):
                        # Not too close to base
                        if abs(r - base_r) < 3 and abs(c - base_c) < 3:
                            continue
                        
                        # Check if 2x2 area is completely empty
                        is_empty = True
                        for gr in range(r, r + 2):
                            for gc in range(c, c + 2):
                                if self.grid[gr][gc] != EMPTY:
                                    is_empty = False
                                    break
                            if not is_empty:
                                break
                                
                        if is_empty:
                            valid_spots.append((r, c))
                            
                if valid_spots:
                    spot = random.choice(valid_spots)
                    self._money_tile_pos = spot
                    self._money_tile_timer = 2700  # 45 seconds at 60Hz
                    for gr in range(spot[0], spot[0] + 2):
                        for gc in range(spot[1], spot[1] + 2):
                            self.grid[gr][gc] = MONEY_BOX
                    self.events.append({"type": "sound", "sound": "powerup-appear"})
                else:
                    # Retry soon if no spot found
                    self._money_spawn_timer = 120

    def _tick_sun_tile(self) -> None:
        if self._sun_tile_pos is not None:
            self._sun_tile_timer -= 1
            if self._sun_tile_timer <= 0:
                r, c = self._sun_tile_pos
                for gr in range(r, r + 2):
                    for gc in range(c, c + 2):
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH and self.grid[gr][gc] in SUN_BOX_IDS | {SUN_PAD}:
                            self.grid[gr][gc] = EMPTY
                self._sun_tile_pos = None
                self._sun_spawn_timer = random.randint(1800, 3000)
        else:
            self._sun_spawn_timer -= 1
            if self._sun_spawn_timer <= 0 and self._is_sun_enabled():
                valid_spots = []
                base_r, base_c = self._base_pos if self._base_pos else (GRID_HEIGHT - 1, GRID_WIDTH // 2)
                for r in range(0, GRID_HEIGHT - 1, 2):
                    for c in range(0, GRID_WIDTH - 1, 2):
                        if abs(r - base_r) < 3 and abs(c - base_c) < 3:
                            continue
                        is_empty = True
                        for gr in range(r, r + 2):
                            for gc in range(c, c + 2):
                                if self.grid[gr][gc] != EMPTY:
                                    is_empty = False
                                    break
                            if not is_empty:
                                break
                        if is_empty:
                            valid_spots.append((r, c))
                if valid_spots:
                    spot = random.choice(valid_spots)
                    self._sun_tile_pos = spot
                    self._sun_tile_timer = 2700
                    for gr in range(spot[0], spot[0] + 2):
                        for gc in range(spot[1], spot[1] + 2):
                            self.grid[gr][gc] = SUN_BOX
                    self.events.append({"type": "sound", "sound": "powerup-appear"})
                else:
                    self._sun_spawn_timer = 120

    def _tick_megagun_tile(self) -> None:
        if self._megagun_tile_pos is not None:
            self._megagun_tile_timer -= 1
            if self._megagun_tile_timer <= 0:
                r, c = self._megagun_tile_pos
                for gr in range(r, r + 2):
                    for gc in range(c, c + 2):
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH and self.grid[gr][gc] in MEGAGUN_BOX_IDS | {MEGAGUN_PAD}:
                            self.grid[gr][gc] = EMPTY
                self._megagun_tile_pos = None
                self._megagun_spawn_timer = random.randint(1800, 3000)
        else:
            self._megagun_spawn_timer -= 1
            if self._megagun_spawn_timer <= 0 and self._is_megagun_enabled():
                valid_spots = []
                base_r, base_c = self._base_pos if self._base_pos else (GRID_HEIGHT - 1, GRID_WIDTH // 2)
                for r in range(0, GRID_HEIGHT - 1, 2):
                    for c in range(0, GRID_WIDTH - 1, 2):
                        if abs(r - base_r) < 3 and abs(c - base_c) < 3:
                            continue
                        is_empty = True
                        for gr in range(r, r + 2):
                            for gc in range(c, c + 2):
                                if self.grid[gr][gc] != EMPTY:
                                    is_empty = False
                                    break
                            if not is_empty:
                                break
                        if is_empty:
                            valid_spots.append((r, c))
                if valid_spots:
                    spot = random.choice(valid_spots)
                    self._megagun_tile_pos = spot
                    self._megagun_tile_timer = 2700
                    for gr in range(spot[0], spot[0] + 2):
                        for gc in range(spot[1], spot[1] + 2):
                            self.grid[gr][gc] = MEGAGUN_BOX
                    self.events.append({"type": "sound", "sound": "powerup-appear"})
                else:
                    self._megagun_spawn_timer = 120

    # ------------------------------------------------------------------
    # Letter Powerup Effects
    # ------------------------------------------------------------------

    def _trigger_letter_effect(self, effect: str, pad_r: int, pad_c: int) -> None:
        """Trigger a letter powerup effect when pad is collected."""
        # Clear the 2x2 box
        box_ids = {
            "banana": BANANA_BOX_IDS, "clone": CLONE_BOX_IDS,
            "fireworks": FIREWORKS_BOX_IDS, "jump": JUMP_BOX_IDS,
            "rainbow_world": RAINBOW_WORLD_BOX_IDS, "airplane": AIRPLANE_BOX_IDS,
            "magnet": MAGNET_BOX_IDS, "sahur": SAHUR_BOX_IDS,
            "zzz": ZZZ_BOX_IDS, "octopus": OCTOPUS_BOX_IDS,
        }.get(effect, set())
        pad_id = {
            "banana": BANANA_PAD, "clone": CLONE_PAD,
            "fireworks": FIREWORKS_PAD, "jump": JUMP_PAD,
            "rainbow_world": RAINBOW_WORLD_PAD, "airplane": AIRPLANE_PAD,
            "magnet": MAGNET_PAD, "sahur": SAHUR_PAD,
            "zzz": ZZZ_PAD, "octopus": OCTOPUS_PAD,
        }.get(effect)

        if pad_id:
            for gr, gc in self._find_box_group(pad_r, pad_c, pad_id, pad_id):
                self.grid[gr][gc] = EMPTY

        # Trigger effect
        if effect == "banana":
            self._spawn_banana()
        elif effect == "clone":
            self._spawn_clone()
        elif effect == "fireworks":
            self._trigger_fireworks()
        elif effect == "jump":
            self._activate_jump()
        elif effect == "rainbow_world":
            self._activate_rainbow_world()
        elif effect == "airplane":
            self._spawn_airplane()
        elif effect == "magnet":
            self._spawn_magnet()
        elif effect == "sahur":
            self._spawn_sahur()
        elif effect == "zzz":
            self._trigger_sleep()
        elif effect == "octopus":
            self._activate_base_shield()

        self.events.append({"type": "sound", "sound": "powerup-pickup"})

    def _spawn_banana(self) -> None:
        """B — Banana: Falls from above, bounces 3 times with explosions, final super TNT."""
        # Pre-select 3 target locations for the bounces
        target1 = self._find_random_12x12_spot()
        target2 = self._find_random_12x12_spot()
        target3 = self._find_random_12x12_spot()
        
        if target1 and target2 and target3:
            # Banana spawns ABOVE the map at first target's column
            self.bananas.append({
                "row": -5.0,  # Start above the map
                "col": float(target1[1]),  # Same column as first target
                "target_row": float(target1[0]),
                "target_col": float(target1[1]),
                "velocity": 0.0,  # Start with zero velocity
                "bounce_count": 0,
                "state": "falling",  # "falling" or "rising"
                "targets": [target1, target2, target3],  # Pre-selected targets
            })

    def _find_random_12x12_spot(self) -> Optional[tuple[int, int]]:
        """Find a random spot where a 12x12 area fits inside bounds."""
        valid_spots = []
        for r in range(6, GRID_HEIGHT - 6):
            for c in range(6, GRID_WIDTH - 6):
                valid_spots.append((r, c))
        if valid_spots:
            return self.random.choice(valid_spots)
        return None

    def _banana_impact(self, center_r: int, center_c: int, final_explosion: bool = False) -> None:
        """Apply banana impact: destroy all destructibles in 12x12 area."""
        # 12x12 area centered on the spot (6-tile radius)
        destroyed_any = False
        for dr in range(-6, 7):
            for dc in range(-6, 7):
                gr, gc = center_r + dr, center_c + dc
                if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                    tid = self.grid[gr][gc]
                    tile = get_tile(tid)
                    # Don't destroy base, steel
                    if tid == BASE or tid == STEEL:
                        continue
                    if tile.destructible:
                        self.grid[gr][gc] = EMPTY
                        destroyed_any = True

        if final_explosion:
            # Final impact: super TNT explosion (radius 6)
            self._add_explosion(center_r + 0.5, center_c + 0.5, kind="super_tnt", radius=6)
            for _ in range(3):
                self.events.append({"type": "sound", "sound": "enemy-explosion"})
        elif destroyed_any:
            self.events.append({"type": "sound", "sound": "enemy-explosion"})

    def _tick_bananas(self) -> None:
        """Tick banana effects: fall, bounce, explode - repeat 3 times."""
        new_bananas = []
        for banana in self.bananas:
            if banana["state"] == "falling":
                # Apply gravity (accelerate downward)
                banana["velocity"] += 0.015
                banana["row"] += banana["velocity"]
                
                # Check if reached target
                if banana["row"] >= banana["target_row"]:
                    banana["row"] = banana["target_row"]
                    # Impact!
                    self._banana_impact(
                        int(banana["target_row"]), 
                        int(banana["target_col"]),
                        final_explosion=(banana["bounce_count"] >= 2)
                    )
                    banana["bounce_count"] += 1
                    
                    if banana["bounce_count"] < 2:
                        # Bounce back up
                        banana["state"] = "rising"
                        banana["velocity"] = -0.25  # Initial upward velocity
                        # Pick next target (different column)
                        if banana["bounce_count"] < len(banana["targets"]):
                            next_target = banana["targets"][banana["bounce_count"]]
                            banana["target_col"] = float(next_target[1])
                            banana["target_row"] = float(next_target[0])
                        new_bananas.append(banana)
                    # If bounce_count >= 2, final explosion happened - remove banana
                    
            elif banana["state"] == "rising":
                # Apply gravity (decelerate upward motion)
                banana["velocity"] += 0.015
                banana["row"] += banana["velocity"]
                
                # Check if reached peak (velocity became positive)
                if banana["velocity"] >= 0:
                    # Start falling again
                    banana["state"] = "falling"
                    banana["velocity"] = 0.0
                    new_bananas.append(banana)
                else:
                    new_bananas.append(banana)

        self.bananas = new_bananas

    def _spawn_clone(self) -> None:
        """C — Clone: Spawn clone tank that replays player inputs with delay."""
        if self.player and self.player.alive:
            self.player.clone_ticks = 720  # 12 seconds
            # Clone spawns near player
            clone = Tank(
                row=self.player.row + 2.0,
                col=self.player.col,
                direction=self.player.direction,
                speed=self.player.speed,
                hp=1,
                is_player=True,  # Clone is ally
                fire_rate=25,
                bullet_limit=1,
                tank_type="clone",
                color="#00ced1",  # Distinct cyan color
            )
            self.clone_tank = clone
            self.events.append({"type": "sound", "sound": "powerup-pickup"})

    def _tick_clone(self) -> None:
        """Tick clone effect: replay player inputs with delay."""
        if self.clone_tank and self.player and self.player.alive and self.player.clone_ticks > 0:
            self.player.clone_ticks -= 1
            if not self.clone_tank.alive:
                # Respawn clone if dead
                self.clone_tank.row = self.player.row + 2.0
                self.clone_tank.col = self.player.col
                self.clone_tank.alive = True

            # Replay input from 15 ticks ago
            direction, fire = self._input_recorder.get_input(15)
            self.clone_tank.tick_cooldown()

            # Move clone
            if direction:
                self._move_tank(self.clone_tank, direction)
            if fire:
                self._try_fire(self.clone_tank)
        elif self.clone_tank and (not self.player or not self.player.alive or self.player.clone_ticks <= 0):
            self.clone_tank = None

    def _trigger_fireworks(self) -> None:
        """F — Fireworks: 8-directional rays that crack glass and stun enemies."""
        if not self.player or not self.player.alive:
            return

        directions = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"]
        dir_vectors = {
            "up": (-1, 0), "up-right": (-1, 1), "right": (0, 1), "down-right": (1, 1),
            "down": (1, 0), "down-left": (1, -1), "left": (0, -1), "up-left": (-1, -1),
        }

        for d in directions:
            dr, dc = dir_vectors[d]
            ray_tiles = []
            for i in range(1, 50):  # Ray length
                gr = int(self.player.row + dr * i)
                gc = int(self.player.col + dc * i)
                if not (0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH):
                    break
                tid = self.grid[gr][gc]
                tile = get_tile(tid)
                if tile.bullet_solid:
                    ray_tiles.append((gr, gc, tid))
                    if tile.destructible and tid in LETTER_BOX_IDS:
                        # Crack glass boxes
                        self._apply_bullet_hit_tile(gr, gc, self.player.id, True, 1)
                    break
                ray_tiles.append((gr, gc, tid))

            # Stun enemies hit by ray
            for enemy in self.enemies.values():
                if enemy.alive:
                    for gr, gc, _ in ray_tiles:
                        if abs(enemy.row - (gr + 0.5)) < 0.8 and abs(enemy.col - (gc + 0.5)) < 0.8:
                            enemy.sleep_ticks = 120  # 2 seconds stun
                            break

        self.fireworks.append({"origin": (self.player.row, self.player.col), "ttl": 30})
        self.events.append({"type": "sound", "sound": "enemy-explosion"})

    def _tick_fireworks(self) -> None:
        """Tick fireworks effects."""
        self.fireworks = [fw for fw in self.fireworks if fw["ttl"] > 0]
        for fw in self.fireworks:
            fw["ttl"] -= 1

    def _activate_jump(self) -> None:
        """J — Jump: Enable jumping over 1 blocking tile for 10 seconds."""
        if self.player:
            self.player.jump_ticks = 600  # 10 seconds
            self.jump_active = True

    def _activate_rainbow_world(self) -> None:
        """R — Rainbow World: Global rainbow mode for 30 seconds."""
        self.rainbow_world_ticks = 1800  # 30 seconds
        self.events.append({"type": "sound", "sound": "powerup-pickup"})

    def _spawn_airplane(self) -> None:
        """A — Airplane: Fly across map in random straight-line trajectory, dropping 3 crates."""
        # Define 8 possible flight directions (dx, dy, rotation_degrees)
        # dx = column change, dy = row change
        directions = [
            (0.15, 0, 0),      # East →
            (-0.15, 0, 180),   # West ←
            (0, 0.15, 90),     # South ↓
            (0, -0.15, 270),   # North ↑
            (0.11, 0.11, 45),  # Southeast ↘
            (-0.11, 0.11, 135),# Southwest ↙
            (0.11, -0.11, 315),# Northeast ↗
            (-0.11, -0.11, 225),# Northwest ↖
        ]
        
        # Pick random direction
        dx, dy, rotation = self.random.choice(directions)
        
        # Determine spawn position based on direction (spawn on edge, facing into map)
        if dx > 0:
            start_col = -2.0  # Spawn left of map
        elif dx < 0:
            start_col = GRID_WIDTH + 2.0  # Spawn right of map
        else:
            start_col = self.random.randint(5, GRID_WIDTH - 5)
        
        if dy > 0:
            start_row = -2.0  # Spawn above map
        elif dy < 0:
            start_row = GRID_HEIGHT + 2.0  # Spawn below map
        else:
            start_row = self.random.randint(5, GRID_HEIGHT - 5)
        
        # Ensure we have valid spawn position
        if dx == 0 and dy == 0:
            # Fallback: fly east
            dx, dy, rotation = 0.15, 0, 0
            start_row = self.random.randint(2, 10)
            start_col = -2.0
        
        self.airplanes.append({
            "row": start_row,
            "col": start_col,
            "dx": dx,
            "dy": dy,
            "rotation": rotation,
            "drops_remaining": 3,
            "next_drop_tick": 60,
            "ttl": 600,  # 10 seconds
        })
        self.events.append({"type": "sound", "sound": "airplane"})

    def _tick_airplanes(self) -> None:
        """Tick airplane effects."""
        new_airplanes = []
        for airplane in self.airplanes:
            airplane["ttl"] -= 1
            # Move airplane in its direction
            airplane["col"] += airplane["dx"]
            airplane["row"] += airplane["dy"]

            if airplane["drops_remaining"] > 0:
                airplane["next_drop_tick"] -= 1
                if airplane["next_drop_tick"] <= 0:
                    # Drop bomb from airplane position
                    drop_col = int(airplane["col"])
                    drop_row = int(airplane["row"])
                    # Spawn bomb that will fall down
                    self.bombs.append({
                        "row": float(drop_row),
                        "col": float(drop_col),
                        "target_row": self.random.randint(5, GRID_HEIGHT - 5),
                        "ttl": 180,  # 3 seconds to fall
                    })
                    airplane["drops_remaining"] -= 1
                    airplane["next_drop_tick"] = 90

            if airplane["ttl"] > 0 and airplane["drops_remaining"] >= 0:
                new_airplanes.append(airplane)

        self.airplanes = new_airplanes

    def _tick_bombs(self) -> None:
        """Tick airplane bombs falling."""
        new_bombs = []
        for bomb in self.bombs:
            bomb["ttl"] -= 1
            # Bomb falls down toward target row
            progress = 1.0 - (bomb["ttl"] / 180.0)
            bomb["row"] = bomb["row"] + (bomb["target_row"] - bomb["row"]) * 0.1

            if bomb["ttl"] > 0:
                new_bombs.append(bomb)
            else:
                # Bomb reached ground - explode like super TNT, then grant reward
                drop_col = int(bomb["col"])
                drop_row = int(bomb["row"])
                
                # Add super TNT explosion
                self._add_explosion(drop_row + 0.5, drop_col + 0.5, kind="super_tnt", radius=3)
                for _ in range(3):
                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                
                # Destroy tiles in 3-tile radius
                for dr in range(-3, 4):
                    for dc in range(-3, 4):
                        gr, gc = drop_row + dr, drop_col + dc
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                            tid = self.grid[gr][gc]
                            tile = get_tile(tid)
                            if tid not in (BASE, STEEL) and tile.destructible:
                                self.grid[gr][gc] = EMPTY
                
                # Grant reward if landing spot is empty
                if 0 <= drop_col < GRID_WIDTH and 0 <= drop_row < GRID_HEIGHT:
                    if self.grid[drop_row][drop_col] == EMPTY:
                        self._grant_airdrop_reward(drop_row, drop_col)

        self.bombs = new_bombs

    def _grant_airdrop_reward(self, row: int, col: int) -> None:
        """Grant a random airdrop reward."""
        rewards = ["shield", "homing", "score"]
        reward = self.random.choice(rewards)
        if reward == "shield" and self.player:
            self.player.rainbow_ticks = max(self.player.rainbow_ticks, 480)  # 8s shield
        elif reward == "homing" and self.player:
            # Grant one homing missile
            target = self._find_nearest_skeleton_or_worm(self.player.row, self.player.col)
            if target:
                tr, tc = target
                from .bullet import MISSILE_SPEED
                missile = Bullet(
                    owner_id=self.player.id,
                    is_player=True,
                    row=self.player.row,
                    col=self.player.col,
                    direction=self.player.direction,
                    speed=MISSILE_SPEED,
                    power=99,
                    ttl=600,
                    is_missile=True,
                    target_row=tr,
                    target_col=tc,
                )
                self.bullets[missile.id] = missile
        elif reward == "score":
            self.score += 500
        self.events.append({"type": "sound", "sound": "score-bonus"})

    def _spawn_magnet(self) -> None:
        """M — Magnet: Pull tiles toward magnet for 5 seconds."""
        # Spawn magnet at random location
        spot = self._find_random_empty_spot()
        if spot:
            self.magnets.append({
                "row": spot[0] + 0.5,
                "col": spot[1] + 0.5,
                "ttl": 300,  # 5 seconds
                "radius": 4,
            })

    def _find_random_empty_spot(self) -> Optional[tuple[int, int]]:
        """Find a random empty 1x1 spot."""
        valid_spots = []
        for r in range(2, GRID_HEIGHT - 2):
            for c in range(2, GRID_WIDTH - 2):
                if self.grid[r][c] == EMPTY:
                    valid_spots.append((r, c))
        if valid_spots:
            return self.random.choice(valid_spots)
        return None

    def _tick_magnets(self) -> None:
        """Tick magnet effects: pull tiles toward magnet center."""
        new_magnets = []
        for magnet in self.magnets:
            magnet["ttl"] -= 1
            if magnet["ttl"] % 10 == 0:  # Pull every 10 ticks
                self._pull_tiles(magnet)
            if magnet["ttl"] > 0:
                new_magnets.append(magnet)
        self.magnets = new_magnets

    def _pull_tiles(self, magnet: dict) -> None:
        """Pull tiles within magnet radius toward center."""
        center_r, center_c = int(magnet["row"]), int(magnet["col"])
        radius = magnet["radius"]

        # Collect all tiles to move (far to near order)
        tiles_to_move = []
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                if dr == 0 and dc == 0:
                    continue
                dist = max(abs(dr), abs(dc))  # Chebyshev distance
                if dist > radius:
                    continue
                gr, gc = center_r + dr, center_c + dc
                if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                    tid = self.grid[gr][gc]
                    tile = get_tile(tid)
                    # Don't move base, tanks, or already empty
                    if tid == BASE or tid == EMPTY:
                        continue
                    if tile.mobile:
                        continue
                    if tile.tank_solid and not tile.destructible:
                        continue  # Don't move steel, etc.
                    tiles_to_move.append((dist, gr, gc, dr, dc, tid))

        # Sort by distance (far first) for stable ordering
        tiles_to_move.sort(key=lambda x: -x[0])

        for _, gr, gc, dr, dc, tid in tiles_to_move:
            # Direction toward center
            step_r = -1 if dr > 0 else (1 if dr < 0 else 0)
            step_c = -1 if dc > 0 else (1 if dc < 0 else 0)
            new_r, new_c = gr + step_r, gc + step_c

            if 0 <= new_r < GRID_HEIGHT and 0 <= new_c < GRID_WIDTH:
                target_tid = self.grid[new_r][new_c]
                if target_tid == EMPTY:
                    # Move tile
                    self.grid[new_r][new_c] = tid
                    self.grid[gr][gc] = EMPTY

    def _spawn_sahur(self) -> None:
        """S — Sahur: Fast runner that destroys destructibles for 5 seconds."""
        if self.player:
            self.sahur_runners.append({
                "row": self.player.row + 5.0,
                "col": self.player.col,
                "dir": self.random.choice(["up", "down", "left", "right"]),
                "ttl": 300,  # 5 seconds
                "dir_timer": 0,
            })

    def _tick_sahur_runners(self) -> None:
        """Tick sahur runners."""
        new_runners = []
        for runner in self.sahur_runners:
            runner["ttl"] -= 1
            runner["dir_timer"] -= 1

            # Move fast
            speed = 0.15
            deltas = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}
            dr, dc = deltas[runner["dir"]]
            runner["row"] += dr * speed
            runner["col"] += dc * speed

            # Change direction on timer or wall hit
            if runner["dir_timer"] <= 0:
                runner["dir_timer"] = self.random.randint(30, 90)
                runner["dir"] = self.random.choice(["up", "down", "left", "right"])

            # Check bounds bounce
            if runner["row"] < 1 or runner["row"] > GRID_HEIGHT - 1:
                runner["dir"] = "down" if runner["dir"] == "up" else "up"
            if runner["col"] < 1 or runner["col"] > GRID_WIDTH - 1:
                runner["dir"] = "right" if runner["dir"] == "left" else "left"

            # Destroy destructibles on contact
            gr, gc = int(runner["row"]), int(runner["col"])
            if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                tid = self.grid[gr][gc]
                tile = get_tile(tid)
                if tile.destructible and tid not in {BASE}:
                    self.grid[gr][gc] = EMPTY
                    self.events.append({"type": "sound", "sound": "hit-brick"})

            # Stun enemies on contact
            for enemy in self.enemies.values():
                if enemy.alive and abs(enemy.row - runner["row"]) < 1.0 and abs(enemy.col - runner["col"]) < 1.0:
                    enemy.sleep_ticks = 60  # 1 second stun

            if runner["ttl"] > 0:
                new_runners.append(runner)

        self.sahur_runners = new_runners

    def _trigger_sleep(self) -> None:
        """Z — Zzz: Put all enemies to sleep for 8 seconds."""
        for enemy in self.enemies.values():
            if enemy.alive:
                enemy.sleep_ticks = 480  # 8 seconds
        self.events.append({"type": "sound", "sound": "powerup-pickup"})

    def _activate_base_shield(self) -> None:
        """O — Octopus: Protect base for 60 seconds."""
        self.base_shield_ticks = 3600  # 60 seconds
        self.events.append({"type": "sound", "sound": "powerup-pickup"})

    def _tick_letter_buffs(self) -> None:
        """Tick letter powerup buff timers."""
        if self.rainbow_world_ticks > 0:
            self.rainbow_world_ticks -= 1

        if self.base_shield_ticks > 0:
            self.base_shield_ticks -= 1

        if self.player and self.player.jump_ticks > 0:
            self.player.jump_ticks -= 1
            self.jump_active = self.player.jump_ticks > 0
        else:
            self.jump_active = False

    def _tick_evil_jaws(self) -> None:
        """Evil Jaws roam and chase any tank (player or enemy)."""
        for jaw in list(self.evil_jaws.values()):
            if not jaw.alive:
                self.evil_jaws.pop(jaw.id, None)
                continue
            
            jaw.tick_cooldown()
            
            # Increase base speed for more aggressive chasing
            jaw.speed = TANK_SPEED * 1.5
            
            # Find nearest tank (excluding other jaws)
            # Prioritize ENEMIES over the player
            enemies = [e for e in self.enemies.values() if e.alive]
            player_tank = self.player if (self.player and self.player.alive) else None
            
            best_target = None
            best_dist = 60.0 # Global chase range
            
            # Try to find nearest enemy first
            for e in enemies:
                d = math.hypot(e.row - jaw.row, e.col - jaw.col)
                if d < best_dist:
                    best_dist = d
                    best_target = e
            
            # Only target player if no enemies are in range
            if not best_target and player_tank:
                d = math.hypot(player_tank.row - jaw.row, player_tank.col - jaw.col)
                if d < best_dist:
                    best_target = player_tank

            if best_target:
                # Chase logic: simple axis alignment
                dr_t = best_target.row - jaw.row
                dc_t = best_target.col - jaw.col
                if abs(dr_t) > abs(dc_t):
                    jaw.ai_dir = "down" if dr_t > 0 else "up"
                else:
                    jaw.ai_dir = "right" if dc_t > 0 else "left"
            else:
                # Roam randomly
                jaw.ai_timer -= 1
                if jaw.ai_timer <= 0:
                    jaw.ai_timer = random.randint(30, 90) # Faster direction changes
                    jaw.ai_dir = random.choice(["up", "down", "left", "right"])
            
            # Execute movement
            moved = self._move_tank(jaw, jaw.ai_dir)
            if not moved:
                # If blocked, pick a new direction soon
                jaw.ai_timer = 0
            
            # Attack: Contact damage (BITE - instant kill for enemies)
            # Increased hit distance (2.0) to ensure it triggers before/during collision
            all_targets = enemies + ([player_tank] if player_tank else [])
            for t in all_targets:
                # Collision radius for 2x2 vs 1x1 is 1.5, so 2.0 reach ensures a bite
                hit_dist = 2.0 
                if abs(t.row - jaw.row) < hit_dist and abs(t.col - jaw.col) < hit_dist:
                    # 'Bite' check every 5 ticks for maximum aggression
                    if self.tick_count % 5 == 0:
                        if t.is_player:
                            t.hp -= 1
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                        else:
                            # Instant kill bite for enemies!
                            t.hp = 0
                        
                        if t.hp <= 0:
                            t.alive = False
                            self._add_explosion(t.row, t.col)
                            if t.is_player:
                                self.player_lives -= 1
                                self.events.append({"type": "sound", "sound": "player-explosion"})
                                self._player_respawn_timer = 180
                            else:
                                self.score += 200
                                self.enemies_remaining -= 1
                                self.events.append({"type": "sound", "sound": "enemy-explosion"})

    def _spawn_evil_jaw(self, row: float, col: float) -> None:
        """Create a new Evil Jaw entity."""
        jaw = Tank(
            row=row,
            col=col,
            tank_type="evil_jaw",
            speed=TANK_SPEED * 1.5, # Aggressive speed
            hp=3, # Requires 3 hits to destroy
            color="#ff00ff",
            is_player=False, # It's a monster
            is_big=True      # Renders as 2x2
        )
        self.evil_jaws[jaw.id] = jaw

    # ------------------------------------------------------------------
    # Skeleton / Sandworm helpers
    # ------------------------------------------------------------------

    def _find_nearest_skeleton_or_worm(self, from_row: float, from_col: float) -> Optional[tuple[float, float]]:
        """Find the nearest skeleton or sandworm position for sun missile targeting."""
        best_dist = float("inf")
        best_pos = None

        for skel in self.skeleton_ctrl.skeletons:
            if not skel["alive"]:
                continue
            sr = skel["row"] + skel["h"] / 2
            sc = skel["col"] + skel["w"] / 2
            d = math.hypot(sr - from_row, sc - from_col)
            if d < best_dist:
                best_dist = d
                best_pos = (sr, sc)

        if self.skeleton_ctrl.mega and self.skeleton_ctrl.mega["alive"]:
            mega = self.skeleton_ctrl.mega
            sr = mega["row"] + mega["h"] / 2
            sc = mega["col"] + mega["w"] / 2
            d = math.hypot(sr - from_row, sc - from_col)
            if d < best_dist:
                best_dist = d
                best_pos = (sr, sc)

        if self.sandworm.get("active") and self.sandworm.get("parts"):
            head = self.sandworm["parts"][0]
            wr = head["row"] + 0.5
            wc = head["col"] + 0.5
            d = math.hypot(wr - from_row, wc - from_col)
            if d < best_dist:
                best_dist = d
                best_pos = (wr, wc)

        return best_pos

    def _build_golden_arch(self) -> None:
        if not self._base_pos:
            return
        base_r, base_c = self._base_pos
        # Positions around the base (2x2 block top-left coordinates)
        offsets = [(-2, -2), (-2, 0), (-2, 2), (0, -2), (0, 2)]
        for dr, dc in offsets:
            r, c = base_r + dr, base_c + dc
            for gr in range(r, r + 2):
                for gc in range(c, c + 2):
                    if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                        if self.grid[gr][gc] != BASE and self.grid[gr][gc] != GOLDEN_FRAME:
                            self._saved_eagle_tiles[(gr, gc)] = self.grid[gr][gc]
                            self.grid[gr][gc] = GOLDEN_FRAME

    def _remove_golden_arch(self) -> None:
        for (gr, gc), original_tid in self._saved_eagle_tiles.items():
            if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                if self.grid[gr][gc] == GOLDEN_FRAME:
                    self.grid[gr][gc] = original_tid
        self._saved_eagle_tiles.clear()

    def _tick_turrets(self) -> None:
        for t_id, turret in list(self.turrets.items()):
            if not turret.alive:
                self.turrets.pop(t_id, None)
                continue

            turret.tick_cooldown()

            # Find closest target (enemy tank or sandworm head) within 10 tiles
            best_dist = float('inf')
            best_target_row = None
            best_target_col = None

            for e in self.enemies.values():
                if e.alive:
                    dist = math.hypot(e.row - turret.row, e.col - turret.col)
                    if dist < best_dist and dist < 10.0:
                        best_dist = dist
                        best_target_row = e.row
                        best_target_col = e.col

            # Also target sandworm head if active and in range
            if self.sandworm.get("active") and self.sandworm.get("parts"):
                head = self.sandworm["parts"][0]
                worm_row = head["row"] + 0.5
                worm_col = head["col"] + 0.5
                dist = math.hypot(worm_row - turret.row, worm_col - turret.col)
                if dist < best_dist and dist < 10.0:
                    best_dist = dist
                    best_target_row = worm_row
                    best_target_col = worm_col

            # Also target skeletons (normal and mega)
            skel_targets = list(self.skeleton_ctrl.skeletons)
            if self.skeleton_ctrl.mega and self.skeleton_ctrl.mega["alive"]:
                skel_targets.append(self.skeleton_ctrl.mega)
            for skel in skel_targets:
                if not skel["alive"]:
                    continue
                skel_row = skel["row"] + skel["h"] / 2
                skel_col = skel["col"] + skel["w"] / 2
                dist = math.hypot(skel_row - turret.row, skel_col - turret.col)
                if dist < best_dist and dist < 10.0:
                    best_dist = dist
                    best_target_row = skel_row
                    best_target_col = skel_col

            if best_target_row is not None:
                dr = best_target_row - turret.row
                dc = best_target_col - turret.col
                if abs(dr) > abs(dc):
                    turret.direction = "down" if dr > 0 else "up"
                else:
                    turret.direction = "right" if dc > 0 else "left"

                if turret.can_fire():
                    self._try_fire(turret)

    def _ai_tick_companion(self, companion: Tank, master: Tank) -> None:
        if not master or not master.alive:
            return

        # ── 0. Snap back if too far away (≥ 8 cells) ───────────────────
        dist_to_master = math.hypot(master.row - companion.row, master.col - companion.col)
        if dist_to_master >= 8.0:
            # Teleport to just behind the master
            dir_offsets = {
                "up":    ( 2.0,  0.0),
                "down":  (-2.0,  0.0),
                "left":  ( 0.0,  2.0),
                "right": ( 0.0, -2.0),
            }
            cdr, cdc = dir_offsets.get(master.direction, (2.0, 0.0))
            companion.row = max(1.0, min(float(GRID_HEIGHT) - 1.0, master.row + cdr))
            companion.col = max(1.0, min(float(GRID_WIDTH) - 1.0, master.col + cdc))

        # Always fire at twice the master's rate
        companion.fire_rate = max(8, master.fire_rate // 2)

        # ── 1. Find nearest threat within 15 cells ─────────────────────
        best_dist = 15.0
        best_target_row: Optional[float] = None
        best_target_col: Optional[float] = None

        targets = list(self.enemies.values()) if master.is_player else [self.player] if self.player else []
        for target in targets:
            if not target or not target.alive:
                continue
            dist = math.hypot(target.row - companion.row, target.col - companion.col)
            if dist < best_dist:
                best_dist = dist
                best_target_row = target.row
                best_target_col = target.col

        if master.is_player:
            for turret in self.turrets.values():
                if not turret.alive:
                    continue
                dist = math.hypot(turret.row - companion.row, turret.col - companion.col)
                if dist < best_dist:
                    best_dist = dist
                    best_target_row = turret.row
                    best_target_col = turret.col

        if self.sandworm.get("active") and self.sandworm.get("parts"):
            head = self.sandworm["parts"][0]
            worm_row = head["row"] + 0.5
            worm_col = head["col"] + 0.5
            dist = math.hypot(worm_row - companion.row, worm_col - companion.col)
            if dist < best_dist:
                best_dist = dist
                best_target_row = worm_row
                best_target_col = worm_col

        # Also target skeletons (normal and mega)
        skel_targets = list(self.skeleton_ctrl.skeletons)
        if self.skeleton_ctrl.mega and self.skeleton_ctrl.mega["alive"]:
            skel_targets.append(self.skeleton_ctrl.mega)
        for skel in skel_targets:
            if not skel["alive"]:
                continue
            skel_row = skel["row"] + skel["h"] / 2
            skel_col = skel["col"] + skel["w"] / 2
            dist = math.hypot(skel_row - companion.row, skel_col - companion.col)
            if dist < best_dist:
                best_dist = dist
                best_target_row = skel_row
                best_target_col = skel_col

        # ── 2. Aim: face threat every tick (fast response, no jitter) ──
        if best_target_row is not None:
            dr = best_target_row - companion.row
            dc = best_target_col - companion.col
            if abs(dr) > abs(dc):
                companion.direction = "down" if dr > 0 else "up"
            else:
                companion.direction = "right" if dc > 0 else "left"
            if companion.can_fire():
                self._try_fire(companion)

        # ── 3. Movement: update destination every 20 ticks to avoid jitter ─
        companion.ai_timer -= 1
        if companion.ai_timer <= 0:
            companion.ai_timer = 20  # Re-evaluate ~3× per second

            # Target: 3 cells ahead of the master's current facing direction
            dir_offsets = {
                "up":    (-3.0,  0.0),
                "down":  ( 3.0,  0.0),
                "left":  ( 0.0, -3.0),
                "right": ( 0.0,  3.0),
            }
            pdr, pdc = dir_offsets.get(master.direction, (0.0, 0.0))
            target_row = max(1.0, min(float(GRID_HEIGHT) - 1.0, master.row + pdr))
            target_col = max(1.0, min(float(GRID_WIDTH)  - 1.0, master.col + pdc))

            dist_to_target = math.hypot(target_row - companion.row, target_col - companion.col)
            dist_to_master = math.hypot(master.row - companion.row, master.col - companion.col)

            if dist_to_target > 1.0:
                # Use BFS to find a path to the spot ahead of master
                path_dir = self._find_path_dir(companion.row, companion.col, target_row, target_col, companion)
                if path_dir:
                    companion.ai_dir = path_dir
                    if path_dir in ("up", "down"):
                        companion.companion_orbit_angle = 1.0 if target_col > companion.col else -1.0
                    else:
                        companion.companion_orbit_angle = 1.0 if target_row > companion.row else -1.0
                else:
                    # Fallback: head directly in the master's movement direction to get ahead
                    companion.ai_dir = master.direction
                    companion.companion_orbit_angle = 1.0
            elif dist_to_master < 1.5:
                # Too close — push ahead in master's movement direction
                companion.ai_dir = master.direction
                companion.companion_orbit_angle = 1.0
            else:
                companion.ai_dir = ""  # On position — hold

        # ── 4. Execute committed move direction (smooth, one tick at a time) ─
        if companion.ai_dir:
            if not self._move_tank(companion, companion.ai_dir):
                # Blocked — try orthogonal nudge to slide around obstacle
                rev = {"up": "down", "down": "up", "left": "right", "right": "left"}
                ortho = {
                    "up":    "right" if companion.companion_orbit_angle > 0 else "left",
                    "down":  "right" if companion.companion_orbit_angle > 0 else "left",
                    "left":  "down"  if companion.companion_orbit_angle > 0 else "up",
                    "right": "down"  if companion.companion_orbit_angle > 0 else "up",
                }
                nudge = ortho.get(companion.ai_dir, "up")
                if not self._move_tank(companion, nudge):
                    # Still stuck — reset timer so we re-evaluate soon
                    companion.ai_timer = 0

        # ── 5. Face movement direction when no threat to aim at ────────
        if best_target_row is None and companion.ai_dir:
            companion.direction = companion.ai_dir

    def _ai_tick(self, enemy: Tank) -> None:
        # Build mini game state for agent
        base_pos = self._base_pos

        # Update AI timer
        enemy.ai_timer -= 1

        # Determine new direction if timer expired or occasionally randomly
        if enemy.ai_timer <= 0 or random.random() < 0.02:
            enemy.ai_timer = random.randint(60, 180) # 1 to 3 seconds at 60Hz
            
            is_friendly = getattr(self, "_friendly_mode", False)
            if base_pos and not is_friendly and random.random() < 0.6: # 60% chance to target base
                dr = base_pos[0] - enemy.row
                dc = base_pos[1] - enemy.col
                if abs(dr) > abs(dc):
                    enemy.ai_dir = "down" if dr > 0 else "up"
                else:
                    enemy.ai_dir = "right" if dc > 0 else "left"
            else:
                enemy.ai_dir = random.choice(["up", "down", "left", "right"])

        # Try to move
        moved = self._move_tank(enemy, enemy.ai_dir)
        
        # If blocked, immediately pick a new direction
        if not moved:
            enemy.ai_timer = 0

        # Only attempt to fire if a bullet isn't already in flight
        if enemy.active_bullets < enemy.bullet_limit and random.random() < 0.025:
            self._try_fire(enemy)

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def _is_cell_passable_for_pathfinding(self, r_center: float, c_center: float, mover: Tank) -> bool:
        size = TANK_HALF * 2.0 if (mover.mushroom_ticks > 0 or mover.is_big) else TANK_HALF
        r1, r2 = r_center - size, r_center + size
        c1, c2 = c_center - size, c_center + size

        if r1 < 0 or c1 < 0 or r2 > GRID_HEIGHT or c2 > GRID_WIDTH:
            return False

        if mover.airborne_ticks > 0:
            return True

        for r in range(int(r1), int(r2) + 1):
            for c in range(int(c1), int(c2) + 1):
                if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                    tile = get_tile(self.grid[r][c])
                    if tile.tank_solid and not tile.walkable:
                        if can_big_tank_crush(tile, BASE, mover, BIG_BOX_IDS):
                            pass
                        else:
                            return False
        return True

    def _find_path_dir(self, start_r: float, start_c: float, target_r: float, target_c: float, mover: Tank) -> str:
        sr, sc = int(start_r), int(start_c)
        tr, tc = int(target_r), int(target_c)
        
        if sr == tr and sc == tc:
            return ""
            
        from collections import deque
        queue = deque([(sr, sc)])
        visited = {(sr, sc)}
        first_move = {(sr, sc): ""}
        
        best_dist = abs(sr - tr) + abs(sc - tc)
        best_cell = (sr, sc)
        
        while queue and len(visited) < 400:
            curr_r, curr_c = queue.popleft()
            
            if curr_r == tr and curr_c == tc:
                return first_move[(curr_r, curr_c)]
                
            for dr, dc, dname in [(-1, 0, "up"), (1, 0, "down"), (0, -1, "left"), (0, 1, "right")]:
                nr, nc = curr_r + dr, curr_c + dc
                if 0 <= nr < GRID_HEIGHT and 0 <= nc < GRID_WIDTH and (nr, nc) not in visited:
                    if self._is_cell_passable_for_pathfinding(nr + 0.5, nc + 0.5, mover):
                        visited.add((nr, nc))
                        queue.append((nr, nc))
                        first_move[(nr, nc)] = dname if first_move[(curr_r, curr_c)] == "" else first_move[(curr_r, curr_c)]
                        
                        dist = abs(nr - tr) + abs(nc - tc)
                        if dist < best_dist:
                            best_dist = dist
                            best_cell = (nr, nc)
                            
        return first_move.get(best_cell, "")

    def _move_tank(self, tank: Tank, direction: str) -> bool:
        tank.direction = direction

        deltas = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}
        dr, dc = deltas.get(direction, (0, 0))

        # Check speed mult from tile beneath
        speed_mult = 1.0
        r_int, c_int = int(tank.row), int(tank.col)
        if 0 <= r_int < GRID_HEIGHT and 0 <= c_int < GRID_WIDTH:
            speed_mult = get_tile(self.grid[r_int][c_int]).speed_mult

        actual_speed = tank.speed * speed_mult
        new_row = tank.row + dr * actual_speed
        new_col = tank.col + dc * actual_speed

        moved = False
        if self._can_move_to(new_row, new_col, tank):
            size = TANK_HALF * 2.0 if (tank.mushroom_ticks > 0 or tank.is_big) else TANK_HALF
            tank.row = max(size, min(float(GRID_HEIGHT) - size, new_row))
            tank.col = max(size, min(float(GRID_WIDTH) - size, new_col))
            moved = True
            
            if tank.mushroom_ticks > 0 or tank.is_big:
                self._clear_area_for_tank(tank, force=True)

        # Smooth perpendicular auto-alignment toward tile center
        if dr != 0:
            target_col = math.floor(tank.col) + 0.5
            diff = target_col - tank.col
            if abs(diff) > 0.001:
                step = math.copysign(min(abs(diff), actual_speed), diff)
                if self._can_move_to(tank.row, tank.col + step, tank):
                    tank.col += step
        if dc != 0:
            target_row = math.floor(tank.row) + 0.5
            diff = target_row - tank.row
            if abs(diff) > 0.001:
                step = math.copysign(min(abs(diff), actual_speed), diff)
                if self._can_move_to(tank.row + step, tank.col, tank):
                    tank.row += step
        
        return moved

    def _can_move_to(self, row: float, col: float, mover: Tank) -> bool:
        """AABB collision check."""
        size = TANK_HALF * 2.0 if (mover.mushroom_ticks > 0 or mover.is_big) else TANK_HALF
        r1, r2 = row - size, row + size
        c1, c2 = col - size, col + size

        # 1. Boundary check — strict to grid limits
        if r1 < 0 or c1 < 0 or r2 > GRID_HEIGHT or c2 > GRID_WIDTH:
            return False

        # Airborne bypasses tile and tank collisions
        if mover.airborne_ticks > 0:
            return True

        # 2. Tile collision (walkable tiles never block movement)
        for r in range(int(r1), int(r2) + 1):
            for c in range(int(c1), int(c2) + 1):
                if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                    tile = get_tile(self.grid[r][c])
                    if tile.tank_solid and not tile.walkable:
                        if can_big_tank_crush(tile, BASE, mover, BIG_BOX_IDS):
                            pass # Big tank can move through and destroy solid tiles (but not glass/chick boxes or player's base)
                        else:
                            return False

        # 3. Tank-tank collision (same box as tile check)
        all_tanks = list(self.enemies.values()) + ([self.player] if self.player else []) + list(self.turrets.values()) + list(self.evil_jaws.values())
        all_tanks += [t.companion for t in all_tanks if getattr(t, 'companion', None) and t.companion.alive]
        
        for other in all_tanks:
            if other is mover or not other.alive:
                continue
            other_size = TANK_HALF * 2.0 if (other.mushroom_ticks > 0 or other.is_big) else TANK_HALF
            if abs(other.row - row) < (size + other_size) and abs(other.col - col) < (size + other_size):
                return False
        return True

    def _tick_creature_tiles(self) -> None:
        """Hazard contact for tiles with creature_affinity (ally / enemy)."""
        tanks: List[Tank] = []
        tanks.extend(e for e in self.enemies.values() if e.alive)
        if self.player and self.player.alive:
            tanks.append(self.player)
        tanks.extend(t for t in self.turrets.values() if t.alive)
        tanks.extend(t for t in self.evil_jaws.values() if t.alive)
        for t in list(tanks):
            if t.companion and t.companion.alive:
                tanks.append(t.companion)

        seen: set[str] = set()
        for tank in tanks:
            if tank.id in seen or not tank.alive:
                continue
            seen.add(tank.id)

            cd = self._creature_tile_contact_cd.get(tank.id, 0)
            if cd > 0:
                self._creature_tile_contact_cd[tank.id] = cd - 1
                continue

            size = TANK_HALF * 2.0 if (tank.mushroom_ticks > 0 or tank.is_big) else TANK_HALF
            r1, r2 = int(tank.row - size), int(tank.row + size)
            c1, c2 = int(tank.col - size), int(tank.col + size)

            hit = False
            for gr in range(r1, r2 + 1):
                for gc in range(c1, c2 + 1):
                    if not (0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH):
                        continue
                    tile = get_tile(self.grid[gr][gc])
                    aff = tile.creature_affinity
                    if aff == "enemy" and tank.is_player:
                        hit = True
                        break
                    if (
                        aff == "ally"
                        and not tank.is_player
                        and (tank.tank_type in ENEMY_TYPES or tank.tank_type == "evil_jaw")
                    ):
                        hit = True
                        break
                if hit:
                    break

            if not hit:
                continue

            tank.hp -= 1
            self._creature_tile_contact_cd[tank.id] = CREATURE_TILE_CONTACT_INTERVAL
            self.events.append({"type": "sound", "sound": "brick-hit"})
            if tank.hp <= 0:
                tank.alive = False
                self._add_explosion(tank.row, tank.col)
                if tank.tank_type == "companion":
                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                    for owner in list(self.enemies.values()) + ([self.player] if self.player else []):
                        if owner and owner.companion is tank:
                            owner.companion = None
                            break
                elif tank.tank_type == "turret":
                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                elif not tank.is_player:
                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                    if tank.tank_type == "evil_jaw":
                        pass
                    elif tank.tank_type in ENEMY_TYPES:
                        self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                        self.enemies_remaining -= 1
                else:
                    self.events.append({"type": "sound", "sound": "player-explosion"})
                    self.player_lives -= 1
                    self._player_respawn_timer = 180

    # ------------------------------------------------------------------
    # Bullets
    # ------------------------------------------------------------------

    def _try_fire(self, tank: Tank) -> None:
        if tank.mega_gun_ticks > 0:
            if not tank.can_fire():
                return
            tank.fire_cooldown = max(10, tank.fire_rate // 2)
            tank.active_bullets += 2
            muzzle = 0.6
            side_offset = 0.4
            dir_offsets = {
                "up":    ((-muzzle, -side_offset), (-muzzle, side_offset)),
                "down":  ((muzzle, -side_offset),  (muzzle, side_offset)),
                "left":  ((-side_offset, -muzzle), (side_offset, -muzzle)),
                "right": ((-side_offset, muzzle),  (side_offset, muzzle)),
            }
            offsets = dir_offsets.get(tank.direction, ((-muzzle, 0), (-muzzle, 0)))
            for dr, dc in offsets:
                grenade = Bullet(
                    owner_id=tank.id,
                    is_player=tank.is_player,
                    row=tank.row + dr,
                    col=tank.col + dc,
                    direction=tank.direction,
                    speed=0.22,
                    power=2,
                    ttl=36,  # ~7 tiles at 0.22 tiles/tick + small buffer
                    is_grenade=True,
                    start_row=tank.row,
                    start_col=tank.col,
                )
                self.bullets[grenade.id] = grenade
            self.events.append({"type": "sound", "sound": "fire"})
            return

        bullet = tank.fire()
        if bullet:
            self.bullets[bullet.id] = bullet
            self.events.append({"type": "sound", "sound": "fire"})

    def _apply_bullet_hit_tile(
        self,
        r: int,
        c: int,
        owner_id: str,
        is_player: bool,
        power: int,
        crush_bricks: bool = False,
    ) -> None:
        """Apply one bullet-hit worth of damage to the tile at (r, c).

        Mirrors the destructive logic that was previously inlined in _tick_bullets
        so that grenade area explosions go through the same incremental steps
        (cracking glass/boxes, triggering powerup pickups) instead of wiping tiles.
        """
        tile = get_tile(self.grid[r][c])
        if not tile.bullet_solid:
            return

        if tile.is_explosive:
            self._detonate_tile(r, c, tile.explosion_radius)
            return

        if not tile.destructible:
            self.events.append({"type": "sound", "sound": "hit-steel"})
            return

        if tile.is_base:
            player_is_big = (is_player and self.player and
                             (self.player.mushroom_ticks > 0 or self.player.is_big))
            if not player_is_big:
                # Octopus shield (O powerup) protects base
                if self.base_shield_ticks > 0:
                    # Shield absorbs hit - no damage
                    return
                if self.golden_eagle_ticks <= 0:
                    self.grid[r][c] = EMPTY
                    self._trigger_defeat()
            return

        tid = self.grid[r][c]
        if tid == BRICK:
            self.grid[r][c] = EMPTY
            self.events.append({"type": "sound", "sound": "brick-hit"})
        elif tid in BIG_BOX_OR_PAD_IDS and tid not in BIG_BOX_IDS:
            self.grid[r][c] = EMPTY
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif GLASS <= tid <= GLASS_CRACK1:
            self.grid[r][c] += 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid == GLASS_CRACK2:
            self.grid[r][c] = EMPTY
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in MUSHROOM_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(MUSHROOM_BOX_IDS), max(MUSHROOM_BOX_IDS)):
                self.grid[gr][gc] -= 1
                if self.grid[gr][gc] == AUTO_TURRET:
                    self.grid[gr][gc] = MUSHROOM_PAD
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in CHICK_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(CHICK_BOX_IDS), max(CHICK_BOX_IDS)):
                self.grid[gr][gc] -= 1
                if self.grid[gr][gc] == CHICK_PAD:
                    self.grid[gr][gc] = CHICK_PAD
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in MONEY_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(MONEY_BOX_IDS), max(MONEY_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in SUN_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(SUN_BOX_IDS), max(SUN_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in MEGAGUN_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(MEGAGUN_BOX_IDS), max(MEGAGUN_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})

        # Letter powerup boxes — crack progressively like money/sun boxes
        elif tid in BANANA_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(BANANA_BOX_IDS), max(BANANA_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in CLONE_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(CLONE_BOX_IDS), max(CLONE_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in FIREWORKS_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(FIREWORKS_BOX_IDS), max(FIREWORKS_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in JUMP_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(JUMP_BOX_IDS), max(JUMP_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in RAINBOW_WORLD_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(RAINBOW_WORLD_BOX_IDS), max(RAINBOW_WORLD_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in AIRPLANE_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(AIRPLANE_BOX_IDS), max(AIRPLANE_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in MAGNET_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(MAGNET_BOX_IDS), max(MAGNET_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in SAHUR_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(SAHUR_BOX_IDS), max(SAHUR_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in ZZZ_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(ZZZ_BOX_IDS), max(ZZZ_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid in OCTOPUS_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(OCTOPUS_BOX_IDS), max(OCTOPUS_BOX_IDS)):
                self.grid[gr][gc] -= 1
            self.events.append({"type": "sound", "sound": "hit-brick"})

        elif tid == SUN_PAD:
            for gr, gc in self._find_box_group(r, c, SUN_PAD, SUN_PAD):
                self.grid[gr][gc] = EMPTY
            self._sun_tile_pos = None
            self._sun_spawn_timer = random.randint(1800, 3000)
            self.events.append({"type": "sound", "sound": "powerup-pickup"})
            if is_player and self.player and self.player.id == owner_id:
                target = self._find_nearest_skeleton_or_worm(self.player.row, self.player.col)
                if target:
                    tr, tc = target
                    missile = Bullet(
                        owner_id=self.player.id,
                        is_player=True,
                        row=self.player.row,
                        col=self.player.col,
                        direction=self.player.direction,
                        speed=MISSILE_SPEED,
                        power=99,
                        ttl=600,
                        is_missile=True,
                        target_row=tr,
                        target_col=tc,
                    )
                    self.bullets[missile.id] = missile
        elif tid == MEGAGUN_PAD:
            for gr, gc in self._find_box_group(r, c, MEGAGUN_PAD, MEGAGUN_PAD):
                self.grid[gr][gc] = EMPTY
            self._megagun_tile_pos = None
            self._megagun_spawn_timer = random.randint(1800, 3000)
            self.events.append({"type": "sound", "sound": "powerup-pickup"})
            if is_player and self.player and self.player.id == owner_id:
                self.player.mega_gun_ticks = 1800
        elif tid == CHICK_PAD:
            for gr, gc in self._find_box_group(r, c, CHICK_PAD, CHICK_PAD):
                self.grid[gr][gc] = EMPTY
            self.events.append({"type": "sound", "sound": "powerup-pickup"})
            owner_tank = None
            if self.player and self.player.id == owner_id:
                owner_tank = self.player
            else:
                for enemy in self.enemies.values():
                    if enemy.id == owner_id:
                        owner_tank = enemy
                        break
            if owner_tank:
                self._spawn_companion_for(owner_tank)
        elif tid == MUSHROOM_PAD:
            for gr, gc in self._find_box_group(r, c, MUSHROOM_PAD, MUSHROOM_PAD):
                self.grid[gr][gc] = EMPTY
            self.events.append({"type": "sound", "sound": "powerup-pickup"})
            if self.player and self.player.id == owner_id:
                self.player.mushroom_ticks = max(self.player.mushroom_ticks, 0) + 600
                self._clear_area_for_tank(self.player, force=True)
            else:
                for enemy in self.enemies.values():
                    if enemy.id == owner_id:
                        enemy.mushroom_ticks = max(enemy.mushroom_ticks, 0) + 600
                        self._clear_area_for_tank(enemy, force=True)
                        break
                for turret in self.turrets.values():
                    if turret.id == owner_id:
                        turret.mushroom_ticks = max(turret.mushroom_ticks, 0) + 600
                        self._clear_area_for_tank(turret, force=True)
                        break
        elif tid in RAINBOW_BOX_IDS:
            for gr, gc in self._find_box_group(r, c, min(RAINBOW_BOX_IDS), max(RAINBOW_BOX_IDS)):
                self.grid[gr][gc] -= 1
                if self.grid[gr][gc] == MUSHROOM_BOX:
                    self.grid[gr][gc] = RAINBOW_PAD
            self.events.append({"type": "sound", "sound": "hit-brick"})
        elif tid == RAINBOW_PAD:
            for gr, gc in self._find_box_group(r, c, RAINBOW_PAD, RAINBOW_PAD):
                self.grid[gr][gc] = EMPTY
            self.events.append({"type": "sound", "sound": "powerup-pickup"})
            if self.player and self.player.id == owner_id:
                bonus = 600 if self.player.rainbow_ticks > 0 else 1800
                self.player.rainbow_ticks = max(self.player.rainbow_ticks, 0) + bonus
            else:
                for enemy in self.enemies.values():
                    if enemy.id == owner_id:
                        bonus = 600 if enemy.rainbow_ticks > 0 else 1800
                        enemy.rainbow_ticks = max(enemy.rainbow_ticks, 0) + bonus
                        break
                for turret in self.turrets.values():
                    if turret.id == owner_id:
                        bonus = 600 if turret.rainbow_ticks > 0 else 1800
                        turret.rainbow_ticks = max(turret.rainbow_ticks, 0) + bonus
                        break
        elif tid == 998:  # TOOTH
            group = self._find_box_group(r, c, 998, 998)
            for gr, gc in group:
                self.grid[gr][gc] = EMPTY
            
            # Spawn at the group's geometric center
            # For 1x1: center is r+0.5, c+0.5
            # For 2x2 starting at ar, ac: center is ar+1.0, ac+1.0
            avg_r = sum(pos[0] for pos in group) / len(group) + 0.5
            avg_c = sum(pos[1] for pos in group) / len(group) + 0.5
            
            self._spawn_evil_jaw(avg_r, avg_c)
            self.events.append({"type": "sound", "sound": "powerup-appear"})
        elif tid >= 100:
            # Custom Tiles Advanced Logic
            custom_tile = get_tile(tid)
            target = custom_tile.damage_target_id if custom_tile.damage_target_id is not None else EMPTY

            if custom_tile.is_box:
                block = self._find_box_group(r, c, tid, tid)
                if custom_tile.mobile:
                    self.mobile_tile_ctrl.unregister_entities_in_block(block)
                for gr, gc in block:
                    self.grid[gr][gc] = target
            elif custom_tile.partial_destructible:
                if self.mobile_tile_ctrl.on_partial_custom_damage(r, c, tid, target):
                    self.events.append({"type": "sound", "sound": "hit-brick"})
                    return
                self.grid[r][c] = target
            else:
                block = self._find_custom_tile_block(r, c, tid)
                if custom_tile.mobile:
                    self.mobile_tile_ctrl.unregister_entities_in_block(block)
                for gr, gc in block:
                    self.grid[gr][gc] = target
            self.events.append({"type": "sound", "sound": "hit-brick"})
        else:
            self.grid[r][c] = EMPTY
            self.events.append({"type": "sound", "sound": "hit-brick"})

    def _tick_bullets(self) -> None:
        for bullet in list(self.bullets.values()):
            if not bullet.alive:
                continue

            bullet.tick()
            
            # Apply conveyor to bullet
            r_int, c_int = int(bullet.row), int(bullet.col)
            if 0 <= r_int < GRID_HEIGHT and 0 <= c_int < GRID_WIDTH:
                tid = self.grid[r_int][c_int]
                if tid in CONVEYOR_IDS:
                    conv_speed = 0.02
                    if tid == CONVEYOR_UP:
                        bullet.row -= conv_speed
                    elif tid == CONVEYOR_DOWN:
                        bullet.row += conv_speed
                    elif tid == CONVEYOR_LEFT:
                        bullet.col -= conv_speed
                    elif tid == CONVEYOR_RIGHT:
                        bullet.col += conv_speed

            if not bullet.alive:
                self._on_bullet_gone(bullet)
                continue

            # Sun missile: update target live and explode on arrival
            if bullet.is_missile:
                new_target = self._find_nearest_skeleton_or_worm(bullet.row, bullet.col)
                if new_target:
                    bullet.target_row, bullet.target_col = new_target
                if bullet.target_row is not None and bullet.target_col is not None:
                    if math.hypot(bullet.row - bullet.target_row, bullet.col - bullet.target_col) < 0.5:
                        bullet.alive = False
                        self._on_bullet_gone(bullet)
                        continue
                r, c = int(bullet.row), int(bullet.col)
                if bullet.row < 0 or bullet.col < 0 or bullet.row >= GRID_HEIGHT or bullet.col >= GRID_WIDTH:
                    bullet.alive = False
                    self._on_bullet_gone(bullet)
                continue

            # Grenades behave like normal bullets (hit walls/tanks) and explode on contact
            if bullet.is_grenade and not bullet.alive:
                self._on_bullet_gone(bullet)
                continue

            # Out of bounds
            r, c = int(bullet.row), int(bullet.col)
            if bullet.row < 0 or bullet.col < 0 or bullet.row >= GRID_HEIGHT or bullet.col >= GRID_WIDTH:
                bullet.alive = False
                self._on_bullet_gone(bullet)
                continue
                
            # Tile collision
            tile = get_tile(self.grid[r][c])
            if tile.bullet_solid:
                if self.grid[r][c] == SUNFLOWER:
                    # Bumper reflection
                    if bullet.direction == "up":
                        bullet.direction = "down"
                        bullet.row += bullet.speed * 2
                    elif bullet.direction == "down":
                        bullet.direction = "up"
                        bullet.row -= bullet.speed * 2
                    elif bullet.direction == "left":
                        bullet.direction = "right"
                        bullet.col += bullet.speed * 2
                    elif bullet.direction == "right":
                        bullet.direction = "left"
                        bullet.col -= bullet.speed * 2
                    self.events.append({"type": "sound", "sound": "hit-steel"})
                    continue
                else:
                    crush = bullet.crush_bricks
                    tid_before = self.grid[r][c]
                    self._apply_bullet_hit_tile(r, c, bullet.owner_id, bullet.is_player, bullet.power, crush)
                    # crush_bricks bullets pass through a brick they just destroyed
                    if crush and tid_before != STEEL and self.grid[r][c] != tid_before:
                        continue

                # Explosion effect
                self._add_explosion(bullet.row, bullet.col)
                bullet.alive = False
                self._on_bullet_gone(bullet)
                continue

            # Sandworm collision — bullets can hit any body part (5 hits to kill)
            if not bullet.alive:
                continue
            if self.sandworm.get("active"):
                hit_worm = False
                for part in self.sandworm["parts"]:
                    px, py = part["col"] + 0.5, part["row"] + 0.5
                    if abs(bullet.col - px) < 0.7 and abs(bullet.row - py) < 0.7:
                        bullet.alive = False
                        self._on_bullet_gone(bullet)
                        self._add_explosion(bullet.row, bullet.col)
                        self.sandworm["hp"] = max(0, self.sandworm.get("hp", 5) - 1)
                        if self.sandworm["hp"] <= 0:
                            self.sandworm["active"] = False
                            self.sandworm["despawning"] = False
                            self.sandworm["parts"] = []
                            self.sandworm["timer"] = random.randint(300, 600)
                            self.sandworm["hp"] = 5
                            self.events.append({"type": "sound", "sound": "enemy-explosion"})
                        hit_worm = True
                        break
                if hit_worm:
                    continue

            # Tank collision
            self._check_bullet_tank_hit(bullet)

        # Bullet-bullet collision (after all bullets have moved this tick)
        self._check_bullet_bullet_collisions()

        # Clean up dead bullets
        self.bullets = {bid: b for bid, b in self.bullets.items() if b.alive}

    def _check_bullet_tank_hit(self, bullet: Bullet) -> None:
        targets = []
        is_friendly = getattr(self, "_friendly_mode", False)
        if not bullet.is_player:
            if self.player and self.player.alive:
                targets.append(self.player)
            if self.player and self.player.companion and self.player.companion.alive:
                targets.append(self.player.companion)
            # Enemy bullets can always damage turrets (even in friendly mode)
            targets.extend(t for t in self.turrets.values() if t.alive)
        if bullet.is_player:
            targets.extend(e for e in self.enemies.values() if e.alive)
            targets.extend(e.companion for e in self.enemies.values() if e.companion and e.companion.alive)
            # Player bullets can hit other turrets (not themselves); turrets destroyable in friendly mode too
            targets.extend(t for t in self.turrets.values() if t.alive and t.id != bullet.owner_id)

        # Evil Jaws are targets for everyone (player and enemies)
        targets.extend(j for j in self.evil_jaws.values() if j.alive)

        for tank in targets:
            # Big tank: use tank's half-extent + bullet speed margin to prevent tunneling
            if tank.mushroom_ticks > 0 or tank.is_big:
                hit_size = (TANK_HALF * 2.0) + 0.5  # ~1.5 to reliably catch fast bullets
            else:
                hit_size = 0.55
            if abs(tank.row - bullet.row) < hit_size and abs(tank.col - bullet.col) < hit_size:
                self._add_explosion(tank.row, tank.col)
                bullet.alive = False
                self._on_bullet_gone(bullet)
                
                # In friendly mode, player body is invincible but turrets still take damage
                if tank.is_player and tank.tank_type != "turret" and is_friendly:
                    break
                    
                tank.hp -= 1
                if tank.hp <= 0:
                    tank.alive = False
                    if tank.tank_type == "turret":
                        self.events.append({"type": "sound", "sound": "enemy-explosion"})
                    elif not tank.is_player:
                        if tank.tank_type == "evil_jaw":
                            # Special explosion like TNT
                            self._detonate_tile(int(tank.row), int(tank.col), radius=2)
                        
                        self.events.append({"type": "sound", "sound": "enemy-explosion"})
                        if tank.tank_type in ENEMY_TYPES:
                            self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                            self.enemies_remaining -= 1
                        else:
                            # Special creature (Evil Jaw, etc.)
                            self.score += 500
                    else:
                        self.events.append({"type": "sound", "sound": "player-explosion"})
                        self.player_lives -= 1
                        self._player_respawn_timer = 180  # 3 seconds
                break

    def _check_bullet_bullet_collisions(self) -> None:
        """Destroy both bullets when two bullets meet (regardless of team)."""
        alive_bullets = [b for b in self.bullets.values() if b.alive]
        for i, b1 in enumerate(alive_bullets):
            for b2 in alive_bullets[i + 1:]:
                if not b2.alive:
                    continue
                if abs(b1.row - b2.row) < 0.6 and abs(b1.col - b2.col) < 0.6:
                    mid_row = (b1.row + b2.row) / 2
                    mid_col = (b1.col + b2.col) / 2
                    self._add_explosion(mid_row, mid_col)
                    b1.alive = False
                    b2.alive = False
                    self._on_bullet_gone(b1)
                    self._on_bullet_gone(b2)

    def _on_bullet_gone(self, bullet: Bullet) -> None:
        """Decrement active bullet counter for the owning tank."""
        if bullet.is_grenade or bullet.is_missile:
            self._explode_area(bullet)

        if self.player and self.player.id == bullet.owner_id:
            self.player.active_bullets = max(0, self.player.active_bullets - 1)
            return
        if self.player and self.player.companion and self.player.companion.id == bullet.owner_id:
            self.player.companion.active_bullets = max(0, self.player.companion.active_bullets - 1)
            return
            
        for enemy in self.enemies.values():
            if enemy.id == bullet.owner_id:
                enemy.active_bullets = max(0, enemy.active_bullets - 1)
                return
            if enemy.companion and enemy.companion.id == bullet.owner_id:
                enemy.companion.active_bullets = max(0, enemy.companion.active_bullets - 1)
                return
                
        for turret in self.turrets.values():
            if turret.id == bullet.owner_id:
                turret.active_bullets = max(0, turret.active_bullets - 1)
                return

    def _explode_area(self, bullet: Bullet) -> None:
        """Area-of-effect explosion for grenades and sun missiles."""
        radius = 3.0 if bullet.is_missile else 2.0
        kind = "sun_explosion" if bullet.is_missile else "grenade"
        ticks = 20 if bullet.is_missile else 12
        self.explosions.append({
            "row": bullet.row, "col": bullet.col,
            "ticks": ticks, "kind": kind, "radius": int(radius),
        })
        self.events.append({"type": "sound", "sound": "enemy-explosion"})

        # Damage enemies in radius
        for enemy in list(self.enemies.values()):
            if not enemy.alive:
                continue
            if math.hypot(enemy.row - bullet.row, enemy.col - bullet.col) < radius:
                enemy.hp = 0
                enemy.alive = False
                self._add_explosion(enemy.row, enemy.col)
                self.score += 100 * (list(ENEMY_TYPES).index(enemy.tank_type) + 1)
                self.enemies_remaining -= 1

        # Damage skeletons in radius
        for skel in self.skeleton_ctrl.skeletons:
            if not skel["alive"]:
                continue
            sr = skel["row"] + skel["h"] / 2
            sc = skel["col"] + skel["w"] / 2
            if math.hypot(sr - bullet.row, sc - bullet.col) < radius:
                skel["alive"] = False
                self._add_explosion(sr, sc)
                self.skeleton_ctrl.total_killed += 1

        if self.skeleton_ctrl.mega and self.skeleton_ctrl.mega["alive"]:
            mega = self.skeleton_ctrl.mega
            sr = mega["row"] + mega["h"] / 2
            sc = mega["col"] + mega["w"] / 2
            if math.hypot(sr - bullet.row, sc - bullet.col) < radius:
                mega["hp"] = 0
                mega["alive"] = False
                self._add_explosion(sr, sc)

        # Damage sandworm if in radius
        if self.sandworm.get("active") and self.sandworm.get("parts"):
            head = self.sandworm["parts"][0]
            wr = head["row"] + 0.5
            wc = head["col"] + 0.5
            if math.hypot(wr - bullet.row, wc - bullet.col) < radius:
                self.sandworm["hp"] = 0
                self.sandworm["active"] = False
                self.sandworm["despawning"] = False
                self.sandworm["parts"] = []
                self.sandworm["timer"] = random.randint(300, 600)
                self.sandworm["hp"] = 5
                self._add_explosion(wr, wc)

        # Damage tiles in radius — each cell gets one bullet-hit worth of damage
        center_r, center_c = int(bullet.row), int(bullet.col)
        r_int = int(radius)
        for dr in range(-r_int, r_int + 1):
            for dc in range(-r_int, r_int + 1):
                gr, gc = center_r + dr, center_c + dc
                if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                    if math.hypot(dr, dc) <= radius:
                        self._apply_bullet_hit_tile(gr, gc, bullet.owner_id, bullet.is_player, 2)

    # ------------------------------------------------------------------
    # Explosions
    # ------------------------------------------------------------------

    def _add_explosion(self, row: float, col: float, kind: str = "normal", radius: int = 0) -> None:
        ticks = 50 if kind == "super_tnt" else 15
        self.explosions.append({"row": row, "col": col, "ticks": ticks, "kind": kind, "radius": radius})

    def _tick_explosions(self) -> None:
        for exp in self.explosions:
            exp["ticks"] -= 1
        self.explosions = [e for e in self.explosions if e["ticks"] > 0]

    def _find_nearest_tank(self) -> Optional[tuple[float, float]]:
        """Return (row, col) of the nearest alive tank (player or enemy) to the sandworm head."""
        if not self.sandworm.get("parts"):
            return None
        head = self.sandworm["parts"][0]
        hr, hc = head["row"] + 0.5, head["col"] + 0.5
        best_dist = float("inf")
        best_pos = None
        candidates = list(self.enemies.values())
        if self.player and self.player.alive:
            candidates.append(self.player)
        for t in candidates:
            if not t.alive:
                continue
            d = math.hypot(t.row - hr, t.col - hc)
            if d < best_dist:
                best_dist = d
                best_pos = (t.row, t.col)
        return best_pos

    def _tick_sandworm(self) -> None:
        if not self.sandworm.get("active"):
            self.sandworm["timer"] -= 1
            if self.sandworm["timer"] <= 0:
                mud_tiles = [(r, c) for r in range(GRID_HEIGHT) for c in range(GRID_WIDTH) if self.grid[r][c] == MUD]
                if mud_tiles:
                    start_r, start_c = random.choice(mud_tiles)
                    self.sandworm["active"] = True
                    self.sandworm["parts"] = [{"row": start_r, "col": start_c, "type": "head"}]
                    self.sandworm["direction"] = random.choice(["up", "down", "left", "right"])
                    self.sandworm["timer"] = 15
                    self.sandworm["length"] = random.randint(4, 8)
                    self.sandworm["despawning"] = False
                    self.sandworm["mud_immunity"] = 240
                    self.sandworm["dir_timer"] = random.randint(120, 300)
                    self.sandworm["hp"] = 5
                    self.events.append({"type": "sound", "sound": "powerup-appear"})
                else:
                    self.sandworm["timer"] = random.randint(300, 600)
            return

        self.sandworm["timer"] -= 1
        self.sandworm["mud_immunity"] = max(0, self.sandworm.get("mud_immunity", 0) - 1)
        self.sandworm["dir_timer"] = max(0, self.sandworm.get("dir_timer", 0) - 1)

        if self.sandworm["timer"] <= 0:
            self.sandworm["timer"] = 15  # Move every 15 ticks (~0.25 s)

            parts = self.sandworm["parts"]

            if self.sandworm.get("despawning"):
                if parts:
                    parts.pop()
                if not parts:
                    self.sandworm["active"] = False
                    self.sandworm["timer"] = random.randint(300, 600)
                else:
                    parts[0]["type"] = "head"
                    for i in range(1, len(parts)):
                        parts[i]["type"] = "body"
                return

            head = parts[0]

            # ── Escalator / conveyor carry ────────────────────────────────────
            hr, hc = head["row"], head["col"]
            if 0 <= hr < GRID_HEIGHT and 0 <= hc < GRID_WIDTH:
                ctid = self.grid[hr][hc]
                conveyor_map = {CONVEYOR_UP: "up", CONVEYOR_DOWN: "down", CONVEYOR_LEFT: "left", CONVEYOR_RIGHT: "right"}
                if ctid in conveyor_map:
                    self.sandworm["direction"] = conveyor_map[ctid]

            # ── AI: steer toward nearest tank ~70% of the time ───────────────
            if self.sandworm["dir_timer"] <= 0:
                self.sandworm["dir_timer"] = random.randint(90, 210)
                opposites = {"up": "down", "down": "up", "left": "right", "right": "left"}
                target = self._find_nearest_tank()
                if target and random.random() < 0.75:
                    dr_t = target[0] - (head["row"] + 0.5)
                    dc_t = target[1] - (head["col"] + 0.5)
                    if abs(dr_t) > abs(dc_t):
                        desired = "down" if dr_t > 0 else "up"
                    else:
                        desired = "right" if dc_t > 0 else "left"
                    if desired != opposites.get(self.sandworm["direction"]):
                        self.sandworm["direction"] = desired
                    else:
                        dirs = ["up", "down", "left", "right"]
                        dirs.remove(opposites[self.sandworm["direction"]])
                        self.sandworm["direction"] = random.choice(dirs)
                else:
                    dirs = ["up", "down", "left", "right"]
                    dirs.remove(opposites[self.sandworm["direction"]])
                    self.sandworm["direction"] = random.choice(dirs)

            dr, dc = 0, 0
            if self.sandworm["direction"] == "up": dr = -1
            elif self.sandworm["direction"] == "down": dr = 1
            elif self.sandworm["direction"] == "left": dc = -1
            elif self.sandworm["direction"] == "right": dc = 1

            next_r = head["row"] + dr
            next_c = head["col"] + dc

            hit_solid = False
            hit_mud = False
            if next_r < 0 or next_r >= GRID_HEIGHT or next_c < 0 or next_c >= GRID_WIDTH:
                hit_solid = True
            else:
                tid = self.grid[next_r][next_c]
                tile = get_tile(tid)
                if tid == MUD:
                    hit_mud = True
                elif (tile.tank_solid and not tile.walkable) or tile.is_base:
                    hit_solid = True

            if any(p["row"] == next_r and p["col"] == next_c for p in parts):
                hit_solid = True

            if hit_solid:
                # Try to find any valid direction; prefer turning toward target
                dirs = ["up", "right", "down", "left"]
                idx = dirs.index(self.sandworm["direction"])
                self.sandworm["direction"] = dirs[(idx + 1) % 4]
                self.sandworm["dir_timer"] = 0  # re-evaluate AI next movement tick
                return

            if hit_mud and self.sandworm["mud_immunity"] <= 0:
                self.sandworm["despawning"] = True
                new_head = {"row": next_r, "col": next_c, "type": "head"}
                parts.insert(0, new_head)
                if parts:
                    parts.pop()
                for i in range(1, len(parts)):
                    parts[i]["type"] = "body"
                return

            # Move forward
            new_head = {"row": next_r, "col": next_c, "type": "head"}
            parts.insert(0, new_head)

            if len(parts) > self.sandworm.get("length", 4):
                parts.pop()

            for i in range(1, len(parts)):
                parts[i]["type"] = "body"

            # Lava damages sandworm (1 hp per step onto lava)
            if 0 <= next_r < GRID_HEIGHT and 0 <= next_c < GRID_WIDTH and self.grid[next_r][next_c] == LAVA:
                self.sandworm["hp"] = max(0, self.sandworm.get("hp", 5) - 1)
                self._add_explosion(next_r + 0.5, next_c + 0.5)
                self.events.append({"type": "sound", "sound": "fire"})
                if self.sandworm["hp"] <= 0:
                    self.sandworm["active"] = False
                    self.sandworm["despawning"] = False
                    self.sandworm["parts"] = []
                    self.sandworm["timer"] = random.randint(300, 600)
                    self.sandworm["hp"] = 5
                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                    return

            # Check collisions with tanks at the new head position
            for tank in list(self.enemies.values()) + ([self.player] if self.player and self.player.alive else []):
                if not tank.alive:
                    continue
                hit_size = 1.5 if (tank.mushroom_ticks > 0 or tank.is_big) else 1.0
                if abs(tank.row - (next_r + 0.5)) < hit_size and abs(tank.col - (next_c + 0.5)) < hit_size:
                    tank.hp = 0
                    tank.alive = False
                    self._add_explosion(tank.row, tank.col)
                    if not tank.is_player:
                        self.events.append({"type": "sound", "sound": "enemy-explosion"})
                        self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                        self.enemies_remaining -= 1
                    else:
                        self.events.append({"type": "sound", "sound": "player-explosion"})
                        self.player_lives -= 1
                        self._player_respawn_timer = 180

    def _detonate_tile(self, r: int, c: int, radius: int = 2) -> None:
        if not (0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH):
            return
            
        self.grid[r][c] = EMPTY
        if radius > 2:
            self._add_explosion(r + 0.5, c + 0.5, kind="super_tnt", radius=radius)
            # Three overlapping clones → louder, distinct boom for super TNT
            for _ in range(3):
                self.events.append({"type": "sound", "sound": "enemy-explosion"})
        else:
            self._add_explosion(r + 0.5, c + 0.5)
            self.events.append({"type": "sound", "sound": "enemy-explosion"})
        
        for nr in range(r - radius, r + radius + 1):
            for nc in range(c - radius, c + radius + 1):
                if 0 <= nr < GRID_HEIGHT and 0 <= nc < GRID_WIDTH:
                    # Tile destruction
                    ntile = get_tile(self.grid[nr][nc])
                    if ntile.is_explosive:
                        # Add to pending instead of instant recursion
                        self.grid[nr][nc] = EMPTY # Prevent re-queueing
                        self._pending_tnt.append((nr, nc, 10, ntile.explosion_radius)) # 10 tick delay (~160ms)
                    elif ntile.destructible and self.grid[nr][nc] not in BIG_BOX_OR_PAD_IDS:
                        if ntile.is_base:
                            if self.golden_eagle_ticks > 0:
                                pass
                            else:
                                self.grid[nr][nc] = EMPTY
                                self._trigger_defeat()
                        else:
                            self.grid[nr][nc] = EMPTY
                    
                    if (nr, nc) != (r, c) and self.grid[nr][nc] == EMPTY and radius <= 2:
                        self._add_explosion(nr + 0.5, nc + 0.5)
                    
                    # Tank damage (enemies + player)
                    for tank in list(self.enemies.values()) + ([self.player] if self.player and self.player.alive else []):
                        if not tank.alive:
                            continue
                        hit_size = 1.5 if (tank.mushroom_ticks > 0 or tank.is_big) else 1.0
                        if abs(tank.row - (nr + 0.5)) < hit_size and abs(tank.col - (nc + 0.5)) < hit_size:
                            if tank.is_player and getattr(self, "_friendly_mode", False):
                                continue
                            tank.hp -= 1
                            if tank.hp <= 0:
                                tank.alive = False
                                if not tank.is_player:
                                    self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                                    self.enemies_remaining -= 1
                                else:
                                    self.player_lives -= 1
                                    self._player_respawn_timer = 180

                    # Turret damage from TNT blast
                    for t_id, turret in list(self.turrets.items()):
                        if not turret.alive:
                            continue
                        if abs(turret.row - (nr + 0.5)) < 1.5 and abs(turret.col - (nc + 0.5)) < 1.5:
                            turret.hp -= 1
                            self._add_explosion(turret.row, turret.col)
                            if turret.hp <= 0:
                                turret.alive = False
                                self.events.append({"type": "sound", "sound": "enemy-explosion"})

                    # Sandworm damage from TNT blast
                    if self.sandworm.get("active"):
                        for part in self.sandworm["parts"]:
                            if abs((part["row"] + 0.5) - (nr + 0.5)) < 1.5 and abs((part["col"] + 0.5) - (nc + 0.5)) < 1.5:
                                self.sandworm["hp"] = max(0, self.sandworm.get("hp", 5) - 1)
                                if self.sandworm["hp"] <= 0:
                                    self.sandworm["active"] = False
                                    self.sandworm["despawning"] = False
                                    self.sandworm["parts"] = []
                                    self.sandworm["timer"] = random.randint(300, 600)
                                    self.sandworm["hp"] = 5
                                    self.events.append({"type": "sound", "sound": "enemy-explosion"})
                                break

                    # Skeleton damage from TNT blast
                    self.skeleton_ctrl.apply_tnt_damage(nr + 0.5, nc + 0.5)

    def _find_box_group(self, r: int, c: int, low: int, high: int) -> list:
        """Return all tile positions belonging to the 2×2 box that contains (r, c),
        where every tile's ID is within [low, high].  Falls back to [(r, c)] alone.

        Boxes are always placed at even (row, col) in the editor, so we only
        consider candidate top-left corners that are both even.  This prevents
        adjacent same-type boxes from being mistakenly merged into a single group.
        """
        for dr in range(2):
            for dc in range(2):
                ar, ac = r - dr, c - dc
                # Boxes are placed at even-row, even-col grid positions
                if ar % 2 != 0 or ac % 2 != 0:
                    continue
                group = [
                    (ar + nr, ac + nc)
                    for nr in range(2) for nc in range(2)
                    if 0 <= ar + nr < GRID_HEIGHT and 0 <= ac + nc < GRID_WIDTH
                    and low <= self.grid[ar + nr][ac + nc] <= high
                ]
                if len(group) == 4:
                    return group
        return [(r, c)]

    def _find_custom_tile_block(self, r: int, c: int, tid: int) -> list:
        """Return all grid cells for a custom tile's footprint (1×1, 2×2, or 4×4)."""
        custom_tile = get_tile(tid)
        if custom_tile.extra_big:
            span = 4
        elif custom_tile.non_repeating:
            span = 2
        else:
            return [(r, c)]
        for dr in range(span):
            for dc in range(span):
                ar, ac = r - dr, c - dc
                if ar % span != 0 or ac % span != 0:
                    continue
                group = [
                    (ar + nr, ac + nc)
                    for nr in range(span) for nc in range(span)
                    if 0 <= ar + nr < GRID_HEIGHT and 0 <= ac + nc < GRID_WIDTH
                    and self.grid[ar + nr][ac + nc] == tid
                ]
                if len(group) == span * span:
                    return group
        return [(r, c)]


    def _tick_tnt(self) -> None:
        new_pending = []
        for r, c, ticks, radius in self._pending_tnt:
            if ticks <= 0:
                self._detonate_tile(r, c, radius)
            else:
                new_pending.append((r, c, ticks - 1, radius))
        self._pending_tnt = new_pending

    # ------------------------------------------------------------------
    # Player respawn
    # ------------------------------------------------------------------

    def _handle_player_respawn(self) -> None:
        if self._player_respawn_timer > 0:
            self._player_respawn_timer -= 1
            if self._player_respawn_timer == 0 and self.player_lives > 0:
                base = self._base_pos or (GRID_HEIGHT - 1, GRID_WIDTH // 2)
                self.player.row = float(base[0]) + 0.5
                self.player.col = float(base[1] - 4) + 0.5
                self.player.hp = 1
                self.player.alive = True
                self.player.mushroom_ticks = 0
                self.player.rainbow_ticks = 0
                self._clear_area_for_tank(self.player)

    def _clear_area_for_tank(self, tank: Tank, force: bool = False) -> None:
        """Destroys any destructible blocks directly under the tank to allow spawning/movement."""
        size = TANK_HALF * 2.0 if (tank.mushroom_ticks > 0 or tank.is_big) else TANK_HALF
        r1, r2 = tank.row - size, tank.row + size
        c1, c2 = tank.col - size, tank.col + size
        for nr in range(int(r1), int(r2) + 1):
            for nc in range(int(c1), int(c2) + 1):
                if 0 <= nr < GRID_HEIGHT and 0 <= nc < GRID_WIDTH:
                    ntile = get_tile(self.grid[nr][nc])
                    if ntile.walkable:
                        continue
                    can_destroy = ntile.tank_solid and (ntile.destructible or force)
                    if (tank.mushroom_ticks > 0 or tank.is_big) and ntile.tank_solid and not ntile.walkable:
                        # Same rules as movement: big tanks cannot chew jaw_proof tiles, boxes, or (player) base
                        can_destroy = can_big_tank_crush(ntile, BASE, tank, BIG_BOX_IDS)
                        
                    if can_destroy:
                        if ntile.is_base:
                            # Big player tanks cannot accidentally crush their own base
                            if tank.is_player and (tank.mushroom_ticks > 0 or tank.is_big):
                                pass
                            elif self.golden_eagle_ticks > 0:
                                pass
                            else:
                                self.grid[nr][nc] = EMPTY
                                self._trigger_defeat()
                        else:
                            self.grid[nr][nc] = EMPTY
                            self._add_explosion(nr + 0.5, nc + 0.5)

    # ------------------------------------------------------------------
    # End conditions
    # ------------------------------------------------------------------

    def _check_end_conditions(self) -> None:
        if self.result:
            return
        if self.enemies_remaining <= 0 and not any(e.alive for e in self.enemies.values()):
            self.result = "victory"
            self.running = False
            self.mode.on_end(self, "victory")
        elif self.player_lives <= 0 and (self.player is None or not self.player.alive):
            self._trigger_defeat()

    def _trigger_defeat(self) -> None:
        """Begin the defeat explosion sequence instead of immediately stopping."""
        if self.result == "defeat":
            return
            
        self.result = "defeat"
        self._defeat_ticks = 0
        self.mode.on_end(self, "defeat")
        
        # Kill all tanks to stop game logic
        if self.player:
            self.player.alive = False
        for enemy in self.enemies.values():
            enemy.alive = False
            
        # Collect all bricks
        self._defeat_bricks = []
        for r in range(GRID_HEIGHT):
            for c in range(GRID_WIDTH):
                if self.grid[r][c] == BRICK:
                    self._defeat_bricks.append((r, c))
                    
        # Shuffle bricks for random explosions
        random.shuffle(self._defeat_bricks)
        
        # Trigger initial base explosion if we have the base pos
        if self._base_pos:
            r, c = self._base_pos
            self._add_explosion(r + 0.5, c + 0.5)
            self._add_explosion(r, c)
            self._add_explosion(r + 1, c + 1)
            self._add_explosion(r + 1, c)
            self._add_explosion(r, c + 1)

    def _tick_defeat_sequence(self) -> None:
        """Process explosions until all bricks are gone."""
        self._defeat_ticks += 1
        
        # Tick existing explosions
        self._tick_explosions()
        
        # Every few ticks, explode some bricks
        if self._defeat_ticks % 3 == 0:
            # Pop up to 5 bricks at a time
            for _ in range(5):
                if not self._defeat_bricks:
                    break
                r, c = self._defeat_bricks.pop()
                self.grid[r][c] = EMPTY
                self._add_explosion(r + 0.5, c + 0.5)
                
        # Once all bricks are exploded and explosions finish animating, stop the game
        if not self._defeat_bricks and not self.explosions:
            self.running = False

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def _build_state(self, force_full_grid: bool = False) -> dict:
        full_grid: Optional[List[List[int]]] = None
        grid_changes: list[dict] = []
        if force_full_grid or self._last_grid_snapshot is None:
            full_grid = [row[:] for row in self.grid]
        else:
            for r in range(GRID_HEIGHT):
                row = self.grid[r]
                prev_row = self._last_grid_snapshot[r]
                for c in range(GRID_WIDTH):
                    if row[c] != prev_row[c]:
                        grid_changes.append({"r": r, "c": c, "tid": row[c]})

        self._last_grid_snapshot = [row[:] for row in self.grid]

        enemies_state = [e.to_dict() for e in self.enemies.values()]
        for e in self.enemies.values():
            if e.companion and e.companion.alive:
                enemies_state.append(e.companion.to_dict())
                
        return {
            "tick": self.tick_count,
            "running": self.running,
            "paused": self.paused,
            "result": self.result,
            "score": self.score,
            "lives": self.player_lives,
            "enemies_remaining": self.enemies_remaining,
            "total_enemies": self.total_enemies,
            "player": self.player.to_dict() if self.player else None,
            "companion": self.player.companion.to_dict() if (self.player and self.player.companion and self.player.companion.alive) else None,
            "companion_ticks": self.player.companion_ticks if self.player else 0,
            "enemies": enemies_state,
            "evil_jaws": [j.to_dict() for j in self.evil_jaws.values()],
            "turrets": [t.to_dict() for t in self.turrets.values()],
            "bullets": [b.to_dict() for b in self.bullets.values()],
            "explosions": self.explosions,
            "rainbow_trails": self.rainbow_trails,
            "golden_eagle_ticks": self.golden_eagle_ticks,
            "items": self.items,
            "events": list(self.events),
            "sandworm": {**self.sandworm, "hp": self.sandworm.get("hp", 5)},
            "skeletons": self.skeleton_ctrl.skeletons,
            "mobile_entities": self.mobile_tile_ctrl.get_entity_bounds(),
            "mega_skeleton": self.skeleton_ctrl.mega,
            "skeleton_kills": self.skeleton_ctrl.total_killed,
            "bone_arch_active": self.skeleton_ctrl.bone_arch_built,
            "grid": full_grid,  # only sent on initial frame
            "grid_changes": grid_changes,
            "base_pos": {"row": self._base_pos[0], "col": self._base_pos[1]} if self._base_pos else None,
            # Letter powerup effects
            "rainbow_world_ticks": self.rainbow_world_ticks,
            "base_shield_ticks": self.base_shield_ticks,
            "clone_tank": self.clone_tank.to_dict() if (self.clone_tank and self.clone_tank.alive) else None,
            "bananas": self.bananas,
            "fireworks": self.fireworks,
            "airplanes": self.airplanes,
            "bombs": self.bombs,
            "magnets": self.magnets,
            "sahur_runners": self.sahur_runners,
        }

    async def _emit(self, state: dict) -> None:
        if not self._state_callbacks:
            return
        await asyncio.gather(*[cb(state) for cb in self._state_callbacks], return_exceptions=True)
