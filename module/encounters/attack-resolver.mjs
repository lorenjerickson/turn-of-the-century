// ---------------------------------------------------------------------------
// Pure utilities (local copies — no shared module dependency)
// ---------------------------------------------------------------------------

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

// ---------------------------------------------------------------------------
// Pure helpers — no port access, no Foundry globals
// ---------------------------------------------------------------------------

/**
 * Resolve the effective range in feet for an action, taking rangeType into
 * account and falling back to item physical range data.
 *
 * @param {object|null} action
 * @param {object|null} item   Foundry Item document or plain item-like object.
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
 * Select the ability bonus that applies to this attack (Dex for ranged,
 * Str for melee).
 *
 * @param {object|null} actor
 * @param {object|null} item
 * @returns {number}
 */
function getAttackAbilityBonus(actor, item) {
    const classification = String(item?.system?.classification ?? "");
    const dexClassifications = new Set(["simpleRanged", "martialRanged", "firearm", "explosive", "thrown"]);
    const abilityKey = dexClassifications.has(classification) ? "dex" : "str";
    return toNumber(actor?.system?.abilities?.[abilityKey]?.bonus, 0);
}

// ---------------------------------------------------------------------------

/**
 * Resolves the outcome of an attack action during encounter resolution.
 *
 * Handles target validation, range checking, the to-hit roll, the embedded
 * dodge-reaction window, damage rolling, and critical outcomes. All dice and
 * Foundry document side-effects are provided through injected ports so the
 * resolver is deterministically testable.
 *
 * The `applyEffects` flag controls whether damage is written to the actor
 * immediately (legacy direct-apply path) or deferred via `pendingDamage`
 * in the returned outcome (the normal simultaneous-resolution path).
 *
 * @example
 * ```js
 * const resolver = new AttackResolver({
 *   resolveDeclaredTarget: (sourceId, targetId) => combat.combatants.get(targetId),
 *   isCombatantIncapacitated: (c, { actorHealth }) => actorHealth[c.actor.id] <= 0,
 *   resolveTokenDocument: (c) => getCombatantToken(c),
 *   selectCriticalFailureTarget: (sourceId, intendedId) => pickFumbleTarget(sourceId, intendedId),
 *   findReactionAtTick: (opts) => findReaction(opts),
 *   consumeReactionWindow: (opts) => consumeReaction(opts),
 *   roll: async (formula, data) => new Roll(formula, data).roll({ async: true }),
 *   applyDamage: async (combatant, amount) => applyDamageToCombatant(combatant, amount),
 *   localize: (key) => game.i18n.localize(key),
 *   getScene: () => canvas?.scene ?? null
 * });
 *
 * const outcome = await resolver.resolveAttack({ combatant, action, tick, ... });
 * ```
 */
export class AttackResolver {
    /** @type {(sourceId: string, targetId: string) => object|null} */
    #resolveDeclaredTarget;

    /** @type {(combatant: object, opts: { actorHealth?: object }) => boolean} */
    #isCombatantIncapacitated;

    /** @type {(combatant: object) => object|null} */
    #resolveTokenDocument;

    /** @type {(sourceId: string, intendedTargetId: string) => object|null} */
    #selectCriticalFailureTarget;

    /** @type {(opts: object) => object|null} */
    #findReactionAtTick;

    /** @type {(opts: object) => boolean} */
    #consumeReactionWindow;

    /** @type {async (formula: string, data?: object) => { total: number }} */
    #roll;

    /** @type {async (combatant: object, amount: number) => void} */
    #applyDamage;

    /** @type {(key: string) => string} */
    #localize;

    /** @type {() => object|null} */
    #getScene;

