# Mega Tanks — Comprehensive Project Documentation

## Project Overview

**Mega Tanks** (aka Battle Tanks) is a browser-based strategy tank game inspired by Battle City and classic RTS games. It features a full-stack architecture with a Python/FastAPI backend and vanilla JavaScript frontend, recreating the NES Battle City experience with modern enhancements.

### Core Features
- **Construction Mode**: Full-featured map editor with keyboard-driven tile placement, map validation, and image-to-map conversion
- **Play Mode**: Real-time tank combat with player movement, shooting, enemy AI, and power-ups
- **Procedural Map Generation**: Advanced algorithms (Perlin noise, cellular automata, symmetry patterns)
- **Image-to-Map Conversion**: Convert images to playable maps using edge detection and color classification
- **WebSocket Multiplayer**: Real-time game state synchronization at ~60 FPS
- **Extensible Game Modes**: Plugin architecture for custom game modes
- **Rich Tile System**: 50+ tile types with unique properties and behaviors

### Tech Stack
| Layer | Technology |
|-------|------------|
| Backend | Python 3.10+, FastAPI, uvicorn, asyncio |
| Frontend | Vanilla JavaScript (ES6), HTML5 Canvas, CSS |
| Real-time | WebSocket (JSON protocol) |
| Testing | pytest, pytest-asyncio, httpx, Playwright |
| Image Processing | Pillow, OpenCV, scikit-image, numpy |

---

## Project Structure

```
mega-tanks/
├── backend/                  # Python FastAPI server
│   ├── main.py              # Entry point, FastAPI app setup
│   ├── api.py               # REST API endpoints (maps, game control)
│   ├── ws.py                # WebSocket handler for real-time state
│   ├── game_engine.py       # Core game loop (~60 FPS), physics, collision
│   ├── map_model.py         # Map data model (64x42 grid)
│   ├── map_store.py         # Filesystem persistence for maps
│   ├── map_generator.py     # Procedural map generation algorithms
│   ├── image_to_map.py      # Image-to-map conversion algorithms
│   ├── tank.py              # Tank entity (player/enemy/companion)
│   ├── bullet.py            # Bullet entity (normal/grenade/missile)
│   ├── collision.py         # Collision detection helpers
│   ├── ai_controller.py     # Enemy AI, companion AI, turret AI
│   ├── enemy_spawner.py     # Enemy wave spawning logic
│   ├── powerup_manager.py   # Timed powerup spawning (Money, Sun, Mega Gun)
│   ├── explosion_manager.py # Explosion and TNT chain reactions
│   ├── sandworm_controller.py # Sandworm enemy (Dune-style)
│   ├── skeleton_controller.py # Skeleton creatures + Mega Skeleton boss
│   ├── bullet_manager.py    # Bullet lifecycle management
│   ├── tile_registry.py     # ALL tile type definitions (single source of truth)
│   ├── mode_registry.py     # Game mode definitions (extensible)
│   ├── session_store.py     # In-memory game session storage
│   └── tests/               # Backend unit tests
├── frontend/                # Static web assets
│   ├── index.html          # Main HTML (screens: title, editor, play, settings)
│   ├── app.js              # Screen router, settings UI, tile settings
│   ├── editor.js           # Map editor logic, keyboard controls
│   ├── game.js             # Game renderer, input handling, WebSocket
│   ├── gameState.js        # WebSocket state sync, state store
│   ├── hud.js              # HUD rendering (lives, score, enemies)
│   ├── tileRenderer.js     # Tile canvas rendering, special tiles
│   ├── tankRenderer.js     # Tank sprite rendering
│   ├── bulletRenderer.js   # Bullet rendering
│   ├── effectRenderer.js   # Explosions, effects rendering
│   ├── spriteAtlas.js      # Sprite sheet loading
│   ├── audio.js            # Sound effects manager
│   ├── viewport.js         # Camera/viewport calculations
│   ├── gameInput.js        # Keyboard input handling
│   ├── constants.js        # Grid dims (64x42), tile toggles, constants
│   └── style.css           # NES-style UI theme
├── maps/                    # Saved map JSON files
├── tests/                   # Integration & E2E tests
│   ├── verify_server.py    # HTTP smoke tests
│   └── e2e/                # Playwright browser tests
├── scripts/                 # Utility scripts
│   ├── generate_maps_demo.py
│   ├── demo_image_to_map.py
│   └── generate_sprites.py
├── requirements.txt         # Python dependencies
└── QWEN.md                 # This file
```

---

## Building and Running

### Start the Backend Server

```bash
# Default port 8000 (recommended - Chrome blocks 6666)
python -m backend.main

# Or on port 6666 (may be blocked by Chrome)
PORT=6666 python -m backend.main
```

The server serves:
- REST API at `/api/...`
- WebSocket at `/ws/game`
- Static frontend files at `/`

### Access the Application

Open `http://localhost:8000` (or `http://localhost:6666` if using that port) in a browser.

### Running Tests

```bash
# Backend unit tests
python -m pytest backend/tests/ -v

# Server verification (start server first)
python tests/verify_server.py

# E2E browser tests (requires Playwright)
pip install pytest-playwright
playwright install chromium
python -m pytest tests/e2e/ -v
```

### Map Generation Demo

```bash
# Generate sample maps procedurally
python scripts/generate_maps_demo.py

# Convert images to maps
python scripts/demo_image_to_map.py
```

---

## API Reference

### Map Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/maps` | GET | List all saved maps |
| `/api/maps` | POST | Save a new map (body: `{name, grid}`) |
| `/api/maps/{name}` | GET | Load a map by name |
| `/api/maps/{name}` | DELETE | Delete a map |
| `/api/maps/{name}/validate` | POST | Validate a map, return errors |
| `/api/maps/generate` | POST | Generate procedural map |
| `/api/maps/from-image` | POST | Convert image to map (multipart/form-data) |

### Game Control
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/game/start` | POST | Start game session (body: `{map_name, mode, session_id, settings}`) |
| `/api/game/stop` | POST | Stop game session (query: `session_id`) |

### Utilities
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tiles` | GET | Get all tile type definitions (for frontend palette) |

### WebSocket Protocol
**Endpoint**: `/ws/game?session_id=default`

