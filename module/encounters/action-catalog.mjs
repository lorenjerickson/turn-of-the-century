export const TOTC_ENCOUNTER_PHASES = ["planning", "locked", "resolving", "roundComplete"];

export const TOTC_BASE_ACTION_POINT_BUDGET = 6;
export const TOTC_MOVEMENT_FEET_PER_AP = 10;

/**
 * Base action catalog — actions available to all combatants regardless of equipment.
 * Item-specific actions (snapshot, parry, etc.) live on the items themselves.
 *
 * Each entry includes the full action variant field set so the resolution engine
 * can treat catalog actions and item actions uniformly.
 */
export const TOTC_ACTION_CATALOG = {
    /**
     * Move: spend 1 AP per 10ft of movement. Variable AP 1–6.
     * CPI = 0 — movement is continuous, position updates each AP slot.
     */
    move: {
        id: "move",
        label: "Move",
        type: "movement",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        movementFeetPerAp: 10,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: true,
        requiresTarget: false,
        requiresMovementDestination: true,
        tickNarrativeFragments: [
            "{{Owner.name}} moves."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Open: operate an adjacent, unlocked door, chest, hatch, or similar closure.
     */
    open: {
        id: "open",
        label: "Open",
        description: "Open an adjacent unlocked door, chest, hatch, or similar closure.",
        type: "utility",
        apCost: 1,
        apMin: 1,
        apMax: 1,
        variableAp: false,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: true,
        requiresTarget: false,
        tickNarrativeFragments: [
            "{{Owner.name}} opens the way."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Close and Engage: reserve part of the round to close on a selected target,
     * then perform a chosen follow-up action as soon as the target is in range.
     *
     * The id remains `pursue` for compatibility with existing movement internals.
     */
    pursue: {
        id: "pursue",
        label: "Close and Engage",
        type: "movement",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        movementFeetPerAp: 10,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: true,
        requiresTarget: true,
        requiresEngagementAction: true,
        targetingRangeFeet: 10000,
        tickNarrativeFragments: [
            "{{Owner.name}} closes with {{Target.name}}."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Follow: movement that mirrors a selected target combatant while trying to
     * preserve the current separation.
     */
    follow: {
        id: "follow",
        label: "Follow",
        type: "movement",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        movementFeetPerAp: 10,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: true,
        requiresTarget: true,
        requiresDuration: true,
        targetingRangeFeet: 10000,
        tickNarrativeFragments: [
            "{{Owner.name}} keeps pace with {{Target.name}}."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Avoid: movement that continuously increases distance from a selected
     * target combatant.
     */
    avoid: {
        id: "avoid",
        label: "Evade",
        type: "movement",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        movementFeetPerAp: 10,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: true,
        requiresTarget: true,
        requiresDuration: true,
        targetingRangeFeet: 10000,
        tickNarrativeFragments: [
            "{{Owner.name}} evades {{Target.name}}."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Wait: intentionally spend AP doing nothing while remaining ready to let
     * the round unfold. Kept distinct from automatic Idle so reconciliation can
     * later treat deliberate waiting differently from unused AP.
     */
    wait: {
        id: "wait",
        label: "Wait",
        type: "utility",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: true,
        interruptible: true,
        requiresTarget: false,
        requiresDuration: true,
        tickNarrativeFragments: [
            "{{Owner.name}} waits."
        ],
        isReaction: false,
        reactionTriggerType: ""
    },

    /**
     * Hunker Down: spend 1–6 AP crouching behind cover. Any ranged attack whose
     * effectSlot falls within the hunkered AP window suffers a to-hit penalty on
     * the attacker's roll (resolved during reconciliation). Variable AP lets the
     * player decide how long to stay down.
     */
    hunkDown: {
        id: "hunkDown",
        label: "Hunker Down",
        type: "defense",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: false,
        requiresTarget: false,
        requiresDuration: true,
        isReaction: false,
        reactionTriggerType: "",
        tickNarrativeFragments: [
            "{{Owner.name}} hunkers down."
        ],
        // To-hit penalty applied to ranged attackers whose shot lands during this window
        rangedToHitPenalty: -3
    },

    /**
     * Dodge: a dexterity-based reaction available to any combatant regardless of
     * equipment. Declared as a reaction entry in the plan. If an incoming attack's
     * effectSlot falls within the dodge's AP window, a contested roll is made:
     * defender's dex modifier + d20 vs attacker's to-hit total. Dodge wins → attack
     * negated. The only defensive reaction available without a parry-capable weapon.
     */
    dodge: {
        id: "dodge",
        label: "Dodge",
        type: "defense",
        apCost: 1,
        apMin: 1,
        apMax: 2,
        variableAp: true,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: false,
        requiresTarget: false,
        requiresDuration: true,
        isReaction: true,
        reactionTriggerType: "incomingAttack",
        tickNarrativeFragments: [
            "{{Owner.name}} stays light on their feet."
        ]
    },

    /**
     * Overwatch: reserve AP to attack the first hostile that enters effective weapon
     * range during the declared window. Always fires using the equipped weapon's
     * lowest-AP-cost attack action. If the trigger fires with fewer remaining AP in
     * the window than that attack costs, overwatch does not fire.
     * Melee-range entry incurs a to-hit penalty (caught watching for distant threats).
     */
    overwatch: {
        id: "overwatch",
        label: "Overwatch",
        type: "defense",
        apCost: 1,
        apMin: 1,
        apMax: 6,
        variableAp: true,
        requiresToHit: false,
        toHitBonus: 0,
        completionPhaseIncrement: 0,
        cpiPerFeet: 0,
        autoResolve: false,
        interruptible: false,
        requiresTarget: false,
        requiresDuration: true,
        isReaction: true,
        reactionTriggerType: "overwatch",
        tickNarrativeFragments: [
            "{{Owner.name}} watches for an opening."
        ],
        // Applied when the overwatch trigger fires at melee range
        meleeRangeToHitPenalty: -2
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
