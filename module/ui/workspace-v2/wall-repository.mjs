import { buildWallDocumentDefaults, getSceneWallDocuments } from "./scene-wall-detection.mjs";
import {
    wallDocumentId,
    wallCoordinates,
    findNearestWallAtPoint,
    findSplitPoint,
    findJoinCandidate
} from "./scene-wall-editing.mjs";

const WALL_DOOR_DOOR = 1;
const WALL_SENSE_NONE = 0;

function enumValue(constants, path = [], fallback) {
    let cursor = constants;
    for (const key of path) cursor = cursor?.[key];
    return cursor ?? fallback;
}

function orientationKey(segment) {
    const dx = Math.round(segment.x2 - segment.x1);
    const dy = Math.round(segment.y2 - segment.y1);
    if (dx === 0) return "vertical";
    if (dy === 0) return "horizontal";
    return Math.sign(dx) === Math.sign(dy) ? "diagonal-backslash" : "diagonal-slash";
}

function documentSource(document) {
    if (!document) return {};
    if (typeof document.toObject === "function") return document.toObject();
    if (typeof document.toJSON === "function") return document.toJSON();
    return document._source ?? document;
}

function normalizeWallKind(value) {
    const kind = String(value ?? "").trim().toLowerCase();
    return ["wall", "door", "window", "transparent"].includes(kind) ? kind : "wall";
}

function documentWallKind(document, fallback = "wall") {
    const source = documentSource(document);
    return normalizeWallKind(source.flags?.["turn-of-the-century"]?.wallKind ?? fallback);
}

function selectedWallEntries(scene = null, ids = []) {
    const selectedIds = new Set(Array.from(ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean));
    return getSceneWallDocuments(scene).map((wall) => ({
        wall,
        id: wallDocumentId(wall),
        wallKind: documentWallKind(wall),
        segment: wallCoordinates(wall)
    })).filter((entry) => entry.id && selectedIds.has(entry.id) && entry.segment);
}

function selectedJoinGroups(entries = []) {
    const lines = new Map();
    for (const entry of entries) {
        const orientation = orientationKey(entry.segment);
        if (orientation !== "horizontal" && orientation !== "vertical") continue;
        const fixed = orientation === "horizontal" ? Math.round(entry.segment.y1) : Math.round(entry.segment.x1);
        const start = orientation === "horizontal"
            ? Math.min(entry.segment.x1, entry.segment.x2)
            : Math.min(entry.segment.y1, entry.segment.y2);
        const end = orientation === "horizontal"
            ? Math.max(entry.segment.x1, entry.segment.x2)
            : Math.max(entry.segment.y1, entry.segment.y2);
        const key = `${orientation}:${entry.wallKind}:${fixed}`;
        const list = lines.get(key) ?? [];
        list.push({ ...entry, orientation, fixed, start, end });
        lines.set(key, list);
    }

    const groups = [];
    for (const list of lines.values()) {
        list.sort((left, right) => left.start - right.start);
        let current = [];
        let currentEnd = null;
        for (const entry of list) {
            if (!current.length || entry.start <= currentEnd + 0.5) {
                current.push(entry);
                currentEnd = Math.max(currentEnd ?? entry.end, entry.end);
                continue;
            }
            if (current.length > 1) groups.push(current);
            current = [entry];
            currentEnd = entry.end;
        }
        if (current.length > 1) groups.push(current);
    }
    return groups;
}

function baseWallData(coords, { sourceWall = null, wallType = "wall", foundryConstants = globalThis.CONST } = {}) {
    const source = documentSource(sourceWall);
    const defaults = buildWallDocumentDefaults({ foundryConstants });
    const kind = documentWallKind(sourceWall, wallType);
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
    } else if (kind === "window" || kind === "transparent") {
        const noneSense = enumValue(foundryConstants, ["EDGE_SENSE_TYPES", "NONE"],
            enumValue(foundryConstants, ["WALL_SENSE_TYPES", "NONE"], WALL_SENSE_NONE));
        data.sight = noneSense;
        data.light = noneSense;
        if (kind === "transparent") data.sound = noneSense;
        data.door = defaults.door;
    }

    return data;
}

