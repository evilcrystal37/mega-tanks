"""
game_engine.py — Core game loop, physics, collision detection.

The engine runs as an asyncio background task, emitting state snapshots
to all connected WebSocket clients every tick (~60Hz target via 16ms sleep).
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Callable, Dict, List, Optional, Awaitable

from .bullet import Bullet
from .map_model import Map, GRID_WIDTH, GRID_HEIGHT
from .tank import Tank, make_player_tank, make_enemy_tank, ENEMY_TYPES
from .tile_registry import get_tile

# Tick interval — ~60 FPS
TICK_INTERVAL = 1 / 60

# Enemy spawn columns (top row spawn points)
SPAWN_COLS = [0, 31, 63]

# Enemy type progression (repeating pattern, like the original)
ENEMY_SEQUENCE = ["basic", "basic", "fast", "basic", "armor", "power", "fast", "armor"]


class GameEngine:
    def __init__(self, map_obj: Map, mode_name: str = "construction_play") -> None:
        from .mode_registry import get_mode
        self.map = map_obj
        self.mode = get_mode(mode_name)
        self.grid: List[List[int]] = [row[:] for row in map_obj.grid]  # mutable copy

        # State — set by mode.on_start()
        self.total_enemies: int = 20
        self.enemies_remaining: int = 20
        self.player_lives: int = 3

        self.player: Optional[Tank] = None
        self.enemies: Dict[str, Tank] = {}
        self.bullets: Dict[str, Bullet] = {}
        self.explosions: List[dict] = []  # {"row": r, "col": c, "ticks": t}

        self.score: int = 0
        self.tick_count: int = 0
        self.running: bool = False
        self.result: Optional[str] = None  # "victory" | "defeat"

        # Callbacks
        self._state_callbacks: List[Callable[[dict], Awaitable[None]]] = []

        # Spawn queue
        self._enemies_spawned: int = 0
        self._spawn_cooldown: int = 0
        self._max_active_enemies: int = 4

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

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _setup(self) -> None:
        base = self.map.find_base()
        if base:
            self._base_pos = base
            # Battle City style: base at bottom center, player to its left
            self.player = make_player_tank(float(base[0]), float(base[1] - 4))
        else:
            # Fallback for rectangular
            self.player = make_player_tank(float(GRID_HEIGHT - 1), float(GRID_WIDTH // 2 - 4))

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        while self.running:
            t0 = time.monotonic()
            self._tick()
            state = self._build_state()
            await self._emit(state)
            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, TICK_INTERVAL - elapsed))

    def _tick(self) -> None:
        if not self.running:
            return
        self.tick_count += 1

        # Player cooldowns and continuous movement
        if self.player and self.player.alive:
            self.player.tick_cooldown()
            if self._player_direction:
                self._move_tank(self.player, self._player_direction)
            if self._player_fire:
                self._try_fire(self.player)
        else:
            self._handle_player_respawn()

        # Enemy cooldowns + AI
        for enemy in list(self.enemies.values()):
            if enemy.alive:
                enemy.tick_cooldown()
                self._ai_tick(enemy)

        # Move bullets
        self._tick_bullets()

        # Update explosions
        self._tick_explosions()

        # Spawn enemies
        self._tick_spawner()

        # Check win/loss
        self._check_end_conditions()

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

        col = SPAWN_COLS[self._enemies_spawned % len(SPAWN_COLS)]
        enemy_type = ENEMY_SEQUENCE[self._enemies_spawned % len(ENEMY_SEQUENCE)]
        enemy = make_enemy_tank(0.0, float(col), enemy_type)
        self.enemies[enemy.id] = enemy
        self._enemies_spawned += 1
        self._spawn_cooldown = 90  # ~1.5 seconds between spawns

    # ------------------------------------------------------------------
    # AI
    # ------------------------------------------------------------------

    def _ai_tick(self, enemy: Tank) -> None:
        # Build mini game state for agent
        game_state = {
            "tanks": [t.to_dict() for t in list(self.enemies.values()) + ([self.player] if self.player else [])],
            "bullets": [b.to_dict() for b in self.bullets.values()],
            "grid": self.grid,
            "agent_id": enemy.id,
            "base_pos": {"row": self._base_pos[0], "col": self._base_pos[1]} if self._base_pos else None,
        }

        # Use PatrolAgent logic inline for performance
        base_pos = game_state["base_pos"]
        if base_pos:
            dr = base_pos["row"] - enemy.row
            dc = base_pos["col"] - enemy.col
            if abs(dr) > abs(dc):
                preferred = "down" if dr > 0 else "up"
            else:
                preferred = "right" if dc > 0 else "left"
        else:
            preferred = "down"

        # Occasionally randomize
        if random.random() < 0.08:
            preferred = random.choice(["up", "down", "left", "right"])

        self._move_tank(enemy, preferred)

        if random.random() < 0.025:
            self._try_fire(enemy)

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def _move_tank(self, tank: Tank, direction: str) -> None:
        # If turning, snap to the grid to avoid getting stuck in half-tiles
        if direction != tank.direction:
            # Snap the "off-axis" coordinate
            if direction in ["up", "down"]:
                tank.col = round(tank.col)
            else:
                tank.row = round(tank.row)
            tank.direction = direction

        deltas = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}
        dr, dc = deltas.get(direction, (0, 0))
        
        # Calculate proposed new position
        new_row = tank.row + dr * tank.speed
        new_col = tank.col + dc * tank.speed

        if self._can_move_to(new_row, new_col, tank):
            tank.row = max(0.0, min(float(GRID_HEIGHT - 1), new_row))
            tank.col = max(0.0, min(float(GRID_WIDTH - 1), new_col))

    def _can_move_to(self, row: float, col: float, mover: Tank) -> bool:
        """AABB Collision check (0.98x0.98 bounding box)."""
        size = 0.49
        r1, r2 = row - size, row + size
        c1, c2 = col - size, col + size

        # 1. Boundary check — strict to grid limits
        if r1 < 0 or c1 < 0 or r2 > GRID_HEIGHT or c2 > GRID_WIDTH:
            return False

        # 2. Tile collision
        for r in range(int(r1), int(r2) + 1):
            for c in range(int(c1), int(c2) + 1):
                if 0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH:
                    tile = get_tile(self.grid[r][c])
                    if tile.tank_solid:
                        return False

        # 3. Tank-tank collision
        for other in list(self.enemies.values()) + ([self.player] if self.player else []):
            if other is mover or not other.alive:
                continue
            if abs(other.row - row) < 0.98 and abs(other.col - col) < 0.98:
                return False
        return True

    # ------------------------------------------------------------------
    # Bullets
    # ------------------------------------------------------------------

    def _try_fire(self, tank: Tank) -> None:
        bullet = tank.fire()
        if bullet:
            self.bullets[bullet.id] = bullet

    def _tick_bullets(self) -> None:
        for bullet in list(self.bullets.values()):
            if not bullet.alive:
                continue

            bullet.tick()

            # Out of bounds
            r, c = int(bullet.row), int(bullet.col)
            if bullet.row < 0 or bullet.col < 0 or bullet.row >= GRID_HEIGHT or bullet.col >= GRID_WIDTH:
                bullet.alive = False
                self._on_bullet_gone(bullet)
                continue

            # Tile collision
            tile = get_tile(self.grid[r][c])
            if tile.bullet_solid:
                if tile.destructible:
                    if tile.is_base:
                        # Base destroyed = immediate defeat
                        self.grid[r][c] = 0
                        self.result = "defeat"
                        self.running = False
                    elif bullet.power >= 2 or self.grid[r][c] == 1:
                        # Destroy brick or steel (if power bullet)
                        self.grid[r][c] = 0
                
                # Explosion effect
                self._add_explosion(bullet.row, bullet.col)
                bullet.alive = False
                self._on_bullet_gone(bullet)
                continue

            # Tank collision
            self._check_bullet_tank_hit(bullet)

        # Clean up dead bullets
        self.bullets = {bid: b for bid, b in self.bullets.items() if b.alive}

    def _check_bullet_tank_hit(self, bullet: Bullet) -> None:
        targets = []
        if not bullet.is_player and self.player and self.player.alive:
            targets.append(self.player)
        if bullet.is_player:
            targets.extend(e for e in self.enemies.values() if e.alive)

        for tank in targets:
            if abs(tank.row - bullet.row) < 0.8 and abs(tank.col - bullet.col) < 0.8:
                self._add_explosion(tank.row, tank.col)
                bullet.alive = False
                self._on_bullet_gone(bullet)
                tank.hp -= 1
                if tank.hp <= 0:
                    tank.alive = False
                    if not tank.is_player:
                        self.score += 100 * (list(ENEMY_TYPES).index(tank.tank_type) + 1)
                        self.enemies_remaining -= 1
                    else:
                        self.player_lives -= 1
                        self._player_respawn_timer = 180  # 3 seconds
                break

    def _on_bullet_gone(self, bullet: Bullet) -> None:
        """Decrement active bullet counter for the owning tank."""
        if bullet.is_player and self.player and self.player.id == bullet.owner_id:
            self.player.active_bullets = max(0, self.player.active_bullets - 1)
        else:
            owner = self.enemies.get(bullet.owner_id)
            if owner:
                owner.active_bullets = max(0, owner.active_bullets - 1)

    # ------------------------------------------------------------------
    # Explosions
    # ------------------------------------------------------------------

    def _add_explosion(self, row: float, col: float) -> None:
        self.explosions.append({"row": row, "col": col, "ticks": 15}) # 0.25s

    def _tick_explosions(self) -> None:
        for exp in self.explosions:
            exp["ticks"] -= 1
        self.explosions = [e for e in self.explosions if e["ticks"] > 0]

    # ------------------------------------------------------------------
    # Player respawn
    # ------------------------------------------------------------------

    def _handle_player_respawn(self) -> None:
        if self._player_respawn_timer > 0:
            self._player_respawn_timer -= 1
            if self._player_respawn_timer == 0 and self.player_lives > 0:
                base = self._base_pos or (GRID_HEIGHT - 1, GRID_WIDTH // 2)
                self.player.row = float(base[0])
                self.player.col = float(base[1] - 4)
                self.player.hp = 1
                self.player.alive = True

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
            self.result = "defeat"
            self.running = False

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def _build_state(self) -> dict:
        return {
            "tick": self.tick_count,
            "running": self.running,
            "result": self.result,
            "score": self.score,
            "lives": self.player_lives,
            "enemies_remaining": self.enemies_remaining,
            "total_enemies": self.total_enemies,
            "player": self.player.to_dict() if self.player else None,
            "enemies": [e.to_dict() for e in self.enemies.values()],
            "bullets": [b.to_dict() for b in self.bullets.values()],
            "explosions": self.explosions,
            "grid": self.grid,  # full grid on every tick
        }

    async def _emit(self, state: dict) -> None:
        if not self._state_callbacks:
            return
        await asyncio.gather(*[cb(state) for cb in self._state_callbacks], return_exceptions=True)
