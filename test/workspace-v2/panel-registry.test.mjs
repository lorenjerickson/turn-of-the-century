import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_WORKSPACE_PANELS, WorkspacePanelRegistry } from "../../module/ui/workspace-v2/panel-registry.mjs";

describe("WorkspacePanelRegistry", () => {
    it("returns defensive copies of panel definitions", () => {
        const registry = new WorkspacePanelRegistry();
        const panels = registry.getAll();
        panels[0].title = "Changed";

        assert.equal(registry.getAll()[0].title, DEFAULT_WORKSPACE_PANELS[0].title);
    });

    it("looks up panels by id without exposing internal state", () => {
        const registry = new WorkspacePanelRegistry();
        const panel = registry.get("player");
        panel.defaultDock = "leftDock";

        assert.equal(registry.get("player").defaultDock, "rightDock");
        assert.equal(registry.get("missing"), null);
    });

    it("filters GM-only panels from non-GM availability", () => {
        const registry = new WorkspacePanelRegistry();

        assert.equal(registry.getAvailability({ isGM: false }).some((panel) => panel.id === "gamemaster"), false);
        assert.equal(registry.getAvailability({ isGM: true }).some((panel) => panel.id === "gamemaster"), true);
    });

    it("registers the dice and roll feed panel for bottom-dock restoration", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("roll-feed"), {
            id: "roll-feed",
            title: "Dice and Roll Feed",
            defaultDock: "bottomDock",
            contextTags: ["dice", "rolls", "messages"]
        });
    });

    it("registers the die roll request panel for bottom-dock restoration", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("die-roll-request"), {
            id: "die-roll-request",
            title: "Die Roll Request",
            defaultDock: "bottomDock",
            contextTags: ["dice", "rolls", "request", "gm", "player"]
        });
    });

    it("registers the scenes panel for the left dock", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("scenes"), {
            id: "scenes",
            title: "Scenes",
            defaultDock: "leftDock",
            contextTags: ["scene", "navigation"]
        });
    });

    it("registers the GM inspector panel for right-dock restoration", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("inspector"), {
            id: "inspector",
            title: "Inspector",
            defaultDock: "rightDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "design", "inspection"]
        });
    });

    it("registers the scene properties panel for GM scene design", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("scene-properties"), {
            id: "scene-properties",
            title: "Scene Properties",
            defaultDock: "rightDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "scene", "design"]
        });
    });

    it("registers the GM media browser panel", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("media-browser"), {
            id: "media-browser",
            title: "Media Browser",
            defaultDock: "rightDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "media", "assets"]
        });
    });

    it("builds visibility models in registry order", () => {
        const registry = new WorkspacePanelRegistry({
            panels: [
                { id: "a", title: "A" },
                { id: "b", title: "B" }
            ]
        });

        assert.deepEqual(registry.getVisibilityModel(new Set(["b"])), [
            { id: "a", title: "A", visible: false },
            { id: "b", title: "B", visible: true }
        ]);
    });
});
