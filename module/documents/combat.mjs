import {
    TOTC_BASE_ACTION_POINT_BUDGET,
    TOTC_ENCOUNTER_PHASES,
    getActionPointBudget,
    getBaseActionCatalog,
    getMovementFeetPerAp,
    getPlanningLimitSeconds,
    getPlanningWarningSeconds
} from "../encounters/action-catalog.mjs";
import { getEnabledActionsForActor } from "../encounters/item-action-publisher.mjs";
import { dieRollRequestManager } from "../die-roll-request-manager.mjs";
import {
    adjacentFreePosition,
    findGridConflicts,
    lowestStrengthCombatantId,
    resolveContestedDexterity
} from "../encounters/round-end-collision.mjs";
import {
    findGridMovementPath,
    movementPathLength,
    pointAlongMovementPath
} from "../encounters/grid-pathfinding.mjs";

const BaseCombatDocument = foundry.documents?.Combat ?? Combat;

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
 * @property {string} ROUND_RESOLVED       - Fired after the AP timeline has been resolved and encounter state updated.
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

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

function wait(ms = 0) {
    const delay = Math.max(0, Number(ms) || 0);
    if (!delay) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, delay));
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

function tokenDocumentId(token = null) {
    return String(token?.id ?? token?._id ?? token?.document?.id ?? token?.document?._id ?? "").trim();
}

function tokenDocumentForUpdate(token = null) {
    return token?.document ?? token ?? null;
}

function resolvePropertyPath(source, path) {
    if (!path) return undefined;
    if (typeof foundry?.utils?.getProperty === "function") {
        return foundry.utils.getProperty(source, path);
    }
    return String(path).split(".").reduce((current, key) => current?.[key], source);
}

function formatRecapTemplate(template, context = {}) {
    const rawTemplate = String(template ?? "").trim();
    if (!rawTemplate) return "";

    return rawTemplate.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression) => {
        const value = resolvePropertyPath(context, String(expression).trim());
        return value === null || value === undefined ? "" : String(value);
    });
}

function hasInitiativeValue(value) {
    const number = Number(value);
    return Number.isFinite(number);
}

function reactionRuntimeFromResolution(resolution = {}) {
    return {
        consumedKeys: new Set(toArray(resolution?.reactionConsumedKeys).map((key) => String(key)))
    };
}

function serializeReactionRuntime(reactionRuntime = null) {
    return [...(reactionRuntime?.consumedKeys ?? new Set())];
}

function optionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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
        movementOriginY: optionalNumber(action.movementOriginY)
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

    #defaultCombatantState(apBudget) {
        return {
            spentAp: 0,
            remainingAp: apBudget,
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

        const apBudget = Number(existing.apBudget ?? getActionPointBudget() ?? TOTC_BASE_ACTION_POINT_BUDGET);

        const perCombatant = foundry.utils.deepClone(existing.perCombatant ?? {});
        for (const combatant of this.#combat.combatants?.contents ?? []) {
            perCombatant[combatant.id] = {
                ...this.#defaultCombatantState(apBudget),
                ...(perCombatant[combatant.id] ?? {}),
                plan: toArray(perCombatant[combatant.id]?.plan)
            };
        }

        return {
            initialized,
            phase: TOTC_ENCOUNTER_PHASES.includes(existing.phase) ? existing.phase : "planning",
            apBudget,
            actionCatalog,
            perCombatant,
            timeline: toArray(existing.timeline),
            roundHistory: toArray(existing.roundHistory),
            currentEvaluationTick: Number(existing.currentEvaluationTick ?? existing.evaluationTick ?? 0),
            resolution: existing.resolution && typeof existing.resolution === "object"
                ? foundry.utils.deepClone(existing.resolution)
                : {
                    status: "idle",
                    currentTick: 0,
                    totalTicks: apBudget,
                    snapshots: [],
                    tickNarratives: []
                },
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

        if (ready) {
            await this.#restoreCombatantPlanningOrigin(combatantId, perCombatant[combatantId].plan);
        }

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
     * Returns all actions currently available to a combatant.
     *
     * Universal actions (move, defend) are always included.  Per-item actions
     * are derived from each item's stored action variants and filtered by their
     * data-driven requirements against the item's current state (e.g. a firearm
     * whose ammunition is exhausted will not offer fire actions).
     *
     * @param {string} combatantId
     * @returns {object[]} Array of action descriptor objects.
     */
    getAvailableActionsForCombatant(combatantId) {
        const combatant = getCombatantFromId(this.#combat, combatantId);
        if (!combatant?.actor) return [];
        return getEnabledActionsForActor(combatant.actor, {
            apBudget: this.apBudget,
            movementFeetPerAp: Number(getMovementFeetPerAp() || 10)
        });
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

    async syncSceneCombatants({ tokenDocuments = null } = {}) {
        const scene = this.#combat.scene ?? canvas?.scene ?? null;
        const sceneId = String(scene?.id ?? this.#combat.sceneId ?? "").trim();
        if (!sceneId) return [];

        const tokens = tokenDocuments
            ? toArray(tokenDocuments)
            : toArray(scene?.tokens?.contents ?? scene?.tokens ?? []);
        const existingByTokenId = new Set((this.#combat.combatants?.contents ?? [])
            .map((combatant) => String(combatant?.tokenId ?? "").trim())
            .filter(Boolean));
        const docs = tokens
            .filter((token) => token && String(token.actorId ?? token.actor?.id ?? "").trim())
            .map((token) => ({
                tokenId: String(token.id ?? token._id ?? "").trim(),
                actorId: String(token.actorId ?? token.actor?.id ?? "").trim(),
                sceneId,
                hidden: Boolean(token.hidden)
            }))
            .filter((doc) => doc.tokenId && !existingByTokenId.has(doc.tokenId));

        if (!docs.length) return [];
        return await this.#combat.createEmbeddedDocuments("Combatant", docs);
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

        const previousState = this.state;

        // Ensure every tokenized actor currently on the combat scene is represented
        // before encounter state is rebuilt for the new round.
        await this.syncSceneCombatants();

        await this.#resetInitiativeForEncounter();

        const perCombatant = Object.fromEntries(
            (this.#combat.combatants?.contents ?? []).map((combatant) => [
                combatant.id,
                this.#defaultCombatantState(this.apBudget)
            ])
        );

        const state = {
            initialized: true,
            phase,
            apBudget: this.apBudget,
            actionCatalog: this.actionCatalog,
            perCombatant,
            timeline: [],
            roundHistory: toArray(previousState.roundHistory),
            currentEvaluationTick: 0,
            resolution: {
                status: "idle",
                currentTick: 0,
                totalTicks: this.apBudget,
                snapshots: [],
                tickNarratives: []
            },
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

    async beginEncounterResolution() {
        this.#requireGm("begin encounter resolution");
        this.#requireInitiativeReady();
        await this.#beginEncounterResolution({ persistInitialState: true });
        return this.state.resolution ?? null;
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
            // This field is consumed by the tick evaluator, so it represents
            // runtime AP remaining in the round. Planning capacity is derived
            // separately by getCombatantRemainingAp from the action costs.
            remainingAp: this.apBudget,
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
        const reopeningPlanning = phase === "planning" && priorPhase !== "planning";
        const perCombatant = reopeningPlanning
            ? Object.fromEntries(Object.entries(currentState.perCombatant ?? {}).map(([combatantId, combatantState]) => [
                combatantId,
                {
                    ...combatantState,
                    ready: false,
                    committedAt: 0
                }
            ]))
            : currentState.perCombatant;

        await this.#setState({
            ...currentState,
            phase,
            perCombatant,
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

    #getCombatantTokenDocument(combatant) {
        const tokenId = String(combatant?.tokenId ?? combatant?.token?.id ?? combatant?.token?.document?.id ?? "").trim();
        if (!tokenId) return null;

        // Foundry's Combatant document owns the authoritative relationship to its
        // TokenDocument. Prefer that relationship over rediscovering a token by an
        // ID which is only unique within a Scene.
        const combatantToken = tokenDocumentForUpdate(combatant?.token);
        if (combatantToken && tokenDocumentId(combatantToken) === tokenId) {
            return combatantToken;
        }

        const currentSceneToken = canvas?.scene?.tokens?.get?.(tokenId) ?? null;
        if (currentSceneToken) return tokenDocumentForUpdate(currentSceneToken);

        const placeableToken = toArray(canvas?.tokens?.placeables)
            .find((token) => tokenDocumentId(token) === tokenId) ?? null;
        if (placeableToken) return tokenDocumentForUpdate(placeableToken);

        for (const scene of game.scenes?.contents ?? []) {
            const token = scene?.tokens?.get?.(tokenId);
            if (token) return tokenDocumentForUpdate(token);
        }

        return null;
    }

    async #restoreCombatantPlanningOrigin(combatantId, plan = []) {
        const movementAction = toArray(plan).find((action) => (
            String(action?.type ?? "") === "movement"
            && Number.isFinite(Number(action?.movementOriginX))
            && Number.isFinite(Number(action?.movementOriginY))
        ));
        if (!movementAction) return;

        const combatant = this.#combat.combatants?.get(combatantId) ?? null;
        const token = this.#getCombatantTokenDocument(combatant);
        const tokenDocument = tokenDocumentForUpdate(token);
        if (!tokenDocument?.update) return;

        const originX = Number(movementAction.movementOriginX);
        const originY = Number(movementAction.movementOriginY);
        const currentX = toNumber(tokenDocument.x ?? token?.x, 0);
        const currentY = toNumber(tokenDocument.y ?? token?.y, 0);
        if (Math.abs(currentX - originX) <= Number.EPSILON && Math.abs(currentY - originY) <= Number.EPSILON) {
            return;
        }

        await tokenDocument.update({ x: originX, y: originY });
    }

    async #restorePlanningOrigins(perCombatant = {}) {
        const updates = [];
        for (const [combatantId, combatantState] of Object.entries(perCombatant ?? {})) {
            updates.push(this.#restoreCombatantPlanningOrigin(combatantId, combatantState?.plan));
        }
        await Promise.all(updates);
    }

    async #captureResolutionSnapshot({ tick = 0, perCombatant = {}, timeline = [], tickNarratives = [], tokenPositionOverrides = null } = {}) {
        const actorHealth = {};
        const actorResources = {};
        const actorItemSystems = {};
        const tokenPositions = {};

        for (const combatant of this.#combat.combatants?.contents ?? []) {
            const actorId = String(combatant?.actor?.id ?? "").trim();
            if (actorId) {
                actorHealth[actorId] = toNumber(combatant?.actor?.system?.resources?.health?.value, 0);
                actorResources[actorId] = foundry.utils.deepClone(combatant?.actor?.system?.resources ?? {});

                const itemSystems = {};
                for (const item of combatant?.actor?.items?.contents ?? []) {
                    if (!item?.id) continue;
                    itemSystems[item.id] = foundry.utils.deepClone(item.system ?? {});
                }
                actorItemSystems[actorId] = itemSystems;
            }

            const token = this.#getCombatantTokenDocument(combatant);
            const tokenId = tokenDocumentId(token);
            if (tokenId) {
                tokenPositions[tokenId] = tokenPositionOverrides?.[tokenId] ?? {
                    x: toNumber(token.x ?? token.document?.x, 0),
                    y: toNumber(token.y ?? token.document?.y, 0)
                };
            }
        }

        return {
            tick: Number(tick) || 0,
            timeline: foundry.utils.deepClone(toArray(timeline)),
            perCombatant: foundry.utils.deepClone(perCombatant),
            tickNarratives: foundry.utils.deepClone(toArray(tickNarratives)),
            actorHealth,
            actorResources,
            actorItemSystems,
            tokenPositions
        };
    }

    async #applyResolutionSnapshot(snapshot = null) {
        if (!snapshot || typeof snapshot !== "object") return;

        const actorUpdates = [];
        for (const combatant of this.#combat.combatants?.contents ?? []) {
            const actor = combatant?.actor;
            const actorId = String(actor?.id ?? "").trim();
            if (!actor || !actorId) continue;

            const nextHealth = snapshot.actorHealth?.[actorId];
            const currentHealth = toNumber(actor.system?.resources?.health?.value, 0);
            if (Number.isFinite(nextHealth) && Math.abs(currentHealth - nextHealth) > Number.EPSILON) {
                actorUpdates.push(actor.update({ "system.resources.health.value": nextHealth }));
            }

            const nextResources = snapshot.actorResources?.[actorId];
            if (nextResources && JSON.stringify(nextResources) !== JSON.stringify(actor.system?.resources ?? {})) {
                actorUpdates.push(actor.update({ "system.resources": foundry.utils.deepClone(nextResources) }));
            }

            const itemSnapshots = snapshot.actorItemSystems?.[actorId] ?? {};
            for (const item of actor?.items?.contents ?? []) {
                if (!item?.id) continue;
                const nextSystem = itemSnapshots[item.id];
                if (!nextSystem) continue;
                if (JSON.stringify(nextSystem) === JSON.stringify(item.system ?? {})) continue;
                actorUpdates.push(item.update({ system: foundry.utils.deepClone(nextSystem) }));
            }
        }

        const tokenUpdates = [];
        for (const [tokenId, position] of Object.entries(snapshot.tokenPositions ?? {})) {
            const combatant = (this.#combat.combatants?.contents ?? [])
                .find((candidate) => (
                    String(candidate?.tokenId ?? "").trim() === tokenId
                    || tokenDocumentId(candidate?.token) === tokenId
                )) ?? null;
            const token = this.#getCombatantTokenDocument(combatant)
                ?? canvas?.scene?.tokens?.get?.(tokenId)
                ?? toArray(canvas?.tokens?.placeables)
                    .find((placeable) => tokenDocumentId(placeable) === tokenId)
                ?? [...(game.scenes?.contents ?? [])]
                    .map((scene) => scene?.tokens?.get?.(tokenId))
                    .find(Boolean)
                ?? null;

            const tokenDocument = tokenDocumentForUpdate(token);
            if (!tokenDocument) continue;
            const nextX = toNumber(position?.x, toNumber(tokenDocument.x ?? token.x, 0));
            const nextY = toNumber(position?.y, toNumber(tokenDocument.y ?? token.y, 0));
            const currentX = toNumber(tokenDocument.x ?? token.x, 0);
            const currentY = toNumber(tokenDocument.y ?? token.y, 0);
            if (Math.abs(currentX - nextX) <= Number.EPSILON && Math.abs(currentY - nextY) <= Number.EPSILON) {
                continue;
            }

            tokenUpdates.push(tokenDocument.update({ x: nextX, y: nextY }));
        }

        await Promise.all([...actorUpdates, ...tokenUpdates]);
    }

    #planMovementForCombatant({ combatant = null, action = null, tokenPositions = null, tickEffects = [] } = {}) {
        if (!combatant || !action) return null;
        if (String(action.type ?? "") !== "movement") return null;

        const token = this.#getCombatantTokenDocument(combatant);
        if (!token) return null;

        const tokenId = String(token.id ?? token._id ?? "").trim();
        if (!tokenId) return null;

        const currentPosition = tokenPositions?.[tokenId] ?? {
            x: toNumber(token.x, 0),
            y: toNumber(token.y, 0)
        };

        let targetX = toNumber(action.movementTargetX, toNumber(currentPosition.x, 0));
        let targetY = toNumber(action.movementTargetY, toNumber(currentPosition.y, 0));

        const movementMode = String(action.id ?? action.actionId ?? "").toLowerCase();
        if (movementMode === "pursue" || movementMode === "avoid" || movementMode === "follow") {
            const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
            const targetToken = this.#getCombatantTokenDocument(targetCombatant);
            if (!targetCombatant || !targetToken) {
                return null;
            }

            const targetTokenId = String(targetToken.id ?? targetToken._id ?? "").trim();
            const targetPosition = targetTokenId
                ? tokenPositions?.[targetTokenId] ?? {
                    x: toNumber(targetToken.x, 0),
                    y: toNumber(targetToken.y, 0)
                }
                : {
                    x: toNumber(targetToken.x, 0),
                    y: toNumber(targetToken.y, 0)
                };

            if (movementMode === "pursue") {
                targetX = toNumber(targetPosition.x, targetX);
                targetY = toNumber(targetPosition.y, targetY);
            } else if (movementMode === "follow") {
                const mirroredTargetPosition = toArray(tickEffects)
                    .filter((effect) => String(effect?.type ?? "") === "movement")
                    .find((effect) => String(effect?.combatantId ?? "") === String(targetCombatant.id ?? ""));

                const targetPosForMirror = mirroredTargetPosition
                    ? { x: toNumber(mirroredTargetPosition.x, targetPosition.x), y: toNumber(mirroredTargetPosition.y, targetPosition.y) }
                    : targetPosition;

                if (!Number.isFinite(action._followOffsetX) || !Number.isFinite(action._followOffsetY)) {
                    action._followOffsetX = toNumber(currentPosition.x, 0) - toNumber(targetPosition.x, 0);
                    action._followOffsetY = toNumber(currentPosition.y, 0) - toNumber(targetPosition.y, 0);
                }

                targetX = toNumber(targetPosForMirror.x, targetX) + toNumber(action._followOffsetX, 0);
                targetY = toNumber(targetPosForMirror.y, targetY) + toNumber(action._followOffsetY, 0);
            } else {
                const dx = toNumber(currentPosition.x, 0) - toNumber(targetPosition.x, 0);
                const dy = toNumber(currentPosition.y, 0) - toNumber(targetPosition.y, 0);
                const distance = Math.hypot(dx, dy);
                if (distance <= Number.EPSILON) return null;

                const gridSize = Number(token?.parent?.grid?.size ?? targetToken?.parent?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
                const feetPerSquare = Number(token?.parent?.grid?.distance ?? targetToken?.parent?.grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5;
                const stepFeet = Math.max(1, toNumber(action.movementFeetPerAp, getMovementFeetPerAp() || 10));
                const stepPixels = (stepFeet / feetPerSquare) * gridSize;
                const ux = dx / distance;
                const uy = dy / distance;

                targetX = toNumber(currentPosition.x, 0) + (ux * stepPixels);
                targetY = toNumber(currentPosition.y, 0) + (uy * stepPixels);
            }
        }

        const cost = Math.max(1, clampActionCost(action.apCost ?? 1));
        const currentProgress = Math.max(1, Math.min(cost, clampActionCost(action._runtimeProgress ?? 1)));
        const remainingSteps = Math.max(0, cost - currentProgress);
        const stepDivisor = remainingSteps + 1;

        const currentX = toNumber(currentPosition.x, 0);
        const currentY = toNumber(currentPosition.y, 0);
        const scene = token?.parent?.walls ? token.parent : (canvas?.scene ?? token?.parent ?? null);
        const path = findGridMovementPath({
            start: { x: currentX, y: currentY },
            target: { x: targetX, y: targetY },
            scene
        });
        const pathLength = movementPathLength(path);
        if (path.length < 2 || pathLength <= Number.EPSILON) return null;
        const nextPosition = pointAlongMovementPath(path, pathLength / stepDivisor);
        if (!nextPosition) return null;

        return {
            tokenId,
            x: nextPosition.x,
            y: nextPosition.y
        };
    }

    async #applyConsumeActionEffect(effect = null) {
        if (!effect || typeof effect !== "object") return;

        const combatantId = String(effect.combatantId ?? "").trim();
        const itemId = String(effect.itemId ?? "").trim();
        const actionId = String(effect.actionId ?? "").trim();
        if (!combatantId || !itemId || !actionId) return;

        const combatant = this.#combat.combatants?.get(combatantId) ?? null;
        const actor = combatant?.actor ?? null;
        const item = actor?.items?.get?.(itemId) ?? null;
        if (!actor || !item) return;

        await item.executeEncounterAction?.({
            actor,
            actionId,
            consume: true
        });
    }

    #buildTickReconcilePlan({ tickEffects = [], orderedCombatants = [] } = {}) {
        const initiativeByCombatantId = new Map(
            toArray(orderedCombatants).map((combatant) => [combatant?.id, toNumber(combatant?.initiative, 0)])
        );

        const consumeEffects = [];
        const movementByToken = new Map();
        const damageByTarget = new Map();

        for (const effect of toArray(tickEffects)) {
            const type = String(effect?.type ?? "");
            const sourceCombatantId = String(effect?.sourceCombatantId ?? effect?.combatantId ?? "").trim();
            const priority = initiativeByCombatantId.get(sourceCombatantId) ?? Number.NEGATIVE_INFINITY;

            if (type === "consumeAction") {
                consumeEffects.push(effect);
                continue;
            }

            if (type === "movement") {
                const tokenId = String(effect?.tokenId ?? "").trim();
                if (!tokenId) continue;
                const current = movementByToken.get(tokenId);
                if (!current || priority > current.priority) {
                    movementByToken.set(tokenId, { effect, priority });
                }
                continue;
            }

            if (type === "damage") {
                const targetCombatantId = String(effect?.targetCombatantId ?? "").trim();
                const amount = Math.max(0, toNumber(effect?.amount, 0));
                if (!targetCombatantId || amount <= 0) continue;

                const entry = damageByTarget.get(targetCombatantId) ?? {
                    targetCombatantId,
                    totalAmount: 0,
                    contributors: []
                };

                entry.totalAmount += amount;
                entry.contributors.push({
                    sourceCombatantId,
                    amount,
                    priority
                });

                damageByTarget.set(targetCombatantId, entry);
            }
        }

        return {
            consumeEffects,
            movementEffects: [...movementByToken.values()].map((entry) => entry.effect),
            damageEntries: [...damageByTarget.values()]
        };
    }

    async #applySimultaneousDamageEntries({ damageEntries = [], evaluationSnapshot = null } = {}) {
        for (const entry of toArray(damageEntries)) {
            const targetCombatantId = String(entry?.targetCombatantId ?? "").trim();
            if (!targetCombatantId) continue;

            const targetCombatant = this.#combat.combatants?.get(targetCombatantId) ?? null;
            const actor = targetCombatant?.actor ?? null;
            const actorId = String(actor?.id ?? "").trim();
            if (!actor || !actorId) continue;

            const baseHealth = Number.isFinite(evaluationSnapshot?.actorHealth?.[actorId])
                ? toNumber(evaluationSnapshot.actorHealth[actorId], 0)
                : toNumber(actor.system?.resources?.health?.value, 0);
            const nextHealth = Math.max(0, baseHealth - Math.max(0, toNumber(entry?.totalAmount, 0)));
            await actor.update({ "system.resources.health.value": nextHealth });
        }
    }

    #buildSimultaneousDamageEntriesFromTimeline({ timeline = [], tick = 0 } = {}) {
        const damageByTarget = new Map();

        for (const entry of toArray(timeline)) {
            if (toNumber(entry?.tick, 0) !== toNumber(tick, 0)) continue;
            if (String(entry?.outcome?.result ?? "") === "interrupted") continue;

            const targetCombatantId = String(entry?.outcome?.pendingDamage?.targetCombatantId ?? "").trim();
            const amount = Math.max(0, toNumber(entry?.outcome?.pendingDamage?.amount, 0));
            if (!targetCombatantId || amount <= 0) continue;

            const current = damageByTarget.get(targetCombatantId) ?? {
                targetCombatantId,
                totalAmount: 0,
                contributors: []
            };

            current.totalAmount += amount;
            current.contributors.push({
                sourceCombatantId: String(entry?.combatantId ?? "").trim(),
                amount
            });

            damageByTarget.set(targetCombatantId, current);
        }

        return [...damageByTarget.values()];
    }

    #ownerUserIdForActor(actor = null) {
        const ownerLevel = toNumber(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER, 3);
        const users = collectionContents(game.users);
        const playerOwner = users.find((user) => (
            !user?.isGM
            && user?.active !== false
            && toNumber(actor?.ownership?.[user.id], 0) >= ownerLevel
        ));
        const anyOwner = users.find((user) => (
            user?.active !== false
            && toNumber(actor?.ownership?.[user.id], 0) >= ownerLevel
        ));
        return String(playerOwner?.id ?? anyOwner?.id ?? game.user?.id ?? "gm").trim();
    }

    async #applyProneEffect(combatant = null) {
        const actor = combatant?.actor;
        if (!actor) return;
        if (typeof actor.toggleStatusEffect === "function") {
            await actor.toggleStatusEffect("prone", { active: true });
            return;
        }
        if (typeof actor.createEmbeddedDocuments === "function") {
            const alreadyProne = collectionContents(actor.effects).some((effect) => (
                effect?.statuses?.has?.("prone") || toArray(effect?.statuses).includes("prone")
            ));
            if (!alreadyProne) {
                await actor.createEmbeddedDocuments("ActiveEffect", [{
                    name: "Prone",
                    icon: "icons/svg/falling.svg",
                    statuses: ["prone"]
                }]);
            }
        }
    }

    async #applyConcussiveDamage(combatant = null) {
        const actor = combatant?.actor;
        if (!actor) return 0;
        const roll = await (new Roll("1d6")).roll({ async: true });
        const damage = Math.max(1, toNumber(roll?.total, 1));
        const health = toNumber(actor.system?.resources?.health?.value, 0);
        await actor.update({ "system.resources.health.value": Math.max(0, health - damage) });
        return damage;
    }

    #isActorProne(actor = null) {
        if (!actor) return false;
        if (actor.statuses?.has?.("prone")) return true;
        return collectionContents(actor.effects).some((effect) => (
            effect?.statuses?.has?.("prone") || toArray(effect?.statuses).includes("prone")
        ));
    }

    async #resolveTickEndGridConflicts({ tick = 0, snapshot = null, timeline = [], tickNarratives = [], perCombatant = {} } = {}) {
        if (!game.users) return snapshot;
        const gridSize = Number(canvas?.scene?.grid?.size ?? 100) || 100;
        const combatants = this.#combat.combatants?.contents ?? [];
        const conflicts = findGridConflicts({
            tokenPositions: snapshot?.tokenPositions,
            combatants: combatants.filter((combatant) => !this.#isActorProne(combatant?.actor)),
            gridSize
        });
        if (!conflicts.length) return snapshot;

        await this.#applyResolutionSnapshot(snapshot);

        for (const conflict of conflicts) {
            const requests = conflict.map((member) => {
                const combatant = this.#combat.combatants?.get(member.combatantId) ?? null;
                const actor = combatant?.actor ?? null;
                const recipientId = this.#ownerUserIdForActor(actor);
                return {
                    member,
                    combatant,
                    request: dieRollRequestManager.sendRequest({
                        id: `encounter-${this.#combat.id}-round-${this.#combat.round || 1}-tick-${tick}-collision-${member.combatantId}`,
                        initiatorId: game.user?.id ?? "",
                        requestor: { id: game.user?.id ?? "", name: game.user?.name ?? "GM", type: "gm" },
                        recipientIds: [recipientId],
                        actorId: actor?.id ?? "",
                        tokenId: member.tokenId,
                        rollType: "ability",
                        rollSubType: "dexterity",
                        label: `${combatant?.name ?? "Actor"}: contested Dexterity`,
                        dice: [{ count: 1, faces: 20 }],
                        modifiers: [{
                            label: "Dexterity",
                            value: toNumber(actor?.system?.abilities?.dex?.bonus, 0),
                            source: "actor"
                        }]
                    }),
                    recipientId
                };
            });

            await this.#setState({
                ...this.state,
                phase: "resolving",
                timeline: foundry.utils.deepClone(timeline),
                perCombatant: foundry.utils.deepClone(perCombatant),
                currentEvaluationTick: tick,
                resolution: {
                    ...(this.state.resolution ?? {}),
                    status: "awaitingContestedRolls",
                    currentTick: tick,
                    pendingRollRequestIds: requests.map(({ request }) => request.id)
                }
            });

            const resolvedRequests = await Promise.all(requests.map(async (entry) => ({
                ...entry,
                request: await dieRollRequestManager.waitForResolution(entry.request.id)
            })));
            const contest = resolveContestedDexterity(resolvedRequests.map(({ combatant, request, recipientId }) => ({
                combatantId: combatant?.id,
                strength: toNumber(combatant?.actor?.system?.abilities?.str?.value, 0),
                result: request?.results?.[recipientId] ?? {}
            })));
            const allCriticalSuccess = contest.every((entry) => entry.outcome === "criticalSuccess");
            const allFailed = contest.every((entry) => ["failure", "criticalFailure"].includes(entry.outcome));
            const displaceId = (allCriticalSuccess || allFailed) ? lowestStrengthCombatantId(contest) : null;

            for (const entry of contest) {
                const combatant = this.#combat.combatants?.get(entry.combatantId) ?? null;
                let damage = 0;
                if (["failure", "criticalFailure"].includes(entry.outcome)) {
                    await this.#applyProneEffect(combatant);
                    const state = perCombatant?.[entry.combatantId];
                    if (state) {
                        state.spentAp += Math.max(0, toNumber(state.remainingAp, 0));
                        state.remainingAp = 0;
                        state.pointer = toArray(state.plan).length;
                        state.progress = 0;
                    }
                }
                if (entry.outcome === "criticalFailure") damage = await this.#applyConcussiveDamage(combatant);
                timeline.push({
                    tick,
                    combatantId: entry.combatantId,
                    combatantName: combatant?.name ?? "Combatant",
                    action: null,
                    outcome: {
                        result: entry.outcome === "criticalFailure" ? "criticalFailure" : entry.outcome === "failure" ? "prone" : "standing",
                        roll: entry.natural,
                        total: entry.total,
                        damage,
                        damageType: damage ? "concussive" : null,
                        detail: entry.outcome === "criticalFailure"
                            ? `${combatant?.name ?? "The actor"} critically fails the contested Dexterity roll, is knocked prone, forfeits their remaining plan, and takes ${damage} concussive damage.`
                            : ["failure"].includes(entry.outcome)
                                ? `${combatant?.name ?? "The actor"} loses the contested Dexterity roll, is knocked prone, and forfeits their remaining plan.`
                                : `${combatant?.name ?? "The actor"} remains standing after the contested Dexterity roll.`
                    }
                });
            }

            if (displaceId) {
                const displaced = conflict.find((member) => member.combatantId === displaceId);
                const origin = snapshot.tokenPositions?.[displaced?.tokenId];
                const destination = adjacentFreePosition({
                    origin,
                    occupiedPositions: Object.values(snapshot.tokenPositions ?? {}),
                    gridSize
                });
                if (destination && displaced?.tokenId) {
                    snapshot.tokenPositions[displaced.tokenId] = destination;
                    timeline.push({
                        tick,
                        combatantId: displaceId,
                        combatantName: this.#combat.combatants?.get(displaceId)?.name ?? "Combatant",
                        action: null,
                        outcome: { result: "displaced", detail: `${this.#combat.combatants?.get(displaceId)?.name ?? "The actor"} is displaced to an adjacent square.` }
                    });
                }
            }
        }

        return this.#captureResolutionSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: snapshot?.tokenPositions ?? {}
        });
    }

    #markTimelineEntryInterrupted({ timeline = [], timelineIndex = -1, combatantName = "Combatant", actionLabel = "the action", reason = "" } = {}) {
        const index = Number(timelineIndex);
        if (!Number.isInteger(index) || index < 0 || index >= timeline.length) return;

        timeline[index] = {
            ...timeline[index],
            outcome: {
                ...(timeline[index]?.outcome ?? {}),
                result: "interrupted",
                detail: `${combatantName} cannot complete ${actionLabel}${reason ? `; ${reason}` : "."}`
            }
        };
    }

    #getCompletionBoundaryRequirements(action = null, outcome = null) {
        if (!action || !outcome) return {};

        const requirements = {
            sourceMustBeAlive: action?.type === "consumable",
            sourceMustNotBeProne: action?.type === "consumable" || action?.interruptible === false,
            targetMustBeAlive: action?.type === "consumable" && action.type !== "attack",
            targetMustBeInRange: Boolean(action?.requiresToHit)
        };

        return requirements;
    }

    #validateCompletionBoundary({
        timelineEntry = null,
        projectedState = null,
        proneCombatantIds = new Set()
    } = {}) {
        if (!timelineEntry?.outcome) return { valid: true };

        const outcome = timelineEntry.outcome;
        const action = timelineEntry.action;
        const sourceCombatantId = String(timelineEntry?.combatantId ?? "").trim();
        const targetCombatantId = String(outcome?.targetCombatantId ?? "").trim();

        if (!action) return { valid: true };

        const requirements = this.#getCompletionBoundaryRequirements(action, outcome);
        const violations = [];

        const sourceActor = this.#combat.combatants?.get(sourceCombatantId)?.actor ?? null;
        const sourceActorId = String(sourceActor?.id ?? "").trim();

        if (requirements.sourceMustBeAlive && sourceActorId) {
            const sourceHealth = toNumber(projectedState?.actorHealth?.[sourceActorId], 0);
            if (sourceHealth <= 0) {
                violations.push("source is incapacitated");
            }
        }

        if (requirements.sourceMustNotBeProne && sourceCombatantId) {
            if (proneCombatantIds.has(sourceCombatantId)) {
                violations.push("source is knocked prone");
            }
        }

        if (requirements.targetMustBeAlive && targetCombatantId) {
            const targetActor = this.#combat.combatants?.get(targetCombatantId)?.actor ?? null;
            const targetActorId = String(targetActor?.id ?? "").trim();
            if (targetActorId) {
                const targetHealth = toNumber(projectedState?.actorHealth?.[targetActorId], 0);
                if (targetHealth <= 0) {
                    violations.push("target is incapacitated");
                }
            }
        }

        if (requirements.targetMustBeInRange && targetCombatantId && action.requiresToHit) {
            const sourceCombatant = this.#combat.combatants?.get(sourceCombatantId) ?? null;
            const targetCombatant = this.#combat.combatants?.get(targetCombatantId) ?? null;
            const item = action.itemId ? sourceActor?.items?.get(action.itemId) : null;
            const rangeFeet = this.#resolveActionRangeFeet(action, item);
            const distanceFeet = this.#distanceBetweenCombatantsFeet(sourceCombatant, targetCombatant, {
                tokenPositions: projectedState?.tokenPositions
            });

            if (Number.isFinite(distanceFeet) && distanceFeet > rangeFeet) {
                violations.push(`target moved out of range (${Math.round(distanceFeet)} ft > ${rangeFeet} ft)`);
            }
        }

        if (violations.length > 0) {
            return {
                valid: false,
                violations
            };
        }

        return { valid: true };
    }

    #getCombatantActionWindowForTick(perCombatantState = {}, tick = 0) {
        const plan = toArray(perCombatantState.plan);
        const targetTick = Math.max(1, toNumber(tick, 0));
        let currentStart = 1;

        for (let index = 0; index < plan.length; index += 1) {
            const action = plan[index];
            const apCost = Math.max(1, clampActionCost(action?.apCost ?? 1));
            const currentEnd = currentStart + apCost - 1;
            if (targetTick >= currentStart && targetTick <= currentEnd) {
                return {
                    action,
                    actionIndex: index,
                    startTick: currentStart,
                    endTick: currentEnd
                };
            }
            currentStart = currentEnd + 1;
        }

        return null;
    }

    #consumeReactionWindow({ combatantId = "", actionIndex = -1, startTick = 0, reactionRuntime = null } = {}) {
        const key = `${combatantId}:${actionIndex}:${startTick}`;
        if (!reactionRuntime?.consumedKeys) return false;
        if (reactionRuntime.consumedKeys.has(key)) return false;
        reactionRuntime.consumedKeys.add(key);
        return true;
    }

    #findReactionAtTick({ combatant = null, tick = 0, triggerType = "", perCombatant = {}, reactionRuntime = null } = {}) {
        if (!combatant?.id) return null;

        const combatantState = perCombatant?.[combatant.id] ?? null;
        if (!combatantState) return null;

        const window = this.#getCombatantActionWindowForTick(combatantState, tick);
        if (!window?.action) return null;

        const reactionAction = window.action;
        if (!reactionAction.isReaction) return null;
        if (String(reactionAction.reactionTriggerType ?? "") !== String(triggerType ?? "")) return null;

        return {
            ...window,
            consumed: reactionRuntime?.consumedKeys?.has(`${combatant.id}:${window.actionIndex}:${window.startTick}`) ?? false
        };
    }

    #selectOverwatchAttackAction(combatantId) {
        const combatant = this.#combat.combatants?.get(combatantId) ?? null;
        const equippedIds = this.#getEquippedItemIds(combatant?.actor);

        const attackActions = this.getAvailableActionsForCombatant(combatantId)
            .filter((candidate) => {
                if (candidate?.type !== "attack" || candidate?.isReaction) return false;
                const itemId = String(candidate?.itemId ?? "").trim();
                if (!itemId) return false;
                return equippedIds.has(itemId);
            })
            .sort((left, right) => {
                const leftCost = toNumber(left?.apCost, 1);
                const rightCost = toNumber(right?.apCost, 1);
                if (leftCost !== rightCost) return leftCost - rightCost;
                return toNumber(right?.toHitBonus, 0) - toNumber(left?.toHitBonus, 0);
            });

        if (!attackActions.length) return null;
        return clampActionData(attackActions[0], 0);
    }

    #getEquippedItemIds(actor = null) {
        const equipped = new Set();
        const slots = actor?.system?.inventory?.equipment ?? {};

        for (const slot of Object.values(slots)) {
            const ids = toArray(slot?.itemIds);
            for (const id of ids) {
                const normalized = String(id ?? "").trim();
                if (normalized) equipped.add(normalized);
            }
        }

        return equipped;
    }

    #findClosestHostileInRange({ sourceCombatant = null, attackAction = null, actorHealth = null, tokenPositions = null } = {}) {
        if (!sourceCombatant?.id || !attackAction) return null;

        const item = attackAction.itemId ? sourceCombatant.actor?.items?.get?.(attackAction.itemId) : null;
        const rangeFeet = this.#resolveActionRangeFeet(attackAction, item);

        const candidates = (this.#combat.combatants?.contents ?? [])
            .filter((candidate) => candidate?.id && candidate.id !== sourceCombatant.id)
            .filter((candidate) => !this.#isCombatantIncapacitated(candidate, { actorHealth }))
            .map((candidate) => ({
                candidate,
                distanceFeet: this.#distanceBetweenCombatantsFeet(sourceCombatant, candidate, { tokenPositions })
            }))
            .filter((entry) => Number.isFinite(entry.distanceFeet) && entry.distanceFeet <= rangeFeet)
            .sort((left, right) => left.distanceFeet - right.distanceFeet);

        if (!candidates.length) return null;
        return candidates[0];
    }

    async #resolveOverwatchReactions({
        mover = null,
        tick = 0,
        perCombatant = {},
        reactionRuntime = null,
        orderedCombatants = [],
        evaluationSnapshot = null,
        tokenPositions = null
    } = {}) {
        if (!mover?.id) return [];

        const entries = [];
        const effects = [];
        for (const candidate of orderedCombatants) {
            if (!candidate?.id || candidate.id === mover.id) continue;
            if (this.#isCombatantIncapacitated(candidate, { actorHealth: evaluationSnapshot?.actorHealth })) continue;

            const reactionWindow = this.#findReactionAtTick({
                combatant: candidate,
                tick,
                triggerType: "overwatch",
                perCombatant,
                reactionRuntime
            });
            if (!reactionWindow || reactionWindow.consumed) continue;

            const attackAction = this.#selectOverwatchAttackAction(candidate.id);
            if (!attackAction) continue;

            const moverDistanceFeet = this.#distanceBetweenCombatantsFeet(candidate, mover, { tokenPositions });
            const attackItem = attackAction.itemId ? candidate.actor?.items?.get?.(attackAction.itemId) : null;
            const attackRangeFeet = this.#resolveActionRangeFeet(attackAction, attackItem);
            if (!Number.isFinite(moverDistanceFeet) || moverDistanceFeet > attackRangeFeet) continue;

            const closestTarget = this.#findClosestHostileInRange({
                sourceCombatant: candidate,
                attackAction,
                actorHealth: evaluationSnapshot?.actorHealth,
                tokenPositions
            });
            if (!closestTarget?.candidate) continue;
            const targetCombatant = closestTarget.candidate;

            const consumed = this.#consumeReactionWindow({
                combatantId: candidate.id,
                actionIndex: reactionWindow.actionIndex,
                startTick: reactionWindow.startTick,
                reactionRuntime
            });
            if (!consumed) continue;

            const outcome = await this.#resolveAction(candidate, {
                ...attackAction,
                targetId: targetCombatant.id
            }, {
                tick,
                perCombatant,
                reactionRuntime,
                evaluationSnapshot,
                tokenPositions,
                applyEffects: false,
                reactionContext: {
                    sourceAction: reactionWindow.action,
                    sourceLabel: reactionWindow.action?.label ?? "Overwatch"
                }
            });

            const pendingDamage = outcome?.pendingDamage;
            if (attackAction?.itemId && !attackAction?.isReaction && outcome?.result !== "failed") {
                effects.push({
                    type: "consumeAction",
                    combatantId: candidate.id,
                    itemId: attackAction.itemId,
                    actionId: attackAction.actionId,
                    cancelIfProne: false,
                    timelineIndex: -1,
                    actionLabel: attackAction.label,
                    combatantName: candidate.name
                });
            }
            if (pendingDamage?.targetCombatantId && toNumber(pendingDamage?.amount, 0) > 0) {
                effects.push({
                    type: "damage",
                    sourceCombatantId: candidate.id,
                    targetCombatantId: pendingDamage.targetCombatantId,
                    amount: toNumber(pendingDamage.amount, 0)
                });
            }

            entries.push({
                tick,
                combatantId: candidate.id,
                combatantName: candidate.name,
                action: {
                    ...reactionWindow.action,
                    label: reactionWindow.action?.label ?? "Overwatch"
                },
                reaction: true,
                outcome: {
                    ...outcome,
                    detail: `${candidate.name} triggers overwatch on the closest hostile (${targetCombatant.name}). ${outcome.detail}`
                }
            });
        }

        return { entries, effects };
    }

    #buildTickNarrative(timelineEntries = [], tick = 0) {
        const filtered = toArray(timelineEntries).filter((entry) => toNumber(entry?.tick, 0) === toNumber(tick, 0));
        const lines = filtered
            .map((entry) => this.#describeTickNarrativeEntry(entry))
            .filter(Boolean);
        return {
            tick: Number(tick) || 0,
            lines,
            summary: lines.join(" ")
        };
    }

    #describeTickNarrativeEntry(entry = null) {
        const combatantName = String(entry?.combatantName ?? "Combatant").trim() || "Combatant";
        const action = entry?.action ?? {};
        const outcome = entry?.outcome ?? {};
        const result = String(outcome?.result ?? "").trim();
        const actionType = String(action?.type ?? "").trim().toLowerCase();
        const actionId = String(action?.id ?? action?.actionId ?? "").trim().toLowerCase();
        const targetCombatant = this.#resolveDeclaredTarget(String(entry?.combatantId ?? ""), action?.targetId);
        const item = this.#getNarrativeItem(entry);

        const recapText = formatRecapTemplate(action?.recapFormat, {
            Owner: { id: String(entry?.combatantId ?? ""), name: combatantName },
            Item: item,
            Target: targetCombatant ? { id: targetCombatant.id, name: targetCombatant.name } : { id: "", name: "the target" },
            action: {
                ...action,
                hitResult: this.#describeHitResult(result)
            },
            outcome: {
                ...outcome,
                result
            }
        });

        if (recapText) {
            return recapText;
        }

        if (actionType === "movement" || result === "movementStep") {
            const movementFeet = Math.max(1, toNumber(action?.movementFeet || action?.movementFeetPerAp || getMovementFeetPerAp() || 10, 10));
            return `${combatantName} moved ${movementFeet} feet.`;
        }

        if (actionType === "attack" || action?.requiresToHit) {
            const fallbackWeaponName = String(action?.label ?? "weapon").trim() || "weapon";
            const weaponName = this.#getNarrativeWeaponName(entry) ?? fallbackWeaponName;
            const targetCandidate = outcome?.targetName ?? targetCombatant?.name ?? "the target";
            const targetName = String(targetCandidate).trim() || "the target";
            const hits = ["hit", "criticalhit"].includes(result.toLowerCase());
            const misses = ["miss", "criticalfailure", "interrupted", "outofrange", "reacted", "failed"].includes(result.toLowerCase());
            if (hits) return `${combatantName} fires ${weaponName} at ${targetName} and hits.`;
            if (misses) return `${combatantName} fires ${weaponName} at ${targetName} and misses.`;
            return `${combatantName} fires ${weaponName} at ${targetName}.`;
        }

        if (actionType === "consumable") {
            return `${combatantName} uses ${String(action?.label ?? "an item").trim() || "an item"}.`;
        }

        if (actionId === "pursue" || actionId === "follow" || actionId === "avoid") {
            const movementFeet = Math.max(1, toNumber(action?.movementFeet || action?.movementFeetPerAp || getMovementFeetPerAp() || 10, 10));
            return `${combatantName} moved ${movementFeet} feet.`;
        }

        return String(outcome?.detail ?? "").trim();
    }

    #describeHitResult(result = "") {
        switch (String(result ?? "").trim().toLowerCase()) {
            case "hit":
            case "criticalhit":
                return "hits";
            case "miss":
            case "criticalfailure":
                return "misses";
            case "interrupted":
                return "is interrupted";
            case "outofrange":
                return "is out of range";
            case "reacted":
                return "is countered";
            case "failed":
                return "fails";
            default:
                return String(result ?? "").trim();
        }
    }

    #getNarrativeItem(entry = null) {
        const combatant = this.#combat.combatants?.get(String(entry?.combatantId ?? "").trim()) ?? null;
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!combatant?.actor || !itemId) {
            return {
                id: "",
                name: String(action?.label ?? "item").trim() || "item"
            };
        }

        const item = combatant.actor.items?.get?.(itemId) ?? null;
        return {
            id: itemId,
            name: String(item?.name ?? item?.label ?? action?.label ?? itemId).trim() || itemId
        };
    }

    #getNarrativeWeaponName(entry = null) {
        const combatant = this.#combat.combatants?.get(String(entry?.combatantId ?? "").trim()) ?? null;
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!combatant?.actor || !itemId) return null;

        const item = combatant.actor.items?.get?.(itemId) ?? null;
        return String(item?.name ?? item?.label ?? action?.label ?? itemId).trim() || null;
    }
    
    async #beginEncounterResolution({ persistInitialState = true } = {}) {
        const initialState = this.state;
        const perCombatant = foundry.utils.deepClone(initialState.perCombatant ?? {});
        const timeline = [];
        const tickNarratives = [];
        await this.#restorePlanningOrigins(perCombatant);
        const snapshots = [await this.#captureResolutionSnapshot({
            tick: 0,
            perCombatant,
            timeline,
            tickNarratives
        })];
        const orderedCombatants = sortByInitiativeDescending(this.#combat.combatants?.contents ?? []);
        const totalTicks = this.apBudget;
        const result = {
            initialState,
            perCombatant,
            timeline,
            tickNarratives,
            snapshots,
            reactionRuntime: {
                consumedKeys: new Set()
            },
            orderedCombatants,
            totalTicks
        };

        if (persistInitialState) {
            await this.#setState({
                ...this.state,
                phase: "resolving",
                timeline,
                perCombatant,
                currentEvaluationTick: 0,
                resolution: {
                    status: "paused",
                    currentTick: 0,
                    totalTicks,
                    snapshots,
                    tickNarratives,
                    reactionConsumedKeys: []
                }
            });
        }

        return result;
    }

    #buildRoundHistoryEntry({ round = 1, timeline = [], tickNarratives = [] } = {}) {
        return {
            round,
            resolvedAt: Date.now(),
            timeline: foundry.utils.deepClone(toArray(timeline)),
            tickNarratives: foundry.utils.deepClone(toArray(tickNarratives))
        };
    }

    #roundHistoryWithFinalEntry({
        round = 1,
        timeline = [],
        tickNarratives = [],
        existingHistory = []
    } = {}) {
        const history = toArray(existingHistory);
        const existingIndex = history.findIndex((entry) => toNumber(entry?.round, 0) === toNumber(round, 0));
        const entry = this.#buildRoundHistoryEntry({ round, timeline, tickNarratives });
        if (existingIndex < 0) return [...history, entry];

        const next = [...history];
        next[existingIndex] = entry;
        return next;
    }

    async #evaluateResolutionTick({
        tick = 0,
        perCombatant = {},
        timeline = [],
        tickNarratives = [],
        reactionRuntime = null,
        orderedCombatants = []
    } = {}) {
        const evaluationSnapshot = await this.#captureResolutionSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives
        });
        const tickEffects = [];
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);

        for (const combatant of orderedCombatants) {
            const state = perCombatant[combatant.id];
            if (!state || state.remainingAp <= 0) continue;

            if (this.#isCombatantIncapacitated(combatant, { actorHealth: evaluationSnapshot.actorHealth })) {
                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                const interrupted = state.progress > 0;
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action: state.plan?.[state.pointer] ?? null,
                    outcome: {
                        result: interrupted ? "interrupted" : "incapacitated",
                        detail: interrupted
                            ? `${combatant.name} is interrupted by incapacitation before completing their action.`
                            : `${combatant.name} is incapacitated and cannot act.`
                    }
                });
                state.progress = 0;
                if (interrupted) state.pointer += 1;
                continue;
            }

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
            action._runtimeProgress = state.progress;
            const isReactionWindow = Boolean(action.isReaction);

            if (action.type === "movement") {
                if (action.requiresTarget && !action.targetId) {
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "failed",
                            detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
                        }
                    });
                    state.pointer += 1;
                    state.progress = 0;
                    delete action._runtimeProgress;
                    continue;
                }

                const movementEffect = this.#planMovementForCombatant({
                    combatant,
                    action,
                    tokenPositions: evaluationSnapshot.tokenPositions,
                    tickEffects
                });

                const targetCombatant = action.targetId
                    ? this.#resolveDeclaredTarget(combatant.id, action.targetId)
                    : null;
                if (movementEffect) {
                    tickEffects.push({
                        type: "movement",
                        combatantId: combatant.id,
                        ...movementEffect
                    });
                }

                const stepFeet = Number(action.movementFeetPerAp || movementFeetPerAp || 10);
                const movementMode = String(action.id ?? action.actionId ?? "").toLowerCase();
                const targetSuffix = targetCombatant?.name ? ` ${targetCombatant.name}` : "their target";
                const movementDetail = movementMode === "pursue"
                    ? `${combatant.name} pursues${targetSuffix} (${stepFeet} ft).`
                    : movementMode === "follow"
                        ? `${combatant.name} follows${targetSuffix} (${stepFeet} ft).`
                        : movementMode === "avoid"
                            ? `${combatant.name} avoids${targetSuffix} (${stepFeet} ft).`
                            : `${combatant.name} moves ${stepFeet} ft.`;
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome: {
                        result: "movementStep",
                        detail: movementDetail
                    }
                });

                const tokenPositionsForReaction = {
                    ...(evaluationSnapshot.tokenPositions ?? {})
                };
                if (movementEffect?.tokenId) {
                    tokenPositionsForReaction[movementEffect.tokenId] = {
                        x: movementEffect.x,
                        y: movementEffect.y
                    };
                }

                const overwatchResolution = await this.#resolveOverwatchReactions({
                    mover: combatant,
                    tick,
                    perCombatant,
                    reactionRuntime,
                    orderedCombatants,
                    evaluationSnapshot,
                    tokenPositions: tokenPositionsForReaction
                });
                if (overwatchResolution.entries.length) {
                    timeline.push(...overwatchResolution.entries);
                }
                if (overwatchResolution.effects.length) {
                    tickEffects.push(...overwatchResolution.effects);
                }
            } else if (state.progress < action.apCost) {
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome: {
                        result: isReactionWindow ? "reactionReady" : "progress",
                        detail: isReactionWindow
                            ? `${combatant.name} holds ${action.label} (${state.progress}/${action.apCost} AP).`
                            : `${combatant.name} continues ${action.label} (${state.progress}/${action.apCost} AP).`
                    }
                });
            }

            if (state.progress < action.apCost) continue;

            if (action.type !== "movement") {
                let outcome;
                if (action.isReaction) {
                    const window = this.#getCombatantActionWindowForTick(state, tick);
                    const reactionKey = `${combatant.id}:${toNumber(window?.actionIndex, -1)}:${toNumber(window?.startTick, 0)}`;
                    const alreadyTriggered = reactionRuntime.consumedKeys.has(reactionKey);
                    if (alreadyTriggered) {
                        outcome = {
                            result: "reactionResolved",
                            detail: `${combatant.name} already spent ${action.label} on a prior trigger this round.`
                        };
                    }
                }

                if (!outcome) {
                    outcome = await this.#resolveAction(combatant, action, {
                        tick,
                        perCombatant,
                        reactionRuntime,
                        evaluationSnapshot,
                        applyEffects: false
                    });
                }

                const pendingDamage = outcome?.pendingDamage;
                if (pendingDamage?.targetCombatantId && toNumber(pendingDamage?.amount, 0) > 0) {
                    tickEffects.push({
                        type: "damage",
                        sourceCombatantId: combatant.id,
                        targetCombatantId: pendingDamage.targetCombatantId,
                        amount: toNumber(pendingDamage.amount, 0)
                    });
                }

                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome
                });
                const timelineIndex = timeline.length - 1;

                if (action.itemId && !action.isReaction && outcome?.result !== "failed") {
                    tickEffects.push({
                        type: "consumeAction",
                        combatantId: combatant.id,
                        itemId: action.itemId,
                        actionId: action.actionId,
                        cancelIfProne: action.type === "consumable",
                        timelineIndex,
                        actionLabel: action.label,
                        combatantName: combatant.name
                    });
                }
            }

            state.pointer += 1;
            state.progress = 0;
            delete action._runtimeProgress;
            delete action._followOffsetX;
            delete action._followOffsetY;
        }

        const reconcilePlan = this.#buildTickReconcilePlan({ tickEffects, orderedCombatants });

        const projectedTokenPositions = {};
        for (const effect of reconcilePlan.movementEffects) {
            if (effect?.tokenId && Number.isFinite(effect.x) && Number.isFinite(effect.y)) {
                projectedTokenPositions[effect.tokenId] = { x: effect.x, y: effect.y };
            }
        }

        // Tokens may cross or briefly share a square during AP playback. Contested
        // Dexterity reconciliation is deliberately deferred until the round ends.
        const collisionResolution = { proneCombatantIds: new Set() };

        for (const effect of reconcilePlan.consumeEffects) {
            const requiresStableStance = Boolean(effect?.cancelIfProne);
            const combatantId = String(effect?.combatantId ?? "").trim();
            const interruptedByProne = requiresStableStance && collisionResolution.proneCombatantIds.has(combatantId);
            if (interruptedByProne) {
                this.#markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: effect?.timelineIndex,
                    combatantName: effect?.combatantName ?? this.#combat.combatants?.get(combatantId)?.name ?? "Combatant",
                    actionLabel: effect?.actionLabel ?? "the action",
                    reason: "they are knocked prone during reconciliation"
                });
                continue;
            }

            await this.#applyConsumeActionEffect(effect);
        }

        const preDamageBoundaryState = await this.#captureResolutionSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: projectedTokenPositions
        });

        for (let idx = 0; idx < timeline.length; idx += 1) {
            const entry = timeline[idx];
            if (toNumber(entry?.tick, 0) !== tick) continue;
            if (["prone", "interrupted"].includes(String(entry?.outcome?.result ?? "")) || !entry?.action) continue;

            const boundary = this.#validateCompletionBoundary({
                timelineEntry: entry,
                projectedState: preDamageBoundaryState,
                proneCombatantIds: collisionResolution.proneCombatantIds
            });

            if (!boundary.valid) {
                const reason = boundary.violations?.join("; ") ?? "completion boundary not satisfied";
                this.#markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: idx,
                    combatantName: entry?.combatantName ?? "Combatant",
                    actionLabel: entry?.action?.label ?? "the action",
                    reason
                });
            }
        }

        await this.#applySimultaneousDamageEntries({
            damageEntries: this.#buildSimultaneousDamageEntriesFromTimeline({ timeline, tick }),
            evaluationSnapshot
        });

        const projectedEndState = await this.#captureResolutionSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: projectedTokenPositions
        });

        for (let idx = 0; idx < timeline.length; idx += 1) {
            const entry = timeline[idx];
            if (toNumber(entry?.tick, 0) !== tick) continue;
            if (["prone", "interrupted"].includes(String(entry?.outcome?.result ?? "")) || !entry?.action) continue;

            const boundary = this.#validateCompletionBoundary({
                timelineEntry: entry,
                projectedState: projectedEndState,
                proneCombatantIds: collisionResolution.proneCombatantIds
            });

            if (!boundary.valid) {
                const reason = boundary.violations?.join("; ") ?? "completion boundary not satisfied";
                this.#markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: idx,
                    combatantName: entry?.combatantName ?? "Combatant",
                    actionLabel: entry?.action?.label ?? "the action",
                    reason
                });
            }
        }

        const reconciledEndState = await this.#resolveTickEndGridConflicts({
            tick,
            snapshot: projectedEndState,
            timeline,
            tickNarratives,
            perCombatant
        });

        const narrative = this.#buildTickNarrative(timeline, tick);
        tickNarratives.push(narrative);
        const snapshot = await this.#captureResolutionSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: reconciledEndState?.tokenPositions ?? projectedTokenPositions
        });

        return { snapshot, narrative };
    }

    async stepEncounterResolution(direction = 1) {
        this.#requireGm("step encounter resolution playback");

        const currentState = this.state;
        const resolution = currentState.resolution ?? {};
        const snapshots = toArray(resolution.snapshots);
        if (!snapshots.length) return null;

        const totalTicks = Math.max(0, toNumber(resolution.totalTicks, this.apBudget));
        const currentTick = Math.max(0, Math.min(totalTicks, toNumber(resolution.currentTick, currentState.currentEvaluationTick)));
        const delta = direction >= 0 ? 1 : -1;
        const nextTick = Math.max(0, Math.min(totalTicks, currentTick + delta));
        if (nextTick === currentTick) return snapshots[nextTick] ?? null;

        if (delta < 0) {
            const snapshot = snapshots[nextTick] ?? null;
            if (!snapshot) return null;

            await this.#applyResolutionSnapshot(snapshot);

            const nextPhase = "resolving";
            await this.#setState({
                ...currentState,
                phase: nextPhase,
                timeline: foundry.utils.deepClone(toArray(snapshot.timeline)),
                perCombatant: foundry.utils.deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
                currentEvaluationTick: nextTick,
                resolution: {
                    ...resolution,
                    currentTick: nextTick,
                    status: "paused"
                }
            });

            this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
                phase: nextPhase,
                previousPhase: currentState.phase
            });

            return snapshot;
        }

        let snapshot = snapshots[nextTick] ?? null;
        if (!snapshot && nextTick > currentTick) {
            const orderedCombatants = sortByInitiativeDescending(this.#combat.combatants?.contents ?? []);
            const perCombatant = foundry.utils.deepClone(currentState.perCombatant ?? {});
            const timeline = foundry.utils.deepClone(toArray(resolution.timeline ?? currentState.timeline));
            const tickNarratives = foundry.utils.deepClone(toArray(resolution.tickNarratives ?? []));
            const reactionRuntime = reactionRuntimeFromResolution(resolution);
            const result = await this.#evaluateResolutionTick({
                tick: nextTick,
                perCombatant,
                timeline,
                tickNarratives,
                reactionRuntime,
                orderedCombatants
            });
            snapshot = result.snapshot;
            snapshots[nextTick] = snapshot;
            tickNarratives[nextTick - 1] = result.narrative;

            await this.#applyResolutionSnapshot(snapshot);

            const nextPhase = nextTick >= totalTicks ? "roundComplete" : "resolving";
            const round = this.#combat.round || currentState.round || 1;
            const nextRoundHistory = nextPhase === "roundComplete"
                ? this.#roundHistoryWithFinalEntry({
                    round,
                    timeline: snapshot.timeline ?? [],
                    tickNarratives,
                    existingHistory: currentState.roundHistory
                })
                : currentState.roundHistory;
            await this.#setState({
                ...currentState,
                phase: nextPhase,
                timeline: foundry.utils.deepClone(toArray(snapshot.timeline)),
                perCombatant: foundry.utils.deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
                currentEvaluationTick: nextTick,
                planningStartedAt: nextPhase === "roundComplete" ? 0 : currentState.planningStartedAt,
                roundHistory: nextRoundHistory,
                resolution: {
                    ...resolution,
                    currentTick: nextTick,
                    status: nextTick >= totalTicks ? "complete" : "paused",
                    snapshots: foundry.utils.deepClone(snapshots),
                    tickNarratives: foundry.utils.deepClone(tickNarratives),
                    reactionConsumedKeys: serializeReactionRuntime(reactionRuntime)
                }
            });

            this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
                phase: nextPhase,
                previousPhase: currentState.phase
            });

            if (nextPhase === "roundComplete") {
                this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED, {
                    round,
                    timeline: snapshot.timeline ?? []
                });
            }

            return snapshot;
        }

        if (!snapshot) return null;

        await this.#applyResolutionSnapshot(snapshot);

        const nextPhase = nextTick >= totalTicks ? "roundComplete" : "resolving";
        const round = this.#combat.round || currentState.round || 1;
        const tickNarratives = foundry.utils.deepClone(toArray(snapshot.tickNarratives ?? resolution.tickNarratives ?? []));
        const nextRoundHistory = nextPhase === "roundComplete"
            ? this.#roundHistoryWithFinalEntry({
                round,
                timeline: snapshot.timeline ?? [],
                tickNarratives,
                existingHistory: currentState.roundHistory
            })
            : currentState.roundHistory;

        await this.#setState({
            ...currentState,
            phase: nextPhase,
            timeline: foundry.utils.deepClone(toArray(snapshot.timeline)),
            perCombatant: foundry.utils.deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
            currentEvaluationTick: nextTick,
            planningStartedAt: nextPhase === "roundComplete" ? 0 : currentState.planningStartedAt,
            roundHistory: nextRoundHistory,
            resolution: {
                ...resolution,
                currentTick: nextTick,
                status: nextTick >= totalTicks ? "complete" : "paused",
                tickNarratives
            }
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
            phase: nextPhase,
            previousPhase: currentState.phase
        });

        if (nextPhase === "roundComplete") {
            this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED, {
                round,
                timeline: snapshot.timeline ?? []
            });
        }

        return snapshot;
    }

    /**
    * Run the full AP-tick resolution loop for the current round. Iterates over
    * all AP ticks in initiative order, executes each combatant's planned actions,
    * applies damage, builds a timeline, stores tick narration in encounter state,
    * and emits {@link TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED}. GM only.
     *
     * Reconciliation model:
     *
     * **Phase 1: Tick-Start Evaluation** — Each combatant's action is evaluated independently
     * against the game state at the start of the tick, producing candidate outcomes. All
     * evaluations use the same tick-start snapshot, ensuring no action sees the mutations of
     * other same-tick actions during the evaluation phase.
     *
     * **Phase 2: Reconciliation** — Candidate outcomes are collected into effect intents
     * (movement, damage, consumables). Effects are reconciled in order (movement → conditional
     * consume → simultaneous damage), and each action's required
     * completion conditions are validated against the projected end-of-tick state. If a
     * completion boundary condition fails (e.g., actor prone, target dead, out of range), the
     * action is marked interrupted.
     *
     * **Phase 3: Tick-End Reconciliation** — Tokens sharing a grid square at the end of the
     * tick dispatch contested Dexterity roll requests. Resolution pauses until every participant
     * responds; prone actors forfeit their remaining plans. Finalized state is then persisted.
     *
     * @returns {Promise<object[]>} The completed timeline — one entry per AP tick per combatant.
     */
    async resolveEncounterRound({ tickDelayMs = 1000 } = {}) {
        this.#requireGm("resolve encounter rounds");
        this.#requireInitiativeReady();

        const result = await this.#beginEncounterResolution({ persistInitialState: false });
        if (!result?.snapshots?.length) return [];

        let lastSnapshot = null;
        for (let tick = 1; tick <= this.apBudget; tick += 1) {
            lastSnapshot = (await this.#evaluateResolutionTick({
                tick,
                perCombatant: result.perCombatant,
                timeline: result.timeline,
                tickNarratives: result.tickNarratives,
                reactionRuntime: result.reactionRuntime,
                orderedCombatants: result.orderedCombatants
            })).snapshot;
            result.snapshots.push(lastSnapshot);
            await this.#applyResolutionSnapshot(lastSnapshot);

            await this.#setState({
                ...this.state,
                phase: tick >= result.totalTicks ? "roundComplete" : "resolving",
                timeline: foundry.utils.deepClone(result.timeline),
                perCombatant: foundry.utils.deepClone(result.perCombatant),
                currentEvaluationTick: tick,
                resolution: {
                    status: tick < result.totalTicks ? "running" : "complete",
                    currentTick: tick,
                    totalTicks: result.totalTicks,
                    snapshots: foundry.utils.deepClone(result.snapshots),
                    tickNarratives: foundry.utils.deepClone(result.tickNarratives)
                }
            });

            if (tick < result.totalTicks) {
                await wait(tickDelayMs);
            }
        }

        const round = this.#combat.round || this.state.round || 1;
        const nextHistory = [
            ...toArray(this.state.roundHistory),
            this.#buildRoundHistoryEntry({
                round,
                timeline: result.timeline,
                tickNarratives: result.tickNarratives
            })
        ];

        await this.#setState({
            ...this.state,
            phase: "roundComplete",
            timeline: result.timeline,
            planningStartedAt: 0,
            perCombatant: result.perCombatant,
            currentEvaluationTick: result.totalTicks,
            roundHistory: nextHistory,
            resolution: {
                status: "complete",
                currentTick: result.totalTicks,
                totalTicks: result.totalTicks,
                snapshots: result.snapshots,
                tickNarratives: result.tickNarratives,
                reactionConsumedKeys: serializeReactionRuntime(result.reactionRuntime)
            }
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, {
            phase: "roundComplete",
            previousPhase: "resolving"
        });
        this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED, {
            round,
            timeline: result.timeline
        });

        await this.#publishRoundReplay(result.timeline);
        return result.timeline;
    }

    async #resolveAction(
        combatant,
        action,
        {
            tick = 0,
            perCombatant = {},
            reactionRuntime = null,
            reactionContext = null,
            evaluationSnapshot = null,
            applyEffects = true,
            tokenPositions = null
        } = {}
    ) {
        const actor = combatant.actor;
        const item = action.itemId ? actor?.items?.get(action.itemId) : null;

        if (action.type === "movement") {
            return {
                result: "moved",
                detail: `${combatant.name} advances ${toNumber(action.movementFeet, 10)} ft.`
            };
        }

        if (action.isReaction) {
            if (reactionContext?.sourceAction) {
                return {
                    result: "reactionResolved",
                    detail: `${combatant.name} resolves ${reactionContext.sourceLabel ?? action.label}.`
                };
            }

            return {
                result: "reactionExpired",
                detail: `${combatant.name} finds no trigger for ${action.label}.`
            };
        }

        if (item) {
            const useResult = await item.executeEncounterAction?.({
                actor,
                actionId: action.actionId,
                consume: Boolean(applyEffects)
            });

            if (useResult && !useResult.success) {
                return {
                    result: "failed",
                    detail: `${combatant.name} cannot complete ${action.label} (${useResult.reason}).`
                };
            }
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

        if ((action.requiresToHit || action.requiresTarget) && !action.targetId) {
            return {
                result: "failed",
                targetCombatantId: null,
                targetName: game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
                detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
            };
        }

        const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
        if ((action.requiresToHit || action.requiresTarget) && !targetCombatant) {
            return {
                result: "failed",
                targetCombatantId: null,
                targetName: game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
                detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
            };
        }
        if (targetCombatant && this.#isCombatantIncapacitated(targetCombatant, { actorHealth: evaluationSnapshot?.actorHealth })) {
            return {
                result: "interrupted",
                detail: `${combatant.name} aborts ${action.label}; ${targetCombatant.name} is already incapacitated.`
            };
        }

        const rangeFeet = this.#resolveActionRangeFeet(action, item);
        const distanceFeet = this.#distanceBetweenCombatantsFeet(combatant, targetCombatant, {
            tokenPositions: tokenPositions ?? evaluationSnapshot?.tokenPositions
        });
        if (Number.isFinite(distanceFeet) && distanceFeet > rangeFeet) {
            return {
                result: "outOfRange",
                targetCombatantId: targetCombatant?.id ?? null,
                targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
                detail: `${combatant.name} cannot complete ${action.label}; target is out of range (${Math.round(distanceFeet)} ft > ${rangeFeet} ft).`
            };
        }

        const weaponData = item?.system ?? {};
        const attackAbilityBonus = this.#getAttackAbilityBonus(actor, item);
        const toHitFlatBonus = Number(action.toHitBonus || 0);

        const roll = await (new Roll("1d20")).roll({ async: true });
        const natural = Number(roll.total ?? 0);

        const targetForFumble = this.#selectCriticalFailureTarget(combatant.id, action.targetId);

        const targetArmorClass = toNumber(targetCombatant?.actor?.system?.defenses?.armorClass, 10);
        const toHitTotal = natural + attackAbilityBonus + toHitFlatBonus;
        const hits = natural === 20 || (natural !== 1 && toHitTotal >= targetArmorClass);

        const incomingReaction = this.#findReactionAtTick({
            combatant: targetCombatant,
            tick,
            triggerType: "incomingAttack",
            perCombatant,
            reactionRuntime
        });
        if (hits && incomingReaction && !incomingReaction.consumed) {
            const consumed = this.#consumeReactionWindow({
                combatantId: targetCombatant?.id,
                actionIndex: incomingReaction.actionIndex,
                startTick: incomingReaction.startTick,
                reactionRuntime
            });

            if (consumed) {
                const dodgeBonus = toNumber(targetCombatant?.actor?.system?.abilities?.dex?.bonus, 0)
                    + toNumber(incomingReaction.action?.toHitBonus, 0);
                const dodgeRoll = await (new Roll("1d20")).roll({ async: true });
                const dodgeTotal = toNumber(dodgeRoll.total, 0) + dodgeBonus;
                if (natural !== 20 && dodgeTotal >= toHitTotal) {
                    return {
                        result: "reacted",
                        roll: natural,
                        total: toHitTotal,
                        reactionRoll: toNumber(dodgeRoll.total, 0),
                        reactionTotal: dodgeTotal,
                        reactionType: incomingReaction.action?.reactionTriggerType ?? "incomingAttack",
                        targetCombatantId: targetCombatant?.id ?? null,
                        targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
                        detail: `${targetCombatant?.name ?? "The target"} reacts with ${incomingReaction.action?.label ?? "Dodge"} and avoids ${combatant.name}'s ${action.label}.`
                    };
                }
            }
        }

        const damageRoll = await this.#rollDamageForAction({ actor, item, action, weaponData });
        const baseDamage = Math.max(0, toNumber(damageRoll.total, 0));

        if (natural === 20) {
            const appliedDamage = baseDamage * 2;
            if (applyEffects) {
                await this.#applyDamageToCombatant(targetCombatant, appliedDamage);
            }

            return {
                result: "criticalHit",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                pendingDamage: {
                    targetCombatantId: targetCombatant?.id ?? null,
                    amount: appliedDamage
                },
                targetCombatantId: targetCombatant?.id ?? null,
                targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
                detail: `${combatant.name} critically hits ${targetCombatant?.name ?? "the target"} with ${action.label} for ${formatDamageText(appliedDamage)}.`
            };
        }

        if (natural === 1) {
            const redirectedTarget = targetForFumble;
            const appliedDamage = baseDamage * 2;
            if (applyEffects) {
                await this.#applyDamageToCombatant(redirectedTarget, appliedDamage);
            }

            return {
                result: "criticalFailure",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                pendingDamage: {
                    targetCombatantId: redirectedTarget?.id ?? null,
                    amount: appliedDamage
                },
                redirectedTargetId: redirectedTarget?.id ?? null,
                redirectedTargetName: redirectedTarget?.name ?? null,
                detail: `${combatant.name} critically fumbles ${action.label}, dealing ${formatDamageText(appliedDamage)} to ${redirectedTarget?.name ?? "an unintended target"}.`
            };
        }

        if (hits && applyEffects) {
            await this.#applyDamageToCombatant(targetCombatant, baseDamage);
        }

        return {
            result: hits ? "hit" : "miss",
            roll: natural,
            total: toHitTotal,
            targetArmorClass,
            damage: hits ? baseDamage : 0,
            pendingDamage: hits
                ? {
                    targetCombatantId: targetCombatant?.id ?? null,
                    amount: baseDamage
                }
                : null,
            targetCombatantId: targetCombatant?.id ?? null,
            targetName: targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.TargetUnspecified"),
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

    #combatantHealth(combatant, { actorHealth = null } = {}) {
        const actorId = String(combatant?.actor?.id ?? "").trim();
        if (actorId && actorHealth && Number.isFinite(actorHealth[actorId])) {
            return toNumber(actorHealth[actorId], 0);
        }
        return toNumber(combatant?.actor?.system?.resources?.health?.value, 0);
    }

    #isCombatantIncapacitated(combatant, { actorHealth = null } = {}) {
        return this.#combatantHealth(combatant, { actorHealth }) <= 0;
    }

    #resolveActionRangeFeet(action = null, item = null) {
        const rangeType = String(action?.rangeType ?? "melee").toLowerCase();
        const normal = Number(item?.system?.physical?.range?.normal ?? (rangeType === "melee" ? 5 : 30));
        const long = Number(item?.system?.physical?.range?.long ?? Math.max(normal, 60));
        if (rangeType === "long") return Math.max(5, long || normal || 60);
        if (rangeType === "normal") return Math.max(5, normal || 30);
        return 5;
    }

    #distanceBetweenCombatantsFeet(sourceCombatant, targetCombatant, { tokenPositions = null } = {}) {
        const sourceToken = this.#getCombatantTokenDocument(sourceCombatant);
        const targetToken = this.#getCombatantTokenDocument(targetCombatant);
        if (!sourceToken || !targetToken) return Number.POSITIVE_INFINITY;

        const gridSize = Number(sourceToken?.parent?.grid?.size ?? targetToken?.parent?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
        const gridDistance = Number(sourceToken?.parent?.grid?.distance ?? targetToken?.parent?.grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5;

        const sourceTokenId = String(sourceToken.id ?? sourceToken._id ?? "").trim();
        const targetTokenId = String(targetToken.id ?? targetToken._id ?? "").trim();
        const sourcePos = sourceTokenId ? tokenPositions?.[sourceTokenId] : null;
        const targetPos = targetTokenId ? tokenPositions?.[targetTokenId] : null;

        const sourceX = toNumber(sourcePos?.x, toNumber(sourceToken.x, 0)) + ((toNumber(sourceToken.width, 1) * gridSize) / 2);
        const sourceY = toNumber(sourcePos?.y, toNumber(sourceToken.y, 0)) + ((toNumber(sourceToken.height, 1) * gridSize) / 2);
        const targetX = toNumber(targetPos?.x, toNumber(targetToken.x, 0)) + ((toNumber(targetToken.width, 1) * gridSize) / 2);
        const targetY = toNumber(targetPos?.y, toNumber(targetToken.y, 0)) + ((toNumber(targetToken.height, 1) * gridSize) / 2);

        const pixelDistance = Math.hypot(targetX - sourceX, targetY - sourceY);
        return (pixelDistance / gridSize) * gridDistance;
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
        void timeline;
    }
}

export class TurnOfTheCenturyCombat extends BaseCombatDocument {
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

    async syncSceneCombatants(options = {}) {
        return this.encounter.syncSceneCombatants(options);
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

    async beginEncounterResolution(options = {}) {
        return this.encounter.beginEncounterResolution(options);
    }

    async resolveEncounterRound() {
        return this.encounter.resolveEncounterRound();
    }

    async stepEncounterResolution(direction = 1) {
        return this.encounter.stepEncounterResolution(direction);
    }
}
