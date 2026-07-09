import { setDefaultScene, clearDefaultScene } from "../../seeded-scenes.mjs";

const SCENE_TOKEN_VISION_TYPES = Object.freeze(["hero", "pawn", "villain"]);
const DEFAULT_SCENE_TOKEN_VISION_RANGE = 1;

function normalizeSceneTokenType(value = "") {
    const tokenType = String(value ?? "").trim().toLowerCase();
    return SCENE_TOKEN_VISION_TYPES.includes(tokenType) ? tokenType : "";
}

function normalizeSceneTokenVisionRange(value, fallback = DEFAULT_SCENE_TOKEN_VISION_RANGE) {
    const fallbackRange = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_SCENE_TOKEN_VISION_RANGE;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Math.max(0, fallbackRange);
    return Math.min(9999, Math.max(0, numeric));
}

function normalizeSceneTokenVisionTypeConfig(config = {}, fallback = DEFAULT_SCENE_TOKEN_VISION_RANGE) {
    return {
        enabled: config?.enabled !== false,
        range: normalizeSceneTokenVisionRange(config?.range, fallback)
    };
}

function actorDocumentTypeFromToken(token = null, actors = null) {
    const inlineType = normalizeSceneTokenType(
        token?.actor?.type
        ?? token?.document?.actor?.type
        ?? token?.actorData?.type
        ?? token?.document?.actorData?.type
    );
    if (inlineType) return inlineType;

    const actorId = String(token?.actorId ?? token?.document?.actorId ?? "").trim();
    if (!actorId) return "";

    const actor = typeof actors?.get === "function"
        ? actors.get(actorId)
        : Array.isArray(actors)
            ? actors.find((entry) => String(entry?.id ?? entry?._id ?? "") === actorId)
            : null;

    return normalizeSceneTokenType(actor?.type);
}

function uniqueTokenDocuments(tokenDocuments = []) {
    const seen = new Set();
    const resolved = [];
    for (const token of tokenDocuments) {
        const tokenDocument = token?.document ?? token;
        const tokenId = String(tokenDocument?.id ?? tokenDocument?._id ?? "").trim();
        if (!tokenDocument || !tokenId || seen.has(tokenId)) continue;
        seen.add(tokenId);
        resolved.push(tokenDocument);
    }
    return resolved;
}

function tokenDetectionModes(token = null) {
    const modes = token?.detectionModes
        ?? token?._source?.detectionModes
        ?? token?.document?.detectionModes
        ?? token?.document?._source?.detectionModes
        ?? [];
    return Array.isArray(modes) ? modes : [];
}

function tokenVisionUpdateData(token = null, range = DEFAULT_SCENE_TOKEN_VISION_RANGE) {
    const normalizedRange = normalizeSceneTokenVisionRange(range);
    const update = {
        _id: String(token?.id ?? token?._id),
        "sight.enabled": true,
        "sight.range": normalizedRange
    };

    const detectionModes = tokenDetectionModes(token);
    if (detectionModes.length) {
        const nextModes = detectionModes.map((mode) => {
            return {
                ...mode,
                enabled: true,
                range: normalizedRange
            };
        });
        update.detectionModes = nextModes;
    }

    return update;
}

export function normalizeSceneTokenVisionByType(settings = null) {
    const source = settings ?? {};
    return {
        hero: normalizeSceneTokenVisionTypeConfig(source.hero, DEFAULT_SCENE_TOKEN_VISION_RANGE),
        pawn: normalizeSceneTokenVisionTypeConfig(source.pawn, DEFAULT_SCENE_TOKEN_VISION_RANGE),
        villain: normalizeSceneTokenVisionTypeConfig(source.villain, DEFAULT_SCENE_TOKEN_VISION_RANGE)
    };
}

export function getSceneTokenVisionByType(scene = null) {
    const raw = scene?.flags?.["turn-of-the-century"]?.sceneTokenVisionByType
        ?? scene?._source?.flags?.["turn-of-the-century"]?.sceneTokenVisionByType
        ?? null;
    return normalizeSceneTokenVisionByType(raw);
}

export function buildSceneTokenVisionByTypeFlagUpdateData(settings = null) {
    return {
        "flags.turn-of-the-century.sceneTokenVisionByType": normalizeSceneTokenVisionByType(settings)
    };
}

export async function updateSceneTokenVisionByType(scene, settings = null, { logger, activityLogger } = {}) {
    if (!scene) return { ok: false, error: "No scene is available for token vision changes." };
    if (typeof scene.update !== "function") return { ok: false, error: "Scene token vision update is not available." };

    const normalized = normalizeSceneTokenVisionByType(settings);
    try {
        activityLogger?.info?.("[scene-token-vision] Updating token vision settings", {
            sceneId: scene.id,
            settings: normalized
        });
        await scene.update(buildSceneTokenVisionByTypeFlagUpdateData(normalized));
        return { ok: true, settings: normalized };
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Scene token vision setting update failed", error);
        activityLogger?.error?.("[scene-token-vision] FAILED", {
            sceneId: scene?.id,
            error: error?.message ?? String(error)
        });
        return { ok: false, error: "Scene token vision settings could not be saved." };
    }
}

