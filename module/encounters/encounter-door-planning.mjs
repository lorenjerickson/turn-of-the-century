import { TOTC_ACTION_CATALOG } from "./action-catalog.mjs";
import { findReachableGridMovementCells } from "./grid-pathfinding.mjs";

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function sameEnum(left, right) {
    if (left === right) return true;
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
    return String(left ?? "") === String(right ?? "");
}

function scheduleSoon(callback) {
    if (typeof queueMicrotask === "function") {
        queueMicrotask(callback);
        return;
    }
    setTimeout(callback, 0);
}

function wallSource(wall = null) {
    return wall?._source ?? wall?.toObject?.() ?? wall ?? {};
}

function wallId(wall = null) {
    return String(wall?.id ?? wall?._id ?? wall?.document?.id ?? "").trim();
}

function wallScene(wall = null, canvas = globalThis.canvas) {
    return wall?.parent ?? wall?.document?.parent ?? canvas?.scene ?? null;
}

function sourceValue(source = {}, key = "") {
    return source[key] ?? source?._source?.[key];
}

function doorConstants(foundryConstants = globalThis.CONST) {
    return {
        doorNone: foundryConstants?.WALL_DOOR_TYPES?.NONE ?? 0,
        doorClosed: foundryConstants?.WALL_DOOR_STATES?.CLOSED ?? 0,
        doorOpen: foundryConstants?.WALL_DOOR_STATES?.OPEN ?? 1,
        doorLocked: foundryConstants?.WALL_DOOR_STATES?.LOCKED ?? 2
    };
}

function isDoorWall(wall = null, foundryConstants = globalThis.CONST) {
    const source = wallSource(wall);
    const { doorNone } = doorConstants(foundryConstants);
    const doorType = sourceValue(source, "door");
    return doorType !== undefined && !sameEnum(doorType, doorNone);
}

function isOpeningDoorChange(change = {}, foundryConstants = globalThis.CONST) {
    const ds = change?.ds ?? change?.["ds"];
    return ds !== undefined && sameEnum(ds, doorConstants(foundryConstants).doorOpen);
}

function isLockedDoor(wall = null, foundryConstants = globalThis.CONST) {
    return sameEnum(sourceValue(wallSource(wall), "ds"), doorConstants(foundryConstants).doorLocked);
}

function isClosedDoor(wall = null, foundryConstants = globalThis.CONST) {
    return sameEnum(sourceValue(wallSource(wall), "ds"), doorConstants(foundryConstants).doorClosed);
}

function combatSceneId(combat = null) {
    return String(combat?.scene?.id ?? combat?.sceneId ?? "").trim();
}

function encounterPhase(combat = null) {
    return String(combat?.phase ?? combat?.encounterState?.phase ?? combat?.encounter?.state?.phase ?? "").trim();
}

function activePlanningCombat({ game = globalThis.game, canvas = globalThis.canvas } = {}) {
    const combat = game?.combat ?? game?.combats?.active ?? null;
    const sceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
    if (!combat?.id || encounterPhase(combat) !== "planning") return null;
    const combatScene = combatSceneId(combat);
    if (combatScene && sceneId && combatScene !== sceneId) return null;
    return combat;
}

function tokenIds(token = null) {
    return new Set([
        token?.id,
        token?._id,
        token?.document?.id,
        token?.document?._id
    ].map((id) => String(id ?? "").trim()).filter(Boolean));
}

function getSceneToken(scene = null, tokenId = "", canvas = globalThis.canvas) {
    const id = String(tokenId ?? "").trim();
    if (!id) return null;
    const sources = [canvas?.tokens?.placeables, scene?.tokens];
    for (const source of sources) {
        for (const token of collectionContents(source)) {
            if (tokenIds(token).has(id)) return token;
        }
    }
    return null;
}

function tokenCenter(token = null, scene = null) {
    if (!token) return null;
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const width = Math.max(1, finiteNumber(token?.document?.width ?? token?.width, 1));
    const height = Math.max(1, finiteNumber(token?.document?.height ?? token?.height, 1));
    const x = finiteNumber(token?.document?.x ?? token?.x, NaN);
    const y = finiteNumber(token?.document?.y ?? token?.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
        x: x + ((width * gridSize) / 2),
        y: y + ((height * gridSize) / 2)
    };
}

