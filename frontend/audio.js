class AudioManager {
    constructor() {
        this.sounds = {};
        
        // Load initial mute state from local storage settings if available
        try {
            const raw = JSON.parse(localStorage.getItem("battle_tanks_settings") ?? "{}");
            this.muted = !!raw.mute_audio;
        } catch {
            this.muted = false;
        }
        
        const soundList = [
            "fire", "hit-brick", "enemy-explosion", "tank-idle", 
            "hit-steel", "player-explosion", "score-bonus", 
            "tank-move", "victory", "game-over", "level-intro"
        ];
        
        soundList.forEach(name => {
            const audio = new Audio(`assets/audio/${name}.mp3`);
            audio.preload = "auto";
            this.sounds[name] = audio;
        });

        // Looping sounds
        if (this.sounds["tank-idle"]) this.sounds["tank-idle"].loop = true;
        if (this.sounds["tank-move"]) this.sounds["tank-move"].loop = true;
        
        // Auto-unlock audio context on first interaction
        const unlock = () => {
            Object.values(this.sounds).forEach(audio => {
                try {
                    audio.play().then(() => audio.pause()).catch(() => {});
                } catch(e) {}
            });
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('click', unlock);
        };
        window.addEventListener('keydown', unlock, {once:true});
        window.addEventListener('click', unlock, {once:true});
    }

    play(name) {
        if (this.muted) return;
        const sound = this.sounds[name];
        if (sound) {
            try {
                // Clone the node so multiple instances of same sound can play
                if (!["tank-idle", "tank-move"].includes(name)) {
                    const clone = sound.cloneNode(true);
                    clone.volume = 0.5; // Don't make it deafening
                    clone.play().catch(e => console.warn("Audio play blocked", e));
                } else {
                    sound.volume = 0.5;
                    sound.play().catch(e => console.warn("Audio play blocked", e));
                }
            } catch (e) {
                console.warn("Audio failed", e);
            }
        }
    }

    stop(name) {
        const sound = this.sounds[name];
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }

    stopAll() {
        Object.values(this.sounds).forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
    }

    setMuted(muted) {
        this.muted = muted;
        if (muted) {
            this.stopAll();
        }
    }

    toggleMuted() {
        this.setMuted(!this.muted);
        return this.muted;
    }
}

export const audioManager = new AudioManager();