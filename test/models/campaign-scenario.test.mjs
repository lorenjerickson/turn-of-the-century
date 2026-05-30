import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const MockStringField = class {};
const MockHTMLField = class {};
const MockArrayField = class {};
const MockSchemaField = class {};
const MockBooleanField = class {};
const MockTypeDataModel = class {
    constructor(data) { this.data = data; }
};

describe("Data Models", () => {
    let originalFoundry;

    beforeEach(() => {
        originalFoundry = globalThis.foundry;
        globalThis.foundry = {
            abstract: { TypeDataModel: MockTypeDataModel },
            data: {
                fields: {
                    StringField: MockStringField,
                    HTMLField: MockHTMLField,
                    ArrayField: MockArrayField,
                    SchemaField: MockSchemaField,
                    BooleanField: MockBooleanField
                }
            }
        };
    });

    afterEach(() => {
        globalThis.foundry = originalFoundry;
    });

    it("should define a valid schema for CampaignDataModel", async () => {
        const { CampaignDataModel } = await import("../../module/models/campaign.mjs");
        const schema = CampaignDataModel.defineSchema();
        assert.ok(schema.setting instanceof MockStringField);
        assert.ok(schema.era instanceof MockStringField);
        assert.ok(schema.socialClimate instanceof MockHTMLField);
        assert.ok(schema.antagonist instanceof MockSchemaField);
        assert.ok(schema.scenarios instanceof MockArrayField);
    });

    it("should define a valid schema for ScenarioDataModel", async () => {
        const { ScenarioDataModel } = await import("../../module/models/scenario.mjs");
        const schema = ScenarioDataModel.defineSchema();
        assert.ok(schema.campaignId instanceof MockStringField);
        assert.ok(schema.resolutionCriteria instanceof MockHTMLField);
        assert.ok(schema.encounters instanceof MockArrayField);
    });

    it("should define a valid schema for EncounterDesignDataModel", async () => {
        const { EncounterDesignDataModel } = await import("../../module/models/encounter-design.mjs");
        const schema = EncounterDesignDataModel.defineSchema();
        assert.ok(schema.scenarioId instanceof MockStringField);
        assert.ok(schema.npcs instanceof MockArrayField);
    });

    it("should define a valid schema for LocationDataModel", async () => {
        const { LocationDataModel } = await import("../../module/models/location.mjs");
        const schema = LocationDataModel.defineSchema();
        assert.ok(schema.description instanceof MockHTMLField);
        assert.ok(schema.locationType instanceof MockStringField);
        assert.ok(schema.parentLocationId instanceof MockStringField);
        assert.ok(schema.features instanceof MockArrayField);
    });
});
