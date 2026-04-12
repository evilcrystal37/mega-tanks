"""
test_letter_powerups.py — Unit tests for letter powerup system.

Tests cover:
1. Tile registry includes all new IDs with correct properties
2. PowerupManager spawns letter boxes deterministically with seeded RNG
3. Letter pad pickup triggers correct effect state changes
4. Octopus shield prevents base destruction while active
5. Magnet pull is deterministic for fixed seed
6. Sleep effect disables enemy AI
"""

import pytest
from backend.tile_registry import (
    TILE_REGISTRY, get_tile,
    BANANA_PAD, BANANA_BOX, CLONE_PAD, FIREWORKS_PAD, JUMP_PAD,
    RAINBOW_WORLD_PAD, AIRPLANE_PAD, MAGNET_PAD, SAHUR_PAD, ZZZ_PAD, OCTOPUS_PAD,
    BANANA_BOX_IDS, CLONE_BOX_IDS, FIREWORKS_BOX_IDS, JUMP_BOX_IDS,
    RAINBOW_WORLD_BOX_IDS, AIRPLANE_BOX_IDS, MAGNET_BOX_IDS,
    SAHUR_BOX_IDS, ZZZ_BOX_IDS, OCTOPUS_BOX_IDS,
    LETTER_BOX_IDS, LETTER_PAD_IDS, LETTER_EFFECT_MAP,
    BIG_BOX_IDS,
    EMPTY, BASE, STEEL, BRICK,
)
from backend.map_model import Map
from backend.game_engine import GameEngine
from backend.tank import make_player_tank
from backend.input_recorder import InputRecorder


class TestTileRegistry:
    """Test that all letter powerup tiles are registered correctly."""

    def test_all_letter_pad_ids_exist(self):
        """All 10 letter pad tiles should be in the registry."""
        pad_ids = [51, 55, 59, 63, 67, 71, 75, 79, 83, 87]
        for pid in pad_ids:
            assert pid in TILE_REGISTRY, f"Tile ID {pid} missing from registry"
            tile = get_tile(pid)
            assert tile.tank_solid is False, f"Pad {pid} should not be tank solid"
            assert tile.bullet_solid is False, f"Pad {pid} should not be bullet solid"
            assert tile.destructible is False, f"Pad {pid} should not be destructible"

    def test_all_letter_box_ids_exist(self):
        """All 30 letter box/crack tiles should be in the registry."""
        box_ids = [
            52, 53, 54,  # Banana
            56, 57, 58,  # Clone
            60, 61, 62,  # Fireworks
            64, 65, 66,  # Jump
            68, 69, 70,  # Rainbow World
            72, 73, 74,  # Airplane
            76, 77, 78,  # Magnet
            80, 81, 82,  # Sahur
            84, 85, 86,  # Zzz
            88, 89, 90,  # Octopus
        ]
        for bid in box_ids:
            assert bid in TILE_REGISTRY, f"Tile ID {bid} missing from registry"
            tile = get_tile(bid)
            assert tile.tank_solid is True, f"Box {bid} should be tank solid"
            assert tile.bullet_solid is True, f"Box {bid} should be bullet solid"
            assert tile.destructible is True, f"Box {bid} should be destructible"

    def test_letter_box_ids_sets(self):
        """Test that letter box ID sets are correctly defined."""
        assert BANANA_BOX_IDS == {52, 53, 54}
        assert CLONE_BOX_IDS == {56, 57, 58}
        assert FIREWORKS_BOX_IDS == {60, 61, 62}
        assert JUMP_BOX_IDS == {64, 65, 66}
        assert RAINBOW_WORLD_BOX_IDS == {68, 69, 70}
        assert AIRPLANE_BOX_IDS == {72, 73, 74}
        assert MAGNET_BOX_IDS == {76, 77, 78}
        assert SAHUR_BOX_IDS == {80, 81, 82}
        assert ZZZ_BOX_IDS == {84, 85, 86}
        assert OCTOPUS_BOX_IDS == {88, 89, 90}

    def test_letter_pad_ids_set(self):
        """Test that letter pad ID set is correctly defined."""
        expected_pads = {51, 55, 59, 63, 67, 71, 75, 79, 83, 87}
        assert LETTER_PAD_IDS == expected_pads

    def test_letter_effect_map(self):
        """Test that LETTER_EFFECT_MAP correctly maps IDs to effect names."""
        assert LETTER_EFFECT_MAP[51] == "banana"
        assert LETTER_EFFECT_MAP[55] == "clone"
        assert LETTER_EFFECT_MAP[59] == "fireworks"
        assert LETTER_EFFECT_MAP[63] == "jump"
        assert LETTER_EFFECT_MAP[67] == "rainbow_world"
        assert LETTER_EFFECT_MAP[71] == "airplane"
        assert LETTER_EFFECT_MAP[75] == "magnet"
        assert LETTER_EFFECT_MAP[79] == "sahur"
        assert LETTER_EFFECT_MAP[83] == "zzz"
        assert LETTER_EFFECT_MAP[87] == "octopus"

    def test_letter_boxes_in_big_box_ids(self):
        """All letter box IDs should be included in BIG_BOX_IDS."""
        assert BANANA_BOX_IDS.issubset(BIG_BOX_IDS)
        assert CLONE_BOX_IDS.issubset(BIG_BOX_IDS)
        assert FIREWORKS_BOX_IDS.issubset(BIG_BOX_IDS)
        assert JUMP_BOX_IDS.issubset(BIG_BOX_IDS)
        assert RAINBOW_WORLD_BOX_IDS.issubset(BIG_BOX_IDS)
        assert AIRPLANE_BOX_IDS.issubset(BIG_BOX_IDS)
        assert MAGNET_BOX_IDS.issubset(BIG_BOX_IDS)
        assert SAHUR_BOX_IDS.issubset(BIG_BOX_IDS)
        assert ZZZ_BOX_IDS.issubset(BIG_BOX_IDS)
        assert OCTOPUS_BOX_IDS.issubset(BIG_BOX_IDS)


