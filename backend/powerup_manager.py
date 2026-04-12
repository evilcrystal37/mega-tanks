"""
Powerup subsystem extracted from GameEngine.
Handles timed powerup spawning: Money, Sun, Mega Gun, and Letter boxes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .game_engine import GameEngine

from .map_model import GRID_HEIGHT, GRID_WIDTH
from .tile_registry import (
    MONEY_BOX,
    SUN_BOX,
    MEGAGUN_BOX,
    BANANA_BOX,
    CLONE_BOX,
    FIREWORKS_BOX,
    JUMP_BOX,
    RAINBOW_WORLD_BOX,
    AIRPLANE_BOX,
    MAGNET_BOX,
    SAHUR_BOX,
    ZZZ_BOX,
    OCTOPUS_BOX,
    MONEY_BOX_IDS,
    SUN_BOX_IDS,
    MEGAGUN_BOX_IDS,
    LETTER_BOX_IDS,
    LETTER_PAD_IDS,
    EMPTY,
)


# Letter effects with their corresponding box tile IDs
LETTER_EFFECTS = [
    ("banana", BANANA_BOX),
    ("clone", CLONE_BOX),
    ("fireworks", FIREWORKS_BOX),
    ("jump", JUMP_BOX),
    ("rainbow_world", RAINBOW_WORLD_BOX),
    ("airplane", AIRPLANE_BOX),
    ("magnet", MAGNET_BOX),
    ("sahur", SAHUR_BOX),
    ("zzz", ZZZ_BOX),
    ("octopus", OCTOPUS_BOX),
]


class PowerupManager:
    def __init__(self, engine: "GameEngine") -> None:
        self.engine = engine

        # Letter box spawning state
        self._letter_spawn_timer: int = engine.random.randint(720, 1200)  # 12-20 seconds
        self._letter_tile_pos: Optional[tuple[int, int]] = None
        self._letter_tile_timer: int = 0
        self._active_letter_effect: Optional[str] = None

    def tick(self) -> None:
        self.engine._tick_money_tile()
        self.engine._tick_sun_tile()
        self.engine._tick_megagun_tile()
        self._tick_letter_boxes()
        if self.engine.golden_eagle_ticks > 0:
            self.engine.golden_eagle_ticks -= 1
            if self.engine.golden_eagle_ticks == 0:
                self.engine._remove_golden_arch()

    def _tick_letter_boxes(self) -> None:
        """Handle letter box spawning, TTL, and cleanup."""
        # If a letter box is active, count down its timer
        if self._letter_tile_pos is not None:
            self._letter_tile_timer -= 1
            if self._letter_tile_timer <= 0:
                # Remove tile
                r, c = self._letter_tile_pos
                for gr in range(r, r + 2):
                    for gc in range(c, c + 2):
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                            tid = self.engine.grid[gr][gc]
                            if tid in LETTER_BOX_IDS or tid in LETTER_PAD_IDS:
                                self.engine.grid[gr][gc] = EMPTY
                self._letter_tile_pos = None
                self._active_letter_effect = None
                self._letter_spawn_timer = self.engine.random.randint(720, 1200)
        else:
            # Count down spawn timer
            self._letter_spawn_timer -= 1
            if self._letter_spawn_timer <= 0:
                self._spawn_letter_box()

    def _spawn_letter_box(self) -> None:
        """Spawn a random letter box at a valid 2x2 empty spot."""
        # Find valid 2x2 empty blocks
        valid_spots = []
        base_r, base_c = self.engine._base_pos if self.engine._base_pos else (GRID_HEIGHT - 1, GRID_WIDTH // 2)

        for r in range(0, GRID_HEIGHT - 1, 2):
            for c in range(0, GRID_WIDTH - 1, 2):
                # Not too close to base (at least 3 tiles away)
                if abs(r - base_r) < 3 and abs(c - base_c) < 3:
                    continue

                # Check if 2x2 area is completely empty
                is_empty = True
                for gr in range(r, r + 2):
                    for gc in range(c, c + 2):
                        if 0 <= gr < GRID_HEIGHT and 0 <= gc < GRID_WIDTH:
                            if self.engine.grid[gr][gc] != EMPTY:
                                is_empty = False
                                break
                    if not is_empty:
                        break

                if is_empty:
                    valid_spots.append((r, c))

        if valid_spots:
            spot = self.engine.random.choice(valid_spots)
            
            # Filter letter effects based on tile settings
            available_effects = []
            if self.engine._is_banana_enabled():
                available_effects.append(("banana", BANANA_BOX))
            if self.engine._is_clone_enabled():
                available_effects.append(("clone", CLONE_BOX))
            if self.engine._is_fireworks_enabled():
                available_effects.append(("fireworks", FIREWORKS_BOX))
            if self.engine._is_jump_enabled():
                available_effects.append(("jump", JUMP_BOX))
            if self.engine._is_rainbow_world_enabled():
                available_effects.append(("rainbow_world", RAINBOW_WORLD_BOX))
            if self.engine._is_airplane_enabled():
                available_effects.append(("airplane", AIRPLANE_BOX))
            if self.engine._is_magnet_enabled():
                available_effects.append(("magnet", MAGNET_BOX))
            if self.engine._is_sahur_enabled():
                available_effects.append(("sahur", SAHUR_BOX))
            if self.engine._is_zzz_enabled():
                available_effects.append(("zzz", ZZZ_BOX))
            if self.engine._is_octopus_enabled():
                available_effects.append(("octopus", OCTOPUS_BOX))
            
            # If all letters are disabled, fall back to default list
            if not available_effects:
                available_effects = LETTER_EFFECTS
            
            effect_name, box_tile = self.engine.random.choice(available_effects)

            self._letter_tile_pos = spot
            self._letter_tile_timer = 2700  # 45 seconds at 60Hz
            self._active_letter_effect = effect_name

            # Place 2x2 box
            for gr in range(spot[0], spot[0] + 2):
                for gc in range(spot[1], spot[1] + 2):
                    self.engine.grid[gr][gc] = box_tile

            self.engine.events.append({"type": "sound", "sound": "powerup-appear"})
        else:
            # Retry soon if no spot found
            self._letter_spawn_timer = 120
