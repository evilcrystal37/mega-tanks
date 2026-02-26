"""
ai_interface.py — Abstract AI agent interface for future co-op/enemy AI.

To implement a custom AI agent:
1. Subclass AIAgent and implement the decide() method.
2. Register it in mode_registry.py or inject it into the game engine.
"""

from abc import ABC, abstractmethod
from typing import Any


class AIAgent(ABC):
    """Base class for AI-controlled tank agents."""

    @abstractmethod
    def decide(self, game_state: dict) -> dict:
        """
        Given the current game_state snapshot, return an action dict.

        game_state keys (subset):
            - "tanks": list of tank state dicts
            - "bullets": list of bullet state dicts
            - "grid": 2D list of tile IDs
            - "agent_id": str — this agent's tank ID in the state

        Returns action dict:
            {
                "direction": "up"|"down"|"left"|"right"|None,
                "fire": bool
            }
        """
        ...

    def reset(self) -> None:
        """Called when a new game starts. Override to reset internal state."""
        pass


class DoNothingAgent(AIAgent):
    """Stub agent that does nothing — useful as a placeholder."""

    def decide(self, game_state: dict) -> dict:
        return {"direction": None, "fire": False}


class PatrolAgent(AIAgent):
    """
    Simple rule-based enemy AI:
    - Moves toward the base most of the time.
    - Randomly changes direction when stuck.
    - Fires frequently.
    """

    def __init__(self) -> None:
        self._stuck_counter = 0
        self._current_dir = "down"

    def reset(self) -> None:
        self._stuck_counter = 0
        self._current_dir = "down"

    def decide(self, game_state: dict) -> dict:
        import random

        agent_id = game_state.get("agent_id")
        tanks = game_state.get("tanks", [])
        base_pos = game_state.get("base_pos")  # {"row": r, "col": c}

        me = next((t for t in tanks if t.get("id") == agent_id), None)
        if me is None or base_pos is None:
            return {"direction": None, "fire": False}

        # Bias toward base
        dr = base_pos["row"] - me["row"]
        dc = base_pos["col"] - me["col"]

        if abs(dr) > abs(dc):
            preferred = "down" if dr > 0 else "up"
        else:
            preferred = "right" if dc > 0 else "left"

        # Occasionally randomize to avoid getting stuck
        if random.random() < 0.1:
            preferred = random.choice(["up", "down", "left", "right"])

        return {"direction": preferred, "fire": random.random() < 0.3}
