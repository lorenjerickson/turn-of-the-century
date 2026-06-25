// ---------------------------------------------------------------------------
// Pure utilities (local copies — no shared module dependency)
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve the effective range in feet for a given action + item pair.
 * Local copy — avoids importing from combat.mjs.
 *
 * @param {object|null} action
 * @param {object|null} item  — Foundry Item document (only system.physical.range is accessed)
 * @returns {number}
 */
function resolveActionRangeFeet(action, item) {
    const rangeType = String(action?.rangeType ?? "melee").toLowerCase();
    const normal = Number(item?.system?.physical?.range?.normal ?? (rangeType === "melee" ? 5 : 30));
    const long = Number(item?.system?.physical?.range?.long ?? Math.max(normal, 60));
    if (rangeType === "long") return Math.max(5, long || normal || 60);
    if (rangeType === "normal") return Math.max(5, normal || 30);
    return 5;
}

/**
 * Derive the set of completion-boundary checks that apply to an action.
 * Pure — no I/O.
 *
 * @param {object|null} action
 * @param {object|null} outcome
 * @returns {{ sourceMustBeAlive: boolean, sourceMustNotBeProne: boolean, targetMustBeAlive: boolean, targetMustBeInRange: boolean }}
 */
function getCompletionBoundaryRequirements(action, outcome) {
    if (!action || !outcome) return {};
    return {
        sourceMustBeAlive: action?.type === "consumable",
        sourceMustNotBeProne: action?.type === "consumable" || action?.interruptible === false,
        targetMustBeAlive: action?.type === "consumable" && action.type !== "attack",
        targetMustBeInRange: Boolean(action?.requiresToHit)
    };
}

// ---------------------------------------------------------------------------

/**
 * Applies consumable-item effects and simultaneous damage produced during a
 * single AP tick, and validates that each timeline action still satisfies its
 * completion-boundary requirements after reconciliation.
 *
 * All Foundry-specific I/O (combatant lookup, actor health updates, item
 * action execution, distance calculation) is injected as ports so the class
 * can be exercised in pure Node.js tests without a Foundry runtime.
 *
 * **Extracted from `TurnOfTheCenturyEncounter` in combat.mjs.**
 * The methods that remain here were originally the private methods
 * `#buildTickReconcilePlan`, `#buildSimultaneousDamageEntriesFromTimeline`,
 * `#markTimelineEntryInterrupted`, `#getCompletionBoundaryRequirements`,
 * `#validateCompletionBoundary`, `#applyConsumeActionEffect`, and
 * `#applySimultaneousDamageEntries`.
 *
 * @example
 * ```js
 * const resolver = new ConsumptionResolver({
 *   resolveCombatant:           (id) => combat.combatants.get(id) ?? null,
 *   applyItemAction:            async ({ item, actor, actionId, consume }) =>
 *                                   item.executeEncounterAction?.({ actor, actionId, consume }),
 *   updateActorHealth:          async (actor, nextHealth) =>
 *                                   actor.update({ "system.resources.health.value": nextHealth }),
 *   distanceBetweenCombatantsFeet: (src, tgt, opts) =>
 *                                   encounter.distanceBetweenCombatantsFeet(src, tgt, opts)
 * });
 * ```
 */
export class ConsumptionResolver {
    /** @type {(combatantId: string) => object|null} */
    #resolveCombatant;

    /** @type {(params: { item: object, actor: object, actionId: string, consume: boolean }) => Promise<void>} */
    #applyItemAction;

    /** @type {(actor: object, nextHealth: number) => Promise<void>} */
    #updateActorHealth;

    /** @type {(source: object|null, target: object|null, opts?: { tokenPositions?: object|null }) => number} */
    #distanceBetweenCombatantsFeet;

