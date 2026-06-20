function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function naturalRoll(result = {}) {
    const kept = (Array.isArray(result?.dice) ? result.dice : []).find((die) => die?.kept !== false);
    return number(kept?.value, number(result?.natural, number(result?.roll, 0)));
}

export function resolveContestedDexterity(results = []) {
    const entries = results.map((entry) => ({
        ...entry,
        natural: naturalRoll(entry.result),
        total: number(entry?.result?.total, 0),
        outcome: "failure"
    }));
    const criticalSuccesses = entries.filter((entry) => entry.natural === 20);

    if (criticalSuccesses.length === entries.length) {
        for (const entry of entries) entry.outcome = "criticalSuccess";
        return entries;
    }

    for (const entry of criticalSuccesses) entry.outcome = "criticalSuccess";
    for (const entry of entries.filter((candidate) => candidate.natural === 1)) {
        entry.outcome = "criticalFailure";
    }

    const ordinary = entries.filter((entry) => ![1, 20].includes(entry.natural));
    const bestTotal = Math.max(Number.NEGATIVE_INFINITY, ...ordinary.map((entry) => entry.total));
    const winners = ordinary.filter((entry) => entry.total === bestTotal);
    if (criticalSuccesses.length === 0 && winners.length === 1) winners[0].outcome = "success";

    return entries;
}

export function findRoundEndGridConflicts({ tokenPositions = {}, combatants = [], gridSize = 100 } = {}) {
    const cells = new Map();
    const size = Math.max(1, number(gridSize, 100));
    for (const combatant of combatants) {
        const tokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? "").trim();
        const position = tokenPositions?.[tokenId];
        if (!tokenId || !position) continue;
        const row = Math.floor(number(position.y, 0) / size);
        const col = Math.floor(number(position.x, 0) / size);
        const key = `${row}:${col}`;
        const members = cells.get(key) ?? [];
        members.push({ combatantId: combatant.id, tokenId, row, col });
        cells.set(key, members);
    }
    return [...cells.values()].filter((members) => members.length > 1);
}

export function lowestStrengthCombatantId(entries = []) {
    if (entries.length < 2) return null;
    const sorted = [...entries].sort((left, right) => number(left.strength, 0) - number(right.strength, 0));
    return number(sorted[0]?.strength, 0) < number(sorted[1]?.strength, 0) ? sorted[0].combatantId : null;
}

export function adjacentFreePosition({ origin = {}, occupiedPositions = [], gridSize = 100 } = {}) {
    const size = Math.max(1, number(gridSize, 100));
    const occupied = new Set(occupiedPositions.map((position) => (
        `${Math.floor(number(position.x, 0) / size)}:${Math.floor(number(position.y, 0) / size)}`
    )));
    const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of offsets) {
        const candidate = { x: number(origin.x, 0) + (dx * size), y: number(origin.y, 0) + (dy * size) };
        const cell = `${Math.floor(candidate.x / size)}:${Math.floor(candidate.y / size)}`;
        if (candidate.x < 0 || candidate.y < 0 || occupied.has(cell)) continue;
        return candidate;
    }
    return null;
}
