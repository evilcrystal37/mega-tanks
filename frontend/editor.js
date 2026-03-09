/**
 * editor.js — Keyboard-driven map construction editor (Battle City style)
 */

import { Api } from "./api.js";
import { SpriteAtlas } from "./spriteAtlas.js";
import { CELL, GRID_H, GRID_W, TILE_GROUPS, TILE_TOGGLES } from "./constants.js";
import { drawSandTile, drawLavaTile } from "./tileRenderer.js";
import { computeViewport, getCellZoom, resizeCanvas } from "./viewport.js";

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
    _markValidationDirty();
}

// ── Tile settings (disabled tiles) ────────────────────────────────────

// Tile groups used by both palette filtering and map generator.
// Must mirror TILE_TOGGLES in app.js (uses same localStorage key).
function _getDisabledTileIds() {
    try {
        const stored = JSON.parse(localStorage.getItem("battle_tanks_tile_settings") ?? "{}");
        const disabled = new Set();
        for (const [key, ids] of Object.entries(TILE_GROUPS)) {
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
    // mushroom cracks (26, 27), rainbow cracks (29, 30), chick cracks (33, 34),
    // money intermediate states (37 pad, 38, 39 cracks), golden frame (41),
    // sun powerup (43–46), mega gun powerup (47–50)
    const NOT_ALLOWED = new Set([6, 16, 17, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 34, 37, 38, 39, 41, 43, 44, 45, 46, 47, 48, 49, 50]);
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !NOT_ALLOWED.has(t.id) && !disabled.has(t.id)).map(t => t.id);
    // Put empty last so Brick remains the default when opening the editor
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    tileIndex = 0;
}

function _currentTileId() {
    return tileIds[tileIndex] ?? 1;
}


// ── Canvas ────────────────────────────────────────────────────────────

function _resize() {
    const zoom = _getCellZoom();
    const sized = resizeCanvas(canvas, GRID_W, GRID_H, zoom);
    _cell = sized.cell;
    canvas.width = sized.width;
    canvas.height = sized.height;
    canvas.style.width = `${sized.width}px`;
    canvas.style.height = `${sized.height}px`;
}

function _getCellZoom() {
    // Editor always fits the full map — tile-size setting only affects the game view.
    return 1.0;
}

// ── Render ────────────────────────────────────────────────────────────

const _BLINK_MS = 500;
let _lastBlink = 0;
let _cursorVisible = true;
let _validationDirty = true;

function _markValidationDirty() {
    _validationDirty = true;
}

function _render(ts = 0) {
    if (document.getElementById("editor-screen") && !document.getElementById("editor-screen").classList.contains("active")) {
        requestAnimationFrame(_render);
        return;
    }

    if (ts - _lastBlink > _BLINK_MS) {
        _cursorVisible = !_cursorVisible;
        _lastBlink = ts;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cell = _cell || CELL;
    const { vpLeft, vpTop, startC, endC, startR, endR } = computeViewport(
        cursorRow + BRUSH_SIZE / 2,
        cursorCol + BRUSH_SIZE / 2,
        canvas.width,
        canvas.height,
        cell,
        GRID_W,
        GRID_H
    );

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

    if (_validationDirty) {
        _validate();
        _validationDirty = false;
    }
    requestAnimationFrame(_render);
}

function _drawSandTile(ctx, dx, dy, ds) { drawSandTile(ctx, dx, dy, ds); }

const _editorTileCache = new Map();

function _createOffscreen(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

function _editorGlassBoxCracks(ctx, tid, ds, color) {
    let level;
    if (tid >= 26 && tid <= 28) level = tid - 26;
    else if (tid >= 29 && tid <= 31) level = tid - 29;
    else if (tid >= 33 && tid <= 35) level = tid - 33;
    else return;
    if (level >= 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (level <= 1) { ctx.moveTo(-ds*0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds*0.4); }
    if (level === 0) { ctx.moveTo(0, 0); ctx.lineTo(ds*0.7, ds*0.7); ctx.moveTo(-ds, ds*0.3); ctx.lineTo(-ds*0.2, 0); }
    ctx.stroke();
}

function _editorGlassBoxBorders(ctx, ds, outerColor, topColor, bottomColor) {
    ctx.strokeStyle = outerColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(-ds + 0.5, -ds + 0.5, ds * 2 - 1, ds * 2 - 1);
    ctx.strokeStyle = topColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
    ctx.strokeStyle = bottomColor;
    ctx.beginPath();
    ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds); ctx.stroke();
}

function _renderEditorBigTileStatic(ctx, tid, ds) {
    if (tid === 18) {
        ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🌼", 0, ds * 0.1);
    } else if (tid === 14 || tid === 36) {
        ctx.fillStyle = "#d32f2f";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(-ds, -ds * 0.3, ds * 2, ds * 0.6);
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${Math.max(6, ds * 0.5)}px monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("TNT", 0, 0);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = ds * 0.05;
        ctx.beginPath();
        for (let i = -0.6; i <= 0.6; i += 0.4) {
            ctx.moveTo(ds * i, -ds); ctx.lineTo(ds * i, -ds * 0.3);
            ctx.moveTo(ds * i, ds * 0.3); ctx.lineTo(ds * i, ds);
        }
        ctx.stroke();
    } else if (tid === 25) {
        const bagR = ds * 0.42;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const bx = Math.cos(a) * bagR, by = Math.sin(a) * bagR;
            const bg = ctx.createRadialGradient(bx - ds*0.03, by - ds*0.03, ds*0.01, bx, by, ds*0.1);
            bg.addColorStop(0, "#a89060"); bg.addColorStop(1, "#6b5030");
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.ellipse(bx, by, ds*0.11, ds*0.08, a, 0, Math.PI*2); ctx.fill();
        }
        const bpg = ctx.createRadialGradient(-ds*0.06, -ds*0.06, ds*0.04, 0, 0, ds*0.33);
        bpg.addColorStop(0, "#95918e"); bpg.addColorStop(0.7, "#706c69"); bpg.addColorStop(1, "#524f4c");
        ctx.fillStyle = bpg;
        ctx.beginPath(); ctx.arc(0, 0, ds*0.33, 0, Math.PI*2); ctx.fill();
        const dg = ctx.createRadialGradient(-ds*0.07, -ds*0.07, ds*0.02, 0, 0, ds*0.24);
        dg.addColorStop(0, "#90a4ae"); dg.addColorStop(0.5, "#546e7a"); dg.addColorStop(1, "#2e4050");
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.arc(0, ds*0.04, ds*0.23, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(-ds*0.13, ds*0.02, ds*0.26, ds*0.05);
        ctx.fillStyle = "rgba(0,220,255,0.6)";
        ctx.fillRect(-ds*0.13, ds*0.02, ds*0.26, ds*0.05);
        ctx.fillStyle = "#455a64";
        ctx.fillRect(-ds*0.11, -ds*0.18, ds*0.22, ds*0.17);
        const barrelGrad = ctx.createLinearGradient(-ds*0.07, 0, ds*0.07, 0);
        barrelGrad.addColorStop(0, "#1c2b33"); barrelGrad.addColorStop(0.35, "#607d8b");
        barrelGrad.addColorStop(0.65, "#455a64"); barrelGrad.addColorStop(1, "#1c2b33");
        ctx.fillStyle = barrelGrad;
        ctx.fillRect(-ds*0.07, -ds*0.95, ds*0.14, ds*0.77);
        ctx.fillStyle = "rgba(160,200,220,0.45)";
        ctx.fillRect(-ds*0.05, -ds*0.95, ds*0.025, ds*0.77);
        ctx.fillStyle = "#263238";
        ctx.fillRect(-ds*0.11, -ds*1.0, ds*0.22, ds*0.08);
        ctx.fillStyle = "#000";
        ctx.fillRect(-ds*0.085, -ds*0.98, ds*0.04, ds*0.055);
        ctx.fillRect(ds*0.045, -ds*0.98, ds*0.04, ds*0.055);
    } else if (tid === 32) {
        ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🐥", 0, ds * 0.1);
    } else if (tid >= 26 && tid <= 28) {
        ctx.fillStyle = "rgba(139, 195, 74, 0.15)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        _editorGlassBoxBorders(ctx, ds, "rgba(139, 195, 74, 0.7)", "rgba(255,255,255,0.5)", "rgba(0,0,0,0.15)");
        ctx.fillStyle = "#f5f5dc";
        ctx.fillRect(-ds * 0.12, ds * 0.1, ds * 0.24, ds * 0.5);
        ctx.fillStyle = "#e52521";
        ctx.beginPath(); ctx.arc(0, ds * 0.1, ds * 0.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(-ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -ds * 0.35, ds * 0.12, 0, Math.PI * 2); ctx.fill();
        _editorGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 29 && tid <= 31) {
        ctx.fillStyle = "rgba(255, 105, 180, 0.15)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        _editorGlassBoxBorders(ctx, ds, "rgba(255, 105, 180, 0.7)", "rgba(255,255,255,0.5)", "rgba(0,0,0,0.15)");
        ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🌈", 0, ds * 0.05);
        _editorGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 33 && tid <= 35) {
        ctx.fillStyle = "rgba(255, 238, 88, 0.15)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        _editorGlassBoxBorders(ctx, ds, "rgba(255, 238, 88, 0.7)", "rgba(255,255,255,0.5)", "rgba(0,0,0,0.15)");
        ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🐥", 0, ds * 0.05);
        _editorGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    }
}

function _renderEditorSmallTileStatic(ctx, tid, ds) {
    if (tid >= 15 && tid <= 17) {
        ctx.fillStyle = "rgba(170, 221, 255, 0.4)";
        ctx.fillRect(0, 0, ds, ds);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = Math.max(1, ds * 0.05);
        ctx.strokeRect(1, 1, ds - 2, ds - 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.beginPath();
        ctx.moveTo(ds*0.1, ds*0.1); ctx.lineTo(ds*0.4, ds*0.1); ctx.lineTo(ds*0.1, ds*0.4);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = Math.max(1, ds * 0.04);
        ctx.beginPath();
        if (tid >= 16) {
            ctx.moveTo(ds*0.5, ds*0.5); ctx.lineTo(ds*0.2, ds*0.2);
            ctx.moveTo(ds*0.5, ds*0.5); ctx.lineTo(ds*0.8, ds*0.3);
            ctx.moveTo(ds*0.5, ds*0.5); ctx.lineTo(ds*0.4, ds*0.8);
        }
        if (tid >= 17) {
            ctx.moveTo(ds*0.5, ds*0.5); ctx.lineTo(ds*0.9, ds*0.8);
            ctx.moveTo(ds*0.5, ds*0.5); ctx.lineTo(ds*0.1, ds*0.7);
            ctx.moveTo(ds*0.2, ds*0.2); ctx.lineTo(ds*0.4, ds*0.1);
            ctx.moveTo(ds*0.4, ds*0.8); ctx.lineTo(ds*0.6, ds*0.9);
        }
        ctx.stroke();
    }
}

function _getCachedEditorBigTile(tid, ds) {
    const key = `${tid}_${ds}`;
    let cached = _editorTileCache.get(key);
    if (cached) return cached;
    const size = ds * 2;
    const canvas = _createOffscreen(size, size);
    const octx = canvas.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.translate(ds, ds);
    _renderEditorBigTileStatic(octx, tid, ds);
    _editorTileCache.set(key, canvas);
    return canvas;
}

function _getCachedEditorSmallTile(tid, ds) {
    const key = `s_${tid}_${ds}`;
    let cached = _editorTileCache.get(key);
    if (cached) return cached;
    const canvas = _createOffscreen(ds, ds);
    const octx = canvas.getContext('2d');
    octx.imageSmoothingEnabled = false;
    _renderEditorSmallTileStatic(octx, tid, ds);
    _editorTileCache.set(key, canvas);
    return canvas;
}

function _drawEditorGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR) {
    let offset, period;
    if (tid >= 26 && tid <= 28) { offset = 0; period = 2000; }
    else if (tid >= 29 && tid <= 31) { offset = 500; period = 2000; }
    else if (tid >= 33 && tid <= 35) { offset = 1000; period = 2000; }
    else return;
    ctx.save();
    ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
    const centerX = dx + (gridC % 2 === 0 ? ds : 0);
    const centerY = dy + (gridR % 2 === 0 ? ds : 0);
    const cycle = ((Date.now() + offset) % period) / period;
    const shineX = centerX + (cycle * 2.5 - 0.75) * ds * 2 - ds;
    const shineGrad = ctx.createLinearGradient(shineX, centerY - ds, shineX + ds * 0.6, centerY + ds);
    shineGrad.addColorStop(0, "rgba(255,255,255,0)");
    shineGrad.addColorStop(0.5, "rgba(255,255,255,0.4)");
    shineGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shineGrad;
    ctx.fillRect(dx, dy, ds, ds);
    ctx.restore();
}

function _drawTileDetail(ctx, tid, x, y, sz) {
    if (tid === 0) return;
    const dx = Math.round(x);
    const dy = Math.round(y);
    const ds = Math.round(sz);
    const gridC = Math.round(x / sz);
    const gridR = Math.round(y / sz);

    // Fully static big tiles — blit from cache
    if (tid === 14 || tid === 18 || tid === 25 || tid === 32) {
        const cached = _getCachedEditorBigTile(tid, ds);
        const sx = gridC % 2 === 0 ? 0 : ds;
        const sy = gridR % 2 === 0 ? 0 : ds;
        ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
        return;
    }

    // Glass boxes — cached static + animated shine
    if ((tid >= 26 && tid <= 31) || (tid >= 33 && tid <= 35)) {
        const cached = _getCachedEditorBigTile(tid, ds);
        const sx = gridC % 2 === 0 ? 0 : ds;
        const sy = gridR % 2 === 0 ? 0 : ds;
        ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
        _drawEditorGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR);
        return;
    }

    // Special TNT — cached base + animated glow
    if (tid === 36) {
        const cached = _getCachedEditorBigTile(36, ds);
        const sx = gridC % 2 === 0 ? 0 : ds;
        const sy = gridR % 2 === 0 ? 0 : ds;
        ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
        ctx.save();
        ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
        ctx.translate(dx + (gridC % 2 === 0 ? ds : 0), dy + (gridR % 2 === 0 ? ds : 0));
        const glowAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
        for (const [lw, a] of [[ds*0.30, 0.18], [ds*0.22, 0.35], [ds*0.14, 0.65], [ds*0.08, glowAlpha]]) {
            ctx.strokeStyle = `rgba(255, 224, 0, ${a})`;
            ctx.lineWidth = lw;
            ctx.strokeRect(-ds + lw/2, -ds + lw/2, ds*2 - lw, ds*2 - lw);
        }
        ctx.restore();
        return;
    }

    // Base — still needs clip/translate (atlas-based, only 1 tile)
    if (tid === 6) {
        ctx.save();
        const centerX = dx + (gridC % 2 === 0 ? ds : 0);
        const centerY = dy + (gridR % 2 === 0 ? ds : 0);
        ctx.beginPath();
        ctx.rect(centerX - ds, centerY - ds, ds * 2, ds * 2);
        ctx.clip();
        ctx.translate(centerX, centerY);
        _atlas.draw(ctx, "base.heart.alive", -ds, -ds, ds * 2, ds * 2);
        ctx.restore();
        return;
    }

    // Glass 1×1 — cached
    if (tid >= 15 && tid <= 17) {
        const cached = _getCachedEditorSmallTile(tid, ds);
        ctx.drawImage(cached, dx, dy);
        return;
    }

    if (tid === 7) {
        drawLavaTile(ctx, dx, dy, ds);
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
        ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
        if (tid === 8) {
            ctx.fillText(arrow, dx + ds/2, dy + ds/2 + ds*0.05 - offset);
            ctx.fillText(arrow, dx + ds/2, dy + ds/2 + ds*0.05 - offset + ds);
        } else if (tid === 9) {
            ctx.fillText(arrow, dx + ds/2, dy + ds/2 + ds*0.05 + offset);
            ctx.fillText(arrow, dx + ds/2, dy + ds/2 + ds*0.05 + offset - ds);
        } else if (tid === 10) {
            ctx.fillText(arrow, dx + ds/2 - offset, dy + ds/2 + ds*0.05);
            ctx.fillText(arrow, dx + ds/2 - offset + ds, dy + ds/2 + ds*0.05);
        } else if (tid === 11) {
            ctx.fillText(arrow, dx + ds/2 + offset, dy + ds/2 + ds*0.05);
            ctx.fillText(arrow, dx + ds/2 + offset - ds, dy + ds/2 + ds*0.05);
        }
        ctx.restore();
        return;
    }

    if (tid === 1) {
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
        ctx.fillStyle = "#222222";
        ctx.fillRect(dx, dy, ds, ds);
        const bob = Math.sin(Date.now() / 150) * ds * 0.15;
        ctx.fillStyle = "#555555";
        ctx.fillRect(dx + ds * 0.1, dy + ds * 0.8, ds * 0.8, ds * 0.15);
        ctx.strokeStyle = "#aaaaaa";
        ctx.lineWidth = ds * 0.12;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        const startY = dy + ds * 0.8;
        const endY = dy + ds * 0.3 + bob;
        const coils = 3;
        const step = (startY - endY) / coils;
        ctx.beginPath();
        ctx.moveTo(dx + ds * 0.5, startY);
        for (let i = 0; i < coils; i++) {
            const y = startY - i * step;
            const nextY = y - step;
            if (i % 2 === 0) { ctx.lineTo(dx + ds*0.8, y - step*0.5); ctx.lineTo(dx + ds*0.2, nextY); }
            else { ctx.lineTo(dx + ds*0.2, y - step*0.5); ctx.lineTo(dx + ds*0.8, nextY); }
        }
        ctx.lineTo(dx + ds * 0.5, endY);
        ctx.stroke();
        ctx.fillStyle = "#ff3333";
        ctx.fillRect(dx + ds*0.15, endY - ds*0.15, ds*0.7, ds*0.15);
        ctx.strokeStyle = "#cc0000";
        ctx.lineWidth = ds * 0.05;
        ctx.strokeRect(dx + ds*0.15, endY - ds*0.15, ds*0.7, ds*0.15);
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

    // Build weighted fill pool and 2×2 placement lists dynamically from TILE_TOGGLES.
    // Adding autoGen metadata to a TILE_TOGGLES entry is all that's needed for new tiles.
    const placeableTiles = [];
    const powerupBoxIds = [];
    let turretTileId = null;

    for (const toggle of TILE_TOGGLES) {
        const ag = toggle.autoGen;
        if (!ag) continue;
        const anyDisabled = toggle.ids.some(id => disabled.has(id));
        if (anyDisabled) continue;

        if (ag.type === "powerup_2x2") {
            powerupBoxIds.push(toggle.ids[0]);
        } else if (ag.type === "turret_2x2") {
            turretTileId = toggle.ids[0];
        } else {
            // Regular fill tile — repeat each id `weight` times
            const w = ag.weight ?? 1;
            for (let i = 0; i < w; i++) {
                placeableTiles.push(...toggle.ids);
            }
        }
    }

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
    
    // ── Auto-turrets — placed as 2×2 blocks at even positions ──
    // Snap to even row/col so each block aligns with the engine's scan.
    const numTurretPlacements = turretTileId == null ? 0 : 1 + Math.floor(Math.random() * 3);
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
                    grid[r][c] = turretTileId;
                    const mirrorC = GRID_W - 1 - c;
                    const mirrorR = GRID_H - 1 - r;
                    if (symMode === 2) {
                        grid[r][mirrorC] = turretTileId;
                    } else if (symMode === 4) {
                        grid[r][mirrorC] = turretTileId;
                        grid[mirrorR][c] = turretTileId;
                        grid[mirrorR][mirrorC] = turretTileId;
                    }
                }
            }
        }
    }

    // ── Power-up glass boxes — placed as 2×2 blocks (populated dynamically from TILE_TOGGLES) ──
    const availableBoxes = powerupBoxIds;
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
    _markValidationDirty();
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
    document.getElementById("btn-import-img").addEventListener("click", () => {
        document.getElementById("import-img-input").click();
    });
    document.getElementById("import-img-input").addEventListener("change", _handleImageUpload);
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
    let changed = false;
    for (let dr = 0; dr < BRUSH_SIZE; dr++) {
        for (let dc = 0; dc < BRUSH_SIZE; dc++) {
            const r = cursorRow + dr;
            const c = cursorCol + dc;
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W && grid[r][c] !== 6) {
                if (grid[r][c] !== value) {
                    grid[r][c] = value;
                    changed = true;
                }
            }
        }
    }
    if (changed) _markValidationDirty();
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
            if (!ev.repeat && lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex + 1) % tileIds.length;
            }
            _applyBrush(_currentTileId());
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "KeyX": // Prev tile / Place
            if (!ev.repeat && lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex - 1 + tileIds.length) % tileIds.length;
            }
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
const _BIG_TILE_IDS = new Set([6, 14, 18, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]);

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
    const NOT_ALLOWED = new Set([6, 16, 17, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 34, 37, 38, 39, 41, 43, 44, 45, 46, 47, 48, 49, 50]);
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !NOT_ALLOWED.has(t.id) && !disabled.has(t.id)).map(t => t.id);
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    // Keep tileIndex in bounds after the list shrinks/grows
    tileIndex = Math.min(tileIndex, Math.max(0, tileIds.length - 1));
}

