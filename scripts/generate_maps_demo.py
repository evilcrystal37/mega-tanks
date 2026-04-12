#!/usr/bin/env python3
"""
generate_maps_demo.py — Demonstrate advanced map generation algorithms.

Run this script to generate sample maps using different configurations.
"""

import sys
from pathlib import Path

# Run from backend directory
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from map_generator import (
    generate_map,
    generate_symmetric_arena,
    generate_cave_map,
    AdvancedMapGenerator,
    MapGenerationParams,
)
from map_store import save_map
from map_model import GRID_WIDTH, GRID_HEIGHT


def print_grid_summary(grid):
    """Print a summary of tile distribution."""
    tile_counts = {}
    for row in grid:
        for tile_id in row:
            tile_counts[tile_id] = tile_counts.get(tile_id, 0) + 1
    
    print(f"\nTile Distribution:")
    print(f"  Total tiles: {GRID_WIDTH * GRID_HEIGHT}")
    
    from tile_registry import TILE_REGISTRY
    for tile_id, count in sorted(tile_counts.items()):
        if tile_id in TILE_REGISTRY:
            name = TILE_REGISTRY[tile_id].name
            pct = (count / (GRID_WIDTH * GRID_HEIGHT)) * 100
            print(f"  {name:20s}: {count:4d} ({pct:5.1f}%)")
        else:
            print(f"  Unknown ({tile_id}): {count}")


def render_ascii_map(grid, max_rows=42):
    """Render an ASCII representation of the map."""
    from tile_registry import TILE_REGISTRY
    
    # Tile to character mapping
    tile_chars = {
        0: '·',  # Empty
        1: '▒',  # Brick
        2: '█',  # Steel
        3: '≈',  # Water
        4: '♣',  # Forest
        5: '*',  # Ice
        6: '★',  # Base
        7: '♨',  # Lava
        12: '░', # Mud
        13: '/', # Ramp
        14: 'T', # TNT
        15: '"', # Glass
        25: '⌂', # Auto turret
    }
    
    print("\nMap Preview (ASCII):")
    print("┌" + "─" * min(GRID_WIDTH, 80) + "┐")
    
    for i, row in enumerate(grid[:max_rows]):
        line = ""
        for tile_id in row[:80]:  # Limit width for display
            char = tile_chars.get(tile_id, '?')
            line += char
        print(f"│{line}│")
    
    if GRID_WIDTH > 80:
        print(f"│ ... ({GRID_WIDTH - 80} columns truncated) ... │")
    print("└" + "─" * min(GRID_WIDTH, 80) + "┘")


def generate_and_save(name: str, grid, description: str):
    """Generate a map and save it."""
    print(f"\n{'='*60}")
    print(f"Generating: {name}")
    print(f"Description: {description}")
    print(f"{'='*60}")
    
    from map_model import Map
    m = Map(name=name, grid=grid)
    
    errors = m.validate()
    if errors:
        print(f"Validation errors: {errors}")
        return
    
    path = save_map(m)
    print(f"Saved to: {path}")
    
    print_grid_summary(grid)
    render_ascii_map(grid)


def main():
    """Generate multiple demo maps showcasing different algorithms."""
    print("=" * 60)
    print("ADVANCED MAP GENERATION DEMO")
    print("=" * 60)
    print("\nUsing algorithms:")
    print("  • Perlin/Simplex Noise - Natural terrain distribution")
    print("  • Cellular Automata - Organic cave structures")
    print("  • Symmetry Patterns - Balanced competitive layouts")
    print("  • BSP-like Structures - Walls, pillars, corridors")
    print("  • Pathfinding Validation - Ensures playability")
    
    # Map 1: Standard balanced map
    print("\n\n" + "=" * 60)
    print("MAP 1: Balanced Horizontal Symmetry")
    print("=" * 60)
    map1 = generate_map(
        name="GENERATED_BALANCED",
        seed=42,
        symmetry="horizontal",
        terrain_complexity="medium"
    )
    generate_and_save("GENERATED_BALANCED", map1.grid, 
                      "Balanced map with horizontal symmetry, water, forests, and TNT")
    
    # Map 2: Complex arena
    print("\n\n" + "=" * 60)
    print("MAP 2: Complex Arena (Full Symmetry)")
    print("=" * 60)
    map2 = generate_symmetric_arena(name="GENERATED_ARENA", seed=123)
    generate_and_save("GENERATED_ARENA", map2.grid,
                      "Competitive arena with full symmetry and complex terrain")
    
    # Map 3: Cave system
    print("\n\n" + "=" * 60)
    print("MAP 3: Organic Cave System")
    print("=" * 60)
    map3 = generate_cave_map(name="GENERATED_CAVES", seed=456)
    generate_and_save("GENERATED_CAVES", map3.grid,
                      "Organic cave-like structures using cellular automata")
    
    # Map 4: Simple open map
    print("\n\n" + "=" * 60)
    print("MAP 4: Simple Open Terrain")
    print("=" * 60)
    map4 = generate_map(
        name="GENERATED_OPEN",
        seed=789,
        symmetry="horizontal",
        terrain_complexity="simple"
    )
    generate_and_save("GENERATED_OPEN", map4.grid,
                      "Open terrain with minimal obstacles, good for fast gameplay")
    
    # Map 5: Custom complex with all features
    print("\n\n" + "=" * 60)
    print("MAP 5: Complex with All Features")
    print("=" * 60)
    params = MapGenerationParams(
        seed=999,
        symmetry="both",
        terrain_scale=18.0,
        cave_density=0.5,
        water_bodies=True,
        forest_patches=True,
        ice_regions=True,
        lava_pools=True,
        tnt_scatter=True,
        auto_turrets=True,
        base_protection=4,
    )
    generator = AdvancedMapGenerator(params)
    map5 = generator.generate(name="GENERATED_COMPLEX")
    generate_and_save("GENERATED_COMPLEX", map5.grid,
                      "Maximum complexity with all terrain types and features")
    
    print("\n\n" + "=" * 60)
    print("GENERATION COMPLETE!")
    print("=" * 60)
    print(f"\nGenerated maps saved to: maps/")
    print("\nTo view maps:")
    print("  1. Start the backend server")
    print("  2. Open the map editor in browser")
    print("  3. Load any 'GENERATED_*' map")
    print("\nOr use API:")
    print("  POST /api/maps/generate")
    print("  {")
    print('    "style": "normal|arena|cave",')
    print('    "complexity": "simple|medium|complex",')
    print('    "symmetry": "none|horizontal|vertical|both"')
    print("  }")


if __name__ == "__main__":
    main()