    /**
     * @param {{
     *   resolveCombatant:              (combatantId: string) => object|null,
     *   applyItemAction:               (params: object) => Promise<void>,
     *   updateActorHealth:             (actor: object, nextHealth: number) => Promise<void>,
     *   distanceBetweenCombatantsFeet: (source: object|null, target: object|null, opts?: object) => number
     * }} ports
     */
    constructor({ resolveCombatant, applyItemAction, updateActorHealth, distanceBetweenCombatantsFeet }) {
        this.#resolveCombatant = resolveCombatant;
        this.#applyItemAction = applyItemAction;
        this.#updateActorHealth = updateActorHealth;
        this.#distanceBetweenCombatantsFeet = distanceBetweenCombatantsFeet;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Partition an array of tick effects into consume, movement, and damage
     * buckets. When multiple combatants emit a movement effect for the same
     * token, the effect from the combatant with the highest initiative wins.
     *
     * Pure — no side effects, no I/O.
     *
     * @param {{
     *   tickEffects:        object[],
     *   orderedCombatants:  object[]
     * }} options
     * @returns {{
     *   consumeEffects:  object[],
     *   movementEffects: object[],
     *   damageEntries:   object[]
     * }}
     */
    buildTickReconcilePlan({ tickEffects = [], orderedCombatants = [] } = {}) {
        const initiativeByCombatantId = new Map(
            toArray(orderedCombatants).map((c) => [c?.id, toNumber(c?.initiative, 0)])
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
                entry.contributors.push({ sourceCombatantId, amount, priority });
                damageByTarget.set(targetCombatantId, entry);
            }
        }

        return {
            consumeEffects,
            movementEffects: [...movementByToken.values()].map((e) => e.effect),
            damageEntries: [...damageByTarget.values()]
        };
    }

    /**
     * Collect pending damage from timeline entries for `tick`, skipping any
     * entry whose outcome is `"interrupted"`. Accumulates multiple hits to the
     * same target into a single entry.
     *
     * Pure — no side effects, no I/O.
     *
     * @param {{ timeline: object[], tick: number }} options
     * @returns {object[]} Array of `{ targetCombatantId, totalAmount, contributors }` entries.
     */
    buildSimultaneousDamageEntriesFromTimeline({ timeline = [], tick = 0 } = {}) {
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

    /**
     * Mutate `timeline[timelineIndex]` in place, replacing its outcome with an
     * `"interrupted"` result and a human-readable detail string. No-ops when
     * `timelineIndex` is out of bounds.
     *
     * @param {{
     *   timeline:      object[],
     *   timelineIndex: number,
     *   combatantName: string,
     *   actionLabel:   string,
     *   reason:        string
     * }} options
     */
    markTimelineEntryInterrupted({ timeline = [], timelineIndex = -1, combatantName = "Combatant", actionLabel = "the action", reason = "" } = {}) {
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

    /**
     * Validate whether a timeline entry's action can still complete, given the
     * projected game state and the set of combatants currently prone.
     *
     * Returns `{ valid: true }` when all boundary conditions are satisfied.
     * Returns `{ valid: false, violations: string[] }` listing each failure.
     *
     * @param {{
     *   timelineEntry:     object|null,
     *   projectedState:    object|null,
     *   proneCombatantIds: Set<string>
     * }} options
     * @returns {{ valid: boolean, violations?: string[] }}
     */
    validateCompletionBoundary({ timelineEntry = null, projectedState = null, proneCombatantIds = new Set() } = {}) {
        if (!timelineEntry?.outcome) return { valid: true };

        const outcome = timelineEntry.outcome;
        const action = timelineEntry.action;
        const sourceCombatantId = String(timelineEntry?.combatantId ?? "").trim();
        const targetCombatantId = String(outcome?.targetCombatantId ?? "").trim();

        if (!action) return { valid: true };

        const requirements = getCompletionBoundaryRequirements(action, outcome);
        const violations = [];

        const sourceCombatant = this.#resolveCombatant(sourceCombatantId);
        const sourceActor = sourceCombatant?.actor ?? null;
        const sourceActorId = String(sourceActor?.id ?? "").trim();

        if (requirements.sourceMustBeAlive && sourceActorId) {
            const sourceHealth = toNumber(projectedState?.actorHealth?.[sourceActorId], 0);
            if (sourceHealth <= 0) violations.push("source is incapacitated");
        }

        if (requirements.sourceMustNotBeProne && sourceCombatantId) {
            if (proneCombatantIds.has(sourceCombatantId)) violations.push("source is knocked prone");
        }

        if (requirements.targetMustBeAlive && targetCombatantId) {
            const targetCombatant = this.#resolveCombatant(targetCombatantId);
            const targetActor = targetCombatant?.actor ?? null;
            const targetActorId = String(targetActor?.id ?? "").trim();
            if (targetActorId) {
                const targetHealth = toNumber(projectedState?.actorHealth?.[targetActorId], 0);
                if (targetHealth <= 0) violations.push("target is incapacitated");
            }
        }

        if (requirements.targetMustBeInRange && targetCombatantId && action.requiresToHit) {
            const sourceComb = this.#resolveCombatant(sourceCombatantId);
            const targetComb = this.#resolveCombatant(targetCombatantId);
            const item = action.itemId ? sourceActor?.items?.get?.(action.itemId) : null;
            const rangeFeet = resolveActionRangeFeet(action, item);
            const distanceFeet = this.#distanceBetweenCombatantsFeet(sourceComb, targetComb, {
                tokenPositions: projectedState?.tokenPositions
            });
            if (Number.isFinite(distanceFeet) && distanceFeet > rangeFeet) {
                violations.push(`target moved out of range (${Math.round(distanceFeet)} ft > ${rangeFeet} ft)`);
            }
        }

        return violations.length > 0 ? { valid: false, violations } : { valid: true };
    }

