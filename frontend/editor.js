/**
 * editor.js — Keyboard-driven map construction editor (Battle City style)
 */

import { Api } from "./api.js";
import { SpriteAtlas } from "./spriteAtlas.js";

const GRID_W = 64;
const GRID_H = 42;
const CELL = 32;
const BRUSH_SIZE = 2; // 2x2 tiles (4 tiles at once)

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

const _atlas = new SpriteAtlas();
let _cell = CELL;

// DOM
const canvas = document.getElementById("editor-canvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const tileName = document.getElementById("sb-tile-name");
const nameInput = document.getElementById("map-name-input");
const valBanner = document.getElementById("validation-banner");
const launchBtn = document.getElementById("btn-launch-play");
const mapList = document.getElementById("map-list");

// Expose to app.js
export function getCurrentGrid() { return grid; }
export function getCurrentMapName() { return nameInput.value.trim().toUpperCase(); }
export function resizeEditor() { _resize(); }

// ── Init ──────────────────────────────────────────────────────────────

export async function initEditor() {
    await _atlas.ready();
    _resize();
    _initGrid();
    await _loadTiles();
    _render();
    _bindEvents();
    await refreshMapList();
    window.addEventListener("resize", () => { _resize(); });
}

export function focusEditor() {
    editorFocused = true;
}
export function blurEditor() {
    editorFocused = false;
}

function _initGrid() {
    grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(0));
    // Pre-place base (2×2 big-type) and bricks — bricks must not overlap base footprint
    const mid = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    grid[bottom][mid] = 6;     // Base (spans mid..mid+1, bottom-1..bottom when even-aligned)
    grid[bottom][mid - 1] = 1;   // West of base
    grid[bottom][mid + 2] = 1;   // East of base (skip mid+1 — part of base 2×2)
    grid[bottom - 1][mid - 1] = 1; // Northwest
    grid[bottom - 1][mid + 2] = 1; // Northeast (skip mid, mid+1 — part of base 2×2)
    grid[bottom - 2][mid - 1] = 1; // Row above
    grid[bottom - 2][mid] = 1;
    grid[bottom - 2][mid + 1] = 1;
    grid[bottom - 2][mid + 2] = 1;
}

// ── Tile settings (disabled tiles) ────────────────────────────────────

// Tile groups used by both palette filtering and map generator.
// Must mirror TILE_TOGGLES in app.js (uses same localStorage key).
const _TILE_GROUPS = {
    tile_brick:        [1],
    tile_steel:        [2],
    tile_water:        [3],
    tile_forest:       [4],
    tile_ice:          [5],
    tile_lava:         [7],
    tile_conveyor:     [8, 9, 10, 11],
    tile_mud:          [12],
    tile_ramp:         [13],
    tile_tnt:          [14],
    tile_glass:        [15],
    tile_sunflower:    [18],
    tile_turret:       [25],
    tile_mushroom_box: [28],
    tile_rainbow_box:  [31],
    tile_chick_box:    [35],
    tile_spec_tnt:     [36],
};

function _getDisabledTileIds() {
    try {
        const stored = JSON.parse(localStorage.getItem("battle_tanks_tile_settings") ?? "{}");
        const disabled = new Set();
        for (const [key, ids] of Object.entries(_TILE_GROUPS)) {
            if (stored[key] === false) ids.forEach(id => disabled.add(id));
        }
        return disabled;
    } catch {
        return new Set();
    }
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
    // Cycling skips: Base (6), glass cracks (16, 17),
    // sandworm parts (20, 21), raw item pickups (23, 24, 32 — must stay inside their boxes),
    // mushroom cracks (26, 27), rainbow cracks (29, 30), chick cracks (33, 34)
    const NOT_ALLOWED = new Set([6, 16, 17, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 34]);
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !NOT_ALLOWED.has(t.id) && !disabled.has(t.id)).map(t => t.id);
    // Put empty last so Brick remains the default when opening the editor
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
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
    const wrap = canvas.parentElement;
    const maxW = Math.max(1, wrap?.clientWidth ?? 800);
    const maxH = Math.max(1, wrap?.clientHeight ?? 600);
    const zoom = _getCellZoom();
    const naturalCell = Math.min(maxW / GRID_W, maxH / GRID_H);
    _cell = Math.max(1, Math.round(naturalCell * zoom));

    // Ensure canvas dimensions are exact multiples of the cell size
    const adjustedW = Math.floor(maxW / _cell) * _cell;
    const adjustedH = Math.floor(maxH / _cell) * _cell;

    canvas.width = adjustedW;
    canvas.height = adjustedH;
    canvas.style.width = `${adjustedW}px`;
    canvas.style.height = `${adjustedH}px`;
}

