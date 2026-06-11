import {
    buildRegularSquareGridModel,
    buildWallDocumentDefaults,
    getSceneWallDocuments
} from "./scene-wall-detection.mjs";

const DEFAULT_WALL_CLICK_TOLERANCE = 18;
const WALL_DOOR_DOOR = 1;
const WALL_SENSE_NONE = 0;

function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function enumValue(constants, path = [], fallback) {
    let cursor = constants;
    for (const key of path) cursor = cursor?.[key];
    return cursor ?? fallback;
}

function documentId(document) {
    return String(document?.id ?? document?._id ?? "").trim();
}

function documentSource(document) {
    if (!document) return {};
    if (typeof document.toObject === "function") return document.toObject();
    if (typeof document.toJSON === "function") return document.toJSON();
    return document._source ?? document;
}

function wallCoordinates(wall) {
    const coords = wall?.c ?? wall?._source?.c ?? wall?.toObject?.()?.c ?? [];
    if (!Array.isArray(coords) || coords.length < 4) return null;
    const [x1, y1, x2, y2] = coords.map((value) => Number(value));
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return { x1, y1, x2, y2 };
}

function pointKey(point) {
    return `${Math.round(point?.x ?? 0)}:${Math.round(point?.y ?? 0)}`;
}

function pointsEqual(left, right) {
    return pointKey(left) === pointKey(right);
}

function distance(left, right) {
    return Math.hypot(finiteNumber(left?.x) - finiteNumber(right?.x), finiteNumber(left?.y) - finiteNumber(right?.y));
}

function distancePointToSegment(point, segment) {
    const px = finiteNumber(point?.x);
    const py = finiteNumber(point?.y);
    const x1 = finiteNumber(segment?.x1);
    const y1 = finiteNumber(segment?.y1);
    const x2 = finiteNumber(segment?.x2);
    const y2 = finiteNumber(segment?.y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) return distance({ x: px, y: py }, { x: x1, y: y1 });
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    return distance({ x: px, y: py }, { x: x1 + t * dx, y: y1 + t * dy });
}

function isPointOnSegment(point, segment, tolerance = 0.5) {
    const distanceToLine = distancePointToSegment(point, segment);
    if (distanceToLine > tolerance) return false;
    const x = finiteNumber(point?.x);
    const y = finiteNumber(point?.y);
    return x >= Math.min(segment.x1, segment.x2) - tolerance
        && x <= Math.max(segment.x1, segment.x2) + tolerance
        && y >= Math.min(segment.y1, segment.y2) - tolerance
        && y <= Math.max(segment.y1, segment.y2) + tolerance;
}

function orientationKey(segment) {
    const dx = Math.round(segment.x2 - segment.x1);
    const dy = Math.round(segment.y2 - segment.y1);
    if (dx === 0) return "vertical";
    if (dy === 0) return "horizontal";
    return Math.sign(dx) === Math.sign(dy) ? "diagonal-backslash" : "diagonal-slash";
}

function areCollinear(left, right, tolerance = 0.5) {
    if (orientationKey(left) !== orientationKey(right)) return false;
    const dx = left.x2 - left.x1;
    const dy = left.y2 - left.y1;
    const crossStart = dx * (right.y1 - left.y1) - dy * (right.x1 - left.x1);
    const crossEnd = dx * (right.y2 - left.y1) - dy * (right.x2 - left.x1);
    return Math.abs(crossStart) <= tolerance && Math.abs(crossEnd) <= tolerance;
}

function clickTolerance(grid = null) {
    return Math.max(DEFAULT_WALL_CLICK_TOLERANCE, positiveNumber(grid?.cellSize, 0) * 0.22);
}

export function buildWallEditingGrid(scene = null) {
    return buildRegularSquareGridModel(scene);
}

export function snapPointToGridIntersection(point = null, grid = null) {
    const cellSize = positiveNumber(grid?.cellSize, 0);
    if (!point || cellSize <= 0) return null;
    const offsetX = finiteNumber(grid?.offsetX, 0);
    const offsetY = finiteNumber(grid?.offsetY, 0);
    const width = positiveNumber(grid?.width, Number.POSITIVE_INFINITY);
    const height = positiveNumber(grid?.height, Number.POSITIVE_INFINITY);
    const x = Math.round((finiteNumber(point.x) - offsetX) / cellSize) * cellSize + offsetX;
    const y = Math.round((finiteNumber(point.y) - offsetY) / cellSize) * cellSize + offsetY;
    return {
        x: Math.max(0, Math.min(width, Math.round(x))),
        y: Math.max(0, Math.min(height, Math.round(y)))
    };
}