**Client → Server**:
```json
{ "type": "input", "direction": "up|down|left|right|null", "fire": true|false }
{ "type": "pause" }
{ "type": "ping" }
```

**Server → Client**:
```json
{
  "type": "state",
  "grid": [[...]],           // Full grid or delta
  "player": {...},           // Tank state
  "enemies": [...],          // Array of enemy tanks
  "bullets": [...],          // Array of bullets
  "explosions": [...],       // Active explosions
  "score": 0,
  "lives": 3,
  "enemies_remaining": 20,
  "events": [{"type": "sound", "sound": "..."}],
  "rainbow_trails": {...},   // Rainbow powerup trails
  "sandworm": {...},         // Sandworm state
  "skeletons": [...],        // Skeleton creatures
  "result": "victory|defeat|null"
}
```

### Example: Generate a Map

```bash
curl -X POST http://localhost:8000/api/maps/generate \
  -H "Content-Type: application/json" \
  -d '{"style": "normal", "complexity": "medium", "symmetry": "horizontal"}'
```

### Example: Convert Image to Map

```bash
curl -X POST http://localhost:8000/api/maps/from-image \
  -F "file=@image.png" \
  -F "name=MY_MAP" \
  -F "symmetry=horizontal" \
  -F "style=balanced"
```

---

## Complete Tile Registry

### Tile Properties Explained

| Property | Description |
|----------|-------------|
| `tank_solid` | Tanks cannot pass through |
| `bullet_solid` | Bullets cannot pass through |
| `destructible` | Can be destroyed by bullets |
| `transparent` | Tanks are hidden when inside (forest) |
| `slippery` | Reduced friction (ice - tanks slide) |
| `is_base` | Eagle/HQ - destroying = game over |
| `speed_mult` | Speed multiplier for tanks (mud slows) |
| `is_explosive` | Detonates on hit, causing chain reactions |
| `non_repeating` | Renders as one big block instead of repeating pattern |
| `explosion_radius` | How many tiles out the blast reaches |

### All Tile Types (50 Total)

#### Basic Terrain (IDs 0-7)
| ID | Name | Label | Color | Tank | Bullet | Destruct | Special |
|----|------|-------|-------|------|--------|----------|---------|
| 0 | `empty` | Empty | `#1a1a2e` | ✗ | ✗ | ✗ | Passable |
| 1 | `brick` | Brick | `#c0522a` | ✓ | ✓ | ✓ | Standard wall |
| 2 | `steel` | Steel | `#7a8fa6` | ✓ | ✓ | ✗ | Indestructible |
| 3 | `water` | Water | `#1565c0` | ✓ | ✗ | ✗ | Blocks tanks only |
| 4 | `forest` | Forest | `#2e7d32` | ✗ | ✗ | ✗ | Hides tanks |
| 5 | `ice` | Ice | `#80deea` | ✗ | ✗ | ✗ | Tanks slide |
| 6 | `base` | Base | `#f5c518` | ✓ | ✓ | ✓ | **Game Over if destroyed** |
| 7 | `lava` | Lava | `#ff3300` | ✗ | ✗ | ✗ | Damages tanks (2s exposure) |

#### Mechanical Tiles (IDs 8-13)
| ID | Name | Label | Color | Tank | Bullet | Destruct | Special |
|----|------|-------|-------|------|--------|----------|---------|
| 8 | `conveyor_up` | Conv Up | `#333333` | ✗ | ✗ | ✗ | Moves tanks up |
| 9 | `conveyor_down` | Conv Down | `#333333` | ✗ | ✗ | ✗ | Moves tanks down |
| 10 | `conveyor_left` | Conv Left | `#333333` | ✗ | ✗ | ✗ | Moves tanks left |
| 11 | `conveyor_right` | Conv Right | `#333333` | ✗ | ✗ | ✗ | Moves tanks right |
| 12 | `mud` | Sand | `#c8a84b` | ✗ | ✗ | ✗ | **0.25× speed** |
| 13 | `ramp` | Ramp | `#ff9800` | ✗ | ✗ | ✗ | **Launches tanks (airborne)** |

#### Explosive Tiles (IDs 14, 36)
| ID | Name | Label | Color | Tank | Bullet | Destruct | Special |
|----|------|-------|-------|------|--------|----------|---------|
| 14 | `tnt` | TNT | `#d32f2f` | ✓ | ✓ | ✓ | **5×5 explosion** |
| 36 | `special_tnt` | Special TNT | `#d32f2f` | ✓ | ✓ | ✓ | **15×15 explosion** |

#### Glass System (IDs 15-17)
| ID | Name | Label | Color | Tank | Bullet | Destruct | Special |
|----|------|-------|-------|------|--------|----------|---------|
| 15 | `glass` | Glass | `#aaddff` | ✓ | ✓ | ✓ | Cracks on hit |
| 16 | `glass_crack1` | Glass C1 | `#aaddff` | ✓ | ✓ | ✓ | Stage 1 crack |
| 17 | `glass_crack2` | Glass C2 | `#aaddff` | ✓ | ✓ | ✓ | Stage 2 crack |

#### Decorative (ID 18)
| ID | Name | Label | Color | Tank | Bullet | Destruct | Special |
|----|------|-------|-------|------|--------|----------|---------|
| 18 | `sunflower` | Sunflower | `#ffeb3b` | ✗ | ✗ | ✗ | Cosmetic only |

#### Powerup Boxes (2×2 Blocks, IDs 23-35)

These are **2×2 tile blocks** that contain powerups. When the player drives over the pad tile, the entire box is consumed and the powerup activates.

| ID | Name | Label | Color | Effect |
|----|------|-------|-------|--------|
| 23 | `rainbow_pad` | Rainbow Pad | `#aaddff` | **Rainbow trail** (invincibility visual) |
| 24 | `grow_mushroom` | Mushroom | `#8bc34a` | **Mushroom mode** - tank grows 2× size, crushes bricks |
| 25 | `auto_turret` | Auto Turret | `#607d8b` | **Spawns allied turret** (auto-fires at enemies) |
| 28 | `mushroom_box` | Mush Box | `#8bc34a` | Contains mushroom powerup |
| 29 | `rainbow_crack2` | Rainbow C2 | `#ff69b4` | Rainbow box crack stage 2 |
| 30 | `rainbow_crack1` | Rainbow C1 | `#ff69b4` | Rainbow box crack stage 1 |
| 31 | `rainbow_box` | Rainbow Box | `#ff69b4` | Contains rainbow powerup |
| 32 | `chick_pad` | Chick | `#ffee58` | **Spawns companion tank** (follows player) |
| 33 | `chick_crack2` | Chick C2 | `#ffee58` | Chick box crack stage 2 |
| 34 | `chick_crack1` | Chick C1 | `#ffee58` | Chick box crack stage 1 |
| 35 | `chick_box` | Chick Box | `#ffee58` | Contains companion powerup |

