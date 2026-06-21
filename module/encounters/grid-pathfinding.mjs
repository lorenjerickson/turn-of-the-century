function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function wallSource(wall) {
    return wall?._source ?? wall?.toObject?.() ?? wall ?? {};
}

function blockingWallSegments(scene = null, foundryConstants = globalThis.CONST) {
    const movementNone = foundryConstants?.WALL_MOVEMENT_TYPES?.NONE ?? 0;
    const doorNone = foundryConstants?.WALL_DOOR_TYPES?.NONE ?? 0;
    const doorOpen = foundryConstants?.WALL_DOOR_STATES?.OPEN ?? 1;

    return collectionContents(scene?.walls).flatMap((wall) => {
        const source = wallSource(wall);
        if (source.move === movementNone || Number(source.move) === Number(movementNone)) return [];
        const isDoor = source.door !== undefined
            && source.door !== doorNone
            && Number(source.door) !== Number(doorNone);
        if (isDoor && (source.ds === doorOpen || Number(source.ds) === Number(doorOpen))) return [];
        const coordinates = source.c ?? wall?.c ?? [];
        if (!Array.isArray(coordinates) || coordinates.length < 4) return [];
        const [x1, y1, x2, y2] = coordinates.map(Number);
        return [x1, y1, x2, y2].every(Number.isFinite) ? [{ x1, y1, x2, y2 }] : [];
    });
}

function orientation(a, b, c) {
    const value = ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
    if (Math.abs(value) <= 0.000001) return 0;
    return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
    return b.x >= Math.min(a.x, c.x) - 0.000001
        && b.x <= Math.max(a.x, c.x) + 0.000001
        && b.y >= Math.min(a.y, c.y) - 0.000001
        && b.y <= Math.max(a.y, c.y) + 0.000001;
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;
    return false;
}

function pointKey(col, row) {
    return `${col}:${row}`;
}

class MinHeap {
    #items = [];

    get length() {
        return this.#items.length;
    }

