"""
map_model.py — Map data model and serialization.

A Map is a GRID_WIDTH × GRID_HEIGHT grid of tile IDs.
Each cell stores an integer corresponding to a TileType.id in tile_registry.py.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List

try:
    from .tile_registry import TILE_REGISTRY, get_tile
except ImportError:
    from tile_registry import TILE_REGISTRY, get_tile

GRID_HEIGHT = 42
GRID_WIDTH = 64


def create_default_grid():
    """Create a grid with the Base (2×2 big-type) and shielding bricks pre-placed.
    Bricks must not overlap the base footprint (mid..mid+1, bottom-1..bottom)."""
    grid = [[0] * GRID_WIDTH for _ in range(GRID_HEIGHT)]
    mid_x = GRID_WIDTH // 2
    bottom_y = GRID_HEIGHT - 1
    # Base (Eagle) — 2×2 big-type spans (mid, mid+1) × (bottom-1, bottom)
    grid[bottom_y][mid_x] = 6
    # Surround with bricks — avoid base footprint
    grid[bottom_y][mid_x - 1] = 1   # West
    grid[bottom_y][mid_x + 2] = 1   # East
    grid[bottom_y - 1][mid_x - 1] = 1   # Northwest
    grid[bottom_y - 1][mid_x + 2] = 1   # Northeast
    grid[bottom_y - 2][mid_x - 1] = 1   # Row above
    grid[bottom_y - 2][mid_x] = 1
    grid[bottom_y - 2][mid_x + 1] = 1
    grid[bottom_y - 2][mid_x + 2] = 1
    return grid


@dataclass
class Map:
    name: str
    grid: List[List[int]] = field(default_factory=create_default_grid)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    modified_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    def validate(self) -> List[str]:
        errors = []
        if len(self.grid) != GRID_HEIGHT:
            errors.append(f"Grid must have exactly {GRID_HEIGHT} rows")
        for r, row in enumerate(self.grid):
            if len(row) != GRID_WIDTH:
                errors.append(f"Row {r} must have exactly {GRID_WIDTH} columns")
        
        # Check base count (must be exactly 1)
        base_count = sum(row.count(6) for row in self.grid)
        if base_count != 1:
            errors.append(f"Map must have exactly one Base tile (has {base_count})")

        return errors

    def is_valid(self) -> bool:
        return len(self.validate()) == 0

    # ------------------------------------------------------------------
    # Tile helpers
    # ------------------------------------------------------------------
    def get_tile_id(self, row: int, col: int) -> int:
        if 0 <= row < GRID_HEIGHT and 0 <= col < GRID_WIDTH:
            return self.grid[row][col]
        return -1  # out of bounds

    def set_tile(self, row: int, col: int, tile_id: int) -> None:
        if 0 <= row < GRID_HEIGHT and 0 <= col < GRID_WIDTH:
            if tile_id in TILE_REGISTRY:
                self.grid[row][col] = tile_id
                self.modified_at = datetime.now(timezone.utc).isoformat()

    def find_base(self) -> tuple[int, int] | None:
        """Return (row, col) of the Base tile, or None."""
        for r, row in enumerate(self.grid):
            for c, tile_id in enumerate(row):
                if get_tile(tile_id).is_base:
                    return (r, c)
        return None

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "grid": self.grid,
            "created_at": self.created_at,
            "modified_at": self.modified_at,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_dict(cls, data: dict) -> 'Map':
        grid = data.get("grid")
        if not grid or len(grid) != GRID_HEIGHT or any(len(r) != GRID_WIDTH for r in grid):
            grid = create_default_grid()
        
        # Create Map instance, letting default_factory handle created_at/modified_at if not in data
        m = cls(name=data["name"], grid=grid)
        if "created_at" in data:
            m.created_at = data["created_at"]
        if "modified_at" in data:
            m.modified_at = data["modified_at"]
        return m

    @classmethod
    def from_json(cls, raw: str) -> "Map":
        return cls.from_dict(json.loads(raw))
