# Graph Report - mega-tanks  (2026-05-01)

## Corpus Check
- 53 files · ~74,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 926 nodes · 2538 edges · 25 communities detected
- Extraction: 55% EXTRACTED · 45% INFERRED · 0% AMBIGUOUS · INFERRED: 1154 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]

## God Nodes (most connected - your core abstractions)
1. `Map` - 197 edges
2. `GameEngine` - 190 edges
3. `InputRecorder` - 90 edges
4. `PowerupManager` - 86 edges
5. `AdvancedMapGenerator` - 74 edges
6. `MobileTileController` - 64 edges
7. `SkeletonController` - 63 edges
8. `Tank` - 59 edges
9. `MapGenerationParams` - 59 edges
10. `Bullet` - 59 edges

## Surprising Connections (you probably didn't know these)
- `Bullet subsystem extracted from GameEngine.` --uses--> `GameEngine`  [INFERRED]
  backend/bullet_manager.py → backend/game_engine.py
- `Sandworm subsystem extracted from GameEngine.` --uses--> `GameEngine`  [INFERRED]
  backend/sandworm_controller.py → backend/game_engine.py
- `map_store.py — Filesystem-based map persistence (JSON files in maps/).` --uses--> `Map`  [INFERRED]
  backend/map_store.py → backend/map_model.py
- `Persist a Map to disk. Returns the path written.` --uses--> `Map`  [INFERRED]
  backend/map_store.py → backend/map_model.py
