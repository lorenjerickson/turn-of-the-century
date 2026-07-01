export const ENCOUNTER_DRAFT_LIFECYCLES = Object.freeze([
    "drafting",
    "confirmedAwaitingRolls",
    "locked",
    "resolving",
    "resolved"
]);

const DOWNSTREAM_FIELDS = Object.freeze([
    "actionId",
    "type",
    "apCost",
    "durationAp",
    "itemId",
    "requiresTarget",
    "requiresItem",
    "requiresDuration",
    "requiresEngagementAction",
    "engageActionId",
    "engageActionAp",
    "requiresMovementDestination",
    "movementTargetX",
    "movementTargetY",
    "movementTargetRow",
    "movementTargetCol"
]);

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

function defaultClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function cloneValue(value, cloneData = defaultClone) {
    if (value === undefined) return undefined;
    return cloneData(value);
}

function normalizeLifecycle(value = "") {
    const lifecycle = text(value, "drafting");
    return ENCOUNTER_DRAFT_LIFECYCLES.includes(lifecycle) ? lifecycle : "drafting";
}

function normalizeApCost(value) {
    const cost = optionalNumber(value);
    if (cost === null) return null;
    return Math.max(0, Math.floor(cost));
}

function normalizePosition(value = null) {
    if (!value || typeof value !== "object") return null;
    const x = optionalNumber(value.x);
    const y = optionalNumber(value.y);
    if (x === null || y === null) return null;
    return { x, y };
}

function sameValue(left, right) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function movementDestination(clause = {}) {
    const x = optionalNumber(clause.movementTargetX);
    const y = optionalNumber(clause.movementTargetY);
    if (x === null || y === null) return null;
    return { x, y };
}

function movementFeet(clause = {}) {
    const explicit = optionalNumber(clause.movementFeet);
    if (explicit !== null && explicit > 0) return explicit;
    const feetPerAp = Math.max(0, toNumber(clause.movementFeetPerAp, 0));
    const cost = Math.max(0, toNumber(clause.apCost, 0));
    return feetPerAp * cost;
}

function normalizeResolutionActionId(actionId = "") {
    const key = text(actionId).toLowerCase();
    if (key === "closewith" || key === "close-with") return "pursue";
    if (key === "evade") return "avoid";
    return text(actionId);
}

function normalizeResolutionActionLabel(clause = {}, resolutionActionId = "") {
    const key = text(clause.actionId).toLowerCase();
    if (key === "closewith" || key === "close-with" || resolutionActionId === "pursue") {
        return text(clause.label, "Close With");
    }
    if (key === "evade" || resolutionActionId === "avoid") {
        return text(clause.label, "Evade");
    }
    if (resolutionActionId === "wait") return text(clause.label, "Wait");
    if (resolutionActionId === "idle") return text(clause.label, "Idle");
    return text(clause.label, resolutionActionId || "Action");
}

function actionRangeFeet(action = {}) {
    const explicitRange = optionalNumber(action.engageTargetingRangeFeet ?? action.targetingRangeFeet);
    if (explicitRange !== null && explicitRange > 0) return explicitRange;
    const rangeType = text(action.engageRangeType ?? action.rangeType, "melee").toLowerCase();
    if (rangeType === "long") return 60;
    if (rangeType === "normal") return 30;
    return 5;
}

function engagementActionAp(clause = {}) {
    const explicit = optionalNumber(clause.engageActionAp ?? clause.effectAp);
    if (explicit !== null && explicit > 0) return Math.max(1, Math.floor(explicit));
    return Math.max(1, Math.floor(toNumber(clause.apCost, 1)));
}

function positioningAp(clause = {}) {
    const explicit = optionalNumber(clause.positioningAp);
    if (explicit !== null) return Math.max(0, Math.floor(explicit));
    return Math.max(0, Math.floor(toNumber(clause.apCost, 0)) - engagementActionAp(clause));
}

function buildMissingDecisions(clause = {}) {
    const missing = [];
    if (!clause.actionId) missing.push("action");
    if (clause.requiresTarget && !clause.targetId) missing.push("target");
    if (clause.requiresEngagementAction && !clause.engageActionId) missing.push("engagementAction");
    if (clause.requiresItem && !clause.itemId) missing.push("item");
    if (clause.requiresDuration && clause.durationAp === null) missing.push("duration");
    if (clause.requiresMovementDestination && !movementDestination(clause)) missing.push("movementDestination");
    return missing;
}

