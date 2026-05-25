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
    return context.SceneClass ?? globalThis.Scene ?? null;
}

function getFoundry(context = {}) {
    return context.foundry ?? globalThis.foundry ?? null;
}

function getFilePickerClass(context = {}) {
    if (context.FilePickerClass) return context.FilePickerClass;

    const foundryNamespace = getFoundry(context);
    const namespacedFilePicker = foundryNamespace?.applications?.apps?.FilePicker;
    if (namespacedFilePicker?.implementation) return namespacedFilePicker.implementation;
    if (typeof namespacedFilePicker === "function") return namespacedFilePicker;

    return globalThis.FilePicker ?? null;
}

function getFileConstructor(context = {}) {
    return context.FileClass ?? globalThis.File ?? null;
}

function getNotifications(context = {}) {
    return context.notifications ?? context.ui?.notifications ?? globalThis.ui?.notifications ?? null;
}

function getWorldId(context = {}) {
    return String(context.worldId ?? context.game?.world?.id ?? globalThis.game?.world?.id ?? "").trim();
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

    return {
        name: sceneName,
        navigation: Boolean(navigation),
        background: {
            src: safeBackgroundPath
        },
        img: safeBackgroundPath,
        flags: {
            "turn-of-the-century": {
                designCreated: true,
                assetContext: "images/scenes"
            }
        }
    };
}

export async function createSceneFromBackgroundPath({ backgroundPath = "", name = "", navigation = true, ...context } = {}) {
    const SceneClass = getSceneClass(context);
    const notifications = getNotifications(context);
    const worldId = getWorldId(context);

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
    scene?.sheet?.render?.(true);

    return {
        ok: true,
        scene,
        name: scene?.name ?? sceneData.name,
        data: sceneData
    };
}

export async function createSceneDesignScene(context = {}) {
    if (typeof context.app?._openScenePropertiesPanel === "function") {
        await context.app._openScenePropertiesPanel();
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

export async function uploadSceneBackgroundFile({ file, target, ...context } = {}) {
    const FilePickerClass = getFilePickerClass(context);
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

    const FileClass = getFileConstructor(context);
    const uploadFile = typeof FileClass === "function"
        ? new FileClass([file], target.filename, {
            type: file.type,
            lastModified: file.lastModified
        })
        : file;
    await ensureFoundryDirectory(FilePickerClass, target.directory);
    const result = await FilePickerClass.upload("data", target.directory, uploadFile, {
        notify: true,
        overwrite: false
    });
    const uploadedPath = String(result?.path ?? result ?? target.path);

    return {
        ok: true,
        path: uploadedPath || target.path,
        filename: target.filename
    };
}

export async function activateSceneWallDesignMode(context = {}) {
    const scene = getScene(context);
    const canvas = getCanvas(context);
    const controls = getControls(context);

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
