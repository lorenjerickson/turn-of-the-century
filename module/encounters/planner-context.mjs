function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function pickPreferredCombatant(combatants = []) {
    if (!combatants.length) return null;
    if (combatants.length === 1) return combatants[0];

    const owned = combatants.find((entry) => Boolean(entry?.actor?.isOwner));
    if (owned) return owned;

    const current = game.combat?.combatant;
    if (current) {
        const active = combatants.find((entry) => entry.id === current.id);
        if (active) return active;
    }

    return combatants[0];
}

function findCombatantForActor(combat, actor, tokenDocument = null) {
    if (!combat || !actor) return null;

    const explicitTokenIds = new Set([
        tokenDocument?.id,
        tokenDocument?.object?.id,
        tokenDocument?.document?.id
    ].filter(Boolean));

    const actorIds = new Set([
        actor.id,
        actor._id,
        actor.actor?.id,
        actor.baseActor?.id,
        actor.parent?.id,
        actor.prototypeToken?.actorId
    ].filter(Boolean));
    const actorUuids = new Set([
        actor.uuid,
        actor.baseActor?.uuid,
        actor.actor?.uuid
    ].filter(Boolean));
    const tokenIds = new Set([
        actor.token?.id,
        actor.token?.document?.id,
        actor.parent?.id,
        ...explicitTokenIds
    ].filter(Boolean));

    if (typeof actor.getActiveTokens === "function") {
        for (const token of actor.getActiveTokens() ?? []) {
            tokenIds.add(token.id);
            tokenIds.add(token.document?.id);
        }
    }

    for (const token of canvas?.tokens?.controlled ?? []) {
        const tokenActor = token.actor;
        const tokenActorId = tokenActor?.id;
        const tokenBaseActorId = tokenActor?.baseActor?.id;

        if (actorIds.has(tokenActorId) || actorIds.has(tokenBaseActorId)) {
            tokenIds.add(token.id);
            tokenIds.add(token.document?.id);
        }
    }

    for (const token of canvas?.tokens?.placeables ?? []) {
        const tokenActor = token.actor;
        const tokenActorId = tokenActor?.id;
        const tokenBaseActorId = tokenActor?.baseActor?.id;

        if (actorIds.has(tokenActorId) || actorIds.has(tokenBaseActorId)) {
            tokenIds.add(token.id);
            tokenIds.add(token.document?.id);
        }
    }

    const byExplicitToken = (combat.combatants?.contents ?? []).filter(
        (entry) => explicitTokenIds.has(entry.tokenId) || explicitTokenIds.has(entry.token?.id)
    );
    if (byExplicitToken.length) {
        return pickPreferredCombatant(byExplicitToken);
    }

    const byToken = (combat.combatants?.contents ?? []).filter(
        (entry) => tokenIds.has(entry.tokenId) || tokenIds.has(entry.token?.id)
    );
    if (byToken.length) {
        return pickPreferredCombatant(byToken);
    }


    // Use new getCombatantsByActor API (returns array)
    let byActor = [];
    if (typeof combat.getCombatantsByActor === "function") {
        byActor = [
            ...(combat.getCombatantsByActor(actor.id) ?? []),
            ...(actor.baseActor?.id ? (combat.getCombatantsByActor(actor.baseActor.id) ?? []) : [])
        ];
    }
    if (byActor.length) {
        return pickPreferredCombatant(byActor);
    }

    const actorMatches = (combat.combatants?.contents ?? []).filter((entry) => (
        actorIds.has(entry.actorId)
        || actorIds.has(entry.actor?.id)
        || actorIds.has(entry.token?.actorId)
        || actorIds.has(entry.token?.actor?.id)
        || actorUuids.has(entry.actor?.uuid)
        || actorUuids.has(entry.token?.actor?.uuid)
    ));

    return pickPreferredCombatant(actorMatches);
}

function resolveEncounterCombatForActor(actor, tokenDocument = null) {
    const tokenCombatant = tokenDocument?.combatant;
    const tokenCombat = tokenCombatant?.combat;
    if (tokenCombat?.initializeEncounterRound && tokenCombatant) {
        return { combat: tokenCombat, combatant: tokenCombatant };
    }

    const candidates = [
        tokenCombat,
        ui.combat?.viewed,
        game.combat,
        ...(game.combats?.contents ?? [])
    ]
        .filter(Boolean)
        .filter((combat, index, list) => list.findIndex((entry) => entry?.id === combat?.id) === index);

    for (const combat of candidates) {
        const combatant = findCombatantForActor(combat, actor, tokenDocument);
        if (combatant) {
            return { combat, combatant };
        }
    }

    return { combat: null, combatant: null };
}

const ACTION_TYPE_ICONS = {
    attack: "systems/turn-of-the-century/assets/icons/action-attack.svg",
    movement: "systems/turn-of-the-century/assets/icons/action-move.svg",
    defense: "systems/turn-of-the-century/assets/icons/action-defend.svg",
    consumable: "systems/turn-of-the-century/assets/icons/action-use.svg"
};
const ACTION_FALLBACK_ICON = "icons/svg/d20-grey.svg";

