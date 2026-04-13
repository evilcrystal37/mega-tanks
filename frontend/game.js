/**
 * game.js — NES Battle City Renderer
 */

import { Api, GameSocket } from "./api.js";
import { Hud } from "./hud.js";
import { SpriteAtlas } from "./spriteAtlas.js";
import { audioManager } from "./audio.js";
import { CELL, GRID_H, GRID_W } from "./constants.js";
import { GameInput } from "./gameInput.js";
import { GameStateStore } from "./gameState.js";
import { renderBullets, renderExplosions, renderLetterEffects } from "./effectRenderer.js";
import { renderTanks } from "./tankRenderer.js";
import { drawSandTile, drawLavaTile, drawCustomTile, customTileSpanFromTile, resolveCustomMultiOrigin } from "./tileRenderer.js";
import { computeViewport, getCellZoom, resizeCanvas } from "./viewport.js";

const FALLBACK_TILE_COLORS = {};

function _drawSandTile(ctx, dx, dy, ds) { drawSandTile(ctx, dx, dy, ds); }

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
        this._gridCache = null;
        this._tileColors = { ...FALLBACK_TILE_COLORS };
        this.stateStore = new GameStateStore();
        this.gameInput = new GameInput(
            () => this._sendInput(),
            () => this.socket?.sendPause()
        );

        this._atlas = new SpriteAtlas();
        this._tileCache = new Map();
        this._tankSoundState = null; // "moving" | "idle" | "dead"
    }

    async startGame(mapName, sessionId = "default", settings = null) {
        this.mapName = mapName;
        this.hud.setMapName(mapName);
        this.hud.reset();
        this._explosions = [];
        this._gridCache = null;
        this._tankSoundState = null;
        this.stateStore.reset();

        this._resize();
        await this._atlas.ready();
        try {
            const tiles = await Api.getTiles();
            this._tileColors = Object.fromEntries(tiles.map(t => [t.id, t.color]));
            this._tilesMap = Object.fromEntries(tiles.map(t => [t.id, t]));
        } catch {
            this._tileColors = { ...FALLBACK_TILE_COLORS };
            this._tilesMap = {};
        }

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
        const { state } = this.stateStore.apply(rawState);
        this._explosions = this.stateStore.explosions;
        this.state = state;

        this.hud.update(rawState);

        if (rawState.events && rawState.events.length > 0) {
            rawState.events.forEach(ev => {
                if (ev.type === "sound") {
                    audioManager.play(ev.sound);
                }
            });
        }

        // Tank movement looping sounds
        const rp = rawState.player;
        const pp = prev?.player;
        const isMoving = rp && rp.alive && pp && pp.alive &&
            (rp.row !== pp.row || rp.col !== pp.col);
        const newTankSound = (rp && rp.alive) ? (isMoving ? "moving" : "idle") : "dead";
        if (newTankSound !== this._tankSoundState) {
            this._tankSoundState = newTankSound;
            if (newTankSound === "moving") {
                audioManager.stop("tank-idle");
                audioManager.play("tank-move");
            } else if (newTankSound === "idle") {
                audioManager.stop("tank-move");
                audioManager.play("tank-idle");
            } else {
                audioManager.stop("tank-move");
                audioManager.stop("tank-idle");
            }
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
        const zoom = this._getCellZoom();
        const sized = resizeCanvas(this.canvas, GRID_W, GRID_H, zoom);
        this._cell = sized.cell;

        // Canvas fills the container 1:1 (no CSS down-scaling).
        this.canvas.width = sized.width;
        this.canvas.height = sized.height;
        this.canvas.style.width = `${sized.width}px`;
        this.canvas.style.height = `${sized.height}px`;
    }

    _getCellZoom() {
        return getCellZoom("battle_tanks_settings", 2.0);
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
        const focus = this.state.player && this.state.player.alive
            ? { row: this.state.player.row, col: this.state.player.col }
            : { row: GRID_H / 2, col: GRID_W / 2 };
        const { vpLeft, vpTop, startC, endC, startR, endR } = computeViewport(
            focus.row,
            focus.col,
            this.canvas.width,
            this.canvas.height,
            cell,
            GRID_W,
            GRID_H
        );

        const grid = this.state.grid ?? [];

        // Build a cell→anchor lookup from server-authoritative mobile entity bounds.
        // This avoids the flood-fill fallback in resolveCustomMultiOrigin, which breaks
        // when two entities of the same tile_id are adjacent.
        this._mobileAnchorMap = {};
        for (const ent of (this.state.mobile_entities || [])) {
            for (let r = ent.minR; r < ent.minR + ent.h; r++) {
                for (let c = ent.minC; c < ent.minC + ent.w; c++) {
                    this._mobileAnchorMap[`${r},${c}`] = { minR: ent.minR, minC: ent.minC };
                }
            }
        }

        ctx.save();
        ctx.translate(Math.round(-vpLeft * cell), Math.round(-vpTop * cell));

        // Bottom layers: ice, water, brick, steel, base
        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                const tid = grid[r]?.[c] ?? 0;
                if (tid === 0 || tid === 4 || tid === 18) continue; // Forest, Sunflower handled separately for top layer
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

        // Golden Eagle overlay
        if (this.state.golden_eagle_ticks > 0 && this.state.base_pos && this.state.result !== "defeat") {
            const br = this.state.base_pos.row;
            const bc = this.state.base_pos.col;
            const bx = Math.round(bc * cell);
            const by = Math.round(br * cell);

            ctx.save();

            // 1. Draw normal base sprite with gold tint overlay
            this._atlas.draw(ctx, "base.heart.alive", bx, by, cell * 2, cell * 2);
            ctx.globalCompositeOperation = "source-atop";  // only paint over opaque pixels
            ctx.fillStyle = `rgba(255, 200, 0, 0.55)`;
            ctx.fillRect(bx, by, cell * 2, cell * 2);
            ctx.globalCompositeOperation = "source-over";

            // 2. Sparkle dots (6 random-phase flashing gold dots)
            const t = Date.now();
            ctx.fillStyle = "#FFF"; // Base sparkle color
            const sparkles = [
                { x: 0.2, y: 0.2, phase: 0 },
                { x: 0.8, y: 0.3, phase: 1 },
                { x: 0.5, y: 0.1, phase: 2 },
                { x: 0.1, y: 0.7, phase: 3 },
                { x: 0.9, y: 0.8, phase: 4 },
                { x: 0.4, y: 0.9, phase: 5 },
            ];

            for (let s of sparkles) {
                const alpha = (Math.sin(t / 200 + s.phase) + 1) / 2;
                if (alpha > 0.5) {
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = "#FFD700";
                    ctx.beginPath();
                    ctx.arc(bx + s.x * cell * 2, by + s.y * cell * 2, cell * 0.12, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1.0;

            ctx.restore();
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
            }
            ctx.globalAlpha = 1.0;
        }

        renderBullets(ctx, this.state, cell);
        renderTanks(this, ctx, this.state, cell);

        // Top layers: Forest and Sunflower
        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                const tid = grid[r]?.[c] ?? 0;
                if (tid === 4 || tid === 18) {
                    ctx.save();
                    if (tid === 4) ctx.globalAlpha = 0.65;
                    if (tid === 18) ctx.globalAlpha = 1.0;
                    this._drawTileDetail(ctx, tid, c * cell, r * cell, cell);
                    ctx.restore();
                }
            }
        }

        renderExplosions(this, ctx, this.state, cell);

        // Letter powerup effects
        renderLetterEffects(ctx, this.state, cell);

        // Sandworm
        if (this.state.sandworm && this.state.sandworm.active) {
            const sw = this.state.sandworm;
            const swHp = sw.hp ?? 5;
            const swMaxHp = 5;
            const now = Date.now();
            const pulse = (Math.sin(now / 200) + 1) / 2;

            // Opacity fades as HP drops: full HP = fully opaque, 1 HP = very transparent, 0 = gone
            const hpRatio = swHp / swMaxHp;           // 1.0 → 0.2
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
                    if (sw.direction === "up") angle = -Math.PI / 2;
                    if (sw.direction === "down") angle = Math.PI / 2;
                    if (sw.direction === "left") angle = Math.PI;
                    if (sw.direction === "right") angle = 0;
                }
                ctx.rotate(angle);

                // Yellow body colour stays constant (damage shown via transparency only)
                const bodyLight = "rgb(255,220,60)";
                const bodyMid = "rgb(220,170,0)";
                const bodyDark = "rgb(160,110,0)";

                const baseRadius = part.type === "head" ? segSz * 0.44 : segSz * 0.38;
                const pulsingRadius = baseRadius + pulse * segSz * 0.04;

                if (part.type === "head") {
                    // ── Drop shadow ──────────────────────────────────────────
                    ctx.fillStyle = "rgba(0,0,0,0.22)";
                    ctx.beginPath();
                    ctx.ellipse(wiggle + segSz * 0.04, segSz * 0.06,
                        pulsingRadius * 1.1, pulsingRadius * 0.55, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // ── Head body (bullet / tapered rear half) ───────────────
                    ctx.fillStyle = bodyMid;
                    ctx.beginPath();
                    // Tapered rear half: semicircle on the left (back), meet at mouth radius on right
                    const mouthR = pulsingRadius * 0.82; // radius of the open mouth circle
                    ctx.arc(wiggle, 0, pulsingRadius * 1.1, Math.PI * 0.5, Math.PI * 1.5); // back arc
                    ctx.lineTo(wiggle + pulsingRadius * 0.3, -mouthR); // taper to mouth top
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
                    const outerR = mouthR;
                    const numRings = 3;
                    const toothRows = 12; // teeth per ring

                    // Outer gum ring — dark red flesh
                    ctx.fillStyle = "rgba(80,0,0,1)";
                    ctx.beginPath();
                    ctx.arc(mouthCX, mouthCY, outerR, 0, Math.PI * 2);
                    ctx.fill();

                    // Concentric tooth rings from outside in
                    for (let ring = 0; ring < numRings; ring++) {
                        const ringFrac = 1 - ring / numRings;           // 1.0 → 0.33
                        const ringR = outerR * ringFrac;
                        const innerRingR = outerR * (ringFrac - 1 / numRings) * 0.7;
                        const toothLen = (ringR - innerRingR) * (0.65 + mouthOpen * 0.3);
                        const toothBase = ringR * 0.88;

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
                            const tipR = toothBase - toothLen * (0.5 + mouthOpen * 0.5);
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
                    throatGrad.addColorStop(0, "rgba(0,0,0,1)");
                    throatGrad.addColorStop(0.6, "rgba(60,0,0,0.9)");
                    throatGrad.addColorStop(1, "rgba(120,0,0,0)");
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

                    ctx.fillStyle = bodyMid;
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

        // Skeletons
        this._drawSkeletons(ctx, cell);

        ctx.restore();

        if (this.state.paused) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.fillStyle = "#ffcc00";
            ctx.font = `bold ${Math.max(24, cell * 1.5)}px "Press Start 2P", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("PAUSED", this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    _drawSkeletons(ctx, cell) {
        const skeletons = this.state.skeletons || [];
        const mega = this.state.mega_skeleton;
        const now = Date.now();

        const drawSkeleton = (skel) => {
            if (!skel.alive) return;
            const x = skel.col * cell;
            const y = skel.row * cell;
            const w = skel.w * cell;
            const h = skel.h * cell;

            ctx.save();
            ctx.translate(x, y);

            if (skel.is_mega) {
                this._drawMegaSkeleton(ctx, w, h, skel, now);
            } else {
                this._drawNormalSkeleton(ctx, w, h, skel, now);
            }

            ctx.restore();
        };

        skeletons.forEach(drawSkeleton);
        if (mega) drawSkeleton(mega);
    }

    _drawNormalSkeleton(ctx, w, h, skel, now) {
        // 1×2 skeleton: 💀 head on top half, ribcage + limbs on bottom half
        const bob = Math.sin(now / 300) * w * 0.06;

        // 💀 skull emoji — top half, centered
        const skullSize = h * 0.48;
        ctx.font = `${skullSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💀", w * 0.5 + bob, h * 0.24);

        // Ribcage oval — bottom half
        ctx.fillStyle = "rgba(230, 230, 210, 0.92)";
        ctx.beginPath();
        ctx.ellipse(w * 0.5 + bob, h * 0.63, w * 0.28, h * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ribs
        ctx.strokeStyle = "rgba(100, 100, 80, 0.55)";
        ctx.lineWidth = Math.max(1, w * 0.07);
        for (let i = 0; i < 3; i++) {
            const ry = h * 0.54 + i * h * 0.08;
            ctx.beginPath();
            ctx.moveTo(w * 0.24 + bob, ry);
            ctx.lineTo(w * 0.76 + bob, ry);
            ctx.stroke();
        }

        // Arms (bone stubs out from sides of ribcage)
        ctx.strokeStyle = "#DEDED0";
        ctx.lineWidth = Math.max(2, w * 0.09);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(w * 0.22 + bob, h * 0.57);
        ctx.lineTo(w * 0.04 + bob, h * 0.68);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.78 + bob, h * 0.57);
        ctx.lineTo(w * 0.96 + bob, h * 0.68);
        ctx.stroke();

        // Legs
        ctx.beginPath();
        ctx.moveTo(w * 0.38 + bob, h * 0.78);
        ctx.lineTo(w * 0.28 + bob, h * 0.97);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.62 + bob, h * 0.78);
        ctx.lineTo(w * 0.72 + bob, h * 0.97);
        ctx.stroke();
    }

    _drawMegaSkeleton(ctx, w, h, skel, now) {
        const pulse = (Math.sin(now / 250) + 1) / 2;
        const bob = Math.sin(now / 400) * h * 0.02;

        // Torso — large ribcage
        ctx.fillStyle = "rgba(225, 225, 205, 0.95)";
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.58 + bob, w * 0.33, h * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ribs
        ctx.strokeStyle = "rgba(90, 90, 70, 0.6)";
        ctx.lineWidth = Math.max(2, h * 0.04);
        for (let i = 0; i < 5; i++) {
            const ry = h * 0.38 + i * h * 0.09 + bob;
            ctx.beginPath();
            ctx.moveTo(w * 0.22, ry);
            ctx.lineTo(w * 0.78, ry);
            ctx.stroke();
        }

        // Skull — 💀 emoji, large centered at top, pulsing size instead of glow
        const skullR = Math.min(w, h) * 0.22;
        const skullCX = w * 0.5;
        const skullCY = h * 0.22 + bob;
        const skullEmojiSize = skullR * (2.2 + pulse * 0.15);

        ctx.save();
        ctx.font = `${skullEmojiSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💀", skullCX, skullCY);
        ctx.restore();

        // Crown/horns above the skull
        ctx.fillStyle = "#E8D44D";
        const hornPoints = [
            [skullCX - skullR * 0.8, skullCY - skullR * 0.9],
            [skullCX - skullR * 0.5, skullCY - skullR * 1.6],
            [skullCX - skullR * 0.2, skullCY - skullR * 0.9],
            [skullCX + skullR * 0.2, skullCY - skullR * 0.9],
            [skullCX + skullR * 0.5, skullCY - skullR * 1.6],
            [skullCX + skullR * 0.8, skullCY - skullR * 0.9],
        ];
        ctx.beginPath();
        ctx.moveTo(hornPoints[0][0], hornPoints[0][1]);
        hornPoints.forEach(([hx, hy]) => ctx.lineTo(hx, hy));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(180,140,0,0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Spine
        ctx.strokeStyle = "#D8D8C0";
        ctx.lineWidth = Math.max(3, w * 0.025);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.32 + bob);
        ctx.lineTo(w * 0.5, h * 0.82 + bob);
        ctx.stroke();

        // Arms — long bone arms
        ctx.lineWidth = Math.max(4, w * 0.032);
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.45 + bob);
        ctx.lineTo(w * 0.02, h * 0.7 + bob);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.8, h * 0.45 + bob);
        ctx.lineTo(w * 0.98, h * 0.7 + bob);
        ctx.stroke();

        // Legs
        ctx.beginPath();
        ctx.moveTo(w * 0.38, h * 0.82 + bob);
        ctx.lineTo(w * 0.25, h * 0.97 + bob);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.62, h * 0.82 + bob);
        ctx.lineTo(w * 0.75, h * 0.97 + bob);
        ctx.stroke();
    }

    _createOffscreen(w, h) {
        if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    _getCachedBigTile(tid, ds) {
        const key = `${tid}_${ds}`;
        let cached = this._tileCache.get(key);
        if (cached) return cached;
        const size = ds * 2;
        const canvas = this._createOffscreen(size, size);
        const octx = canvas.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.translate(ds, ds);
        this._renderBigTileStatic(octx, tid, ds);
        this._tileCache.set(key, canvas);
        return canvas;
    }

    _getCachedSmallTile(tid, ds) {
        const key = `s_${tid}_${ds}`;
        let cached = this._tileCache.get(key);
        if (cached) return cached;
        const canvas = this._createOffscreen(ds, ds);
        const octx = canvas.getContext('2d');
        octx.imageSmoothingEnabled = false;
        this._renderSmallTileStatic(octx, tid, ds);
        this._tileCache.set(key, canvas);
        return canvas;
    }

    _renderGlassBoxCracks(ctx, tid, ds, color) {
        let level;
        if (tid >= 26 && tid <= 28) level = tid - 26;
        else if (tid >= 29 && tid <= 31) level = tid - 29;
        else if (tid >= 33 && tid <= 35) level = tid - 33;
        else if (tid >= 38 && tid <= 40) level = tid - 38;
        else if (tid >= 44 && tid <= 46) level = tid - 44;
        else if (tid >= 48 && tid <= 50) level = tid - 48;
        else if (tid >= 51 && tid <= 90) level = (tid - 52 + 4) % 4;  // Letter tiles: pad→3, crack2→0, crack1→1, box→2
        else return;
        if (level >= 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (level <= 1) {
            ctx.moveTo(-ds * 0.4, -ds); ctx.lineTo(0, 0); ctx.lineTo(ds, -ds * 0.4);
        }
        if (level === 0) {
            ctx.moveTo(0, 0); ctx.lineTo(ds * 0.7, ds * 0.7);
            ctx.moveTo(-ds, ds * 0.3); ctx.lineTo(-ds * 0.2, 0);
        }
        ctx.stroke();
    }

    _renderGlassBoxBorders(ctx, ds, borderColor, topColor, bottomColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(-ds + 3, -ds + 3, ds * 2 - 6, ds * 2 - 6);
        ctx.strokeStyle = topColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-ds, ds); ctx.lineTo(-ds, -ds); ctx.lineTo(ds, -ds);
        ctx.stroke();
        ctx.strokeStyle = bottomColor;
        ctx.beginPath();
        ctx.moveTo(ds, -ds); ctx.lineTo(ds, ds); ctx.lineTo(-ds, ds);
        ctx.stroke();
    }

    _renderBigTileStatic(ctx, tid, ds) {
        if (tid === 18) {
            ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🌼", 0, ds * 0.1);
        } else if (tid === 14 || tid === 36) {
            ctx.fillStyle = "#d32f2f";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.fillStyle = "#eeeeee";
            ctx.fillRect(-ds, -ds * 0.3, ds * 2, ds * 0.6);
            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.max(6, ds * 0.5)}px monospace`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("TNT", 0, 0);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = ds * 0.05;
            ctx.beginPath();
            for (let i = -0.6; i <= 0.6; i += 0.4) {
                ctx.moveTo(ds * i, -ds); ctx.lineTo(ds * i, -ds * 0.3);
                ctx.moveTo(ds * i, ds * 0.3); ctx.lineTo(ds * i, ds);
            }
            ctx.stroke();
        } else if (tid === 23) {
            ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🌈", 0, ds * 0.1);
        } else if (tid === 24) {
            ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🍄", 0, ds * 0.1);
        } else if (tid === 25) {
            ctx.fillStyle = "#546e7a";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.fillStyle = "#607d8b";
            ctx.beginPath(); ctx.arc(0, 0, ds * 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#37474f";
            ctx.fillRect(-ds * 0.12, -ds * 0.9, ds * 0.24, ds * 0.75);
        } else if (tid === 32) {
            ctx.font = `${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.1);
        } else if (tid === 43) {
            ctx.font = `${ds * 1.4}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("☀️", 0, 0);
        } else if (tid === 47) {
            ctx.font = `${ds * 1.4}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🔫", 0, ds * 0.05);
        } else if (tid >= 26 && tid <= 28) {
            ctx.fillStyle = "rgba(139, 195, 74, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
            ctx.fillStyle = "#f5f5dc";
            ctx.fillRect(-ds * 0.12, ds * 0.1, ds * 0.24, ds * 0.5);
            ctx.fillStyle = "#e52521";
            ctx.beginPath(); ctx.arc(0, ds * 0.1, ds * 0.5, Math.PI, 0); ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(-ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, -ds * 0.35, ds * 0.12, 0, Math.PI * 2); ctx.fill();
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
        } else if (tid >= 29 && tid <= 31) {
            ctx.fillStyle = "rgba(255, 105, 180, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
            ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🌈", 0, ds * 0.05);
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
        } else if (tid >= 33 && tid <= 35) {
            ctx.fillStyle = "rgba(255, 238, 88, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
            ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🐥", 0, ds * 0.05);
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
        } else if (tid >= 38 && tid <= 40) {
            ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.6)", "rgba(255,255,255,0.9)", "rgba(0,0,0,0.4)");
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
        } else if (tid >= 44 && tid <= 46) {
            ctx.fillStyle = "rgba(255, 140, 0, 0.25)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,200,0,0.6)", "rgba(255,255,200,0.9)", "rgba(180,80,0,0.4)");
            ctx.font = `${ds * 1.4}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("☀️", 0, 0);
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,200,0.9)");
        } else if (tid >= 48 && tid <= 50) {
            ctx.fillStyle = "rgba(50, 50, 60, 0.4)";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            this._renderGlassBoxBorders(ctx, ds, "rgba(120,180,255,0.5)", "rgba(200,200,220,0.8)", "rgba(0,0,20,0.5)");
            ctx.font = `${ds * 1.3}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("🔫", 0, ds * 0.05);
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(150,200,255,0.9)");
        } else if (tid >= 51 && tid <= 90) {
            // Letter powerup boxes - glass box with borders and cracks
            const letterColors = {
                51: "rgba(255, 225, 53, 0.2)", 52: "rgba(255, 225, 53, 0.2)", 53: "rgba(255, 225, 53, 0.2)", 54: "rgba(255, 225, 53, 0.2)",  // B - Banana (yellow)
                55: "rgba(0, 206, 209, 0.2)", 56: "rgba(0, 206, 209, 0.2)", 57: "rgba(0, 206, 209, 0.2)", 58: "rgba(0, 206, 209, 0.2)",  // C - Clone (cyan)
                59: "rgba(255, 20, 147, 0.2)", 60: "rgba(255, 20, 147, 0.2)", 61: "rgba(255, 20, 147, 0.2)", 62: "rgba(255, 20, 147, 0.2)",  // F - Fireworks (pink)
                63: "rgba(147, 112, 219, 0.2)", 64: "rgba(147, 112, 219, 0.2)", 65: "rgba(147, 112, 219, 0.2)", 66: "rgba(147, 112, 219, 0.2)",  // J - Jump (purple)
                67: "rgba(255, 105, 180, 0.2)", 68: "rgba(255, 105, 180, 0.2)", 69: "rgba(255, 105, 180, 0.2)", 70: "rgba(255, 105, 180, 0.2)",  // R - Rainbow (hot pink)
                71: "rgba(135, 206, 235, 0.2)", 72: "rgba(135, 206, 235, 0.2)", 73: "rgba(135, 206, 235, 0.2)", 74: "rgba(135, 206, 235, 0.2)",  // A - Airplane (sky blue)
                75: "rgba(220, 20, 60, 0.2)", 76: "rgba(220, 20, 60, 0.2)", 77: "rgba(220, 20, 60, 0.2)", 78: "rgba(220, 20, 60, 0.2)",  // M - Magnet (crimson)
                79: "rgba(255, 140, 0, 0.2)", 80: "rgba(255, 140, 0, 0.2)", 81: "rgba(255, 140, 0, 0.2)", 82: "rgba(255, 140, 0, 0.2)",  // S - Sahur (dark orange)
                83: "rgba(153, 50, 204, 0.2)", 84: "rgba(153, 50, 204, 0.2)", 85: "rgba(153, 50, 204, 0.2)", 86: "rgba(153, 50, 204, 0.2)",  // Z - Zzz (dark orchid)
                87: "rgba(32, 178, 170, 0.2)", 88: "rgba(32, 178, 170, 0.2)", 89: "rgba(32, 178, 170, 0.2)", 90: "rgba(32, 178, 170, 0.2)",  // O - Octopus (light sea green)
            };
            const color = letterColors[tid] || "rgba(255, 255, 255, 0.2)";

            // Glass box background (same as mushroom/rainbow/chick/sun boxes)
            ctx.fillStyle = color;
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);

            // Glass borders (same as mushroom/rainbow/chick/sun boxes)
            this._renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");

            // Cracks for damaged states (same as mushroom/rainbow/chick/sun boxes)
            this._renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
        } else if (tid === 41) {
            ctx.fillStyle = "#D4AF37";
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.strokeStyle = "#8B6508";
            ctx.lineWidth = 2;
            ctx.beginPath();
            const rowH = ds * 0.5;
            for (let i = 1; i < 4; i++) { ctx.moveTo(-ds, -ds + i * rowH); ctx.lineTo(ds, -ds + i * rowH); }
            for (let i = 0; i < 4; i++) {
                const y1 = -ds + i * rowH, y2 = y1 + rowH;
                if (i % 2 === 0) { ctx.moveTo(0, y1); ctx.lineTo(0, y2); }
                else { ctx.moveTo(-ds * 0.5, y1); ctx.lineTo(-ds * 0.5, y2); ctx.moveTo(ds * 0.5, y1); ctx.lineTo(ds * 0.5, y2); }
            }
            ctx.stroke();
            ctx.strokeStyle = "rgba(255, 255, 200, 0.8)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const y = -ds + i * rowH;
                if (i % 2 === 0) {
                    ctx.moveTo(-ds + 1, y + 1); ctx.lineTo(-1, y + 1); ctx.moveTo(-ds + 1, y + 1); ctx.lineTo(-ds + 1, y + rowH - 1);
                    ctx.moveTo(1, y + 1); ctx.lineTo(ds - 1, y + 1); ctx.moveTo(1, y + 1); ctx.lineTo(1, y + rowH - 1);
                } else {
                    ctx.moveTo(-ds + 1, y + 1); ctx.lineTo(-ds * 0.5 - 1, y + 1); ctx.moveTo(-ds + 1, y + 1); ctx.lineTo(-ds + 1, y + rowH - 1);
                    ctx.moveTo(-ds * 0.5 + 1, y + 1); ctx.lineTo(ds * 0.5 - 1, y + 1); ctx.moveTo(-ds * 0.5 + 1, y + 1); ctx.lineTo(-ds * 0.5 + 1, y + rowH - 1);
                    ctx.moveTo(ds * 0.5 + 1, y + 1); ctx.lineTo(ds - 1, y + 1); ctx.moveTo(ds * 0.5 + 1, y + 1); ctx.lineTo(ds * 0.5 + 1, y + rowH - 1);
                }
            }
            ctx.stroke();
            ctx.strokeStyle = "rgba(184, 134, 11, 0.6)";
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const y2 = -ds + (i + 1) * rowH;
                if (i % 2 === 0) {
                    ctx.moveTo(-ds + 1, y2 - 1); ctx.lineTo(-1, y2 - 1); ctx.moveTo(-1, -ds + i * rowH + 1); ctx.lineTo(-1, y2 - 1);
                    ctx.moveTo(1, y2 - 1); ctx.lineTo(ds - 1, y2 - 1); ctx.moveTo(ds - 1, -ds + i * rowH + 1); ctx.lineTo(ds - 1, y2 - 1);
                } else {
                    ctx.moveTo(-ds + 1, y2 - 1); ctx.lineTo(-ds * 0.5 - 1, y2 - 1); ctx.moveTo(-ds * 0.5 - 1, -ds + i * rowH + 1); ctx.lineTo(-ds * 0.5 - 1, y2 - 1);
                    ctx.moveTo(-ds * 0.5 + 1, y2 - 1); ctx.lineTo(ds * 0.5 - 1, y2 - 1); ctx.moveTo(ds * 0.5 - 1, -ds + i * rowH + 1); ctx.lineTo(ds * 0.5 - 1, y2 - 1);
                    ctx.moveTo(ds * 0.5 + 1, y2 - 1); ctx.lineTo(ds - 1, y2 - 1); ctx.moveTo(ds - 1, -ds + i * rowH + 1); ctx.lineTo(ds - 1, y2 - 1);
                }
            }
            ctx.stroke();
        } else if (tid === 42) {
            ctx.fillStyle = "#2a1f0f";
            ctx.font = `${ds * 0.85}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            for (const [qx, qy] of [[-ds, -ds], [0, -ds], [-ds, 0], [0, 0]]) {
                ctx.fillRect(qx, qy, ds, ds);
                ctx.fillText("🦴", qx + ds * 0.5, qy + ds * 0.5);
            }
        }
    }

    _renderSmallTileStatic(ctx, tid, ds) {
        if (tid >= 15 && tid <= 17) {
            ctx.fillStyle = "rgba(170, 221, 255, 0.4)";
            ctx.fillRect(0, 0, ds, ds);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = Math.max(1, ds * 0.05);
            ctx.strokeRect(1, 1, ds - 2, ds - 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.beginPath();
            ctx.moveTo(ds * 0.1, ds * 0.1); ctx.lineTo(ds * 0.4, ds * 0.1); ctx.lineTo(ds * 0.1, ds * 0.4);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = Math.max(1, ds * 0.04);
            ctx.beginPath();
            if (tid >= 16) {
                ctx.moveTo(ds * 0.5, ds * 0.5); ctx.lineTo(ds * 0.2, ds * 0.2);
                ctx.moveTo(ds * 0.5, ds * 0.5); ctx.lineTo(ds * 0.8, ds * 0.3);
                ctx.moveTo(ds * 0.5, ds * 0.5); ctx.lineTo(ds * 0.4, ds * 0.8);
            }
            if (tid >= 17) {
                ctx.moveTo(ds * 0.5, ds * 0.5); ctx.lineTo(ds * 0.9, ds * 0.8);
                ctx.moveTo(ds * 0.5, ds * 0.5); ctx.lineTo(ds * 0.1, ds * 0.7);
                ctx.moveTo(ds * 0.2, ds * 0.2); ctx.lineTo(ds * 0.4, ds * 0.1);
                ctx.moveTo(ds * 0.4, ds * 0.8); ctx.lineTo(ds * 0.6, ds * 0.9);
            }
            ctx.stroke();
        }
    }

    _drawGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR) {
        let offset, period, midColor, midAlpha;
        if (tid >= 26 && tid <= 28) { offset = 0; period = 2000; midColor = "255,255,255"; midAlpha = 0.6; }
        else if (tid >= 29 && tid <= 31) { offset = 500; period = 2000; midColor = "255,255,255"; midAlpha = 0.6; }
        else if (tid >= 33 && tid <= 35) { offset = 1000; period = 2000; midColor = "255,255,255"; midAlpha = 0.6; }
        else if (tid >= 38 && tid <= 40) { offset = 1500; period = 2000; midColor = "255,255,255"; midAlpha = 0.7; }
        else if (tid >= 44 && tid <= 46) { offset = 2000; period = 2000; midColor = "255,200,0"; midAlpha = 0.5; }
        else if (tid >= 48 && tid <= 50) { offset = 800; period = 2500; midColor = "100,200,255"; midAlpha = 0.5; }
        else return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, ds, ds);
        ctx.clip();
        const centerX = dx + (gridC % 2 === 0 ? ds : 0);
        const centerY = dy + (gridR % 2 === 0 ? ds : 0);
        const cycle = ((Date.now() + offset) % period) / period;
        const shineX = centerX + (cycle * 2.5 - 0.75) * ds * 2 - ds;
        const shineGrad = ctx.createLinearGradient(shineX, centerY - ds, shineX + ds * 0.6, centerY + ds);
        shineGrad.addColorStop(0, `rgba(${midColor},0)`);
        shineGrad.addColorStop(0.5, `rgba(${midColor},${midAlpha})`);
        shineGrad.addColorStop(1, `rgba(${midColor},0)`);
        ctx.fillStyle = shineGrad;
        ctx.fillRect(dx, dy, ds, ds);
        ctx.restore();
    }

    _drawTileDetail(ctx, tid, x, y, sz) {
        const dx = Math.round(x);
        const dy = Math.round(y);
        const ds = Math.round(sz);
        const gridC = Math.round(x / sz);
        const gridR = Math.round(y / sz);

        if (tid >= 100) {
            const tObj = this._tilesMap && this._tilesMap[tid];
            const span = customTileSpanFromTile(tObj);

            ctx.save();
            if (span > 1) {
                const mobileAnchor = this._mobileAnchorMap?.[`${gridR},${gridC}`];
                const { minR, minC } = mobileAnchor ?? (this.state?.grid
                    ? resolveCustomMultiOrigin(this.state.grid, gridR, gridC, tid, span, GRID_H, GRID_W)
                    : {
                        minR: gridR - (gridR % span),
                        minC: gridC - (gridC % span),
                    });
                const centerX = (minC + span / 2) * ds;
                const centerY = (minR + span / 2) * ds;
                ctx.beginPath();
                ctx.rect(dx, dy, ds, ds);
                ctx.clip();
                ctx.translate(centerX, centerY);
                drawCustomTile(ctx, -(span / 2) * ds, -(span / 2) * ds, ds, tid, span);
            } else {
                drawCustomTile(ctx, dx, dy, ds, tid, 1);
            }
            ctx.restore();
            return;
        }

        // Fully static big tiles — blit quadrant directly from cache
        if (tid === 14 || tid === 18 || tid === 23 || tid === 24 || tid === 25 ||
            tid === 32 || tid === 42 || tid === 43 || tid === 47) {
            const cached = this._getCachedBigTile(tid, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
            return;
        }

        // Glass boxes with cached content + animated shine overlay
        if ((tid >= 26 && tid <= 31) || (tid >= 33 && tid <= 35) ||
            (tid >= 44 && tid <= 46) || (tid >= 48 && tid <= 50)) {
            const cached = this._getCachedBigTile(tid, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
            this._drawGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR);
            return;
        }

        // Money glass box — cached base + animated $ + shine
        if (tid >= 38 && tid <= 40) {
            const cached = this._getCachedBigTile(tid, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
            ctx.save();
            ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
            const cX = dx + (gridC % 2 === 0 ? ds : 0);
            const cY = dy + (gridR % 2 === 0 ? ds : 0);
            const cycle = ((Date.now() + 1500) % 2000) / 2000;
            const sX = cX + (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const sg = ctx.createLinearGradient(sX, cY - ds, sX + ds * 0.6, cY + ds);
            sg.addColorStop(0, "rgba(255,255,255,0)");
            sg.addColorStop(0.5, "rgba(255,255,255,0.7)");
            sg.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = sg; ctx.fillRect(dx, dy, ds, ds);
            ctx.translate(cX, cY);
            ctx.save();
            ctx.scale(Math.cos(Date.now() / 300), 1);
            ctx.font = `bold ${ds * 1.5}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = "#FFD700";
            ctx.fillText("$", 0, ds * 0.05);
            ctx.restore();
            ctx.restore();
            return;
        }

        // Special TNT — cached base + animated glow border
        if (tid === 36) {
            const cached = this._getCachedBigTile(36, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
            ctx.save();
            ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
            ctx.translate(dx + (gridC % 2 === 0 ? ds : 0), dy + (gridR % 2 === 0 ? ds : 0));
            const glowAlpha36 = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            for (const [lw, a] of [[ds * 0.30, 0.18], [ds * 0.22, 0.35], [ds * 0.14, 0.65], [ds * 0.08, glowAlpha36]]) {
                ctx.strokeStyle = `rgba(255, 224, 0, ${a})`;
                ctx.lineWidth = lw;
                ctx.strokeRect(-ds + lw / 2, -ds + lw / 2, ds * 2 - lw, ds * 2 - lw);
            }
            ctx.restore();
            return;
        }

        // Golden bricks — cached pattern + animated glint
        if (tid === 41) {
            const cached = this._getCachedBigTile(41, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
            ctx.save();
            ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
            const cX = dx + (gridC % 2 === 0 ? ds : 0);
            const cY = dy + (gridR % 2 === 0 ? ds : 0);
            const cycle = ((Date.now() + x * 2 + y * 2) % 2000) / 2000;
            const sX = cX + (cycle * 2.5 - 0.75) * ds * 2 - ds;
            const sg = ctx.createLinearGradient(sX, cY - ds, sX + ds * 0.6, cY + ds);
            sg.addColorStop(0, "rgba(255,255,255,0)");
            sg.addColorStop(0.5, "rgba(255,255,255,0.6)");
            sg.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = sg; ctx.fillRect(dx, dy, ds, ds);
            ctx.restore();
            return;
        }

        // Letter powerup boxes — glass box + cracks + rotating letter
        if (tid >= 51 && tid <= 90) {
            const state = (tid - 51) % 4;  // 0=pad, 1=crack2, 2=crack1, 3=box

            // Letter mapping
            const letterMap = {
                51: "B", 52: "B", 53: "B", 54: "B",
                55: "C", 56: "C", 57: "C", 58: "C",
                59: "F", 60: "F", 61: "F", 62: "F",
                63: "J", 64: "J", 65: "J", 66: "J",
                67: "R", 68: "R", 69: "R", 70: "R",
                71: "A", 72: "A", 73: "A", 74: "A",
                75: "M", 76: "M", 77: "M", 78: "M",
                79: "S", 80: "S", 81: "S", 82: "S",
                83: "Z", 84: "Z", 85: "Z", 86: "Z",
                87: "O", 88: "O", 89: "O", 90: "O",
            };
            const letter = letterMap[tid] || "?";

            // PAD state (0) - box destroyed, only rotating letter (no glass background)
            if (state === 0) {
                ctx.save();
                ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
                const cX = dx + (gridC % 2 === 0 ? ds : 0);
                const cY = dy + (gridR % 2 === 0 ? ds : 0);

                ctx.translate(cX, cY);
                ctx.save();
                ctx.scale(Math.cos(Date.now() / 300), 1);  // Rotating effect like money tile
                ctx.font = `bold ${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(letter, 0, ds * 0.05);
                ctx.restore();
                ctx.restore();
                return;
            }

            // CRACK2, CRACK1, BOX states (1, 2, 3) - cached glass box + cracks + rotating letter
            const cached = this._getCachedBigTile(tid, ds);
            const sx = gridC % 2 === 0 ? 0 : ds;
            const sy = gridR % 2 === 0 ? 0 : ds;
            ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);

            // Draw rotating letter on top
            ctx.save();
            ctx.beginPath(); ctx.rect(dx, dy, ds, ds); ctx.clip();
            const cX = dx + (gridC % 2 === 0 ? ds : 0);
            const cY = dy + (gridR % 2 === 0 ? ds : 0);

            ctx.translate(cX, cY);
            ctx.save();
            ctx.scale(Math.cos(Date.now() / 300), 1);  // Rotating effect like money tile
            ctx.font = `bold ${ds * 1.5}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(letter, 0, ds * 0.05);
            ctx.restore();
            ctx.restore();
            return;
        }

        // Base and money pad — still need clip/translate (cheap, rare tiles)
        // Base and money pad — still need clip/translate (cheap, rare tiles)
        if (tid === 6 || tid === 37) {
            ctx.save();
            const centerX = dx + (gridC % 2 === 0 ? ds : 0);
            const centerY = dy + (gridR % 2 === 0 ? ds : 0);
            ctx.beginPath();
            if (tid === 6) { ctx.rect(centerX - ds, centerY - ds, ds * 2, ds * 2); }
            else { ctx.rect(dx, dy, ds, ds); }
            ctx.clip();
            ctx.translate(centerX, centerY);
            if (tid === 37) {
                ctx.save();
                ctx.scale(Math.cos(Date.now() / 300), 1);
                ctx.font = `bold ${ds * 1.5}px "Segoe UI", Arial, sans-serif`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillStyle = "#FFD700";
                ctx.fillText("$", 0, ds * 0.05);
                ctx.restore();
            } else {
                this._atlas.draw(ctx, "base.heart.alive", -ds, -ds, ds * 2, ds * 2);
            }
            ctx.restore();
            return;
        }

        // Glass 1×1 tiles — cached
        if (tid >= 15 && tid <= 17) {
            const cached = this._getCachedSmallTile(tid, ds);
            ctx.drawImage(cached, dx, dy);
            return;
        }
        if (tid === 7) {
            drawLavaTile(ctx, dx, dy, ds);
            return;
        }

        // Static big tiles (mushroom, rainbow, chick, money, sun, megagun, letter boxes)

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

        ctx.fillStyle = this._tileColors[tid] || "#000";
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

        if (tank.tank_type === "evil_jaw") {
            const sz = Math.round(CELL * scaleExtra); // scaleExtra is already 2.0 for is_big tanks
            ctx.save();
            ctx.translate(x, drawY);
            // Evil Jaw uses tile 999 image
            drawCustomTile(ctx, -sz / 2, -sz / 2, sz, 999, 1);
            ctx.restore();
            return;
        }

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
            if (dir === "up") ctx.fillRect(-gunW / 2, -gunLen, gunW, gunLen);
            else if (dir === "down") ctx.fillRect(-gunW / 2, 0, gunW, gunLen);
            else if (dir === "left") ctx.fillRect(-gunLen, -gunW / 2, gunLen, gunW);
            else if (dir === "right") ctx.fillRect(0, -gunW / 2, gunLen, gunW);

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
            const hp = tank.hp ?? 3;
            const ms = Date.now();

            // Direction angle for rotating parts
            const dirAngle = dir === "right" ? Math.PI / 2
                : dir === "down" ? Math.PI
                    : dir === "left" ? -Math.PI / 2 : 0;

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
                const bagGrad = ctx.createRadialGradient(bx - sz * 0.03, by - sz * 0.03, sz * 0.01, bx, by, sz * 0.1);
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
            const plateGrad = ctx.createRadialGradient(-sz * 0.08, -sz * 0.08, sz * 0.05, 0, 0, sz * 0.38);
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
            const ringGrad = ctx.createLinearGradient(-sz * 0.18, -sz * 0.18, sz * 0.18, sz * 0.18);
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
                ctx.moveTo(-sz * 0.28, -sz * 0.05); ctx.lineTo(-sz * 0.12, sz * 0.08); ctx.lineTo(-sz * 0.18, sz * 0.2);
                ctx.moveTo(sz * 0.15, -sz * 0.22); ctx.lineTo(sz * 0.05, -sz * 0.08); ctx.lineTo(sz * 0.2, sz * 0.06);
                ctx.stroke();
                // Scorch marks
                ctx.fillStyle = "rgba(0,0,0,0.18)";
                ctx.beginPath(); ctx.arc(-sz * 0.18, sz * 0.1, sz * 0.06, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(sz * 0.1, -sz * 0.18, sz * 0.05, 0, Math.PI * 2); ctx.fill();
            }

            // ── Rotating gun assembly ─────────────────────────────────────────
            ctx.save();
            ctx.rotate(dirAngle);

            // Gun body / turret head — larger, more prominent dome
            const headGrad = ctx.createRadialGradient(-sz * 0.07, -sz * 0.07, sz * 0.02, 0, 0, sz * 0.26);
            headGrad.addColorStop(0, "#90a4ae");
            headGrad.addColorStop(0.5, "#546e7a");
            headGrad.addColorStop(1, "#2e4050");
            ctx.fillStyle = headGrad;
            ctx.beginPath();
            ctx.arc(0, sz * 0.04, sz * 0.24, 0, Math.PI * 2);
            ctx.fill();

            // Outer armor ring on dome
            ctx.strokeStyle = "rgba(144,164,174,0.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, sz * 0.04, sz * 0.24, -Math.PI * 0.9, Math.PI * 0.1);
            ctx.stroke();

            // Vision slit / sensor strip — glowing cyan
            ctx.fillStyle = "rgba(0,0,0,0.75)";
            ctx.fillRect(-sz * 0.13, -sz * 0.02, sz * 0.26, sz * 0.05);
            const scanPulse = (Math.sin(ms / 120) + 1) * 0.5;
            ctx.fillStyle = `rgba(0,220,255,${0.4 + scanPulse * 0.4})`;
            ctx.fillRect(-sz * 0.13, -sz * 0.02, sz * 0.26, sz * 0.05);
            // Tiny scope lens dots
            ctx.fillStyle = `rgba(0,255,255,${0.6 + scanPulse * 0.4})`;
            [-sz * 0.08, 0, sz * 0.08].forEach(ox => {
                ctx.beginPath();
                ctx.arc(ox, sz * 0.005, sz * 0.015, 0, Math.PI * 2);
                ctx.fill();
            });

            // Barrel root / mantlet — wider, more solid
            const mantletGrad = ctx.createLinearGradient(-sz * 0.12, 0, sz * 0.12, 0);
            mantletGrad.addColorStop(0, "#37474f");
            mantletGrad.addColorStop(0.5, "#607d8b");
            mantletGrad.addColorStop(1, "#37474f");
            ctx.fillStyle = mantletGrad;
            ctx.fillRect(-sz * 0.12, -sz * 0.20, sz * 0.24, sz * 0.18);
            // Mantlet bolts
            ctx.fillStyle = "#263238";
            [[-sz * 0.09, -sz * 0.19], [sz * 0.09, -sz * 0.19]].forEach(([bx, by]) => {
                ctx.beginPath(); ctx.arc(bx, by, sz * 0.025, 0, Math.PI * 2); ctx.fill();
            });

            // Barrel — distinctly longer and wider with recoil animation
            const recoilPhase = (ms % 400) / 400;
            const recoilOffset = Math.max(0, Math.sin(recoilPhase * Math.PI) * sz * 0.07);
            const barrelTop = -sz * 0.72 + recoilOffset;
            const barrelLen = sz * 0.52;

            // Barrel shadow (depth)
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(-sz * 0.075 + sz * 0.01, barrelTop + sz * 0.01, sz * 0.15, barrelLen);

            const barrelGrad = ctx.createLinearGradient(-sz * 0.075, 0, sz * 0.075, 0);
            barrelGrad.addColorStop(0, "#1c2b33");
            barrelGrad.addColorStop(0.3, "#607d8b");
            barrelGrad.addColorStop(0.65, "#455a64");
            barrelGrad.addColorStop(1, "#1c2b33");
            ctx.fillStyle = barrelGrad;
            ctx.fillRect(-sz * 0.075, barrelTop, sz * 0.15, barrelLen);

            // Bright highlight stripe on barrel (makes gun clearly visible)
            ctx.fillStyle = "rgba(160,200,220,0.5)";
            ctx.fillRect(-sz * 0.055, barrelTop, sz * 0.03, barrelLen);

            // Barrel ring bands (3 rings for more detail)
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.lineWidth = 2;
            [0.18, 0.32, 0.46].forEach(t => {
                ctx.strokeRect(-sz * 0.075, barrelTop + barrelLen * t, sz * 0.15, sz * 0.03);
            });

            // Muzzle brake — wider, pronounced
            const muzzleGrad = ctx.createLinearGradient(-sz * 0.11, 0, sz * 0.11, 0);
            muzzleGrad.addColorStop(0, "#0d1a20");
            muzzleGrad.addColorStop(0.5, "#455a64");
            muzzleGrad.addColorStop(1, "#0d1a20");
            ctx.fillStyle = muzzleGrad;
            ctx.fillRect(-sz * 0.11, barrelTop - sz * 0.055, sz * 0.22, sz * 0.075);
            // Muzzle vent holes
            ctx.fillStyle = "#060f14";
            ctx.fillRect(-sz * 0.09, barrelTop - sz * 0.048, sz * 0.05, sz * 0.055);
            ctx.fillRect(sz * 0.04, barrelTop - sz * 0.048, sz * 0.05, sz * 0.055);
            // Center bore
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(0, barrelTop - sz * 0.02, sz * 0.025, sz * 0.025, 0, 0, Math.PI * 2);
            ctx.fill();

            // Muzzle flash glow
            const flashAlpha = Math.max(0, Math.sin(recoilPhase * Math.PI) * 0.7);
            if (flashAlpha > 0.05) {
                const flashGrad = ctx.createRadialGradient(0, barrelTop - sz * 0.04, 0, 0, barrelTop - sz * 0.04, sz * 0.18);
                flashGrad.addColorStop(0, `rgba(255,220,80,${flashAlpha})`);
                flashGrad.addColorStop(0.4, `rgba(255,120,20,${flashAlpha * 0.5})`);
                flashGrad.addColorStop(1, "rgba(255,60,0,0)");
                ctx.fillStyle = flashGrad;
                ctx.beginPath();
                ctx.arc(0, barrelTop - sz * 0.04, sz * 0.18, 0, Math.PI * 2);
                ctx.fill();
            }

            // Barrel heat glow (idle shimmer)
            const heatPulse = (Math.sin(ms / 180) + 1) * 0.5;
            const heatGrad = ctx.createLinearGradient(0, barrelTop, 0, barrelTop + barrelLen);
            heatGrad.addColorStop(0, `rgba(255,120,30,0)`);
            heatGrad.addColorStop(0.5, `rgba(255,80,10,${heatPulse * 0.15})`);
            heatGrad.addColorStop(1, `rgba(255,40,0,0)`);
            ctx.fillStyle = heatGrad;
            ctx.fillRect(-sz * 0.075, barrelTop, sz * 0.15, barrelLen);

            ctx.restore(); // end rotating assembly

            // ── Smoke (hp ≤ 1) ────────────────────────────────────────────────
            if (hp <= 1) {
                for (let i = 0; i < 5; i++) {
                    const progress = ((ms / 25 + i * 18) % 60) / 60;
                    const sy = -progress * sz * 0.9 - sz * 0.1;
                    const sx = Math.sin(ms / 250 + i * 1.3) * sz * 0.15 * progress;
                    const r = sz * (0.07 + progress * 0.13);
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
                        const sx = dx + dw / 2 + Math.sin(t / 200 + i) * 10;
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
        if (exp.kind === "grenade") {
            this._drawGrenadeExplosion(ctx, exp, cell);
            return;
        }
        if (exp.kind === "sun_explosion") {
            this._drawSunExplosion(ctx, exp, cell);
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

    _drawGrenadeExplosion(ctx, exp, cell) {
        const maxTicks = 12;
        const elapsed = maxTicks - exp.ticks;
        const progress = elapsed / maxTicks;
        const cx = exp.col * cell;
        const cy = exp.row * cell;
        const maxRadius = (exp.radius ?? 2) * cell;

        ctx.save();

        // Orange flash
        if (progress < 0.3) {
            const flashAlpha = (1 - progress / 0.3) * 0.8;
            const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.5);
            flash.addColorStop(0, `rgba(255,200,50,${flashAlpha})`);
            flash.addColorStop(0.6, `rgba(255,100,0,${flashAlpha * 0.5})`);
            flash.addColorStop(1, `rgba(200,50,0,0)`);
            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(cx, cy, maxRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Expanding fire ring
        const r = progress * maxRadius;
        const alpha = Math.max(0, 1 - progress);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,140,0,${alpha})`;
        ctx.lineWidth = Math.max(1, cell * 0.25 * (1 - progress));
        ctx.stroke();

        // Inner glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8);
        glow.addColorStop(0, `rgba(255,220,100,${alpha * 0.3})`);
        glow.addColorStop(1, `rgba(255,80,0,0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r * 0.8), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawSunExplosion(ctx, exp, cell) {
        const maxTicks = 20;
        const elapsed = maxTicks - exp.ticks;
        const progress = elapsed / maxTicks;
        const cx = exp.col * cell;
        const cy = exp.row * cell;
        const maxRadius = (exp.radius ?? 3) * cell;

        ctx.save();

        // Bright golden-white flash
        if (progress < 0.2) {
            const flashAlpha = (1 - progress / 0.2) * 1.0;
            const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.6);
            flash.addColorStop(0, `rgba(255,255,220,${flashAlpha})`);
            flash.addColorStop(0.4, `rgba(255,200,0,${flashAlpha * 0.7})`);
            flash.addColorStop(1, `rgba(255,100,0,0)`);
            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(cx, cy, maxRadius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Sun rays expanding
        const numRays = 12;
        const rayLen = progress * maxRadius;
        const rayAlpha = Math.max(0, 1 - progress);
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2 + progress * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * rayLen, cy + Math.sin(angle) * rayLen);
            ctx.strokeStyle = `rgba(255,200,0,${rayAlpha * 0.7})`;
            ctx.lineWidth = Math.max(1, cell * 0.15 * (1 - progress));
            ctx.stroke();
        }

        // Expanding golden ring
        const r = progress * maxRadius;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,180,0,${rayAlpha})`;
        ctx.lineWidth = Math.max(1, cell * 0.3 * (1 - progress));
        ctx.stroke();

        ctx.restore();
    }

    _bindInput() { this.gameInput.bind(); }

    _unbindInput() { this.gameInput.unbind(); }

    _sendInput() {
        const dir = this.gameInput.getDirection();
        const fire = this.gameInput.isFiring();

        if (dir !== this._lastInput.direction || fire !== this._lastInput.fire) {
            this._lastInput = { direction: dir, fire };
            this.socket?.sendInput(dir, fire);
        }
    }
}

export const gameRenderer = new GameRenderer();
