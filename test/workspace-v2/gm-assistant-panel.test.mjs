import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
    buildGMAssistantDocumentSystemData,
    buildGMAssistantPanelModel,
    renderGeneratedAssistantContent,
    renderGMAssistantPanel
} from "../../module/ui/workspace-v2/panels/gm-assistant-panel.mjs";

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

describe("GM assistant panel", () => {
    it("renders the prompt textarea in a full-width field hook", () => {
        const html = renderGMAssistantPanel(buildGMAssistantPanelModel({
            prompt: "A fogbound market",
            promptTextareaHeight: 184.4
        }), { escapeHTML });

        assert.match(html, /class="totc-v2-gm-assistant__field totc-v2-gm-assistant__field--prompt"/);
        assert.match(html, /<span>Prompt<\/span>\s*<textarea data-action="gm-assistant-set-prompt"[^>]*style="height: 184px;"/);
        assert.match(html, /A fogbound market/);
    });

    it("renders a parent location selector only for location generation", () => {
        const html = renderGMAssistantPanel(buildGMAssistantPanelModel({
            elementType: "location",
            parentLocationId: "loc-athens",
            parentLocationOptions: [
                { value: "loc-whitechapel", label: "Whitechapel" },
                { value: "loc-athens", label: "Athens" }
            ]
        }), { escapeHTML });

        assert.match(html, /data-action="gm-assistant-set-parent-location"/);
        assert.match(html, /<option value="loc-athens" selected>Athens<\/option>/);

        const campaignHtml = renderGMAssistantPanel(buildGMAssistantPanelModel({
            elementType: "campaign",
            parentLocationOptions: [
                { value: "loc-athens", label: "Athens" }
            ]
        }), { escapeHTML });
        assert.doesNotMatch(campaignHtml, /gm-assistant-set-parent-location/);
    });

    it("renders an actor type selector only for actor generation", () => {
        const html = renderGMAssistantPanel(buildGMAssistantPanelModel({
            elementType: "actor",
            actorType: "villain"
        }), { escapeHTML });

        assert.match(html, /data-action="gm-assistant-set-actor-type"/);
        assert.match(html, /<option value="villain" selected>Villain<\/option>/);

        const locationHtml = renderGMAssistantPanel(buildGMAssistantPanelModel({
            elementType: "location"
        }), { escapeHTML });
        assert.doesNotMatch(locationHtml, /gm-assistant-set-actor-type/);
    });

    it("renders generated HTML content without escaping allowed markup", () => {
        const html = renderGMAssistantPanel(buildGMAssistantPanelModel({
            elementType: "scenario",
            result: {
                name: "The Limehouse Ledger",
                system: {
                    profile: {
                        description: "<p>A fogbound investigation with <strong>industrial stakes</strong>.</p>",
                        summary: "A plain-text summary."
                    }
                }
            }
        }), { escapeHTML });

        assert.match(html, /class="totc-v2-gm-assistant__result-content"/);
        assert.match(html, /<strong>industrial stakes<\/strong>/);
        assert.match(html, /<p>A plain-text summary\.<\/p>/);
        assert.doesNotMatch(html, /&lt;strong&gt;industrial stakes&lt;\/strong&gt;/);
    });

    it("strips unsafe generated HTML before rendering", () => {
        const html = renderGeneratedAssistantContent({
            system: {
                profile: {
                    description: `<p onclick="alert('x')">Safe text</p><script>alert("x")</script><a href="javascript:alert('x')">bad</a>`
                }
            }
        }, { escapeHTML });

        assert.match(html, /<p>Safe text<\/p>/);
        assert.doesNotMatch(html, /onclick=/);
        assert.doesNotMatch(html, /<script/);
        assert.doesNotMatch(html, /javascript:/);
    });

    it("normalizes generated encounter profile content into encounter document fields", () => {
        const system = buildGMAssistantDocumentSystemData({
            profile: {
                summary: "A bad night at the warehouse.",
                description: "<p>Crates and gaslight.</p>",
                hazards: "<ul><li>Unstable boiler</li></ul>",
                npcs: ["Foreman Vale"]
            }
        }, "encounter-design");

        assert.deepEqual(system, {
            scenarioId: "",
            description: "<p>Crates and gaslight.</p>",
            hazards: "<ul><li>Unstable boiler</li></ul>",
            npcs: ["Foreman Vale"]
        });
    });

    it("normalizes generated scenario profile content into scenario document fields", () => {
        const system = buildGMAssistantDocumentSystemData({
            profile: {
                description: "<p>A ledger changes hands.</p>",
                historicalNotes: "<p>Dock strikes shape the pressure.</p>",
                resolutionCriteria: "<p>The ledger is recovered.</p>"
            }
        }, "scenario");

        assert.deepEqual(system, {
            campaignId: "",
            description: "<p>A ledger changes hands.</p>",
            historicalNotes: "<p>Dock strikes shape the pressure.</p>",
            resolutionCriteria: "<p>The ledger is recovered.</p>",
            encounters: []
        });
    });

    it("renders generated content from Foundry-like system data models", () => {
        const html = renderGeneratedAssistantContent({
            system: {
                toObject: () => ({
                    scenarioId: "scenario-a",
                    description: "<p>Saved encounter prose.</p>",
                    hazards: "<p>A failing gas main.</p>"
                })
            }
        }, { escapeHTML });

        assert.match(html, /Saved encounter prose/);
        assert.match(html, /A failing gas main/);
        assert.doesNotMatch(html, /scenario-a/);
    });

    it("renders accept and regenerate actions in a footer after the scrollable result content", () => {
        const html = renderGMAssistantPanel(buildGMAssistantPanelModel({
            prompt: "Make a market",
            result: {
                name: "Caledonian Market",
                system: { profile: { description: "<p>Busy stalls.</p>" } }
            }
        }), { escapeHTML });

        assert.match(html, /<div class="totc-v2-gm-assistant__result-content">[\s\S]*<\/div>\s*<footer class="totc-v2-gm-assistant__result-actions">/);
        assert.match(html, /data-action="gm-assistant-accept"/);
        assert.match(html, /data-action="gm-assistant-regenerate"/);
    });

    it("styles generated content as a filling scroll area with bottom-fixed actions", () => {
        assert.match(styles, /\.totc-v2-gm-assistant\s*\{[\s\S]*height: 100%;[\s\S]*overflow: hidden;/);
        assert.match(styles, /\.totc-v2-gm-assistant__result\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto;[\s\S]*height: 100%;/);
        assert.match(styles, /\.totc-v2-gm-assistant__result-content\s*\{[\s\S]*overflow-y: auto;/);
        assert.match(styles, /\.totc-v2-gm-assistant__result-actions\s*\{[\s\S]*bottom: 0;[\s\S]*position: sticky;/);
    });
});
