"""
api.py — REST API endpoints for map management and game control.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional
from io import BytesIO

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from .map_model import Map
from .map_store import save_map, load_map, list_maps, delete_map
from .session_store import session_store
from .tile_registry import all_tiles, TILE_REGISTRY, BONE_FRAME
from .map_generator import generate_map, generate_symmetric_arena, generate_cave_map, MapGenerationParams, AdvancedMapGenerator
from .image_to_map import convert_image_to_map, ImageConversionParams, ImageToMapConverter

router = APIRouter()

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
    tile_settings: Optional[Dict[str, bool]] = Field(default=None, description="Tile type enable/disable settings")


class StartGamePayload(BaseModel):
    map_name: str
    mode: str = "construction_play"
    session_id: str = "default"
    settings: Optional[GameSettings] = None


class MapGenerationPayload(BaseModel):
    """Payload for generating a new map."""
    name: Optional[str] = None
    seed: Optional[int] = None
    symmetry: str = "horizontal"  # horizontal, vertical, both, none
    complexity: str = "medium"    # simple, medium, complex
    style: str = "normal"         # normal, arena, cave
    water_bodies: bool = True
    forest_patches: bool = True
    ice_regions: bool = False
    lava_pools: bool = False
    tnt_scatter: bool = True
    auto_turrets: bool = True
    save_map_flag: bool = True    # Whether to save the generated map


class ImageToMapPayload(BaseModel):
    """Payload for image-to-map conversion."""
    name: Optional[str] = None
    symmetry: str = "horizontal"  # none, horizontal, vertical, both
    style: str = "balanced"       # balanced, faithful, playable, decorative
    save_map_flag: bool = True


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
        if t.id != BONE_FRAME
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
    name = payload.name.strip()
    if not name:
        import uuid
        name = f"MAP_{uuid.uuid4().hex[:6].upper()}"
    m = Map(name=name, grid=payload.grid)
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
# Map generation
# ---------------------------------------------------------------------------

@router.post("/api/maps/generate")
def generate_new_map(payload: MapGenerationPayload):
    """
    Generate a new map using procedural algorithms.

    Uses a combination of:
    - Perlin noise for natural terrain distribution
    - Cellular automata for organic cave-like structures
    - Symmetry patterns for balanced layouts
    - Strategic placement of interactive elements
    """
    # Build generation params
    params = MapGenerationParams(
        seed=payload.seed,
        symmetry=payload.symmetry,
        water_bodies=payload.water_bodies,
        forest_patches=payload.forest_patches,
        ice_regions=payload.ice_regions,
        lava_pools=payload.lava_pools,
        tnt_scatter=payload.tnt_scatter,
        auto_turrets=payload.auto_turrets,
    )

    # Adjust terrain scale based on complexity
    if payload.complexity == "simple":
        params.terrain_scale = 50.0
        params.cave_density = 0.35
    elif payload.complexity == "complex":
        params.terrain_scale = 20.0
        params.cave_density = 0.5
    else:  # medium
        params.terrain_scale = 30.0
        params.cave_density = 0.45

    # Generate based on style
    if payload.style == "arena":
        generated_map = generate_symmetric_arena(name=payload.name, seed=payload.seed)
    elif payload.style == "cave":
        generated_map = generate_cave_map(name=payload.name, seed=payload.seed)
    else:
        generator = AdvancedMapGenerator(params)
        generated_map = generator.generate(name=payload.name)

    # Validate
    errors = generated_map.validate()
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    # Save if requested
    saved_path = None
    if payload.save_map_flag:
        saved_path = str(save_map(generated_map))

    return {
        "generated": True,
        "name": generated_map.name,
        "seed": params.seed,
        "grid_size": f"{len(generated_map.grid[0])}x{len(generated_map.grid)}",
        "saved_path": saved_path,
    }


# ---------------------------------------------------------------------------
# Image-to-Map conversion
# ---------------------------------------------------------------------------

@router.post("/api/maps/from-image")
def convert_image_to_new_map(
    file: UploadFile = File(..., description="Image file to convert"),
    name: Optional[str] = Form(None),
    symmetry: str = Form("horizontal"),
    style: str = Form("balanced"),
    save_map_flag: bool = Form(True)
):
    """
    Convert an image to a Battle Tanks map using smart algorithms.

    Uses a combination of:
    - Canny edge detection for wall placement
    - Color-based terrain classification (water, forest, ice, lava)
    - K-means clustering for coherent structures
    - Brightness-based obstacle placement
    - Morphological operations for structure cleanup
    - A* pathfinding validation for playability

    Styles:
    - balanced: Good balance between visual fidelity and playability
    - faithful: Maximizes visual similarity to the original image
    - playable: Prioritizes gameplay over visual accuracy
    - decorative: Creates visually rich maps with more decorative elements
    """
    try:
        # Read image bytes
        image_bytes = file.file.read()
        
        # Convert using image-to-map algorithm
        from PIL import Image
        from io import BytesIO
        
        image = Image.open(BytesIO(image_bytes))
        
        # Convert based on style
        generated_map = convert_image_to_map(
            image,
            name=name,
            symmetry=symmetry,
            style=style
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process image: {str(e)}")

    # Validate
    errors = generated_map.validate()
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    # Save if requested
    saved_path = None
    if save_map_flag:
        saved_path = str(save_map(generated_map))

    return {
        "converted": True,
        "name": generated_map.name,
        "grid_size": f"{len(generated_map.grid[0])}x{len(generated_map.grid)}",
        "style": style,
        "symmetry": symmetry,
        "saved_path": saved_path,
    }


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
    session_store.set_engine(payload.session_id, engine)
    await engine.start()
    speed = engine.player.speed if engine.player else None
    lives = engine.player_lives
    enemies = engine.total_enemies
    print(f"[GAME START] map={payload.map_name} speed={speed} lives={lives} enemies={enemies}")
    return {"started": True, "session_id": payload.session_id}


@router.post("/api/game/stop")
def stop_game(session_id: str = "default"):
    """Stop a running game session."""
    engine = session_store.pop_engine(session_id)
    if engine:
        engine.stop()
        return {"stopped": True}
    return {"stopped": False, "detail": "No active session."}


def get_engine(session_id: str = "default") -> Optional[Any]:
    return session_store.get_engine(session_id)