export function findNearestWallAtPoint({ walls = [], point = null, grid = null, tolerance = null } = {}) {
    if (!point) return null;
    const maximumDistance = positiveNumber(tolerance, clickTolerance(grid));
    let nearest = null;

    for (const wall of Array.from(walls ?? [])) {
        const segment = wallCoordinates(wall);
        if (!segment) continue;
        const distanceToWall = distancePointToSegment(point, segment);
        if (distanceToWall > maximumDistance) continue;
        if (!nearest || distanceToWall < nearest.distance) {
            nearest = { wall, segment, distance: distanceToWall };
        }
    }

    return nearest;
}

function gridPointsOnSegment(segment, gridModel) {
    const cellSize = positiveNumber(gridModel?.cellSize, 0);
    if (cellSize <= 0) return [];
    const offsetX = finiteNumber(gridModel?.offsetX, 0);
    const offsetY = finiteNumber(gridModel?.offsetY, 0);
    const points = [];
    const minX = Math.min(segment.x1, segment.x2);
    const maxX = Math.max(segment.x1, segment.x2);
    const minY = Math.min(segment.y1, segment.y2);
    const maxY = Math.max(segment.y1, segment.y2);
    const startColumn = Math.ceil((minX - offsetX) / cellSize);
    const endColumn = Math.floor((maxX - offsetX) / cellSize);
    const startRow = Math.ceil((minY - offsetY) / cellSize);
    const endRow = Math.floor((maxY - offsetY) / cellSize);

    for (let column = startColumn; column <= endColumn; column += 1) {
        for (let row = startRow; row <= endRow; row += 1) {
            const point = {
                x: Math.round(offsetX + column * cellSize),
                y: Math.round(offsetY + row * cellSize)
            };
            if (isPointOnSegment(point, segment) && !points.some((candidate) => pointsEqual(candidate, point))) {
                points.push(point);
            }
        }
    }

    return points;
}

export function findSplitPoint({ segment = null, point = null, grid = null } = {}) {
    if (!segment || !point || !grid) return null;
    const endpoints = [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }];
    const candidates = gridPointsOnSegment(segment, grid)
        .filter((candidate) => !endpoints.some((endpoint) => pointsEqual(endpoint, candidate)));
    if (!candidates.length) return null;
    return candidates.reduce((nearest, candidate) => {
        if (!nearest) return candidate;
        return distance(candidate, point) < distance(nearest, point) ? candidate : nearest;
    }, null);
}

function baseWallData(coords, { sourceWall = null, wallType = "wall", foundryConstants = globalThis.CONST } = {}) {
    const source = documentSource(sourceWall);
    const defaults = buildWallDocumentDefaults({ foundryConstants });
    const kind = String(source.flags?.["turn-of-the-century"]?.wallKind ?? wallType ?? "wall");
    const data = {
        move: source.move ?? defaults.move,
        sight: source.sight ?? defaults.sight,
        light: source.light ?? defaults.light,
        sound: source.sound ?? defaults.sound,
        door: source.door ?? defaults.door,
        ds: source.ds ?? defaults.ds,
        flags: {
            ...(source.flags ?? {}),
            "turn-of-the-century": {
                ...(source.flags?.["turn-of-the-century"] ?? {}),
                manualWall: true,
                wallKind: kind
            }
        },
        c: coords.map((value) => Math.round(Number(value)))
    };

    if (kind === "door") {
        data.door = enumValue(foundryConstants, ["WALL_DOOR_TYPES", "DOOR"], WALL_DOOR_DOOR);
        data.ds = enumValue(foundryConstants, ["WALL_DOOR_STATES", "CLOSED"], defaults.ds);
    } else if (kind === "window") {
        const noneSense = enumValue(foundryConstants, ["EDGE_SENSE_TYPES", "NONE"],
            enumValue(foundryConstants, ["WALL_SENSE_TYPES", "NONE"], WALL_SENSE_NONE));
        data.sight = noneSense;
        data.light = noneSense;
        data.door = defaults.door;
    }

    return data;
}

export function buildManualWallDocumentData({ start = null, end = null, wallType = "wall", sourceWall = null, foundryConstants = globalThis.CONST } = {}) {
    if (!start || !end || pointsEqual(start, end)) return null;
    return baseWallData([start.x, start.y, end.x, end.y], { sourceWall, wallType, foundryConstants });
}

export async function addWallSegmentToScene({ scene = null, start = null, end = null, wallType = "wall", foundryConstants = globalThis.CONST } = {}) {
    if (!scene || typeof scene.createEmbeddedDocuments !== "function") return { ok: false, reason: "wall-creation-unavailable" };
    const data = buildManualWallDocumentData({ start, end, wallType, foundryConstants });
    if (!data) return { ok: false, reason: "invalid-wall-segment" };
    const created = await scene.createEmbeddedDocuments("Wall", [data]);
    return { ok: true, reason: "", created: created ?? [] };
}