function gridOffset(scene = null) {
    return {
        x: -finiteNumber(scene?.shiftX, 0),
        y: -finiteNumber(scene?.shiftY, 0)
    };
}

function gridCellForPoint({ point = null, scene = null } = {}) {
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const offset = gridOffset(scene);
    return {
        col: Math.floor((finiteNumber(point?.x, 0) - offset.x) / gridSize),
        row: Math.floor((finiteNumber(point?.y, 0) - offset.y) / gridSize)
    };
}

function pointForGridCell({ cell = null, scene = null } = {}) {
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const offset = gridOffset(scene);
    return {
        x: offset.x + (finiteNumber(cell?.col, 0) * gridSize) + (gridSize / 2),
        y: offset.y + (finiteNumber(cell?.row, 0) * gridSize) + (gridSize / 2)
    };
}

function wallSegment(wall = null) {
    const coordinates = wallSource(wall)?.c ?? wall?.c ?? [];
    if (!Array.isArray(coordinates) || coordinates.length < 4) return null;
    const [x1, y1, x2, y2] = coordinates.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return { x1, y1, x2, y2 };
}

function distancePointToSegment(point = null, segment = null) {
    if (!point || !segment) return Number.POSITIVE_INFINITY;
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - segment.x1, point.y - segment.y1);
    const t = Math.max(0, Math.min(1, (((point.x - segment.x1) * dx) + ((point.y - segment.y1) * dy)) / lengthSquared));
    return Math.hypot(point.x - (segment.x1 + (t * dx)), point.y - (segment.y1 + (t * dy)));
}

function segmentMidpoint(segment = null) {
    if (!segment) return null;
    return {
        x: (segment.x1 + segment.x2) / 2,
        y: (segment.y1 + segment.y2) / 2
    };
}

function reachableDoorDistance({ wall = null, reachableCells = [], scene = null, rangeFeet = 5, feetPerAp = 5 } = {}) {
    const segment = wallSegment(wall);
    if (!segment) return null;
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const feetPerSquare = Math.max(1, finiteNumber(scene?.grid?.distance, 5));
    const rangePixels = (Math.max(0, finiteNumber(rangeFeet, 5)) / feetPerSquare) * gridSize;
    const movementFeetPerAp = Math.max(1, finiteNumber(feetPerAp, 5));
    let best = null;

    for (const cell of reachableCells) {
        const point = pointForGridCell({ cell, scene });
        const distancePixels = distancePointToSegment(point, segment);
        if (distancePixels > rangePixels + 0.0001) continue;
        const movementFeet = (Math.max(0, finiteNumber(cell?.distance, 0)) / gridSize) * feetPerSquare;
        const movementAp = Math.max(0, Math.ceil(movementFeet / movementFeetPerAp));
        if (!best || movementAp < best.movementAp || distancePixels < best.distancePixels) {
            best = { movementAp, distancePixels };
        }
    }

    return best;
}

function reachableCellsForDoorPlanning({ token = null, scene = null, movementAp = 0, feetPerAp = 5 } = {}) {
    const center = tokenCenter(token, scene);
    if (!center || !scene) return [];
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const feetPerSquare = Math.max(1, finiteNumber(scene?.grid?.distance, 5));
    const movementFeet = Math.max(0, finiteNumber(movementAp, 0)) * Math.max(1, finiteNumber(feetPerAp, 5));
    const maxDistance = (movementFeet / feetPerSquare) * gridSize;
    const originCell = gridCellForPoint({ point: center, scene });
    const offset = gridOffset(scene);
    return findReachableGridMovementCells({
        start: {
            x: offset.x + (originCell.col * gridSize),
            y: offset.y + (originCell.row * gridSize)
        },
        maxDistance,
        scene
    });
}

