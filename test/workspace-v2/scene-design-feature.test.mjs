import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
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

const flushEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

function createScenePropertiesDomHarness({
    scene,
    canvas,
    panelModel = {},
    actors = []
} = {}) {
    const dom = new JSDOM("<!doctype html><main></main>", { url: "http://localhost" });
    const root = dom.window.document.querySelector("main");
    const patchedState = {};
    const renderCalls = [];
    const activeScene = scene ?? {
        id: "scene-1",
        name: "Scene One",
        update: async () => {},
        updateEmbeddedDocuments: async () => {},
        tokens: { contents: [] }
    };
    const activeCanvas = canvas ?? {
        scene: { id: activeScene.id },
        tokens: { controlled: [] },
        perception: { update: () => {} }
    };
    const feature = new SceneDesignFeature({
        scenePort: {
            getCurrentScene: () => activeScene,
            getViewedScene: () => activeScene,
            getSceneById: (id) => String(id ?? "") === String(activeScene.id ?? "") ? activeScene : null,
            getScenes: () => [activeScene],
            getScenePropertiesScene: () => activeScene,
            getScenePropertiesState: () => patchedState,
            patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
            getDesignActionScene: (_panel, fallback) => fallback,
            getActorById: () => null,
            getActors: () => actors,
            getCombat: () => null,
            getCanvas: () => activeCanvas,
            getUi: () => globalThis.ui,
            getFoundry: () => globalThis.foundry,
            isGM: () => true
        },
        panelPort: {
            getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
            getPrimaryActivePanel: () => null,
            getActiveCenterMapPanel: () => null,
            getPanelDefinition: () => null,
            isMapPanel: () => false,
            getPanelSceneId: () => "",
            makeSceneMapPanelDef: () => null,
            openSceneMapPanel: () => ({}),
            bindScene: () => {},
            saveUserLayout: async () => {},
            removeDeletedSceneMapPanel: async () => {},
            openScenePropertiesPanel: async () => {},
            createSceneDesignScene: async () => ({ ok: true })
        },
        canvasRef: () => activeCanvas,
        render: (options) => renderCalls.push(options),
        activityLogger: { info: () => {}, error: () => {} },
        logger: { error: () => {} }
    });

    const renderPanel = (overrides = {}) => {
        root.innerHTML = feature.render({ id: "scene-properties" }, {
            gm: { isGM: true },
            scenePropertiesPanel: {
                sceneId: activeScene.id,
                sceneName: activeScene.name,
                illuminationLevel: 1,
                illuminationPercent: "100%",
                tokenVisionByType: {
                    hero: { enabled: true, range: 1 },
                    pawn: { enabled: true, range: 1 },
                    villain: { enabled: true, range: 1 }
                },
                sceneTokens: [],
                sceneToolActions: [],
                sceneToolsState: {},
                sceneToolsPanelId: "map:scene-1",
                gridCalibration: { active: false },
                uploadEnabled: false,
                dimensionSyncEnabled: false,
                isDefault: false,
                status: "",
                error: "",
                ...panelModel,
                ...overrides
            }
        });
    };

    renderPanel();
    feature.bind(root);

    return { dom, root, feature, renderPanel, patchedState, renderCalls };
}

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

    it("routes the scenes create button through the workspace scene draft flow", async () => {
        let delegatedClickHandler = null;
        let createDraftCalled = false;
        const rootElement = {
            ownerDocument: {
                addEventListener: () => {},
                removeEventListener: () => {}
            },
            addEventListener: (event, handler) => {
                if (event === "click") delegatedClickHandler = handler;
            },
            querySelectorAll: () => []
        };

        const feature = new SceneDesignFeature({
            scenePort: {
                getCurrentScene: () => null,
                getViewedScene: () => null,
                getSceneById: () => null,
                getScenes: () => [],
                getScenePropertiesScene: () => null,
                getScenePropertiesState: () => ({}),
                patchScenePropertiesState: () => {},
                getDesignActionScene: (_panel, fallback) => fallback,
                getActorById: () => null,
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => ({ tokens: { controlled: [] } }),
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                isGM: () => true
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async () => {},
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => {
                    createDraftCalled = true;
                    return { ok: true, silent: true };
                }
            },
            gridCalibrationController: { state: { active: false } },
            designActionRegistry: {
                get: (id) => id === "scene.create"
                    ? {
                        label: "Create Scene",
                        execute: async (context) => context.app.createSceneDesignScene()
                    }
                    : null
            }
        });

        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        feature.bind(rootElement);
        feature.bind(rootElement);
        assert.equal(typeof delegatedClickHandler, "function");

        const createButton = {
            closest: (selector) => selector === "[data-action='scenes-create-scene']" ? createButton : null
        };
        await delegatedClickHandler({
            target: createButton,
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(createDraftCalled, true);
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

    it("prepares context through narrow scene and panel ports", async () => {
        const viewedScene = {
            id: "scene-ports",
            name: "Ports Yard",
            width: 900,
            height: 600,
            grid: { type: 1, size: 50, distance: 5, units: "ft" }
        };
        const feature = new SceneDesignFeature({
            scenePort: {
                getViewedScene: () => viewedScene,
                getCurrentScene: () => viewedScene,
                getScenes: () => [viewedScene],
                getScenePropertiesScene: () => viewedScene,
                getScenePropertiesState: () => ({ status: "Via ports", error: "" }),
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => null,
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                getSceneById: () => viewedScene,
                getActorById: () => null,
                getDesignActionScene: (_panel, fallback) => fallback,
                isGM: () => true,
                patchScenePropertiesState: () => {}
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async () => {},
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => ({ ok: true })
            },
            gridCalibrationController: { state: { active: false } },
            designActionRegistry: { getApplicableActions: () => [] }
        });

        const context = {};
        await feature.prepareContext(context);

        assert.equal(context.scene.name, "Ports Yard");
        assert.equal(context.scenePropertiesPanel.status, "Via ports");
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

    it("deletes scenes through delegated scene-properties clicks after later renders", async () => {
        let delegatedClickHandler = null;
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: (type, handler) => {
                if (type === "click") delegatedClickHandler = handler;
            },
            querySelectorAll: () => []
        };
        let deleted = false;
        let removedPanelScene = null;
        let renderCount = 0;
        const patchedState = {};
        const scene = {
            id: "scene-1",
            name: "Rookery Yard",
            delete: async () => {
                deleted = true;
            }
        };
        const feature = new SceneDesignFeature({
            scenePort: {
                getCurrentScene: () => scene,
                getViewedScene: () => scene,
                getSceneById: () => scene,
                getScenes: () => [scene],
                getScenePropertiesScene: () => scene,
                getScenePropertiesState: () => patchedState,
                patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                getDesignActionScene: (_panel, fallback) => fallback,
                getActorById: () => null,
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => ({ tokens: { controlled: [] } }),
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                isGM: () => true
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async (deletedScene) => {
                    removedPanelScene = deletedScene;
                    return {};
                },
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => ({ ok: true })
            },
            confirmRef: () => () => true,
            render: () => { renderCount += 1; },
            logger: { error: () => {} }
        });

        feature.bind(root);
        feature.bind(root);
        assert.equal(typeof delegatedClickHandler, "function");

        const deleteButton = {
            closest: (selector) => selector === "[data-action='scene-properties-delete']" ? deleteButton : null
        };
        await delegatedClickHandler({
            target: deleteButton,
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(deleted, true);
        assert.equal(removedPanelScene, scene);
        assert.equal(patchedState.sceneId, "");
        assert.equal(patchedState.status, "Deleted Rookery Yard.");
        assert.equal(patchedState.error, "");
        assert.equal(renderCount, 1);
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

    it("resets fog of war through the scene properties action", async () => {
        const previousGame = globalThis.game;
        const listeners = {};
        const resetFogButton = {
            addEventListener(type, handler) { listeners[type] = handler; }
        };
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: () => {},
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-properties-reset-fog']") return [resetFogButton];
                return [];
            }
        };

        const deletedFogCalls = [];
        const FogExploration = {
            deleteDocuments: async (...args) => { deletedFogCalls.push(args); }
        };
        globalThis.game = {
            collections: {
                get: (name) => {
                    if (name !== "FogExploration") return null;
                    return {
                        contents: [{ id: "fog-1", scene: "scene-1" }],
                        documentClass: FogExploration
                    };
                }
            }
        };

        let fogCleared = false;
        const perceptionUpdates = [];
        const canvasRef = {
            scene: { id: "scene-1" },
            fog: { clear: () => { fogCleared = true; } },
            perception: { update: (data) => perceptionUpdates.push(data) }
        };
        const patchedState = {};
        const scene = { id: "scene-1", name: "Rookery Yard" };

        try {
            const feature = new SceneDesignFeature({
                scenePort: {
                    getCurrentScene: () => scene,
                    getViewedScene: () => scene,
                    getSceneById: () => scene,
                    getScenes: () => [scene],
                    getScenePropertiesScene: () => scene,
                    getScenePropertiesState: () => patchedState,
                    patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                    getDesignActionScene: (_panel, fallback) => fallback,
                    getActorById: () => null,
                    getActors: () => [],
                    getCombat: () => null,
                    getCanvas: () => canvasRef,
                    getUi: () => globalThis.ui,
                    getFoundry: () => globalThis.foundry,
                    isGM: () => true
                },
                panelPort: {
                    getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                    getPrimaryActivePanel: () => null,
                    getActiveCenterMapPanel: () => null,
                    getPanelDefinition: () => null,
                    isMapPanel: () => false,
                    getPanelSceneId: () => "",
                    makeSceneMapPanelDef: () => null,
                    openSceneMapPanel: () => ({}),
                    bindScene: () => {},
                    saveUserLayout: async () => {},
                    removeDeletedSceneMapPanel: async () => {},
                    openScenePropertiesPanel: async () => {},
                    createSceneDesignScene: async () => ({ ok: true })
                },
                foundryRef: () => ({ documents: { FogExploration } }),
                canvasRef: () => canvasRef,
                render: () => {},
                activityLogger: { info: () => {}, error: () => {} },
                logger: { error: () => {} }
            });

            feature.bind(root);
            await listeners.click({ preventDefault() {}, stopPropagation() {} });

            assert.deepEqual(deletedFogCalls, [[ ["fog-1"] ]]);
            assert.equal(fogCleared, true);
            assert.deepEqual(perceptionUpdates, [{
                initializeVision: true,
                refreshVision: true,
                refreshLighting: true
            }]);
            assert.equal(patchedState.status, "Fog of war reset for this scene.");
            assert.equal(patchedState.error, "");
        } finally {
            if (previousGame === undefined) delete globalThis.game;
            else globalThis.game = previousGame;
        }
    });

    it("uploads a scene background with the scene name and applies it to the bound scene", async () => {
        const previousImage = globalThis.Image;
        const previousFile = globalThis.File;
        class TestImage {
            set src(value) {
                this._src = value;
                this.naturalWidth = 1920;
                this.naturalHeight = 1080;
                this.onload();
            }
        }
        class TestFile {
            constructor(_parts, name, options = {}) {
                this.name = name;
                this.type = options.type ?? "";
                this.lastModified = options.lastModified ?? 0;
            }
        }
        globalThis.Image = TestImage;
        globalThis.File = TestFile;

        try {
            let changeHandler = null;
            const root = {
                ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
                addEventListener: (type, handler) => {
                    if (type === "change") changeHandler = handler;
                },
                querySelectorAll: () => []
            };
            const createdDirectories = [];
            let uploaded = null;
            let receivedUpdate = null;
            const scene = {
                id: "scene-1",
                name: "New Scene",
                update: async (data) => {
                    receivedUpdate = data;
                    if (data.name) scene.name = data.name;
                    scene.img = data.img;
                    scene._source = {
                        img: data.img,
                        background: { src: data["background.src"] },
                        texture: { src: data["texture.src"] }
                    };
                    return scene;
                }
            };
            const patchedState = { sceneName: "Rookery Yard" };
            const feature = new SceneDesignFeature({
                scenePort: {
                    getCurrentScene: () => scene,
                    getViewedScene: () => scene,
                    getSceneById: () => scene,
                    getScenes: () => [scene],
                    getScenePropertiesScene: () => scene,
                    getScenePropertiesState: () => patchedState,
                    patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                    getDesignActionScene: (_panel, fallback) => fallback,
                    getActorById: () => null,
                    getActors: () => [],
                    getCombat: () => null,
                    getCanvas: () => ({ tokens: { controlled: [] } }),
                    getUi: () => globalThis.ui,
                    getFoundry: () => globalThis.foundry,
                    isGM: () => true
                },
                panelPort: {
                    getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                    getPrimaryActivePanel: () => null,
                    getActiveCenterMapPanel: () => null,
                    getPanelDefinition: () => null,
                    isMapPanel: () => false,
                    getPanelSceneId: () => "",
                    makeSceneMapPanelDef: () => null,
                    openSceneMapPanel: () => ({}),
                    bindScene: () => {},
                    saveUserLayout: async () => {},
                    removeDeletedSceneMapPanel: async () => {},
                    openScenePropertiesPanel: async () => {},
                    createSceneDesignScene: async () => ({ ok: true })
                },
                foundryRef: () => ({
                    applications: {
                        apps: {
                            FilePicker: {
                                implementation: {
                                    createDirectory: async (_source, directory) => createdDirectories.push(directory),
                                    upload: async (_source, directory, file, options) => {
                                        uploaded = { directory, fileName: file.name, options };
                                        return { path: `${directory}/${file.name}` };
                                    }
                                }
                            }
                        }
                    }
                }),
                render: () => {},
                activityLogger: { info: () => {}, warn: () => {}, error: () => {} },
                logger: { error: () => {} }
            });

            globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

            feature.bind(root);
            feature.bind(root);
            assert.equal(typeof changeHandler, "function");

            const input = {
                files: [{
                    name: "Original Upload.PNG",
                    type: "image/png",
                    size: 100,
                    lastModified: 123
                }],
                matches: (selector) => selector === "[data-action='scene-properties-background-upload']"
            };
            await changeHandler({ target: input });

            assert.deepEqual(createdDirectories, ["assets", "assets/images", "assets/images/scenes"]);
            assert.deepEqual(uploaded, {
                directory: "assets/images/scenes",
                fileName: "rookery-yard.png",
                options: { notify: true, overwrite: true }
            });
            assert.deepEqual(receivedUpdate, {
                img: "assets/images/scenes/rookery-yard.png",
                "background.src": "assets/images/scenes/rookery-yard.png",
                "texture.src": "assets/images/scenes/rookery-yard.png",
                width: 1900,
                height: 1100
            });
            assert.equal(scene.img, "assets/images/scenes/rookery-yard.png");
            assert.equal(patchedState.status, "Background saved: rookery-yard.png.");
            assert.equal(patchedState.error, "");
        } finally {
            if (previousImage === undefined) {
                delete globalThis.Image;
            } else {
                globalThis.Image = previousImage;
            }
            if (previousFile === undefined) {
                delete globalThis.File;
            } else {
                globalThis.File = previousFile;
            }
        }
    });

    it("updates scene illumination through the scene properties slider", async () => {
        let changeHandler = null;
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: (type, handler) => {
                if (type === "change") changeHandler = handler;
            },
            querySelectorAll: () => []
        };
        let receivedUpdate = null;
        let outputText = "";
        const scene = {
            id: "scene-1",
            update: async (data) => {
                receivedUpdate = data;
            }
        };
        const patchedState = {};
        const feature = new SceneDesignFeature({
            scenePort: {
                getCurrentScene: () => scene,
                getViewedScene: () => scene,
                getSceneById: () => scene,
                getScenes: () => [scene],
                getScenePropertiesScene: () => scene,
                getScenePropertiesState: () => patchedState,
                patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                getDesignActionScene: (_panel, fallback) => fallback,
                getActorById: () => null,
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => ({ tokens: { controlled: [] } }),
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                isGM: () => true
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async () => {},
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => ({ ok: true })
            },
            render: () => {},
            activityLogger: { info: () => {}, error: () => {} },
            logger: { error: () => {} }
        });

        feature.bind(root);

        const input = {
            value: "0.4",
            matches: (selector) => selector === "[data-action='scene-properties-illumination']",
            closest: () => ({
                querySelector: (selector) => selector === "[data-role='scene-properties-illumination-output']"
                    ? {
                        set textContent(value) { outputText = value; },
                        get textContent() { return outputText; }
                    }
                    : null
            })
        };
        await changeHandler({ target: input });

        assert.deepEqual(receivedUpdate, { "environment.darknessLevel": 0.6 });
        assert.equal(outputText, "40%");
        assert.equal(patchedState.status, "Scene illumination updated.");
        assert.equal(patchedState.error, "");
    });

    it("auto-applies token vision settings to scene tokens when settings change", async () => {
        let changeHandler = null;
        const tokenVisionPanel = {
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-token-vision-range']") {
                    return [{ value: "1", dataset: { tokenType: "hero" } }];
                }
                return [];
            },
            querySelector: (selector) => {
                if (selector.includes("data-token-type='hero'")) return { checked: true };
                return null;
            }
        };
        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: (type, handler) => {
                if (type === "change") changeHandler = handler;
            },
            querySelector: (selector) => selector === ".totc-v2-scene-properties-panel__token-vision" ? tokenVisionPanel : null,
            querySelectorAll: () => []
        };

        let sceneFlagUpdate = null;
        let tokenUpdates = null;
        const perceptionUpdates = [];
        const scene = {
            id: "scene-1",
            update: async (data) => { sceneFlagUpdate = data; },
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; },
            tokens: {
                contents: [{ id: "token-1", actor: { type: "hero" } }]
            }
        };
        const patchedState = {};
        const canvasRef = {
            scene: { id: "scene-1" },
            tokens: { controlled: [] },
            perception: { update: (data) => perceptionUpdates.push(data) }
        };
        const feature = new SceneDesignFeature({
            scenePort: {
                getCurrentScene: () => scene,
                getViewedScene: () => scene,
                getSceneById: () => scene,
                getScenes: () => [scene],
                getScenePropertiesScene: () => scene,
                getScenePropertiesState: () => patchedState,
                patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                getDesignActionScene: (_panel, fallback) => fallback,
                getActorById: () => null,
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => canvasRef,
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                isGM: () => true
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async () => {},
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => ({ ok: true })
            },
            canvasRef: () => canvasRef,
            render: () => {},
            activityLogger: { info: () => {}, error: () => {} },
            logger: { error: () => {} }
        });

        feature.bind(root);
        const input = {
            matches: (selector) => selector === "[data-action='scene-token-vision-range'], [data-action='scene-token-vision-enabled']"
        };
        await changeHandler({ target: input });

        assert.deepEqual(sceneFlagUpdate, {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 1 },
                pawn: { enabled: true, range: 1 },
                villain: { enabled: true, range: 1 }
            }
        });
        assert.deepEqual(tokenUpdates, [{
            _id: "token-1",
            "sight.enabled": true,
            "sight.range": 1
        }]);
        assert.deepEqual(perceptionUpdates, [{ initializeVision: true, refreshVision: true }]);
    });

    it("keeps scene illumination working after Dockview replaces the scene properties body", async () => {
        let receivedUpdate = null;
        const scene = {
            id: "scene-1",
            name: "Scene One",
            update: async (data) => { receivedUpdate = data; },
            updateEmbeddedDocuments: async () => {},
            tokens: { contents: [] }
        };
        const { root, renderPanel, patchedState } = createScenePropertiesDomHarness({ scene });

        renderPanel({ illuminationLevel: 0.9, illuminationPercent: "90%" });
        const slider = root.querySelector("[data-action='scene-properties-illumination']");
        const output = root.querySelector("[data-role='scene-properties-illumination-output']");
        slider.value = "0.35";
        slider.dispatchEvent(new root.ownerDocument.defaultView.Event("input", { bubbles: true }));
        assert.equal(output.textContent, "35%");

        slider.dispatchEvent(new root.ownerDocument.defaultView.Event("change", { bubbles: true }));
        await flushEvents();

        assert.deepEqual(receivedUpdate, { "environment.darknessLevel": 0.65 });
        assert.equal(patchedState.status, "Scene illumination updated.");
        assert.equal(patchedState.error, "");
    });

    it("keeps token vision type controls working after Dockview replaces the scene properties body", async () => {
        let sceneFlagUpdate = null;
        let tokenUpdates = null;
        const perceptionUpdates = [];
        const scene = {
            id: "scene-1",
            name: "Scene One",
            update: async (data) => { sceneFlagUpdate = data; },
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; },
            tokens: {
                contents: [
                    { id: "token-hero", actor: { type: "hero" } },
                    { id: "token-pawn", actor: { type: "pawn" } }
                ]
            }
        };
        const canvas = {
            scene: { id: "scene-1" },
            tokens: { controlled: [] },
            perception: { update: (data) => perceptionUpdates.push(data) }
        };
        const { root, renderPanel, patchedState } = createScenePropertiesDomHarness({ scene, canvas });

        renderPanel();
        const heroRange = root.querySelector("[data-action='scene-token-vision-range'][data-token-type='hero']");
        const pawnToggle = root.querySelector("[data-action='scene-token-vision-enabled'][data-token-type='pawn']");
        heroRange.value = "2.5";
        pawnToggle.checked = false;
        heroRange.dispatchEvent(new root.ownerDocument.defaultView.Event("change", { bubbles: true }));
        await flushEvents();

        assert.deepEqual(sceneFlagUpdate, {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 2.5 },
                pawn: { enabled: false, range: 1 },
                villain: { enabled: true, range: 1 }
            }
        });
        assert.deepEqual(tokenUpdates, [{
            _id: "token-hero",
            "sight.enabled": true,
            "sight.range": 2.5
        }]);
        assert.deepEqual(perceptionUpdates, [{ initializeVision: true, refreshVision: true }]);
        assert.equal(patchedState.error, "");
    });

    it("keeps apply-selected token vision working after Dockview replaces the scene properties body", async () => {
        let sceneFlagUpdate = null;
        let tokenUpdates = null;
        const perceptionUpdates = [];
        const scene = {
            id: "scene-1",
            name: "Scene One",
            update: async (data) => { sceneFlagUpdate = data; },
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; },
            tokens: { contents: [] }
        };
        const canvas = {
            scene: { id: "scene-1" },
            tokens: {
                controlled: [
                    { document: { id: "selected-hero", actor: { type: "hero" } } },
                    { document: { id: "selected-villain", actor: { type: "villain" } } }
                ]
            },
            perception: { update: (data) => perceptionUpdates.push(data) }
        };
        const { root, renderPanel, patchedState } = createScenePropertiesDomHarness({ scene, canvas });

        renderPanel();
        root.querySelector("[data-action='scene-token-vision-range'][data-token-type='hero']").value = "3";
        root.querySelector("[data-action='scene-token-vision-enabled'][data-token-type='villain']").checked = false;
        root.querySelector("[data-action='scene-token-vision-apply-selected']")
            .dispatchEvent(new root.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));
        await flushEvents();

        assert.deepEqual(sceneFlagUpdate, {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 3 },
                pawn: { enabled: true, range: 1 },
                villain: { enabled: false, range: 1 }
            }
        });
        assert.deepEqual(tokenUpdates, [{
            _id: "selected-hero",
            "sight.enabled": true,
            "sight.range": 3
        }]);
        assert.deepEqual(perceptionUpdates, [{ initializeVision: true, refreshVision: true }]);
        assert.equal(patchedState.error, "");
        assert.match(String(patchedState.status ?? ""), /Applied token vision to 1 selected token \(1 skipped\)/);
    });

    it("saveSceneName persists the name and triggers a render", async () => {
        let savedName = null;
        let renderCalled = false;
        const patchedState = {};
        const scene = {
            id: "scene-1",
            name: "Old Name",
            update: async (data) => {
                savedName = data.name;
                scene.name = data.name;
            }
        };
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: {
                ...mockController,
                getScenePropertiesScene: () => scene,
                patchState: (patch) => Object.assign(patchedState, patch),
                stateStore: null
            },
            render: () => { renderCalled = true; },
            activityLogger: { info: () => {} }
        });

        await feature.saveSceneName("New Name");

        assert.equal(savedName, "New Name");
        assert.equal(patchedState.sceneName, "New Name");
        assert.equal(renderCalled, true);
    });

    it("applies per-type token vision to selected scene tokens", async () => {
        const listeners = {};
        const applyButton = {
            addEventListener(type, handler) { listeners[type] = handler; }
        };

        const enabledInputs = {
            hero: { checked: true },
            pawn: { checked: false },
            villain: { checked: true }
        };
        const tokenVisionPanel = {
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-token-vision-range']") {
                    return [
                        { value: "0.5", dataset: { tokenType: "hero" } },
                        { value: "1.5", dataset: { tokenType: "pawn" } },
                        { value: "0.25", dataset: { tokenType: "villain" } }
                    ];
                }
                return [];
            },
            querySelector: (selector) => {
                if (selector.includes("data-token-type='hero'")) return enabledInputs.hero;
                if (selector.includes("data-token-type='pawn'")) return enabledInputs.pawn;
                if (selector.includes("data-token-type='villain'")) return enabledInputs.villain;
                return null;
            }
        };

        const root = {
            ownerDocument: { addEventListener: () => {}, removeEventListener: () => {} },
            addEventListener: () => {},
            querySelector: (selector) => selector === ".totc-v2-scene-properties-panel__token-vision" ? tokenVisionPanel : null,
            querySelectorAll: (selector) => {
                if (selector === "[data-action='scene-token-vision-apply-selected']") return [applyButton];
                return [];
            }
        };

        const patchedState = {};
        let sceneFlagUpdate = null;
        let tokenUpdates = null;
        const scene = {
            id: "scene-1",
            update: async (data) => { sceneFlagUpdate = data; },
            updateEmbeddedDocuments: async (_type, updates) => { tokenUpdates = updates; }
        };
        const selectedTokens = [
            { document: { id: "token-1", actor: { type: "hero" } } },
            { document: { id: "token-2", actor: { type: "pawn" } } },
            { document: { id: "token-3", actor: { type: "villain" } } }
        ];
        const perceptionUpdates = [];
        const canvasRef = {
            scene: { id: "scene-1" },
            tokens: { controlled: selectedTokens },
            perception: {
                update: (data) => perceptionUpdates.push(data)
            }
        };

        const feature = new SceneDesignFeature({
            scenePort: {
                getCurrentScene: () => scene,
                getViewedScene: () => scene,
                getSceneById: () => scene,
                getScenes: () => [scene],
                getScenePropertiesScene: () => scene,
                getScenePropertiesState: () => patchedState,
                patchScenePropertiesState: (patch) => Object.assign(patchedState, patch),
                getDesignActionScene: (_panel, fallback) => fallback,
                getActorById: () => null,
                getActors: () => [],
                getCombat: () => null,
                getCanvas: () => canvasRef,
                getUi: () => globalThis.ui,
                getFoundry: () => globalThis.foundry,
                isGM: () => true
            },
            panelPort: {
                getLayout: () => ({ root: { centerDock: { stacks: [] } } }),
                getPrimaryActivePanel: () => null,
                getActiveCenterMapPanel: () => null,
                getPanelDefinition: () => null,
                isMapPanel: () => false,
                getPanelSceneId: () => "",
                makeSceneMapPanelDef: () => null,
                openSceneMapPanel: () => ({}),
                bindScene: () => {},
                saveUserLayout: async () => {},
                removeDeletedSceneMapPanel: async () => {},
                openScenePropertiesPanel: async () => {},
                createSceneDesignScene: async () => ({ ok: true })
            },
            canvasRef: () => canvasRef,
            render: () => {},
            activityLogger: { info: () => {}, error: () => {} },
            logger: { error: () => {} }
        });

        feature.bind(root);
        await listeners.click({ preventDefault() {}, stopPropagation() {} });

        assert.deepEqual(sceneFlagUpdate, {
            "flags.turn-of-the-century.sceneTokenVisionByType": {
                hero: { enabled: true, range: 0.5 },
                pawn: { enabled: false, range: 1.5 },
                villain: { enabled: true, range: 0.25 }
            }
        });
        assert.deepEqual(tokenUpdates, [
            { _id: "token-1", "sight.enabled": true, "sight.range": 0.5 },
            { _id: "token-3", "sight.enabled": true, "sight.range": 0.25 }
        ]);
        assert.equal(patchedState.error, "");
        assert.match(String(patchedState.status ?? ""), /Applied token vision to 2 selected tokens/);
        assert.deepEqual(perceptionUpdates, [{ initializeVision: true, refreshVision: true }]);
    });
});
