"""
skeleton_controller.py — Skeleton creatures that spawn from lava tiles.

Up to 5 normal skeletons (2×1 grid cells) spawn during a game session.
Once all 5 are killed, a Mega Skeleton (8×4) boss appears.
Defeating the Mega Skeleton permanently builds the Bone Arch around the Eagle.
"""

from __future__ import annotations

import math
import random
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .game_engine import GameEngine

from .map_model import GRID_WIDTH, GRID_HEIGHT
from .tile_registry import LAVA, BONE_FRAME, BASE, GOLDEN_FRAME, get_tile

# Balance constants
NORMAL_HP = 3
NORMAL_W = 1          # cells wide
NORMAL_H = 2          # cells tall
NORMAL_MOVE_INTERVAL = 20   # ticks between steps
NORMAL_SPEED = 1.0    # cells per step

MEGA_HP = 25
MEGA_W = 8
MEGA_H = 4
MEGA_MOVE_INTERVAL = 40

MAX_NORMAL_ALIVE = 1
TOTAL_NORMAL_CAP = 5        # kill 5 to trigger boss
SPAWN_INTERVAL = 600        # ticks between spawn attempts (~10s at 60fps)
CONTACT_DAMAGE_INTERVAL = 60  # ticks between contact hits
CONTACT_DAMAGE = 1

_next_id = 0


def _new_id() -> int:
    global _next_id
    _next_id += 1
    return _next_id


def _make_skeleton(row: float, col: float, w: int, h: int, hp: int, is_mega: bool) -> dict:
    return {
        "id": _new_id(),
        "row": float(row),
        "col": float(col),
        "direction": random.choice(["up", "down", "left", "right"]),
        "hp": hp,
        "max_hp": hp,
        "alive": True,
        "w": w,
        "h": h,
        "move_timer": random.randint(0, 20),
        "contact_timer": 0,
        "is_mega": is_mega,
    }


