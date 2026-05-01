/**
 * editor.js — Keyboard-driven map construction editor (Battle City style)
 */

import { Api } from "./api.js";
import { SpriteAtlas } from "./spriteAtlas.js";
import { CELL, GRID_H, GRID_W, TILE_GROUPS, TILE_TOGGLES, syncTileCatalogFromApiTiles } from "./constants.js";
import { drawSandTile, drawLavaTile, drawCustomTile, customTileSpanFromTile, resolveCustomMultiOrigin } from "./tileRenderer.js";
import { drawTileCell } from "./tileDrawing.js";
import { createEditorTileDrawBag } from "./tileDrawingCache.js";
import { computeViewport, getCellZoom, resizeCanvas } from "./viewport.js";
import { showConfirm } from "./confirmModal.js";

const BRUSH_SIZE = 2; // 2x2 tiles (4 tiles at once)

// State
let tiles = [];      // TileType objects from backend
let tileIds = [];      // ordered list of non-empty tile ids for cycling
let tileIndex = 0;       // index into tileIds (0 = Brick)
let grid = [];      // Array of tile IDs
let cursorRow = 20;
let cursorCol = 32; // Midpoint of 64
let editorFocused = false;
let editorUIModeActive = false; // When true, arrow keys drive side-panel focus (not canvas painting)
let lastPlacedCol = -1;
let lastPlacedRow = -1;
let heldKeys = new Set();

const _atlas = new SpriteAtlas();
const _editorTileCache = new Map();
let _editorDrawBag = null;

function _getEditorDrawBag() {
    if (!_editorDrawBag) {
        _editorDrawBag = createEditorTileDrawBag(_atlas, _editorTileCache, () => tiles, () => grid);
    }
    return _editorDrawBag;
}

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
export function setEditorUIModeActive(active) {
    editorUIModeActive = !!active;
    // Prevent any in-progress painting while in UI mode.
    if (editorUIModeActive) heldKeys.clear();
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
        
        // 1. Process standard TILE_GROUPS
        for (const [key, ids] of Object.entries(TILE_GROUPS)) {
            if (stored[key] === false) ids.forEach(id => disabled.add(id));
        }
        
        // 2. Process individual custom tiles (IDs >= 100)
        // Key format in localStorage: custom_{id}
        for (const [key, value] of Object.entries(stored)) {
            if (key.startsWith("custom_") && value === false) {
                const id = parseInt(key.replace("custom_", ""));
                if (!isNaN(id)) disabled.add(id);
            }
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
            { id: 0, label: "EMPTY", color: "#000000", editor_placeable: true, is_system: false, settings_toggle_key: null, spawn_timing: "manual" },
            { id: 1, label: "BRICK", color: "#a83800", editor_placeable: true, is_system: false, settings_toggle_key: "tile_brick", spawn_timing: "manual", random_gen: { weight: 8 } },
            { id: 2, label: "STEEL", color: "#808080", editor_placeable: true, is_system: false, settings_toggle_key: "tile_steel", spawn_timing: "manual", random_gen: { weight: 3 } },
            { id: 3, label: "WATER", color: "#1060d0", editor_placeable: true, is_system: false, settings_toggle_key: "tile_water", spawn_timing: "manual", random_gen: { weight: 2 } },
            { id: 4, label: "FOREST", color: "#287800", editor_placeable: true, is_system: false, settings_toggle_key: "tile_forest", spawn_timing: "manual", random_gen: { weight: 3 } },
            { id: 5, label: "ICE", color: "#88d8f8", editor_placeable: true, is_system: false, settings_toggle_key: "tile_ice", spawn_timing: "manual", random_gen: { weight: 2 } },
            { id: 6, label: "BASE", color: "#f8d818", editor_placeable: false, is_system: true, settings_toggle_key: null, spawn_timing: "never" },
        ];
    }
    const blockedTiles = new Set(tiles.filter((t) => t.editor_placeable === false).map((t) => t.id));
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !blockedTiles.has(t.id) && !disabled.has(t.id) && !t.is_system).map(t => t.id);
    // Put empty last so Brick remains the default when opening the editor
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    tileIndex = 0;
    _snapCursorToBrush();
    _editorDrawBag = null;
    _editorTileCache.clear();
    syncTileCatalogFromApiTiles(tiles);
}

function _currentTileId() {
    return tileIds[tileIndex] ?? 1;
}

