import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

// Mock globals before importing MediaFeature
globalThis.foundry = {
    applications: {
        apps: {
            FilePicker: {
                implementation: {
                    browse: async (source, root) => {
                        return {
                            files: ["assets/images/scenes/alley.webp"],
                            dirs: []
                        };
                    }
                }
            }
        }
    }
};

globalThis.game = {
    user: { id: "user-1", isGM: true }
};

globalThis.Hooks = {
    callAll: () => {}
};

// Dynamically import to ensure global mocks are defined before modules load
const { MediaFeature } = await import("../../module/ui/workspace-v2/controllers/media-feature.mjs");
const { buildMediaBrowserPanelModel } = await import("../../module/ui/workspace-v2/panels/media-browser-panel.mjs");

describe("MediaFeature", () => {
    let mockLayoutEngine;
    let mockPanelRegistry;
    let mockStateStore;
    let renderCalled;

    beforeEach(() => {
        globalThis.game.user.isGM = true;
        renderCalled = false;

        mockLayoutEngine = {
            getLayout: () => ({
                root: {
                    rightDock: {
                        stacks: [
                            {
                                panels: [
                                    { id: "media-browser" }
                                ]
                            }
                        ]
                    }
                }
            }),
            restorePanel: (panelDef) => ({}),
            closePanel: () => ({})
        };

        mockPanelRegistry = {
            get: (id) => ({ id, defaultDock: "rightDock" })
        };

        mockStateStore = {
            setUserLayout: async () => {}
        };
    });

    it("prepares context when media browser is visible", async () => {
        const feature = new MediaFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            render: () => { renderCalled = true; }
        });

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.mediaBrowserPanel);
        assert.equal(context.mediaBrowserPanel.entries.length, 1);
        assert.equal(context.mediaBrowserPanel.entries[0].filename, "alley.webp");
    });

    it("renders media-browser panel correctly for GM and denies for non-GM", () => {
        const feature = new MediaFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const panelModel = buildMediaBrowserPanelModel({
            entries: [{ filename: "alley.webp", path: "assets/images/scenes/alley.webp", type: "image" }],
            state: { view: "list", type: "all", sortKey: "filename" }
        });

        const context = {
            mediaBrowserPanel: panelModel
        };

        const htmlGM = feature.render({ id: "media-browser" }, context);
        assert.ok(htmlGM.includes("alley.webp"));

        globalThis.game.user.isGM = false;
        const htmlUser = feature.render({ id: "media-browser" }, context);
        assert.ok(htmlUser.includes("This panel is only available to the active Gamemaster"));
    });

    it("wires search query changes", () => {
        const feature = new MediaFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        feature.setSearchQuery("alley");
        assert.equal(feature.mediaBrowserState.query, "alley");
    });

    it("opens media browser panel for selection and confirms selection", async () => {
        let selectCallbackCalled = false;
        let selectedEntries = null;

        const feature = new MediaFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            render: () => { renderCalled = true; }
        });

        await feature.openMediaBrowserPanel({
            mode: "select",
            selectedPaths: ["assets/images/scenes/alley.webp"],
            onSelect: (entries) => {
                selectCallbackCalled = true;
                selectedEntries = entries;
            }
        });

        assert.equal(feature.mediaBrowserState.mode, "select");
        assert.deepEqual(feature.mediaBrowserState.selectedPaths, ["assets/images/scenes/alley.webp"]);

        // Load entries into feature first
        await feature.getMediaBrowserEntries();

        await feature.confirmMediaBrowserSelection();
        assert.ok(selectCallbackCalled);
        assert.equal(selectedEntries.length, 1);
        assert.equal(selectedEntries[0].filename, "alley.webp");
        assert.equal(feature.mediaBrowserState.mode, "browse");
        assert.deepEqual(feature.mediaBrowserState.selectedPaths, []);
    });
});
