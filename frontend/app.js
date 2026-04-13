/**
 * app.js — NES Battle City Screen Router
 *
 * Screens: TITLE -> CONSTRUCTION -> PLAY -> SETTINGS -> TILE-SETTINGS
 */

import { initEditor, focusEditor, blurEditor, refreshMapList, getCurrentMapName, resizeEditor, saveMapAs, launchWithFilteredGrid, refreshTileFilter, applyDisabledTilesToCurrentGrid, renderTilePreview } from "./editor.js";
import { gameRenderer } from "./game.js";
import { TILE_TOGGLES } from "./constants.js";
import { Api } from "./api.js";
import { clearCustomTileCache } from "./tileRenderer.js";

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

let currentScreen = "title";
let selectedMenuIndex = 0; // 0: construction, 1: settings
let settingsOrigin = "title";
let editorReady = false;
let _lastLaunchedMap = null;
let _shiftDown = false; // Track Shift key state reliably across click events
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
            if (!confirm(`DELETE TILE ${toggle.label} PERMANENTLY?`)) return;
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
