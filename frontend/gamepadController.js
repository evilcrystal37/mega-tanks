/**
 * gamepadController.js — Gamepad remap schema + capture helper
 *
 * This module currently focuses on:
 * - remap schema (axes + buttons)
 * - persistence to localStorage
 * - capture UI support (detect next button/axis direction)
 *
 * Screen-aware gameplay/UI driving is handled in a later plan step.
 */

export const GAMEPAD_REMAP_KEY = "battle_tanks_gamepad_remap";

/**
 * @typedef {{ type: "button", button: number }} ButtonMapping
 * @typedef {{ type: "axis", axis: number, sign: "+"|"-" }} AxisMapping
 * @typedef {ButtonMapping|AxisMapping} GamepadMapping
 */

export const GAMEPAD_ACTIONS = [
    { id: "up",            label: "MOVE UP" },
    { id: "down",          label: "MOVE DOWN" },
    { id: "left",          label: "MOVE LEFT" },
    { id: "right",         label: "MOVE RIGHT" },

    { id: "next_tile",    label: "NEXT TILE / FIRE" },
    { id: "prev_tile",    label: "PREV TILE / FIRE" },
    { id: "erase",        label: "ERASE" },

    { id: "pause",        label: "PAUSE" },

    // Modifier used later for "editor UI mode"
    { id: "shift",        label: "SELECT (EDITOR UI MODE)" },

    // Generic UI actions used by the focus navigator later
    { id: "ui_confirm",   label: "CONFIRM (ACTIVATE)" },
    { id: "ui_back",      label: "BACK / CANCEL" },

    // Play-screen actions (wired later)
    { id: "stop",         label: "STOP GAME" },
    { id: "mute",         label: "MUTE AUDIO" },
];

export function getDefaultGamepadRemap() {
    // Default mapping follows common WebGamepad "Standard Gamepad" indices:
    //   A=0, B=1, X=2, Y=3
    //   LB=4, RB=5
    //   Select=8, Start=9
    //
    // Movement defaults are analog-stick based so different controllers still feel consistent:
    //   MOVE UP    -> Axis Y -
    //   MOVE DOWN  -> Axis Y +
    //   MOVE LEFT  -> Axis X -
    //   MOVE RIGHT -> Axis X +
    return {
        up:            { type: "axis", axis: 1, sign: "-" },
        down:          { type: "axis", axis: 1, sign: "+" },
        left:          { type: "axis", axis: 0, sign: "-" },
        right:         { type: "axis", axis: 0, sign: "+" },

        next_tile:    { type: "button", button: 0 },
        prev_tile:    { type: "button", button: 1 },
        erase:         { type: "button", button: 2 },

        pause:         { type: "button", button: 9 },

        // Modifier used for "editor UI mode" (construction side-panel navigation)
        shift:         { type: "button", button: 8 },

        // Default UI actions share A/B inputs; the controller later will interpret them
        // contextually based on the current screen/mode.
        ui_confirm:    { type: "button", button: 0 },
        ui_back:       { type: "button", button: 1 },

        stop:          { type: "button", button: 8 },
        mute:          { type: "button", button: 5 },
    };
}

function _safeParseJSON(s) {
    try { return JSON.parse(s); } catch { return null; }
}

export function loadGamepadRemap() {
    const raw = localStorage.getItem(GAMEPAD_REMAP_KEY);
    if (!raw) return getDefaultGamepadRemap();
    const parsed = _safeParseJSON(raw);
    if (!parsed || typeof parsed !== "object") return getDefaultGamepadRemap();

    // Merge defaults so missing actions still work after schema changes.
    const d = getDefaultGamepadRemap();
    for (const a of GAMEPAD_ACTIONS) {
        if (!parsed[a.id]) continue;
        const m = parsed[a.id];
        if (!m || typeof m !== "object") continue;
        if (m.type === "button" && Number.isInteger(m.button) && m.button >= 0) d[a.id] = { type: "button", button: m.button };
        if (m.type === "axis" && Number.isInteger(m.axis) && (m.sign === "+" || m.sign === "-")) d[a.id] = { type: "axis", axis: m.axis, sign: m.sign };
    }
    return d;
}

export function saveGamepadRemap(remap) {
    localStorage.setItem(GAMEPAD_REMAP_KEY, JSON.stringify(remap));
}

