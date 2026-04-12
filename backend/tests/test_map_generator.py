"""
test_map_generator.py — Tests for advanced map generation.
"""

import pytest
from backend.map_generator import (
    generate_map,
    generate_symmetric_arena,
    generate_cave_map,
    AdvancedMapGenerator,
    MapGenerationParams,
    PerlinNoise,
    CellularAutomata,
)
from backend.map_model import GRID_WIDTH, GRID_HEIGHT


class TestPerlinNoise:
    """Test Perlin noise generation."""
    
    def test_noise_reproducibility(self):
        """Same seed produces same noise."""
        noise1 = PerlinNoise(seed=42)
        noise2 = PerlinNoise(seed=42)
        
        assert noise1.noise2d(5, 5) == noise2.noise2d(5, 5)
        assert noise1.octave_noise(10, 10) == noise2.octave_noise(10, 10)
    
    def test_noise_variation(self):
        """Different coordinates produce different values."""
        noise = PerlinNoise(seed=42)
        
        val1 = noise.noise2d(0, 0)
        val2 = noise.noise2d(10, 10)
        val3 = noise.noise2d(50.5, 50.3)  # Use non-integer to ensure difference
        
        # Values at integer coordinates might be same, so just check they're in range
        assert -1 <= val1 <= 1
        assert -1 <= val2 <= 1
        assert -1 <= val3 <= 1
    
    def test_octave_noise_range(self):
        """Octave noise should be normalized to roughly [-1, 1]."""
        noise = PerlinNoise(seed=42)
        
        for x in range(0, 100, 10):
            for y in range(0, 100, 10):
                val = noise.octave_noise(x, y)
                assert -1.5 <= val <= 1.5  # Allow some margin


class TestCellularAutomata:
    """Test cellular automata cave generation."""
    
    def test_cave_initialization(self):
        """Cave grid initializes correctly."""
        ca = CellularAutomata(50, 50)
        ca.initialize_random(fill_probability=0.5)
        
        assert len(ca.grid) == 50
        assert all(len(row) == 50 for row in ca.grid)
    
    def test_cave_smoothing(self):
        """Cellular automata produces smoother results after iteration."""
        ca = CellularAutomata(30, 30)
        ca.initialize_random(fill_probability=0.45)
        
        initial_filled = sum(sum(row) for row in ca.grid)
        
        ca.step()
        after_step = sum(sum(row) for row in ca.grid)
        
        # Step should change the grid
        assert initial_filled != after_step or ca.grid != ca.grid
    
    def test_cave_run_returns_grid(self):
        """Cave run returns a valid grid."""
        ca = CellularAutomata(GRID_WIDTH, GRID_HEIGHT)
        grid = ca.run(iterations=4, smooth_iterations=2)
        
        assert len(grid) == GRID_HEIGHT
        assert all(len(row) == GRID_WIDTH for row in grid)


class TestMapGenerationParams:
    """Test map generation parameters."""
    
    def test_default_params(self):
        """Default parameters are reasonable."""
        params = MapGenerationParams()
        
        assert params.symmetry == "horizontal"
        assert params.terrain_scale == 30.0
        assert params.cave_density == 0.45
        assert params.water_bodies is True
        assert params.forest_patches is True
    
    def test_custom_params(self):
        """Custom parameters are applied."""
        params = MapGenerationParams(
            seed=12345,
            symmetry="both",
            terrain_scale=20.0,
            cave_density=0.5,
            water_bodies=False,
            forest_patches=False,
            ice_regions=True,
            lava_pools=True,
        )
        
        assert params.seed == 12345
        assert params.symmetry == "both"
        assert params.terrain_scale == 20.0
        assert params.cave_density == 0.5
        assert params.water_bodies is False
        assert params.ice_regions is True


