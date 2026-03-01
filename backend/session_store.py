"""
In-memory session store for active game engines.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class SessionStore:
    def __init__(self) -> None:
        self._engines: Dict[str, Any] = {}

    def set_engine(self, session_id: str, engine: Any) -> None:
        self._engines[session_id] = engine

    def get_engine(self, session_id: str = "default") -> Optional[Any]:
        return self._engines.get(session_id)

    def pop_engine(self, session_id: str = "default") -> Optional[Any]:
        return self._engines.pop(session_id, None)


session_store = SessionStore()
