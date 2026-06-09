import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    buildCampaignViewMovePlan,
    buildCampaignViewPanelModel,
    getCampaignViewDropMode,
    renderCampaignViewPanel
} from "../../module/ui/workspace-v2/panels/campaign-view-panel.mjs";

const rootDir = new URL("../..", import.meta.url).pathname;
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function makeItems() {
    return [
        {
            id: "campaign-a",
            name: "Fog Over Whitechapel",
            type: "campaign",
            system: {
                setting: "London",
                scenarios: ["scenario-a"]
            }
        },
        {
            id: "scenario-a",
            name: "The Limehouse Ledger",
            type: "scenario",
            system: {
                campaignId: "campaign-a",
                description: "<p>A ledger changes hands in the fog.</p>",
                encounters: ["encounter-a"]
            }
        },
        {
            id: "encounter-a",
            name: "Warehouse Ambush",
            type: "encounter-design",
            system: {
                scenarioId: "scenario-a",
                description: "<p>Crates, gaslight, and hard choices.</p>"
            }
        }
    ];
}

describe("Campaign view panel", () => {
    it("builds a campaign to scenario to encounter hierarchy", () => {
        const model = buildCampaignViewPanelModel({
            items: makeItems(),
            expandedIds: ["campaign-a", "scenario-a"]
        });

        assert.equal(model.campaigns.length, 1);
        assert.equal(model.campaigns[0].id, "campaign-a");
        assert.equal(model.campaigns[0].children[0].id, "scenario-a");
        assert.equal(model.campaigns[0].children[0].children[0].id, "encounter-a");
        assert.equal(model.campaigns[0].expanded, true);
        assert.equal(model.campaigns[0].children[0].expanded, true);
    });

    it("uses parent ordering arrays before alphabetical fallback", () => {
        const model = buildCampaignViewPanelModel({
            items: [
                {
                    id: "campaign-a",
                    name: "Fog Over Whitechapel",
                    type: "campaign",
                    system: { scenarios: ["scenario-b", "scenario-a"] }
                },
                {
                    id: "scenario-a",
                    name: "A First Scenario",
                    type: "scenario",
                    system: { campaignId: "campaign-a", encounters: ["encounter-b", "encounter-a"] }
                },
                {
                    id: "scenario-b",
                    name: "B Second Scenario",
                    type: "scenario",
                    system: { campaignId: "campaign-a" }
                },
                {
                    id: "encounter-a",
                    name: "A First Encounter",
                    type: "encounter-design",
                    system: { scenarioId: "scenario-a" }
                },
                {
                    id: "encounter-b",
                    name: "B Second Encounter",
                    type: "encounter-design",
                    system: { scenarioId: "scenario-a" }
                }
            ],
            expandedIds: ["campaign-a", "scenario-a"]
        });

        assert.deepEqual(model.campaigns[0].children.map((scenario) => scenario.id), ["scenario-b", "scenario-a"]);
        assert.deepEqual(model.campaigns[0].children[1].children.map((encounter) => encounter.id), ["encounter-b", "encounter-a"]);
    });

    it("selects the requested item and renders its authored HTML content", () => {
        const model = buildCampaignViewPanelModel({
            items: makeItems(),
            expandedIds: ["campaign-a", "scenario-a"],
            selectedId: "encounter-a"
        });
        const html = renderCampaignViewPanel(model, { escapeHTML });

        assert.equal(model.selected.id, "encounter-a");
        assert.match(html, /Warehouse Ambush/);
        assert.match(html, /<p>Crates, gaslight, and hard choices\.<\/p>/);
        assert.match(html, /class="totc-v2-campaign-view__row is-selected"/);
    });

    it("renders selected encounter content from Foundry-like system data", () => {
        const items = makeItems();
        items[2] = {
            ...items[2],
            system: {
                toObject: () => ({
                    scenarioId: "scenario-a",
                    description: "<p>Generated encounter text saved on the document.</p>",
                    hazards: "<p>Steam pressure rises.</p>"
                })
            }
        };
        const model = buildCampaignViewPanelModel({
            items,
            expandedIds: ["campaign-a", "scenario-a"],
            selectedId: "encounter-a"
        });
        const html = renderCampaignViewPanel(model, { escapeHTML });

        assert.match(html, /Generated encounter text saved on the document/);
        assert.match(html, /Steam pressure rises/);
        assert.doesNotMatch(html, /No generated content was returned/);
        assert.doesNotMatch(html, /<h5>Scenario Id<\/h5>/);
    });

    it("renders campaign hierarchy rows as drag/drop items", () => {
        const model = buildCampaignViewPanelModel({
            items: makeItems(),
            expandedIds: ["campaign-a", "scenario-a"]
        });
        const html = renderCampaignViewPanel(model, { escapeHTML });

        assert.match(html, /draggable="true"[^>]*data-campaign-view-draggable="true"[^>]*data-campaign-view-item-id="campaign-a"[^>]*data-campaign-view-item-type="campaign"/);
        assert.match(html, /data-campaign-view-item-id="scenario-a"[^>]*data-campaign-view-item-type="scenario"/);
        assert.match(html, /totc-v2-campaign-view__drop-indicator--before/);
        assert.match(html, /totc-v2-campaign-view__drop-indicator--after/);
    });

    it("renders contextual create and generate controls at hierarchy levels", () => {
        const model = buildCampaignViewPanelModel({
            items: makeItems(),
            expandedIds: ["campaign-a", "scenario-a"]
        });
        const html = renderCampaignViewPanel(model, { escapeHTML });

        assert.match(html, /data-action="campaign-view-create-root"/);
        assert.match(html, /data-action="campaign-view-create-child" data-parent-id="campaign-a" data-child-type="scenario"/);
        assert.match(html, /data-action="campaign-view-generate-child" data-parent-id="campaign-a" data-child-type="scenario"/);
        assert.match(html, /data-action="campaign-view-create-child" data-parent-id="scenario-a" data-child-type="encounter-design"/);
        assert.match(html, /data-action="campaign-view-generate-child" data-parent-id="scenario-a" data-child-type="encounter-design"/);
    });

    it("keeps unlinked content visible instead of hiding it", () => {
        const model = buildCampaignViewPanelModel({
            items: [
                ...makeItems(),
                { id: "scenario-orphan", name: "Loose Scenario", type: "scenario", system: {} }
            ]
        });

        assert.equal(model.orphanScenarios.length, 1);
        assert.equal(model.orphanScenarios[0].name, "Loose Scenario");
    });

    it("identifies compatible campaign hierarchy drop modes", () => {
        assert.equal(getCampaignViewDropMode({ draggedType: "scenario", targetType: "campaign" }), "inside");
        assert.equal(getCampaignViewDropMode({ draggedType: "encounter-design", targetType: "scenario" }), "inside");
        assert.equal(getCampaignViewDropMode({ draggedType: "scenario", targetType: "scenario", pointerRatio: 0.2 }), "before");
        assert.equal(getCampaignViewDropMode({ draggedType: "scenario", targetType: "scenario", pointerRatio: 0.8 }), "after");
        assert.equal(getCampaignViewDropMode({ draggedType: "campaign", targetType: "scenario" }), "");
    });

    it("builds a move plan to adopt an orphaned scenario under a campaign", () => {
        const plan = buildCampaignViewMovePlan({
            items: [
                ...makeItems(),
                { id: "campaign-b", name: "The Enemy Within", type: "campaign", system: { scenarios: ["scenario-b"] } },
                { id: "scenario-b", name: "A Linked Scenario", type: "scenario", system: { campaignId: "campaign-b" } },
                { id: "scenario-orphan", name: "Loose Scenario", type: "scenario", system: {} }
            ],
            draggedId: "scenario-orphan",
            targetId: "campaign-b",
            dropMode: "inside"
        });

        assert.deepEqual(plan.itemUpdate, { "system.campaignId": "campaign-b" });
        assert.deepEqual(plan.parentUpdate, { "system.scenarios": ["scenario-b", "scenario-orphan"] });
        assert.equal(plan.previousParentUpdate, null);
    });

    it("builds a move plan to adopt and reorder encounters under scenarios", () => {
        const items = [
            ...makeItems(),
            {
                id: "scenario-b",
                name: "The Crimson Bargain of Castle Rikoven",
                type: "scenario",
                system: { encounters: ["encounter-b"] }
            },
            { id: "encounter-b", name: "Existing Bargain", type: "encounter-design", system: { scenarioId: "scenario-b" } },
            { id: "encounter-orphan", name: "Loose Encounter", type: "encounter-design", system: {} }
        ];
        const adoptionPlan = buildCampaignViewMovePlan({
            items,
            draggedId: "encounter-orphan",
            targetId: "scenario-b",
            dropMode: "inside"
        });
        const reorderPlan = buildCampaignViewMovePlan({
            items: [
                ...items,
                { id: "encounter-c", name: "Later Bargain", type: "encounter-design", system: { scenarioId: "scenario-b" } }
            ],
            draggedId: "encounter-c",
            targetId: "encounter-b",
            dropMode: "before"
        });

        assert.deepEqual(adoptionPlan.itemUpdate, { "system.scenarioId": "scenario-b" });
        assert.deepEqual(adoptionPlan.parentUpdate, { "system.encounters": ["encounter-b", "encounter-orphan"] });
        assert.deepEqual(reorderPlan.parentUpdate, { "system.encounters": ["encounter-c", "encounter-b"] });
    });

    it("styles the tree and content panes as a vertical stack", () => {
        assert.match(styles, /\.totc-v2-campaign-view\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*height: 100%;/);
        assert.match(styles, /\.totc-v2-campaign-view__body\s*\{[\s\S]*grid-template-rows: minmax\(10rem, 0\.9fr\) minmax\(12rem, 1\.1fr\);/);
        assert.doesNotMatch(styles, /\.totc-v2-campaign-view__body\s*\{[\s\S]*grid-template-columns: minmax\(12rem, 0\.95fr\) minmax\(14rem, 1\.25fr\);/);
        assert.match(styles, /\.totc-v2-campaign-view__tree,[\s\S]*\.totc-v2-campaign-view__detail\s*\{[\s\S]*overflow: auto;/);
        assert.match(styles, /\.totc-v2-campaign-view__detail-content\s*\{[\s\S]*overflow: auto;/);
        assert.match(styles, /\.totc-v2-campaign-view__select\s*\{[\s\S]*justify-items: start;[\s\S]*text-align: left;[\s\S]*width: 100%;/);
        assert.match(styles, /\.totc-v2-campaign-view__type\s*\{[\s\S]*display: block;[\s\S]*text-align: left;/);
        assert.match(styles, /\.totc-v2-campaign-view__name\s*\{[\s\S]*display: block;[\s\S]*text-align: left;/);
        assert.match(styles, /\.totc-v2-campaign-view__row\[data-campaign-view-drop-mode="inside"\]\s*\{[\s\S]*border-color: rgba\(134, 239, 172, 0\.58\);/);
        assert.match(styles, /\.totc-v2-campaign-view__row\[data-campaign-view-drop-mode="before"\][\s\S]*\.totc-v2-campaign-view__drop-indicator--before/);
    });
});
