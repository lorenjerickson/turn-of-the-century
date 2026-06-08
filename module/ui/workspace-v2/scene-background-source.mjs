function readPath(read) {
    try {
        return String(read() ?? "").trim();
    } catch {
        return "";
    }
}

export function getSceneBackgroundSource(scene) {
    // NOTE: scene.thumb / scene.thumbnail are Foundry-generated thumbnails (small previews),
    // not the scene background. Never fall back to those.
    const candidates = [
        () => scene?.background?.src,
        () => scene?.texture?.src,
        () => scene?._source?.background?.src,
        () => scene?._source?.texture?.src,
        () => scene?._source?.["img"]
    ];

    for (const candidate of candidates) {
        const path = readPath(candidate);
        if (path) return path;
    }

    if (globalThis.CONFIG?.debug?.totc) {
        console.debug("[totc] getSceneBackgroundSource: no background resolved", {
            sceneId: scene?.id,
            sceneName: scene?.name,
            "background.src": scene?.background?.src,
            "texture.src": scene?.texture?.src,
            "_source.background.src": scene?._source?.background?.src,
            "_source.texture.src": scene?._source?.texture?.src,
            "_source.img": scene?._source?.["img"]
        });
    }

    return "";
}
