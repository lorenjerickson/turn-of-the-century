import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    buildActorListDragPayload,
    buildActorEditorPanelModel,
    buildActorListPanelModel,
    buildActorUpdateDataFromFormData,
    buildGeneratedActorDocumentData,
    parseActorListDragPayload,
    renderActorEditorPanel,
    renderActorListPanel
} from "../../module/ui/workspace-v2/panels/actor-management-panel.mjs";

const escapeHTML = (value) => String(value ?? "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const rootDir = new URL("../..", import.meta.url).pathname;
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

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

    it("filters actors by type before applying the name search", () => {
        const actors = [
            { id: "a", name: "Ada Finch", type: "hero" },
            { id: "b", name: "Ada Bell", type: "villain" },
            { id: "c", name: "Morris Ward", type: "pawn" }
        ];

        const model = buildActorListPanelModel({ actors, typeFilter: "hero", query: "ada" });

        assert.equal(model.typeFilter, "hero");
        assert.equal(model.typeCount, 1);
        assert.equal(model.count, 1);
        assert.deepEqual(model.entries.map((entry) => entry.id), ["a"]);
    });

    it("renders the new actor control, filters, multi-select actors, and double-click detail targets", () => {
        const model = buildActorListPanelModel({
            actors: [
                { id: "a", name: "<Ada>", type: "hero", img: "ada.webp", system: { profile: { role: "Inspector" } } },
                { id: "b", name: "Bert", type: "pawn", system: { profile: { role: "Porter" } } }
            ],
            selectedActorId: "a",
            selectedActorIds: ["a"]
        });

        const html = renderActorListPanel(model, { escapeHTML });

        assert.match(html, /data-action="actor-list-new"/);
        assert.match(html, /data-action="actor-list-type-filter"/);
        assert.match(html, /data-action="actor-list-search"/);
        assert.match(html, /data-action="actor-list-toggle-selected"/);
        assert.match(html, /data-action="actor-list-open-details"/);
        assert.match(html, /data-actor-list-draggable="true"/);
        assert.match(html, /title="Double-click to open actor details"/);
        assert.match(html, /class="totc-v2-actor-list-panel__entry-thumb" src="ada\.webp"/);
        assert.match(html, /totc-v2-actor-list-panel__entry-thumb--initial/);
        assert.match(html, /is-selected/);
        assert.match(html, /is-detail-selected/);
        assert.match(html, /&lt;Ada&gt;/);
        assert.doesNotMatch(html, /<Ada>/);
    });

    it("styles actor list labels and rows with a reserved thumbnail column", () => {
        assert.match(styles, /\.totc-v2-actor-list-panel__filter,[\s\S]*\.totc-v2-actor-list-panel__search,[\s\S]*\{[\s\S]*justify-items:\s*start;[\s\S]*text-align:\s*left;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\s*\{[\s\S]*grid-template-columns:\s*auto 2\.2rem minmax\(0, 1fr\);/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-thumb\s*\{[\s\S]*height:\s*2\.2rem;[\s\S]*width:\s*2\.2rem;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-main\s*\{[\s\S]*justify-items:\s*start;[\s\S]*text-align:\s*left;/);
    });

    it("builds drag payloads from the current multi-selection", () => {
        assert.deepEqual(buildActorListDragPayload({
            actorId: "b",
            selectedActorIds: ["a", "b"]
        }), { actorIds: ["a", "b"] });

        assert.deepEqual(buildActorListDragPayload({
            actorId: "c",
            selectedActorIds: ["a", "b"]
        }), { actorIds: ["c"] });

        assert.deepEqual(parseActorListDragPayload(JSON.stringify({ actorIds: ["a", "a", "b"] })), {
            actorIds: ["a", "b"]
        });
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
