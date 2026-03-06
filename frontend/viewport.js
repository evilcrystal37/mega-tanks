export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function getCellZoom(settingsKey = "battle_tanks_settings", fallback = 2.0) {
    try {
        const raw = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
        const z = parseFloat(raw?.cell_zoom ?? fallback);
        return Number.isFinite(z) ? z : fallback;
    } catch {
        return fallback;
    }
}

export function resizeCanvas(canvas, gridW, gridH, zoom, fallbackW = 800, fallbackH = 600) {
    const wrap = canvas.parentElement;
    const maxW = Math.max(1, wrap?.clientWidth ?? fallbackW);
    const maxH = Math.max(1, wrap?.clientHeight ?? fallbackH);
    const naturalCell = Math.min(maxW / gridW, maxH / gridH);
    const cell = Math.max(1, Math.round(naturalCell * zoom));
    // Canvas always fills its container; zoom only changes cell size (fewer tiles visible at higher zoom).
    return { cell, width: maxW, height: maxH };
}

export function computeViewport(focusRow, focusCol, canvasW, canvasH, cellSize, gridW, gridH) {
    const visW = canvasW / cellSize;
    const visH = canvasH / cellSize;
    const vpLeft = visW >= gridW ? (gridW - visW) / 2 : clamp(focusCol - visW / 2, 0, gridW - visW);
    const vpTop = visH >= gridH ? (gridH - visH) / 2 : clamp(focusRow - visH / 2, 0, gridH - visH);
    const startC = Math.max(0, Math.floor(vpLeft));
    const endC = Math.min(gridW - 1, Math.ceil(vpLeft + visW));
    const startR = Math.max(0, Math.floor(vpTop));
    const endR = Math.min(gridH - 1, Math.ceil(vpTop + visH));
    return { visW, visH, vpLeft, vpTop, startC, endC, startR, endR };
}
