import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    addWallSegmentToScene,
    buildManualWallDocumentData,
    buildWallEditingGrid,
    findWallsIntersectingBounds,
    findWallsWithinBounds,
    joinWallSegmentsById,
    joinWallSegmentsAtPoint,
    removeWallSegmentsById,
    removeWallSegmentAtPoint,
    snapPointToGridIntersection,
    splitWallSegmentAtPoint,
    wallSegmentIntersectsBounds,
    wallSegmentWithinBounds
} from "../../module/ui/workspace-v2/scene-wall-editing.mjs";

function makeScene({ walls = [] } = {}) {
    const calls = [];
    return {
        width: 500,
        height: 500,
        shiftX: 0,
        shiftY: 0,
        grid: { type: 1, size: 100 },
        walls,
        calls,
        async createEmbeddedDocuments(type, documents) {
            calls.push({ action: "create", type, documents });
            return documents.map((document, index) => ({ id: `created-${index}`, ...document }));
        },
        async deleteEmbeddedDocuments(type, ids) {
            calls.push({ action: "delete", type, ids });
            return ids;
        }
    };
}

function wall(id, c, extra = {}) {
    return {
        id,
        c,
        move: 20,
        sight: 20,
        light: 20,
        sound: 20,
        door: 0,
        ds: 0,
        flags: {
            "turn-of-the-century": {
                wallKind: "wall"
            }
        },
        ...extra
    };
}