export function formatGamepadMapping(mapping) {
    if (!mapping) return "UNBOUND";
    if (mapping.type === "button") return `Button ${mapping.button}`;
    if (mapping.type === "axis") {
        const axisLabel = mapping.axis === 0 ? "X" : mapping.axis === 1 ? "Y" : `Axis ${mapping.axis}`;
        return `Axis ${axisLabel} ${mapping.sign}`;
    }
    return "UNBOUND";
}

function _isButtonPressed(button) {
    // `pressed` is boolean; `value` is analog (0..1).
    return !!button && (button.pressed || (typeof button.value === "number" && button.value > 0.5));
}

function _getFirstConnectedPad() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const pads = nav?.getGamepads?.();
    if (!pads) return null;
    for (const gp of pads) {
        if (gp && gp.connected) return gp;
    }
    return null;
}

function _readDeadzoneFromSettings(defaultDeadzone = 0.25) {
    const SETTINGS_KEY = "battle_tanks_settings";
    try {
        const stored = _safeParseJSON(localStorage.getItem(SETTINGS_KEY) ?? "{}") ?? {};
        const dz = stored.gamepad_deadzone;
        if (typeof dz === "number" && Number.isFinite(dz)) return Math.max(0, Math.min(1, dz));
    } catch { }
    return defaultDeadzone;
}

function _axisDir(val, deadzone) {
    if (Math.abs(val) < deadzone) return null;
    return val >= 0 ? "+" : "-";
}

function _snapshotPad(pad, deadzone) {
    const buttons = [];
    const btns = pad?.buttons ?? [];
    for (let i = 0; i < btns.length; i++) {
        buttons[i] = _isButtonPressed(btns[i]);
    }

    const axesDir = [];
    const axes = pad?.axes ?? [];
    for (let i = 0; i < axes.length; i++) {
        axesDir[i] = _axisDir(axes[i] ?? 0, deadzone);
    }

    return { buttons, axesDir };
}

function _findCaptureInput(prevSnap, currSnap, currPad) {
    // 1) Buttons: first newly-pressed button wins.
    const btns = currPad?.buttons ?? [];
    for (let i = 0; i < btns.length; i++) {
        const now = !!currSnap.buttons[i];
        const prev = !!prevSnap.buttons[i];
        if (now && !prev) return { type: "button", button: i };
    }

    // 2) Axes: pick the strongest newly-active axis (or sign change).
    let best = null;
    let bestAbs = -Infinity;
    const axes = currPad?.axes ?? [];
    for (let i = 0; i < axes.length; i++) {
        const currDir = currSnap.axesDir[i];
        const prevDir = prevSnap.axesDir[i];
        if (!currDir) continue; // not active
        if (currDir === prevDir) continue; // same direction as before
        const abs = Math.abs(axes[i] ?? 0);
        if (abs > bestAbs) {
            bestAbs = abs;
            best = { type: "axis", axis: i, sign: currDir };
        }
    }

    return best;
}

export class GamepadController {
    constructor() {
        this._remap = loadGamepadRemap();

        this._capture = null; // { actionId, onCaptured, prevSnap }
        this._raf = null;

        // Global control loop (screen-aware gameplay/UI driving).
        this._control = null; // { getScreen, onNavigate, onConfirm, onBack, onEditorUIModeChanged, isConfirmModalOpen, onStopGame, onToggleMute }
        this._controlRaf = null;
        this._prevScreen = null;
        this._prevActionActive = {};

        // Key injection state (tracked so we can always release on mode/screen changes).
        /** @type {Set<string>} */
        this._heldKeyCodes = new Set();

        // Editor canvas movement repeat scheduling.
        this._editorMoveDir = null; // "up"|"down"|"left"|"right"|null
        this._editorMoveNextAt = 0;

        // Editor UI mode: driven by "shift/select" press-to-toggle.
        this._editorUIModeActive = false;

        // UI navigation repeat scheduling (title/settings/editor-ui/play-overlay/confirm-modal).
        this._uiNavDir = null; // "up"|"down"|"left"|"right"|null
        this._uiNavNextAt = 0;
        this._uiNavInitialDelayMs = 180;
        this._uiNavRepeatIntervalMs = 90;
    }

