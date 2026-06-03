import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildActorEditorPanelModel,
    buildActorListPanelModel,
    buildActorUpdateDataFromFormData,
    buildGeneratedActorDocumentData,
    renderActorEditorPanel,
    renderActorListPanel
} from "../../module/ui/workspace-v2/panels/actor-management-panel.mjs";

const escapeHTML = (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

describe("Actor management panel", () => {
    it("sorts actors alphabetically by name and filters by actor name", () => {
        const actors = [
            { id: "b", name: "Zara Bell", type: "villain", system: { profile: { role: "Doctor" } } },
            { id: "a", name: "Ada Finch", type: "hero", system: { profile: { role: "Inspector" } } },
            { id: "c", name: "Morris Ward", type: "pawn", system: { profile: { role: "Porter" } } }
        ];

        const allModel = buildActorListPanelModel({ actors });
        assert.deepEqual(allModel.entries.map((entry) => entry.name), ["Ada Finch", "Morris Ward", "Zara Bell"]);

        const filteredModel = buildActorListPanelModel({ actors, query: "ward" });
        assert.equal(filteredModel.count, 1);
        assert.equal(filteredModel.entries[0].name, "Morris Ward");
    });

    it("renders the new actor control, search input, and selectable actors", () => {
        const model = buildActorListPanelModel({
            actors: [{ id: "a", name: "<Ada>", type: "hero", system: { profile: { role: "Inspector" } } }],
            selectedActorId: "a"
        });

        const html = renderActorListPanel(model, { escapeHTML });

        assert.match(html, /data-action="actor-list-new"/);
        assert.match(html, /data-action="actor-list-search"/);
        assert.match(html, /data-action="actor-list-select"/);
        assert.match(html, /is-selected/);
        assert.match(html, /&lt;Ada&gt;/);
        assert.doesNotMatch(html, /<Ada>/);
    });

    it("builds a create model with actor type options and prompt state", () => {
        const model = buildActorEditorPanelModel({
            state: { mode: "create", actorType: "villain", additionalPrompt: "railway patron" }
        });

        assert.equal(model.mode, "create");
        assert.equal(model.actorType, "villain");
        assert.equal(model.actorTypeOptions.find((option) => option.value === "villain").selected, true);
        assert.equal(model.additionalPrompt, "railway patron");
    });

    it("renders an editable actor details form with save disabled until dirty", () => {
        const actor = {
            id: "a",
            name: "Ada Finch",
            type: "hero",
            system: {
                profile: { role: "Inspector", tags: ["meticulous"] },
                biography: "<p>Known for exacting ledgers.</p>",
                notes: "<p>Secretly funded by the rail trust.</p>",
                classification: { profession: "Detective" },
                abilities: { str: { value: 9 }, dex: { value: 12 }, con: { value: 10 }, int: { value: 14 }, wis: { value: 13 }, cha: { value: 11 }, san: { value: 10 } },
                hero: { archetype: "Investigator", bonds: ["Whitechapel"] }
            }
        };

        const model = buildActorEditorPanelModel({ actor, state: { mode: "edit", actorId: "a", dirty: false } });
        const html = renderActorEditorPanel(model, { escapeHTML });

        assert.match(html, /data-action="actor-editor-save-form"/);
        assert.match(html, /name="system.profile.role"/);
        assert.match(html, /Investigator/);
        assert.match(html, /<button type="submit"[^>]*disabled/);
    });

    it("renders actor details abilities as score boxes with derived modifiers", () => {
        const actor = {
            id: "a",
            name: "Ada Finch",
            type: "hero",
            system: {
                abilities: {
                    str: { value: 9 },
                    dex: { value: 12 },
                    con: { value: 10 },
                    int: { value: 14 },
                    wis: { value: 13 },
                    cha: { value: 11 },
                    san: { value: 8 }
                }
            }
        };

        const model = buildActorEditorPanelModel({ actor, state: { mode: "edit" } });
        const html = renderActorEditorPanel(model, { escapeHTML });

        assert.match(html, /totc-v2-actor-editor__section--abilities/);
        assert.match(html, /totc-v2-actor-editor__ability-scores/);
        assert.match(html, /<span class="totc-v2-actor-editor__ability-label">STR<\/span>/);
        assert.match(html, /<strong class="totc-v2-actor-editor__ability-modifier">-1<\/strong>/);
        assert.match(html, /<strong class="totc-v2-actor-editor__ability-modifier">\+2<\/strong>/);
        assert.match(html, /class="totc-v2-actor-editor__ability-score"[^>]+name="system\.abilities\.int\.value"[^>]+type="number"[^>]+value="14"/);
    });

    it("renders biography and GM notes as injected HTML instead of editable textareas", () => {
        const actor = {
            id: "a",
            name: "Ada Finch",
            type: "hero",
            system: {
                biography: "<p><strong>Ada</strong> keeps three notebooks.</p>",
                notes: "<ul><li>Knows the night porter.</li></ul>"
            }
        };

        const model = buildActorEditorPanelModel({ actor, state: { mode: "edit" } });
        const html = renderActorEditorPanel(model, { escapeHTML });

        assert.doesNotMatch(html, /<textarea[^>]+name="system\.biography"/);
        assert.doesNotMatch(html, /<textarea[^>]+name="system\.notes"/);
        assert.match(html, /<div class="totc-v2-actor-editor__html"><p><strong>Ada<\/strong> keeps three notebooks\.<\/p><\/div>/);
        assert.match(html, /<div class="totc-v2-actor-editor__html totc-v2-actor-editor__html--gm-notes"><ul><li>Knows the night porter\.<\/li><\/ul><\/div>/);
    });

    it("coerces form entries to Foundry update data", () => {
        const formData = new Map([
            ["actorId", "a"],
            ["name", "Ada Finch"],
            ["system.progression.level", "3"],
            ["system.profile.tags", "inspector, meticulous"],
            ["system.abilities.int.value", "15"]
        ]);

        assert.deepEqual(buildActorUpdateDataFromFormData(formData), {
            name: "Ada Finch",
            system: {
                progression: { level: 3 },
                profile: { tags: ["inspector", "meticulous"] },
                abilities: { int: { value: 15 } }
            }
        });
    });

    it("wraps generated actor JSON in actor document data", () => {
        assert.deepEqual(buildGeneratedActorDocumentData({
            name: "Doctor Vale",
            system: { profile: { summary: "A physician." } }
        }, "villain"), {
            name: "Doctor Vale",
            type: "villain",
            system: { profile: { summary: "A physician." } }
        });
    });
});
