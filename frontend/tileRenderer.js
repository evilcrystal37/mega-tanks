/**
 * Shared tile rendering helpers used by editor and game.
 */

const sandTileCache = new Map();

export function drawSandTile(ctx, dx, dy, ds) {
    let canvas = sandTileCache.get(ds);
    if (!canvas) {
        if (typeof OffscreenCanvas !== 'undefined') {
            canvas = new OffscreenCanvas(ds, ds);
        } else {
            canvas = document.createElement('canvas');
            canvas.width = ds;
            canvas.height = ds;
        }
        const octx = canvas.getContext('2d');

        octx.save();
        octx.beginPath();
        octx.rect(0, 0, ds, ds);
        octx.clip();

        // Warm sandy base
        octx.fillStyle = "#d4bc8e";
        octx.fillRect(0, 0, ds, ds);

        // Rotate canvas ~32° around tile centre to produce diagonal waves
        const cx = ds / 2;
        const cy = ds / 2;
        octx.translate(cx, cy);
        octx.rotate(-0.56);
        octx.translate(-cx, -cy);

        const numBands = 7;
        const bandH = ds * 1.8 / numBands;
        const origin = -ds * 0.4;
        const left = -ds * 0.4;
        const right = ds * 1.4;
        const steps = Math.max(8, Math.ceil(ds * 1.8));

        for (let i = 0; i < numBands + 1; i++) {
            const y0 = origin + i * bandH;
            const wave = (x, yBase) =>
                yBase + Math.sin(((x - left) / (right - left)) * Math.PI * 2.5) * bandH * 0.18;

            octx.fillStyle = "rgba(168,130,72,0.38)";
            octx.beginPath();
            octx.moveTo(left, wave(left, y0));
            for (let s = 1; s <= steps; s++) {
                const x = left + (s / steps) * (right - left);
                octx.lineTo(x, wave(x, y0));
            }
            for (let s = steps; s >= 0; s--) {
                const x = left + (s / steps) * (right - left);
                octx.lineTo(x, wave(x, y0) + bandH * 0.42);
            }
            octx.closePath();
            octx.fill();

            octx.fillStyle = "rgba(255,242,200,0.22)";
            octx.beginPath();
            octx.moveTo(left, wave(left, y0) + bandH * 0.42);
            for (let s = 1; s <= steps; s++) {
                const x = left + (s / steps) * (right - left);
                octx.lineTo(x, wave(x, y0) + bandH * 0.42);
            }
            for (let s = steps; s >= 0; s--) {
                const x = left + (s / steps) * (right - left);
                octx.lineTo(x, wave(x, y0) + bandH * 0.78);
            }
            octx.closePath();
            octx.fill();
        }

        octx.restore();
        sandTileCache.set(ds, canvas);
    }

    ctx.drawImage(canvas, dx, dy);
}

const lavaTileCache = new Map();

export function drawLavaTile(ctx, dx, dy, ds) {
    let cache = lavaTileCache.get(ds);
    if (!cache) {
        let canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ds, ds) : document.createElement('canvas');
        if (!canvas.getContext) { canvas.width = ds; canvas.height = ds; }
        const octx = canvas.getContext('2d');
        
        const plates = [
            [0.22, 0.22, 0.21, 0.0],
            [0.68, 0.18, 0.20, 0.8],
            [0.88, 0.60, 0.18, 1.7],
            [0.14, 0.64, 0.19, 2.4],
            [0.50, 0.55, 0.23, 0.4],
            [0.40, 0.88, 0.17, 1.1],
            [0.78, 0.84, 0.16, 2.9],
        ];

        plates.forEach(([bx, by, br, rot]) => {
            const cx = bx * ds;
            const cy = by * ds;
            const r  = br * ds * 0.92;

            const sides = 8;
            octx.beginPath();
            for (let i = 0; i <= sides; i++) {
                const a = (i / sides) * Math.PI * 2 + rot;
                const v = 0.72 + 0.28 * Math.sin(i * 2.7 + rot * 3.1);
                const pr = r * v;
                if (i === 0) octx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
                else         octx.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
            }
            octx.closePath();

            const pg = octx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, r * 0.04, cx, cy, r);
            pg.addColorStop(0,   "#8c1500");
            pg.addColorStop(0.5, "#660b00");
            pg.addColorStop(0.82,"#420500");
            pg.addColorStop(1,   "#220100");
            octx.fillStyle = pg;
            octx.fill();
        });
        
        let glowCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ds, ds) : document.createElement('canvas');
        if (!glowCanvas.getContext) { glowCanvas.width = ds; glowCanvas.height = ds; }
        const gctx = glowCanvas.getContext('2d');
        plates.forEach(([bx, by, br]) => {
            const cx = bx * ds;
            const cy = by * ds;
            const r  = br * ds * 0.92;
            const eg = gctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
            eg.addColorStop(0, "rgba(180,30,0,0)");
            eg.addColorStop(1, `rgba(255,120,0,0.18)`);
            gctx.fillStyle = eg;
            gctx.beginPath(); gctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); gctx.fill();
        });

        cache = { plates: canvas, glow: glowCanvas };
        lavaTileCache.set(ds, cache);
    }

    const t = Date.now() / 1200;
    const glow = (Math.sin(t * 1.8) + 1) / 2;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, ds, ds);
    ctx.clip();
    
    ctx.fillStyle = `rgb(${Math.round(200 + glow * 55)},${Math.round(35 + glow * 35)},0)`;
    ctx.fillRect(dx, dy, ds, ds);
    
    ctx.drawImage(cache.plates, dx, dy);
    
    ctx.globalAlpha = 0.5 + glow * 0.5;
    ctx.drawImage(cache.glow, dx, dy);
    ctx.restore();
}

