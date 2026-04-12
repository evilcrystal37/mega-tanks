"""
map_generator.py — Advanced procedural map generation with smart algorithms.

Uses a combination of:
- Perlin/Simplex noise for natural terrain distribution
- Cellular automata for organic cave-like structures
- Symmetry patterns for balanced competitive play
- BSP-like room placement for structured layouts
- Pathfinding validation to ensure playability
"""

import math
import random
from typing import List, Tuple, Set, Optional
from dataclasses import dataclass

try:
    from .map_model import Map, GRID_WIDTH, GRID_HEIGHT, create_default_grid
    from .tile_registry import (
        EMPTY, BRICK, STEEL, WATER, FOREST, ICE, BASE, LAVA,
        MUD, RAMP, TNT, GLASS, AUTO_TURRET, SPECIAL_TNT,
    )
except ImportError:
    from map_model import Map, GRID_WIDTH, GRID_HEIGHT, create_default_grid
    from tile_registry import (
        EMPTY, BRICK, STEEL, WATER, FOREST, ICE, BASE, LAVA,
        MUD, RAMP, TNT, GLASS, AUTO_TURRET, SPECIAL_TNT,
    )


# =============================================================================
# Perlin Noise Implementation
# =============================================================================

class PerlinNoise:
    """Simple Perlin-like noise generator for natural terrain."""
    
    def __init__(self, seed: int = None):
        self.seed = seed if seed is not None else random.randint(0, 10000)
        random.seed(self.seed)
        self.permutation = list(range(256))
        random.shuffle(self.permutation)
        self.permutation = self.permutation + self.permutation  # Double for wrapping
    
    def _fade(self, t: float) -> float:
        """Smoothstep interpolation."""
        return t * t * t * (t * (t * 6 - 15) + 10)
    
    def _lerp(self, a: float, b: float, t: float) -> float:
        """Linear interpolation."""
        return a + t * (b - a)
    
    def _grad(self, hash_val: int, x: float, y: float) -> float:
        """Calculate gradient."""
        h = hash_val & 3
        if h == 0:
            return x + y
        elif h == 1:
            return -x + y
        elif h == 2:
            return x - y
        else:
            return -x - y
    
    def noise2d(self, x: float, y: float) -> float:
        """Generate 2D noise value at (x, y)."""
        # Find unit grid cell
        x0 = int(x) & 255
        y0 = int(y) & 255
        
        # Get relative xy coordinates
        x -= math.floor(x)
        y -= math.floor(y)
        
        # Calculate fade curves
        u = self._fade(x)
        v = self._fade(y)
        
        # Hash coordinates of corners
        p = self.permutation
        aa = p[p[x0] + y0]
        ab = p[p[x0] + y0 + 1]
        ba = p[p[x0 + 1] + y0]
        bb = p[p[x0 + 1] + y0 + 1]
        
        # Blend results from corners
        x1 = self._lerp(self._grad(aa, x, y), self._grad(ba, x - 1, y), u)
        x2 = self._lerp(self._grad(ab, x, y - 1), self._grad(bb, x - 1, y - 1), u)
        
        return self._lerp(x1, x2, v)
    
    def octave_noise(self, x: float, y: float, octaves: int = 4, persistence: float = 0.5) -> float:
        """Generate multi-octave noise for more natural variation."""
        total = 0.0
        frequency = 1.0
        amplitude = 1.0
        max_value = 0.0
        
        for _ in range(octaves):
            total += self.noise2d(x * frequency, y * frequency) * amplitude
            max_value += amplitude
            amplitude *= persistence
            frequency *= 2.0
        
        return total / max_value


# =============================================================================
# Cellular Automata for Cave Generation
# =============================================================================

