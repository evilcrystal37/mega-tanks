/**
 * api.js — Backend API client (REST + WebSocket wrapper)
 */

const BASE = `${location.protocol}//${location.host}`;

// ── REST helpers ──────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
    const res = await fetch(BASE + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(Array.isArray(err.detail) ? err.detail.join(" | ") : (err.detail || res.statusText));
    }
    return res.json();
}

export const Api = {
    // Tiles
    getTiles: () => apiFetch("/api/tiles"),

    // Maps
    listMaps: () => apiFetch("/api/maps"),
    saveMap: (name, grid) => apiFetch("/api/maps", { method: "POST", body: JSON.stringify({ name, grid }) }),
    loadMap: (name) => apiFetch(`/api/maps/${encodeURIComponent(name)}`),
    deleteMap: (name) => apiFetch(`/api/maps/${encodeURIComponent(name)}`, { method: "DELETE" }),

    // Game
    startGame: (mapName, mode = "construction_play", sessionId = "default", settings = null) =>
        apiFetch("/api/game/start", { method: "POST", body: JSON.stringify({ map_name: mapName, mode, session_id: sessionId, ...(settings ? { settings } : {}) }) }),
    stopGame: (sessionId = "default") =>
        apiFetch(`/api/game/stop?session_id=${encodeURIComponent(sessionId)}`, { method: "POST" }),
};

// ── WebSocket wrapper ─────────────────────────────────────────────────

export class GameSocket {
    constructor(sessionId = "default") {
        this._sessionId = sessionId;
        this._ws = null;
        this._onState = null;
        this._reconnectTimer = null;
    }

    connect(onState) {
        this._onState = onState;
        this._open();
    }

    _open() {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const url = `${proto}://${location.host}/ws/game?session_id=${this._sessionId}`;
        this._ws = new WebSocket(url);

        this._ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === "state" && this._onState) {
                this._onState(msg);
            }
        };

        this._ws.onclose = () => {
            // Auto-reconnect after 1s (server may still be starting)
            this._reconnectTimer = setTimeout(() => this._open(), 1000);
        };
    }

    sendInput(direction, fire) {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ type: "input", direction, fire }));
        }
    }

    sendPause() {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ type: "pause" }));
        }
    }

    close() {
        clearTimeout(this._reconnectTimer);
        if (this._ws) {
            this._ws.onclose = null;
            this._ws.close();
            this._ws = null;
        }
    }
}
