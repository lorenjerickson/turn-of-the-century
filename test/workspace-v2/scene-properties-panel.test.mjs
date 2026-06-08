import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildSceneBackgroundUpdateData,
    buildSceneBackgroundUploadTarget,
    buildScenePropertiesPanelModel,
    resolveScenePropertiesMapPanelScene,
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

    it("reads scene name and background directly from the scene document", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                background: { src: "assets/images/scenes/whitechapel.webp" }
            }
        });
        assert.equal(model.sceneId, "scene-a");
        assert.equal(model.sceneName, "Whitechapel");
        assert.equal(model.backgroundPath, "assets/images/scenes/whitechapel.webp");
        assert.equal(model.uploadEnabled, true);
        assert.equal(model.deleteEnabled, true);
    });

    it("disables upload when no scene is provided", () => {
        const model = buildScenePropertiesPanelModel({});
        assert.equal(model.sceneId, "");
        assert.equal(model.uploadEnabled, false);
        assert.equal(model.deleteEnabled, false);
    });

    it("disables upload when scene has no name", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-draft", name: "", background: { src: "" } }
        });
        assert.equal(model.uploadEnabled, false);
    });

    it("reads isDefault from scene flags", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Station Yard",
                flags: { "turn-of-the-century": { defaultScene: true } }
            }
        });
        assert.equal(model.isDefault, true);
    });

    it("passes through status and error messages", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel" },
            status: "Uploading...",
            error: ""
        });
        assert.equal(model.status, "Uploading...");
        assert.equal(model.error, "");
    });

    it("builds background update data for scene.update()", () => {
        assert.deepEqual(buildSceneBackgroundUpdateData("assets/images/scenes/whitechapel.webp"), {
            background: { src: "assets/images/scenes/whitechapel.webp" },
            texture: { src: "assets/images/scenes/whitechapel.webp" }
        });
    });

    it("returns empty object when background path is empty", () => {
        assert.deepEqual(buildSceneBackgroundUpdateData(""), {});
        assert.deepEqual(buildSceneBackgroundUpdateData(), {});
    });

    it("resolves scene-bound map panels by explicit sceneId", () => {
        const currentScene = { id: "scene-draft", name: "Draft Scene" };
        const resolved = resolveScenePropertiesMapPanelScene({
            panel: { id: "map:scene-draft", baseId: "map", sceneId: "scene-draft" },
            currentScene,
            sceneResolver: (sceneId) => sceneId === "scene-draft" ? currentScene : null
        });

        assert.equal(resolved.sceneId, "scene-draft");
        assert.equal(resolved.scene, currentScene);
    });

    it("resolves scene-specific map panels without falling back to the current scene", () => {
        const panelScene = { id: "scene-b", name: "Panel Scene" };
        const currentScene = { id: "scene-a", name: "Current Scene" };

        const resolved = resolveScenePropertiesMapPanelScene({
            panel: { id: "map:scene-b", baseId: "map", sceneId: "scene-b" },
            currentScene,
            sceneResolver: (sceneId) => sceneId === "scene-b" ? panelScene : null
        });

        assert.equal(resolved.sceneId, "scene-b");
        assert.equal(resolved.scene, panelScene);
    });

    it("falls back to currentScene when panel has no explicit sceneId", () => {
        const currentScene = { id: "scene-a", name: "Current Scene" };

        const resolved = resolveScenePropertiesMapPanelScene({
            panel: { id: "scene-properties" },
            currentScene,
            sceneResolver: () => null
        });

        assert.equal(resolved.scene, currentScene);
    });

    it("renders placeholder when no scene is open", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({}));
        assert.match(html, /Open a scene map panel/);
    });

    it("renders name input and upload controls when a scene is bound", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel" }
        }));

        assert.match(html, /data-action="scene-properties-name"/);
        assert.match(html, /data-action="scene-properties-background-upload"/);
        assert.match(html, /data-action="scene-properties-delete"/);
        assert.match(html, /data-action="scene-properties-set-default"/);
    });

    it("does not render Save or Reset buttons", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel" }
        }));

        assert.doesNotMatch(html, /data-action="scene-properties-save"/);
        assert.doesNotMatch(html, /data-action="scene-properties-reset"/);
    });

    it("renders actor placement controls when actorPlacement model is provided", () => {
        const actorPlacement = {
            heroes: [{ id: "h1", name: "Ada", img: "ada.webp" }],
            pawns: [{ id: "p1", name: "Constable", img: "" }],
            villains: [{ id: "v1", name: "Moriarty", img: "" }]
        };

        const html = renderScenePropertiesPanel(
            buildScenePropertiesPanelModel({ scene: { id: "scene-a", name: "Whitechapel" } }),
            { actorPlacement }
        );

        assert.match(html, /data-action="scene-actors-add-heroes"/);
        assert.match(html, /Heroes/);
        assert.match(html, /Pawns/);
        assert.match(html, /Villains/);
    });

    it("escapes rendered scene values", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: { id: "x", name: "A <Scene>" }
        }));
        assert.match(html, /A &lt;Scene&gt;/);
    });

    it("renders the default-scene checkbox as checked when isDefault is true", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Station Yard",
                flags: { "turn-of-the-century": { defaultScene: true } }
            }
        });
        const html = renderScenePropertiesPanel(model);
        assert.match(html, /data-action="scene-properties-set-default"[^>]*checked/);
    });
});