#### Timed Powerups (Spawn During Gameplay, IDs 37-50)

**IMPORTANT**: These tiles spawn dynamically during gameplay and should **NEVER** be manually placed in the map editor. They have timers that control their lifespan and spawning behavior.

| ID | Name | Label | Color | Effect |
|----|------|-------|-------|--------|
| 37 | `money_pad` | Money | `#FFD700` | **Golden Eagle** - spawns money tiles, 30s duration |
| 38-40 | `money_crack*` | Money cracks | `#FFD700` | Money box damage states |
| 40 | `money_box` | Money Box | `#FFD700` | Contains money powerup |
| 41 | `golden_frame` | Gold Frame | `#DAA520` | Decorative arch (from Golden Eagle) |
| 42 | `bone_frame` | Bone Frame | `#F5F5DC` | Decorative arch (from Mega Skeleton) |
| 43 | `sun_pad` | Sun | `#FF8C00` | **Homing missile** - one-time use |
| 44-46 | `sun_crack*` | Sun cracks | `#FF8C00` | Sun box damage states |
| 46 | `sun_box` | Sun Box | `#FF8C00` | Contains sun powerup |
| 47 | `megagun_pad` | Mega Gun | `#4A4A4A` | **Dual grenade launchers**, 30s duration |
| 48-50 | `megagun_crack*` | MegaG cracks | `#4A4A4A` | Mega gun box damage states |
| 50 | `megagun_box` | MegaG Box | `#4A4A4A` | Contains mega gun powerup |

#### Letter Powerups (Timed Spawn Only, IDs 51–90)

**IMPORTANT**: These tiles spawn dynamically during gameplay and should **NEVER** be manually placed in the map editor. Each letter triggers a unique effect when the player drives over the pad tile.

| Letter | Effect | Pad ID | Box IDs | Duration | Description |
|--------|--------|--------|---------|----------|-------------|
| **B** | Banana | 51 | 52–54 | Instant | Two 4×4 impacts that destroy all destructibles (not steel/base) |
| **C** | Clone | 55 | 56–58 | 12s | Spawns ally clone that replays player inputs with 15-tick delay |
| **F** | Fireworks | 59 | 60–62 | Instant | 8-directional rays that crack glass boxes and stun enemies (2s) |
| **J** | Jump | 63 | 64–66 | 10s | Auto-hop over 1 blocking/hazard tile when moving forward |
| **R** | Rainbow World | 67 | 68–70 | 30s | Global rainbow color-cycle overlay (visual only) |
| **A** | Airplane | 71 | 72–74 | 10s | Plane flies across top, drops 3 airdrop crates with random rewards |
| **M** | Magnet | 75 | 76–78 | 5s | Pulls destructible tiles within radius 4 (Chebyshev) toward center |
| **S** | Sahur | 79 | 80–82 | 5s | Fast runner that destroys destructibles and stuns enemies on contact |
| **Z** | Zzz (Sleep) | 83 | 84–86 | Instant | Puts all enemies to sleep for 8 seconds |
| **O** | Octopus | 87 | 88–90 | 60s | Protects base tile from all damage (shield overlay) |

**Airdrop Rewards (A powerup):**
- Shield: 8s rainbow invincibility
- Homing: One sun missile
- Score: +500 points

**Tile Properties:**
- Pad tiles (51, 55, 59, 63, 67, 71, 75, 79, 83, 87): Not solid, not destructible
- Box/Crack tiles (52–54, 56–58, etc.): Tank solid, bullet solid, destructible
- All letter boxes are included in `BIG_BOX_IDS` and `BIG_BOX_OR_PAD_IDS`

#### Special Enemies (IDs 20-21)
| ID | Name | Label | Color | Description |
|----|------|-------|-------|-------------|
| 20 | `sandworm_head` | Worm Head | `#8b4513` | Sandworm head (Dune-style enemy) |
| 21 | `sandworm_body` | Worm Body | `#a0522d` | Sandworm body segment |

---

## Game Entities

### Tank Entity

```python
@dataclass
class Tank:
    id: str                    # Unique identifier
    row: float                 # Position (grid coordinates)
    col: float
    direction: str             # "up" | "down" | "left" | "right"
    speed: float               # Tiles per tick
    hp: int                    # Hit points
    alive: bool
    is_player: bool
    upgrade_level: int         # 0-3 (player only)
    fire_cooldown: int         # Ticks until can fire
    fire_rate: int             # Ticks between shots
    bullet_limit: int          # Max simultaneous bullets
    active_bullets: int        # Currently in flight
    tank_type: str             # "basic" | "fast" | "power" | "armor" | "companion" | "turret"
    color: str                 # Hex color
    # Buff states
    rainbow_ticks: int         # Rainbow invincibility timer
    mushroom_ticks: int        # Big tank (crushes bricks) timer
    mega_gun_ticks: int        # Dual grenade launcher timer
    is_big: bool               # Permanently big (companion)
    companion: Optional[Tank]  # Companion tank
    companion_ticks: int       # Companion duration
    # Letter powerup buffs (player only)
    clone_ticks: int           # Clone effect duration (C powerup)
    jump_ticks: int            # Jump ability duration (J powerup)
    # Debuff states
    lava_ticks: int            # Time spent in lava
    airborne_ticks: int        # Jump ramp airborne timer
    slide_dir: Optional[str]   # Ice sliding direction
    slide_ticks: int           # Ice slide duration
    sleep_ticks: int           # Sleep duration (enemies only, Z powerup)
```

### Enemy Types

