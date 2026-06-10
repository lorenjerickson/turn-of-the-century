import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildDesignLensModel,
    getDesignLensActions,
    renderDesignLensSurface
} from "../../module/ui/workspace-v2/panels/design-lens-panel.mjs";

describe("Design lens panel", () => {
    it("surfaces scene design actions for scene map panels", () => {
        const actions = getDesignLensActions("map:scene-1");

        assert.deepEqual(actions.map((action) => action.id), [
            "scene.create",
            "scene.detectWalls",
            "scene.walls",
            "scene.grid",
            "scene.lights",
            "scene.tokens",
            "scene.notes",
            "inspect.context",
            "design.issues"
        ]);
    });

    it("surfaces scene design actions for scene-specific map panels", () => {
        const actions = getDesignLensActions("map:scene-draft");

        assert.ok(actions.some((action) => action.id === "scene.grid"));
        assert.ok(actions.some((action) => action.id === "scene.walls"));
        assert.ok(actions.some((action) => action.id === "inspect.context"));
        assert.ok(actions.some((action) => action.id === "design.issues"));
    });

    it("uses injected registries for action lookup", () => {
        const registry = {
            getApplicableActions: ({ panelId, isGM }) => [{ id: `${panelId}:${isGM}`, label: "Injected", description: "Injected action." }]
        };

        assert.deepEqual(getDesignLensActions("map:scene-1", { registry, isGM: true }), [
            { id: "map:scene-1:true", label: "Injected", description: "Injected action." }
        ]);
    });

    it("only activates for a GM with an active panel", () => {
        assert.equal(buildDesignLensModel({ panel: { id: "map:scene-1", title: "Lobby" }, active: true, isGM: true }).active, true);
        assert.equal(buildDesignLensModel({ panel: { id: "map:scene-1", title: "Lobby" }, active: true, isGM: false }).active, false);
        assert.equal(buildDesignLensModel({ panel: null, active: true, isGM: true }).active, false);
    });

    it("renders nothing when inactive", () => {
        const html = renderDesignLensSurface(buildDesignLensModel({
            panel: { id: "map:scene-1", title: "Lobby" },
            active: false,
            isGM: true
        }));

        assert.equal(html, "");
    });

    it("renders escaped contextual design actions", () => {
        const html = renderDesignLensSurface(buildDesignLensModel({
            panel: { id: "map:scene-1", title: "Lobby" },
            active: true,
            isGM: true
        }), {
            escapeHTML: (value) => String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
        });

        assert.match(html, /Lobby Design/);
        assert.match(html, /scene\.walls/);
        assert.match(html, /Walls/);
    });
});
