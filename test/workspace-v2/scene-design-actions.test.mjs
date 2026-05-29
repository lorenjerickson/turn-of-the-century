import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    activateSceneWallDesignMode,
    buildBlankSceneCreationData,
    buildSceneCreationData,
    createSceneDesignScene,
    createSceneFromBackgroundPath,
    isSceneBackgroundImagePath,
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SceneDesignService,
    uploadSceneBackgroundFile
} from "../../module/ui/workspace-v2/design-actions/scene-actions.mjs";

const originalFilePickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");

afterEach(() => {
    if (originalFilePickerDescriptor) {
        Object.defineProperty(globalThis, "FilePicker", originalFilePickerDescriptor);
    } else {
        delete globalThis.FilePicker;
    }
});

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
        assert.equal(Object.hasOwn(data, "img"), false);
        assert.equal(data.flags["turn-of-the-century"].designCreated, true);
        assert.equal(data.flags["turn-of-the-century"].assetContext, "images/scenes");
    });

    it("builds blank draft scene data for workspace create mode", () => {
        const data = buildBlankSceneCreationData();

        assert.equal(data.name, "New Scene");
        assert.equal(data.navigation, true);
        assert.deepEqual(data.background, { src: "" });
        assert.equal(data.flags["turn-of-the-century"].designCreated, true);
        assert.equal(data.flags["turn-of-the-century"].designDraft, true);
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

    it("encapsulates scene creation behind SceneDesignService", async () => {
        let createdData = null;
        const service = new SceneDesignService({
            SceneClass: {
                create: async (data) => {
                    createdData = data;
                    return { name: data.name };
                }
            }
        });

        const result = await service.createFromBackgroundPath({
            backgroundPath: "assets/images/scenes/railway-yard.webp"
        });

        assert.equal(result.ok, true);
        assert.equal(result.name, "Railway Yard");
        assert.equal(createdData.background.src, "assets/images/scenes/railway-yard.webp");
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

    it("delegates workspace scene creation to the app when available", async () => {
        let created = false;
        const result = await createSceneDesignScene({
            app: {
                _createSceneDesignScene: async () => {
                    created = true;
                    return { ok: true, silent: true };
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.silent, true);
        assert.equal(created, true);
    });

    it("creates a blank scene when no workspace app is available", async () => {
        let createdData = null;
        const result = await createSceneDesignScene({
            SceneClass: {
                create: async (data) => {
                    createdData = data;
                    return { id: "scene-a", name: data.name };
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.name, "New Scene");
        assert.equal(createdData.background.src, "");
        assert.equal(createdData.flags["turn-of-the-century"].designDraft, true);
    });

    it("uploads scene backgrounds through the Foundry V14 namespaced FilePicker implementation", async () => {
        Object.defineProperty(globalThis, "FilePicker", {
            configurable: true,
            get() {
                throw new Error("Deprecated global FilePicker was accessed.");
            }
        });

        let uploaded = null;
        const createdDirectories = [];
        class TestFile {
            constructor(parts, name, options) {
                this.parts = parts;
                this.name = name;
                this.type = options.type;
                this.lastModified = options.lastModified;
            }
        }

        const result = await uploadSceneBackgroundFile({
            file: { name: "Original Map.webp", type: "image/webp", lastModified: 1 },
            target: {
                valid: true,
                directory: SCENE_BACKGROUND_IMAGE_ASSET_PATH,
                filename: "whitechapel-alley.webp",
                path: `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/whitechapel-alley.webp`
            },
            FileClass: TestFile,
            foundry: {
                applications: {
                    apps: {
                        FilePicker: {
                            implementation: {
                                createDirectory: async (source, directory) => {
                                    createdDirectories.push({ source, directory });
                                },
                                upload: async (source, directory, file, options) => {
                                    uploaded = { source, directory, file, options };
                                    return { path: `${directory}/${file.name}` };
                                }
                            }
                        }
                    }
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.path, `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/whitechapel-alley.webp`);
        assert.equal(uploaded.source, "data");
        assert.equal(uploaded.directory, SCENE_BACKGROUND_IMAGE_ASSET_PATH);
        assert.equal(uploaded.file.name, "whitechapel-alley.webp");
        assert.equal(uploaded.options.overwrite, false);
        assert.deepEqual(createdDirectories, [
            { source: "data", directory: "assets" },
            { source: "data", directory: "assets/images" },
            { source: "data", directory: "assets/images/scenes" }
        ]);
    });

    it("can overwrite scene backgrounds for incremental scene edits", async () => {
        let uploadOptions = null;
        const result = await uploadSceneBackgroundFile({
            file: { name: "Replacement.webp", type: "image/webp", lastModified: 1 },
            overwrite: true,
            target: {
                valid: true,
                directory: SCENE_BACKGROUND_IMAGE_ASSET_PATH,
                filename: "whitechapel-alley.webp",
                path: `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/whitechapel-alley.webp`
            },
            foundry: {
                applications: {
                    apps: {
                        FilePicker: {
                            implementation: {
                                createDirectory: async () => {},
                                upload: async (source, directory, file, options) => {
                                    uploadOptions = options;
                                    return { path: `${directory}/${file.name}` };
                                }
                            }
                        }
                    }
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(uploadOptions.overwrite, true);
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
