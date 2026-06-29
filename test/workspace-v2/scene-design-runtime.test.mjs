import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    createDefaultSceneDesignRuntimeSources,
    createSceneDesignRuntime
} from "../../module/ui/workspace-v2/scene-design-runtime.mjs";

describe("scene design runtime", () => {
    it("builds scene design ports from injected runtime sources", () => {
        const scene = { id: "scene-1", name: "Rookery Yard" };
        const actor = { id: "actor-1", name: "Ada" };
        const notificationApi = { info: () => {} };
        const game = {
            actors: {
                contents: [actor],
                get: (id) => id === actor.id ? actor : null
            },
            scenes: {
                active: scene,
                viewed: null,
                get: (id) => id === scene.id ? scene : null
            },
            user: { isGM: true },
            combats: { active: null },
            combat: null
        };
        const canvas = { scene, dimensions: { sceneWidth: 1000, sceneHeight: 800 } };
        const foundry = { documents: { Scene: class Scene {} } };
        const ui = { notifications: notificationApi };
        const confirm = () => true;
        const controller = {
            getViewedSceneDocument: () => scene,
            getSceneDocumentById: (id) => id === scene.id ? scene : null,
            getScenePropertiesScene: () => scene,
            propertiesState: { status: "Ready", error: "" },
            getDesignActionScene: (_panel, fallback) => fallback,
            isMapPanel: (panel) => panel?.baseId === "map",
            getPanelSceneId: (panel) => panel?.sceneId ?? "",
            layoutEngine: { getLayout: () => ({ root: {} }) },
            panelRegistry: { get: () => null },
            stateStore: null
        };

        const runtime = createSceneDesignRuntime({
            sceneWorkspaceController: controller,
            layoutEngine: controller.layoutEngine,
            panelRegistry: controller.panelRegistry,
            runtimeSources: {
                getGame: () => game,
                getCanvas: () => canvas,
                getUi: () => ui,
                getFoundry: () => foundry,
                getConfirm: () => confirm
            }
        });

        assert.equal(runtime.scenePort.getCurrentScene(), scene);
        assert.deepEqual(runtime.scenePort.getActors(), [actor]);
        assert.equal(runtime.scenePort.getActorById("actor-1"), actor);
        assert.equal(runtime.scenePort.isGM(), true);
        assert.equal(runtime.panelPort.getPanelSceneId({ baseId: "map", sceneId: "scene-1" }), "scene-1");
        assert.equal(runtime.notifications, notificationApi);
        assert.equal(runtime.confirmRef(), confirm);
        assert.equal(runtime.uiRef(), ui);
        assert.equal(runtime.foundryRef(), foundry);
        assert.equal(runtime.canvasRef(), canvas);
    });

    it("creates default source ports from a supplied global-like object", () => {
        const fakeGlobal = {
            game: { id: "game" },
            canvas: { id: "canvas" },
            ui: { id: "ui" },
            foundry: { id: "foundry" },
            confirm: () => false
        };

        const sources = createDefaultSceneDesignRuntimeSources({ global: fakeGlobal });

        assert.equal(sources.getGame(), fakeGlobal.game);
        assert.equal(sources.getCanvas(), fakeGlobal.canvas);
        assert.equal(sources.getUi(), fakeGlobal.ui);
        assert.equal(sources.getFoundry(), fakeGlobal.foundry);
        assert.equal(sources.getConfirm(), fakeGlobal.confirm);
    });
});