    getMapping(actionId) {
        return this._remap[actionId] ?? null;
    }

    setMapping(actionId, mapping) {
        this._remap[actionId] = mapping;
        saveGamepadRemap(this._remap);
    }

    resetMappings() {
        this._remap = getDefaultGamepadRemap();
        saveGamepadRemap(this._remap);
    }

    isCapturing() {
        return !!this._capture;
    }

    startCapture(actionId, onCaptured) {
        this.cancelCapture();

        const pad = _getFirstConnectedPad();
        const deadzone = _readDeadzoneFromSettings(0.25);
        const prevSnap = pad ? _snapshotPad(pad, deadzone) : { buttons: [], axesDir: [] };

        this._capture = {
            actionId,
            onCaptured,
            prevSnap,
            deadzone,
        };
        this._startCaptureLoop();
    }

    cancelCapture() {
        this._capture = null;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
    }

    _startCaptureLoop() {
        if (this._raf) return;

        const loop = () => {
            if (!this._capture) {
                this._raf = null;
                return;
            }

            const pad = _getFirstConnectedPad();
            if (pad) {
                const deadzone = _readDeadzoneFromSettings(this._capture.deadzone);
                const currSnap = _snapshotPad(pad, deadzone);
                const captured = _findCaptureInput(this._capture.prevSnap, currSnap, pad);

                // Update snapshot so we only capture edges.
                this._capture.prevSnap = currSnap;

                if (captured) {
                    this.setMapping(this._capture.actionId, captured);
                    const cb = this._capture.onCaptured;
                    this.cancelCapture();
                    cb?.(captured);
                    return;
                }
            }

            this._raf = requestAnimationFrame(loop);
        };

        this._raf = requestAnimationFrame(loop);
    }

    /**
     * Start screen-aware gamepad driving.
     * @param {{
     *   getScreen: ()=>string,
     *   isConfirmModalOpen?: ()=>boolean,
     *   onNavigate?: (dir: "up"|"down"|"left"|"right")=>void,
     *   onConfirm?: (ctx: { shiftHeld: boolean })=>void,
     *   onBack?: (ctx: { shiftHeld: boolean })=>void,
     *   onEditorUIModeChanged?: (active: boolean)=>void,
     *   onStopGame?: ()=>void,
     *   onToggleMute?: ()=>void,
     * }} cfg
     */
    startControl(cfg) {
        this._control = cfg;
        if (this._controlRaf) return;

        const loop = () => {
            this._controlRaf = requestAnimationFrame(loop);
            this._tickControl();
        };

        this._controlRaf = requestAnimationFrame(loop);
    }

    _readGamepadEnabledFromSettings(defaultEnabled = true) {
        const SETTINGS_KEY = "battle_tanks_settings";
        try {
            const stored = _safeParseJSON(localStorage.getItem(SETTINGS_KEY) ?? "{}") ?? {};
            const enabled = stored.gamepad_enabled;
            if (enabled === undefined) return defaultEnabled;
            return !!enabled;
        } catch {
            return defaultEnabled;
        }
    }

    _isActionActive(actionId, pad, deadzone) {
        const mapping = this._remap[actionId];
        if (!mapping) return false;

        if (mapping.type === "button") {
            const btn = pad?.buttons?.[mapping.button];
            return _isButtonPressed(btn);
        }

        if (mapping.type === "axis") {
            const val = pad?.axes?.[mapping.axis] ?? 0;
            const dir = _axisDir(val, deadzone);
            const axisActive = dir != null && dir === mapping.sign;
            if (axisActive) return true;

            // Fallback: some controllers report the D-pad on buttons (12-15)
            // even when axes are bound for movement. If an axis direction
            // isn't triggering, allow the corresponding D-pad button to drive it.
            // This is intentionally conservative: only applies to the 4 movement actions.
            if (actionId === "up" || actionId === "down" || actionId === "left" || actionId === "right") {
                const dpadBtn = actionId === "up" ? 12
                    : actionId === "down" ? 13
                        : actionId === "left" ? 14
                            : 15;
                const btn = pad?.buttons?.[dpadBtn];
                return _isButtonPressed(btn);
            }

            return false;
        }

        return false;
    }

