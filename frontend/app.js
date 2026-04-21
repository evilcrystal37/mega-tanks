/**
 * app.js — NES Battle City Screen Router
 *
 * Screens: TITLE -> CONSTRUCTION -> PLAY -> SETTINGS -> TILE-SETTINGS
 */

import { initEditor, focusEditor, blurEditor, setEditorUIModeActive, refreshMapList, getCurrentMapName, resizeEditor, saveMapAs, launchWithFilteredGrid, refreshTileFilter, applyDisabledTilesToCurrentGrid, renderTilePreview } from "./editor.js";
import { gameRenderer } from "./game.js";
import { TILE_TOGGLES } from "./constants.js";
import { Api } from "./api.js";
import { clearCustomTileCache } from "./tileRenderer.js";
import { GamepadController, GAMEPAD_ACTIONS, formatGamepadMapping } from "./gamepadController.js";
import { showConfirm, isConfirmModalOpen } from "./confirmModal.js";

const titleScreen       = document.getElementById("title-screen");
const editorScreen      = document.getElementById("editor-screen");
const playScreen        = document.getElementById("play-screen");
const settingsScreen    = document.getElementById("settings-screen");
const tileSettingsScreen = document.getElementById("tile-settings-screen");
const customTileEditorScreen = document.getElementById("custom-tile-editor-screen");

const btnTitleConstruct    = document.getElementById("btn-title-construct");
const btnTitleSettings     = document.getElementById("btn-title-settings");
const btnEditorSettings    = document.getElementById("btn-editor-settings");
const btnBackTitle         = document.getElementById("btn-back-title");
const btnBackEditor        = document.getElementById("btn-back-editor");
const btnRestart           = document.getElementById("btn-restart");
const btnStopGame          = document.getElementById("btn-stop-game");
const btnLaunchPlay        = document.getElementById("btn-launch-play");
const btnSettingsBack      = document.getElementById("btn-settings-back");
const btnSettingsReset     = document.getElementById("btn-settings-reset");
const btnTileEditor        = document.getElementById("btn-tile-editor");
const btnTileSettingsBack  = document.getElementById("btn-tile-settings-back");
const btnTileSettingsReset = document.getElementById("btn-tile-settings-reset");
const btnGamepadSettings   = document.getElementById("btn-gamepad-settings");
const confirmModalYesBtn  = document.getElementById("confirm-modal-yes");
const confirmModalNoBtn   = document.getElementById("confirm-modal-no");

const gamepadSettingsModalOverlay      = document.getElementById("gamepad-settings-modal-overlay");
const btnGamepadSettingsBack           = document.getElementById("btn-gamepad-settings-back");
const gpModalControllerNameEl          = document.getElementById("gamepad-settings-controller-name");
const gpModalGamepadEnabledCheckbox    = document.getElementById("gp-modal-gamepad-enabled");
const gpModalGamepadValueEl            = document.getElementById("gp-modal-gamepad-value");
const gpModalDeadzoneSlider            = document.getElementById("gp-modal-deadzone");
const gpModalDeadzoneValueEl          = document.getElementById("gp-modal-deadzone-value");

let currentScreen = "title";
let selectedMenuIndex = 0; // 0: construction, 1: settings
let settingsOrigin = "title";
let editorReady = false;
let _lastLaunchedMap = null;
let _shiftDown = false; // Track Shift key state reliably across click events
const _gamepadController = new GamepadController();
let _gamepadSettingsModalOpen = false;
/** @type {any[]|null} */
let _spriteDefinitionsCache = null;

window.addEventListener("keydown", (e) => { if (e.key === "Shift") _shiftDown = true; });
window.addEventListener("keyup",   (e) => { if (e.key === "Shift") _shiftDown = false; });
window.addEventListener("edit-custom-tile", (e) => {
    if (e.detail && e.detail.tile) {
        _editCustomTile(e.detail.tile);
    }
});

// ── Tile preview animation loop ───────────────────────────────────────
const TILE_PREVIEW_PX = 14; // canvas buffer size in pixels (4x smaller than before)

let _previewRaf = null;
let _editorPreviewRaf = null;
let _previewCtxs = []; // { ctx, tileId }[]

function _stopTilePreviewLoop() {
    if (_previewRaf) { cancelAnimationFrame(_previewRaf); _previewRaf = null; }
    _previewCtxs = [];
}

function _startTilePreviewLoop() {
    // Only cancel any in-flight RAF — do NOT clear _previewCtxs here,
    // because the caller (buildTileSettingsUI) has already populated it.
    if (_previewRaf) { cancelAnimationFrame(_previewRaf); _previewRaf = null; }
    const frame = () => {
        for (const { ctx, tileId } of _previewCtxs) {
            renderTilePreview(ctx, tileId, TILE_PREVIEW_PX);
        }
        _previewRaf = requestAnimationFrame(frame);
    };
    _previewRaf = requestAnimationFrame(frame);
}

// ── Settings definitions ──────────────────────────────────────────────

const SETTINGS_DEF = [
    {
        section: "AUDIO",
        items: [
            { key: "mute_audio", label: "MUTE SOUNDS", type: "checkbox", def: false, fmt: v => v ? "ON" : "OFF" }
        ]
    },
    {
        section: "DISPLAY",
        items: [
            { key: "cell_zoom", label: "TILE SIZE", min: 0.6, max: 3.0, step: 0.1, def: 2.0, fmt: v => (+v).toFixed(1) + "×" },
        ]
    },
    {
        section: "CONTROLS",
        // Controller name/status is injected dynamically below.
        items: []
    },
    {
        section: "PLAYER",
        items: [
            { key: "tank_speed",      label: "SPEED",       min: 0.01, max: 0.15, step: 0.005, def: 0.025, fmt: v => (v / 0.025).toFixed(1) + "×" },
            { key: "player_fire_rate",label: "FIRE RATE",   min: 5,    max: 120,  step: 1,     def: 25,    fmt: v => Math.round(60 / v) + "/s" },
            { key: "bullet_speed",    label: "BULLET SPEED",min: 0.10, max: 0.90, step: 0.02,  def: 0.28,  fmt: v => (v / 0.28).toFixed(1) + "×" },
            { key: "player_lives",    label: "LIVES",        min: 1,    max: 9,    step: 1,     def: 3,     fmt: v => "♥".repeat(+v) },
        ]
    },
    {
        section: "ENEMY",
        items: [
            { key: "enemy_speed_mult",label: "SPEED",       min: 0.2,  max: 4.0,  step: 0.1,   def: 1.0,   fmt: v => (+v).toFixed(1) + "×" },
            { key: "enemy_fire_rate", label: "FIRE RATE",   min: 10,   max: 200,  step: 5,     def: 40,    fmt: v => Math.round(60 / v) + "/s" },
            { key: "friendly_mode",   label: "FRIENDLY MODE",min: 0,   max: 1,    step: 1,     def: 0,     fmt: v => v ? "ON" : "OFF" },
        ]
    },
    {
        section: "WAVE",
        items: [
            { key: "total_enemies",      label: "TOTAL ENEMIES",  min: 5,  max: 100, step: 5,  def: 20,  fmt: v => +v },
            { key: "max_active_enemies", label: "MAX ON FIELD",   min: 1,  max: 12,  step: 1,  def: 4,   fmt: v => +v },
            { key: "spawn_interval",     label: "SPAWN INTERVAL", min: 10, max: 600, step: 10, def: 90,  fmt: v => (+v / 60).toFixed(1) + "s" },
        ]
    },
];

