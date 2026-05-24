import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildDesignLensModel,
    getDesignLensActions,
    renderDesignLensSurface
} from "../../module/ui/workspace-v2/panels/design-lens-panel.mjs";

describe("Design lens panel", () => {
    it("surfaces scene design actions for the map panel", () => {
        const actions = getDesignLensActions("map");

        assert.deepEqual(actions.map((action) => action.id), [
            "scene.walls",
            "scene.lights",
            "scene.tokens",
            "scene.notes",
            "inspect.context",
            "design.issues"
        ]);
    });

    it("uses injected registries for action lookup", () => {
        const registry = {
            getApplicableActions: ({ panelId, isGM }) => [{ id: `${panelId}:${isGM}`, label: "Injected", description: "Injected action." }]
        };

        assert.deepEqual(getDesignLensActions("map", { registry, isGM: true }), [
            { id: "map:true", label: "Injected", description: "Injected action." }
        ]);
    });

    it("only activates for a GM with an active panel", () => {
        assert.equal(buildDesignLensModel({ panel: { id: "map", title: "Map" }, active: true, isGM: true }).active, true);
        assert.equal(buildDesignLensModel({ panel: { id: "map", title: "Map" }, active: true, isGM: false }).active, false);
        assert.equal(buildDesignLensModel({ panel: null, active: true, isGM: true }).active, false);
    });

    it("renders nothing when inactive", () => {
        const html = renderDesignLensSurface(buildDesignLensModel({
            panel: { id: "map", title: "Map" },
            active: false,
            isGM: true
        }));

        assert.equal(html, "");
    });

    it("renders escaped contextual design actions", () => {
        const html = renderDesignLensSurface(buildDesignLensModel({
            panel: { id: "map", title: "Map" },
            active: true,
            isGM: true
        }), {
            escapeHTML: (value) => String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
        });

        assert.match(html, /Map Design/);
        assert.match(html, /scene\.walls/);
        assert.match(html, /Walls/);
    });
});
