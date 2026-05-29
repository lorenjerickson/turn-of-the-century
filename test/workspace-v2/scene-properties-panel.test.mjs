import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildSceneBackgroundUploadTarget,
    buildScenePropertiesPanelModel,
    buildScenePropertiesNameInputState,
    buildScenePropertiesUpdateData,
    resolveScenePropertiesScene,
    renderScenePropertiesPanel,
    slugifySceneName
} from "../../module/ui/workspace-v2/panels/scene-properties-panel.mjs";

describe("Scene properties panel", () => {
    it("slugifies scene names for world asset filenames", () => {
        assert.equal(slugifySceneName("Whitechapel Alley: Night!"), "whitechapel-alley-night");
        assert.equal(slugifySceneName("  Gare d'Orleans  "), "gare-d-orleans");
    });

    it("builds scene background upload targets under assets/images/scenes", () => {
        assert.deepEqual(buildSceneBackgroundUploadTarget({
            sceneName: "Whitechapel Alley",
            filename: "My Map FINAL.webp"
        }), {
            valid: true,
            directory: "assets/images/scenes",
            filename: "whitechapel-alley.webp",
            path: "assets/images/scenes/whitechapel-alley.webp",
            slug: "whitechapel-alley",
            extension: "webp"
        });
    });

    it("requires a scene name and supported image extension before upload", () => {
        assert.equal(buildSceneBackgroundUploadTarget({ sceneName: "", filename: "map.webp" }).valid, false);
        assert.equal(buildSceneBackgroundUploadTarget({ sceneName: "Whitechapel", filename: "map.txt" }).valid, false);
    });

    it("shows viewed scene properties and enables save for an existing scene", () => {
        const beforeUpload = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                background: { src: "assets/images/scenes/whitechapel.webp" }
            }
        });
        assert.equal(beforeUpload.uploadEnabled, true);
        assert.equal(beforeUpload.saveEnabled, true);
        assert.equal(beforeUpload.sceneName, "Whitechapel");
        assert.equal(beforeUpload.currentBackgroundPath, "assets/images/scenes/whitechapel.webp");

        const afterUpload = buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel", background: { src: "assets/images/scenes/old.webp" } },
            sceneId: "scene-a",
            sceneName: "Whitechapel",
            backgroundPath: "assets/images/scenes/whitechapel.webp"
        });
        assert.equal(afterUpload.saveEnabled, true);
        assert.equal(afterUpload.backgroundChanged, true);
    });

    it("shows create mode for a newly-created draft scene bound to the panel", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-draft", name: "New Scene", background: { src: "" } },
            sceneId: "scene-draft",
            sceneName: "",
            createMode: true,
            status: "New scene created."
        });

        assert.equal(model.createMode, true);
        assert.equal(model.sceneId, "scene-draft");
        assert.equal(model.sceneName, "");
        assert.equal(model.uploadEnabled, false);
        assert.equal(model.saveEnabled, false);

        const html = renderScenePropertiesPanel(model);
        assert.match(html, /Create mode/);
        assert.match(html, /New scene created\./);
    });

    it("enables saving and upload in create mode after a draft scene is named", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-draft", name: "New Scene", background: { src: "" } },
            sceneId: "scene-draft",
            sceneName: "Whitechapel Alley",
            selectedFilename: "map.webp",
            createMode: true
        });

        assert.equal(model.uploadEnabled, true);
        assert.equal(model.saveEnabled, true);
        assert.equal(model.target.path, "assets/images/scenes/whitechapel-alley.webp");
    });

    it("preserves an uploaded background path while debounced name edits settle", () => {
        const state = buildScenePropertiesNameInputState({
            sceneId: "scene-draft",
            sceneName: "Whitechapel",
            selectedFilename: "whitechapel.webp",
            backgroundPath: "assets/images/scenes/whitechapel.webp",
            createMode: true,
            status: "Uploaded whitechapel.webp.",
            error: ""
        }, { id: "scene-draft" }, "Whitechapel Alley");

        assert.equal(state.sceneName, "Whitechapel Alley");
        assert.equal(state.selectedFilename, "whitechapel.webp");
        assert.equal(state.backgroundPath, "assets/images/scenes/whitechapel.webp");
        assert.equal(state.createMode, true);
    });

    it("keeps create-mode name input usable before the debounce render fires", () => {
        const state = buildScenePropertiesNameInputState({
            sceneId: "scene-draft",
            sceneName: "",
            selectedFilename: "",
            backgroundPath: "",
            createMode: true,
            status: "New scene created.",
            error: ""
        }, { id: "scene-draft" }, "Whitechapel");

        const model = buildScenePropertiesPanelModel({
            ...state,
            scene: { id: "scene-draft", name: "New Scene", background: { src: "" } }
        });

        assert.equal(model.sceneName, "Whitechapel");
        assert.equal(model.uploadEnabled, true);
        assert.equal(model.saveEnabled, true);
    });

    it("saves a named draft scene with the uploaded background association", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-draft", name: "New Scene", background: { src: "" } },
            sceneId: "scene-draft",
            sceneName: "Whitechapel Alley",
            backgroundPath: "assets/images/scenes/whitechapel-alley.webp",
            createMode: true
        });

        assert.deepEqual(buildScenePropertiesUpdateData(model), {
            name: "Whitechapel Alley",
            "background.src": "assets/images/scenes/whitechapel-alley.webp",
            shiftX: 0,
            shiftY: 0,
            "grid.type": 0,
            "grid.size": 100
        });
    });

    it("ignores stale edits when the viewed scene changes", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-b", name: "Hotel Cellar" },
            sceneId: "scene-a",
            sceneName: "Station Yard",
            backgroundPath: "assets/images/scenes/station.webp",
            status: "Uploaded station.webp."
        });

        assert.equal(model.sceneName, "Hotel Cellar");
        assert.equal(model.backgroundPath, "");
        assert.equal(model.status, "");
    });

    it("resolves properties from the currently visible map panel scene", () => {
        const viewedScene = { id: "scene-a", name: "Viewed Scene" };
        const visibleScene = { id: "scene-b", name: "Visible Map Scene" };

        const resolved = resolveScenePropertiesScene({
            activePanel: { id: "map:scene-b", title: "Visible Map Scene", baseId: "map", sceneId: "scene-b" },
            viewedScene,
            sceneResolver: (sceneId) => sceneId === "scene-b" ? visibleScene : null
        });

        assert.equal(resolved, visibleScene);
    });

    it("falls back to the viewed scene when a non-map panel is active", () => {
        const viewedScene = { id: "scene-a", name: "Viewed Scene" };
        const defaultScene = { id: "scene-b", name: "Canvas Scene" };

        assert.equal(resolveScenePropertiesScene({
            activePanel: { id: "compendium", title: "Compendium" },
            viewedScene,
            defaultScene
        }), viewedScene);
    });

    it("builds scene update data and clears grid metadata when background changes", () => {
        assert.deepEqual(buildScenePropertiesUpdateData({
            sceneName: "Hotel Cellar",
            backgroundPath: "assets/images/scenes/hotel.webp",
            currentBackgroundPath: "assets/images/scenes/old.webp"
        }), {
            name: "Hotel Cellar",
            "background.src": "assets/images/scenes/hotel.webp",
            shiftX: 0,
            shiftY: 0,
            "grid.type": 0,
            "grid.size": 100
        });

        assert.deepEqual(buildScenePropertiesUpdateData({
            sceneName: "Hotel Cellar",
            backgroundPath: "assets/images/scenes/old.webp",
            currentBackgroundPath: "assets/images/scenes/old.webp"
        }), {
            name: "Hotel Cellar"
        });
    });

    it("renders disabled upload and save controls until prerequisites are met", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({}));
        assert.match(html, /data-action="scene-properties-background-upload"[^>]*disabled/);
        assert.match(html, /data-action="scene-properties-save"[^>]*disabled/);
        assert.match(html, /data-action="scene-properties-activate"[^>]*disabled/);
        assert.match(html, /data-action="scene-properties-delete"[^>]*disabled/);
        assert.doesNotMatch(html, /Create Scene/);
    });

    it("renders scene actions enabled for an existing viewed scene", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel" }
        }));

        assert.match(html, /data-action="scene-properties-activate"/);
        assert.doesNotMatch(html, /data-action="scene-properties-activate"[^>]*disabled/);
        assert.match(html, /data-action="scene-properties-delete"/);
        assert.doesNotMatch(html, /data-action="scene-properties-delete"[^>]*disabled/);
    });

    it("escapes rendered scene values", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            sceneName: "A <Scene>",
            backgroundPath: "assets/images/scenes/a-scene.webp"
        }));
        assert.match(html, /A &lt;Scene&gt;/);
    });
});