export async function removeWallSegmentAtPoint({ scene = null, point = null, grid = null } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function") return { ok: false, reason: "wall-deletion-unavailable" };
    const nearest = findNearestWallAtPoint({ walls: getSceneWallDocuments(scene), point, grid });
    const id = documentId(nearest?.wall);
    if (!nearest || !id) return { ok: false, reason: "wall-not-found" };
    await scene.deleteEmbeddedDocuments("Wall", [id]);
    return { ok: true, reason: "", deleted: [id] };
}

export async function splitWallSegmentAtPoint({ scene = null, point = null, grid = null } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function" || typeof scene.createEmbeddedDocuments !== "function") {
        return { ok: false, reason: "wall-update-unavailable" };
    }

    const nearest = findNearestWallAtPoint({ walls: getSceneWallDocuments(scene), point, grid });
    const id = documentId(nearest?.wall);
    if (!nearest || !id) return { ok: false, reason: "wall-not-found" };

    const splitPoint = findSplitPoint({ segment: nearest.segment, point, grid });
    if (!splitPoint) return { ok: false, reason: "invalid-split-point" };

    const start = { x: nearest.segment.x1, y: nearest.segment.y1 };
    const end = { x: nearest.segment.x2, y: nearest.segment.y2 };
    const first = buildManualWallDocumentData({ start, end: splitPoint, sourceWall: nearest.wall, wallType: "wall" });
    const second = buildManualWallDocumentData({ start: splitPoint, end, sourceWall: nearest.wall, wallType: "wall" });
    await scene.deleteEmbeddedDocuments("Wall", [id]);
    const created = await scene.createEmbeddedDocuments("Wall", [first, second].filter(Boolean));
    return { ok: true, reason: "", deleted: [id], created: created ?? [], splitPoint };
}

function sharedEndpoint(left, right) {
    const leftStart = { x: left.x1, y: left.y1 };
    const leftEnd = { x: left.x2, y: left.y2 };
    const rightStart = { x: right.x1, y: right.y1 };
    const rightEnd = { x: right.x2, y: right.y2 };
    if (pointsEqual(leftStart, rightStart)) return { shared: leftStart, outer: [leftEnd, rightEnd] };
    if (pointsEqual(leftStart, rightEnd)) return { shared: leftStart, outer: [leftEnd, rightStart] };
    if (pointsEqual(leftEnd, rightStart)) return { shared: leftEnd, outer: [leftStart, rightEnd] };
    if (pointsEqual(leftEnd, rightEnd)) return { shared: leftEnd, outer: [leftStart, rightStart] };
    return null;
}

export function findJoinCandidate({ walls = [], point = null, grid = null } = {}) {
    if (!point) return null;
    const wallList = Array.from(walls ?? []).map((wall) => ({ wall, segment: wallCoordinates(wall), id: documentId(wall) }))
        .filter((entry) => entry.segment && entry.id);
    const maximumDistance = clickTolerance(grid);

    for (let index = 0; index < wallList.length; index += 1) {
        for (let inner = index + 1; inner < wallList.length; inner += 1) {
            const left = wallList[index];
            const right = wallList[inner];
            const join = sharedEndpoint(left.segment, right.segment);
            if (!join || distance(join.shared, point) > maximumDistance) continue;
            if (orientationKey(left.segment) !== orientationKey(right.segment)) continue;
            if (!areCollinear(left.segment, right.segment)) continue;
            return {
                walls: [left.wall, right.wall],
                ids: [left.id, right.id],
                start: join.outer[0],
                end: join.outer[1],
                joinPoint: join.shared
            };
        }
    }

    return null;
}

export async function joinWallSegmentsAtPoint({ scene = null, point = null, grid = null } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function" || typeof scene.createEmbeddedDocuments !== "function") {
        return { ok: false, reason: "wall-update-unavailable" };
    }

    const candidate = findJoinCandidate({ walls: getSceneWallDocuments(scene), point, grid });
    if (!candidate) return { ok: false, reason: "join-not-found" };
    const data = buildManualWallDocumentData({
        start: candidate.start,
        end: candidate.end,
        sourceWall: candidate.walls[0],
        wallType: "wall"
    });
    if (!data) return { ok: false, reason: "invalid-wall-segment" };

    await scene.deleteEmbeddedDocuments("Wall", candidate.ids);
    const created = await scene.createEmbeddedDocuments("Wall", [data]);
    return { ok: true, reason: "", deleted: candidate.ids, created: created ?? [], joinPoint: candidate.joinPoint };
}