export function drawTreeTile(ctx, dx, dy, ds) {
    const t = Date.now() / 800;
    const sway = Math.sin(t + dx * 0.01 + dy * 0.01) * (ds * 0.05);

    ctx.save();
    ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(dx + ds / 2 + sway, dy + ds / 2);
    ctx.fillText("🌳", 0, 0);
    ctx.restore();
}

export function drawAppleTile(ctx, dx, dy, ds) {
    const t = Date.now() / 400;
    const hover = Math.sin(t) * ds * 0.08;

    ctx.save();
    // Render at 1.8x size since it's a big tile
    ctx.font = `${ds * 1.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(dx + ds / 2, dy + ds / 2 + hover);
    ctx.fillText("🍎", 0, 0);
    ctx.restore();
}

export function drawAntPileTile(ctx, dx, dy, ds, isFriendly, appleCount = 0) {
    const t = Date.now() / 1000;
    const pulse = 1 + Math.sin(t) * 0.05;
    
    // Growth factor: 2x size at 1 apple, 3x at 3, 4x at 6, 5x at 12 (max)
    let growth = 1.0;
    if (appleCount >= 12) growth = 5.0;
    else if (appleCount >= 6) growth = 4.0;
    else if (appleCount >= 3) growth = 3.0;
    else if (appleCount >= 1) growth = 2.0;

    ctx.save();

    // Warm amber glow behind the pile that grows with apple count
    const glowRadius = ds * growth * 0.6;
    const glowAlpha = 0.15 + Math.sin(t * 2) * 0.05;
    const glow = ctx.createRadialGradient(
        dx + ds / 2, dy + ds / 2, glowRadius * 0.2,
        dx + ds / 2, dy + ds / 2, glowRadius
    );
    glow.addColorStop(0, `rgba(255, 180, 50, ${glowAlpha})`);
    glow.addColorStop(1, "rgba(255, 120, 20, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(dx + ds / 2, dy + ds / 2, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Base font is ds, but scaled by growth
    ctx.font = `${ds * growth * pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(dx + ds / 2, dy + ds / 2);
    ctx.fillText("🏰", 0, 0);
    
    // Ant icon orbiting the pile
    const orbitAngle = t * 1.5;
    const orbitR = ds * 0.35 * growth;
    ctx.font = `${ds * 0.5 * pulse}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText("🐜", Math.cos(orbitAngle) * orbitR, Math.sin(orbitAngle) * orbitR);

    // Apple count badge if > 0
    if (appleCount > 0) {
        ctx.font = `bold ${ds * 0.35}px "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = "#FFD700";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        const badgeX = ds * 0.3 * growth;
        const badgeY = -ds * 0.3 * growth;
        ctx.strokeText(`×${appleCount}`, badgeX, badgeY);
        ctx.fillText(`×${appleCount}`, badgeX, badgeY);
    }

    ctx.restore();
}

const customTileCache = new Map();

export function clearCustomTileCache(tid) {
    customTileCache.delete(tid);
}

const _ORTH4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * 4-connected cells with the same tile id (for anchoring multi-cell custom sprites).
 */
