import {
    getFileConstructor as getV14FileConstructor,
    getWorldId as getV14WorldId,
    renderFoundryApplication,
    requireFilePicker,
    requireSceneDocumentClass
} from "../../../foundry-v14-runtime.mjs";
import { getSceneBackgroundSource } from "../scene-background-source.mjs";
import {
    applyDetectedWallsToScene,
    buildDetectedWallDocumentData,
    buildRegularSquareGridModel,
    detectRegularGridWallSegments,
    getSceneWallDocuments
} from "../scene-wall-detection.mjs";

const WALL_CONTROL = "walls";
const WALL_TOOL = "walls";
export const SCENE_BACKGROUND_IMAGE_ASSET_PATH = "assets/images/scenes";
export const SCENE_BACKGROUND_IMAGE_EXTENSIONS = Object.freeze(["webp", "png", "jpg", "jpeg"]);

function getScene(context = {}) {
    return context.scene ?? context.canvas?.scene ?? globalThis.canvas?.scene ?? null;
}

function getControls(context = {}) {
    return context.ui?.controls ?? globalThis.ui?.controls ?? null;
}

function getCanvas(context = {}) {
    return context.canvas ?? globalThis.canvas ?? null;
}

function getSceneClass(context = {}) {
    try {
        return context.SceneClass ?? requireSceneDocumentClass(context);
    } catch {
        return null;
    }
}

function getFilePickerClass(context = {}) {
    try {
        return context.FilePickerClass ?? requireFilePicker(context);
    } catch {
        return null;
    }
}

function getFileConstructor(context = {}) {
    return getV14FileConstructor(context);
}

function getNotifications(context = {}) {
    return context.notifications ?? context.ui?.notifications ?? globalThis.ui?.notifications ?? null;
}

function getConfirm(context = {}) {
    return context.confirm ?? globalThis.confirm ?? null;
}

function getWorldId(context = {}) {
    return getV14WorldId(context);
}

async function ensureFoundryDirectory(FilePickerClass, directory) {
    if (typeof FilePickerClass?.createDirectory !== "function") return;

    const segments = String(directory ?? "").split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        try {
            await FilePickerClass.createDirectory("data", current, {});
        } catch (error) {
            const message = String(error?.message ?? "");
            if (!/exist|EEXIST|already/i.test(message)) throw error;
        }
    }
}

function stripQueryAndHash(path = "") {
    return String(path ?? "").trim().split(/[?#]/)[0] ?? "";
}

function normalizeSlashPath(path = "") {
    return stripQueryAndHash(path).replaceAll("\\", "/").replace(/^\/+/, "");
}

function getPathExtension(path = "") {
    const normalized = normalizeSlashPath(path);
    const last = normalized.split("/").pop() ?? "";
    const dot = last.lastIndexOf(".");
    return dot >= 0 ? last.slice(dot + 1).toLowerCase() : "";
}

function titleCaseFromSlug(value = "") {
    const words = String(value ?? "")
        .replace(/\.[^.]*$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);

    return words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ") || "New Scene";
}

async function loadImageDataFromSource(source = "", context = {}) {
    if (context.imageData) return context.imageData;
    if (typeof context.imageDataLoader === "function") return context.imageDataLoader(source, context);

    const ImageClass = context.ImageClass ?? globalThis.Image;
    const documentRef = context.document ?? globalThis.document;
    if (typeof ImageClass !== "function" || typeof documentRef?.createElement !== "function") {
        throw new Error("Map image pixel access is not available in this session.");
    }

    const image = await new Promise((resolve, reject) => {
        const candidate = new ImageClass();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error("Map image could not be loaded for wall detection."));
        candidate.src = source;
    });

    const width = Number(image.naturalWidth ?? image.width ?? 0);
    const height = Number(image.naturalHeight ?? image.height ?? 0);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        throw new Error("Map image dimensions are unavailable for wall detection.");
    }

    const canvas = documentRef.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context2d = canvas.getContext?.("2d", { willReadFrequently: true });
    if (!context2d || typeof context2d.drawImage !== "function" || typeof context2d.getImageData !== "function") {
        throw new Error("Canvas pixel sampling is not available for wall detection.");
    }
    context2d.drawImage(image, 0, 0);
    return context2d.getImageData(0, 0, width, height);
}

