"""
Integration tests for REST API endpoints.
"""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.map_model import GRID_HEIGHT, GRID_WIDTH, Map
from backend.session_store import session_store


@pytest.fixture
def client(tmp_path):
    # Use a temporary maps directory and isolate active sessions.
    with patch("backend.map_store.MAPS_DIR", tmp_path), patch.object(session_store, "_engines", {}):
        with TestClient(app) as c:
            yield c


def _map_payload(name="API_TEST"):
    m = Map(name=name)
    return {"name": m.name, "grid": m.grid}


def test_get_tiles_returns_registry_fields(client):
    r = client.get("/api/tiles")
    assert r.status_code == 200
    tiles = r.json()
    assert isinstance(tiles, list)
    assert any(t["name"] == "brick" for t in tiles)
    assert all("tank_solid" in t and "bullet_solid" in t for t in tiles)


def test_map_crud_flow(client):
    payload = _map_payload("CRUD_MAP")
    r_save = client.post("/api/maps", json=payload)
    assert r_save.status_code == 200
    assert r_save.json()["saved"] == "CRUD_MAP"

    r_get = client.get("/api/maps/CRUD_MAP")
    assert r_get.status_code == 200
    body = r_get.json()
    assert body["name"] == "CRUD_MAP"
    assert len(body["grid"]) == GRID_HEIGHT
    assert len(body["grid"][0]) == GRID_WIDTH

    r_list = client.get("/api/maps")
    assert r_list.status_code == 200
    assert "CRUD_MAP" in r_list.json()["maps"]

    r_del = client.delete("/api/maps/CRUD_MAP")
    assert r_del.status_code == 200
    assert r_del.json()["deleted"] == "CRUD_MAP"


def test_start_and_stop_game_session(client):
    payload = _map_payload("PLAY_MAP")
    client.post("/api/maps", json=payload)

    r_start = client.post(
        "/api/game/start",
        json={"map_name": "PLAY_MAP", "mode": "construction_play", "session_id": "s1"},
    )
    assert r_start.status_code == 200
    assert r_start.json()["started"] is True
    assert r_start.json()["session_id"] == "s1"

    r_stop = client.post("/api/game/stop", params={"session_id": "s1"})
    assert r_stop.status_code == 200
    assert r_stop.json()["stopped"] is True


def test_start_game_with_custom_settings(client):
    payload = _map_payload("SETTINGS_MAP")
    client.post("/api/maps", json=payload)

    r = client.post(
        "/api/game/start",
        json={
            "map_name": "SETTINGS_MAP",
            "session_id": "s2",
            "settings": {
                "tank_speed": 0.04,
                "enemy_speed_mult": 1.5,
                "bullet_speed": 0.35,
                "player_fire_rate": 20,
                "enemy_fire_rate": 30,
                "player_lives": 5,
                "total_enemies": 30,
                "max_active_enemies": 6,
                "spawn_interval": 40,
                "friendly_mode": 1,
            },
        },
    )
    assert r.status_code == 200
    assert r.json()["started"] is True
    assert session_store.get_engine("s2") is not None


def test_start_game_with_missing_map_returns_404(client):
    r = client.post("/api/game/start", json={"map_name": "MISSING", "session_id": "x"})
    assert r.status_code == 404


def test_stop_missing_session_returns_stopped_false(client):
    r = client.post("/api/game/stop", params={"session_id": "does-not-exist"})
    assert r.status_code == 200
    assert r.json()["stopped"] is False
