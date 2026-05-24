/**
 * Design Issues Scanner
 *
 * Inspects the active scene, a list of world actors, and the active combat
 * for common preparation gaps. All inputs are plain objects or Foundry
 * document instances — no global access occurs here.
 *
 * The scanner is intentionally free of Foundry globals so it can be unit
 * tested in isolation with plain mock objects.
 */

const FOUNDRY_DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";

// ---------------------------------------------------------------------------
// Collection helpers — work with both Foundry EmbeddedCollection and arrays
// ---------------------------------------------------------------------------

function collectionSize(collection) {
    if (!collection) return 0;
    if (typeof collection.size === "number") return collection.size;
    if (Array.isArray(collection)) return collection.length;
    if (Array.isArray(collection.contents)) return collection.contents.length;
    return 0;
}

function collectionContents(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    return [];
}

// ---------------------------------------------------------------------------
// Actor helpers
// ---------------------------------------------------------------------------

function isMissingPortrait(img) {
    if (!img || typeof img !== "string") return true;
    const trimmed = img.trim();
    return trimmed === "" || trimmed === FOUNDRY_DEFAULT_ACTOR_IMAGE;
}

function actorHasProfession(actor) {
    const items = collectionContents(actor.items);
    return items.some((item) => String(item.type ?? "") === "profession");
}

// ---------------------------------------------------------------------------
// Scene issues
// ---------------------------------------------------------------------------

