"""
Integration-style tests for the GameEngine.

These tests intentionally exercise behavior through the engine lifecycle
and tick flow, rather than unit-testing internal helper methods in isolation.
"""

from backend.bullet import Bullet
from backend.game_engine import GameEngine
from backend.map_model import GRID_HEIGHT, GRID_WIDTH, Map
from backend.tank import make_enemy_tank


def _empty_grid(base_row=20, base_col=20):
    grid = [[0] * GRID_WIDTH for _ in range(GRID_HEIGHT)]
    grid[base_row][base_col] = 6
    return grid


def _make_engine(grid=None, settings=None):
    m = Map(name="TEST", grid=grid or _empty_grid())
    engine = GameEngine(map_obj=m, settings=settings)
    engine._setup()
    engine.mode.on_start(engine)
    engine._apply_settings()
    engine.running = True
    return engine


def test_player_spawns_relative_to_base():
    engine = _make_engine(_empty_grid(base_row=30, base_col=40))
    assert engine.player is not None
    assert engine.player.row == 30.5
    assert engine.player.col == 36.5


def test_move_tank_blocked_by_solid_tile():
    grid = _empty_grid()
    engine = _make_engine(grid)
    player = engine.player
    assert player is not None
    player.row = 10.5
    player.col = 10.5

    # Place a brick directly above player movement path.
    engine.grid[10][10] = 1
    moved = engine._move_tank(player, "up")
    assert moved is False


def test_player_bullet_destroys_brick():
    grid = _empty_grid()
    engine = _make_engine(grid)
    player = engine.player
    assert player is not None
    player.row = 10.5
    player.col = 10.5
    player.direction = "up"
    player.fire_cooldown = 0

    # Spawn brick where bullet will pass through after one tick.
    engine.grid[9][10] = 1

    engine._try_fire(player)
    assert len(engine.bullets) == 1
    engine._tick_bullets()
    assert engine.grid[9][10] == 0


def test_enemy_spawner_respects_max_active_enemies():
    engine = _make_engine()
    engine._max_active_enemies = 1
    engine._spawn_interval = 0
    engine._spawn_cooldown = 0
    engine.total_enemies = 3
    engine.enemies_remaining = 3

    engine._tick_spawner()
    assert len([e for e in engine.enemies.values() if e.alive]) == 1

    # Cannot spawn another while max-active cap is reached.
    engine._tick_spawner()
    assert len([e for e in engine.enemies.values() if e.alive]) == 1


def test_bullet_hit_enemy_increments_score_and_decrements_remaining():
    engine = _make_engine()
    enemy = make_enemy_tank(10.5, 10.5, "basic")
    engine.enemies[enemy.id] = enemy
    engine.enemies_remaining = 5
    engine.score = 0

    # Player bullet overlapping enemy.
    bullet = Bullet(owner_id="p1", is_player=True, row=10.5, col=10.5, direction="up", speed=0.0)
    engine.bullets[bullet.id] = bullet
    engine._tick_bullets()

    assert enemy.alive is False
    assert engine.enemies_remaining == 4
    assert engine.score > 0


def test_pause_stops_tick_advancement():
    engine = _make_engine()
    tick_before = engine.tick_count
    engine.paused = True
    engine._tick()
    assert engine.tick_count == tick_before


def test_end_conditions_victory_and_defeat():
    # Victory
    victory_engine = _make_engine()
    victory_engine.enemies_remaining = 0
    victory_engine.enemies = {}
    victory_engine._check_end_conditions()
    assert victory_engine.result == "victory"
    assert victory_engine.running is False

    # Defeat
    defeat_engine = _make_engine()
    assert defeat_engine.player is not None
    defeat_engine.player.alive = False
    defeat_engine.player_lives = 0
    defeat_engine._check_end_conditions()
    assert defeat_engine.result == "defeat"


def test_mushroom_tile_pickup_adds_buff_ticks():
    grid = _empty_grid()
    engine = _make_engine(grid)
    player = engine.player
    assert player is not None
    player.row = 11.5
    player.col = 11.5
    engine.grid[11][11] = 24  # mushroom pad
    player.mushroom_ticks = 0

    engine._tick()
    assert player.mushroom_ticks > 0


def test_base_tile_hit_by_enemy_bullet_triggers_defeat():
    grid = _empty_grid(base_row=25, base_col=25)
    engine = _make_engine(grid)
    base = engine._base_pos
    assert base is not None
    r, c = base

    bullet = Bullet(owner_id="enemy", is_player=False, row=float(r), col=float(c), direction="up", speed=0.0)
    engine.bullets[bullet.id] = bullet
    engine._tick_bullets()
    assert engine.result == "defeat"
