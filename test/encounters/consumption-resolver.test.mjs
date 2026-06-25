import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ConsumptionResolver } from "../../module/encounters/consumption-resolver.mjs";

// ---------------------------------------------------------------------------
// Test factory
// ---------------------------------------------------------------------------

/**
 * Build a ConsumptionResolver wired to in-memory test doubles.
 *
 * @param {{
 *   combatants?:     Record<string, { actor: object }>,
 *   itemActionLog?:  object[],
 *   healthLog?:      object[],
 *   distances?:      Record<string, number>
 * }} opts
 */
function makeResolver({
    combatants = {},
    itemActionLog = [],
    healthLog = [],
    distances = {}
} = {}) {
    return new ConsumptionResolver({
        resolveCombatant: (id) => combatants[id] ?? null,
        applyItemAction: async ({ item, actor, actionId, consume }) => {
            itemActionLog.push({ item, actor, actionId, consume });
        },
        updateActorHealth: async (actor, nextHealth) => {
            healthLog.push({ actorId: actor.id, nextHealth });
        },
        distanceBetweenCombatantsFeet: (source, target, opts) => {
            const key = `${source?.id}-${target?.id}`;
            return distances[key] ?? Number.POSITIVE_INFINITY;
        }
    });
}

/** Build a minimal fake combatant with an actor. */
function makeCombatant(id, { health = 10, items = {}, actorId = null } = {}) {
    const actor = {
        id: actorId ?? `actor-${id}`,
        system: { resources: { health: { value: health } } },
        items: { get: (itemId) => items[itemId] ?? null }
    };
    return { id, actor };
}

/** Build a fake item that records calls to executeEncounterAction. */
function makeItem(itemId, log = []) {
    return {
        id: itemId,
        system: { physical: { range: { normal: 30, long: 60 } } },
        executeEncounterAction: async (opts) => { log.push(opts); }
    };
}

// ---------------------------------------------------------------------------
// buildTickReconcilePlan
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.buildTickReconcilePlan", () => {
    it("returns empty buckets for no effects", () => {
        const r = makeResolver();
        const result = r.buildTickReconcilePlan({ tickEffects: [], orderedCombatants: [] });
        assert.deepEqual(result, { consumeEffects: [], movementEffects: [], damageEntries: [] });
    });

    it("routes consumeAction effects to consumeEffects bucket", () => {
        const r = makeResolver();
        const effect = { type: "consumeAction", combatantId: "c1", itemId: "i1", actionId: "a1" };
        const { consumeEffects, movementEffects, damageEntries } = r.buildTickReconcilePlan({
            tickEffects: [effect],
            orderedCombatants: []
        });
        assert.equal(consumeEffects.length, 1);
        assert.equal(movementEffects.length, 0);
        assert.equal(damageEntries.length, 0);
        assert.equal(consumeEffects[0], effect);
    });

    it("routes movement effects and deduplicates by highest initiative", () => {
        const r = makeResolver();
        const hi = { type: "movement", combatantId: "c1", tokenId: "t1", x: 100, y: 200 };
        const lo = { type: "movement", combatantId: "c2", tokenId: "t1", x: 50, y: 50 };
        const ordered = [
            { id: "c1", initiative: 15 },
            { id: "c2", initiative: 5 }
        ];
        const { movementEffects } = r.buildTickReconcilePlan({ tickEffects: [lo, hi], orderedCombatants: ordered });
        assert.equal(movementEffects.length, 1);
        assert.equal(movementEffects[0], hi);
    });

    it("accumulates damage effects for the same target", () => {
        const r = makeResolver();
        const effects = [
            { type: "damage", sourceCombatantId: "c1", targetCombatantId: "tgt", amount: 3 },
            { type: "damage", sourceCombatantId: "c2", targetCombatantId: "tgt", amount: 5 }
        ];
        const { damageEntries } = r.buildTickReconcilePlan({ tickEffects: effects, orderedCombatants: [] });
        assert.equal(damageEntries.length, 1);
        assert.equal(damageEntries[0].totalAmount, 8);
        assert.equal(damageEntries[0].contributors.length, 2);
    });

    it("skips damage effects with zero or negative amount", () => {
        const r = makeResolver();
        const effects = [
            { type: "damage", sourceCombatantId: "c1", targetCombatantId: "tgt", amount: 0 },
            { type: "damage", sourceCombatantId: "c2", targetCombatantId: "tgt", amount: -5 }
        ];
        const { damageEntries } = r.buildTickReconcilePlan({ tickEffects: effects, orderedCombatants: [] });
        assert.equal(damageEntries.length, 0);
    });

    it("skips movement effects with no tokenId", () => {
        const r = makeResolver();
        const effect = { type: "movement", combatantId: "c1", tokenId: "", x: 100, y: 200 };
        const { movementEffects } = r.buildTickReconcilePlan({ tickEffects: [effect], orderedCombatants: [] });
        assert.equal(movementEffects.length, 0);
    });

    it("handles unknown effect types gracefully", () => {
        const r = makeResolver();
        const effect = { type: "teleport", combatantId: "c1" };
        const result = r.buildTickReconcilePlan({ tickEffects: [effect], orderedCombatants: [] });
        assert.deepEqual(result, { consumeEffects: [], movementEffects: [], damageEntries: [] });
    });
});

