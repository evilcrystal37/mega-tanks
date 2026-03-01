export class GameInput {
    constructor(sendInput, sendPause) {
        this._keysDown = new Set();
        this._sendInput = sendInput;
        this._sendPause = sendPause;
        this._boundDown = (ev) => this._onKeyDown(ev);
        this._boundUp = (ev) => this._onKeyUp(ev);
    }

    bind() {
        window.addEventListener("keydown", this._boundDown);
        window.addEventListener("keyup", this._boundUp);
    }

    unbind() {
        window.removeEventListener("keydown", this._boundDown);
        window.removeEventListener("keyup", this._boundUp);
        this._keysDown.clear();
    }

    getDirection() {
        if (this._keysDown.has("ArrowUp") || this._keysDown.has("KeyW")) return "up";
        if (this._keysDown.has("ArrowDown") || this._keysDown.has("KeyS")) return "down";
        if (this._keysDown.has("ArrowLeft") || this._keysDown.has("KeyA")) return "left";
        if (this._keysDown.has("ArrowRight") || this._keysDown.has("KeyD")) return "right";
        return null;
    }

    isFiring() {
        return this._keysDown.has("KeyX") || this._keysDown.has("KeyC");
    }

    _onKeyDown(ev) {
        if (ev.repeat) return;
        if (ev.code === "Enter") {
            this._sendPause();
            ev.preventDefault();
            return;
        }
        const before = this._keysDown.size;
        this._keysDown.add(ev.code);
        if (this._keysDown.size !== before) this._sendInput();
    }

    _onKeyUp(ev) {
        const had = this._keysDown.delete(ev.code);
        if (had) this._sendInput();
    }
}