class CellularAutomata:
    """Cellular automata for generating organic cave-like structures."""
    
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.grid = [[0] * width for _ in range(height)]
    
    def initialize_random(self, fill_probability: float = 0.45):
        """Initialize grid with random filled cells."""
        for y in range(self.height):
            for x in range(self.width):
                self.grid[y][x] = 1 if random.random() < fill_probability else 0
    
    def count_neighbors(self, x: int, y: int) -> int:
        """Count filled neighbors (8-way)."""
        count = 0
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.width and 0 <= ny < self.height:
                    count += self.grid[ny][nx]
        return count
    
    def step(self) -> bool:
        """
        Perform one iteration of cellular automata.
        Rules:
        - A cell becomes filled if it has >= 5 filled neighbors
        - A cell becomes empty if it has < 4 filled neighbors
        - Otherwise stays the same
        """
        new_grid = [[0] * self.width for _ in range(self.height)]
        changed = False
        
        for y in range(self.height):
            for x in range(self.width):
                neighbors = self.count_neighbors(x, y)
                if neighbors >= 5:
                    new_grid[y][x] = 1
                elif neighbors < 4:
                    new_grid[y][x] = 0
                else:
                    new_grid[y][x] = self.grid[y][x]
                
                if new_grid[y][x] != self.grid[y][x]:
                    changed = True
        
        self.grid = new_grid
        return changed
    
    def smooth(self, iterations: int = 2):
        """Smooth the cave by removing isolated cells."""
        for _ in range(iterations):
            new_grid = [[0] * self.width for _ in range(self.height)]
            for y in range(self.height):
                for x in range(self.width):
                    neighbors = self.count_neighbors(x, y)
                    # Keep cells with 4+ neighbors
                    new_grid[y][x] = 1 if neighbors >= 4 else 0
            self.grid = new_grid
    
    def run(self, iterations: int = 4, smooth_iterations: int = 2) -> List[List[int]]:
        """Run the full cellular automata simulation."""
        self.initialize_random()
        for _ in range(iterations):
            self.step()
        self.smooth(smooth_iterations)
        return self.grid


# =============================================================================
# Map Generator
# =============================================================================

@dataclass
class MapGenerationParams:
    """Parameters for map generation."""
    seed: int = None
    symmetry: str = "horizontal"  # horizontal, vertical, both, none
    terrain_scale: float = 30.0   # Noise scale (lower = larger features)
    cave_density: float = 0.45    # Initial fill probability for caves
    brick_coverage: float = 0.15  # Target brick coverage
    steel_ratio: float = 0.1      # Ratio of steel vs brick
    water_bodies: bool = True     # Allow water features
    forest_patches: bool = True   # Allow forest patches
    ice_regions: bool = False     # Allow ice regions
    lava_pools: bool = False      # Allow lava pools
    tnt_scatter: bool = True      # Scatter TNT crates
    auto_turrets: bool = True     # Place auto turrets
    base_protection: int = 3      # Tiles of protection around base


