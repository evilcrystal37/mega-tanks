/**
 * game.js — NES Battle City Renderer
 */

import { Api, GameSocket } from "./api.js";
import { Hud } from "./hud.js";
import { SpriteAtlas } from "./spriteAtlas.js";
import { audioManager } from "./audio.js";

const GRID_W = 64;
const GRID_H = 42;
const CELL = 32;

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
        this.ctx.imageSmoothingEnabled = false;
        this.hud = new Hud();
        this.socket = null;
        this.state = null;
        this.animId = null;
        this.mapName = null;

        this._keysDown = new Set();
        this._lastInput = { direction: null, fire: false };
        this._explosions = [];
        this._cell = null;

        this._atlas = new SpriteAtlas();
    }

    async startGame(mapName, sessionId = "default", settings = null) {
        this.mapName = mapName;
        this.hud.setMapName(mapName);
        this.hud.reset();
        this._explosions = [];

        this._resize();
        await this._atlas.ready();

        await Api.startGame(mapName, "construction_play", sessionId, settings);

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
        audioManager.stopAll();
        Api.stopGame().catch(() => { });
    }

    _onState(rawState) {
        const prev = this.state;
        this.state = rawState;

        this.hud.update(rawState);

        if (rawState.events && rawState.events.length > 0) {
            rawState.events.forEach(ev => {
                if (ev.type === "sound") {
                    console.log("PLAYING SOUND:", ev.sound);
                    audioManager.play(ev.sound);
                }
            });
        }

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
        const wrap = this.canvas.parentElement;
        const maxW = Math.max(1, wrap?.clientWidth ?? 800);
        const maxH = Math.max(1, wrap?.clientHeight ?? 600);

        // "Natural" cell size that would show the full map inside the container,
        // then apply a zoom multiplier to make tiles larger and enable camera scrolling.
        const zoom = this._getCellZoom();
        const naturalCell = Math.min(maxW / GRID_W, maxH / GRID_H);
        this._cell = Math.max(1, Math.round(naturalCell * zoom));

        // Ensure canvas dimensions are exact multiples of the cell size
        const adjustedW = Math.floor(maxW / this._cell) * this._cell;
        const adjustedH = Math.floor(maxH / this._cell) * this._cell;

        // Canvas fills the container 1:1 (no CSS down-scaling).
        this.canvas.width = adjustedW;
        this.canvas.height = adjustedH;
        this.canvas.style.width = `${adjustedW}px`;
        this.canvas.style.height = `${adjustedH}px`;
    }

    _getCellZoom() {
        try {
            const raw = JSON.parse(localStorage.getItem("battle_tanks_settings") ?? "{}");
            const z = parseFloat(raw?.cell_zoom ?? 2.0);
            return Number.isFinite(z) ? z : 2.0;
        } catch {
            return 2.0;
        }
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

        const cell = this._cell ?? CELL;
        const visW = this.canvas.width / cell;
        const visH = this.canvas.height / cell;

        const focus = this.state.player && this.state.player.alive
            ? { row: this.state.player.row, col: this.state.player.col }
            : { row: GRID_H / 2, col: GRID_W / 2 };

        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const vpLeft = visW >= GRID_W ? (GRID_W - visW) / 2 : clamp(focus.col - visW / 2, 0, GRID_W - visW);
        const vpTop = visH >= GRID_H ? (GRID_H - visH) / 2 : clamp(focus.row - visH / 2, 0, GRID_H - visH);

        const startC = Math.max(0, Math.floor(vpLeft));
        const endC = Math.min(GRID_W - 1, Math.ceil(vpLeft + visW));
        const startR = Math.max(0, Math.floor(vpTop));
        const endR = Math.min(GRID_H - 1, Math.ceil(vpTop + visH));

        const grid = this.state.grid ?? [];

        ctx.save();
        ctx.translate(Math.round(-vpLeft * cell), Math.round(-vpTop * cell));

        // Bottom layers: ice, water, brick, steel, base
        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                const tid = grid[r]?.[c] ?? 0;
                if (tid === 0 || tid === 4 || tid === 18) continue; // Forest and Sunflower handled separately for top layer
                this._drawTileDetail(ctx, tid, c * cell, r * cell, cell);
            }
        }

        // Base defeated overlay (base tile becomes empty when destroyed)
        if (this.state.result === "defeat" && this.state.base_pos) {
            const br = this.state.base_pos.row;
            const bc = this.state.base_pos.col;
            this._atlas.draw(ctx, "base.heart.dead", Math.round(bc * cell), Math.round(br * cell), cell, cell);
        }
        
        // Rainbow Trails - continuous gradient
        if (this.state.rainbow_trails) {
            ctx.globalAlpha = 0.6;
            const trailWidth = Math.max(4, cell * 0.8);

            for (const [tankId, trail] of Object.entries(this.state.rainbow_trails)) {
                const points = trail.points || [];
                if (points.length < 2) continue;

                // Create rainbow gradient along the path
                const gradient = ctx.createLinearGradient(
                    points[0].col * cell, points[0].row * cell,
                    points[points.length - 1].col * cell, points[points.length - 1].row * cell
                );

                // Rainbow colors at positions along the gradient
                const rainbowColors = [
                    [0.0, "#ff0000"],
                    [0.14, "#ff7f00"],
                    [0.28, "#ffff00"],
                    [0.42, "#00ff00"],
                    [0.56, "#0000ff"],
                    [0.70, "#4b0082"],
                    [0.85, "#9400d3"],
                    [1.0, "#ff00ff"]
                ];

                rainbowColors.forEach(([pos, color]) => {
                    gradient.addColorStop(pos, color);
                });

                ctx.strokeStyle = gradient;
                ctx.lineWidth = trailWidth;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                // Draw the continuous path
                ctx.beginPath();
                const start = points[0];
                ctx.moveTo(start.col * cell, start.row * cell);

                for (let i = 1; i < points.length; i++) {
                    const p = points[i];
                    ctx.lineTo(p.col * cell, p.row * cell);
                }

                ctx.stroke();

                // Add a glow effect
                ctx.shadowColor = "#ff00ff";
                ctx.shadowBlur = 5;
                ctx.lineWidth = trailWidth * 0.5;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.globalAlpha = 1.0;
        }

        // Bullets
        (this.state.bullets ?? []).forEach(b => {
            const x = b.col * cell;
            const y = b.row * cell;
            ctx.fillStyle = b.is_player ? "#ffffff" : "#ff4444";
            const sz = b.crush_bricks ? Math.max(4, cell * 0.4) : Math.max(2, cell * 0.18);
            ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        });

        // Tanks
        if (this.state.player) {
            this._drawTank(ctx, this.state.player, cell, true);
        }
        (this.state.turrets ?? []).forEach(t => {
            this._drawTank(ctx, t, cell, true);
        });
        (this.state.enemies ?? []).forEach(e => {
            this._drawTank(ctx, e, cell, false);
        });

    // Top layers: Forest and Sunflower
    for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
            const tid = grid[r]?.[c] ?? 0;
            if (tid === 4 || tid === 18) {
                ctx.save();
                if (tid === 4) ctx.globalAlpha = 0.65;
                this._drawTileDetail(ctx, tid, c * cell, r * cell, cell);
                ctx.restore();
            }
        }
    }

        // Explosions
        (this.state.explosions ?? []).forEach(exp => {
            this._drawExplosion(ctx, exp, cell);
        });

        // Sandworm
        if (this.state.sandworm && this.state.sandworm.active) {
            const sw = this.state.sandworm;
            
            // Pulsing animation
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2; // 0 to 1
            
            (sw.parts || []).forEach((part, index) => {
                const cx = part.col * cell;
                const cy = part.row * cell;
                
                ctx.save();
                ctx.translate(cx + cell/2, cy + cell/2);
                
                // Add a slight wiggle based on index to make it look organic
                const wiggle = Math.sin(Date.now() / 300 - index * 0.5) * (cell * 0.1);
                
                // Direction facing logic for the head
                let angle = 0;
                if (part.type === "head") {
                    if (sw.direction === "up") angle = -Math.PI / 2;
                    if (sw.direction === "down") angle = Math.PI / 2;
                    if (sw.direction === "left") angle = Math.PI;
                    if (sw.direction === "right") angle = 0;
                }
                ctx.rotate(angle);
                
                ctx.fillStyle = part.type === "head" ? "#8b4513" : "#a0522d";
                
                // Organic sizes
                const baseRadius = part.type === "head" ? (cell * 0.45) : (cell * 0.4);
                const pulsingRadius = baseRadius + (pulse * cell * 0.05);
                
                ctx.beginPath();
                if (part.type === "head") {
                    // Head shape
                    ctx.ellipse(wiggle, 0, pulsingRadius * 1.1, pulsingRadius, 0, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Eyes (facing forward now due to rotation)
                    ctx.fillStyle = "#ffcc00";
                    ctx.beginPath();
                    ctx.arc(cell * 0.2 + wiggle, -cell * 0.2, cell * 0.1, 0, Math.PI * 2);
                    ctx.arc(cell * 0.2 + wiggle, cell * 0.2, cell * 0.1, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Dark pupils
                    ctx.fillStyle = "#000";
                    ctx.beginPath();
                    ctx.arc(cell * 0.25 + wiggle, -cell * 0.2, cell * 0.04, 0, Math.PI * 2);
                    ctx.arc(cell * 0.25 + wiggle, cell * 0.2, cell * 0.04, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Rounded body segments
                    ctx.arc(wiggle, 0, pulsingRadius, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Add some segment ridges
                    ctx.strokeStyle = "rgba(0,0,0,0.3)";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(wiggle, 0, pulsingRadius * 0.7, -Math.PI/2, Math.PI/2);
                    ctx.stroke();
                }
                
                ctx.restore();
            });
        }

        ctx.restore();

        if (this.state.paused) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            ctx.fillStyle = "#ffcc00";
            ctx.shadowColor = "#ffaa00";
            ctx.shadowBlur = 10;
            ctx.font = `bold ${Math.max(24, cell * 1.5)}px "Press Start 2P", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("PAUSED", this.canvas.width / 2, this.canvas.height / 2);
            ctx.shadowBlur = 0;
        }
    }

    _drawTileDetail(ctx, tid, x, y, sz) {
        const dx = Math.round(x);
        const dy = Math.round(y);
        const ds = Math.round(sz);

        const gridC = Math.round(x / sz);
        const gridR = Math.round(y / sz);

    if (tid === 14 || tid === 18 || tid === 23 || tid === 24 || tid === 25 || (tid >= 26 && tid <= 31)) {
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
            ctx.fillText("🌼", 0, ds * 0.1);
        } else if (tid === 14) {
            // Minecraft TNT look — centered at (0,0), spans (-ds,-ds)→(ds,ds)
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
        } else if (tid === 23) {
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.5 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🌈", 0, ds * 0.1);
        } else if (tid === 24) {
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.5 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🍄", 0, ds * 0.1);
        } else if (tid === 25) {
            ctx.fillStyle = "#546e7a";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.fillStyle = "#607d8b";
            ctx.beginPath();
            ctx.arc(0, 0, ds * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#37474f";
            ctx.fillRect(-ds * 0.12, -ds * 0.9, ds * 0.24, ds * 0.75);
        } else if (tid >= 26 && tid <= 28) {
            // Mushroom glass box — green, big-type centered at (0,0)
            ctx.fillStyle = "rgba(139, 195, 74, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Animated shine sweep across full 2x2 area
            const cycle = (Date.now() % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.6)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Inner border & 3D edges
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 3;
            ctx.strokeRect(-ds + 3, -ds + 3, ds * 2 - 6, ds * 2 - 6);
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds);
            ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds);
            ctx.stroke();

            // Mushroom icon centered at (0,0)
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

            // Cracks
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
            // Rainbow glass box — pink, big-type centered at (0,0)
            ctx.fillStyle = "rgba(255, 105, 180, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Animated shine sweep (offset from mushroom)
            const cycle = ((Date.now() + 500) % 2000) / 2000;
            const shineX = (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const shineGrad = ctx.createLinearGradient(shineX, -ds, shineX + ds * 0.6, ds);
            shineGrad.addColorStop(0, "rgba(255,255,255,0)");
            shineGrad.addColorStop(0.5, "rgba(255,255,255,0.6)");
            shineGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = shineGrad;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Inner border & 3D edges
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 3;
            ctx.strokeRect(-ds + 3, -ds + 3, ds * 2 - 6, ds * 2 - 6);
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds);
            ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds);
            ctx.stroke();

            // Rainbow icon centered at (0,0)
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.2 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🌈", 0, ds * 0.05);

            // Cracks
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
            if (this._atlas.draw(ctx, "base.heart.alive", dx, dy, ds, ds)) return;
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
            // cattle-bity bricks: 4 quarters, no flip to avoid misalignment.
            const half = Math.floor(ds / 2);
            this._atlas.draw(ctx, "terrain.brick.1", dx, dy, half, half);
            this._atlas.draw(ctx, "terrain.brick.2", dx + half, dy, ds - half, half);
            this._atlas.draw(ctx, "terrain.brick.2", dx, dy + half, half, ds - half);
            this._atlas.draw(ctx, "terrain.brick.1", dx + half, dy + half, ds - half, ds - half);
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
    if (tid === 2) {
        spriteId = "terrain.steel";
    } else if (tid === 3) {
        spriteId = (Math.floor(Date.now() / 400) % 2 === 0) ? "terrain.water.1" : "terrain.water.2";
    } else if (tid === 4) {
        spriteId = "terrain.jungle";
    } else if (tid === 5) {
        spriteId = "terrain.ice";
    }

    if (spriteId && this._atlas.draw(ctx, spriteId, dx, dy, ds, ds)) {
        return;
    }

    ctx.fillStyle = TILE_COLORS[tid] || "#000";
    ctx.fillRect(dx, dy, ds, ds);
}

    _drawTank(ctx, tank, CELL, isPlayer) {
        if (!tank.alive) return;
        const x = tank.col * CELL;
        const y = tank.row * CELL;

        let drawY = y;
        let scaleExtra = tank.mushroom_active ? 2.0 : 1.0;

        if (tank.airborne_ticks > 0) {
            const progress = tank.airborne_ticks / 45;
            drawY -= Math.sin(progress * Math.PI) * CELL * 1.5;
            scaleExtra = 1 + Math.sin(progress * Math.PI) * 0.3;
            
            // Draw shadow
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.ellipse(Math.round(x), Math.round(y), CELL * 0.4, CELL * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const frame = (Math.floor(Date.now() / 150) % 2) + 1;
        const dir = tank.direction || "up";

        let spriteId = null;
        if (tank.tank_type === "turret") {
            const sz = Math.round(CELL * 2 * scaleExtra * 0.85);
            const hp = tank.hp ?? 3;
            const t = Date.now();

            ctx.save();
            ctx.translate(x, drawY);

            // ── Static concrete base (does NOT rotate) ───────────────────────
            // Outer sandbag ring
            ctx.fillStyle = "#6d5c41";
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.48, 0, Math.PI * 2);
            ctx.fill();

            // Concrete floor
            ctx.fillStyle = "#78716c";
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2);
            ctx.fill();

            // Concrete texture lines
            ctx.strokeStyle = "rgba(0,0,0,0.15)";
            ctx.lineWidth = 1;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * sz * 0.1, Math.sin(a) * sz * 0.1);
                ctx.lineTo(Math.cos(a) * sz * 0.38, Math.sin(a) * sz * 0.38);
                ctx.stroke();
            }

            // Sandbag highlights
            ctx.strokeStyle = "rgba(255,220,150,0.2)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.44, -Math.PI * 0.7, Math.PI * 0.2);
            ctx.stroke();

            // Damage state: cracks at hp ≤ 2
            if (hp <= 2) {
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-sz * 0.15, -sz * 0.3); ctx.lineTo(sz * 0.05, sz * 0.1);
                ctx.moveTo(sz * 0.1, -sz * 0.25); ctx.lineTo(-sz * 0.05, sz * 0.2);
                ctx.stroke();
            }

            // ── Rotating gun mount ────────────────────────────────────────────
            // Apply direction rotation
            if (dir === "up") ctx.rotate(0);
            else if (dir === "right") ctx.rotate(Math.PI / 2);
            else if (dir === "down") ctx.rotate(Math.PI);
            else if (dir === "left") ctx.rotate(-Math.PI / 2);

            // Gun housing (armoured shield)
            const shieldGrad = ctx.createLinearGradient(-sz * 0.22, -sz * 0.1, sz * 0.22, sz * 0.15);
            shieldGrad.addColorStop(0, "#8d9e7e");
            shieldGrad.addColorStop(0.5, "#6b7c5e");
            shieldGrad.addColorStop(1, "#4a5c42");
            ctx.fillStyle = shieldGrad;
            ctx.beginPath();
            ctx.moveTo(-sz * 0.22, sz * 0.15);
            ctx.lineTo(-sz * 0.22, -sz * 0.02);
            ctx.quadraticCurveTo(0, -sz * 0.22, sz * 0.22, -sz * 0.02);
            ctx.lineTo(sz * 0.22, sz * 0.15);
            ctx.closePath();
            ctx.fill();

            // Shield edge highlight
            ctx.strokeStyle = "rgba(180,200,160,0.4)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-sz * 0.2, sz * 0.13);
            ctx.lineTo(-sz * 0.2, -sz * 0.01);
            ctx.quadraticCurveTo(0, -sz * 0.2, sz * 0.2, -sz * 0.01);
            ctx.stroke();

            // Barrel housing
            ctx.fillStyle = "#4a5c42";
            ctx.fillRect(-sz * 0.065, -sz * 0.18, sz * 0.13, sz * 0.18);

            // Gun barrel
            ctx.fillStyle = "#2e3d28";
            ctx.fillRect(-sz * 0.05, -sz * 0.5, sz * 0.1, sz * 0.38);

            // Muzzle brake
            ctx.fillStyle = "#1e2b1a";
            ctx.fillRect(-sz * 0.075, -sz * 0.52, sz * 0.15, sz * 0.05);

            // Barrel groove
            ctx.strokeStyle = "rgba(120,150,100,0.4)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-sz * 0.02, -sz * 0.48);
            ctx.lineTo(-sz * 0.02, -sz * 0.18);
            ctx.stroke();

            // Damage state: smoke at hp ≤ 1
            if (hp <= 1) {
                ctx.rotate(-(dir === "right" ? Math.PI / 2 : dir === "down" ? Math.PI : dir === "left" ? -Math.PI / 2 : 0));
                for (let i = 0; i < 3; i++) {
                    const sy = -((t / 30 + i * 12) % 36);
                    const sx = Math.sin(t / 200 + i) * sz * 0.12;
                    const alpha = 0.5 - (Math.abs(sy) / 36) * 0.4;
                    ctx.fillStyle = `rgba(80,80,80,${alpha})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy - sz * 0.1, sz * 0.1 + i * sz * 0.03, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.restore();
            return;
        } else if (isPlayer) {
            const lvl = typeof tank.upgrade_level === "number" ? tank.upgrade_level : 0;
            const tier = lvl <= 0 ? "a" : lvl === 1 ? "b" : lvl === 2 ? "c" : "d";
            spriteId = `tank.player.primary.${tier}.${dir}.${frame}`;
        } else {
            const tier = (tank.tank_type === "fast") ? "b"
                : (tank.tank_type === "power") ? "c"
                    : (tank.tank_type === "armor") ? "d"
                        : "a";
            spriteId = `tank.enemy.default.${tier}.${dir}.${frame}`;
        }

        const info = this._atlas.getSpriteInfo(spriteId);
        if (info) {
            const sw = info.rect[2];
            const sh = info.rect[3];
            const maxSz = CELL * scaleExtra;
            const scale = maxSz / Math.max(sw, sh);
            const dw = Math.max(1, Math.round(sw * scale));
            const dh = Math.max(1, Math.round(sh * scale));
            const dx = Math.round(x - dw / 2);
            const dy = Math.round(drawY - dh / 2);

            if (this._atlas.draw(ctx, spriteId, dx, dy, dw, dh)) {
                if (tank.lava_ticks > 0) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(0.7, tank.lava_ticks / 120);
                    ctx.fillStyle = "#ff0000";
                    ctx.globalCompositeOperation = "source-atop";
                    ctx.fillRect(dx, dy, dw, dh);
                    ctx.restore();
                    
                    // Draw smoke
                    ctx.fillStyle = "rgba(100, 100, 100, 0.6)";
                    const t = Date.now();
                    for (let i = 0; i < 3; i++) {
                        const sy = dy - ((t / 20 + i * 15) % 30);
                        const sx = dx + dw/2 + Math.sin(t / 200 + i) * 10;
                        ctx.beginPath();
                        ctx.arc(sx, sy, dw * 0.15, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                return;
            }
        }

        ctx.fillStyle = tank.color;
        const fallbackSz = Math.round(CELL * scaleExtra);
        ctx.fillRect(Math.round(x - fallbackSz / 2), Math.round(drawY - fallbackSz / 2), fallbackSz, fallbackSz);
    }

    _drawExplosion(ctx, exp, cell) {
        const maxTicks = 15;
        const elapsed = maxTicks - exp.ticks;
        const frames = [
            { id: "explosion.small.1", w: 44, h: 44 },
            { id: "explosion.small.2", w: 60, h: 60 },
            { id: "explosion.small.3", w: 64, h: 64 },
            { id: "explosion.large.1", w: 124, h: 116 },
            { id: "explosion.large.2", w: 136, h: 128 },
        ];
        const fi = Math.min(Math.floor(elapsed / 3), frames.length - 1);
        const frame = frames[fi];
        const scale = cell / 64;
        const dw = Math.round(frame.w * scale);
        const dh = Math.round(frame.h * scale);
        const cx = exp.col * cell;
        const cy = exp.row * cell;
        const dx = Math.round(cx - dw / 2);
        const dy = Math.round(cy - dh / 2);

        this._atlas.draw(ctx, frame.id, dx, dy, dw, dh);
    }

    _bindInput() {
        this._keydown = (ev) => {
            if (ev.code === "Enter" && !this._keysDown.has(ev.code)) {
                this.socket?.sendPause();
            }
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
