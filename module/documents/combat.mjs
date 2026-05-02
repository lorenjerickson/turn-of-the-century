import {
    TOTC_BASE_ACTION_POINT_BUDGET,
    TOTC_ENCOUNTER_PHASES,
    getActionPointBudget,
    getBaseActionCatalog,
    getMovementFeetPerAp,
    getPlanningLimitSeconds,
    getPlanningWarningSeconds
} from "../encounters/action-catalog.mjs";

const ENCOUNTER_FLAG_SCOPE = "turn-of-the-century";
const ENCOUNTER_FLAG_KEY = "encounter";

/**
 * Event name constants emitted by {@link TurnOfTheCenturyEncounter}.
 * Use these as the `eventName` argument for {@link TurnOfTheCenturyEncounter#on}
 * and {@link TurnOfTheCenturyCombat#onEncounter}, or with the public
 * `game.turnOfTheCentury.encounters.onEvent` API.
 *
 * @property {string} STATE_INITIALIZED   - Fired after a new round's state is written to the combat flag.
 * @property {string} PHASE_CHANGED        - Fired whenever the encounter phase transitions.
 * @property {string} PLANNING_STARTED     - Fired when planning opens (phase becomes "planning").
 * @property {string} PLANNING_ENDED       - Fired when planning closes (phase leaves "planning").
 * @property {string} ROUND_STARTED        - Fired at the beginning of a new round, after state is initialized.
 * @property {string} ROUND_RESOLVED       - Fired after the AP timeline has been resolved and chat published.
 * @property {string} COMBATANT_READY_CHANGED - Fired when a combatant commits or un-commits their plan.
 * @property {string} PLAN_UPDATED         - Fired after a combatant's action plan is written.
 */
export const TOTC_ENCOUNTER_EVENTS = {
    STATE_INITIALIZED: "stateInitialized",
    PHASE_CHANGED: "phaseChanged",
    PLANNING_STARTED: "planningStarted",
    PLANNING_ENDED: "planningEnded",
    ROUND_STARTED: "roundStarted",
    ROUND_RESOLVED: "roundResolved",
    COMBATANT_READY_CHANGED: "combatantReadyChanged",
    PLAN_UPDATED: "planUpdated"
};

const TOTC_ENCOUNTER_HOOKS = {
    [TOTC_ENCOUNTER_EVENTS.STATE_INITIALIZED]: "totcEncounterStateInitialized",
    [TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED]: "totcEncounterPhaseChanged",
    [TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED]: "totcEncounterPlanningStarted",
    [TOTC_ENCOUNTER_EVENTS.PLANNING_ENDED]: "totcEncounterPlanningEnded",
    [TOTC_ENCOUNTER_EVENTS.ROUND_STARTED]: "totcEncounterRoundStarted",
    [TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED]: "totcEncounterRoundResolved",
    [TOTC_ENCOUNTER_EVENTS.COMBATANT_READY_CHANGED]: "totcEncounterCombatantReadyChanged",
    [TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED]: "totcEncounterPlanUpdated"
};

/**
 * Returns the Foundry hook name used to broadcast a given encounter event.
 *
 * @param {string} eventName - A value from {@link TOTC_ENCOUNTER_EVENTS}.
 * @returns {string|null} The matching Foundry hook name, or `null` if unmapped.
 */
export function getEncounterHookName(eventName) {
    return TOTC_ENCOUNTER_HOOKS[eventName] ?? null;
}

