function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function movementMode(action = null) {
    return String(action?.actionId ?? action?.id ?? "").trim().toLowerCase();
}

export function isBreakAwayAction(action = null) {
    return String(action?.type ?? "") === "movement"
        && ["avoid", "evade"].includes(movementMode(action));
}

export function currentPlannedAction(perCombatant = {}, combatantId = "") {
    const state = perCombatant?.[combatantId] ?? null;
    if (!state) return null;
    return toArray(state.plan)[Math.max(0, toNumber(state.pointer, 0))] ?? null;
}

export function recordReachWindow(action = {}, {
    tick = 0,
    positioning = {},
    tokenPositions = null
} = {}) {
    if (!action || !positioning?.applies || !positioning?.satisfied) return null;
    const reachWindow = {
        tick: Math.max(0, toNumber(tick, 0)),
        distanceFeet: toNumber(positioning.distanceFeet, 0),
        tokenPositions: tokenPositions ? { ...tokenPositions } : null
    };
    action._reachWindow = reachWindow;
    return reachWindow;
}

export function usableReachWindow(action = {}, {
    targetCombatant = null,
    perCombatant = {}
} = {}) {
    const reachWindow = action?._reachWindow ?? null;
    if (!reachWindow) return null;

    const targetAction = targetCombatant?.id
        ? currentPlannedAction(perCombatant, targetCombatant.id)
        : null;
    if (isBreakAwayAction(targetAction)) return null;

    return reachWindow;
}

export function buildSoftFailureOutcome(action = {}, { combatantName = "Combatant" } = {}) {
    const type = String(action.failureOutcome?.type ?? "bestReachablePosition").trim();
    const label = String(action.label ?? "the order");

    if (type === "maintainPressure") {
        return {
            result: "maintainedPressure",
            detail: `${combatantName} cannot complete ${label}, but maintains pressure from the best reachable position.`
        };
    }

    if (type === "gainEngagement") {
        return {
            result: "gainedEngagement",
            detail: `${combatantName} cannot complete ${label}, but gains engagement from the best reachable position.`
        };
    }

    if (type === "holdPosition") {
        return {
            result: "heldPosition",
            detail: `${combatantName} cannot complete ${label} and holds position.`
        };
    }

    return {
        result: "bestReachablePosition",
        detail: `${combatantName} cannot complete ${label}, ending in the best reachable position.`
    };
}

export function clearRuntimeEngagementFields(action = null) {
    if (!action) return;
    delete action._reachWindow;
}