export async function applySceneTokenVisionToTokensByType(
    scene,
    { tokenDocuments = [], settings = null, actors = null, allowEmpty = false } = {},
    { logger, activityLogger } = {}
) {
    if (!scene) return { ok: false, error: "No scene is available for token vision changes." };
    if (typeof scene.updateEmbeddedDocuments !== "function") {
        return { ok: false, error: "Scene token vision update is not available." };
    }

    const normalized = normalizeSceneTokenVisionByType(settings);
    const tokens = uniqueTokenDocuments(tokenDocuments);
    if (!tokens.length) {
        if (allowEmpty) {
            return {
                ok: true,
                appliedCount: 0,
                selectedCount: 0,
                skippedCount: 0
            };
        }
        return {
            ok: false,
            error: "Select one or more tokens on the scene before applying token vision."
        };
    }

    const updates = [];
    for (const token of tokens) {
        const tokenType = actorDocumentTypeFromToken(token, actors);
        const tokenConfig = tokenType ? normalized[tokenType] : null;
        if (!tokenConfig?.enabled) continue;
        updates.push(tokenVisionUpdateData(token, tokenConfig.range));
    }

    if (!updates.length) {
        if (allowEmpty) {
            return {
                ok: true,
                appliedCount: 0,
                selectedCount: tokens.length,
                skippedCount: tokens.length
            };
        }
        return {
            ok: false,
            error: "No selected tokens matched the enabled token types for vision updates."
        };
    }

    try {
        activityLogger?.info?.("[scene-token-vision] Applying token vision to selected tokens", {
            sceneId: scene.id,
            updateCount: updates.length
        });
        await scene.updateEmbeddedDocuments("Token", updates);
        return {
            ok: true,
            appliedCount: updates.length,
            selectedCount: tokens.length,
            skippedCount: Math.max(0, tokens.length - updates.length)
        };
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Token vision apply failed", error);
        activityLogger?.error?.("[scene-token-vision] apply FAILED", {
            sceneId: scene?.id,
            error: error?.message ?? String(error)
        });
        return { ok: false, error: "Selected token vision update failed." };
    }
}

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

export function normalizeSceneIlluminationLevel(value, fallback = 1) {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : Number(fallback);
    if (!Number.isFinite(resolved)) return 1;
    return Math.min(1, Math.max(0, resolved));
}

export function buildSceneIlluminationUpdateData(illuminationLevel = 1) {
    const illumination = normalizeSceneIlluminationLevel(illuminationLevel);
    return {
        "environment.darknessLevel": Number((1 - illumination).toFixed(2))
    };
}

/**
 * Persists the illumination level to a single scene document through Foundry's
 * scene environment field. Returns `{ ok: true }` on success or `{ ok: false, error }`.
 *
 * @param {object|null} scene
 * @param {number|string} illuminationLevel
 * @param {{ logger?: object, activityLogger?: object }} options
 */
export async function updateSceneIllumination(scene, illuminationLevel, { logger, activityLogger } = {}) {
    if (!scene) return { ok: false, error: "No scene is available for illumination changes." };
    if (typeof scene.update !== "function") return { ok: false, error: "Scene illumination update is not available." };

    const updateData = buildSceneIlluminationUpdateData(illuminationLevel);
    try {
        activityLogger?.info?.("[scene-illumination] Updating scene illumination", {
            sceneId: scene.id,
            illuminationLevel: normalizeSceneIlluminationLevel(illuminationLevel),
            updateData
        });
        await scene.update(updateData);
        return { ok: true };
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Scene illumination update failed", error);
        activityLogger?.error?.("[scene-illumination] FAILED", {
            sceneId: scene?.id,
            error: error?.message ?? String(error)
        });
        return { ok: false, error: "Scene illumination update failed." };
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

function resolveFogExplorationCollection(gameRef = null) {
    if (!gameRef) return null;
    return gameRef.collections?.get?.("FogExploration")
        ?? gameRef.collections?.get?.("FogExplorations")
        ?? gameRef.fogExplorations
        ?? null;
}

function resolveFogExplorationClass(foundryRef = null, collection = null) {
    return foundryRef?.documents?.FogExploration
        ?? collection?.documentClass
        ?? null;
}

function fogExplorationSceneId(document = null) {
    return String(document?.scene?.id ?? document?.scene ?? "").trim();
}

export async function resetSceneFogOfWar(scene, {
    game = globalThis.game,
    foundry = globalThis.foundry,
    canvas = globalThis.canvas,
    logger,
    activityLogger
} = {}) {
    if (!scene) return { ok: false, error: "No scene is available for fog reset." };

    const sceneId = String(scene.id ?? scene._id ?? "").trim();
    if (!sceneId) return { ok: false, error: "Scene fog reset is not available." };

    const collection = resolveFogExplorationCollection(game);
    const FogExplorationClass = resolveFogExplorationClass(foundry, collection);
    if (typeof FogExplorationClass?.deleteDocuments !== "function") {
        return { ok: false, error: "Fog reset is not available in this Foundry session." };
    }

    try {
        const fogDocuments = Array.from(collection?.contents ?? []);
        const ids = fogDocuments
            .filter((document) => fogExplorationSceneId(document) === sceneId)
            .map((document) => String(document.id ?? document._id ?? "").trim())
            .filter(Boolean);

        activityLogger?.info?.("[scene-fog] Resetting fog exploration", {
            sceneId,
            deleteCount: ids.length
        });

        if (ids.length) {
            await FogExplorationClass.deleteDocuments(ids);
        } else {
            await FogExplorationClass.deleteDocuments([], { deleteAll: true, scene: sceneId });
        }

        const canvasSceneId = String(canvas?.scene?.id ?? canvas?.scene?._id ?? "").trim();
        if (canvasSceneId === sceneId) {
            canvas.fog?.clear?.();
            canvas.perception?.update?.({
                initializeVision: true,
                refreshVision: true,
                refreshLighting: true
            });
        }

        return { ok: true, deletedCount: ids.length };
    } catch (error) {
        logger?.error?.("[turn-of-the-century] Scene fog reset failed", error);
        activityLogger?.error?.("[scene-fog] reset FAILED", {
            sceneId,
            error: error?.message ?? String(error)
        });
        return { ok: false, error: "Scene fog reset failed." };
    }
}
