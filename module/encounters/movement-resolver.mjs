import {
    findGridMovementPath,
    movementPathLength,
    pointAlongMovementPath
} from "./grid-pathfinding.mjs";

// ---------------------------------------------------------------------------
// Pure utilities (local copies — no shared module dependency)
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampActionCost(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : 1;
}

// ---------------------------------------------------------------------------

/**
 * Resolves the intended movement step for a single combatant action during
 * encounter resolution.
 *
 * All inputs are plain data. Foundry document access is provided through
 * explicit ports in the constructor rather than accessed directly. The
 * pathfinding functions ({@link findGridMovementPath}, etc.) are imported
 * from {@link module:grid-pathfinding} which is itself a pure module.
 *
 * @example
 * ```js
 * const resolver = new MovementResolver({
 *   resolveTokenDocument: (combatant) => getCombatantToken(combatant),
 *   resolveDeclaredTarget: (sourceId, targetId) => combat.combatants.get(targetId),
 *   getMovementFeetPerAp: () => game.settings.get("turn-of-the-century", "encounterMovementFeetPerAp"),
 *   getScene: () => canvas?.scene ?? null
 * });
 *
 * const effect = resolver.planMovement({ combatant, action, tokenPositions, tickEffects });
 * // effect is { tokenId, x, y } or null
 * ```
 */
export class MovementResolver {
    /** @type {(combatant: object) => object|null} */
    #resolveTokenDocument;

    /** @type {(sourceCombatantId: string, targetCombatantId: string) => object|null} */
    #resolveDeclaredTarget;

    /** @type {() => number} */
    #getMovementFeetPerAp;

    /** @type {() => object|null} */
    #getScene;

    /**
     * @param {{
     *   resolveTokenDocument:  (combatant: object) => object|null,
     *   resolveDeclaredTarget: (sourceCombatantId: string, targetCombatantId: string) => object|null,
     *   getMovementFeetPerAp:  () => number,
     *   getScene:              () => object|null
     * }} ports
     */
    constructor({ resolveTokenDocument, resolveDeclaredTarget, getMovementFeetPerAp, getScene }) {
        this.#resolveTokenDocument = resolveTokenDocument;
        this.#resolveDeclaredTarget = resolveDeclaredTarget;
        this.#getMovementFeetPerAp = getMovementFeetPerAp;
        this.#getScene = getScene;
    }

