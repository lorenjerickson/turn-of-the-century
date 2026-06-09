function readPath(read) {
    try {
        return String(read() ?? "").trim();
    } catch {
        return "";
    }
}

function toArray(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function getLevelSortValue(level) {
    const index = Number(level?.index);
    if (Number.isFinite(index)) return index;
    const sort = Number(level?.sort ?? level?._source?.sort);
    if (Number.isFinite(sort)) return sort;
    return 0;
}

export function getSceneLevels(scene) {
    return [
        ...toArray(scene?.levels),
        ...toArray(scene?._source?.levels)
    ].filter(Boolean);
}

export function getSceneBackgroundLevel(scene) {
    const levels = getSceneLevels(scene);
    if (!levels.length) return null;

    return [...levels].sort((a, b) => {
        if (a?.isView && !b?.isView) return -1;
        if (!a?.isView && b?.isView) return 1;
        if (a?.isVisible && !b?.isVisible) return -1;
        if (!a?.isVisible && b?.isVisible) return 1;
        return getLevelSortValue(a) - getLevelSortValue(b);
    })[0] ?? null;
}

export function getLevelBackgroundSource(level) {
    const candidates = [
        () => level?.background?.src,
        () => level?._source?.background?.src
    ];

    for (const candidate of candidates) {
        const path = readPath(candidate);
        if (path) return path;
    }

    return "";
}

/**
 * Read the scene background image path without touching deprecated scene getters.
 *
 * In Foundry v14, scene background media moved to embedded Level documents. In
 * older Foundry releases, the scene carried the background directly. We read
 * only safe public document data and raw `_source` data here, avoiding deprecated
 * direct scene getters such as `scene.background` and `scene.texture`.
 *
 * Candidate priority:
 *   1. scene.levels[].background.src — v14 Level background
 *   2. _source.levels[].background.src — raw v14 Level background
 *   3. scene.img — legacy v9-era convenience/source field
 *   4. _source.img — legacy raw img field
 *   5. _source.background.src — v12/v13 scene background field
 *   6. _source.texture.src — compatibility texture path
 *
 * NOTE: Never access scene.background or scene.texture directly.
 */
export function getSceneBackgroundSource(scene) {
    const levelSource = getLevelBackgroundSource(getSceneBackgroundLevel(scene));
    if (levelSource) return levelSource;

    const candidates = [
        () => scene?.img,
        () => scene?._source?.["img"],
        () => scene?._source?.background?.src,
        () => scene?._source?.texture?.src
    ];

    for (const candidate of candidates) {
        const path = readPath(candidate);
        if (path) return path;
    }

    return "";
}
