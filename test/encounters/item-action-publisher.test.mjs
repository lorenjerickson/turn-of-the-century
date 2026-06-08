/**
 * Tests for module/encounters/item-action-publisher.mjs
 *
 * item-action-publisher.mjs imports from action-template.mjs, which
 * destructures foundry.data.fields at module-evaluation time.  We set
 * up the mock before the first dynamic import.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

// ---------------------------------------------------------------------------
// Foundry mock — must be installed before any import of action-template.mjs
// ---------------------------------------------------------------------------

class MockStringField  { constructor(o) { this.opts = o; } }
class MockNumberField  { constructor(o) { this.opts = o; } }
class MockBooleanField { constructor(o) { this.opts = o; } }
class MockHTMLField    { constructor(o) { this.opts = o; } }
class MockArrayField   { constructor(e, o) { this.element = e; this.opts = o; } }
class MockSchemaField  { constructor(f) { this.fields = f; } }

// Only set if not already set by another test file (module cache is shared
// within a single test run).
if (!globalThis.foundry) {
    globalThis.foundry = {
        utils: {},
        data: {
            fields: {
                StringField:  MockStringField,
                NumberField:  MockNumberField,
                BooleanField: MockBooleanField,
                HTMLField:    MockHTMLField,
                ArrayField:   MockArrayField,
                SchemaField:  MockSchemaField
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Module under test — dynamically imported after globals are set
// ---------------------------------------------------------------------------

let buildUniversalActions, getEnabledActionsForItem, getEnabledActionsForActor;

before(async () => {
    ({ buildUniversalActions, getEnabledActionsForItem, getEnabledActionsForActor } =
        await import("../../module/encounters/item-action-publisher.mjs"));
});

// ---------------------------------------------------------------------------
// Helpers for building mock items/actors
// ---------------------------------------------------------------------------

function mockWeaponItem({
    id = "item-001",
    name = "Test Weapon",
    variants = [],
    description = ""
} = {}) {
    return {
        id,
        name,
        system: {
            description,
            actions: { variants }
        }
    };
}

function mockActor(items = []) {
    return { items: { contents: items } };
}

/** Fully-loaded revolver mock */
function loadedRevolver() {
    return {
        id: "revolver-01",
        name: "Service Revolver",
        system: {
            description: "A six-shot sidearm.",
            ammunition: { loaded: 6, capacity: 6 },
            actions: {
                variants: [
                    {
                        id: "quickShot",
                        type: "attack",
                        label: "Quick Shot",
                        apCost: 2,
                        requiresToHit: true,
                        toHitBonus: -2,
                        requirements: [{ field: "system.ammunition.loaded", op: "gt", value: 0, fieldRef: "" }]
                    },
                    {
                        id: "aimedShot",
                        type: "attack",
                        label: "Aim and Fire",
                        apCost: 3,
                        requiresToHit: true,
                        toHitBonus: 0,
                        requirements: [{ field: "system.ammunition.loaded", op: "gt", value: 0, fieldRef: "" }]
                    },
                    {
                        id: "reload",
                        type: "utility",
                        label: "Reload",
                        apCost: 2,
                        requiresToHit: false,
                        toHitBonus: 0,
                        requirements: [{ field: "system.ammunition.loaded", op: "lt", value: 0, fieldRef: "system.ammunition.capacity" }]
                    }
                ]
            }
        }
    };
}

/** Empty revolver (all shots fired, needs reload) */
function emptyRevolver() {
    const r = loadedRevolver();
    r.system.ammunition.loaded = 0;
    return r;
}

// ---------------------------------------------------------------------------
// buildUniversalActions
// ---------------------------------------------------------------------------

describe("buildUniversalActions", () => {
    it("returns move and defend actions", () => {
        const actions = buildUniversalActions();
        const ids = actions.map((a) => a.id);
        assert.ok(ids.includes("move"),   "missing move");
        assert.ok(ids.includes("defend"), "missing defend");
    });

    it("both actions have variableAp = true", () => {
        const actions = buildUniversalActions();
        assert.ok(actions.every((a) => a.variableAp === true));
    });

    it("apMax is bounded by the supplied apBudget", () => {
        const actions = buildUniversalActions({ apBudget: 4 });
        assert.ok(actions.every((a) => a.apMax === 4));
    });

    it("move action carries movementFeetPerAp", () => {
        const actions = buildUniversalActions({ movementFeetPerAp: 15 });
        const move = actions.find((a) => a.id === "move");
        assert.equal(move.movementFeetPerAp, 15);
        assert.equal(move.movementFeet, 15);
    });

    it("defend action has movementFeet = 0", () => {
        const actions = buildUniversalActions();
        const defend = actions.find((a) => a.id === "defend");
        assert.equal(defend.movementFeet, 0);
    });

    it("both actions have itemId = null", () => {
        const actions = buildUniversalActions();
        assert.ok(actions.every((a) => a.itemId === null));
    });

    it("defaults apBudget to 6 and movementFeetPerAp to 10", () => {
        const actions = buildUniversalActions();
        assert.ok(actions.every((a) => a.apMax === 6));
        const move = actions.find((a) => a.id === "move");
        assert.equal(move.movementFeetPerAp, 10);
    });
});

// ---------------------------------------------------------------------------
// getEnabledActionsForItem
// ---------------------------------------------------------------------------

