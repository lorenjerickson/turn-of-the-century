function readPath(read) {
    try {
        return String(read() ?? "").trim();
    } catch {
        return "";
    }
}

/**
 * Read the scene background image path without touching deprecated Foundry v14 getters.
 *
 * In Foundry v14, `scene.background` and `scene.texture` are deprecated properties
 * whose getters emit compatibility warnings on every access. We read exclusively from
 * `scene.img` (the v14 primary field) and `scene._source` (the raw DataModel source)
 * to avoid those warnings entirely.
 *
 * Candidate priority:
 *   1. scene.img             — v14 primary scene image field
 *   2. _source.img           — raw img field
 *   3. _source.background.src — v12-era schema field still stored in _source
 *   4. _source.texture.src   — raw texture path
 *
 * NOTE: Never access scene.background or scene.texture directly — those are
 * deprecated getters in Foundry v14 that emit console errors on every call.
 */
export function getSceneBackgroundSource(scene) {
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
