import {
    findGridMovementPath,
    findReachableGridMovementCells
} from "../../encounters/grid-pathfinding.mjs";

function numberOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function gridCellForPoint({ x = 0, y = 0, gridSize = 100, offsetX = 0, offsetY = 0 } = {}) {
    const size = positiveNumber(gridSize, 100);
    return {
        col: Math.floor((numberOr(x) - numberOr(offsetX)) / size),
        row: Math.floor((numberOr(y) - numberOr(offsetY)) / size)
    };
}

export function buildEncounterMovementOverlayModel({
    token = null,
    scene = null,
    maxAp = 0,
    feetPerAp = 10,
    feetPerSquare = 5,
    gridSize = null,
    offsetX = null,
    offsetY = null
} = {}) {
    const cellSize = positiveNumber(gridSize ?? scene?.grid?.size, 100);
    const gridDistance = positiveNumber(feetPerSquare ?? scene?.grid?.distance, 5);
    const movementFeetPerAp = positiveNumber(feetPerAp, 10);
    const actionPoints = Math.max(0, Math.floor(numberOr(maxAp, 0)));
    const maxFeet = actionPoints * movementFeetPerAp;
    const maxPixels = (maxFeet / gridDistance) * cellSize;
    const gridOffsetX = numberOr(offsetX, -numberOr(scene?.shiftX, 0));
    const gridOffsetY = numberOr(offsetY, -numberOr(scene?.shiftY, 0));
    const tokenX = numberOr(token?.x ?? token?.document?.x, 0);
    const tokenY = numberOr(token?.y ?? token?.document?.y, 0);
    const tokenWidth = positiveNumber(token?.width ?? token?.document?.width, 1);
    const tokenHeight = positiveNumber(token?.height ?? token?.document?.height, 1);
    const origin = {
        x: tokenX + ((tokenWidth * cellSize) / 2),
        y: tokenY + ((tokenHeight * cellSize) / 2)
    };
    const originCell = gridCellForPoint({ ...origin, gridSize: cellSize, offsetX: gridOffsetX, offsetY: gridOffsetY });
    const reachableCells = findReachableGridMovementCells({
        start: {
            x: gridOffsetX + (originCell.col * cellSize),
            y: gridOffsetY + (originCell.row * cellSize)
        },
        maxDistance: maxPixels,
        scene
    });
    const cells = reachableCells.map(({ col, row, distance: distancePixels }) => {
        const distanceFeet = (distancePixels / cellSize) * gridDistance;
        return {
            col,
            row,
            left: gridOffsetX + (col * cellSize),
            top: gridOffsetY + (row * cellSize),
            width: cellSize,
            height: cellSize,
            requiredAp: Math.min(actionPoints, Math.max(0, Math.ceil(distanceFeet / movementFeetPerAp))),
            distanceFeet: Math.round(distanceFeet * 10) / 10,
            origin: col === originCell.col && row === originCell.row
        };
    });

    return {
        active: Boolean(token && scene && actionPoints > 0),
        maxAp: actionPoints,
        feetPerAp: movementFeetPerAp,
        feetPerSquare: gridDistance,
        gridSize: cellSize,
        offsetX: gridOffsetX,
        offsetY: gridOffsetY,
        origin,
        originCell,
        cells
    };
}

export function findEncounterMovementOverlayCellAtPoint(model = {}, point = null) {
    if (!model?.active || !point) return null;
    const x = numberOr(point.x, NaN);
    const y = numberOr(point.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return (model.cells ?? []).find((cell) => (
        x >= cell.left
        && x < cell.left + cell.width
        && y >= cell.top
        && y < cell.top + cell.height
    )) ?? null;
}

export function buildEncounterPlanningMovementPath({ start = null, target = null, scene = null } = {}) {
    if (!start || !target || !scene) return [];
    return findGridMovementPath({ start, target, scene });
}
