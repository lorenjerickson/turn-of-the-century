export function refreshGmTokenVisionPreview(token, controlled, {
    game = globalThis.game,
    canvas = globalThis.canvas
} = {}) {
    if (!game?.user?.isGM || !canvas?.ready || !canvas?.scene?.tokenVision) return false;
    if (controlled && !token?.document?.sight?.enabled && !token?.sight?.enabled) return false;

    canvas.perception?.update?.({
        initializeVision: true,
        refreshVision: true
    });
    return true;
}
