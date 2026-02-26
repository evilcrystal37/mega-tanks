"""
mode_registry.py — Extensible game mode definitions.

To add a new mode:
1. Subclass GameMode and implement start(), on_tick(), on_end().
2. Register it in MODE_REGISTRY with a unique string key.
"""

from abc import ABC, abstractmethod
from typing import Dict, TYPE_CHECKING

if TYPE_CHECKING:
    from .game_engine import GameEngine


class GameMode(ABC):
    """Base class for a game mode."""

    name: str = "unknown"
    label: str = "Unknown Mode"
    description: str = ""

    def on_start(self, engine: "GameEngine") -> None:
        """Called once when a game session starts."""
        pass

    def on_tick(self, engine: "GameEngine") -> None:
        """Called every game tick after normal engine processing."""
        pass

    def on_end(self, engine: "GameEngine", result: str) -> None:
        """Called when the game ends. result is 'victory' or 'defeat'."""
        pass


class ConstructionPlayMode(GameMode):
    """
    Default mode: Player constructs a map then plays it.
    - 20 enemy tanks spawn from the top border.
    - Win: destroy all 20 enemies.
    - Lose: base is destroyed or all lives lost.
    """

    name = "construction_play"
    label = "Construction + Play"
    description = "Build your map, then defend your base against 20 enemy tanks."

    TOTAL_ENEMIES = 20
    PLAYER_LIVES = 3

    def on_start(self, engine: "GameEngine") -> None:
        engine.total_enemies = self.TOTAL_ENEMIES
        engine.enemies_remaining = self.TOTAL_ENEMIES
        engine.player_lives = self.PLAYER_LIVES

    def on_tick(self, engine: "GameEngine") -> None:
        pass  # all logic handled by engine

    def on_end(self, engine: "GameEngine", result: str) -> None:
        pass


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
MODE_REGISTRY: Dict[str, GameMode] = {
    ConstructionPlayMode.name: ConstructionPlayMode(),
    # Future modes added here, e.g.:
    # "survival": SurvivalMode(),
    # "time_attack": TimeAttackMode(),
    # "coop_ai": CoopAIMode(),
}


def get_mode(name: str) -> GameMode:
    if name not in MODE_REGISTRY:
        raise KeyError(f"Unknown game mode: '{name}'. Available: {list(MODE_REGISTRY)}")
    return MODE_REGISTRY[name]
