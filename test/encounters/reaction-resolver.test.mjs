import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ReactionResolver } from "../../module/encounters/reaction-resolver.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(id, { health = 10, token = null, actor = null, name = null } = {}) {
    const defaultActor = {
        system: {
            resources: { health: { value: health } },
            abilities: { str: { bonus: 2 }, dex: { bonus: 1 } },
            inventory: { equipment: {} }
        },
        items: { get: (_id) => null }
    };
    return {
        id,
        name: name ?? `Combatant ${id}`,
        token: token ?? { id: `t${id}`, _id: `t${id}`, x: 0, y: 0 },
        actor: actor ?? defaultActor
    };
}

function makeReactionAction(overrides = {}) {
    return {
        isReaction: true,
        reactionTriggerType: "overwatch",
        apCost: 1,
        type: "attack",
        label: "Overwatch Shot",
        ...overrides
    };
}

function makeAttackAction(overrides = {}) {
    return {
        type: "attack",
        id: "shoot",
        actionId: "shoot",
        isReaction: false,
        apCost: 1,
        toHitBonus: 2,
        itemId: "weapon1",
        rangeType: "normal",
        label: "Shoot",
        ...overrides
    };
}

/**
 * Build a ReactionResolver with controllable ports.
 *
 * @param {{
 *   combatants?:              object[],
 *   availableActions?:        Record<string, object[]>,
 *   incapacitated?:           Set<string>,
 *   distances?:               Record<string, number>,
 *   resolveAttackOutcome?:    object
 * }} opts
 */
function makeResolver({
    combatants = [],
    availableActions = {},
    incapacitated = new Set(),
    distances = {},
    resolveAttackOutcome = null
} = {}) {
    const attackLog = [];

    const resolver = new ReactionResolver({
        getCombatants: () => combatants,
        getAvailableActionsForCombatant: (id) => availableActions[id] ?? [],
        isCombatantIncapacitated: (combatant, { actorHealth } = {}) => incapacitated.has(combatant?.id),
        distanceBetweenCombatantsFeet: (source, target, _opts) => {
            const key = `${source?.id}:${target?.id}`;
            return distances[key] ?? distances[`${target?.id}:${source?.id}`] ?? Number.POSITIVE_INFINITY;
        },
        resolveAttack: async (combatant, action, opts) => {
            attackLog.push({ combatant, action, opts });
            return resolveAttackOutcome ?? {
                result: "hit",
                damage: 5,
                pendingDamage: { targetCombatantId: action.targetId, amount: 5 },
                detail: "hits."
            };
        }
    });

    return { resolver, attackLog };
}

// ---------------------------------------------------------------------------
// findReactionAtTick — guard paths
// ---------------------------------------------------------------------------

describe("ReactionResolver.findReactionAtTick — guards", () => {
    it("returns null when combatant is null", () => {
        const { resolver } = makeResolver();
        const result = resolver.findReactionAtTick({ combatant: null, tick: 1, triggerType: "overwatch", perCombatant: {}, reactionRuntime: null });
        assert.equal(result, null);
    });

    it("returns null when combatant has no id", () => {
        const { resolver } = makeResolver();
        const result = resolver.findReactionAtTick({ combatant: {}, tick: 1, triggerType: "overwatch", perCombatant: {}, reactionRuntime: null });
        assert.equal(result, null);
    });

    it("returns null when combatant has no entry in perCombatant", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant: {}, reactionRuntime: null });
        assert.equal(result, null);
    });

    it("returns null when no plan action covers the tick", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const perCombatant = { c1: { plan: [{ apCost: 1, isReaction: true, reactionTriggerType: "overwatch" }] } };
        // Plan covers tick 1 only; asking for tick 3 should return null.
        const result = resolver.findReactionAtTick({ combatant, tick: 3, triggerType: "overwatch", perCombatant, reactionRuntime: null });
        assert.equal(result, null);
    });

    it("returns null when the action at tick is not a reaction", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const perCombatant = { c1: { plan: [{ apCost: 1, isReaction: false, reactionTriggerType: "overwatch" }] } };
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant, reactionRuntime: null });
        assert.equal(result, null);
    });

    it("returns null when trigger type does not match", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const perCombatant = { c1: { plan: [{ apCost: 1, isReaction: true, reactionTriggerType: "incomingAttack" }] } };
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant, reactionRuntime: null });
        assert.equal(result, null);
    });
});