| Type | HP | Speed | Color | Behavior |
|------|-----|-------|-------|----------|
| `basic` | 1 | 1.0× | `#e0e0e0` | Standard |
| `fast` | 1 | 1.8× | `#80cbc4` | Fast movement |
| `power` | 1 | 1.0× | `#ef9a9a` | Standard |
| `armor` | 4 | 0.8× | `#ffe082` | High HP, slow |

### Bullet Entity

```python
@dataclass
class Bullet:
    id: str
    owner_id: str            # Tank that fired
    is_player: bool
    row: float
    col: float
    direction: str
    speed: float             # Tiles per tick
    power: int               # 1 = destroys brick, 2+ = destroys steel
    ttl: int                 # Time to live (ticks)
    alive: bool
    crush_bricks: bool       # From mushroom buff
    # Special types
    is_grenade: bool         # Arcing explosion
    is_missile: bool         # Homing missile
    target_row: Optional[float]
    target_col: Optional[float]
    max_range: float         # For grenades
```

**Bullet Speeds**:
- Normal: `0.28` tiles/tick
- Fast (upgrade): `0.42` tiles/tick
- Missile: `0.25` tiles/tick

---

## Game Mechanics

### Movement System

**Tank Movement**:
- Base speed: `0.025` tiles/tick (adjustable via settings)
- Continuous movement while holding direction keys
- Ice tiles cause sliding (momentum continues after release)
- Mud tiles reduce speed to 25%
- Conveyor belts push tanks in their direction
- Ramps launch tanks airborne (45 ticks)

**Collision Detection**:
- Tank bounding box: `0.499` tiles (fits in 1-tile gaps)
- Big tanks (mushroom): `~1.0` tiles (can crush brick/steel)
- Collision checked against `tank_solid` tiles
- Base tile protected for player (cannot crush)

### Combat System

**Firing**:
- Fire rate: 25 ticks default (adjustable)
- Upgrade level 2+: 18 ticks, 2 bullets max
- Upgrade level 3: Fast bullets (power=2)
- Mushrooms enable brick-crushing bullets

**Damage**:
- Normal bullet: destroys destructible tiles
- Power bullet (lvl 3): destroys steel
- TNT: chain reactions with configurable radius
- Lava: 2s exposure = instant death
- Skeleton contact: 1 damage every 60 ticks

### Powerup System

**Timed Powerups** (spawn during gameplay):
- **Money Pad** (30s): Spawns money tiles that grant points
- **Sun Pad** (one-time): Fires homing missile at nearest enemy
- **Mega Gun** (30s): Dual grenade launchers

**Box Powerups** (placed in editor):
- **Mushroom**: Big tank mode, crushes walls
- **Rainbow**: Visual trail effect
- **Chick**: Spawns companion tank (30s)

**Companion Tank**:
- Follows player, orbits at angle
- Fires independently at enemies
- 999 HP, 1.5× player speed
- Can be multiple (from multiple chick boxes)

### Enemy Spawning

**Wave System**:
- Default: 20 total enemies
- Max 4 active on field
- Spawn interval: 90 ticks (1.5s)
- Spawn columns: left (0), center (32), right (63)

**Enemy Sequence** (repeating):
```
basic, basic, fast, basic, armor, power, fast, armor, ...
```

**AI Behavior**:
- Random direction changes
- Fire when aligned with player/base
- Avoid walls (simple pathfinding)
- Different speeds per type

### Special Enemies

**Sandworm** (Dune-style):
- Spawns from lava tiles
- Length: 4 segments (head + 3 body)
- 5 HP, moves every 30 ticks
- Immune to mud slowdown

**Skeleton Creatures**:
- Normal: 2×1 cells, 3 HP, spawn from lava
- Mega Skeleton: 8×4 cells, 12 HP, boss after 5 kills
- Contact damage: 1 HP every 60 ticks
- **Bone Arch**: Built around base after Mega Skeleton defeated

### Auto Turrets

**Static Defenders**:
- 2×2 tile blocks (placed in editor)
- 5 HP, stationary
- Auto-fire at nearest enemy
- Allied to player

### Win/Loss Conditions

**Victory**:
- Destroy all enemies (enemies_remaining = 0)
- Kill Mega Skeleton (if spawned)

**Defeat**:
- Base destroyed (tile ID 6 hit by bullet)
- Player lives = 0
- **Defeat sequence**: Base explosion animation, bricks scatter

---

## Procedural Map Generation

### Algorithms Used

1. **Perlin Noise**: Natural terrain distribution
   - 4 octaves, persistence 0.5
   - Scale: 20-50 (lower = larger features)

2. **Cellular Automata**: Cave-like structures
   - Initial fill: 35-55% probability
   - Rules: ≥5 neighbors = filled, <4 = empty
   - Smoothing: 2 iterations

3. **Symmetry Patterns**:
   - Horizontal, vertical, both, or none
   - Balanced competitive layouts

4. **Structured Placement**:
   - Vertical pillars (8-12 tile spacing)
   - Horizontal walls with symmetric gaps
   - Strategic choke points

5. **Terrain Layers**:
   - Base: Brick terrain from noise
   - Water: Low-lying areas, rivers
   - Forest: High noise values
   - Ice: Optional, high noise regions
   - Lava: Edge regions, optional

6. **Interactive Elements**:
   - TNT clusters (2-5 per cluster)
   - Auto turrets (max 8, near cover)
   - Steel reinforcements (10% of bricks)

### Generation Parameters

```python
@dataclass
class MapGenerationParams:
    seed: int = None
    symmetry: str = "horizontal"  # horizontal, vertical, both, none
    terrain_scale: float = 30.0   # Lower = larger features
    cave_density: float = 0.45    # Initial fill probability
    brick_coverage: float = 0.15
    steel_ratio: float = 0.1
    water_bodies: bool = True
    forest_patches: bool = True
    ice_regions: bool = False
    lava_pools: bool = False
    tnt_scatter: bool = True
    auto_turrets: bool = True
    base_protection: int = 3      # Tiles around base
```

### Complexity Levels

| Level | Scale | Cave Density | Features |
|-------|-------|--------------|----------|
| Simple | 50.0 | 0.35 | No water, no TNT |
| Medium | 30.0 | 0.45 | Water, forest, TNT, turrets |
| Complex | 20.0 | 0.50 | + Ice, lava, more features |

