import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    applySceneBackgroundUpdate,
    buildSceneLevelBackgroundCreationData,
    buildSceneLevelBackgroundUpdateData,
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

    it("reads scene name and legacy background via scene.img", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                img: "assets/images/scenes/whitechapel.webp"
            }
        });
        assert.equal(model.sceneId, "scene-a");
        assert.equal(model.sceneName, "Whitechapel");
        assert.equal(model.backgroundPath, "assets/images/scenes/whitechapel.webp");
        assert.equal(model.uploadEnabled, true);
        assert.equal(model.deleteEnabled, true);
    });

    it("reads scene background from a Foundry v14 level", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                levels: [
                    { id: "level-a", background: { src: "assets/images/scenes/whitechapel.webp" } }
                ]
            }
        });

        assert.equal(model.backgroundPath, "assets/images/scenes/whitechapel.webp");
    });

    it("reads background from _source.background.src as fallback", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-b",
                name: "Whitechapel",
                _source: { background: { src: "assets/images/scenes/whitechapel.webp" } }
            }
        });
        assert.equal(model.backgroundPath, "assets/images/scenes/whitechapel.webp");
    });

    it("disables upload when no scene is provided", () => {
        const model = buildScenePropertiesPanelModel({});
        assert.equal(model.sceneId, "");
        assert.equal(model.uploadEnabled, false);
        assert.equal(model.deleteEnabled, false);
    });

    it("disables upload when scene has no name", () => {
        const model = buildScenePropertiesPanelModel({
            scene: { id: "scene-draft", name: "" }
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

    it("builds legacy direct-scene background update data", () => {
        assert.deepEqual(buildSceneBackgroundUpdateData("assets/images/scenes/whitechapel.webp"), {
            img: "assets/images/scenes/whitechapel.webp",
            "background.src": "assets/images/scenes/whitechapel.webp",
            "texture.src": "assets/images/scenes/whitechapel.webp"
        });
    });

    it("builds Foundry v14 level background update data", () => {
        assert.deepEqual(buildSceneLevelBackgroundUpdateData("assets/images/scenes/whitechapel.webp"), {
            "background.src": "assets/images/scenes/whitechapel.webp"
        });
    });

    it("builds Foundry v14 level creation data", () => {
        assert.deepEqual(buildSceneLevelBackgroundCreationData("assets/images/scenes/whitechapel.webp"), {
            name: "Ground Level",
            elevation: { bottom: 0, top: 999 },
            background: { src: "assets/images/scenes/whitechapel.webp" }
        });
    });

    it("returns empty object when background path is empty", () => {
        assert.deepEqual(buildSceneBackgroundUpdateData(""), {});
        assert.deepEqual(buildSceneBackgroundUpdateData(), {});
    });

    it("updates an existing Foundry v14 level background", async () => {
        let received = null;
        const level = {
            id: "level-a",
            index: 0,
            background: { src: "" },
            update: async (data) => {
                received = data;
                level.background.src = data["background.src"];
                return level;
            }
        };

        const result = await applySceneBackgroundUpdate({
            id: "scene-a",
            levels: [level]
        }, "assets/images/scenes/whitechapel.webp");

        assert.equal(result.ok, true);
        assert.equal(result.mode, "level");
        assert.deepEqual(received, { "background.src": "assets/images/scenes/whitechapel.webp" });
        assert.equal(result.document, level);
    });

    it("creates a Foundry v14 level when a level-capable scene has no levels", async () => {
        let received = null;
        const createdLevel = { id: "level-created" };
        const scene = {
            id: "scene-a",
            levels: [],
            createEmbeddedDocuments: async (type, documents) => {
                received = { type, documents };
                return [createdLevel];
            }
        };

        const result = await applySceneBackgroundUpdate(scene, "assets/images/scenes/whitechapel.webp");

        assert.equal(result.ok, true);
        assert.equal(result.mode, "level-created");
        assert.equal(result.document, createdLevel);
        assert.equal(received.type, "Level");
        assert.deepEqual(received.documents, [{
            name: "Ground Level",
            elevation: { bottom: 0, top: 999 },
            background: { src: "assets/images/scenes/whitechapel.webp" }
        }]);
    });

    it("falls back to a legacy scene background update when levels are unavailable", async () => {
        let received = null;
        const scene = {
            id: "scene-a",
            update: async (data) => {
                received = data;
                return scene;
            }
        };

        const result = await applySceneBackgroundUpdate(scene, "assets/images/scenes/whitechapel.webp");

        assert.equal(result.ok, true);
        assert.equal(result.mode, "scene");
        assert.deepEqual(received, {
            img: "assets/images/scenes/whitechapel.webp",
            "background.src": "assets/images/scenes/whitechapel.webp",
            "texture.src": "assets/images/scenes/whitechapel.webp"
        });
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
        assert.match(html, /No scene open/);
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

    it("does not render actor placement controls", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: { id: "scene-a", name: "Whitechapel" }
        }));

        assert.doesNotMatch(html, /data-action="scene-actors-add-heroes"/);
        assert.doesNotMatch(html, /Heroes/);
        assert.doesNotMatch(html, /Pawns/);
        assert.doesNotMatch(html, /Villains/);
    });

    it("builds scene token entries with token centers", () => {
        const model = buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                grid: { size: 100 },
                tokens: {
                    contents: [
                        { id: "t1", name: "Ada", x: 200, y: 300, width: 1, height: 1 },
                        { id: "t2", document: { name: "Porter", x: 400, y: 500, width: 2, height: 1 } }
                    ]
                }
            }
        });

        assert.equal(model.sceneTokens.length, 2);
        assert.deepEqual(model.sceneTokens.map((entry) => ({ name: entry.name, centerX: entry.centerX, centerY: entry.centerY })), [
            { name: "Ada", centerX: 250, centerY: 350 },
            { name: "Porter", centerX: 500, centerY: 550 }
        ]);
    });

    it("renders scene token list entries with centering data attributes", () => {
        const html = renderScenePropertiesPanel(buildScenePropertiesPanelModel({
            scene: {
                id: "scene-a",
                name: "Whitechapel",
                grid: { size: 100 },
                tokens: {
                    contents: [
                        { id: "t1", name: "Ada", x: 200, y: 300, width: 1, height: 1 }
                    ]
                }
            }
        }));

        assert.match(html, /Scene Tokens/);
        assert.match(html, /data-action="scene-token-center"/);
        assert.match(html, /data-scene-id="scene-a"/);
        assert.match(html, /data-token-center-x="250"/);
        assert.match(html, /data-token-center-y="350"/);
        assert.match(html, /data-action="scene-token-delete"/);
        assert.match(html, /data-token-id="t1"/);
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