function _getCellZoom() {
    try {
        const raw = JSON.parse(localStorage.getItem("battle_tanks_settings") ?? "{}");
        const z = parseFloat(raw?.cell_zoom ?? 2.0);
        return Number.isFinite(z) ? z : 2.0;
    } catch {
        return 2.0;
    }
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

    const cell = _cell || CELL;
    const visW = canvas.width / cell;
    const visH = canvas.height / cell;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const vpLeft = visW >= GRID_W ? (GRID_W - visW) / 2 : clamp(cursorCol + BRUSH_SIZE / 2 - visW / 2, 0, GRID_W - visW);
    const vpTop = visH >= GRID_H ? (GRID_H - visH) / 2 : clamp(cursorRow + BRUSH_SIZE / 2 - visH / 2, 0, GRID_H - visH);

    const startC = Math.max(0, Math.floor(vpLeft));
    const endC = Math.min(GRID_W - 1, Math.ceil(vpLeft + visW));
    const startR = Math.max(0, Math.floor(vpTop));
    const endR = Math.min(GRID_H - 1, Math.ceil(vpTop + visH));

    ctx.save();
    ctx.translate(Math.round(-vpLeft * cell), Math.round(-vpTop * cell));

    for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
            // Skip drawing the base map if the cursor is exactly covering this tile and the cursor is visible
            if (editorFocused && _cursorVisible) {
                if (r >= cursorRow && r < cursorRow + BRUSH_SIZE && c >= cursorCol && c < cursorCol + BRUSH_SIZE) {
                    continue;
                }
            }

            const tid = grid[r][c];
            if (tid !== 0) {
                if (tid === 4) {
                    ctx.save();
                    ctx.globalAlpha = 0.65;
                    _drawTileDetail(ctx, tid, c * cell, r * cell, cell);
                    ctx.restore();
                } else {
                    _drawTileDetail(ctx, tid, c * cell, r * cell, cell);
                }
            }
            ctx.fillStyle = "rgba(80,80,80,0.35)";
            ctx.fillRect(Math.round(c * cell), Math.round(r * cell), 1, 1);
        }
    }

    // Cursor — ghost tile (always visible, blinks via alpha)
    if (editorFocused) {
        const cx = cursorCol * cell;
        const cy = cursorRow * cell;
        const tid = _currentTileId();
        
        ctx.save();
        if (_cursorVisible) {
            ctx.globalAlpha = 0.6;
            for (let dr = 0; dr < BRUSH_SIZE; dr++) {
                for (let dc = 0; dc < BRUSH_SIZE; dc++) {
                    _drawTileDetail(ctx, tid, cx + dc * cell, cy + dr * cell, cell);
                }
            }
        }
        
        // Always draw subtle outline
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, BRUSH_SIZE * cell, BRUSH_SIZE * cell);
        ctx.restore();
    }

    ctx.restore();

    _validate();
    requestAnimationFrame(_render);
}

