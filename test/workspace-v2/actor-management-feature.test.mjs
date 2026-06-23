import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

// Mock globals before importing ActorManagementFeature
globalThis.foundry = {
    documents: {
        Actor: class ActorMock {
            static async create(data) {
                return {
                    id: "actor-new-123",
                    type: data.type,
                    name: data.name,
                    system: data.system,
                    sheet: { render: () => {} }
                };
            }
        },
        Item: class ItemMock {
            static async create(data) {
                return {
                    id: "item-new-456",
                    type: data.type,
                    name: data.name,
                    system: data.system,
                    sheet: { render: () => {} }
                };
            }
        }
    }
};

globalThis.game = {
    items: {
        contents: [],
        get(id) {
            return this.contents.find(i => i.id === id) || null;
        }
    },
    actors: {
        contents: [],
        get(id) {
            return this.contents.find(a => a.id === id) || null;
        }
    },
    users: [],
    user: { id: "user-1", isGM: true }
};

globalThis.canvas = {
    scene: {
        id: "scene-1",
        tokens: {
            get(id) {
                if (id === "token-1") {
                    return {
                        id: "token-1",
                        actorId: "actor-1",
                        actor: { id: "actor-1", name: "Ada", isOwner: true }
                    };
                }
                return null;
            }
        }
    }
};

// Dynamically import to ensure global mocks are defined before modules load
const { ActorManagementFeature } = await import("../../module/ui/workspace-v2/controllers/actor-management-feature.mjs");

describe("ActorManagementFeature", () => {
    let mockLayoutEngine;
    let mockPanelRegistry;
    let renderOptionsPassed;
    let selectedTokenIds;

    beforeEach(() => {
        globalThis.game.actors.contents = [
            { id: "actor-1", name: "Ada", type: "pawn", system: { inventory: { equipment: {} } } }
        ];
        globalThis.game.users = [];

        mockLayoutEngine = {
            getLayout: () => ({}),
            restorePanel: (panelDef) => ({})
        };
        mockPanelRegistry = {
            get: (id) => ({ id, defaultDock: "rightDock" })
        };
        renderOptionsPassed = null;
        selectedTokenIds = new Set();
    });

    it("initializes with underlying controller and default state", () => {
        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds
        });

        assert.ok(feature.actorWorkspaceController);
        assert.deepEqual(feature.getSelectedActorIds(), new Set());
    });

    it("prepares context and runs selection details sync inside prepareContext", async () => {
        selectedTokenIds.add("token-1");

        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds
        });

        const context = { gm: { isGM: true } };
        await feature.prepareContext(context);

        assert.ok(context.actorListPanel);
        assert.ok(context.actorEditorPanel);
        assert.equal(feature.actorWorkspaceController.editorState.actorId, "actor-1");
        assert.equal(feature.actorWorkspaceController.editorState.mode, "edit");
    });

    it("renders actors and actor-editor panels", () => {
        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds
        });

        const context = {
            gm: { isGM: true },
            actorListPanel: { actors: [] },
            actorEditorPanel: { actor: null, state: { mode: "empty" }, users: [] }
        };

        const htmlList = feature.render({ id: "actors" }, context);
        assert.match(htmlList, /totc-v2-actor-list-panel/);

        const htmlEditor = feature.render({ id: "actor-editor" }, context);
        assert.match(htmlEditor, /totc-v2-actor-editor/);

        const htmlUnknown = feature.render({ id: "unknown" }, context);
        assert.equal(htmlUnknown, undefined);
    });

    it("binds listeners through underlying controller wireHandlers method", () => {
        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds
        });

        let wired = false;
        feature.actorWorkspaceController.wireHandlers = (root) => {
            if (root === "mock-root") wired = true;
        };

        feature.bind("mock-root");
        assert.equal(wired, true);
    });
});