function _brushSpan() {
    const tid = _currentTileId();
    if (tid < 100) return BRUSH_SIZE;
    const tObj = tiles.find(t => t.id === tid);
    return tObj && tObj.extra_big ? 4 : BRUSH_SIZE;
}

function _snapCursorToBrush() {
    const s = _brushSpan();
    cursorRow = Math.max(0, Math.min(GRID_H - s, cursorRow - (cursorRow % s)));
    cursorCol = Math.max(0, Math.min(GRID_W - s, cursorCol - (cursorCol % s)));
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
    const span = _brushSpan();
    const { vpLeft, vpTop, startC, endC, startR, endR } = computeViewport(
        cursorRow + span / 2,
        cursorCol + span / 2,
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
            if (tid >= 100) {
                const tGhost = tiles.find(t => t.id === tid);
                const csp = customTileSpanFromTile(tGhost);
                if (csp > 1 && csp === span) {
                    const w = span * cell;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(cx, cy, w, w);
                    ctx.clip();
                    ctx.translate(cx + w / 2, cy + w / 2);
                    drawCustomTile(ctx, -w / 2, -w / 2, cell, tid, span);
                    ctx.restore();
                } else {
                    for (let dr = 0; dr < span; dr++) {
                        for (let dc = 0; dc < span; dc++) {
                            _drawTileDetail(ctx, tid, cx + dc * cell, cy + dr * cell, cell);
                        }
                    }
                }
            } else {
                for (let dr = 0; dr < span; dr++) {
                    for (let dc = 0; dc < span; dc++) {
                        _drawTileDetail(ctx, tid, cx + dc * cell, cy + dr * cell, cell);
                    }
                }
            }
        }
        
        // Always draw subtle outline
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, span * cell, span * cell);
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