### Map Styles

- **Normal**: Standard balanced map
- **Arena**: Symmetric, competitive-focused
- **Cave**: Organic, cellular automata-heavy

---

## Image-to-Map Conversion

### Algorithm Pipeline

1. **Preprocessing**:
   - Resize to 64×42 using INTER_AREA
   - Convert to RGB and grayscale

2. **Edge Detection**:
   - Gaussian blur (5×5, σ=1.0)
   - Canny edges (thresholds: 50, 150)
   - Dilation to enhance edges

3. **Color Classification**:
   - RGB ranges for terrain types:
     - Water: Blue tones (priority 10)
     - Forest: Green tones (priority 9)
     - Lava: Red/orange (priority 8)
     - Ice: Light blue/white (priority 7)
     - Mud: Brown (priority 6)
     - Steel: Gray (priority 5)

4. **K-means Clustering**:
   - 8 clusters by default
   - Identifies coherent color regions
   - Large clusters become terrain features

5. **Wall Placement**:
   - Edges → Brick/Steel walls
   - Importance map determines steel vs brick
   - Probability: 70% placement

6. **Morphological Cleanup**:
   - Opening: Remove isolated pixels
   - Closing: Fill small gaps
   - 2×2 kernel

7. **Playability Validation**:
   - Flood fill from base
   - Minimum 70% reachable area
   - Auto-clear blocking tiles

8. **Base Clearance**:
   - 3-tile radius around base
   - Clear water, steel, lava, forest
   - Create escape paths

### Conversion Styles

| Style | Description |
|-------|-------------|
| Balanced | Good balance: visual fidelity + playability |
| Faithful | Maximizes visual similarity to original |
| Playable | Prioritizes gameplay over accuracy |
| Decorative | More decorative elements (TNT, glass) |

### Conversion Parameters

```python
@dataclass
class ImageConversionParams:
    grid_width: int = 64
    grid_height: int = 42
    symmetry: str = "horizontal"
    classify_colors: bool = True
    terrain_placement_probability: float = 0.8
    place_edge_walls: bool = True
    edge_wall_probability: float = 0.7
    steel_threshold: float = 0.7
    apply_morphology: bool = True
    base_clearance: int = 3
    create_escape_paths: bool = True
    min_reachable_ratio: float = 0.7
```

---

## Game Engine Architecture

### Main Loop

```python
async def _loop(self) -> None:
    while self.running:
        t0 = time.monotonic()
        self._tick()              # Update game state
        state = self._build_state()  # Build snapshot
        self.events.clear()
        await self._emit(state)   # Broadcast to clients
        elapsed = time.monotonic() - t0
        await asyncio.sleep(max(0.0, TICK_INTERVAL - elapsed))
```

**Tick Rate**: 60 FPS (16.67ms per tick)

### Subsystem Controllers

The engine uses a **component pattern** with specialized controllers:

| Controller | Responsibility |
|------------|----------------|
| `BulletManager` | Bullet movement, collision, lifecycle |
| `EnemySpawner` | Enemy wave spawning, cooldowns |
| `AIController` | Enemy AI, companion AI, turret AI |
| `PowerupManager` | Timed powerup spawning (Money, Sun, Mega Gun) |
| `SandwormController` | Sandworm movement, spawning |
| `SkeletonController` | Skeleton creatures, Mega Skeleton boss |
| `ExplosionManager` | Explosions, TNT chain reactions, defeat sequence |

### State Management

**Game State Snapshot** (broadcast via WebSocket):
```python
{
    "grid": [[...]],              # Full grid or delta
    "player": tank.to_dict(),
    "enemies": [tank.to_dict() for ...],
    "bullets": [bullet.to_dict() for ...],
    "explosions": [{"row": r, "col": c, "ticks": t}],
    "score": int,
    "lives": int,
    "enemies_remaining": int,
    "events": [...],
    "rainbow_trails": {...},
    "sandworm": {...},
    "skeletons": [...],
    "result": "victory|defeat|null"
}
```

### Mode System

**Extensible game modes** via `mode_registry.py`:

```python
class GameMode(ABC):
    def on_start(self, engine: "GameEngine") -> None: ...
    def on_tick(self, engine: "GameEngine") -> None: ...
    def on_end(self, engine: "GameEngine", result: str) -> None: ...
```

**Built-in Mode**: `construction_play`
- 20 enemies, 3 lives
- Defend base, destroy all enemies

**Future Modes** (extensible):
- Survival: Endless waves
- Time Attack: Speedrun mode
- Co-op AI: 2-player cooperative

---

## Frontend Architecture

### Screen Flow

```
┌─────────────┐
│ Title Screen│
└──────┬──────┘
       ├───→ Construction (Editor) ───→ Play Mode
       │         ↑                           │
       │         └───────────────────────────┘
       └───→ Settings ───→ Tile Settings
```

### Screen States

| Screen | Description |
|--------|-------------|
| `title-screen` | Main menu: Construction, Settings |
| `editor-screen` | Map editor with keyboard controls |
| `play-screen` | Game view with HUD |
| `settings-screen` | Game settings (speed, lives, etc.) |
| `tile-settings-screen` | Enable/disable tile types |

### Editor Controls

| Key | Action |
|-----|--------|
| Arrow keys | Move cursor |
| Space | Place tile (2×2 brush) |
| Tab | Cycle tile type |
| Shift+Tab | Previous tile |
| Ctrl+S | Save map |
| Enter | Launch/Play |
| Esc | Back to title |

### Game Controls

| Key | Action |
|-----|--------|
| Arrow keys | Move tank |
| Space | Fire bullet |
| P | Pause |
| Esc | Stop game |

### Rendering Pipeline

1. **Tile Rendering** (`tileRenderer.js`):
   - Grid drawn to canvas
   - Special tiles (sand, lava) use custom rendering
   - Cached for performance

2. **Tank Rendering** (`tankRenderer.js`):
   - Sprite-based from atlas
   - Direction-aware
   - Upgrade level visual (size, color)

3. **Bullet Rendering** (`effectRenderer.js`):
   - Simple rectangles
   - Direction-aware

4. **Explosion Rendering**:
   - Animated sprites
   - Multiple frames

