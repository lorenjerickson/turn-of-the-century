import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildGMAssistantPanelModel,
    renderGMAssistantPanel
} from "../../module/ui/workspace-v2/panels/gm-assistant-panel.mjs";

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
});
