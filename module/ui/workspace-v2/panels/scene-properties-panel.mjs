import {
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SCENE_BACKGROUND_IMAGE_EXTENSIONS
} from "../design-actions/scene-actions.mjs";
import {
    getSceneBackgroundLevel,
    getSceneBackgroundSource
} from "../scene-background-source.mjs";
import { isDefaultScene } from "../../../seeded-scenes.mjs";

function safeEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function toArray(collection) {
    return Array.from(collection?.contents ?? collection ?? []);
}

function positiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function sceneTokenName(token) {
    return String(token?.name ?? token?.document?.name ?? token?.actor?.name ?? "Token").trim() || "Token";
}

function sceneTokenPosition(token, axis) {
    const numeric = Number(token?.[axis] ?? token?.document?.[axis]);
    return Number.isFinite(numeric) ? numeric : 0;
}

function sceneTokenGridSize(token, axis) {
    return positiveNumber(token?.[axis] ?? token?.document?.[axis], 1);
}

function buildSceneTokenListModel(scene = null) {
    const cell = positiveNumber(scene?.grid?.size, 100);
    const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
    return toArray(scene?.tokens).filter(Boolean).map((token) => {
        const x = sceneTokenPosition(token, "x");
        const y = sceneTokenPosition(token, "y");
        const width = sceneTokenGridSize(token, "width") * cell;
        const height = sceneTokenGridSize(token, "height") * cell;
        return {
            id: String(token?.id ?? token?._id ?? token?.document?.id ?? token?.document?._id ?? "").trim(),
            sceneId,
            name: sceneTokenName(token),
            x,
            y,
            width,
            height,
            centerX: Math.round(x + (width / 2)),
            centerY: Math.round(y + (height / 2))
        };
    });
}

