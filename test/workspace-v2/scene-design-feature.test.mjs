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

        feature.bind({ ownerDocument });
        feature.bind({ ownerDocument });
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
            }
        };

        let designActionExecuted = null;
        const feature = new SceneDesignFeature({
            sceneWorkspaceController: mockController,
            executeDesignAction: (actionId) => {
                designActionExecuted = actionId;
                return { ok: true };
            },
            gridCalibrationController: { active: false }
        });

        globalThis.game = { user: { isGM: true } };

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
});
