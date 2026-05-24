import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildDesignCommandPaletteModel,
    renderDesignCommandPalette
} from "../../module/ui/workspace-v2/panels/design-command-palette.mjs";
import { WorkspaceDesignActionRegistry } from "../../module/ui/workspace-v2/design-action-registry.mjs";

const registry = new WorkspaceDesignActionRegistry({
    actions: [
        { id: "scene.walls", label: "Walls", description: "Draw walls.", domain: "scene", contexts: ["map"], relevance: 90 },
        { id: "scene.lights", label: "Lights", description: "Place lights.", domain: "scene", contexts: ["map"], relevance: 80 },
        { id: "actor.createNpc", label: "Create NPC", description: "Create a character.", domain: "actor", contexts: ["player"], relevance: 70 },
        { id: "inspect.context", label: "Inspect", description: "Inspect view.", domain: "inspection", contexts: ["*"], relevance: 10 }
    ]
});

describe("Design command palette", () => {
    it("ranks active-view design actions ahead of fallback actions", () => {
        const model = buildDesignCommandPaletteModel({
            active: true,
            activePanel: { id: "map", title: "Map" },
            isGM: true,
            registry
        });

        assert.equal(model.active, true);
        assert.deepEqual(model.actions.map((action) => action.id), [
            "scene.walls",
            "scene.lights",
            "inspect.context"
        ]);
    });

    it("filters actions by query", () => {
        const model = buildDesignCommandPaletteModel({
            active: true,
            activePanel: { id: "map", title: "Map" },
            isGM: true,
            query: "light",
            registry
        });

        assert.deepEqual(model.actions.map((action) => action.id), ["scene.lights"]);
    });

    it("does not activate for non-GM users", () => {
        const model = buildDesignCommandPaletteModel({
            active: true,
            activePanel: { id: "map", title: "Map" },
            isGM: false,
            registry
        });

        assert.equal(model.active, false);
        assert.deepEqual(model.actions, []);
    });

    it("renders escaped action metadata", () => {
        const model = buildDesignCommandPaletteModel({
            active: true,
            activePanel: { id: "map", title: "Map <Main>" },
            isGM: true,
            registry
        });
        const html = renderDesignCommandPalette(model, {
            escapeHTML: (value) => String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
        });

        assert.match(html, /Map &lt;Main&gt;/);
        assert.match(html, /scene\.walls/);
        assert.match(html, /Design Commands/);
    });
});
