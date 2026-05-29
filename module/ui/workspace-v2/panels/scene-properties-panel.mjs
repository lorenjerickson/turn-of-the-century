import {
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SCENE_BACKGROUND_IMAGE_EXTENSIONS
} from "../design-actions/scene-actions.mjs";

function safeEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function slugifySceneName(name = "") {
    return String(name ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
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

export function buildScenePropertiesPanelModel(state = {}) {
    const scene = state.scene ?? null;
    const sceneId = String(scene?.id ?? scene?._id ?? "").trim();
    const stateSceneId = String(state.sceneId ?? "").trim();
    const stateApplies = !stateSceneId || !sceneId || stateSceneId === sceneId;
    const sceneName = String(stateApplies ? (state.sceneName ?? scene?.name ?? "") : (scene?.name ?? "")).trim();
    const selectedFilename = String(stateApplies ? state.selectedFilename ?? "" : "").trim();
    const target = buildSceneBackgroundUploadTarget({
        sceneName,
        filename: selectedFilename
    });
    const uploadedPath = String(stateApplies ? state.backgroundPath ?? "" : "").trim();
    const currentBackgroundPath = String(
        scene?.background?.src
            ?? scene?.["img"]
            ?? scene?.texture?.src
            ?? ""
    ).trim();
    const effectiveBackgroundPath = uploadedPath || currentBackgroundPath;

    return {
        sceneId,
        sceneName,
        selectedFilename,
        target,
        backgroundPath: uploadedPath,
        currentBackgroundPath,
        effectiveBackgroundPath,
        createMode: Boolean(state.createMode),
        uploadEnabled: Boolean(sceneName),
        saveEnabled: Boolean(scene && sceneName),
        backgroundChanged: Boolean(uploadedPath && uploadedPath !== currentBackgroundPath),
        status: String(stateApplies ? state.status ?? "" : "").trim(),
        error: String(stateApplies ? state.error ?? "" : "").trim()
    };
}

export function buildScenePropertiesNameInputState(currentState = {}, scene = null, sceneName = "") {
    const nextName = String(sceneName ?? "");

    return {
        ...currentState,
        sceneId: scene?.id ?? scene?._id ?? "",
        sceneName: nextName,
        createMode: Boolean(currentState.createMode),
        status: nextName.trim()
            ? ""
            : "Enter a scene name before saving.",
        error: ""
    };
}

export function buildScenePropertiesUpdateData(model = {}) {
    const sceneName = String(model.sceneName ?? "").trim();
    const backgroundPath = String(model.backgroundPath ?? "").trim();
    const currentBackgroundPath = String(model.currentBackgroundPath ?? "").trim();
    const updateData = {};

    if (sceneName) updateData.name = sceneName;

    if (backgroundPath && backgroundPath !== currentBackgroundPath) {
        updateData["background.src"] = backgroundPath;
        updateData.shiftX = 0;
        updateData.shiftY = 0;
        updateData["grid.type"] = 0;
        updateData["grid.size"] = 100;
    }

    return updateData;
}

export function resolveScenePropertiesScene({
    activePanel = null,
    viewedScene = null,
    defaultScene = null,
    sceneResolver = () => null
} = {}) {
    const panelId = String(activePanel?.id ?? "");
    const sceneId = String(activePanel?.sceneId ?? (panelId.startsWith("map:") ? panelId.slice(4) : "")).trim();
    const isMapPanel = activePanel?.baseId === "map" || panelId === "map" || panelId.startsWith("map:");

    if (isMapPanel && sceneId) {
        return sceneResolver(sceneId) ?? viewedScene ?? defaultScene ?? null;
    }

    if (isMapPanel) return defaultScene ?? viewedScene ?? null;

    return viewedScene ?? defaultScene ?? null;
}

export function renderScenePropertiesPanel(model = {}, { escapeHTML = safeEscape } = {}) {
    const uploadDisabled = model.uploadEnabled ? "" : "disabled";
    const saveDisabled = model.saveEnabled ? "" : "disabled";
    const sceneActionDisabled = model.sceneId ? "" : "disabled";
    const accept = SCENE_BACKGROUND_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
    const targetPath = model.target?.path || `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/<scene-slug>.<ext>`;

    return `
    <section class="totc-v2-scene-properties-panel">
        ${model.createMode ? `<p class="totc-v2-scene-properties-panel__status">Create mode</p>` : ""}
        <div class="totc-v2-scene-properties-panel__fields">
            <label class="totc-v2-scene-properties-panel__field">
                <span>Scene name</span>
                <input type="text" data-action="scene-properties-name" value="${escapeHTML(model.sceneName ?? "")}" placeholder="Whitechapel Alley">
            </label>
            <label class="totc-v2-scene-properties-panel__field ${model.uploadEnabled ? "" : "is-disabled"}">
                <span>Background image</span>
                <input type="file" data-action="scene-properties-background-upload" accept="${escapeHTML(accept)}" ${uploadDisabled}>
            </label>
        </div>
        <div class="totc-v2-scene-properties-panel__summary">
            ${model.sceneId ? `<div><strong>Scene</strong> ${escapeHTML(model.sceneId)}</div>` : `<div><strong>Scene</strong> No viewed scene</div>`}
            ${model.currentBackgroundPath ? `<div><strong>Current background</strong> ${escapeHTML(model.currentBackgroundPath)}</div>` : ""}
            <div><strong>Upload target</strong> ${escapeHTML(targetPath)}</div>
            ${model.backgroundPath ? `<div><strong>Uploaded</strong> ${escapeHTML(model.backgroundPath)}</div>` : ""}
            ${model.backgroundChanged ? `<p class="totc-v2-scene-properties-panel__status">Saving this background will clear existing grid calibration.</p>` : ""}
            ${model.status ? `<p class="totc-v2-scene-properties-panel__status">${escapeHTML(model.status)}</p>` : ""}
            ${model.error ? `<p class="totc-v2-scene-properties-panel__error">${escapeHTML(model.error)}</p>` : ""}
        </div>
        <footer class="totc-v2-scene-properties-panel__actions">
            <button type="button" data-action="scene-properties-reset">Reset</button>
            <button type="button" data-action="scene-properties-activate" ${sceneActionDisabled}>Activate Scene</button>
            <button type="button" class="totc-v2-scene-properties-panel__danger" data-action="scene-properties-delete" ${sceneActionDisabled}>Delete Scene</button>
            <button type="button" data-action="scene-properties-save" ${saveDisabled}>Save</button>
        </footer>
    </section>`;
}
