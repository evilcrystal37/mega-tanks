export function renderBullets(ctx, state, cell) {
    (state.bullets ?? []).forEach(b => {
        const x = b.col * cell;
        const y = b.row * cell;

        if (b.is_missile) {
            // Sun missile — glowing orange fireball with trailing glow
            ctx.save();
            const sz = Math.max(6, cell * 0.5);
            const grad = ctx.createRadialGradient(x, y, 0, x, y, sz);
            grad.addColorStop(0, "rgba(255,255,200,1)");
            grad.addColorStop(0.3, "rgba(255,180,0,0.9)");
            grad.addColorStop(0.7, "rgba(255,80,0,0.5)");
            grad.addColorStop(1, "rgba(255,40,0,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, sz, 0, Math.PI * 2);
            ctx.fill();

            // Pulsing core
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 80);
            ctx.fillStyle = `rgba(255,255,220,${pulse})`;
            ctx.beginPath();
            ctx.arc(x, y, sz * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (b.is_grenade) {
            // Grenade — bomb emoji with glow
            ctx.save();
            const sz = Math.max(8, cell * 0.5);
            const glowPulse = 0.5 + 0.3 * Math.sin(Date.now() / 100);
            ctx.shadowColor = `rgba(255,80,0,${glowPulse})`;
            ctx.shadowBlur = sz * 0.6;
            ctx.font = `${sz * 1.6}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("💣", x, y);
            ctx.restore();
            return;
        }

        ctx.fillStyle = b.is_player ? "#ffffff" : "#ff4444";
        const sz = b.crush_bricks ? Math.max(4, cell * 0.4) : Math.max(2, cell * 0.18);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    });
}

export function renderExplosions(renderer, ctx, state, cell) {
    (state.explosions ?? []).forEach(exp => renderer._drawExplosion(ctx, exp, cell));
}