export function isSceneBackgroundImagePath(path = "", { worldId = "" } = {}) {
    const normalized = normalizeSlashPath(path);
    const ext = getPathExtension(normalized);
    if (!SCENE_BACKGROUND_IMAGE_EXTENSIONS.includes(ext)) return false;

    const worldPrefix = worldId ? `worlds/${worldId}/${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/` : "";
    return normalized.startsWith(`${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/`)
        || Boolean(worldPrefix && normalized.startsWith(worldPrefix));
}

export function buildSceneCreationData({ backgroundPath = "", name = "", navigation = true } = {}) {
    const safeBackgroundPath = String(backgroundPath ?? "").trim();
    const filename = normalizeSlashPath(safeBackgroundPath).split("/").pop() ?? "";
    const sceneName = String(name ?? "").trim() || titleCaseFromSlug(filename);

    // Use `img` as the primary background field (Foundry v14 API).
    // scene.background / scene.texture are deprecated in v14.
    return {
        name: sceneName,
        navigation: Boolean(navigation),
        img: safeBackgroundPath,
        flags: {
            "turn-of-the-century": {
                designCreated: true,
                assetContext: "images/scenes"
            }
        }
    };
}

export function buildBlankSceneCreationData({ name = "", navigation = true } = {}) {
    const sceneName = String(name ?? "").trim() || "New Scene";

    return {
        name: sceneName,
        navigation: Boolean(navigation),
        flags: {
            "turn-of-the-century": {
                designCreated: true,
                designDraft: true
            }
        }
    };
}

export class SceneDesignService {
    constructor(context = {}) {
        this.context = context;
    }

    async createFromBackgroundPath({ backgroundPath = "", name = "", navigation = true } = {}) {
        const SceneClass = getSceneClass(this.context);
        const notifications = getNotifications(this.context);
        const worldId = getWorldId(this.context);

        if (!SceneClass || typeof SceneClass.create !== "function") {
            return {
                ok: false,
                level: "warn",
                message: "Scene creation is not available in this Foundry session."
            };
        }

        if (!isSceneBackgroundImagePath(backgroundPath, { worldId })) {
            return {
                ok: false,
                level: "warn",
                message: `Choose a supported battle-map image from ${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/.`
            };
        }

        const sceneData = buildSceneCreationData({ backgroundPath, name, navigation });
        const scene = await SceneClass.create(sceneData);
        notifications?.info?.(`Created scene: ${scene?.name ?? sceneData.name}.`);
        renderFoundryApplication(scene?.sheet, { force: true });

        return {
            ok: true,
            scene,
            name: scene?.name ?? sceneData.name,
            data: sceneData
        };
    }

    async createBlankScene({ name = "", navigation = true } = {}) {
        const SceneClass = getSceneClass(this.context);

        if (!SceneClass || typeof SceneClass.create !== "function") {
            return {
                ok: false,
                level: "warn",
                message: "Scene creation is not available in this Foundry session."
            };
        }

        const sceneData = buildBlankSceneCreationData({ name, navigation });
        const scene = await SceneClass.create(sceneData);

        return {
            ok: true,
            scene,
            name: scene?.name ?? sceneData.name,
            data: sceneData,
            silent: true
        };
    }

    async openScenePropertiesPanel() {
        if (typeof this.context.app?._openScenePropertiesPanel === "function") {
            await this.context.app._openScenePropertiesPanel();
            return {
                ok: true,
                silent: true,
                message: "Scene properties opened."
            };
        }

        return {
            ok: false,
            level: "warn",
            message: "Scene properties are not available in this workspace session."
        };
    }

    async uploadBackgroundFile({ file, target, overwrite = false } = {}) {
        const FilePickerClass = getFilePickerClass(this.context);
        if (!FilePickerClass || typeof FilePickerClass.upload !== "function") {
            return {
                ok: false,
                level: "warn",
                message: "Scene background upload is not available in this Foundry session."
            };
        }

        if (!file || !target?.valid) {
            return {
                ok: false,
                level: "warn",
                message: "Enter a scene name and choose a supported image before uploading."
            };
        }

        const FileClass = getFileConstructor(this.context);
        const uploadFile = typeof FileClass === "function"
            ? new FileClass([file], target.filename, {
                type: file.type,
                lastModified: file.lastModified
            })
            : file;
        await ensureFoundryDirectory(FilePickerClass, target.directory);
        const result = await FilePickerClass.upload("data", target.directory, uploadFile, {
            notify: true,
            overwrite: Boolean(overwrite)
        });
        const uploadedPath = String(result?.path ?? result ?? target.path);

        return {
            ok: true,
            path: uploadedPath || target.path,
            filename: target.filename
        };
    }

