import { getMovementFeetPerAp } from "./action-catalog.mjs";
import { confirmDraftPlan, draftPlanToResolutionActions, normalizeDraftPlan } from "./encounter-draft-plan.mjs";
import { normalizeEncounterOrderData } from "./encounter-order-model.mjs";

// Event name constants — kept local to avoid a circular import with combat.mjs.
// The authoritative definitions live in TOTC_ENCOUNTER_EVENTS (combat.mjs).
const PLAN_UPDATED = "planUpdated";
const DRAFT_PLAN_UPDATED = "draftPlanUpdated";
const COMBATANT_READY_CHANGED = "combatantReadyChanged";

// ---------------------------------------------------------------------------
// Pure utilities (local copies)
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

function normalizeRollRequirements(action = {}, cloneData = defaultClone) {
    const explicit = toArray(action.rollRequirements).map((requirement) => cloneData(requirement));
    if (explicit.length) return explicit;
    if (action.requiresToHit || action.type === "attack") {
        return [{ rollType: "attack", rollSubType: "toHit" }];
    }
    return [];
}

function rollRequirementSatisfied(action = {}, requirement = {}) {
    const requiredType = String(requirement?.rollType ?? "").toLowerCase();
    const requiredSubType = String(requirement?.rollSubType ?? "").toLowerCase();
    return toArray(action.planningRollResults).some((result) => {
        const resultType = String(result?.rollType ?? "").toLowerCase();
        const resultSubType = String(result?.rollSubType ?? "").toLowerCase();
        if (resultType && requiredType && resultType !== requiredType) return false;
        if (resultSubType && requiredSubType && resultSubType !== requiredSubType) return false;
        return true;
    });
}

function actionRequiresPlanningRoll(action = {}) {
    return normalizeRollRequirements(action).length > 0;
}

function actionHasRequiredPlanningRolls(action = {}) {
    const requirements = normalizeRollRequirements(action);
    if (!requirements.length) return true;
    return requirements.every((requirement) => rollRequirementSatisfied(action, requirement));
}

function hasUnresolvedPlanningRolls(plan = []) {
    return toArray(plan).some((action) => actionRequiresPlanningRoll(action) && !actionHasRequiredPlanningRolls(action));
}