5. **HUD Rendering** (`hud.js`):
   - Score, lives, enemies remaining
   - Map name
   - Powerup timers

### State Synchronization

**WebSocket Client** (`gameState.js`):
```javascript
class GameStateStore {
    apply(rawState) {
        // Merge with previous state
        // Track explosions (add new, tick existing)
        // Extract events for sound playback
    }
}
```

**Input Handling** (`gameInput.js`):
- Continuous movement (held keys)
- Fire on space hold
- Debounced input to server

---

## Settings System

### Game Settings (Persisted in localStorage)

| Category | Setting | Default | Range | Effect |
|----------|---------|---------|-------|--------|
| **Audio** | `mute_audio` | false | bool | Mute all sounds |
| **Display** | `cell_zoom` | 2.0× | 0.6-3.0 | Tile size multiplier |
| **Player** | `tank_speed` | 0.025 | 0.01-0.15 | Movement speed |
| | `player_fire_rate` | 25 | 5-120 | Ticks between shots |
| | `bullet_speed` | 0.28 | 0.10-0.90 | Bullet velocity |
| | `player_lives` | 3 | 1-9 | Respawn count |
| **Enemy** | `enemy_speed_mult` | 1.0× | 0.2-4.0 | Enemy speed multiplier |
| | `enemy_fire_rate` | 40 | 10-200 | Enemy fire rate |
| | `friendly_mode` | off | bool | Bullets pass through player |
| **Wave** | `total_enemies` | 20 | 5-100 | Total enemies to spawn |
| | `max_active_enemies` | 4 | 1-12 | Max on field at once |
| | `spawn_interval` | 90 | 10-600 | Ticks between spawns |

### Tile Settings (Persisted in localStorage)

Enable/disable specific tile types for map generation:
- `tile_brick`: Brick walls
- `tile_steel`: Steel walls
- `tile_water`: Water bodies
- `tile_forest`: Forest patches
- `tile_ice`: Ice regions
- `tile_lava`: Lava pools
- `tile_conveyor`: Conveyor belts
- `tile_mud`: Mud/sand slowdown
- `tile_ramp`: Jump ramps
- `tile_tnt`: TNT crates
- `tile_glass`: Glass walls
- `tile_sunflower`: Decorative sunflowers
- `tile_turret`: Auto turrets (2×2)
- `tile_mushroom_box`: Mushroom powerup boxes
- `tile_rainbow_box`: Rainbow powerup boxes
- `tile_chick_box`: Companion powerup boxes
- `tile_spec_tnt`: Special TNT (large explosion)

**Timed tiles** (Money, Sun, Mega Gun) cannot be disabled - they spawn dynamically.

---

## Key Constants

### Grid Dimensions
```javascript
GRID_W = 64   // Columns
GRID_H = 42   // Rows
CELL = 32     // Base tile size (pixels)
```

### Tank Constants
```python
TANK_SPEED = 0.025       # Tiles per tick
TANK_HALF = 0.499        # Collision half-extent
TICK_INTERVAL = 1/60     # 60 FPS
```

### Bullet Constants
```python
BULLET_SPEED = 0.28      # Normal bullet
FAST_BULLET_SPEED = 0.42 # Upgraded bullet
MISSILE_SPEED = 0.25     # Homing missile
```

### Spawn Constants
```python
SPAWN_COLS = [0, 32, 63]  # Left, center, right
ENEMY_SEQUENCE = ["basic", "basic", "fast", "basic", "armor", "power", "fast", "armor"]
MAX_ACTIVE_ENEMIES = 4
SPAWN_INTERVAL = 90       # Ticks
```

### Powerup Durations
```python
RAINBOW_DURATION = 1800   # 30 seconds (60 FPS)
MUSHROOM_DURATION = 600   # 10 seconds
MEGA_GUN_DURATION = 1800  # 30 seconds
COMPANION_DURATION = 1800 # 30 seconds
GOLDEN_EAGLE_DURATION = 1800 # 30 seconds
```

### Damage Timers
```python
LAVA_DAMAGE_TICKS = 120   # 2 seconds to death
AIRBORNE_TICKS = 45       # Jump ramp duration
CONTACT_DAMAGE_INTERVAL = 60  # Skeleton contact
```

---

## Development Conventions

### Python Backend
- **Type hints**: Python 3.10+ features (`|` union, `Optional`, `Dict`, `List`)
- **Async/await**: WebSocket handling, game loop
- **Dataclasses**: All data models (Tank, Bullet, Map, TileType)
- **Dependency injection**: Subsystem controllers receive engine reference
- **Test files**: `test_*.py` in `backend/tests/`

### JavaScript Frontend
- **ES6 modules**: `import`/`export`
- **Canvas-based**: No framework, direct 2D context rendering
- **Game loop**: `requestAnimationFrame`
- **State management**: Centralized store (`gameState.js`)
- **Constants**: Shared values in `constants.js`

### Testing Practices
- **Unit tests**: Backend logic (pytest)
- **Integration tests**: API endpoints (httpx)
- **E2E tests**: Browser automation (Playwright)
- **Smoke tests**: Server verification script

### Map Design Guidelines
1. **Base placement**: Bottom-center (row 40, col 32)
2. **Base protection**: Surround with bricks (traditional layout)
3. **Player spawn**: Left of base, clear area
4. **Enemy spawn**: Top row (row 0), 3 columns
5. **Balance**: Mix of cover (brick/steel) and open space
6. **Pathing**: Ensure routes from base to enemy spawn
7. **Powerups**: Place strategically (choke points, hidden areas)

---

## Troubleshooting

### Port 6666 Blocked
Chrome blocks port 6666 as "unsafe". Use port 8000 instead:
```bash
PORT=8000 python -m backend.main
```

### Maps Not Saving
Ensure `maps/` directory exists and is writable:
```bash
mkdir -p maps
chmod 755 maps
```

### Tests Failing
- Ensure server is running for integration tests
- Check port matches (6666 vs 8000)
- Install dependencies: `pip install -r requirements.txt`

### Canvas Rendering Issues
- Check `CELL` constant in `frontend/constants.js` (default 32px)
- Tile size = `CELL × cell_zoom` (zoom from settings)
- Canvas dimensions = grid size × cell size

