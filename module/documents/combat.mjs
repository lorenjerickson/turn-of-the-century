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
import { findGridMovementPath } from "../encounters/grid-pathfinding.mjs";
import { applyLocalPlanningTokenPath } from "../encounters/planning-token-preview.mjs";
import { EncounterNarrator } from "../encounters/encounter-narrator.mjs";
import { EncounterSnapshotStore } from "../encounters/encounter-snapshot-store.mjs";
import { EncounterPlanningService } from "../encounters/encounter-planning-service.mjs";
import { normalizeDraftPlan } from "../encounters/encounter-draft-plan.mjs";
import { MovementResolver } from "../encounters/movement-resolver.mjs";
import { AttackResolver } from "../encounters/attack-resolver.mjs";
import { ReactionResolver } from "../encounters/reaction-resolver.mjs";
import { CollisionResolver } from "../encounters/collision-resolver.mjs";
import { ConsumptionResolver } from "../encounters/consumption-resolver.mjs";
import { EncounterResolutionEngine } from "../encounters/encounter-resolution-engine.mjs";

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
 * @property {string} DRAFT_PLAN_UPDATED   - Fired after a combatant's narrative draft plan is written.
 */
export const TOTC_ENCOUNTER_EVENTS = {
    STATE_INITIALIZED: "stateInitialized",
    PHASE_CHANGED: "phaseChanged",
    PLANNING_STARTED: "planningStarted",
    PLANNING_ENDED: "planningEnded",
    ROUND_STARTED: "roundStarted",
    ROUND_RESOLVED: "roundResolved",
    COMBATANT_READY_CHANGED: "combatantReadyChanged",
    PLAN_UPDATED: "planUpdated",
    DRAFT_PLAN_UPDATED: "draftPlanUpdated"
};

const TOTC_ENCOUNTER_HOOKS = {
    [TOTC_ENCOUNTER_EVENTS.STATE_INITIALIZED]: "totcEncounterStateInitialized",
    [TOTC_ENCOUNTER_EVENTS.PHASE_CHANGED]: "totcEncounterPhaseChanged",
    [TOTC_ENCOUNTER_EVENTS.PLANNING_STARTED]: "totcEncounterPlanningStarted",
    [TOTC_ENCOUNTER_EVENTS.PLANNING_ENDED]: "totcEncounterPlanningEnded",
    [TOTC_ENCOUNTER_EVENTS.ROUND_STARTED]: "totcEncounterRoundStarted",
    [TOTC_ENCOUNTER_EVENTS.ROUND_RESOLVED]: "totcEncounterRoundResolved",
    [TOTC_ENCOUNTER_EVENTS.COMBATANT_READY_CHANGED]: "totcEncounterCombatantReadyChanged",
    [TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED]: "totcEncounterPlanUpdated",
    [TOTC_ENCOUNTER_EVENTS.DRAFT_PLAN_UPDATED]: "totcEncounterDraftPlanUpdated"
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
        requiresTarget: Boolean(action.requiresTarget),
        requiresItem: Boolean(action.requiresItem),
        requiresDuration: Boolean(action.requiresDuration),
        automatic: Boolean(action.automatic),
        status: String(action.status ?? ""),
        toHitBonus: Number(action.toHitBonus || 0),
        damageFormula: String(action.damageFormula ?? ""),
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
        movementOriginX: optionalNumber(action.movementOriginX),
        movementOriginY: optionalNumber(action.movementOriginY),
        planningLocked: Boolean(action.planningLocked),
        planningRollResults: toArray(action.planningRollResults).map((result) => foundry.utils.deepClone(result)),
        rollRequirements: toArray(action.rollRequirements).map((requirement) => foundry.utils.deepClone(requirement))
    };
}