// ---------------------------------------------------------------------------
// buildSimultaneousDamageEntriesFromTimeline
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.buildSimultaneousDamageEntriesFromTimeline", () => {
    it("returns empty array for empty timeline", () => {
        const r = makeResolver();
        assert.deepEqual(r.buildSimultaneousDamageEntriesFromTimeline({ timeline: [], tick: 1 }), []);
    });

    it("collects pendingDamage from matching tick entries", () => {
        const r = makeResolver();
        const timeline = [
            {
                tick: 2,
                combatantId: "c1",
                outcome: { result: "hit", pendingDamage: { targetCombatantId: "tgt", amount: 4 } }
            }
        ];
        const entries = r.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick: 2 });
        assert.equal(entries.length, 1);
        assert.equal(entries[0].totalAmount, 4);
    });

    it("skips entries from other ticks", () => {
        const r = makeResolver();
        const timeline = [
            { tick: 1, combatantId: "c1", outcome: { pendingDamage: { targetCombatantId: "tgt", amount: 4 } } }
        ];
        assert.equal(r.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick: 2 }).length, 0);
    });

    it("skips interrupted entries", () => {
        const r = makeResolver();
        const timeline = [
            { tick: 1, combatantId: "c1", outcome: { result: "interrupted", pendingDamage: { targetCombatantId: "tgt", amount: 4 } } }
        ];
        assert.equal(r.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick: 1 }).length, 0);
    });

    it("accumulates multiple hits to the same target", () => {
        const r = makeResolver();
        const timeline = [
            { tick: 1, combatantId: "c1", outcome: { pendingDamage: { targetCombatantId: "tgt", amount: 3 } } },
            { tick: 1, combatantId: "c2", outcome: { pendingDamage: { targetCombatantId: "tgt", amount: 5 } } }
        ];
        const entries = r.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick: 1 });
        assert.equal(entries.length, 1);
        assert.equal(entries[0].totalAmount, 8);
    });

    it("skips entries with zero amount", () => {
        const r = makeResolver();
        const timeline = [
            { tick: 1, combatantId: "c1", outcome: { pendingDamage: { targetCombatantId: "tgt", amount: 0 } } }
        ];
        assert.equal(r.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick: 1 }).length, 0);
    });
});

// ---------------------------------------------------------------------------
// markTimelineEntryInterrupted
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.markTimelineEntryInterrupted", () => {
    it("marks the entry at the given index as interrupted", () => {
        const r = makeResolver();
        const timeline = [
            { tick: 1, combatantId: "c1", action: { label: "Punch" }, outcome: { result: "hit" } }
        ];
        r.markTimelineEntryInterrupted({
            timeline,
            timelineIndex: 0,
            combatantName: "Alice",
            actionLabel: "Punch",
            reason: "target is dead"
        });
        assert.equal(timeline[0].outcome.result, "interrupted");
        assert.ok(timeline[0].outcome.detail.includes("target is dead"));
    });

    it("preserves other fields on the entry", () => {
        const r = makeResolver();
        const timeline = [{ tick: 3, combatantId: "c1", action: { label: "Kick" }, outcome: { result: "hit", roll: 15 } }];
        r.markTimelineEntryInterrupted({ timeline, timelineIndex: 0, combatantName: "Bob", actionLabel: "Kick", reason: "" });
        assert.equal(timeline[0].tick, 3);
        assert.equal(timeline[0].combatantId, "c1");
        assert.equal(timeline[0].outcome.roll, 15);
    });

    it("is a no-op for out-of-bounds index", () => {
        const r = makeResolver();
        const timeline = [{ tick: 1, outcome: { result: "hit" } }];
        r.markTimelineEntryInterrupted({ timeline, timelineIndex: 5, combatantName: "X", actionLabel: "y", reason: "" });
        assert.equal(timeline[0].outcome.result, "hit");
    });

    it("is a no-op for negative index", () => {
        const r = makeResolver();
        const timeline = [{ tick: 1, outcome: { result: "hit" } }];
        r.markTimelineEntryInterrupted({ timeline, timelineIndex: -1, combatantName: "X", actionLabel: "y", reason: "" });
        assert.equal(timeline[0].outcome.result, "hit");
    });

    it("formats detail with period when no reason is given", () => {
        const r = makeResolver();
        const timeline = [{ tick: 1, outcome: {} }];
        r.markTimelineEntryInterrupted({ timeline, timelineIndex: 0, combatantName: "C", actionLabel: "the action", reason: "" });
        assert.ok(timeline[0].outcome.detail.endsWith("."));
    });
});

