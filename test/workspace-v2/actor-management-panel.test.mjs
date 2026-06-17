import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
const rootDir = fileURLToPath(new URL("../..", import.meta.url));
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
        assert.match(styles, /\.totc-v2-actor-list-panel__list\s*\{[\s\S]*justify-items:\s*stretch;[\s\S]*text-align:\s*left;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\s*\{[\s\S]*grid-template-columns:\s*auto 2\.2rem minmax\(0, 1fr\);/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry\s*\{[\s\S]*justify-items:\s*start;[\s\S]*text-align:\s*left;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-thumb\s*\{[\s\S]*height:\s*2\.2rem;[\s\S]*width:\s*2\.2rem;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-main\s*\{[\s\S]*justify-content:\s*start;[\s\S]*justify-items:\s*start;[\s\S]*text-align:\s*left;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-name\s*\{[\s\S]*justify-self:\s*start;[\s\S]*text-align:\s*left;/);
        assert.match(styles, /\.totc-v2-actor-list-panel__entry-meta\s*\{[\s\S]*justify-self:\s*start;/);
    });

    it("styles actor details sections as wrapping rows of compact fields", () => {
        assert.match(styles, /\.totc-v2-actor-editor__section-fields\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/);
        assert.match(styles, /\.totc-v2-actor-editor__section-fields \.totc-v2-actor-editor__field\s*\{[\s\S]*flex:\s*1 1 13rem;[\s\S]*max-width:\s*18rem;/);
        assert.match(styles, /\.totc-v2-actor-editor__section-fields \.totc-v2-actor-editor__field--textarea,[\s\S]*\.totc-v2-actor-editor__section-fields \.totc-v2-actor-editor__field--html\s*\{[\s\S]*flex-basis:\s*20rem;[\s\S]*max-width:\s*32rem;/);
    });

    it("styles actor equipment as a mannequin layout with belt slots below", () => {
        assert.match(styles, /\.totc-v2-actor-equipment__body\s*\{[\s\S]*grid-template-areas:/);
        assert.match(styles, /"\. head \."/);
        assert.match(styles, /"hand-left torso hand-right"/);
        assert.match(styles, /"\. feet \."/);
        assert.match(styles, /\.totc-v2-actor-equipment__belt\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*center;/);
        assert.match(styles, /\.totc-v2-actor-equipment__item\s*\{[\s\S]*grid-template-columns:\s*2rem minmax\(0, 1fr\);/);
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
        assert.doesNotMatch(html, /name="__ownerUserId"/);
        assert.match(html, /name="system.profile.role"/);
        assert.match(html, /Investigator/);
        assert.match(html, /totc-v2-actor-editor__section-fields/);
        assert.match(html, /<button type="submit"[^>]*disabled/);
    });

    it("renders a GM-only player assignment row with label and dropdown", () => {
        const originalConst = globalThis.CONST;
        globalThis.CONST = {
            DOCUMENT_OWNERSHIP_LEVELS: {
                OWNER: 3
            }
        };

        try {
            const actor = {
                id: "a",
                name: "Ada Finch",
                type: "hero",
                ownership: {
                    "u-player": 3
                },
                system: {
                    abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: 10 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 }, san: { value: 10 } }
                }
            };

            const model = buildActorEditorPanelModel({
                actor,
                state: { mode: "edit" },
                users: [
                    { id: "u-gm", name: "Gamemaster", isGM: true },
                    { id: "u-player", name: "Player One", isGM: false },
                    { id: "u-player-2", name: "Player Two", isGM: false }
                ],
                isGM: true
            });
            const html = renderActorEditorPanel(model, { escapeHTML });

            assert.match(html, /totc-v2-actor-editor__assignment-row/);
            assert.match(html, /totc-v2-actor-editor__assignment-label/);
            assert.match(html, /for="totc-v2-actor-editor-owner"/);
            assert.match(html, /id="totc-v2-actor-editor-owner"/);
            assert.match(html, /data-action="actor-editor-owner-assignment"/);
            assert.match(html, /name="__ownerUserId"/);
            assert.match(html, /<option value="u-player" selected>Player One<\/option>/);
            assert.match(html, /<option value=""\s*>None<\/option>/);
            assert.doesNotMatch(html, /Gamemaster/);
        } finally {
            globalThis.CONST = originalConst;
        }
    });

    it("styles player assignment as a left-label, right-dropdown row", () => {
        assert.match(styles, /\.totc-v2-actor-editor__assignment-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(8rem, auto\) minmax\(0, 1fr\);/);
        assert.match(styles, /\.totc-v2-actor-editor__assignment-label\s*\{[\s\S]*text-transform:\s*uppercase;/);
        assert.match(styles, /\.totc-v2-actor-editor__assignment-row select\s*\{[\s\S]*width:\s*100%;/);
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
        assert.ok(html.indexOf("totc-v2-actor-editor__section--abilities") < html.indexOf("<legend>Identity</legend>"));
        assert.match(html, /<span class="totc-v2-actor-editor__ability-label">STR<\/span>/);
        assert.match(html, /<strong class="totc-v2-actor-editor__ability-modifier">-1<\/strong>/);
        assert.match(html, /<strong class="totc-v2-actor-editor__ability-modifier">\+2<\/strong>/);
        assert.match(html, /class="totc-v2-actor-editor__ability-score"[^>]+name="system\.abilities\.int\.value"[^>]+type="number"[^>]+value="14"/);
    });

    it("renders an equipment mannequin with compatible item selectors and item summaries", () => {
        const actor = {
            id: "a",
            name: "Ada Finch",
            type: "hero",
            items: {
                contents: [
                    { id: "hat", name: "Oilskin Hat", type: "armor", img: "", system: { slot: "head", description: "<p>Keeps rain out of suspicious eyes.</p>" } },
                    { id: "revolver", name: "Service Revolver", type: "weapon", img: "revolver.webp", system: { slot: "hands", description: "<p>A six-shot sidearm.</p>" } },
                    { id: "vest", name: "Mourning Silk Vest", type: "armor", img: "vest.webp", system: { slot: "torso", description: "<p>Armored formal wear.</p>" } },
                    { id: "tonic", name: "Nightwatch Tonic", type: "consumable", img: "tonic.webp", system: { slot: "belt", description: "<p>Sharpens attention briefly.</p>" } }
                ]
            },
            system: {
                abilities: { str: { value: 9 }, dex: { value: 12 }, con: { value: 10 }, int: { value: 14 }, wis: { value: 13 }, cha: { value: 11 }, san: { value: 8 } },
                inventory: {
                    equipment: {
                        head: { label: "Head", capacity: 1, allowedTypes: ["armor", "equipment"], itemIds: ["hat"] },
                        neck: { label: "Neck", capacity: 1, allowedTypes: ["armor", "equipment"], itemIds: [] },
                        torso: { label: "Torso", capacity: 2, allowedTypes: ["armor", "equipment", "item"], itemIds: ["vest"] },
                        hands: { label: "Hands", capacity: 2, allowedTypes: ["armor", "weapon", "tool", "equipment"], itemIds: ["revolver"] },
                        legs: { label: "Legs", capacity: 1, allowedTypes: ["armor", "equipment"], itemIds: [] },
                        feet: { label: "Feet", capacity: 1, allowedTypes: ["armor", "equipment"], itemIds: [] },
                        belt: { label: "Belt", capacity: 4, quality: "standard", allowedTypes: ["weapon", "tool", "equipment", "consumable", "item"], itemIds: ["tonic"] }
                    }
                }
            }
        };

        const model = buildActorEditorPanelModel({ actor, state: { mode: "edit" } });
        const html = renderActorEditorPanel(model, { escapeHTML });

        assert.match(html, /totc-v2-actor-editor__section--equipment/);
        assert.match(html, /totc-v2-actor-equipment__slot--head/);
        assert.match(html, /totc-v2-actor-equipment__slot--hand-left/);
        assert.match(html, /totc-v2-actor-equipment__belt/);
        assert.match(html, /<img src="icons\/svg\/item-bag\.svg" alt="">/);
        assert.match(html, /<strong>Oilskin Hat<\/strong>/);
        assert.match(html, /Armor - Keeps rain out of suspicious eyes\./);
        assert.match(html, /name="system\.inventory\.equipment\.hands\.itemIds\.0"[^>]*data-action="actor-editor-field"/);
        assert.match(html, /<option value="revolver" selected >Service Revolver \(Weapon\) - A six-shot sidearm\.<\/option>/);
        assert.doesNotMatch(html, /<option value="tonic"[^>]*>Nightwatch Tonic \(Consumable\)[^<]*<\/option>[\s\S]*name="system\.inventory\.equipment\.hands/);
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
            ["__ownerUserId", "u-player"],
            ["name", "Ada Finch"],
            ["system.progression.level", "3"],
            ["system.profile.tags", "inspector, meticulous"],
            ["system.abilities.int.value", "15"],
            ["system.inventory.equipment.hands.itemIds.0", "revolver"],
            ["system.inventory.equipment.hands.itemIds.1", ""],
            ["system.inventory.equipment.belt.itemIds.0", "tonic"]
        ]);

        assert.deepEqual(buildActorUpdateDataFromFormData(formData), {
            name: "Ada Finch",
            system: {
                progression: { level: 3 },
                profile: { tags: ["inspector", "meticulous"] },
                abilities: { int: { value: 15 } },
                inventory: {
                    equipment: {
                        hands: { itemIds: ["revolver"] },
                        belt: { itemIds: ["tonic"] }
                    }
                }
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