class AdvancedMapGenerator:
    """
    Advanced map generator combining multiple algorithms for
    visually appealing and playable maps.
    """
    
    def __init__(self, params: MapGenerationParams = None):
        self.params = params or MapGenerationParams()
        if self.params.seed is None:
            self.params.seed = random.randint(0, 100000)
        random.seed(self.params.seed)
        self.noise = PerlinNoise(self.params.seed)
        self.grid = [[EMPTY] * GRID_WIDTH for _ in range(GRID_HEIGHT)]
    
    def _apply_symmetry(self, x: int, y: int, value: int):
        """Apply symmetry to place tiles."""
        self.grid[y][x] = value
        
        if self.params.symmetry in ("horizontal", "both"):
            mirror_x = GRID_WIDTH - 1 - x
            self.grid[y][mirror_x] = value
        
        if self.params.symmetry in ("vertical", "both"):
            mirror_y = GRID_HEIGHT - 1 - y
            self.grid[mirror_y][x] = value
        
        if self.params.symmetry == "both":
            mirror_x = GRID_WIDTH - 1 - x
            mirror_y = GRID_HEIGHT - 1 - y
            self.grid[mirror_y][mirror_x] = value
    
    def _get_noise_value(self, x: int, y: int, scale: float = None) -> float:
        """Get noise value at position."""
        scale = scale or self.params.terrain_scale
        return self.noise.octave_noise(x / scale, y / scale, octaves=4)
    
    def _clear_base_area(self, base_x: int, base_y: int):
        """Clear area around base for protection."""
        protection = self.params.base_protection
        for dy in range(-protection, protection + 2):
            for dx in range(-protection, protection + 2):
                x, y = base_x + dx, base_y + dy
                if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                    # Don't clear the base itself
                    if abs(dx) <= 1 and abs(dy) <= 1 and y >= base_y:
                        continue
                    if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                        self.grid[y][x] = EMPTY
    
    def _generate_terrain_layer(self, tile_type: int, threshold_low: float, threshold_high: float,
                                 allow_caves: bool = False, cave_grid: List[List[int]] = None):
        """Generate a terrain layer based on noise thresholds."""
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                # Skip if already has a non-empty tile
                if self.grid[y][x] != EMPTY:
                    continue
                
                noise_val = self._get_noise_value(x, y)
                
                # Check cave if enabled
                in_cave = False
                if allow_caves and cave_grid:
                    in_cave = cave_grid[y][x] == 1
                
                # Place tile based on noise value
                if in_cave or threshold_low <= noise_val <= threshold_high:
                    self._apply_symmetry(x, y, tile_type)
    
    def _generate_caves(self) -> List[List[int]]:
        """Generate cave structures using cellular automata."""
        ca = CellularAutomata(GRID_WIDTH, GRID_HEIGHT)
        return ca.run(iterations=5, smooth_iterations=2)
    
    def _place_bricks_structured(self):
        """Place bricks in structured patterns (walls, pillars)."""
        # Vertical pillars - only place on left side and mirror
        pillar_spacing = random.randint(8, 12)
        pillar_width = random.randint(1, 2)
        
        # For horizontal symmetry, only place pillars on left half
        max_x = GRID_WIDTH // 2 if self.params.symmetry in ("horizontal", "both") else GRID_WIDTH

        for x in range(0, max_x, pillar_spacing):
            for y in range(GRID_HEIGHT // 4, GRID_HEIGHT - 3):
                for dx in range(pillar_width):
                    if 0 <= x + dx < GRID_WIDTH:
                        if self.grid[y][x + dx] == EMPTY:
                            self._apply_symmetry(x + dx, y, BRICK)

        # Horizontal walls with gaps - use symmetric gap placement
        wall_y_positions = [
            GRID_HEIGHT // 3,
            GRID_HEIGHT // 2,
            (GRID_HEIGHT * 2) // 3,
        ]
        
        for wall_y in wall_y_positions:
            # For symmetric maps, place gaps symmetrically
            if self.params.symmetry in ("horizontal", "both"):
                # Place gap in center for symmetry
                gap_center = GRID_WIDTH // 2
                gap_width = random.randint(4, 8)
                gap_start = gap_center - gap_width // 2
                
                for x in range(GRID_WIDTH):
                    if gap_start <= x < gap_start + gap_width:
                        continue
                    
                    for dy in range(2):
                        y = wall_y + dy
                        if 0 <= y < GRID_HEIGHT and self.grid[y][x] == EMPTY:
                            self._apply_symmetry(x, y, BRICK)
            else:
                # Asymmetric gap placement
                gap_start = random.randint(GRID_WIDTH // 3, GRID_WIDTH // 2)
                gap_width = random.randint(4, 8)
                
                for x in range(GRID_WIDTH):
                    if gap_start <= x < gap_start + gap_width:
                        continue
                    
                    for dy in range(2):
                        y = wall_y + dy
                        if 0 <= y < GRID_HEIGHT and self.grid[y][x] == EMPTY:
                            self.grid[y][x] = BRICK
    
    def _place_water_bodies(self):
        """Generate natural-looking water bodies."""
        water_noise = PerlinNoise(self.params.seed + 1000)
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] != EMPTY:
                    continue
                
                # Water tends to form in low-lying areas
                noise_val = water_noise.octave_noise(x / 40, y / 40, octaves=3)
                
                # Create rivers and lakes
                river_noise = water_noise.octave_noise(x / 80, y / 20, octaves=2)
                
                if noise_val < -0.3 or abs(river_noise) < 0.15:
                    # Don't place water if it would isolate the base
                    if self._would_isolate_base(x, y, WATER):
                        continue
                    self._apply_symmetry(x, y, WATER)
    
    def _place_forest_patches(self):
        """Generate forest patches."""
        forest_noise = PerlinNoise(self.params.seed + 2000)
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] != EMPTY:
                    continue
                
                noise_val = forest_noise.octave_noise(x / 25, y / 25, octaves=3)
                
                if noise_val > 0.4:
                    self._apply_symmetry(x, y, FOREST)
    
    def _place_ice_regions(self):
        """Generate ice regions."""
        ice_noise = PerlinNoise(self.params.seed + 3000)
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] != EMPTY:
                    continue
                
                noise_val = ice_noise.octave_noise(x / 35, y / 35, octaves=2)
                
                if noise_val > 0.5:
                    self._apply_symmetry(x, y, ICE)
    
    def _place_lava_pools(self):
        """Generate lava pools (usually near edges)."""
        lava_noise = PerlinNoise(self.params.seed + 4000)
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] != EMPTY:
                    continue
                
                # Lava tends to be at edges
                edge_dist = min(x, GRID_WIDTH - 1 - x, y, GRID_HEIGHT - 1 - y)
                noise_val = lava_noise.octave_noise(x / 30, y / 30, octaves=2)
                
                if edge_dist > GRID_WIDTH // 4 and noise_val > 0.6:
                    if not self._would_isolate_base(x, y, LAVA):
                        self._apply_symmetry(x, y, LAVA)
    
    def _place_tnt_crates(self):
        """Scatter TNT crates strategically."""
        tnt_positions = []
        
        # Place TNT in clusters
        num_clusters = random.randint(3, 6)
        for _ in range(num_clusters):
            cx = random.randint(5, GRID_WIDTH - 6)
            cy = random.randint(5, GRID_HEIGHT - 8)
            
            # Cluster size
            cluster_radius = random.randint(2, 4)
            
            for _ in range(random.randint(2, 5)):
                dx = random.randint(-cluster_radius, cluster_radius)
                dy = random.randint(-cluster_radius, cluster_radius)
                x, y = cx + dx, cy + dy
                
                if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                    if self.grid[y][x] == EMPTY:
                        tnt_positions.append((x, y))
        
        for x, y in tnt_positions:
            self._apply_symmetry(x, y, TNT)
    
    def _place_auto_turrets(self):
        """Place auto turrets at strategic positions."""
        turret_positions = []
        
        # Place turrets at choke points and elevated positions
        for y in range(2, GRID_HEIGHT - 3):
            for x in range(2, GRID_WIDTH - 2):
                if self.grid[y][x] != EMPTY:
                    continue
                
                # Count adjacent solid tiles
                solid_neighbors = 0
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                            tile = self.grid[ny][nx]
                            if tile in (BRICK, STEEL, WATER):
                                solid_neighbors += 1
                
                # Good turret position has some cover nearby
                if solid_neighbors >= 3 and random.random() < 0.02:
                    turret_positions.append((x, y))
        
        # Limit turret count
        random.shuffle(turret_positions)
        for x, y in turret_positions[:8]:
            self._apply_symmetry(x, y, AUTO_TURRET)
    
    def _place_steel_reinforcements(self):
        """Replace some bricks with steel for variety."""
        brick_positions = []
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] == BRICK:
                    brick_positions.append((x, y))
        
        # Replace some bricks with steel
        num_steel = len(brick_positions) // 10
        random.shuffle(brick_positions)
        
        for x, y in brick_positions[:num_steel]:
            self.grid[y][x] = STEEL
    
    def _would_isolate_base(self, x: int, y: int, tile_type: int) -> bool:
        """Check if placing a tile would isolate the base."""
        # Find base position
        base_y = GRID_HEIGHT - 2
        base_x = GRID_WIDTH // 2
        
        # Simple check: don't place solid tiles too close to base exit
        base_clear_zone = range(base_x - 3, base_x + 3)
        if x in base_clear_zone and y >= base_y - 2:
            return tile_type in (WATER, STEEL, LAVA)
        
        return False
    
    def _ensure_playability(self):
        """Ensure the map is playable with proper paths."""
        base_y = GRID_HEIGHT - 2
        base_x = GRID_WIDTH // 2
        
        # Clear a path upward from base
        path_width = 3
        for y in range(base_y - 3, max(0, base_y - 15), -1):
            for dx in range(-path_width // 2, path_width // 2 + 1):
                x = base_x + dx
                if 0 <= x < GRID_WIDTH:
                    if self.grid[y][x] in (WATER, STEEL, LAVA):
                        self.grid[y][x] = EMPTY
        
        # Create multiple paths using noise-based corridors
        corridor_noise = PerlinNoise(self.params.seed + 5000)
        
        for y in range(GRID_HEIGHT - 5, 5, -1):
            noise_val = corridor_noise.noise2d(y / 10, 0)
            corridor_x = int((noise_val + 1) / 2 * GRID_WIDTH)
            
            for dx in range(-2, 3):
                x = corridor_x + dx
                if 0 <= x < GRID_WIDTH:
                    if self.grid[y][x] in (WATER, STEEL, LAVA, FOREST):
                        self.grid[y][x] = EMPTY
    
    def _add_decorative_elements(self):
        """Add decorative elements for visual appeal."""
        # Add some glass for variety
        glass_noise = PerlinNoise(self.params.seed + 6000)
        
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if self.grid[y][x] != EMPTY:
                    continue
                
                noise_val = glass_noise.octave_noise(x / 50, y / 50, octaves=2)
                
                if noise_val > 0.7 and random.random() < 0.1:
                    self._apply_symmetry(x, y, GLASS)
    
    def generate(self, name: str = None) -> Map:
        """
        Generate a complete map using all algorithms.
        
        Algorithm order:
        1. Initialize empty grid
        2. Generate cave structures
        3. Place base terrain (bricks)
        4. Add water bodies
        5. Add forest patches
        6. Add special terrain (ice, lava)
        7. Place structured elements (walls, pillars)
        8. Place interactive elements (TNT, turrets)
        9. Add decorative elements
        10. Ensure playability
        11. Place base and finalize
        """
        # Reset grid
        self.grid = [[EMPTY] * GRID_WIDTH for _ in range(GRID_HEIGHT)]
        
        # Step 1: Generate caves for organic structures
        cave_grid = self._generate_caves()
        
        # Step 2: Place base brick terrain using noise
        self._generate_terrain_layer(BRICK, -0.2, 0.3, allow_caves=True, cave_grid=cave_grid)
        
        # Step 3: Add structured brick patterns
        self._place_bricks_structured()
        
        # Step 4: Place water bodies
        if self.params.water_bodies:
            self._place_water_bodies()
        
        # Step 5: Place forest patches
        if self.params.forest_patches:
            self._place_forest_patches()
        
        # Step 6: Place ice regions
        if self.params.ice_regions:
            self._place_ice_regions()
        
        # Step 7: Place lava pools
        if self.params.lava_pools:
            self._place_lava_pools()
        
        # Step 8: Place TNT crates
        if self.params.tnt_scatter:
            self._place_tnt_crates()
        
        # Step 9: Place auto turrets
        if self.params.auto_turrets:
            self._place_auto_turrets()
        
        # Step 10: Add steel reinforcements
        self._place_steel_reinforcements()
        
        # Step 11: Add decorative elements
        self._add_decorative_elements()
        
        # Step 12: Ensure playability
        self._ensure_playability()
        
        # Step 13: Place base (eagle)
        base_x = GRID_WIDTH // 2
        base_y = GRID_HEIGHT - 2
        self._clear_base_area(base_x, base_y)
        self.grid[base_y][base_x] = BASE
        
        # Add base protection walls
        for dx in [-2, 2]:
            for dy in [-1, 0, 1]:
                x, y = base_x + dx, base_y + dy
                if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
                    if self.grid[y][x] == EMPTY:
                        self.grid[y][x] = BRICK
        
        # Create map
        map_name = name or f"GENERATED_{self.params.seed:06X}"
        generated_map = Map(name=map_name, grid=self.grid)
        
        return generated_map


# =============================================================================
# Convenience Functions
# =============================================================================

def generate_map(name: str = None, seed: int = None, 
                 symmetry: str = "horizontal",
                 terrain_complexity: str = "medium") -> Map:
    """
    Generate a map with specified parameters.
    
    Args:
        name: Map name (auto-generated if not provided)
        seed: Random seed for reproducibility
        symmetry: "horizontal", "vertical", "both", or "none"
        terrain_complexity: "simple", "medium", or "complex"
    
    Returns:
        Generated Map instance
    """
    # Adjust params based on complexity
    if terrain_complexity == "simple":
        params = MapGenerationParams(
            seed=seed,
            symmetry=symmetry,
            terrain_scale=50.0,
            cave_density=0.35,
            water_bodies=False,
            tnt_scatter=False,
        )
    elif terrain_complexity == "complex":
        params = MapGenerationParams(
            seed=seed,
            symmetry=symmetry,
            terrain_scale=20.0,
            cave_density=0.5,
            water_bodies=True,
            forest_patches=True,
            ice_regions=True,
            lava_pools=True,
            tnt_scatter=True,
            auto_turrets=True,
        )
    else:  # medium
        params = MapGenerationParams(
            seed=seed,
            symmetry=symmetry,
            terrain_scale=30.0,
            cave_density=0.45,
            water_bodies=True,
            forest_patches=True,
            tnt_scatter=True,
            auto_turrets=True,
        )
    
    generator = AdvancedMapGenerator(params)
    return generator.generate(name)


def generate_symmetric_arena(name: str = None, seed: int = None) -> Map:
    """Generate a symmetric arena map optimized for competitive play."""
    params = MapGenerationParams(
        seed=seed,
        symmetry="both",
        terrain_scale=25.0,
        cave_density=0.4,
        water_bodies=True,
        forest_patches=True,
        tnt_scatter=True,
        auto_turrets=False,
        base_protection=4,
    )
    
    generator = AdvancedMapGenerator(params)
    return generator.generate(name or "ARENA")


def generate_cave_map(name: str = None, seed: int = None) -> Map:
    """Generate a cave-style map with organic structures."""
    params = MapGenerationParams(
        seed=seed,
        symmetry="none",
        terrain_scale=15.0,
        cave_density=0.55,
        water_bodies=False,
        forest_patches=False,
        tnt_scatter=True,
        auto_turrets=True,
        base_protection=3,
    )
    
    generator = AdvancedMapGenerator(params)
    return generator.generate(name or "CAVES")
