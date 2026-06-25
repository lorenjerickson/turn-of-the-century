import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CollisionResolver } from "../../module/encounters/collision-resolver.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(id, { name = null, tokenId = null, str = 5, dex = 2, health = 10 } = {}) {
    return {
        id,
        tokenId: tokenId ?? `t${id}`,
        name: name ?? `Combatant ${id}`,
        token: { id: tokenId ?? `t${id}`, _id: tokenId ?? `t${id}`, x: 0, y: 0 },
        actor: {
            id: `actor${id}`,
            system: {
                resources: { health: { value: health } },
                abilities: {
                    str: { value: str, bonus: Math.floor((str - 10) / 2) },
                    dex: { value: dex, bonus: Math.floor((dex - 10) / 2) }
                }
            },
            ownership: {}
        }
    };
}

/**
 * Build a CollisionResolver with controllable ports.
 *
 * @param {{
 *   combatants?:         object[],
 *   gridSize?:           number,
 *   canResolve?:         boolean,
 *   proneCombatants?:    Set<string>,   actor ids
 *   rollResults?:        Record<string, object>  combatantId → result shape
 *   proneLog?:           string[]
 *   damageLog?:          Array<{id:string, damage:number}>
 *   notifyLog?:          object[]
 *   snapshotCaptures?:   object[]
 * }} opts
 */
function makeResolver({
    combatants = [],
    gridSize = 100,
    canResolve = true,
    proneCombatants = new Set(),
    rollResults = {},   // combatantId → { total, natural/dice }
    proneLog = [],
    damageLog = [],
    notifyLog = [],
    snapshotCaptures = [],
    capturedSnapshot = null
} = {}) {
    // Track sent requests by combatantId.
    const rollRequestLog = [];

    const resolver = new CollisionResolver({
        getCombatants: () => combatants,
        getGridSize: () => gridSize,
        canResolveConflicts: () => canResolve,
        isActorProne: (actor) => proneCombatants.has(actor?.id),
        ownerUserIdForActor: (_actor) => "user1",
        sendRollRequest: ({ member, combatant, tick }) => {
            const id = `roll-${combatant?.id}-t${tick}`;
            rollRequestLog.push({ id, combatantId: combatant?.id });
            return { id };
        },
        waitForRollResolution: async (id) => {
            // Find which combatant this roll belongs to.
            const entry = rollRequestLog.find((r) => r.id === id);
            const combatantId = entry?.combatantId;
            const result = rollResults[combatantId] ?? { total: 10, dice: [{ value: 10, kept: true }] };
            return { results: { user1: result } };
        },
        applyProneEffect: async (combatant) => {
            if (combatant?.id) proneLog.push(combatant.id);
        },
        applyConcussiveDamage: async (combatant) => {
            const damage = 4;
            damageLog.push({ id: combatant?.id, damage });
            return damage;
        },
        notifyAwaitingRolls: async (opts) => {
            notifyLog.push(opts);
        },
        applySnapshot: async (_snapshot) => {},
        captureSnapshot: async (opts) => {
            const snap = capturedSnapshot ?? { tokenPositions: opts.tokenPositionOverrides ?? {} };
            snapshotCaptures.push(opts);
            return snap;
        }
    });

    return { resolver, rollRequestLog, proneLog, damageLog, notifyLog, snapshotCaptures };
}

// Minimal snapshot with two combatants sharing a cell (at 0,0 with gridSize=100).
function makeConflictingSnapshot(tokenIds = ["t1", "t2"], positions = null) {
    const tokenPositions = {};
    positions = positions ?? tokenIds.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < tokenIds.length; i++) {
        tokenPositions[tokenIds[i]] = positions[i];
    }
    return { tokenPositions };
}

