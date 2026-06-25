import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttackResolver } from "../../module/encounters/attack-resolver.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(id, { armorClass = 10, dexBonus = 0, strBonus = 0, health = 20 } = {}) {
    const updates = [];
    return {
        id,
        system: {
            resources: { health: { value: health } },
            defenses: { armorClass },
            abilities: { dex: { bonus: dexBonus }, str: { bonus: strBonus } }
        },
        items: { get: () => null },
        _updates: updates,
        update: async (changes) => { updates.push(changes); }
    };
}

function makeCombatant(id, name, actor = null, token = null) {
    return { id, name, actor, token };
}

function makeAction(overrides = {}) {
    return {
        type: "attack",
        label: "Pistol Shot",
        itemId: null,
        targetId: null,
        requiresToHit: true,
        requiresTarget: true,
        rangeType: "normal",
        toHitBonus: 0,
        apCost: 2,
        ...overrides
    };
}

/** Build a resolver with deterministic rolls. `rolls` is a list consumed in order. */
function makeResolver({
    attacker = null,
    target = null,
    allCombatants = [],
    rollSequence = [],
    findReactionAtTick = () => null,
    consumeReactionWindow = () => false,
    applyDamageLog = []
} = {}) {
    let rollIndex = 0;

    return new AttackResolver({
        resolveDeclaredTarget: (sourceId, targetId) => {
            if (targetId) return allCombatants.find((c) => c.id === targetId) ?? null;
            return allCombatants.find((c) => c.id !== sourceId) ?? null;
        },
        isCombatantIncapacitated: (combatant, { actorHealth } = {}) => {
            const id = combatant?.actor?.id;
            if (id && actorHealth && Number.isFinite(actorHealth[id])) return actorHealth[id] <= 0;
            return toNumber(combatant?.actor?.system?.resources?.health?.value, 20) <= 0;
        },
        resolveTokenDocument: (combatant) => combatant?.token ?? null,
        selectCriticalFailureTarget: (sourceId) => {
            return allCombatants.find((c) => c.id !== sourceId) ?? null;
        },
        findReactionAtTick,
        consumeReactionWindow,
        roll: async () => {
            const total = rollSequence[rollIndex++] ?? 10;
            return { total };
        },
        applyDamage: async (combatant, amount) => {
            applyDamageLog.push({ combatantId: combatant?.id, amount });
        },
        localize: (key) => key,
        getScene: () => null
    });
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("AttackResolver.resolveAttack — guards", () => {
    it("returns failed when requiresToHit and no targetId", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"));
        const resolver = makeResolver({ attacker, allCombatants: [attacker] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: null }),
            evaluationSnapshot: null
        });

        assert.equal(outcome.result, "failed");
        assert.ok(outcome.detail.includes("no target"));
    });

    it("returns failed when target cannot be resolved", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"));
        const resolver = makeResolver({ attacker, allCombatants: [attacker] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "ghost" }),
            evaluationSnapshot: null
        });

        assert.equal(outcome.result, "failed");
    });

    it("returns interrupted when the target is already incapacitated", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1", { health: 20 }));
        const target = makeCombatant("c2", "Bob", makeActor("a2", { health: 0 }));
        const resolver = makeResolver({ allCombatants: [attacker, target] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2" }),
            evaluationSnapshot: { actorHealth: { a2: 0 } }
        });

        assert.equal(outcome.result, "interrupted");
        assert.ok(outcome.detail.includes("incapacitated"));
    });

    it("returns outOfRange when target is beyond weapon range", async () => {
        // Place tokens 2000 px apart. With gridSize=100, distance/square=5 ft →
        // pixel distance 2000 / 100 * 5 = 100 ft, which exceeds normal range (30 ft).
        const attackerToken = { id: "t1", _id: "t1", x: 0, y: 0, width: 1, height: 1 };
        const targetToken = { id: "t2", _id: "t2", x: 2000, y: 0, width: 1, height: 1 };
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2"), targetToken);
        const resolver = makeResolver({ allCombatants: [attacker, target] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "normal" }),
            evaluationSnapshot: null
        });

        assert.equal(outcome.result, "outOfRange");
    });
});

// ---------------------------------------------------------------------------
// Hit
// ---------------------------------------------------------------------------

