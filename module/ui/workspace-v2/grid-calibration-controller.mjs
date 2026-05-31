import {
    buildGridCalibrationSceneUpdate,
    cornersToCellSize,
    cornersToGridOffset
} from "./panels/grid-calibration.mjs";

export class GridCalibrationController {
    constructor({ sceneResolver = null, notifications = null, logger = console } = {}) {
        this.sceneResolver = sceneResolver;
        this.notifications = notifications;
        this.logger = logger;
        this.state = null;
    }

    get active() {
        return Boolean(this.state?.active);
    }

    open({ scene = null } = {}) {
        this.state = {
            active: true,
            sceneId: String(scene?.id ?? ""),
            gridType: Number(scene?.grid?.type ?? 1) || 1,
            corner1: null,
            corner2: null,
            cellW: null,
            cellH: null,
            offsetX: null,
            offsetY: null
        };
        return this.state;
    }

    close() {
        this.state = null;
    }

    resetCorners() {
        if (!this.state) return null;
        this.state.corner1 = null;
        this.state.corner2 = null;
        return this.state;
    }

    setCellWidth(value) {
        if (!this.state) return null;
        const next = Math.max(4, Number(value) || 4);
        this.state.cellW = next;
        if (this.state.isSquare ?? true) this.state.cellH = next;
        return this.state;
    }

    setCellHeight(value) {
        if (!this.state) return null;
        this.state.cellH = Math.max(4, Number(value) || 4);
        return this.state;
    }

    setOffsetX(value) {
        if (!this.state) return null;
        this.state.offsetX = Number(value) || 0;
        return this.state;
    }

    setOffsetY(value) {
        if (!this.state) return null;
        this.state.offsetY = Number(value) || 0;
        return this.state;
    }

    pickCorner(point) {
        if (!this.state?.active) return { phase: "inactive", state: this.state };
        if (!this.state.corner1) {
            this.state.corner1 = point;
            return { phase: "pick-second", state: this.state };
        }
        if (this.state.corner2) return { phase: "adjust", state: this.state };

        this.state.corner2 = point;
        const { cellW, cellH } = cornersToCellSize(this.state.corner1, this.state.corner2);
        const { offsetX, offsetY } = cornersToGridOffset(this.state.corner1, this.state.corner2, { cellW, cellH });
        this.state.cellW = cellW || (this.state.cellW ?? 100);
        this.state.cellH = cellH || (this.state.cellH ?? 100);
        this.state.offsetX = offsetX;
        this.state.offsetY = offsetY;
        return { phase: "adjust", state: this.state };
    }

    async apply() {
        const state = this.state;
        if (!state?.active) return { ok: false, reason: "inactive" };

        const scene = this.sceneResolver?.(state) ?? null;
        if (!scene) {
            this.notifications?.warn?.("No active scene - cannot apply grid calibration.");
            return { ok: false, reason: "missing-scene" };
        }

        const updateData = buildGridCalibrationSceneUpdate({
            cellW: state.cellW ?? 100,
            offsetX: state.offsetX ?? 0,
            offsetY: state.offsetY ?? 0,
            gridType: state.gridType
        });

        try {
            await scene.update(updateData);
            this.notifications?.info?.(`Grid updated: ${updateData["grid.size"]} px per cell (offset ${-updateData.shiftX}, ${-updateData.shiftY}).`);
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Grid calibration apply failed", error);
            this.notifications?.error?.("Failed to apply grid - see console for details.");
            return { ok: false, reason: "update-failed", error };
        }

        this.close();
        return { ok: true, updateData };
    }
}