- `Load a Map from disk by name. Raises FileNotFoundError if missing.` --uses--> `Map`  [INFERRED]
  backend/map_store.py → backend/map_model.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (115): create_map(), GameSettings, generate_new_map(), ImageToMapPayload, MapGenerationPayload, MapPayload, api.py — REST API endpoints for map management and game control., Full TileType-shaped JSON for every registry tile (sprite editor templates). (+107 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (43): can_big_tank_crush(), Shared check used by movement/collision paths., GameEngine, Return (row, col) of the Base tile, or None., Return bounding box info for each entity, for use in frontend state., Check if bullet position overlaps with skeleton's grid-cell footprint., make_enemy_tank(), make_player_tank() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (57): _applyBrush(), applyDisabledTilesToCurrentGrid(), _bindEvents(), blurEditor(), _brushSpan(), _clearExtraBigFootprint(), colorDistance(), _currentTileId() (+49 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (69): AIController, Bullet, BulletManager, Advance bullet position by one tick., EnemySpawner, ExplosionManager, game_engine.py — Core game loop, physics, collision detection.  The engine runs, C — Clone: Spawn clone tank that replays player inputs with delay. (+61 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (68): convert_image_to_new_map(), delete_custom_tile(), _ext_sprites_dir(), get_map(), get_maps(), get_tile_definitions(), get_tiles(), _project_root() (+60 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (46): _adjustRangeInput(), _adjustSelect(), _buildFocusablesForContext(), _buildGamepadRemapUI(), buildSettingsUI(), buildTileSettingsUI(), _clearFocusHighlight(), _closeGamepadSettingsModal() (+38 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (22): ABC, AI subsystem extracted from GameEngine., Bullet subsystem extracted from GameEngine., bullet.py — Bullet entity for Battle Tanks., Collision helpers extracted from GameEngine., Enemy spawner subsystem extracted from GameEngine., Explosion/TNT subsystem extracted from GameEngine., InputFrame (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (10): _axisDir(), GamepadController, getDefaultGamepadRemap(), _getFirstConnectedPad(), _isButtonPressed(), loadGamepadRemap(), _readDeadzoneFromSettings(), _safeParseJSON() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (8): _bullet_in_rect(), _make_skeleton(), _new_id(), skeleton_controller.py — Skeleton creatures that spawn from lava tiles.  Up to 5, Check that the w×h footprint at (row, col) top-left is inside bounds and unblock, Apply 1 damage to any skeleton whose footprint contains (blast_row, blast_col)., _step(), _tank_overlaps_skeleton()

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (4): If any footprint cell no longer matches tile_id (e.g. TNT), drop entity and rest, Drop tracking for any mobile entity touching these cells (grid updated separatel, Mobile + partial_destructible: destroy the whole footprint., _step_direction()

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (6): page(), E2E browser tests for Mega Tanks. Requires: pip install pytest-playwright && pla, New page for each test., TestEditorScreen, TestPlayScreen, TestTitleScreen

### Community 11 - "Community 11"
Cohesion: 0.35
Nodes (12): _empty_grid(), _make_engine(), Integration-style tests for the GameEngine.  These tests intentionally exercise, test_base_tile_hit_by_enemy_bullet_triggers_defeat(), test_bullet_hit_enemy_increments_score_and_decrements_remaining(), test_end_conditions_victory_and_defeat(), test_enemy_spawner_respects_max_active_enemies(), test_move_tank_blocked_by_solid_tile() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (5): _map_payload(), Integration tests for REST API endpoints., test_map_crud_flow(), test_start_and_stop_game_session(), test_start_game_with_custom_settings()

### Community 13 - "Community 13"
Cohesion: 0.27
Nodes (1): SpriteAtlas

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (7): _make_map(), test_map_store.py — Tests for map persistence layer., Redirect maps directory to a temp folder for each test., test_delete_map(), test_list_maps(), test_save_and_load(), tmp_maps()

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (1): GameInput

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (1): GameSocket

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (1): Hud

### Community 18 - "Community 18"
Cohesion: 0.32
Nodes (1): AudioManager

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (1): GameStateStore

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (2): Handle letter box spawning, TTL, and cleanup., Spawn a random letter box at a valid 2x2 empty spot.

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (3): check(), main(), Server verification script. Run with server already started on port 6666. Usage:

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): E2E test configuration. Requires: pip install playwright && playwright install c

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Number of frames currently stored.

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Total ticks recorded since creation/clear.

## Knowledge Gaps
- **31 isolated node(s):** `Server verification script. Run with server already started on port 6666. Usage:`, `E2E test configuration. Requires: pip install playwright && playwright install c`, `E2E browser tests for Mega Tanks. Requires: pip install pytest-playwright && pla`, `New page for each test.`, `tile_registry.py — Extensible tile type definitions for Battle Tanks.  To add a` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 13`** (10 nodes): `spriteAtlas.js`, `SpriteAtlas`, `.constructor()`, `.draw()`, `.getSpriteInfo()`, `.has()`, `._loadImage()`, `.manifest()`, `.ready()`, `._resolveFile()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (9 nodes): `GameInput`, `.bind()`, `.constructor()`, `.getDirection()`, `.isFiring()`, `._onKeyDown()`, `._onKeyUp()`, `.unbind()`, `gameInput.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (9 nodes): `apiFetch()`, `GameSocket`, `.close()`, `.connect()`, `.constructor()`, `._open()`, `.sendInput()`, `.sendPause()`, `api.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (9 nodes): `Hud`, `.constructor()`, `.hideOverlay()`, `.reset()`, `.setMapName()`, `.showOverlay()`, `._showSkeletonBanner()`, `.update()`, `hud.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (8 nodes): `AudioManager`, `.constructor()`, `.play()`, `.setMuted()`, `.stop()`, `.stopAll()`, `.toggleMuted()`, `audio.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (7 nodes): `GameStateStore`, `.apply()`, `.constructor()`, `.explosions()`, `.reset()`, `.state()`, `gameState.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (5 nodes): `._spawn_letter_box()`, `.tick()`, `._tick_letter_boxes()`, `Handle letter box spawning, TTL, and cleanup.`, `Spawn a random letter box at a valid 2x2 empty spot.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (3 nodes): `base_url()`, `E2E test configuration. Requires: pip install playwright && playwright install c`, `conftest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Number of frames currently stored.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Total ticks recorded since creation/clear.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Map` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`, `Community 11`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `GameEngine` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 6`, `Community 8`, `Community 9`, `Community 11`, `Community 20`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Are the 189 inferred relationships involving `Map` (e.g. with `map_store.py — Filesystem-based map persistence (JSON files in maps/).` and `Persist a Map to disk. Returns the path written.`) actually correct?**
  _`Map` has 189 INFERRED edges - model-reasoned connections that need verification._
- **Are the 97 inferred relationships involving `GameEngine` (e.g. with `BulletManager` and `Bullet subsystem extracted from GameEngine.`) actually correct?**
  _`GameEngine` has 97 INFERRED edges - model-reasoned connections that need verification._
- **Are the 83 inferred relationships involving `InputRecorder` (e.g. with `GameEngine` and `game_engine.py — Core game loop, physics, collision detection.  The engine runs`) actually correct?**
  _`InputRecorder` has 83 INFERRED edges - model-reasoned connections that need verification._
- **Are the 81 inferred relationships involving `PowerupManager` (e.g. with `GameEngine` and `game_engine.py — Core game loop, physics, collision detection.  The engine runs`) actually correct?**
  _`PowerupManager` has 81 INFERRED edges - model-reasoned connections that need verification._
- **Are the 51 inferred relationships involving `AdvancedMapGenerator` (e.g. with `MapPayload` and `GameSettings`) actually correct?**
  _`AdvancedMapGenerator` has 51 INFERRED edges - model-reasoned connections that need verification._