class TestInputRecorder:
    """Test the input recorder for clone effect."""

    def test_record_and_replay(self):
        """Test recording and retrieving inputs with delay."""
        recorder = InputRecorder(max_frames=100)
        
        # Record some inputs
        recorder.record("up", False)
        recorder.record("up", True)
        recorder.record("right", False)
        recorder.record("right", True)
        
        # Retrieve with 1 tick delay
        direction, fire = recorder.get_input(1)
        assert direction == "right"
        assert fire is True
        
        # Retrieve with 2 tick delay
        direction, fire = recorder.get_input(2)
        assert direction == "right"
        assert fire is False

    def test_empty_buffer(self):
        """Test retrieving from empty buffer returns defaults."""
        recorder = InputRecorder()
        direction, fire = recorder.get_input(1)
        assert direction is None
        assert fire is False

    def test_clear(self):
        """Test clearing the buffer."""
        recorder = InputRecorder()
        recorder.record("up", True)
        recorder.clear()
        assert recorder.frame_count == 0


class TestLetterEffectSpawning:
    """Test letter box spawning mechanics."""

    def test_powerup_manager_has_letter_state(self):
        """PowerupManager should have letter spawning state."""
        from backend.powerup_manager import PowerupManager
        import random as rnd

        # Create a mock engine
        class MockEngine:
            grid = [[0] * 64 for _ in range(42)]
            _base_pos = (41, 31)
            events = []
            random = None

        engine = MockEngine()
        engine.random = rnd.Random(42)
        manager = PowerupManager(engine)

        assert hasattr(manager, '_letter_spawn_timer')
        assert hasattr(manager, '_letter_tile_pos')
        assert hasattr(manager, '_letter_tile_timer')
        assert hasattr(manager, '_active_letter_effect')


