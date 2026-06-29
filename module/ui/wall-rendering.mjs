/**
 * Overrides Wall prototype rendering methods to improve visibility in wall edit
 * mode. When the walls layer is active, line segments are drawn at 2× width and
 * endpoint circles are drawn at 2.5× their default radius.
 *
 * Foundry v14 defaults (from Wall.#getLineWidth):
 *   lw = 2 * canvas.dimensions.uiScale
 *   line background: lineStyle(lw * 3, 0x000000)
 *   line foreground: lineStyle(lw, wallColor)
 *   endpoint radius: lw * 3  (lw * 4 when hovered)
 */
const OVERRIDE_STATE = Symbol.for("turn-of-the-century.wall-rendering-overrides");

export function resolveWallPlaceableClass(root = globalThis) {
    return root?.foundry?.canvas?.placeables?.Wall ?? root?.Wall ?? null;
}

export function installWallRenderingOverrides(root = globalThis) {
    const WallClass = resolveWallPlaceableClass(root);
    if (!WallClass?.prototype) return false;
    if (WallClass.prototype[OVERRIDE_STATE]) return false;

    const _origRefreshLine = WallClass.prototype._refreshLine;
    WallClass.prototype._refreshLine = function () {
        const currentCanvas = root?.canvas;
        if (!currentCanvas?.walls?.active) {
            return _origRefreshLine.call(this);
        }
        // Call the original to set hitArea, direction icon, and door control.
        _origRefreshLine.call(this);
        // Redraw the line at 2× width.
        const c = this.document.c;
        const wc = this._getWallColor();
        const lw = 4 * (currentCanvas.dimensions?.uiScale ?? 1); // 2× the default
        this.line.clear()
            .lineStyle(lw * 3, 0x000000, 1.0)
            .moveTo(c[0], c[1])
            .lineTo(c[2], c[3]);
        this.line.lineStyle(lw, wc, 1.0)
            .lineTo(c[0], c[1]);
    };

    const _origRefreshEndpoints = WallClass.prototype._refreshEndpoints;
    WallClass.prototype._refreshEndpoints = function () {
        const currentCanvas = root?.canvas;
        if (!currentCanvas?.walls?.active) {
            return _origRefreshEndpoints.call(this);
        }
        // Redraw endpoints at 2.5× the default radius.
        const c = this.coords;
        const wc = this._getWallColor();
        const lw = 2 * (currentCanvas.dimensions?.uiScale ?? 1); // matches Foundry default
        const baseRadius = (this.hover || this.layer.highlightObjects) ? lw * 4 : lw * 3;
        const cr = baseRadius * 2.5;
        this.endpoints.clear()
            .lineStyle(lw, 0x000000, 1.0)
            .beginFill(wc, 1.0)
            .drawCircle(c[0], c[1], cr)
            .drawCircle(c[2], c[3], cr)
            .endFill();
    };

    WallClass.prototype[OVERRIDE_STATE] = { _origRefreshLine, _origRefreshEndpoints };
    return true;
}
