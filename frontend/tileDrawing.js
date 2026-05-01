/**
 * Shared map tile drawing (editor + in-game). Uses a context bag for caches/atlas.
 */
import { GRID_H, GRID_W } from "./constants.js";
import { drawGlassBoxShine } from "./tileDrawingCache.js";
import { drawSandTile, drawLavaTile, drawCustomTile, customTileSpanFromTile, resolveCustomMultiOrigin } from "./tileRenderer.js";

function _drawSandTile(ctx, dx, dy, ds) { drawSandTile(ctx, dx, dy, ds); }

/**
 * @typedef {object} TileDrawBag
 * @property {import("./spriteAtlas.js").SpriteAtlas} atlas
 * @property {Record<number,string>|{[k:number]:string}} tileColors
 * @property {Record<number, object>|null} tilesMap
 * @property {number[][]|null} grid
 * @property {Record<string, {minR:number, minC:number}>|null|undefined} mobileAnchorMap
 * @property {(tid:number, ds:number) => HTMLCanvasElement|OffscreenCanvas} getCachedBigTile
 * @property {(tid:number, ds:number) => HTMLCanvasElement|OffscreenCanvas} getCachedSmallTile
 * @property {(ctx:CanvasRenderingContext2D, tid:number, dx:number, dy:number, ds:number, gridC:number, gridR:number) => void} drawGlassBoxShine
 */

/** Bag wired to GameRenderer (grid/tiles read live each frame). */
export function createPlayDrawBag(renderer) {
    const self = renderer;
    return {
        get atlas() {
            return self._atlas;
        },
        get tileColors() {
            return self._tileColors;
        },
        get tilesMap() {
            return self._tilesMap;
        },
        get grid() {
            return self.state?.grid ?? null;
        },
        get mobileAnchorMap() {
            return self._mobileAnchorMap;
        },
        getCachedBigTile: (tid, ds) => self._getCachedBigTile(tid, ds),
        getCachedSmallTile: (tid, ds) => self._getCachedSmallTile(tid, ds),
        drawGlassBoxShine,
    };
}

export function drawTileCell(ctx, bag, tid, x, y, sz) {
    const dx = Math.round(x);
    const dy = Math.round(y);
    const ds = Math.round(sz);
    const gridC = Math.round(x / sz);
    const gridR = Math.round(y / sz);

    if (tid >= 100) {
        const tObj = bag.tilesMap && bag.tilesMap[tid];
        const span = customTileSpanFromTile(tObj);

        ctx.save();
        if (span > 1) {
            const mobileAnchor = bag.mobileAnchorMap?.[`${gridR},${gridC}`];
            const { minR, minC } = mobileAnchor ?? (bag.grid
                ? resolveCustomMultiOrigin(bag.grid, gridR, gridC, tid, span, GRID_H, GRID_W)
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
        const cached = bag.getCachedBigTile(tid, ds);
        const sx = gridC % 2 === 0 ? 0 : ds;
        const sy = gridR % 2 === 0 ? 0 : ds;
        ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
        return;
    }

    // Glass boxes with cached content + animated shine overlay
    if ((tid >= 26 && tid <= 31) || (tid >= 33 && tid <= 35) ||
        (tid >= 44 && tid <= 46) || (tid >= 48 && tid <= 50)) {
        const cached = bag.getCachedBigTile(tid, ds);
        const sx = gridC % 2 === 0 ? 0 : ds;
        const sy = gridR % 2 === 0 ? 0 : ds;
        ctx.drawImage(cached, sx, sy, ds, ds, dx, dy, ds, ds);
        bag.drawGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR);
        return;
    }

    // Money glass box — cached base + animated $ + shine
    if (tid >= 38 && tid <= 40) {
        const cached = bag.getCachedBigTile(tid, ds);
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
        const cached = bag.getCachedBigTile(36, ds);
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
        const cached = bag.getCachedBigTile(41, ds);
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
        const tLetter = bag.tilesMap && bag.tilesMap[tid];
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
        const letter = (tLetter && tLetter.display_glyph) || letterMap[tid] || "?";

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
        const cached = bag.getCachedBigTile(tid, ds);
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
            bag.atlas.draw(ctx, "base.heart.alive", -ds, -ds, ds * 2, ds * 2);
        }
        ctx.restore();
        return;
    }

    // Glass 1×1 tiles — cached
    if (tid >= 15 && tid <= 17) {
        const cached = bag.getCachedSmallTile(tid, ds);
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
        bag.atlas.draw(ctx, "terrain.brick.1", dx, dy, half, half);
        bag.atlas.draw(ctx, "terrain.brick.2", dx + half, dy, ds - half, half);
        bag.atlas.draw(ctx, "terrain.brick.2", dx, dy + half, half, ds - half);
        bag.atlas.draw(ctx, "terrain.brick.1", dx + half, dy + half, ds - half, ds - half);
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

    if (spriteId && bag.atlas.draw(ctx, spriteId, dx, dy, ds, ds)) {
        return;
    }

    ctx.fillStyle = bag.tileColors[tid] || "#000";
    ctx.fillRect(dx, dy, ds, ds);
}