const TILE_SETTINGS_KEY = "battle_tanks_tile_settings";

function loadTileSettings() {
    try { return JSON.parse(localStorage.getItem(TILE_SETTINGS_KEY)) || {}; } catch { return {}; }
}

function saveTileSettings(s) {
    localStorage.setItem(TILE_SETTINGS_KEY, JSON.stringify(s));
}

// ── Main settings ─────────────────────────────────────────────────────

const SETTINGS_KEY = "battle_tanks_settings";

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
        return {};
    }
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    gameRenderer.gameInput?.reloadSettings?.();
}

function getDefaultSettings() {
    const d = {};
    SETTINGS_DEF.forEach(sec => sec.items.forEach(it => { d[it.key] = it.def; }));
    return d;
}

function getSettings() {
    const stored = loadSettings();
    const defaults = getDefaultSettings();
    return { ...defaults, ...stored };
}

// ── Settings UI ───────────────────────────────────────────────────────

let _gamepadStatusValueEl = null;
let _gamepadStatusListenersBound = false;

function _formatGamepadName(rawId) {
    const id = String(rawId ?? "").trim();
    if (!id) return "CONTROLLER";

    // Typical format: "8BitDo Zero 2 gamepad (STANDARD GAMEPAD Vendor: ... Product: ...)"
    // We only care about the friendly base name.
    let base = id;
    const parenIdx = base.indexOf(" (");
    if (parenIdx !== -1) base = base.slice(0, parenIdx);
    else {
        const anyParenIdx = base.indexOf("(");
        if (anyParenIdx !== -1) base = base.slice(0, anyParenIdx);
    }

    base = base.trim();

    // Strip generic suffixes that some controllers include in their ID.
    base = base.replace(/\s+gamepad$/i, "").trim();

    return base || "CONTROLLER";
}

function _detectFirstConnectedGamepadName() {
    try {
        const pads = navigator?.getGamepads?.();
        if (!pads) return null;
        for (const gp of pads) {
            if (gp && gp.connected) return _formatGamepadName(gp.id);
        }
    } catch {
        // Ignore. Gamepad API may not exist in some browsers.
    }
    return null;
}

function _updateGamepadStatusRow() {
    const name = _detectFirstConnectedGamepadName();
    const text = name || "NONE DETECTED";
    if (_gamepadStatusValueEl) _gamepadStatusValueEl.textContent = text;
    if (_gamepadSettingsModalOpen && gpModalControllerNameEl) gpModalControllerNameEl.textContent = text;
}

function _ensureGamepadStatusListeners() {
    if (_gamepadStatusListenersBound) return;
    const onChange = () => _updateGamepadStatusRow();
    window.addEventListener("gamepadconnected", onChange);
    window.addEventListener("gamepaddisconnected", onChange);
    _gamepadStatusListenersBound = true;
}

function _refreshGamepadSettingsModalControls() {
    if (!gpModalGamepadEnabledCheckbox || !gpModalDeadzoneSlider || !gpModalDeadzoneValueEl) return;

    const raw = loadSettings();
    const enabled = raw.gamepad_enabled === undefined ? true : !!raw.gamepad_enabled;
    const deadzoneRaw = typeof raw.gamepad_deadzone === "number" ? raw.gamepad_deadzone : 0.25;
    const deadzone = Math.max(0, Math.min(1, deadzoneRaw));

    gpModalGamepadEnabledCheckbox.checked = enabled;
    if (gpModalGamepadValueEl) gpModalGamepadValueEl.textContent = enabled ? "ON" : "OFF";

    gpModalDeadzoneSlider.disabled = !enabled;
    gpModalDeadzoneSlider.value = String(deadzone);
    gpModalDeadzoneValueEl.textContent = (+deadzone).toFixed(2);

    const name = _detectFirstConnectedGamepadName();
    if (gpModalControllerNameEl) gpModalControllerNameEl.textContent = name || "NONE DETECTED";
}

function _openGamepadSettingsModal() {
    if (_gamepadSettingsModalOpen) return;
    _gamepadSettingsModalOpen = true;
    if (gamepadSettingsModalOverlay) gamepadSettingsModalOverlay.classList.add("active");
    _refreshGamepadSettingsModalControls();
    _buildGamepadRemapUI();
}

function _closeGamepadSettingsModal() {
    if (!_gamepadSettingsModalOpen) return;
    _gamepadSettingsModalOpen = false;
    if (gamepadSettingsModalOverlay) gamepadSettingsModalOverlay.classList.remove("active");
    _gamepadController?.cancelCapture?.();
}

function _buildGamepadRemapUI() {
    const container = document.getElementById("gamepad-remap-container");
    if (!container) return;

    // Rebuild each open so it always matches the latest persisted mapping.
    container.innerHTML = "";

    const status = document.createElement("div");
    status.id = "gamepad-remap-status";
    status.style.fontSize = "7px";
    status.style.color = "var(--nes-gray)";
    status.style.letterSpacing = "1px";
    status.style.lineHeight = "1.8";
    status.textContent = "READY — press REMAP to bind an input";
    container.appendChild(status);

    const actionsGrid = document.createElement("div");
    actionsGrid.style.display = "flex";
    actionsGrid.style.flexDirection = "column";
    actionsGrid.style.gap = "10px";
    actionsGrid.style.marginTop = "10px";
    container.appendChild(actionsGrid);

    const renderActionRow = (action) => {
        const row = document.createElement("div");
        row.className = "settings-row";

        const header = document.createElement("div");
        header.className = "settings-row-header";

        const label = document.createElement("span");
        label.className = "settings-label";
        label.textContent = action.label;

        const valueEl = document.createElement("span");
        valueEl.className = "settings-value";
        valueEl.id = `gp-remap-value-${action.id}`;
        valueEl.textContent = formatGamepadMapping(_gamepadController.getMapping(action.id));

        header.appendChild(label);
        header.appendChild(valueEl);
        row.appendChild(header);

        const btn = document.createElement("button");
        btn.className = "nes-btn nes-btn-purple";
        btn.style.width = "100%";
        btn.type = "button";
        btn.textContent = "REMAP";
        btn.dataset.gamepadRemapActionId = action.id;

        btn.addEventListener("click", () => {
            if (!_gamepadController) return;
            const capturing = _gamepadController.isCapturing();
            if (capturing) return;

            status.textContent = `CAPTURING: ${action.label} — press a button or move a stick`;

            // Disable all REMAP buttons while capturing.
            const allBtns = container.querySelectorAll("button[data-gamepad-remap-action-id]");
            allBtns.forEach(b => { b.disabled = true; });

            _gamepadController.startCapture(action.id, (mapping) => {
                // Modal may have been closed while capture was in flight.
                if (!_gamepadSettingsModalOpen) return;

                const nextValue = formatGamepadMapping(mapping);
                const vEl = document.getElementById(`gp-remap-value-${action.id}`);
                if (vEl) vEl.textContent = nextValue;

                status.textContent = "READY — press REMAP to bind an input";
                allBtns.forEach(b => { b.disabled = false; });
            });
        });

        row.appendChild(btn);
        actionsGrid.appendChild(row);
    };

    for (const action of GAMEPAD_ACTIONS) {
        renderActionRow(action);
    }

    const resetRow = document.createElement("div");
    resetRow.style.marginTop = "10px";

    const resetBtn = document.createElement("button");
    resetBtn.className = "nes-btn nes-btn-red";
    resetBtn.type = "button";
    resetBtn.textContent = "RESET REMAPS";
    resetBtn.style.width = "100%";
    resetBtn.addEventListener("click", () => {
        _gamepadController.resetMappings();
        for (const action of GAMEPAD_ACTIONS) {
            const vEl = document.getElementById(`gp-remap-value-${action.id}`);
            if (vEl) vEl.textContent = formatGamepadMapping(_gamepadController.getMapping(action.id));
        }
        status.textContent = "READY — remaps restored to defaults";
    });

    resetRow.appendChild(resetBtn);
    container.appendChild(resetRow);
}