### WebSocket Disconnects
- Ensure game session started via `/api/game/start`
- Check session_id matches between API and WebSocket
- Server logs show connection errors

### Map Generation Fails
- Validation errors: Check base tile count (must be exactly 1)
- Grid dimensions: Must be 64×42
- Playability: Algorithm auto-fixes unreachable areas

### Image Conversion Fails
- Image format: Must be valid (PNG, JPG, etc.)
- Image size: Any size (auto-resized to 64×42)
- Dependencies: Requires Pillow, OpenCV, scikit-image

---

## File Reference Guide

### Core Backend Files

| File | Purpose | Key Classes/Functions |
|------|---------|----------------------|
| `main.py` | FastAPI app entry | `app`, uvicorn runner |
| `api.py` | REST endpoints | `MapPayload`, `GameSettings`, `StartGamePayload` |
| `ws.py` | WebSocket handler | `game_websocket`, state streaming |
| `game_engine.py` | Core game loop | `GameEngine`, `_tick()`, `_loop()` |
| `map_model.py` | Map data model | `Map`, `GRID_WIDTH`, `GRID_HEIGHT` |
| `map_store.py` | Map persistence | `save_map()`, `load_map()`, `list_maps()` |
| `tile_registry.py` | Tile definitions | `TileType`, `TILE_REGISTRY`, `get_tile()` |
| `tank.py` | Tank entity | `Tank`, `make_player_tank()`, `make_enemy_tank()` |
| `bullet.py` | Bullet entity | `Bullet`, `BULLET_SPEED`, `FAST_BULLET_SPEED` |
| `collision.py` | Collision helpers | `can_big_tank_crush()` |

### Subsystem Controllers

| File | Purpose | Key Classes |
|------|---------|-------------|
| `ai_controller.py` | AI logic | `AIController` (enemies, companions, turrets) |
| `enemy_spawner.py` | Enemy spawning | `EnemySpawner` |
| `bullet_manager.py` | Bullet lifecycle | `BulletManager` |
| `powerup_manager.py` | Timed powerups | `PowerupManager` |
| `explosion_manager.py` | Explosions | `ExplosionManager` |
| `sandworm_controller.py` | Sandworm enemy | `SandwormController` |
| `skeleton_controller.py` | Skeleton creatures | `SkeletonController` |

### Map Generation

| File | Purpose | Key Classes/Functions |
|------|---------|----------------------|
| `map_generator.py` | Procedural generation | `AdvancedMapGenerator`, `PerlinNoise`, `CellularAutomata` |
| `image_to_map.py` | Image conversion | `ImageToMapConverter`, `ImagePreprocessor` |
| `mode_registry.py` | Game modes | `GameMode`, `ConstructionPlayMode` |

### Frontend Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `index.html` | Main HTML | Screen containers, canvas elements |
| `app.js` | Screen router | `showScreen()`, settings UI |
| `editor.js` | Map editor | `initEditor()`, `_render()`, `_bindEvents()` |
| `game.js` | Game renderer | `GameRenderer`, `startGame()`, `_tick()` |
| `gameState.js` | State sync | `GameStateStore`, `apply()` |
| `hud.js` | HUD rendering | `Hud`, `update()` |
| `tileRenderer.js` | Tile drawing | `drawSandTile()`, `drawLavaTile()` |
| `tankRenderer.js` | Tank sprites | `renderTanks()` |
| `effectRenderer.js` | Effects | `renderBullets()`, `renderExplosions()` |
| `spriteAtlas.js` | Sprite loading | `SpriteAtlas` |
| `audio.js` | Sound manager | `audioManager`, `play()` |
| `constants.js` | Constants | `TILE_TOGGLES`, `TIMED_TILE_IDS`, `GRID_W`, `GRID_H` |
| `gameInput.js` | Input handling | `GameInput`, key bindings |
| `viewport.js` | Camera | `computeViewport()`, `getCellZoom()` |

---

## Architecture Diagrams

### Backend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FastAPI App                          │
├─────────────────────────────────────────────────────────┤
│  REST API (/api/...)  │  WebSocket (/ws/game)          │
│  - maps CRUD          │  - state streaming             │
│  - game start/stop    │  - input handling              │
│  - map generation     │                                │
├─────────────────────────────────────────────────────────┤
│                    GameEngine                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Main Loop (60 FPS)                             │   │
│  │  - _tick()                                      │   │
│  │  - _build_state()                               │   │
│  │  - _emit()                                      │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Bullets  │ │ Enemies  │ │  Powerups│ │Explosions│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Sandworm  │ │Skeletons │ │   AI     │ │  Turrets │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│  Map Model  │  Tile Registry  │  Session Store        │
└─────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                       │
├─────────────────────────────────────────────────────────┤
│  Screen Router (app.js)                                 │
│  - Title Screen                                         │
│  - Editor Screen                                        │
│  - Play Screen                                          │
│  - Settings Screen                                      │
├─────────────────────────────────────────────────────────┤
│  Editor (editor.js)  │  Game (game.js)                 │
│  - Grid rendering    │  - Canvas rendering             │
│  - Keyboard input    │  - WebSocket client             │
│  - Map validation    │  - Input handling               │
├─────────────────────────────────────────────────────────┤
│  Renderers                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Tiles   │ │  Tanks   │ │ Bullets  │ │   HUD    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│  State Store  │  Audio  │  Sprite Atlas                │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────┐     HTTP      ┌──────────┐
│  Client  │ ────────────→ │   API    │
│          │ ←──────────── │          │
└──────────┘     JSON      └────┬─────┘
                                 │
                                 │ starts
                                 ↓
                          ┌─────────────┐
                          │ GameEngine  │
                          └──────┬──────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              WebSocket                   asyncio
                    │                         │
                    ↓                         ↓
            ┌──────────────┐         ┌──────────────┐
            │ State Stream │         │  Game Loop   │
            │   (60 FPS)   │         │   (_tick)    │
            └──────────────┘         └──────────────┘
