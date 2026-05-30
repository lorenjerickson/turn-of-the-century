/**
 * Design Issues Scanner
 *
 * Inspects the active scene, world actors, and active combat for common
 * preparation gaps. Inputs are plain objects or Foundry document instances;
 * no Foundry globals are accessed here.
 */

const FOUNDRY_DEFAULT_ACTOR_IMAGE = "icons/svg/mystery-man.svg";

/**
 * @typedef {object} DesignIssue
 * @property {string}      id             - Unique stable key for this issue.
 * @property {string}      category       - "scene" | "actor" | "encounter"
 * @property {"warning"|"info"} severity  - Visual severity level.
 * @property {string}      title          - Short GM-facing description.
 * @property {string}      detail         - Longer explanation of the consequence.
 * @property {string}      subjectId      - Foundry document id of the affected entity.
 * @property {string}      subjectType    - "Scene" | "Actor" | "Combatant" | "Token"
 * @property {string|null} navigateAction - Action id for click-to-navigate, or null.
 */

export class DesignIssueScanner {
    scan({ scene = null, actors = [], combat = null } = {}) {
        return [
            ...this.scanSceneIssues(scene),
            ...this.scanActorIssues(actors),
            ...this.scanEncounterIssues(combat)
        ];
    }

    scanSceneIssues(scene) {
        if (!scene) return [];

        const issues = [];
        const sceneId = String(scene.id ?? "");
        const sceneName = String(scene.name ?? "Unnamed Scene");

        if (!this.#sceneBackgroundSource(scene)) {
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

        if (this.#collectionSize(scene.walls) === 0) {
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

        const darkness = this.#sceneDarknessLevel(scene);
        if (darkness > 0 && this.#collectionSize(scene.lights) === 0) {
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

        const tokenCount = this.#collectionSize(scene.tokens);
        const tokens = this.#collectionContents(scene.tokens);
        if (tokenCount === 0) {
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
            this.#pushTokenIssues({ issues, tokens, sceneId, sceneName });
        }

        return issues;
    }

    scanActorIssues(actors) {
        if (!Array.isArray(actors) || actors.length === 0) return [];

        const issues = [];
        for (const actor of actors) this.#pushActorIssues(issues, actor);
        return issues;
    }

    scanEncounterIssues(combat) {
        if (!combat) return [];

        const issues = [];
        for (const combatant of this.#collectionContents(combat.combatants)) {
            const combatantId = String(combatant.id ?? "");
            const combatantName = String(
                combatant.name
                ?? combatant.token?.name
                ?? combatant.actor?.name
                ?? "Unknown Combatant"
            );

            if (combatant.initiative === null || combatant.initiative === undefined) {
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

    #pushActorIssues(issues, actor) {
        const actorId = String(actor.id ?? "");
        const actorName = String(actor.name ?? "Unnamed Actor");
        const actorType = String(actor.type ?? "");

        if (this.#isMissingPortrait(actor.img)) {
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

        if (actorType === "hero" && !this.#actorHasProfession(actor)) {
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

    #pushTokenIssues({ issues, tokens, sceneId, sceneName }) {
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
            if (token.sight?.enabled) continue;

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

    #sceneBackgroundSource(scene) {
        // Use Level API for background (Foundry v14+)
        if (scene?.levels && Array.isArray(scene.levels) && scene.levels.length > 0) {
            return String(scene.levels[0]?.background?.src ?? scene.levels[0]?.textures?.background?.src ?? "").trim();
        }
        // Fallback for legacy/compat
        return String(scene.background?.src ?? scene._source?.background?.src ?? scene._source?.img ?? "").trim();
    }

    #sceneDarknessLevel(scene) {
        const environmentDarkness = Number(scene?.environment?.darknessLevel);
        if (Number.isFinite(environmentDarkness)) return environmentDarkness;

        const sourceEnvironmentDarkness = Number(scene?._source?.environment?.darknessLevel);
        if (Number.isFinite(sourceEnvironmentDarkness)) return sourceEnvironmentDarkness;

        const legacySourceDarkness = Number(scene?._source?.darkness);
        if (Number.isFinite(legacySourceDarkness)) return legacySourceDarkness;

        return 0;
    }

    #isMissingPortrait(img) {
        if (!img || typeof img !== "string") return true;
        const trimmed = img.trim();
        return trimmed === "" || trimmed === FOUNDRY_DEFAULT_ACTOR_IMAGE;
    }

    #actorHasProfession(actor) {
        return this.#collectionContents(actor.items).some((item) => String(item.type ?? "") === "profession");
    }

    #collectionSize(collection) {
        if (!collection) return 0;
        if (typeof collection.size === "number") return collection.size;
        if (Array.isArray(collection)) return collection.length;
        if (Array.isArray(collection.contents)) return collection.contents.length;
        return 0;
    }

    #collectionContents(collection) {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection;
        if (Array.isArray(collection.contents)) return collection.contents;
        return [];
    }
}

export function scanDesignIssues({ scene = null, actors = [], combat = null } = {}) {
    return new DesignIssueScanner().scan({ scene, actors, combat });
}