function buildSettingsUI() {
    const grid = document.getElementById("settings-grid");
    grid.innerHTML = "";
    const current = getSettings();

    SETTINGS_DEF.forEach(section => {
        const secTitle = document.createElement("div");
        secTitle.className = "settings-section-title";
        secTitle.textContent = section.section;
        grid.appendChild(secTitle);

        section.items.forEach(def => {
            const val = current[def.key] ?? def.def;

            const row = document.createElement("div");
            row.className = "settings-row";

            const header = document.createElement("div");
            header.className = "settings-row-header";

            const label = document.createElement("span");
            label.className = "settings-label";
            label.textContent = def.label;

            const valueEl = document.createElement("span");
            valueEl.className = "settings-value";
            valueEl.textContent = def.fmt(val);

            header.appendChild(label);
            header.appendChild(valueEl);
            row.appendChild(header);

            if (def.type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.className = "nes-checkbox";
                checkbox.checked = val;
                
                // Wrap in a label for better NES.css styling if desired, 
                // but standard checkbox is fine for this simple setup
                
                checkbox.addEventListener("change", () => {
                    const v = checkbox.checked;
                    valueEl.textContent = def.fmt(v);
                    const stored = loadSettings();
                    stored[def.key] = v;
                    saveSettings(stored);
                    
                    // Immediately apply audio mute if changed
                    if (def.key === "mute_audio") {
                        import("./audio.js").then(({ audioManager }) => {
                            audioManager.setMuted(v);
                        });
                    }
                });
                
                row.appendChild(checkbox);
            } else {
                const slider = document.createElement("input");
                slider.type = "range";
                slider.className = "nes-slider";
                slider.min = def.min;
                slider.max = def.max;
                slider.step = def.step;
                slider.value = val;

                slider.addEventListener("input", () => {
                    const v = parseFloat(slider.value);
                    valueEl.textContent = def.fmt(v);
                    const stored = loadSettings();
                    stored[def.key] = v;
                    saveSettings(stored);
                });

                row.appendChild(slider);
            }

            grid.appendChild(row);
        });

        // Live controller status row under the CONTROLS section.
        if (section.section === "CONTROLS") {
            const row = document.createElement("div");
            row.className = "settings-row";

            const header = document.createElement("div");
            header.className = "settings-row-header";

            const label = document.createElement("span");
            label.className = "settings-label";
            label.textContent = "CONTROLLER";

            const valueEl = document.createElement("span");
            valueEl.className = "settings-value";
            valueEl.textContent = "NONE DETECTED";

            header.appendChild(label);
            header.appendChild(valueEl);
            row.appendChild(header);
            grid.appendChild(row);

            _gamepadStatusValueEl = valueEl;
            _updateGamepadStatusRow();
            _ensureGamepadStatusListeners();
        }
    });
}

// ── Tile Settings UI (dedicated screen) ──────────────────────────────

async function _ensureSpriteDefinitions() {
    if (_spriteDefinitionsCache && _spriteDefinitionsCache.length) return _spriteDefinitionsCache;
    _spriteDefinitionsCache = await Api.getTileDefinitions();
    return _spriteDefinitionsCache;
}

async function _populateTemplateSelect() {
    const sel = document.getElementById("ct-template");
    if (!sel) return;
    const defs = await _ensureSpriteDefinitions();
    const keep = sel.value;
    sel.innerHTML = '<option value="">— COPY FROM STOCK TILE —</option>';
    for (const t of defs) {
        if (t.id === 0 || t.id >= 100) continue;
        const opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = `${t.id} — ${t.label || t.name}`;
        sel.appendChild(opt);
    }
    if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function _ctUpdateExplosiveRow() {
    const on = document.getElementById("ct-explosive")?.checked;
    const rad = document.getElementById("ct-explosion-radius");
    if (rad) rad.disabled = !on;
}

function _fillSpriteFormFromTile(t, opts = {}) {
    const fromStock = !!opts.fromStockTemplate;
    const idEl = document.getElementById("ct-id");
    const fileEl = document.getElementById("ct-file");
    const statusLabel = document.getElementById("ct-status");

    if (fromStock) {
        idEl.value = "";
        fileEl.value = "";
        loadedImg = null;
        statusLabel.textContent = "TEMPLATE FROM STOCK — SET ID ≥ 100 AND UPLOAD SPRITE";
        statusLabel.style.color = "#FFD700";
    } else {
        idEl.value = t.id;
        fileEl.value = "";
        statusLabel.textContent = "EDITING TILE " + t.id;
        statusLabel.style.color = "#80deea";
    }

    document.getElementById("ct-name").value = t.name || "";
    document.getElementById("ct-label").value = t.label || "";
    document.getElementById("ct-tanksolid").checked = !!t.tank_solid;
    document.getElementById("ct-bulletsolid").checked = !!t.bullet_solid;
    document.getElementById("ct-destructible").checked = !!t.destructible;
    document.getElementById("ct-transparent").checked = !!t.transparent;
    document.getElementById("ct-slippery").checked = !!t.slippery;
    const ex = !!t.extra_big;
    document.getElementById("ct-extra-big").checked = ex;
    document.getElementById("ct-big").checked = !!t.non_repeating && !ex;
    document.getElementById("ct-lossless").checked = !!t.lossless_sprite;
    document.getElementById("ct-walkable").checked = !!t.walkable;
    document.getElementById("ct-mobile").checked = !!t.mobile;
    {
        const aff = t.creature_affinity;
        const sel = document.getElementById("ct-creature");
        sel.value = aff === "ally" || aff === "enemy" ? aff : "";
    }
    document.getElementById("ct-system").checked = !!t.is_system;
    document.getElementById("ct-box").checked = !!t.is_box;
    document.getElementById("ct-partial").checked = !!t.partial_destructible;
    document.getElementById("ct-jawproof").checked = !!t.jaw_proof;
    document.getElementById("ct-is-base").checked = !!t.is_base;
    document.getElementById("ct-explosive").checked = !!t.is_explosive;
    document.getElementById("ct-explosion-radius").value = t.explosion_radius != null ? t.explosion_radius : 2;
    document.getElementById("ct-speed-mult").value = t.speed_mult != null ? t.speed_mult : 1;
    document.getElementById("ct-damage-target").value =
        t.damage_target_id !== null && t.damage_target_id !== undefined ? t.damage_target_id : "";

    let col = t.color || "#ff00ff";
    if (!/^#[0-9A-Fa-f]{6}$/.test(col)) col = "#ff00ff";
    document.getElementById("ct-color").value = col;
    document.getElementById("ct-color-hex").value = col;

    document.getElementById("ct-template").value = "";
    _ctUpdateExplosiveRow();

    if (!fromStock && t.id >= 100) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            loadedImg = img;
            updatePreview();
        };
        img.src = `assets/custom_tiles/tile_${t.id}.png?t=${Date.now()}`;
    } else {
        updatePreview();
    }
}

