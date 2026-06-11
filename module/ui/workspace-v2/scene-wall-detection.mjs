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
    minSegmentPixels: 8,
    minContrast: 20,
    bgOffset: 6
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

function getCellAverageLuminance(imageData, width, height, x1, y1, x2, y2) {
    const data = imageData?.data ?? imageData;
    if (!data) return 128;
    const rawMinX = Math.min(x1, x2);
    const rawMaxX = Math.max(x1, x2);
    const rawMinY = Math.min(y1, y2);
    const rawMaxY = Math.max(y1, y2);

    const cellW = rawMaxX - rawMinX;
    const cellH = rawMaxY - rawMinY;
    const insetX = Math.max(1, Math.round(cellW * 0.15));
    const insetY = Math.max(1, Math.round(cellH * 0.15));

    const minX = Math.max(0, Math.floor(rawMinX + insetX));
    const maxX = Math.min(width - 1, Math.ceil(rawMaxX - insetX));
    const minY = Math.max(0, Math.floor(rawMinY + insetY));
    const maxY = Math.min(height - 1, Math.ceil(rawMaxY - insetY));

    if (maxX < minX || maxY < minY) return 128;

    // Sample a 5x5 grid of pixels within the inset bounding box
    let sum = 0;
    let count = 0;
    const stepsX = 4;
    const stepsY = 4;
    for (let i = 0; i <= stepsX; i += 1) {
        const px = minX + (i / stepsX) * (maxX - minX);
        for (let j = 0; j <= stepsY; j += 1) {
            const py = minY + (j / stepsY) * (maxY - minY);
            const lum = luminanceAt(data, width, height, px, py);
            if (lum !== null) {
                sum += lum;
                count += 1;
            }
        }
    }
    return count > 0 ? sum / count : 128;
}

