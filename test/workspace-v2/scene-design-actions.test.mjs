import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    activateSceneWallDesignMode,
    buildBlankSceneCreationData,
    buildSceneCreationData,
    createSceneDesignScene,
    createSceneFromBackgroundPath,
    detectSceneWalls,
    isSceneBackgroundImagePath,
    openSceneGridConfiguration,
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SceneDesignService,
    uploadSceneBackgroundFile
} from "../../module/ui/workspace-v2/design-actions/scene-actions.mjs";

const originalFilePickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "FilePicker");

function makeImageData(width, height, fill = 255) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < data.length; index += 4) {
        data[index] = fill;
        data[index + 1] = fill;
        data[index + 2] = fill;
        data[index + 3] = 255;
    }
    return { width, height, data };
}

function setPixel(imageData, x, y, value) {
    if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return;
    const index = ((y * imageData.width) + x) * 4;
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
}

function drawVerticalLine(imageData, x, y1, y2, value = 0, thickness = 3) {
    const radius = Math.floor(thickness / 2);
    for (let y = y1; y <= y2; y += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) setPixel(imageData, x + dx, y, value);
    }
}

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
        assert.equal(data.img, "assets/images/scenes/whitechapel-alley-night.webp");
        assert.equal(Object.hasOwn(data, "background"), false);
        assert.equal(data.flags["turn-of-the-century"].designCreated, true);
        assert.equal(data.flags["turn-of-the-century"].assetContext, "images/scenes");
    });

    it("builds blank draft scene data for workspace create mode", () => {
        const data = buildBlankSceneCreationData();

        assert.equal(data.name, "New Scene");
        assert.equal(data.navigation, true);
        assert.equal(Object.hasOwn(data, "background"), false);
        assert.equal(Object.hasOwn(data, "img"), false);
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
        assert.equal(createdData.img, "assets/images/scenes/baker-street.webp");
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
        assert.equal(createdData.img, "assets/images/scenes/railway-yard.webp");
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
        assert.equal(Object.hasOwn(createdData, "background"), false);
        assert.equal(createdData.flags["turn-of-the-century"].designDraft, true);
    });

    it("opens native scene configuration for grid editing", async () => {
        let rendered = false;
        const result = await openSceneGridConfiguration({
            scene: {
                sheet: {
                    render: (options) => {
                        rendered = options;
                    }
                }
            }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(rendered, { force: true });
        assert.match(result.message, /Scene configuration opened/);
    });

    it("delegates grid editing to the workspace native scene configuration bridge", async () => {
        let delegatedScene = null;
        const scene = { id: "scene-1" };
        const result = await openSceneGridConfiguration({
            scene,
            app: {
                _openSceneGridConfiguration: async ({ scene: passedScene }) => {
                    delegatedScene = passedScene;
                }
            }
        });

        assert.equal(result.ok, true);
        assert.equal(result.silent, true);
        assert.equal(delegatedScene, scene);
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

    it("detects regular-grid walls and creates Wall documents", async () => {
        const imageData = makeImageData(201, 201);
        drawVerticalLine(imageData, 100, 0, 200, 0, 3);
        let created = null;
        const scene = {
            id: "scene-1",
            name: "Rookery Yard",
            img: "assets/images/scenes/rookery.webp",
            width: 200,
            height: 200,
            grid: { type: 1, size: 100 },
            walls: [],
            createEmbeddedDocuments: async (type, documents) => {
                created = { type, documents };
                return documents;
            }
        };

        const result = await detectSceneWalls({
            scene,
            canvas: { ready: true },
            imageData
        });

        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 1);
        assert.deepEqual(result.detectedWallOverlay, {
            segments: [{ x1: 100, y1: 0, x2: 100, y2: 200 }],
            intersections: []
        });
        assert.equal(created.type, "Wall");
        assert.deepEqual(created.documents[0].c, [100, 0, 100, 200]);
    });

    it("confirms before replacing existing walls during detection", async () => {
        const imageData = makeImageData(201, 201);
        drawVerticalLine(imageData, 100, 0, 200, 0, 3);
        const deleted = [];
        const scene = {
            id: "scene-1",
            name: "Rookery Yard",
            img: "assets/images/scenes/rookery.webp",
            width: 200,
            height: 200,
            grid: { type: 1, size: 100 },
            walls: [{ id: "old-wall" }],
            deleteEmbeddedDocuments: async (type, ids) => {
                deleted.push({ type, ids });
            },
            createEmbeddedDocuments: async (type, documents) => documents
        };

        const cancelled = await detectSceneWalls({
            scene,
            canvas: { ready: true },
            imageData,
            confirm: () => false
        });

        assert.equal(cancelled.ok, false);
        assert.equal(cancelled.reason, "replacement-cancelled");
        assert.deepEqual(deleted, []);

        const applied = await detectSceneWalls({
            scene,
            canvas: { ready: true },
            imageData,
            confirm: () => true
        });

        assert.equal(applied.ok, true);
        assert.deepEqual(deleted, [{ type: "Wall", ids: ["old-wall"] }]);
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
