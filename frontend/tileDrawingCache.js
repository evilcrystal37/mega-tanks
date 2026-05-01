/**
 * Offscreen tile painting (shared by editor + game caches).
 */

function renderGlassBoxCracks(ctx, tid, ds, color) {
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

function renderGlassBoxBorders(ctx, ds, borderColor, topColor, bottomColor) {
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

export function renderBigTileStatic(ctx, tid, ds) {
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
        renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
        ctx.fillStyle = "#f5f5dc";
        ctx.fillRect(-ds * 0.12, ds * 0.1, ds * 0.24, ds * 0.5);
        ctx.fillStyle = "#e52521";
        ctx.beginPath(); ctx.arc(0, ds * 0.1, ds * 0.5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(-ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ds * 0.25, -ds * 0.1, ds * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -ds * 0.35, ds * 0.12, 0, Math.PI * 2); ctx.fill();
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 29 && tid <= 31) {
        ctx.fillStyle = "rgba(255, 105, 180, 0.2)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
        ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🌈", 0, ds * 0.05);
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 33 && tid <= 35) {
        ctx.fillStyle = "rgba(255, 238, 88, 0.2)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");
        ctx.font = `${ds * 1.2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🐥", 0, ds * 0.05);
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 38 && tid <= 40) {
        ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.6)", "rgba(255,255,255,0.9)", "rgba(0,0,0,0.4)");
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
    } else if (tid >= 44 && tid <= 46) {
        ctx.fillStyle = "rgba(255, 140, 0, 0.25)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        renderGlassBoxBorders(ctx, ds, "rgba(255,200,0,0.6)", "rgba(255,255,200,0.9)", "rgba(180,80,0,0.4)");
        ctx.font = `${ds * 1.4}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("☀️", 0, 0);
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,200,0.9)");
    } else if (tid >= 48 && tid <= 50) {
        ctx.fillStyle = "rgba(50, 50, 60, 0.4)";
        ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
        renderGlassBoxBorders(ctx, ds, "rgba(120,180,255,0.5)", "rgba(200,200,220,0.8)", "rgba(0,0,20,0.5)");
        ctx.font = `${ds * 1.3}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🔫", 0, ds * 0.05);
        renderGlassBoxCracks(ctx, tid, ds, "rgba(150,200,255,0.9)");
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
        renderGlassBoxBorders(ctx, ds, "rgba(255,255,255,0.5)", "rgba(255,255,255,0.8)", "rgba(0,0,0,0.3)");

        // Cracks for damaged states (same as mushroom/rainbow/chick/sun boxes)
        renderGlassBoxCracks(ctx, tid, ds, "rgba(255,255,255,0.9)");
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

export function renderSmallTileStatic(ctx, tid, ds) {
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

export function drawGlassBoxShine(ctx, tid, dx, dy, ds, gridC, gridR) {
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

function createOffscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

export function getOrBuildBigTile(tileCache, tid, ds) {
    const key = `${tid}_${ds}`;
    let cached = tileCache.get(key);
    if (cached) return cached;
    const size = ds * 2;
    const canvas = createOffscreen(size, size);
    const octx = canvas.getContext("2d");
    octx.imageSmoothingEnabled = false;
    octx.translate(ds, ds);
    renderBigTileStatic(octx, tid, ds);
    tileCache.set(key, canvas);
    return canvas;
}

export function getOrBuildSmallTile(tileCache, tid, ds) {
    const key = `s_${tid}_${ds}`;
    let cached = tileCache.get(key);
    if (cached) return cached;
    const canvas = createOffscreen(ds, ds);
    const octx = canvas.getContext("2d");
    octx.imageSmoothingEnabled = false;
    renderSmallTileStatic(octx, tid, ds);
    tileCache.set(key, canvas);
    return canvas;
}

/** Build a TileDrawBag for the map editor (shared caches + atlas). */
export function createEditorTileDrawBag(atlas, tileCache, getTiles, getGrid) {
    const tileColors = {};
    const tilesMap = () => {
        const tiles = getTiles();
        const m = {};
        for (const t of tiles) m[t.id] = t;
        return m;
    };
    return {
        get atlas() {
            return atlas;
        },
        get tileColors() {
            const tiles = getTiles();
            for (const t of tiles) tileColors[t.id] = t.color;
            return tileColors;
        },
        get tilesMap() {
            return tilesMap();
        },
        get grid() {
            return getGrid();
        },
        mobileAnchorMap: null,
        getCachedBigTile: (tid, ds) => getOrBuildBigTile(tileCache, tid, ds),
        getCachedSmallTile: (tid, ds) => getOrBuildSmallTile(tileCache, tid, ds),
        drawGlassBoxShine,
    };
}