describe("getEnabledActionsForItem", () => {
    it("returns empty array when item has no variants", () => {
        const item = mockWeaponItem({ variants: [] });
        assert.deepEqual(getEnabledActionsForItem(item), []);
    });

    it("returns empty array when item.system is undefined", () => {
        assert.deepEqual(getEnabledActionsForItem({ id: "x", name: "X" }), []);
    });

    it("returns all variants when requirements array is empty", () => {
        const item = mockWeaponItem({
            variants: [
                { id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }
            ]
        });
        const actions = getEnabledActionsForItem(item);
        assert.equal(actions.length, 1);
    });

    it("namespaces action id as itemId:variantId", () => {
        const item = mockWeaponItem({
            id: "abc",
            variants: [{ id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        assert.equal(getEnabledActionsForItem(item)[0].id, "abc:meleeStrike");
    });

    it("preserves actionId (variant id without namespace)", () => {
        const item = mockWeaponItem({
            id: "abc",
            variants: [{ id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        assert.equal(getEnabledActionsForItem(item)[0].actionId, "meleeStrike");
    });

    it("prefixes label with item name", () => {
        const item = mockWeaponItem({
            name: "Iron Fist",
            variants: [{ id: "punch", type: "attack", label: "Punch", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        assert.equal(getEnabledActionsForItem(item)[0].label, "Iron Fist: Punch");
    });

    it("includes attack actions when ammo requirement is satisfied (loaded revolver)", () => {
        const item = loadedRevolver();
        const actions = getEnabledActionsForItem(item);
        const ids = actions.map((a) => a.actionId);
        assert.ok(ids.includes("quickShot"), "quickShot should be enabled");
        assert.ok(ids.includes("aimedShot"), "aimedShot should be enabled");
    });

    it("excludes attack actions when ammo requirement is not satisfied (empty revolver)", () => {
        const item = emptyRevolver();
        const actions = getEnabledActionsForItem(item);
        const ids = actions.map((a) => a.actionId);
        assert.ok(!ids.includes("quickShot"), "quickShot should be disabled when empty");
        assert.ok(!ids.includes("aimedShot"), "aimedShot should be disabled when empty");
    });

    it("includes reload when weapon is not fully loaded", () => {
        const item = emptyRevolver();
        const actions = getEnabledActionsForItem(item);
        const ids = actions.map((a) => a.actionId);
        assert.ok(ids.includes("reload"), "reload should be enabled when empty");
    });

    it("excludes reload when weapon is fully loaded", () => {
        const item = loadedRevolver();
        const actions = getEnabledActionsForItem(item);
        const ids = actions.map((a) => a.actionId);
        assert.ok(!ids.includes("reload"), "reload should be disabled when fully loaded");
    });

    it("sets itemId on each returned action", () => {
        const item = mockWeaponItem({
            id: "item-99",
            variants: [{ id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        assert.equal(getEnabledActionsForItem(item)[0].itemId, "item-99");
    });
});

// ---------------------------------------------------------------------------
// getEnabledActionsForActor
// ---------------------------------------------------------------------------

describe("getEnabledActionsForActor", () => {
    it("returns only universal actions when actor has no items", () => {
        const actor = mockActor([]);
        const actions = getEnabledActionsForActor(actor);
        assert.equal(actions.length, 2);
        assert.ok(actions.some((a) => a.id === "move"));
        assert.ok(actions.some((a) => a.id === "defend"));
    });

    it("returns universal actions when actor.items.contents is missing", () => {
        const actions = getEnabledActionsForActor({});
        assert.equal(actions.length, 2);
    });

    it("returns universal actions when actor is null/undefined", () => {
        assert.equal(getEnabledActionsForActor(null).length,      2);
        assert.equal(getEnabledActionsForActor(undefined).length, 2);
    });

    it("prepends universal actions before item actions", () => {
        const item = mockWeaponItem({
            variants: [{ id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        const actor = mockActor([item]);
        const actions = getEnabledActionsForActor(actor);
        assert.equal(actions[0].id, "move");
        assert.equal(actions[1].id, "defend");
    });

    it("aggregates enabled actions from multiple items", () => {
        const sword = mockWeaponItem({
            id: "sword",
            variants: [{ id: "meleeStrike", type: "attack", label: "Strike", apCost: 1, requiresToHit: true, toHitBonus: 0, requirements: [] }]
        });
        const revolver = loadedRevolver();
        const actor = mockActor([sword, revolver]);
        const actions = getEnabledActionsForActor(actor);

        const ids = actions.map((a) => a.actionId ?? a.id);
        assert.ok(ids.includes("move"),       "missing move");
        assert.ok(ids.includes("defend"),     "missing defend");
        assert.ok(ids.includes("meleeStrike"),"missing meleeStrike");
        assert.ok(ids.includes("quickShot"),  "missing quickShot");
        assert.ok(ids.includes("aimedShot"),  "missing aimedShot");
    });

    it("respects item-level requirement filtering (empty revolver excludes shots)", () => {
        const actor = mockActor([emptyRevolver()]);
        const actions = getEnabledActionsForActor(actor);
        const actionIds = actions.map((a) => a.actionId);
        assert.ok(!actionIds.includes("quickShot"), "quickShot should be filtered");
        assert.ok(!actionIds.includes("aimedShot"), "aimedShot should be filtered");
        assert.ok(actionIds.includes("reload"),     "reload should remain enabled");
    });

    it("respects apBudget and movementFeetPerAp options", () => {
        const actor = mockActor([]);
        const actions = getEnabledActionsForActor(actor, { apBudget: 8, movementFeetPerAp: 20 });
        const move = actions.find((a) => a.id === "move");
        assert.equal(move.apMax, 8);
        assert.equal(move.movementFeetPerAp, 20);
    });
});
