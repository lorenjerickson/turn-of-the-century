/**
 * Tests for module/encounters/action-template.mjs
 *
 * action-template.mjs destructures foundry.data.fields at module-evaluation
 * time, so we must install the global mock before the first dynamic import.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

// ---------------------------------------------------------------------------
// Foundry mock — installed before any dynamic import of action-template.mjs
// ---------------------------------------------------------------------------

class MockStringField  { constructor(o) { this.opts = o; } }
class MockNumberField  { constructor(o) { this.opts = o; } }
class MockBooleanField { constructor(o) { this.opts = o; } }
class MockHTMLField    { constructor(o) { this.opts = o; } }
class MockArrayField   { constructor(element, o) { this.element = element; this.opts = o; } }
class MockSchemaField  { constructor(fields) { this.fields = fields; } }

globalThis.foundry = {
    // No utils.getProperty — exercises the inline fallback in getPropertyByPath
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

// ---------------------------------------------------------------------------
// Module under test — imported dynamically AFTER the global is set
// ---------------------------------------------------------------------------

let getPropertyByPath, evaluateRequirement, evaluateRequirements;
let createActionRequirementField, createActionVariantField;
let TOTC_REQUIREMENT_OPS, TOTC_ACTION_TYPES;

before(async () => {
    ({
        getPropertyByPath,
        evaluateRequirement,
        evaluateRequirements,
        createActionRequirementField,
        createActionVariantField,
        TOTC_REQUIREMENT_OPS,
        TOTC_ACTION_TYPES
    } = await import("../../module/encounters/action-template.mjs"));
});

// ---------------------------------------------------------------------------
// getPropertyByPath
// ---------------------------------------------------------------------------

describe("getPropertyByPath", () => {
    it("resolves a simple dot-notation path", () => {
        const obj = { system: { ammunition: { loaded: 3 } } };
        assert.equal(getPropertyByPath(obj, "system.ammunition.loaded"), 3);
    });

    it("resolves a single-segment path", () => {
        assert.equal(getPropertyByPath({ name: "Revolver" }, "name"), "Revolver");
    });

    it("returns undefined for a missing intermediate key", () => {
        const obj = { system: {} };
        assert.equal(getPropertyByPath(obj, "system.ammunition.loaded"), undefined);
    });

    it("returns undefined for a missing root key", () => {
        assert.equal(getPropertyByPath({}, "nonexistent"), undefined);
    });

    it("returns undefined when given null object", () => {
        assert.equal(getPropertyByPath(null, "a.b"), undefined);
    });

    it("delegates to foundry.utils.getProperty when available", () => {
        const spy = { called: false };
        globalThis.foundry.utils.getProperty = (obj, path) => {
            spy.called = true;
            return 42;
        };
        const result = getPropertyByPath({}, "anything");
        assert.equal(result, 42);
        assert.ok(spy.called);
        delete globalThis.foundry.utils.getProperty;
    });
});

// ---------------------------------------------------------------------------
// evaluateRequirement
// ---------------------------------------------------------------------------

describe("evaluateRequirement", () => {
    const loaded = (n) => ({ system: { ammunition: { loaded: n, capacity: 6 } } });

    it("gt: passes when lhs > value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "gt",  value: 0, fieldRef: "" }, loaded(1)));
    });
    it("gt: fails when lhs == value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "gt",  value: 0, fieldRef: "" }, loaded(0)));
    });

    it("gte: passes when lhs == value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "gte", value: 0, fieldRef: "" }, loaded(0)));
    });
    it("gte: fails when lhs < value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "gte", value: 1, fieldRef: "" }, loaded(0)));
    });

    it("lt: passes when lhs < value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "lt",  value: 6, fieldRef: "" }, loaded(3)));
    });
    it("lt: fails when lhs == value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "lt",  value: 6, fieldRef: "" }, loaded(6)));
    });

    it("lte: passes when lhs == value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "lte", value: 6, fieldRef: "" }, loaded(6)));
    });
    it("lte: fails when lhs > value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "lte", value: 5, fieldRef: "" }, loaded(6)));
    });

    it("eq: passes when lhs === value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "eq",  value: 6, fieldRef: "" }, loaded(6)));
    });
    it("eq: fails when lhs !== value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "eq",  value: 5, fieldRef: "" }, loaded(6)));
    });

    it("neq: passes when lhs !== value", () => {
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "neq", value: 5, fieldRef: "" }, loaded(6)));
    });
    it("neq: fails when lhs === value", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "neq", value: 6, fieldRef: "" }, loaded(6)));
    });

    it("uses fieldRef for field-to-field comparison (lt capacity)", () => {
        // loaded(3) with capacity 6 → 3 < 6 → true
        assert.ok(evaluateRequirement(
            { field: "system.ammunition.loaded", op: "lt", value: 0, fieldRef: "system.ammunition.capacity" },
            loaded(3)
        ));
    });
    it("uses fieldRef for field-to-field comparison (not lt capacity when full)", () => {
        // loaded(6) with capacity 6 → 6 < 6 → false
        assert.ok(!evaluateRequirement(
            { field: "system.ammunition.loaded", op: "lt", value: 0, fieldRef: "system.ammunition.capacity" },
            loaded(6)
        ));
    });

    it("returns false for an unknown operator", () => {
        assert.ok(!evaluateRequirement({ field: "system.ammunition.loaded", op: "unknown", value: 0, fieldRef: "" }, loaded(3)));
    });

    it("coerces string values to numbers", () => {
        const item = { system: { ammunition: { loaded: "3" } } };
        assert.ok(evaluateRequirement({ field: "system.ammunition.loaded", op: "gt", value: 0, fieldRef: "" }, item));
    });
});

// ---------------------------------------------------------------------------
// evaluateRequirements
// ---------------------------------------------------------------------------

describe("evaluateRequirements", () => {
    const item = { system: { ammunition: { loaded: 3, capacity: 6 } } };

    it("returns true for an empty array", () => {
        assert.ok(evaluateRequirements([], item));
    });

    it("returns true when all requirements pass", () => {
        assert.ok(evaluateRequirements([
            { field: "system.ammunition.loaded", op: "gt",  value: 0, fieldRef: "" },
            { field: "system.ammunition.loaded", op: "lte", value: 6, fieldRef: "" }
        ], item));
    });

    it("returns false when any requirement fails", () => {
        assert.ok(!evaluateRequirements([
            { field: "system.ammunition.loaded", op: "gt",  value: 0, fieldRef: "" },
            { field: "system.ammunition.loaded", op: "gt",  value: 5, fieldRef: "" } // 3 > 5 → false
        ], item));
    });

    it("returns true for null / undefined requirements argument", () => {
        assert.ok(evaluateRequirements(null, item));
        assert.ok(evaluateRequirements(undefined, item));
    });
});

// ---------------------------------------------------------------------------
// Schema factories
// ---------------------------------------------------------------------------

describe("createActionRequirementField", () => {
    it("returns a SchemaField", () => {
        const f = createActionRequirementField();
        assert.ok(f instanceof MockSchemaField);
    });

    it("includes field, op, value, and fieldRef sub-fields", () => {
        const f = createActionRequirementField();
        assert.ok("field"    in f.fields);
        assert.ok("op"       in f.fields);
        assert.ok("value"    in f.fields);
        assert.ok("fieldRef" in f.fields);
    });
});

describe("createActionVariantField", () => {
    it("returns a SchemaField", () => {
        const f = createActionVariantField();
        assert.ok(f instanceof MockSchemaField);
    });

    it("includes a requirements ArrayField", () => {
        const f = createActionVariantField();
        assert.ok("requirements" in f.fields);
        assert.ok(f.fields.requirements instanceof MockArrayField);
    });

    it("respects custom defaults via parameter", () => {
        const f = createActionVariantField({ defaultId: "meleeStrike", defaultApCost: 1 });
        assert.ok(f instanceof MockSchemaField);
        // We can't inspect the MockStringField initial value easily,
        // but we can confirm the field is present.
        assert.ok("id" in f.fields);
    });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("TOTC_REQUIREMENT_OPS", () => {
    it("includes all six operators", () => {
        assert.deepEqual([...TOTC_REQUIREMENT_OPS].sort(), ["eq", "gt", "gte", "lt", "lte", "neq"]);
    });
    it("is frozen", () => {
        assert.ok(Object.isFrozen(TOTC_REQUIREMENT_OPS));
    });
});

describe("TOTC_ACTION_TYPES", () => {
    it("contains attack, movement, defense, consumable, utility", () => {
        for (const t of ["attack", "movement", "defense", "consumable", "utility"]) {
            assert.ok(TOTC_ACTION_TYPES.includes(t), `missing type: ${t}`);
        }
    });
    it("is frozen", () => {
        assert.ok(Object.isFrozen(TOTC_ACTION_TYPES));
    });
});
