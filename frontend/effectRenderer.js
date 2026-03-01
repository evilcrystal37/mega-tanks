export function renderBullets(ctx, state, cell) {
    (state.bullets ?? []).forEach(b => {
        const x = b.col * cell;
        const y = b.row * cell;
        ctx.fillStyle = b.is_player ? "#ffffff" : "#ff4444";
        const sz = b.crush_bricks ? Math.max(4, cell * 0.4) : Math.max(2, cell * 0.18);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    });
}

export function renderExplosions(renderer, ctx, state, cell) {
    (state.explosions ?? []).forEach(exp => renderer._drawExplosion(ctx, exp, cell));
}
