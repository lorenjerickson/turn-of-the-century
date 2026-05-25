import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    activateSceneWallDesignMode,
    buildSceneCreationData,
    createSceneDesignScene,
    createSceneFromBackgroundPath,
    isSceneBackgroundImagePath,
    SCENE_BACKGROUND_IMAGE_ASSET_PATH
} from "../../module/ui/workspace-v2/design-actions/scene-actions.mjs";

describe("scene design actions", () => {
    it("recognizes organized scene background image paths", () => {
        assert.equal(isSceneBackgroundImagePath("assets/images/scenes/whitechapel-alley.webp"), true);
        assert.equal(isSceneBackgroundImagePath("worlds/totc/assets/images/scenes/whitechapel-alley.png", { worldId: "totc" }), true);
        assert.equal(isSceneBackgroundImagePath("assets/images/tokens/constable.webp"), false);
        assert.equal(isSceneBackgroundImagePath("assets/images/scenes/animated-map.webm"), false);
    });

    it("builds Foundry scene data from an organized battle-map image", () => {
        const data = buildSceneCreationData({
            backgroundPath: "assets/images/scenes/whitechapel-alley-night.webp"
        });

        assert.equal(data.name, "Whitechapel Alley Night");
        assert.equal(data.navigation, true);
        assert.deepEqual(data.background, { src: "assets/images/scenes/whitechapel-alley-night.webp" });
        assert.equal(data.img, "assets/images/scenes/whitechapel-alley-night.webp");
        assert.equal(data.flags["turn-of-the-century"].designCreated, true);
        assert.equal(data.flags["turn-of-the-century"].assetContext, "images/scenes");
    });

    it("creates a Foundry scene from an organized background path", async () => {
        let createdData = null;
        const result = await createSceneFromBackgroundPath({
            backgroundPath: "assets/images/scenes/baker-street.webp",
            SceneClass: {
                create: async (data) => {
                    createdData = data;
                    return { name: data.name };
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.name, "Baker Street");
        assert.equal(createdData.background.src, "assets/images/scenes/baker-street.webp");
    });

    it("refuses to create scenes from unorganized media paths", async () => {
        let created = false;
        const result = await createSceneFromBackgroundPath({
            backgroundPath: "uploads/baker-street.webp",
            SceneClass: {
                create: async () => {
                    created = true;
                    return {};
                }
            }
        });

        assert.equal(created, false);
        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(result.message, new RegExp(SCENE_BACKGROUND_IMAGE_ASSET_PATH));
    });

    it("opens the Foundry file picker at the organized scene image folder", async () => {
        let pickerOptions = null;
        let rendered = false;
        const result = await createSceneDesignScene({
            FilePickerClass: class {
                constructor(options) {
                    pickerOptions = options;
                }

                render(force) {
                    rendered = force;
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.silent, true);
        assert.equal(rendered, true);
        assert.equal(pickerOptions.type, "image");
        assert.equal(pickerOptions.current, SCENE_BACKGROUND_IMAGE_ASSET_PATH);
        assert.equal(typeof pickerOptions.callback, "function");
    });

    it("activates Foundry scene controls for wall editing when available", async () => {
        let initializedWith = null;
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: { ready: true },
            ui: {
                controls: {
                    initialize: async (payload) => {
                        initializedWith = payload;
                    }
                }
            }
        });

        assert.deepEqual(initializedWith, { control: "walls", tool: "walls" });
        assert.deepEqual(result, {
            ok: true,
            message: "Wall design tools activated."
        });
    });

    it("falls back to activating the wall layer when controls are unavailable", async () => {
        let activated = false;
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: {
                ready: true,
                walls: {
                    activate: async () => {
                        activated = true;
                    }
                }
            },
            ui: {}
        });

        assert.equal(activated, true);
        assert.deepEqual(result, {
            ok: true,
            message: "Wall layer activated."
        });
    });

    it("warns when no scene is active", async () => {
        const result = await activateSceneWallDesignMode({
            scene: null,
            canvas: { ready: true },
            ui: {}
        });

        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(result.message, /Open a scene/);
    });

    it("warns while the canvas is still loading", async () => {
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: { ready: false },
            ui: {}
        });

        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(result.message, /canvas/);
    });
});
