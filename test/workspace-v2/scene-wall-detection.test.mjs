import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    applyDetectedWallsToScene,
    buildDetectedWallDocumentData,
    buildDetectedWallIntersections,
    buildGridLineCoordinates,
    buildRegularSquareGridModel,
    buildSceneWallOverlayState,
    detectRegularGridWallSegments,
    scoreGridLineSegment
} from "../../module/ui/workspace-v2/scene-wall-detection.mjs";

function makeImageData(width, height, fill = 255) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
        data[index] = fill;
        data[index + 1] = fill;
        data[index + 2] = fill;
        data[index + 3] = 255;
    }
    return { width, height, data };
}

function drawVerticalLine(imageData, x, y1, y2, value = 0, thickness = 3) {
    const radius = Math.floor(thickness / 2);
    for (let y = y1; y <= y2; y += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) setPixel(imageData, x + dx, y, value);
    }
}

function drawHorizontalLine(imageData, y, x1, x2, value = 0, thickness = 3) {
    const radius = Math.floor(thickness / 2);
    for (let x = x1; x <= x2; x += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) setPixel(imageData, x, y + dy, value);
    }
}

function drawDiagonalLine(imageData, x1, y1, x2, y2, value = 0, thickness = 3) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const steps = Math.round(length);
    const stepX = steps > 0 ? dx / steps : 0;
    const stepY = steps > 0 ? dy / steps : 0;
    const orthoX = steps > 0 ? -dy / length : 0;
    const orthoY = steps > 0 ? dx / length : 0;
    const radius = Math.floor(thickness / 2);

    for (let step = 0; step <= steps; step += 1) {
        const cx = x1 + step * stepX;
        const cy = y1 + step * stepY;
        for (let delta = -radius; delta <= radius; delta += 1) {
            const px = Math.round(cx + orthoX * delta);
            const py = Math.round(cy + orthoY * delta);
            setPixel(imageData, px, py, value);
        }
    }
}

function setPixel(imageData, x, y, value) {
    if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return;
    const index = ((y * imageData.width) + x) * 4;
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
}

