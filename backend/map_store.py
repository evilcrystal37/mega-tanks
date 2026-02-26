"""
map_store.py — Filesystem-based map persistence (JSON files in maps/).
"""

import json
import os
from pathlib import Path

from .map_model import Map

# Resolve the maps/ directory relative to the project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = _PROJECT_ROOT / "maps"


def _ensure_dir() -> None:
    MAPS_DIR.mkdir(parents=True, exist_ok=True)


def _map_path(name: str) -> Path:
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_ ").strip()
    return MAPS_DIR / f"{safe_name}.json"


def save_map(map_obj: Map) -> Path:
    """Persist a Map to disk. Returns the path written."""
    _ensure_dir()
    path = _map_path(map_obj.name)
    path.write_text(map_obj.to_json(), encoding="utf-8")
    return path


def load_map(name: str) -> Map:
    """Load a Map from disk by name. Raises FileNotFoundError if missing."""
    path = _map_path(name)
    if not path.exists():
        raise FileNotFoundError(f"Map '{name}' not found.")
    return Map.from_json(path.read_text(encoding="utf-8"))


def list_maps() -> list[str]:
    """Return a sorted list of saved map names (without .json extension)."""
    _ensure_dir()
    return sorted(p.stem for p in MAPS_DIR.glob("*.json"))


def delete_map(name: str) -> bool:
    """Delete a map file. Returns True if deleted, False if it didn't exist."""
    path = _map_path(name)
    if path.exists():
        path.unlink()
        return True
    return False
