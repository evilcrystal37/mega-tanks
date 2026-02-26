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

# Serve frontend static files — must be last so API routes take priority
_frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=6666, reload=True)
