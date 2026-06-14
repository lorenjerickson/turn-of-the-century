import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildEncounterMovementOverlayModel,
    findEncounterMovementOverlayCellAtPoint
} from "../../module/ui/workspace-v2/encounter-movement-overlay.mjs";

describe("encounter movement overlay", () => {
    it("highlights grid squares reachable with remaining AP at 10 feet per AP", () => {
        const model = buildEncounterMovementOverlayModel({
            token: { id: "token-1", x: 200, y: 200, width: 1, height: 1 },
            scene: {
                id: "scene-1",
                grid: { size: 100, distance: 5 },
                shiftX: 0,
                shiftY: 0
            },
            maxAp: 3,
            feetPerAp: 10,
            feetPerSquare: 5
        });

        assert.equal(model.active, true);
        assert.equal(model.maxAp, 3);
        assert.equal(model.originCell.col, 2);
        assert.equal(model.originCell.row, 2);

        const sixSquaresEast = findEncounterMovementOverlayCellAtPoint(model, { x: 850, y: 250 });
        assert.equal(sixSquaresEast?.col, 8);
        assert.equal(sixSquaresEast?.row, 2);
        assert.equal(sixSquaresEast?.requiredAp, 3);

        const sevenSquaresEast = findEncounterMovementOverlayCellAtPoint(model, { x: 950, y: 250 });
        assert.equal(sevenSquaresEast, null);
    });

    it("calculates cheaper AP costs for nearer destination squares", () => {
        const model = buildEncounterMovementOverlayModel({
            token: { id: "token-1", x: 200, y: 200, width: 1, height: 1 },
            scene: { id: "scene-1", grid: { size: 100, distance: 5 } },
            maxAp: 4
        });

        const twoSquaresEast = findEncounterMovementOverlayCellAtPoint(model, { x: 450, y: 250 });

        assert.equal(twoSquaresEast?.requiredAp, 1);
    });
});
