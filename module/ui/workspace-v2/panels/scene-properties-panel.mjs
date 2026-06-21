import {
    SCENE_BACKGROUND_IMAGE_ASSET_PATH,
    SCENE_BACKGROUND_IMAGE_EXTENSIONS
} from "../design-actions/scene-actions.mjs";
import {
    getSceneBackgroundLevel,
    getSceneBackgroundSource
} from "../scene-background-source.mjs";
import {
    buildGridCalibrationModel,
    GRID_CAL_PHASE_HINTS
} from "./grid-calibration.mjs";
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

function normalizeImageDimensions(dimensions = null) {
    const width = Number(dimensions?.width ?? dimensions?.naturalWidth ?? 0);
    const height = Number(dimensions?.height ?? dimensions?.naturalHeight ?? 0);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
    return {
        width: Math.round(width),
        height: Math.round(height)
    };
}

export async function loadImageDimensions(source = "", { ImageClass = globalThis.Image } = {}) {
    const src = String(source ?? "").trim();
    if (!src || typeof ImageClass !== "function") return null;

    return new Promise((resolve) => {
        const image = new ImageClass();
        image.onload = () => resolve(normalizeImageDimensions(image));
        image.onerror = () => resolve(null);
        image.src = src;
    });
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
    gridCalibrationState = null,
    sceneToolsState = null,
    sceneToolActions = [],
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
        dimensionSyncEnabled: Boolean(scene && backgroundPath),
        deleteEnabled: Boolean(scene),
        sceneToolsPanelId: sceneId ? `map:${sceneId}` : "",
        sceneToolsState: sceneToolsState ?? {},
        sceneToolActions: Array.isArray(sceneToolActions)
            ? sceneToolActions.filter((action) => action?.id !== "scene.walls")
            : [],
        gridCalibration: buildGridCalibrationModel({
            state: gridCalibrationState,
            scene
        }),
        sceneTokens: buildSceneTokenListModel(scene),
        status: String(status ?? "").trim(),
        error: String(error ?? "").trim()
    };
}

export function renderSceneMapToolbar(panelId = "", state = {}, { escapeHTML = safeEscape } = {}) {
    const safePanelId = escapeHTML(panelId);
    const mode = String(state.mode ?? "");
    const wallsActive = mode === "walls";
    const wallCommand = String(state.wallCommand ?? "detect");
    const wallType = String(state.wallType ?? "wall");
    const selectedWallCount = Number(state.selectedWallCount ?? 0);
    const joinableWallCount = Number(state.joinableWallCount ?? 0);
    const canDeleteSelectedWalls = selectedWallCount > 0;
    const canJoinSelectedWalls = joinableWallCount > 1;

    const primarySegment = `
        <div class="totc-v2-map-toolbar__segment" role="group" aria-label="View mode">
            <button type="button"
                class="totc-v2-map-toolbar__btn${wallsActive ? " is-active" : ""}"
                data-action="map-mode-select"
                data-map-panel-id="${safePanelId}"
                data-mode="walls"
                aria-pressed="${wallsActive}"
                title="Walls view - draw and edit scene walls">
                <i class="fa-solid fa-draw-polygon" aria-hidden="true"></i>
                <span>Walls</span>
            </button>
        </div>`;

    const secondarySegment = wallsActive ? `
            <div class="totc-v2-map-toolbar__segment" role="group" aria-label="Wall command">
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "detect" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${safePanelId}"
                    data-command="detect"
                    aria-pressed="${wallCommand === "detect"}"
                    title="Auto-detect grid-aligned walls from the map image">
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                    <span>Detect</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "add" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${safePanelId}"
                    data-command="add"
                    aria-pressed="${wallCommand === "add"}"
                    title="Click grid intersections to draw connected wall segments; press Esc to reset the origin">
                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                    <span>Add</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn"
                    data-action="map-wall-command"
                    data-map-panel-id="${safePanelId}"
                    data-command="remove"
                    aria-pressed="false"
                    ${canDeleteSelectedWalls ? "" : "disabled"}
                    title="${canDeleteSelectedWalls ? `Delete ${selectedWallCount} selected wall segment${selectedWallCount === 1 ? "" : "s"}` : "Select wall segments to delete them"}">
                    <i class="fa-solid fa-minus" aria-hidden="true"></i>
                    <span>Remove</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallCommand === "split" ? " is-active" : ""}"
                    data-action="map-wall-command"
                    data-map-panel-id="${safePanelId}"
                    data-command="split"
                    aria-pressed="${wallCommand === "split"}"
                    title="Click a wall segment to split it at the nearest grid point">
                    <i class="fa-solid fa-scissors" aria-hidden="true"></i>
                    <span>Split</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn"
                    data-action="map-wall-command"
                    data-map-panel-id="${safePanelId}"
                    data-command="join"
                    aria-pressed="false"
                    ${canJoinSelectedWalls ? "" : "disabled"}
                    title="${canJoinSelectedWalls ? `Join ${joinableWallCount} selected wall segment${joinableWallCount === 1 ? "" : "s"}` : "Select two or more aligned adjacent wall segments to join them"}">
                    <i class="fa-solid fa-link" aria-hidden="true"></i>
                    <span>Join</span>
                </button>
            </div>
            <div class="totc-v2-map-toolbar__segment" role="group" aria-label="Wall type">
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "wall" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${safePanelId}"
                    data-wall-type="wall"
                    aria-pressed="${wallType === "wall"}"
                    title="Wall (W) - solid impassable barrier">
                    <span>Wall</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "door" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${safePanelId}"
                    data-wall-type="door"
                    aria-pressed="${wallType === "door"}"
                    title="Door (D) - openable passage">
                    <span>Door</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "window" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${safePanelId}"
                    data-wall-type="window"
                    aria-pressed="${wallType === "window"}"
                    title="Window (N) - see-through barrier">
                    <span>Window</span>
                </button>
                <button type="button"
                    class="totc-v2-map-toolbar__btn${wallType === "transparent" ? " is-active" : ""}"
                    data-action="map-wall-type"
                    data-map-panel-id="${safePanelId}"
                    data-wall-type="transparent"
                    aria-pressed="${wallType === "transparent"}"
                    title="Transparent (T) - blocks movement while permitting sight, light, and sound">
                    <span>Transparent</span>
                </button>
            </div>
        ` : "";

    return `
        <nav class="totc-v2-map-toolbar" aria-label="Scene tools" data-map-panel-id="${safePanelId}">
            <div class="totc-v2-map-toolbar__primary">
                ${primarySegment}
                ${secondarySegment}
            </div>
        </nav>`;
}

