import {
    TOTC_BASE_ACTION_POINT_BUDGET,
    TOTC_ENCOUNTER_PHASES,
    getActionPointBudget,
    getBaseActionCatalog,
    getMovementFeetPerAp,
    getPlanningLimitSeconds,
    getPlanningWarningSeconds
} from "../encounters/action-catalog.mjs";

const BaseCombatDocument = foundry.documents?.Combat ?? Combat;
const ChatMessageDocument = foundry.documents?.ChatMessage ?? ChatMessage;

const ENCOUNTER_FLAG_SCOPE = "turn-of-the-century";
const ENCOUNTER_FLAG_KEY = "encounter";
const ACTION_ITEM_TYPES = new Set(["armor", "consumable", "weapon"]);

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

function getEquippedItemIds(actor) {
    const equipment = actor?.system?.inventory?.equipment ?? {};
    return new Set(
        Object.values(equipment)
            .flatMap((slot) => toArray(slot?.itemIds))
            .filter(Boolean)
    );
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

function getWhisperRecipientsForGm() {
    return ChatMessageDocument.getWhisperRecipients("GM").map((user) => user.id);
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
        movementFeetPerAp: Number(action.movementFeetPerAp || 0),
        rangeType: String(action.rangeType || "melee"),
        conditions: toArray(action.conditions),
        // AP timeline fields
        completionPhaseIncrement: Math.max(0, Math.floor(Number(action.completionPhaseIncrement || 0))),
        cpiPerFeet: Math.max(0, Math.floor(Number(action.cpiPerFeet || 0))),
        // Autonomous resolution — effect continues if actor is incapacitated
        autoResolve: Boolean(action.autoResolve),
        interruptible: action.interruptible !== false,
        // Reaction fields — entryType and trigger set when added to the plan
        entryType: String(action.entryType || "action"),
        isReaction: Boolean(action.isReaction),
        reactionTriggerType: String(action.reactionTriggerType || ""),
        consumesAmmo: Math.max(0, Math.floor(Number(action.consumesAmmo || 0))),
        requiresAmmo: Math.max(0, Math.floor(Number(action.requiresAmmo || 0))),
        reloadsAmmo: Math.max(0, Math.floor(Number(action.reloadsAmmo || 0)))
    };
}

/**
 * Build the AP timeline for a single combatant's plan. Returns an array of
 * timeline entries, one per plan entry, each annotated with:
 *  - apStart / apEnd   — the AP slots this entry occupies
 *  - effectSlot        — the slot when its effect actually lands (apEnd + CPI)
 *
 * @param {object[]} plan         - The combatant's normalized plan entries
 * @param {number}   apBudget     - Maximum AP available (typically 6)
 * @param {Function} [getDistance] - Optional: (targetId) => feet; used for cpiPerFeet actions
 * @returns {object[]}
 */
function buildCombatantTimeline(plan, apBudget, getDistance = null) {
    const timeline = [];
    let cursor = 0;

    for (const entry of plan) {
        const cost = Math.max(1, Number(entry.apCost || 1));
        const apStart = cursor + 1;
        const apEnd = Math.min(cursor + cost, apBudget);

        // Calculate CPI: distance-based overrides fixed if cpiPerFeet > 0
        let cpi = Number(entry.completionPhaseIncrement || 0);
        if (entry.cpiPerFeet > 0 && getDistance && entry.targetId) {
            const dist = getDistance(entry.targetId) ?? 0;
            cpi = Math.floor(dist / entry.cpiPerFeet);
        }

        const effectSlot = apEnd + cpi;

        timeline.push({
            ...entry,
            apStart,
            apEnd,
            cpi,
            effectSlot,
            // Reconciliation state — populated during reconciliation pass
            negated: false,
            penaltyApplied: 0,
            outcome: null
        });

        cursor += cost;
        if (cursor >= apBudget) break;
    }

    return timeline;
}

/**
 * Pre-roll all outcomes for a combatant's timeline against the frozen round-start
 * game state. Outcomes are recorded on the timeline entries themselves.
 * Modifiers and reactions are NOT applied here — that happens in reconciliation.
 *
 * @param {object[]}  timeline    - Entries from buildCombatantTimeline
 * @param {object}    combatant   - Foundry Combatant document
 * @param {Map}       snapshot    - Round-start state snapshot keyed by combatantId
 * @returns {object[]}            - Same timeline array with .roll / .damageRoll populated
 */
