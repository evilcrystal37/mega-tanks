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
    // Cycling skips: Empty (0), Base (6), glass cracks (16, 17),
    // sandworm parts (20, 21), raw item pickups (23, 24 — must stay inside their boxes),
    // mushroom cracks (26, 27), rainbow cracks (29, 30)
    const NOT_ALLOWED = new Set([0, 6, 16, 17, 20, 21, 23, 24, 26, 27, 29, 30]);
    tileIds = tiles.filter(t => !NOT_ALLOWED.has(t.id)).map(t => t.id);
    tileIndex = 0;
    _updateStatusBar();
}

function _currentTileId() {
    return tileIds[tileIndex] ?? 1;
}

const MAX_TURRETS = 5;
const TURRET_ID = 25;

// Count logical turrets as 2×2 blocks — top-left corner at even row/col.
// The 2×2 brush always lands on even positions, so each stroke = 1 logical turret.
function _countTurrets() {
    let count = 0;
    for (let r = 0; r < GRID_H; r += 2) {
        for (let c = 0; c < GRID_W; c += 2) {
            if (grid[r][c] === TURRET_ID) count++;
        }
    }
    return count;
}

function _updateTurretCycle() {
    const full = _countTurrets() >= MAX_TURRETS;
    const inCycle = tileIds.includes(TURRET_ID);
    if (full && inCycle) {
        const idx = tileIds.indexOf(TURRET_ID);
        tileIds.splice(idx, 1);
        if (tileIndex >= tileIds.length) tileIndex = 0;
        _updateStatusBar();
    } else if (!full && !inCycle) {
        const insertAt = tileIds.findIndex(id => id > TURRET_ID);
        if (insertAt === -1) tileIds.push(TURRET_ID);
        else tileIds.splice(insertAt, 0, TURRET_ID);
        _updateStatusBar();
    }
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

function _drawTileDetail(ctx, tid, x, y, sz) {
    const dx = Math.round(x);
    const dy = Math.round(y);
    const ds = Math.round(sz);

    const gridC = Math.round(x / sz);
    const gridR = Math.round(y / sz);

    if (tid === 14 || tid === 18 || tid === 25 || (tid >= 26 && tid <= 31)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, ds, ds);
        ctx.clip();

        const centerX = dx + (gridC % 2 === 0 ? ds : 0);
        const centerY = dy + (gridR % 2 === 0 ? ds : 0);
        ctx.translate(centerX, centerY);

        if (tid === 18) {
            // Big Sunflower Emoji
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
        } else if (tid === 25) {
            // Base plate — spans full 2×2 block
            ctx.fillStyle = "#546e7a";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            // Turret dome
            ctx.fillStyle = "#607d8b";
            ctx.beginPath();
            ctx.arc(0, 0, ds * 0.55, 0, Math.PI * 2);
            ctx.fill();
            // Barrel
            ctx.fillStyle = "#37474f";
            ctx.fillRect(-ds * 0.12, -ds * 0.9, ds * 0.24, ds * 0.75);
        } else if (tid >= 26 && tid <= 28) {
            // Mushroom glass box — big-type, centered at (0,0)
            ctx.fillStyle = "rgba(139, 195, 74, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            const cycle = (Date.now() % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.6)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 3;
            ctx.strokeRect(-ds + 3, -ds + 3, ds * 2 - 6, ds * 2 - 6);
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
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
            ctx.fillStyle = "rgba(255, 105, 180, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            const cycle = ((Date.now() + 500) % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.6)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 3;
            ctx.strokeRect(-ds + 3, -ds + 3, ds * 2 - 6, ds * 2 - 6);
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
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
        }

        ctx.restore();
        return;
    }

    if (tid === 6) {
        if (_atlas.draw(ctx, "base.heart.alive", dx, dy, ds, ds)) return;
    }

    if (tid === 7) {
        const time = Date.now();
        ctx.fillStyle = (Math.floor(time / 300) % 2 === 0) ? "#ff3300" : "#ff6600";
        ctx.fillRect(dx, dy, ds, ds);
        
        // Bubbles
        ctx.fillStyle = "#ffcc00";
        const b1 = Math.abs(Math.sin(time / 500)) * ds * 0.2;
        const b2 = Math.abs(Math.cos(time / 400 + 1)) * ds * 0.15;
        ctx.beginPath();
        ctx.arc(dx + ds * 0.3, dy + ds * 0.7, b1, 0, Math.PI * 2);
        ctx.arc(dx + ds * 0.7, dy + ds * 0.3, b2, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.fillStyle = "#5d4037";
        ctx.fillRect(dx, dy, ds, ds);
        ctx.fillStyle = "#3e2723";
        
        // Quicksand animation
        const t = Date.now() / 400;
        const o1 = Math.sin(t) * ds * 0.1;
        const o2 = Math.cos(t * 1.3) * ds * 0.1;
        const o3 = Math.sin(t * 0.8) * ds * 0.1;
        
        ctx.fillRect(dx + ds * 0.2 + o1, dy + ds * 0.2 + o2, ds * 0.2, ds * 0.2);
        ctx.fillRect(dx + ds * 0.6 + o2, dy + ds * 0.5 + o3, ds * 0.2, ds * 0.2);
        ctx.fillRect(dx + ds * 0.3 + o3, dy + ds * 0.7 + o1, ds * 0.2, ds * 0.2);
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
    ];
    
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
    
    // ── Auto-turrets (tile 25) — placed as individual cells ──────────────
    // Each turret is parsed into a live entity at game start, so a large
    // filled shape would spawn too many.  Place 1-3 individual cells.
    const numTurrets = 1 + Math.floor(Math.random() * 3);
    for (let t = 0; t < numTurrets; t++) {
        let tr = Math.floor(Math.random() * (maxR - 2));
        let tc = Math.floor(Math.random() * (maxC - 1));
        grid[tr][tc] = 25;
        // Mirror
        if (symMode === 2) {
            grid[tr][GRID_W - 1 - tc] = 25;
        } else if (symMode === 4) {
            grid[tr][GRID_W - 1 - tc] = 25;
            grid[GRID_H - 1 - tr][tc] = 25;
            grid[GRID_H - 1 - tr][GRID_W - 1 - tc] = 25;
        }
    }

    // ── Power-up glass boxes (28 = mushroom, 31 = rainbow) ───────────────
    // These are non-repeating big-type tiles that must be placed as exact
    // 2×2 blocks aligned to even row/col (matches the editor cursor grid).
    const numBoxes = 1 + Math.floor(Math.random() * 3); // 1-3 boxes
    for (let b = 0; b < numBoxes; b++) {
        const boxTid = Math.random() < 0.5 ? 28 : 31;
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

    // Base protection: Clear area around base and place base struct
    const mid = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    
    // Clear 4x6 area around base
    for (let r = bottom - 3; r <= bottom; r++) {
        for (let c = mid - 2; c <= mid + 2; c++) {
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
                grid[r][c] = 0;
            }
        }
    }
    
    // Re-place base structure
    grid[bottom][mid] = 6;     // Base
    grid[bottom][mid - 1] = 1;   // Left brick
    grid[bottom][mid + 1] = 1;   // Right brick
    grid[bottom - 1][mid - 1] = 1; // Top-left brick
    grid[bottom - 1][mid] = 1;   // Top-mid brick
    grid[bottom - 1][mid + 1] = 1; // Top-right brick
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
        _updateTurretCycle();
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
    // Turrets are big-type 2×2 blocks — block the whole stroke if cap is reached.
    if (value === TURRET_ID && _countTurrets() >= MAX_TURRETS) return;
    for (let dr = 0; dr < BRUSH_SIZE; dr++) {
        for (let dc = 0; dc < BRUSH_SIZE; dc++) {
            const r = cursorRow + dr;
            const c = cursorCol + dc;
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W && grid[r][c] !== 6) {
                grid[r][c] = value;
            }
        }
    }
    _updateTurretCycle();
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

async function _loadMap(name) {
    try {
        const data = await Api.loadMap(name);
        grid = data.grid;
        nameInput.value = data.name;
        _updateTurretCycle();
    } catch (e) {
        alert("LOAD FAILED: " + e.message);
    }
}
