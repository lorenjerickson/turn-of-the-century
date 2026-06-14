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

    it("filters internal panels from user availability", () => {
        const registry = new WorkspacePanelRegistry();

        assert.equal(registry.getAvailability({ isGM: false }).some((panel) => panel.id === "die-roll-request"), false);
        assert.equal(registry.getAvailability({ isGM: true }).some((panel) => panel.id === "die-roll-request"), false);
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
            roleAccess: { internalOnly: true },
            contextTags: ["dice", "rolls", "request", "player"]
        });
    });

    it("registers the encounter panel for right-dock restoration", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("encounter"), {
            id: "encounter",
            title: "Encounter Planner",
            defaultDock: "rightDock",
            contextTags: ["encounter", "combat"]
        });
    });

    it("does not register obsolete encounter designer or combat tracker panels", () => {
        const registry = new WorkspacePanelRegistry();
        const gmPanelIds = registry.getAvailability({ isGM: true }).map((panel) => panel.id);

        assert.equal(registry.get("encounter-designer"), null);
        assert.equal(registry.get("tracker"), null);
        assert.equal(gmPanelIds.includes("encounter-designer"), false);
        assert.equal(gmPanelIds.includes("tracker"), false);
    });

    it("registers the GM encounter manager for left-dock restoration", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("encounter-manager"), {
            id: "encounter-manager",
            title: "Encounter Manager",
            defaultDock: "leftDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "encounter", "combat"]
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

    it("does not register a generic map panel", () => {
        const registry = new WorkspacePanelRegistry();

        assert.equal(registry.get("map"), null);
        assert.equal(registry.getAvailability({ isGM: true }).some((panel) => panel.id === "map"), false);
    });

    it("registers GM actor list and editor panels for actor management", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("actors"), {
            id: "actors",
            title: "Actors",
            defaultDock: "leftDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "actor", "search"]
        });
        assert.deepEqual(registry.get("actor-editor"), {
            id: "actor-editor",
            title: "Actor Details",
            defaultDock: "rightDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "actor", "design"]
        });
    });

    it("registers the GM campaign view for the left dock", () => {
        const registry = new WorkspacePanelRegistry();

        assert.deepEqual(registry.get("campaign-view"), {
            id: "campaign-view",
            title: "Campaign View",
            defaultDock: "leftDock",
            roleAccess: { gmOnly: true },
            contextTags: ["gm", "campaign", "scenario", "encounter", "navigation"]
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

    it("omits unavailable panels from visibility models", () => {
        const registry = new WorkspacePanelRegistry();

        const gmPanelIds = registry.getVisibilityModel(new Set(["die-roll-request"]), { isGM: true })
            .map((panel) => panel.id);

        assert.equal(gmPanelIds.includes("die-roll-request"), false);
        assert.equal(gmPanelIds.includes("gamemaster"), true);
    });
});
