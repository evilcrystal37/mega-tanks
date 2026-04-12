"""
ant_controller.py — Ant ecosystem for Mega Tanks.
Only friendly ants roam, collect resources, and build piles.

Pile lifecycle:
  1. No pile exists → first ant that picks up a resource triggers
     _initiate_pile() which picks ONE random empty spot for the whole team.
  2. All subsequent ants navigate to that shared pile pos.
  3. When a pile tile is destroyed (shot), _handle_pile_destruction() fires
     1–3 homing rockets at the nearest enemy (scaled by apple count), then
     clears the pile pos so the next delivery initiates a fresh random pile.

Ants respect solid tiles (tank_solid=True) but can pass through TREE and
APPLE tiles. They use BFS pathfinding to navigate around obstacles.
Ants can be killed by bullets.
"""

from __future__ import annotations
import math
import random
from collections import deque
from typing import TYPE_CHECKING, Optional, List, Tuple

if TYPE_CHECKING:
    from .game_engine import GameEngine

from .map_model import GRID_WIDTH, GRID_HEIGHT
from .tile_registry import (
    APPLE, SUNFLOWER, ANT_PILE_FRIENDLY, EMPTY, TREE,
    get_tile,
)
from .bullet import Bullet, MISSILE_SPEED

ANT_HP = 2
ANT_MOVE_INTERVAL = 10
ANT_SPEED = 0.5
SPAWN_INTERVAL = 120  # every ~2 seconds
MAX_ANTS = 3

# BFS pathfinding cache lifetime (ticks)
_PATH_RECALC_INTERVAL = 15


class Ant:
    def __init__(self, id: int, row: float, col: float):
        self.id = id
        self.row = row
        self.col = col
        self.is_friendly = True   # Always True — no evil ants
        self.hp = ANT_HP
        self.alive = True
        self.carrying = False
        self.carried_tile: Optional[int] = None
        self.target_pos: Optional[Tuple[float, float]] = None
        self.move_timer = 0
        self.direction = random.choice(["up", "down", "left", "right"])
        # BFS pathfinding
        self._path: List[Tuple[int, int]] = []
        self._path_timer = 0


