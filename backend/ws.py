"""
ws.py — WebSocket endpoint for real-time game state streaming.

Protocol:
  Client → Server (JSON):
    { "type": "input", "direction": "up"|"down"|"left"|"right"|null, "fire": bool }
    { "type": "ping" }

  Server → Client (JSON):
    { "type": "state", ...game state fields... }
    { "type": "pong" }
    { "type": "error", "message": "..." }
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .api import get_engine

ws_router = APIRouter()


@ws_router.websocket("/ws/game")
async def game_websocket(websocket: WebSocket, session_id: str = "default"):
    await websocket.accept()

    engine = get_engine(session_id)
    if engine is None:
        await websocket.send_json({"type": "error", "message": "No active game session. Start a game first via POST /api/game/start."})
        await websocket.close()
        return

    # Subscribe to engine state updates
    send_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=4)

    async def on_state(state: dict) -> None:
        try:
            send_queue.put_nowait({"type": "state", **state})
        except asyncio.QueueFull:
            pass  # drop frame if client is slow

    engine.subscribe(on_state)

    # Send task: forward queued states to client
    async def sender():
        try:
            while True:
                msg = await send_queue.get()
                await websocket.send_json(msg)
        except Exception:
            pass

    sender_task = asyncio.create_task(sender())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "input":
                direction = msg.get("direction")
                fire = bool(msg.get("fire", False))
                engine.player_input(direction, fire)

            elif msg_type == "pause":
                engine.toggle_pause()

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        sender_task.cancel()
        engine.unsubscribe(on_state)
