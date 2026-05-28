function getSceneCollectionEntries(scenes) {
    if (!scenes) return [];
    if (Array.isArray(scenes)) return scenes;
    if (Array.isArray(scenes.contents)) return scenes.contents;
    if (typeof scenes.values === "function") return Array.from(scenes.values());
    if (typeof scenes[Symbol.iterator] === "function") return Array.from(scenes);
    return [];
}

function defaultMapSourceResolver(scene) {
    return scene?.background?.src
        ?? scene?.["img"]
        ?? scene?.texture?.src
        ?? scene?.thumb
        ?? scene?.thumbnail?.src
        ?? "";
}

function formatDimensions(scene) {
    const width = Number(scene?.width ?? 0);
    const height = Number(scene?.height ?? 0);
    return width > 0 && height > 0 ? `${width} x ${height}` : "No dimensions";
}

function formatGrid(scene) {
    const gridType = Number(scene?.grid?.type ?? 0);
    if (!gridType) return "Gridless";

    const size = Number(scene?.grid?.size ?? 0);
    const distance = Number(scene?.grid?.distance ?? 0);
    const units = String(scene?.grid?.units ?? "").trim();
    const cell = size > 0 ? `${size}px` : "grid";
    const scale = distance > 0 ? `, ${distance}${units ? ` ${units}` : ""}` : "";
    return `${cell}${scale}`;
}

function getSceneId(scene) {
    return String(scene?.id ?? scene?._id ?? scene?.uuid ?? "");
}

export function buildScenesPanelModel({
    scenes = [],
    currentScene = null,
    viewedScene = null,
    mapSourceResolver = defaultMapSourceResolver
} = {}) {
    const currentSceneId = getSceneId(currentScene);
    const viewedSceneId = getSceneId(viewedScene);
    const entries = getSceneCollectionEntries(scenes)
        .filter(Boolean)
        .map((scene) => {
            const id = getSceneId(scene);
            return {
                id,
                name: String(scene?.name ?? "Untitled Scene"),
                active: Boolean(scene?.active),
                current: Boolean(id && id === currentSceneId),
                viewed: Boolean(id && id === viewedSceneId),
                dimensions: formatDimensions(scene),
                grid: formatGrid(scene),
                hasMap: Boolean(mapSourceResolver(scene))
            };
        });

    return {
        count: entries.length,
        entries
    };
}

export function renderScenesPanel(panelModel = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const entries = Array.isArray(panelModel.entries) ? panelModel.entries : [];
    const summary = `${Number(panelModel.count ?? entries.length)} defined scene${Number(panelModel.count ?? entries.length) === 1 ? "" : "s"}`;

    return `
    <section class="totc-v2-scenes-panel">
        <header class="totc-v2-scenes-panel__summary">${escapeHTML(summary)}</header>
        <div class="totc-v2-scenes-panel__list" role="list">
            ${entries.length ? entries.map((scene) => {
                const badges = [
                    scene.current ? "Current" : "",
                    !scene.current && scene.viewed ? "Viewed" : "",
                    scene.active ? "Active" : "",
                    scene.hasMap ? "Map" : "No map"
                ].filter(Boolean);

                return `
                <article class="totc-v2-scenes-panel__entry${scene.current ? " is-current" : ""}" role="listitem" data-scene-id="${escapeHTML(scene.id)}">
                    <button type="button" class="totc-v2-scenes-panel__entry-main" data-action="open-scene-map" data-scene-id="${escapeHTML(scene.id)}">
                        <span class="totc-v2-scenes-panel__entry-name">${escapeHTML(scene.name)}</span>
                        <span class="totc-v2-scenes-panel__entry-dimensions">${escapeHTML(scene.dimensions)}</span>
                    </button>
                    <div class="totc-v2-scenes-panel__entry-meta">
                        <span>${escapeHTML(scene.grid)}</span>
                    </div>
                    <div class="totc-v2-scenes-panel__badges">
                        ${badges.map((badge) => `<span class="totc-v2-scenes-panel__badge">${escapeHTML(badge)}</span>`).join("")}
                    </div>
                </article>`;
            }).join("") : `<div class="totc-v2-scenes-panel__empty">No scenes have been defined yet.</div>`}
        </div>
    </section>`;
}
