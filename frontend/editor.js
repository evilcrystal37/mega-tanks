/**
 * editor.js — Keyboard-driven map construction editor (Battle City style)
 */

import { Api } from "./api.js";

const GRID_W = 64;
const GRID_H = 42;
const CELL = 40;

// State
let tiles = [];      // TileType objects from backend
let tileIds = [];      // ordered list of non-empty tile ids for cycling
let tileIndex = 0;       // index into tileIds (0 = Brick)
let grid = [];      // Array of tile IDs
let cursorRow = 20;
let cursorCol = 32; // Midpoint of 64
let editorFocused = false;
let lastPlacedCol = -1;
let lastPlacedRow = -1;
let heldKeys = new Set();

const _images = {};

// DOM
const canvas = document.getElementById("editor-canvas");
const ctx = canvas.getContext("2d");
const tileName = document.getElementById("sb-tile-name");
const nameInput = document.getElementById("map-name-input");
const valBanner = document.getElementById("validation-banner");
const launchBtn = document.getElementById("btn-launch-play");
const mapList = document.getElementById("map-list");

// Expose to app.js
export function getCurrentGrid() { return grid; }
export function getCurrentMapName() { return nameInput.value.trim().toUpperCase(); }

// ── Init ──────────────────────────────────────────────────────────────

export async function initEditor() {
    _loadImages();
    _initGrid();
    await _loadTiles();
    _resize();
    _render();
    _bindEvents();
    await refreshMapList();
    window.addEventListener("resize", () => { _resize(); _render(); });
}

export function focusEditor() {
    editorFocused = true;
}
export function blurEditor() {
    editorFocused = false;
}

function _loadImages() {
    const filenames = ["brick", "steel", "water1", "water2", "forest", "ice", "base"];
    filenames.forEach(name => {
        const img = new Image();
        img.src = `assets/${name}.png`;
        _images[name] = img;
    });
}

function _initGrid() {
    grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
    // Pre-place base and bricks
    const mid = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    grid[bottom][mid] = 6;     // Base
    grid[bottom][mid - 1] = 1;   // Left brick
    grid[bottom][mid + 1] = 1;   // Right brick
    grid[bottom - 1][mid - 1] = 1; // Top-left brick
    grid[bottom - 1][mid] = 1;   // Top-mid brick
    grid[bottom - 1][mid + 1] = 1; // Top-right brick
}

// ── Tiles ─────────────────────────────────────────────────────────────

async function _loadTiles() {
    try {
        tiles = await Api.getTiles();
    } catch {
        tiles = [
            { id: 0, label: "EMPTY", color: "#000000" },
            { id: 1, label: "BRICK", color: "#a83800" },
            { id: 2, label: "STEEL", color: "#808080" },
            { id: 3, label: "WATER", color: "#1060d0" },
            { id: 4, label: "FOREST", color: "#287800" },
            { id: 5, label: "ICE", color: "#88d8f8" },
            { id: 6, label: "BASE", color: "#f8d818" },
        ];
    }
    // Cycling skips Empty (id 0) and Base (id 6)
    tileIds = tiles.filter(t => t.id !== 0 && t.id !== 6).map(t => t.id);
    tileIndex = 0;
    _updateStatusBar();
}

function _currentTileId() {
    return tileIds[tileIndex] ?? 1;
}

function _updateStatusBar() {
    const cur = tiles.find(t => t.id === _currentTileId());
    if (tileName) tileName.textContent = cur ? cur.label.toUpperCase() : "BRICK";
}

// ── Canvas ────────────────────────────────────────────────────────────

function _resize() {
    // Map area = exactly N tiles in a row (no padding)
    canvas.width = GRID_W * CELL;
    canvas.height = GRID_H * CELL;
}

// ── Render ────────────────────────────────────────────────────────────

const _BLINK_MS = 500;
let _lastBlink = 0;
let _cursorVisible = true;

function _render(ts = 0) {
    if (ts - _lastBlink > _BLINK_MS) {
        _cursorVisible = !_cursorVisible;
        _lastBlink = ts;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            const tid = grid[r][c];
            if (tid !== 0) {
                _drawTileDetail(ctx, tid, c * CELL, r * CELL, CELL);
            }
            ctx.fillStyle = "rgba(80,80,80,0.35)";
            ctx.fillRect(c * CELL, r * CELL, 1, 1);
        }
    }

    // Cursor
    if (_cursorVisible || !editorFocused) {
        const cx = cursorCol * CELL;
        const cy = cursorRow * CELL;
        const tid = _currentTileId();

        // Ghost tile under cursor
        ctx.save();
        ctx.globalAlpha = 0.45;
        _drawTileDetail(ctx, tid, cx, cy, CELL);
        ctx.restore();

    }

    _validate();
    requestAnimationFrame(_render);
}

function _drawTileDetail(ctx, tid, x, y, sz) {
    let imgName = null;
    if (tid === 1) imgName = "brick";
    else if (tid === 2) imgName = "steel";
    else if (tid === 3) imgName = (Math.floor(Date.now() / 400) % 2 === 0) ? "water1" : "water2";
    else if (tid === 4) imgName = "forest";
    else if (tid === 5) imgName = "ice";
    else if (tid === 6) imgName = "base";

    if (imgName && _images[imgName] && _images[imgName].complete) {
        ctx.drawImage(_images[imgName], x, y, sz, sz);
    } else {
        const fallback = tiles.find(t => t.id === tid)?.color || "#333";
        ctx.fillStyle = fallback;
        ctx.fillRect(x, y, sz, sz);
    }
}

// ── Validation ────────────────────────────────────────────────────────