function normalizePhraseTokens(tokens = [], cloneData = defaultClone) {
    return toArray(tokens).map((token, index) => ({
        ...cloneValue(token, cloneData),
        tokenId: text(token?.tokenId, `token-${index + 1}`),
        decision: text(token?.decision, "action"),
        editable: Boolean(token?.editable ?? true)
    }));
}

export function normalizeDraftClause(clause = {}, { index = 0, origin = null, cloneData = defaultClone } = {}) {
    const source = clause && typeof clause === "object" ? clause : {};
    const actionId = text(source.actionId, text(source.id, ""));
    const type = text(source.type, actionId ? "custom" : "placeholder");
    const apCost = normalizeApCost(source.apCost ?? source.apEnvelope?.maxAp);
    const projectedOrigin = normalizePosition(source.projectedOrigin) ?? normalizePosition(source.movementOrigin) ?? origin;
    const destination = movementDestination(source);
    const projectedPosition = type === "movement" && destination ? destination : projectedOrigin;
    const normalized = {
        ...cloneValue(source, cloneData),
        clauseId: text(source.clauseId, `draft-clause-${index + 1}`),
        actionId,
        type,
        label: text(source.label, actionId ? actionId : "Select an action"),
        status: text(source.status, "draft"),
        apCost,
        targetId: text(source.targetId, ""),
        targetName: text(source.targetName, ""),
        itemId: text(source.itemId, ""),
        itemName: text(source.itemName, ""),
        durationAp: optionalNumber(source.durationAp),
        requiresTarget: Boolean(source.requiresTarget),
        requiresItem: Boolean(source.requiresItem),
        requiresDuration: Boolean(source.requiresDuration),
        requiresEngagementAction: Boolean(source.requiresEngagementAction),
        engageActionId: text(source.engageActionId, ""),
        engageActionType: text(source.engageActionType, ""),
        engageActionLabel: text(source.engageActionLabel, ""),
        engageActionNarrativeText: text(source.engageActionNarrativeText, ""),
        engageActionAp: optionalNumber(source.engageActionAp),
        engageRequiresItem: Boolean(source.engageRequiresItem),
        engageRequiresToHit: Boolean(source.engageRequiresToHit),
        engageRangeType: text(source.engageRangeType, ""),
        engageTargetingRangeFeet: optionalNumber(source.engageTargetingRangeFeet),
        engageDamageFormula: text(source.engageDamageFormula, ""),
        engageSystemRollsAllowed: Boolean(source.engageSystemRollsAllowed),
        positioningAp: optionalNumber(source.positioningAp),
        effectAp: optionalNumber(source.effectAp),
        requiresMovementDestination: Boolean(source.requiresMovementDestination),
        movementTargetX: optionalNumber(source.movementTargetX),
        movementTargetY: optionalNumber(source.movementTargetY),
        movementTargetRow: optionalNumber(source.movementTargetRow),
        movementTargetCol: optionalNumber(source.movementTargetCol),
        projectedOrigin,
        projectedPosition,
        narrativeTokens: normalizePhraseTokens(source.narrativeTokens, cloneData),
        rollRequirements: toArray(source.rollRequirements).map((requirement) => cloneValue(requirement, cloneData))
    };
    const missingDecisions = buildMissingDecisions(normalized);

    return {
        ...normalized,
        missingDecisions,
        complete: actionId !== "" && missingDecisions.length === 0 && apCost !== null,
        affectsProjectedPosition: type === "movement" && Boolean(destination)
    };
}