function _openSpriteEditorFromStockTemplate(fullTile) {
    switchScreen("custom-tile-editor");
    _fillSpriteFormFromTile(fullTile, { fromStockTemplate: true });
}

function _createTileToggleCard(toggle, isCustom = false, fullTile = null) {
    const stored = loadTileSettings();
    const isEnabled = stored[toggle.key] !== false;

    const item = document.createElement("div");
    item.className = "tile-toggle-item" + (isEnabled ? "" : " disabled-tile");

    // Header for custom tiles (contains Delete button)
    if (isCustom) {
        const header = document.createElement("div");
        header.className = "tile-toggle-header";
        const delBtn = document.createElement("button");
        delBtn.className = "tile-toggle-delete";
        delBtn.textContent = "✕";
        delBtn.title = "DELETE TILE PERMANENTLY";
        delBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
                    if (!await showConfirm(`DELETE TILE ${toggle.label} PERMANENTLY?`)) return;
            try {
                const id = parseInt(toggle.key.replace("custom_", ""));
                await Api.deleteCustomTile(id);
                // Immediately refresh UI
                await buildTileSettingsUI();
            } catch (err) {
                alert("DELETE FAILED: " + err.message);
            }
        };
        header.appendChild(delBtn);
        item.appendChild(header);
    }

    // Live canvas preview
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = TILE_PREVIEW_PX;
    previewCanvas.height = TILE_PREVIEW_PX;
    previewCanvas.className = "tile-toggle-canvas";
    const previewCtx = previewCanvas.getContext("2d");
    previewCtx.imageSmoothingEnabled = false;
    _previewCtxs.push({ ctx: previewCtx, tileId: toggle.ids[0] });

    // Footer row: label + checkbox
    const footer = document.createElement("div");
    footer.className = "tile-toggle-footer";

    const lbl = document.createElement("span");
    lbl.className = "tile-toggle-label";
    lbl.textContent = toggle.label;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "tile-toggle-cb";
    cb.checked = isEnabled;

    cb.onclick = (e) => e.stopPropagation(); // prevent label click issues
    cb.addEventListener("change", () => {
        const s = loadTileSettings();
        s[toggle.key] = cb.checked;
        saveTileSettings(s);
        item.classList.toggle("disabled-tile", !cb.checked);
    });

    footer.appendChild(lbl);
    footer.appendChild(cb);
    item.appendChild(previewCanvas);
    item.appendChild(footer);

    // Make the whole card clickable for toggle; Shift+click opens sprite editor (all tiles)
    item.onclick = (e) => {
        if (e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (!fullTile) return;
            if (fullTile.id >= 100) _editCustomTile(fullTile);
            else _openSpriteEditorFromStockTemplate(fullTile);
            return;
        }
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
    };

    return item;
}

async function buildTileSettingsUI() {
    _stopTilePreviewLoop();

    const container = document.getElementById("tile-toggle-grid");
    container.innerHTML = "";
    _previewCtxs = [];

    let tilesById = new Map();
    try {
        const tiles = await Api.getTiles();
        tilesById = new Map(tiles.map(t => [t.id, t]));
    } catch (e) {
        console.error("Failed to load tiles for settings:", e);
    }

    // 1. Core tiles (pass full API tile for Shift+sprite editor)
    TILE_TOGGLES.forEach(toggle => {
        const fullTile = tilesById.get(toggle.ids[0]);
        container.appendChild(_createTileToggleCard(toggle, false, fullTile || null));
    });

    // 2. Custom tiles
    try {
        const tiles = [...tilesById.values()];
        const customTiles = tiles.filter(t => t.id >= 100 && !t.is_system);
        
        if (customTiles.length > 0) {
            // Add a separator or label?
            const hr = document.createElement("div");
            hr.style = "grid-column: 1 / -1; font-size: 7px; color: var(--nes-cyan); margin: 10px 0 4px; border-bottom: 1px solid #333; padding-bottom: 4px;";
            hr.textContent = "CUSTOM TILES";
            container.appendChild(hr);

            customTiles.forEach(t => {
                const toggle = {
                    key: `custom_${t.id}`,
                    label: t.label || t.name,
                    ids: [t.id]
                };
                container.appendChild(_createTileToggleCard(toggle, true, t));
            });
        }
    } catch (e) {
        console.error("Failed to load custom tiles for settings:", e);
    }

    _startTilePreviewLoop();
}

function _editCustomTile(tile) {
    switchScreen("custom-tile-editor");
    _fillSpriteFormFromTile(tile, { fromStockTemplate: false });
}

// ── Custom Tile Form State & Logic (Global) ───────────────────────────
let loadedImg = null;
let ctCtx = null;
let ctPreview = null;
let ctFile = null;

function updatePreview() {
    if (!ctCtx || !ctPreview) return;
    if (!loadedImg) {
        ctCtx.fillStyle = "#1a1a2e";
        ctCtx.fillRect(0, 0, ctPreview.width, ctPreview.height);
        return;
    }

    const isBig = document.getElementById("ct-big").checked;
    const isExtraBig = document.getElementById("ct-extra-big").checked;
    ctCtx.clearRect(0,0, ctPreview.width, ctPreview.height);
    ctCtx.imageSmoothingEnabled = false;
    
    // Animation logic
    let sourceX = 0;
    const frameHeight = loadedImg.height;
    if (loadedImg.width > frameHeight) {
        const frameCount = Math.floor(loadedImg.width / frameHeight);
        const frameIndex = Math.floor(Date.now() / 200) % frameCount;
        sourceX = frameIndex * frameHeight;
    }
    
    if (isBig || isExtraBig) {
        //2×2 or 4×4 sprite — full frame scaled to preview (64px-tall strip)
        ctCtx.drawImage(loadedImg, sourceX, 0, frameHeight, frameHeight, 0, 0, ctPreview.width, ctPreview.height);
    } else {
        // Fills 1x1 area (32x32). Centered.
        const s = ctPreview.width / 2;
        ctCtx.drawImage(loadedImg, sourceX, 0, frameHeight, frameHeight, s/2, s/2, s, s);
        
        ctCtx.strokeStyle = "rgba(255,255,255,0.1)";
        ctCtx.lineWidth = 1;
        ctCtx.strokeRect(s/2, s/2, s, s);
    }
}

function _startEditorPreviewLoop() {
    if (_editorPreviewRaf) return;
    const loop = () => {
        if (currentScreen === "custom-tile-editor") {
            updatePreview();
            _editorPreviewRaf = requestAnimationFrame(loop);
        } else {
            _editorPreviewRaf = null;
        }
    };
    _editorPreviewRaf = requestAnimationFrame(loop);
}

// ── Gamepad Focus Navigation ─────────────────────────────────────────
// This implements directional navigation (via UI focus) across non-text/non-file
// controls in title/settings/tile/custom screens, editor UI mode right panel + map
// list, and the play overlay buttons.

