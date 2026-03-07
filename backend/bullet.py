"""
bullet.py — Bullet entity for Battle Tanks.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import math
import uuid


BULLET_SPEED = 0.28  # tiles per tick (reduced 0.7x as requested)
FAST_BULLET_SPEED = 0.42
MISSILE_SPEED = 0.25


@dataclass
class Bullet:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    owner_id: str = ""         # tank id that fired this bullet
    is_player: bool = True     # True = player bullet, False = enemy bullet
    row: float = 0.0
    col: float = 0.0
    direction: str = "up"      # up / down / left / right
    speed: float = BULLET_SPEED
    power: int = 1             # 1 = destroys brick; 2 = destroys steel (star lvl 3)
    ttl: int = 240             # ticks to live (prevents indefinite bullet lockout)
    alive: bool = True
    crush_bricks: bool = False # from mushroom buff

    is_grenade: bool = False
    is_missile: bool = False
    target_row: Optional[float] = None
    target_col: Optional[float] = None
    start_row: Optional[float] = None
    start_col: Optional[float] = None
    max_range: float = 7.0  # grenades explode after this many tiles

    def tick(self) -> None:
        """Advance bullet position by one tick."""
        if not self.alive:
            return
        self.ttl -= 1
        if self.ttl <= 0:
            self.alive = False
            return

        if self.is_grenade and self.start_row is not None and self.start_col is not None:
            dist = math.hypot(self.row - self.start_row, self.col - self.start_col)
            if dist >= self.max_range:
                self.alive = False
                return

        if self.is_missile and self.target_row is not None and self.target_col is not None:
            dr = self.target_row - self.row
            dc = self.target_col - self.col
            dist = math.hypot(dr, dc)
            if dist < self.speed:
                self.row = self.target_row
                self.col = self.target_col
            else:
                self.row += (dr / dist) * self.speed
                self.col += (dc / dist) * self.speed
                if abs(dr) > abs(dc):
                    self.direction = "down" if dr > 0 else "up"
                else:
                    self.direction = "right" if dc > 0 else "left"
            return

        if self.direction == "up":
            self.row -= self.speed
        elif self.direction == "down":
            self.row += self.speed
        elif self.direction == "left":
            self.col -= self.speed
        elif self.direction == "right":
            self.col += self.speed

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "owner_id": self.owner_id,
            "is_player": self.is_player,
            "row": round(self.row, 3),
            "col": round(self.col, 3),
            "direction": self.direction,
            "alive": self.alive,
            "crush_bricks": self.crush_bricks,
            "is_grenade": self.is_grenade,
            "is_missile": self.is_missile,
        }