export function buildManualWallDocumentData({ start = null, end = null, wallType = "wall", sourceWall = null, foundryConstants = globalThis.CONST } = {}) {
    if (!start || !end) return null;
    const sx = Math.round(Number(start.x));
    const sy = Math.round(Number(start.y));
    const ex = Math.round(Number(end.x));
    const ey = Math.round(Number(end.y));
    if (sx === ex && sy === ey) return null;
    return baseWallData([sx, sy, ex, ey], { sourceWall, wallType, foundryConstants });
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
    const id = wallDocumentId(nearest?.wall);
    if (!nearest || !id) return { ok: false, reason: "wall-not-found" };
    await scene.deleteEmbeddedDocuments("Wall", [id]);
    return { ok: true, reason: "", deleted: [id] };
}

export async function removeWallSegmentsById({ scene = null, ids = [] } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function") return { ok: false, reason: "wall-deletion-unavailable" };
    const availableIds = new Set(getSceneWallDocuments(scene).map((wall) => wallDocumentId(wall)).filter(Boolean));
    const selectedIds = [...new Set(Array.from(ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))]
        .filter((id) => availableIds.has(id));
    if (!selectedIds.length) return { ok: false, reason: "wall-not-found" };
    await scene.deleteEmbeddedDocuments("Wall", selectedIds);
    return { ok: true, reason: "", deleted: selectedIds };
}

export function getJoinableWallIds(scene = null, ids = []) {
    const groups = selectedJoinGroups(selectedWallEntries(scene, ids));
    return [...new Set(groups.flatMap((group) => group.map((entry) => entry.id)))];
}

export async function joinWallSegmentsById({ scene = null, ids = [] } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function" || typeof scene.createEmbeddedDocuments !== "function") {
        return { ok: false, reason: "wall-update-unavailable" };
    }

    const groups = selectedJoinGroups(selectedWallEntries(scene, ids));
    if (!groups.length) return { ok: false, reason: "join-not-found" };

    const deleted = [];
    const documents = [];
    for (const group of groups) {
        const orientation = group[0].orientation;
        const fixed = group[0].fixed;
        const start = Math.min(...group.map((entry) => entry.start));
        const end = Math.max(...group.map((entry) => entry.end));
        const data = orientation === "horizontal"
            ? buildManualWallDocumentData({
                start: { x: start, y: fixed },
                end: { x: end, y: fixed },
                sourceWall: group[0].wall,
                wallType: group[0].wallKind
            })
            : buildManualWallDocumentData({
                start: { x: fixed, y: start },
                end: { x: fixed, y: end },
                sourceWall: group[0].wall,
                wallType: group[0].wallKind
            });
        if (data) {
            documents.push(data);
            deleted.push(...group.map((entry) => entry.id));
        }
    }

    if (!deleted.length || !documents.length) return { ok: false, reason: "join-not-found" };
    await scene.deleteEmbeddedDocuments("Wall", deleted);
    const created = await scene.createEmbeddedDocuments("Wall", documents);
    return { ok: true, reason: "", deleted, created: created ?? [] };
}

export async function splitWallSegmentAtPoint({ scene = null, point = null, grid = null } = {}) {
    if (!scene || typeof scene.deleteEmbeddedDocuments !== "function" || typeof scene.createEmbeddedDocuments !== "function") {
        return { ok: false, reason: "wall-update-unavailable" };
    }

    const nearest = findNearestWallAtPoint({ walls: getSceneWallDocuments(scene), point, grid });
    const id = wallDocumentId(nearest?.wall);
    if (!nearest || !id) return { ok: false, reason: "wall-not-found" };

    const splitPoint = findSplitPoint({ segment: nearest.segment, point, grid });
    if (!splitPoint) return { ok: false, reason: "invalid-split-point" };

    const start = { x: nearest.segment.x1, y: nearest.segment.y1 };
    const end = { x: nearest.segment.x2, y: nearest.segment.y2 };
    const wallType = documentWallKind(nearest.wall);
    const first = buildManualWallDocumentData({ start, end: splitPoint, sourceWall: nearest.wall, wallType });
    const second = buildManualWallDocumentData({ start: splitPoint, end, sourceWall: nearest.wall, wallType });
    await scene.deleteEmbeddedDocuments("Wall", [id]);
    const created = await scene.createEmbeddedDocuments("Wall", [first, second].filter(Boolean));
    return { ok: true, reason: "", deleted: [id], created: created ?? [], splitPoint };
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
        wallType: documentWallKind(candidate.walls[0])
    });
    if (!data) return { ok: false, reason: "invalid-wall-segment" };

    await scene.deleteEmbeddedDocuments("Wall", candidate.ids);
    const created = await scene.createEmbeddedDocuments("Wall", [data]);
    return { ok: true, reason: "", deleted: candidate.ids, created: created ?? [], joinPoint: candidate.joinPoint };
}
