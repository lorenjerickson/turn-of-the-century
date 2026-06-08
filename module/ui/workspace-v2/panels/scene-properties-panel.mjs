import {
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SCENE_BACKGROUND_IMAGE_EXTENSIONS
} from "../design-actions/scene-actions.mjs";
import { getSceneBackgroundSource } from "../scene-background-source.mjs";
import { buildSceneActorPlacementPanelModel } from "../scene-actor-placement.mjs";
import { isDefaultScene } from "../../../seeded-scenes.mjs";

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
        status: String(status ?? "").trim(),
        error: String(error ?? "").trim()
    };
}

/**
 * Build the update data to send to scene.update() when saving a background.
 * Sends only src — Foundry deep-merges, preserving other background properties.
 */
export function buildSceneBackgroundUpdateData(backgroundPath = "") {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    return {
        background: { src },
        texture: { src }
    };
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

function renderActorCheckbox(actor, escapeHTML) {
    return `
        <label class="totc-v2-scene-properties-panel__actor-option">
            <input type="checkbox" name="actorId" value="${escapeHTML(actor.id)}">
            ${actor.img ? `<img src="${escapeHTML(actor.img)}" alt="">` : `<span class="totc-v2-scene-properties-panel__actor-icon">${escapeHTML(actor.name.slice(0, 1).toUpperCase())}</span>`}
            <span>${escapeHTML(actor.name)}</span>
        </label>`;
}

function renderActorGroup(title, actors, escapeHTML) {
    return `
        <section class="totc-v2-scene-properties-panel__actor-group">
            <h4>${escapeHTML(title)}</h4>
            <div class="totc-v2-scene-properties-panel__actor-list">
                ${actors.length
                    ? actors.map((actor) => renderActorCheckbox(actor, escapeHTML)).join("")
                    : `<div class="totc-v2-scene-properties-panel__actor-empty">None available</div>`}
            </div>
        </section>`;
}

export function renderScenePropertiesPanel(model = {}, {
    escapeHTML = safeEscape,
    actorPlacement = null
} = {}) {
    const sceneActionDisabled = model.sceneId ? "" : "disabled";
    const uploadDisabled = model.uploadEnabled ? "" : "disabled";
    const accept = escapeHTML(model.accept ?? SCENE_BACKGROUND_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(","));
    const targetPath = model.target?.path || `${SCENE_BACKGROUND_IMAGE_ASSET_PATH}/<scene-slug>.<ext>`;

    if (!model.sceneId) {
        return `
        <section class="totc-v2-scene-properties-panel">
            <p class="totc-v2-scene-properties-panel__status">Open a scene map panel to edit its properties.</p>
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
        </div>
        <div class="totc-v2-scene-properties-panel__summary">
            ${model.backgroundPath ? `<div><strong>Background</strong> ${escapeHTML(model.backgroundPath)}</div>` : `<div class="totc-v2-scene-properties-panel__status">No background set — enter a scene name then upload an image.</div>`}
            <div><strong>Upload target</strong> ${escapeHTML(targetPath)}</div>
            ${model.status ? `<p class="totc-v2-scene-properties-panel__status">${escapeHTML(model.status)}</p>` : ""}
            ${model.error ? `<p class="totc-v2-scene-properties-panel__error">${escapeHTML(model.error)}</p>` : ""}
        </div>
        <footer class="totc-v2-scene-properties-panel__actions">
            <label class="totc-v2-scene-properties-panel__default-label">
                <input type="checkbox" data-action="scene-properties-set-default" ${model.isDefault ? "checked" : ""} ${sceneActionDisabled}> Default scene
            </label>
            <button type="button" class="totc-v2-scene-properties-panel__danger" data-action="scene-properties-delete" ${sceneActionDisabled}>Delete Scene</button>
        </footer>
        ${actorPlacement ? `
        <form class="totc-v2-scene-properties-panel__actors" data-action="scene-actors-add-selected">
            <header>
                <h3>Scene Actors</h3>
                <button type="button" data-action="scene-actors-add-heroes" ${sceneActionDisabled}>Add All Heroes</button>
            </header>
            ${renderActorGroup("Heroes", actorPlacement?.heroes ?? [], escapeHTML)}
            ${renderActorGroup("Pawns", actorPlacement?.pawns ?? [], escapeHTML)}
            ${renderActorGroup("Villains", actorPlacement?.villains ?? [], escapeHTML)}
            <footer class="totc-v2-scene-properties-panel__actions">
                <button type="submit" ${sceneActionDisabled}>Add Selected</button>
            </footer>
        </form>` : ""}
    </section>`;
}
