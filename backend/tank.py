"""
tank.py — Player and Enemy tank entities for Battle Tanks.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import uuid

from .bullet import Bullet, BULLET_SPEED, FAST_BULLET_SPEED

TANK_SPEED = 0.025  # tiles per tick (reduced 3x as requested)


# ---------------------------------------------------------------------------
# Enemy tank types (matching Battle City archetypes)
# ---------------------------------------------------------------------------
ENEMY_TYPES = {
    "basic":  {"hp": 1, "speed": TANK_SPEED,        "color": "#e0e0e0", "label": "Basic"},
    "fast":   {"hp": 1, "speed": TANK_SPEED * 1.8,  "color": "#80cbc4", "label": "Fast"},
    "power":  {"hp": 1, "speed": TANK_SPEED,        "color": "#ef9a9a", "label": "Power"},
    "armor":  {"hp": 4, "speed": TANK_SPEED * 0.8,  "color": "#ffe082", "label": "Armor"},
}


@dataclass
class Tank:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    row: float = 0.0
    col: float = 0.0
    direction: str = "up"
    speed: float = TANK_SPEED
    hp: int = 1
    alive: bool = True
    is_player: bool = False
    upgrade_level: int = 0   # 0-3 (player only)
    fire_cooldown: int = 0   # ticks remaining before next shot allowed
    fire_rate: int = 25      # ticks between shots (lower = faster)
    bullet_limit: int = 1    # max simultaneous bullets on screen
    active_bullets: int = 0  # tracked by engine
    tank_type: str = "basic"
    color: str = "#e0e0e0"

    # Custom bullet speed override (set by engine when using game settings)
    custom_bullet_speed: Optional[float] = None

    # Ice sliding
    slide_dir: Optional[str] = None
    slide_ticks: int = 0

    # AI state
    ai_dir: str = "down"
    ai_timer: int = 0
    
    # Mechanics states
    lava_ticks: int = 0
    airborne_ticks: int = 0
    
    # New buffs
    rainbow_ticks: int = 0
    mushroom_ticks: int = 0
    mega_gun_ticks: int = 0
    is_big: bool = False  # Permanently big (like companion)

    # Letter powerup buffs/debuffs
    clone_ticks: int = 0       # Clone effect duration (player only)
    jump_ticks: int = 0        # Jump ability duration (player only)
    sleep_ticks: int = 0       # Sleep duration (enemies only)

    # Companion support
    companion: Optional['Tank'] = None
    companion_ticks: int = 0
    companion_orbit_angle: float = 0.0

    def can_fire(self) -> bool:
        return self.fire_cooldown <= 0 and self.active_bullets < self.bullet_limit

    def fire(self) -> Optional[Bullet]:
        """Create and return a bullet if able, else None."""
        if not self.can_fire():
            return None
        self.fire_cooldown = self.fire_rate
        self.active_bullets += 1
        power = 2 if self.upgrade_level >= 3 else 1
        if self.custom_bullet_speed is not None:
            speed = self.custom_bullet_speed * (FAST_BULLET_SPEED / BULLET_SPEED) if self.upgrade_level >= 1 else self.custom_bullet_speed
        else:
            speed = FAST_BULLET_SPEED if self.upgrade_level >= 1 else BULLET_SPEED
        # Bullet spawns at front-center of tank
        muzzle = 0.6
        offsets = {
            "up":    (-muzzle,  0.0),
            "down":  ( muzzle,  0.0),
            "left":  ( 0.0, -muzzle),
            "right": ( 0.0,  muzzle),
        }
        dr, dc = offsets.get(self.direction, (-1.0, 0.0))
        return Bullet(
            owner_id=self.id,
            is_player=self.is_player,
            row=self.row + dr,
            col=self.col + dc,
            direction=self.direction,
            speed=speed,
            power=power,
            crush_bricks=self.mushroom_ticks > 0,
        )

    def tick_cooldown(self) -> None:
        if self.fire_cooldown > 0:
            self.fire_cooldown -= 1

    def apply_upgrade(self) -> None:
        """Apply next upgrade level (player tank only)."""
        if self.upgrade_level < 3:
            self.upgrade_level += 1
        if self.upgrade_level >= 2:
            self.bullet_limit = 2
            self.fire_rate = 18

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "row": round(self.row, 3),
            "col": round(self.col, 3),
            "direction": self.direction,
            "hp": self.hp,
            "alive": self.alive,
            "is_player": self.is_player,
            "upgrade_level": self.upgrade_level,
            "tank_type": self.tank_type,
            "color": self.color,
            "lava_ticks": self.lava_ticks,
            "airborne_ticks": self.airborne_ticks,
            "rainbow_ticks": self.rainbow_ticks,
            "mushroom_active": self.mushroom_ticks > 0,
            "mega_gun_active": self.mega_gun_ticks > 0,
            "mega_gun_ticks": self.mega_gun_ticks,
            "is_big": self.is_big,
            "clone_ticks": self.clone_ticks,
            "jump_ticks": self.jump_ticks,
            "sleep_ticks": self.sleep_ticks,
        }


def make_player_tank(row: float, col: float) -> Tank:
    return Tank(
        row=row, col=col,
        direction="up",
        speed=TANK_SPEED,
        hp=1,
        is_player=True,
        fire_rate=25,
        bullet_limit=1,
        color="#f5c518",
    )


def make_enemy_tank(row: float, col: float, tank_type: str = "basic") -> Tank:
    cfg = ENEMY_TYPES.get(tank_type, ENEMY_TYPES["basic"])
    return Tank(
        row=row, col=col,
        direction="down",
        speed=cfg["speed"],
        hp=cfg["hp"],
        is_player=False,
        fire_rate=40,
        bullet_limit=1,
        tank_type=tank_type,
        color=cfg["color"],
    )
