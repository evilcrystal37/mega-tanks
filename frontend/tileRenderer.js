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
