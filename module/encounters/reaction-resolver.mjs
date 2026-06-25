// ---------------------------------------------------------------------------
// Pure utilities (local copies — no shared module dependency)
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function toOptionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clampActionCost(value) {
    const cost = Number(value);
    if (!Number.isFinite(cost)) return 1;
    return Math.max(1, Math.floor(cost));
}

// ---------------------------------------------------------------------------
// Pure helpers — no port access, no Foundry globals
// ---------------------------------------------------------------------------

/**
 * Resolve the effective range in feet for an action, mirroring the logic in
 * AttackResolver and combat.mjs so overwatch range checks are consistent.
 *
 * @param {object|null} action
 * @param {object|null} item  Foundry Item document or plain item-like object.
 * @returns {number}
 */
function resolveActionRangeFeet(action = null, item = null) {
    const rangeType = String(action?.rangeType ?? "melee").toLowerCase();
    const normal = Number(item?.system?.physical?.range?.normal ?? (rangeType === "melee" ? 5 : 30));
    const long = Number(item?.system?.physical?.range?.long ?? Math.max(normal, 60));
    if (rangeType === "long") return Math.max(5, long || normal || 60);
    if (rangeType === "normal") return Math.max(5, normal || 30);
    return 5;
}

/**
 * Normalise an action object from the actor's available-actions list into the
 * canonical shape expected by the rest of the resolution engine. Uses
 * `structuredClone` (Node 17+, all modern browsers) for the deep-clone step
 * rather than `foundry.utils.deepClone` so the resolver stays decoupled.
 *
 * @param {object} action
 * @param {number} [index]
 * @returns {object}
 */
function clampActionData(action, index = 0) {
    const apMin = clampActionCost(action.apMin ?? action.apCost ?? 1);
    const apMax = Math.max(apMin, clampActionCost(action.apMax ?? action.apCost ?? apMin));
    const apCost = Math.max(apMin, Math.min(apMax, clampActionCost(action.apCost ?? apMin)));
    const deepClone = typeof structuredClone === "function"
        ? structuredClone
        : (x) => JSON.parse(JSON.stringify(x));

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
        movementOriginX: toOptionalNumber(action.movementOriginX),
        movementOriginY: toOptionalNumber(action.movementOriginY),
        planningLocked: Boolean(action.planningLocked),
        planningRollResults: toArray(action.planningRollResults).map((r) => deepClone(r))
    };
}

// ---------------------------------------------------------------------------

/**
 * Manages reaction windows (overwatch and dodge) during encounter resolution.
 *
 * Reaction window queries (`findReactionAtTick`, `consumeReactionWindow`) are
 * called by {@link AttackResolver} for the embedded dodge window and by the
 * encounter resolution engine for overwatch. Overwatch itself is resolved via
 * `resolveOverwatch`.
 *
 * All combatant-collection and attack-resolution access is provided through
 * injected ports so this class is free of direct Foundry globals and is
 * deterministically testable.
 *
 * @example
 * ```js
 * const resolver = new ReactionResolver({
 *   getCombatants: () => combat.combatants.contents,
 *   getAvailableActionsForCombatant: (id) => encounter.getAvailableActionsForCombatant(id),
 *   isCombatantIncapacitated: (c, opts) => encounter.isCombatantIncapacitated(c, opts),
 *   distanceBetweenCombatantsFeet: (a, b, opts) => encounter.distanceBetweenCombatantsFeet(a, b, opts),
 *   resolveAttack: (combatant, action, opts) => attackResolver.resolveAttack({ combatant, action, ...opts })
 * });
 *
 * // During tick resolution after each movement:
 * const { entries, effects } = await resolver.resolveOverwatch({ mover, tick, ... });
 * ```
 */
export class ReactionResolver {
    /** @type {() => object[]} */
    #getCombatants;

    /** @type {(combatantId: string) => object[]} */
    #getAvailableActionsForCombatant;

    /** @type {(combatant: object, opts: { actorHealth?: object|null }) => boolean} */
    #isCombatantIncapacitated;

    /**
     * @type {(
     *   source: object,
     *   target: object,
     *   opts: { tokenPositions?: Record<string,{x:number,y:number}>|null }
     * ) => number}
     */
    #distanceBetweenCombatantsFeet;

    /** @type {(combatant: object, action: object, opts: object) => Promise<object>} */
    #resolveAttack;

    /**
     * @param {{
     *   getCombatants:                  () => object[],
     *   getAvailableActionsForCombatant: (combatantId: string) => object[],
     *   isCombatantIncapacitated:       (combatant: object, opts: { actorHealth?: object }) => boolean,
     *   distanceBetweenCombatantsFeet:  (source: object, target: object, opts: object) => number,
     *   resolveAttack:                  (combatant: object, action: object, opts: object) => Promise<object>
     * }} ports
     */
    constructor({
        getCombatants,
        getAvailableActionsForCombatant,
        isCombatantIncapacitated,
        distanceBetweenCombatantsFeet,
        resolveAttack
    }) {
        this.#getCombatants = getCombatants;
        this.#getAvailableActionsForCombatant = getAvailableActionsForCombatant;
        this.#isCombatantIncapacitated = isCombatantIncapacitated;
        this.#distanceBetweenCombatantsFeet = distanceBetweenCombatantsFeet;
        this.#resolveAttack = resolveAttack;
    }

    // -------------------------------------------------------------------------
    // Reaction-window queries (called by AttackResolver and resolveOverwatch)
    // -------------------------------------------------------------------------