export function buildReachableDoorOverlayModel({
    token = null,
    scene = null,
    remainingAp = 0,
    openAp = 1,
    feetPerAp = 5,
    rangeFeet = 5,
    foundryConstants = globalThis.CONST
} = {}) {
    const actionPoints = Math.max(0, Math.floor(finiteNumber(remainingAp, 0)));
    const reservedOpenAp = Math.max(1, Math.floor(finiteNumber(openAp, 1)));
    const movementAp = Math.max(0, actionPoints - reservedOpenAp);
    const reachableCells = reachableCellsForDoorPlanning({ token, scene, movementAp, feetPerAp });
    const doors = collectionContents(scene?.walls)
        .filter((wall) => isDoorWall(wall, foundryConstants))
        .filter((wall) => isClosedDoor(wall, foundryConstants))
        .filter((wall) => !isLockedDoor(wall, foundryConstants))
        .map((wall) => {
            const reach = reachableDoorDistance({ wall, reachableCells, scene, rangeFeet, feetPerAp });
            const midpoint = segmentMidpoint(wallSegment(wall));
            return {
                id: wallId(wall),
                wall,
                x: midpoint?.x ?? 0,
                y: midpoint?.y ?? 0,
                movementAp: reach?.movementAp ?? null,
                reachable: Boolean(reach)
            };
        })
        .filter((door) => door.reachable);

    return {
        active: Boolean(token && scene && actionPoints >= reservedOpenAp),
        remainingAp: actionPoints,
        openAp: reservedOpenAp,
        movementAp,
        feetPerAp: Math.max(1, finiteNumber(feetPerAp, 5)),
        rangeFeet: Math.max(0, finiteNumber(rangeFeet, 5)),
        doors
    };
}

function reachableDoorForWall({ token = null, wall = null, scene = null, remainingAp = 0, openAp = 1, feetPerAp = 5, rangeFeet = 5, foundryConstants = globalThis.CONST } = {}) {
    if (!isDoorWall(wall, foundryConstants) || !isClosedDoor(wall, foundryConstants) || isLockedDoor(wall, foundryConstants)) return null;
    const movementAp = Math.max(0, Math.floor(finiteNumber(remainingAp, 0)) - Math.max(1, Math.floor(finiteNumber(openAp, 1))));
    const reachableCells = reachableCellsForDoorPlanning({ token, scene, movementAp, feetPerAp });
    const reach = reachableDoorDistance({ wall, reachableCells, scene, rangeFeet, feetPerAp });
    const midpoint = segmentMidpoint(wallSegment(wall));
    return reach
        ? {
            id: wallId(wall),
            wall,
            x: midpoint?.x ?? 0,
            y: midpoint?.y ?? 0,
            movementAp: reach.movementAp,
            reachable: true
        }
        : null;
}

function updateDraftWithOpenedDoor({ combat = null, combatantId = "", actionIndex = 0, wall = null, door = null, openAp = 1, rangeFeet = 5 } = {}) {
    if (!combat?.setCombatantDraftPlan) return Promise.resolve(false);
    const draftPlan = combat.getCombatantDraftPlan?.(combatantId) ?? { clauses: [] };
    const index = Math.max(0, Math.floor(finiteNumber(actionIndex, 0)));
    const clauses = Array.isArray(draftPlan.clauses) ? draftPlan.clauses.slice(0, index + 1) : [];
    const action = TOTC_ACTION_CATALOG.open ?? {};
    const effectAp = Math.max(1, Math.floor(finiteNumber(openAp, 1)));
    const positioningAp = Math.max(0, Math.floor(finiteNumber(door?.movementAp, 0)));
    const openClause = {
        ...(clauses[index] ?? {}),
        actionId: "open",
        id: "open",
        type: "utility",
        label: action.label ?? "Open",
        apCost: positioningAp + effectAp,
        apMin: 1,
        apMax: Math.max(1, positioningAp + effectAp),
        effectAp,
        positioningAp,
        requiresPositioning: positioningAp > 0,
        positioningRequirement: positioningAp > 0
            ? { type: "adjacent", targetKind: "location", rangeFeet: Math.max(0, finiteNumber(rangeFeet, 5)) }
            : null,
        targetX: finiteNumber(door?.x, 0),
        targetY: finiteNumber(door?.y, 0),
        doorId: wallId(wall),
        doorName: String(wall?.name ?? wall?.label ?? "Door"),
        doorOpenedDuringPlanning: true
    };
    openClause.effects = [
        ...toArray(openClause.effects).filter((effect) => String(effect?.type ?? "") !== "door"),
        {
            type: "door",
            operation: "open",
            target: "custom",
            doorId: openClause.doorId
        }
    ];
    if (!positioningAp) {
        delete openClause.positioningRequirement;
    }
    clauses[index] = openClause;

    return combat.setCombatantDraftPlan(combatantId, {
        ...draftPlan,
        clauses
    }).then(() => true);
}