function defaultClone(value) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function optionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clampActionData(action, index = 0, cloneData = defaultClone) {
    const requestedApCost = action.apEnvelope?.maxAp ?? action.apCost ?? 1;
    const apMin = clampActionCost(action.apMin ?? requestedApCost);
    const apMax = Math.max(apMin, clampActionCost(action.apMax ?? requestedApCost ?? apMin));
    const apCost = Math.max(apMin, Math.min(apMax, clampActionCost(requestedApCost ?? apMin)));
    const orderData = normalizeEncounterOrderData(action, { apCost, index, cloneData });

    return {
        id: action.id || action.actionId || `action-${index + 1}`,
        actionId: action.actionId || action.id || null,
        type: String(action.type || "custom"),
        label: String(action.label || action.type || `Action ${index + 1}`),
        apCost,
        apMin,
        apMax,
        variableAp: Boolean(action.variableAp && apMax > apMin),
        itemId: action.itemId || null,
        targetId: action.targetId || null,
        targetName: String(action.targetName ?? ""),
        itemName: String(action.itemName ?? ""),
        targetMode: String(action.targetMode ?? ""),
        requiresToHit: Boolean(action.requiresToHit || action.type === "attack"),
        requiresTarget: Boolean(action.requiresTarget),
        requiresItem: Boolean(action.requiresItem),
        requiresDuration: Boolean(action.requiresDuration),
        requiresMovementDestination: Boolean(action.requiresMovementDestination),
        automatic: Boolean(action.automatic),
        status: String(action.status ?? ""),
        durationAp: optionalNumber(action.durationAp),
        toHitBonus: Number(action.toHitBonus || 0),
        damageFormula: String(action.damageFormula ?? ""),
        recapFormat: String(action.recapFormat ?? ""),
        tickNarrativeFragments: toArray(action.tickNarrativeFragments).map((fragment) => String(fragment ?? "")),
        actionNarrativeText: String(action.actionNarrativeText ?? ""),
        itemNarrativeText: String(action.itemNarrativeText ?? ""),
        narrativeTemplate: String(action.narrativeTemplate ?? ""),
        narrativeActionId: String(action.narrativeActionId ?? action.actionId ?? action.id ?? ""),
        systemRollsAllowed: Boolean(action.systemRollsAllowed || action.allowSystemRolls),
        allowSystemRolls: Boolean(action.allowSystemRolls || action.systemRollsAllowed),
        autoResolve: Boolean(action.autoResolve),
        interruptible: Boolean(action.interruptible ?? true),
        isReaction: Boolean(action.isReaction),
        reactionTriggerType: String(action.reactionTriggerType ?? ""),
        rangeType: String(action.rangeType ?? ""),
        movementFeet: Number(action.movementFeet || 0),
        movementFeetPerAp: Number(action.movementFeetPerAp || 0),
        movementTargetX: Number(action.movementTargetX ?? 0),
        movementTargetY: Number(action.movementTargetY ?? 0),
        movementTargetRow: Number(action.movementTargetRow ?? 0),
        movementTargetCol: Number(action.movementTargetCol ?? 0),
        movementDestinationX: optionalNumber(action.movementDestinationX),
        movementDestinationY: optionalNumber(action.movementDestinationY),
        movementOriginX: optionalNumber(action.movementOriginX),
        movementOriginY: optionalNumber(action.movementOriginY),
        planningLocked: Boolean(action.planningLocked),
        planningRollResults: toArray(action.planningRollResults).map((result) => cloneData(result)),
        rollRequirements: normalizeRollRequirements(action, cloneData),
        ...orderData
    };
}

function lockedActionComparable(action = {}) {
    const comparable = structuredClone(action);
    delete comparable.planningLocked;
    delete comparable.planningRollResults;
    return JSON.stringify(comparable);
}

function lockedThroughIndex(plan = []) {
    let boundary = -1;
    for (const [index, action] of toArray(plan).entries()) {
        if (action?.planningLocked) boundary = index;
    }
    return boundary;
}

// ---------------------------------------------------------------------------

/**
 * Owns all plan-mutation logic for a Turn of the Century encounter.
 *
 * `EncounterPlanningService` is deliberately decoupled from the Foundry
 * document layer. It reads and writes encounter state through injected port
 * functions, emits events through an injected emitter, and never accesses
 * `canvas`, `game`, or Foundry document APIs directly.
 *
 * Cloning and current time are injected ports so this service can run in
 * focused tests without Foundry globals.
 *
 * @example
 * ```js
 * const planningService = new EncounterPlanningService({
 *   getState:              () => encounter.state,
 *   setState:              (s) => encounter.#setState(s),
 *   isCombatantOwned:      (id) => encounter.#isCombatantOwnedByCurrentUser(id),
 *   isInitiativeGateActive: () => encounter.hasInitiativeGateActive,
 *   emit:                  (e, p) => encounter.emit(e, p),
 *   restorePlanningOrigin: (id, plan) => encounter.#restoreCombatantPlanningOrigin(id, plan)
 * });
 * ```
 */
export class EncounterPlanningService {
    #getState;
    #setState;
    #isCombatantOwned;
    #isInitiativeGateActive;
    #emit;
    #restorePlanningOrigin;
    #clone;
    #now;