function _drawTileDetail(ctx, tid, x, y, sz) {
    if (tid === 0) return;
    drawTileCell(ctx, _getEditorDrawBag(), tid, x, y, sz);
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
    _initGrid();

    // ─────────────────────────────────────────────────────────────────────────
    // All placement works in MACRO-CELL space.
    // One macro-cell = one 2×2 block of real grid cells.
    // This guarantees every tile placement is strictly 2×2-aligned — no
    // single-cell (1×1) fragments are ever written to the grid.
    // ─────────────────────────────────────────────────────────────────────────
    const MACRO_W = GRID_W / 2;   // 32 macro columns
    const MACRO_H = GRID_H / 2;   // 21 macro rows

    const symMode = Math.random() > 0.5 ? 4 : 2;  // 4-way quadrant or left↔right
    const disabled = _getDisabledTileIds();

    // Tank-solid tile IDs — these block movement and should never fill corridors
    const TANK_SOLID = new Set([1, 2, 3, 14, 15, 36]);

    // Populate tile pools (timed tiles have no autoGen and are automatically skipped)
    const blockingTiles = [];   // Impassable to tanks (brick, steel, water, glass…)
    const softTiles     = [];   // Passable terrain   (forest, ice, lava, conveyor…)
    const powerupBoxIds = [];
    let   turretTileId  = null;

    for (const toggle of TILE_TOGGLES) {
        const ag = toggle.autoGen;
        if (!ag) continue;
        if (toggle.ids.some(id => disabled.has(id))) continue;

        if (ag.type === 'powerup_2x2') {
            powerupBoxIds.push(toggle.ids[0]);
        } else if (ag.type === 'turret_2x2') {
            turretTileId = toggle.ids[0];
        } else {
            const w    = ag.weight ?? 1;
            const pool = toggle.ids.some(id => TANK_SOLID.has(id)) ? blockingTiles : softTiles;
            for (let i = 0; i < w; i++) pool.push(...toggle.ids);
        }
    }
    if (blockingTiles.length === 0) blockingTiles.push(1);

    // Macro-grid — each cell will be expanded to a 2×2 real-cell block later
    const macro = Array.from({ length: MACRO_H }, () => Array(MACRO_W).fill(0));

    // Generation zone: the quadrant/half we write to before mirroring.
    // The bottom SAFE_ROWS are kept clear of blocking tiles for base approach.
    const SAFE_ROWS = 4;
    const genH = symMode === 4
        ? Math.floor(MACRO_H / 2)    // rows 0-9  (4-way)
        : MACRO_H - SAFE_ROWS;       // rows 0-16 (2-way)
    const genW = Math.floor(MACRO_W / 2);  // cols 0-15 (both modes)

    // Place one macro-cell with left↔right (and top↔bottom for 4-way) mirroring.
    // Must only be called with (mr, mc) inside the generation zone.
    function setMacro(mr, mc, tid) {
        if (mr < 0 || mr >= genH || mc < 0 || mc >= genW) return;
        const mc2 = MACRO_W - 1 - mc;
        const mr2 = MACRO_H - 1 - mr;
        macro[mr ][mc ] = tid;
        macro[mr ][mc2] = tid;
        if (symMode === 4) {
            macro[mr2][mc ] = tid;
            macro[mr2][mc2] = tid;
        }
    }

    // ── Corridor rows: guaranteed horizontal passable lanes ───────────────────
    // Blocking tiles will never be placed on these rows (and any that sneak in
    // via mirroring are cleared in the post-process step below).
    const numLanes    = 2 + Math.floor(Math.random() * 2);            // 2 or 3
    const laneSpacing = Math.max(2, Math.floor(genH / (numLanes + 1)));
    const corridorRows = new Set();
    for (let i = 1; i <= numLanes; i++) {
        const mr = i * laneSpacing;
        if (mr < genH) corridorRows.add(mr);
    }
    // Register mirrored corridor rows for the post-processing pass
    for (const mr of [...corridorRows]) {
        if (symMode === 4) corridorRows.add(MACRO_H - 1 - mr);
    }

    // ── Blocking tile shapes ──────────────────────────────────────────────────
    const isDense     = Math.random() > 0.5;
    const numBlocking = isDense
        ? 10 + Math.floor(Math.random() * 8)
        :  5 + Math.floor(Math.random() * 5);

    for (let i = 0; i < numBlocking; i++) {
        const tid     = blockingTiles[Math.floor(Math.random() * blockingTiles.length)];
        const isHoriz = Math.random() > 0.5;
        const len     = 2 + Math.floor(Math.random() * 5);  // 2-6 macro-cells
        const thick   = 1 + Math.floor(Math.random() * 2);  // 1-2 macro-cells
        const sw      = isHoriz ? len   : thick;
        const sh      = isHoriz ? thick : len;
        if (genH <= sh || genW <= sw) continue;
        const smr = Math.floor(Math.random() * (genH - sh));
        const smc = Math.floor(Math.random() * (genW - sw));
        for (let dr = 0; dr < sh; dr++) {
            const mr = smr + dr;
            if (corridorRows.has(mr)) continue;  // Preserve corridor rows
            for (let dc = 0; dc < sw; dc++) {
                setMacro(mr, smc + dc, tid);
            }
        }
    }

    // ── Soft (passable) terrain patches ──────────────────────────────────────
    // Soft tiles may sit on corridor rows — they don't block tank movement.
    const numSoft = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numSoft; i++) {
        if (softTiles.length === 0) break;
        const tid   = softTiles[Math.floor(Math.random() * softTiles.length)];
        const len   = 2 + Math.floor(Math.random() * 4);
        const thick = 1 + Math.floor(Math.random() * 2);
        const sw    = Math.random() > 0.5 ? len : thick;
        const sh    = Math.random() > 0.5 ? thick : len;
        if (genH <= sh || genW <= sw) continue;
        const smr = Math.floor(Math.random() * (genH - sh));
        const smc = Math.floor(Math.random() * (genW - sw));
        for (let dr = 0; dr < sh; dr++) {
            for (let dc = 0; dc < sw; dc++) {
                setMacro(smr + dr, smc + dc, tid);
            }
        }
    }

    // ── Post-process: enforce passability on corridor rows and the safe zone ──
    // The safe zone keeps the base approach area open; corridor rows are the
    // guaranteed horizontal lanes. Any blocking tile landing there (including
    // via 4-way mirroring) is replaced with empty.
    const safeStart = MACRO_H - SAFE_ROWS;
    for (let mr = 0; mr < MACRO_H; mr++) {
        if (!corridorRows.has(mr) && mr < safeStart) continue;
        for (let mc = 0; mc < MACRO_W; mc++) {
            if (TANK_SOLID.has(macro[mr][mc])) macro[mr][mc] = 0;
        }
    }

    // ── Turrets (1 macro-cell → 2×2 real cells, engine scans even positions) ─
    const numTurrets = turretTileId == null ? 0 : 1 + Math.floor(Math.random() * 2);
    for (let t = 0; t < numTurrets; t++) {
        if (genH < 3 || genW < 3) break;
        const mr = 1 + Math.floor(Math.random() * (genH - 2));
        const mc = 1 + Math.floor(Math.random() * (genW - 2));
        setMacro(mr, mc, turretTileId);
    }

    // ── Power-up glass boxes (1 macro-cell → 2×2 real cells) ─────────────────
    const numBoxes = powerupBoxIds.length > 0 ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let b = 0; b < numBoxes; b++) {
        const boxTid = powerupBoxIds[Math.floor(Math.random() * powerupBoxIds.length)];
        if (genH < 3 || genW < 2) break;
        const mr = 1 + Math.floor(Math.random() * (genH - 2));
        const mc = Math.floor(Math.random() * genW);
        setMacro(mr, mc, boxTid);
    }

    // ── Expand macro-grid → real grid ─────────────────────────────────────────
    // Each macro-cell becomes exactly four real cells (a 2×2 block).
    for (let mr = 0; mr < MACRO_H; mr++) {
        for (let mc = 0; mc < MACRO_W; mc++) {
            const tid = macro[mr][mc];
            if (tid === 0) continue;
            const r = mr * 2, c = mc * 2;
            grid[r    ][c    ] = tid;
            grid[r    ][c + 1] = tid;
            grid[r + 1][c    ] = tid;
            grid[r + 1][c + 1] = tid;
        }
    }

    // ── Base protection (identical to original) ───────────────────────────────
    const mid    = Math.floor(GRID_W / 2);
    const bottom = GRID_H - 1;
    for (let r = bottom - 3; r <= bottom; r++) {
        for (let c = mid - 2; c <= mid + 3; c++) {
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) grid[r][c] = 0;
        }
    }
    grid[bottom    ][mid    ] = 6;   // Base eagle
    grid[bottom    ][mid - 1] = 1;   // West brick
    grid[bottom    ][mid + 2] = 1;   // East brick
    grid[bottom - 1][mid - 1] = 1;   // NW brick
    grid[bottom - 1][mid + 2] = 1;   // NE brick
    grid[bottom - 2][mid - 1] = 1;
    grid[bottom - 2][mid    ] = 1;
    grid[bottom - 2][mid + 1] = 1;
    grid[bottom - 2][mid + 2] = 1;
    _markValidationDirty();
}