// ---------------------------------------------------------------------------
// Early-return guards
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — guards", () => {
    it("returns snapshot unchanged when canResolveConflicts is false", async () => {
        const snapshot = makeConflictingSnapshot();
        const { resolver } = makeResolver({ canResolve: false });
        const result = await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });
        assert.equal(result, snapshot, "should return the same snapshot reference unchanged");
    });

    it("returns snapshot unchanged when there are no conflicts", async () => {
        const snapshot = { tokenPositions: { t1: { x: 0, y: 0 }, t2: { x: 100, y: 0 } } };
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });

        const { resolver } = makeResolver({ combatants: [c1, c2] });
        const result = await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });
        assert.equal(result, snapshot, "no conflicts → original snapshot returned");
    });

    it("skips prone combatants when scanning for conflicts", async () => {
        // t1 and t2 both at (0,0), but t2's actor is prone → only c1 counted → no conflict.
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const notifyLog = [];
        const { resolver } = makeResolver({
            combatants: [c1, c2],
            proneCombatants: new Set([c2.actor.id]),
            notifyLog
        });
        const result = await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });
        assert.equal(result, snapshot, "prone combatant excluded → no conflict");
        assert.equal(notifyLog.length, 0);
    });
});

// ---------------------------------------------------------------------------
// Roll lifecycle
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — roll lifecycle", () => {
    it("sends one roll request per conflicting combatant", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const { resolver, rollRequestLog } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 15, dice: [{ value: 15, kept: true }] },
                c2: { total: 10, dice: [{ value: 10, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 2, snapshot });
        assert.equal(rollRequestLog.length, 2, "one request per conflicting combatant");
    });

    it("notifies awaiting-rolls state with the correct request IDs", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const notifyLog = [];
        const { resolver, rollRequestLog } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 15, dice: [{ value: 15, kept: true }] },
                c2: { total: 10, dice: [{ value: 10, kept: true }] }
            },
            notifyLog
        });
        await resolver.resolveTickEndGridConflicts({ tick: 3, snapshot });

        assert.equal(notifyLog.length, 1);
        assert.equal(notifyLog[0].tick, 3);
        assert.deepEqual(
            new Set(notifyLog[0].requestIds),
            new Set(rollRequestLog.map((r) => r.id))
        );
    });
});

// ---------------------------------------------------------------------------
// Outcome: failure → prone
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — failure outcomes", () => {
    it("applies prone to the combatant who loses the contested roll", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        // c1 wins (high roll), c2 loses (low roll with no nat 1 or 20).
        const proneLog = [];
        const { resolver } = makeResolver({
            combatants: [c1, c2],
            proneLog,
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });

        assert.ok(proneLog.includes("c2"), "loser should be made prone");
        assert.ok(!proneLog.includes("c1"), "winner should not be made prone");
    });

    it("forfeits the loser's remaining AP and resets plan pointer", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const perCombatant = {
            c2: { remainingAp: 3, spentAp: 1, pointer: 0, progress: 1, plan: [{}, {}] }
        };

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, perCombatant });

        assert.equal(perCombatant.c2.remainingAp, 0, "remaining AP forfeited");
        assert.equal(perCombatant.c2.spentAp, 4, "spent AP increased by forfeited amount");
        assert.equal(perCombatant.c2.pointer, 2, "pointer advanced to end of plan");
        assert.equal(perCombatant.c2.progress, 0, "progress reset");
    });

    it("adds a standing timeline entry for the winner", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const timeline = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const winnerEntry = timeline.find((e) => e.combatantId === "c1");
        assert.ok(winnerEntry, "winner should have a timeline entry");
        assert.equal(winnerEntry.outcome.result, "standing");
    });

    it("adds a prone timeline entry for the loser", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const timeline = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const loserEntry = timeline.find((e) => e.combatantId === "c2");
        assert.ok(loserEntry, "loser should have a timeline entry");
        assert.equal(loserEntry.outcome.result, "prone");
    });
});

// ---------------------------------------------------------------------------
// Critical failure → concussive damage
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — critical failure", () => {
    it("applies concussive damage on a natural 1", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const damageLog = [];
        const proneLog = [];
        const { resolver } = makeResolver({
            combatants: [c1, c2],
            damageLog,
            proneLog,
            rollResults: {
                c1: { total: 15, dice: [{ value: 15, kept: true }] },
                c2: { total: 1, dice: [{ value: 1, kept: true }] }  // nat 1 → criticalFailure
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });

        assert.ok(damageLog.some((d) => d.id === "c2"), "critical failure combatant should take damage");
        assert.ok(proneLog.includes("c2"), "critical failure combatant should also be prone");
    });

    it("adds a criticalFailure timeline entry for nat-1 result", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const timeline = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 15, dice: [{ value: 15, kept: true }] },
                c2: { total: 1, dice: [{ value: 1, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const critEntry = timeline.find((e) => e.combatantId === "c2");
        assert.equal(critEntry?.outcome.result, "criticalFailure");
        assert.ok(critEntry.outcome.damageType === "concussive");
    });

    it("does not apply concussive damage for an ordinary failure", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const damageLog = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            damageLog,
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }  // ordinary failure
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot });

        assert.equal(damageLog.length, 0, "ordinary failure should not cause concussive damage");
    });
});

