export const TOTC_ENCOUNTER_PHASES = ["planning", "locked", "resolving", "roundComplete"];

export const TOTC_BASE_ACTION_POINT_BUDGET = 6;
export const TOTC_MOVEMENT_FEET_PER_AP = 10;

export const TOTC_ACTION_CATALOG = {
    move: {
        id: "move",
        label: "Move",
        type: "movement",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        movementFeetPerAp: 10,
        requiresToHit: false
    },
    defend: {
        id: "defend",
        label: "Defend",
        type: "defense",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        requiresToHit: false
    },
    pistolQuickShot: {
        id: "pistolQuickShot",
        label: "Quick Shot",
        type: "attack",
        apCost: 2,
        apMin: 2,
        apMax: 2,
        variableAp: false,
        toHitBonus: -2,
        requiresToHit: true
    },
    pistolAimedShot: {
        id: "pistolAimedShot",
        label: "Aim and Fire",
        type: "attack",
        apCost: 3,
        apMin: 3,
        apMax: 3,
        variableAp: false,
        toHitBonus: 0,
        requiresToHit: true
    },
    consumeBeltElixir: {
        id: "consumeBeltElixir",
        label: "Consume Belt Elixir",
        type: "consumable",
        apCost: 2,
        apMin: 2,
        apMax: 2,
        variableAp: false,
        requiresToHit: false,
        requiresSlot: "belt"
    }
};

export function getBaseActionCatalog() {
    return foundry.utils.deepClone(TOTC_ACTION_CATALOG);
}

export function getActionPointBudget() {
    return Number(game?.settings?.get("turn-of-the-century", "encounterActionPointBudget") ?? TOTC_BASE_ACTION_POINT_BUDGET);
}

export function getMovementFeetPerAp() {
    return Number(game?.settings?.get("turn-of-the-century", "encounterMovementFeetPerAp") ?? TOTC_MOVEMENT_FEET_PER_AP);
}

export function getPlanningWarningSeconds() {
    return Number(game?.settings?.get("turn-of-the-century", "encounterPlanningWarningSeconds") ?? 45);
}

export function getPlanningLimitSeconds() {
    return Number(game?.settings?.get("turn-of-the-century", "encounterPlanningLimitSeconds") ?? 60);
}