    /**
     * Find the action window active at `tick` for `combatant` that matches
     * `triggerType`, if any.
     *
     * Returns the window object augmented with a `consumed` flag, or `null`
     * when no matching reaction is planned for this tick.
     *
     * @param {{
     *   combatant:       object|null,
     *   tick:            number,
     *   triggerType:     string,
     *   perCombatant:    object,
     *   reactionRuntime: object|null
     * }} options
     * @returns {{ action: object, actionIndex: number, startTick: number, endTick: number, consumed: boolean }|null}
     */
    findReactionAtTick({ combatant = null, tick = 0, triggerType = "", perCombatant = {}, reactionRuntime = null } = {}) {
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

    /**
     * Mark a reaction window as consumed so it cannot fire again this round.
     *
     * Returns `true` if the window was successfully consumed, `false` if it
     * was already consumed or if `reactionRuntime` is missing.
     *
     * @param {{
     *   combatantId:     string,
     *   actionIndex:     number,
     *   startTick:       number,
     *   reactionRuntime: object|null
     * }} options
     * @returns {boolean}
     */
    consumeReactionWindow({ combatantId = "", actionIndex = -1, startTick = 0, reactionRuntime = null } = {}) {
        const key = `${combatantId}:${actionIndex}:${startTick}`;
        if (!reactionRuntime?.consumedKeys) return false;
        if (reactionRuntime.consumedKeys.has(key)) return false;
        reactionRuntime.consumedKeys.add(key);
        return true;
    }

    // -------------------------------------------------------------------------
    // Overwatch resolution
    // -------------------------------------------------------------------------

    /**
     * Trigger overwatch reactions for all combatants that have an unconsumed
     * overwatch reaction window active at `tick` and that can see and reach
     * `mover` with an equipped weapon.
     *
     * Each overwatch attacker fires at the closest in-range hostile (not
     * necessarily the mover). The attack outcome is resolved via the injected
     * `resolveAttack` port with `applyEffects: false`; damage is collected as
     * a pending effect so the resolution engine can apply it simultaneously
     * with other round effects.
     *
     * @param {{
     *   mover:             object|null,
     *   tick:              number,
     *   perCombatant:      object,
     *   reactionRuntime:   object|null,
     *   orderedCombatants: object[],
     *   evaluationSnapshot: object|null,
     *   tokenPositions:    Record<string,{x:number,y:number}>|null
     * }} options
     * @returns {Promise<{ entries: object[], effects: object[] }>}
     */
    async resolveOverwatch({
        mover = null,
        tick = 0,
        perCombatant = {},
        reactionRuntime = null,
        orderedCombatants = [],
        evaluationSnapshot = null,
        tokenPositions = null
    } = {}) {
        if (!mover?.id) return { entries: [], effects: [] };

        const entries = [];
        const effects = [];

        for (const candidate of orderedCombatants) {
            if (!candidate?.id || candidate.id === mover.id) continue;
            if (this.#isCombatantIncapacitated(candidate, { actorHealth: evaluationSnapshot?.actorHealth })) continue;

            const reactionWindow = this.findReactionAtTick({
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
            const attackRangeFeet = resolveActionRangeFeet(attackAction, attackItem);
            if (!Number.isFinite(moverDistanceFeet) || moverDistanceFeet > attackRangeFeet) continue;

            const closestTarget = this.#findClosestHostileInRange({
                sourceCombatant: candidate,
                attackAction,
                actorHealth: evaluationSnapshot?.actorHealth,
                tokenPositions
            });
            if (!closestTarget?.candidate) continue;
            const targetCombatant = closestTarget.candidate;

            const consumed = this.consumeReactionWindow({
                combatantId: candidate.id,
                actionIndex: reactionWindow.actionIndex,
                startTick: reactionWindow.startTick,
                reactionRuntime
            });
            if (!consumed) continue;

            const outcome = await this.#resolveAttack(candidate, {
                ...attackAction,
                targetId: targetCombatant.id
            }, {
                tick,
                perCombatant,
                reactionRuntime,
                evaluationSnapshot,
                tokenPositions,
                applyEffects: false
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

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Return the action, its index in the plan, and its tick range for the
     * action that covers `tick` in `perCombatantState`.
     *
     * @param {object} perCombatantState
     * @param {number} tick
     * @returns {{ action: object, actionIndex: number, startTick: number, endTick: number }|null}
     */
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

    /**
     * Select the best equipped attack action for an overwatch attacker.
     * Prefers the lowest AP cost and, among equal costs, the highest to-hit
     * bonus. Excludes reaction actions and actions with no item reference.
     *
     * @param {string} combatantId
     * @returns {object|null}
     */
    #selectOverwatchAttackAction(combatantId) {
        const combatants = this.#getCombatants();
        const combatant = combatants.find((c) => c?.id === combatantId) ?? null;
        const equippedIds = this.#getEquippedItemIds(combatant?.actor);

        const attackActions = this.#getAvailableActionsForCombatant(combatantId)
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

    /**
     * Collect the item IDs of all weapons currently equipped by `actor`.
     *
     * @param {object|null} actor
     * @returns {Set<string>}
     */
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

    /**
     * Find the closest combatant (excluding `sourceCombatant`) that is alive
     * and within the weapon range of `attackAction`.
     *
     * @param {{
     *   sourceCombatant: object|null,
     *   attackAction:    object|null,
     *   actorHealth:     object|null,
     *   tokenPositions:  Record<string,{x:number,y:number}>|null
     * }} options
     * @returns {{ candidate: object, distanceFeet: number }|null}
     */
    #findClosestHostileInRange({ sourceCombatant = null, attackAction = null, actorHealth = null, tokenPositions = null } = {}) {
        if (!sourceCombatant?.id || !attackAction) return null;

        const item = attackAction.itemId ? sourceCombatant.actor?.items?.get?.(attackAction.itemId) : null;
        const rangeFeet = resolveActionRangeFeet(attackAction, item);

        const candidates = this.#getCombatants()
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
}