// ---------------------------------------------------------------------------
// findReactionAtTick — success paths
// ---------------------------------------------------------------------------

describe("ReactionResolver.findReactionAtTick — success", () => {
    it("returns the window for a matching reaction at tick 1", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const action = makeReactionAction({ apCost: 2, reactionTriggerType: "overwatch" });
        const perCombatant = { c1: { plan: [action] } };
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant, reactionRuntime: null });
        assert.ok(result !== null);
        assert.equal(result.action, action);
        assert.equal(result.actionIndex, 0);
        assert.equal(result.startTick, 1);
        assert.equal(result.endTick, 2);
    });

    it("returns consumed: false when the key is not in reactionRuntime", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c1: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant, reactionRuntime });
        assert.equal(result.consumed, false);
    });

    it("returns consumed: true when the key is already in reactionRuntime", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c1: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set(["c1:0:1"]) };
        const result = resolver.findReactionAtTick({ combatant, tick: 1, triggerType: "overwatch", perCombatant, reactionRuntime });
        assert.equal(result.consumed, true);
    });

    it("finds a multi-AP reaction window whose second tick is queried", () => {
        const { resolver } = makeResolver();
        const combatant = makeCombatant("c1");
        // First action: 1 AP (covers tick 1). Second action: 2 AP overwatch (covers ticks 2-3).
        const perCombatant = {
            c1: {
                plan: [
                    { apCost: 1, isReaction: false },
                    makeReactionAction({ apCost: 2 })
                ]
            }
        };
        const result = resolver.findReactionAtTick({ combatant, tick: 3, triggerType: "overwatch", perCombatant, reactionRuntime: null });
        assert.ok(result !== null, "expected a window at tick 3");
        assert.equal(result.actionIndex, 1);
        assert.equal(result.startTick, 2);
        assert.equal(result.endTick, 3);
    });
});

// ---------------------------------------------------------------------------
// consumeReactionWindow
// ---------------------------------------------------------------------------

describe("ReactionResolver.consumeReactionWindow", () => {
    it("returns false when reactionRuntime is null", () => {
        const { resolver } = makeResolver();
        const result = resolver.consumeReactionWindow({ combatantId: "c1", actionIndex: 0, startTick: 1, reactionRuntime: null });
        assert.equal(result, false);
    });

    it("returns false when reactionRuntime has no consumedKeys", () => {
        const { resolver } = makeResolver();
        const result = resolver.consumeReactionWindow({ combatantId: "c1", actionIndex: 0, startTick: 1, reactionRuntime: {} });
        assert.equal(result, false);
    });

    it("adds the key and returns true on first call", () => {
        const { resolver } = makeResolver();
        const reactionRuntime = { consumedKeys: new Set() };
        const result = resolver.consumeReactionWindow({ combatantId: "c1", actionIndex: 0, startTick: 1, reactionRuntime });
        assert.equal(result, true);
        assert.ok(reactionRuntime.consumedKeys.has("c1:0:1"));
    });

    it("returns false on a second call with the same key (idempotent)", () => {
        const { resolver } = makeResolver();
        const reactionRuntime = { consumedKeys: new Set() };
        resolver.consumeReactionWindow({ combatantId: "c1", actionIndex: 0, startTick: 1, reactionRuntime });
        const second = resolver.consumeReactionWindow({ combatantId: "c1", actionIndex: 0, startTick: 1, reactionRuntime });
        assert.equal(second, false);
        assert.equal(reactionRuntime.consumedKeys.size, 1);
    });
});

// ---------------------------------------------------------------------------
// resolveOverwatch — guards and skips
// ---------------------------------------------------------------------------