// ---------------------------------------------------------------------------
// Displacement
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — displacement", () => {
    it("displaces the weakest combatant when all critical-succeed", async () => {
        // Two combatants, both nat 20 → allCriticalSuccess → displace weakest (lowest str).
        const c1 = makeCombatant("c1", { tokenId: "t1", str: 14 });
        const c2 = makeCombatant("c2", { tokenId: "t2", str: 8 });  // weaker
        // Position t1 and t2 in different cells so displacement has a free cell.
        const snapshot = {
            tokenPositions: {
                t1: { x: 0, y: 0 },
                t2: { x: 0, y: 0 }   // same cell as t1 → conflict
            }
        };
        const timeline = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 20, dice: [{ value: 20, kept: true }] },
                c2: { total: 20, dice: [{ value: 20, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const displacedEntry = timeline.find((e) => e.outcome?.result === "displaced");
        assert.ok(displacedEntry, "expected a displaced timeline entry");
        assert.equal(displacedEntry.combatantId, "c2", "weakest combatant (c2) should be displaced");
    });

    it("displaces the weakest combatant when all fail (tied roll — no winner)", async () => {
        // When two combatants tie, resolveContestedDexterity leaves both as "failure"
        // (winners.length > 1 → no one promoted to "success") → allFailed is true.
        const c1 = makeCombatant("c1", { tokenId: "t1", str: 14 });
        const c2 = makeCombatant("c2", { tokenId: "t2", str: 8 });  // weaker
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const timeline = [];

        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 10, dice: [{ value: 10, kept: true }] },
                c2: { total: 10, dice: [{ value: 10, kept: true }] }  // tie → both stay "failure"
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const displacedEntry = timeline.find((e) => e.outcome?.result === "displaced");
        assert.ok(displacedEntry, "all fail (tied) → weakest displaced");
        assert.equal(displacedEntry.combatantId, "c2");
    });

    it("does not displace when outcomes are mixed", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);
        const timeline = [];

        // c1 succeeds (not nat 20), c2 fails → mixed → no displacement
        const { resolver } = makeResolver({
            combatants: [c1, c2],
            rollResults: {
                c1: { total: 15, dice: [{ value: 15, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        await resolver.resolveTickEndGridConflicts({ tick: 1, snapshot, timeline });

        const displacedEntry = timeline.find((e) => e.outcome?.result === "displaced");
        assert.equal(displacedEntry, undefined, "mixed outcomes → no displacement");
    });
});

// ---------------------------------------------------------------------------
// Post-resolution snapshot
// ---------------------------------------------------------------------------

describe("CollisionResolver.resolveTickEndGridConflicts — snapshot capture", () => {
    it("calls captureSnapshot after resolving conflicts", async () => {
        const c1 = makeCombatant("c1", { tokenId: "t1" });
        const c2 = makeCombatant("c2", { tokenId: "t2" });
        const snapshot = makeConflictingSnapshot(["t1", "t2"]);

        const snapshotCaptures = [];
        const capturedSnapshot = { tokenPositions: {} };
        const { resolver } = makeResolver({
            combatants: [c1, c2],
            snapshotCaptures,
            capturedSnapshot,
            rollResults: {
                c1: { total: 18, dice: [{ value: 18, kept: true }] },
                c2: { total: 5, dice: [{ value: 5, kept: true }] }
            }
        });
        const result = await resolver.resolveTickEndGridConflicts({ tick: 2, snapshot });

        assert.equal(snapshotCaptures.length, 1, "should capture a new snapshot after resolution");
        assert.equal(result, capturedSnapshot, "should return the captured snapshot");
    });
});