export function scoreGridLineSegment({
    imageData = null,
    width = 0,
    height = 0,
    orientation = "vertical",
    fixed = 0,
    from = 0,
    to = 0,
    x1,
    y1,
    x2,
    y2,
    sampleRadius = REGULAR_GRID_WALL_DETECTION_DEFAULTS.sampleRadius,
    darkLuminance = REGULAR_GRID_WALL_DETECTION_DEFAULTS.darkLuminance,
    minContrast = REGULAR_GRID_WALL_DETECTION_DEFAULTS.minContrast,
    bgOffset = REGULAR_GRID_WALL_DETECTION_DEFAULTS.bgOffset,
    cellAvg1 = null,
    cellAvg2 = null
} = {}) {
    const data = imageData?.data ?? imageData;
    const imageWidth = Math.round(positiveNumber(width, 0));
    const imageHeight = Math.round(positiveNumber(height, 0));
    if (!data || imageWidth <= 0 || imageHeight <= 0) return { samples: 0, darkSamples: 0, darkRatio: 0 };

    let startX = x1;
    let y1Val = y1;
    let endX = x2;
    let y2Val = y2;

    if (startX === undefined) {
        if (orientation === "vertical") {
            startX = fixed;
            y1Val = from;
            endX = fixed;
            y2Val = to;
        } else {
            startX = from;
            y1Val = fixed;
            endX = to;
            y2Val = fixed;
        }
    }

    const dx = endX - startX;
    const dy = y2Val - y1Val;
    const length = Math.hypot(dx, dy);
    const steps = Math.round(length);
    const stepX = steps > 0 ? dx / steps : 0;
    const stepY = steps > 0 ? dy / steps : 0;

    // Perpendicular vector for background sampling and sample radius
    const orthoX = steps > 0 ? -dy / length : 0;
    const orthoY = steps > 0 ? dx / length : 0;

    const radius = Math.max(0, Math.round(finiteNumber(sampleRadius, 1)));
    const threshold = finiteNumber(darkLuminance, REGULAR_GRID_WALL_DETECTION_DEFAULTS.darkLuminance);
    const contrastMin = finiteNumber(minContrast, REGULAR_GRID_WALL_DETECTION_DEFAULTS.minContrast);
    const offsetBg = Math.max(1, Math.round(finiteNumber(bgOffset, REGULAR_GRID_WALL_DETECTION_DEFAULTS.bgOffset)));
    let samples = 0;
    let darkSamples = 0;

    for (let step = 0; step <= steps; step += 1) {
        const cx = startX + step * stepX;
        const cy = y1Val + step * stepY;

        for (let delta = -radius; delta <= radius; delta += 1) {
            const x = cx + orthoX * delta;
            const y = cy + orthoY * delta;

            const luminance = luminanceAt(data, imageWidth, imageHeight, x, y);
            if (luminance === null) continue;
            samples += 1;

            if (luminance <= threshold) {
                const bgX1 = cx - orthoX * offsetBg;
                const bgY1 = cy - orthoY * offsetBg;
                const bgX2 = cx + orthoX * offsetBg;
                const bgY2 = cy + orthoY * offsetBg;

                let bgLum1 = luminanceAt(data, imageWidth, imageHeight, bgX1, bgY1);
                let bgLum2 = luminanceAt(data, imageWidth, imageHeight, bgX2, bgY2);

                if ((orientation === "vertical" && orthoX < 0) || (orientation === "horizontal" && orthoY < 0)) {
                    const temp = bgLum1;
                    bgLum1 = bgLum2;
                    bgLum2 = temp;
                }

                let hasContrast1 = false;
                if (bgLum1 === null) {
                    hasContrast1 = true;
                } else if (bgLum1 - luminance >= contrastMin) {
                    hasContrast1 = true;
                } else if (cellAvg1 !== null && cellAvg1 - luminance >= contrastMin && cellAvg1 - bgLum1 >= contrastMin) {
                    hasContrast1 = true;
                }

                let hasContrast2 = false;
                if (bgLum2 === null) {
                    hasContrast2 = true;
                } else if (bgLum2 - luminance >= contrastMin) {
                    hasContrast2 = true;
                } else if (cellAvg2 !== null && cellAvg2 - luminance >= contrastMin && cellAvg2 - bgLum2 >= contrastMin) {
                    hasContrast2 = true;
                }

                const isVoid1 = cellAvg1 === null || cellAvg1 < 50;
                const isVoid2 = cellAvg2 === null || cellAvg2 < 50;

                let wallDetected = false;
                if (hasContrast1 && hasContrast2) {
                    wallDetected = true;
                } else if (isVoid1 && hasContrast2) {
                    wallDetected = true;
                } else if (isVoid2 && hasContrast1) {
                    wallDetected = true;
                }

                if (wallDetected) {
                    darkSamples += 1;
                }
            }
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

function getSegmentLineId(segment) {
    if (segment.orientation === "vertical") return segment.x1;
    if (segment.orientation === "horizontal") return segment.y1;
    if (segment.orientation === "diagonal-backslash") return segment.y1 - segment.x1;
    if (segment.orientation === "diagonal-slash") return segment.y1 + segment.x1;
    return 0;
}

function mergeSegments(segments = []) {
    const sorted = [...segments].sort((left, right) => {
        if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
        const leftId = getSegmentLineId(left);
        const rightId = getSegmentLineId(right);
        if (leftId !== rightId) return leftId - rightId;
        return left.orientation === "vertical" ? left.y1 - right.y1 : left.x1 - right.x1;
    });
    const merged = [];

    for (const segment of sorted) {
        const previous = merged.at(-1);
        if (
            previous
            && previous.orientation === segment.orientation
            && previous.type === segment.type
            && previous.x2 === segment.x1
            && previous.y2 === segment.y1
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

export function filterQualitativeWalls(segments = []) {
    // 1. Build graph to identify right-angle vs diagonal conflicts
    const adjacency = new Map();
    const addAdjacency = (key, segment) => {
        if (!adjacency.has(key)) {
            adjacency.set(key, { rightAngle: 0, diagonal: 0, segments: [] });
        }
        const entry = adjacency.get(key);
        entry.segments.push(segment);
        const isDiag = segment.orientation.startsWith("diagonal-");
        if (isDiag) {
            entry.diagonal += 1;
        } else {
            entry.rightAngle += 1;
        }
    };

    for (const segment of segments) {
        const key1 = `${Math.round(segment.x1)}:${Math.round(segment.y1)}`;
        const key2 = `${Math.round(segment.x2)}:${Math.round(segment.y2)}`;
        addAdjacency(key1, segment);
        addAdjacency(key2, segment);
    }

    // 2. Identify diagonal segments that share a vertex with a right-angle segment
    const discardedDiagonals = new Set();
    for (const [key, entry] of adjacency.entries()) {
        if (entry.rightAngle > 0 && entry.diagonal > 0) {
            for (const segment of entry.segments) {
                if (segment.orientation.startsWith("diagonal-")) {
                    discardedDiagonals.add(segment);
                }
            }
        }
    }

    // Filter out the discarded diagonal segments
    const remainingAfterConflict = segments.filter((s) => !discardedDiagonals.has(s));

    // 3. Build graph for remaining segments to find connected components
    const graph = new Map();
    const addGraphEdge = (u, v, segment) => {
        if (!graph.has(u)) graph.set(u, []);
        graph.get(u).push({ neighbor: v, segment });
    };

    for (const segment of remainingAfterConflict) {
        const u = `${Math.round(segment.x1)}:${Math.round(segment.y1)}`;
        const v = `${Math.round(segment.x2)}:${Math.round(segment.y2)}`;
        addGraphEdge(u, v, segment);
        addGraphEdge(v, u, segment);
    }

    // Find connected components of segments
    const visitedVertices = new Set();
    const finalSegments = [];

    for (const segment of remainingAfterConflict) {
        const startU = `${Math.round(segment.x1)}:${Math.round(segment.y1)}`;
        if (visitedVertices.has(startU)) continue;

        // BFS to find all vertices and segments in this component
        const componentVertices = new Set();
        const componentSegments = new Set();
        const queue = [startU];
        componentVertices.add(startU);

        while (queue.length > 0) {
            const curr = queue.shift();
            const edges = graph.get(curr) ?? [];
            for (const edge of edges) {
                componentSegments.add(edge.segment);
                if (!componentVertices.has(edge.neighbor)) {
                    componentVertices.add(edge.neighbor);
                    queue.push(edge.neighbor);
                }
            }
        }

        // Add all vertices in the component to visited
        for (const vertex of componentVertices) {
            visitedVertices.add(vertex);
        }

        // Apply proximity / enclosure rule:
        // A wall by itself (single segment component) is discarded.
        if (componentSegments.size > 1) {
            finalSegments.push(...componentSegments);
        }
    }

    return finalSegments;
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

    const cols = verticalLines.length - 1;
    const rows = horizontalLines.length - 1;
    const cellAverages = Array.from({ length: cols }, () => new Float64Array(rows));

    for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
            cellAverages[c][r] = getCellAverageLuminance(
                imageData,
                imageWidth,
                imageHeight,
                verticalLines[c],
                horizontalLines[r],
                verticalLines[c + 1],
                horizontalLines[r + 1]
            );
        }
    }

    for (let c = 0; c < verticalLines.length; c += 1) {
        const x = verticalLines[c];
        for (let index = 0; index < horizontalLines.length - 1; index += 1) {
            const y1 = horizontalLines[index];
            const y2 = horizontalLines[index + 1];
            if (y2 - y1 < settings.minSegmentPixels) continue;

            const cellAvg1 = c > 0 ? cellAverages[c - 1][index] : null;
            const cellAvg2 = c < cols ? cellAverages[c][index] : null;

            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                orientation: "vertical",
                fixed: x,
                from: y1 + inset,
                to: y2 - inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance,
                minContrast: settings.minContrast,
                bgOffset: settings.bgOffset,
                cellAvg1,
                cellAvg2
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({ orientation: "vertical", type: "wall", x1: x, y1, x2: x, y2, score: score.darkRatio });
            }
        }
    }

    for (let r = 0; r < horizontalLines.length; r += 1) {
        const y = horizontalLines[r];
        for (let index = 0; index < verticalLines.length - 1; index += 1) {
            const x1 = verticalLines[index];
            const x2 = verticalLines[index + 1];
            if (x2 - x1 < settings.minSegmentPixels) continue;

            const cellAvg1 = r > 0 ? cellAverages[index][r - 1] : null;
            const cellAvg2 = r < rows ? cellAverages[index][r] : null;

            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                orientation: "horizontal",
                fixed: y,
                from: x1 + inset,
                to: x2 - inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance,
                minContrast: settings.minContrast,
                bgOffset: settings.bgOffset,
                cellAvg1,
                cellAvg2
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({ orientation: "horizontal", type: "wall", x1, y1: y, x2, y2: y, score: score.darkRatio });
            }
        }
    }

    // Scan diagonal-backslash lines (top-left to bottom-right)
    for (let c = 0; c < verticalLines.length - 1; c += 1) {
        const x1 = verticalLines[c];
        const x2 = verticalLines[c + 1];
        const cellSize = x2 - x1;
        if (cellSize < settings.minSegmentPixels) continue;

        for (let r = 0; r < horizontalLines.length - 1; r += 1) {
            const y1 = horizontalLines[r];
            const y2 = horizontalLines[r + 1];

            const cellAvg = cellAverages[c][r];

            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                x1: x1 + inset,
                y1: y1 + inset,
                x2: x2 - inset,
                y2: y2 - inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance,
                minContrast: settings.minContrast,
                bgOffset: settings.bgOffset,
                cellAvg1: cellAvg,
                cellAvg2: cellAvg
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({
                    orientation: "diagonal-backslash",
                    type: "wall",
                    x1,
                    y1,
                    x2,
                    y2,
                    score: score.darkRatio
                });
            }
        }
    }

    // Scan diagonal-slash lines (bottom-left to top-right)
    for (let c = 0; c < verticalLines.length - 1; c += 1) {
        const x1 = verticalLines[c];
        const x2 = verticalLines[c + 1];
        const cellSize = x2 - x1;
        if (cellSize < settings.minSegmentPixels) continue;

        for (let r = 0; r < horizontalLines.length - 1; r += 1) {
            const y1 = horizontalLines[r];
            const y2 = horizontalLines[r + 1];

            const cellAvg = cellAverages[c][r];

            const score = scoreGridLineSegment({
                imageData,
                width: imageWidth,
                height: imageHeight,
                x1: x1 + inset,
                y1: y2 - inset,
                x2: x2 - inset,
                y2: y1 + inset,
                sampleRadius: settings.sampleRadius,
                darkLuminance: settings.darkLuminance,
                minContrast: settings.minContrast,
                bgOffset: settings.bgOffset,
                cellAvg1: cellAvg,
                cellAvg2: cellAvg
            });
            if (score.darkRatio >= settings.minDarkRatio) {
                detected.push({
                    orientation: "diagonal-slash",
                    type: "wall",
                    x1,
                    y1: y2,
                    x2,
                    y2: y1,
                    score: score.darkRatio
                });
            }
        }
    }

    const unique = new Map();
    for (const segment of detected) unique.set(segmentKey(segment), segment);
    const segments = mergeSegments(filterQualitativeWalls([...unique.values()]));
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
