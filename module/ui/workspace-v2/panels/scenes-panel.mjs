import { getSceneBackgroundSource } from "../scene-background-source.mjs";

function getSceneCollectionEntries(scenes) {
    if (!scenes) return [];
    if (Array.isArray(scenes)) return scenes;
    if (Array.isArray(scenes.contents)) return scenes.contents;
    if (typeof scenes.values === "function") return Array.from(scenes.values());
    if (typeof scenes[Symbol.iterator] === "function") return Array.from(scenes);
    return [];
}

function defaultThumbnailSourceResolver(scene) {
    return getSceneBackgroundSource(scene);
}

function getSceneId(scene) {
    return String(scene?.id ?? scene?._id ?? scene?.uuid ?? "");
}

export function buildScenesPanelModel({
    scenes = [],
    currentScene = null,
    viewedScene = null,
    thumbnailSourceResolver = defaultThumbnailSourceResolver
} = {}) {
    const currentSceneId = getSceneId(currentScene);
    const viewedSceneId = getSceneId(viewedScene);
    const entries = getSceneCollectionEntries(scenes)
        .filter(Boolean)
        .map((scene) => {
            const id = getSceneId(scene);
            const thumbnailSrc = thumbnailSourceResolver(scene) || "";
            const gridType = Number(scene?.grid?.type ?? 0);
            const isDefault = Boolean(scene?.flags?.["turn-of-the-century"]?.defaultScene);
            return {
                id,
                name: String(scene?.name ?? "Untitled Scene"),
                active: Boolean(scene?.active),
                current: Boolean(id && id === currentSceneId),
                viewed: Boolean(id && id === viewedSceneId),
                isDefault,
                thumbnailSrc,
                hasMap: Boolean(thumbnailSrc),
                gridless: gridType === 0
            };
        });

    return {
        count: entries.length,
        entries
    };
}

export function renderScenesPanel(panelModel = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const entries = Array.isArray(panelModel.entries) ? panelModel.entries : [];
    const count = Number(panelModel.count ?? entries.length);
    const summary = `${count} scene${count === 1 ? "" : "s"}`;

    return `
    <section class="totc-v2-scenes-panel">
        <header class="totc-v2-scenes-panel__toolbar">
            <span class="totc-v2-scenes-panel__summary">${escapeHTML(summary)}</span>
            <button type="button" class="totc-v2-scenes-panel__create" data-action="scenes-create-scene" title="Create scene">Create Scene</button>
        </header>
        <div class="totc-v2-scenes-panel__list" role="list">
            ${entries.length ? entries.map((scene) => {
                const bgStyle = scene.thumbnailSrc
                    ? ` style="background-image:linear-gradient(rgba(5,10,20,0.68),rgba(5,10,20,0.68)),url('${escapeHTML(scene.thumbnailSrc)}');background-size:cover;background-position:center"`
                    : "";

                const badges = [
                    scene.gridless ? "Gridless" : "",
                    !scene.hasMap ? "No map" : "",
                    scene.isDefault ? "Default" : ""
                ].filter(Boolean);

                return `
                <article class="totc-v2-scenes-panel__entry${scene.current ? " is-current" : ""}${scene.active ? " is-active" : ""}" role="listitem" data-scene-id="${escapeHTML(scene.id)}"${bgStyle}>
                    <button type="button" class="totc-v2-scenes-panel__entry-main" data-action="open-scene-map" data-scene-id="${escapeHTML(scene.id)}" title="Open scene map (double-click to activate)">
                        <span class="totc-v2-scenes-panel__entry-name">${escapeHTML(scene.name)}</span>
                        ${badges.length ? `<div class="totc-v2-scenes-panel__badges">${badges.map((b) => `<span class="totc-v2-scenes-panel__badge">${escapeHTML(b)}</span>`).join("")}</div>` : ""}
                    </button>
                </article>`;
            }).join("") : `<div class="totc-v2-scenes-panel__empty">No scenes defined.</div>`}
        </div>
    </section>`;
}