    _injectKeyDown(code, opts = {}) {
        const ev = new KeyboardEvent("keydown", {
            code,
            key: code,
            repeat: !!opts.repeat,
            shiftKey: !!opts.shiftKey,
            bubbles: true,
            cancelable: true,
        });
        window.dispatchEvent(ev);
        this._heldKeyCodes.add(code);
    }

    _injectKeyUp(code) {
        const ev = new KeyboardEvent("keyup", {
            code,
            key: code,
            bubbles: true,
            cancelable: true,
        });
        window.dispatchEvent(ev);
        this._heldKeyCodes.delete(code);
    }

    _releaseInjectedKeyIfHeld(code) {
        if (!this._heldKeyCodes.has(code)) return;
        this._injectKeyUp(code);
    }

    _releaseAllInjectedKeys() {
        // Arrow movement keys + editor paint keys used by this project.
        const codes = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyC", "KeyX", "Space"];
        for (const c of codes) this._releaseInjectedKeyIfHeld(c);
    }

    _resolvedMoveDir(actionActive, prevResolvedDir = null) {
        // Deterministic diagonal resolution: prefer vertical, then horizontal.
        if (actionActive.up) return "up";
        if (actionActive.down) return "down";
        if (actionActive.left) return "left";
        if (actionActive.right) return "right";
        return null;
    }

    _shouldNavigateEdge(actionActive, actionId) {
        const now = !!actionActive[actionId];
        const prev = !!this._prevActionActive[actionId];
        return now && !prev;
    }