export function normalizeDraftPlan(source = {}, { apBudget = 6, initialPosition = null, cloneData = defaultClone } = {}) {
    const draft = source && typeof source === "object" ? source : {};
    const budget = Math.max(0, Math.floor(toNumber(draft.apBudget, apBudget)));
    const startPosition = normalizePosition(draft.initialPosition) ?? normalizePosition(initialPosition);
    let projectedPosition = startPosition;
    const clauses = toArray(draft.clauses).map((clause, index) => {
        const normalized = normalizeDraftClause(clause, { index, origin: projectedPosition, cloneData });
        projectedPosition = normalized.projectedPosition;
        return normalized;
    });
    const spentAp = clauses.reduce((sum, clause) => sum + Math.max(0, toNumber(clause.apCost, 0)), 0);
    const missingDecisions = clauses.flatMap((clause) => clause.missingDecisions.map((decision) => ({
        clauseId: clause.clauseId,
        decision
    })));
    const lifecycle = normalizeLifecycle(draft.lifecycle);

    return {
        draftId: text(draft.draftId, "active"),
        lifecycle,
        apBudget: budget,
        spentAp,
        remainingAp: Math.max(0, budget - spentAp),
        overBudget: spentAp > budget,
        complete: clauses.length > 0 && missingDecisions.length === 0 && spentAp <= budget,
        initialPosition: startPosition,
        projectedPosition,
        missingDecisions,
        clauses
    };
}

export function createEmptyDraftPlan({ apBudget = 6, initialPosition = null, lifecycle = "drafting" } = {}) {
    return normalizeDraftPlan({ lifecycle, clauses: [] }, { apBudget, initialPosition });
}

export function truncateDraftPlan(draftPlan = {}, clauseIndex = 0, options = {}) {
    const normalized = normalizeDraftPlan(draftPlan, options);
    const index = Math.max(0, Math.floor(toNumber(clauseIndex, 0)));
    return normalizeDraftPlan({
        ...normalized,
        clauses: normalized.clauses.slice(0, index + 1)
    }, {
        apBudget: normalized.apBudget,
        initialPosition: normalized.initialPosition,
        cloneData: options.cloneData
    });
}

export function draftClauseChangeAffectsDownstream(previousClause = {}, nextClause = {}) {
    const previous = normalizeDraftClause(previousClause);
    const next = normalizeDraftClause(nextClause);
    return DOWNSTREAM_FIELDS.some((fieldName) => !sameValue(previous[fieldName], next[fieldName]));
}

export function replaceDraftClause(draftPlan = {}, clauseIndex = 0, nextClause = {}, { truncateDownstream = null, cloneData = defaultClone } = {}) {
    const normalized = normalizeDraftPlan(draftPlan, { cloneData });
    const index = Math.max(0, Math.floor(toNumber(clauseIndex, 0)));
    const clauses = normalized.clauses.slice();
    const previousClause = clauses[index] ?? null;
    const shouldTruncate = truncateDownstream ?? (previousClause
        ? draftClauseChangeAffectsDownstream(previousClause, nextClause)
        : true);
    clauses[index] = cloneValue(nextClause, cloneData);

    return normalizeDraftPlan({
        ...normalized,
        clauses: shouldTruncate ? clauses.slice(0, index + 1) : clauses
    }, {
        apBudget: normalized.apBudget,
        initialPosition: normalized.initialPosition,
        cloneData
    });
}

export function confirmDraftPlan(draftPlan = {}, { includeIdle = true, apBudget = 6, initialPosition = null, cloneData = defaultClone } = {}) {
    const normalized = normalizeDraftPlan(draftPlan, { apBudget, initialPosition, cloneData });
    if (!normalized.complete) {
        throw new Error("Draft plan cannot be confirmed until all required decisions are complete and within AP budget.");
    }

    const clauses = normalized.clauses.map((clause) => cloneValue(clause, cloneData));
    if (includeIdle && normalized.remainingAp > 0) {
        clauses.push({
            clauseId: `draft-clause-${clauses.length + 1}`,
            actionId: "idle",
            type: "utility",
            label: "Idle",
            apCost: normalized.remainingAp,
            status: "confirmed",
            automatic: true
        });
    }

    return normalizeDraftPlan({
        ...normalized,
        lifecycle: "confirmedAwaitingRolls",
        clauses
    }, {
        apBudget: normalized.apBudget,
        initialPosition: normalized.initialPosition,
        cloneData
    });
}

