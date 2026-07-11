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
const {
    ActorManagementFeature,
    applyCircularTokenAlphaMask
} = await import("../../module/ui/workspace-v2/controllers/actor-management-feature.mjs");

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

    it("keeps manually opened pawn details when a hero token remains selected", async () => {
        globalThis.game.actors.contents = [
            { id: "actor-1", name: "Ada", type: "hero", system: { inventory: { equipment: {} } } },
            { id: "actor-pawn", name: "Dockside Bravo", type: "pawn", system: { inventory: { equipment: {} } } }
        ];
        selectedTokenIds.add("token-1");

        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds
        });

        await feature.prepareContext({ gm: { isGM: true } });
        assert.equal(feature.actorWorkspaceController.editorState.actorId, "actor-1");

        feature.actorWorkspaceController.setTypeFilter("pawn");
        assert.equal(feature.actorWorkspaceController.openDetails("actor-pawn"), true);

        const context = { gm: { isGM: true } };
        await feature.prepareContext(context);

        assert.equal(feature.actorWorkspaceController.editorState.actorId, "actor-pawn");
        assert.equal(context.actorEditorPanel.actorId, "actor-pawn");
        assert.equal(context.actorEditorPanel.actorType, "pawn");
        assert.equal(context.actorListPanel.typeFilter, "pawn");
        assert.deepEqual(context.actorListPanel.entries.map((entry) => entry.id), ["actor-pawn"]);
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

    it("filters rendered actor rows when the actor type dropdown changes repeatedly", async () => {
        globalThis.game.actors.contents = [
            { id: "actor-hero", name: "Ada", type: "hero" },
            { id: "actor-pawn", name: "Dockside Bravo", type: "pawn" },
            { id: "actor-villain", name: "Moriarty", type: "villain" }
        ];
        const listeners = new Map();
        const select = {
            value: "hero",
            addEventListener: (type, handler) => listeners.set(type, handler)
        };
        const root = {
            querySelectorAll: (selector) => selector === "[data-action='actor-list-type-filter']" ? [select] : []
        };
        let renderCount = 0;
        const feature = new ActorManagementFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            getSelectedTokenIds: () => selectedTokenIds,
            render: () => {
                renderCount += 1;
            }
        });

        feature.bind(root);
        const changeType = async (value) => {
            select.value = value;
            listeners.get("change")({
                target: { value: "all" },
                currentTarget: select,
                stopPropagation() {}
            });
            const context = { gm: { isGM: true } };
            await feature.prepareContext(context);
            return feature.render({ id: "actors" }, context);
        };

        const heroHtml = await changeType("hero");
        assert.match(heroHtml, /Ada/);
        assert.doesNotMatch(heroHtml, /Dockside Bravo|Moriarty/);

        const villainHtml = await changeType("villain");
        assert.match(villainHtml, /Moriarty/);
        assert.doesNotMatch(villainHtml, /Ada|Dockside Bravo/);
        assert.equal(renderCount, 2);
    });

    it("masks generated token art outside a circular frame", () => {
        const width = 5;
        const height = 5;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 210;
            data[i + 1] = 210;
            data[i + 2] = 210;
            data[i + 3] = 255;
        }

        applyCircularTokenAlphaMask({ width, height, data }, { paddingRatio: 0 });

        const alphaAt = (x, y) => data[((y * width) + x) * 4 + 3];
        assert.equal(alphaAt(0, 0), 0);
        assert.equal(alphaAt(4, 0), 0);
        assert.equal(alphaAt(0, 4), 0);
        assert.equal(alphaAt(4, 4), 0);
        assert.equal(alphaAt(2, 2), 255);
        assert.equal(alphaAt(2, 0), 255);
    });
});
