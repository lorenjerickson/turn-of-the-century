function readPath(read) {
    try {
        return String(read() ?? "").trim();
    } catch {
        return "";
    }
}

export function getSceneBackgroundSource(scene) {
    const candidates = [
        () => scene?._source?.background?.src,
        () => scene?._source?.texture?.src,
        () => scene?._source?.["img"],
        () => scene?.background?.src,
        () => scene?.texture?.src,
        () => scene?.thumb,
        () => scene?.thumbnail?.src
    ];

    for (const candidate of candidates) {
        const path = readPath(candidate);
        if (path) return path;
    }

    return "";
}
