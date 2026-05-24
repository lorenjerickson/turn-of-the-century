import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildInspectorPanelModel,
    renderInspectorPanel
} from "../../module/ui/workspace-v2/panels/inspector-panel.mjs";
import { WorkspaceDesignActionRegistry } from "../../module/ui/workspace-v2/design-action-registry.mjs";

const registry = new WorkspaceDesignActionRegistry({
    actions: [
        { id: "scene.walls", label: "Walls", description: "Draw walls.", domain: "scene", contexts: ["map"], relevance: 90 },
        { id: "inspect.context", label: "Inspect", description: "Inspect view.", domain: "inspection", contexts: ["*"], relevance: 10 }
    ]
});

describe("Inspector panel", () => {
    it("summarizes active context and relevant actions", () => {
        const model = buildInspectorPanelModel({
            activePanel: { id: "map", title: "Map" },
            scene: { id: "scene-1", name: "Baker Street" },
            combat: { id: "combat-1" },
            controlledTokens: [{ id: "token-1" }, { id: "token-2" }],
            isGM: true,
            registry
        });

        assert.deepEqual(model.activePanel, { id: "map", title: "Map" });
        assert.deepEqual(model.scene, { id: "scene-1", name: "Baker Street" });
        assert.equal(model.details.find((detail) => detail.label === "Selected Tokens").value, "2");
        assert.deepEqual(model.actions.map((action) => action.id), ["scene.walls", "inspect.context"]);
    });

    it("hides GM-gated actions from non-GM users", () => {
        const model = buildInspectorPanelModel({
            activePanel: { id: "map", title: "Map" },
            isGM: false,
            registry
        });

        assert.deepEqual(model.actions, []);
    });

    it("renders escaped details and action buttons", () => {
        const model = buildInspectorPanelModel({
            activePanel: { id: "map", title: "Map <Main>" },
            scene: { id: "scene-1", name: "Baker <Street>" },
            isGM: true,
            registry
        });
        const html = renderInspectorPanel(model, {
            escapeHTML: (value) => String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
        });

        assert.match(html, /Map &lt;Main&gt;/);
        assert.match(html, /Baker &lt;Street&gt;/);
        assert.match(html, /data-action="inspector-design-action"/);
        assert.match(html, /scene\.walls/);
    });
});