    _tickControl() {
        if (!this._control) return;
        if (this.isCapturing()) return; // remap capture mode has priority

        const screen = this._control.getScreen?.();
        const gamepadEnabled = this._readGamepadEnabledFromSettings(true);

        // If the screen changed, release any injected keys so we never get "stuck" input.
        if (screen !== this._prevScreen) {
            this._releaseAllInjectedKeys();
            this._editorMoveDir = null;
            this._editorMoveNextAt = 0;
            this._uiNavDir = null;
            this._uiNavNextAt = 0;
            this._editorUIModeActive = false;
            this._prevScreen = screen;
            // Also reset editor UI mode scheduling; app.js will be told on next tick.
        }

        // When disabled, do nothing (but still keep the "release injected keys on screen change" invariant).
        if (!gamepadEnabled) {
            this._prevActionActive = {};
            return;
        }

        const pad = _getFirstConnectedPad();
        const deadzone = _readDeadzoneFromSettings(0.25);

        // No pad -> release any injected keys.
        if (!pad) {
            this._releaseAllInjectedKeys();
            this._prevActionActive = {};
            return;
        }

        // Evaluate all relevant action states.
        const actionActive = {
            up: this._isActionActive("up", pad, deadzone),
            down: this._isActionActive("down", pad, deadzone),
            left: this._isActionActive("left", pad, deadzone),
            right: this._isActionActive("right", pad, deadzone),

            next_tile: this._isActionActive("next_tile", pad, deadzone),
            prev_tile: this._isActionActive("prev_tile", pad, deadzone),
            erase: this._isActionActive("erase", pad, deadzone),

            pause: this._isActionActive("pause", pad, deadzone),

            shift: this._isActionActive("shift", pad, deadzone),

            ui_confirm: this._isActionActive("ui_confirm", pad, deadzone),
            ui_back: this._isActionActive("ui_back", pad, deadzone),

            stop: this._isActionActive("stop", pad, deadzone),
            mute: this._isActionActive("mute", pad, deadzone),
        };

        const now = Date.now();

        const shiftHeld = !!actionActive.shift;
        const shiftPressed = shiftHeld && !this._prevActionActive.shift;

        // Confirm modal: suppress all other inputs while open.
        if (this._control.isConfirmModalOpen?.()) {
            this._releaseAllInjectedKeys();
            this._editorMoveDir = null;
            this._editorMoveNextAt = 0;
            this._playMoveDir = null;

            const navDir = this._tickUINavigate(actionActive, now);
            if (navDir && this._control.onNavigate) this._control.onNavigate(navDir);

            const confirmPressed = actionActive.ui_confirm && !this._prevActionActive.ui_confirm;
            if (confirmPressed && this._control.onConfirm) this._control.onConfirm({ shiftHeld });

            const backPressed = actionActive.ui_back && !this._prevActionActive.ui_back;
            if (backPressed && this._control.onBack) this._control.onBack({ shiftHeld });

            this._prevActionActive = actionActive;
            return;
        }

        // Stop + mute are always edge-triggered.
        const stopPressed = actionActive.stop && !this._prevActionActive.stop;
        const mutePressed = actionActive.mute && !this._prevActionActive.mute;
        if (stopPressed && this._control.onStopGame) this._control.onStopGame();
        if (mutePressed && this._control.onToggleMute) this._control.onToggleMute();

        // Play overlay: if the game-over/victory overlay is visible, route input to its buttons.
        const playOverlayVisible = (() => {
            if (screen !== "play") return false;
            const ov = document.getElementById("game-overlay");
            if (!ov) return false;
            // hud.js toggles display between "none" and "flex"
            return ov.style.display !== "none";
        })();

        // UI-mode routing
        if (screen === "editor" && shiftPressed) {
            // Press-to-toggle editor UI mode (construction side-panel navigation).
            this._editorUIModeActive = !this._editorUIModeActive;
            this._control.onEditorUIModeChanged?.(this._editorUIModeActive);
        }

        if (screen === "editor" && this._editorUIModeActive) {
            // Entering editor UI mode should suppress canvas movement/painting.
            this._releaseAllInjectedKeys();

            const navDir = this._tickUINavigate(actionActive, now);
            if (navDir && this._control.onNavigate) this._control.onNavigate(navDir);

            const confirmPressed = actionActive.ui_confirm && !this._prevActionActive.ui_confirm;
            if (confirmPressed && this._control.onConfirm) this._control.onConfirm({ shiftHeld });

            const backPressed = actionActive.ui_back && !this._prevActionActive.ui_back;
            if (backPressed && this._control.onBack) this._control.onBack({ shiftHeld });

            this._prevActionActive = actionActive;
            return;
        }

        if (screen === "play" && playOverlayVisible) {
            const navDir = this._tickUINavigate(actionActive, now);
            if (navDir && this._control.onNavigate) this._control.onNavigate(navDir);

            const confirmPressed = actionActive.ui_confirm && !this._prevActionActive.ui_confirm;
            if (confirmPressed && this._control.onConfirm) this._control.onConfirm({ shiftHeld });

            const backPressed = actionActive.ui_back && !this._prevActionActive.ui_back;
            if (backPressed && this._control.onBack) this._control.onBack({ shiftHeld });

            this._prevActionActive = actionActive;
            return;
        }

        // Gameplay routing
        if (screen === "editor") {
            // When not in editor UI mode, D-pad is used for canvas movement/painting
            // and should not keep UI-navigation repeating.
            this._uiNavDir = null;
            this._uiNavNextAt = 0;

            // Movement (repeat keydown while held, deterministic single-direction resolution).
            const resolved = this._resolvedMoveDir(actionActive);

            const arrowCodeByDir = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

            if (resolved !== this._editorMoveDir) {
                // Direction changed -> release previous key + inject new.
                if (this._editorMoveDir) this._releaseInjectedKeyIfHeld(arrowCodeByDir[this._editorMoveDir]);
                this._editorMoveDir = resolved;

                if (resolved) {
                    this._injectKeyDown(arrowCodeByDir[resolved], { repeat: false });
                    // Mimic keyboard: initial delay, then repeated keydowns.
                    this._editorMoveNextAt = now + 180;
                } else {
                    this._editorMoveNextAt = 0;
                }
            } else if (resolved) {
                if (now >= this._editorMoveNextAt) {
                    this._injectKeyDown(arrowCodeByDir[resolved], { repeat: true });
                    this._editorMoveNextAt = now + 70;
                }
            }

            // Painting keys (hold semantics).
            const shouldHoldC = !!actionActive.next_tile;
            const shouldHoldX = !!actionActive.prev_tile;
            const shouldHoldSpace = !!actionActive.erase;

            if (shouldHoldC) {
                if (!this._heldKeyCodes.has("KeyC")) this._injectKeyDown("KeyC", { repeat: false });
            } else {
                if (this._heldKeyCodes.has("KeyC")) this._injectKeyUp("KeyC");
            }

            if (shouldHoldX) {
                if (!this._heldKeyCodes.has("KeyX")) this._injectKeyDown("KeyX", { repeat: false });
            } else {
                if (this._heldKeyCodes.has("KeyX")) this._injectKeyUp("KeyX");
            }

            if (shouldHoldSpace) {
                if (!this._heldKeyCodes.has("Space")) this._injectKeyDown("Space", { repeat: false });
            } else {
                if (this._heldKeyCodes.has("Space")) this._injectKeyUp("Space");
            }

            this._prevActionActive = actionActive;
            return;
        }

        if (screen === "play") {
            // When not on overlay/confirm, D-pad is used for gameplay movement.
            this._uiNavDir = null;
            this._uiNavNextAt = 0;

            const resolved = this._resolvedMoveDir(actionActive);
            const arrowCodeByDir = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

            // Move direction: held keys (no repeats needed; server uses last direction).
            if (resolved !== this._playMoveDir) {
                if (this._playMoveDir) this._releaseInjectedKeyIfHeld(arrowCodeByDir[this._playMoveDir]);
                this._playMoveDir = resolved;

                if (resolved) {
                    this._injectKeyDown(arrowCodeByDir[resolved], { repeat: false });
                }
            } else if (!resolved) {
                // Nothing to do.
            }

            // Fire: hold semantics.
            const shouldHoldC = !!actionActive.next_tile;
            const shouldHoldX = !!actionActive.prev_tile;

            if (shouldHoldC) {
                if (!this._heldKeyCodes.has("KeyC")) this._injectKeyDown("KeyC", { repeat: false });
            } else {
                if (this._heldKeyCodes.has("KeyC")) this._injectKeyUp("KeyC");
            }

            if (shouldHoldX) {
                if (!this._heldKeyCodes.has("KeyX")) this._injectKeyDown("KeyX", { repeat: false });
            } else {
                if (this._heldKeyCodes.has("KeyX")) this._injectKeyUp("KeyX");
            }

            // Pause: rising edge only (GameInput ignores repeat anyway, but we want one pause per press).
            const pausePressed = actionActive.pause && !this._prevActionActive.pause;
            if (pausePressed) {
                const ev = new KeyboardEvent("keydown", {
                    code: "Enter",
                    key: "Enter",
                    repeat: false,
                    bubbles: true,
                    cancelable: true,
                });
                window.dispatchEvent(ev);
            }

            this._prevActionActive = actionActive;
            return;
        }

        // Title/settings/tile/custom screens: drive focus navigator via UI actions.
        const navDir = this._tickUINavigate(actionActive, now);
        if (navDir && this._control.onNavigate) this._control.onNavigate(navDir);

        const confirmPressed = actionActive.ui_confirm && !this._prevActionActive.ui_confirm;
        if (confirmPressed && this._control.onConfirm) this._control.onConfirm({ shiftHeld });

        const backPressed = actionActive.ui_back && !this._prevActionActive.ui_back;
        if (backPressed && this._control.onBack) this._control.onBack({ shiftHeld });

        this._prevActionActive = actionActive;
    }

    _resolveUINavDir(actionActive) {
        if (actionActive.up) return "up";
        if (actionActive.down) return "down";
        if (actionActive.left) return "left";
        if (actionActive.right) return "right";
        return null;
    }

    /**
     * Returns a dir when the focus navigator should move now.
     * Uses press+hold repeat scheduling to match keyboard-ish navigation.
     * @param {any} actionActive
     * @param {number} now
     * @returns {"up"|"down"|"left"|"right"|null}
     */
    _tickUINavigate(actionActive, now) {
        const activeDir = this._resolveUINavDir(actionActive);
        if (!activeDir) {
            this._uiNavDir = null;
            this._uiNavNextAt = 0;
            return null;
        }

        if (activeDir !== this._uiNavDir) {
            this._uiNavDir = activeDir;
            // First step happens immediately; subsequent steps repeat while held.
            this._uiNavNextAt = now + this._uiNavInitialDelayMs;
            return activeDir;
        }

        if (now >= this._uiNavNextAt) {
            this._uiNavNextAt = now + this._uiNavRepeatIntervalMs;
            return activeDir;
        }

        return null;
    }
}

