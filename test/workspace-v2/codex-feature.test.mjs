import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildItemDataFromCodexForm,
    buildItemUpdateDataFromCodexForm
} from "../../module/ui/workspace-v2/controllers/codex-feature.mjs";

describe("CodexFeature item payload helpers", () => {
    it("keeps type on create payloads", () => {
        const payload = buildItemDataFromCodexForm({
            type: "weapon",
            name: "Shock Baton",
            img: "icons/baton.svg",
            "system.actions.variants.0.id": "strike"
        });

        assert.equal(payload.type, "weapon");
        assert.equal(payload.system.actions.variants[0].id, "strike");
    });

    it("omits type on update payloads so Foundry does not treat edits as document type changes", () => {
        const payload = buildItemUpdateDataFromCodexForm({
            type: "weapon",
            name: "Shock Baton",
            img: "icons/baton.svg",
            "system.actions.variants.0.id": "strike",
            "system.actions.variants.0.effects.0.condition": "stunned"
        });

        assert.equal(Object.hasOwn(payload, "type"), false);
        assert.equal(payload.name, "Shock Baton");
        assert.equal(payload.system.actions.variants[0].id, "strike");
        assert.equal(payload.system.actions.variants[0].effects[0].condition, "stunned");
    });

    it("keeps only effect-system fields when saving effect documents", () => {
        const payload = buildItemUpdateDataFromCodexForm({
            type: "effect",
            name: "Fogged Judgment",
            img: "icons/fog.svg",
            "system.description": "Thinking becomes unreliable.",
            "system.category": "mental",
            "system.disposition": "detrimental",
            "system.duration.value": "1",
            "system.duration.unit": "scene",
            "system.slot": "hands",
            "system.actions.variants.0.id": "shouldNotPersist"
        });

        assert.equal(Object.hasOwn(payload, "type"), false);
        assert.equal(payload.system.category, "mental");
        assert.equal(payload.system.disposition, "detrimental");
        assert.equal(payload.system.duration.value, 1);
        assert.equal(payload.system.duration.unit, "scene");
        assert.equal(Object.hasOwn(payload.system, "slot"), false);
        assert.equal(Object.hasOwn(payload.system, "actions"), false);
    });
});
