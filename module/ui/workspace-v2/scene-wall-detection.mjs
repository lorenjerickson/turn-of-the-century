import { GRID_TYPES } from "./panels/grid-calibration.mjs";

const FALLBACK_WALL_MOVEMENT_NORMAL = 20;
const FALLBACK_WALL_SENSE_NORMAL = 20;
const WALL_DOOR_NONE = 0;
const WALL_DOOR_CLOSED = 0;

export const REGULAR_GRID_WALL_DETECTION_DEFAULTS = Object.freeze({
    sampleRadius: 1,
    insetRatio: 0.18,
    minDarkRatio: 0.52,
    darkLuminance: 120,
    minSegmentPixels: 8
});

function positiveNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function documentId(document) {
    return String(document?.id ?? document?._id ?? "").trim();
}

function enumValue(constants, path = [], fallback) {
    let cursor = constants;
    for (const key of path) cursor = cursor?.[key];
    return cursor ?? fallback;
}

export function buildWallDocumentDefaults({ foundryConstants = globalThis.CONST } = {}) {
    const normalSense = enumValue(foundryConstants, ["EDGE_SENSE_TYPES", "NORMAL"],
        enumValue(foundryConstants, ["WALL_SENSE_TYPES", "NORMAL"], FALLBACK_WALL_SENSE_NORMAL));

    return {
        move: enumValue(foundryConstants, ["WALL_MOVEMENT_TYPES", "NORMAL"], FALLBACK_WALL_MOVEMENT_NORMAL),
        sight: normalSense,
        light: normalSense,
        sound: normalSense,
        door: enumValue(foundryConstants, ["WALL_DOOR_TYPES", "NONE"], WALL_DOOR_NONE),
        ds: enumValue(foundryConstants, ["WALL_DOOR_STATES", "CLOSED"], WALL_DOOR_CLOSED)
    };
}

export function getSceneWallDocuments(scene = null) {
    return collectionContents(scene?.walls).filter(Boolean);
}

export function buildRegularSquareGridModel(scene = null, { imageWidth = 0, imageHeight = 0 } = {}) {
    const gridType = Number(scene?.grid?.type ?? GRID_TYPES.GRIDLESS);
    const cellSize = positiveNumber(scene?.grid?.size, 0);
    if (gridType !== GRID_TYPES.SQUARE || cellSize < 4) return null;

    const width = positiveNumber(scene?.width, positiveNumber(scene?.dimensions?.sceneWidth, imageWidth));
    const height = positiveNumber(scene?.height, positiveNumber(scene?.dimensions?.sceneHeight, imageHeight));
    if (width <= 0 || height <= 0) return null;

    return {
        type: gridType,
        cellSize,
        width,
        height,
        offsetX: -finiteNumber(scene?.shiftX, 0),
        offsetY: -finiteNumber(scene?.shiftY, 0)
    };
}

export function buildGridLineCoordinates({ offset = 0, cellSize = 100, max = 0 } = {}) {
    const size = positiveNumber(cellSize, 0);
    const extent = positiveNumber(max, 0);
    if (size <= 0 || extent <= 0) return [];

    const phase = finiteNumber(offset, 0);
    const first = Math.ceil((0 - phase) / size);
    const last = Math.floor((extent - phase) / size);
    const lines = [];
    for (let index = first; index <= last; index += 1) {
        const value = Math.round(phase + (index * size));
        if (value >= 0 && value <= extent) lines.push(value);
    }
    return [...new Set(lines)].sort((left, right) => left - right);
}

function luminanceAt(imageData, width, height, x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    const index = ((py * width) + px) * 4;
    const data = imageData?.data ?? imageData;
    if (!data || index + 2 >= data.length) return null;
    return (0.2126 * data[index]) + (0.7152 * data[index + 1]) + (0.0722 * data[index + 2]);
}