function resolveActionImg(action, actor) {
    if (action.itemId) {
        const item = actor?.items?.get(action.itemId);
        if (item?.img) return item.img;
    }
    return ACTION_TYPE_ICONS[action.type] ?? ACTION_FALLBACK_ICON;
}

function buildPlanSlots(queue, apBudget, actor) {
    const slots = [];
    let usedAp = 0;

    for (const [index, action] of queue.entries()) {
        const cost = Math.max(1, Number(action.apCost || 1));
        slots.push({
            type: "action",
            action: { ...action, img: resolveActionImg(action, actor) },
            actionIndex: index,
            span: cost
        });
        usedAp += cost;
    }

    const remaining = Math.max(0, apBudget - usedAp);
    for (let i = 0; i < remaining; i++) {
        slots.push({ type: "empty", span: 1, slotIndex: usedAp + i });
    }

    return slots;
}

function formatPlanningTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function buildEncounterPlannerFromResolvedCombatant({ actor = null, tokenDocument = null, combat = null, combatant = null } = {}) {
    if (!combat || !combatant) {
        console.debug("[turn-of-the-century] encounter planner unresolved", {
            actorId: actor?.id,
            actorName: actor?.name,
            tokenId: tokenDocument?.id ?? tokenDocument?.document?.id ?? null,
            viewedCombatId: ui.combat?.viewed?.id ?? null,
            activeCombatId: game.combat?.id ?? null,
            combatCount: game.combats?.contents?.length ?? 0
        });
        return null;
    }

    console.debug("[turn-of-the-century] encounter planner resolved", {
        actorId: actor?.id,
        actorName: actor?.name,
        tokenId: tokenDocument?.id ?? tokenDocument?.document?.id ?? null,
        combatId: combat.id,
        combatantId: combatant.id
    });

    const combatantState = combat.getCombatantState?.(combatant.id) ?? null;
    const queue = combat.getCombatantPlan?.(combatant.id) ?? [];
    const apBudget = Number(combat.apBudget ?? 6);
    const plannedAp = queue.reduce((sum, action) => sum + toNumber(action.apCost, 0), 0);
    const combatants = combat.combatants?.contents ?? [];
    const committedCount = combatants.filter((entry) => Boolean(combat.getCombatantState?.(entry.id)?.ready)).length;
    const round = Number(combat.encounterState?.round ?? combat.round ?? 1);
    const remainingAp = Number(combat.getCombatantRemainingAp?.(combatant.id) ?? 0);
    const planningRemainingSeconds = Number(combat.planningRemainingSeconds ?? 0);
    const phase = combat.phase ?? "planning";

    const rawAvailableActions = combat.getAvailableActionsForCombatant?.(combatant.id) ?? [];
    const availableActions = rawAvailableActions.map((action) => ({
        ...action,
        img: resolveActionImg(action, actor),
        apLabel: action.variableAp
            ? `(${action.apMin}-${action.apMax} points)`
            : `(${action.apCost} point${action.apCost === 1 ? "" : "s"})`
    }));

    const targetOptions = combat.getTargetOptionsForCombatant?.(combatant.id) ?? [];
    const planSlots = buildPlanSlots(queue, apBudget, actor);

    return {
        combatId: combat.id,
        combatantId: combatant.id,
        encounterName: combat.name ?? "Encounter",
        phase,
        round,
        apBudget,
        plannedAp,
        remainingAp,
        apMeterPercent: apBudget > 0 ? Math.min(100, Math.round((plannedAp / apBudget) * 100)) : 0,
        spentAp: Number(combatantState?.spentAp ?? 0),
        planningElapsedSeconds: Number(combat.planningElapsedSeconds ?? 0),
        planningLimitSeconds: Number(combat.planningLimitSeconds ?? 60),
        planningRemainingSeconds,
        planningTimeDisplay: formatPlanningTime(planningRemainingSeconds),
        committedCount,
        combatantCount: combatants.length,
        ready: Boolean(combatantState?.ready),
        canCommit: phase === "planning" && !Boolean(combatantState?.ready),
        canEditPlan: phase === "planning" && !Boolean(combatantState?.ready),
        planningWarningActive: Boolean(combat.isPlanningWarningActive),
        queue,
        planSlots,
        availableActions,
        targetOptions
    };
}

function buildEncounterPlanner(actor, tokenDocument = null) {
    const { combat, combatant } = resolveEncounterCombatForActor(actor, tokenDocument);
    return buildEncounterPlannerFromResolvedCombatant({ actor, tokenDocument, combat, combatant });
}

function buildEncounterPlannerForCombatant({ actor = null, tokenDocument = null, combat = null, combatantId = "" } = {}) {
    const combatant = (combat?.combatants?.contents ?? []).find((entry) => String(entry?.id ?? "") === String(combatantId ?? ""))
        ?? combat?.combatants?.get?.(combatantId)
        ?? null;
    const resolvedActor = actor ?? combatant?.actor ?? tokenDocument?.actor ?? null;
    return buildEncounterPlannerFromResolvedCombatant({
        actor: resolvedActor,
        tokenDocument,
        combat,
        combatant
    });
}

export {
    buildEncounterPlanner,
    buildEncounterPlannerForCombatant,
    resolveEncounterCombatForActor
};
