import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SceneWorkspaceController } from "../../module/ui/workspace-v2/controllers/scene-workspace-controller.mjs";

function layoutEngineStub() {
    const layout = {
        root: {
            centerDock: { stacks: [{ id: "center-stack", panels: [] }] },
            leftDock: { stacks: [] },
            rightDock: { stacks: [] },
            topDock: { stacks: [] },
            bottomDock: { stacks: [] },
            floatingWindows: []
        }
    };
    return {
        layout,
        getLayout: () => layout,
        setActivePanel(dockId, stackId, panelId) {
            return { action: "active", dockId, stackId, panelId };
        },
        applyDropIntent(panelDef, intent) {
            layout.root.centerDock.stacks[0].panels.push(panelDef);
            return { action: "drop", panelDef, intent };
        },
        restorePanel(panelDef, options) {
            return { action: "restore", panelDef, options };
        }
    };
}

describe("SceneWorkspaceController", () => {
    it("opens scene-specific map panels in the center dock and binds scene properties", async () => {
        const layoutEngine = layoutEngineStub();
        let savedLayout = null;
        const scene = { id: "scene-1", name: "Rookery Yard", img: "yard.webp" };
        const controller = new SceneWorkspaceController({
            layoutEngine,
            panelRegistry: { get: () => null },
            stateStore: {
                async setUserLayout(layout) {
                    savedLayout = layout;
                }
            },
            sceneResolver: () => scene,
            getCurrentScene: () => scene,
            activityLogger: { info: () => {} }
        });

        const nextLayout = controller.openSceneMapPanel("scene-1");
        controller.bindScene("scene-1");
        await controller.stateStore.setUserLayout(nextLayout);

        assert.equal(nextLayout.action, "drop");
        assert.equal(nextLayout.panelDef.id, "map:scene-1");
        assert.equal(nextLayout.intent.dockId, "centerDock");
        assert.equal(controller.propertiesState.sceneId, "scene-1");
        assert.equal(savedLayout, nextLayout);
    });

    it("resolves scene properties from bound state before active map fallback", () => {
        const boundScene = { id: "bound", name: "Bound Scene" };
        const activeScene = { id: "active", name: "Active Scene" };
        const controller = new SceneWorkspaceController({
            layoutEngine: layoutEngineStub(),
            panelRegistry: { get: () => null },
            sceneResolver: (id) => id === "bound" ? boundScene : activeScene,
            getCurrentScene: () => activeScene,
            getActivePanel: () => ({ id: "map:active", baseId: "map", sceneId: "active" })
        });

        controller.bindScene("bound");

        assert.equal(controller.getScenePropertiesScene(), boundScene);
    });

    it("activates scenes through activate or update and reports failures", async () => {
        const notifications = [];
        const errors = [];
        const controller = new SceneWorkspaceController({
            layoutEngine: layoutEngineStub(),
            panelRegistry: { get: () => null },
            uiRef: () => ({
                notifications: {
                    info: (message) => notifications.push(["info", message]),
                    error: (message) => notifications.push(["error", message]),
                    warn: (message) => notifications.push(["warn", message])
                }
            }),
            logger: { error: (...args) => errors.push(args) }
        });
        let activated = false;

        assert.equal(await controller.activateScene({
            name: "Good Scene",
            async activate() {
                activated = true;
            }
        }), true);
        assert.equal(activated, true);
        assert.deepEqual(notifications.at(-1), ["info", "Activated Good Scene."]);

        assert.equal(await controller.activateScene({ name: "Broken" }), false);
        assert.deepEqual(notifications.at(-1), ["error", "Scene activation failed - see console for details."]);
        assert.equal(errors.length, 1);
    });

    it("keeps scene token collections in map view models", () => {
        const sceneTokens = { contents: [{ id: "token-a", name: "Ada" }] };
        const scene = { id: "scene-1", name: "Rookery Yard", tokens: sceneTokens };
        const controller = new SceneWorkspaceController({
            layoutEngine: layoutEngineStub(),
            panelRegistry: { get: () => null },
            sceneResolver: () => scene,
            getCurrentScene: () => scene
        });

        const viewModel = controller.getMapPanelScene({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });
        assert.equal(viewModel.tokens, sceneTokens);
    });

    it("centers map on token when scene token entry is double-clicked", async () => {
        const listeners = {};
        const tokenEntry = {
            dataset: {
                sceneId: "scene-1",
                tokenCenterX: "250",
                tokenCenterY: "350"
            },
            addEventListener(type, handler) {
                listeners[type] = handler;
            }
        };
        const root = {
            querySelectorAll(selector) {
                if (selector === "[data-action='scene-token-center']") return [tokenEntry];
                return [];
            }
        };
        const centered = [];
        const controller = new SceneWorkspaceController({
            layoutEngine: layoutEngineStub(),
            panelRegistry: { get: () => null },
            centerSceneMapOnToken: async (payload) => {
                centered.push(payload);
                return true;
            }
        });

        controller.wireScenePropertiesHandlers(root);
        await listeners.dblclick({
            preventDefault() {},
            stopPropagation() {}
        });

        assert.deepEqual(centered, [{ sceneId: "scene-1", x: 250, y: 350 }]);
    });
});
