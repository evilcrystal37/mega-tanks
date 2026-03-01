"""
Sandworm subsystem extracted from GameEngine.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game_engine import GameEngine


class SandwormController:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine

    def tick(self) -> None:
        self.engine._tick_sandworm()
