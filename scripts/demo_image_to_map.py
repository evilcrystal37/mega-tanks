#!/usr/bin/env python3
"""
demo_image_to_map.py — Demo script for image-to-map conversion.

Creates sample test images and converts them to Battle Tanks maps
using different styles and configurations.
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from PIL import Image, ImageDraw
import numpy as np
from image_to_map import (
    convert_image_to_map, 
    ImageConversionParams, 
    ImageToMapConverter
)
from map_store import save_map


def create_test_image_lake() -> Image.Image:
    """Create a test image with a lake scene."""
    width, height = 256, 192
    img = Image.new('RGB', (width, height), color='skyblue')
    draw = ImageDraw.Draw(img)
    
    # Water (blue rectangle at bottom)
    draw.rectangle([0, height // 2, width, height], fill='darkblue')
    
    # Forest (green area on left)
    draw.rectangle([0, 0, width // 3, height // 2], fill='darkgreen')
    
    # Land (brown/tan area on right)
    draw.rectangle([width // 2, 0, width, height // 2], fill='sandybrown')
    
    # Some rocks (gray circles)
    draw.ellipse([80, 80, 120, 120], fill='gray')
    draw.ellipse([150, 60, 180, 90], fill='darkgray')
    
    # Ice patch (light blue/white)
    draw.ellipse([200, 100, 240, 130], fill='lightcyan')
    
    return img


def create_test_image_arena() -> Image.Image:
    """Create a test image with arena-like structures."""
    width, height = 256, 192
    img = Image.new('RGB', (width, height), color='black')
    draw = ImageDraw.Draw(img)
    
    # Central arena (tan)
    draw.rectangle([64, 48, 192, 144], fill='sandybrown')
    
    # Border walls (gray)
    draw.rectangle([0, 0, width, 20], fill='gray')
    draw.rectangle([0, height - 20, width, height], fill='gray')
    draw.rectangle([0, 0, 20, height], fill='gray')
    draw.rectangle([width - 20, 0, width, height], fill='gray')
    
    # Pillars (dark gray circles)
    for x in [50, 100, 150, 200]:
        for y in [50, 100, 150]:
            draw.ellipse([x - 10, y - 10, x + 10, y + 10], fill='dimgray')
    
    # Water features (blue)
    draw.rectangle([10, 50, 40, 140], fill='blue')
    draw.rectangle([width - 40, 50, width - 10, 140], fill='blue')
    
    return img


def create_test_image_natural() -> Image.Image:
    """Create a natural landscape test image."""
    width, height = 256, 192
    img = Image.new('RGB', (width, height), color='lightgreen')
    draw = ImageDraw.Draw(img)
    
    # Create natural-looking features using noise-like patterns
    
    # River (winding blue path)
    points = [(0, 100)]
    for x in range(0, width, 20):
        y = 100 + np.sin(x / 30) * 30 + np.random.randint(-10, 10)
        points.append((x, int(y)))
    
    # Draw river
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        draw.line([x1, y1, x2, y2], fill='blue', width=20)
    
    # Forest patches (dark green ellipses)
    for _ in range(8):
        x = np.random.randint(0, width)
        y = np.random.randint(0, height)
        rx = np.random.randint(15, 30)
        ry = np.random.randint(10, 20)
        draw.ellipse([x - rx, y - ry, x + rx, y + ry], fill='forestgreen')
    
    # Rocky areas (gray patches)
    for _ in range(5):
        x = np.random.randint(0, width)
        y = np.random.randint(0, height)
        rx = np.random.randint(10, 20)
        ry = np.random.randint(8, 15)
        draw.ellipse([x - rx, y - ry, x + rx, y + ry], fill='gray')
    
    # Lava pool (red/orange) - top right
    draw.ellipse([width - 60, 20, width - 10, 60], fill='orangered')
    
    return img


def print_map_preview(grid, title: str = "Map Preview"):
    """Print ASCII preview of the map."""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")
    
    # Tile characters
    tile_chars = {
        0: '·',  # EMPTY
        1: '▒',  # BRICK
        2: '█',  # STEEL
        3: '≈',  # WATER
        4: '♣',  # FOREST
        5: '*',  # ICE
        6: '★',  # BASE
        7: '♨',  # LAVA
        8: '░',  # MUD
        9: '/',  # RAMP
        10: 'T', # TNT
        11: '"', # GLASS
        12: '⌂', # AUTO_TURRET
    }
    
    # Print grid (downsampled for display)
    height = len(grid)
    width = len(grid[0])
    
    # Downsample by factor of 2 for better terminal display
    step = 2
    for y in range(0, height, step):
        row = ""
        for x in range(0, width, step):
            tile = grid[y][x]
            char = tile_chars.get(tile, '?')
            row += char
        print(row)
    
    print(f"{'=' * 60}")
    print(f"Grid size: {width}x{height}")
    print(f"Legend: ·=Empty ▒=Brick █=Steel ≈=Water ♣=Forest")
    print(f"        *=Ice ★=Base ♨=Lava ░=Mud /=Ramp T=TNT")
    print(f'        " =Glass ⌂=AutoTurret')
    print(f"{'=' * 60}\n")


def count_tiles(grid) -> dict:
    """Count tile types in grid."""
    from tile_registry import (
        EMPTY, BRICK, STEEL, WATER, FOREST, ICE, BASE, LAVA,
        MUD, RAMP, TNT, GLASS, AUTO_TURRET,
    )
    
    counts = {
        'empty': 0, 'brick': 0, 'steel': 0, 'water': 0,
        'forest': 0, 'ice': 0, 'base': 0, 'lava': 0,
        'mud': 0, 'ramp': 0, 'tnt': 0, 'glass': 0,
        'auto_turret': 0, 'other': 0
    }
    
    for row in grid:
        for tile in row:
            if tile == EMPTY:
                counts['empty'] += 1
            elif tile == BRICK:
                counts['brick'] += 1
            elif tile == STEEL:
                counts['steel'] += 1
            elif tile == WATER:
                counts['water'] += 1
            elif tile == FOREST:
                counts['forest'] += 1
            elif tile == ICE:
                counts['ice'] += 1
            elif tile == BASE:
                counts['base'] += 1
            elif tile == LAVA:
                counts['lava'] += 1
            elif tile == MUD:
                counts['mud'] += 1
            elif tile == RAMP:
                counts['ramp'] += 1
            elif tile == TNT:
                counts['tnt'] += 1
            elif tile == GLASS:
                counts['glass'] += 1
            elif tile == AUTO_TURRET:
                counts['auto_turret'] += 1
            else:
                counts['other'] += 1
    
    return counts


def demo_conversion(image: Image.Image, image_name: str, output_dir: Path):
    """Demo conversion with different styles."""
    print(f"\n{'#' * 70}")
    print(f"# Converting: {image_name}")
    print(f"{'#' * 70}")
    
    styles = ['balanced', 'faithful', 'playable', 'decorative']
    
    for style in styles:
        print(f"\n>>> Style: {style.upper()}")
        
        try:
            # Convert image to map
            map_obj = convert_image_to_map(
                image,
                name=f"{image_name}_{style.upper()}",
                symmetry="horizontal",
                style=style
            )
            
            # Print preview
            print_map_preview(map_obj.grid, f"{image_name} - {style.upper()}")
            
            # Count tiles
            counts = count_tiles(map_obj.grid)
            total = sum(counts.values())
            
            print("Tile distribution:")
            for tile_type, count in counts.items():
                if count > 0:
                    pct = count / total * 100
                    print(f"  {tile_type:15}: {count:4} ({pct:5.1f}%)")
            
            # Save map
            output_path = save_map(map_obj)
            print(f"✓ Saved to: {output_path}")
            
        except Exception as e:
            print(f"✗ Error: {e}")
            import traceback
            traceback.print_exc()


def main():
    """Run the demo."""
    print("=" * 70)
    print("  BATTLE TANKS - Image-to-Map Conversion Demo")
    print("=" * 70)
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / "maps" / "image_generated"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Create and convert test images
    test_images = [
        (create_test_image_lake(), "LAKE_SCENE"),
        (create_test_image_arena(), "ARENA_LAYOUT"),
        (create_test_image_natural(), "NATURAL_LANDSCAPE"),
    ]
    
    for image, name in test_images:
        # Save test image
        image_path = output_dir / f"{name}.png"
        image.save(image_path)
        print(f"\n✓ Created test image: {image_path}")
        
        # Convert with different styles
        demo_conversion(image, name, output_dir)
    
    print("\n" + "=" * 70)
    print("  Demo Complete!")
    print("=" * 70)
    print(f"\nGenerated maps saved to: {output_dir}")
    print("\nTo use in the game:")
    print("  1. Start the backend server")
    print("  2. Load any generated map via the API or map editor")
    print("  3. Enjoy your image-generated maps!")
    print("\nAPI Usage:")
    print("  POST /api/maps/from-image")
    print("  - Upload an image file")
    print("  - Specify style: balanced, faithful, playable, or decorative")
    print("  - Specify symmetry: none, horizontal, vertical, both")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
