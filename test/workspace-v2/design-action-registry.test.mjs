import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_DESIGN_ACTION_REGISTRY,
    WorkspaceDesignActionRegistry
} from "../../module/ui/workspace-v2/design-action-registry.mjs";

const originalGame = globalThis.game;
const originalCanvas = globalThis.canvas;
const originalUi = globalThis.ui;

afterEach(() => {
    globalThis.game = originalGame;
    globalThis.canvas = originalCanvas;
    globalThis.ui = originalUi;
});

describe("WorkspaceDesignActionRegistry", () => {
    it("returns defensive copies of registered actions", () => {
        const registry = new WorkspaceDesignActionRegistry({
            actions: [
                { id: "test.one", label: "One", contexts: ["map"], relevance: 1 }
            ]
        });

        const action = registry.get("test.one");
        action.label = "Changed";
        action.contexts.push("compendium");

        assert.equal(registry.get("test.one").label, "One");
        assert.deepEqual(registry.get("test.one").contexts, ["map"]);
    });

    it("filters actions by panel context and GM access", () => {
        const registry = new WorkspaceDesignActionRegistry({
            actions: [
                { id: "map.gm", label: "Map GM", contexts: ["map"], requiredRole: "gm", relevance: 10 },
                { id: "map.any", label: "Map Any", contexts: ["map"], requiredRole: "any", relevance: 8 },
                { id: "item.any", label: "Item Any", contexts: ["compendium"], requiredRole: "any", relevance: 6 }
            ]
        });

        assert.deepEqual(
            registry.getApplicableActions({ panelId: "map", isGM: false }).map((action) => action.id),
            ["map.any"]
        );
        assert.deepEqual(
            registry.getApplicableActions({ panelId: "map", isGM: true }).map((action) => action.id),
            ["map.gm", "map.any"]
        );
    });

    it("includes wildcard fallback actions for unknown panels", () => {
        const actions = DEFAULT_DESIGN_ACTION_REGISTRY.getApplicableActions({
            panelId: "unknown-panel",
            isGM: true
        });

        assert.deepEqual(actions.map((action) => action.id), ["inspect.context", "design.issues"]);
    });

    it("treats scene-specific map panels as map context", () => {
        const actions = DEFAULT_DESIGN_ACTION_REGISTRY.getApplicableActions({
            panelId: "map:scene-draft",
            isGM: true
        });

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

    it("rejects duplicate action ids", () => {
        assert.throws(() => new WorkspaceDesignActionRegistry({
            actions: [
                { id: "duplicate", label: "First" },
                { id: "duplicate", label: "Second" }
            ]
        }), /Duplicate design action id/);
    });

    it("executes the default NPC creation action", async () => {
        let createdData = null;
        const actorClass = {
            create: async (data) => {
                createdData = data;
                return { name: data.name };
            }
        };

        const action = DEFAULT_DESIGN_ACTION_REGISTRY.get("actor.createNpc");
        const actor = await action.execute({
            actorClass,
            actors: [{ name: "New NPC" }],
            sourcePanel: { id: "encounter" }
        });

        assert.equal(actor.name, "New NPC 2");
        assert.equal(createdData.type, "pawn");
        assert.equal(createdData.flags["turn-of-the-century"].sourcePanelId, "encounter");
    });

    it("executes the default scene wall action", async () => {
        let initializedWith = null;
        globalThis.canvas = {
            ready: true,
            scene: { id: "scene-1" }
        };
        globalThis.ui = {
            controls: {
                initialize: async (payload) => {
                    initializedWith = payload;
                }
            }
        };

        const action = DEFAULT_DESIGN_ACTION_REGISTRY.get("scene.walls");
        const result = await action.execute({ scene: globalThis.canvas.scene });

        assert.deepEqual(initializedWith, { control: "walls", tool: "walls" });
        assert.equal(result.ok, true);
    });

    it("executes the default scene creation action through the workspace draft flow", async () => {
        let created = false;
        const action = DEFAULT_DESIGN_ACTION_REGISTRY.get("scene.create");
        const result = await action.execute({
            app: {
                _createSceneDesignScene: async () => {
                    created = true;
                    return { ok: true, silent: true };
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.silent, true);
        assert.equal(created, true);
    });
});