```

---

## Extending the Game

### Adding New Tile Types

1. **Add to `tile_registry.py`**:
```python
TILE_REGISTRY[ID] = TileType(
    id=ID, name="name", label="Label",
    color="#RRGGBB",
    tank_solid=False, bullet_solid=False, destructible=False,
    transparent=False, slippery=False,
    # Optional:
    speed_mult=0.5, is_explosive=True, explosion_radius=3,
)
```

2. **Add constants**:
```python
NEW_TILE = ID
```

3. **Update frontend `constants.js`**:
```javascript
{ key: "tile_new", label: "NEW", ids: [ID], color: "#RRGGBB" }
```

4. **Implement behavior in `game_engine.py`** (if special logic needed)

### Adding New Game Modes

1. **Create mode class** in `mode_registry.py`:
```python
class SurvivalMode(GameMode):
    name = "survival"
    label = "Survival"
    description = "Endless waves of enemies"

    def on_start(self, engine):
        engine.total_enemies = 999
        engine.enemies_remaining = 999
        engine.player_lives = 1

    def on_tick(self, engine):
        # Custom logic
        pass
```

2. **Register in `MODE_REGISTRY`**:
```python
MODE_REGISTRY["survival"] = SurvivalMode()
```

3. **Update frontend** to allow mode selection

### Adding New Enemy Types

1. **Add to `tank.py`**:
```python
ENEMY_TYPES["sniper"] = {
    "hp": 1, "speed": TANK_SPEED * 0.5,
    "color": "#ff0000", "label": "Sniper",
}
```

2. **Add to enemy sequence** in `game_engine.py`:
```python
ENEMY_SEQUENCE = [..., "sniper", ...]
```

3. **Implement AI behavior** in `ai_controller.py` (if special logic needed)

### Adding New Powerups

1. **Add tile type** (see "Adding New Tile Types")

2. **Add collection logic** in `game_engine.py` `_tick()` method:
```python
elif tid == NEW_POWERUP:
    # Collect powerup
    tank.new_powerup_ticks = 1800  # 30s
    # Clear tile from grid
    self.events.append({"type": "sound", "sound": "powerup-pickup"})
```

3. **Add effect logic** in `_tick()` (apply powerup each frame)

4. **Add rendering** in frontend (if visual effect needed)

---

## Performance Considerations

### Backend Optimization

- **Async I/O**: WebSocket and game loop run on asyncio event loop
- **State delta**: Only send changed grid tiles (future optimization)
- **Subsystem controllers**: Isolated logic for maintainability
- **Object pooling**: Consider for bullets/explosions (future)

### Frontend Optimization

- **Canvas caching**: Grid rendered to offscreen canvas (future)
- **Sprite atlas**: Single image for all sprites
- **RequestAnimationFrame**: Sync with display refresh rate
- **Input debouncing**: Throttle WebSocket messages

### WebSocket Payload

Typical state snapshot:
- Grid: 64×42 integers (~10KB uncompressed)
- Tanks: ~10 objects (~500 bytes)
- Bullets: ~20 objects (~1KB)
- Explosions: ~5 objects (~200 bytes)
- **Total**: ~12KB per frame × 60 FPS = ~720 KB/s

---

## Adding New Letter Powerups

To add a new letter powerup in the future:

### 1. Allocate Tile IDs
- Use the next 4 consecutive IDs (currently 91–94 would be next)
- Follow the pattern: pad, crack2, crack1, box

### 2. Update `backend/tile_registry.py`
- Add `TileType` entries for all 4 tiles
- Add constants (e.g., `NEW_PAD = 91`)
- Add box ID set (e.g., `NEW_BOX_IDS = {92, 93, 94}`)
- Add to `GLASS_BOX_GROUPS` dict
- Add to `LETTER_BOX_IDS` and `LETTER_PAD_IDS` sets
- Add to `LETTER_EFFECT_MAP` dict

### 3. Update `frontend/constants.js`
- Add to `TILE_TOGGLES` array (for reference)
- Add all 4 IDs to `TIMED_TILE_IDS`
- Add crack IDs to `NON_MANUAL_TILE_IDS`

### 4. Update `backend/powerup_manager.py`
- Add to `LETTER_EFFECTS` list with box tile ID

### 5. Update `backend/game_engine.py`
- Add import for new tile constants
- Add effect trigger method (e.g., `_trigger_new_effect()`)
- Add tick method if needed (e.g., `_tick_new_effect()`)
- Add to `_trigger_letter_effect()` dispatcher
- Add state fields if needed
- Add to `_build_state()` for frontend rendering

### 6. Update `backend/tank.py` (if needed)
- Add buff/debuff fields to `Tank` dataclass
- Update `to_dict()` method

### 7. Update `backend/ai_controller.py` (if needed)
- Handle new effect in enemy AI

### 8. Update `frontend/effectRenderer.js`
- Add rendering logic for the new effect

### 9. Update `frontend/game.js`
- Add letter emoji mapping in `_drawTileDetail()`

### 10. Add Tests
- Add to `backend/tests/test_letter_powerups.py`

### 11. Update Documentation
- Update this QWEN.md file

---

## Security Considerations

### Input Validation
- Map validation: Grid dimensions, base count
- Settings validation: Min/max ranges via Pydantic
- WebSocket messages: JSON schema validation

### Session Management
- In-memory session store (no persistence)
- Default session_id: "default"
- Multiple sessions supported via query param

### File System
- Map files: Sanitized names (alphanumeric + `-_.`)
- Maps directory: Created if missing
- No user file upload (except image-to-map conversion)

---

## Future Enhancements

### Planned Features
- [ ] Custom enemy AI scripts
- [ ] Map sharing (export/import JSON)
- [ ] Mobile touch controls
- [ ] Soundtrack music
- [ ] More game modes (capture the flag, king of the hill)

### Technical Improvements
- [ ] Grid delta compression (WebSocket optimization)
- [ ] Object pooling (bullets, explosions)
- [ ] WebAssembly for image processing
- [ ] Service worker (offline support)
- [ ] Progressive Web App (installable)
- [ ] Database persistence (PostgreSQL/MongoDB)

---

## Credits

**Inspired by**: Battle City (NES, 1985)

**Tech Stack**:
- FastAPI: Modern Python web framework
- Canvas API: Hardware-accelerated 2D rendering
- WebSocket: Real-time bidirectional communication

**Algorithms**:
- Perlin noise: Ken Perlin (1983)
- Cellular automata: John Conway's Game of Life variant
- Canny edge detection: John Canny (1986)
- K-means clustering: Stuart Lloyd (1957)