    /**
     * Compute the next position for a movement action during resolution.
     *
     * Handles all movement modes (absolute, pursue, follow, avoid/evade) and
     * uses A* pathfinding from {@link findGridMovementPath} to respect walls.
     * Multi-AP actions are stepped proportionally based on `_runtimeProgress`.
     *
     * @param {{
     *   combatant:      object,
     *   action:         object,
     *   tokenPositions: Record<string, {x: number, y: number}>|null,
     *   tickEffects:    object[]
     * }} options
     *
     * @returns {{ tokenId: string, x: number, y: number }|null}
     *   The intended end-position for this tick, or `null` when movement is
     *   impossible (no token, no path, self-avoidance, etc.).
     */
    planMovement({ combatant = null, action = null, tokenPositions = null, tickEffects = [] } = {}) {
        if (!combatant || !action) return null;
        if (String(action.type ?? "") !== "movement") return null;

        const token = this.#resolveTokenDocument(combatant);
        if (!token) return null;

        const tokenId = String(token.id ?? token._id ?? "").trim();
        if (!tokenId) return null;

        const currentPosition = tokenPositions?.[tokenId] ?? {
            x: toNumber(token.x, 0),
            y: toNumber(token.y, 0)
        };

        let targetX = toNumber(action.movementTargetX, toNumber(currentPosition.x, 0));
        let targetY = toNumber(action.movementTargetY, toNumber(currentPosition.y, 0));

        const movementMode = String(action.id ?? action.actionId ?? "").toLowerCase();
        if (movementMode === "pursue" || movementMode === "avoid" || movementMode === "follow") {
            const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
            const targetToken = targetCombatant ? this.#resolveTokenDocument(targetCombatant) : null;
            if (!targetCombatant || !targetToken) {
                return null;
            }

            const targetTokenId = String(targetToken.id ?? targetToken._id ?? "").trim();
            const targetPosition = targetTokenId
                ? tokenPositions?.[targetTokenId] ?? {
                    x: toNumber(targetToken.x, 0),
                    y: toNumber(targetToken.y, 0)
                }
                : {
                    x: toNumber(targetToken.x, 0),
                    y: toNumber(targetToken.y, 0)
                };

            if (movementMode === "pursue") {
                targetX = toNumber(targetPosition.x, targetX);
                targetY = toNumber(targetPosition.y, targetY);

            } else if (movementMode === "follow") {
                const mirroredTargetEffect = toArray(tickEffects)
                    .filter((effect) => String(effect?.type ?? "") === "movement")
                    .find((effect) => String(effect?.combatantId ?? "") === String(targetCombatant.id ?? ""));

                const targetPosForMirror = mirroredTargetEffect
                    ? {
                        x: toNumber(mirroredTargetEffect.x, targetPosition.x),
                        y: toNumber(mirroredTargetEffect.y, targetPosition.y)
                    }
                    : targetPosition;

                // Lazily initialize the offset on first step of a follow action.
                if (!Number.isFinite(action._followOffsetX) || !Number.isFinite(action._followOffsetY)) {
                    action._followOffsetX = toNumber(currentPosition.x, 0) - toNumber(targetPosition.x, 0);
                    action._followOffsetY = toNumber(currentPosition.y, 0) - toNumber(targetPosition.y, 0);
                }

                targetX = toNumber(targetPosForMirror.x, targetX) + toNumber(action._followOffsetX, 0);
                targetY = toNumber(targetPosForMirror.y, targetY) + toNumber(action._followOffsetY, 0);

            } else {
                // avoid — move directly away from target at the configured step rate.
                const dx = toNumber(currentPosition.x, 0) - toNumber(targetPosition.x, 0);
                const dy = toNumber(currentPosition.y, 0) - toNumber(targetPosition.y, 0);
                const distance = Math.hypot(dx, dy);
                if (distance <= Number.EPSILON) return null;

                const gridSize = Number(
                    token?.parent?.grid?.size
                    ?? targetToken?.parent?.grid?.size
                    ?? this.#getScene()?.grid?.size
                    ?? 100
                ) || 100;
                const feetPerSquare = Number(
                    token?.parent?.grid?.distance
                    ?? targetToken?.parent?.grid?.distance
                    ?? this.#getScene()?.grid?.distance
                    ?? 5
                ) || 5;
                const stepFeet = Math.max(1, toNumber(action.movementFeetPerAp, this.#getMovementFeetPerAp() || 10));
                const stepPixels = (stepFeet / feetPerSquare) * gridSize;
                const ux = dx / distance;
                const uy = dy / distance;

                targetX = toNumber(currentPosition.x, 0) + (ux * stepPixels);
                targetY = toNumber(currentPosition.y, 0) + (uy * stepPixels);
            }
        }

        // Determine how many AP ticks remain in this multi-AP action and compute
        // the fraction of the path to traverse this tick.
        const cost = Math.max(1, clampActionCost(action.apCost ?? 1));
        const currentProgress = Math.max(1, Math.min(cost, clampActionCost(action._runtimeProgress ?? 1)));
        const remainingSteps = Math.max(0, cost - currentProgress);
        const stepDivisor = remainingSteps + 1;

        const currentX = toNumber(currentPosition.x, 0);
        const currentY = toNumber(currentPosition.y, 0);

        // Prefer the token's embedded scene; fall back to the injected scene getter
        // (which covers the canvas.scene fallback path without accessing the global directly).
        const scene = token?.parent?.walls
            ? token.parent
            : (this.#getScene() ?? token?.parent ?? null);

        const path = findGridMovementPath({
            start: { x: currentX, y: currentY },
            target: { x: targetX, y: targetY },
            scene
        });
        const pathLength = movementPathLength(path);
        if (path.length < 2 || pathLength <= Number.EPSILON) return null;

        const nextPosition = pointAlongMovementPath(path, pathLength / stepDivisor);
        if (!nextPosition) return null;

        return {
            tokenId,
            x: nextPosition.x,
            y: nextPosition.y
        };
    }
}