export function draftClauseToResolutionAction(clause = {}, { index = 0, cloneData = defaultClone } = {}) {
    const normalized = normalizeDraftClause(clause, { index, cloneData });
    if (normalized.requiresEngagementAction && normalized.engageActionId) {
        const source = cloneValue(normalized, cloneData);
        const effectAp = engagementActionAp(normalized);
        const closeAp = positioningAp(normalized);
        const actionId = text(normalized.engageActionId);
        const actionType = text(normalized.engageActionType, "attack");
        const label = text(normalized.engageActionLabel, actionId || "Action");
        return {
            ...source,
            id: actionId,
            actionId,
            narrativeActionId: normalized.actionId,
            type: actionType,
            label,
            apCost: Math.max(1, closeAp + effectAp),
            apMin: Math.max(1, toNumber(normalized.apMin, 1)),
            apMax: Math.max(1, toNumber(normalized.apMax, toNumber(normalized.apCost, 1))),
            automatic: Boolean(normalized.automatic),
            durationAp: optionalNumber(normalized.durationAp),
            itemId: text(normalized.itemId, ""),
            targetId: text(normalized.targetId, ""),
            targetName: text(normalized.targetName, ""),
            requiresTarget: true,
            requiresToHit: Boolean(normalized.engageRequiresToHit),
            requiresItem: Boolean(normalized.engageRequiresItem),
            rangeType: text(normalized.engageRangeType, text(normalized.rangeType, "")),
            targetingRangeFeet: actionRangeFeet(normalized),
            damageFormula: text(normalized.engageDamageFormula, text(normalized.damageFormula, "")),
            systemRollsAllowed: Boolean(normalized.engageSystemRollsAllowed),
            movementFeetPerAp: Math.max(1, toNumber(normalized.movementFeetPerAp, 10)),
            intentType: actionType === "attack" || normalized.engageRequiresToHit ? "attackTarget" : "interactWithObject",
            apEnvelope: {
                positioningAp: closeAp,
                effectAp,
                maxAp: Math.max(1, closeAp + effectAp)
            },
            positioningRequirement: {
                type: actionType === "attack" || normalized.engageRequiresToHit ? "weaponRange" : "adjacent",
                targetKind: "combatant",
                rangeFeet: actionRangeFeet(normalized)
            },
            followThrough: {
                type: "hold"
            },
            failureOutcome: {
                type: "bestReachablePosition"
            },
            sourceAction: {
                id: actionId,
                actionId,
                type: actionType,
                itemId: text(normalized.itemId, "")
            }
        };
    }

    const resolutionActionId = normalizeResolutionActionId(normalized.actionId);
    const projectedOrigin = normalizePosition(normalized.projectedOrigin);
    const projectedDestination = movementDestination(normalized);
    const source = cloneValue(normalized, cloneData);

    return {
        ...source,
        id: resolutionActionId,
        actionId: resolutionActionId,
        narrativeActionId: normalized.actionId,
        label: normalizeResolutionActionLabel(normalized, resolutionActionId),
        apCost: Math.max(1, toNumber(normalized.apCost, toNumber(normalized.durationAp, 1))),
        apMin: Math.max(1, toNumber(normalized.apMin, toNumber(normalized.apCost, 1))),
        apMax: Math.max(1, toNumber(normalized.apMax, toNumber(normalized.apCost, 1))),
        automatic: Boolean(normalized.automatic),
        durationAp: optionalNumber(normalized.durationAp),
        itemId: text(normalized.itemId, ""),
        targetId: text(normalized.targetId, ""),
        targetName: text(normalized.targetName, ""),
        movementFeet: movementFeet(normalized),
        movementTargetX: optionalNumber(normalized.movementTargetX) ?? 0,
        movementTargetY: optionalNumber(normalized.movementTargetY) ?? 0,
        movementTargetRow: optionalNumber(normalized.movementTargetRow) ?? 0,
        movementTargetCol: optionalNumber(normalized.movementTargetCol) ?? 0,
        movementOriginX: optionalNumber(normalized.movementOriginX) ?? projectedOrigin?.x ?? null,
        movementOriginY: optionalNumber(normalized.movementOriginY) ?? projectedOrigin?.y ?? null,
        movementDestinationX: projectedDestination?.x ?? null,
        movementDestinationY: projectedDestination?.y ?? null
    };
}

export function draftPlanToResolutionActions(draftPlan = {}, { apBudget = 6, initialPosition = null, cloneData = defaultClone } = {}) {
    const normalized = normalizeDraftPlan(draftPlan, { apBudget, initialPosition, cloneData });
    return normalized.clauses.map((clause, index) => draftClauseToResolutionAction(clause, { index, cloneData }));
}
