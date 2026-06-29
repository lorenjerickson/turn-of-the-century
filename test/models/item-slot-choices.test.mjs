import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

class MockField {
    constructor(options = {}) {
        this.options = options;
    }
}

class MockArrayField extends MockField {
    constructor(element, options = {}) {
        super(options);
        this.element = element;
    }
}

class MockSchemaField extends MockField {
    constructor(fields) {
        super();
        this.fields = fields;
    }
}

async function loadArmorModel() {
    const moduleUrl = new URL(`../../module/models/armor.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

beforeEach(() => {
    globalThis.foundry = {
        abstract: { TypeDataModel: class {} },
        data: {
            fields: {
                ArrayField: MockArrayField,
                BooleanField: MockField,
                HTMLField: MockField,
                NumberField: MockField,
                SchemaField: MockSchemaField,
                StringField: MockField
            }
        }
    };
});

describe("item slot choices", () => {
    it("keeps legacy hands valid for armor documents until migration retargets hand armor", async () => {
        const { ArmorDataModel, TOTC_ARMOR_SLOT_CHOICES } = await loadArmorModel();
        const schema = ArmorDataModel.defineSchema();

        assert.ok(TOTC_ARMOR_SLOT_CHOICES.includes("hands"), "legacy hand armor must initialize before migration");
        assert.ok(TOTC_ARMOR_SLOT_CHOICES.includes("handsArmor"), "new shared hand armor slot should be valid");
        assert.deepEqual(schema.slot.options.choices, TOTC_ARMOR_SLOT_CHOICES);
    });
});