function _validate() {
    const baseCount = grid.flat().filter(id => id === 6).length;
    valBanner.style.display = "block";
    if (baseCount === 0) {
        valBanner.textContent = "PLACE BASE TILE!";
        valBanner.className = "nes-validation";
        launchBtn.disabled = true;
    } else if (baseCount > 1) {
        valBanner.textContent = "ONE BASE ONLY!";
        valBanner.className = "nes-validation";
        launchBtn.disabled = true;
    } else {
        valBanner.textContent = "MAP READY!";
        valBanner.className = "nes-validation ok";
        launchBtn.disabled = false;
    }
}

// ── Event bindings ────────────────────────────────────────────────────

function _bindEvents() {
    canvas.addEventListener("click", () => { canvas.focus?.(); editorFocused = true; });
    canvas.addEventListener("mouseenter", () => { editorFocused = true; });
    window.addEventListener("keydown", _onKeyDown);
    window.addEventListener("keyup", _onKeyUp);
    document.getElementById("btn-save-map").addEventListener("click", _saveMap);
    document.getElementById("btn-clear-map").addEventListener("click", () => {
        if (!confirm("CLEAR MAP?")) return;
        _initGrid();
    });

    window.addEventListener("keydown", ev => {
        if (editorFocused && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyX", "KeyC"].includes(ev.code)) {
            ev.preventDefault();
        }
    }, { capture: true });

    // Continuous painting loop
    setInterval(() => {
        if (!editorFocused) return;
        if (heldKeys.has("KeyX") || heldKeys.has("KeyC") || heldKeys.has("Space")) {
            _handlePaint();
        }
    }, 50);
}

function _onKeyDown(ev) {
    if (!editorFocused) return;
    if (document.activeElement === nameInput) return;
    heldKeys.add(ev.code);
    _handleKey(ev);
}

function _onKeyUp(ev) {
    heldKeys.delete(ev.code);
}

function _handlePaint() {
    if (heldKeys.has("Space")) {
        grid[cursorRow][cursorCol] = 0;
    } else if (heldKeys.has("KeyC") || heldKeys.has("KeyX")) {
        grid[cursorRow][cursorCol] = _currentTileId();
    }
}

function _handleKey(ev) {
    if (!editorFocused) return;
    if (document.activeElement === nameInput) return;

    switch (ev.code) {
        case "ArrowUp": case "KeyW":
            cursorRow = Math.max(0, cursorRow - 1);
            if (heldKeys.has("KeyX") || heldKeys.has("KeyC")) grid[cursorRow][cursorCol] = _currentTileId();
            else if (heldKeys.has("Space")) grid[cursorRow][cursorCol] = 0;
            break;
        case "ArrowDown": case "KeyS":
            cursorRow = Math.min(GRID_H - 1, cursorRow + 1);
            if (heldKeys.has("KeyX") || heldKeys.has("KeyC")) grid[cursorRow][cursorCol] = _currentTileId();
            else if (heldKeys.has("Space")) grid[cursorRow][cursorCol] = 0;
            break;
        case "ArrowLeft": case "KeyA":
            cursorCol = Math.max(0, cursorCol - 1);
            if (heldKeys.has("KeyX") || heldKeys.has("KeyC")) grid[cursorRow][cursorCol] = _currentTileId();
            else if (heldKeys.has("Space")) grid[cursorRow][cursorCol] = 0;
            break;
        case "ArrowRight": case "KeyD":
            cursorCol = Math.min(GRID_W - 1, cursorCol + 1);
            if (heldKeys.has("KeyX") || heldKeys.has("KeyC")) grid[cursorRow][cursorCol] = _currentTileId();
            else if (heldKeys.has("Space")) grid[cursorRow][cursorCol] = 0;
            break;

        case "KeyC": // Next tile / Place
            if (lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex + 1) % tileIds.length;
            }
            _updateStatusBar();
            grid[cursorRow][cursorCol] = _currentTileId();
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "KeyX": // Prev tile / Place
            if (lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex - 1 + tileIds.length) % tileIds.length;
            }
            _updateStatusBar();
            grid[cursorRow][cursorCol] = _currentTileId();
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "Space": // Erase
            grid[cursorRow][cursorCol] = 0;
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "KeyS":
            if (!ev.ctrlKey && !ev.metaKey) _saveMap();
            break;

        default: return;
    }
    ev.preventDefault();
}

// ── Save / Load ───────────────────────────────────────────────────────

async function _saveMap() {
    const name = nameInput.value.trim().toUpperCase();
    if (!name) { alert("ENTER MAP NAME!"); return; }
    try {
        await Api.saveMap(name, grid);
        await refreshMapList();
    } catch (e) {
        alert("SAVE FAILED: " + e.message);
    }
}

export async function refreshMapList() {
    try {
        const { maps } = await Api.listMaps();
        mapList.innerHTML = "";
        if (!maps.length) {
            mapList.innerHTML = `<div style="font-size:7px;color:#585858;padding:3px">NO MAPS</div>`;
            return;
        }
        maps.forEach(name => {
            const item = document.createElement("div");
            item.className = "nes-map-item";
            item.innerHTML = `<span class="nes-map-item-name">${name}</span><button class="nes-map-del" title="Del">✕</button>`;
            item.querySelector(".nes-map-item-name").addEventListener("click", () => _loadMap(name));
            item.querySelector(".nes-map-del").addEventListener("click", async e => {
                e.stopPropagation();
                if (!confirm(`DELETE "${name}"?`)) return;
                await Api.deleteMap(name);
                await refreshMapList();
            });
            mapList.appendChild(item);
        });
    } catch { }
}

async function _loadMap(name) {
    try {
        const data = await Api.loadMap(name);
        grid = data.grid;
        nameInput.value = data.name;
    } catch (e) {
        alert("LOAD FAILED: " + e.message);
    }
}
