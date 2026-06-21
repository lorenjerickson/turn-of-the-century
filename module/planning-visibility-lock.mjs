const CONCEALED_PHASES = new Set(["planning", "locked"]);

function combatSceneId(combat) {
    return String(combat?.scene?.id ?? combat?.sceneId ?? "").trim();
}

function encounterPhase(combat) {
    return String(combat?.phase ?? combat?.encounterState?.phase ?? "").trim();
}

function encounterRound(combat) {
    return Number(combat?.encounterState?.round ?? combat?.round ?? 0) || 0;
}

function tokenId(token) {
    return String(token?.document?.id ?? token?.id ?? "").trim();
}

/**
 * Preserve each player's token-visibility knowledge while an encounter plan is
 * being assembled. Walls and fog may update normally, but tokens which were not
 * visible when planning began remain locally concealed until resolution starts.
 */
export class PlanningVisibilityLock {
    #game;

    #canvas;

    #key = "";

    #sceneId = "";

    #concealedTokenIds = new Set();

    constructor({
        game = globalThis.game,
        canvas = globalThis.canvas
    } = {}) {
        this.#game = game;
        this.#canvas = canvas;
    }

    get active() {
        return Boolean(this.#key);
    }

    get concealedTokenIds() {
        return new Set(this.#concealedTokenIds);
    }

    get game() {
        return this.#game ?? globalThis.game;
    }

    get canvas() {
        return this.#canvas ?? globalThis.canvas;
    }

    sync(combat = this.game?.combat ?? null) {
        if (!this.#canUseVisionLock(combat)) {
            this.release();
            return false;
        }

        const phase = encounterPhase(combat);
        if (!CONCEALED_PHASES.has(phase)) {
            this.release();
            return false;
        }

        const key = `${combat.id}:${encounterRound(combat)}`;
        if (!this.active) {
            this.#capture(combat, key);
        } else if (this.#key !== key) {
            this.release();
            this.#capture(combat, key);
        }

        this.enforce();
        return true;
    }

    enforce() {
        if (!this.active || String(this.canvas?.scene?.id ?? "") !== this.#sceneId) return 0;

        let concealed = 0;
        for (const token of this.canvas?.tokens?.placeables ?? []) {
            if (this.enforceToken(token)) concealed += 1;
        }
        return concealed;
    }

    enforceToken(token) {
        if (!this.active || String(this.canvas?.scene?.id ?? "") !== this.#sceneId) return false;
        if (!this.#concealedTokenIds.has(tokenId(token))) return false;
        token.visible = false;
        return true;
    }

    release({ refresh = true } = {}) {
        const wasActive = this.active;
        this.#key = "";
        this.#sceneId = "";
        this.#concealedTokenIds.clear();

        if (wasActive && refresh && this.canvas?.ready) {
            this.canvas.perception?.update?.({ refreshVision: true });
        }
        return wasActive;
    }

    #canUseVisionLock(combat) {
        if (this.game?.user?.isGM) return false;
        if (!combat?.id || !this.canvas?.ready || !this.canvas?.scene?.tokenVision) return false;
        const sceneId = combatSceneId(combat);
        return Boolean(sceneId && sceneId === String(this.canvas.scene.id ?? ""));
    }

    #capture(combat, key) {
        this.#key = key;
        this.#sceneId = combatSceneId(combat);
        this.#concealedTokenIds = new Set(
            (this.canvas?.tokens?.placeables ?? [])
                .filter((token) => token?.visible === false)
                .map(tokenId)
                .filter(Boolean)
        );
    }
}
