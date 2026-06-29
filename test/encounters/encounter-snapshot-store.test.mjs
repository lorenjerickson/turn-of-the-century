import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EncounterSnapshotStore } from "../../module/encounters/encounter-snapshot-store.mjs";

// ---------------------------------------------------------------------------
// Foundry globals required by the store (deepClone only for capture/apply)
// ---------------------------------------------------------------------------

beforeEach(() => {
    globalThis.foundry = {
        utils: {
            deepClone: (value) => structuredClone(value)
        }
    };
    // canvas and game.scenes are only exercised by apply()'s token fallback path.
    // Tests that exercise that path set them up explicitly.
    globalThis.canvas = undefined;
    globalThis.game = { scenes: { contents: [] } };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id, system = {}) {
    const updates = [];
    return {
        id,
        system: structuredClone(system),
        update: async (changes) => { updates.push(changes); },
        _updates: updates
    };
}

function makeActor(id, { health = 10, resources = null, items = [] } = {}) {
    const updates = [];
    const actor = {
        id,
        system: {
            resources: resources ?? { health: { value: health }, stamina: { value: 5 } }
        },
        items: {
            contents: items
        },
        update: async (changes) => { updates.push(changes); return actor; },
        _updates: updates
    };
    return actor;
}

function makeCombatant(id, tokenId, actor = null, tokenX = 0, tokenY = 0) {
    const token = {
        id: tokenId,
        x: tokenX,
        y: tokenY
    };
    return { id, tokenId, actor, token };
}

function makeStore(combatants = []) {
    return new EncounterSnapshotStore({
        combatants: { contents: combatants },
        resolveTokenDocument: (combatant) => combatant?.token ?? null
    });
}

// ---------------------------------------------------------------------------
// capture — actor state
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.capture — actor state", () => {
    it("records actor health from combatants", async () => {
        const actor = makeActor("a1", { health: 15 });
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });

        assert.equal(snapshot.actorHealth["a1"], 15);
    });

    it("records actor resources (deep cloned)", async () => {
        const resources = { health: { value: 10 }, stamina: { value: 3 } };
        const actor = makeActor("a1", { resources });
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });
        // Mutating original resources must not affect snapshot
        resources.health.value = 99;

        assert.equal(snapshot.actorResources["a1"].health.value, 10);
    });

    it("records item systems (deep cloned)", async () => {
        const itemSystem = { loaded: 2 };
        const item = makeItem("i1", itemSystem);
        const actor = makeActor("a1", { items: [item] });
        actor.items = { contents: [item] };
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });
        item.system.loaded = 99;

        assert.equal(snapshot.actorItemSystems["a1"]["i1"].loaded, 2);
    });

    it("omits items without an id", async () => {
        const item = { system: { loaded: 1 } }; // no id
        const actor = makeActor("a1");
        actor.items = { contents: [item] };
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });

        assert.deepEqual(snapshot.actorItemSystems["a1"], {});
    });

    it("skips combatants without an actor", async () => {
        const combatants = [makeCombatant("c1", "t1", null)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });

        assert.deepEqual(snapshot.actorHealth, {});
    });
});

// ---------------------------------------------------------------------------
// capture — token positions
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.capture — token positions", () => {
    it("records current token positions", async () => {
        const actor = makeActor("a1");
        const combatants = [makeCombatant("c1", "t1", actor, 100, 200)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({ tick: 1 });

        assert.deepEqual(snapshot.tokenPositions["t1"], { x: 100, y: 200 });
    });

    it("respects tokenPositionOverrides", async () => {
        const actor = makeActor("a1");
        const combatants = [makeCombatant("c1", "t1", actor, 100, 200)];
        const store = makeStore(combatants);

        const snapshot = await store.capture({
            tick: 1,
            tokenPositionOverrides: { t1: { x: 50, y: 75 } }
        });

        assert.deepEqual(snapshot.tokenPositions["t1"], { x: 50, y: 75 });
    });

    it("skips combatants whose token resolves to null", async () => {
        const storeNoToken = new EncounterSnapshotStore({
            combatants: { contents: [makeCombatant("c1", "t1", makeActor("a1"))] },
            resolveTokenDocument: () => null
        });

        const snapshot = await storeNoToken.capture({ tick: 1 });

        assert.deepEqual(snapshot.tokenPositions, {});
    });
});

// ---------------------------------------------------------------------------
// capture — envelope fields
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.capture — envelope", () => {
    it("sets tick on the snapshot", async () => {
        const store = makeStore();
        const snapshot = await store.capture({ tick: 3 });
        assert.equal(snapshot.tick, 3);
    });

    it("deep-clones timeline and perCombatant", async () => {
        const store = makeStore();
        const timeline = [{ tick: 1, action: { type: "movement" } }];
        const perCombatant = { c1: { plan: [] } };

        const snapshot = await store.capture({ tick: 1, timeline, perCombatant });

        timeline[0].action.type = "attack";
        perCombatant.c1.plan.push("x");

        assert.equal(snapshot.timeline[0].action.type, "movement");
        assert.deepEqual(snapshot.perCombatant.c1.plan, []);
    });

    it("preserves order clause metadata in timeline snapshots", async () => {
        const store = makeStore();
        const timeline = [{
            tick: 2,
            orderId: "order-strike",
            clauseId: "close",
            clauseType: "positioning",
            clauseText: "Close on Elias",
            clauseStatus: "active",
            relatedCombatantIds: ["c2"],
            action: { type: "movement" }
        }];

        const snapshot = await store.capture({ tick: 2, timeline });

        assert.equal(snapshot.timeline[0].orderId, "order-strike");
        assert.equal(snapshot.timeline[0].clauseId, "close");
        assert.deepEqual(snapshot.timeline[0].relatedCombatantIds, ["c2"]);
    });
});

