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
export function installWallRenderingOverrides() {
    const _origRefreshLine = Wall.prototype._refreshLine;
    Wall.prototype._refreshLine = function () {
        if (!canvas?.walls?.active) {
            return _origRefreshLine.call(this);
        }
        // Call the original to set hitArea, direction icon, and door control.
        _origRefreshLine.call(this);
        // Redraw the line at 2× width.
        const c = this.document.c;
        const wc = this._getWallColor();
        const lw = 4 * (canvas.dimensions?.uiScale ?? 1); // 2× the default
        this.line.clear()
            .lineStyle(lw * 3, 0x000000, 1.0)
            .moveTo(c[0], c[1])
            .lineTo(c[2], c[3]);
        this.line.lineStyle(lw, wc, 1.0)
            .lineTo(c[0], c[1]);
    };

    const _origRefreshEndpoints = Wall.prototype._refreshEndpoints;
    Wall.prototype._refreshEndpoints = function () {
        if (!canvas?.walls?.active) {
            return _origRefreshEndpoints.call(this);
        }
        // Redraw endpoints at 2.5× the default radius.
        const c = this.coords;
        const wc = this._getWallColor();
        const lw = 2 * (canvas.dimensions?.uiScale ?? 1); // matches Foundry default
        const baseRadius = (this.hover || this.layer.highlightObjects) ? lw * 4 : lw * 3;
        const cr = baseRadius * 2.5;
        this.endpoints.clear()
            .lineStyle(lw, 0x000000, 1.0)
            .beginFill(wc, 1.0)
            .drawCircle(c[0], c[1], cr)
            .drawCircle(c[2], c[3], cr)
            .endFill();
    };
}