    /**
     * @param {{
     *   resolveDeclaredTarget:       (sourceId: string, targetId: string) => object|null,
     *   isCombatantIncapacitated:    (combatant: object, opts: { actorHealth?: object }) => boolean,
     *   resolveTokenDocument:        (combatant: object) => object|null,
     *   selectCriticalFailureTarget: (sourceId: string, intendedTargetId: string) => object|null,
     *   findReactionAtTick:          (opts: object) => object|null,
     *   consumeReactionWindow:       (opts: object) => boolean,
     *   roll:                        (formula: string, data?: object) => Promise<{ total: number }>,
     *   applyDamage:                 (combatant: object, amount: number) => Promise<void>,
     *   localize:                    (key: string) => string,
     *   getScene:                    () => object|null
     * }} ports
     */
    constructor({
        resolveDeclaredTarget,
        isCombatantIncapacitated,
        resolveTokenDocument,
        selectCriticalFailureTarget,
        findReactionAtTick,
        consumeReactionWindow,
        roll,
        applyDamage,
        localize,
        getScene
    }) {
        this.#resolveDeclaredTarget = resolveDeclaredTarget;
        this.#isCombatantIncapacitated = isCombatantIncapacitated;
        this.#resolveTokenDocument = resolveTokenDocument;
        this.#selectCriticalFailureTarget = selectCriticalFailureTarget;
        this.#findReactionAtTick = findReactionAtTick;
        this.#consumeReactionWindow = consumeReactionWindow;
        this.#roll = roll;
        this.#applyDamage = applyDamage;
        this.#localize = localize;
        this.#getScene = getScene;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Resolve an attack or to-hit action for a combatant.
     *
     * @param {{
     *   combatant:          object,
     *   action:             object,
     *   tick:               number,
     *   perCombatant:       object,
     *   reactionRuntime:    object|null,
     *   evaluationSnapshot: object|null,
     *   tokenPositions:     object|null,
     *   applyEffects:       boolean
     * }} options
     *
     * @returns {Promise<object>} Outcome object with `result`, `detail`, and
     *   optional `pendingDamage`, `roll`, `total`, `targetCombatantId`, etc.
     */
    async resolveAttack({
        combatant,
        action,
        tick = 0,
        perCombatant = {},
        reactionRuntime = null,
        evaluationSnapshot = null,
        tokenPositions = null,
        applyEffects = true
    } = {}) {
        const unspecifiedTarget = this.#localize("TOTC.Encounter.TargetUnspecified");

        // ---- Target guards --------------------------------------------------

        if ((action.requiresToHit || action.requiresTarget) && !action.targetId) {
            return {
                result: "failed",
                targetCombatantId: null,
                targetName: unspecifiedTarget,
                detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
            };
        }

        const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
        if ((action.requiresToHit || action.requiresTarget) && !targetCombatant) {
            return {
                result: "failed",
                targetCombatantId: null,
                targetName: unspecifiedTarget,
                detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
            };
        }

        if (targetCombatant && this.#isCombatantIncapacitated(targetCombatant, {
            actorHealth: evaluationSnapshot?.actorHealth
        })) {
            return {
                result: "interrupted",
                detail: `${combatant.name} aborts ${action.label}; ${targetCombatant.name} is already incapacitated.`
            };
        }

        // ---- Range check ----------------------------------------------------