function lockedActionComparable(action = {}) {
    const comparable = foundry.utils.deepClone(action);
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

function actionRollRequirements(action = {}) {
    const requirements = toArray(action.rollRequirements);
    if (requirements.length) return requirements;
    if (action.requiresToHit || action.type === "attack") {
        return [{ rollType: "attack", rollSubType: "toHit" }];
    }
    return [];
}

function actionRollRequirementSatisfied(action = {}, requirement = {}) {
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

function actionHasUnresolvedPlayerRoll(action = {}) {
    const requirements = actionRollRequirements(action);
    return requirements.some((requirement) => !actionRollRequirementSatisfied(action, requirement));
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

    /** @type {EncounterNarrator} */
    #narrator;

    /** @type {EncounterSnapshotStore} */
    #snapshotStore;

    /** @type {EncounterPlanningService} */
    #planningService;

    /** @type {MovementResolver} */
    #movementResolver;

    /** @type {AttackResolver} */
    #attackResolver;

    /** @type {ReactionResolver} */
    #reactionResolver;

    /** @type {CollisionResolver} */
    #collisionResolver;

    /** @type {ConsumptionResolver} */
    #consumptionResolver;

    /** @type {EncounterResolutionEngine} */
    #resolutionEngine;

    /**
     * @param {TurnOfTheCenturyCombat} combat - The owning combat document.
     */
    constructor(combat) {
        this.#combat = combat;
        this.#narrator = new EncounterNarrator({ combatants: combat.combatants });
        this.#snapshotStore = new EncounterSnapshotStore({
            combatants: combat.combatants,
            resolveTokenDocument: (combatant) => this.#getCombatantTokenDocument(combatant)
        });
        this.#planningService = new EncounterPlanningService({
            getState: () => this.state,
            setState: (state) => this.#setState(state),
            isCombatantOwned: (combatantId) => this.#isCombatantOwnedByCurrentUser(combatantId),
            isInitiativeGateActive: () => this.hasInitiativeGateActive,
            emit: (eventName, payload) => this.emit(eventName, payload),
            restorePlanningOrigin: (combatantId, plan) => this.#restoreCombatantPlanningOrigin(combatantId, plan)
        });
        this.#movementResolver = new MovementResolver({
            resolveTokenDocument: (combatant) => this.#getCombatantTokenDocument(combatant),
            resolveDeclaredTarget: (sourceId, targetId) => this.#resolveDeclaredTarget(sourceId, targetId),
            getMovementFeetPerAp: () => getMovementFeetPerAp(),
            getScene: () => canvas?.scene ?? null
        });
        this.#reactionResolver = new ReactionResolver({
            getCombatants: () => this.#combat.combatants?.contents ?? [],
            getAvailableActionsForCombatant: (combatantId) => this.getAvailableActionsForCombatant(combatantId),
            isCombatantIncapacitated: (combatant, opts) => this.#isCombatantIncapacitated(combatant, opts),
            distanceBetweenCombatantsFeet: (source, target, opts) => this.#distanceBetweenCombatantsFeet(source, target, opts),
            resolveAttack: (combatant, action, opts) => this.#attackResolver.resolveAttack({ combatant, action, ...opts })
        });
        this.#attackResolver = new AttackResolver({
            resolveDeclaredTarget: (sourceId, targetId) => this.#resolveDeclaredTarget(sourceId, targetId),
            isCombatantIncapacitated: (combatant, opts) => this.#isCombatantIncapacitated(combatant, opts),
            resolveTokenDocument: (combatant) => this.#getCombatantTokenDocument(combatant),
            selectCriticalFailureTarget: (sourceId, intendedId) => this.#selectCriticalFailureTarget(sourceId, intendedId),
            findReactionAtTick: (opts) => this.#reactionResolver.findReactionAtTick(opts),
            consumeReactionWindow: (opts) => this.#reactionResolver.consumeReactionWindow(opts),
            roll: async (formula, data) => (new Roll(formula, data)).roll({ async: true }),
            applyDamage: async (combatant, amount) => {
                if (!combatant?.actor) return;
                const actor = combatant.actor;
                const current = toNumber(actor.system?.resources?.health?.value, 0);
                const next = Math.max(0, current - Math.max(0, toNumber(amount, 0)));
                await actor.update({ "system.resources.health.value": next });
            },
            localize: (key) => game.i18n?.localize(key) ?? key,
            getScene: () => canvas?.scene ?? null
        });
        this.#collisionResolver = new CollisionResolver({
            getCombatants: () => this.#combat.combatants?.contents ?? [],
            getGridSize: () => toNumber(canvas?.scene?.grid?.size, 100) || 100,
            canResolveConflicts: () => Boolean(game?.users),
            isActorProne: (actor) => {
                if (!actor) return false;
                if (actor.statuses?.has?.("prone")) return true;
                return collectionContents(actor.effects).some((effect) => (
                    effect?.statuses?.has?.("prone") || toArray(effect?.statuses).includes("prone")
                ));
            },
            ownerUserIdForActor: (actor) => {
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
            },
            sendRollRequest: ({ member, combatant, recipientId, dexBonus, tick }) => {
                return dieRollRequestManager.sendRequest({
                    id: `encounter-${this.#combat.id}-round-${this.#combat.round || 1}-tick-${tick}-collision-${member.combatantId}`,
                    initiatorId: game.user?.id ?? "",
                    requestor: { id: game.user?.id ?? "", name: game.user?.name ?? "GM", type: "gm" },
                    recipientIds: [recipientId],
                    actorId: combatant?.actor?.id ?? "",
                    tokenId: member.tokenId,
                    rollType: "ability",
                    rollSubType: "dexterity",
                    label: `${combatant?.name ?? "Actor"}: contested Dexterity`,
                    dice: [{ count: 1, faces: 20 }],
                    modifiers: [{ label: "Dexterity", value: dexBonus, source: "actor" }]
                });
            },
            waitForRollResolution: async (id) => dieRollRequestManager.waitForResolution(id),
            applyProneEffect: async (combatant) => {
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
            },
            applyConcussiveDamage: async (combatant) => {
                const actor = combatant?.actor;
                if (!actor) return 0;
                const roll = await (new Roll("1d6")).roll({ async: true });
                const damage = Math.max(1, toNumber(roll?.total, 1));
                const health = toNumber(actor.system?.resources?.health?.value, 0);
                await actor.update({ "system.resources.health.value": Math.max(0, health - damage) });
                return damage;
            },
            notifyAwaitingRolls: async ({ tick, timeline, perCombatant, requestIds }) => {
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
                        pendingRollRequestIds: requestIds
                    }
                });
            },
            applySnapshot: async (snapshot) => this.#applyResolutionSnapshot(snapshot),
            captureSnapshot: async (opts) => this.#captureResolutionSnapshot(opts)
        });
        this.#consumptionResolver = new ConsumptionResolver({
            resolveCombatant: (id) => this.#combat.combatants?.get(id) ?? null,
            applyItemAction: async ({ item, actor, actionId, consume }) => {
                await item.executeEncounterAction?.({ actor, actionId, consume });
            },
            updateActorHealth: async (actor, nextHealth) => {
                await actor.update({ "system.resources.health.value": nextHealth });
            },
            distanceBetweenCombatantsFeet: (source, target, opts) => this.#distanceBetweenCombatantsFeet(source, target, opts)
        });
        this.#resolutionEngine = new EncounterResolutionEngine({
            getState: () => this.state,
            setState: (state) => this.#setState(state),
            getApBudget: () => this.apBudget,
            getMovementFeetPerAp: () => getMovementFeetPerAp(),
            getCurrentRound: () => this.#combat.round || this.state.round || 1,
            getCombatants: () => this.#combat.combatants?.contents ?? [],
            resolveCombatant: (id) => this.#combat.combatants?.get(id) ?? null,
            captureSnapshot: (opts) => this.#captureResolutionSnapshot(opts),
            applySnapshot: (snapshot) => this.#applyResolutionSnapshot(snapshot),
            restorePlanningOrigins: (perCombatant) => this.#restorePlanningOrigins(perCombatant),
            isCombatantIncapacitated: (combatant, opts) => this.#isCombatantIncapacitated(combatant, opts),
            resolveDeclaredTarget: (srcId, tgtId) => this.#resolveDeclaredTarget(srcId, tgtId),
            checkItemAction: async (item, actor, actionId) => item.executeEncounterAction?.({ actor, actionId, consume: false }),
            publishRoundReplay: (timeline) => this.#publishRoundReplay(timeline),
            emit: (eventName, payload) => this.emit(eventName, payload),
            movementResolver: this.#movementResolver,
            attackResolver: this.#attackResolver,
            reactionResolver: this.#reactionResolver,
            collisionResolver: this.#collisionResolver,
            consumptionResolver: this.#consumptionResolver,
            narrator: this.#narrator
        });
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
            draftPlan: normalizeDraftPlan({ clauses: [] }, { apBudget }),
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
            const existingCombatantState = perCombatant[combatant.id] ?? {};
            perCombatant[combatant.id] = {
                ...this.#defaultCombatantState(apBudget),
                ...existingCombatantState,
                plan: toArray(existingCombatantState.plan),
                draftPlan: normalizeDraftPlan(existingCombatantState.draftPlan ?? { clauses: [] }, { apBudget })
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
     * Returns the current narrative draft plan for a combatant.
     *
     * @param {string} combatantId
     * @returns {object}
     */
    getCombatantDraftPlan(combatantId) {
        return normalizeDraftPlan(this.getCombatantState(combatantId)?.draftPlan ?? { clauses: [] }, { apBudget: this.apBudget });
    }

    getCombatantLockedThroughIndex(combatantId) {
        return lockedThroughIndex(this.getCombatantPlan(combatantId));
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

    getCombatantDraftRemainingAp(combatantId) {
        return Number(this.getCombatantDraftPlan(combatantId).remainingAp ?? this.apBudget);
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

    /**
     * If all combatants have committed their plans, or the planning time limit
     * has expired, automatically calls {@link resolveEncounterRound}.
     * @returns {Promise<boolean>} `true` if resolution was started, otherwise `false`.
     */
    async maybeAutoFinalizePlanning() {
        return this.#planningService.maybeAutoFinalizePlanning();
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
        return this.#planningService.setCombatantReady(combatantId, ready);
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
        return this.#planningService.addCombatantAction(combatantId, action);
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
        return this.#planningService.removeCombatantAction(combatantId, index);
    }

    /**
     * Remove all unlocked actions from a combatant's plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @returns {Promise<void>}
     */
    async clearCombatantPlan(combatantId) {
        return this.#planningService.clearCombatantPlan(combatantId);
    }

    async lockCombatantActionRoll(combatantId, actionIndex, roll = {}) {
        return this.#planningService.lockCombatantActionRoll(combatantId, actionIndex, roll);
    }

    async resetCombatantPlanningRolls(combatantId) {
        this.#requireGm("reset combatant planning rolls");
        return this.#planningService.resetCombatantPlanningRolls(combatantId);
    }

    /**
     * Adjust the AP cost of a single action in a combatant's plan.
     * Emits {@link TOTC_ENCOUNTER_EVENTS.PLAN_UPDATED}.
     *
     * @param {string} combatantId
     * @param {number} actionIndex
     * @param {number} apCost
     * @returns {Promise<void>}
     */
    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        return this.#planningService.setCombatantActionApCost(combatantId, actionIndex, apCost);
    }

    async setCombatantDraftPlan(combatantId, draftPlan = {}) {
        return this.#planningService.setCombatantDraftPlan(combatantId, draftPlan);
    }

    async confirmCombatantDraftPlan(combatantId) {
        return this.#planningService.confirmCombatantDraftPlan(combatantId);
    }

    async clearCombatantDraftPlan(combatantId) {
        return this.#planningService.clearCombatantDraftPlan(combatantId);
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
        this.#requirePlanningRollsResolved();
        await this.#resolutionEngine.beginResolution({ persistInitialState: true });
        return this.state.resolution ?? null;
    }

    #requirePlanningRollsResolved() {
        const unresolved = [];
        for (const combatant of this.#combat.combatants?.contents ?? []) {
            const plan = this.getCombatantPlan(combatant.id);
            for (const [actionIndex, action] of plan.entries()) {
                if (!actionHasUnresolvedPlayerRoll(action)) continue;
                unresolved.push(`${combatant.name ?? "Combatant"} ${action.label ?? `action ${actionIndex + 1}`}`);
            }
        }
        if (unresolved.length) {
            throw new Error(`Required player planning rolls and GM-controlled planning rolls must be resolved before encounter resolution can begin: ${unresolved.join(", ")}.`);
        }
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
        return this.#planningService.setCombatantPlan(combatantId, actions);
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
                    committedAt: 0,
                    draftPlan: normalizeDraftPlan(combatantState.draftPlan ?? { clauses: [] }, { apBudget: this.apBudget }),
                    plan: toArray(combatantState.plan).map((action) => ({
                        ...action,
                        planningLocked: false,
                        planningRollResults: []
                    }))
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
        const movementActions = toArray(plan).filter((action) => (
            String(action?.type ?? "") === "movement"
            && Number.isFinite(Number(action?.movementOriginX))
            && Number.isFinite(Number(action?.movementOriginY))
        ));
        if (!movementActions.length) return;

        const combatant = this.#combat.combatants?.get(combatantId) ?? null;
        const token = this.#getCombatantTokenDocument(combatant);
        const tokenDocument = tokenDocumentForUpdate(token);
        if (!tokenDocument?.updateSource) return;

        const scene = tokenDocument.parent?.walls ? tokenDocument.parent : (canvas?.scene ?? tokenDocument.parent ?? null);
        let current = {
            x: toNumber(tokenDocument.x ?? token?.x, 0),
            y: toNumber(tokenDocument.y ?? token?.y, 0)
        };

        for (const movementAction of movementActions.reverse()) {
            const target = {
                x: Number(movementAction.movementOriginX),
                y: Number(movementAction.movementOriginY)
            };
            if (Math.abs(current.x - target.x) <= Number.EPSILON
                && Math.abs(current.y - target.y) <= Number.EPSILON) continue;

            const path = findGridMovementPath({ start: current, target, scene });
            await applyLocalPlanningTokenPath(tokenDocument, path);
            current = target;
        }
    }

    async #restorePlanningOrigins(perCombatant = {}) {
        const updates = [];
        for (const [combatantId, combatantState] of Object.entries(perCombatant ?? {})) {
            updates.push(this.#restoreCombatantPlanningOrigin(combatantId, combatantState?.plan));
        }
        await Promise.all(updates);
    }

    async #captureResolutionSnapshot(options = {}) {
        return this.#snapshotStore.capture(options);
    }

    async #applyResolutionSnapshot(snapshot = null) {
        return this.#snapshotStore.apply(snapshot);
    }


    async stepEncounterResolution(direction = 1) {
        this.#requireGm("step encounter resolution playback");
        return this.#resolutionEngine.stepResolution(direction);
    }

    /**
     * Run the full AP-tick resolution loop for the current round.
     * @returns {Promise<object[]>} The completed timeline.
     */
    async resolveEncounterRound({ tickDelayMs = 1000 } = {}) {
        this.#requireGm("resolve encounter rounds");
        this.#requireInitiativeReady();
        return this.#resolutionEngine.resolveRound({ tickDelayMs });
    }

    #resolveDeclaredTarget(sourceCombatantId, targetCombatantId) {
        if (targetCombatantId) {
            return this.#combat.combatants?.get(targetCombatantId) ?? null;
        }

        const candidates = (this.#combat.combatants?.contents ?? []).filter((combatant) => combatant.id !== sourceCombatantId);
        return candidates[0] ?? null;
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

    getCombatantDraftPlan(combatantId) {
        return this.encounter.getCombatantDraftPlan(combatantId);
    }

    getCombatantLockedThroughIndex(combatantId) {
        return this.encounter.getCombatantLockedThroughIndex(combatantId);
    }

    getCombatantSpentAp(combatantId) {
        return this.encounter.getCombatantSpentAp(combatantId);
    }

    getCombatantRemainingAp(combatantId) {
        return this.encounter.getCombatantRemainingAp(combatantId);
    }

    getCombatantDraftRemainingAp(combatantId) {
        return this.encounter.getCombatantDraftRemainingAp(combatantId);
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

    async lockCombatantActionRoll(combatantId, actionIndex, roll = {}) {
        return this.encounter.lockCombatantActionRoll(combatantId, actionIndex, roll);
    }

    async resetCombatantPlanningRolls(combatantId) {
        return this.encounter.resetCombatantPlanningRolls(combatantId);
    }

    async setCombatantActionApCost(combatantId, actionIndex, apCost) {
        return this.encounter.setCombatantActionApCost(combatantId, actionIndex, apCost);
    }

    async setCombatantDraftPlan(combatantId, draftPlan = {}) {
        return this.encounter.setCombatantDraftPlan(combatantId, draftPlan);
    }

    async confirmCombatantDraftPlan(combatantId) {
        return this.encounter.confirmCombatantDraftPlan(combatantId);
    }

    async clearCombatantDraftPlan(combatantId) {
        return this.encounter.clearCombatantDraftPlan(combatantId);
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