let _editorUIModeActive = false;

let _focusContext = null; // "title" | "settings" | "tile-settings" | "custom-tile-editor" | "gamepad-modal" | "confirm-modal" | "editor-ui" | "play-overlay" | null
/** @type {{ el: HTMLElement, activate: (ctx: { shiftHeld: boolean })=>void }[]} */
let _focusables = [];
let _focusIndex = 0;
let _focusedEl = null;

function _isPlayOverlayVisible() {
    const ov = document.getElementById("game-overlay");
    if (!ov) return false;
    return ov.style.display !== "none";
}

function _dispatchClick(el, { shiftKey = false } = {}) {
    if (!el) return;
    // Ensure `e.shiftKey` is available to handlers like title/settings clicks and tile card shift-click.
    const ev = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        shiftKey: !!shiftKey,
    });
    el.dispatchEvent(ev);
}

function _clearFocusHighlight() {
    if (_focusedEl) _focusedEl.classList.remove("gamepad-focused");
    _focusedEl = null;
}

function _setFocusIndex(idx) {
    if (!_focusables.length) return;
    _focusIndex = Math.max(0, Math.min(_focusables.length - 1, idx));
    const f = _focusables[_focusIndex];
    if (f?.el) {
        _clearFocusHighlight();
        f.el.classList.add("gamepad-focused");
        _focusedEl = f.el;
        // Ensure the newly-focused control is visible inside scroll containers.
        f.el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
}

function _getCurrentFocusContext() {
    if (isConfirmModalOpen()) return "confirm-modal";
    if (currentScreen === "editor" && _editorUIModeActive) return "editor-ui";
    if (currentScreen === "play" && _isPlayOverlayVisible()) return "play-overlay";
    if (_gamepadSettingsModalOpen) return "gamepad-modal";
    if (currentScreen === "title") return "title";
    if (currentScreen === "settings") return "settings";
    if (currentScreen === "tile-settings") return "tile-settings";
    if (currentScreen === "custom-tile-editor") return "custom-tile-editor";
    return null;
}

function _adjustRangeInput(el, dir) {
    // dir: -1 (left/up) or +1 (right/down)
    const step = parseFloat(el.step || "0") || 0.05;
    const min = parseFloat(el.min || "0");
    const max = parseFloat(el.max || "1");
    const cur = parseFloat(el.value || "0");
    let next = cur + dir * step;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    el.value = String(next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

function _adjustSelect(el, dir) {
    if (!el?.options?.length) return;
    const nextIdx = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
    if (nextIdx === el.selectedIndex) return;
    el.selectedIndex = nextIdx;
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

function _buildFocusablesForContext(ctx) {
    if (!ctx) return { focusables: [], initialIndex: 0 };

    if (ctx === "title") {
        const focusables = [
            {
                el: btnTitleConstruct,
                activate: () => btnTitleConstruct.click(),
            },
            {
                el: btnTitleSettings,
                activate: ({ shiftHeld }) => _dispatchClick(btnTitleSettings, { shiftKey: !!shiftHeld }),
            },
        ];

        // Keep the UI selection in sync with focus.
        _updateMenuSelection(selectedMenuIndex);
        return { focusables, initialIndex: selectedMenuIndex };
    }

    if (ctx === "settings") {
        const grid = document.getElementById("settings-grid");
        const inputs = grid ? Array.from(grid.querySelectorAll("input[type='checkbox'], input[type='range']")) : [];
        const buttons = [
            btnTileEditor,
            btnGamepadSettings,
            btnSettingsReset,
            btnSettingsBack,
        ].filter(Boolean);

        const focusables = [];

        for (const el of inputs) {
            const isCheckbox = el instanceof HTMLInputElement && el.type === "checkbox";
            const isRange = el instanceof HTMLInputElement && el.type === "range";
            focusables.push({
                el,
                activate: () => {
                    if (isCheckbox) el.click();
                    // Range sliders are adjusted with left/right (not confirmed).
                    if (isRange) return;
                },
            });
        }

        for (const el of buttons) {
            focusables.push({
                el,
                activate: ({ shiftHeld }) => {
                    if (el === btnTileEditor) _dispatchClick(el, { shiftKey: !!shiftHeld });
                    else el.click();
                },
            });
        }

        return { focusables, initialIndex: 0 };
    }

    if (ctx === "tile-settings") {
        const grid = document.getElementById("tile-toggle-grid");
        const cards = grid ? Array.from(grid.querySelectorAll(".tile-toggle-item")) : [];
        const focusables = [];

        for (const card of cards) {
            focusables.push({
                el: /** @type {HTMLElement} */ (card),
                activate: ({ shiftHeld }) => _dispatchClick(/** @type {HTMLElement} */ (card), { shiftKey: !!shiftHeld }),
            });
            const delBtn = card.querySelector("button.tile-toggle-delete");
            if (delBtn) {
                focusables.push({
                    el: /** @type {HTMLElement} */ (delBtn),
                    activate: () => delBtn.click(),
                });
            }
        }

        if (btnTileSettingsBack) {
            focusables.push({
                el: btnTileSettingsBack,
                activate: () => btnTileSettingsBack.click(),
            });
        }

        return { focusables, initialIndex: 0 };
    }

    if (ctx === "custom-tile-editor") {
        const focusEls = Array.from(customTileEditorScreen.querySelectorAll("input[type='checkbox'], select, button"))
            .filter(el => {
                // Exclude text/number/file inputs and the preview canvas.
                if (el instanceof HTMLInputElement) return el.type === "checkbox";
                if (el instanceof HTMLButtonElement) return true;
                return el instanceof HTMLSelectElement;
            });

        const focusables = focusEls.map(el => {
            const tag = el.tagName.toLowerCase();
            const activate = ({ shiftHeld }) => {
                if (tag === "input" || tag === "select") {
                    // Checkboxes toggle via click; selects are changed via left/right.
                    if (el instanceof HTMLInputElement && el.type === "checkbox") el.click();
                    return;
                }
                el.click();
            };
            return { el, activate };
        });

        // Ensure save/back exist and are included (better ordering for predictable navigation).
        const saveBtn = document.getElementById("btn-custom-tile-save");
        const backBtn = document.getElementById("btn-custom-tile-back");
        const base = [];
        if (saveBtn) base.push({ el: saveBtn, activate: () => saveBtn.click() });
        if (backBtn) base.push({ el: backBtn, activate: () => backBtn.click() });

        // Keep natural DOM order, but append save/back if missing.
        const hasId = new Set(focusables.map(f => f.el.id).filter(Boolean));
        const appended = [
            ...focusables,
            ...base.filter(f => !hasId.has(f.el.id)),
        ];

        return { focusables: appended, initialIndex: 0 };
    }

    if (ctx === "gamepad-modal") {
        const focusables = [];

        if (gpModalGamepadEnabledCheckbox) {
            focusables.push({
                el: gpModalGamepadEnabledCheckbox,
                activate: () => gpModalGamepadEnabledCheckbox.click(),
            });
        }

        if (gpModalDeadzoneSlider) {
            focusables.push({
                el: gpModalDeadzoneSlider,
                activate: () => { /* slider adjusted with left/right */ },
            });
        }

        const remapButtons = Array.from(document.querySelectorAll("#gamepad-remap-container button[data-gamepad-remap-action-id]"));
        remapButtons.forEach(btn => {
            focusables.push({
                el: /** @type {HTMLElement} */ (btn),
                activate: () => btn.click(),
            });
        });

        const resetBtn = Array.from(document.querySelectorAll("#gamepad-remap-container button.nes-btn-red"))
            .find(b => (b.textContent || "").includes("RESET REMAPS"));
        if (resetBtn) {
            focusables.push({
                el: /** @type {HTMLElement} */ (resetBtn),
                activate: () => resetBtn.click(),
            });
        }

        if (btnGamepadSettingsBack) {
            focusables.push({
                el: btnGamepadSettingsBack,
                activate: () => _closeGamepadSettingsModal(),
            });
        }

        return { focusables, initialIndex: 0 };
    }

    if (ctx === "confirm-modal") {
        const focusables = [];

        if (confirmModalYesBtn && !confirmModalYesBtn.disabled) {
            focusables.push({
                el: confirmModalYesBtn,
                activate: () => confirmModalYesBtn.click(),
            });
        }
        if (confirmModalNoBtn && !confirmModalNoBtn.disabled) {
            focusables.push({
                el: confirmModalNoBtn,
                activate: () => confirmModalNoBtn.click(),
            });
        }

        // Default selection: YES (the modal was opened by a user intent).
        return { focusables, initialIndex: 0 };
    }

    if (ctx === "editor-ui") {
        const focusables = [];
        const rightPanel = editorScreen?.querySelector(".right-panel");
        if (rightPanel) {
            // Exclude file inputs (IMPORT IMG) per user constraint.
            const btnIds = [
                "btn-generate-map",
                "btn-clear-map",
                "btn-save-map",
                "btn-launch-play",
                "btn-editor-settings",
                "btn-back-title",
            ];
            for (const id of btnIds) {
                const el = document.getElementById(id);
                if (!el || el.disabled) continue;
                focusables.push({
                    el,
                    activate: ({ shiftHeld }) => {
                        if (id === "btn-editor-settings") _dispatchClick(el, { shiftKey: !!shiftHeld });
                        else el.click();
                    },
                });
            }
        }

        const mapList = document.getElementById("map-list");
        if (mapList) {
            const mapItems = Array.from(mapList.querySelectorAll(".nes-map-item"));
            for (const item of mapItems) {
                const nameEl = item.querySelector(".nes-map-item-name");
                const delEl = item.querySelector(".nes-map-del");
                if (nameEl) {
                    focusables.push({
                        el: /** @type {HTMLElement} */ (nameEl),
                        activate: () => nameEl.click(),
                    });
                }
                if (delEl) {
                    focusables.push({
                        el: /** @type {HTMLElement} */ (delEl),
                        activate: () => delEl.click(),
                    });
                }
            }
        }

        return { focusables, initialIndex: 0 };
    }

    if (ctx === "play-overlay") {
        const focusables = [];
        if (btnRestart) {
            focusables.push({
                el: btnRestart,
                activate: () => btnRestart.click(),
            });
        }
        if (btnBackEditor) {
            focusables.push({
                el: btnBackEditor,
                activate: () => btnBackEditor.click(),
            });
        }
        return { focusables, initialIndex: 0 };
    }

    return { focusables: [], initialIndex: 0 };
}

function _ensureFocusContext() {
    const ctx = _getCurrentFocusContext();
    if (ctx === _focusContext && _focusables.length) return;

    _focusContext = ctx;
    _focusables = [];
    _focusIndex = 0;
    _clearFocusHighlight();

    if (!ctx) return;

    const { focusables, initialIndex } = _buildFocusablesForContext(ctx);
    _focusables = focusables;
    _setFocusIndex(initialIndex);

    // Keep title UI highlighting consistent with focus.
    if (ctx === "title") _updateMenuSelection(_focusIndex);
}

function _onGamepadNavigate(dir) {
    // Avoid doing anything during remap capture.
    if (_gamepadController?.isCapturing?.()) return;

    _ensureFocusContext();
    if (!_focusables.length) return;

    const focused = _focusables[_focusIndex];
    const el = focused?.el;

    if (el instanceof HTMLInputElement && el.type === "range" && (dir === "left" || dir === "right")) {
        _adjustRangeInput(el, dir === "left" ? -1 : 1);
        return;
    }

    if (el instanceof HTMLSelectElement && (dir === "left" || dir === "right")) {
        _adjustSelect(el, dir === "left" ? -1 : 1);
        return;
    }

    const delta = dir === "up" || dir === "left" ? -1 : dir === "down" || dir === "right" ? 1 : 0;
    if (delta === 0) return;

    const nextIdx = _focusIndex + delta;
    _setFocusIndex(nextIdx);
    if (_focusContext === "title") _updateMenuSelection(_focusIndex);
}

function _onGamepadConfirm({ shiftHeld } = { shiftHeld: false }) {
    if (_gamepadController?.isCapturing?.()) return;

    _ensureFocusContext();
    if (!_focusables.length) return;

    const focused = _focusables[_focusIndex];
    focused?.activate?.({ shiftHeld: !!shiftHeld });

    // Activation might change screens/modals; force rebuild next navigation.
    _focusContext = null;
    _focusables = [];
    _focusIndex = 0;
    _clearFocusHighlight();
}

function _onGamepadBack({ shiftHeld } = { shiftHeld: false }) {
    if (_gamepadController?.isCapturing?.()) return;

    const ctx = _getCurrentFocusContext();
    if (!ctx) return;

    if (ctx === "settings") btnSettingsBack?.click();
    else if (ctx === "tile-settings") btnTileSettingsBack?.click();
    else if (ctx === "custom-tile-editor") document.getElementById("btn-custom-tile-back")?.click();
    else if (ctx === "confirm-modal") confirmModalNoBtn?.click();
    else if (ctx === "gamepad-modal") _closeGamepadSettingsModal();
    else if (ctx === "editor-ui") btnBackTitle?.click();
    else if (ctx === "play-overlay") btnBackEditor?.click();
    // "title" does not have a back action.

    _focusContext = null;
    _focusables = [];
    _focusIndex = 0;
    _clearFocusHighlight();
}

function _onEditorUIModeChanged(active) {
    _editorUIModeActive = !!active;
    setEditorUIModeActive?.(_editorUIModeActive);
    _focusContext = null;
    _focusables = [];
    _focusIndex = 0;
    _clearFocusHighlight();
    if (_editorUIModeActive) _ensureFocusContext();
}

// ── Init ──────────────────────────────────────────────────────────────

async function init() {
    // Start editor init in background so title buttons are responsive immediately.
    const editorInitPromise = initEditor()
        .then(() => { editorReady = true; })
        .catch((err) => {
            console.error("Editor initialization failed:", err);
        });

    // Screen routing
    btnTitleConstruct.addEventListener("click", () => switchScreen("editor"));
    btnTitleSettings.addEventListener("click", (e) => { 
        settingsOrigin = "title"; 
        if (e.shiftKey || _shiftDown) switchScreen("custom-tile-editor");
        else switchScreen("settings"); 
    });
    if (btnEditorSettings) btnEditorSettings.addEventListener("click", (e) => { 
        settingsOrigin = "editor"; 
        if (e.shiftKey || _shiftDown) switchScreen("custom-tile-editor");
        else switchScreen("settings"); 
    });

    btnBackTitle.addEventListener("click", () => switchScreen("title"));
    btnBackEditor.addEventListener("click", () => switchScreen("editor"));
    btnSettingsBack.addEventListener("click", () => switchScreen(settingsOrigin));
    btnSettingsReset.addEventListener("click", () => {
        saveSettings({});
        buildSettingsUI();
        if (_gamepadSettingsModalOpen) _refreshGamepadSettingsModalControls();
    });

    if (btnGamepadSettings) btnGamepadSettings.addEventListener("click", () => _openGamepadSettingsModal());
    if (btnGamepadSettingsBack) btnGamepadSettingsBack.addEventListener("click", () => _closeGamepadSettingsModal());

    gpModalGamepadEnabledCheckbox?.addEventListener("change", () => {
        const checked = !!gpModalGamepadEnabledCheckbox.checked;
        if (gpModalGamepadValueEl) gpModalGamepadValueEl.textContent = checked ? "ON" : "OFF";
        if (gpModalDeadzoneSlider) gpModalDeadzoneSlider.disabled = !checked;

        const stored = loadSettings();
        stored.gamepad_enabled = checked;
        saveSettings(stored);
    });

    gpModalDeadzoneSlider?.addEventListener("input", () => {
        const v = parseFloat(gpModalDeadzoneSlider.value);
        if (gpModalDeadzoneValueEl) gpModalDeadzoneValueEl.textContent = (Number.isFinite(v) ? v : 0.25).toFixed(2);

        const stored = loadSettings();
        stored.gamepad_deadzone = Number.isFinite(v) ? v : 0.25;
        saveSettings(stored);
    });

    btnTileEditor.addEventListener("click", (e) => {
        if (e.shiftKey) switchScreen("custom-tile-editor");
        else switchScreen("tile-settings");
    });
    btnTileSettingsBack.addEventListener("click", () => switchScreen("settings"));
    btnTileSettingsReset.addEventListener("click", () => {
        saveTileSettings({});
        buildTileSettingsUI();
    });

    // Custom Tile Form Logic
    document.getElementById("btn-custom-tile-back").addEventListener("click", () => switchScreen("settings"));
    ctFile = document.getElementById("ct-file");
    ctPreview = document.getElementById("ct-preview");
    ctCtx = ctPreview.getContext("2d");
    
    ctFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) {
            loadedImg = null;
            updatePreview();
            return;
        }
        loadedImg = new Image();
        loadedImg.onload = () => {
            updatePreview();
        };
        loadedImg.src = URL.createObjectURL(file);
    });

    function _onCustomTileLayoutChange(ev) {
        if (ev?.target?.id === "ct-big" && ev.target.checked) {
            document.getElementById("ct-extra-big").checked = false;
        }
        if (ev?.target?.id === "ct-extra-big" && ev.target.checked) {
            document.getElementById("ct-big").checked = false;
        }
        updatePreview();
    }
    document.getElementById("ct-big").addEventListener("change", _onCustomTileLayoutChange);
    document.getElementById("ct-extra-big").addEventListener("change", _onCustomTileLayoutChange);
    document.getElementById("ct-lossless").addEventListener("change", updatePreview);

    const ctColor = document.getElementById("ct-color");
    const ctColorHex = document.getElementById("ct-color-hex");
    ctColor.addEventListener("input", () => {
        ctColorHex.value = ctColor.value;
    });
    ctColorHex.addEventListener("input", () => {
        const v = ctColorHex.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) ctColor.value = v;
    });

    document.getElementById("ct-explosive").addEventListener("change", () => {
        _ctUpdateExplosiveRow();
    });

    document.getElementById("ct-template").addEventListener("change", async (e) => {
        const id = e.target.value;
        if (!id) return;
        await _ensureSpriteDefinitions();
        const t = _spriteDefinitionsCache.find(x => String(x.id) === String(id));
        if (t) _fillSpriteFormFromTile(t, { fromStockTemplate: true });
    });

    document.getElementById("custom-tile-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const file = ctFile.files[0];

        const idValue = parseInt(document.getElementById("ct-id").value, 10);
        if (isNaN(idValue) || idValue < 100) {
            alert("ID MUST BE >= 100 TO AVOID OVERWRITING CORE TILES.");
            return;
        }
        const id = idValue;
        let color = document.getElementById("ct-color-hex").value.trim() || document.getElementById("ct-color").value;
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) color = "#ff00ff";

        const name = document.getElementById("ct-name").value || "custom_tile";
        const label = document.getElementById("ct-label").value || "Custom";
        const tank_solid = document.getElementById("ct-tanksolid").checked;
        const bullet_solid = document.getElementById("ct-bulletsolid").checked;
        const destructible = document.getElementById("ct-destructible").checked;
        const transparent = document.getElementById("ct-transparent").checked;
        const slippery = document.getElementById("ct-slippery").checked;
        const extra_big = document.getElementById("ct-extra-big").checked;
        const non_repeating = document.getElementById("ct-big").checked;
        const lossless_sprite = document.getElementById("ct-lossless").checked;
        const walkable = document.getElementById("ct-walkable").checked;
        const mobile = document.getElementById("ct-mobile").checked;
        const creatureSel = document.getElementById("ct-creature").value.trim();
        const creature_affinity = creatureSel === "ally" || creatureSel === "enemy" ? creatureSel : null;
        const is_system = document.getElementById("ct-system").checked;
        const is_box = document.getElementById("ct-box").checked;
        const partial_destructible = document.getElementById("ct-partial").checked;
        const jaw_proof = document.getElementById("ct-jawproof").checked;
        const is_base = document.getElementById("ct-is-base").checked;
        const is_explosive = document.getElementById("ct-explosive").checked;
        const explosion_radius = parseInt(document.getElementById("ct-explosion-radius").value, 10) || 2;
        const speed_mult = parseFloat(document.getElementById("ct-speed-mult").value) || 1.0;
        const damage_target_id = document.getElementById("ct-damage-target").value
            ? parseInt(document.getElementById("ct-damage-target").value, 10)
            : null;

        const metadata = {
            id,
            name,
            label,
            color,
            tank_solid,
            bullet_solid,
            destructible,
            transparent,
            slippery,
            non_repeating,
            extra_big,
            lossless_sprite,
            walkable,
            mobile,
            creature_affinity,
            is_system,
            is_box,
            partial_destructible,
            damage_target_id,
            jaw_proof,
            is_base,
            is_explosive,
            explosion_radius,
            speed_mult,
        };

        const formData = new FormData();
        formData.append("metadata", JSON.stringify(metadata));
        if (file) formData.append("file", file);

        const statusLabel = document.getElementById("ct-status");
        statusLabel.style.color = "#FFD700";
        statusLabel.textContent = "UPLOADING...";

        try {
            await Api.uploadCustomTile(formData);
            statusLabel.style.color = "#4CAF50";
            statusLabel.textContent = "SUCCESS!";
            
            // Clear the cache for this tile so it reloads in the editor/game
            clearCustomTileCache(id);
            
            // Update the preview image from server to show final processed result
            const refreshImg = new Image();
            refreshImg.crossOrigin = "anonymous";
            refreshImg.onload = () => {
                loadedImg = refreshImg;
                updatePreview();
            };
            refreshImg.src = `assets/custom_tiles/tile_${id}.png?t=${Date.now()}`;
            
            // Re-fetch tiles in editor
            if (editorReady) {
                // Hacky way to force editor to reload tiles
                await initEditor();
            }
            
            // Clear file input but keep the last loaded image for preview
            ctFile.value = "";
        } catch (err) {
            statusLabel.style.color = "#FF0000";
            statusLabel.textContent = err.message || "FAILED";
        }
    });

    btnRestart.addEventListener("click", () => {
        if (_lastLaunchedMap) launchGame(_lastLaunchedMap);
    });
    btnStopGame.addEventListener("click", () => {
        gameRenderer.stopGame();
        switchScreen("editor");
    });
    btnLaunchPlay.addEventListener("click", async () => {
        // Always save a filtered copy of the current grid as AUTOSAVE so the
        // game session respects any disabled-tile settings, regardless of
        // whether the map was previously saved with those tiles present.
        const name = await launchWithFilteredGrid();
        if (name) launchGame(name);
    });

    // Global menu keyboard for title screen
    window.addEventListener("keydown", (ev) => {
        if (isConfirmModalOpen() && ev.code === "Escape") {
            confirmModalNoBtn?.click();
            return;
        }
        if (_gamepadSettingsModalOpen && ev.code === "Escape") {
            _closeGamepadSettingsModal();
            return;
        }

        // Construction/editor: allow keyboard "Select" to enter side-panel navigation,
        // and arrow keys to move focus between buttons/map items.
        if (currentScreen === "editor") {
            if (ev.code === "Tab") {
                ev.preventDefault();
                _onEditorUIModeChanged(!_editorUIModeActive);
                return;
            }

            if (_editorUIModeActive) {
                const dir = ev.code === "ArrowUp" ? "up"
                    : ev.code === "ArrowDown" ? "down"
                        : ev.code === "ArrowLeft" ? "left"
                            : ev.code === "ArrowRight" ? "right"
                                : null;

                if (dir) {
                    ev.preventDefault();
                    _onGamepadNavigate(dir);
                    return;
                }

                if (ev.code === "Enter" || ev.code === "Space") {
                    ev.preventDefault();
                    _onGamepadConfirm({ shiftHeld: false });
                    return;
                }

                if (ev.code === "Escape") {
                    ev.preventDefault();
                    _onEditorUIModeChanged(false);
                    return;
                }
            }
        }

        if (currentScreen === "title") {
            if (ev.code === "ArrowUp") _updateMenuSelection(Math.max(0, selectedMenuIndex - 1));
            if (ev.code === "ArrowDown") _updateMenuSelection(Math.min(1, selectedMenuIndex + 1));
            if (ev.code === "Enter") {
                if (selectedMenuIndex === 0) switchScreen("editor");
                else {
                    settingsOrigin = "title";
                    if (ev.shiftKey) switchScreen("custom-tile-editor");
                    else switchScreen("settings");
                }
            }
        }
        if (currentScreen === "settings" && ev.code === "Escape") {
            switchScreen(settingsOrigin);
        }
        if ((currentScreen === "tile-settings" || currentScreen === "custom-tile-editor") && ev.code === "Escape") {
            switchScreen("settings");
        }
    });

    _updateMenuSelection(0);

    // Start global gamepad driving (poll -> interpret -> inject UI/gameplay actions).
    _gamepadController.startControl({
        getScreen: () => currentScreen,
        isConfirmModalOpen: () => isConfirmModalOpen(),
        onNavigate: (dir) => _onGamepadNavigate(dir),
        onConfirm: (ctx) => _onGamepadConfirm(ctx),
        onBack: (ctx) => _onGamepadBack(ctx),
        onEditorUIModeChanged: (active) => _onEditorUIModeChanged(active),
        onStopGame: () => {
            if (currentScreen !== "play") return;
            gameRenderer.stopGame();
            switchScreen("editor");
        },
        onToggleMute: () => {
            import("./audio.js").then(({ audioManager }) => {
                const muted = audioManager.toggleMuted();
                const stored = loadSettings();
                stored.mute_audio = muted;
                saveSettings(stored);
            });
        },
    });

    // Let editor finish loading without blocking title interactions.
    await editorInitPromise;
}

