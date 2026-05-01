# Graph Report - mega-tanks  (2026-05-01)

## Corpus Check
- 60 files · ~75,370 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1013 nodes · 3112 edges · 31 communities detected
- Extraction: 46% EXTRACTED · 54% INFERRED · 0% AMBIGUOUS · INFERRED: 1689 edges (avg confidence: 0.53)
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
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]

## God Nodes (most connected - your core abstractions)
1. `Map` - 239 edges
2. `GameEngine` - 193 edges
3. `InputRecorder` - 132 edges
4. `PowerupManager` - 128 edges
5. `MobileTileController` - 106 edges
6. `SkeletonController` - 105 edges
7. `Bullet` - 105 edges
8. `Tank` - 101 edges
9. `AIController` - 92 edges
10. `BulletManager` - 91 edges

## Surprising Connections (you probably didn't know these)
- `Bullet subsystem extracted from GameEngine.` --uses--> `GameEngine`  [INFERRED]
  backend/bullet_manager.py → backend/game_engine.py
- `Sandworm subsystem extracted from GameEngine.` --uses--> `GameEngine`  [INFERRED]
  backend/sandworm_controller.py → backend/game_engine.py
- `Explosion/TNT subsystem extracted from GameEngine.` --uses--> `GameEngine`  [INFERRED]
  backend/explosion_manager.py → backend/game_engine.py
- `Collision helpers extracted from GameEngine.` --uses--> `Tank`  [INFERRED]
  backend/collision.py → backend/tank.py
