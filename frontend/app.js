/**
 * app.js — NES Battle City Screen Router
 *
 * Screens: TITLE -> CONSTRUCTION -> PLAY -> SETTINGS
 */

import { initEditor, focusEditor, blurEditor, refreshMapList, getCurrentMapName, resizeEditor } from "./editor.js";
import { gameRenderer } from "./game.js";

const titleScreen = document.getElementById("title-screen");
const editorScreen = document.getElementById("editor-screen");
const playScreen = document.getElementById("play-screen");
const settingsScreen = document.getElementById("settings-screen");

const btnTitleConstruct = document.getElementById("btn-title-construct");
const btnTitlePlay = document.getElementById("btn-title-play");
const btnTitleSettings = document.getElementById("btn-title-settings");
const btnEditorSettings = document.getElementById("btn-editor-settings");
const btnBackTitle = document.getElementById("btn-back-title");
const btnBackEditor = document.getElementById("btn-back-editor");
const btnRestart = document.getElementById("btn-restart");
const btnStopGame = document.getElementById("btn-stop-game");
const btnLaunchPlay = document.getElementById("btn-launch-play");
const btnSettingsBack = document.getElementById("btn-settings-back");
const btnSettingsReset = document.getElementById("btn-settings-reset");

let currentScreen = "title";
let selectedMenuIndex = 0; // 0: construction, 1: play, 2: settings
let settingsOrigin = "title";

// ── Settings definitions ──────────────────────────────────────────────

const SETTINGS_DEF = [
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

            row.appendChild(header);
            row.appendChild(slider);
            grid.appendChild(row);
        });
    });
}

// ── Init ──────────────────────────────────────────────────────────────

async function init() {
    await initEditor();

    // Screen routing
    btnTitleConstruct.addEventListener("click", () => switchScreen("editor"));
    btnTitlePlay.addEventListener("click", () => {
        const name = getCurrentMapName();
        if (name) launchGame(name);
        else switchScreen("editor"); // Go to editor if no map
    });
    btnTitleSettings.addEventListener("click", () => { settingsOrigin = "title"; switchScreen("settings"); });
    if (btnEditorSettings) btnEditorSettings.addEventListener("click", () => { settingsOrigin = "editor"; switchScreen("settings"); });

    btnBackTitle.addEventListener("click", () => switchScreen("title"));
    btnBackEditor.addEventListener("click", () => switchScreen("editor"));
    btnSettingsBack.addEventListener("click", () => switchScreen(settingsOrigin));
    btnSettingsReset.addEventListener("click", () => {
        saveSettings({});
        buildSettingsUI();
    });

    btnRestart.addEventListener("click", () => {
        const name = getCurrentMapName();
        if (name) launchGame(name);
    });
    btnStopGame.addEventListener("click", () => {
        gameRenderer.stopGame();
        switchScreen("editor");
    });
    btnLaunchPlay.addEventListener("click", () => {
        const name = getCurrentMapName();
        if (name) launchGame(name);
    });

    // Global menu keyboard for title screen
    window.addEventListener("keydown", (ev) => {
        if (currentScreen === "title") {
            if (ev.code === "ArrowUp") _updateMenuSelection(Math.max(0, selectedMenuIndex - 1));
            if (ev.code === "ArrowDown") _updateMenuSelection(Math.min(2, selectedMenuIndex + 1));
            if (ev.code === "Enter") {
                if (selectedMenuIndex === 0) switchScreen("editor");
                else if (selectedMenuIndex === 1) {
                    const name = getCurrentMapName();
                    if (name) launchGame(name);
                    else switchScreen("editor");
                } else {
                    switchScreen("settings");
                }
            }
        }
        if (currentScreen === "settings" && ev.code === "Escape") {
            switchScreen("title");
        }
    });

    _updateMenuSelection(0);
}

// ── Selection ─────────────────────────────────────────────────────────

function _updateMenuSelection(idx) {
    selectedMenuIndex = idx;
    btnTitleConstruct.classList.toggle("selected", idx === 0);
    btnTitlePlay.classList.toggle("selected", idx === 1);
    btnTitleSettings.classList.toggle("selected", idx === 2);
}

// ── Screen Switching ──────────────────────────────────────────────────

function switchScreen(screen) {
    currentScreen = screen;

    titleScreen.classList.toggle("active", screen === "title");
    editorScreen.classList.toggle("active", screen === "editor");
    playScreen.classList.toggle("active", screen === "play");
    settingsScreen.classList.toggle("active", screen === "settings");

    if (screen === "editor") {
        focusEditor();
        refreshMapList();
        resizeEditor();
    } else {
        blurEditor();
    }

    if (screen === "play") {
        gameRenderer._resize();
    }

    if (screen === "settings") {
        buildSettingsUI();
    }
}

// ── Game ──────────────────────────────────────────────────────────────

async function launchGame(mapName) {
    switchScreen("play");
    const settings = getSettings();
    const { cell_zoom, ...gameSettings } = settings;
    try {
        await gameRenderer.startGame(mapName, "default", gameSettings);
    } catch (e) {
        alert("ERROR: " + e.message);
        switchScreen("editor");
    }
}

// ── Entry ─────────────────────────────────────────────────────────────
init();
