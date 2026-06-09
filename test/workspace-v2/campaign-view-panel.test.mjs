import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    buildCampaignViewPanelModel,
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

    it("styles the tree and content panes as a vertical stack", () => {
        assert.match(styles, /\.totc-v2-campaign-view\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*height: 100%;/);
        assert.match(styles, /\.totc-v2-campaign-view__body\s*\{[\s\S]*grid-template-rows: minmax\(10rem, 0\.9fr\) minmax\(12rem, 1\.1fr\);/);
        assert.doesNotMatch(styles, /\.totc-v2-campaign-view__body\s*\{[\s\S]*grid-template-columns: minmax\(12rem, 0\.95fr\) minmax\(14rem, 1\.25fr\);/);
        assert.match(styles, /\.totc-v2-campaign-view__tree,[\s\S]*\.totc-v2-campaign-view__detail\s*\{[\s\S]*overflow: auto;/);
        assert.match(styles, /\.totc-v2-campaign-view__detail-content\s*\{[\s\S]*overflow: auto;/);
    });
});