describe("regular grid wall detection", () => {
    it("builds a square grid model from Foundry scene grid and shift fields", () => {
        assert.deepEqual(buildRegularSquareGridModel({
            width: 300,
            height: 200,
            shiftX: -12,
            shiftY: -8,
            grid: { type: 1, size: 50 }
        }), {
            type: 1,
            cellSize: 50,
            width: 300,
            height: 200,
            offsetX: 12,
            offsetY: 8
        });
    });

    it("rejects non-square or uncalibrated grids", () => {
        assert.equal(buildRegularSquareGridModel({ grid: { type: 0, size: 50 } }), null);
        assert.equal(buildRegularSquareGridModel({ grid: { type: 2, size: 50 } }), null);
        assert.equal(buildRegularSquareGridModel({ grid: { type: 1, size: 0 } }), null);
    });

    it("builds grid line coordinates from the calibrated phase", () => {
        assert.deepEqual(buildGridLineCoordinates({ offset: 12, cellSize: 50, max: 180 }), [12, 62, 112, 162]);
        assert.deepEqual(buildGridLineCoordinates({ offset: -10, cellSize: 50, max: 120 }), [40, 90]);
    });

    it("scores dark pixels along a grid line segment", () => {
        const imageData = makeImageData(120, 120);
        drawVerticalLine(imageData, 50, 0, 119, 0, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            darkLuminance: 120
        });

        assert.equal(score.darkRatio, 1);
    });

    it("ignores low-contrast lines (e.g. pre-rendered grids)", () => {
        const imageData = makeImageData(120, 120);
        // Draw a light gray line (luminance 235) on a white background (255)
        // Contrast is 20, which is below the minimum threshold of 30
        drawVerticalLine(imageData, 50, 0, 119, 235, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            darkLuminance: 240, // threshold is higher than line value
            minContrast: 30,
            bgOffset: 4
        });

        assert.equal(score.darkRatio, 0);
    });

    it("scores a segment as a wall if only one side has high contrast (e.g. object adjacent to the wall)", () => {
        const imageData = makeImageData(120, 120, 0); // start with black
        // Fill left half (x < 44) with white background (255)
        for (let y = 0; y < 120; y += 1) {
            for (let x = 0; x < 45; x += 1) {
                setPixel(imageData, x, y, 255);
            }
        }
        // Right half (x >= 45) is left black (0), representing a dark object adjacent to the wall.
        // Draw the vertical wall line at x = 50 with thickness 3 and luminance 0
        drawVerticalLine(imageData, 50, 0, 119, 0, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            darkLuminance: 120,
            minContrast: 30,
            bgOffset: 6
        });

        // The wall should be detected because the left side has contrast (255 vs 0),
        // even though the right side has no contrast (0 vs 0).
        assert.equal(score.darkRatio, 1);
    });

    it("does not detect a rug edge but detects a wall next to an object", () => {
        // Test case 1: Rug edge (should NOT be detected)
        // Side 1 (left) is a dark rug (luminance 80).
        // Side 2 (right) is light floor (luminance 220).
        // Candidate line is at x = 50.
        // We pass cellAvg1 = 80, cellAvg2 = 220.
        const imgRug = makeImageData(120, 120, 220);
        for (let y = 0; y < 120; y += 1) {
            for (let x = 0; x < 50; x += 1) {
                setPixel(imgRug, x, y, 80);
            }
        }
        const scoreRug = scoreGridLineSegment({
            imageData: imgRug,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            darkLuminance: 120,
            minContrast: 30,
            bgOffset: 6,
            cellAvg1: 80,
            cellAvg2: 220
        });
        assert.equal(scoreRug.darkRatio, 0); // Rug edge should be ignored!

        // Test case 2: Wall next to a dark object (should be detected)
        // Side 1 (left) has a dark object (nearest pixel bgLum1 = 80), but cellAvg1 = 200 (light).
        // Side 2 (right) is light floor (bgLum2 = 200, cellAvg2 = 200).
        // Wall pixel luminance is 0.
        const imgWall = makeImageData(120, 120, 200);
        // Draw object at x = 44 (where bgOffset=6 samples)
        for (let y = 0; y < 120; y += 1) {
            setPixel(imgWall, 44, y, 80);
        }
        drawVerticalLine(imgWall, 50, 0, 119, 0, 3);
        const scoreWall = scoreGridLineSegment({
            imageData: imgWall,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            darkLuminance: 120,
            minContrast: 30,
            bgOffset: 6,
            cellAvg1: 200,
            cellAvg2: 200
        });
        assert.equal(scoreWall.darkRatio, 1); // Wall next to object should be detected!
    });

    it("detects light-colored walls on a dark background", () => {
        // Create a dark background image (luminance 40)
        const imageData = makeImageData(120, 120, 40);
        // Draw a light-colored wall (luminance 220) at x=50
        drawVerticalLine(imageData, 50, 0, 119, 220, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            orientation: "vertical",
            fixed: 50,
            from: 10,
            to: 100,
            sampleRadius: 1,
            minContrast: 30,
            bgOffset: 6,
            cellAvg1: 40,
            cellAvg2: 40
        });

        // The wall should be detected because it has high contrast (220 vs 40)
        // and a strong Sobel edge.
        assert.equal(score.darkRatio, 1);
    });

    it("detects and merges confident grid-aligned wall segments", () => {
        const imageData = makeImageData(201, 201);
        drawVerticalLine(imageData, 100, 0, 200, 0, 3);
        drawHorizontalLine(imageData, 100, 0, 100, 0, 3);

        const result = detectRegularGridWallSegments({
            imageData,
            scene: {
                width: 200,
                height: 200,
                grid: { type: 1, size: 100 }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.segments.map((segment) => ({
            orientation: segment.orientation,
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
            type: segment.type
        })), [
            { orientation: "horizontal", x1: 0, y1: 100, x2: 100, y2: 100, type: "wall" },
            { orientation: "vertical", x1: 100, y1: 0, x2: 100, y2: 200, type: "wall" }
        ]);
    });

    it("scores dark pixels along a diagonal line segment", () => {
        const imageData = makeImageData(120, 120);
        drawDiagonalLine(imageData, 10, 10, 110, 110, 0, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            x1: 15,
            y1: 15,
            x2: 105,
            y2: 105,
            sampleRadius: 1,
            darkLuminance: 120
        });

        assert.ok(score.darkRatio > 0.8);
    });

    it("scores dark pixels along a slash diagonal line segment", () => {
        const imageData = makeImageData(120, 120);
        drawDiagonalLine(imageData, 10, 110, 110, 10, 0, 3);

        const score = scoreGridLineSegment({
            imageData,
            width: 120,
            height: 120,
            x1: 15,
            y1: 105,
            x2: 105,
            y2: 15,
            sampleRadius: 1,
            darkLuminance: 120
        });

        assert.ok(score.darkRatio > 0.8);
    });

    it("detects and merges confident diagonal-backslash wall segments", () => {
        const imageData = makeImageData(201, 201);
        drawDiagonalLine(imageData, 0, 0, 200, 200, 0, 3);

        const result = detectRegularGridWallSegments({
            imageData,
            scene: {
                width: 200,
                height: 200,
                grid: { type: 1, size: 100 }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.segments.map((segment) => ({
            orientation: segment.orientation,
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
            type: segment.type
        })), [
            { orientation: "diagonal-backslash", x1: 0, y1: 0, x2: 200, y2: 200, type: "wall" }
        ]);
    });

    it("detects and merges confident diagonal-slash wall segments", () => {
        const imageData = makeImageData(201, 201);
        drawDiagonalLine(imageData, 0, 200, 200, 0, 0, 3);

        const result = detectRegularGridWallSegments({
            imageData,
            scene: {
                width: 200,
                height: 200,
                grid: { type: 1, size: 100 }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.segments.map((segment) => ({
            orientation: segment.orientation,
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
            type: segment.type
        })), [
            { orientation: "diagonal-slash", x1: 0, y1: 200, x2: 200, y2: 0, type: "wall" }
        ]);
    });

    it("discards isolated single-cell wall segments (proximity rule)", () => {
        const imageData = makeImageData(201, 201);
        drawHorizontalLine(imageData, 100, 0, 100, 0, 3);

        const result = detectRegularGridWallSegments({
            imageData,
            scene: {
                width: 200,
                height: 200,
                grid: { type: 1, size: 100 }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.segments.length, 0);
    });

    it("discards diagonal wall segments that conflict with right-angle segments at the same vertex", () => {
        const imageData = makeImageData(201, 201);
        drawVerticalLine(imageData, 100, 0, 200, 0, 3);
        drawHorizontalLine(imageData, 100, 0, 100, 0, 3);
        drawDiagonalLine(imageData, 100, 100, 200, 200, 0, 3);

        const result = detectRegularGridWallSegments({
            imageData,
            scene: {
                width: 200,
                height: 200,
                grid: { type: 1, size: 100 }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.segments.map((segment) => ({
            orientation: segment.orientation,
            x1: segment.x1,
            y1: segment.y1,
            x2: segment.x2,
            y2: segment.y2,
            type: segment.type
        })), [
            { orientation: "horizontal", x1: 0, y1: 100, x2: 100, y2: 100, type: "wall" },
            { orientation: "vertical", x1: 100, y1: 0, x2: 100, y2: 200, type: "wall" }
        ]);
    });

    it("builds Foundry wall data with blocking wall defaults", () => {
        assert.deepEqual(buildDetectedWallDocumentData([{
            x1: 100,
            y1: 0,
            x2: 100,
            y2: 200,
            type: "wall",
            score: 0.75
        }]), [{
            c: [100, 0, 100, 200],
            move: 20,
            sight: 20,
            light: 20,
            sound: 20,
            door: 0,
            ds: 0,
            flags: {
                "turn-of-the-century": {
                    detectedWall: true,
                    detectedKind: "wall",
                    detectionScore: 0.75
                }
            }
        }]);
    });

    it("builds unique intersections for crossings and shared endpoints", () => {
        assert.deepEqual(buildDetectedWallIntersections([
            { orientation: "vertical", x1: 100, y1: 0, x2: 100, y2: 200 },
            { orientation: "horizontal", x1: 0, y1: 100, x2: 200, y2: 100 },
            { orientation: "horizontal", x1: 100, y1: 200, x2: 200, y2: 200 }
        ]), [
            { x: 100, y: 100 },
            { x: 100, y: 200 }
        ]);
    });

    it("builds overlay segments from existing scene walls", () => {
        assert.deepEqual(buildSceneWallOverlayState({
            walls: [
                { id: "wall-a", c: [0.2, 0.8, 100.3, 0.4] },
                { id: "wall-b", _source: { c: [100, 0, 100, 100], flags: { "turn-of-the-century": { wallKind: "window" } } } },
                { id: "wall-c", c: [200, 0, 200, 100], flags: { "turn-of-the-century": { wallKind: "door" } } },
                { c: ["bad", 0, 50, 50] }
            ]
        }, {
            selectedWallIds: new Set(["wall-b"])
        }), {
            segments: [
                { id: "wall-a", wallKind: "wall", x1: 0, y1: 1, x2: 100, y2: 0, selected: false },
                { id: "wall-b", wallKind: "window", x1: 100, y1: 0, x2: 100, y2: 100, selected: true },
                { id: "wall-c", wallKind: "door", x1: 200, y1: 0, x2: 200, y2: 100, selected: false }
            ],
            intersections: [
                { x: 100, y: 0 }
            ]
        });
    });

    it("uses Foundry wall constants when available", () => {
        const foundryConstants = {
            WALL_MOVEMENT_TYPES: { NORMAL: 200 },
            EDGE_SENSE_TYPES: { NORMAL: 300 },
            WALL_SENSE_TYPES: { NORMAL: 250 },
            WALL_DOOR_TYPES: { NONE: "none" },
            WALL_DOOR_STATES: { CLOSED: "closed" }
        };

        const [wall] = buildDetectedWallDocumentData([{
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0
        }], { foundryConstants });

        assert.equal(wall.move, 200);
        assert.equal(wall.sight, 300);
        assert.equal(wall.light, 300);
        assert.equal(wall.sound, 300);
        assert.equal(wall.door, "none");
        assert.equal(wall.ds, "closed");
    });

    it("falls back to legacy wall sense constants when edge constants are unavailable", () => {
        const foundryConstants = {
            WALL_MOVEMENT_TYPES: { NORMAL: 200 },
            WALL_SENSE_TYPES: { NORMAL: 250 },
            WALL_DOOR_TYPES: { NONE: "none" },
            WALL_DOOR_STATES: { CLOSED: "closed" }
        };

        const [wall] = buildDetectedWallDocumentData([{
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0
        }], { foundryConstants });

        assert.equal(wall.sight, 250);
        assert.equal(wall.light, 250);
        assert.equal(wall.sound, 250);
    });

    it("replaces existing scene walls only after confirmation", async () => {
        const deleted = [];
        const created = [];
        const scene = {
            walls: [{ id: "wall-a" }, { id: "wall-b" }],
            deleteEmbeddedDocuments: async (type, ids) => {
                deleted.push({ type, ids });
            },
            createEmbeddedDocuments: async (type, documents) => {
                created.push({ type, documents });
                return documents;
            }
        };

        const cancelled = await applyDetectedWallsToScene({
            scene,
            wallData: [{ c: [0, 0, 100, 0] }],
            confirmReplacement: () => false
        });
        assert.equal(cancelled.ok, false);
        assert.equal(cancelled.reason, "replacement-cancelled");
        assert.deepEqual(deleted, []);
        assert.deepEqual(created, []);

        const applied = await applyDetectedWallsToScene({
            scene,
            wallData: [{ c: [0, 0, 100, 0] }],
            confirmReplacement: () => true
        });
        assert.equal(applied.ok, true);
        assert.deepEqual(deleted, [{ type: "Wall", ids: ["wall-a", "wall-b"] }]);
        assert.deepEqual(created, [{ type: "Wall", documents: [{ c: [0, 0, 100, 0] }] }]);
    });
});
