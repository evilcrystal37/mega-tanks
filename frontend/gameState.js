export class GameStateStore {
    constructor() {
        this._state = null;
        this._gridCache = null;
        this._explosions = [];
    }

    reset() {
        this._state = null;
        this._gridCache = null;
        this._explosions = [];
    }

    get state() {
        return this._state;
    }

    get explosions() {
        return this._explosions;
    }

    apply(rawState) {
        const prev = this._state;
        if (Array.isArray(rawState.grid)) {
            this._gridCache = rawState.grid.map(row => row.slice());
        } else if (this._gridCache && Array.isArray(rawState.grid_changes)) {
            rawState.grid_changes.forEach(({ r, c, tid }) => {
                if (this._gridCache[r]) this._gridCache[r][c] = tid;
            });
            rawState.grid = this._gridCache;
        }

        if (prev) {
            const prevAlive = new Set([...(prev.enemies ?? []), prev.player].filter(Boolean).map(t => t.id));
            const nowDead = [...(rawState.enemies ?? []), rawState.player].filter(t => t && !t.alive && prevAlive.has(t.id));
            nowDead.forEach(t => this._explosions.push({ x: t.col, y: t.row, t: 0, max: 20 }));
        }

        this._state = rawState;
        return { prev, state: rawState };
    }
}
