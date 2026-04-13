"""
mobile_tile_controller.py — Autonomous roaming for tiles flagged `mobile=True`.

Connected regions of the same mobile tile id move as one unit (any footprint shape).
Grid cells are updated each step so rendering and bullet collision stay consistent.
"""

from __future__ import annotations

import random
from collections import deque
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .game_engine import GameEngine

from .map_model import GRID_WIDTH, GRID_HEIGHT
from .tank import ENEMY_TYPES
from .tile_registry import EMPTY, get_tile

MOBILE_TILE_MOVE_INTERVAL = 22  # ticks between steps (~skeleton pacing)

# Mirror game_engine.TANK_HALF — avoid importing game_engine at module load (circular).
TANK_HALF = 0.499

ORTH = ((-1, 0), (1, 0), (0, -1), (0, 1))

_next_entity_id = 0


def _new_entity_id() -> int:
    global _next_entity_id
    _next_entity_id += 1
    return _next_entity_id


class MobileTileController:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine
        self.entities: list[dict] = []
        self._cell_owner: dict[tuple[int, int], int] = {}  # (r,c) -> entity id

    def init_from_grid(self) -> None:
        """Call once after map load. Finds connected components per mobile tile id."""
        self.entities.clear()
        self._cell_owner.clear()
        visited: set[tuple[int, int]] = set()

        for r in range(GRID_HEIGHT):
            for c in range(GRID_WIDTH):
                if (r, c) in visited:
                    continue
                tid = self.engine.grid[r][c]
                tile = get_tile(tid)
                if not tile.mobile:
                    continue

                comp: set[tuple[int, int]] = set()
                q: deque[tuple[int, int]] = deque([(r, c)])
                while q:
                    cr, cc = q.popleft()
                    if (cr, cc) in comp:
                        continue
                    if not (0 <= cr < GRID_HEIGHT and 0 <= cc < GRID_WIDTH):
                        continue
                    if self.engine.grid[cr][cc] != tid:
                        continue
                    comp.add((cr, cc))
                    for dr, dc in ORTH:
                        q.append((cr + dr, cc + dc))

                visited.update(comp)
                eid = _new_entity_id()
                ent = {
                    "id": eid,
                    "cells": comp,
                    "tile_id": tid,
                    "under": {cell: EMPTY for cell in comp},
                    "direction": random.choice(["up", "down", "left", "right"]),
                    "move_timer": random.randint(0, MOBILE_TILE_MOVE_INTERVAL),
                }
                for cell in comp:
                    self._cell_owner[cell] = eid
                self.entities.append(ent)

    def unregister_entities_in_block(self, block: list[tuple[int, int]]) -> None:
        """Drop tracking for any mobile entity touching these cells (grid updated separately)."""
        hit = set(block)
        to_drop = [e for e in self.entities if e["cells"] & hit]
        for e in to_drop:
            self._unregister_entity(e)

    def on_partial_custom_damage(self, r: int, c: int, tid: int, replace_tid: int) -> bool:
        """Mobile + partial_destructible: destroy the whole footprint."""
        eid = self._cell_owner.get((r, c))
        if eid is None:
            return False
        ent = self._entity_by_id(eid)
        if ent is None or ent["tile_id"] != tid:
            return False
        for cr, cc in list(ent["cells"]):
            if self.engine.grid[cr][cc] == tid:
                self.engine.grid[cr][cc] = replace_tid
        self._unregister_entity(ent)
        return True

    def _unregister_entity(self, ent: dict) -> None:
        for cell in ent["cells"]:
            self._cell_owner.pop(cell, None)
        self.entities.remove(ent)

    def _entity_by_id(self, eid: int) -> Optional[dict]:
        for e in self.entities:
            if e["id"] == eid:
                return e
        return None

    def reconcile_with_grid(self) -> None:
        """If any footprint cell no longer matches tile_id (e.g. TNT), drop entity and restore survivors."""
        for ent in list(self.entities):
            for cell in ent["cells"]:
                r, c = cell
                if self.engine.grid[r][c] != ent["tile_id"]:
                    self._dissolve_entity_cleanup(ent)
                    break

    def _dissolve_entity_cleanup(self, ent: dict) -> None:
        engine = self.engine
        for cell in list(ent["cells"]):
            r, c = cell
            if engine.grid[r][c] == ent["tile_id"]:
                engine.grid[r][c] = ent["under"].get(cell, EMPTY)
        self._unregister_entity(ent)

    def get_entity_bounds(self) -> list[dict]:
        """Return bounding box info for each entity, for use in frontend state."""
        result = []
        for ent in self.entities:
            cells = ent["cells"]
            if not cells:
                continue
            rows = [c[0] for c in cells]
            cols = [c[1] for c in cells]
            result.append({
                "id": ent["id"],
                "tile_id": ent["tile_id"],
                "minR": min(rows),
                "minC": min(cols),
                "w": max(cols) - min(cols) + 1,
                "h": max(rows) - min(rows) + 1,
            })
        return result

    def tick(self) -> None:
        self.reconcile_with_grid()
        for ent in list(self.entities):
            ent["move_timer"] -= 1
            if ent["move_timer"] > 0:
                continue
            ent["move_timer"] = MOBILE_TILE_MOVE_INTERVAL

            tile = get_tile(ent["tile_id"])
            target = self._pick_target_center(ent, tile.creature_affinity)
            if target:
                ent["direction"] = self._steer_toward(ent, target)
            elif random.random() < 0.12:
                ent["direction"] = random.choice(["up", "down", "left", "right"])

            self._try_move_entity(ent)

    def _centroid(self, ent: dict) -> tuple[float, float]:
        cells = ent["cells"]
        sr = sum(rc[0] for rc in cells) / len(cells) + 0.5
        sc = sum(rc[1] for rc in cells) / len(cells) + 0.5
        return sr, sc

    def _pick_target_center(
        self, ent: dict, affinity: str | None
    ) -> Optional[tuple[float, float]]:
        engine = self.engine
        candidates: list[tuple[float, float]] = []

        if affinity == "ally":
            for e in engine.enemies.values():
                if e.alive and e.tank_type in ENEMY_TYPES:
                    candidates.append((e.row, e.col))
            for j in engine.evil_jaws.values():
                if j.alive:
                    candidates.append((j.row, j.col))
        elif affinity == "enemy":
            if engine.player and engine.player.alive:
                candidates.append((engine.player.row, engine.player.col))
            for t in engine.turrets.values():
                if t.alive:
                    candidates.append((t.row, t.col))
            for e in engine.enemies.values():
                if e.alive and e.companion and e.companion.alive:
                    candidates.append((e.companion.row, e.companion.col))
        else:
            if engine.player and engine.player.alive:
                candidates.append((engine.player.row, engine.player.col))
            for e in engine.enemies.values():
                if e.alive:
                    candidates.append((e.row, e.col))

        if not candidates:
            return None

        sr, sc = self._centroid(ent)
        best: Optional[tuple[float, float]] = None
        best_d = float("inf")
        for tr, tc in candidates:
            d = (tr - sr) ** 2 + (tc - sc) ** 2
            if d < best_d:
                best_d = d
                best = (tr, tc)
        return best

    def _steer_toward(self, ent: dict, target: tuple[float, float]) -> str:
        sr, sc = self._centroid(ent)
        tr, tc = target
        dr = tr - sr
        dc = tc - sc

        if random.random() < 0.14:
            return random.choice(["up", "down", "left", "right"])

        dirs: list[str]
        if abs(dr) >= abs(dc):
            dirs = (["down", "up"] if dr > 0 else ["up", "down"]) + (
                ["right", "left"] if dc > 0 else ["left", "right"]
            )
        else:
            dirs = (["right", "left"] if dc > 0 else ["left", "right"]) + (
                ["down", "up"] if dr > 0 else ["up", "down"]
            )

        for d in dirs:
            if self._can_shift(ent, d):
                return d
        return ent["direction"]

    @staticmethod
    def _step_direction(direction: str) -> tuple[int, int]:
        if direction == "up":
            return -1, 0
        if direction == "down":
            return 1, 0
        if direction == "left":
            return 0, -1
        return 0, 1

    def _can_shift(self, ent: dict, direction: str) -> bool:
        dr, dc = self._step_direction(direction)
        new_cells = {(r + dr, c + dc) for (r, c) in ent["cells"]}
        return self._destination_clear(ent, new_cells)

    def _destination_clear(self, ent: dict, new_cells: set[tuple[int, int]]) -> bool:
        engine = self.engine
        eid = ent["id"]
        old = ent["cells"]
        entering = new_cells - old
        for r, c in new_cells:
            if not (0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH):
                return False

        for r, c in entering:
            owner = self._cell_owner.get((r, c))
            if owner is not None and owner != eid:
                return False
            tid_here = engine.grid[r][c]
            t = get_tile(tid_here)
            if t.is_base:
                return False
            if tid_here != ent["tile_id"] and t.tank_solid and not t.walkable:
                return False

        for r, c in entering:
            if self._tank_occupies_cell(r, c, TANK_HALF):
                return False
        return True

    def _tank_occupies_cell(self, gr: int, gc: int, tank_half: float) -> bool:
        engine = self.engine
        tanks = list(engine.enemies.values())
        if engine.player and engine.player.alive:
            tanks.append(engine.player)
        tanks.extend(t for t in engine.turrets.values() if t.alive)
        tanks.extend(j for j in engine.evil_jaws.values() if j.alive)
        for t in tanks:
            if not t.alive:
                continue
            size = tank_half * 2.0 if (t.mushroom_ticks > 0 or t.is_big) else tank_half
            r1, r2 = int(t.row - size), int(t.row + size)
            c1, c2 = int(t.col - size), int(t.col + size)
            if r1 <= gr <= r2 and c1 <= gc <= c2:
                return True
            if t.companion and t.companion.alive:
                ct = t.companion
                size_c = tank_half * 2.0 if (ct.mushroom_ticks > 0 or ct.is_big) else tank_half
                r1, r2 = int(ct.row - size_c), int(ct.row + size_c)
                c1, c2 = int(ct.col - size_c), int(ct.col + size_c)
                if r1 <= gr <= r2 and c1 <= gc <= c2:
                    return True
        return False

    def _try_move_entity(self, ent: dict) -> None:
        direction = ent["direction"]
        dr, dc = self._step_direction(direction)
        new_cells = {(r + dr, c + dc) for (r, c) in ent["cells"]}

        if self._destination_clear(ent, new_cells):
            self._apply_shift(ent, new_cells)
            return

        perps = {
            "up": ["left", "right"],
            "down": ["right", "left"],
            "left": ["down", "up"],
            "right": ["up", "down"],
        }
        for d in perps.get(direction, []):
            dr2, dc2 = self._step_direction(d)
            alt = {(r + dr2, c + dc2) for (r, c) in ent["cells"]}
            if self._destination_clear(ent, alt):
                ent["direction"] = d
                self._apply_shift(ent, alt)
                return

    def _apply_shift(self, ent: dict, new_cells: set[tuple[int, int]]) -> None:
        engine = self.engine
        eid = ent["id"]
        tid = ent["tile_id"]
        old_cells = ent["cells"]
        leaving = old_cells - new_cells
        entering = new_cells - old_cells

        for r, c in leaving:
            restore = ent["under"].pop((r, c))
            engine.grid[r][c] = restore
            self._cell_owner.pop((r, c), None)

        for r, c in entering:
            ent["under"][(r, c)] = engine.grid[r][c]
            engine.grid[r][c] = tid
            self._cell_owner[(r, c)] = eid

        ent["cells"] = new_cells