/**
 * Build the legacy update data to send to scene.update() when saving a background.
 *
 * Foundry v14 stores background media on embedded Level documents. This object
 * is used only for older scene schemas and compatibility shims.
 */
export function buildSceneBackgroundUpdateData(backgroundPath = "", { dimensions = null } = {}) {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    const size = normalizeImageDimensions(dimensions);
    return {
        img: src,
        "background.src": src,
        "texture.src": src,
        ...(size ? { width: size.width, height: size.height } : {})
    };
}

export function buildSceneLevelBackgroundUpdateData(backgroundPath = "", { dimensions = null } = {}) {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    const size = normalizeImageDimensions(dimensions);
    return {
        "background.src": src,
        ...(size ? { x: 0, y: 0, width: size.width, height: size.height } : {})
    };
}

export function buildSceneLevelBackgroundCreationData(backgroundPath = "", { name = "", dimensions = null } = {}) {
    const src = String(backgroundPath ?? "").trim();
    if (!src) return {};
    const size = normalizeImageDimensions(dimensions);
    return {
        name: String(name ?? "").trim() || "Ground Level",
        ...(size ? { x: 0, y: 0, width: size.width, height: size.height } : {}),
        elevation: { bottom: 0, top: 999 },
        background: { src }
    };
}

function buildSceneDimensionUpdateData(dimensions = null) {
    const size = normalizeImageDimensions(dimensions);
    return size ? { width: size.width, height: size.height } : {};
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
export async function applySceneBackgroundUpdate(scene, backgroundPath = "", { dimensions = null } = {}) {
    const src = String(backgroundPath ?? "").trim();
    if (!scene || !src) return { ok: false, mode: "none", document: null };

    const level = getSceneBackgroundLevel(scene);
    const sceneSizeUpdate = buildSceneDimensionUpdateData(dimensions);
    const levelUpdate = buildSceneLevelBackgroundUpdateData(src, { dimensions });

    if (Object.keys(sceneSizeUpdate).length && typeof scene.update === "function") {
        await scene.update(sceneSizeUpdate);
    }

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
            buildSceneLevelBackgroundCreationData(src, { dimensions })
        ]);
        return { ok: true, mode: "level-created", document: documents?.[0] ?? null };
    }

    if (typeof scene.update === "function") {
        const document = await scene.update(buildSceneBackgroundUpdateData(src, { dimensions }));
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
    const gridCalibration = model.gridCalibration ?? { active: false };
    const sceneToolActions = Array.isArray(model.sceneToolActions) ? model.sceneToolActions : [];

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
            <button type="button" data-action="scene-properties-sync-background-dimensions" ${model.dimensionSyncEnabled ? "" : "disabled"}>Fit Background</button>
            <button type="button" class="totc-v2-scene-properties-panel__danger" data-action="scene-properties-delete" ${sceneActionDisabled}>Delete Scene</button>
        </footer>
        <section class="totc-v2-scene-properties-panel__tools">
            <header>
                <h3>Scene Tools</h3>
            </header>
            ${sceneToolActions.length ? `
                <div class="totc-v2-scene-properties-panel__tool-actions" role="list">
                    ${sceneToolActions.map((action) => `
                        <button
                            type="button"
                            class="totc-v2-scene-properties-panel__tool-action"
                            data-action="design-lens-action"
                            data-design-action-id="${escapeHTML(action.id)}"
                            data-panel-id="${escapeHTML(model.sceneToolsPanelId)}"
                            role="listitem"
                            title="${escapeHTML(action.description)}">
                            ${escapeHTML(action.label)}
                        </button>`).join("")}
                </div>
            ` : ""}
            ${renderSceneMapToolbar(model.sceneToolsPanelId, model.sceneToolsState, { escapeHTML })}
        </section>
        <section class="totc-v2-scene-properties-panel__grid" data-grid-calibration="${gridCalibration.active ? "true" : "false"}">
            <header>
                <h3>Grid Calibration</h3>
                <button type="button" data-action="grid-cal-start" ${sceneActionDisabled}>
                    ${gridCalibration.active ? "Restart" : "Calibrate"}
                </button>
            </header>
            ${gridCalibration.active ? renderScenePropertiesGridCalibration(gridCalibration, { escapeHTML }) : `
                <p class="totc-v2-scene-properties-panel__grid-idle">Use two clicks on the viewed scene to derive grid size and offset.</p>
            `}
        </section>
        <section class="totc-v2-scene-properties-panel__tokens">
            <header>
                <h3>Scene Tokens</h3>
                <span>Double-click to center map</span>
            </header>
            <div class="totc-v2-scene-properties-panel__token-list">
                ${sceneTokens.length
                    ? sceneTokens.map((token) => `
                        <div class="totc-v2-scene-properties-panel__token-entry">
                            <button type="button"
                                class="totc-v2-scene-properties-panel__token-center-btn"
                                data-action="scene-token-center"
                                data-scene-id="${escapeHTML(token.sceneId)}"
                                data-token-center-x="${escapeHTML(token.centerX)}"
                                data-token-center-y="${escapeHTML(token.centerY)}"
                                title="Double-click to center map on this token">
                                <span class="totc-v2-scene-properties-panel__token-name">${escapeHTML(token.name)}</span>
                                <span class="totc-v2-scene-properties-panel__token-meta">(${escapeHTML(token.x)}, ${escapeHTML(token.y)})</span>
                            </button>
                            <button type="button"
                                class="totc-v2-scene-properties-panel__token-delete-btn"
                                data-action="scene-token-delete"
                                data-scene-id="${escapeHTML(token.sceneId)}"
                                data-token-id="${escapeHTML(token.id)}"
                                title="Delete token from scene">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `).join("")
                    : `<div class="totc-v2-scene-properties-panel__actor-empty">No tokens in this scene</div>`}
            </div>
        </section>
    </section>`;
}

function renderScenePropertiesGridCalibration(model = {}, { escapeHTML = safeEscape } = {}) {
    const hint = GRID_CAL_PHASE_HINTS[model.phase] ?? "";
    const canApply = model.phase === "adjust" ? "" : "disabled";

    return `
        <div class="totc-v2-scene-properties-panel__grid-state">
            <p>${hint}</p>
            <dl>
                <div>
                    <dt>Point 1</dt>
                    <dd>${model.corner1 ? `${escapeHTML(Math.round(model.corner1.x))}, ${escapeHTML(Math.round(model.corner1.y))}` : "Not set"}</dd>
                </div>
                <div>
                    <dt>Point 2</dt>
                    <dd>${model.corner2 ? `${escapeHTML(Math.round(model.corner2.x))}, ${escapeHTML(Math.round(model.corner2.y))}` : "Not set"}</dd>
                </div>
            </dl>
        </div>
        <div class="totc-v2-scene-properties-panel__grid-fields">
            <label>
                <span>${model.isSquare ? "Cell size" : "Cell width"} (px)</span>
                <input type="number" data-action="grid-cal-cell-w" min="4" max="4096" step="1" value="${escapeHTML(model.cellW)}">
            </label>
            ${!model.isSquare ? `
                <label>
                    <span>Cell height (px)</span>
                    <input type="number" data-action="grid-cal-cell-h" min="4" max="4096" step="1" value="${escapeHTML(model.cellH)}">
                </label>
            ` : ""}
            <label>
                <span>Offset X (px)</span>
                <input type="number" data-action="grid-cal-offset-x" step="1" value="${escapeHTML(model.offsetX)}">
            </label>
            <label>
                <span>Offset Y (px)</span>
                <input type="number" data-action="grid-cal-offset-y" step="1" value="${escapeHTML(model.offsetY)}">
            </label>
            <label>
                <span>Grid color</span>
                <input type="color" data-action="grid-cal-color" value="${escapeHTML(model.color ?? "#000000")}">
            </label>
        </div>
        <footer class="totc-v2-scene-properties-panel__grid-actions">
            <button type="button" data-action="grid-cal-reset">Re-pick</button>
            <button type="button" data-action="grid-cal-cancel">Cancel</button>
            <button type="button" data-action="grid-cal-confirm" ${canApply}>Apply</button>
        </footer>`;
}