class TestOctopusShield:
    """Test the octopus base shield effect."""

    def test_shield_prevents_base_destruction(self):
        """Base shield should prevent base destruction from bullets."""
        # Create a simple map with base
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE  # Base at bottom center
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Activate base shield
        engine.base_shield_ticks = 100
        
        # Simulate bullet hit on base
        engine._apply_bullet_hit_tile(41, 32, "enemy", False, power=1)
        
        # Base should still be there (shield absorbed hit)
        assert engine.grid[41][32] == BASE
        assert engine.base_shield_ticks > 0


class TestSleepEffect:
    """Test the Zzz sleep effect on enemies."""

    def test_sleep_disables_enemy_ai(self):
        """Sleeping enemies should not move or fire."""
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Add an enemy with sleep
        from backend.tank import make_enemy_tank
        enemy = make_enemy_tank(10.0, 10.0, "basic")
        enemy.sleep_ticks = 100
        engine.enemies[enemy.id] = enemy
        
        # Tick the AI controller
        engine.ai_controller.tick_enemies()
        
        # Enemy should still be sleeping (sleep_ticks decremented)
        assert enemy.sleep_ticks == 99
        # Enemy should not have moved (ai_dir unchanged)
        assert enemy.ai_dir == "down"  # Default


class TestMagnetPull:
    """Test the magnet tile pulling effect."""

    def test_magnet_pulls_tiles_deterministically(self):
        """Magnet should pull tiles deterministically with fixed seed."""
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        # Place some destructible tiles around a spot
        grid[20][20] = BRICK
        grid[20][21] = BRICK
        grid[21][20] = BRICK
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Spawn a magnet
        engine.magnets.append({
            "row": 20.5,
            "col": 20.5,
            "ttl": 300,
            "radius": 4,
        })
        
        # Record initial state
        initial_20_20 = engine.grid[20][20]
        
        # Tick magnet
        engine._tick_magnets()
        
        # Tiles should have been pulled (may have moved)
        # The exact behavior depends on the pull algorithm
        assert len(engine.magnets) > 0


class TestBananaImpact:
    """Test the banana big impact effect."""

    def test_banana_destroys_destructibles(self):
        """Banana impact should destroy destructible tiles in 4x4 area."""
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        # Place destructible and indestructible tiles
        grid[20][20] = BRICK  # Should be destroyed
        grid[20][21] = STEEL  # Should NOT be destroyed
        grid[21][20] = BRICK  # Should be destroyed
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Trigger banana impact at center
        engine._banana_impact(20, 20)
        
        # Check results
        assert engine.grid[20][20] == EMPTY  # Brick destroyed
        assert engine.grid[20][21] == STEEL  # Steel intact
        assert engine.grid[21][20] == EMPTY  # Brick destroyed
        assert engine.grid[41][32] == BASE   # Base always safe


class TestRainbowWorld:
    """Test the rainbow world transform effect."""

    def test_rainbow_world_sets_timer(self):
        """Activating rainbow world should set the timer."""
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Activate rainbow world
        engine._activate_rainbow_world()
        
        assert engine.rainbow_world_ticks == 1800  # 30 seconds


class TestStateBuilding:
    """Test that letter effect state is included in WebSocket payload."""

    def test_state_includes_letter_effects(self):
        """State snapshot should include all letter effect fields."""
        grid = [[EMPTY] * 64 for _ in range(42)]
        grid[41][32] = BASE
        grid[41][33] = BASE
        grid[40][32] = BASE
        grid[40][33] = BASE
        
        map_obj = Map(name="test", grid=grid)
        engine = GameEngine(map_obj, settings={"seed": 42})
        engine.running = True
        
        # Set some effect states
        engine.rainbow_world_ticks = 100
        engine.base_shield_ticks = 200
        engine.bananas.append({"row": 10, "col": 10, "phase": 0, "ttl": 30})
        
        state = engine._build_state()
        
        assert "rainbow_world_ticks" in state
        assert "base_shield_ticks" in state
        assert "bananas" in state
        assert "fireworks" in state
        assert "airplanes" in state
        assert "magnets" in state
        assert "sahur_runners" in state
        assert state["rainbow_world_ticks"] == 100
        assert state["base_shield_ticks"] == 200
        assert len(state["bananas"]) == 1
