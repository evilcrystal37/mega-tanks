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

from .bullet import Bullet
from .map_model import Map, GRID_WIDTH, GRID_HEIGHT
from .tank import Tank, make_player_tank, make_enemy_tank, ENEMY_TYPES
from .tile_registry import get_tile

# Tick interval — ~60 FPS
TICK_INTERVAL = 1 / 60

# Tank collision half-extent (≈1×1 box) — tile-sized, fits exactly in 1-tile gaps
TANK_HALF = 0.499

# Enemy spawn columns (top row spawn points)
SPAWN_COLS = [0.5, GRID_WIDTH // 2 + 0.5, GRID_WIDTH - 0.5]

# Enemy type progression (repeating pattern, like the original)
ENEMY_SEQUENCE = ["basic", "basic", "fast", "basic", "armor", "power", "fast", "armor"]


class GameEngine:
    def __init__(self, map_obj: Map, mode_name: str = "construction_play", settings: Optional[dict] = None) -> None:
        from .mode_registry import get_mode
        
        self.map = map_obj
        self.mode = get_mode(mode_name)
        self.grid: List[List[int]] = [row[:] for row in map_obj.grid]  # mutable copy
        self._settings: dict = settings or {}

        # State — set by mode.on_start()
        self.total_enemies: int = 20
        self.enemies_remaining: int = 20
        self.player_lives: int = 3

        self.player: Optional[Tank] = None
        self.enemies: Dict[str, Tank] = {}
        self.turrets: Dict[str, Tank] = {}
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
                if self.grid[r][c] == 25:
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

    def _tick(self) -> None:
        if not self.running:
            return
        if self.paused:
            return
        self.tick_count += 1
        
        # Handle defeat sequence
        if self.result == "defeat":
            self._tick_defeat_sequence()
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
        for enemy in list(self.enemies.values()):
            if enemy.alive:
                enemy.tick_cooldown()
                self._ai_tick(enemy)

        # Companion cooldowns + AI + lifetime countdown
        all_tanks = list(self.enemies.values()) + ([self.player] if self.player and self.player.alive else [])
        for tank in all_tanks:
            if tank.companion and tank.companion.alive:
                tank.companion.tick_cooldown()
                self._ai_tick_companion(tank.companion, tank)
                if tank.companion_ticks > 0:
                    tank.companion_ticks -= 1
                if tank.companion_ticks <= 0:
                    tank.companion = None

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
                if tid == 7:
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
                if tid == 5 and tank.speed > 0 and self.tick_count % 30 == 0 and tank.is_player:
                    self.events.append({"type": "sound", "sound": "ice"})
                    
                # Ramp check
                if tid == 13 and tank.airborne_ticks <= 0:
                    tank.airborne_ticks = 45
                    self.events.append({"type": "sound", "sound": "unknown-3"}) # Jump sound
                    
                # Conveyor check
                if tid in (8, 9, 10, 11):
                    conv_speed = 0.02
                    cdr, cdc = 0.0, 0.0
                    if tid == 8: cdr = -conv_speed
                    elif tid == 9: cdr = conv_speed
                    elif tid == 10: cdc = -conv_speed
                    elif tid == 11: cdc = conv_speed
                    
                    new_row = tank.row + cdr
                    new_col = tank.col + cdc
                    if self._can_move_to(new_row, new_col, tank):
                        tank.row = max(TANK_HALF, min(float(GRID_HEIGHT) - TANK_HALF, new_row))
                        tank.col = max(TANK_HALF, min(float(GRID_WIDTH) - TANK_HALF, new_col))

                # Buffs
                if tid == 23:
                    # Rainbow: 30s base (first pickup) + 10s per additional pickup
                    bonus = 600 if tank.rainbow_ticks > 0 else 1800
                    tank.rainbow_ticks = max(tank.rainbow_ticks, 0) + bonus
                    for gr, gc in self._find_box_group(r, c, 23, 23):
                        self.grid[gr][gc] = 0
                    self.events.append({"type": "sound", "sound": "powerup-pickup"})
                elif tid == 32:
                    # Chick collected by driving over it
                    for gr, gc in self._find_box_group(r, c, 32, 32):
                        self.grid[gr][gc] = 0
                    self.events.append({"type": "sound", "sound": "powerup-pickup"})
                    if tank.tank_type != "companion":
                        # Spawn/refresh companion near tank — add 30s
                        if tank.companion is None or not tank.companion.alive:
                            # Spawn offset from master so it doesn't overlap visually
                            dir_offsets = {
                                "up":    ( 2.0,  0.0),
                                "down":  (-2.0,  0.0),
                                "left":  ( 0.0,  2.0),
                                "right": ( 0.0, -2.0),
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
                        tank.companion_ticks += 1800  # +30s per pickup
                elif tid == 24:
                    # Mushroom collected
                    tank.mushroom_ticks = max(tank.mushroom_ticks, 0) + 600
                    for gr, gc in self._find_box_group(r, c, 24, 24):
                        self.grid[gr][gc] = 0
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

            # Apply ticking buffs
            if tank.rainbow_ticks > 0:
                tank.rainbow_ticks -= 1
                # Store continuous trail points
                if 0 <= tank.row < GRID_HEIGHT and 0 <= tank.col < GRID_WIDTH:
                    tank_key = tank.id
                    if tank_key not in self.rainbow_trails:
                        self.rainbow_trails[tank_key] = {"points": [], "ticks": 120}
                    self.rainbow_trails[tank_key]["points"].append({
                        "row": round(tank.row, 3),
                        "col": round(tank.col, 3),
                        "tick": self.tick_count
                    })
                    # Limit trail: up to 3600 points (~60 seconds at 60Hz, covers max stacked duration)
                    max_points = 3600
                    if len(self.rainbow_trails[tank_key]["points"]) > max_points:
                        self.rainbow_trails[tank_key]["points"] = self.rainbow_trails[tank_key]["points"][-max_points:]
                    # Keep trail visible for full remaining rainbow duration + 2s fade-out
                    self.rainbow_trails[tank_key]["ticks"] = tank.rainbow_ticks + 120

            if tank.mushroom_ticks > 0:
                tank.mushroom_ticks -= 1

        # Move bullets
        self._tick_bullets()

        # Update explosions
        self._tick_explosions()
        
        # Update TNT chain reactions
        self._tick_tnt()

        # Update sandworm
        self._tick_sandworm()

        # Spawn enemies
        self._tick_spawner()

        # Tick turrets
        self._tick_turrets()

        # Tick rainbow trails
        self._tick_rainbow_trails()

        # Check win/loss
        self._check_end_conditions()

    def _check_item_collection(self, tank: Tank) -> None:
        remaining_items = []
        for item in self.items:
            if abs(tank.row - item["row"]) < 0.8 and abs(tank.col - item["col"]) < 0.8:
                self.events.append({"type": "sound", "sound": "powerup-pickup"})
            else:
                remaining_items.append(item)
        self.items = remaining_items

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
                    if tile.tank_solid:
                        base_protected = mover.is_player and self.grid[r][c] == 6
                        if (mover.mushroom_ticks > 0 or mover.is_big) and not (26 <= self.grid[r][c] <= 31) and not (33 <= self.grid[r][c] <= 35) and not base_protected:
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

        # 2. Tile collision
        for r in range(int(r1), int(r2) + 1):
            for c in range(int(c1), int(c2) + 1):
                if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                    tile = get_tile(self.grid[r][c])
                    if tile.tank_solid:
                        base_protected = mover.is_player and self.grid[r][c] == 6
                        if (mover.mushroom_ticks > 0 or mover.is_big) and not (26 <= self.grid[r][c] <= 31) and not (33 <= self.grid[r][c] <= 35) and not base_protected:
                            pass # Big tank can move through and destroy solid tiles (but not glass/chick boxes or player's base)
                        else:
                            return False

        # 3. Tank-tank collision (same box as tile check)
        all_tanks = list(self.enemies.values()) + ([self.player] if self.player else []) + list(self.turrets.values())
        all_tanks += [t.companion for t in all_tanks if getattr(t, 'companion', None) and t.companion.alive]
        
        for other in all_tanks:
            if other is mover or not other.alive:
                continue
            other_size = TANK_HALF * 2.0 if (other.mushroom_ticks > 0 or other.is_big) else TANK_HALF
            if abs(other.row - row) < (size + other_size) and abs(other.col - col) < (size + other_size):
                return False
        return True

    # ------------------------------------------------------------------
    # Bullets
    # ------------------------------------------------------------------

    def _try_fire(self, tank: Tank) -> None:
        bullet = tank.fire()
        if bullet:
            self.bullets[bullet.id] = bullet
            self.events.append({"type": "sound", "sound": "fire"})

    def _tick_bullets(self) -> None:
        for bullet in list(self.bullets.values()):
            if not bullet.alive:
                continue

            bullet.tick()
            
            # Apply conveyor to bullet
            r_int, c_int = int(bullet.row), int(bullet.col)
            if 0 <= r_int < GRID_HEIGHT and 0 <= c_int < GRID_WIDTH:
                tid = self.grid[r_int][c_int]
                if tid in (8, 9, 10, 11):
                    conv_speed = 0.02
                    if tid == 8: bullet.row -= conv_speed
                    elif tid == 9: bullet.row += conv_speed
                    elif tid == 10: bullet.col -= conv_speed
                    elif tid == 11: bullet.col += conv_speed

            if not bullet.alive:
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
                if self.grid[r][c] == 18:
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
                elif tile.is_explosive:
                    self._detonate_tile(r, c, tile.explosion_radius)
                elif tile.destructible:
                    if tile.is_base:
                        # Big player tanks cannot accidentally destroy their own base
                        player_is_big = (bullet.is_player and self.player and
                                         (self.player.mushroom_ticks > 0 or self.player.is_big))
                        if not player_is_big:
                            self.grid[r][c] = 0
                            self._trigger_defeat()
                    elif bullet.power >= 2 or self.grid[r][c] == 1 or 15 <= self.grid[r][c] <= 17 or 24 <= self.grid[r][c] <= 28 or 29 <= self.grid[r][c] <= 31 or 32 <= self.grid[r][c] <= 35:
                        # Destroy brick or steel (if power bullet) or glass or mushroom or rainbow or chick
                        tid = self.grid[r][c]
                        
                        if 15 <= tid <= 16:
                            self.grid[r][c] += 1
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                        elif 26 <= tid <= 28:
                            # Crack the whole 2×2 mushroom box together
                            for gr, gc in self._find_box_group(r, c, 26, 28):
                                self.grid[gr][gc] -= 1
                                if self.grid[gr][gc] == 25:
                                    self.grid[gr][gc] = 24
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                        elif 33 <= tid <= 35:
                            # Crack the whole 2×2 chick box together: 35→34→33→32
                            for gr, gc in self._find_box_group(r, c, 33, 35):
                                self.grid[gr][gc] -= 1
                                if self.grid[gr][gc] == 32:
                                    self.grid[gr][gc] = 32
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                        elif tid == 32:
                            # Chick collected
                            for gr, gc in self._find_box_group(r, c, 32, 32):
                                self.grid[gr][gc] = 0
                            self.events.append({"type": "sound", "sound": "powerup-pickup"})
                            owner_id = bullet.owner_id
                            owner_tank = None
                            if self.player and self.player.id == owner_id:
                                owner_tank = self.player
                            else:
                                for enemy in self.enemies.values():
                                    if enemy.id == owner_id:
                                        owner_tank = enemy
                                        break
                            if owner_tank and owner_tank.tank_type != "companion":
                                # Spawn/refresh companion — add 30s
                                if owner_tank.companion is None or not owner_tank.companion.alive:
                                    dir_offsets = {
                                        "up":    ( 2.0,  0.0),
                                        "down":  (-2.0,  0.0),
                                        "left":  ( 0.0,  2.0),
                                        "right": ( 0.0, -2.0),
                                    }
                                    cdr, cdc = dir_offsets.get(owner_tank.direction, (2.0, 0.0))
                                    comp_row = max(1.0, min(float(GRID_HEIGHT) - 1.0, owner_tank.row + cdr))
                                    comp_col = max(1.0, min(float(GRID_WIDTH) - 1.0, owner_tank.col + cdc))
                                    owner_tank.companion = Tank(
                                        row=comp_row,
                                        col=comp_col,
                                        direction=owner_tank.direction,
                                        speed=owner_tank.speed * 1.5,
                                        hp=999,
                                        is_player=owner_tank.is_player,
                                        fire_rate=40,
                                        bullet_limit=1,
                                        tank_type="companion",
                                        color="#ffee58",
                                    )
                                    owner_tank.companion_orbit_angle = 0.0
                                owner_tank.companion_ticks += 1800  # +30s per pickup
                        elif tid == 24:
                            # Mushroom collected — clear entire 2×2 group, stacks +10s
                            for gr, gc in self._find_box_group(r, c, 24, 24):
                                self.grid[gr][gc] = 0
                            self.events.append({"type": "sound", "sound": "powerup-pickup"})
                            owner_id = bullet.owner_id
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
                        elif 29 <= tid <= 31:
                            # Crack the whole 2×2 rainbow box together: 31→30→29→23
                            for gr, gc in self._find_box_group(r, c, 29, 31):
                                self.grid[gr][gc] -= 1
                                if self.grid[gr][gc] == 28:
                                    self.grid[gr][gc] = 23
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                        elif tid == 23:
                            # Rainbow collected — clear entire 2×2 group, stacks +10s per pickup
                            for gr, gc in self._find_box_group(r, c, 23, 23):
                                self.grid[gr][gc] = 0
                            self.events.append({"type": "sound", "sound": "powerup-pickup"})
                            owner_id = bullet.owner_id
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
                        else:
                            self.grid[r][c] = 0
                            self.events.append({"type": "sound", "sound": "hit-brick"})
                            
                            if bullet.crush_bricks and tid != 2:
                                continue
                else:
                    self.events.append({"type": "sound", "sound": "hit-steel"})
                
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
                        self.events.append({"type": "sound", "sound": "enemy-explosion"})
                        self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                        self.enemies_remaining -= 1
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
        # Find the tank that owns the bullet
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
                mud_tiles = [(r, c) for r in range(GRID_HEIGHT) for c in range(GRID_WIDTH) if self.grid[r][c] == 12]
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
                conveyor_map = {8: "up", 9: "down", 10: "left", 11: "right"}
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
                if tid == 12:
                    hit_mud = True
                elif tile.tank_solid or tile.is_base:
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
            if 0 <= next_r < GRID_HEIGHT and 0 <= next_c < GRID_WIDTH and self.grid[next_r][next_c] == 7:
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
            
        self.grid[r][c] = 0
        if radius > 2:
            self._add_explosion(r + 0.5, c + 0.5, kind="super_tnt", radius=radius)
        else:
            self._add_explosion(r + 0.5, c + 0.5)
        
        for nr in range(r - radius, r + radius + 1):
            for nc in range(c - radius, c + radius + 1):
                if 0 <= nr < GRID_HEIGHT and 0 <= nc < GRID_WIDTH:
                    # Tile destruction
                    ntile = get_tile(self.grid[nr][nc])
                    if ntile.is_explosive:
                        # Add to pending instead of instant recursion
                        self.grid[nr][nc] = 0 # Prevent re-queueing
                        self._pending_tnt.append((nr, nc, 10, ntile.explosion_radius)) # 10 tick delay (~160ms)
                    elif ntile.destructible:
                        if ntile.is_base:
                            self.grid[nr][nc] = 0
                            self._trigger_defeat()
                        else:
                            self.grid[nr][nc] = 0
                    
                    if (nr, nc) != (r, c) and self.grid[nr][nc] == 0 and radius <= 2:
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
                    can_destroy = ntile.tank_solid and (ntile.destructible or force)
                    if (tank.mushroom_ticks > 0 or tank.is_big) and ntile.tank_solid:
                        # Glass boxes can only be broken by shooting, not by running over
                        if 26 <= self.grid[nr][nc] <= 31 or 33 <= self.grid[nr][nc] <= 35:
                            can_destroy = False
                        else:
                            can_destroy = True
                        
                    if can_destroy:
                        if ntile.is_base:
                            # Big player tanks cannot accidentally crush their own base
                            if tank.is_player and (tank.mushroom_ticks > 0 or tank.is_big):
                                pass
                            else:
                                self.grid[nr][nc] = 0
                                self._trigger_defeat()
                        else:
                            self.grid[nr][nc] = 0
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
        elif self.player_lives <= 0 and (self.player is None or not self.player.alive):
            self._trigger_defeat()

    def _trigger_defeat(self) -> None:
        """Begin the defeat explosion sequence instead of immediately stopping."""
        if self.result == "defeat":
            return
            
        self.result = "defeat"
        self._defeat_ticks = 0
        
        # Kill all tanks to stop game logic
        if self.player:
            self.player.alive = False
        for enemy in self.enemies.values():
            enemy.alive = False
            
        # Collect all bricks
        self._defeat_bricks = []
        for r in range(GRID_HEIGHT):
            for c in range(GRID_WIDTH):
                if self.grid[r][c] == 1:
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
                self.grid[r][c] = 0
                self._add_explosion(r + 0.5, c + 0.5)
                
        # Once all bricks are exploded and explosions finish animating, stop the game
        if not self._defeat_bricks and not self.explosions:
            self.running = False

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def _build_state(self) -> dict:
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
            "turrets": [t.to_dict() for t in self.turrets.values()],
            "bullets": [b.to_dict() for b in self.bullets.values()],
            "explosions": self.explosions,
            "rainbow_trails": self.rainbow_trails,
            "items": self.items,
            "events": list(self.events),
            "sandworm": {**self.sandworm, "hp": self.sandworm.get("hp", 5)},
            "grid": self.grid,  # full grid on every tick
            "base_pos": {"row": self._base_pos[0], "col": self._base_pos[1]} if self._base_pos else None
        }

    async def _emit(self, state: dict) -> None:
        if not self._state_callbacks:
            return
        await asyncio.gather(*[cb(state) for cb in self._state_callbacks], return_exceptions=True)