class AntController:
    def __init__(self, engine: "GameEngine"):
        self.engine = engine
        self.ants: List[Ant] = []
        self._next_id = 0
        self.spawn_timer = 0

        # Apple counts delivered to the pile (resets when pile is destroyed)
        self.friendly_apples = 0

        # Shared pile location — None means no pile exists yet.
        # Chosen randomly once (on first apple pickup); all ants navigate here.
        self.friendly_pile_pos: Optional[Tuple[int, int]] = None

        # True only after the first apple is physically delivered and tiles stamped.
        # Prevents _sync_pile_tiles from treating the reserved-but-empty spot
        # as a destroyed pile before any ant has arrived.
        self.friendly_pile_built: bool = False

    # ------------------------------------------------------------------
    # Main tick
    # ------------------------------------------------------------------

    def tick(self):
        self._tick_spawn()
        self._tick_movement()
        self._cleanup()
        self._sync_pile_tiles()

    # ------------------------------------------------------------------
    # Pile tile management & destruction detection
    # ------------------------------------------------------------------

    def _sync_pile_tiles(self):
        """Keep pile tiles stamped in the grid; detect if they were shot away."""
        if not self.friendly_pile_pos:
            return

        r, c = self.friendly_pile_pos

        if self.friendly_pile_built:
            # Pile was stamped — if top-left is now EMPTY it was shot
            if self.engine.grid[r][c] == EMPTY:
                self._handle_pile_destruction(self.friendly_pile_pos)
                self.friendly_pile_pos  = None
                self.friendly_pile_built = False
                self.friendly_apples    = 0
            else:
                # Re-stamp to repair any partial damage
                self._stamp_pile(r, c, ANT_PILE_FRIENDLY)
        # else: spot is reserved but not yet built — nothing to do

    def _stamp_pile(self, r: int, c: int, pile_id: int):
        for dr in range(2):
            for dc in range(2):
                nr, nc = r + dr, c + dc
                if 0 <= nr < GRID_HEIGHT and 0 <= nc < GRID_WIDTH:
                    self.engine.grid[nr][nc] = pile_id

    def _handle_pile_destruction(self, pos: Tuple[int, int]):
        """Fire 1–3 rockets at the nearest enemy, scaled by apples delivered."""
        num_rockets = min(3, 1 + self.friendly_apples // 3)

        self.engine.events.append({"type": "sound", "sound": "explosion"})

        targets = [e for e in self.engine.enemies.values() if e.alive]
        if not targets:
            return

        pr, pc = pos[0] + 0.5, pos[1] + 0.5
        nearest = min(targets, key=lambda t: math.hypot(t.row - pr, t.col - pc))

        for i in range(num_rockets):
            missile = Bullet(
                id=f"ant_missile_{self.engine.tick_count}_{i}_{random.randint(0, 9999)}",
                owner_id="ant_pile",
                is_player=True,
                row=pr,
                col=pc,
                direction="up",
                speed=MISSILE_SPEED,
                power=2,
                ttl=300,
                alive=True,
                crush_bricks=False,
                is_grenade=False,
                is_missile=True,
                target_row=nearest.row,
                target_col=nearest.col,
            )
            self.engine.bullets[missile.id] = missile

    # ------------------------------------------------------------------
    # Pile initiation — called once when no pile exists
    # ------------------------------------------------------------------

    def _initiate_pile(self) -> Optional[Tuple[int, int]]:
        """Pick a random empty 2×2 spot and claim it as the pile location."""
        margin = 3
        attempts = 50
        for _ in range(attempts):
            r = random.randint(margin, GRID_HEIGHT - margin - 2)
            c = random.randint(margin, GRID_WIDTH  - margin - 2)
            if all(
                0 <= r + dr < GRID_HEIGHT and 0 <= c + dc < GRID_WIDTH and
                self.engine.grid[r + dr][c + dc] == EMPTY
                for dr in range(2) for dc in range(2)
            ):
                self.friendly_pile_pos = (r, c)
                return (r, c)
        return None  # No clear spot found — try again next delivery

    # ------------------------------------------------------------------
    # Spawning
    # ------------------------------------------------------------------

    def _tick_spawn(self):
        self.spawn_timer -= 1
        if self.spawn_timer > 0:
            return
        self.spawn_timer = SPAWN_INTERVAL

        trees = self._find_tiles(TREE)
        if not trees:
            return

        if len(self.ants) < MAX_ANTS:
            tr, tc = random.choice(trees)
            self._add_ant(tr + 0.5, tc + 0.5)

    def _add_ant(self, r: float, c: float):
        self._next_id += 1
        self.ants.append(Ant(self._next_id, r, c))

    # ------------------------------------------------------------------
    # Movement (BFS pathfinding)
    # ------------------------------------------------------------------

    def _tick_movement(self):
        for ant in self.ants:
            if not ant.alive:
                continue

            ant.move_timer -= 1
            if ant.move_timer > 0:
                continue
            ant.move_timer = ANT_MOVE_INTERVAL

            # Determine target
            if not ant.carrying:
                res = self._find_nearest_resource(ant.row, ant.col)
                if res:
                    ant.target_pos = (res[0] + 0.5, res[1] + 0.5)
                else:
                    ant.target_pos = None
            else:
                pile_pos = self.friendly_pile_pos
                if pile_pos:
                    ant.target_pos = (pile_pos[0] + 0.5, pile_pos[1] + 0.5)
                else:
                    ant.target_pos = None

            # Recompute BFS path periodically or when path is empty
            ant._path_timer -= 1
            if ant.target_pos and (ant._path_timer <= 0 or not ant._path):
                ant._path = self._bfs_path(
                    int(ant.row), int(ant.col),
                    int(ant.target_pos[0]), int(ant.target_pos[1])
                )
                ant._path_timer = _PATH_RECALC_INTERVAL

            # Follow path
            if ant._path:
                next_r, next_c = ant._path[0]
                dr = next_r - int(ant.row)
                dc = next_c - int(ant.col)
                if dr < 0:
                    ant.direction = "up"
                elif dr > 0:
                    ant.direction = "down"
                elif dc < 0:
                    ant.direction = "left"
                elif dc > 0:
                    ant.direction = "right"

                # If we've reached this waypoint, pop it
                if abs(ant.row - (next_r + 0.5)) < 0.6 and abs(ant.col - (next_c + 0.5)) < 0.6:
                    ant._path.pop(0)
            elif ant.target_pos:
                # Fallback: direct steer when BFS fails
                ant.direction = self._steer(ant)
            elif random.random() < 0.1:
                ant.direction = random.choice(["up", "down", "left", "right"])

            self._try_move(ant)
            self._handle_interaction(ant)

    def _bfs_path(self, sr: int, sc: int, tr: int, tc: int) -> List[Tuple[int, int]]:
        """BFS from (sr,sc) to (tr,tc). Returns list of (row,col) steps."""
        if sr == tr and sc == tc:
            return []
        if not (0 <= tr < GRID_HEIGHT and 0 <= tc < GRID_WIDTH):
            return []

        visited = {(sr, sc)}
        queue = deque([(sr, sc, [])])

        while queue and len(visited) < 600:
            cr, cc, path = queue.popleft()
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = cr + dr, cc + dc
                if (nr, nc) in visited:
                    continue
                if not self._cell_passable(nr, nc):
                    continue
                visited.add((nr, nc))
                new_path = path + [(nr, nc)]
                if nr == tr and nc == tc:
                    return new_path
                queue.append((nr, nc, new_path))

        # BFS failed — return empty (fallback to direct steer)
        return []

    def _cell_passable(self, r: int, c: int) -> bool:
        """Check if a grid cell is passable for an ant."""
        if not (0 <= r < GRID_HEIGHT and 0 <= c < GRID_WIDTH):
            return False
        tile_id = self.engine.grid[r][c]
        # Tree and Apple tiles are always passable for ants
        if tile_id in (TREE, APPLE, SUNFLOWER, EMPTY, ANT_PILE_FRIENDLY):
            return True
        tile = get_tile(tile_id)
        return not tile.tank_solid

    def _find_nearest_resource(self, r: float, c: float) -> Optional[Tuple[int, int]]:
        best_dist = float('inf')
        best_pos = None
        for gr in range(GRID_HEIGHT):
            for gc in range(GRID_WIDTH):
                if self.engine.grid[gr][gc] in (APPLE, SUNFLOWER):
                    d = math.hypot(gr - r, gc - c)
                    if d < best_dist:
                        best_dist = d
                        best_pos = (gr, gc)
        return best_pos

    def _steer(self, ant: Ant) -> str:
        tr, tc = ant.target_pos
        dr = tr - ant.row
        dc = tc - ant.col
        if abs(dr) > abs(dc):
            return "down" if dr > 0 else "up"
        return "right" if dc > 0 else "left"

    def _try_move(self, ant: Ant):
        dr, dc = 0.0, 0.0
        if ant.direction == "up":    dr = -ANT_SPEED
        elif ant.direction == "down": dr =  ANT_SPEED
        elif ant.direction == "left": dc = -ANT_SPEED
        elif ant.direction == "right":dc =  ANT_SPEED

        nr, nc = ant.row + dr, ant.col + dc
        if self._can_pass(nr, nc):
            ant.row = nr
            ant.col = nc
        else:
            ant.direction = random.choice(["up", "down", "left", "right"])
            # Invalidate path so BFS recomputes on next tick
            ant._path = []
            ant._path_timer = 0

    def _can_pass(self, r: float, c: float) -> bool:
        """Ants obey solid tiles but can pass through TREE, APPLE, and pile tiles."""
        ir, ic = int(r), int(c)
        if not (0 <= ir < GRID_HEIGHT and 0 <= ic < GRID_WIDTH):
            return False
        tile_id = self.engine.grid[ir][ic]
        # These are always passable for ants
        if tile_id in (TREE, APPLE, SUNFLOWER, EMPTY, ANT_PILE_FRIENDLY):
            return True
        tile = get_tile(tile_id)
        return not tile.tank_solid

    # ------------------------------------------------------------------
    # Interaction (pick up / drop off)
    # ------------------------------------------------------------------

    def _handle_interaction(self, ant: Ant):
        ir, ic = int(ant.row), int(ant.col)
        if not (0 <= ir < GRID_HEIGHT and 0 <= ic < GRID_WIDTH):
            return

        tile_id = self.engine.grid[ir][ic]

        if not ant.carrying:
            if tile_id in (APPLE, SUNFLOWER):
                ant.carrying = True
                ant.carried_tile = tile_id
                # Consume the 2×2 resource block
                r_base = (ir // 2) * 2
                c_base = (ic // 2) * 2
                for dr in range(2):
                    for dc in range(2):
                        rr, cc = r_base + dr, c_base + dc
                        if 0 <= rr < GRID_HEIGHT and 0 <= cc < GRID_WIDTH:
                            if self.engine.grid[rr][cc] == tile_id:
                                self.engine.grid[rr][cc] = EMPTY

                # If no pile yet, choose a random spot now
                if self.friendly_pile_pos is None:
                    self._initiate_pile()

                ant.target_pos = None   # Will be updated next movement tick
                ant._path = []          # Recalculate path
                ant._path_timer = 0
        else:
            pile_pos = self.friendly_pile_pos
            if pile_pos is None:
                return  # Pile spot not ready yet; keep wandering

            # Close enough to the pile? Drop off.
            dist = math.hypot(ant.row - (pile_pos[0] + 0.5), ant.col - (pile_pos[1] + 0.5))
            if dist < 1.5:
                # Stamp the pile tiles
                self._stamp_pile(pile_pos[0], pile_pos[1], ANT_PILE_FRIENDLY)

                ant.carrying = False
                ant.carried_tile = None
                ant.target_pos = None
                ant._path = []
                ant._path_timer = 0

                self.friendly_apples += 1
                self.friendly_pile_built = True   # mark as physically present

                self.engine.events.append({"type": "sound", "sound": "score"})

    # ------------------------------------------------------------------
    # Kill API — called by bullet system when a bullet hits an ant
    # ------------------------------------------------------------------

    def hit_ant(self, ant_id: int) -> bool:
        """Deal 1 damage to an ant by id. Returns True if the ant died."""
        for ant in self.ants:
            if ant.id == ant_id and ant.alive:
                ant.hp -= 1
                if ant.hp <= 0:
                    ant.alive = False
                return ant.hp <= 0
        return False

    def _cleanup(self):
        self.ants = [a for a in self.ants if a.alive]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _find_tiles(self, tile_id: int) -> List[Tuple[int, int]]:
        found = []
        for r in range(GRID_HEIGHT):
            for c in range(GRID_WIDTH):
                if self.engine.grid[r][c] == tile_id:
                    found.append((r, c))
        return found

    # ------------------------------------------------------------------
    # External API — called by game_engine / bullet_manager
    # ------------------------------------------------------------------

    def apply_pile_strike(self, r: int, c: int):
        """
        Called externally when a bullet hits the friendly ant pile tile.
        Delegates to _handle_pile_destruction, then clears the pile record.
        """
        self._handle_pile_destruction((r, c))
        self.friendly_pile_pos  = None
        self.friendly_pile_built = False
        self.friendly_apples    = 0