async function preRollTimelineOutcomes(timeline, combatant, snapshot) {
    const actor = combatant.actor;

    for (const entry of timeline) {
        if (entry.entryType === "reaction") {
            // Pre-roll the reaction's own check (e.g. parry, dodge)
            if (entry.requiresToHit || entry.isReaction) {
                const reactionRoll = await new Roll("1d20").roll({ async: true });
                entry.reactionRoll = Number(reactionRoll.total ?? 0);
                entry.reactionAbilityBonus = getReactionAbilityBonus(actor, entry);
                entry.reactionTotal = entry.reactionRoll + entry.reactionAbilityBonus + Number(entry.toHitBonus || 0);
            }
            continue;
        }

        if (!entry.requiresToHit) continue;

        const toHitRoll = await new Roll("1d20").roll({ async: true });
        entry.roll = Number(toHitRoll.total ?? 0);

        const abilityBonus = getAttackAbilityBonusFromSnapshot(actor, snapshot, entry);
        entry.abilityBonus = abilityBonus;
        entry.total = entry.roll + abilityBonus + Number(entry.toHitBonus || 0);

        // Resolve target AC from snapshot (not live state)
        const targetSnap = snapshot.get(entry.targetId);
        entry.targetArmorClass = toNumber(targetSnap?.armorClass, 10);
        entry.hitsUnmodified = entry.roll === 20 || (entry.roll !== 1 && entry.total >= entry.targetArmorClass);

        // Pre-roll damage
        const item = entry.itemId ? actor?.items?.get(entry.itemId) : null;
        const weaponData = item?.system ?? {};
        const damageFormula = String(weaponData?.damage?.formula || "1").trim() || "1";
        const damageBonus = toNumber(weaponData?.damage?.bonus, 0);
        const compiled = damageBonus ? `${damageFormula} + ${damageBonus}` : damageFormula;
        const damageRoll = await new Roll(compiled, { actor: actor?.system ?? {} }).roll({ async: true });
        entry.damageRoll = Math.max(0, Number(damageRoll.total ?? 0));
    }

    return timeline;
}

/**
 * Ability bonus for reaction checks (dodge = dex, parry = weapon skill or str/dex).
 */
function getReactionAbilityBonus(actor, entry) {
    if (!actor) return 0;
    if (entry.id === "dodge") {
        return toNumber(actor.system?.abilities?.dex?.bonus, 0);
    }
    // Parry and melee weapon reactions use str bonus (or dex for finesse weapons — future)
    return toNumber(actor.system?.abilities?.str?.bonus, 0);
}

/**
 * Resolve an attacker's ability bonus from the round-start snapshot.
 * Ranged weapons use dex; melee use str.
 */
function getAttackAbilityBonusFromSnapshot(actor, snapshot, entry) {
    if (!actor) return 0;
    const item = entry.itemId ? actor?.items?.get(entry.itemId) : null;
    const classification = String(item?.system?.classification ?? "");
    const rangedClassifications = new Set(["simpleRanged", "martialRanged", "firearm", "explosive", "thrown"]);
    const abilityKey = rangedClassifications.has(classification) ? "dex" : "str";
    // Read from live actor — snapshot holds HP/conditions, not ability scores
    return toNumber(actor.system?.abilities?.[abilityKey]?.bonus, 0);
}

/**
 * Snapshot the round-start game state for all combatants. The resolution engine
 * evaluates ALL outcomes against this snapshot so that damage dealt in one AP
 * slice does not affect rolls or AC calculations in another.
 *
 * @param {Combatant[]} combatants
 * @returns {Map<string, object>}  keyed by combatant ID
 */
