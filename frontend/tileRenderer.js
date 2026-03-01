/**
 * Shared tile rendering helpers used by editor and game.
 */

export function drawSandTile(ctx, dx, dy, ds) {
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
    ctx.rotate(-0.56);
    ctx.translate(-cx, -cy);

    const numBands = 7;
    const bandH = ds * 1.8 / numBands;
    const origin = dy - ds * 0.4;
    const left = dx - ds * 0.4;
    const right = dx + ds * 1.4;
    const steps = Math.max(8, Math.ceil(ds * 1.8));

    for (let i = 0; i < numBands + 1; i++) {
        const y0 = origin + i * bandH;
        const wave = (x, yBase) =>
            yBase + Math.sin(((x - left) / (right - left)) * Math.PI * 2.5) * bandH * 0.18;

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
