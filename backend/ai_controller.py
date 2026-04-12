"""
AI subsystem extracted from GameEngine.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game_engine import GameEngine


class AIController:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine

    def tick_enemies(self) -> None:
        for enemy in list(self.engine.enemies.values()):
            if enemy.alive:
                # Z — Sleep: skip AI if sleeping
                if enemy.sleep_ticks > 0:
                    enemy.sleep_ticks -= 1
                    continue
                enemy.tick_cooldown()
                self.engine._ai_tick(enemy)

    def tick_companions(self) -> None:
        for tank in self.engine._get_all_tanks(alive_only=True):
            if tank.companion and tank.companion.alive:
                tank.companion.tick_cooldown()
                self.engine._ai_tick_companion(tank.companion, tank)
                if tank.companion_ticks > 0:
                    tank.companion_ticks -= 1
                if tank.companion_ticks <= 0:
                    tank.companion = None

    def tick_turrets(self) -> None:
        self.engine._tick_turrets()
