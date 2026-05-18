import {
    WORKSPACE_V2_BODY_CLASS,
    WORKSPACE_V2_STOCK_REGION_SELECTORS
} from "./constants.mjs";

export class UiRegionGovernor {
    constructor({ systemId, debug = false }) {
        this.systemId = systemId;
        this.debug = Boolean(debug);
        this._onRenderApplicationV2 = this._onRenderApplicationV2.bind(this);
        this.running = false;
    }

    setDebug(debug) {
        this.debug = Boolean(debug);
    }

    start() {
        if (this.running) return;
        this.running = true;
        Hooks.on("renderApplicationV2", this._onRenderApplicationV2);
        this.apply();
        this._log("started");
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        Hooks.off("renderApplicationV2", this._onRenderApplicationV2);
        this.release();
        this._log("stopped");
    }

    apply() {
        document.body?.classList?.add(WORKSPACE_V2_BODY_CLASS);
    }

    release() {
        document.body?.classList?.remove(WORKSPACE_V2_BODY_CLASS);
    }

    audit() {
        const rows = WORKSPACE_V2_STOCK_REGION_SELECTORS.map((selector) => {
            const element = document.querySelector(selector);
            const computed = element ? getComputedStyle(element) : null;
            const hidden = !element || computed?.display === "none" || computed?.visibility === "hidden";
            return {
                selector,
                present: Boolean(element),
                hidden
            };
        });

        return {
            active: this.running,
            hiddenCount: rows.filter((row) => row.hidden).length,
            rows
        };
    }

    _onRenderApplicationV2() {
        if (!this.running) return;
        this.apply();
    }

    _log(message, payload = undefined) {
        if (!this.debug) return;
        console.debug(`[${this.systemId}] Workspace V2 UiRegionGovernor ${message}`, payload);
    }
}
