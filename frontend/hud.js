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

        this._overlay = document.getElementById("game-overlay");
        this._oTitle = document.getElementById("overlay-title");
        this._oScore = document.getElementById("overlay-score");

        this._companionSection = document.getElementById("hud-companion-section");
        this._companionTimer   = document.getElementById("hud-companion-timer");
        this._companionBarFill = document.getElementById("hud-companion-bar-fill");
        this._companionMaxTicks = 1800; // track max seen for bar scaling

        this._skeletonSection  = document.getElementById("hud-skeleton-section");
        this._skeletonKills    = document.getElementById("hud-skeleton-kills");
        this._skeletonBarFill  = document.getElementById("hud-skeleton-bar-fill");
        this._skeletonBanner   = document.getElementById("skeleton-banner");
        this._skeletonBannerText = document.getElementById("skeleton-banner-text");
        this._skeletonBannerTimer = null;
        this._lastSkeletonKills = 0;
        this._lastMegaAlive = false;
        this._lastBoneArch = false;

        this._totalEnemies = 20;
    }

    setMapName(name) {
        const text = name || "BATTLE FIELD";
        if (this._mapName) this._mapName.textContent = text;
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

        // Companion lifetime timer
        const ticks = state.companion_ticks ?? 0;
        const hasCompanion = ticks > 0 && state.companion;
        if (this._companionSection) {
            this._companionSection.style.display = hasCompanion ? "block" : "none";
        }
        if (hasCompanion && this._companionTimer) {
            if (ticks > this._companionMaxTicks) this._companionMaxTicks = ticks;
            const totalSec = Math.ceil(ticks / 60);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            this._companionTimer.textContent = `${m}:${String(s).padStart(2, "0")}`;
            // Pulse red when < 5 seconds
            this._companionTimer.style.color = ticks < 300 ? (Math.floor(Date.now() / 300) % 2 === 0 ? "#ff4444" : "#ffee58") : "#ffee58";
            if (this._companionBarFill) {
                const pct = Math.round((ticks / this._companionMaxTicks) * 100);
                this._companionBarFill.style.width = `${pct}%`;
                this._companionBarFill.style.background = ticks < 300 ? "#ff4444" : "#ffee58";
            }
        }

        // Skeleton counter
        const skelKills = state.skeleton_kills ?? 0;
        const megaAlive = !!(state.mega_skeleton && state.mega_skeleton.alive);
        const boneArch  = !!(state.bone_arch_active);
        const skelActive = skelKills > 0 || (state.skeletons && state.skeletons.length > 0) || megaAlive || boneArch;

        if (this._skeletonSection) {
            this._skeletonSection.style.display = skelActive ? "block" : "none";
        }
        if (skelActive) {
            if (this._skeletonKills) {
                if (megaAlive) {
                    this._skeletonKills.textContent = "BOSS!";
                    this._skeletonKills.style.color = "#ff4444";
                } else if (boneArch) {
                    this._skeletonKills.textContent = "5/5 ✓";
                    this._skeletonKills.style.color = "#EFEED0";
                } else {
                    this._skeletonKills.textContent = `${skelKills}/5`;
                    this._skeletonKills.style.color = "#EFEED0";
                }
            }
            if (this._skeletonBarFill) {
                const pct = Math.min(100, Math.round((skelKills / 5) * 100));
                this._skeletonBarFill.style.width = `${pct}%`;
                this._skeletonBarFill.style.background = megaAlive ? "#ff4444" : boneArch ? "#E8D44D" : "#EFEED0";
            }
        }

        // Skeleton event banners
        if (skelKills === 5 && this._lastSkeletonKills < 5 && !this._lastMegaAlive) {
            this._showSkeletonBanner("☠ MEGA SKELETON INCOMING! ☠", "#ff4444", 4000);
        } else if (megaAlive && !this._lastMegaAlive && skelKills >= 5) {
            this._showSkeletonBanner("☠ MEGA SKELETON HAS ARRIVED! ☠", "#ff4444", 4000);
        } else if (boneArch && !this._lastBoneArch) {
            this._showSkeletonBanner("🦴 BONE ARCH EARNED! 🦴", "#E8D44D", 5000);
        }
        this._lastSkeletonKills = skelKills;
        this._lastMegaAlive = megaAlive;
        this._lastBoneArch = boneArch;
    }

    _showSkeletonBanner(text, color, duration) {
        if (!this._skeletonBanner) return;
        if (this._skeletonBannerTimer) clearTimeout(this._skeletonBannerTimer);
        this._skeletonBannerText.textContent = text;
        this._skeletonBannerText.style.color = color;
        this._skeletonBannerText.style.borderColor = color;
        this._skeletonBanner.style.display = "block";
        this._skeletonBannerTimer = setTimeout(() => {
            if (this._skeletonBanner) this._skeletonBanner.style.display = "none";
        }, duration);
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
        this._companionMaxTicks = 1800;
        this._lastSkeletonKills = 0;
        this._lastMegaAlive = false;
        this._lastBoneArch = false;
        if (this._skeletonBannerTimer) {
            clearTimeout(this._skeletonBannerTimer);
            this._skeletonBannerTimer = null;
        }
        if (this._skeletonBanner) this._skeletonBanner.style.display = "none";
        if (this._skeletonSection) this._skeletonSection.style.display = "none";
        this.update({ score: 0, lives: 3, enemies_remaining: 20, total_enemies: 20, player: null, companion_ticks: 0 });
    }
}