/** Replace any currently-disabled tiles on the live grid with empty. */
export function applyDisabledTilesToCurrentGrid() {
    const disabled = _getDisabledTileIds();
    if (disabled.size === 0) return;
    let changed = false;
    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            if (disabled.has(grid[r][c])) {
                grid[r][c] = 0;
                changed = true;
            }
        }
    }
    if (changed) _markValidationDirty();
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
        _markValidationDirty();
    } catch (e) {
        alert("LOAD FAILED: " + e.message);
    }
}

// ── Image Import Helpers ──────────────────────────────────────────────

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function colorDistance(rgb1, rgb2) {
    // Redmean color difference (more accurate to human perception than simple Euclidean)
    const rmean = (rgb1.r + rgb2.r) / 2;
    const r = rgb1.r - rgb2.r;
    const g = rgb1.g - rgb2.g;
    const b = rgb1.b - rgb2.b;
    const weightR = 2 + rmean / 256;
    const weightG = 4.0;
    const weightB = 2 + (255 - rmean) / 256;
    
    return Math.sqrt(weightR * r * r + weightG * g * g + weightB * b * b);
}

function _handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            _generateMapFromImage(img);
            e.target.value = ""; // Reset input
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function _generateMapFromImage(img) {
    // Create offscreen canvas to scale image to grid size
    const offCanvas = document.createElement('canvas');
    offCanvas.width = GRID_W;
    offCanvas.height = GRID_H;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    
    // Draw and scale image
    offCtx.drawImage(img, 0, 0, GRID_W, GRID_H);
    const imgData = offCtx.getImageData(0, 0, GRID_W, GRID_H).data;

    // Convert imgData to Float32Array to preserve error in dithering
    const floatData = new Float32Array(imgData.length);
    for (let i = 0; i < imgData.length; i++) {
        floatData[i] = imgData[i];
    }

    // Initialize color palette
    const disabled = _getDisabledTileIds();
    const palette = [];
    
    // Pure black mapped to Empty
    palette.push({ id: 0, rgb: { r: 0, g: 0, b: 0 } });

    for (const toggle of TILE_TOGGLES) {
        if (!toggle.color) continue;
        
        // Exclude big/special tiles, only use 1x1 fills
        const ag = toggle.autoGen;
        if (ag && (ag.type === "powerup_2x2" || ag.type === "turret_2x2")) continue;
        
        // Check if any id in toggle is disabled
        const anyDisabled = toggle.ids.some(id => disabled.has(id));
        if (anyDisabled) continue;

        const rgb = hexToRgb(toggle.color);
        // Add the first id of this tile type to palette
        palette.push({ id: toggle.ids[0], rgb });
    }

    // Fallback to empty if palette is somehow just empty
    if (palette.length === 0) palette.push({ id: 0, rgb: { r: 0, g: 0, b: 0 } });

    // Map pixels with Floyd-Steinberg Dithering
    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            const idx = (r * GRID_W + c) * 4;
            const pxA = floatData[idx + 3];

            // If transparent, map to empty
            if (pxA < 128) {
                grid[r][c] = 0;
                continue;
            }

            const oldR = floatData[idx];
            const oldG = floatData[idx + 1];
            const oldB = floatData[idx + 2];
            
            const pxRgb = { r: oldR, g: oldG, b: oldB };
            let bestId = 0;
            let minDist = Infinity;
            let newR = 0, newG = 0, newB = 0;

            for (const p of palette) {
                const dist = colorDistance(pxRgb, p.rgb);
                if (dist < minDist) {
                    minDist = dist;
                    bestId = p.id;
                    newR = p.rgb.r;
                    newG = p.rgb.g;
                    newB = p.rgb.b;
                }
            }

            grid[r][c] = bestId;

            // Compute quantization error
            const errR = oldR - newR;
            const errG = oldG - newG;
            const errB = oldB - newB;

            // Distribute error to neighbors (Floyd-Steinberg)
            const distributeError = (dr, dc, factor) => {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < GRID_H && nc >= 0 && nc < GRID_W) {
                    const nIdx = (nr * GRID_W + nc) * 4;
                    floatData[nIdx]     += errR * factor;
                    floatData[nIdx + 1] += errG * factor;
                    floatData[nIdx + 2] += errB * factor;
                }
            };

            distributeError(0, 1, 7 / 16);
            distributeError(1, -1, 3 / 16);
            distributeError(1, 0, 5 / 16);
            distributeError(1, 1, 1 / 16);
        }
    }

    // Base Preservation & Finalization
    const mid = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    
    // Clear area around base
    for (let r = bottom - 3; r <= bottom; r++) {
        for (let c = mid - 2; c <= mid + 3; c++) {
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
                grid[r][c] = 0;
            }
        }
    }

    // Place Base and Bricks
    grid[bottom][mid] = 6;     // Base
    grid[bottom][mid - 1] = 1;   // West
    grid[bottom][mid + 2] = 1;   // East
    grid[bottom - 1][mid - 1] = 1; // Northwest
    grid[bottom - 1][mid + 2] = 1; // Northeast
    grid[bottom - 2][mid - 1] = 1;
    grid[bottom - 2][mid] = 1;
    grid[bottom - 2][mid + 1] = 1;
    grid[bottom - 2][mid + 2] = 1;

    _markValidationDirty();
}

// Transitional class wrapper around editor module behavior.
export class MapEditor {
    async init() { await initEditor(); }
    focus() { focusEditor(); }
    blur() { blurEditor(); }
    resize() { resizeEditor(); }
    getGrid() { return getCurrentGrid(); }
    getMapName() { return getCurrentMapName(); }
    async saveAs(name) { return await saveMapAs(name); }
    async launchWithFilteredGrid() { return await launchWithFilteredGrid(); }
    refreshTileFilter() { refreshTileFilter(); }
    applyDisabledTilesToCurrentGrid() { applyDisabledTilesToCurrentGrid(); }
}

export const mapEditor = new MapEditor();
