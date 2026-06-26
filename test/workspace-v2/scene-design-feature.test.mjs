import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SceneDesignFeature } from "../../module/ui/workspace-v2/controllers/scene-design-feature.mjs";

const mockController = {
    panelRegistry: {
        get: (id) => ({ id })
    },
    isMapPanel: (panel) => panel?.baseId === "map" || String(panel?.id ?? "").startsWith("map:"),
    getPanelSceneId: (panel) => panel?.id === "map:scene-1" ? "scene-1" : "",
    getSceneDocumentById: (id) => id === "scene-1" ? { id } : null,
    getDesignActionScene: (panel, fallback) => ({ id: "scene-1" }),
    layoutEngine: {
        getLayout: () => ({
            root: {
                centerDock: {
                    stacks: [{
                        activePanelId: "map:scene-1",
                        panels: [{ id: "map:scene-1" }]
                    }]
                }
            }
        })
    }
};

describe("SceneDesignFeature", () => {
    it("owns toolbar and wall-selection state per scene", () => {
        globalThis.canvas = { scene: { id: "other-scene" }, walls: null };
        const scene = { id: "scene-1" };
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                getPanelSceneId: () => scene.id,
                getSceneDocumentById: () => scene
            }
        });

        feature.setSelectedWallIds(scene, ["wall-1", "wall-2"]);
        feature.setJoinableWallIds(scene, ["wall-2"]);
        feature.patchMapPanelToolbarState("map:scene-1", { mode: "walls", wallCommand: "join" });

        assert.deepEqual(feature.getMapPanelToolbarState({ id: "map:scene-1" }), {
            mode: "walls",
            wallCommand: "join",
            wallType: "wall",
            selectedWallCount: 2,
            joinableWallCount: 1
        });
    });

    it("normalizes detection overlays and clears empty overlays", () => {
        const feature = new SceneDesignFeature();
        const scene = { id: "scene-1" };
        feature.setSceneDetectedWallOverlayState(scene, {
            segments: [{ id: "a", wallKind: "door", x1: 1.2, y1: 2.7, x2: 10, y2: 20, selected: true }],
            intersections: [{ x: 1.4, y: 2.6 }]
        });

        assert.deepEqual(feature.getSceneDetectedWallOverlayState(scene), {
            segments: [{ id: "a", wallKind: "door", x1: 1, y1: 3, x2: 10, y2: 20, selected: true }],
            intersections: [{ x: 1, y: 3 }]
        });

        feature.setSceneDetectedWallOverlayState(scene, { segments: [] });
        assert.equal(feature.getSceneDetectedWallOverlayState(scene), null);
    });

    it("binds one keyboard listener and removes it on disposal", () => {
        const calls = [];
        const ownerDocument = {
            addEventListener: (type, listener) => calls.push(["add", type, listener]),
            removeEventListener: (type, listener) => calls.push(["remove", type, listener])
        };
        const feature = new SceneDesignFeature();
        const stubElement = {
            ownerDocument,
            addEventListener: () => {},
            querySelectorAll: () => []
        };

        feature.bind(stubElement);
        feature.bind(stubElement);
        feature.dispose();

        assert.equal(calls.filter(([action]) => action === "add").length, 1);
        assert.equal(calls.filter(([action]) => action === "remove").length, 1);
        assert.equal(calls[0][2], calls[1][2]);
    });

    it("wires delegated click listeners on bind", async () => {
        const clickHandlers = [];
        const rootElement = {
            ownerDocument: {
                addEventListener: () => {},
                removeEventListener: () => {}
            },
            addEventListener: (event, handler) => {
                if (event === "click") clickHandlers.push(handler);
            },
            querySelectorAll: () => []
        };

        let designActionExecuted = null;
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                ...mockController,
                panelRegistry: { get: (id) => ({ id }) },
                makeSceneMapPanelDef: () => null,
                getDesignActionScene: () => null
            },
            designActionRegistry: {
                get: (id) => ({
                    label: id,
                    execute: async () => {
                        designActionExecuted = id;
                        return { ok: true, silent: true };
                    }
                })
            },
            gridCalibrationController: { active: false }
        });

        globalThis.game = { user: { isGM: true }, scenes: { active: null, viewed: null }, combats: null, combat: null };
        globalThis.canvas = { tokens: { controlled: [] } };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        feature.bind(rootElement);

        assert.equal(clickHandlers.length, 1);

        // Simulate click on mode select
        const button = {
            dataset: { mapPanelId: "map:scene-1", mode: "walls" },
            closest: (selector) => selector === "[data-action='map-mode-select']" ? button : null
        };

        const event = {
            target: button,
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        await clickHandlers[0](event);

        assert.equal(designActionExecuted, "scene.walls");
    });

    it("prepares context for scenes and scene-properties panels", async () => {
        globalThis.canvas = null;
        const viewedScene = {
            id: "scene-1",
            name: "Rookery Yard",
            width: 1200,
            height: 800,
            shiftX: 10,
            shiftY: 20,
            grid: { type: 1, size: 100, distance: 5, units: "ft" }
        };
        const mockWorkspaceController = {
            getViewedSceneDocument: () => viewedScene,
            getScenePropertiesScene: () => viewedScene,
            propertiesState: { status: "Success", error: "" },
            layoutEngine: {
                getLayout: () => ({
                    root: {
                        centerDock: {
                            stacks: [{
                                activePanelId: "map:scene-1",
                                panels: [{ id: "map:scene-1" }]
                            }]
                        }
                    }
                })
            }
        };

        const feature = new SceneDesignFeature({
            sceneWorkspaceController: mockWorkspaceController,
            gridCalibrationController: { state: { active: false } },
            designActionRegistry: {
                getApplicableActions: () => []
            }
        });

        globalThis.game = {
            scenes: [],
            actors: { contents: [] },
            user: { isGM: true }
        };

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.scene);
        assert.equal(context.scene.id, "scene-1");
        assert.equal(context.scene.name, "Rookery Yard");
        assert.equal(context.scene.width, 1200);

        assert.ok(context.scenesPanel);
        assert.equal(context.scenesPanel.count, 0);

        assert.ok(context.scenePropertiesPanel);
        assert.equal(context.scenePropertiesPanel.status, "Success");

        assert.ok(context.designIssuesPanel, "prepareContext should build designIssuesPanel");
    });

    it("registers designIssues hook family on hooksController during construction", () => {
        const registered = {};
        const hooksController = {
            registerFamily: (name, entries) => { registered[name] = entries; }
        };
        new SceneDesignFeature({ hooksController });
        assert.ok(registered.designIssues, "designIssues family should be registered");
        assert.ok(registered.designIssues.length > 0, "designIssues family should have entries");
        const events = registered.designIssues.map((e) => e.event);
        assert.ok(events.includes("updateScene"));
        assert.ok(events.includes("createWall"));
        assert.ok(events.includes("createActor"));
        assert.ok(events.includes("deleteCombatant"));
    });

    it("executeDesignAction dispatches via registry and posts success notification", async () => {
        const notifications = { infoMessages: [], warnMessages: [], errorMessages: [] };
        globalThis.ui = {
            notifications: {
                info: (m) => notifications.infoMessages.push(m),
                warn: (m) => notifications.warnMessages.push(m),
                error: (m) => notifications.errorMessages.push(m)
            }
        };
        globalThis.game = { scenes: { active: null, viewed: null }, combats: null, combat: null };
        globalThis.canvas = { tokens: { controlled: [] } };

        let executedWith = null;
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                panelRegistry: { get: () => null },
                makeSceneMapPanelDef: () => null,
                getDesignActionScene: (panel, fallback) => fallback,
                layoutEngine: {
                    getLayout: () => ({ root: { centerDock: { stacks: [] } } })
                }
            },
            designActionRegistry: {
                get: (id) => id === "scene.create" ? {
                    label: "Create Scene",
                    execute: async (ctx) => { executedWith = ctx; return { message: "Scene created." }; }
                } : null
            }
        });

        await feature.executeDesignAction("scene.create", { panelId: "" });

        assert.ok(executedWith, "action.execute should have been called");
        assert.equal(typeof executedWith.app.openScenePropertiesPanel, "function",
            "app should expose openScenePropertiesPanel");
        assert.ok(notifications.infoMessages.some((m) => m.includes("Scene created")));
    });

    it("executeDesignAction emits warn notification on warn-level result", async () => {
        const warnMessages = [];
        globalThis.ui = { notifications: { info: () => {}, warn: (m) => warnMessages.push(m), error: () => {} } };
        globalThis.game = { scenes: { active: null, viewed: null }, combats: null, combat: null };
        globalThis.canvas = { tokens: { controlled: [] } };

        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                panelRegistry: { get: () => null },
                makeSceneMapPanelDef: () => null,
                getDesignActionScene: () => null,
                layoutEngine: { getLayout: () => ({ root: { centerDock: { stacks: [] } } }) }
            },
            designActionRegistry: {
                get: () => ({
                    label: "Some Action",
                    execute: async () => ({ level: "warn", message: "Not available." })
                })
            }
        });

        await feature.executeDesignAction("some.action");
        assert.ok(warnMessages.some((m) => m.includes("Not available")));
    });

    it("executeDesignAction does nothing when action is not in registry", async () => {
        const feature = new SceneDesignFeature({
            designActionRegistry: { get: () => null }
        });
        // Should not throw
        await feature.executeDesignAction("nonexistent.action");
    });

    it("executeDesignIssueNavigation warns when actor not found", async () => {
        const warnMessages = [];
        globalThis.ui = { notifications: { warn: (m) => warnMessages.push(m), error: () => {}, info: () => {} } };
        globalThis.game = { actors: { get: () => null } };

        const feature = new SceneDesignFeature();
        await feature.executeDesignIssueNavigation("navigate.actor", { subjectId: "missing-id" });

        assert.ok(warnMessages.some((m) => m.includes("Actor not found")));
    });

    it("executeDesignIssueNavigation warns on unknown action", async () => {
        const warnLogs = [];
        const original = console.warn;
        console.warn = (...args) => warnLogs.push(args);

        const feature = new SceneDesignFeature();
        await feature.executeDesignIssueNavigation("navigate.unknown", {});

        console.warn = original;
        assert.ok(warnLogs.some((args) => args.join(" ").includes("Unknown navigate action")));
    });

    it("renders scenes and scene-properties panels", () => {
        const feature = new SceneDesignFeature();

        const scenesHtml = feature.render({ id: "scenes" }, {
            scenesPanel: { count: 0, entries: [] }
        });
        assert.match(scenesHtml, /totc-v2-scenes-panel/);

        const propertiesHtml = feature.render({ id: "scene-properties" }, {
            gm: { isGM: true },
            scenePropertiesPanel: {
                scene: { name: "Rookery Yard" },
                actors: []
            }
        });
        assert.match(propertiesHtml, /totc-v2-scene-properties-panel/);
    });

    it("centers map on token when token entry is double-clicked", async () => {
        const listeners = {};
        const tokenEntry = {
            dataset: { sceneId: "scene-1", tokenCenterX: "250", tokenCenterY: "350" },
            addEventListener(type, handler) { listeners[type] = handler; }
        };
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: () => {},
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-token-center']") return [tokenEntry];
                return [];
            }
        };
        const centered = [];
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                ...mockController,
                getSceneDocumentById: () => null,
                stateStore: null
            },
            centerSceneMapOnToken: async (payload) => { centered.push(payload); return true; }
        });

        feature.bind(root);
        await listeners.dblclick({ preventDefault() {}, stopPropagation() {} });

        assert.deepEqual(centered, [{ sceneId: "scene-1", x: 250, y: 350 }]);
    });

    it("deletes token when delete button is clicked", async () => {
        const listeners = {};
        const deleteBtn = {
            dataset: { sceneId: "scene-1", tokenId: "token-abc" },
            addEventListener(type, handler) { listeners[type] = handler; }
        };
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: () => {},
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-token-delete']") return [deleteBtn];
                return [];
            }
        };
        const deletedIds = [];
        let renderCalled = false;
        const mockScene = {
            deleteEmbeddedDocuments: async (type, ids) => {
                if (type === "Token") deletedIds.push(...ids);
            }
        };
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                ...mockController,
                getSceneDocumentById: (id) => id === "scene-1" ? mockScene : null,
                stateStore: null
            },
            render: () => { renderCalled = true; }
        });

        feature.bind(root);
        await listeners.click({ preventDefault() {}, stopPropagation() {} });

        assert.deepEqual(deletedIds, ["token-abc"]);
        assert.equal(renderCalled, true);
    });

    it("syncs background dimensions through the scene properties sync action", async () => {
        const previousImage = globalThis.Image;
        class TestImage {
            set src(value) {
                this._src = value;
                this.naturalWidth = 2400;
                this.naturalHeight = 1600;
                this.onload();
            }
        }
        globalThis.Image = TestImage;

        try {
            const listeners = {};
            const syncButton = {
                addEventListener(type, handler) { listeners[type] = handler; }
            };
            const root = {
                ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
                addEventListener: () => {},
                querySelectorAll: (selector) => {
                    if (selector === "[data-action='scene-properties-sync-background-dimensions']") return [syncButton];
                    return [];
                }
            };
            let receivedUpdate = null;
            let renderCount = 0;
            const scene = {
                id: "scene-1",
                name: "Rookery Yard",
                img: "assets/images/scenes/rookery.webp",
                update: async (data) => { receivedUpdate = data; return scene; }
            };
            const patchedState = {};
            const feature = new SceneDesignFeature({
                sceneWorkspaceController: {
                    ...mockController,
                    getScenePropertiesScene: () => scene,
                    patchState: (patch) => Object.assign(patchedState, patch),
                    propertiesState: patchedState,
                    stateStore: null
                },
                render: () => { renderCount += 1; },
                activityLogger: { info: () => {} }
            });

            feature.bind(root);
            await listeners.click({ preventDefault() {}, stopPropagation() {} });

            assert.deepEqual(receivedUpdate, {
                img: "assets/images/scenes/rookery.webp",
                "background.src": "assets/images/scenes/rookery.webp",
                "texture.src": "assets/images/scenes/rookery.webp",
                width: 2400,
                height: 1600
            });
            assert.equal(patchedState.status, "Background fitted to 2400 x 1600.");
            assert.equal(patchedState.error, "");
            assert.ok(renderCount >= 2);
        } finally {
            if (previousImage === undefined) {
                delete globalThis.Image;
            } else {
                globalThis.Image = previousImage;
            }
        }
    });

    it("saveSceneName persists the name and triggers a render", async () => {
        let savedName = null;
        let renderCalled = false;
        const scene = {
            id: "scene-1",
            name: "Old Name",
            update: async (data) => { savedName = data.name; }
        };
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                ...mockController,
                getScenePropertiesScene: () => scene,
                patchState: () => {},
                stateStore: null
            },
            render: () => { renderCalled = true; },
            activityLogger: { info: () => {} }
        });

        await feature.saveSceneName("New Name");

        assert.equal(savedName, "New Name");
        assert.equal(renderCalled, true);
    });
});