// ── Selection ─────────────────────────────────────────────────────────

function _updateMenuSelection(idx) {
    selectedMenuIndex = idx;
    btnTitleConstruct.classList.toggle("selected", idx === 0);
    btnTitleSettings.classList.toggle("selected", idx === 1);
}

// ── Screen Switching ──────────────────────────────────────────────────

function switchScreen(screen) {
    // Track whether the user is navigating away from any settings-related screen
    // back to the editor, so we know when to re-apply tile filter.
    const wasInSettings = currentScreen === "settings" || currentScreen === "tile-settings";
    const wasOnTileSettings = currentScreen === "tile-settings";
    if (wasOnTileSettings && screen !== "tile-settings") _stopTilePreviewLoop();

    // If a modal is open, it only applies to the settings screen.
    if (_gamepadSettingsModalOpen && screen !== "settings") _closeGamepadSettingsModal();

    // If we're leaving the construction/editor screen, always exit editor UI mode.
    if (currentScreen === "editor" && _editorUIModeActive && screen !== "editor") {
        _onEditorUIModeChanged(false);
    }

    currentScreen = screen;

    titleScreen.classList.toggle("active", screen === "title");
    editorScreen.classList.toggle("active", screen === "editor");
    playScreen.classList.toggle("active", screen === "play");
    settingsScreen.classList.toggle("active", screen === "settings");
    tileSettingsScreen.classList.toggle("active", screen === "tile-settings");
    customTileEditorScreen.classList.toggle("active", screen === "custom-tile-editor");
    
    if (screen === "custom-tile-editor") {
        _populateTemplateSelect().catch((err) => console.error(err));
        _startEditorPreviewLoop();
    }

    if (screen === "editor") {
        focusEditor();
        if (editorReady) {
            refreshMapList();
            resizeEditor();
        }
        // When returning from any settings screen, refresh palette + strip
        // newly-disabled tiles from the live grid so the editor reflects changes.
        if (wasInSettings && editorReady) {
            refreshTileFilter();
            applyDisabledTilesToCurrentGrid();
        }
    } else {
        blurEditor();
    }

    if (screen === "play") {
        gameRenderer._resize();
    }

    if (screen === "settings") {
        buildSettingsUI();
    } else if (screen === "tile-settings") {
        buildTileSettingsUI();
    } else {
        // Apply audio settings if we're leaving settings
        try {
            const raw = JSON.parse(localStorage.getItem("battle_tanks_settings") ?? "{}");
            import("./audio.js").then(({ audioManager }) => {
                audioManager.setMuted(!!raw.mute_audio);
            });
        } catch { }
    }
}

// ── Game ──────────────────────────────────────────────────────────────

async function launchGame(mapName) {
    _lastLaunchedMap = mapName;
    switchScreen("play");
    const settings = getSettings();
    const { cell_zoom, ...gameSettings } = settings;
    // Also include tile settings for controlling timed tile spawning
    const tileSettings = loadTileSettings();
    const fullSettings = { ...gameSettings, tile_settings: tileSettings };
    try {
        await gameRenderer.startGame(mapName, "default", fullSettings);
    } catch (e) {
        alert("ERROR: " + e.message);
        switchScreen("editor");
    }
}

// ── Entry ─────────────────────────────────────────────────────────────
init();