function scanSceneIssues(scene) {
    if (!scene) return [];

    const issues = [];
    const sceneId = String(scene.id ?? "");
    const sceneName = String(scene.name ?? "Unnamed Scene");

    // No background image — background.src in v11+, img fallback for older shapes
    const backgroundSrc = String(scene.background?.src ?? scene.img ?? "").trim();
    if (!backgroundSrc) {
        issues.push({
            id: "scene.no-background",
            category: "scene",
            severity: "warning",
            title: "Scene has no background image",
            detail: `"${sceneName}" has no background image set. Scenes without a background appear as an empty canvas.`,
            subjectId: sceneId,
            subjectType: "Scene",
            navigateAction: "navigate.scene.config"
        });
    }

    // No walls at all
    if (collectionSize(scene.walls) === 0) {
        issues.push({
            id: "scene.no-walls",
            category: "scene",
            severity: "info",
            title: "Scene has no walls defined",
            detail: `"${sceneName}" has no wall segments. Without walls, vision and lighting pass through all surfaces.`,
            subjectId: sceneId,
            subjectType: "Scene",
            navigateAction: "navigate.scene.walls"
        });
    }

    // Scene is dark but has no light sources placed
    const darkness = Number(scene.darkness ?? 0);
    if (darkness > 0 && collectionSize(scene.lights) === 0) {
        issues.push({
            id: "scene.dark-no-lights",
            category: "scene",
            severity: "warning",
            title: "Scene is dark but has no light sources",
            detail: `"${sceneName}" has darkness set to ${Math.round(darkness * 100)}% with no placed light sources. Tokens without darkvision will be sightless.`,
            subjectId: sceneId,
            subjectType: "Scene",
            navigateAction: "navigate.scene.lights"
        });
    }

    // Token checks — only meaningful when the scene carries token data
    const tokenCount = collectionSize(scene.tokens);
    const tokens = collectionContents(scene.tokens);

    if (tokenCount === 0) {
        // No tokens placed at all
        issues.push({
            id: "scene.no-tokens",
            category: "scene",
            severity: "info",
            title: "No tokens are placed in this scene",
            detail: `"${sceneName}" has no tokens placed. Stage actors and hazards before running this scene.`,
            subjectId: sceneId,
            subjectType: "Scene",
            navigateAction: "navigate.scene.tokens"
        });
    } else {
        // Tokens exist — check for player ownership and individual vision settings

        const hasPlayerToken = tokens.some((token) => Boolean(token.hasPlayerOwner));
        if (!hasPlayerToken) {
            issues.push({
                id: "scene.no-player-tokens",
                category: "scene",
                severity: "warning",
                title: "No player character tokens are placed in this scene",
                detail: `"${sceneName}" has no tokens owned by players. Players will have no point of view when this scene is active.`,
                subjectId: sceneId,
                subjectType: "Scene",
                navigateAction: "navigate.scene.tokens"
            });
        }

        for (const token of tokens) {
            const visionEnabled = Boolean(token.sight?.enabled);
            if (!visionEnabled) {
                const tokenId = String(token.id ?? "");
                const tokenName = String((token.name ?? tokenId) || "Unknown Token");
                issues.push({
                    id: `scene.token-no-vision.${tokenId || tokenName}`,
                    category: "scene",
                    severity: "info",
                    title: `${tokenName} has vision disabled`,
                    detail: `This token cannot perceive the scene. Enable vision on ${tokenName} if it should observe its surroundings.`,
                    subjectId: tokenId,
                    subjectType: "Token",
                    navigateAction: "navigate.scene.tokens"
                });
            }
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Actor issues
// ---------------------------------------------------------------------------

function scanActorIssues(actors) {
    if (!Array.isArray(actors) || actors.length === 0) return [];

    const issues = [];

    for (const actor of actors) {
        const actorId = String(actor.id ?? "");
        const actorName = String(actor.name ?? "Unnamed Actor");
        const actorType = String(actor.type ?? "");

        // Missing portrait — applies to all actor types
        if (isMissingPortrait(actor.img)) {
            issues.push({
                id: `actor.no-portrait.${actorId}`,
                category: "actor",
                severity: "info",
                title: `${actorName} has no portrait`,
                detail: `This ${actorType} has no portrait image. Portraits aid player recognition and lend presence to characters in the narrative.`,
                subjectId: actorId,
                subjectType: "Actor",
                navigateAction: "navigate.actor"
            });
        }

        // Hero with no profession — professions drive skills, advancement, and starting gear
        if (actorType === "hero" && !actorHasProfession(actor)) {
            issues.push({
                id: `actor.no-profession.${actorId}`,
                category: "actor",
                severity: "warning",
                title: `${actorName} has no profession assigned`,
                detail: "This hero has no profession. Professions provide skills, an advancement path, and starting equipment appropriate to the period.",
                subjectId: actorId,
                subjectType: "Actor",
                navigateAction: "navigate.actor"
            });
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Encounter issues
// ---------------------------------------------------------------------------

function scanEncounterIssues(combat) {
    if (!combat) return [];

    const issues = [];
    const combatants = collectionContents(combat.combatants);

    for (const combatant of combatants) {
        const combatantId = String(combatant.id ?? "");
        const combatantName = String(
            combatant.name
            ?? combatant.token?.name
            ?? combatant.actor?.name
            ?? "Unknown Combatant"
        );
        const initiative = combatant.initiative;

        if (initiative === null || initiative === undefined) {
            issues.push({
                id: `encounter.no-initiative.${combatantId}`,
                category: "encounter",
                severity: "warning",
                title: `${combatantName} has not rolled initiative`,
                detail: "This combatant has no initiative value. The encounter cannot resolve turns until every participant has rolled.",
                subjectId: combatantId,
                subjectType: "Combatant",
                navigateAction: "navigate.combat"
            });
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DesignIssue
 * @property {string}      id             - Unique stable key for this issue, e.g. "actor.no-portrait.abc123".
 * @property {string}      category       - "scene" | "actor" | "encounter"
 * @property {"warning"|"info"} severity  - Visual severity level.
 * @property {string}      title          - Short GM-facing description.
 * @property {string}      detail         - Longer explanation of the consequence.
 * @property {string}      subjectId      - Foundry document id of the affected entity.
 * @property {string}      subjectType    - "Scene" | "Actor" | "Combatant"
 * @property {string|null} navigateAction - Action id for click-to-navigate, or null.
 */

/**
 * Scan for design issues in the active scene, a set of world actors, and
 * the active combat encounter.
 *
 * Inputs may be Foundry document instances or plain objects with equivalent
 * shape — no Foundry globals are accessed.
 *
 * @param {object}      opts
 * @param {object|null} opts.scene   - The active/viewed scene, or null.
 * @param {object[]}    opts.actors  - World actors to inspect (all types).
 * @param {object|null} opts.combat  - The active combat, or null.
 * @returns {DesignIssue[]}
 */
export function scanDesignIssues({ scene = null, actors = [], combat = null } = {}) {
    return [
        ...scanSceneIssues(scene),
        ...scanActorIssues(actors),
        ...scanEncounterIssues(combat)
    ];
}