function sortByInitiativeDescending(combatants = []) {
    return [...combatants].sort((left, right) => Number(right.initiative ?? 0) - Number(left.initiative ?? 0));
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

function getWhisperRecipientsForGm() {
    return ChatMessage.getWhisperRecipients("GM").map((user) => user.id);
}

function createNarrationMessage(round, tick, line) {
    const replayStyle = game.settings?.get("turn-of-the-century", "encounterReplayNarrationStyle") ?? "detailed";
    if (replayStyle === "concise") {
        return `AP ${tick}: ${line}`;
    }

    return `Round ${round}, AP ${tick}: ${line}`;
}

function formatDamageText(amount) {
    return `${Math.max(0, Number(amount) || 0)} damage`;
}

function getCombatantFromId(combat, combatantId) {
    return combat.combatants?.get(combatantId) ?? null;
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function hasInitiativeValue(value) {
    const number = Number(value);
    return Number.isFinite(number);
}

function clampActionData(action, index = 0) {
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
        movementFeet: Number(action.movementFeet || 0),
        movementFeetPerAp: Number(action.movementFeetPerAp || 0)
    };
}

/**
 * Manages the internal state of a Turn of the Century AP encounter and
 * emits lifecycle events that other classes and modules can subscribe to.
 *
 * Each `TurnOfTheCenturyCombat` instance creates exactly one `TurnOfTheCenturyEncounter`
 * on first access via `combat.encounter`. State is stored in the combat document's
 * `turn-of-the-century.encounter` flag and normalized on every read so consumers
 * always receive a complete, safe object.
 *
 * Events are delivered in two ways:
 * - Directly to listeners registered with {@link TurnOfTheCenturyEncounter#on}.
 * - Via Foundry `Hooks.callAll`, using hook names from {@link TOTC_ENCOUNTER_HOOKS}.
 *
 * @example Subscribe from a macro
 * ```js
 * const sub = game.turnOfTheCentury.encounters.onEvent({
 *   eventName: "planningStarted",
 *   listener: ({ combat, round }) => console.log(`Round ${round} planning started`)
 * });
 * // later:
 * game.turnOfTheCentury.encounters.offEvent(sub);
 * ```
 *
 * @example Subscribe from a Foundry hook
 * ```js
 * Hooks.on("totcEncounterPlanningStarted", ({ combat, round }) => {
 *   ui.notifications.info(`Round ${round} planning started`);
 * });
 * ```
 */
export class TurnOfTheCenturyEncounter {
    #combat;

    #listeners = new Map();

    /**
     * @param {TurnOfTheCenturyCombat} combat - The owning combat document.
     */
    constructor(combat) {
        this.#combat = combat;
    }

    /** @returns {TurnOfTheCenturyCombat} The owning combat document. */
    get combat() {
        return this.#combat;
    }

    /**
     * The raw encounter flag value as stored on the combat document,
     * or `null` if no encounter round has been initialized yet.
     * @returns {object|null}
     */
    get rawState() {
        return this.#combat.getFlag(ENCOUNTER_FLAG_SCOPE, ENCOUNTER_FLAG_KEY) ?? null;
    }

    /**
     * The fully normalized encounter state. Always returns a complete object
     * with defaults filled in for missing fields, including per-combatant entries
     * for every current combatant. Check `state.initialized` to distinguish a
     * default-empty state from one that has been explicitly started.
     * @returns {object}
     */
    get state() {
        return this.#normalizeState(this.rawState);
    }

    /**
     * The current encounter phase. One of: `"planning"`, `"locked"`,
     * `"resolving"`, `"roundComplete"`.
     * @returns {string}
     */
    get phase() {
        return this.state.phase ?? "planning";
    }

    /**
     * The action catalog for this encounter, containing available action
     * templates keyed by action ID.
     * @returns {object}
     */
    get actionCatalog() {
        return this.state.actionCatalog ?? getBaseActionCatalog();
    }

    /**
     * Total action points available to each combatant per round.
     * Reads from encounter state if initialized, otherwise from world settings.
     * @returns {number}
     */
    get apBudget() {
        return Number(this.state.apBudget ?? getActionPointBudget() ?? TOTC_BASE_ACTION_POINT_BUDGET);
    }

    /**
     * Number of seconds after which a soft planning-time warning is shown.
     * @returns {number}
     */
    get planningWarningSeconds() {
        return Number(getPlanningWarningSeconds() || 45);
    }

    /**
     * Hard planning time limit in seconds. When elapsed, planning is
     * automatically finalized by the GM timer.
     * @returns {number}
     */
    get planningLimitSeconds() {
        return Number(getPlanningLimitSeconds() || 60);
    }

    /**
     * Unix timestamp (ms) when the current planning phase began, or `0`
     * if planning has not started or has ended.
     * @returns {number}
     */
    get planningStartedAt() {
        return Number(this.state.planningStartedAt ?? 0);
    }

    /**
     * Seconds elapsed since planning started. Returns `0` if planning
     * has not started.
     * @returns {number}
     */
    get planningElapsedSeconds() {
        if (!this.planningStartedAt) return 0;
        return Math.max(0, Math.floor((Date.now() - this.planningStartedAt) / 1000));
    }

    /**
     * Seconds remaining before the planning time limit is reached.
     * Returns `0` once the limit is exceeded.
     * @returns {number}
     */
    get planningRemainingSeconds() {
        return Math.max(0, this.planningLimitSeconds - this.planningElapsedSeconds);
    }

    /**
     * `true` when the phase is `"planning"` and the time limit has been exceeded.
     * @returns {boolean}
     */
    get isPlanningExpired() {
        return this.phase === "planning" && this.planningRemainingSeconds <= 0;
    }

    /**
     * `true` when the phase is `"planning"` and elapsed time has passed the
     * soft warning threshold.
     * @returns {boolean}
     */
    get isPlanningWarningActive() {
        return this.phase === "planning" && this.planningElapsedSeconds >= this.planningWarningSeconds;
    }

    /**
     * Register a direct listener for a lifecycle event on this encounter instance.
     * Listeners receive the same payload as the corresponding Foundry hook.
     * Returns an unsubscribe function for convenience.
     *
     * @param {string}   eventName - A value from {@link TOTC_ENCOUNTER_EVENTS}.
     * @param {Function} listener  - Callback invoked with the event payload.
     * @returns {Function} Unsubscribe function — call it to remove the listener.
     */
    on(eventName, listener) {
        if (!eventName || typeof listener !== "function") return () => {};

        const listeners = this.#listeners.get(eventName) ?? new Set();
        listeners.add(listener);
        this.#listeners.set(eventName, listeners);
        return () => this.off(eventName, listener);
    }

    /**
     * Remove a previously registered direct listener.
     *
     * @param {string}   eventName - The event name the listener was registered for.
     * @param {Function} listener  - The exact listener reference passed to {@link on}.
     */
    off(eventName, listener) {
        const listeners = this.#listeners.get(eventName);
        if (!listeners) return;
        listeners.delete(listener);
        if (!listeners.size) this.#listeners.delete(eventName);
    }

    /**
     * Emit a lifecycle event to all registered direct listeners and as a
     * Foundry `Hooks.callAll`. The payload is augmented with `eventName`,
     * `combat`, and `encounter` properties before dispatch.
     *
     * @param {string} eventName - A value from {@link TOTC_ENCOUNTER_EVENTS}.
     * @param {object} [payload] - Additional data to include in the event payload.
     */
    emit(eventName, payload = {}) {
        const eventPayload = {
            ...payload,
            eventName,
            combat: this.#combat,
            encounter: this
        };

        const listeners = this.#listeners.get(eventName);
        if (listeners) {
            for (const listener of [...listeners]) {
                try {
                    listener(eventPayload);
                } catch (error) {
                    console.error("[turn-of-the-century] Encounter event listener failed.", error);
                }
            }
        }

        const hookName = TOTC_ENCOUNTER_HOOKS[eventName] ?? null;
        if (hookName) {
            Hooks.callAll(hookName, eventPayload);
        }
    }

    #defaultCombatantState() {
        return {
            spentAp: 0,
            remainingAp: this.apBudget,
            plan: [],
            pointer: 0,
            progress: 0,
            ready: false,
            committedAt: 0
        };
    }

    #normalizeState(state) {
        const existing = state && typeof state === "object" ? state : {};
        const initialized = Boolean(state && typeof state === "object" && Object.keys(state).length > 0);

        const actionCatalog = existing.actionCatalog && typeof existing.actionCatalog === "object"
            ? foundry.utils.deepClone(existing.actionCatalog)
            : getBaseActionCatalog();

        const perCombatant = foundry.utils.deepClone(existing.perCombatant ?? {});
        for (const combatant of this.#combat.combatants?.contents ?? []) {
            perCombatant[combatant.id] = {
                ...this.#defaultCombatantState(),
                ...(perCombatant[combatant.id] ?? {}),
                plan: toArray(perCombatant[combatant.id]?.plan)
            };
        }

        return {
            initialized,
            phase: TOTC_ENCOUNTER_PHASES.includes(existing.phase) ? existing.phase : "planning",
            apBudget: Number(existing.apBudget ?? getActionPointBudget() ?? TOTC_BASE_ACTION_POINT_BUDGET),
            actionCatalog,
            perCombatant,
            timeline: toArray(existing.timeline),
            planningStartedAt: Number(existing.planningStartedAt ?? 0),
            round: Number(existing.round ?? this.#combat.round ?? 1)
        };
    }

    async #setState(state, { emitStateInitialized = false } = {}) {
        await this.#combat.setFlag(ENCOUNTER_FLAG_SCOPE, ENCOUNTER_FLAG_KEY, state);
        if (emitStateInitialized) {
            this.emit(TOTC_ENCOUNTER_EVENTS.STATE_INITIALIZED, { state });
        }
        return state;
    }

    /**
     * Returns the per-combatant state object for a given combatant, or `null`
     * if the combatant is not tracked in the current encounter state.
     *
     * @param {string} combatantId
     * @returns {object|null}
     */
    getCombatantState(combatantId) {
        return this.state.perCombatant?.[combatantId] ?? null;
    }

    /**
     * Returns the current action plan (ordered action array) for a combatant.
     *
     * @param {string} combatantId
     * @returns {object[]}
     */
    getCombatantPlan(combatantId) {
        return toArray(this.getCombatantState(combatantId)?.plan);
    }

    /**
     * Returns the number of AP already spent by a combatant this round.
     *
     * @param {string} combatantId
     * @returns {number}
     */
    getCombatantSpentAp(combatantId) {
        return Number(this.getCombatantState(combatantId)?.spentAp ?? 0);
    }

    /**
     * Returns the number of AP remaining in the combatant's budget after
     * accounting for all actions currently in their plan.
     *
     * @param {string} combatantId
     * @returns {number}
     */
    getCombatantRemainingAp(combatantId) {
        return Math.max(0, this.apBudget - this.getCombatantPlan(combatantId).reduce((sum, action) => sum + Number(action.apCost || 0), 0));
    }

    /**
     * Returns combatants that have not yet rolled initiative this round.
     *
     * @returns {Combatant[]}
     */
    getMissingInitiativeCombatants() {
        return (this.#combat.combatants?.contents ?? []).filter((combatant) => !hasInitiativeValue(combatant.initiative));
    }

    /**
     * `true` when at least one combatant still needs to roll initiative,
     * blocking the planning phase from proceeding.
     * @returns {boolean}
     */
    get hasInitiativeGateActive() {
        return this.getMissingInitiativeCombatants().length > 0;
    }

    /**
     * Returns `true` if the current user is allowed to roll initiative for
     * the given combatant (GM always can; players must own the combatant's actor).
     *
     * @param {string} combatantId
     * @returns {boolean}
     */
    canCurrentUserRollInitiative(combatantId) {
        if (game.user?.isGM) return true;
        const combatant = getCombatantFromId(this.#combat, combatantId);
        return Boolean(combatant?.actor?.isOwner);
    }

    #isCombatantOwnedByCurrentUser(combatantId) {
        if (game.user?.isGM) return true;

        const combatant = getCombatantFromId(this.#combat, combatantId);
        return Boolean(combatant?.actor?.isOwner);
    }

    #requireGm(action) {
        if (game.user?.isGM) return;
        throw new Error(`Only the GM can ${action}.`);
    }

    #requireInitiativeReady() {
        if (!this.hasInitiativeGateActive) return;
        throw new Error("All encounter participants must roll initiative before planning can begin.");
    }

    #requirePlanningOpen(combatantId) {
        if (this.phase !== "planning") {
            throw new Error("Encounter planning is not currently open.");
        }

        const state = this.getCombatantState(combatantId);
        if (!state) throw new Error(`Combatant ${combatantId} is not part of this encounter.`);
        if (state.ready) {
            throw new Error("Action plan is already committed for this round.");
        }
    }

    /**
     * If all combatants have committed their plans, or the planning time limit
     * has expired, automatically calls {@link resolveEncounterRound}.
     * Only executes when the current user is the GM.
     *
     * @returns {Promise<boolean>} `true` if resolution was triggered, `false` otherwise.
     */
    async maybeAutoFinalizePlanning() {
        if (this.hasInitiativeGateActive) return false;
        if (this.phase !== "planning") return false;

        const combatants = this.#combat.combatants?.contents ?? [];
        if (!combatants.length) return false;

        const allCommitted = combatants.every((combatant) => Boolean(this.getCombatantState(combatant.id)?.ready));
        const expired = this.isPlanningExpired;
        if (!allCommitted && !expired) return false;
        if (!game.user?.isGM) return false;

        await this.resolveEncounterRound();
        return true;
    }

    /**
     * Mark a combatant's action plan as committed (ready) or un-committed.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.COMBATANT_READY_CHANGED} and may
     * trigger auto-finalization if all combatants are now ready.
     *
     * @param {string}  combatantId - The combatant to update.
     * @param {boolean} ready       - `true` to commit, `false` to un-commit.
     * @returns {Promise<void>}
     */
    async setCombatantReady(combatantId, ready) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to commit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.state;
        const perCombatant = foundry.utils.deepClone(state.perCombatant ?? {});
        if (!perCombatant[combatantId]) throw new Error(`Combatant ${combatantId} is not part of this encounter.`);

        perCombatant[combatantId].ready = Boolean(ready);
        perCombatant[combatantId].committedAt = ready ? Date.now() : 0;

        await this.#setState({
            ...state,
            perCombatant
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.COMBATANT_READY_CHANGED, {
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
     * @param {string} combatantId - The combatant to update.
     * @param {object} action      - An action descriptor object from the action catalog.
     * @returns {Promise<void>}
     */
    async addCombatantAction(combatantId, action) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.getCombatantPlan(combatantId);
        await this.setCombatantPlan(combatantId, [...plan, action]);
    }

    /**
     * Remove the action at a given index from a combatant's plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId - The combatant to update.
     * @param {number} index       - Zero-based index of the action to remove.
     * @returns {Promise<void>}
     */
    async removeCombatantAction(combatantId, index) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const plan = this.getCombatantPlan(combatantId);
        const next = plan.filter((_, currentIndex) => currentIndex !== Number(index));
        await this.setCombatantPlan(combatantId, next);
    }

    /**
     * Remove all actions from a combatant's plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId - The combatant to update.
     * @returns {Promise<void>}
     */
    async clearCombatantPlan(combatantId) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        await this.setCombatantPlan(combatantId, []);
    }

    /**
     * Adjust the AP cost of a single action in a combatant's plan, clamped to
     * the action's min/max range. For movement actions, `movementFeet` is
     * recalculated automatically.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId  - The combatant to update.
     * @param {number} actionIndex  - Zero-based index of the action to adjust.
     * @param {number} apCost       - Desired new AP cost.
     * @returns {Promise<void>}
     */
    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const index = Number(actionIndex);
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(`Invalid action index: ${actionIndex}`);
        }

        const plan = this.getCombatantPlan(combatantId).map((action, currentIndex) => {
            if (currentIndex !== index) return action;

            const min = clampActionCost(action.apMin ?? action.apCost ?? 1);
            const max = Math.max(min, clampActionCost(action.apMax ?? action.apCost ?? min));
            const nextCost = Math.max(min, Math.min(max, clampActionCost(apCost)));
            const movementFeetPerAp = Number(action.movementFeetPerAp || getMovementFeetPerAp() || 10);

            return {
                ...action,
                apCost: nextCost,
                movementFeet: action.type === "movement" ? movementFeetPerAp * nextCost : Number(action.movementFeet || 0)
            };
        });

        await this.setCombatantPlan(combatantId, plan);
    }

    /**
     * Returns all actions currently available to a combatant based on their
     * equipped items and the active action catalog. Includes catalog movement
     * and defense actions plus per-item action variants.
     *
     * @param {string} combatantId
     * @returns {object[]} Array of action descriptor objects.
     */
    getAvailableActionsForCombatant(combatantId) {
        const combatant = getCombatantFromId(this.#combat, combatantId);
        if (!combatant?.actor) return [];

        const catalog = this.actionCatalog;
        const movementTemplate = catalog.move ?? catalog.move10ft;
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);
        const movementAction = movementTemplate
            ? [{
                id: movementTemplate.id,
                actionId: movementTemplate.id,
                type: movementTemplate.type,
                label: game.i18n.localize("TOTC.Encounter.Action.Move"),
                apCost: Number(movementTemplate.apCost ?? 1),
                apMin: Number(movementTemplate.apMin ?? 1),
                apMax: Number(movementTemplate.apMax ?? this.apBudget),
                variableAp: Boolean(movementTemplate.variableAp),
                movementFeet: Number((movementTemplate.apCost ?? 1) * movementFeetPerAp),
                movementFeetPerAp,
                requiresToHit: false,
                toHitBonus: 0,
                itemId: null
            }]
            : [];

        const defendAction = catalog.defend
            ? [{
                id: catalog.defend.id,
                actionId: catalog.defend.id,
                type: catalog.defend.type,
                label: game.i18n.localize("TOTC.Encounter.Action.Defend"),
                apCost: Number(catalog.defend.apCost ?? 1),
                apMin: Number(catalog.defend.apMin ?? 1),
                apMax: Number(catalog.defend.apMax ?? this.apBudget),
                variableAp: Boolean(catalog.defend.variableAp),
                requiresToHit: false,
                toHitBonus: 0,
                itemId: null
            }]
            : [];

        const itemActions = combatant.actor.items.contents.flatMap((item) => {
            const variants = item.actionVariants ?? [];
            return variants.map((variant) => ({
                id: `${item.id}:${variant.id}`,
                actionId: variant.id,
                type: variant.type,
                label: `${item.name}: ${variant.label}`,
                apCost: item.type === "consumable" ? this.#getConsumableApCost(combatant.actor, item, variant) : Number(variant.apCost ?? 1),
                apMin: Number(variant.apCost ?? 1),
                apMax: Number(variant.apCost ?? 1),
                variableAp: false,
                requiresToHit: Boolean(variant.requiresToHit),
                toHitBonus: Number(variant.toHitBonus ?? 0),
                itemId: item.id
            }));
        });

        return [...movementAction, ...defendAction, ...itemActions];
    }

    #getConsumableApCost(actor, item, variant) {
        const beltIds = toArray(actor.system?.inventory?.equipment?.belt?.itemIds);
        if (beltIds.includes(item.id)) return 1;

        const packIds = toArray(actor.system?.inventory?.pack?.itemIds);
        if (packIds.includes(item.id)) return 3;

        return Number(variant.apCost ?? 1);
    }

    /**
     * Returns a list of possible targets for a combatant — all other
     * combatants currently in the encounter.
     *
     * @param {string} combatantId - The acting combatant to exclude from the list.
     * @returns {{ id: string, name: string }[]}
     */
    getTargetOptionsForCombatant(combatantId) {
        return (this.#combat.combatants?.contents ?? [])
            .filter((combatant) => combatant.id !== combatantId)
            .map((combatant) => ({
                id: combatant.id,
                name: combatant.name
            }));
    }

    /**
     * Initialize a new encounter round. Clears all combatant plans, resets
     * initiative values, writes fresh state to the combat flag, and emits
     * {@link TOTC_ENCOUNTER_EVENTS.STATE_INITIALIZED}, {@link TOTC_ENCOUNTER_EVENTS.ROUND_STARTED},
     * and (if starting in the planning phase) {@link TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED}.
     *
     * GM only.
     *
     * @param {object} [options]
     * @param {string} [options.phase="planning"] - Initial phase. Must be a value from `TOTC_ENCOUNTER_PHASES`.
     * @returns {Promise<object>} The newly written encounter state.
     */
    async initializeEncounterRound({ phase = "planning" } = {}) {
        this.#requireGm("initialize encounter rounds");

        if (!TOTC_ENCOUNTER_PHASES.includes(phase)) phase = "planning";

        await this.#resetInitiativeForEncounter();

        const perCombatant = Object.fromEntries(
            (this.#combat.combatants?.contents ?? []).map((combatant) => [
                combatant.id,
                this.#defaultCombatantState()
            ])
        );

        const state = {
            initialized: true,
            phase,
            apBudget: this.apBudget,
            actionCatalog: this.actionCatalog,
            perCombatant,
            timeline: [],
            planningStartedAt: phase === "planning" ? Date.now() : 0,
            round: this.#combat.round || 1
        };

        await this.#setState(state, { emitStateInitialized: true });
        this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_STARTED, { round: state.round, state });
        if (phase === "planning") {
            this.emit(TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED, { round: state.round, state });
        }

        return state;
    }

    async #resetInitiativeForEncounter() {
        const updates = (this.#combat.combatants?.contents ?? [])
            .filter((combatant) => hasInitiativeValue(combatant.initiative))
            .map((combatant) => ({ _id: combatant.id, initiative: null }));

        if (!updates.length) return;
        await this.#combat.updateEmbeddedDocuments("Combatant", updates);
    }

    /**
     * Roll initiative for a single combatant. Any user who owns the combatant's
     * actor may call this; the GM can roll for any combatant.
     *
     * @param {string} combatantId
     * @returns {Promise<Combatant>} The updated combatant document.
     */
    async rollEncounterInitiative(combatantId) {
        if (!combatantId) throw new Error("Missing combatant ID for initiative roll.");
        if (!this.canCurrentUserRollInitiative(combatantId)) {
            throw new Error("You do not have permission to roll initiative for this combatant.");
        }

        await this.#combat.rollInitiative([combatantId]);
        return getCombatantFromId(this.#combat, combatantId);
    }

    /**
     * Roll initiative for every combatant that has not yet rolled. GM only.
     *
     * @returns {Promise<string[]>} Array of combatant IDs that were rolled.
     */
    async rollAllMissingInitiatives() {
        this.#requireGm("roll initiative for all participants");
        const ids = this.getMissingInitiativeCombatants().map((combatant) => combatant.id);
        if (!ids.length) return [];
        await this.#combat.rollInitiative(ids);
        return ids;
    }

    async setCombatantPlan(combatantId, actions = []) {
        this.#requireInitiativeReady();
        if (!this.#isCombatantOwnedByCurrentUser(combatantId)) {
            throw new Error("You do not have permission to edit this combatant's plan.");
        }
        this.#requirePlanningOpen(combatantId);

        const state = this.state;
        const perCombatant = foundry.utils.deepClone(state.perCombatant ?? {});
        const combatantState = perCombatant[combatantId];
        if (!combatantState) throw new Error(`Combatant ${combatantId} is not part of the encounter state.`);

        const normalized = toArray(actions).map((action, index) => clampActionData(action, index));

        const totalCost = normalized.reduce((sum, action) => sum + action.apCost, 0);
        if (totalCost > this.apBudget) {
            throw new Error(`Action plan exceeds AP budget (${totalCost}/${this.apBudget}).`);
        }

        perCombatant[combatantId] = {
            ...combatantState,
            spentAp: 0,
            remainingAp: Math.max(0, this.apBudget - totalCost),
            plan: normalized,
            pointer: 0,
            progress: 0,
            ready: false,
            committedAt: 0
        };

        await this.#setState({
            ...state,
            phase: "planning",
            perCombatant
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED, {
            combatantId,
            plan: perCombatant[combatantId].plan
        });
    }

    /**
     * Transition the encounter to a new phase. Emits
     * {@link TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED} and, where applicable,
     * {@link TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED} or
     * {@link TOTC_ENCOUNTER_EVENTS.PLANNING_ENDED}. GM only.
     *
     * @param {string} phase - Target phase. Must be one of `TOTC_ENCOUNTER_PHASES`.
     * @returns {Promise<void>}
     */
    async setEncounterPhase(phase) {
        this.#requireGm("change encounter phases");

        if (!TOTC_ENCOUNTER_PHASES.includes(phase)) throw new Error(`Unsupported encounter phase: ${phase}`);

        const currentState = this.state;
        const priorPhase = currentState.phase;

        await this.#setState({
            ...currentState,
            phase,
            planningStartedAt: phase === "planning" && !currentState.planningStartedAt
                ? Date.now()
                : phase === "planning"
                    ? currentState.planningStartedAt
                    : 0
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
            phase,
            previousPhase: priorPhase
        });

        if (phase === "planning" && priorPhase !== "planning") {
            this.emit(TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED, {
                previousPhase: priorPhase,
                phase
            });
        }

        if (phase !== "planning" && priorPhase === "planning") {
            this.emit(TOTC_ENCOUNTER_EVENTS.PLANNING_ENDED, {
                previousPhase: priorPhase,
                phase
            });
        }
    }

    /**
     * Run the full AP-tick resolution loop for the current round. Iterates over
     * all AP ticks in initiative order, executes each combatant's planned actions,
     * applies damage, builds a timeline, publishes GM-only narration to chat, and
     * emits {@link TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED}. GM only.
     *
     * @returns {Promise<object[]>} The completed timeline — one entry per AP tick per combatant.
     */
    async resolveEncounterRound() {
        this.#requireGm("resolve encounter rounds");
        this.#requireInitiativeReady();

        const initialState = this.state;
        const perCombatant = foundry.utils.deepClone(initialState.perCombatant ?? {});
        const timeline = [];

        await this.setEncounterPhase("locked");
        await this.setEncounterPhase("resolving");

        const orderedCombatants = sortByInitiativeDescending(this.#combat.combatants?.contents ?? []);
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);
        for (let tick = 1; tick <= this.apBudget; tick += 1) {
            for (const combatant of orderedCombatants) {
                const state = perCombatant[combatant.id];
                if (!state || state.remainingAp <= 0) continue;

                const action = state.plan?.[state.pointer];
                if (!action) {
                    state.remainingAp = Math.max(0, state.remainingAp - 1);
                    state.spentAp += 1;
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action: null,
                        outcome: {
                            result: "forfeit",
                            detail: `${combatant.name} forfeits 1 AP with no planned action.`
                        }
                    });
                    continue;
                }

                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                state.progress += 1;

                if (action.type === "movement") {
                    const stepFeet = Number(action.movementFeetPerAp || movementFeetPerAp || 10);
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "movementStep",
                            detail: `${combatant.name} moves ${stepFeet} ft.`
                        }
                    });
                } else if (state.progress < action.apCost) {
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "progress",
                            detail: `${combatant.name} continues ${action.label} (${state.progress}/${action.apCost} AP).`
                        }
                    });
                }

                if (state.progress < action.apCost) continue;

                if (action.type !== "movement") {
                    const outcome = await this.#resolveAction(combatant, action);
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome
                    });
                }

                state.pointer += 1;
                state.progress = 0;
            }
        }

        await this.#setState({
            ...this.state,
            phase: "roundComplete",
            timeline,
            planningStartedAt: 0,
            perCombatant
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
            phase: "roundComplete",
            previousPhase: "resolving"
        });
        this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED, {
            round: this.#combat.round || this.state.round || 1,
            timeline
        });

        await this.#publishRoundReplay(timeline);
        return timeline;
    }

    async #resolveAction(combatant, action) {
        const actor = combatant.actor;
        const item = action.itemId ? actor?.items?.get(action.itemId) : null;

        if (item) {
            const useResult = await item.executeEncounterAction?.({
                actor,
                actionId: action.actionId,
                consume: true
            });

            if (useResult && !useResult.success) {
                return {
                    result: "failed",
                    detail: `${combatant.name} cannot complete ${action.label} (${useResult.reason}).`
                };
            }
        }

        if (action.type === "movement") {
            return {
                result: "moved",
                detail: `${combatant.name} advances ${toNumber(action.movementFeet, 10)} ft.`
            };
        }

        if (action.type === "defense") {
            return {
                result: "defended",
                detail: `${combatant.name} braces defensively for ${Math.max(1, toNumber(action.apCost, 1))} AP.`
            };
        }

        if (!action.requiresToHit && action.type !== "attack") {
            return {
                result: "resolved",
                detail: `${combatant.name} completes ${action.label}.`
            };
        }

        const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
        const weaponData = item?.system ?? {};
        const attackAbilityBonus = this.#getAttackAbilityBonus(actor, item);
        const toHitFlatBonus = Number(action.toHitBonus || 0);

        const roll = await (new Roll("1d20")).roll({ async: true });
        const natural = Number(roll.total ?? 0);

        const targetForFumble = this.#selectCriticalFailureTarget(combatant.id, action.targetId);

        const targetArmorClass = toNumber(targetCombatant?.actor?.system?.defenses?.armorClass, 10);
        const toHitTotal = natural + attackAbilityBonus + toHitFlatBonus;
        const hits = natural === 20 || (natural !== 1 && toHitTotal >= targetArmorClass);

        const damageRoll = await this.#rollDamageForAction({ actor, item, action, weaponData });
        const baseDamage = Math.max(0, toNumber(damageRoll.total, 0));

        if (natural === 20) {
            const appliedDamage = baseDamage * 2;
            await this.#applyDamageToCombatant(targetCombatant, appliedDamage);

            return {
                result: "criticalHit",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                targetCombatantId: targetCombatant?.id ?? null,
                targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.Target.Unspecified"),
                detail: `${combatant.name} critically hits ${targetCombatant?.name ?? "the target"} with ${action.label} for ${formatDamageText(appliedDamage)}.`
            };
        }

        if (natural === 1) {
            const redirectedTarget = targetForFumble;
            const appliedDamage = baseDamage * 2;
            await this.#applyDamageToCombatant(redirectedTarget, appliedDamage);

            return {
                result: "criticalFailure",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                redirectedTargetId: redirectedTarget?.id ?? null,
                redirectedTargetName: redirectedTarget?.name ?? null,
                detail: `${combatant.name} critically fumbles ${action.label}, dealing ${formatDamageText(appliedDamage)} to ${redirectedTarget?.name ?? "an unintended target"}.`
            };
        }

        if (hits) {
            await this.#applyDamageToCombatant(targetCombatant, baseDamage);
        }

        return {
            result: hits ? "hit" : "miss",
            roll: natural,
            total: toHitTotal,
            targetArmorClass,
            damage: hits ? baseDamage : 0,
            targetCombatantId: targetCombatant?.id ?? null,
            targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.Target.Unspecified"),
            detail: hits
                ? `${combatant.name} hits ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}) for ${formatDamageText(baseDamage)}.`
                : `${combatant.name} misses ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}, total ${toHitTotal}).`
        };
    }

    #resolveDeclaredTarget(sourceCombatantId, targetCombatantId) {
        if (targetCombatantId) {
            return this.#combat.combatants?.get(targetCombatantId) ?? null;
        }

        const candidates = (this.#combat.combatants?.contents ?? []).filter((combatant) => combatant.id !== sourceCombatantId);
        return candidates[0] ?? null;
    }

    #getAttackAbilityBonus(actor, item) {
        const classification = String(item?.system?.classification ?? "");
        const dexClassifications = new Set(["simpleRanged", "martialRanged", "firearm", "explosive", "thrown"]);
        const abilityKey = dexClassifications.has(classification) ? "dex" : "str";
        return toNumber(actor?.system?.abilities?.[abilityKey]?.bonus, 0);
    }

    async #rollDamageForAction({ actor, item, action, weaponData }) {
        const formula = String(weaponData?.damage?.formula || "1").trim() || "1";
        const bonus = toNumber(weaponData?.damage?.bonus, 0);
        const compiled = bonus ? `${formula} + ${bonus}` : formula;

        const rollData = {
            actor: actor?.getRollData?.() ?? actor?.system ?? {},
            item: item?.getRollData?.() ?? item?.system ?? {},
            action
        };

        return (new Roll(compiled, rollData)).roll({ async: true });
    }

    async #applyDamageToCombatant(combatant, amount) {
        if (!combatant?.actor) return;
        const actor = combatant.actor;
        const current = toNumber(actor.system?.resources?.health?.value, 0);
        const next = Math.max(0, current - Math.max(0, toNumber(amount, 0)));
        await actor.update({ "system.resources.health.value": next });
    }

    #selectCriticalFailureTarget(sourceCombatantId, intendedTargetId) {
        const candidates = (this.#combat.combatants?.contents ?? []).filter((candidate) => {
            if (!candidate?.id) return false;
            if (candidate.id === intendedTargetId) return false;
            return true;
        });

        if (!candidates.length) {
            return this.#combat.combatants?.get(sourceCombatantId) ?? null;
        }

        return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    }

    async #publishRoundReplay(timeline) {
        if (!timeline.length) return;

        const round = this.#combat.round || this.state.round || 1;
        const gmLines = timeline.map((entry) => createNarrationMessage(round, entry.tick, entry.outcome.detail));
        const summaryText = game.i18n.format("TOTC.Encounter.RoundSummary", {
            round,
            actionCount: timeline.length
        });

        await ChatMessage.create({
            content: summaryText,
            flags: {
                "turn-of-the-century": {
                    type: "encounter-round-summary",
                    round,
                    timeline
                }
            }
        });

        await ChatMessage.create({
            content: gmLines.map((line) => `<p class="totc-encounter-replay-line">${line}</p>`).join(""),
            whisper: getWhisperRecipientsForGm(),
            flags: {
                "turn-of-the-century": {
                    type: "encounter-round-narration",
                    gmOnly: true,
                    round,
                    timeline
                }
            }
        });
    }
}

