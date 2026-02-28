/**
 * hud.js — NES Battle City HUD
 */

export class Hud {
    constructor() {
        this._score = document.getElementById("hud-score");
        this._lives = document.getElementById("hud-lives");
        this._enemies = document.getElementById("hud-enemies");
        this._upgrade = document.getElementById("hud-upgrade");
        this._mapName = document.getElementById("hud-map-name");
        this._mapNameTop = document.getElementById("hud-map-name-top"); // Top status bar

        this._overlay = document.getElementById("game-overlay");
        this._oTitle = document.getElementById("overlay-title");
        this._oScore = document.getElementById("overlay-score");

        this._totalEnemies = 20;
    }

    setMapName(name) {
        const text = name || "BATTLE FIELD";
        if (this._mapName) this._mapName.textContent = text;
        if (this._mapNameTop) this._mapNameTop.textContent = text;
    }

    update(state) {
        // Score (padded to 6 digits)
        if (this._score) {
            this._score.textContent = String(state.score ?? 0).padStart(6, "0");
        }

        // Lives (tank symbols)
        if (this._lives) {
            const lives = Math.max(0, state.lives ?? 0);
            this._lives.innerHTML = Array.from({ length: lives }, () =>
                `<span class="nes-life-icon">🛡️</span>`
            ).join("");
        }

        // Enemy dots
        if (this._enemies) {
            this._totalEnemies = state.total_enemies ?? 20;
            const remaining = state.enemies_remaining ?? 0;
            const killed = this._totalEnemies - remaining;
            this._enemies.innerHTML = Array.from({ length: this._totalEnemies }, (_, i) =>
                `<div class="enemy-dot ${i < killed ? "dead" : ""}"></div>`
            ).join("");
        }

        // Upgrade stars
        if (this._upgrade && state.player) {
            const lvl = state.player.upgrade_level ?? 0;
            this._upgrade.innerHTML = Array.from({ length: 3 }, (_, i) =>
                `<span class="${i < lvl ? 'star-on' : 'star-off'}">★</span>`
            ).join("");
        }


    }

    showOverlay(result, score) {
        if (!this._overlay) return;
        this._oTitle.textContent = result === "victory" ? "VICTORY" : "GAME OVER";
        this._oTitle.style.color = result === "victory" ? "#f8d818" : "#d01010";
        this._oScore.textContent = `SCORE: ${String(score ?? 0).padStart(6, "0")}`;
        this._overlay.style.display = "flex";
    }

    hideOverlay() {
        if (this._overlay) this._overlay.style.display = "none";
    }

    reset() {
        this.hideOverlay();
        this.update({ score: 0, lives: 3, enemies_remaining: 20, total_enemies: 20, player: null });
    }
}