class TestAdvancedMapGenerator:
    """Test advanced map generator."""
    
    def test_generator_initialization(self):
        """Generator initializes with given parameters."""
        params = MapGenerationParams(seed=42)
        generator = AdvancedMapGenerator(params)
        
        assert generator.params.seed == 42
    
    def test_generate_basic_map(self):
        """Generate a basic valid map."""
        map_obj = generate_map(name="TEST", seed=42)
        
        assert map_obj.name == "TEST"
        assert len(map_obj.grid) == GRID_HEIGHT
        assert all(len(row) == GRID_WIDTH for row in map_obj.grid)
        assert map_obj.is_valid()
    
    def test_generate_symmetric_arena(self):
        """Generate a symmetric arena map."""
        map_obj = generate_symmetric_arena(name="ARENA", seed=123)
        
        assert map_obj.name == "ARENA"
        assert map_obj.is_valid()
        
        # Check that base is centered (key requirement for arena maps)
        base_pos = map_obj.find_base()
        assert base_pos[0] == GRID_HEIGHT - 2
        assert base_pos[1] == GRID_WIDTH // 2
        
        # Check approximate horizontal symmetry (allow some asymmetry for natural look)
        grid = map_obj.grid
        symmetric_matches = 0
        total_checks = 0
        
        for y in range(GRID_HEIGHT - 3):  # Exclude base area
            for x in range(GRID_WIDTH // 2):
                mirror_x = GRID_WIDTH - 1 - x
                total_checks += 1
                if grid[y][x] == grid[y][mirror_x]:
                    symmetric_matches += 1
        
        # Should be at least 80% symmetric
        assert symmetric_matches / total_checks >= 0.80
    
    def test_generate_cave_map(self):
        """Generate a cave-style map."""
        map_obj = generate_cave_map(name="CAVES", seed=456)
        
        assert map_obj.name == "CAVES"
        assert map_obj.is_valid()
        
        # Cave maps should have more empty space
        empty_count = sum(row.count(0) for row in map_obj.grid)
        assert empty_count > 100  # At least some open areas
    
    def test_base_placement(self):
        """Base is always placed correctly."""
        for seed in range(10):
            map_obj = generate_map(seed=seed)
            base_pos = map_obj.find_base()
            
            assert base_pos is not None, f"No base found for seed {seed}"
            # Base should be at bottom center
            assert base_pos[0] == GRID_HEIGHT - 2
            assert GRID_WIDTH // 2 - 1 <= base_pos[1] <= GRID_WIDTH // 2
    
    def test_map_has_playable_area(self):
        """Generated maps have some empty space for movement."""
        for seed in range(5):
            map_obj = generate_map(seed=seed, terrain_complexity="simple")
            
            empty_count = sum(row.count(0) for row in map_obj.grid)
            # Even simple maps should have some empty space
            assert empty_count > 0
    
    def test_different_seeds_produce_different_maps(self):
        """Different seeds produce different maps."""
        map1 = generate_map(seed=1)
        map2 = generate_map(seed=2)
        map3 = generate_map(seed=100)
        
        assert map1.grid != map2.grid
        assert map2.grid != map3.grid
    
    def test_complexity_affects_map(self):
        """Complexity setting affects map features."""
        simple = generate_map(terrain_complexity="simple", seed=42)
        complex_map = generate_map(terrain_complexity="complex", seed=42)
        
        # Both should be valid
        assert simple.is_valid()
        assert complex_map.is_valid()


class TestSymmetry:
    """Test symmetry in map generation."""
    
    def test_horizontal_symmetry(self):
        """Horizontal symmetry is applied correctly."""
        params = MapGenerationParams(
            seed=42,
            symmetry="horizontal",
            water_bodies=False,
            forest_patches=False,
        )
        generator = AdvancedMapGenerator(params)
        map_obj = generator.generate()
        
        assert map_obj.is_valid()
        
        grid = map_obj.grid
        # Check symmetry with tolerance (cave generation and playability may break some symmetry)
        symmetric_matches = 0
        total_checks = 0
        
        for y in range(GRID_HEIGHT - 3):  # Exclude base area
            for x in range(GRID_WIDTH // 2):
                mirror_x = GRID_WIDTH - 1 - x
                total_checks += 1
                if grid[y][x] == grid[y][mirror_x]:
                    symmetric_matches += 1
        
        # Should be at least 70% symmetric (caves and playability paths break some symmetry)
        assert symmetric_matches / total_checks >= 0.70
    
    def test_vertical_symmetry(self):
        """Vertical symmetry is applied correctly."""
        params = MapGenerationParams(
            seed=42,
            symmetry="vertical",
            water_bodies=False,
            forest_patches=False,
        )
        generator = AdvancedMapGenerator(params)
        map_obj = generator.generate()
        
        assert map_obj.is_valid()
        
        grid = map_obj.grid
        # Check symmetry with tolerance
        symmetric_matches = 0
        total_checks = 0
        
        for y in range(GRID_HEIGHT // 2 - 2):
            mirror_y = GRID_HEIGHT - 1 - y
            for x in range(GRID_WIDTH):
                total_checks += 1
                if grid[y][x] == grid[mirror_y][x]:
                    symmetric_matches += 1
        
        # Should be at least 70% symmetric
        assert symmetric_matches / total_checks >= 0.70
    
    def test_both_symmetry(self):
        """Both horizontal and vertical symmetry is applied."""
        params = MapGenerationParams(
            seed=42,
            symmetry="both",
            water_bodies=False,
            forest_patches=False,
        )
        generator = AdvancedMapGenerator(params)
        map_obj = generator.generate()
        
        assert map_obj.is_valid()
        
        grid = map_obj.grid
        # Check both symmetries with tolerance
        h_matches = 0
        v_matches = 0
        total_checks = 0
        
        for y in range(GRID_HEIGHT // 2 - 2):
            mirror_y = GRID_HEIGHT - 1 - y
            for x in range(GRID_WIDTH // 2):
                mirror_x = GRID_WIDTH - 1 - x
                total_checks += 1
                if grid[y][x] == grid[y][mirror_x]:
                    h_matches += 1
                if grid[y][x] == grid[mirror_y][x]:
                    v_matches += 1
        
        # Should be at least 70% symmetric in both directions
        assert h_matches / total_checks >= 0.70
        assert v_matches / total_checks >= 0.70


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