export function scoreGridLineSegment({
    imageData = null,
    width = 0,
    height = 0,
    orientation = "vertical",
    fixed = 0,
    from = 0,
    to = 0,
    sampleRadius = REGULAR_GRID_WALL_DETECTION_DEFAULTS.sampleRadius,
    darkLuminance = REGULAR_GRID_WALL_DETECTION_DEFAULTS.darkLuminance
} = {}) {
    const data = imageData?.data ?? imageData;
    const imageWidth = Math.round(positiveNumber(width, 0));
    const imageHeight = Math.round(positiveNumber(height, 0));
    if (!data || imageWidth <= 0 || imageHeight <= 0) return { samples: 0, darkSamples: 0, darkRatio: 0 };

    const start = Math.round(Math.min(from, to));
    const end = Math.round(Math.max(from, to));
    const radius = Math.max(0, Math.round(finiteNumber(sampleRadius, 1)));
    const threshold = finiteNumber(darkLuminance, REGULAR_GRID_WALL_DETECTION_DEFAULTS.darkLuminance);
    let samples = 0;
    let darkSamples = 0;

    for (let cursor = start; cursor <= end; cursor += 1) {
        for (let delta = -radius; delta <= radius; delta += 1) {
            const x = orientation === "vertical" ? fixed + delta : cursor;
            const y = orientation === "vertical" ? cursor : fixed + delta;
            const luminance = luminanceAt(data, imageWidth, imageHeight, x, y);
            if (luminance === null) continue;
            samples += 1;
            if (luminance <= threshold) darkSamples += 1;
        }
    }

    return {
        samples,
        darkSamples,
        darkRatio: samples > 0 ? darkSamples / samples : 0
    };
}

function segmentKey(segment) {
    return [
        segment.orientation,
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2
    ].join(":");
}

function mergeSegments(segments = []) {
    const sorted = [...segments].sort((left, right) => {
        if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
        if (left.orientation === "vertical") return (left.x1 - right.x1) || (left.y1 - right.y1);
        return (left.y1 - right.y1) || (left.x1 - right.x1);
    });
    const merged = [];

    for (const segment of sorted) {
        const previous = merged.at(-1);
        if (
            previous
            && previous.orientation === segment.orientation
            && previous.type === segment.type
            && (
                segment.orientation === "vertical"
                    ? previous.x1 === segment.x1 && previous.y2 === segment.y1
                    : previous.y1 === segment.y1 && previous.x2 === segment.x1
            )
        ) {
            previous.x2 = segment.x2;
            previous.y2 = segment.y2;
            previous.score = Math.max(previous.score, segment.score);
            continue;
        }
        merged.push({ ...segment });
    }

    return merged;
}

function pointKey(x, y) {
    return `${Math.round(x)}:${Math.round(y)}`;
}

function between(value, min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return value >= low && value <= high;
}

export function buildDetectedWallIntersections(segments = []) {
    const points = new Map();
    const endpointCounts = new Map();
    const walls = Array.from(segments ?? []).filter(Boolean);

    const addPoint = (x, y) => {
        const key = pointKey(x, y);
        if (!points.has(key)) points.set(key, { x: Math.round(x), y: Math.round(y) });
    };

    const countEndpoint = (x, y) => {
        const key = pointKey(x, y);
        endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1);
    };

    for (const segment of walls) {
        countEndpoint(segment.x1, segment.y1);
        countEndpoint(segment.x2, segment.y2);
    }

    for (const [key, count] of endpointCounts.entries()) {
        if (count > 1) {
            const [x, y] = key.split(":").map((value) => Number.parseInt(value, 10));
            addPoint(x, y);
        }
    }

    for (let index = 0; index < walls.length; index += 1) {
        const left = walls[index];
        for (let inner = index + 1; inner < walls.length; inner += 1) {
            const right = walls[inner];

            if (left.orientation === right.orientation) continue;

            const vertical = left.orientation === "vertical" ? left : right;
            const horizontal = left.orientation === "horizontal" ? left : right;
            const x = Math.round(vertical.x1);
            const y = Math.round(horizontal.y1);

            if (
                between(x, horizontal.x1, horizontal.x2)
                && between(y, vertical.y1, vertical.y2)
            ) {
                addPoint(x, y);
            }
        }
    }

    return [...points.values()].sort((left, right) => (left.y - right.y) || (left.x - right.x));
}

