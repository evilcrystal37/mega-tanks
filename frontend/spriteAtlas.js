export class SpriteAtlas {
    constructor({
        manifestUrl = "assets/cattle-bity/sprite.manifest.json",
        baseUrl = "assets/cattle-bity/",
    } = {}) {
        this.manifestUrl = manifestUrl;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

        this._manifest = null;
        this._imagePromises = new Map(); // url -> Promise<HTMLImageElement>
        this._images = new Map();        // url -> HTMLImageElement
        this._readyPromise = null;
    }

    get manifest() {
        return this._manifest;
    }

    has(id) {
        return !!this._manifest?.[id];
    }

    getSpriteInfo(id) {
        return this._manifest?.[id] ?? null;
    }

    async ready() {
        if (this._readyPromise) return this._readyPromise;
        this._readyPromise = (async () => {
            const res = await fetch(this.manifestUrl, { cache: "no-cache" });
            if (!res.ok) throw new Error(`Failed to load sprite manifest: ${res.status} ${res.statusText}`);
            this._manifest = await res.json();

            // Preload unique files referenced by the manifest (small set: sprite.png + a few brick sheets).
            const files = new Set();
            Object.values(this._manifest).forEach((item) => {
                if (item?.file) files.add(item.file);
            });
            await Promise.all([...files].map((f) => this._loadImage(this._resolveFile(f))));
        })();
        return this._readyPromise;
    }

    _resolveFile(filePath) {
        const fp = String(filePath ?? "").replace(/^\/+/, "");
        return this.baseUrl + fp;
    }

    _loadImage(url) {
        if (this._imagePromises.has(url)) return this._imagePromises.get(url);
        const p = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this._images.set(url, img);
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
            img.src = url;
        });
        this._imagePromises.set(url, p);
        return p;
    }

    draw(ctx, spriteId, dx, dy, dw, dh, { alpha = 1 } = {}) {
        if (!this._manifest) return false;
        const item = this._manifest[spriteId];
        if (!item) return false;

        const url = this._resolveFile(item.file);
        const img = this._images.get(url);
        if (!img || !img.complete) {
            // Kick off load (non-blocking) and skip this frame.
            this._loadImage(url).catch(() => { });
            return false;
        }

        const [sx, sy, sw, sh] = item.rect;
        const prevAlpha = ctx.globalAlpha;
        if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        if (alpha !== 1) ctx.globalAlpha = prevAlpha;
        return true;
    }
}

