"""
main.py — FastAPI application entrypoint for Battle Tanks.

Serves:
  - REST API at /api/...
  - WebSocket at /ws/game
  - Static frontend files at /
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import router as api_router
from .ws import ws_router

app = FastAPI(
    title="Battle Tanks",
    description="Battle City recreation — Construction + Play mode",
    version="1.0.0",
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API and WebSocket routers
app.include_router(api_router)
app.include_router(ws_router)

_project_root = Path(__file__).resolve().parent.parent
_ext_sprites_dir = _project_root / "ext_sprites"
_ext_sprites_dir.mkdir(parents=True, exist_ok=True)
app.mount(
    "/assets/custom_tiles",
    StaticFiles(directory=str(_ext_sprites_dir)),
    name="custom_tiles",
)

# Serve frontend static files — must be last so API routes take priority
_frontend_dir = _project_root / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")

if __name__ == "__main__":
    import os
    import uvicorn
    # NOTE: Chrome blocks some ports (including 6666) as unsafe.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