class SkeletonController:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine
        self.skeletons: list[dict] = []
        self.mega: Optional[dict] = None
        self.total_spawned: int = 0
        self.total_killed: int = 0
        self.bone_arch_built: bool = False
        self.spawn_timer: int = SPAWN_INTERVAL // 2  # first spawn sooner

    # ------------------------------------------------------------------
    # Main tick
    # ------------------------------------------------------------------

    def tick(self) -> None:
        self._tick_spawn()
        self._move_skeletons(self.skeletons)
        if self.mega and self.mega["alive"]:
            self._move_skeletons([self.mega])
        self._check_bullet_hits()
        self._check_contacts()
        self._cleanup_dead()

    # ------------------------------------------------------------------
    # Spawning
    # ------------------------------------------------------------------

    def _tick_spawn(self) -> None:
        # Don't spawn normal skeletons once 5 have been killed or mega is active
        if self.total_killed >= TOTAL_NORMAL_CAP or self.mega is not None:
            return
        if len([s for s in self.skeletons if s["alive"]]) >= MAX_NORMAL_ALIVE:
            return
        if self.total_spawned >= TOTAL_NORMAL_CAP:
            return

        self.spawn_timer -= 1
        if self.spawn_timer > 0:
            return

        self.spawn_timer = SPAWN_INTERVAL
        self._spawn_skeleton()

    def _spawn_skeleton(self) -> None:
        engine = self.engine
        lava_tiles = [
            (r, c)
            for r in range(GRID_HEIGHT)
            for c in range(GRID_WIDTH)
            if engine.grid[r][c] == LAVA
        ]
        if not lava_tiles:
            return

        random.shuffle(lava_tiles)
        for lr, lc in lava_tiles:
            # Need room for a 2×1 footprint starting at (lr, lc)
            if not self._footprint_clear(float(lr), float(lc), NORMAL_W, NORMAL_H, ignore_lava=True):
                continue
            skel = _make_skeleton(float(lr), float(lc), NORMAL_W, NORMAL_H, NORMAL_HP, is_mega=False)
            self.skeletons.append(skel)
            self.total_spawned += 1
            engine.events.append({"type": "sound", "sound": "powerup-appear"})
            return

    def _spawn_mega(self) -> None:
        engine = self.engine
        cr = GRID_HEIGHT // 2 - MEGA_H // 2
        cc = GRID_WIDTH // 2 - MEGA_W // 2

        # Try to find a clear area near centre
        for dr in range(-5, 6):
            for dc in range(-5, 6):
                tr = max(0, cr + dr)
                tc = max(0, cc + dc)
                if self._footprint_clear(float(tr), float(tc), MEGA_W, MEGA_H, ignore_lava=True):
                    self.mega = _make_skeleton(float(tr), float(tc), MEGA_W, MEGA_H, MEGA_HP, is_mega=True)
                    engine.events.append({"type": "sound", "sound": "powerup-appear"})
                    return

        # Fallback: place at centre regardless
        self.mega = _make_skeleton(float(cr), float(cc), MEGA_W, MEGA_H, MEGA_HP, is_mega=True)
        engine.events.append({"type": "sound", "sound": "powerup-appear"})

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def _move_skeletons(self, group: list[dict]) -> None:
        for skel in group:
            if not skel["alive"]:
                continue
            interval = MEGA_MOVE_INTERVAL if skel["is_mega"] else NORMAL_MOVE_INTERVAL
            skel["move_timer"] -= 1
            if skel["move_timer"] > 0:
                continue
            skel["move_timer"] = interval

            target = self._find_nearest_tank_pos(skel)
            if target:
                skel["direction"] = self._steer_toward(skel, target)

            self._try_move(skel)

    def _steer_toward(self, skel: dict, target: tuple[float, float]) -> str:
        sr = skel["row"] + skel["h"] / 2
        sc = skel["col"] + skel["w"] / 2
        tr, tc = target
        dr = tr - sr
        dc = tc - sc

        # Prefer axis with larger delta; 50% randomness to unstick from walls
        if random.random() < 0.15:
            return random.choice(["up", "down", "left", "right"])

        dirs = []
        if abs(dr) >= abs(dc):
            dirs = (["down", "up"] if dr > 0 else ["up", "down"]) + (["right", "left"] if dc > 0 else ["left", "right"])
        else:
            dirs = (["right", "left"] if dc > 0 else ["left", "right"]) + (["down", "up"] if dr > 0 else ["up", "down"])

        for d in dirs:
            nr, nc = self._step(skel["row"], skel["col"], d, 1)
            if self._footprint_clear(nr, nc, skel["w"], skel["h"], ignore_lava=True):
                return d

        return skel["direction"]

    def _try_move(self, skel: dict) -> None:
        nr, nc = self._step(skel["row"], skel["col"], skel["direction"], 1)
        if self._footprint_clear(nr, nc, skel["w"], skel["h"], ignore_lava=True):
            skel["row"] = nr
            skel["col"] = nc
        else:
            # Try perpendicular directions
            perps = {
                "up": ["left", "right"],
                "down": ["right", "left"],
                "left": ["down", "up"],
                "right": ["up", "down"],
            }
            for d in perps.get(skel["direction"], []):
                nr2, nc2 = self._step(skel["row"], skel["col"], d, 1)
                if self._footprint_clear(nr2, nc2, skel["w"], skel["h"], ignore_lava=True):
                    skel["direction"] = d
                    skel["row"] = nr2
                    skel["col"] = nc2
                    return

    @staticmethod
    def _step(row: float, col: float, direction: str, dist: int) -> tuple[float, float]:
        if direction == "up":
            return row - dist, col
        if direction == "down":
            return row + dist, col
        if direction == "left":
            return row, col - dist
        return row, col + dist

    def _footprint_clear(self, row: float, col: float, w: int, h: int, ignore_lava: bool = False) -> bool:
        """Check that the w×h footprint at (row, col) top-left is inside bounds and unblocked."""
        engine = self.engine
        r1, r2 = int(row), int(row) + h
        c1, c2 = int(col), int(col) + w

        if row < 0 or col < 0 or r2 > GRID_HEIGHT or c2 > GRID_WIDTH:
            return False

        for r in range(r1, r2):
            for c in range(c1, c2):
                tid = engine.grid[r][c]
                if ignore_lava and tid == LAVA:
                    continue
                tile = get_tile(tid)
                if tile.tank_solid:
                    return False
        return True

    # ------------------------------------------------------------------
    # Bullet collision
    # ------------------------------------------------------------------

    def _check_bullet_hits(self) -> None:
        engine = self.engine
        targets = [s for s in self.skeletons if s["alive"]]
        if self.mega and self.mega["alive"]:
            targets.append(self.mega)

        for bullet in list(engine.bullets.values()):
            if not bullet.alive:
                continue
            for skel in targets:
                if self._bullet_in_rect(bullet, skel):
                    skel["hp"] -= bullet.power
                    bullet.alive = False
                    engine._on_bullet_gone(bullet)
                    engine._add_explosion(bullet.row, bullet.col)
                    engine.events.append({"type": "sound", "sound": "hit-steel"})
                    if skel["hp"] <= 0:
                        self._kill_skeleton(skel)
                    break

    @staticmethod
    def _bullet_in_rect(bullet, skel: dict) -> bool:
        """Check if bullet position overlaps with skeleton's grid-cell footprint."""
        br, bc = bullet.row, bullet.col
        sr, sc = skel["row"], skel["col"]
        return sr <= br < sr + skel["h"] and sc <= bc < sc + skel["w"]

    # ------------------------------------------------------------------
    # Contact damage
    # ------------------------------------------------------------------

    def _check_contacts(self) -> None:
        engine = self.engine
        targets = [s for s in self.skeletons if s["alive"]]
        if self.mega and self.mega["alive"]:
            targets.append(self.mega)

        candidates = list(engine.enemies.values())
        if engine.player and engine.player.alive:
            candidates.append(engine.player)

        for skel in targets:
            skel["contact_timer"] = max(0, skel["contact_timer"] - 1)
            if skel["contact_timer"] > 0:
                continue
            for tank in candidates:
                if not tank.alive:
                    continue
                if self._tank_overlaps_skeleton(tank, skel):
                    tank.hp -= CONTACT_DAMAGE
                    skel["contact_timer"] = CONTACT_DAMAGE_INTERVAL
                    engine.events.append({"type": "sound", "sound": "brick-hit"})
                    if tank.hp <= 0:
                        tank.alive = False
                        engine._add_explosion(tank.row, tank.col)
                        if tank.is_player:
                            # Proper player death: decrement lives and start respawn timer
                            engine.events.append({"type": "sound", "sound": "player-explosion"})
                            engine.player_lives -= 1
                            engine._player_respawn_timer = 180
                        else:
                            # Enemy dies but does NOT count toward the victory kill tally —
                            # the spawner will replace them so the player still clears the wave
                            engine.events.append({"type": "sound", "sound": "enemy-explosion"})
                    break

    @staticmethod
    def _tank_overlaps_skeleton(tank, skel: dict) -> bool:
        TANK_HALF = 0.499
        tr, tc = tank.row, tank.col
        sr, sc = skel["row"], skel["col"]
        return (sr <= tr + TANK_HALF and tr - TANK_HALF < sr + skel["h"] and
                sc <= tc + TANK_HALF and tc - TANK_HALF < sc + skel["w"])

    # ------------------------------------------------------------------
    # Death handling
    # ------------------------------------------------------------------

    def _kill_skeleton(self, skel: dict) -> None:
        skel["alive"] = False
        engine = self.engine
        engine._add_explosion(skel["row"] + skel["h"] / 2, skel["col"] + skel["w"] / 2)
        engine.events.append({"type": "sound", "sound": "enemy-explosion"})

        if skel["is_mega"]:
            self._on_mega_killed()
        else:
            self.total_killed += 1
            engine.score += 500
            if self.total_killed >= TOTAL_NORMAL_CAP and self.mega is None:
                self._spawn_mega()

    def _on_mega_killed(self) -> None:
        self.engine.score += 5000
        self._build_bone_arch()

    def _cleanup_dead(self) -> None:
        self.skeletons = [s for s in self.skeletons if s["alive"]]

    def apply_tnt_damage(self, blast_row: float, blast_col: float) -> None:
        """Apply 1 damage to any skeleton whose footprint contains (blast_row, blast_col)."""
        targets = [s for s in self.skeletons if s["alive"]]
        if self.mega and self.mega["alive"]:
            targets.append(self.mega)
        for skel in targets:
            if not skel["alive"]:
                continue
            sr, sc = skel["row"], skel["col"]
            if sr <= blast_row < sr + skel["h"] and sc <= blast_col < sc + skel["w"]:
                skel["hp"] -= 1
                if skel["hp"] <= 0:
                    self._kill_skeleton(skel)

    # ------------------------------------------------------------------
    # Bone Arch
    # ------------------------------------------------------------------

    def _build_bone_arch(self) -> None:
        if self.bone_arch_built:
            return
        engine = self.engine
        if not engine._base_pos:
            return
        self.bone_arch_built = True
        base_r, base_c = engine._base_pos
        # Same 5-position pattern as the golden arch
        offsets = [(-2, -2), (-2, 0), (-2, 2), (0, -2), (0, 2)]
        for dr, dc in offsets:
            r, c = base_r + dr, base_c + dc
            for gr in range(r, r + 2):
                for gc in range(c, c + 2):
                    if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                        tid = engine.grid[gr][gc]
                        if tid not in (BASE, GOLDEN_FRAME, BONE_FRAME):
                            engine.grid[gr][gc] = BONE_FRAME
        engine.events.append({"type": "sound", "sound": "powerup-appear"})

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _find_nearest_tank_pos(self, skel: dict) -> Optional[tuple[float, float]]:
        engine = self.engine
        sr = skel["row"] + skel["h"] / 2
        sc = skel["col"] + skel["w"] / 2
        best_dist = float("inf")
        best_pos: Optional[tuple[float, float]] = None

        candidates = list(engine.enemies.values())
        if engine.player and engine.player.alive:
            candidates.append(engine.player)

        for tank in candidates:
            if not tank.alive:
                continue
            d = math.hypot(tank.row - sr, tank.col - sc)
            if d < best_dist:
                best_dist = d
                best_pos = (tank.row, tank.col)

        return best_pos