    async activateWallDesignMode() {
        const scene = getScene(this.context);
        const canvas = getCanvas(this.context);
        const controls = getControls(this.context);

        if (!scene) {
            return {
                ok: false,
                level: "warn",
                message: "Open a scene before editing walls."
            };
        }

        if (canvas?.ready === false) {
            return {
                ok: false,
                level: "warn",
                message: "Wait for the canvas to finish loading before editing walls."
            };
        }

        if (typeof controls?.initialize === "function") {
            await controls.initialize({ control: WALL_CONTROL, tool: WALL_TOOL });
            return {
                ok: true,
                message: "Wall design tools activated."
            };
        }

        const wallLayer = canvas?.walls;
        if (typeof wallLayer?.activate === "function") {
            await wallLayer.activate();
            return {
                ok: true,
                message: "Wall layer activated."
            };
        }

        return {
            ok: false,
            level: "warn",
            message: "Wall design tools are not available in this Foundry session."
        };
    }

    async detectRegularGridWalls({ options = {} } = {}) {
        const scene = getScene(this.context);
        const canvas = getCanvas(this.context);
        const confirm = getConfirm(this.context);

        if (!scene) {
            return {
                ok: false,
                level: "warn",
                message: "Open a scene before detecting walls."
            };
        }

        if (canvas?.ready === false) {
            return {
                ok: false,
                level: "warn",
                message: "Wait for the canvas to finish loading before detecting walls."
            };
        }

        const backgroundSource = getSceneBackgroundSource(scene);
        if (!backgroundSource) {
            return {
                ok: false,
                level: "warn",
                message: "Set a scene background image before detecting walls."
            };
        }

        const preliminaryGrid = buildRegularSquareGridModel(scene);
        if (!preliminaryGrid) {
            return {
                ok: false,
                level: "warn",
                message: "Wall detection requires a calibrated square grid."
            };
        }

        const existingWalls = getSceneWallDocuments(scene);
        const confirmedReplacement = existingWalls.length === 0
            || (typeof confirm === "function" && confirm(`Detecting walls will discard ${existingWalls.length} existing wall${existingWalls.length === 1 ? "" : "s"} on "${scene.name ?? "this scene"}". Proceed?`));
        if (!confirmedReplacement) {
            return {
                ok: false,
                silent: true,
                reason: "replacement-cancelled"
            };
        }

        const imageData = await loadImageDataFromSource(backgroundSource, this.context);
        const detected = detectRegularGridWallSegments({
            imageData,
            width: imageData.width,
            height: imageData.height,
            scene,
            options
        });
        if (!detected.ok) {
            return {
                ok: false,
                level: "warn",
                message: "Wall detection requires a calibrated square grid."
            };
        }

        const wallData = buildDetectedWallDocumentData(detected.segments, {
            foundryConstants: this.context.CONST ?? globalThis.CONST
        });
        if (!wallData.length) {
            return {
                ok: false,
                level: "warn",
                message: "No confident grid-aligned walls were detected."
            };
        }

        const applied = await applyDetectedWallsToScene({
            scene,
            wallData,
            confirmReplacement: () => true
        });
        if (!applied.ok) {
            return {
                ok: false,
                level: "warn",
                message: applied.reason === "wall-deletion-unavailable"
                    ? "This scene cannot replace existing walls automatically."
                    : "Wall detection could not create walls in this Foundry session."
            };
        }

        return {
            ok: true,
            createdCount: wallData.length,
            message: `Detected ${wallData.length} wall segment${wallData.length === 1 ? "" : "s"}.`
        };
    }
}

export async function createSceneFromBackgroundPath({ backgroundPath = "", name = "", navigation = true, ...context } = {}) {
    return new SceneDesignService(context).createFromBackgroundPath({ backgroundPath, name, navigation });
}

export async function createSceneDesignScene(context = {}) {
    if (typeof context.app?._createSceneDesignScene === "function") {
        return context.app._createSceneDesignScene();
    }

    return new SceneDesignService(context).createBlankScene();
}

export async function uploadSceneBackgroundFile({ file, target, overwrite = false, ...context } = {}) {
    return new SceneDesignService(context).uploadBackgroundFile({ file, target, overwrite });
}

export async function activateSceneWallDesignMode(context = {}) {
    return new SceneDesignService(context).activateWallDesignMode();
}

export async function detectSceneWalls(context = {}) {
    return new SceneDesignService(context).detectRegularGridWalls();
}