export function findSameTileComponent(grid, r, c, tid, gridH, gridW) {
    if (r < 0 || r >= gridH || c < 0 || c >= gridW) return [];
    if ((grid[r]?.[c]) !== tid) return [];
    const out = [];
    const q = [[r, c]];
    const seen = new Set([`${r},${c}`]);
    while (q.length) {
        const [cr, cc] = q.shift();
        out.push([cr, cc]);
        for (const [dr, dc] of _ORTH4) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr < 0 || nr >= gridH || nc < 0 || nc >= gridW) continue;
            const k = `${nr},${nc}`;
            if (seen.has(k)) continue;
            if ((grid[nr]?.[nc]) !== tid) continue;
            seen.add(k);
            q.push([nr, nc]);
        }
    }
    return out;
}

/**
 * Top-left (min row/col) of a solid span×span block of `tid` containing (r,c), or null.
 * When null, callers should use the legacy global span-aligned snap (editor-aligned blocks).
 */
export function customMultiTileAnchor(grid, r, c, tid, span, gridH, gridW) {
    if (span <= 1) return { minR: r, minC: c };
    if (!grid || !grid.length) return null;
    const comp = findSameTileComponent(grid, r, c, tid, gridH, gridW);
    if (comp.length !== span * span) return null;
    let minR = gridH;
    let minC = gridW;
    let maxR = -1;
    let maxC = -1;
    for (const [cr, cc] of comp) {
        if (cr < minR) minR = cr;
        if (cc < minC) minC = cc;
        if (cr > maxR) maxR = cr;
        if (cc > maxC) maxC = cc;
    }
    if (maxR - minR + 1 !== span || maxC - minC + 1 !== span) return null;
    return { minR, minC };
}

/**
 * Shared top-left for a multi-cell custom sprite at (r,c): prefer solid span×span block,
 * else fall back to grid-aligned snap.
 *
 * The connected-component bbox approach was dropped because adjacent same-tid blocks merge
 * into one large component, causing every cell to reference the first block's center — making
 * subsequent blocks invisible inside their clip rects.  Editor placement always snaps to
 * span-aligned grid positions (via _snapCursorToBrush), so grid-aligned snapping is always
 * the correct fallback.
 */
export function resolveCustomMultiOrigin(grid, r, c, tid, span, gridH, gridW) {
    if (span <= 1) return { minR: r, minC: c };
    const solid = customMultiTileAnchor(grid, r, c, tid, span, gridH, gridW);
    if (solid) return solid;
    return {
        minR: r - (r % span),
        minC: c - (c % span),
    };
}

/** Grid footprint for custom tiles: 1×1, 2×2 (`non_repeating`), or 4×4 (`extra_big`). */
export function customTileSpanFromTile(tObj) {
    if (!tObj) return 1;
    if (tObj.extra_big) return 4;
    if (tObj.non_repeating) return 2;
    return 1;
}

/**
 * Draw a custom tile sprite. `ds` is one grid cell size in pixels; `span` is 1, 2, or 4
 * (sprite covers span×span cells). Nearest-neighbor only — no interpolation (lossless mapping).
 */
export function drawCustomTile(ctx, dx, dy, ds, tid, span = 1) {
    let img = customTileCache.get(tid);
    
    if (img === undefined) {
        // First request for this tile
        img = new Image();
        img.src = `assets/custom_tiles/tile_${tid}.png?t=${Date.now()}`;
        img.onload = () => {
            img._loaded = true;
        };
        img.onerror = () => {
             img._failed = true;
        };
        customTileCache.set(tid, img);
    }

    if (img._loaded) {
        ctx.imageSmoothingEnabled = false;
        if (ctx.imageSmoothingQuality !== undefined) {
            ctx.imageSmoothingQuality = "low";
        }
        const frameSize = img.height;
        let sourceX = 0;
        
        // If width > height, it's an animation strip (horizontal)
        if (img.width > frameSize) {
            const frameCount = Math.floor(img.width / frameSize);
            const frameDuration = 200; // ms per frame
            const currentFrame = Math.floor(Date.now() / frameDuration) % frameCount;
            sourceX = currentFrame * frameSize;
        }
        
        const dest = ds * span;
        ctx.drawImage(img, sourceX, 0, frameSize, frameSize, dx, dy, dest, dest);
    } else if (!img._failed) {
        // Fallback loading state
        ctx.fillStyle = "rgba(255, 0, 255, 0.5)"; // Magenta placeholder for loading custom tiles
        const dest = ds * span;
        ctx.fillRect(dx, dy, dest, dest);
    } else {
         // Fallback failed state
        ctx.fillStyle = "#ff00ff";
        const dest = ds * span;
        ctx.fillRect(dx, dy, dest, dest);
    }
}