describe("AttackResolver.resolveAttack — hit", () => {
    /** Place tokens so distance = 0 and range check passes */
    function sameSpotToken(id) {
        return { id, _id: id, x: 0, y: 0, width: 1, height: 1 };
    }

    it("returns hit when roll+bonus meets armor class", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1", { strBonus: 3 }), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 12 }), targetToken);

        // Roll: 10 (to-hit) then 4 (damage)
        const resolver = makeResolver({ allCombatants: [attacker, target], rollSequence: [10, 4] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        assert.equal(outcome.result, "hit");       // 10+3=13 ≥ AC 12
        assert.equal(outcome.roll, 10);
        assert.equal(outcome.total, 13);
        assert.equal(outcome.damage, 4);
        assert.ok(outcome.pendingDamage?.amount === 4);
    });

    it("returns miss when roll+bonus is below armor class", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1", { strBonus: 0 }), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 15 }), targetToken);

        // Roll: 8 (to-hit) then 4 (damage)
        const resolver = makeResolver({ allCombatants: [attacker, target], rollSequence: [8, 4] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        assert.equal(outcome.result, "miss");
        assert.equal(outcome.damage, 0);
        assert.equal(outcome.pendingDamage, null);
    });

    it("applies damage directly when applyEffects is true", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1", { strBonus: 5 }), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 10 }), targetToken);

        const applyDamageLog = [];
        const resolver = makeResolver({
            allCombatants: [attacker, target],
            rollSequence: [10, 6],
            applyDamageLog
        });

        await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: true
        });

        assert.equal(applyDamageLog.length, 1);
        assert.equal(applyDamageLog[0].combatantId, "c2");
        assert.equal(applyDamageLog[0].amount, 6);
    });

    it("uses Dex bonus for ranged weapon classification", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1", { strBonus: 0, dexBonus: 4 }), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 12 }), targetToken);

        const resolver = makeResolver({ allCombatants: [attacker, target], rollSequence: [9, 3] });

        const fakeItem = { system: { classification: "firearm", damage: { formula: "1", bonus: 0 } } };
        const actor = attacker.actor;
        actor.items = { get: (id) => (id === "w1" ? fakeItem : null) };

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "normal", itemId: "w1" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        // 9+4 dex=13 ≥ AC 12 → hit
        assert.equal(outcome.result, "hit");
        assert.equal(outcome.total, 13);
    });
});

// ---------------------------------------------------------------------------
// Critical outcomes
// ---------------------------------------------------------------------------

describe("AttackResolver.resolveAttack — critical outcomes", () => {
    function sameSpotToken(id) {
        return { id, _id: id, x: 0, y: 0, width: 1, height: 1 };
    }

    it("returns criticalHit on natural 20 with double damage", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2"), targetToken);

        // Roll: 20 (natural 20) then 5 (damage)
        const resolver = makeResolver({ allCombatants: [attacker, target], rollSequence: [20, 5] });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        assert.equal(outcome.result, "criticalHit");
        assert.equal(outcome.roll, 20);
        assert.equal(outcome.damageMultiplier, 2);
        assert.equal(outcome.damage, 10);       // 5 × 2
        assert.equal(outcome.pendingDamage.amount, 10);
    });

    it("returns criticalFailure on natural 1 with double damage to fumble target", async () => {
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const bystander = makeCombatant("c3", "Charlie", makeActor("a3"), sameSpotToken("t3"));
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2"), targetToken);

        // selectCriticalFailureTarget picks the first non-source, non-intended → Charlie
        const resolver = new AttackResolver({
            resolveDeclaredTarget: () => target,
            isCombatantIncapacitated: () => false,
            resolveTokenDocument: (c) => c.token,
            selectCriticalFailureTarget: () => bystander,
            findReactionAtTick: () => null,
            consumeReactionWindow: () => false,
            roll: (() => {
                let i = 0;
                const seq = [1, 6]; // nat 1, then damage 6
                return async () => ({ total: seq[i++] ?? 1 });
            })(),
            applyDamage: async () => {},
            localize: (k) => k,
            getScene: () => null
        });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        assert.equal(outcome.result, "criticalFailure");
        assert.equal(outcome.roll, 1);
        assert.equal(outcome.redirectedTargetId, "c3");
        assert.equal(outcome.damage, 12);    // 6 × 2
    });

    it("critical hit ignores dodge reaction", async () => {
        // Even if a dodge reaction is available, natural 20 is not dodgeable.
        const attackerToken = sameSpotToken("t1");
        const targetToken = sameSpotToken("t2");
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), attackerToken);
        const target = makeCombatant("c2", "Bob", makeActor("a2"), targetToken);

        const dodgeReaction = {
            action: { label: "Dodge", reactionTriggerType: "incomingAttack" },
            actionIndex: 0,
            startTick: 1,
            consumed: false
        };

        const resolver = new AttackResolver({
            resolveDeclaredTarget: () => target,
            isCombatantIncapacitated: () => false,
            resolveTokenDocument: (c) => c.token,
            selectCriticalFailureTarget: () => target,
            findReactionAtTick: () => dodgeReaction,
            consumeReactionWindow: () => true,
            roll: (() => {
                let i = 0;
                const seq = [20, 18, 5]; // nat 20 to-hit, dodge roll, damage
                return async () => ({ total: seq[i++] ?? 1 });
            })(),
            applyDamage: async () => {},
            localize: (k) => k,
            getScene: () => null
        });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false
        });

        // nat 20 → criticalHit regardless of dodge roll
        assert.equal(outcome.result, "criticalHit");
    });
});

