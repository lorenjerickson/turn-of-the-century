import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    findGridMovementPath,
    movementPathLength,
    pointAlongMovementPath
} from "../../module/encounters/grid-pathfinding.mjs";

function sceneWithWalls(walls = []) {
    return {
        width: 500,
        height: 500,
        grid: { size: 100, distance: 5 },
        walls
    };
}

describe("encounter grid pathfinding", () => {
    it("routes around movement-blocking walls", () => {
        const path = findGridMovementPath({
            start: { x: 0, y: 0 },
            target: { x: 200, y: 0 },
            scene: sceneWithWalls([{ c: [100, 0, 100, 100], move: 20, door: 0 }])
        });

        assert.deepEqual(path[0], { x: 0, y: 0 });
        assert.deepEqual(path.at(-1), { x: 200, y: 0 });
        assert.equal(path.some((point) => point.y !== 0), true);
        assert.equal(movementPathLength(path) > 200, true);
    });

    it("passes through open doors but routes around closed doors", () => {
        const wall = { c: [100, 0, 100, 100], move: 20, door: 1 };
        const constants = {
            WALL_MOVEMENT_TYPES: { NONE: 0 },
            WALL_DOOR_TYPES: { NONE: 0, DOOR: 1 },
            WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1 }
        };
        const openPath = findGridMovementPath({
            start: { x: 0, y: 0 },
            target: { x: 200, y: 0 },
            scene: sceneWithWalls([{ ...wall, ds: 1 }]),
            foundryConstants: constants
        });
        const closedPath = findGridMovementPath({
            start: { x: 0, y: 0 },
            target: { x: 200, y: 0 },
            scene: sceneWithWalls([{ ...wall, ds: 0 }]),
            foundryConstants: constants
        });

        assert.deepEqual(openPath, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
        assert.equal(closedPath.some((point) => point.y !== 0), true);
    });

    it("advances proportionally along a routed path", () => {
        const path = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
        assert.deepEqual(pointAlongMovementPath(path, 150), { x: 50, y: 100 });
        assert.deepEqual(pointAlongMovementPath(path, 500), { x: 100, y: 100 });
    });
});
