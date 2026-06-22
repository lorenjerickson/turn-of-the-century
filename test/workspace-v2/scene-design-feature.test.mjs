import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SceneDesignFeature } from "../../module/ui/workspace-v2/controllers/scene-design-feature.mjs";

describe("SceneDesignFeature", () => {
    it("owns toolbar and wall-selection state per scene", () => {
        globalThis.canvas = { scene: { id: "other-scene" }, walls: null };
        const scene = { id: "scene-1" };
        const feature = new SceneDesignFeature({
            getPanelSceneId: () => scene.id,
            getSceneDocumentById: () => scene
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
        const feature = new SceneDesignFeature({ onKeyDown: () => {} });

        feature.bind({ ownerDocument });
        feature.bind({ ownerDocument });
        feature.dispose();

        assert.equal(calls.filter(([action]) => action === "add").length, 1);
        assert.equal(calls.filter(([action]) => action === "remove").length, 1);
        assert.equal(calls[0][2], calls[1][2]);
    });
});