    push(value) {
        this.#items.push(value);
        let index = this.#items.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.#items[parent].score <= value.score) break;
            this.#items[index] = this.#items[parent];
            index = parent;
        }
        this.#items[index] = value;
    }

    pop() {
        if (!this.#items.length) return null;
        const first = this.#items[0];
        const last = this.#items.pop();
        if (!this.#items.length) return first;
        let index = 0;
        while (true) {
            const left = (index * 2) + 1;
            const right = left + 1;
            if (left >= this.#items.length) break;
            const child = right < this.#items.length && this.#items[right].score < this.#items[left].score ? right : left;
            if (this.#items[child].score >= last.score) break;
            this.#items[index] = this.#items[child];
            index = child;
        }
        this.#items[index] = last;
        return first;
    }
}

function reconstructPath(cameFrom, current, toPosition) {
    const cells = [current];
    while (cameFrom.has(pointKey(current.col, current.row))) {
        current = cameFrom.get(pointKey(current.col, current.row));
        cells.push(current);
    }
    return cells.reverse().map(toPosition);
}

export function findGridMovementPath({
    start = null,
    target = null,
    scene = null,
    foundryConstants = globalThis.CONST,
    maxVisited = 50000
} = {}) {
    if (!start || !target) return [];
    const gridSize = Math.max(1, finiteNumber(scene?.grid?.size, 100));
    const offsetX = -finiteNumber(scene?.shiftX, 0);
    const offsetY = -finiteNumber(scene?.shiftY, 0);
    const toCell = (point) => ({
        col: Math.round((finiteNumber(point.x) - offsetX) / gridSize),
        row: Math.round((finiteNumber(point.y) - offsetY) / gridSize)
    });
    const toPosition = (cell) => ({
        x: Math.round(offsetX + (cell.col * gridSize)),
        y: Math.round(offsetY + (cell.row * gridSize))
    });
    const startCell = toCell(start);
    const goalCell = toCell(target);
    if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
        return [{ x: finiteNumber(start.x), y: finiteNumber(start.y) }];
    }

    const walls = blockingWallSegments(scene, foundryConstants);
    const sceneWidth = Math.max(
        finiteNumber(scene?.width),
        finiteNumber(scene?.dimensions?.width),
        finiteNumber(scene?.dimensions?.sceneWidth) + offsetX,
        finiteNumber(start.x),
        finiteNumber(target.x)
    );
    const sceneHeight = Math.max(
        finiteNumber(scene?.height),
        finiteNumber(scene?.dimensions?.height),
        finiteNumber(scene?.dimensions?.sceneHeight) + offsetY,
        finiteNumber(start.y),
        finiteNumber(target.y)
    );
    const fallbackMargin = 4;
    const minCol = Math.min(0, startCell.col, goalCell.col);
    const minRow = Math.min(0, startCell.row, goalCell.row);
    const maxCol = sceneWidth > 0
        ? Math.max(Math.ceil((sceneWidth - offsetX) / gridSize), startCell.col, goalCell.col)
        : Math.max(startCell.col, goalCell.col) + fallbackMargin;
    const maxRow = sceneHeight > 0
        ? Math.max(Math.ceil((sceneHeight - offsetY) / gridSize), startCell.row, goalCell.row)
        : Math.max(startCell.row, goalCell.row) + fallbackMargin;

    const center = (cell) => ({
        x: offsetX + (cell.col * gridSize) + (gridSize / 2),
        y: offsetY + (cell.row * gridSize) + (gridSize / 2)
    });
    const blocked = (from, to) => {
        const a = center(from);
        const b = center(to);
        return walls.some((wall) => segmentsIntersect(a, b, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }));
    };
    const neighbors = (cell) => {
        const candidates = [];
        for (let dc = -1; dc <= 1; dc += 1) {
            for (let dr = -1; dr <= 1; dr += 1) {
                if (!dc && !dr) continue;
                const next = { col: cell.col + dc, row: cell.row + dr };
                if (next.col < minCol || next.col > maxCol || next.row < minRow || next.row > maxRow) continue;
                if (blocked(cell, next)) continue;
                if (dc && dr) {
                    const horizontal = { col: cell.col + dc, row: cell.row };
                    const vertical = { col: cell.col, row: cell.row + dr };
                    if (blocked(cell, horizontal) || blocked(cell, vertical)) continue;
                }
                candidates.push({ ...next, cost: dc && dr ? Math.SQRT2 : 1 });
            }
        }
        return candidates;
    };
    const heuristic = (cell) => {
        const dx = Math.abs(cell.col - goalCell.col);
        const dy = Math.abs(cell.row - goalCell.row);
        return Math.max(dx, dy) + ((Math.SQRT2 - 1) * Math.min(dx, dy));
    };

    const open = new MinHeap();
    open.push({ ...startCell, score: heuristic(startCell) });
    const cameFrom = new Map();
    const costs = new Map([[pointKey(startCell.col, startCell.row), 0]]);
    const closed = new Set();
    let visited = 0;

    while (open.length && visited < maxVisited) {
        const current = open.pop();
        const currentKey = pointKey(current.col, current.row);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        visited += 1;
        if (current.col === goalCell.col && current.row === goalCell.row) {
            return reconstructPath(cameFrom, current, toPosition);
        }

        for (const neighbor of neighbors(current)) {
            const neighborKey = pointKey(neighbor.col, neighbor.row);
            const tentative = (costs.get(currentKey) ?? Number.POSITIVE_INFINITY) + neighbor.cost;
            if (tentative >= (costs.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
            cameFrom.set(neighborKey, { col: current.col, row: current.row });
            costs.set(neighborKey, tentative);
            const score = tentative + heuristic(neighbor);
            open.push({ col: neighbor.col, row: neighbor.row, score });
        }
    }

    return [{ x: finiteNumber(start.x), y: finiteNumber(start.y) }];
}

export function pointAlongMovementPath(path = [], distance = 0) {
    if (!path.length) return null;
    let remaining = Math.max(0, finiteNumber(distance));
    for (let index = 1; index < path.length; index += 1) {
        const start = path[index - 1];
        const end = path[index];
        const dx = finiteNumber(end.x) - finiteNumber(start.x);
        const dy = finiteNumber(end.y) - finiteNumber(start.y);
        const length = Math.hypot(dx, dy);
        if (remaining <= length && length > Number.EPSILON) {
            const ratio = remaining / length;
            return {
                x: Math.round(finiteNumber(start.x) + (dx * ratio)),
                y: Math.round(finiteNumber(start.y) + (dy * ratio))
            };
        }
        remaining -= length;
    }
    const final = path.at(-1);
    return { x: Math.round(finiteNumber(final.x)), y: Math.round(finiteNumber(final.y)) };
}

export function movementPathLength(path = []) {
    let length = 0;
    for (let index = 1; index < path.length; index += 1) {
        length += Math.hypot(
            finiteNumber(path[index].x) - finiteNumber(path[index - 1].x),
            finiteNumber(path[index].y) - finiteNumber(path[index - 1].y)
        );
    }
    return length;
}
