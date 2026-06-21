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

    it("excludes squares that require opening a closed door", () => {
        const constants = globalThis.CONST;
        globalThis.CONST = {
            WALL_MOVEMENT_TYPES: { NONE: 0 },
            WALL_DOOR_TYPES: { NONE: 0, DOOR: 1 },
            WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1 }
        };
        const scene = {
            id: "scene-1",
            width: 500,
            height: 100,
            grid: { size: 100, distance: 5 },
            walls: [{ c: [200, 0, 200, 100], move: 20, door: 1, ds: 0 }]
        };

        try {
            const closedModel = buildEncounterMovementOverlayModel({
                token: { id: "token-1", x: 0, y: 0, width: 1, height: 1 },
                scene,
                maxAp: 3
            });
            assert.equal(findEncounterMovementOverlayCellAtPoint(closedModel, { x: 250, y: 50 }), null);

            scene.walls[0].ds = 1;
            const openModel = buildEncounterMovementOverlayModel({
                token: { id: "token-1", x: 0, y: 0, width: 1, height: 1 },
                scene,
                maxAp: 3
            });
            assert.equal(findEncounterMovementOverlayCellAtPoint(openModel, { x: 250, y: 50 })?.requiredAp, 1);
        } finally {
            globalThis.CONST = constants;
        }
    });

    it("uses routed distance to determine the AP cost around walls", () => {
        const model = buildEncounterMovementOverlayModel({
            token: { id: "token-1", x: 0, y: 0, width: 1, height: 1 },
            scene: {
                id: "scene-1",
                width: 500,
                height: 500,
                grid: { size: 100, distance: 5 },
                walls: [{ c: [200, 0, 200, 200], move: 20, door: 0 }]
            },
            maxAp: 3
        });

        const squareBeyondWall = findEncounterMovementOverlayCellAtPoint(model, { x: 250, y: 50 });
        assert.equal(squareBeyondWall?.requiredAp, 3);
        assert.equal(squareBeyondWall?.distanceFeet > 10, true);
    });
});