describe("ReactionResolver.resolveOverwatch — guards", () => {
    it("returns empty when mover has no id", async () => {
        const { resolver } = makeResolver();
        const result = await resolver.resolveOverwatch({ mover: null });
        assert.deepEqual(result, { entries: [], effects: [] });
    });

    it("returns empty when mover has an empty id", async () => {
        const { resolver } = makeResolver();
        const result = await resolver.resolveOverwatch({ mover: { id: "" } });
        assert.deepEqual(result, { entries: [], effects: [] });
    });

    it("skips the mover itself in the candidate list", async () => {
        const mover = makeCombatant("c1");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c1: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover],
            availableActions: { c1: [makeAttackAction({ itemId: "w1" })] }
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [mover]
        });

        assert.equal(attackLog.length, 0, "mover should not attack itself");
    });

    it("skips incapacitated candidates", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c2: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            incapacitated: new Set(["c2"])
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [mover, watcher]
        });

        assert.equal(attackLog.length, 0, "incapacitated combatant should not fire");
    });

    it("skips candidates without an overwatch reaction at this tick", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        // Watcher's plan has a non-reaction action at tick 1.
        const perCombatant = { c2: { plan: [{ apCost: 1, type: "attack", isReaction: false }] } };
        const reactionRuntime = { consumedKeys: new Set() };

        const { resolver, attackLog } = makeResolver({ combatants: [mover, watcher] });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 0, "non-reaction action should not trigger overwatch");
    });

    it("skips candidates whose reaction window is already consumed", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c2: { plan: [action] } };
        // Pre-consume the key.
        const reactionRuntime = { consumedKeys: new Set(["c2:0:1"]) };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [makeAttackAction({ itemId: "w1" })] },
            distances: { "c2:c1": 10 }
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 0, "consumed reaction should not fire again");
    });

    it("skips candidates with no eligible equipped attack action", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c2: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };

        // No available attack actions for watcher.
        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [] },
            distances: { "c2:c1": 10 }
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 0, "no equipped weapon means no overwatch attack");
    });

    it("skips when the mover is beyond the watcher's weapon range", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c2: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };

        // Attack action has rangeType "normal" → 30ft; mover is 100ft away.
        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [makeAttackAction({ itemId: "w1", rangeType: "normal" })] },
            distances: { "c2:c1": 100 }
        });

        // Watcher has weapon equipped.
        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 0, "mover out of range should not be shot");
    });

    it("skips when no hostile is within the watcher's weapon range", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");
        const action = makeReactionAction({ apCost: 1 });
        const perCombatant = { c2: { plan: [action] } };
        const reactionRuntime = { consumedKeys: new Set() };

        // Mover is in range, but distances for the closest-hostile search return Infinity for all.
        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [makeAttackAction({ itemId: "w1", rangeType: "normal" })] },
            // Mover is in range of watcher's overwatch check, but all combatants are out of
            // range for the closest-hostile scan (they use the same distance map, but
            // findClosestHostileInRange uses rangeType "normal" = 30ft).
            distances: { "c2:c1": 100 }  // both distance checks → 100ft > 30ft
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 0, "no hostile in range means no overwatch attack");
    });
});

// ---------------------------------------------------------------------------
// resolveOverwatch — successful fire
// ---------------------------------------------------------------------------

