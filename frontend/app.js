/**
 * app.js — NES Battle City Screen Router
 *
 * Screens: TITLE -> CONSTRUCTION -> PLAY
 */

import { initEditor, focusEditor, blurEditor, refreshMapList, getCurrentMapName } from "./editor.js";
import { gameRenderer } from "./game.js";

const titleScreen = document.getElementById("title-screen");
const editorScreen = document.getElementById("editor-screen");
const playScreen = document.getElementById("play-screen");

const btnTitleConstruct = document.getElementById("btn-title-construct");
const btnTitlePlay = document.getElementById("btn-title-play");
const btnBackTitle = document.getElementById("btn-back-title");
const btnBackEditor = document.getElementById("btn-back-editor");
const btnRestart = document.getElementById("btn-restart");
const btnStopGame = document.getElementById("btn-stop-game");
const btnLaunchPlay = document.getElementById("btn-launch-play");

let currentScreen = "title";
let selectedMenuIndex = 0; // 0: construction, 1: play

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

    btnBackTitle.addEventListener("click", () => switchScreen("title"));
    btnBackEditor.addEventListener("click", () => switchScreen("editor"));
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
            if (ev.code === "ArrowUp") _updateMenuSelection(0);
            if (ev.code === "ArrowDown") _updateMenuSelection(1);
            if (ev.code === "Enter") {
                if (selectedMenuIndex === 0) switchScreen("editor");
                else {
                    const name = getCurrentMapName();
                    if (name) launchGame(name);
                    else switchScreen("editor");
                }
            }
        }
    });

    _updateMenuSelection(0);
}

// ── Selection ─────────────────────────────────────────────────────────

function _updateMenuSelection(idx) {
    selectedMenuIndex = idx;
    btnTitleConstruct.classList.toggle("selected", idx === 0);
    btnTitlePlay.classList.toggle("selected", idx === 1);
}

// ── Screen Switching ──────────────────────────────────────────────────

function switchScreen(screen) {
    currentScreen = screen;

    titleScreen.classList.toggle("active", screen === "title");
    editorScreen.classList.toggle("active", screen === "editor");
    playScreen.classList.toggle("active", screen === "play");

    if (screen === "editor") {
        focusEditor();
        refreshMapList();
    } else {
        blurEditor();
    }

    if (screen === "play") {
        gameRenderer._resize();
    }
}

// ── Game ──────────────────────────────────────────────────────────────

async function launchGame(mapName) {
    switchScreen("play");
    try {
        await gameRenderer.startGame(mapName);
    } catch (e) {
        alert("EROR: " + e.message);
        switchScreen("editor");
    }
}

// ── Entry ─────────────────────────────────────────────────────────────
init();
