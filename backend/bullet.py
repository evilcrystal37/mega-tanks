"""
bullet.py — Bullet entity for Battle Tanks.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import uuid


BULLET_SPEED = 0.28  # tiles per tick (reduced 0.7x as requested)
FAST_BULLET_SPEED = 0.42


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

    def tick(self) -> None:
        """Advance bullet position by one tick."""
        if not self.alive:
            return
        self.ttl -= 1
        if self.ttl <= 0:
            self.alive = False
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
        }