export class TurnOfTheCenturyCombat extends Combat {
    #encounter = null;

    get encounter() {
        if (!this.#encounter) {
            this.#encounter = new TurnOfTheCenturyEncounter(this);
        }
        return this.#encounter;
    }

    get encounterState() {
        return this.encounter.state;
    }

    get phase() {
        return this.encounter.phase;
    }

    get actionCatalog() {
        return this.encounter.actionCatalog;
    }

    get apBudget() {
        return this.encounter.apBudget;
    }

    get planningWarningSeconds() {
        return this.encounter.planningWarningSeconds;
    }

    get planningLimitSeconds() {
        return this.encounter.planningLimitSeconds;
    }

    get planningStartedAt() {
        return this.encounter.planningStartedAt;
    }

    get planningElapsedSeconds() {
        return this.encounter.planningElapsedSeconds;
    }

    get planningRemainingSeconds() {
        return this.encounter.planningRemainingSeconds;
    }

    get isPlanningExpired() {
        return this.encounter.isPlanningExpired;
    }

    get isPlanningWarningActive() {
        return this.encounter.isPlanningWarningActive;
    }

    get hasInitiativeGateActive() {
        return this.encounter.hasInitiativeGateActive;
    }

    onEncounter(eventName, listener) {
        return this.encounter.on(eventName, listener);
    }

