export const TOTC_ENCOUNTER_PHASES = ["planning", "locked", "resolving", "roundComplete"];

export const TOTC_BASE_ACTION_POINT_BUDGET = 6;
export const TOTC_MOVEMENT_FEET_PER_AP = 10;

export const TOTC_ACTION_CATALOG = {
    move10ft: {
        id: "move10ft",
        label: "Move 10 ft",
        type: "movement",
        apCost: 1,
        movementFeet: 10,
        requiresToHit: false
    },
    pistolQuickShot: {
        id: "pistolQuickShot",
        label: "Quick Shot",
        type: "attack",
        apCost: 2,
        toHitBonus: -2,
        requiresToHit: true
    },
    pistolAimedShot: {
        id: "pistolAimedShot",
        label: "Aim and Fire",
        type: "attack",
        apCost: 3,
        toHitBonus: 0,
        requiresToHit: true
    },
    consumeBeltElixir: {
        id: "consumeBeltElixir",
        label: "Consume Belt Elixir",
        type: "consumable",
        apCost: 2,
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