    /**
     * Execute the consumable item action referenced by `effect`, marking the
     * item as consumed in the Foundry document layer.
     *
     * No-ops when any required identifier is missing or when the combatant /
     * actor / item cannot be resolved.
     *
     * @param {object|null} effect
     *   Expected shape: `{ combatantId, itemId, actionId, ... }`
     * @returns {Promise<void>}
     */
    async applyConsumeActionEffect(effect = null) {
        if (!effect || typeof effect !== "object") return;

        const combatantId = String(effect.combatantId ?? "").trim();
        const itemId = String(effect.itemId ?? "").trim();
        const actionId = String(effect.actionId ?? "").trim();
        if (!combatantId || !itemId || !actionId) return;

        const combatant = this.#resolveCombatant(combatantId);
        const actor = combatant?.actor ?? null;
        const item = actor?.items?.get?.(itemId) ?? null;
        if (!actor || !item) return;

        await this.#applyItemAction({ item, actor, actionId, consume: true });
    }

    /**
     * Apply all accumulated damage entries simultaneously, using the evaluation
     * snapshot's health values as the baseline so that concurrent hits draw
     * from the same starting health.
     *
     * Falls back to the actor's live health value when the evaluation snapshot
     * does not contain a record for that actor.
     *
     * @param {{
     *   damageEntries:      object[],
     *   evaluationSnapshot: object|null
     * }} options
     * @returns {Promise<void>}
     */
    async applySimultaneousDamageEntries({ damageEntries = [], evaluationSnapshot = null } = {}) {
        for (const entry of toArray(damageEntries)) {
            const targetCombatantId = String(entry?.targetCombatantId ?? "").trim();
            if (!targetCombatantId) continue;

            const combatant = this.#resolveCombatant(targetCombatantId);
            const actor = combatant?.actor ?? null;
            const actorId = String(actor?.id ?? "").trim();
            if (!actor || !actorId) continue;

            const baseHealth = Number.isFinite(evaluationSnapshot?.actorHealth?.[actorId])
                ? toNumber(evaluationSnapshot.actorHealth[actorId], 0)
                : toNumber(actor.system?.resources?.health?.value, 0);
            const nextHealth = Math.max(0, baseHealth - Math.max(0, toNumber(entry?.totalAmount, 0)));
            await this.#updateActorHealth(actor, nextHealth);
        }
    }
}
