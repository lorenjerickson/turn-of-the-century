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
    const sceneName = String(state.sceneName ?? "").trim();
    const selectedFilename = String(state.selectedFilename ?? "").trim();
    const target = buildSceneBackgroundUploadTarget({
        sceneName,
        filename: selectedFilename
    });
    const uploadedPath = String(state.backgroundPath ?? "").trim();

    return {
        sceneName,
        selectedFilename,
        target,
        backgroundPath: uploadedPath,
        uploadEnabled: Boolean(sceneName),
        createEnabled: Boolean(sceneName && uploadedPath),
        status: String(state.status ?? "").trim(),
        error: String(state.error ?? "").trim()
    };
}

export function renderScenePropertiesPanel(model = {}, { escapeHTML = safeEscape } = {}) {
    const uploadDisabled = model.uploadEnabled ? "" : "disabled";
    const createDisabled = model.createEnabled ? "" : "disabled";
    const accept = SCENE_BACKGROUND_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
    const targetPath = model.target?.path || `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/<scene-slug>.<ext>`;

    return `
    <section class="totc-v2-scene-properties-panel">
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
            <div><strong>Upload target</strong> ${escapeHTML(targetPath)}</div>
            ${model.backgroundPath ? `<div><strong>Uploaded</strong> ${escapeHTML(model.backgroundPath)}</div>` : ""}
            ${model.status ? `<p class="totc-v2-scene-properties-panel__status">${escapeHTML(model.status)}</p>` : ""}
            ${model.error ? `<p class="totc-v2-scene-properties-panel__error">${escapeHTML(model.error)}</p>` : ""}
        </div>
        <footer class="totc-v2-scene-properties-panel__actions">
            <button type="button" data-action="scene-properties-reset">Reset</button>
            <button type="button" data-action="scene-properties-create" ${createDisabled}>Create Scene</button>
        </footer>
    </section>`;
}
