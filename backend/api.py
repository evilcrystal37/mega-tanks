"""
api.py — REST API endpoints for map management and game control.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .map_model import Map
from .map_store import save_map, load_map, list_maps, delete_map
from .tile_registry import all_tiles, TILE_REGISTRY

router = APIRouter()

# Active game engines stored globally (keyed by session id)
# In a production app you'd use a proper session store
_active_engines: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MapPayload(BaseModel):
    name: str
    grid: list[list[int]]


class GameSettings(BaseModel):
    tank_speed: float = Field(default=0.025, ge=0.005, le=0.15)
    enemy_speed_mult: float = Field(default=1.0, ge=0.1, le=5.0)
    bullet_speed: float = Field(default=0.28, ge=0.05, le=1.0)
    player_fire_rate: int = Field(default=25, ge=3, le=120)
    enemy_fire_rate: int = Field(default=40, ge=5, le=200)
    player_lives: int = Field(default=3, ge=1, le=9)
    total_enemies: int = Field(default=20, ge=1, le=100)
    max_active_enemies: int = Field(default=4, ge=1, le=12)
    spawn_interval: int = Field(default=90, ge=10, le=600)
    friendly_mode: int = Field(default=0)


class StartGamePayload(BaseModel):
    map_name: str
    mode: str = "construction_play"
    session_id: str = "default"
    settings: Optional[GameSettings] = None


# ---------------------------------------------------------------------------
# Tile metadata (for frontend palette)
# ---------------------------------------------------------------------------

@router.get("/api/tiles")
def get_tiles():
    """Return all tile type definitions for the frontend palette."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "label": t.label,
            "color": t.color,
            "tank_solid": t.tank_solid,
            "bullet_solid": t.bullet_solid,
            "destructible": t.destructible,
            "transparent": t.transparent,
            "slippery": t.slippery,
            "is_base": t.is_base,
            "non_repeating": t.non_repeating,
        }
        for t in all_tiles()
    ]


# ---------------------------------------------------------------------------
# Map management
# ---------------------------------------------------------------------------

@router.get("/api/maps")
def get_maps():
    """List all saved maps."""
    return {"maps": list_maps()}


@router.post("/api/maps")
def create_map(payload: MapPayload):
    """Save a new or updated map."""
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Map name cannot be empty.")
    m = Map(name=payload.name.strip(), grid=payload.grid)
    errors = m.validate()
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    save_map(m)
    return {"saved": m.name}


@router.get("/api/maps/{name}")
def get_map(name: str):
    """Load a map by name."""
    try:
        m = load_map(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found.")
    return m.to_dict()


@router.delete("/api/maps/{name}")
def remove_map(name: str):
    """Delete a map."""
    deleted = delete_map(name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found.")
    return {"deleted": name}


@router.post("/api/maps/{name}/validate")
def validate_map(name: str):
    """Validate a saved map and return any errors."""
    try:
        m = load_map(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Map '{name}' not found.")
    errors = m.validate()
    return {"valid": len(errors) == 0, "errors": errors}


# ---------------------------------------------------------------------------
# Game session control
# ---------------------------------------------------------------------------

@router.post("/api/game/start")
async def start_game(payload: StartGamePayload):
    """Start a game session for a given map."""
    from .game_engine import GameEngine

    try:
        m = load_map(payload.map_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Map '{payload.map_name}' not found.")

    errors = m.validate()
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    settings_dict = payload.settings.model_dump() if payload.settings else None
    engine = GameEngine(map_obj=m, mode_name=payload.mode, settings=settings_dict)
    _active_engines[payload.session_id] = engine
    await engine.start()
    speed = engine.player.speed if engine.player else None
    lives = engine.player_lives
    enemies = engine.total_enemies
    print(f"[GAME START] map={payload.map_name} speed={speed} lives={lives} enemies={enemies}")
    return {"started": True, "session_id": payload.session_id}


@router.post("/api/game/stop")
def stop_game(session_id: str = "default"):
    """Stop a running game session."""
    engine = _active_engines.pop(session_id, None)
    if engine:
        engine.stop()
        return {"stopped": True}
    return {"stopped": False, "detail": "No active session."}


def get_engine(session_id: str = "default") -> Optional[Any]:
    return _active_engines.get(session_id)