// ---------------------------------------------------------------------------
// validateCompletionBoundary
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.validateCompletionBoundary", () => {
    it("returns valid:true when entry has no outcome", () => {
        const r = makeResolver();
        assert.deepEqual(r.validateCompletionBoundary({ timelineEntry: { action: { type: "consumable" } } }), { valid: true });
    });

    it("returns valid:true when entry has no action", () => {
        const r = makeResolver();
        assert.deepEqual(r.validateCompletionBoundary({ timelineEntry: { outcome: { result: "hit" }, action: null } }), { valid: true });
    });

    it("flags incapacitated source for consumable actions", () => {
        const actor = { id: "a1", system: { resources: { health: { value: 0 } } }, items: { get: () => null } };
        const combatant = { id: "c1", actor };
        const r = makeResolver({ combatants: { c1: combatant } });

        const timelineEntry = {
            combatantId: "c1",
            action: { type: "consumable" },
            outcome: {}
        };
        const projectedState = { actorHealth: { a1: 0 } };
        const result = r.validateCompletionBoundary({ timelineEntry, projectedState, proneCombatantIds: new Set() });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes("incapacitated")));
    });

    it("flags source prone for non-interruptible actions", () => {
        const actor = { id: "a1", system: {}, items: { get: () => null } };
        const combatant = { id: "c1", actor };
        const r = makeResolver({ combatants: { c1: combatant } });

        const timelineEntry = {
            combatantId: "c1",
            action: { type: "attack", interruptible: false },
            outcome: {}
        };
        const result = r.validateCompletionBoundary({
            timelineEntry,
            projectedState: { actorHealth: {} },
            proneCombatantIds: new Set(["c1"])
        });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes("prone")));
    });

    it("returns valid:true when all boundaries pass", () => {
        const actor = { id: "a1", system: {}, items: { get: () => null } };
        const combatant = { id: "c1", actor };
        const r = makeResolver({ combatants: { c1: combatant } });

        const timelineEntry = {
            combatantId: "c1",
            action: { type: "attack", interruptible: true },
            outcome: {}
        };
        const result = r.validateCompletionBoundary({
            timelineEntry,
            projectedState: { actorHealth: { a1: 5 } },
            proneCombatantIds: new Set()
        });
        assert.deepEqual(result, { valid: true });
    });

    it("flags target out of range when requiresToHit is set", () => {
        const sourceActor = { id: "sa1", items: { get: () => null } };
        const targetActor = { id: "ta1" };
        const sourceComb = { id: "c1", actor: sourceActor };
        const targetComb = { id: "c2", actor: targetActor };
        const r = makeResolver({
            combatants: { c1: sourceComb, c2: targetComb },
            distances: { "c1-c2": 40 }
        });

        const timelineEntry = {
            combatantId: "c1",
            action: { type: "attack", requiresToHit: true, rangeType: "melee", itemId: null },
            outcome: { targetCombatantId: "c2" }
        };
        const result = r.validateCompletionBoundary({
            timelineEntry,
            projectedState: {},
            proneCombatantIds: new Set()
        });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes("out of range")));
    });
});

// ---------------------------------------------------------------------------
// applyConsumeActionEffect
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.applyConsumeActionEffect", () => {
    it("calls applyItemAction with correct arguments", async () => {
        const actionLog = [];
        const item = makeItem("i1", actionLog);
        const actor = { id: "a1", items: { get: (id) => id === "i1" ? item : null } };
        const combatant = { id: "c1", actor };
        const itemActionLog = [];
        const r = makeResolver({ combatants: { c1: combatant }, itemActionLog });

        await r.applyConsumeActionEffect({ combatantId: "c1", itemId: "i1", actionId: "action-use" });
        assert.equal(itemActionLog.length, 1);
        assert.equal(itemActionLog[0].actionId, "action-use");
        assert.equal(itemActionLog[0].consume, true);
        assert.equal(itemActionLog[0].item, item);
        assert.equal(itemActionLog[0].actor, actor);
    });

    it("is a no-op for null effect", async () => {
        const itemActionLog = [];
        const r = makeResolver({ itemActionLog });
        await r.applyConsumeActionEffect(null);
        assert.equal(itemActionLog.length, 0);
    });

    it("is a no-op when combatant not found", async () => {
        const itemActionLog = [];
        const r = makeResolver({ combatants: {}, itemActionLog });
        await r.applyConsumeActionEffect({ combatantId: "missing", itemId: "i1", actionId: "a1" });
        assert.equal(itemActionLog.length, 0);
    });

    it("is a no-op when item not found", async () => {
        const actor = { id: "a1", items: { get: () => null } };
        const combatant = { id: "c1", actor };
        const itemActionLog = [];
        const r = makeResolver({ combatants: { c1: combatant }, itemActionLog });
        await r.applyConsumeActionEffect({ combatantId: "c1", itemId: "missing", actionId: "a1" });
        assert.equal(itemActionLog.length, 0);
    });

    it("is a no-op when any required field is empty", async () => {
        const itemActionLog = [];
        const r = makeResolver({ itemActionLog });
        await r.applyConsumeActionEffect({ combatantId: "c1", itemId: "", actionId: "a1" });
        assert.equal(itemActionLog.length, 0);
    });
});

