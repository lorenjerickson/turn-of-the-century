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

});
