"""
Powerup subsystem extracted from GameEngine.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game_engine import GameEngine


class PowerupManager:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine

    def tick(self) -> None:
        self.engine._tick_money_tile()
        self.engine._tick_sun_tile()
        self.engine._tick_megagun_tile()
        if self.engine.golden_eagle_ticks > 0:
            self.engine.golden_eagle_ticks -= 1
            if self.engine.golden_eagle_ticks == 0:
                self.engine._remove_golden_arch()