describe("ReactionResolver.resolveOverwatch — successful overwatch", () => {
    it("fires the attack and returns one entry and effect pair", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");

        const reactionAction = makeReactionAction({ apCost: 1 });
        const attackAction = makeAttackAction({ itemId: "w1", rangeType: "normal" });

        const perCombatant = { c2: { plan: [reactionAction] } };
        const reactionRuntime = { consumedKeys: new Set() };

        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [attackAction] },
            distances: { "c2:c1": 10 },   // mover in range
            resolveAttackOutcome: {
                result: "hit",
                damage: 4,
                pendingDamage: { targetCombatantId: "c1", amount: 4 },
                detail: "hits."
            }
        });

        const { entries, effects } = await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 1, "one overwatch attack should be fired");
        assert.equal(entries.length, 1);
        assert.equal(entries[0].combatantId, "c2");
        assert.equal(entries[0].reaction, true);
        assert.ok(entries[0].outcome.detail.includes("triggers overwatch"));
    });

    it("adds consumeAction and damage effects", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");

        const reactionAction = makeReactionAction({ apCost: 1 });
        const attackAction = makeAttackAction({ itemId: "w1", rangeType: "normal" });

        const perCombatant = { c2: { plan: [reactionAction] } };
        const reactionRuntime = { consumedKeys: new Set() };

        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [attackAction] },
            distances: { "c2:c1": 10 },
            resolveAttackOutcome: {
                result: "hit",
                damage: 6,
                pendingDamage: { targetCombatantId: "c1", amount: 6 },
                detail: "hits."
            }
        });

        const { effects } = await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        const consumeEffect = effects.find((e) => e.type === "consumeAction");
        const damageEffect = effects.find((e) => e.type === "damage");

        assert.ok(consumeEffect, "expected a consumeAction effect");
        assert.equal(consumeEffect.combatantId, "c2");
        assert.equal(consumeEffect.itemId, "w1");

        assert.ok(damageEffect, "expected a damage effect");
        assert.equal(damageEffect.targetCombatantId, "c1");
        assert.equal(damageEffect.amount, 6);
    });

    it("marks the reaction window as consumed after firing", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");

        const reactionAction = makeReactionAction({ apCost: 1 });
        const attackAction = makeAttackAction({ itemId: "w1", rangeType: "normal" });

        const perCombatant = { c2: { plan: [reactionAction] } };
        const reactionRuntime = { consumedKeys: new Set() };

        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [attackAction] },
            distances: { "c2:c1": 10 }
        });

        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        // Key = "c2:0:1" (combatantId:actionIndex:startTick)
        assert.ok(reactionRuntime.consumedKeys.has("c2:0:1"), "reaction key should be consumed");
    });

    it("does not fire again on the next tick when the window is consumed", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");

        const reactionAction = makeReactionAction({ apCost: 2 }); // covers ticks 1-2
        const attackAction = makeAttackAction({ itemId: "w1", rangeType: "normal" });

        const perCombatant = { c2: { plan: [reactionAction] } };
        const reactionRuntime = { consumedKeys: new Set() };

        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver, attackLog } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [attackAction] },
            distances: { "c2:c1": 10 }
        });

        // Tick 1 — fires and consumes.
        await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        // Tick 2 — same window still active, but now consumed.
        await resolver.resolveOverwatch({
            mover, tick: 2, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        assert.equal(attackLog.length, 1, "should only fire once despite window covering two ticks");
    });

    it("does not push a damage effect when pendingDamage amount is 0", async () => {
        const mover = makeCombatant("c1");
        const watcher = makeCombatant("c2");

        const reactionAction = makeReactionAction({ apCost: 1 });
        const attackAction = makeAttackAction({ itemId: "w1", rangeType: "normal" });

        const perCombatant = { c2: { plan: [reactionAction] } };
        const reactionRuntime = { consumedKeys: new Set() };

        watcher.actor.system.inventory.equipment = { hand: { itemIds: ["w1"] } };

        const { resolver } = makeResolver({
            combatants: [mover, watcher],
            availableActions: { c2: [attackAction] },
            distances: { "c2:c1": 10 },
            resolveAttackOutcome: {
                result: "miss",
                damage: 0,
                pendingDamage: { targetCombatantId: "c1", amount: 0 },
                detail: "misses."
            }
        });

        const { effects } = await resolver.resolveOverwatch({
            mover, tick: 1, perCombatant, reactionRuntime, orderedCombatants: [watcher]
        });

        const damageEffects = effects.filter((e) => e.type === "damage");
        assert.equal(damageEffects.length, 0, "zero-damage miss should not push a damage effect");
    });
});
