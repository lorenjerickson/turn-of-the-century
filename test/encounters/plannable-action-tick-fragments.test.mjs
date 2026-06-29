import assert from "node:assert/strict";
import { describe, it } from "node:test";

class MockStringField { constructor(options) { this.options = options; } }
class MockNumberField { constructor(options) { this.options = options; } }
class MockBooleanField { constructor(options) { this.options = options; } }
class MockHTMLField { constructor(options) { this.options = options; } }
class MockArrayField { constructor(element, options) { this.element = element; this.options = options; } }
class MockSchemaField { constructor(fields) { this.fields = fields; } }

globalThis.foundry = {
    utils: {
        deepClone: (value) => structuredClone(value)
    },
    data: {
        fields: {
            StringField: MockStringField,
            NumberField: MockNumberField,
            BooleanField: MockBooleanField,
            HTMLField: MockHTMLField,
            ArrayField: MockArrayField,
            SchemaField: MockSchemaField
        }
    }
};

const { ARMOR_CONFIGS } = await import("../../module/content/armor.mjs");
const { CONSUMABLE_CONFIGS } = await import("../../module/content/consumables.mjs");
const { EQUIPMENT_CONFIGS } = await import("../../module/content/equipment.mjs");
const { ITEM_CONFIGS } = await import("../../module/content/items.mjs");
const { WEAPON_CONFIGS } = await import("../../module/content/weapons.mjs");
const { buildUniversalActions } = await import("../../module/encounters/item-action-publisher.mjs");

function plannableItemVariants() {
    return [
        ...ARMOR_CONFIGS,
        ...CONSUMABLE_CONFIGS,
        ...EQUIPMENT_CONFIGS,
        ...ITEM_CONFIGS,
        ...WEAPON_CONFIGS
    ].flatMap((item) => (
        (item.system?.actions?.variants ?? []).map((variant) => ({ item, variant }))
    ));
}

function nonBlankStrings(value) {
    return Array.isArray(value)
        ? value.filter((entry) => String(entry ?? "").trim())
        : [];
}

describe("plannable action tick fragments", () => {
    it("gives every fixed-cost starter item action one tick fragment per AP", () => {
        const variants = plannableItemVariants();

        assert.ok(variants.length > 0, "starter content should contain plannable item actions");
        for (const { item, variant } of variants) {
            const fragments = nonBlankStrings(variant.tickNarrativeFragments);
            assert.equal(
                fragments.length,
                Number(variant.apCost ?? 1),
                `${item.name}:${variant.id} should have one tick fragment per AP`
            );
        }
    });

    it("gives every universal action at least one repeatable tick fragment", () => {
        const actions = buildUniversalActions({ apBudget: 6, movementFeetPerAp: 10 });

        assert.ok(actions.length > 0, "universal action catalog should publish actions");
        for (const action of actions) {
            assert.ok(
                nonBlankStrings(action.tickNarrativeFragments).length >= 1,
                `${action.id} should have at least one tick fragment`
            );
        }
    });
});