function _drawSandTile(ctx, dx, dy, ds) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, ds, ds);
    ctx.clip();

    ctx.fillStyle = "#d4bc8e";
    ctx.fillRect(dx, dy, ds, ds);

    const cx = dx + ds / 2;
    const cy = dy + ds / 2;
    ctx.translate(cx, cy);
    ctx.rotate(-0.56);
    ctx.translate(-cx, -cy);

    const numBands = 7;
    const bandH = ds * 1.8 / numBands;
    const origin = dy - ds * 0.4;
    const left   = dx - ds * 0.4;
    const right  = dx + ds * 1.4;
    const steps  = Math.max(8, Math.ceil(ds * 1.8));

    for (let i = 0; i < numBands + 1; i++) {
        const y0 = origin + i * bandH;
        const wave = (x, yBase) =>
            yBase + Math.sin(((x - left) / (right - left)) * Math.PI * 2.5) * bandH * 0.18;

        ctx.fillStyle = "rgba(168,130,72,0.38)";
        ctx.beginPath();
        ctx.moveTo(left, wave(left, y0));
        for (let s = 1; s <= steps; s++) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0));
        }
        for (let s = steps; s >= 0; s--) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.42);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,242,200,0.22)";
        ctx.beginPath();
        ctx.moveTo(left, wave(left, y0) + bandH * 0.42);
        for (let s = 1; s <= steps; s++) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.42);
        }
        for (let s = steps; s >= 0; s--) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.78);
        }
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function _drawTileDetail(ctx, tid, x, y, sz) {
    if (tid === 0) return; // Empty tile — nothing to draw
    const dx = Math.round(x);
    const dy = Math.round(y);
    const ds = Math.round(sz);

    const gridC = Math.round(x / sz);
    const gridR = Math.round(y / sz);

    if (tid === 6 || tid === 14 || tid === 18 || tid === 25 || (tid >= 26 && tid <= 31) || (tid >= 33 && tid <= 36) || tid === 32) {
        ctx.save();
        const centerX = dx + (gridC % 2 === 0 ? ds : 0);
        const centerY = dy + (gridR % 2 === 0 ? ds : 0);
        ctx.beginPath();
        // Base occupies 1 cell but draws 2×2 — use 2×2 clip so full sprite is visible
        if (tid === 6) {
            ctx.rect(centerX - ds, centerY - ds, ds * 2, ds * 2);
        } else {
            ctx.rect(dx, dy, ds, ds);
        }
        ctx.clip();
        ctx.translate(centerX, centerY);

        if (tid === 18) {
            // Big Sunflower Emoji — always full brightness (no darkening)
            ctx.globalAlpha = 1.0;
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            
            ctx.font = `${ds * 1.5 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🌼", 0, ds * 0.1); // Slight offset for better centering
        } else if (tid === 14) {
            // Minecraft TNT look
            // Background red
            ctx.fillStyle = "#d32f2f";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            
            // White band across the middle
            ctx.fillStyle = "#eeeeee";
            ctx.fillRect(-ds, -ds * 0.3, ds * 2, ds * 0.6);
            
            // TNT text in black on the white band
            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.max(6, ds * 0.5)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("TNT", 0, 0);
            
            // Some subtle vertical lines to look like dynamite sticks
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = ds * 0.05;
            ctx.beginPath();
            for (let i = -0.6; i <= 0.6; i += 0.4) {
                ctx.moveTo(ds * i, -ds);
                ctx.lineTo(ds * i, -ds * 0.3);
                ctx.moveTo(ds * i, ds * 0.3);
                ctx.lineTo(ds * i, ds);
            }
            ctx.stroke();
        } else if (tid === 36) {
            // Special TNT — same as TNT but with a neon yellow pulsing glow border
            ctx.fillStyle = "#d32f2f";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.fillStyle = "#eeeeee";
            ctx.fillRect(-ds, -ds * 0.3, ds * 2, ds * 0.6);
            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.max(6, ds * 0.5)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("TNT", 0, 0);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = ds * 0.05;
            ctx.beginPath();
            for (let i = -0.6; i <= 0.6; i += 0.4) {
                ctx.moveTo(ds * i, -ds);
                ctx.lineTo(ds * i, -ds * 0.3);
                ctx.moveTo(ds * i, ds * 0.3);
                ctx.lineTo(ds * i, ds);
            }
            ctx.stroke();
            // Neon yellow highlight border — layered strokes instead of shadowBlur (much cheaper)
            const glowAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            for (const [lw, a] of [[ds*0.30, 0.18], [ds*0.22, 0.35], [ds*0.14, 0.65], [ds*0.08, glowAlpha]]) {
                ctx.strokeStyle = `rgba(255, 224, 0, ${a})`;
                ctx.lineWidth = lw;
                ctx.strokeRect(-ds + lw/2, -ds + lw/2, ds*2 - lw, ds*2 - lw);
            }
        } else if (tid === 25) {
            // Turret placement preview — sandbag ring + dome + prominent barrel (pointing up)
            // Sandbag ring
            const bagR = ds * 0.42;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const bx = Math.cos(a) * bagR;
                const by = Math.sin(a) * bagR;
                const bg = ctx.createRadialGradient(bx - ds*0.03, by - ds*0.03, ds*0.01, bx, by, ds*0.1);
                bg.addColorStop(0, "#a89060"); bg.addColorStop(1, "#6b5030");
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.ellipse(bx, by, ds * 0.11, ds * 0.08, a, 0, Math.PI * 2);
                ctx.fill();
            }
            // Base plate
            const bpg = ctx.createRadialGradient(-ds*0.06, -ds*0.06, ds*0.04, 0, 0, ds*0.33);
            bpg.addColorStop(0, "#95918e"); bpg.addColorStop(0.7, "#706c69"); bpg.addColorStop(1, "#524f4c");
            ctx.fillStyle = bpg;
            ctx.beginPath(); ctx.arc(0, 0, ds * 0.33, 0, Math.PI * 2); ctx.fill();
            // Dome
            const dg = ctx.createRadialGradient(-ds*0.07, -ds*0.07, ds*0.02, 0, 0, ds*0.24);
            dg.addColorStop(0, "#90a4ae"); dg.addColorStop(0.5, "#546e7a"); dg.addColorStop(1, "#2e4050");
            ctx.fillStyle = dg;
            ctx.beginPath(); ctx.arc(0, ds*0.04, ds * 0.23, 0, Math.PI * 2); ctx.fill();
            // Sensor slit
            const scanP = (Math.sin(Date.now() / 120) + 1) * 0.5;
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.fillRect(-ds*0.13, ds*0.02, ds*0.26, ds*0.05);
            ctx.fillStyle = `rgba(0,220,255,${0.4 + scanP * 0.4})`;
            ctx.fillRect(-ds*0.13, ds*0.02, ds*0.26, ds*0.05);
            // Mantlet
            ctx.fillStyle = "#455a64";
            ctx.fillRect(-ds*0.11, -ds*0.18, ds*0.22, ds*0.17);
            // Barrel (prominent, points up)
            const barrelGrad = ctx.createLinearGradient(-ds*0.07, 0, ds*0.07, 0);
            barrelGrad.addColorStop(0, "#1c2b33"); barrelGrad.addColorStop(0.35, "#607d8b");
            barrelGrad.addColorStop(0.65, "#455a64"); barrelGrad.addColorStop(1, "#1c2b33");
            ctx.fillStyle = barrelGrad;
            ctx.fillRect(-ds*0.07, -ds*0.95, ds*0.14, ds*0.77);
            // Highlight stripe on barrel
            ctx.fillStyle = "rgba(160,200,220,0.45)";
            ctx.fillRect(-ds*0.05, -ds*0.95, ds*0.025, ds*0.77);
            // Muzzle brake
            ctx.fillStyle = "#263238";
            ctx.fillRect(-ds*0.11, -ds*1.0, ds*0.22, ds*0.08);
            ctx.fillStyle = "#000";
            ctx.fillRect(-ds*0.085, -ds*0.98, ds*0.04, ds*0.055);
            ctx.fillRect( ds*0.045, -ds*0.98, ds*0.04, ds*0.055);
        } else if (tid >= 26 && tid <= 28) {
            // Mushroom glass box — big-type, centered at (0,0)
            ctx.fillStyle = "rgba(139, 195, 74, 0.15)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            const cycle = (Date.now() % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.4)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "rgba(139, 195, 74, 0.7)";
            ctx.lineWidth = 1;
            ctx.strokeRect(-ds + 0.5, -ds + 0.5, ds * 2 - 1, ds * 2 - 1);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.beginPath();
            ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds); ctx.stroke();
            const bounce = Math.sin(Date.now() / 200) * ds * 0.05;
            ctx.fillStyle = "#f5f5dc";
            ctx.fillRect(-ds * 0.12, ds * 0.1 + bounce, ds * 0.24, ds * 0.5);
            ctx.fillStyle = "#e52521";
            ctx.beginPath();
            ctx.arc(0, ds * 0.1 + bounce, ds * 0.5, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(-ds * 0.25, -ds * 0.1 + bounce, ds * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(ds * 0.25, -ds * 0.1 + bounce, ds * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, -ds * 0.35 + bounce, ds * 0.12, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (tid <= 27) {
                ctx.moveTo(-ds * 0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds * 0.4);
            }
            if (tid === 26) {
                ctx.moveTo(0, 0); ctx.lineTo(ds * 0.7, ds * 0.7);
                ctx.moveTo(-ds, ds * 0.3); ctx.lineTo(-ds * 0.2, 0);
            }
            ctx.stroke();
        } else if (tid >= 29 && tid <= 31) {
            // Rainbow glass box — big-type, centered at (0,0)
            ctx.fillStyle = "rgba(255, 105, 180, 0.15)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            const cycle = ((Date.now() + 500) % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.4)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "rgba(255, 105, 180, 0.7)";
            ctx.lineWidth = 1;
            ctx.strokeRect(-ds + 0.5, -ds + 0.5, ds * 2 - 1, ds * 2 - 1);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.beginPath();
            ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds); ctx.stroke();
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.2 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🌈", 0, ds * 0.05);
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (tid <= 30) {
                ctx.moveTo(-ds * 0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds * 0.4);
            }
            if (tid === 29) {
                ctx.moveTo(0, 0); ctx.lineTo(ds * 0.7, ds * 0.7);
                ctx.moveTo(-ds, ds * 0.3); ctx.lineTo(-ds * 0.2, 0);
            }
            ctx.stroke();
        } else if (tid >= 33 && tid <= 35) {
            // Chick glass box — yellow, big-type centered at (0,0)
            ctx.fillStyle = "rgba(255, 238, 88, 0.15)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            const cycle = ((Date.now() + 1000) % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.4)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "rgba(255, 238, 88, 0.7)";
            ctx.lineWidth = 1;
            ctx.strokeRect(-ds + 0.5, -ds + 0.5, ds * 2 - 1, ds * 2 - 1);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.beginPath();
            ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds); ctx.stroke();
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.2 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.05);
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (tid <= 34) {
                ctx.moveTo(-ds * 0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds * 0.4);
            }
            if (tid === 33) {
                ctx.moveTo(0, 0); ctx.lineTo(ds * 0.7, ds * 0.7);
                ctx.moveTo(-ds, ds * 0.3); ctx.lineTo(-ds * 0.2, 0);
            }
            ctx.stroke();
        } else if (tid === 32) {
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.5 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.1);
        } else if (tid === 6) {
            // Base eagle — big-type (2×2)
            _atlas.draw(ctx, "base.heart.alive", -ds, -ds, ds * 2, ds * 2);
        }

        ctx.restore();
        return;
    }

    if (tid === 7) {
        const t = Date.now() / 1200;
        ctx.save();
        ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();

        const glow = (Math.sin(t * 1.8) + 1) / 2;
        ctx.fillStyle = `rgb(${Math.round(200 + glow * 55)},${Math.round(35 + glow * 35)},0)`;
        ctx.fillRect(dx, dy, ds, ds);

        const plates = [
            [0.22, 0.22, 0.21, 0.0,  0.0],
            [0.68, 0.18, 0.20, 0.8,  1.3],
            [0.88, 0.60, 0.18, 1.7,  2.5],
            [0.14, 0.64, 0.19, 2.4,  0.7],
            [0.50, 0.55, 0.23, 0.4,  1.9],
            [0.40, 0.88, 0.17, 1.1,  3.1],
            [0.78, 0.84, 0.16, 2.9,  0.4],
        ];

        plates.forEach(([bx, by, br, rot, phase]) => {
            const drift = Math.sin(t * 0.35 + phase) * 0.018;
            const cx = dx + (bx + drift) * ds;
            const cy = dy + (by + Math.cos(t * 0.28 + phase) * 0.012) * ds;
            const r  = br * ds * (0.92 + Math.sin(t * 0.6 + phase) * 0.05);

            const sides = 8;
            ctx.beginPath();
            for (let i = 0; i <= sides; i++) {
                const a = (i / sides) * Math.PI * 2 + rot;
                const v = 0.72 + 0.28 * Math.sin(i * 2.7 + rot * 3.1 + phase);
                const pr = r * v;
                if (i === 0) ctx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
                else         ctx.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
            }
            ctx.closePath();

            const pg = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, r * 0.04, cx, cy, r);
            pg.addColorStop(0,   "#8c1500");
            pg.addColorStop(0.5, "#660b00");
            pg.addColorStop(0.82,"#420500");
            pg.addColorStop(1,   "#220100");
            ctx.fillStyle = pg;
            ctx.fill();
        });

        plates.forEach(([bx, by, br, rot, phase]) => {
            const drift = Math.sin(t * 0.35 + phase) * 0.018;
            const cx = dx + (bx + drift) * ds;
            const cy = dy + (by + Math.cos(t * 0.28 + phase) * 0.012) * ds;
            const r  = br * ds * (0.92 + Math.sin(t * 0.6 + phase) * 0.05);
            const eg = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
            eg.addColorStop(0, "rgba(180,30,0,0)");
            eg.addColorStop(1, `rgba(255,${Math.round(80 + glow * 40)},0,0.18)`);
            ctx.fillStyle = eg;
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
        });

        ctx.restore();
        return;
    }

    if (tid >= 8 && tid <= 11) {
        ctx.fillStyle = "#333333";
        ctx.fillRect(dx, dy, ds, ds);
        ctx.fillStyle = "#aaaaaa";
        ctx.font = `${Math.max(8, ds * 0.6)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let arrow = "";
        if (tid === 8) arrow = "↑";
        else if (tid === 9) arrow = "↓";
        else if (tid === 10) arrow = "←";
        else if (tid === 11) arrow = "→";
        
        const offset = (Date.now() / 30) % ds;
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, ds, ds);
        ctx.clip();
        if (tid === 8) {
            ctx.fillText(arrow, dx + ds / 2, dy + ds / 2 + ds * 0.05 - offset);
            ctx.fillText(arrow, dx + ds / 2, dy + ds / 2 + ds * 0.05 - offset + ds);
        } else if (tid === 9) {
            ctx.fillText(arrow, dx + ds / 2, dy + ds / 2 + ds * 0.05 + offset);
            ctx.fillText(arrow, dx + ds / 2, dy + ds / 2 + ds * 0.05 + offset - ds);
        } else if (tid === 10) {
            ctx.fillText(arrow, dx + ds / 2 - offset, dy + ds / 2 + ds * 0.05);
            ctx.fillText(arrow, dx + ds / 2 - offset + ds, dy + ds / 2 + ds * 0.05);
        } else if (tid === 11) {
            ctx.fillText(arrow, dx + ds / 2 + offset, dy + ds / 2 + ds * 0.05);
            ctx.fillText(arrow, dx + ds / 2 + offset - ds, dy + ds / 2 + ds * 0.05);
        }
        ctx.restore();
        return;
    }

    if (tid === 1) {
        // cattle-bity bricks are 16x16 sub-tiles; compose a full tile from 4 distinct quarters (no flip to avoid misalignment).
        const half = Math.floor(ds / 2);
        _atlas.draw(ctx, "terrain.brick.1", dx, dy, half, half);
        _atlas.draw(ctx, "terrain.brick.2", dx + half, dy, ds - half, half);
        _atlas.draw(ctx, "terrain.brick.2", dx, dy + half, half, ds - half);
        _atlas.draw(ctx, "terrain.brick.1", dx + half, dy + half, ds - half, ds - half);
        return;
    }

    if (tid === 12) {
        _drawSandTile(ctx, dx, dy, ds);
        return;
    }

    if (tid === 13) {
        // Jumping tile / Spring
        ctx.fillStyle = "#222222";
        ctx.fillRect(dx, dy, ds, ds);

        const bob = Math.sin(Date.now() / 150) * ds * 0.15;
        
        // Base plate
        ctx.fillStyle = "#555555";
        ctx.fillRect(dx + ds * 0.1, dy + ds * 0.8, ds * 0.8, ds * 0.15);
        
        // Spring coils
        ctx.strokeStyle = "#aaaaaa";
        ctx.lineWidth = ds * 0.12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        
        const startY = dy + ds * 0.8;
        const endY = dy + ds * 0.3 + bob;
        const coils = 3;
        const step = (startY - endY) / coils;
        
        ctx.beginPath();
        ctx.moveTo(dx + ds * 0.5, startY);
        for (let i = 0; i < coils; i++) {
            const y = startY - i * step;
            const nextY = y - step;
            if (i % 2 === 0) {
                ctx.lineTo(dx + ds * 0.8, y - step * 0.5);
                ctx.lineTo(dx + ds * 0.2, nextY);
            } else {
                ctx.lineTo(dx + ds * 0.2, y - step * 0.5);
                ctx.lineTo(dx + ds * 0.8, nextY);
            }
        }
        ctx.lineTo(dx + ds * 0.5, endY);
        ctx.stroke();
        
        // Top platform
        ctx.fillStyle = "#ff3333";
        ctx.fillRect(dx + ds * 0.15, endY - ds * 0.15, ds * 0.7, ds * 0.15);
        ctx.strokeStyle = "#cc0000";
        ctx.lineWidth = ds * 0.05;
        ctx.strokeRect(dx + ds * 0.15, endY - ds * 0.15, ds * 0.7, ds * 0.15);
        return;
    }


    if (tid >= 15 && tid <= 17) {
        // Glass
        ctx.fillStyle = "rgba(170, 221, 255, 0.4)";
        ctx.fillRect(dx, dy, ds, ds);
        
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = Math.max(1, ds * 0.05);
        ctx.strokeRect(dx + 1, dy + 1, ds - 2, ds - 2);

        // Highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.beginPath();
        ctx.moveTo(dx + ds * 0.1, dy + ds * 0.1);
        ctx.lineTo(dx + ds * 0.4, dy + ds * 0.1);
        ctx.lineTo(dx + ds * 0.1, dy + ds * 0.4);
        ctx.fill();

        // Cracks
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = Math.max(1, ds * 0.04);
        ctx.beginPath();
        if (tid >= 16) {
            // First crack
            ctx.moveTo(dx + ds * 0.5, dy + ds * 0.5);
            ctx.lineTo(dx + ds * 0.2, dy + ds * 0.2);
            ctx.moveTo(dx + ds * 0.5, dy + ds * 0.5);
            ctx.lineTo(dx + ds * 0.8, dy + ds * 0.3);
            ctx.moveTo(dx + ds * 0.5, dy + ds * 0.5);
            ctx.lineTo(dx + ds * 0.4, dy + ds * 0.8);
        }
        if (tid >= 17) {
            // More cracks
            ctx.moveTo(dx + ds * 0.5, dy + ds * 0.5);
            ctx.lineTo(dx + ds * 0.9, dy + ds * 0.8);
            ctx.moveTo(dx + ds * 0.5, dy + ds * 0.5);
            ctx.lineTo(dx + ds * 0.1, dy + ds * 0.7);
            ctx.moveTo(dx + ds * 0.2, dy + ds * 0.2);
            ctx.lineTo(dx + ds * 0.4, dy + ds * 0.1);
            ctx.moveTo(dx + ds * 0.4, dy + ds * 0.8);
            ctx.lineTo(dx + ds * 0.6, dy + ds * 0.9);
        }
        ctx.stroke();
        return;
    }

    let spriteId = null;
    if (tid === 2) spriteId = "terrain.steel";
    else if (tid === 3) spriteId = (Math.floor(Date.now() / 400) % 2 === 0) ? "terrain.water.1" : "terrain.water.2";
    else if (tid === 4) spriteId = "terrain.jungle";
    else if (tid === 5) spriteId = "terrain.ice";

    if (spriteId && _atlas.draw(ctx, spriteId, dx, dy, ds, ds)) {
        return;
    }

    const fallback = tiles.find(t => t.id === tid)?.color || "#333";
    ctx.fillStyle = fallback;
    ctx.fillRect(dx, dy, ds, ds);
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

function _generateRandomMap() {
    _initGrid(); // clears the map and places the base
    
    // Pick symmetry mode: 2-way (left-right) or 4-way (quadrants)
    const symMode = Math.random() > 0.5 ? 4 : 2;

    const disabled = _getDisabledTileIds();
    
    // Weighted tile pool for regular (1×1 and repeating) tiles.
    // Brick is most common; special/rare tiles appear once or twice.
    const placeableTiles = [
        1, 1, 1, 1, 1, 1, 1, 1,  // brick      — most common
        2, 2, 2,                   // steel
        3, 3,                      // water
        4, 4, 4,                   // forest
        5, 5,                      // ice
        7,                         // lava
        8, 9, 10, 11,              // conveyors (all four directions)
        12,                        // mud
        13,                        // spring / ramp
        14,                        // TNT
        15,                        // glass brick
        18,                        // sunflower (passable cover)
    ].filter(t => !disabled.has(t));

    // Fallback to brick if every tile has been disabled
    if (placeableTiles.length === 0) placeableTiles.push(1);
    
    const isDense = Math.random() > 0.5; // 50% chance for a more packed map
    const baseShapes = isDense ? 30 + Math.floor(Math.random() * 30) : 15 + Math.floor(Math.random() * 15);
    
    const numShapes = symMode === 4 ? baseShapes : Math.floor(baseShapes * 1.5);
    
        const maxR = symMode === 4 ? Math.floor(GRID_H / 2) : GRID_H;
        const maxC = Math.floor(GRID_W / 2);
        
        for (let i = 0; i < numShapes; i++) {
            const tid = placeableTiles[Math.floor(Math.random() * placeableTiles.length)];
            const isHorizontal = Math.random() > 0.5;
            const length = ((isDense ? 3 : 2) + Math.floor(Math.random() * 6)) * 2;
            const thickness = ((isDense ? 2 : 1) + Math.floor(Math.random() * 3)) * 2;
            
            let startR = Math.floor(Math.random() * (maxR - (isHorizontal ? thickness : length)));
            let startC = Math.floor(Math.random() * (maxC - (isHorizontal ? length : thickness)));
            
            // Align to 2x2 grid for Battle City blocks (prevents non-repeating tiles from slicing)
            startR = startR - (startR % 2);
            startC = startC - (startC % 2);
        
        for (let dr = 0; dr < (isHorizontal ? thickness : length); dr++) {
            for (let dc = 0; dc < (isHorizontal ? length : thickness); dc++) {
                const r = startR + dr;
                const c = startC + dc;
                if (r >= 0 && r < maxR && c >= 0 && c < maxC) {
                    grid[r][c] = tid;
                    
                    // Mirroring
                    const mirrorC = GRID_W - 1 - c;
                    const mirrorR = GRID_H - 1 - r;
                    
                    if (symMode === 2) {
                        grid[r][mirrorC] = tid;
                    } else if (symMode === 4) {
                        grid[r][mirrorC] = tid;
                        grid[mirrorR][c] = tid;
                        grid[mirrorR][mirrorC] = tid;
                    }
                }
            }
        }
    }
    
    // ── Auto-turrets (tile 25) — placed as 2×2 blocks at even positions ──
    // Snap to even row/col so each block aligns with the engine's scan.
    const numTurretPlacements = disabled.has(25) ? 0 : 1 + Math.floor(Math.random() * 3);
    for (let t = 0; t < numTurretPlacements; t++) {
        // Snap to even row/col so the 2×2 block aligns with the engine's scan
        let tr = Math.floor(Math.random() * Math.max(1, Math.floor((maxR - 4) / 2))) * 2;
        let tc = Math.floor(Math.random() * Math.max(1, Math.floor((maxC - 4) / 2))) * 2;
        tr = Math.max(0, Math.min(tr, maxR - 2));
        tc = Math.max(0, Math.min(tc, maxC - 2));
        for (let dr = 0; dr < 2; dr++) {
            for (let dc = 0; dc < 2; dc++) {
                const r = tr + dr;
                const c = tc + dc;
                if (r < maxR && c < maxC) {
                    grid[r][c] = 25;
                    const mirrorC = GRID_W - 1 - c;
                    const mirrorR = GRID_H - 1 - r;
                    if (symMode === 2) {
                        grid[r][mirrorC] = 25;
                    } else if (symMode === 4) {
                        grid[r][mirrorC] = 25;
                        grid[mirrorR][c] = 25;
                        grid[mirrorR][mirrorC] = 25;
                    }
                }
            }
        }
    }

    // ── Power-up glass boxes (28 = mushroom, 31 = rainbow, 35 = chick) ───────────────
    // These are non-repeating big-type tiles that must be placed as exact
    // 2×2 blocks aligned to even row/col (matches the editor cursor grid).
    const availableBoxes = [28, 31, 35].filter(t => !disabled.has(t));
    const numBoxes = availableBoxes.length > 0 ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let b = 0; b < numBoxes; b++) {
        const boxTid = availableBoxes[Math.floor(Math.random() * availableBoxes.length)];
        // Pick a random even top-left, staying away from the bottom rows
        let br = Math.floor(Math.random() * Math.max(1, Math.floor((maxR - 4) / 2))) * 2;
        let bc = Math.floor(Math.random() * Math.max(1, Math.floor((maxC - 2) / 2))) * 2;
        br = Math.max(0, Math.min(br, maxR - 2));
        bc = Math.max(0, Math.min(bc, maxC - 2));
        for (let dr = 0; dr < 2; dr++) {
            for (let dc = 0; dc < 2; dc++) {
                const r = br + dr;
                const c = bc + dc;
                if (r < maxR && c < maxC) {
                    grid[r][c] = boxTid;
                    const mirrorC = GRID_W - 1 - c;
                    const mirrorR = GRID_H - 1 - r;
                    if (symMode === 2) {
                        grid[r][mirrorC] = boxTid;
                    } else if (symMode === 4) {
                        grid[r][mirrorC] = boxTid;
                        grid[mirrorR][c] = boxTid;
                        grid[mirrorR][mirrorC] = boxTid;
                    }
                }
            }
        }
    }

    // Base protection: Clear area around base and place base struct (base is 2×2 big-type)
    const mid = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    
    // Clear 5×6 area around base (base spans mid..mid+1, bottom-1..bottom)
    for (let r = bottom - 3; r <= bottom; r++) {
        for (let c = mid - 2; c <= mid + 3; c++) {
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
                grid[r][c] = 0;
            }
        }
    }
    
    // Re-place base structure — bricks must not overlap base 2×2
    grid[bottom][mid] = 6;     // Base (spans mid..mid+1, bottom-1..bottom)
    grid[bottom][mid - 1] = 1;   // West
    grid[bottom][mid + 2] = 1;   // East
    grid[bottom - 1][mid - 1] = 1; // Northwest
    grid[bottom - 1][mid + 2] = 1; // Northeast
    grid[bottom - 2][mid - 1] = 1;
    grid[bottom - 2][mid] = 1;
    grid[bottom - 2][mid + 1] = 1;
    grid[bottom - 2][mid + 2] = 1;
}