function _bindEvents() {
    canvas.addEventListener("click", _onCanvasClick);
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
    document.getElementById("btn-clear-map").addEventListener("click", async () => {
        if (!await showConfirm("CLEAR MAP?")) return;
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
        if (editorUIModeActive) return;
        if (heldKeys.has("KeyX") || heldKeys.has("KeyC") || heldKeys.has("Space")) {
            _handlePaint();
        }
    }, 50);
}

function _onKeyDown(ev) {
    if (!editorFocused) return;
    if (document.activeElement === nameInput) return;
    if (editorUIModeActive) return;
    heldKeys.add(ev.code);
    _handleKey(ev);
}

function _onKeyUp(ev) {
    heldKeys.delete(ev.code);
}

function _onCanvasClick(e) {
    canvas.focus?.();
    editorFocused = true;
    
    if (e.shiftKey) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const cell = _cell || CELL;
        const bs = _brushSpan();
        const { vpLeft, vpTop } = computeViewport(
            cursorRow + bs / 2,
            cursorCol + bs / 2,
            canvas.width,
            canvas.height,
            cell,
            GRID_W,
            GRID_H
        );
        
        const worldX = (mouseX / cell) + vpLeft;
        const worldY = (mouseY / cell) + vpTop;
        
        const c = Math.floor(worldX);
        const r = Math.floor(worldY);
        
        if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
            const tid = grid[r][c];
            if (tid >= 100) {
                const tObj = tiles.find(t => t.id === tid);
                if (tObj) {
                    window.dispatchEvent(new CustomEvent("edit-custom-tile", { detail: { tile: tObj } }));
                }
            }
        }
    }
}

function _clearExtraBigFootprint(r, c) {
    const tid = grid[r][c];
    if (tid === 0 || tid < 100) return false;
    const tObj = tiles.find(t => t.id === tid);
    if (!tObj || !tObj.extra_big) return false;
    const span = customTileSpanFromTile(tObj);
    if (span <= 1) return false;
    const { minR, minC } = resolveCustomMultiOrigin(grid, r, c, tid, span, GRID_H, GRID_W);
    for (let dr = 0; dr < span; dr++) {
        for (let dc = 0; dc < span; dc++) {
            const rr = minR + dr;
            const cc = minC + dc;
            if (rr >= 0 && rr < GRID_H && cc >= 0 && cc < GRID_W && grid[rr][cc] !== 6) {
                grid[rr][cc] = 0;
            }
        }
    }
    return true;
}