        const actor = combatant.actor;
        const item = action.itemId ? actor?.items?.get?.(action.itemId) : null;
        const rangeFeet = resolveActionRangeFeet(action, item);
        const distanceFeet = this.#distanceBetweenCombatantsFeet(combatant, targetCombatant, {
            tokenPositions: tokenPositions ?? evaluationSnapshot?.tokenPositions
        });

        if (Number.isFinite(distanceFeet) && distanceFeet > rangeFeet) {
            return {
                result: "outOfRange",
                targetCombatantId: targetCombatant?.id ?? null,
                targetName: targetCombatant?.name ?? unspecifiedTarget,
                detail: `${combatant.name} cannot complete ${action.label}; target is out of range (${Math.round(distanceFeet)} ft > ${rangeFeet} ft).`
            };
        }

        // ---- To-hit roll ----------------------------------------------------

        const weaponData = item?.system ?? {};
        const attackAbilityBonus = getAttackAbilityBonus(actor, item);
        const toHitFlatBonus = Number(action.toHitBonus || 0);

        const toHitRoll = await this.#roll("1d20");
        const natural = Number(toHitRoll?.total ?? 0);
        const toHitTotal = natural + attackAbilityBonus + toHitFlatBonus;

        const targetForFumble = this.#selectCriticalFailureTarget(combatant.id, action.targetId);
        const targetArmorClass = toNumber(targetCombatant?.actor?.system?.defenses?.armorClass, 10);
        const hits = natural === 20 || (natural !== 1 && toHitTotal >= targetArmorClass);

        // ---- Dodge reaction window ------------------------------------------

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
                const dodgeRoll = await this.#roll("1d20");
                const dodgeTotal = toNumber(dodgeRoll?.total, 0) + dodgeBonus;
                if (natural !== 20 && dodgeTotal >= toHitTotal) {
                    return {
                        result: "reacted",
                        roll: natural,
                        total: toHitTotal,
                        reactionRoll: toNumber(dodgeRoll?.total, 0),
                        reactionTotal: dodgeTotal,
                        reactionType: incomingReaction.action?.reactionTriggerType ?? "incomingAttack",
                        targetCombatantId: targetCombatant?.id ?? null,
                        targetName: targetCombatant?.name ?? unspecifiedTarget,
                        detail: `${targetCombatant?.name ?? "The target"} reacts with ${incomingReaction.action?.label ?? "Dodge"} and avoids ${combatant.name}'s ${action.label}.`
                    };
                }
            }
        }

        // ---- Damage roll ----------------------------------------------------

        const damageRoll = await this.#rollDamage({ actor, item, action, weaponData });
        const baseDamage = Math.max(0, toNumber(damageRoll?.total, 0));

        // ---- Critical hit (natural 20) --------------------------------------

        if (natural === 20) {
            const appliedDamage = baseDamage * 2;
            if (applyEffects) {
                await this.#applyDamage(targetCombatant, appliedDamage);
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
                targetName: targetCombatant?.name ?? unspecifiedTarget,
                detail: `${combatant.name} critically hits ${targetCombatant?.name ?? "the target"} with ${action.label} for ${formatDamage(appliedDamage)}.`
            };
        }

        // ---- Critical failure (natural 1) -----------------------------------

        if (natural === 1) {
            const appliedDamage = baseDamage * 2;
            if (applyEffects) {
                await this.#applyDamage(targetForFumble, appliedDamage);
            }
            return {
                result: "criticalFailure",
                roll: natural,
                total: toHitTotal,
                damageMultiplier: 2,
                damage: appliedDamage,
                pendingDamage: {
                    targetCombatantId: targetForFumble?.id ?? null,
                    amount: appliedDamage
                },
                redirectedTargetId: targetForFumble?.id ?? null,
                redirectedTargetName: targetForFumble?.name ?? null,
                detail: `${combatant.name} critically fumbles ${action.label}, dealing ${formatDamage(appliedDamage)} to ${targetForFumble?.name ?? "an unintended target"}.`
            };
        }

        // ---- Hit or miss ----------------------------------------------------

        if (hits && applyEffects) {
            await this.#applyDamage(targetCombatant, baseDamage);
        }

        return {
            result: hits ? "hit" : "miss",
            roll: natural,
            total: toHitTotal,
            targetArmorClass,
            damage: hits ? baseDamage : 0,
            pendingDamage: hits
                ? { targetCombatantId: targetCombatant?.id ?? null, amount: baseDamage }
                : null,
            targetCombatantId: targetCombatant?.id ?? null,
            targetName: targetCombatant?.name ?? unspecifiedTarget,
            detail: hits
                ? `${combatant.name} hits ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}) for ${formatDamage(baseDamage)}.`
                : `${combatant.name} misses ${targetCombatant?.name ?? "the target"} with ${action.label} (AC ${targetArmorClass}, total ${toHitTotal}).`
        };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Roll the damage formula for an action, substituting actor and item roll
     * data and applying any flat bonus declared on the weapon.
     */
    async #rollDamage({ actor, item, action, weaponData }) {
        const formula = String(weaponData?.damage?.formula || "1").trim() || "1";
        const bonus = toNumber(weaponData?.damage?.bonus, 0);
        const compiled = bonus ? `${formula} + ${bonus}` : formula;
        const rollData = {
            actor: actor?.getRollData?.() ?? actor?.system ?? {},
            item: item?.getRollData?.() ?? item?.system ?? {},
            action
        };
        return this.#roll(compiled, rollData);
    }

    /**
     * Compute the straight-line distance in feet between two combatants,
     * optionally using `tokenPositions` overrides instead of live token coords.
     * Returns `Number.POSITIVE_INFINITY` when either token cannot be resolved.
     */
    #distanceBetweenCombatantsFeet(sourceCombatant, targetCombatant, { tokenPositions = null } = {}) {
        const sourceToken = this.#resolveTokenDocument(sourceCombatant);
        const targetToken = this.#resolveTokenDocument(targetCombatant);
        if (!sourceToken || !targetToken) return Number.POSITIVE_INFINITY;

        const scene = this.#getScene();
        const gridSize = Number(
            sourceToken?.parent?.grid?.size
            ?? targetToken?.parent?.grid?.size
            ?? scene?.grid?.size
            ?? 100
        ) || 100;
        const gridDistance = Number(
            sourceToken?.parent?.grid?.distance
            ?? targetToken?.parent?.grid?.distance
            ?? scene?.grid?.distance
            ?? 5
        ) || 5;

        const sourceTokenId = String(sourceToken.id ?? sourceToken._id ?? "").trim();
        const targetTokenId = String(targetToken.id ?? targetToken._id ?? "").trim();
        const sourcePos = sourceTokenId ? tokenPositions?.[sourceTokenId] : null;
        const targetPos = targetTokenId ? tokenPositions?.[targetTokenId] : null;

        const sourceX = toNumber(sourcePos?.x, toNumber(sourceToken.x, 0))
            + ((toNumber(sourceToken.width, 1) * gridSize) / 2);
        const sourceY = toNumber(sourcePos?.y, toNumber(sourceToken.y, 0))
            + ((toNumber(sourceToken.height, 1) * gridSize) / 2);
        const targetX = toNumber(targetPos?.x, toNumber(targetToken.x, 0))
            + ((toNumber(targetToken.width, 1) * gridSize) / 2);
        const targetY = toNumber(targetPos?.y, toNumber(targetToken.y, 0))
            + ((toNumber(targetToken.height, 1) * gridSize) / 2);

        const pixelDistance = Math.hypot(targetX - sourceX, targetY - sourceY);
        return (pixelDistance / gridSize) * gridDistance;
    }
}

// ---------------------------------------------------------------------------
// Module-level formatting helper (matches formatDamageText in combat.mjs)
// ---------------------------------------------------------------------------

function formatDamage(amount) {
    return `${Math.max(0, Number(amount) || 0)} damage`;
}
