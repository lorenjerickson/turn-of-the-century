import { setDefaultScene, clearDefaultScene } from "../../seeded-scenes.mjs";

/**
 * Activates a scene in Foundry. Returns true on success, false on failure.
 *
 * @param {object} scene
 * @param {{ ui?: object, logger?: object }} options
 */
export async function activateScene(scene, { ui, logger } = {}) {
    if (!scene) {
        ui?.notifications?.warn("No scene is available to activate.");
        return false;
    }

    try {
        if (typeof scene.activate === "function") {
            await scene.activate();
        } else if (typeof scene.update === "function") {
            await scene.update({ active: true });
        } else {
            throw new Error("Scene activation is not available.");
        }
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Scene activation failed", error);
        ui?.notifications?.error("Scene activation failed - see console for details.");
        return false;
    }

    ui?.notifications?.info?.(`Activated ${scene.name ?? "scene"}.`);
    return true;
}

/**
 * Deletes a scene document. Returns `{ ok, name }` on success or `{ ok: false, error }` on failure.
 * Confirmation is the caller's responsibility.
 *
 * @param {object} scene
 * @param {{ logger?: object }} options
 */
export async function deleteScene(scene, { logger } = {}) {
    if (!scene) return { ok: false, error: "No scene is available to delete." };
    try {
        if (typeof scene.delete !== "function") throw new Error("Scene deletion is not available.");
        const name = String(scene.name ?? "scene");
        await scene.delete();
        return { ok: true, name };
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Scene delete failed", error);
        return { ok: false, error: "Scene delete failed - see console." };
    }
}

/**
 * Persists a new name to a scene document.
 * Returns `{ ok: true }` on success or `{ ok: false, error }` on failure.
 *
 * @param {object|null} scene
 * @param {string} name
 * @param {{ logger?: object, activityLogger?: object }} options
 */
export async function updateSceneName(scene, name, { logger, activityLogger } = {}) {
    const trimmedName = String(name ?? "").trim();
    if (!scene || !trimmedName) return { ok: true };
    try {
        activityLogger?.info?.("[scene-name] Auto-saving scene name", {
            sceneId: scene.id,
            oldName: scene.name,
            newName: trimmedName
        });
        await scene.update({ name: trimmedName });
        activityLogger?.info?.("[scene-name] Name saved OK", { sceneId: scene.id, name: scene.name });
        return { ok: true };
    } catch (err) {
        logger?.error?.("[turn-of-the-century] Scene name auto-save failed", err);
        activityLogger?.error?.("[scene-name] scene.update() FAILED", {
            sceneId: scene?.id,
            error: err?.message ?? String(err)
        });
        return { ok: false, error: "Scene name save failed." };
    }
}

/**
 * Sets or clears the default scene flag for a scene document.
 *
 * @param {object|null} scene
 * @param {object} scenesCollection
 * @param {boolean} isDefault
 * @param {{ logger?: object, activityLogger?: object }} options
 */
export async function toggleDefaultScene(scene, scenesCollection, isDefault, { logger, activityLogger } = {}) {
    if (!scene) return;
    try {
        activityLogger?.info?.("[default-scene] Setting default scene", {
            sceneId: scene.id,
            sceneName: scene.name,
            isDefault
        });
        if (isDefault) {
            await setDefaultScene(scene, scenesCollection);
        } else {
            await clearDefaultScene(scene);
        }
        activityLogger?.info?.("[default-scene] Default scene updated OK", { sceneId: scene.id, isDefault });
    } catch (err) {
        logger?.error?.("[turn-of-the-century] Default scene update failed", err);
        activityLogger?.error?.("[default-scene] FAILED", {
            sceneId: scene?.id,
            error: err?.message ?? String(err)
        });
    }
}