function _applyBrush(value) {
    let changed = false;
    const bs = _brushSpan();

    // Clear any extra_big tile whose footprint overlaps the brush area first,
    // so switching from a 4×4 tile to a smaller brush erases the full block.
    for (let dr = 0; dr < bs; dr++) {
        for (let dc = 0; dc < bs; dc++) {
            const r = cursorRow + dr;
            const c = cursorCol + dc;
            if (r >= 0 && r < GRID_H && c >= 0 && c < GRID_W) {
                if (_clearExtraBigFootprint(r, c)) changed = true;
            }
        }
    }

    for (let dr = 0; dr < bs; dr++) {
        for (let dc = 0; dc < bs; dc++) {
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
        case "ArrowUp": case "KeyW": {
            const bs = _brushSpan();
            cursorRow = Math.max(0, cursorRow - bs);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        }
        case "ArrowDown": case "KeyS": {
            const bs = _brushSpan();
            cursorRow = Math.min(GRID_H - bs, cursorRow + bs);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        }
        case "ArrowLeft": case "KeyA": {
            const bs = _brushSpan();
            cursorCol = Math.max(0, cursorCol - bs);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        }
        case "ArrowRight": case "KeyD": {
            const bs = _brushSpan();
            cursorCol = Math.min(GRID_W - bs, cursorCol + bs);
            _lastBlink = performance.now();
            _cursorVisible = true;
            _handlePaint(ev);
            break;
        }

        case "KeyC": // Next tile / Place
            if (!ev.repeat && lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex + 1) % tileIds.length;
                _snapCursorToBrush();
            }
            _applyBrush(_currentTileId());
            lastPlacedRow = cursorRow;
            lastPlacedCol = cursorCol;
            break;

        case "KeyX": // Prev tile / Place
            if (!ev.repeat && lastPlacedRow === cursorRow && lastPlacedCol === cursorCol) {
                tileIndex = (tileIndex - 1 + tileIds.length) % tileIds.length;
                _snapCursorToBrush();
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
                if (!await showConfirm(`DELETE "${name}"?`)) return;
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

    // Special emoji rendering for timed tiles
    if (tileId === 37) {
        // Money tile - 💰
        ctx.font = `${canvasSize * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💰", canvasSize / 2, canvasSize / 2);
        return;
    } else if (tileId === 43) {
        // Sun tile - ☀️
        ctx.font = `${canvasSize * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☀️", canvasSize / 2, canvasSize / 2);
        return;
    } else if (tileId === 47) {
        // Mega gun tile - 🔫
        ctx.font = `${canvasSize * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔫", canvasSize / 2, canvasSize / 2);
        return;
    }
    
    // Letter powerup tiles - show the letter emoji
    // B=51, C=55, F=59, J=63, R=67, A=71, M=75, S=79, Z=83, O=87
    const letterEmojis = {
        51: "🅱️",  // Banana
        55: "🅰️",  // Clone (using A as placeholder, visually shows it's a letter tile)
        59: "🎆",  // Fireworks
        63: "🦘",  // Jump
        67: "🌈",  // Rainbow World
        71: "✈️",  // Airplane
        75: "🧲",  // Magnet
        79: "🏃",  // Sahur (runner)
        83: "💤",  // Zzz (sleep)
        87: "🐙",  // Octopus
    };
    
    if (letterEmojis[tileId]) {
        ctx.font = `${canvasSize * 0.7}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(letterEmojis[tileId], canvasSize / 2, canvasSize / 2);
        return;
    }

    if (tileId >= 100) {
        const tObj = tiles.find(t => t.id === tileId);
        const span = customTileSpanFromTile(tObj);
        if (span > 1) {
            const h = canvasSize / span;
            for (let rr = 0; rr < span; rr++) {
                for (let cc = 0; cc < span; cc++) {
                    _drawTileDetail(ctx, tileId, cc * h, rr * h, h);
                }
            }
        } else {
            _drawTileDetail(ctx, tileId, 0, 0, canvasSize);
        }
        return;
    }

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
    // Block timed tiles (spawn dynamically during gameplay) and other non-manual tiles.
    // Timed tiles must never be manually placeable in the editor - they have spawn timers and lifespans.
    const blockedTiles = new Set(tiles.filter((t) => t.editor_placeable === false).map((t) => t.id));
    const disabled = _getDisabledTileIds();
    tileIds = tiles.filter(t => !blockedTiles.has(t.id) && !disabled.has(t.id)).map(t => t.id);
    tileIds.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
    // Keep tileIndex in bounds after the list shrinks/grows
    tileIndex = Math.min(tileIndex, Math.max(0, tileIds.length - 1));
    _snapCursorToBrush();
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
    // Euclidean distance
    return Math.sqrt(
        Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
    );
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

const IMAGE_IMPORT_PALETTE = [
    // Brown -> Brick
    { id: 1,  color: "#8B4513" }, 
    { id: 1,  color: "#7B4024" }, // Screenshot avg
    { id: 1,  color: "#80300D" }, // Sprite avg

    // Grey -> Steel
    { id: 2,  color: "#808080" }, 
    { id: 2,  color: "#A8A8A8" }, // Screenshot avg
    { id: 2,  color: "#A6A6A6" }, // Screenshot avg
    { id: 2,  color: "#B3B3B3" }, // Sprite avg

    // Blue -> Water
    { id: 3,  color: "#0000FF" }, 
    { id: 3,  color: "#1A7AAD" }, // Sprite avg

    // Green -> Forest
    { id: 4,  color: "#008000" }, 
    { id: 4,  color: "#2D5B08" }, // Screenshot avg
    { id: 4,  color: "#1F871F" }, // Sprite avg

    // Dark grey -> Conveyor
    { id: 8,  color: "#555555" }, 
    { id: 8,  color: "#373737" }, // Screenshot avg

    // Pale yellow -> Sand/Mud
    { id: 12, color: "#FFFACD" }, 
    { id: 12, color: "#D0B787" }, // Screenshot avg
    { id: 12, color: "#CFB787" }, // Screenshot avg

    // Yellow -> Sunflower
    { id: 18, color: "#FFFF00" }, 

    // Purple -> Turret
    { id: 25, color: "#800080" }, 

    // Red -> Lava
    { id: 7,  color: "#FF0000" }, 
    { id: 7,  color: "#B42305" }, // Screenshot avg

    // Orange -> Spec TNT
    { id: 36, color: "#FFA500" }, 

    // Light blue -> Glass
    { id: 15, color: "#ADD8E6" }, 

    // Black -> Empty
    { id: 0,  color: "#000000" }, 

    // White -> Ice
    { id: 5,  color: "#FFFFFF" },
    { id: 5,  color: "#CDF7FF" }  // Sprite avg
];

function _generateMapFromImage(img) {
    // Create offscreen canvas to scale image to grid size
    const offCanvas = document.createElement('canvas');
    offCanvas.width = GRID_W;
    offCanvas.height = GRID_H;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    
    // Draw and scale image
    offCtx.drawImage(img, 0, 0, GRID_W, GRID_H);
    const imgData = offCtx.getImageData(0, 0, GRID_W, GRID_H).data;

    // Initialize color palette
    const disabled = _getDisabledTileIds();
    const palette = [];
    
    for (const item of IMAGE_IMPORT_PALETTE) {
        // Skip if tile is disabled, but never skip Empty (0)
        if (item.id !== 0 && disabled.has(item.id)) continue;
        
        palette.push({
            id: item.id,
            rgb: hexToRgb(item.color)
        });
    }

    // Fallback to empty if palette is somehow just empty
    if (palette.length === 0) palette.push({ id: 0, rgb: { r: 0, g: 0, b: 0 } });

    // Map pixels
    for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
            const idx = (r * GRID_W + c) * 4;
            const pxR = imgData[idx];
            const pxG = imgData[idx + 1];
            const pxB = imgData[idx + 2];
            const pxA = imgData[idx + 3];

            // If transparent, map to empty
            if (pxA < 128) {
                grid[r][c] = 0;
                continue;
            }

            const pxRgb = { r: pxR, g: pxG, b: pxB };
            let bestId = 0;
            let minDist = Infinity;

            for (const p of palette) {
                const dist = colorDistance(pxRgb, p.rgb);
                if (dist < minDist) {
                    minDist = dist;
                    bestId = p.id;
                }
            }

            grid[r][c] = bestId;
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
