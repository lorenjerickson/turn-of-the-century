const SYSTEM_ID = "turn-of-the-century";

function sceneCollectionContents(scenes) {
    return scenes?.contents ?? [];
}

/**
 * Return the scene flagged as the default scene, or null if none is set.
 * The default scene is shown on startup when no canvas scene is active.
 */
export function getDefaultScene(scenes = globalThis.game?.scenes) {
    return sceneCollectionContents(scenes).find(
        (scene) => Boolean(scene?.flags?.[SYSTEM_ID]?.defaultScene)
    ) ?? null;
}

/**
 * Return true if the given scene is flagged as the default scene.
 */
export function isDefaultScene(scene) {
    return Boolean(scene?.flags?.[SYSTEM_ID]?.defaultScene);
}

/**
 * Mark a scene as the default scene, clearing the flag from any other scene.
 * Only one scene can be default at a time.
 */
export async function setDefaultScene(scene, scenes = globalThis.game?.scenes) {
    if (!scene || typeof scene.update !== "function") return;

    // Clear flag from any other scenes that have it.
    const others = sceneCollectionContents(scenes).filter(
        (s) => s.id !== scene.id && Boolean(s?.flags?.[SYSTEM_ID]?.defaultScene)
    );
    await Promise.all(
        others.map((s) => s.update({ [`flags.${SYSTEM_ID}.defaultScene`]: false }))
    );

    await scene.update({ [`flags.${SYSTEM_ID}.defaultScene`]: true });
}

/**
 * Clear the default flag from a scene.
 */
export async function clearDefaultScene(scene) {
    if (!scene || typeof scene.update !== "function") return;
    await scene.update({ [`flags.${SYSTEM_ID}.defaultScene`]: false });
}