function _bindEvents() {
    canvas.addEventListener("click", () => { canvas.focus?.(); editorFocused = true; });
    canvas.addEventListener("mouseenter", () => { editorFocused = true; });
    window.addEventListener("keydown", _onKeyDown);
    window.addEventListener("keyup", _onKeyUp);
    document.getElementById("btn-save-map").addEventListener("click", _saveMap);
    document.getElementById("btn-generate-map").addEventListener("click", () => {
        _generateRandomMap();
    });
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

function _applyBrush(value) {
    for (let dr = 0; dr < BRUSH_SIZE; dr++) {
        for (let dc = 0; dc < BRUSH_SIZE; dc++) {
            const r = cursorRow + dr;
            const c = cursorCol + dc;
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W && grid[r][c] !== 6) {
                grid[r][c] = value;
            }
        }
    }
}

    function _handlePaint(ev) {
        if (heldKeys.has("Space")) {
            _applyBrush(0);
        } else if (heldKeys.has("KeyC") || heldKeys.has("KeyX")) {
            const tid = _currentTileId();
            _applyBrush(tid);
        }
    }

function _handleKey(ev) {
    if (!editorFocused) return;
    if (document.activeElement === nameInput) return;

    switch (ev.code) {
        case "ArrowUp": case "KeyW":
            cursorRow = Math.max(0, cursorRow - BRUSH_SIZE);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        case "ArrowDown": case "KeyS":
            cursorRow = Math.min(GRID_H - BRUSH_SIZE, cursorRow + BRUSH_SIZE);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        case "ArrowLeft": case "KeyA":
            cursorCol = Math.max(0, cursorCol - BRUSH_SIZE);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        case "ArrowRight": case "KeyD":
            cursorCol = Math.min(GRID_W - BRUSH_SIZE, cursorCol + BRUSH_SIZE);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;

        case "KeyC": // Next tile / Place
            if (lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex + 1) % tileIds.length;
            }
            _updateStatusBar();
            _applyBrush(_currentTileId());
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "KeyX": // Prev tile / Place
            if (lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex - 1 + tileIds.length) % tileIds.length;
            }
            _updateStatusBar();
            _applyBrush(_currentTileId());
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "Space": // Erase
            _applyBrush(0);
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