// ---------------------------------------------------------------------------
// applySimultaneousDamageEntries
// ---------------------------------------------------------------------------

describe("ConsumptionResolver.applySimultaneousDamageEntries", () => {
    it("applies damage using the evaluation snapshot health as baseline", async () => {
        const actor = { id: "a1", system: { resources: { health: { value: 20 } } } };
        const combatant = { id: "c1", actor };
        const healthLog = [];
        const r = makeResolver({ combatants: { c1: combatant }, healthLog });

        await r.applySimultaneousDamageEntries({
            damageEntries: [{ targetCombatantId: "c1", totalAmount: 8 }],
            evaluationSnapshot: { actorHealth: { a1: 15 } }
        });

        // baseline 15, damage 8 → next 7
        assert.equal(healthLog.length, 1);
        assert.equal(healthLog[0].nextHealth, 7);
    });

    it("falls back to live actor health when snapshot has no record", async () => {
        const actor = { id: "a1", system: { resources: { health: { value: 10 } } } };
        const combatant = { id: "c1", actor };
        const healthLog = [];
        const r = makeResolver({ combatants: { c1: combatant }, healthLog });

        await r.applySimultaneousDamageEntries({
            damageEntries: [{ targetCombatantId: "c1", totalAmount: 3 }],
            evaluationSnapshot: { actorHealth: {} }
        });

        assert.equal(healthLog[0].nextHealth, 7);
    });

    it("clamps health to 0", async () => {
        const actor = { id: "a1", system: { resources: { health: { value: 5 } } } };
        const combatant = { id: "c1", actor };
        const healthLog = [];
        const r = makeResolver({ combatants: { c1: combatant }, healthLog });

        await r.applySimultaneousDamageEntries({
            damageEntries: [{ targetCombatantId: "c1", totalAmount: 100 }],
            evaluationSnapshot: null
        });

        assert.equal(healthLog[0].nextHealth, 0);
    });

    it("skips entries with missing targetCombatantId", async () => {
        const healthLog = [];
        const r = makeResolver({ healthLog });
        await r.applySimultaneousDamageEntries({
            damageEntries: [{ targetCombatantId: "", totalAmount: 5 }],
            evaluationSnapshot: null
        });
        assert.equal(healthLog.length, 0);
    });

    it("skips entries where combatant cannot be resolved", async () => {
        const healthLog = [];
        const r = makeResolver({ combatants: {}, healthLog });
        await r.applySimultaneousDamageEntries({
            damageEntries: [{ targetCombatantId: "ghost", totalAmount: 5 }],
            evaluationSnapshot: null
        });
        assert.equal(healthLog.length, 0);
    });

    it("processes multiple damage entries independently", async () => {
        const actorA = { id: "a1", system: { resources: { health: { value: 10 } } } };
        const actorB = { id: "a2", system: { resources: { health: { value: 10 } } } };
        const combatants = {
            c1: { id: "c1", actor: actorA },
            c2: { id: "c2", actor: actorB }
        };
        const healthLog = [];
        const r = makeResolver({ combatants, healthLog });

        await r.applySimultaneousDamageEntries({
            damageEntries: [
                { targetCombatantId: "c1", totalAmount: 3 },
                { targetCombatantId: "c2", totalAmount: 6 }
            ],
            evaluationSnapshot: { actorHealth: { a1: 10, a2: 10 } }
        });

        assert.equal(healthLog.length, 2);
        const a1 = healthLog.find((e) => e.actorId === "a1");
        const a2 = healthLog.find((e) => e.actorId === "a2");
        assert.equal(a1.nextHealth, 7);
        assert.equal(a2.nextHealth, 4);
    });
});
