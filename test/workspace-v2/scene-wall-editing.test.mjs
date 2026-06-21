import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    addWallSegmentToScene,
    advanceWallPlacementSequence,
    buildManualWallDocumentData,
    buildWallEditingGrid,
    findWallsIntersectingBounds,
    findWallsWithinBounds,
    getControlledWallIds,
    getJoinableWallIds,
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
    it("advances chained wall placement from each previous grid intersection", () => {
        const first = advanceWallPlacementSequence(null, {
            sceneId: "scene-a",
            point: { x: 100, y: 100 }
        });
        const second = advanceWallPlacementSequence(first.sequence, {
            sceneId: "scene-a",
            point: { x: 200, y: 100 }
        });
        const third = advanceWallPlacementSequence(second.sequence, {
            sceneId: "scene-a",
            point: { x: 200, y: 200 }
        });

        assert.equal(first.segment, null);
        assert.deepEqual(second.segment, {
            start: { x: 100, y: 100 },
            end: { x: 200, y: 100 }
        });
        assert.deepEqual(third.segment, {
            start: { x: 200, y: 100 },
            end: { x: 200, y: 200 }
        });
        assert.deepEqual(third.sequence.start, { x: 200, y: 200 });
    });

    it("starts a fresh wall chain when the scene changes", () => {
        const step = advanceWallPlacementSequence({
            sceneId: "scene-a",
            start: { x: 100, y: 100 }
        }, {
            sceneId: "scene-b",
            point: { x: 300, y: 300 }
        });

        assert.equal(step.segment, null);
        assert.deepEqual(step.sequence, {
            sceneId: "scene-b",
            start: { x: 300, y: 300 }
        });
    });

    it("collects controlled wall ids from Foundry wall layer shapes", () => {
        const controlledObjects = new Map([
            ["b", { document: wall("b", [100, 0, 200, 0]) }],
            ["duplicate", { document: wall("a", [0, 0, 100, 0]) }]
        ]);
        const wallLayer = {
            controlled: [
                { document: wall("a", [0, 0, 100, 0]) },
                wall("direct", [200, 0, 300, 0])
            ],
            controlledObjects,
            placeables: [
                { controlled: true, document: wall("c", [300, 0, 400, 0]) },
                { controlled: false, document: wall("ignored", [400, 0, 500, 0]) }
            ]
        };

        assert.deepEqual(getControlledWallIds(wallLayer), ["a", "direct", "b", "c"]);
        assert.deepEqual(getControlledWallIds(null), []);
    });

    it("snaps wall clicks to nearest grid intersections", () => {
        const grid = buildWallEditingGrid(makeScene());

        assert.deepEqual(snapPointToGridIntersection({ x: 144, y: 252 }, grid), { x: 100, y: 300 });
    });

    it("does not clamp wall clicks to a derived scene resolution boundary", () => {
        const grid = {
            type: 1,
            cellSize: 100,
            width: 4096,
            height: 4096,
            offsetX: 0,
            offsetY: 0
        };

        assert.deepEqual(
            snapPointToGridIntersection({ x: 12144, y: 8351 }, grid),
            { x: 12100, y: 8400 }
        );
    });

    it("builds wall editing grids in scene coordinates when Foundry dimensions include padding metadata", () => {
        const grid = buildWallEditingGrid({
            width: 280,
            height: 260,
            dimensions: {
                sceneX: 40,
                sceneY: 30,
                sceneWidth: 201,
                sceneHeight: 201
            },
            shiftX: -40,
            shiftY: -30,
            grid: { type: 1, size: 100 }
        });

        assert.deepEqual(grid, {
            type: 1,
            cellSize: 100,
            width: 201,
            height: 201,
            offsetX: 40,
            offsetY: 30
        });
        assert.deepEqual(snapPointToGridIntersection({ x: 142, y: 131 }, grid), { x: 140, y: 130 });
        assert.deepEqual(snapPointToGridIntersection({ x: 242, y: 231 }, grid), { x: 240, y: 230 });
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
        const transparent = buildManualWallDocumentData({
            start: { x: 0, y: 0 },
            end: { x: 100, y: 100 },
            wallType: "transparent",
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
        assert.equal(transparent.move, "normal");
        assert.equal(transparent.sight, "none");
        assert.equal(transparent.light, "none");
        assert.equal(transparent.sound, "none");
        assert.equal(transparent.door, "none");
        assert.equal(transparent.flags["turn-of-the-century"].wallKind, "transparent");
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

    it("identifies selected wall segments that can be joined", () => {
        const scene = makeScene({
            walls: [
                wall("left", [0, 100, 100, 100]),
                wall("right", [100, 100, 300, 100]),
                wall("gap", [400, 100, 500, 100]),
                wall("perpendicular", [300, 100, 300, 200])
            ]
        });

        assert.deepEqual(
            getJoinableWallIds(scene, ["left", "right", "gap", "perpendicular"]),
            ["left", "right"]
        );
        assert.deepEqual(getJoinableWallIds(scene, ["left", "gap"]), []);
    });

    it("joins selected wall groups without mixing wall, door, window, and transparent types", async () => {
        const scene = makeScene({
            walls: [
                wall("wall-left", [0, 100, 100, 100]),
                wall("wall-right", [100, 100, 200, 100]),
                wall("door-left", [0, 200, 100, 200], { flags: { "turn-of-the-century": { wallKind: "door" } } }),
                wall("door-right", [100, 200, 200, 200], { flags: { "turn-of-the-century": { wallKind: "door" } } }),
                wall("window-left", [0, 300, 100, 300], { flags: { "turn-of-the-century": { wallKind: "window" } } }),
                wall("window-right", [100, 300, 200, 300], { flags: { "turn-of-the-century": { wallKind: "window" } } }),
                wall("transparent-left", [0, 400, 100, 400], { flags: { "turn-of-the-century": { wallKind: "transparent" } } }),
                wall("transparent-right", [100, 400, 200, 400], { flags: { "turn-of-the-century": { wallKind: "transparent" } } })
            ]
        });

        const result = await joinWallSegmentsById({
            scene,
            ids: [
                "wall-left", "wall-right", "door-left", "door-right",
                "window-left", "window-right", "transparent-left", "transparent-right"
            ]
        });

        assert.equal(result.ok, true);
        assert.deepEqual(scene.calls[1].documents.map((document) => document.c), [
            [0, 100, 200, 100],
            [0, 200, 200, 200],
            [0, 300, 200, 300],
            [0, 400, 200, 400]
        ]);
        assert.deepEqual(scene.calls[1].documents.map((document) => document.flags["turn-of-the-century"].wallKind), [
            "wall",
            "door",
            "window",
            "transparent"
        ]);
    });
});
