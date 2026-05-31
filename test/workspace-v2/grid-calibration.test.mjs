import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildGridCalibrationOverlayModel,
    buildGridCalibrationSceneUpdate,
    buildSceneGridOverlayState,
    cornersToCellSize,
    cornersToGridOffset
} from "../../module/ui/workspace-v2/panels/grid-calibration.mjs";

describe("Grid calibration", () => {
    it("derives cell size and offset from opposite cell corners", () => {
        const corner1 = { x: 124, y: 218 };
        const corner2 = { x: 224, y: 318 };

        const size = cornersToCellSize(corner1, corner2);

        assert.deepEqual(size, { cellW: 100, cellH: 100 });
        assert.deepEqual(cornersToGridOffset(corner1, corner2, size), {
            offsetX: 24,
            offsetY: 18
        });
    });

    it("draws the selected reference cell after both corners are picked", () => {
        const model = buildGridCalibrationOverlayModel({
            state: {
                active: true,
                corner1: { x: 100, y: 140 },
                corner2: { x: 200, y: 240 },
                cellW: 100,
                cellH: 100,
                offsetX: 0,
                offsetY: 40
            },
            viewport: { width: 500, height: 400 },
            transform: { scale: 1.5, offsetX: 20, offsetY: -10 }
        });

        assert.equal(model.active, true);
        assert.deepEqual(model.cellRef, {
            x: 170,
            y: 200,
            width: 150,
            height: 150
        });
        assert.deepEqual(model.corners, [
            { x: 170, y: 200 },
            { x: 320, y: 350 }
        ]);
        assert.ok(model.verticalLines.length > 0);
        assert.ok(model.horizontalLines.length > 0);
    });

    it("scales grid geometry with the map zoom so alignment is preserved", () => {
        const state = {
            active: true,
            corner1: { x: 100, y: 100 },
            corner2: { x: 150, y: 150 },
            cellW: 50,
            cellH: 50,
            offsetX: 0,
            offsetY: 0
        };

        const base = buildGridCalibrationOverlayModel({
            state,
            viewport: { width: 500, height: 500 },
            transform: { scale: 1, offsetX: 0, offsetY: 0 }
        });
        const zoomed = buildGridCalibrationOverlayModel({
            state,
            viewport: { width: 500, height: 500 },
            transform: { scale: 2, offsetX: 0, offsetY: 0 }
        });

        assert.equal(zoomed.cellRef.width, base.cellRef.width * 2);
        assert.equal(zoomed.cellRef.height, base.cellRef.height * 2);
        assert.equal(zoomed.corners[0].x, base.corners[0].x * 2);
        assert.equal(zoomed.corners[0].y, base.corners[0].y * 2);
    });

    it("renders persisted scene grid lines without active calibration corners", () => {
        const state = buildSceneGridOverlayState({
            shiftX: -24,
            shiftY: -18,
            grid: {
                type: 1,
                size: 100
            }
        });

        const model = buildGridCalibrationOverlayModel({
            state,
            viewport: { width: 500, height: 400 },
            transform: { scale: 1.5, offsetX: 20, offsetY: -10 }
        });

        assert.equal(model.active, true);
        assert.equal(model.cellRef, null);
        assert.deepEqual(model.corners, []);
        assert.ok(model.verticalLines.length > 0);
        assert.ok(model.horizontalLines.length > 0);
        assert.equal(model.verticalLines.includes(56), true);
        assert.equal(model.horizontalLines.includes(17), true);
    });

    it("preserves negative persisted scene grid offsets", () => {
        const state = buildSceneGridOverlayState({
            shiftX: 12,
            shiftY: 8,
            grid: {
                type: 1,
                size: 100
            }
        });

        assert.equal(state.offsetX, -12);
        assert.equal(state.offsetY, -8);
    });

    it("does not create a persisted overlay state for gridless scenes", () => {
        assert.equal(buildSceneGridOverlayState({
            grid: {
                type: 0,
                size: 100
            }
        }), null);
    });

    it("builds a Foundry V14 scene update using scene shift fields and enables a square grid", () => {
        assert.deepEqual(buildGridCalibrationSceneUpdate({
            cellW: 100.4,
            offsetX: 24.2,
            offsetY: 18.7
        }), {
            "grid.type": 1,
            "grid.size": 100,
            shiftX: -24,
            shiftY: -19
        });
    });

    it("preserves an existing visible grid type when applying calibration", () => {
        assert.deepEqual(buildGridCalibrationSceneUpdate({
            cellW: 80,
            offsetX: 12,
            offsetY: 8,
            gridType: 2
        }), {
            "grid.type": 2,
            "grid.size": 80,
            shiftX: -12,
            shiftY: -8
        });
    });

    it("builds scene updates for negative grid offsets", () => {
        assert.deepEqual(buildGridCalibrationSceneUpdate({
            cellW: 100,
            offsetX: -12,
            offsetY: -8
        }), {
            "grid.type": 1,
            "grid.size": 100,
            shiftX: 12,
            shiftY: 8
        });
    });
});