    /**
     * @param {{
     *   getState:               () => object,
     *   setState:               (state: object) => Promise<void>,
     *   isCombatantOwned:       (combatantId: string) => boolean,
     *   isInitiativeGateActive: () => boolean,
     *   emit:                   (eventName: string, payload: object) => void,
     *   restorePlanningOrigin:  (combatantId: string, plan: object[]) => Promise<void>,
     *   clone?:                 (value: any) => any,
     *   now?:                   () => number
     * }} ports
     */
    constructor({ getState, setState, isCombatantOwned, isInitiativeGateActive, emit, restorePlanningOrigin, clone = defaultClone, now = () => Date.now() }) {
        this.#getState = getState;
        this.#setState = setState;
        this.#isCombatantOwned = isCombatantOwned;
        this.#isInitiativeGateActive = isInitiativeGateActive;
        this.#emit = emit;
        this.#restorePlanningOrigin = restorePlanningOrigin;
        this.#clone = clone;
        this.#now = now;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * If all combatants have committed their plans, or the planning time limit
     * has expired, automatically calls encounter resolution.
     * Currently a stub — returns `false` until resolution orchestration is wired.
     *
     * @returns {Promise<boolean>} `true` if resolution was started, otherwise `false`.
     */
    async maybeAutoFinalizePlanning() {
        return false;
    }

    /**
     * Mark a combatant's action plan as committed (ready) or un-committed.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.COMBATANT_READY_CHANGED} and may
     * trigger auto-finalization if all combatants are now ready.
     *
     * @param {string}  combatantId
     * @param {boolean} ready
     * @returns {Promise<void>}
     */
    async setCombatantReady(combatantId, ready) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to commit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.#getState();
        const perCombatant = this.#clone(state.perCombatant ?? {});
        if (!perCombatant[combatantId]) {
            throw new Error(`Combatant ${combatantId} is not part of this encounter.`);
        }

        perCombatant[combatantId].ready = Boolean(ready);
        perCombatant[combatantId].committedAt = ready ? this.#now() : 0;

        if (ready) {
            await this.#restorePlanningOrigin(combatantId, perCombatant[combatantId].plan);
        }

        await this.#setState({ ...state, perCombatant });

        this.#emit(COMBATANT_READY_CHANGED, {
            combatantId,
            ready: Boolean(ready),
            perCombatantState: perCombatant[combatantId]
        });

        await this.maybeAutoFinalizePlanning();
    }

    /**
     * Append one action to the end of a combatant's current plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @param {object} action
     * @returns {Promise<void>}
     */
    async addCombatantAction(combatantId, action) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.#getCombatantPlan(combatantId);
        await this.setCombatantPlan(combatantId, [...plan, action]);
    }

    /**
     * Remove the action at a given index from a combatant's plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @param {number} index - Zero-based index of the action to remove.
     * @returns {Promise<void>}
     */
    async removeCombatantAction(combatantId, index) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.#getCombatantPlan(combatantId);
        if (Number(index) <= lockedThroughIndex(plan)) {
            throw new Error("This part of the action plan is locked by an accepted roll result.");
        }
        const next = plan.filter((_, currentIndex) => currentIndex !== Number(index));
        await this.setCombatantPlan(combatantId, next);
    }

    /**
     * Remove all unlocked actions from a combatant's plan, preserving
     * any locked actions up to and including the last locked index.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @returns {Promise<void>}
     */
    async clearCombatantPlan(combatantId) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.#getCombatantPlan(combatantId);
        await this.setCombatantPlan(combatantId, plan.slice(0, lockedThroughIndex(plan) + 1));
    }

    /**
     * Replace a combatant's narrative draft plan without committing it for
     * resolution. This state is intentionally separate from `plan` so the GM
     * can observe composition while the existing resolution pipeline remains
     * driven by confirmed actions.
     *
     * @param {string} combatantId
     * @param {object} draftPlan
     * @returns {Promise<object>} The normalized draft plan.
     */
    async setCombatantDraftPlan(combatantId, draftPlan = {}) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's draft plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.#getState();
        const apBudget = Number(state.apBudget ?? 6);
        const perCombatant = this.#clone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) {
            throw new Error(`Combatant ${combatantId} is not part of the encounter state.`);
        }

        const normalized = normalizeDraftPlan(draftPlan, {
            apBudget,
            cloneData: this.#clone
        });

        perCombatant[combatantId] = {
            ...combatantState,
            draftPlan: normalized,
            ready: false,
            committedAt: 0
        };

        await this.#setState({ ...state, phase: "planning", perCombatant });

        this.#emit(DRAFT_PLAN_UPDATED, {
            combatantId,
            draftPlan: normalized,
            perCombatantState: perCombatant[combatantId]
        });

        return normalized;
    }

    /**
     * Clear a combatant's narrative draft plan.
     *
     * @param {string} combatantId
     * @returns {Promise<object>} The normalized empty draft plan.
     */
    async clearCombatantDraftPlan(combatantId) {
        return this.setCombatantDraftPlan(combatantId, { clauses: [] });
    }

    /**
     * Confirm a complete narrative draft and make it the combatant's
     * resolution plan. Required player rolls keep the plan in a confirmed but
     * not-yet-ready state until roll results are stored.
     *
     * @param {string} combatantId
     * @returns {Promise<{ draftPlan: object, plan: object[], requiredRolls: object[] }>}
     */
    async confirmCombatantDraftPlan(combatantId) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to confirm this combatant's draft plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.#getState();
        const apBudget = Number(state.apBudget ?? 6);
        const perCombatant = this.#clone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) {
            throw new Error(`Combatant ${combatantId} is not part of the encounter state.`);
        }

        const confirmed = confirmDraftPlan(combatantState.draftPlan ?? { clauses: [] }, {
            apBudget,
            cloneData: this.#clone
        });
        const resolutionActions = draftPlanToResolutionActions(confirmed, {
            apBudget,
            cloneData: this.#clone
        });
        const plan = resolutionActions.map((action, index) => clampActionData(action, index, this.#clone));
        const awaitingRolls = hasUnresolvedPlanningRolls(plan);
        const draftPlan = {
            ...confirmed,
            lifecycle: awaitingRolls ? "confirmedAwaitingRolls" : "locked"
        };

        perCombatant[combatantId] = {
            ...combatantState,
            draftPlan,
            spentAp: 0,
            remainingAp: apBudget,
            plan,
            pointer: 0,
            progress: 0,
            ready: !awaitingRolls,
            committedAt: awaitingRolls ? 0 : this.#now()
        };

        if (!awaitingRolls) {
            await this.#restorePlanningOrigin(combatantId, plan);
        }

        await this.#setState({ ...state, phase: "planning", perCombatant });

        this.#emit(DRAFT_PLAN_UPDATED, {
            combatantId,
            draftPlan,
            perCombatantState: perCombatant[combatantId]
        });
        this.#emit(PLAN_UPDATED, {
            combatantId,
            plan
        });
        this.#emit(COMBATANT_READY_CHANGED, {
            combatantId,
            ready: !awaitingRolls,
            perCombatantState: perCombatant[combatantId]
        });

        if (!awaitingRolls) {
            await this.maybeAutoFinalizePlanning();
        }

        return {
            draftPlan,
            plan,
            requiredRolls: plan.flatMap((action, actionIndex) => normalizeRollRequirements(action, this.#clone).map((requirement) => ({
                ...requirement,
                actionIndex,
                actionId: action.actionId ?? action.id ?? ""
            })))
        };
    }

    /**
     * Accept a planning-phase roll result for one action in a combatant's plan,
     * locking that action so it cannot be removed or replaced.
     * Idempotent: a duplicate `requestId` is silently ignored.
     *
     * @param {string} combatantId
     * @param {number} actionIndex
     * @param {object} [roll={}]
     * @returns {Promise<object>} The (now locked) action.
     */
    async lockCombatantActionRoll(combatantId, actionIndex, roll = {}) {
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to accept rolls for this combatant's plan.");
        }

        const state = this.#getState();
        if (state.phase !== "planning") {
            throw new Error("Roll results can only lock actions during encounter planning.");
        }

        const index = Number(actionIndex);
        const perCombatant = this.#clone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        const action = combatantState?.plan?.[index];
        if (!action || !Number.isInteger(index) || index < 0) {
            throw new Error(`Invalid action index: ${actionIndex}`);
        }

        const requestId = String(roll?.requestId ?? "").trim();
        if (requestId && toArray(action.planningRollResults).some(
            (entry) => String(entry?.requestId ?? "") === requestId
        )) {
            return action;
        }

        action.planningLocked = true;
        action.planningRollResults = [
            ...toArray(action.planningRollResults),
            this.#clone(roll)
        ];
        const finalizesConfirmedDraft = String(combatantState.draftPlan?.lifecycle ?? "") === "confirmedAwaitingRolls";
        const awaitingRolls = finalizesConfirmedDraft ? hasUnresolvedPlanningRolls(combatantState.plan) : true;
        if (finalizesConfirmedDraft) {
            combatantState.ready = !awaitingRolls;
            combatantState.committedAt = awaitingRolls ? 0 : this.#now();
            combatantState.draftPlan = {
                ...combatantState.draftPlan,
                lifecycle: awaitingRolls ? "confirmedAwaitingRolls" : "locked"
            };
            if (!awaitingRolls) {
                for (const planAction of toArray(combatantState.plan)) {
                    planAction.planningLocked = true;
                }
                await this.#restorePlanningOrigin(combatantId, combatantState.plan);
            }
        }
        await this.#setState({ ...state, perCombatant });
        this.#emit(PLAN_UPDATED, {
            combatantId,
            plan: combatantState.plan
        });
        if (finalizesConfirmedDraft) {
            this.#emit(DRAFT_PLAN_UPDATED, {
                combatantId,
                draftPlan: combatantState.draftPlan,
                perCombatantState: combatantState
            });
            this.#emit(COMBATANT_READY_CHANGED, {
                combatantId,
                ready: Boolean(combatantState.ready),
                perCombatantState: combatantState
            });
            if (!awaitingRolls) {
                await this.maybeAutoFinalizePlanning();
            }
        }
        return action;
    }

    async resetCombatantPlanningRolls(combatantId) {
        const state = this.#getState();
        if (state.phase !== "planning") {
            throw new Error("Planning rolls can only be reset during encounter planning.");
        }
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to reset rolls for this combatant's plan.");
        }

        const perCombatant = this.#clone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) {
            throw new Error(`Combatant ${combatantId} is not part of this encounter.`);
        }

        const plan = toArray(combatantState.plan).map((action) => ({
            ...action,
            planningLocked: false,
            planningRollResults: []
        }));
        const awaitingRolls = hasUnresolvedPlanningRolls(plan);
        combatantState.plan = plan;
        combatantState.ready = !awaitingRolls;
        combatantState.committedAt = awaitingRolls ? 0 : this.#now();
        combatantState.draftPlan = {
            ...(combatantState.draftPlan ?? {}),
            lifecycle: awaitingRolls ? "confirmedAwaitingRolls" : "locked"
        };

        await this.#setState({ ...state, perCombatant });
        this.#emit(PLAN_UPDATED, { combatantId, plan });
        this.#emit(DRAFT_PLAN_UPDATED, {
            combatantId,
            draftPlan: combatantState.draftPlan,
            perCombatantState: combatantState
        });
        this.#emit(COMBATANT_READY_CHANGED, {
            combatantId,
            ready: Boolean(combatantState.ready),
            perCombatantState: combatantState
        });
        return plan;
    }

    /**
     * Adjust the AP cost of a single action in a combatant's plan, clamped
     * to the action's min/max range. For movement actions, `movementFeet`
     * is recalculated automatically.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @param {number} actionIndex
     * @param {number} apCost
     * @returns {Promise<void>}
     */
    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const index = Number(actionIndex);
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(`Invalid action index: ${actionIndex}`);
        }

        const plan = this.#getCombatantPlan(combatantId).map((action, currentIndex) => {
            if (currentIndex !== index) return action;

            const min = clampActionCost(action.apMin ?? action.apCost ?? 1);
            const max = Math.max(min, clampActionCost(action.apMax ?? action.apCost ?? min));
            const nextCost = Math.max(min, Math.min(max, clampActionCost(apCost)));
            const movementFeetPerAp = Number(action.movementFeetPerAp || getMovementFeetPerAp() || 10);

            return {
                ...action,
                apCost: nextCost,
                movementFeet: action.type === "movement"
                    ? movementFeetPerAp * nextCost
                    : Number(action.movementFeet || 0)
            };
        });

        await this.setCombatantPlan(combatantId, plan);
    }

    /**
     * Replace a combatant's entire action plan.
     * Validates AP budget, preserves locked actions, and normalizes action data.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string}   combatantId
     * @param {object[]} actions
     * @returns {Promise<void>}
     */
    async setCombatantPlan(combatantId, actions = []) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwned(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.#getState();
        const apBudget = Number(state.apBudget ?? 6);
        const perCombatant = this.#clone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) {
            throw new Error(`Combatant ${combatantId} is not part of the encounter state.`);
        }

        const normalized = toArray(actions).map((action, index) => clampActionData(action, index, this.#clone));

        for (const [index, existingAction] of toArray(combatantState.plan).entries()) {
            if (!existingAction?.planningLocked) continue;
            const nextAction = normalized[index];
            const normalizedExistingAction = clampActionData(existingAction, index, this.#clone);
            if (!nextAction || lockedActionComparable(normalizedExistingAction) !== lockedActionComparable(nextAction)) {
                throw new Error("Accepted roll results lock this part of the action plan until the GM reopens planning.");
            }
            nextAction.planningLocked = true;
            nextAction.planningRollResults = this.#clone(existingAction.planningRollResults ?? []);
        }

        const totalCost = normalized.reduce((sum, action) => sum + action.apCost, 0);
        if (totalCost > apBudget) {
            throw new Error(`Action plan exceeds AP budget (${totalCost}/${apBudget}).`);
        }

        perCombatant[combatantId] = {
            ...combatantState,
            spentAp: 0,
            remainingAp: apBudget,
            plan: normalized,
            pointer: 0,
            progress: 0,
            ready: false,
            committedAt: 0
        };

        await this.#setState({ ...state, phase: "planning", perCombatant });

        this.#emit(PLAN_UPDATED, {
            combatantId,
            plan: perCombatant[combatantId].plan
        });
    }

    // -----------------------------------------------------------------------
    // Private guards
    // -----------------------------------------------------------------------

    #requireInitiativeReady() {
        if (!this.#isInitiativeGateActive()) return;
        throw new Error("All encounter participants must roll initiative before planning can begin.");
    }

    #requirePlanningOpen(combatantId) {
        const state = this.#getState();
        if (state.phase !== "planning") {
            throw new Error("Encounter planning is not currently open.");
        }
        const combatantState = state.perCombatant?.[combatantId] ?? null;
        if (!combatantState) {
            throw new Error(`Combatant ${combatantId} is not part of this encounter.`);
        }
        if (combatantState.ready) {
            throw new Error("Action plan is already committed for this round.");
        }
        const draftLifecycle = String(combatantState.draftPlan?.lifecycle ?? "drafting");
        if (draftLifecycle !== "drafting") {
            throw new Error("Action plan is already confirmed for this round.");
        }
    }

    // -----------------------------------------------------------------------
    // Private state accessors
    // -----------------------------------------------------------------------

    #getCombatantState(combatantId) {
        return this.#getState().perCombatant?.[combatantId] ?? null;
    }

    #getCombatantPlan(combatantId) {
        return toArray(this.#getCombatantState(combatantId)?.plan);
    }
}