export function detectRegularGridWallSegments({
    imageData = null,
    width = 0,
    height = 0,
    scene = null,
    grid = null,
    options = {}
} = {}) {
    const imageWidth = Math.round(positiveNumber(width, imageData?.width));
    const imageHeight = Math.round(positiveNumber(height, imageData?.height));
    const gridModel = grid ?? buildRegularSquareGridModel(scene, {
        imageWidth,
        imageHeight
    });
    if (!gridModel) return { ok: false, reason: "unsupported-grid", segments: [] };

    const settings = {
        ...REGULAR_GRID_WALL_DETECTION_DEFAULTS,
        ...options
    };
    const verticalLines = buildGridLineCoordinates({
        offset: gridModel.offsetX,
        cellSize: gridModel.cellSize,
        max: imageWidth || gridModel.width
    });
    const horizontalLines = buildGridLineCoordinates({
        offset: gridModel.offsetY,
        cellSize: gridModel.cellSize,
        max: imageHeight || gridModel.height
    });
    const inset = Math.max(0, Math.round(gridModel.cellSize * finiteNumber(settings.insetRatio, 0)));
    const detected = [];

    for (const x of verticalLines) {
        for (let index = 0; index < horizontalLines.length - 1; index += 1) {
            const y1 = horizontalLines[index];
            const y2 = horizontalLines[index + 1];
            if (y2 - y1 < settings.minSegmentPixels) continue;
            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                orientation: "vertical",
                fixed: x,
                from: y1 + inset,
                to: y2 - inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({ orientation: "vertical", type: "wall", x1: x, y1, x2: x, y2, score: score.darkRatio });
            }
        }
    }

    for (const y of horizontalLines) {
        for (let index = 0; index < verticalLines.length - 1; index += 1) {
            const x1 = verticalLines[index];
            const x2 = verticalLines[index + 1];
            if (x2 - x1 < settings.minSegmentPixels) continue;
            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                orientation: "horizontal",
                fixed: y,
                from: x1 + inset,
                to: x2 - inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({ orientation: "horizontal", type: "wall", x1, y1: y, x2, y2: y, score: score.darkRatio });
            }
        }
    }

    const unique = new Map();
    for (const segment of detected) unique.set(segmentKey(segment), segment);
    const segments = mergeSegments([...unique.values()]);
    return {
        ok: true,
        reason: "",
        grid: gridModel,
        segments
    };
}

export function buildDetectedWallDocumentData(segments = [], { foundryConstants = globalThis.CONST } = {}) {
    const defaults = buildWallDocumentDefaults({ foundryConstants });
    return Array.from(segments ?? []).map((segment) => ({
        c: [
            Math.round(segment.x1),
            Math.round(segment.y1),
            Math.round(segment.x2),
            Math.round(segment.y2)
        ],
        move: defaults.move,
        sight: defaults.sight,
        light: defaults.light,
        sound: defaults.sound,
        door: defaults.door,
        ds: defaults.ds,
        flags: {
            "turn-of-the-century": {
                detectedWall: true,
                detectedKind: String(segment.type ?? "wall"),
                detectionScore: Number(segment.score ?? 0)
            }
        }
    }));
}

export async function applyDetectedWallsToScene({
    scene = null,
    wallData = [],
    confirmReplacement = () => true
} = {}) {
    if (!scene) return { ok: false, reason: "missing-scene", created: [] };
    if (typeof scene.createEmbeddedDocuments !== "function") {
        return { ok: false, reason: "wall-creation-unavailable", created: [] };
    }

    const existingWalls = getSceneWallDocuments(scene);
    if (existingWalls.length > 0) {
        const confirmed = await confirmReplacement(existingWalls);
        if (!confirmed) return { ok: false, reason: "replacement-cancelled", created: [] };

        const wallIds = existingWalls.map(documentId).filter(Boolean);
        if (wallIds.length && typeof scene.deleteEmbeddedDocuments !== "function") {
            return { ok: false, reason: "wall-deletion-unavailable", created: [] };
        }
        if (wallIds.length && typeof scene.deleteEmbeddedDocuments === "function") {
            await scene.deleteEmbeddedDocuments("Wall", wallIds);
        }
    }

    const documents = Array.from(wallData ?? []);
    if (!documents.length) return { ok: true, reason: "", created: [] };
    const created = await scene.createEmbeddedDocuments("Wall", documents);
    return {
        ok: true,
        reason: "",
        created: created ?? []
    };
}
