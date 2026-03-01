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

/**
 * Draw a sand/quicksand tile with diagonal dune ripple pattern.
 * Matches the diagonal sinusoidal wave look of real desert sand.
 */
function _drawSandTile(ctx, dx, dy, ds) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, ds, ds);
    ctx.clip();

    // Warm sandy base
    ctx.fillStyle = "#d4bc8e";
    ctx.fillRect(dx, dy, ds, ds);

    // Rotate canvas ~32° around tile centre to produce diagonal waves
    const cx = dx + ds / 2;
    const cy = dy + ds / 2;
    ctx.translate(cx, cy);
    ctx.rotate(-0.56); // ≈ 32°
    ctx.translate(-cx, -cy);

    // How many wave bands across the (now rotated) tile
    const numBands = 7;
    const bandH = ds * 1.8 / numBands; // larger to cover rotated corners
    const origin = dy - ds * 0.4;      // start above tile to cover corners
    const left   = dx - ds * 0.4;
    const right  = dx + ds * 1.4;
    const steps  = Math.max(8, Math.ceil(ds * 1.8)); // horizontal sample points

    for (let i = 0; i < numBands + 1; i++) {
        const y0 = origin + i * bandH;

        // Wave function: gentle sine ripple along the band
        const wave = (x, yBase) =>
            yBase + Math.sin(((x - left) / (right - left)) * Math.PI * 2.5) * bandH * 0.18;

        // ── Dark trough (shadow between crests) ─────────────────────────
        ctx.fillStyle = "rgba(168,130,72,0.38)";
        ctx.beginPath();
        ctx.moveTo(left, wave(left, y0));
        for (let s = 1; s <= steps; s++) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0));
        }
        for (let s = steps; s >= 0; s--) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.42);
        }
        ctx.closePath();
        ctx.fill();

        // ── Light crest (sunlit peak) ────────────────────────────────────
        ctx.fillStyle = "rgba(255,242,200,0.22)";
        ctx.beginPath();
        ctx.moveTo(left, wave(left, y0) + bandH * 0.42);
        for (let s = 1; s <= steps; s++) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.42);
        }
        for (let s = steps; s >= 0; s--) {
            const x = left + (s / steps) * (right - left);
            ctx.lineTo(x, wave(x, y0) + bandH * 0.78);
        }
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

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
            // Base eagle is big-type (2×2), dead overlay matches
            this._atlas.draw(ctx, "base.heart.dead", Math.round(bc * cell), Math.round(br * cell), cell * 2, cell * 2);
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
        if (this.state.companion) {
            this._drawTank(ctx, this.state.companion, cell, true);
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
                if (tid === 18) ctx.globalAlpha = 1.0;  // Sunflower always bright (no darkening cycle)
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
            const swHp  = sw.hp ?? 5;
            const swMaxHp = 5;
            const now = Date.now();
            const pulse = (Math.sin(now / 200) + 1) / 2;

            // Opacity fades as HP drops: full HP = fully opaque, 1 HP = very transparent, 0 = gone
            const hpRatio  = swHp / swMaxHp;           // 1.0 → 0.2
            const wormAlpha = 0.15 + hpRatio * 0.85;   // 1.0 at full HP, 0.15 at last HP

            const segSz = cell * 2; // big-tile rendering

            ctx.save();
            ctx.globalAlpha = wormAlpha;

            (sw.parts || []).forEach((part, index) => {
                const cx = part.col * cell + cell / 2;
                const cy = part.row * cell + cell / 2;

                ctx.save();
                ctx.translate(cx, cy);

                const wiggle = Math.sin(now / 300 - index * 0.5) * (segSz * 0.05);

                // Head faces movement direction; body segments are unrotated
                let angle = 0;
                if (part.type === "head") {
                    if (sw.direction === "up")    angle = -Math.PI / 2;
                    if (sw.direction === "down")  angle =  Math.PI / 2;
                    if (sw.direction === "left")  angle =  Math.PI;
                    if (sw.direction === "right") angle =  0;
                }
                ctx.rotate(angle);

                // Yellow body colour stays constant (damage shown via transparency only)
                const bodyLight = "rgb(255,220,60)";
                const bodyMid   = "rgb(220,170,0)";
                const bodyDark  = "rgb(160,110,0)";

                const baseRadius   = part.type === "head" ? segSz * 0.44 : segSz * 0.38;
                const pulsingRadius = baseRadius + pulse * segSz * 0.04;

                if (part.type === "head") {
                    // ── Drop shadow ──────────────────────────────────────────
                    ctx.fillStyle = "rgba(0,0,0,0.22)";
                    ctx.beginPath();
                    ctx.ellipse(wiggle + segSz * 0.04, segSz * 0.06,
                                pulsingRadius * 1.1, pulsingRadius * 0.55, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // ── Head body (bullet / tapered rear half) ───────────────
                    // The front (right in rotated space) opens into the circular mouth.
                    // We draw the rear cone/body first, then overlay the mouth ring.
                    const hg = ctx.createRadialGradient(
                        wiggle - pulsingRadius * 0.35, -pulsingRadius * 0.35, pulsingRadius * 0.04,
                        wiggle, 0, pulsingRadius * 1.15);
                    hg.addColorStop(0,   bodyLight);
                    hg.addColorStop(0.5, bodyMid);
                    hg.addColorStop(1,   bodyDark);
                    ctx.fillStyle = hg;
                    ctx.beginPath();
                    // Tapered rear half: semicircle on the left (back), meet at mouth radius on right
                    const mouthR = pulsingRadius * 0.82; // radius of the open mouth circle
                    ctx.arc(wiggle, 0, pulsingRadius * 1.1, Math.PI * 0.5, Math.PI * 1.5); // back arc
                    ctx.lineTo(wiggle + pulsingRadius * 0.3,  -mouthR); // taper to mouth top
                    ctx.arc(wiggle + pulsingRadius * 0.3, 0, mouthR, -Math.PI * 0.5, Math.PI * 0.5, false); // front edge
                    ctx.lineTo(wiggle, pulsingRadius * 1.1); // close
                    ctx.closePath();
                    ctx.fill();

                    // Scale rings on head
                    ctx.strokeStyle = "rgba(0,0,0,0.15)";
                    ctx.lineWidth = segSz * 0.025;
                    for (let si = 1; si <= 2; si++) {
                        ctx.beginPath();
                        ctx.arc(wiggle - segSz * 0.08 * si, 0,
                                pulsingRadius * (0.85 - si * 0.2), 0, Math.PI * 2);
                        ctx.stroke();
                    }

                    // ── Dune-style circular mouth ────────────────────────────
                    // Mouth is a forward-facing circle with concentric rings of teeth.
                    const mouthCX = wiggle + pulsingRadius * 0.3;
                    const mouthCY = 0;
                    const mouthOpen = (Math.sin(now / 250) * 0.5 + 0.5); // 0–1 pulsing open/close
                    const outerR   = mouthR;
                    const numRings = 3;
                    const toothRows = 12; // teeth per ring

                    // Outer gum ring — dark red flesh
                    const gumGrad = ctx.createRadialGradient(mouthCX, mouthCY, outerR * 0.5, mouthCX, mouthCY, outerR);
                    gumGrad.addColorStop(0, "rgba(140,0,0,0.9)");
                    gumGrad.addColorStop(0.6, "rgba(90,0,0,0.95)");
                    gumGrad.addColorStop(1, "rgba(60,0,0,1)");
                    ctx.fillStyle = gumGrad;
                    ctx.beginPath();
                    ctx.arc(mouthCX, mouthCY, outerR, 0, Math.PI * 2);
                    ctx.fill();

                    // Concentric tooth rings from outside in
                    for (let ring = 0; ring < numRings; ring++) {
                        const ringFrac   = 1 - ring / numRings;           // 1.0 → 0.33
                        const ringR      = outerR * ringFrac;
                        const innerRingR = outerR * (ringFrac - 1 / numRings) * 0.7;
                        const toothLen   = (ringR - innerRingR) * (0.65 + mouthOpen * 0.3);
                        const toothBase  = ringR * 0.88;

                        // Ring background flesh
                        const fleshR = 100 + ring * 30;
                        const fleshG = 0;
                        ctx.fillStyle = `rgba(${fleshR},${fleshG},0,0.85)`;
                        ctx.beginPath();
                        ctx.arc(mouthCX, mouthCY, ringR * 0.92, 0, Math.PI * 2);
                        ctx.fill();

                        // Radial teeth for this ring
                        const count = toothRows - ring * 2;
                        ctx.fillStyle = "rgba(230,220,180,0.97)";
                        for (let t = 0; t < count; t++) {
                            const a = (t / count) * Math.PI * 2;
                            // Tooth tip moves inward when mouth opens
                            const tipR  = toothBase - toothLen * (0.5 + mouthOpen * 0.5);
                            const baseW = (ringR * 0.18) * (1 - ring * 0.15);

                            const cos = Math.cos(a), sin = Math.sin(a);
                            const cos90 = Math.cos(a + Math.PI / 2), sin90 = Math.sin(a + Math.PI / 2);

                            // Tooth as a triangle pointing inward
                            ctx.beginPath();
                            ctx.moveTo(mouthCX + cos * toothBase + cos90 * baseW,
                                       mouthCY + sin * toothBase + sin90 * baseW);
                            ctx.lineTo(mouthCX + cos * toothBase - cos90 * baseW,
                                       mouthCY + sin * toothBase - sin90 * baseW);
                            ctx.lineTo(mouthCX + cos * tipR, mouthCY + sin * tipR);
                            ctx.closePath();
                            ctx.fill();
                        }
                    }

                    // Deepest throat — black void center with red glow
                    const throatGrad = ctx.createRadialGradient(
                        mouthCX, mouthCY, 0,
                        mouthCX, mouthCY, outerR * 0.28);
                    throatGrad.addColorStop(0,   "rgba(0,0,0,1)");
                    throatGrad.addColorStop(0.6, "rgba(60,0,0,0.9)");
                    throatGrad.addColorStop(1,   "rgba(120,0,0,0)");
                    ctx.fillStyle = throatGrad;
                    ctx.beginPath();
                    ctx.arc(mouthCX, mouthCY, outerR * 0.35, 0, Math.PI * 2);
                    ctx.fill();

                    // Saliva / wet gloss on teeth ring edge
                    ctx.strokeStyle = "rgba(255,255,200,0.25)";
                    ctx.lineWidth = segSz * 0.02;
                    ctx.beginPath();
                    ctx.arc(mouthCX, mouthCY, outerR * 0.95, 0, Math.PI * 2);
                    ctx.stroke();

                } else {
                    // ── Body segment ─────────────────────────────────────────
                    ctx.fillStyle = "rgba(0,0,0,0.18)";
                    ctx.beginPath();
                    ctx.ellipse(wiggle + segSz * 0.03, segSz * 0.04,
                                pulsingRadius, pulsingRadius * 0.55, 0, 0, Math.PI * 2);
                    ctx.fill();

                    const bg = ctx.createRadialGradient(
                        wiggle - pulsingRadius * 0.3, -pulsingRadius * 0.3, pulsingRadius * 0.04,
                        wiggle, 0, pulsingRadius);
                    bg.addColorStop(0,   bodyLight);
                    bg.addColorStop(0.6, bodyMid);
                    bg.addColorStop(1,   bodyDark);
                    ctx.fillStyle = bg;
                    ctx.beginPath();
                    ctx.arc(wiggle, 0, pulsingRadius, 0, Math.PI * 2);
                    ctx.fill();

                    // Concentric scale rings
                    ctx.strokeStyle = "rgba(0,0,0,0.16)";
                    ctx.lineWidth = segSz * 0.025;
                    ctx.beginPath(); ctx.arc(wiggle, 0, pulsingRadius * 0.72, 0, Math.PI * 2); ctx.stroke();
                    ctx.lineWidth = segSz * 0.014;
                    ctx.beginPath(); ctx.arc(wiggle, 0, pulsingRadius * 0.44, 0, Math.PI * 2); ctx.stroke();

                    // Highlight shine
                    ctx.fillStyle = "rgba(255,245,160,0.18)";
                    ctx.beginPath();
                    ctx.arc(wiggle - pulsingRadius * 0.28, -pulsingRadius * 0.28, pulsingRadius * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            });

            ctx.restore(); // end globalAlpha scope
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

    if (tid === 6 || tid === 14 || tid === 18 || tid === 23 || tid === 24 || tid === 32 || tid === 25 || (tid >= 26 && tid <= 31) || (tid >= 33 && tid <= 36)) {
        ctx.save();
        const centerX = dx + (gridC % 2 === 0 ? ds : 0);
        const centerY = dy + (gridR % 2 === 0 ? ds : 0);
        ctx.beginPath();
        // Base occupies 1 cell but draws 2×2 — use 2×2 clip so full sprite is visible
        if (tid === 6) {
            ctx.rect(centerX - ds, centerY - ds, ds * 2, ds * 2);
        } else {
            ctx.rect(dx, dy, ds, ds);
        }
        ctx.clip();
        ctx.translate(centerX, centerY);

        if (tid === 18) {
            // Big Sunflower Emoji — always full brightness (no darkening)
            ctx.globalAlpha = 1.0;
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
        } else if (tid === 36) {
            // Special TNT — same look as TNT but with a neon yellow pulsing glow border
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
            // Neon yellow highlight border — layered strokes instead of shadowBlur (much cheaper)
            const glowAlpha36 = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            for (const [lw, a] of [[ds*0.30, 0.18], [ds*0.22, 0.35], [ds*0.14, 0.65], [ds*0.08, glowAlpha36]]) {
                ctx.strokeStyle = `rgba(255, 224, 0, ${a})`;
                ctx.lineWidth = lw;
                ctx.strokeRect(-ds + lw/2, -ds + lw/2, ds*2 - lw, ds*2 - lw);
            }
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
        } else if (tid >= 33 && tid <= 35) {
            // Chick glass box — yellow, big-type centered at (0,0)
            ctx.fillStyle = "rgba(255, 238, 88, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Animated shine sweep
            const cycle = ((Date.now() + 1000) % 2000) / 2000;
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

            // Chick icon centered at (0,0)
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.2 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.05);

            // Cracks
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (tid <= 34) {
                ctx.moveTo(-ds * 0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds * 0.4);
            }
            if (tid === 33) {
                ctx.moveTo(0, 0); ctx.lineTo(ds * 0.7, ds * 0.7);
                ctx.moveTo(-ds, ds * 0.3); ctx.lineTo(-ds * 0.2, 0);
            }
            ctx.stroke();
        } else if (tid === 32) {
            const pulse = Math.sin(Date.now() / 300) * ds * 0.05;
            ctx.font = `${ds * 1.5 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.1);
        } else if (tid === 6) {
            // Base eagle — big-type (2×2)
            this._atlas.draw(ctx, "base.heart.alive", -ds, -ds, ds * 2, ds * 2);
        }

        ctx.restore();
        return;
    }

        if (tid === 7) {
            const t = Date.now() / 1200;
            ctx.save();
            ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();

            // Glowing crack base — pulses between deep orange and bright orange-red
            const glow = (Math.sin(t * 1.8) + 1) / 2;
            ctx.fillStyle = `rgb(${Math.round(200 + glow * 55)},${Math.round(35 + glow * 35)},0)`;
            ctx.fillRect(dx, dy, ds, ds);

            // Lava plates — large irregular dark-red polygons, thin glowing cracks between them.
            // Each entry: [relX, relY, baseRadius, rotationSeed, driftPhase]
            const plates = [
                [0.22, 0.22, 0.21, 0.0,  0.0],
                [0.68, 0.18, 0.20, 0.8,  1.3],
                [0.88, 0.60, 0.18, 1.7,  2.5],
                [0.14, 0.64, 0.19, 2.4,  0.7],
                [0.50, 0.55, 0.23, 0.4,  1.9],
                [0.40, 0.88, 0.17, 1.1,  3.1],
                [0.78, 0.84, 0.16, 2.9,  0.4],
            ];

            plates.forEach(([bx, by, br, rot, phase]) => {
                // Very slow gentle drift to simulate molten flow
                const drift = Math.sin(t * 0.35 + phase) * 0.018;
                const cx = dx + (bx + drift) * ds;
                const cy = dy + (by + Math.cos(t * 0.28 + phase) * 0.012) * ds;
                const r  = br * ds * (0.92 + Math.sin(t * 0.6 + phase) * 0.05);

                // Irregular polygon — 8 sides with per-vertex radius variation
                const sides = 8;
                ctx.beginPath();
                for (let i = 0; i <= sides; i++) {
                    const a = (i / sides) * Math.PI * 2 + rot;
                    // Deterministic variation per vertex for stable jagged shape
                    const v = 0.72 + 0.28 * Math.sin(i * 2.7 + rot * 3.1 + phase);
                    const pr = r * v;
                    if (i === 0) ctx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
                    else         ctx.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
                }
                ctx.closePath();

                // Dark plate — radial gradient: slightly lighter core, very dark rim
                const pg = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, r * 0.04, cx, cy, r);
                pg.addColorStop(0,   "#8c1500");
                pg.addColorStop(0.5, "#660b00");
                pg.addColorStop(0.82,"#420500");
                pg.addColorStop(1,   "#220100");
                ctx.fillStyle = pg;
                ctx.fill();
            });

            // Inner glow bleed — subtle orange halo on each plate edge
            plates.forEach(([bx, by, br, rot, phase]) => {
                const drift = Math.sin(t * 0.35 + phase) * 0.018;
                const cx = dx + (bx + drift) * ds;
                const cy = dy + (by + Math.cos(t * 0.28 + phase) * 0.012) * ds;
                const r  = br * ds * (0.92 + Math.sin(t * 0.6 + phase) * 0.05);
                const eg = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
                eg.addColorStop(0, "rgba(180,30,0,0)");
                eg.addColorStop(1, `rgba(255,${Math.round(80 + glow * 40)},0,0.18)`);
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
            });

            ctx.restore();
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
            _drawSandTile(ctx, dx, dy, ds);
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
        let scaleExtra = tank.tank_type === "companion" ? 2.0
            : ((tank.mushroom_active || tank.is_big) ? 2.0 : 1.0);

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

        if (tank.tank_type === "companion") {
            const sz = Math.round(CELL * scaleExtra); // normal tank size
            ctx.save();
            ctx.translate(x, drawY);

            // Glowing yellow aura
            const ms = Date.now();
            const glow = (Math.sin(ms / 400) + 1) / 2;
            const auraGrad = ctx.createRadialGradient(0, 0, sz * 0.2, 0, 0, sz * 0.95);
            auraGrad.addColorStop(0, `rgba(255,238,88,${0.30 + glow * 0.15})`);
            auraGrad.addColorStop(1, "rgba(255,238,88,0)");
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.95, 0, Math.PI * 2);
            ctx.fill();

            // Gun barrel (pointing in direction)
            ctx.fillStyle = "#555";
            const gunLen = sz * 0.42;
            const gunW = sz * 0.12;
            if (dir === "up")    ctx.fillRect(-gunW/2, -gunLen, gunW, gunLen);
            else if (dir === "down")  ctx.fillRect(-gunW/2, 0, gunW, gunLen);
            else if (dir === "left")  ctx.fillRect(-gunLen, -gunW/2, gunLen, gunW);
            else if (dir === "right") ctx.fillRect(0, -gunW/2, gunLen, gunW);

            // Chick emoji, same size as a regular tank sprite
            const pulse = Math.sin(ms / 280) * sz * 0.04;
            ctx.font = `${sz * 0.82 + pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, sz * 0.04);
            ctx.restore();
            return;
        }

        let spriteId = null;
        if (tank.tank_type === "turret") {
            const sz = Math.round(CELL * 2 * scaleExtra * 0.85);
            const hp  = tank.hp ?? 3;
            const ms  = Date.now();

            // Direction angle for rotating parts
            const dirAngle = dir === "right" ? Math.PI / 2
                           : dir === "down"  ? Math.PI
                           : dir === "left"  ? -Math.PI / 2 : 0;

            ctx.save();
            ctx.translate(x, drawY);

            // ── Ground shadow ─────────────────────────────────────────────────
            ctx.fillStyle = "rgba(0,0,0,0.28)";
            ctx.beginPath();
            ctx.ellipse(sz * 0.06, sz * 0.1, sz * 0.46, sz * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();

            // ── Sandbag ring (8 bags, static) ────────────────────────────────
            const bagR = sz * 0.44;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const bx = Math.cos(a) * bagR;
                const by = Math.sin(a) * bagR;
                const bagGrad = ctx.createRadialGradient(bx - sz*0.03, by - sz*0.03, sz*0.01, bx, by, sz*0.1);
                bagGrad.addColorStop(0, "#a89060");
                bagGrad.addColorStop(1, "#6b5030");
                ctx.fillStyle = bagGrad;
                ctx.beginPath();
                ctx.ellipse(bx, by, sz * 0.12, sz * 0.08, a, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(0,0,0,0.3)";
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }

            // ── Concrete base plate ───────────────────────────────────────────
            const plateGrad = ctx.createRadialGradient(-sz*0.08, -sz*0.08, sz*0.05, 0, 0, sz*0.38);
            plateGrad.addColorStop(0, "#95918e");
            plateGrad.addColorStop(0.6, "#706c69");
            plateGrad.addColorStop(1, "#524f4c");
            ctx.fillStyle = plateGrad;
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.35, 0, Math.PI * 2);
            ctx.fill();

            // Concrete detail — subtle panel lines
            ctx.strokeStyle = "rgba(0,0,0,0.12)";
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * sz * 0.08, Math.sin(a) * sz * 0.08);
                ctx.lineTo(Math.cos(a) * sz * 0.32, Math.sin(a) * sz * 0.32);
                ctx.stroke();
            }
            // Rim highlight
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.33, -Math.PI * 0.8, Math.PI * 0.1);
            ctx.stroke();

            // ── Pivot ring (steel ring the gun rotates on) ────────────────────
            const ringGrad = ctx.createLinearGradient(-sz*0.18, -sz*0.18, sz*0.18, sz*0.18);
            ringGrad.addColorStop(0, "#9eaab0");
            ringGrad.addColorStop(0.5, "#607d8b");
            ringGrad.addColorStop(1, "#37474f");
            ctx.fillStyle = ringGrad;
            ctx.beginPath();
            ctx.arc(0, 0, sz * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Ring bolts
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.fillStyle = "#263238";
                ctx.beginPath();
                ctx.arc(Math.cos(a) * sz * 0.16, Math.sin(a) * sz * 0.16, sz * 0.02, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── Damage cracks (hp ≤ 2) ────────────────────────────────────────
            if (hp <= 2) {
                ctx.strokeStyle = "rgba(20,10,0,0.6)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-sz*0.28, -sz*0.05); ctx.lineTo(-sz*0.12, sz*0.08); ctx.lineTo(-sz*0.18, sz*0.2);
                ctx.moveTo(sz*0.15, -sz*0.22); ctx.lineTo(sz*0.05, -sz*0.08); ctx.lineTo(sz*0.2, sz*0.06);
                ctx.stroke();
                // Scorch marks
                ctx.fillStyle = "rgba(0,0,0,0.18)";
                ctx.beginPath(); ctx.arc(-sz*0.18, sz*0.1, sz*0.06, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(sz*0.1, -sz*0.18, sz*0.05, 0, Math.PI*2); ctx.fill();
            }

            // ── Rotating gun assembly ─────────────────────────────────────────
            ctx.save();
            ctx.rotate(dirAngle);

            // Gun body / turret head — larger, more prominent dome
            const headGrad = ctx.createRadialGradient(-sz*0.07, -sz*0.07, sz*0.02, 0, 0, sz*0.26);
            headGrad.addColorStop(0, "#90a4ae");
            headGrad.addColorStop(0.5, "#546e7a");
            headGrad.addColorStop(1, "#2e4050");
            ctx.fillStyle = headGrad;
            ctx.beginPath();
            ctx.arc(0, sz*0.04, sz*0.24, 0, Math.PI * 2);
            ctx.fill();

            // Outer armor ring on dome
            ctx.strokeStyle = "rgba(144,164,174,0.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, sz*0.04, sz*0.24, -Math.PI * 0.9, Math.PI * 0.1);
            ctx.stroke();

            // Vision slit / sensor strip — glowing cyan
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.fillRect(-sz*0.13, -sz*0.02, sz*0.26, sz*0.05);
            const scanPulse = (Math.sin(ms / 120) + 1) * 0.5;
            ctx.fillStyle = `rgba(0,220,255,${0.4 + scanPulse * 0.4})`;
            ctx.fillRect(-sz*0.13, -sz*0.02, sz*0.26, sz*0.05);
            // Tiny scope lens dots
            ctx.fillStyle = `rgba(0,255,255,${0.6 + scanPulse * 0.4})`;
            [-sz*0.08, 0, sz*0.08].forEach(ox => {
                ctx.beginPath();
                ctx.arc(ox, sz*0.005, sz*0.015, 0, Math.PI * 2);
                ctx.fill();
            });

            // Barrel root / mantlet — wider, more solid
            const mantletGrad = ctx.createLinearGradient(-sz*0.12, 0, sz*0.12, 0);
            mantletGrad.addColorStop(0, "#37474f");
            mantletGrad.addColorStop(0.5, "#607d8b");
            mantletGrad.addColorStop(1, "#37474f");
            ctx.fillStyle = mantletGrad;
            ctx.fillRect(-sz*0.12, -sz*0.20, sz*0.24, sz*0.18);
            // Mantlet bolts
            ctx.fillStyle = "#263238";
            [[-sz*0.09, -sz*0.19], [sz*0.09, -sz*0.19]].forEach(([bx, by]) => {
                ctx.beginPath(); ctx.arc(bx, by, sz*0.025, 0, Math.PI * 2); ctx.fill();
            });

            // Barrel — distinctly longer and wider with recoil animation
            const recoilPhase = (ms % 400) / 400;
            const recoilOffset = Math.max(0, Math.sin(recoilPhase * Math.PI) * sz * 0.07);
            const barrelTop = -sz * 0.72 + recoilOffset;
            const barrelLen = sz * 0.52;

            // Barrel shadow (depth)
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(-sz*0.075 + sz*0.01, barrelTop + sz*0.01, sz*0.15, barrelLen);

            const barrelGrad = ctx.createLinearGradient(-sz*0.075, 0, sz*0.075, 0);
            barrelGrad.addColorStop(0, "#1c2b33");
            barrelGrad.addColorStop(0.3, "#607d8b");
            barrelGrad.addColorStop(0.65, "#455a64");
            barrelGrad.addColorStop(1, "#1c2b33");
            ctx.fillStyle = barrelGrad;
            ctx.fillRect(-sz*0.075, barrelTop, sz*0.15, barrelLen);

            // Bright highlight stripe on barrel (makes gun clearly visible)
            ctx.fillStyle = "rgba(160,200,220,0.5)";
            ctx.fillRect(-sz*0.055, barrelTop, sz*0.03, barrelLen);

            // Barrel ring bands (3 rings for more detail)
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.lineWidth = 2;
            [0.18, 0.32, 0.46].forEach(t => {
                ctx.strokeRect(-sz*0.075, barrelTop + barrelLen * t, sz*0.15, sz*0.03);
            });

            // Muzzle brake — wider, pronounced
            const muzzleGrad = ctx.createLinearGradient(-sz*0.11, 0, sz*0.11, 0);
            muzzleGrad.addColorStop(0, "#0d1a20");
            muzzleGrad.addColorStop(0.5, "#455a64");
            muzzleGrad.addColorStop(1, "#0d1a20");
            ctx.fillStyle = muzzleGrad;
            ctx.fillRect(-sz*0.11, barrelTop - sz*0.055, sz*0.22, sz*0.075);
            // Muzzle vent holes
            ctx.fillStyle = "#060f14";
            ctx.fillRect(-sz*0.09, barrelTop - sz*0.048, sz*0.05, sz*0.055);
            ctx.fillRect( sz*0.04, barrelTop - sz*0.048, sz*0.05, sz*0.055);
            // Center bore
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(0, barrelTop - sz*0.02, sz*0.025, sz*0.025, 0, 0, Math.PI * 2);
            ctx.fill();

            // Muzzle flash glow
            const flashAlpha = Math.max(0, Math.sin(recoilPhase * Math.PI) * 0.7);
            if (flashAlpha > 0.05) {
                const flashGrad = ctx.createRadialGradient(0, barrelTop - sz*0.04, 0, 0, barrelTop - sz*0.04, sz*0.18);
                flashGrad.addColorStop(0, `rgba(255,220,80,${flashAlpha})`);
                flashGrad.addColorStop(0.4, `rgba(255,120,20,${flashAlpha * 0.5})`);
                flashGrad.addColorStop(1, "rgba(255,60,0,0)");
                ctx.fillStyle = flashGrad;
                ctx.beginPath();
                ctx.arc(0, barrelTop - sz*0.04, sz*0.18, 0, Math.PI * 2);
                ctx.fill();
            }

            // Barrel heat glow (idle shimmer)
            const heatPulse = (Math.sin(ms / 180) + 1) * 0.5;
            const heatGrad = ctx.createLinearGradient(0, barrelTop, 0, barrelTop + barrelLen);
            heatGrad.addColorStop(0, `rgba(255,120,30,0)`);
            heatGrad.addColorStop(0.5, `rgba(255,80,10,${heatPulse * 0.15})`);
            heatGrad.addColorStop(1, `rgba(255,40,0,0)`);
            ctx.fillStyle = heatGrad;
            ctx.fillRect(-sz*0.075, barrelTop, sz*0.15, barrelLen);

            ctx.restore(); // end rotating assembly

            // ── Smoke (hp ≤ 1) ────────────────────────────────────────────────
            if (hp <= 1) {
                for (let i = 0; i < 5; i++) {
                    const progress = ((ms / 25 + i * 18) % 60) / 60;
                    const sy = -progress * sz * 0.9 - sz * 0.1;
                    const sx = Math.sin(ms / 250 + i * 1.3) * sz * 0.15 * progress;
                    const r  = sz * (0.07 + progress * 0.13);
                    const alpha = (1 - progress) * 0.55;
                    const smoke = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
                    smoke.addColorStop(0, `rgba(60,55,50,${alpha})`);
                    smoke.addColorStop(1, `rgba(40,40,40,0)`);
                    ctx.fillStyle = smoke;
                    ctx.beginPath();
                    ctx.arc(sx, sy, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Ember glow at base
                const emberAlpha = (Math.sin(ms / 80) + 1) * 0.3;
                ctx.fillStyle = `rgba(255,100,0,${emberAlpha})`;
                ctx.beginPath();
                ctx.arc(0, -sz * 0.05, sz * 0.08, 0, Math.PI * 2);
                ctx.fill();
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
        if (exp.kind === "super_tnt") {
            this._drawSuperTntExplosion(ctx, exp, cell);
            return;
        }
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

    _drawSuperTntExplosion(ctx, exp, cell) {
        const maxTicks = 50;
        const elapsed = maxTicks - exp.ticks;
        const progress = elapsed / maxTicks; // 0 → 1
        const cx = exp.col * cell;
        const cy = exp.row * cell;
        const maxRadius = (exp.radius ?? 3) * cell;

        ctx.save();

        // Central white flash at the very start
        if (progress < 0.15) {
            const flashAlpha = (1 - progress / 0.15) * 0.9;
            const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.4);
            flash.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
            flash.addColorStop(0.5, `rgba(255,220,80,${flashAlpha * 0.6})`);
            flash.addColorStop(1, `rgba(255,80,0,0)`);
            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(cx, cy, maxRadius * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Concentric fire rings expanding outward
        const numRings = 6;
        const ringSpacing = 0.18; // time offset between rings
        for (let i = 0; i < numRings; i++) {
            const ringProgress = Math.max(0, Math.min(1, progress - i * ringSpacing));
            if (ringProgress <= 0) continue;

            const r = ringProgress * maxRadius;
            // Each ring fades out as it expands; earlier rings fade faster
            const fadeStart = 0.5 + i * 0.06;
            const alpha = ringProgress < fadeStart
                ? 1.0
                : Math.max(0, 1 - (ringProgress - fadeStart) / (1 - fadeStart));

            const ringAlpha = alpha * (1 - i * 0.12);
            if (ringAlpha <= 0) continue;

            // Thick glowing ring: bright yellow-white core → orange edge
            const lineW = cell * (0.3 - i * 0.03);

            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
            // Color shifts from white/yellow (first ring) to deep orange/red (later rings)
            const rVal = 255;
            const gVal = Math.round(200 - i * 30);
            const bVal = Math.round(Math.max(0, 60 - i * 20));
            ctx.strokeStyle = `rgba(${rVal},${gVal},${bVal},${ringAlpha})`;
            ctx.lineWidth = Math.max(1, lineW);
            ctx.stroke();

            // Faint fill inside the leading ring to simulate heat/glow
            if (i === 0) {
                const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
                glow.addColorStop(0, `rgba(255, 200, 50, ${ringAlpha * 0.15})`);
                glow.addColorStop(1, `rgba(255, 60, 0, 0)`);
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Dark smoke ring trailing behind the outermost fire ring
        const smokeProgress = Math.max(0, progress - 0.1);
        if (smokeProgress > 0) {
            const smokeR = smokeProgress * maxRadius * 0.85;
            const smokeAlpha = Math.max(0, (1 - progress) * 0.35);
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(1, smokeR), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(30, 20, 10, ${smokeAlpha})`;
            ctx.lineWidth = cell * 0.2;
            ctx.stroke();
        }

        ctx.restore();
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