// ---------------------------------------------------------------------------
// Dodge reaction
// ---------------------------------------------------------------------------

describe("AttackResolver.resolveAttack — dodge reaction", () => {
    function sameSpotToken(id) {
        return { id, _id: id, x: 0, y: 0, width: 1, height: 1 };
    }

    it("returns reacted when dodge roll meets or beats the to-hit total", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), sameSpotToken("t1"));
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 8, dexBonus: 2 }), sameSpotToken("t2"));

        const dodgeReaction = {
            action: { label: "Dodge", reactionTriggerType: "incomingAttack", toHitBonus: 0 },
            actionIndex: 0,
            startTick: 1,
            consumed: false
        };

        const resolver = new AttackResolver({
            resolveDeclaredTarget: () => target,
            isCombatantIncapacitated: () => false,
            resolveTokenDocument: (c) => c.token,
            selectCriticalFailureTarget: () => target,
            findReactionAtTick: () => dodgeReaction,
            consumeReactionWindow: () => true,
            roll: (() => {
                let i = 0;
                // Sequence: 12 (to-hit), 15 (dodge roll)
                const seq = [12, 15];
                return async () => ({ total: seq[i++] ?? 1 });
            })(),
            applyDamage: async () => {},
            localize: (k) => k,
            getScene: () => null
        });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false,
            perCombatant: {},
            reactionRuntime: { consumedKeys: new Set() }
        });

        // to-hit total = 12+0 = 12; dodge total = 15+2 dex = 17 ≥ 12 → reacted
        assert.equal(outcome.result, "reacted");
        assert.equal(outcome.reactionTotal, 17);
    });

    it("hits when dodge roll falls short of to-hit total", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), sameSpotToken("t1"));
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 8, dexBonus: 0 }), sameSpotToken("t2"));

        const dodgeReaction = {
            action: { label: "Dodge", reactionTriggerType: "incomingAttack", toHitBonus: 0 },
            actionIndex: 0,
            startTick: 1,
            consumed: false
        };

        const resolver = new AttackResolver({
            resolveDeclaredTarget: () => target,
            isCombatantIncapacitated: () => false,
            resolveTokenDocument: (c) => c.token,
            selectCriticalFailureTarget: () => target,
            findReactionAtTick: () => dodgeReaction,
            consumeReactionWindow: () => true,
            roll: (() => {
                let i = 0;
                // to-hit = 15, dodge = 8
                const seq = [15, 8, 5]; // to-hit, dodge, damage
                return async () => ({ total: seq[i++] ?? 1 });
            })(),
            applyDamage: async () => {},
            localize: (k) => k,
            getScene: () => null
        });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false,
            perCombatant: {},
            reactionRuntime: { consumedKeys: new Set() }
        });

        // Dodge total = 8+0 = 8 < to-hit 15 → attack lands
        assert.equal(outcome.result, "hit");
    });

    it("does not check dodge when the reaction is already consumed", async () => {
        const attacker = makeCombatant("c1", "Alice", makeActor("a1"), sameSpotToken("t1"));
        const target = makeCombatant("c2", "Bob", makeActor("a2", { armorClass: 8 }), sameSpotToken("t2"));

        const dodgeReaction = {
            action: { label: "Dodge" },
            actionIndex: 0,
            startTick: 1,
            consumed: true   // already spent
        };

        const rollLog = [];
        const resolver = new AttackResolver({
            resolveDeclaredTarget: () => target,
            isCombatantIncapacitated: () => false,
            resolveTokenDocument: (c) => c.token,
            selectCriticalFailureTarget: () => target,
            findReactionAtTick: () => dodgeReaction,
            consumeReactionWindow: () => true,
            roll: async () => { const t = rollLog.length === 0 ? 12 : 5; rollLog.push(t); return { total: t }; },
            applyDamage: async () => {},
            localize: (k) => k,
            getScene: () => null
        });

        const outcome = await resolver.resolveAttack({
            combatant: attacker,
            action: makeAction({ targetId: "c2", rangeType: "melee" }),
            evaluationSnapshot: null,
            applyEffects: false,
            perCombatant: {},
            reactionRuntime: { consumedKeys: new Set() }
        });

        // consumed reaction → no second roll → hit or miss based purely on to-hit
        assert.ok(["hit", "miss"].includes(outcome.result));
        // Only 2 rolls: to-hit + damage (no dodge roll)
        assert.equal(rollLog.length, 2);
    });
});
