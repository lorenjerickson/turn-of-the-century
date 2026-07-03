import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildCodexPanelModel,
    renderCodexPanel
} from "../../module/ui/workspace-v2/panels/codex-panel.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const entries = [
    {
        uuid: "Compendium.turn-of-the-century.weapons.pistol",
        name: "Pocket Pistol",
        type: "weapon",
        img: "icons/pistol.svg",
        description: "A compact defensive firearm.",
        packLabel: "Weapons"
    },
    {
        uuid: "Compendium.turn-of-the-century.equipment.locket",
        name: "Engraved Locket",
        type: "item",
        img: "",
        description: "A sentimental keepsake.",
        packLabel: "Equipment"
    }
];

describe("Codex panel", () => {
    it("renders a split list and detail view with GM-only controls", () => {
        const model = buildCodexPanelModel({
            items: entries,
            state: {
                selectedUuid: "Compendium.turn-of-the-century.weapons.pistol",
                mode: "view"
            },
            isGM: true
        });

        const html = renderCodexPanel(model, { escapeHTML });

        assert.match(html, /data-action="codex-add-item"/);
        assert.match(html, /totc-v2-codex-panel__body/);
        assert.match(html, /totc-v2-codex-panel__list/);
        assert.match(html, /totc-v2-codex-panel__detail/);
        assert.match(html, /Pocket Pistol/);
        assert.match(html, /A compact defensive firearm/);
        assert.match(html, /data-action="codex-edit-item"/);
    });

    it("hides add and edit controls from players", () => {
        const model = buildCodexPanelModel({
            items: entries,
            state: {
                selectedUuid: "Compendium.turn-of-the-century.weapons.pistol",
                mode: "view"
            },
            isGM: false
        });

        const html = renderCodexPanel(model, { escapeHTML });

        assert.doesNotMatch(html, /data-action="codex-add-item"/);
        assert.doesNotMatch(html, /data-action="codex-edit-item"/);
        assert.match(html, /Pocket Pistol/);
    });

    it("renders a type-specific creation editor with a save item button", () => {
        const model = buildCodexPanelModel({
            items: entries,
            state: {
                mode: "create",
                form: {
                    type: "weapon",
                    name: "Cane Sword",
                    img: "icons/cane-sword.svg",
                    "system.description": "A gentleman's deception.",
                    "system.damage.formula": "1d6",
                    "system.damage.type": "piercing"
                }
            },
            isGM: true
        });

        const html = renderCodexPanel(model, { escapeHTML });

        assert.match(html, /New Codex Item/);
        assert.match(html, /Save Item/);
        assert.match(html, /data-action="codex-save-item"/);
        assert.match(html, /data-action="codex-edit-type"/);
        assert.match(html, /name="system\.damage\.formula"/);
        assert.match(html, /value="1d6"/);
        assert.doesNotMatch(html, /name="system\.armorClass\.increment"/);
    });

    it("renders nested action and effect editor stack frames", () => {
        const form = {
            type: "weapon",
            name: "Shock Baton",
            "system.actions.variants.0.id": "strike",
            "system.actions.variants.0.label": "Strike",
            "system.actions.variants.0.type": "attack",
            "system.actions.variants.0.apCost": "2",
            "system.actions.variants.0.rangeType": "melee",
            "system.actions.variants.0.targetingRangeFeet": "5",
            "system.actions.variants.0.effects.0.id": "stun",
            "system.actions.variants.0.effects.0.label": "Stun",
            "system.actions.variants.0.effects.0.type": "condition",
            "system.actions.variants.0.effects.0.target": "target",
            "system.actions.variants.0.effects.0.path": "system.resources.health.value",
            "system.actions.variants.0.effects.0.save.ability": "dex"
        };

        const actionHtml = renderCodexPanel(buildCodexPanelModel({
            items: entries,
            state: {
                mode: "edit",
                form,
                editorStack: [{ type: "item" }, { type: "action", actionIndex: 0 }]
            },
            isGM: true
        }), { escapeHTML });

        assert.match(actionHtml, /Edit Action/);
        assert.match(actionHtml, /data-action="codex-add-effect"/);
        assert.match(actionHtml, /data-action="codex-edit-effect"/);
        assert.match(actionHtml, /name="system\.actions\.variants\.0\.targetingRangeFeet"/);
        assert.match(actionHtml, /value="5"/);
        assert.match(actionHtml, /Save Item/);

        const effectHtml = renderCodexPanel(buildCodexPanelModel({
            items: entries,
            state: {
                mode: "edit",
                form,
                editorStack: [{ type: "item" }, { type: "action", actionIndex: 0 }, { type: "effect", actionIndex: 0, effectIndex: 0 }]
            },
            isGM: true
        }), { escapeHTML });

        assert.match(effectHtml, /Edit Effect/);
        assert.match(effectHtml, /name="system\.actions\.variants\.0\.effects\.0\.target"/);
        assert.match(effectHtml, /<select name="system\.actions\.variants\.0\.effects\.0\.path">/);
        assert.match(effectHtml, /<option value="system\.resources\.health\.value" selected>Health<\/option>/);
        assert.match(effectHtml, /<option value="system\.abilities\.san\.value">Sanity<\/option>/);
        assert.match(effectHtml, /<option value="system\.movement\.walk">Walking Speed<\/option>/);
        assert.match(effectHtml, /<select name="system\.actions\.variants\.0\.effects\.0\.save\.ability">/);
        assert.match(effectHtml, /<option value="dex" selected>Dex<\/option>/);
        assert.match(effectHtml, /<option value="san">San<\/option>/);
        assert.match(effectHtml, /Back to Action/);
    });

    it("renders effect documents with effect-specific fields", () => {
        const model = buildCodexPanelModel({
            items: entries,
            state: {
                mode: "edit",
                form: {
                    type: "effect",
                    name: "Fogged Judgment",
                    "system.description": "Thinking becomes unreliable.",
                    "system.category": "mental",
                    "system.disposition": "detrimental",
                    "system.duration.value": "1",
                    "system.duration.unit": "scene"
                }
            },
            isGM: true
        });

        const html = renderCodexPanel(model, { escapeHTML });

        assert.match(html, /Edit Codex Item/);
        assert.match(html, /<option value="mental" selected>Mental<\/option>/);
        assert.match(html, /name="system\.disposition"/);
        assert.match(html, /name="system\.duration\.unit"/);
        assert.doesNotMatch(html, /<option value="tool" selected>Tool<\/option>/);
        assert.doesNotMatch(html, /data-action="codex-add-action"/);
    });

    it("filters entries by search and type", () => {
        const model = buildCodexPanelModel({
            items: entries,
            searchQuery: "pocket",
            typeFilter: "weapon"
        });

        assert.equal(model.entries.length, 1);
        assert.equal(model.entries[0].name, "Pocket Pistol");
        assert.equal(model.isFiltered, true);
    });
});
