export function buildRestoredMapViewportTransform({
    saved = null,
    viewportWidth = 1,
    viewportHeight = 1,
    imageWidth = 1,
    imageHeight = 1,
    minScale = 1
} = {}) {
    const scale = Number.isFinite(saved?.scale) && saved.scale > 0
        ? saved.scale
        : minScale;
    const centerX = Number.isFinite(saved?.centerX)
        ? saved.centerX
        : imageWidth / 2;
    const centerY = Number.isFinite(saved?.centerY)
        ? saved.centerY
        : imageHeight / 2;

    return {
        scale,
        offsetX: (viewportWidth / 2) - (centerX * scale),
        offsetY: (viewportHeight / 2) - (centerY * scale)
    };
}

export function buildPersistedMapViewportState({
    scale = 1,
    offsetX = 0,
    offsetY = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    imageWidth = 1,
    imageHeight = 1
} = {}) {
    const numericScale = Number(scale);
    if (!Number.isFinite(numericScale) || numericScale <= 0) return null;

    return {
        scale: numericScale,
        centerX: clamp(((viewportWidth / 2) - offsetX) / numericScale, 0, imageWidth),
        centerY: clamp(((viewportHeight / 2) - offsetY) / numericScale, 0, imageHeight)
    };
}

function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
}
