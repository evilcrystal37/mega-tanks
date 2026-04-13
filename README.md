# Mega Tanks

A browser-based game inspired by the NES classic **Battle City**. Design your own maps in a built-in editor, save them, then defend your base against waves of enemy tanks — all running in real time with a Python backend and a vanilla JavaScript frontend.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Server](#running-the-server)
- [Gameplay](#gameplay)
  - [Construction Mode (Map Editor)](#construction-mode-map-editor)
  - [Play Mode](#play-mode)
  - [Enemy Archetypes](#enemy-archetypes)
  - [Terrain & Tiles](#terrain--tiles)
  - [Tank Upgrades](#tank-upgrades)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Protocol](#websocket-protocol)
- [Testing](#testing)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Known Issues](#known-issues)

---

## Features

- **Map Editor** — paint a 64×42 tile grid with a full palette of terrain types, save/load maps as JSON, and validate them before play
- **Real-time Game Engine** — server-side game loop running at ~60 Hz, broadcasting state snapshots to the client over WebSocket
- **Diverse Tile Set** — bricks, steel, water, forest, ice, lava, conveyors, mud, ramps, TNT chains, glass, auto-turrets, and more
- **Enemy AI** — four enemy archetypes with patrol and attack behaviors; AI scaffolding designed to be easily extended
- **Tank Upgrades** — collect stars to increase bullet count, fire rate, and steel-piercing capability
- **Companions & Special Mechanics** — chick companions, sandworms, golden eagle timers, money tiles, rainbow/mushroom pads, box progressions
- **Audio & Sprite Atlas** — retro sound effects and a sprite atlas renderer with NES-style pixel art aesthetics
- **Friendly Mode** — optional setting to disable friendly fire

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3, FastAPI, Uvicorn, WebSockets, Pydantic v2 |
| **Frontend** | Vanilla JavaScript (ES modules), HTML5 Canvas 2D, CSS |
| **Fonts** | Google Fonts — "Press Start 2P" |
| **Testing** | Pytest, pytest-asyncio, httpx, Playwright (E2E) |
| **Asset Generation** | Pillow (optional, for regenerating sprites) |

No frontend build step is required — the backend serves the `frontend/` directory as static files.

---

## Project Structure

```
mega-tanks/
├── backend/
│   ├── main.py            # FastAPI app & Uvicorn entry point
│   ├── api.py             # REST API router
│   ├── ws.py              # WebSocket handler (/ws/game)
│   ├── game_engine.py     # Core game loop & physics (GameEngine class)
│   ├── tank.py            # Player and enemy tank entities
│   ├── bullet.py          # Bullet entity
│   ├── tile_registry.py   # All tile type definitions
│   ├── map_model.py       # Map schema & default grid (64×42)
│   ├── map_store.py       # Map persistence (maps/ directory)
│   ├── mode_registry.py   # Game mode definitions (ConstructionPlayMode)
│   ├── ai_interface.py    # AIAgent abstract class & PatrolAgent
│   └── tests/             # Pytest unit tests
│       ├── test_map_model.py
│       ├── test_map_store.py
│       └── test_tile_registry.py
├── frontend/
│   ├── index.html         # App shell
│   ├── app.js             # Screen routing & UI orchestration
│   ├── editor.js          # Map editor logic
│   ├── game.js            # Canvas renderer & game client
│   ├── hud.js             # HUD (score, lives, stars, enemy count)
│   ├── api.js             # REST API client
│   ├── audio.js           # Sound effects
│   ├── spriteAtlas.js     # Sprite sheet rendering
│   ├── style.css          # NES-style UI stylesheet
│   └── assets/            # Images, sprite sheets
├── maps/                  # Saved map JSON files
├── tests/
│   ├── verify_server.py   # Manual integration smoke test
│   └── e2e/               # Playwright end-to-end tests (currently skipped)
├── scripts/
│   └── generate_sprites.py  # Sprite asset generation (requires Pillow)
└── requirements.txt
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- A modern browser (Chrome, Firefox, Safari, Edge)

> **Chrome note:** Chrome blocks certain ports as unsafe (including 6666). Use the default port **8000** for local development.

### Installation

Clone the repository and install Python dependencies:

```bash
git clone https://github.com/<your-username>/mega-tanks.git
cd mega-tanks
pip install -r requirements.txt
```

### Running the Server

Start the server from the **project root** (so `backend` is importable as a package):

```bash
python -m backend.main
```

Then open your browser at [http://localhost:8000](http://localhost:8000).

The port can be overridden with the `PORT` environment variable:

```bash
PORT=9000 python -m backend.main
```

---

## Gameplay

### Construction Mode (Map Editor)

1. From the **Title Screen**, select **Construction**.
2. Choose a tile from the **palette** and paint the 64×42 grid.
3. Use the toolbar to **Generate** a random map, **Clear** the grid, or **Save** with a name.
4. Load any previously saved map from the list, or **Delete** maps you no longer need.
5. Hit **Play** to launch a session on your current map.

A map must pass server-side validation before play begins (base tile placement is required).

### Play Mode

The default game mode (`construction_play`) starts with:

| Setting | Value |
|---|---|
| Enemy count | 20 |
| Player lives | 3 |
| Win condition | Destroy all enemies |
| Lose condition | Base destroyed **or** all lives lost |

The frontend connects to the backend over WebSocket and renders server-authoritative state snapshots on an HTML5 Canvas at ~60 fps.

### Enemy Archetypes

| Type | Description |
|---|---|
| `basic` | Standard speed and health |
| `fast` | High movement speed, low health |
| `power` | High-damage bullets |
| `armor` | Multiple hit points, slow |

### Terrain & Tiles

| Tile | Behavior |
|---|---|
| **Brick** | Destroyed by bullets |
| **Steel** | Blocks bullets (requires upgraded tank to pierce) |
| **Water** | Impassable to tanks; bullets pass through |
| **Forest** | Tanks and bullets pass through; tanks are concealed |
| **Ice** | Tanks slide (reduced friction) |
| **Lava** | Damages tanks on contact |
| **Conveyor** (4 directions) | Pushes tanks in a fixed direction |
| **Mud / Sand** | Reduces tank speed |
| **Ramp** | Launches tanks into an airborne state |
| **TNT / Special TNT** | Explodes on contact; chains to adjacent TNT |
| **Glass** | Multi-stage crack progression before breaking |
| **Auto-Turret** | 2×2 placement; fires automatically at enemies |
| **Sandworm** | Snake-like roaming hazard |
| **Rainbow / Mushroom / Chick pads** | Special progression tiles |
| **Money / Golden Frame** | Triggers golden eagle timer mechanic |
| **Base (Eagle)** | Protect this — losing it ends the game |

### Tank Upgrades

Collect **star pickups** to upgrade your tank across three levels:

| Stars | Effect |
|---|---|
| 1 | Increased fire rate |
| 2 | Multiple simultaneous bullets |
| 3 | Bullets pierce steel tiles |

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tiles` | Returns tile metadata for the editor palette |
| `GET` | `/api/maps` | List all saved maps |
| `POST` | `/api/maps` | Save a new map |
| `GET` | `/api/maps/{name}` | Load a specific map by name |
| `DELETE` | `/api/maps/{name}` | Delete a map |
| `POST` | `/api/maps/{name}/validate` | Validate a map before play |
| `POST` | `/api/game/start` | Start a game session |
| `POST` | `/api/game/stop` | Stop a game session (`?session_id=...`) |

**Start game request body:**

```json
{
  "map_name": "my-map",
  "mode": "construction_play",
  "session_id": "unique-session-id",
  "settings": {
    "friendly_mode": false
  }
}
```

### WebSocket Protocol

Connect to `ws://localhost:8000/ws/game?session_id=<session_id>`.

**Client → Server messages:**

```json
{ "type": "input", "direction": "up" | "down" | "left" | "right", "fire": true }
{ "type": "pause" }
{ "type": "ping" }
```

**Server → Client messages:**

```json
{ "type": "state", "data": { ... } }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

---

## Testing

### Unit Tests (backend)

```bash
pytest backend/tests/
```

Covers map model validation, map store filesystem operations, and tile registry.

### Integration Smoke Test

Requires a running server (default port 6666 for this script — use `PORT=6666 python -m backend.main`):

```bash
python tests/verify_server.py
```

### End-to-End Tests (Playwright)

E2E tests live in `tests/e2e/` but are currently skipped until `pytest-playwright` is installed:

```bash
pip install pytest-playwright
playwright install chromium
pytest tests/e2e/
```

---

## Scripts

### `scripts/generate_sprites.py`

Regenerates sprite sheet assets. Requires [Pillow](https://pillow.readthedocs.io/):

```bash
pip install Pillow
python scripts/generate_sprites.py
```

This is only needed if you want to modify or regenerate the pixel art assets.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Port the server listens on |

CORS is configured to allow all origins (`*`) — suitable for local development. For production, restrict `allow_origins` in `backend/main.py`.

Maps are stored as JSON files in the `maps/` directory at the project root.

---

## Known Issues

- **Port mismatch:** `backend/main.py` defaults to port **8000**, but `tests/verify_server.py` and `tests/e2e/conftest.py` expect port **6666**. Run the server with `PORT=6666` only when running those scripts, or update the scripts to match port 8000.
- **`test_word_logic.py`:** `backend/tests/test_word_logic.py` imports `backend.word_logic`, which does not currently exist in the repository. This test will fail until the module is added.

---

## License

This project is not yet licensed. Add a `LICENSE` file before publishing.