    offEncounter(eventName, listener) {
        this.encounter.off(eventName, listener);
    }

    getCombatantState(combatantId) {
        return this.encounter.getCombatantState(combatantId);
    }

    getCombatantPlan(combatantId) {
        return this.encounter.getCombatantPlan(combatantId);
    }

    getCombatantSpentAp(combatantId) {
        return this.encounter.getCombatantSpentAp(combatantId);
    }

    getCombatantRemainingAp(combatantId) {
        return this.encounter.getCombatantRemainingAp(combatantId);
    }

    getMissingInitiativeCombatants() {
        return this.encounter.getMissingInitiativeCombatants();
    }

    canCurrentUserRollInitiative(combatantId) {
        return this.encounter.canCurrentUserRollInitiative(combatantId);
    }

    async maybeAutoFinalizePlanning() {
        return this.encounter.maybeAutoFinalizePlanning();
    }

    async setCombatantReady(combatantId, ready) {
        return this.encounter.setCombatantReady(combatantId, ready);
    }

    async addCombatantAction(combatantId, action) {
        return this.encounter.addCombatantAction(combatantId, action);
    }

    async removeCombatantAction(combatantId, index) {
        return this.encounter.removeCombatantAction(combatantId, index);
    }

    async clearCombatantPlan(combatantId) {
        return this.encounter.clearCombatantPlan(combatantId);
    }

    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        return this.encounter.setCombatantActionApCost(combatantId, actionIndex, apCost);
    }

    getAvailableActionsForCombatant(combatantId) {
        return this.encounter.getAvailableActionsForCombatant(combatantId);
    }

    getTargetOptionsForCombatant(combatantId) {
        return this.encounter.getTargetOptionsForCombatant(combatantId);
    }

    async initializeEncounterRound(options = {}) {
        return this.encounter.initializeEncounterRound(options);
    }

    async rollEncounterInitiative(combatantId) {
        return this.encounter.rollEncounterInitiative(combatantId);
    }

    async rollAllMissingInitiatives() {
        return this.encounter.rollAllMissingInitiatives();
    }

    async setCombatantPlan(combatantId, actions = []) {
        return this.encounter.setCombatantPlan(combatantId, actions);
    }

    async setEncounterPhase(phase) {
        return this.encounter.setEncounterPhase(phase);
    }

    async resolveEncounterRound() {
        return this.encounter.resolveEncounterRound();
    }
}