- `Shared check used by movement/collision paths.` --uses--> `Tank`  [INFERRED]
  backend/collision.py → backend/tank.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (107): AIController, Bullet, BulletManager, Advance bullet position by one tick., EnemySpawner, ExplosionManager, C — Clone: Spawn clone tank that replays player inputs with delay., Tick airplane effects. (+99 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (63): ABC, bullet.py — Bullet entity for Battle Tanks., can_big_tank_crush(), Collision helpers extracted from GameEngine., Shared check used by movement/collision paths., GameEngine, Destroys any destructible blocks directly under the tank to allow spawning/movem, Tick clone effect: replay player inputs with delay. (+55 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (73): generate_new_map(), Generate a new map using procedural algorithms.      Uses a combination of:, AdvancedMapGenerator, CellularAutomata, generate_cave_map(), generate_map(), generate_symmetric_arena(), MapGenerationParams (+65 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (61): syncTileCatalogFromApiTiles(), _applyBrush(), applyDisabledTilesToCurrentGrid(), _bindEvents(), blurEditor(), _brushSpan(), _clearExtraBigFootprint(), colorDistance() (+53 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (79): convert_image_to_new_map(), create_map(), GameSettings, get_map(), get_maps(), get_tile_definitions(), ImageToMapPayload, MapGenerationPayload (+71 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (62): AI subsystem extracted from GameEngine., delete_custom_tile(), _ext_sprites_dir(), get_tiles(), _project_root(), Return all tile type definitions for the frontend palette (full TileType fields), upload_custom_tile(), Bullet subsystem extracted from GameEngine. (+54 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (47): _adjustRangeInput(), _adjustSelect(), _applyCustomTilePreset(), _buildFocusablesForContext(), _buildGamepadRemapUI(), buildSettingsUI(), buildTileSettingsUI(), _clearFocusHighlight() (+39 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (10): _axisDir(), GamepadController, getDefaultGamepadRemap(), _getFirstConnectedPad(), _isButtonPressed(), loadGamepadRemap(), _readDeadzoneFromSettings(), _safeParseJSON() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (6): page(), E2E browser tests for Mega Tanks. Requires: pip install pytest-playwright && pla, New page for each test., TestEditorScreen, TestPlayScreen, TestTitleScreen

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (5): main.py — FastAPI application entrypoint for Battle Tanks.  Serves:   - REST API, # NOTE: Chrome blocks some ports (including 6666) as unsafe., In-memory session store for active game engines., SessionStore, ws.py — WebSocket endpoint for real-time game state streaming.  Protocol:   Clie

### Community 10 - "Community 10"
Cohesion: 0.35
Nodes (12): _empty_grid(), _make_engine(), Integration-style tests for the GameEngine.  These tests intentionally exercise, test_base_tile_hit_by_enemy_bullet_triggers_defeat(), test_bullet_hit_enemy_increments_score_and_decrements_remaining(), test_end_conditions_victory_and_defeat(), test_enemy_spawner_respects_max_active_enemies(), test_move_tank_blocked_by_solid_tile() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (5): _map_payload(), Integration tests for REST API endpoints., test_map_crud_flow(), test_start_and_stop_game_session(), test_start_game_with_custom_settings()

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (9): _getEditorDrawBag(), createEditorTileDrawBag(), createOffscreen(), getOrBuildBigTile(), getOrBuildSmallTile(), renderBigTileStatic(), renderGlassBoxBorders(), renderGlassBoxCracks() (+1 more)

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
Cohesion: 0.67
Nodes (3): check(), main(), Server verification script. Run with server already started on port 6666. Usage:

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (2): Get the input frame from ticks_ago ticks in the past.          Args:, Get the direction and fire state from ticks_ago ticks in the past.          Args

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): E2E test configuration. Requires: pip install playwright && playwright install c

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (1): Split built-in tile table data; see builtin.build_builtin_registry.

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Number of frames currently stored.

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Total ticks recorded since creation/clear.

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): Serialize a TileType for API responses (full field set).

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): Return a TileType by ID, defaulting to empty if unknown.

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (1): Return all tile types sorted by ID (for palette rendering).

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (1): Load custom tiles from maps/custom_tiles.json and re-register them.

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): # NOTE: Money, Sun, and Mega Gun tiles (IDs 37-50) are timed powerups that spawn

## Knowledge Gaps
- **42 isolated node(s):** `Server verification script. Run with server already started on port 6666. Usage:`, `E2E test configuration. Requires: pip install playwright && playwright install c`, `E2E browser tests for Mega Tanks. Requires: pip install pytest-playwright && pla`, `New page for each test.`, `Derived tile catalogs built from TileType fields after registry + custom tiles l` (+37 more)
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
- **Thin community `Community 21`** (4 nodes): `.get_frame()`, `.get_input()`, `Get the input frame from ticks_ago ticks in the past.          Args:`, `Get the direction and fire state from ticks_ago ticks in the past.          Args`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (3 nodes): `base_url()`, `E2E test configuration. Requires: pip install playwright && playwright install c`, `conftest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `__init__.py`, `Split built-in tile table data; see builtin.build_builtin_registry.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Number of frames currently stored.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Total ticks recorded since creation/clear.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `Serialize a TileType for API responses (full field set).`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `Return a TileType by ID, defaulting to empty if unknown.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `Return all tile types sorted by ID (for palette rendering).`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `Load custom tiles from maps/custom_tiles.json and re-register them.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `# NOTE: Money, Sun, and Mega Gun tiles (IDs 37-50) are timed powerups that spawn`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Map` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 5`, `Community 10`, `Community 11`, `Community 14`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `GameEngine` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 10`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `SkeletonController` connect `Community 0` to `Community 1`, `Community 5`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 231 inferred relationships involving `Map` (e.g. with `map_store.py — Filesystem-based map persistence (JSON files in maps/).` and `Persist a Map to disk. Returns the path written.`) actually correct?**
  _`Map` has 231 INFERRED edges - model-reasoned connections that need verification._
- **Are the 100 inferred relationships involving `GameEngine` (e.g. with `BulletManager` and `Bullet subsystem extracted from GameEngine.`) actually correct?**
  _`GameEngine` has 100 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `InputRecorder` (e.g. with `GameEngine` and `game_engine.py — Core game loop, physics, collision detection.  The engine runs`) actually correct?**
  _`InputRecorder` has 125 INFERRED edges - model-reasoned connections that need verification._
- **Are the 123 inferred relationships involving `PowerupManager` (e.g. with `GameEngine` and `game_engine.py — Core game loop, physics, collision detection.  The engine runs`) actually correct?**
  _`PowerupManager` has 123 INFERRED edges - model-reasoned connections that need verification._