// ---------------------------------------------------------------------------
// apply — actor health
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.apply — actor health", () => {
    it("updates actor health when it differs from snapshot", async () => {
        const actor = makeActor("a1", { health: 10 });
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        await store.apply({
            actorHealth: { a1: 7 },
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: {}
        });

        assert.equal(actor._updates.length, 1);
        assert.equal(actor._updates[0]["system.resources.health.value"], 7);
    });

    it("skips actor health update when value is unchanged", async () => {
        const actor = makeActor("a1", { health: 10 });
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        await store.apply({
            actorHealth: { a1: 10 },
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: {}
        });

        assert.equal(actor._updates.length, 0);
    });

    it("updates actor resources when they differ from snapshot", async () => {
        const resources = { health: { value: 10 }, stamina: { value: 5 } };
        const actor = makeActor("a1", { resources });
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        const snapshotResources = { health: { value: 10 }, stamina: { value: 3 } };
        await store.apply({
            actorHealth: {},
            actorResources: { a1: snapshotResources },
            actorItemSystems: {},
            tokenPositions: {}
        });

        const resourceUpdate = actor._updates.find((u) => u["system.resources"]);
        assert.ok(resourceUpdate, "expected a resource update");
        assert.equal(resourceUpdate["system.resources"].stamina.value, 3);
    });
});

// ---------------------------------------------------------------------------
// apply — item systems
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.apply — item systems", () => {
    it("updates item system when it differs from snapshot", async () => {
        const item = makeItem("i1", { loaded: 2 });
        const actor = makeActor("a1");
        actor.items = { contents: [item] };
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: { a1: { i1: { loaded: 1 } } },
            tokenPositions: {}
        });

        assert.equal(item._updates.length, 1);
        assert.equal(item._updates[0].system.loaded, 1);
    });

    it("skips item update when system is unchanged", async () => {
        const item = makeItem("i1", { loaded: 2 });
        const actor = makeActor("a1");
        actor.items = { contents: [item] };
        const combatants = [makeCombatant("c1", "t1", actor)];
        const store = makeStore(combatants);

        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: { a1: { i1: { loaded: 2 } } },
            tokenPositions: {}
        });

        assert.equal(item._updates.length, 0);
    });
});

// ---------------------------------------------------------------------------
// apply — token positions
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.apply — token positions", () => {
    it("updates token position when it differs from snapshot", async () => {
        const tokenUpdates = [];
        const tokenDoc = {
            id: "t1",
            x: 100,
            y: 100,
            update: async (changes) => { tokenUpdates.push(changes); }
        };
        const actor = makeActor("a1");
        const combatant = { id: "c1", tokenId: "t1", actor, token: tokenDoc };

        const store = new EncounterSnapshotStore({
            combatants: { contents: [combatant] },
            resolveTokenDocument: (c) => c?.token ?? null
        });

        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: { t1: { x: 200, y: 300 } }
        });

        assert.equal(tokenUpdates.length, 1);
        assert.deepEqual(tokenUpdates[0], { x: 200, y: 300 });
    });

    it("skips token update when position is unchanged", async () => {
        const tokenUpdates = [];
        const tokenDoc = {
            id: "t1",
            x: 100,
            y: 200,
            update: async (changes) => { tokenUpdates.push(changes); }
        };
        const actor = makeActor("a1");
        const combatant = { id: "c1", tokenId: "t1", actor, token: tokenDoc };

        const store = new EncounterSnapshotStore({
            combatants: { contents: [combatant] },
            resolveTokenDocument: (c) => c?.token ?? null
        });

        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: { t1: { x: 100, y: 200 } }
        });

        assert.equal(tokenUpdates.length, 0);
    });

    it("falls back to canvas.scene.tokens for tokenId not owned by a combatant", async () => {
        const tokenUpdates = [];
        const tokenDoc = {
            id: "orphan",
            x: 0,
            y: 0,
            update: async (changes) => { tokenUpdates.push(changes); }
        };
        globalThis.canvas = {
            scene: {
                tokens: {
                    get: (id) => (id === "orphan" ? tokenDoc : null)
                }
            },
            tokens: { placeables: [] }
        };

        const store = makeStore([]); // no combatants

        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: { orphan: { x: 50, y: 75 } }
        });

        assert.equal(tokenUpdates.length, 1);
        assert.deepEqual(tokenUpdates[0], { x: 50, y: 75 });
    });

    it("skips token entry when no document can be resolved", async () => {
        globalThis.canvas = {
            scene: { tokens: { get: () => null } },
            tokens: { placeables: [] }
        };

        const store = makeStore([]);

        // Should not throw
        await store.apply({
            actorHealth: {},
            actorResources: {},
            actorItemSystems: {},
            tokenPositions: { ghost: { x: 100, y: 100 } }
        });
    });
});

// ---------------------------------------------------------------------------
// apply — guard
// ---------------------------------------------------------------------------

describe("EncounterSnapshotStore.apply — guard", () => {
    it("returns without error when snapshot is null", async () => {
        const store = makeStore();
        await store.apply(null);
    });

    it("returns without error when snapshot is not an object", async () => {
        const store = makeStore();
        await store.apply("bad");
    });
});
