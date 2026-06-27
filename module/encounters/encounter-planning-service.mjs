import { getMovementFeetPerAp } from "./action-catalog.mjs";

// Event name constants — kept local to avoid a circular import with combat.mjs.
// The authoritative definitions live in TOTC_ENCOUNTER_EVENTS (combat.mjs).
const PLAN_UPDATED = "planUpdated";
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
    const apMin = clampActionCost(action.apMin ?? action.apCost ?? 1);
    const apMax = Math.max(apMin, clampActionCost(action.apMax ?? action.apCost ?? apMin));
    const apCost = Math.max(apMin, Math.min(apMax, clampActionCost(action.apCost ?? apMin)));

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
        requiresToHit: Boolean(action.requiresToHit || action.type === "attack"),
        toHitBonus: Number(action.toHitBonus || 0),
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
        movementOriginX: optionalNumber(action.movementOriginX),
        movementOriginY: optionalNumber(action.movementOriginY),
        planningLocked: Boolean(action.planningLocked),
        planningRollResults: toArray(action.planningRollResults).map((result) => cloneData(result))
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
        await this.#setState({ ...state, perCombatant });
        this.#emit(PLAN_UPDATED, {
            combatantId,
            plan: combatantState.plan
        });
        return action;
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