describe("scene wall editing", () => {
    it("snaps wall clicks to nearest grid intersections", () => {
        const grid = buildWallEditingGrid(makeScene());

        assert.deepEqual(snapPointToGridIntersection({ x: 144, y: 252 }, grid), { x: 100, y: 300 });
    });

    it("builds manual wall data for selected wall types", () => {
        const door = buildManualWallDocumentData({
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
            wallType: "door",
            foundryConstants: {
                WALL_MOVEMENT_TYPES: { NORMAL: "normal" },
                EDGE_SENSE_TYPES: { NORMAL: "normal", NONE: "none" },
                WALL_DOOR_TYPES: { NONE: "none", DOOR: "door" },
                WALL_DOOR_STATES: { CLOSED: "closed" }
            }
        });
        const window = buildManualWallDocumentData({
            start: { x: 0, y: 0 },
            end: { x: 0, y: 100 },
            wallType: "window",
            foundryConstants: {
                WALL_MOVEMENT_TYPES: { NORMAL: "normal" },
                EDGE_SENSE_TYPES: { NORMAL: "normal", NONE: "none" },
                WALL_DOOR_TYPES: { NONE: "none", DOOR: "door" },
                WALL_DOOR_STATES: { CLOSED: "closed" }
            }
        });

        assert.equal(door.door, "door");
        assert.equal(door.flags["turn-of-the-century"].wallKind, "door");
        assert.equal(window.sight, "none");
        assert.equal(window.light, "none");
        assert.equal(window.flags["turn-of-the-century"].wallKind, "window");
    });

    it("adds a wall segment to the scene with the selected wall type", async () => {
        const scene = makeScene();
        const result = await addWallSegmentToScene({
            scene,
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
            wallType: "door",
            foundryConstants: {
                WALL_MOVEMENT_TYPES: { NORMAL: "normal" },
                EDGE_SENSE_TYPES: { NORMAL: "normal", NONE: "none" },
                WALL_DOOR_TYPES: { NONE: "none", DOOR: "door" },
                WALL_DOOR_STATES: { CLOSED: "closed" }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(scene.calls[0].action, "create");
        assert.equal(scene.calls[0].type, "Wall");
        assert.deepEqual(scene.calls[0].documents[0].c, [0, 0, 100, 0]);
        assert.equal(scene.calls[0].documents[0].door, "door");
        assert.equal(scene.calls[0].documents[0].flags["turn-of-the-century"].wallKind, "door");
    });

    it("removes the nearest wall segment clicked along its length", async () => {
        const scene = makeScene({
            walls: [
                wall("near", [0, 100, 300, 100]),
                wall("far", [0, 300, 300, 300])
            ]
        });
        const result = await removeWallSegmentAtPoint({
            scene,
            point: { x: 148, y: 107 },
            grid: buildWallEditingGrid(scene)
        });

        assert.equal(result.ok, true);
        assert.deepEqual(scene.calls[0], { action: "delete", type: "Wall", ids: ["near"] });
    });

    it("selects wall segments when any portion intersects selection bounds", () => {
        const walls = [
            wall("crosses", [0, 100, 300, 100]),
            wall("inside-endpoint", [150, 150, 300, 300]),
            wall("outside", [0, 300, 100, 300])
        ];
        const bounds = { left: 90, top: 90, right: 160, bottom: 160 };

        assert.equal(wallSegmentIntersectsBounds({ x1: 0, y1: 100, x2: 300, y2: 100 }, bounds), true);
        assert.deepEqual(findWallsIntersectingBounds({ walls, bounds }).map((entry) => entry.id), ["crosses", "inside-endpoint"]);
        assert.equal(wallSegmentWithinBounds({ x1: 0, y1: 100, x2: 300, y2: 100 }, bounds), false);
        assert.deepEqual(findWallsWithinBounds({ walls, bounds }).map((entry) => entry.id), []);
    });

    it("deletes selected wall ids without using point proximity", async () => {
        const scene = makeScene({
            walls: [
                wall("a", [0, 0, 100, 0]),
                wall("b", [100, 0, 200, 0]),
                wall("c", [200, 0, 300, 0])
            ]
        });

        const result = await removeWallSegmentsById({ scene, ids: ["b", "missing", "a", "a"] });

        assert.equal(result.ok, true);
        assert.deepEqual(result.deleted, ["b", "a"]);
        assert.deepEqual(scene.calls[0], { action: "delete", type: "Wall", ids: ["b", "a"] });
    });

    it("splits a wall at the nearest eligible grid point", async () => {
        const scene = makeScene({
            walls: [wall("long", [0, 100, 300, 100], {
                flags: { "turn-of-the-century": { wallKind: "window" } },
                sight: "none",
                light: "none"
            })]
        });
        const result = await splitWallSegmentAtPoint({
            scene,
            point: { x: 185, y: 104 },
            grid: buildWallEditingGrid(scene)
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.splitPoint, { x: 200, y: 100 });
        assert.deepEqual(scene.calls[0], { action: "delete", type: "Wall", ids: ["long"] });
        assert.deepEqual(scene.calls[1].documents.map((document) => document.c), [
            [0, 100, 200, 100],
            [200, 100, 300, 100]
        ]);
        assert.deepEqual(scene.calls[1].documents.map((document) => document.flags["turn-of-the-century"].wallKind), ["window", "window"]);
    });

    it("joins two aligned wall segments near their shared endpoint", async () => {
        const scene = makeScene({
            walls: [
                wall("left", [0, 100, 100, 100]),
                wall("right", [100, 100, 300, 100])
            ]
        });
        const result = await joinWallSegmentsAtPoint({
            scene,
            point: { x: 104, y: 96 },
            grid: buildWallEditingGrid(scene)
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.joinPoint, { x: 100, y: 100 });
        assert.deepEqual(scene.calls[0], { action: "delete", type: "Wall", ids: ["left", "right"] });
        assert.deepEqual(scene.calls[1].documents[0].c, [0, 100, 300, 100]);
    });

    it("does not join aligned wall segments with different wall types", async () => {
        const scene = makeScene({
            walls: [
                wall("wall", [0, 100, 100, 100]),
                wall("door", [100, 100, 300, 100], { flags: { "turn-of-the-century": { wallKind: "door" } } })
            ]
        });
        const result = await joinWallSegmentsAtPoint({
            scene,
            point: { x: 100, y: 100 },
            grid: buildWallEditingGrid(scene)
        });

        assert.equal(result.ok, false);
        assert.equal(result.reason, "join-not-found");
        assert.deepEqual(scene.calls, []);
    });

    it("joins selected horizontal and vertical wall groups independently", async () => {
        const scene = makeScene({
            walls: [
                wall("h-left", [0, 100, 100, 100]),
                wall("h-right", [100, 100, 300, 100]),
                wall("v-top", [400, 0, 400, 100]),
                wall("v-bottom", [400, 100, 400, 250]),
                wall("other-row", [0, 200, 100, 200]),
                wall("diagonal", [0, 0, 100, 100])
            ]
        });

        const result = await joinWallSegmentsById({
            scene,
            ids: ["h-left", "h-right", "v-top", "v-bottom", "other-row", "diagonal"]
        });

        assert.equal(result.ok, true);
        assert.deepEqual(scene.calls[0], {
            action: "delete",
            type: "Wall",
            ids: ["h-left", "h-right", "v-top", "v-bottom"]
        });
        assert.deepEqual(scene.calls[1].documents.map((document) => document.c), [
            [0, 100, 300, 100],
            [400, 0, 400, 250]
        ]);
    });

    it("joins selected wall groups without mixing wall, door, and window types", async () => {
        const scene = makeScene({
            walls: [
                wall("wall-left", [0, 100, 100, 100]),
                wall("wall-right", [100, 100, 200, 100]),
                wall("door-left", [0, 200, 100, 200], { flags: { "turn-of-the-century": { wallKind: "door" } } }),
                wall("door-right", [100, 200, 200, 200], { flags: { "turn-of-the-century": { wallKind: "door" } } }),
                wall("window-left", [0, 300, 100, 300], { flags: { "turn-of-the-century": { wallKind: "window" } } }),
                wall("window-right", [100, 300, 200, 300], { flags: { "turn-of-the-century": { wallKind: "window" } } })
            ]
        });

        const result = await joinWallSegmentsById({
            scene,
            ids: ["wall-left", "wall-right", "door-left", "door-right", "window-left", "window-right"]
        });

        assert.equal(result.ok, true);
        assert.deepEqual(scene.calls[1].documents.map((document) => document.c), [
            [0, 100, 200, 100],
            [0, 200, 200, 200],
            [0, 300, 200, 300]
        ]);
        assert.deepEqual(scene.calls[1].documents.map((document) => document.flags["turn-of-the-century"].wallKind), [
            "wall",
            "door",
            "window"
        ]);
    });
});