function snapshotRoundState(combatants) {
    const snap = new Map();
    for (const combatant of combatants) {
        const actor = combatant.actor;
        snap.set(combatant.id, {
            health: toNumber(actor?.system?.resources?.health?.value, 0),
            armorClass: toNumber(actor?.system?.defenses?.armorClass, 10),
            incapacitated: false,
            conditions: new Set() // populated from active effects in future
        });
    }
    return snap;
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

    #isCombatantOwnedByCurrentUser(combatantId) {
        if (game.user?.isGM) return true;

        const combatant = getCombatantFromId(this.#combat, combatantId);
        return Boolean(combatant?.actor?.isOwner);
    }

    #requireGm(action) {
        if (game.user?.isGM) return;
        throw new Error(`Only the GM can ${action}.`);
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
        const movementFeetPerAp = Number(getMovementFeetPerAp() || 10);
        const globalActions = Object.values(catalog)
            .filter((template) => template?.id)
            .map((template) => {
                const apMin = Number(template.apMin ?? template.apCost ?? 1);
                const apMax = Math.min(this.apBudget, Math.max(apMin, Number(template.apMax ?? template.apCost ?? apMin)));
                const apCost = Math.max(apMin, Math.min(apMax, Number(template.apCost ?? apMin)));

                return {
                    id: template.id,
                    actionId: template.id,
                    type: String(template.type ?? "action"),
                    label: String(template.label ?? template.id),
                    description: String(template.description ?? "").trim() || null,
                    apCost,
                    apMin,
                    apMax,
                    variableAp: Boolean(template.variableAp && apMax > apMin),
                    movementFeet: template.type === "movement" ? Number(apCost * movementFeetPerAp) : Number(template.movementFeet ?? 0),
                    movementFeetPerAp: template.type === "movement" ? movementFeetPerAp : Number(template.movementFeetPerAp ?? 0),
                    requiresToHit: Boolean(template.requiresToHit),
                    toHitBonus: Number(template.toHitBonus ?? 0),
                    itemId: null,
                    completionPhaseIncrement: Number(template.completionPhaseIncrement ?? 0),
                    cpiPerFeet: Number(template.cpiPerFeet ?? 0),
                    autoResolve: Boolean(template.autoResolve),
                    interruptible: Boolean(template.interruptible),
                    isReaction: Boolean(template.isReaction),
                    reactionTriggerType: String(template.reactionTriggerType ?? "")
                };
            });

        const equippedItemIds = getEquippedItemIds(combatant.actor);
        const itemActions = collectionContents(combatant.actor.items).flatMap((item) => {
            if (!ACTION_ITEM_TYPES.has(item.type) || !equippedItemIds.has(item.id)) return [];

            const variants = item.actionVariants ?? [];
            return variants.map((variant) => ({
                id: `${item.id}:${variant.id}`,
                actionId: variant.id,
                type: variant.type,
                label: `${item.name}: ${variant.label}`,
                description: String(item.system?.description ?? variant.description ?? "").trim() || null,
                apCost: item.type === "consumable" ? this.#getConsumableApCost(combatant.actor, item, variant) : Number(variant.apCost ?? 1),
                apMin: Number(variant.apCost ?? 1),
                apMax: Number(variant.apCost ?? 1),
                variableAp: false,
                requiresToHit: Boolean(variant.requiresToHit),
                toHitBonus: Number(variant.toHitBonus ?? 0),
                itemId: item.id
            }));
        });

        return [...globalActions, ...itemActions];
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
     * Initialize a new encounter round. Clears all combatant plans, writes
     * fresh state to the combat flag, and emits
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

    async setCombatantPlan(combatantId, actions = []) {
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
     * Resolve a complete encounter round using the snapshot/pre-roll/reconciliation model:
     *
     *   1. Freeze round-start game state (HP, AC, conditions).
     *   2. Build an AP timeline for every combatant — each plan entry gets apStart,
     *      apEnd, and effectSlot (apEnd + CPI).
     *   3. Pre-roll all outcomes (to-hit, damage, reaction rolls) against the snapshot.
     *   4. Reconciliation pass: walk AP slices 1–N in order. Within each slice all
     *      effects land simultaneously. Apply in-slice modifiers (hunker-down penalties,
     *      parry/dodge contests) before committing outcomes. Mark incapacitated
     *      combatants and invalidate their remaining non-autoResolve effects.
     *   5. Apply final damage to live actor documents.
     *   6. Publish round narrative and emit ROUND_RESOLVED.
     *
     * GM only.
     *
     * @returns {Promise<object[]>} Completed timeline of reconciled outcome entries.
     */
    async resolveEncounterRound() {
        this.#requireGm("resolve encounter rounds");

        await this.setEncounterPhase("locked");
        await this.setEncounterPhase("resolving");

        const combatants = this.#combat.combatants?.contents ?? [];
        const apBudget = this.apBudget;
        const round = this.#combat.round || this.state.round || 1;

        // ── Step 1: Freeze round-start state ─────────────────────────────────────
        const snapshot = snapshotRoundState(combatants);

        // ── Step 2: Build timelines ───────────────────────────────────────────────
        const combatantTimelines = new Map();
        for (const combatant of combatants) {
            const plan = this.getCombatantPlan(combatant.id);
            const timeline = buildCombatantTimeline(plan, apBudget);
            combatantTimelines.set(combatant.id, { combatant, timeline });
        }

        // ── Step 3: Pre-roll all outcomes ─────────────────────────────────────────
        for (const { combatant, timeline } of combatantTimelines.values()) {
            await preRollTimelineOutcomes(timeline, combatant, snapshot);
        }

        // ── Step 4: Reconciliation ────────────────────────────────────────────────
        // Collect every unique effectSlot across all combatants (including CPI>0)
        const allSlots = new Set();
        for (const { timeline } of combatantTimelines.values()) {
            for (const entry of timeline) {
                if (entry.effectSlot >= 1) allSlots.add(entry.effectSlot);
            }
        }
        const sortedSlots = [...allSlots].sort((a, b) => a - b);

        // Track damage to apply after all reconciliation, keyed by combatantId
        const pendingDamage = new Map();
        const masterTimeline = [];

        for (const slot of sortedSlots) {
            // Collect everything resolving this slot
            const slotEntries = [];
            for (const { combatant, timeline } of combatantTimelines.values()) {
                const snap = snapshot.get(combatant.id);
                for (const entry of timeline) {
                    if (entry.effectSlot !== slot) continue;
                    // Non-autoResolve actions from incapacitated combatants are skipped
                    if (snap?.incapacitated && !entry.autoResolve) {
                        entry.outcome = { result: "invalidated", detail: `${combatant.name} is incapacitated.` };
                        masterTimeline.push({ slot, combatantId: combatant.id, combatantName: combatant.name, entry });
                        continue;
                    }
                    slotEntries.push({ combatant, entry, snap });
                }
            }

            // ── Apply hunker-down penalties to attacks landing this slot ─────────
            // Find any combatant hunkered whose AP window covers this slot
            const hunkeredIds = new Set();
            for (const { combatant, timeline } of combatantTimelines.values()) {
                for (const entry of timeline) {
                    if (entry.id !== "hunkDown" && entry.type !== "defense") continue;
                    if (entry.apStart <= slot && entry.apEnd >= slot) {
                        hunkeredIds.add(combatant.id);
                    }
                }
            }

            for (const item of slotEntries) {
                const { entry } = item;
                if (!entry.requiresToHit || entry.entryType === "reaction") continue;
                const targetId = entry.targetId;
                if (!targetId || !hunkeredIds.has(targetId)) continue;

                // Apply ranged to-hit penalty (only for ranged attacks)
                const isRanged = ["normal", "long"].includes(entry.rangeType);
                if (isRanged) {
                    const penalty = -3; // matches hunkDown.rangedToHitPenalty in catalog
                    entry.penaltyApplied += penalty;
                    entry.total = (entry.total ?? 0) + penalty;
                    entry.hitsUnmodified = entry.roll === 20 || (entry.roll !== 1 && entry.total >= entry.targetArmorClass);
                }
            }

            // ── Resolve reactions firing this slot ───────────────────────────────
            // For each attack landing this slot, check if target has an active reaction
            for (const item of slotEntries) {
                const { entry: attackEntry, combatant: attacker } = item;
                if (attackEntry.entryType === "reaction") continue;
                if (!attackEntry.requiresToHit) continue;
                if (attackEntry.negated) continue;

                const targetId = attackEntry.targetId;
                if (!targetId) continue;

                const targetData = combatantTimelines.get(targetId);
                if (!targetData) continue;

                for (const reactionEntry of targetData.timeline) {
                    if (reactionEntry.entryType !== "reaction") continue;
                    if (reactionEntry.reactionTriggerType !== "incomingAttack") continue;
                    if (reactionEntry.apStart > slot || reactionEntry.apEnd < slot) continue;

                    // Contested roll: reaction total vs attack total
                    const reactionTotal = reactionEntry.reactionTotal ?? 0;
                    const attackTotal = attackEntry.total ?? 0;
                    const reactionSucceeds = reactionTotal >= attackTotal;

                    reactionEntry.outcome = {
                        result: reactionSucceeds ? "reactionSuccess" : "reactionFailed",
                        contestedAttackId: attackEntry.id,
                        attackerId: attacker.id,
                        reactionTotal,
                        attackTotal,
                        detail: reactionSucceeds
                            ? `${targetData.combatant.name} ${reactionEntry.label}s the attack from ${attacker.name} (${reactionTotal} vs ${attackTotal}).`
                            : `${targetData.combatant.name}'s ${reactionEntry.label} fails against ${attacker.name}'s attack (${reactionTotal} vs ${attackTotal}).`
                    };

                    if (reactionSucceeds) {
                        attackEntry.negated = true;
                        attackEntry.negatedBy = reactionEntry.id;
                    }

                    masterTimeline.push({
                        slot,
                        combatantId: targetData.combatant.id,
                        combatantName: targetData.combatant.name,
                        entry: reactionEntry
                    });
                    break; // one reaction per attack
                }
            }

            // ── Apply surviving attack outcomes ───────────────────────────────────
            for (const { combatant, entry, snap } of slotEntries) {
                if (entry.entryType === "reaction") continue; // already handled above
                if (entry.outcome) continue; // already set (invalidated, etc.)

                entry.outcome = this.#buildOutcome(combatant, entry, combatantTimelines, snapshot);

                // Accumulate damage for application after full reconciliation
                if (entry.outcome?.damage > 0 && entry.outcome?.targetCombatantId) {
                    const tid = entry.outcome.targetCombatantId;
                    pendingDamage.set(tid, (pendingDamage.get(tid) ?? 0) + entry.outcome.damage);

                    // Check incapacitation against snapshot health
                    const targetSnap = snapshot.get(tid);
                    if (targetSnap && (targetSnap.health - (pendingDamage.get(tid) ?? 0)) <= 0) {
                        targetSnap.incapacitated = true;
                    }
                }

                masterTimeline.push({ slot, combatantId: combatant.id, combatantName: combatant.name, entry });
            }
        }

        // ── Step 5: Apply accumulated damage to live actors ───────────────────────
        for (const [combatantId, totalDamage] of pendingDamage.entries()) {
            const combatant = getCombatantFromId(this.#combat, combatantId);
            if (!combatant?.actor) continue;
            const actor = combatant.actor;
            const current = toNumber(actor.system?.resources?.health?.value, 0);
            await actor.update({ "system.resources.health.value": Math.max(0, current - totalDamage) });
        }

        // ── Step 6: Persist state, publish, emit ─────────────────────────────────
        const flatTimeline = masterTimeline.map((t) => ({
            slot: t.slot,
            combatantId: t.combatantId,
            combatantName: t.combatantName,
            action: t.entry,
            outcome: t.entry.outcome
        }));

        await this.#setState({
            ...this.state,
            phase: "roundComplete",
            timeline: flatTimeline,
            planningStartedAt: 0
        });

        this.emit(TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED, { phase: "roundComplete", previousPhase: "resolving" });
        this.emit(TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED, { round, timeline: flatTimeline });

        await this.#publishRoundReplay(flatTimeline);
        return flatTimeline;
    }

    /**
     * Build a narrative outcome object for a single resolved plan entry.
     * Uses pre-rolled values from the entry; does not re-roll anything.
     */
    #buildOutcome(combatant, entry, combatantTimelines, snapshot) {
        const actor = combatant.actor;
        const name = combatant.name;

        if (entry.type === "movement") {
            const feet = Number(entry.movementFeetPerAp || getMovementFeetPerAp() || 10) * entry.apCost;
            return { result: "moved", detail: `${name} moves ${feet} ft.` };
        }

        if (entry.type === "reload") {
            return { result: "reloaded", reloadsAmmo: entry.reloadsAmmo, detail: `${name} reloads (${entry.reloadsAmmo} rounds).` };
        }

        if (entry.type === "defense" && !entry.isReaction) {
            return { result: "defended", detail: `${name} hunkers down.` };
        }

        if (!entry.requiresToHit) {
            return { result: "resolved", detail: `${name} completes ${entry.label}.` };
        }

        if (entry.negated) {
            return {
                result: "negated",
                negatedBy: entry.negatedBy,
                detail: `${name}'s ${entry.label} is negated by a reaction.`
            };
        }

        // Attack resolution using pre-rolled values
        const natural = entry.roll ?? 0;
        const total = entry.total ?? 0;
        const targetArmorClass = entry.targetArmorClass ?? 10;
        const hits = natural === 20 || (natural !== 1 && total >= targetArmorClass);
        const baseDamage = entry.damageRoll ?? 0;

        // Resolve actual target combatant document
        const targetId = entry.targetId;
        const targetData = targetId ? combatantTimelines.get(targetId) : null;
        const targetCombatant = targetData?.combatant ?? this.#fallbackTarget(combatant.id);
        const targetName = targetCombatant?.name ?? game.i18n.localize("TOTC.Encounter.TargetUnspecified");

        if (natural === 20) {
            const damage = baseDamage * 2;
            return {
                result: "criticalHit",
                roll: natural, total, damage, damageMultiplier: 2,
                targetCombatantId: targetCombatant?.id ?? null, targetName,
                detail: `${name} critically hits ${targetName} with ${entry.label} for ${formatDamageText(damage)}.`
            };
        }

        if (natural === 1) {
            const fumbleTarget = this.#selectCriticalFailureTarget(combatant.id, targetId);
            const damage = baseDamage * 2;
            return {
                result: "criticalFailure",
                roll: natural, total, damage, damageMultiplier: 2,
                redirectedTargetId: fumbleTarget?.id ?? null,
                redirectedTargetName: fumbleTarget?.name ?? null,
                targetCombatantId: fumbleTarget?.id ?? null,
                detail: `${name} critically fumbles ${entry.label}, dealing ${formatDamageText(damage)} to ${fumbleTarget?.name ?? "an unintended target"}.`
            };
        }

        return {
            result: hits ? "hit" : "miss",
            roll: natural, total, targetArmorClass,
            damage: hits ? baseDamage : 0,
            targetCombatantId: hits ? (targetCombatant?.id ?? null) : null,
            targetName,
            detail: hits
                ? `${name} hits ${targetName} with ${entry.label} (AC ${targetArmorClass}) for ${formatDamageText(baseDamage)}.`
                : `${name} misses ${targetName} with ${entry.label} (rolled ${total} vs AC ${targetArmorClass}).`
        };
    }

    #fallbackTarget(sourceCombatantId) {
        const candidates = (this.#combat.combatants?.contents ?? []).filter((c) => c.id !== sourceCombatantId);
        return candidates[0] ?? null;
    }

    #selectCriticalFailureTarget(sourceCombatantId, intendedTargetId) {
        const candidates = (this.#combat.combatants?.contents ?? []).filter((c) => {
            if (!c?.id) return false;
            if (c.id === intendedTargetId) return false;
            return true;
        });
        if (!candidates.length) return this.#combat.combatants?.get(sourceCombatantId) ?? null;
        return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
    }

    async #applyDamageToCombatant(combatant, amount) {
        if (!combatant?.actor) return;
        const actor = combatant.actor;
        const current = toNumber(actor.system?.resources?.health?.value, 0);
        await actor.update({ "system.resources.health.value": Math.max(0, current - Math.max(0, toNumber(amount, 0))) });
    }

    async #publishRoundReplay(timeline) {
        if (!timeline.length) return;

        const round = this.#combat.round || this.state.round || 1;
        const gmLines = timeline.map((entry) => createNarrationMessage(round, entry.slot ?? entry.tick, entry.outcome?.detail ?? ""));
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
