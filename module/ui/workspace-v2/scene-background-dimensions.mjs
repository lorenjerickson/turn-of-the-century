const SCENE_BACKGROUND_GRID_DIMENSION_STEP = 50;

export function snapSceneBackgroundDimension(value = 0, { step = SCENE_BACKGROUND_GRID_DIMENSION_STEP } = {}) {
    const numeric = Number(value);
    const gridStep = Number(step);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isFinite(gridStep) || gridStep <= 0) return 0;
    return Math.max(gridStep, Math.round(numeric / gridStep) * gridStep);
}

export function normalizeSceneBackgroundDimensions(dimensions = null) {
    const width = Number(dimensions?.width ?? dimensions?.naturalWidth ?? 0);
    const height = Number(dimensions?.height ?? dimensions?.naturalHeight ?? 0);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
    return {
        width: snapSceneBackgroundDimension(width),
        height: snapSceneBackgroundDimension(height)
    };
}