export function slugifySceneName(name = "") {
    return String(name ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

export function getSceneBackgroundExtension(filename = "") {
    const cleanName = String(filename ?? "").trim().split(/[?#]/)[0] ?? "";
    const ext = cleanName.includes(".") ? cleanName.split(".").pop().toLowerCase() : "";
    return SCENE_BACKGROUND_IMAGE_EXTENSIONS.includes(ext) ? ext : "";
}

export function buildSceneBackgroundUploadTarget({ sceneName = "", filename = "" } = {}) {
    const slug = slugifySceneName(sceneName);
    const extension = getSceneBackgroundExtension(filename);

    return {
        valid: Boolean(slug && extension),
        directory: SCENE_BACKGROUND_IMAGE_ASSET_PATH,
        filename: slug && extension ? `${slug}.${extension}` : "",
        path: slug && extension ? `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/${slug}.${extension}` : "",
        slug,
        extension
    };
}

/**
 * Build the model for the scene-properties panel.
 *
 * The panel is bound to a specific scene (the active map panel's scene).
 * There is no staging state — all values come directly from the scene document.
 * Edits auto-save immediately.
 *
 * @param {object} options
 * @param {object|null} options.scene - The Foundry scene document
 * @param {string} options.status - Upload status message
 * @param {string} options.error - Error message
 * @param {Array}  options.actors - World actors for placement
 */
export function buildScenePropertiesPanelModel({
    scene = null,
    actors = [],
    status = "",
    error = ""
} = {}) {
    const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
    const sceneName = String(scene?.name ?? "").trim();
    const backgroundPath = getSceneBackgroundSource(scene);
    const accept = SCENE_BACKGROUND_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
    const target = buildSceneBackgroundUploadTarget({
        sceneName,
        filename: backgroundPath ? backgroundPath.split("/").pop() : ""
    });

    return {
        sceneId,
        sceneName,
        backgroundPath,
        target,
        accept,
        isDefault: isDefaultScene(scene),
        uploadEnabled: Boolean(scene && sceneName),
        deleteEnabled: Boolean(scene),
        sceneTokens: buildSceneTokenListModel(scene),
        status: String(status ?? "").trim(),
        error: String(error ?? "").trim()
    };
}

/**
 * Build the legacy update data to send to scene.update() when saving a background.
 *
 * Foundry v14 stores background media on embedded Level documents. This object
 * is used only for older scene schemas and compatibility shims.
 */
export function buildSceneBackgroundUpdateData(backgroundPath = "") {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    return {
        img: src,
        "background.src": src,
        "texture.src": src
    };
}

export function buildSceneLevelBackgroundUpdateData(backgroundPath = "") {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    return { "background.src": src };
}

export function buildSceneLevelBackgroundCreationData(backgroundPath = "", { name = "" } = {}) {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    return {
        name: String(name ?? "").trim() || "Ground Level",
        elevation: { bottom: 0, top: 999 },
        background: { src }
    };
}

function sceneHasLevelSupport(scene) {
    return Boolean(scene?.levels)
        || typeof scene?.createEmbeddedDocuments === "function"
        || typeof scene?.updateEmbeddedDocuments === "function";
}

/**
 * Persist a scene background across Foundry schema generations.
 *
 * Current Foundry v14 scenes render backgrounds from embedded Level documents.
 * Older versions store background media directly on the Scene. Prefer the Level
 * path when available, then fall back to the legacy scene update shape.
 */
export async function applySceneBackgroundUpdate(scene, backgroundPath = "") {
    const src = String(backgroundPath ?? "").trim();
    if (!scene || !src) return { ok: false, mode: "none", document: null };

    const level = getSceneBackgroundLevel(scene);
    const levelUpdate = buildSceneLevelBackgroundUpdateData(src);

    if (level) {
        if (typeof level.update === "function") {
            const document = await level.update(levelUpdate);
            return { ok: true, mode: "level", document: document ?? level };
        }

        const levelId = String(level.id ?? level._id ?? level._source?._id ?? "").trim();
        if (levelId && typeof scene.updateEmbeddedDocuments === "function") {
            const documents = await scene.updateEmbeddedDocuments("Level", [{ _id: levelId, ...levelUpdate }]);
            return { ok: true, mode: "level", document: documents?.[0] ?? level };
        }
    }

    if (sceneHasLevelSupport(scene) && typeof scene.createEmbeddedDocuments === "function") {
        const documents = await scene.createEmbeddedDocuments("Level", [
            buildSceneLevelBackgroundCreationData(src)
        ]);
        return { ok: true, mode: "level-created", document: documents?.[0] ?? null };
    }

    if (typeof scene.update === "function") {
        const document = await scene.update(buildSceneBackgroundUpdateData(src));
        return { ok: true, mode: "scene", document: document ?? scene };
    }

    return { ok: false, mode: "none", document: null };
}

export function resolveScenePropertiesMapPanelScene({
    panel = null,
    currentScene = null,
    sceneResolver = () => null
} = {}) {
    const panelId = String(panel?.id ?? "");
    const explicitSceneId = String(panel?.sceneId ?? (panelId.startsWith("map:") ? panelId.slice(4) : "")).trim();

    if (explicitSceneId) {
        return {
            sceneId: explicitSceneId,
            scene: sceneResolver(explicitSceneId) ?? null
        };
    }

    return {
        sceneId: String(currentScene?.id ?? currentScene?._id ?? "").trim(),
        scene: currentScene ?? null
    };
}

export function renderScenePropertiesPanel(model = {}, {
    escapeHTML = safeEscape
} = {}) {
    const sceneActionDisabled = model.sceneId ? "" : "disabled";
    const uploadDisabled = model.uploadEnabled ? "" : "disabled";
    const accept = escapeHTML(model.accept ?? SCENE_BACKGROUND_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(","));
    const targetPath = model.target?.path || `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/<scene-slug>.<ext>`;
    const sceneTokens = Array.isArray(model.sceneTokens) ? model.sceneTokens : [];

    if (!model.sceneId) {
        return `
        <section class="totc-v2-scene-properties-panel">
            <p class="totc-v2-scene-properties-panel__idle">No scene open. Click a scene in the Scenes panel to open its map.</p>
        </section>`;
    }

    return `
    <section class="totc-v2-scene-properties-panel">
        <div class="totc-v2-scene-properties-panel__fields">
            <label class="totc-v2-scene-properties-panel__field">
                <span>Scene name</span>
                <input type="text" data-action="scene-properties-name" value="${escapeHTML(model.sceneName ?? "")}" placeholder="Whitechapel Alley">
            </label>
            <label class="totc-v2-scene-properties-panel__field ${model.uploadEnabled ? "" : "is-disabled"}">
                <span>Background image</span>
                <input type="file" data-action="scene-properties-background-upload" accept="${accept}" ${uploadDisabled}>
            </label>
            ${model.backgroundPath ? `<div class="totc-v2-scene-properties-panel__bg-path">${escapeHTML(model.backgroundPath)}</div>` : ""}
        </div>
        <footer class="totc-v2-scene-properties-panel__actions">
            <label class="totc-v2-scene-properties-panel__default-label">
                <input type="checkbox" data-action="scene-properties-set-default" ${model.isDefault ? "checked" : ""} ${sceneActionDisabled}> Default scene
            </label>
            <button type="button" class="totc-v2-scene-properties-panel__danger" data-action="scene-properties-delete" ${sceneActionDisabled}>Delete Scene</button>
        </footer>
        <section class="totc-v2-scene-properties-panel__tokens">
            <header>
                <h3>Scene Tokens</h3>
                <span>Double-click to center map</span>
            </header>
            <div class="totc-v2-scene-properties-panel__token-list">
                ${sceneTokens.length
                    ? sceneTokens.map((token) => `
                        <button type="button"
                            class="totc-v2-scene-properties-panel__token-entry"
                            data-action="scene-token-center"
                            data-scene-id="${escapeHTML(token.sceneId)}"
                            data-token-center-x="${escapeHTML(token.centerX)}"
                            data-token-center-y="${escapeHTML(token.centerY)}"
                            title="Double-click to center map on this token">
                            <span class="totc-v2-scene-properties-panel__token-name">${escapeHTML(token.name)}</span>
                            <span class="totc-v2-scene-properties-panel__token-meta">(${escapeHTML(token.x)}, ${escapeHTML(token.y)})</span>
                        </button>
                    `).join("")
                    : `<div class="totc-v2-scene-properties-panel__actor-empty">No tokens in this scene</div>`}
            </div>
        </section>
    </section>`;
}
