/**
 * game.js — NES Battle City Renderer
 */

import { Api, GameSocket } from "./api.js";
import { Hud } from "./hud.js";

const GRID_W = 64;
const GRID_H = 42;
const CELL = 40;

const TILE_COLORS = {
    0: "#000000",
    1: "#a83800", // Brick
    2: "#9c9c9c", // Steel
    3: "#0000ff", // Water
    4: "#00a800", // Forest
    5: "#80deea", // Ice
    6: "#000000", // Base
};

class GameRenderer {
    constructor() {
        this.canvas = document.getElementById("game-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.hud = new Hud();
        this.socket = null;
        this.state = null;
        this.animId = null;
        this.mapName = null;

        this._keysDown = new Set();
        this._lastInput = { direction: null, fire: false };
        this._explosions = [];

        this._images = {};
        this._loadImages();
    }

    _loadImages() {
        const names = [
            "brick", "steel", "water1", "water2", "forest", "ice", "base",
            "tank_player_f1", "tank_player_f2", "tank_enemy_f1", "tank_enemy_f2",
            "exp_f1", "exp_f2", "exp_f3"
        ];
        names.forEach(name => {
            const img = new Image();
            img.src = `assets/${name}.png`;
            this._images[name] = img;
        });
    }

    async startGame(mapName, sessionId = "default") {
        this.mapName = mapName;
        this.hud.setMapName(mapName);
        this.hud.reset();
        this._explosions = [];

        this._resize();

        await Api.startGame(mapName, "construction_play", sessionId);

        if (this.socket) this.socket.close();
        this.socket = new GameSocket(sessionId);
        this.socket.connect((s) => this._onState(s));

        this._bindInput();
        this._startLoop();
    }

    stopGame() {
        this._stopLoop();
        if (this.socket) { this.socket.close(); this.socket = null; }
        this._unbindInput();
        Api.stopGame().catch(() => { });
    }

    _onState(rawState) {
        const prev = this.state;
        this.state = rawState;

        this.hud.update(rawState);

        if (prev) {
            const prevAlive = new Set([...(prev.enemies ?? []), prev.player].filter(Boolean).map(t => t.id));
            const nowDead = [...(rawState.enemies ?? []), rawState.player].filter(t => t && !t.alive && prevAlive.has(t.id));
            nowDead.forEach(t => this._explosions.push({ x: t.col, y: t.row, t: 0, max: 20 }));
        }

        if (!rawState.running && rawState.result) {
            setTimeout(() => this.hud.showOverlay(rawState.result, rawState.score), 1000);
        }
    }

    _resize() {
        // Map area = exactly N tiles in a row (no padding)
        this.canvas.width = GRID_W * CELL;
        this.canvas.height = GRID_H * CELL;
    }

    _startLoop() {
        const loop = () => {
            this._draw();
            this.animId = requestAnimationFrame(loop);
        };
        this.animId = requestAnimationFrame(loop);
    }

    _stopLoop() {
        if (this.animId) cancelAnimationFrame(this.animId);
    }

    _draw() {
        const { ctx } = this;
        if (!ctx) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.state) return;

        const grid = this.state.grid ?? [];
        // Bottom layers: ice, water, brick, steel, base
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                const tid = grid[r]?.[c] ?? 0;
                if (tid === 0 || tid === 4) continue; // Forest handled separately for top layer
                this._drawTileDetail(ctx, tid, c * CELL, r * CELL, CELL);
            }
        }

        // Bullets
        (this.state.bullets ?? []).forEach(b => {
            const x = b.col * CELL + CELL / 2;
            const y = b.row * CELL + CELL / 2;
            ctx.fillStyle = b.is_player ? "#ffffff" : "#ff4444";
            ctx.fillRect(x - 5, y - 5, 10, 10);
        });

        // Tanks
        if (this.state.player) {
            this._drawTank(ctx, this.state.player, CELL, true);
        }
        (this.state.enemies ?? []).forEach(e => {
            this._drawTank(ctx, e, CELL, false);
        });

        // Top layers: Forest
        for (let r = 0; r < GRID_H; r++) {
            for (let c = 0; c < GRID_W; c++) {
                if ((grid[r]?.[c] ?? 0) === 4) {
                    this._drawTileDetail(ctx, 4, c * CELL, r * CELL, CELL);
                }
            }
        }

        // Explosions
        (this.state.explosions ?? []).forEach(exp => {
            this._drawExplosion(ctx, exp, CELL);
        });
    }

    _drawTileDetail(ctx, tid, x, y, sz) {
        let imgName = null;
        if (tid === 1) imgName = "brick";
        else if (tid === 2) imgName = "steel";
        else if (tid === 3) {
            imgName = (Math.floor(Date.now() / 400) % 2 === 0) ? "water1" : "water2";
        }
        else if (tid === 4) imgName = "forest";
        else if (tid === 5) imgName = "ice";
        else if (tid === 6) imgName = "base";

        if (imgName && this._images[imgName] && this._images[imgName].complete) {
            ctx.drawImage(this._images[imgName], x, y, sz, sz);
        } else {
            // Fallback
            ctx.fillStyle = TILE_COLORS[tid] || "#000";
            ctx.fillRect(x, y, sz, sz);
        }
    }

    _drawTank(ctx, tank, CELL, isPlayer) {
        if (!tank.alive) return;
        const x = tank.col * CELL;
        const y = tank.row * CELL;

        // Animation frame
        const frame = (Math.floor(Date.now() / 150) % 2) + 1;
        const type = isPlayer ? "player" : "enemy";
        const imgName = `tank_${type}_f${frame}`;
        const img = this._images[imgName];

        if (img && img.complete) {
            ctx.save();
            ctx.translate(x + CELL / 2, y + CELL / 2);
            let angle = 0;
            if (tank.direction === "right") angle = Math.PI / 2;
            else if (tank.direction === "down") angle = Math.PI;
            else if (tank.direction === "left") angle = -Math.PI / 2;
            ctx.rotate(angle);
            ctx.drawImage(img, -CELL / 2, -CELL / 2, CELL, CELL);
            ctx.restore();
        } else {
            ctx.fillStyle = tank.color;
            ctx.fillRect(x, y, CELL, CELL);
        }
    }

    _drawExplosion(ctx, exp, cell) {
        const maxTicks = 15;
        const progress = 1 - (exp.ticks / maxTicks);
        let f = 1;
        if (exp.ticks < 5) f = 3;
        else if (exp.ticks < 10) f = 2;
        const img = this._images[`exp_f${f}`];
        if (img && img.complete) {
            const size = cell * 1.8;
            const x = exp.col * cell + (cell - size) / 2;
            const y = exp.row * cell + (cell - size) / 2;
            ctx.save();
            ctx.globalAlpha = 0.9 + 0.1 * progress;
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
        }
    }

    _bindInput() {
        this._keydown = (ev) => {
            this._keysDown.add(ev.code);
            this._sendInput();
        };
        this._keyup = (ev) => {
            this._keysDown.delete(ev.code);
            this._sendInput();
        };
        window.addEventListener("keydown", this._keydown);
        window.addEventListener("keyup", this._keyup);
    }

    _unbindInput() {
        window.removeEventListener("keydown", this._keydown);
        window.removeEventListener("keyup", this._keyup);
    }

    _sendInput() {
        const k = this._keysDown;
        let dir = null;
        if (k.has("ArrowUp") || k.has("KeyW")) dir = "up";
        else if (k.has("ArrowDown") || k.has("KeyS")) dir = "down";
        else if (k.has("ArrowLeft") || k.has("KeyA")) dir = "left";
        else if (k.has("ArrowRight") || k.has("KeyD")) dir = "right";

        const fire = k.has("KeyX") || k.has("KeyC");

        if (dir !== this._lastInput.direction || fire !== this._lastInput.fire) {
            this._lastInput = { direction: dir, fire };
            this.socket?.sendInput(dir, fire);
        }
    }
}

export const gameRenderer = new GameRenderer();
