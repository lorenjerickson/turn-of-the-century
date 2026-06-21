function tokenDocument(token) {
    return token?.document ?? token ?? null;
}

function tokenPlaceable(token) {
    const document = tokenDocument(token);
    return token?.document ? token : document?.object ?? null;
}

/**
 * Animate a planning path on this client without persisting or broadcasting
 * TokenDocument coordinates.
 */
export async function applyLocalPlanningTokenPath(token, path = [], {
    canvas = globalThis.canvas
} = {}) {
    const document = tokenDocument(token);
    const placeable = tokenPlaceable(token);
    if (!document?.updateSource) return false;

    for (const waypoint of path.slice(1)) {
        const position = {
            x: Number(waypoint?.x ?? document.x ?? 0),
            y: Number(waypoint?.y ?? document.y ?? 0)
        };
        if (typeof placeable?.animate === "function") {
            await placeable.animate(position, { name: "totc-planning-preview" });
        }
        document.updateSource(position);
        placeable?.renderFlags?.set?.({ refreshPosition: true });
    }
    if (path.length > 1) {
        canvas?.perception?.update?.({ initializeVision: true, refreshVision: true });
    }
    return true;
}
