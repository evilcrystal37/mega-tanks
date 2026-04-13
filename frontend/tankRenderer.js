export function renderTanks(renderer, ctx, state, cell) {
    if (state.player) renderer._drawTank(ctx, state.player, cell, true);
    if (state.companion) renderer._drawTank(ctx, state.companion, cell, true);
    (state.turrets ?? []).forEach(t => renderer._drawTank(ctx, t, cell, true));
    (state.enemies ?? []).forEach(e => renderer._drawTank(ctx, e, cell, false));
    (state.evil_jaws ?? []).forEach(j => renderer._drawTank(ctx, j, cell, false));
}