export class EncounterDoorPlanningController {
    #interaction = null;

    get activeInteraction() {
        return this.#interaction ? { ...this.#interaction } : null;
    }

    beginInteraction({
        combat = null,
        combatantId = "",
        actionIndex = 0,
        tokenId = "",
        sceneId = "",
        remainingAp = 0,
        openAp = 1,
        feetPerAp = 5,
        rangeFeet = 5,
        onComplete = null,
        onCancel = null
    } = {}) {
        this.#interaction = {
            combatId: String(combat?.id ?? ""),
            combat,
            combatantId: String(combatantId ?? ""),
            actionIndex: Math.max(0, Math.floor(finiteNumber(actionIndex, 0))),
            tokenId: String(tokenId ?? ""),
            sceneId: String(sceneId ?? ""),
            remainingAp: Math.max(0, Math.floor(finiteNumber(remainingAp, 0))),
            openAp: Math.max(1, Math.floor(finiteNumber(openAp, 1))),
            feetPerAp: Math.max(1, finiteNumber(feetPerAp, 5)),
            rangeFeet: Math.max(0, finiteNumber(rangeFeet, 5)),
            onComplete,
            onCancel
        };
    }

    cancel() {
        const interaction = this.#interaction;
        this.#interaction = null;
        interaction?.onCancel?.();
    }

    handlePreUpdateWall(wall = null, change = {}, { game = globalThis.game, canvas = globalThis.canvas, ui = globalThis.ui, foundryConstants = globalThis.CONST } = {}) {
        if (game?.user?.isGM) return undefined;
        const combat = activePlanningCombat({ game, canvas });
        if (!combat || !isDoorWall(wall, foundryConstants) || !isOpeningDoorChange(change, foundryConstants)) return undefined;

        const interaction = this.#interaction;
        if (!interaction) return false;
        const scene = wallScene(wall, canvas);
        const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
        if (interaction.combatId && String(combat?.id ?? "") !== interaction.combatId) return false;
        if (interaction.sceneId && sceneId && sceneId !== interaction.sceneId) return false;
        if (isLockedDoor(wall, foundryConstants)) {
            ui?.notifications?.warn?.("That door is locked.");
            return false;
        }

        const token = getSceneToken(scene, interaction.tokenId, canvas);
        const door = reachableDoorForWall({
            token,
            wall,
            scene,
            remainingAp: interaction.remainingAp,
            openAp: interaction.openAp,
            feetPerAp: interaction.feetPerAp,
            rangeFeet: interaction.rangeFeet,
            foundryConstants
        });
        if (!door) {
            ui?.notifications?.warn?.("Choose a door within reach after reserving 1 AP to open it.");
            return false;
        }

        this.#interaction = null;
        scheduleSoon(() => {
            void updateDraftWithOpenedDoor({
                combat,
                combatantId: interaction.combatantId,
                actionIndex: interaction.actionIndex,
                wall,
                door,
                openAp: interaction.openAp,
                rangeFeet: interaction.rangeFeet
            }).catch((error) => {
                console.warn("[turn-of-the-century] Failed to finalize planned door opening.", error);
            }).finally(() => {
                interaction.onComplete?.();
            });
        });
        return undefined;
    }
}

export const encounterDoorPlanningController = new EncounterDoorPlanningController();