export async function saveCurrentMap() {
    return await _saveMap();
}

export async function saveMapAs(name) {
    try {
        const res = await Api.saveMap(name, grid);
        return res?.saved ?? null;
    } catch { return null; }
}

async function _saveMap() {
    const name = nameInput.value.trim().toUpperCase();
    try {
        const res = await Api.saveMap(name, grid);
        if (res && res.saved) {
            nameInput.value = res.saved;
        }
        await refreshMapList();
        
        const btn = document.getElementById("btn-save-map");
        if (btn) {
            const oldText = btn.textContent;
            btn.textContent = "SAVED!";
            btn.style.backgroundColor = "#4caf50";
            btn.style.color = "#fff";
            setTimeout(() => {
                btn.textContent = oldText;
                btn.style.backgroundColor = "";
                btn.style.color = "";
            }, 2000);
        }
        return res ? res.saved : name;
    } catch (e) {
        alert("SAVE FAILED: " + e.message);
        return null;
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

// ── Tile filter helpers (called by app.js after settings change) ──────

// ── Tile preview renderer (used by the tile-settings screen) ──────────

// These IDs are rendered as a 2×2 big block by _drawTileDetail.
// To show the full sprite in a square preview, we draw all four quadrants.
const _BIG_TILE_IDS = new Set([6, 14, 18, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);

/**
 * Draw a single tile into `ctx` at (0,0) filling `canvasSize` px.
 * Handles big/non-repeating tiles by compositing all 4 quadrants.
 * The caller is responsible for clearing the canvas first.
 */
export function renderTilePreview(ctx, tileId, canvasSize) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    if (tileId === 0) return;

    if (tileId === 4) {
        // Forest uses reduced alpha in the editor
        ctx.save();
        ctx.globalAlpha = 0.65;
        _drawTileDetail(ctx, 4, 0, 0, canvasSize);
        ctx.restore();
    } else if (_BIG_TILE_IDS.has(tileId)) {
        // Non-repeating/big tile: _drawTileDetail draws one quadrant per cell.
        // Render all four at half size so the complete 2×2 sprite fills the canvas.
        const h = canvasSize / 2;
        _drawTileDetail(ctx, tileId, 0, 0, h);   // top-left
        _drawTileDetail(ctx, tileId, h, 0, h);   // top-right
        _drawTileDetail(ctx, tileId, 0, h, h);   // bottom-left
        _drawTileDetail(ctx, tileId, h, h, h);   // bottom-right
    } else {
        _drawTileDetail(ctx, tileId, 0, 0, canvasSize);
    }
}

/**
 * Re-apply the disabled-tile filter to the already-loaded tiles list.
 * Synchronous — no API call needed because `tiles` is already cached.
 */
export function refreshTileFilter() {
    const NOT_ALLOWED = new Set([6, 16, 17, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 34]);
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !NOT_ALLOWED.has(t.id) && !disabled.has(t.id)).map(t => t.id);
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    // Keep tileIndex in bounds after the list shrinks/grows
    tileIndex = Math.min(tileIndex, Math.max(0, tileIds.length - 1));
    _updateStatusBar();
}

/** Replace any currently-disabled tiles on the live grid with empty. */
export function applyDisabledTilesToCurrentGrid() {
    const disabled = _getDisabledTileIds();
    if (disabled.size === 0) return;
    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            if (disabled.has(grid[r][c])) grid[r][c] = 0;
        }
    }
}

/**
 * Save a filtered copy of the current grid (disabled tiles → 0) as AUTOSAVE
 * and return the saved map name. Used by the PLAY button so the game always
 * runs a clean, settings-compliant map.
 */
export async function launchWithFilteredGrid() {
    const disabled = _getDisabledTileIds();
    const filteredGrid = disabled.size > 0
        ? grid.map(row => row.map(tid => disabled.has(tid) ? 0 : tid))
        : grid;
    try {
        const res = await Api.saveMap("AUTOSAVE", filteredGrid);
        return res?.saved ?? null;
    } catch {
        return null;
    }
}

async function _loadMap(name) {
    try {
        const data = await Api.loadMap(name);
        const disabled = _getDisabledTileIds();
        grid = data.grid.map(row => row.map(tid => disabled.has(tid) ? 0 : tid));
        nameInput.value = data.name;
    } catch (e) {
        alert("LOAD FAILED: " + e.message);
    }
}
