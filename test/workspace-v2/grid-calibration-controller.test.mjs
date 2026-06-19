import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GridCalibrationController } from "../../module/ui/workspace-v2/grid-calibration-controller.mjs";

describe("GridCalibrationController", () => {
    it("owns the corner-picking state machine", () => {
        const controller = new GridCalibrationController();
        controller.open({ scene: { id: "scene-1" } });

        assert.equal(controller.active, true);
        assert.equal(controller.state.sceneId, "scene-1");
        assert.equal(controller.pickCorner({ x: 124, y: 218 }).phase, "pick-second");
        assert.equal(controller.pickCorner({ x: 224, y: 318 }).phase, "adjust");
        assert.equal(controller.state.cellW, 100);
        assert.equal(controller.state.cellH, 100);
        assert.equal(controller.state.offsetX, 24);
        assert.equal(controller.state.offsetY, 18);
    });

    it("applies scene updates and closes on success", async () => {
        let updateData = null;
        const controller = new GridCalibrationController({
            sceneResolver: () => ({
                update: async (data) => {
                    updateData = data;
                }
            }),
            notifications: { info: () => {} }
        });
        controller.open({ scene: { id: "scene-1" } });
        controller.pickCorner({ x: 124, y: 218 });
        controller.pickCorner({ x: 224, y: 318 });

        const result = await controller.apply();

        assert.equal(result.ok, true);
        assert.deepEqual(updateData, {
            "grid.type": 1,
            "grid.size": 100,
            "grid.color": "#000000",
            shiftX: -24,
            shiftY: -18
        });
        assert.equal(controller.active, false);
    });

    it("applies manually adjusted offsets instead of reverting to zero", async () => {
        let updateData = null;
        const controller = new GridCalibrationController({
            sceneResolver: () => ({
                update: async (data) => {
                    updateData = data;
                }
            }),
            notifications: { info: () => {} }
        });
        controller.open({ scene: { id: "scene-1", grid: { type: 0 } } });
        controller.setCellWidth(96);
        controller.setOffsetX(31);
        controller.setOffsetY(17);

        const result = await controller.apply();

        assert.equal(result.ok, true);
        assert.deepEqual(updateData, {
            "grid.type": 1,
            "grid.size": 96,
            "grid.color": "#000000",
            shiftX: -31,
            shiftY: -17
        });
    });

    it("applies manual adjustments made after selecting calibration points", async () => {
        let updateData = null;
        const controller = new GridCalibrationController({
            sceneResolver: () => ({
                update: async (data) => {
                    updateData = data;
                }
            }),
            notifications: { info: () => {} }
        });
        controller.open({ scene: { id: "scene-1", grid: { type: 1 } } });
        controller.pickCorner({ x: 124, y: 218 });
        controller.pickCorner({ x: 224, y: 318 });
        controller.setCellWidth(96);
        controller.setOffsetX(31);
        controller.setOffsetY(17);
        controller.setColor("#d8b45c");

        const result = await controller.apply();

        assert.equal(result.ok, true);
        assert.deepEqual(updateData, {
            "grid.type": 1,
            "grid.size": 96,
            "grid.color": "#d8b45c",
            shiftX: -31,
            shiftY: -17
        });
    });

    it("applies negative manual offsets", async () => {
        let updateData = null;
        const controller = new GridCalibrationController({
            sceneResolver: () => ({
                update: async (data) => {
                    updateData = data;
                }
            }),
            notifications: { info: () => {} }
        });
        controller.open({ scene: { id: "scene-1", grid: { type: 1 } } });
        controller.setCellWidth(96);
        controller.setOffsetX(-31);
        controller.setOffsetY(-17);

        const result = await controller.apply();

        assert.equal(result.ok, true);
        assert.deepEqual(updateData, {
            "grid.type": 1,
            "grid.size": 96,
            "grid.color": "#000000",
            shiftX: 31,
            shiftY: 17
        });
    });

    it("keeps state open when the scene update fails", async () => {
        const controller = new GridCalibrationController({
            sceneResolver: () => ({
                update: async () => {
                    throw new Error("nope");
                }
            }),
            notifications: { error: () => {} },
            logger: { error: () => {} }
        });
        controller.open({ scene: { id: "scene-1" } });

        const result = await controller.apply();

        assert.equal(result.ok, false);
        assert.equal(result.reason, "update-failed");
        assert.equal(controller.active, true);
    });
});
