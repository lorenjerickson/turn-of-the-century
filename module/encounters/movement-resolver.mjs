import {
    findGridMovementPath,
    movementPathLength
} from "./grid-pathfinding.mjs";
import {
    buildImpliedMovementAction,
    evaluateOrderPositioningRequirement
} from "./encounter-order-requirements.mjs";

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

function gridPathPointForTick(path = [], distance = 0, { complete = false } = {}) {
    if (!path.length) return null;
    if (complete) {
        const final = path.at(-1);
        return final ? { x: toNumber(final.x, 0), y: toNumber(final.y, 0) } : null;
    }

    const targetDistance = Math.max(0, toNumber(distance, 0));
    let traversed = 0;
    let bestPoint = path[0] ?? null;
    let bestDifference = Number.POSITIVE_INFINITY;

    for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const point = path[index];
        traversed += Math.hypot(
            toNumber(point.x, 0) - toNumber(previous.x, 0),
            toNumber(point.y, 0) - toNumber(previous.y, 0)
        );

        const difference = Math.abs(traversed - targetDistance);
        if (difference <= bestDifference) {
            bestPoint = point;
            bestDifference = difference;
        }
        if (traversed >= targetDistance && difference > bestDifference) break;
    }

    return bestPoint ? { x: toNumber(bestPoint.x, 0), y: toNumber(bestPoint.y, 0) } : null;
}

function latestMovementEffectForCombatant(tickEffects = [], combatantId = "") {
    const key = String(combatantId ?? "").trim();
    if (!key) return null;
    return [...toArray(tickEffects)]
        .reverse()
        .find((effect) => String(effect?.type ?? "") === "movement" && String(effect?.combatantId ?? "") === key)
        ?? null;
}

function tokenPosition(token = null, tokenPositions = null) {
    const tokenId = String(token?.id ?? token?._id ?? "").trim();
    const override = tokenId ? tokenPositions?.[tokenId] : null;
    return {
        x: toNumber(override?.x, toNumber(token?.x, 0)),
        y: toNumber(override?.y, toNumber(token?.y, 0))
    };
}

function sameGridCell(left = null, right = null, gridSize = 100) {
    const size = Math.max(1, toNumber(gridSize, 100));
    return Math.round(toNumber(left?.x, 0) / size) === Math.round(toNumber(right?.x, 0) / size)
        && Math.round(toNumber(left?.y, 0) / size) === Math.round(toNumber(right?.y, 0) / size);
}

function adjacentGridCell(left = null, right = null, gridSize = 100) {
    const size = Math.max(1, toNumber(gridSize, 100));
    const dx = Math.abs(Math.round(toNumber(left?.x, 0) / size) - Math.round(toNumber(right?.x, 0) / size));
    const dy = Math.abs(Math.round(toNumber(left?.y, 0) / size) - Math.round(toNumber(right?.y, 0) / size));
    return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);
}

function firstAdjacentPathPoint(path = [], targetPosition = null, gridSize = 100) {
    for (let index = 1; index < path.length; index += 1) {
        const point = path[index];
        if (sameGridCell(point, targetPosition, gridSize)) return null;
        if (adjacentGridCell(point, targetPosition, gridSize)) {
            return { x: toNumber(point.x, 0), y: toNumber(point.y, 0) };
        }
    }
    return null;
}

function pathDistanceToPoint(path = [], targetPosition = null) {
    if (!path.length || !targetPosition) return Number.POSITIVE_INFINITY;

    let traversed = 0;
    for (let index = 1; index < path.length; index += 1) {
        const previous = path[index - 1];
        const point = path[index];
        traversed += Math.hypot(
            toNumber(point.x, 0) - toNumber(previous.x, 0),
            toNumber(point.y, 0) - toNumber(previous.y, 0)
        );

        if (Math.abs(toNumber(point.x, 0) - toNumber(targetPosition.x, 0)) <= Number.EPSILON
            && Math.abs(toNumber(point.y, 0) - toNumber(targetPosition.y, 0)) <= Number.EPSILON) {
            return traversed;
        }
    }

    return Number.POSITIVE_INFINITY;
}

function movementStepPixels({ action = null, token = null, targetToken = null, scene = null, fallbackFeetPerAp = 10 } = {}) {
    const gridSize = Number(
        token?.parent?.grid?.size
        ?? targetToken?.parent?.grid?.size
        ?? scene?.grid?.size
        ?? 100
    ) || 100;
    const feetPerSquare = Number(
        token?.parent?.grid?.distance
        ?? targetToken?.parent?.grid?.distance
        ?? scene?.grid?.distance
        ?? 5
    ) || 5;
    const stepFeet = Math.max(1, toNumber(action?.movementFeetPerAp, fallbackFeetPerAp || 10));
    return (stepFeet / feetPerSquare) * gridSize;
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

        const currentPosition = tokenPosition(token, tokenPositions);
        const scene = token?.parent?.walls
            ? token.parent
            : (this.#getScene() ?? token?.parent ?? null);
        const gridSize = Number(
            token?.parent?.grid?.size
            ?? scene?.grid?.size
            ?? 100
        ) || 100;

        let targetX = toNumber(action.movementTargetX, toNumber(currentPosition.x, 0));
        let targetY = toNumber(action.movementTargetY, toNumber(currentPosition.y, 0));
        let relativeTargetPosition = null;

        const movementMode = String(action.id ?? action.actionId ?? "").toLowerCase();
        if (movementMode === "pursue" || movementMode === "avoid" || movementMode === "evade" || movementMode === "follow") {
            const targetCombatant = this.#resolveDeclaredTarget(combatant.id, action.targetId);
            const targetToken = targetCombatant ? this.#resolveTokenDocument(targetCombatant) : null;
            if (!targetCombatant || !targetToken) {
                return null;
            }

            const targetMovementEffect = latestMovementEffectForCombatant(tickEffects, targetCombatant.id);
            const startingTargetPosition = tokenPosition(targetToken, tokenPositions);
            const targetPosition = targetMovementEffect
                ? { x: toNumber(targetMovementEffect.x, 0), y: toNumber(targetMovementEffect.y, 0) }
                : startingTargetPosition;
            relativeTargetPosition = targetPosition;

            if (movementMode === "pursue") {
                targetX = toNumber(targetPosition.x, targetX);
                targetY = toNumber(targetPosition.y, targetY);

            } else if (movementMode === "follow") {
                targetX = toNumber(targetPosition.x, targetX);
                targetY = toNumber(targetPosition.y, targetY);

            } else {
                const dx = toNumber(currentPosition.x, 0) - toNumber(targetPosition.x, 0);
                const dy = toNumber(currentPosition.y, 0) - toNumber(targetPosition.y, 0);
                const distance = Math.hypot(dx, dy);
                if (distance <= Number.EPSILON) return null;

                const stepPixels = movementStepPixels({
                    action,
                    token,
                    targetToken,
                    scene,
                    fallbackFeetPerAp: this.#getMovementFeetPerAp()
                });
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

        const path = findGridMovementPath({
            start: { x: currentX, y: currentY },
            target: { x: targetX, y: targetY },
            scene
        });
        const pathLength = movementPathLength(path);
        if (path.length < 2 || pathLength <= Number.EPSILON) return null;

        if ((movementMode === "pursue" || movementMode === "follow") && relativeTargetPosition) {
            if (adjacentGridCell(currentPosition, relativeTargetPosition, gridSize)) return null;
            const adjacentPosition = firstAdjacentPathPoint(path, relativeTargetPosition, gridSize);
            if (adjacentPosition) {
                const stepPixels = movementStepPixels({
                    action,
                    token,
                    scene,
                    fallbackFeetPerAp: this.#getMovementFeetPerAp()
                });
                const stopDistance = pathDistanceToPoint(path, adjacentPosition);
                if (stopDistance > stepPixels) {
                    const cappedPosition = gridPathPointForTick(path, stepPixels, { complete: false });
                    return cappedPosition
                        ? {
                            tokenId,
                            x: cappedPosition.x,
                            y: cappedPosition.y
                        }
                        : null;
                }

                return {
                    tokenId,
                    ...adjacentPosition
                };
            }
        }

        const nextPosition = gridPathPointForTick(path, pathLength / stepDivisor, {
            complete: remainingSteps === 0
        });
        if (!nextPosition) return null;

        return {
            tokenId,
            x: nextPosition.x,
            y: nextPosition.y
        };
    }

    evaluateOrderPositioning({ combatant = null, action = null, tokenPositions = null, tickEffects = [] } = {}) {
        if (!combatant || !action || String(action.type ?? "") === "movement") {
            return { applies: false, satisfied: true, movementEffect: null, movementAction: null };
        }

        const sourceToken = this.#resolveTokenDocument(combatant);
        const targetCombatant = action.targetId
            ? this.#resolveDeclaredTarget(combatant.id, action.targetId)
            : null;
        const targetToken = targetCombatant
            ? this.#resolveTokenDocument(targetCombatant)
            : null;
        const scene = sourceToken?.parent?.walls
            ? sourceToken.parent
            : (this.#getScene() ?? sourceToken?.parent ?? targetToken?.parent ?? null);
        const targetMovementEffect = targetCombatant
            ? latestMovementEffectForCombatant(tickEffects, targetCombatant.id)
            : null;
        const effectiveTokenPositions = targetMovementEffect?.tokenId
            ? {
                ...(tokenPositions ?? {}),
                [targetMovementEffect.tokenId]: {
                    x: toNumber(targetMovementEffect.x, 0),
                    y: toNumber(targetMovementEffect.y, 0)
                }
            }
            : tokenPositions;
        const positioning = evaluateOrderPositioningRequirement({
            action,
            sourceToken,
            targetToken,
            tokenPositions: effectiveTokenPositions,
            scene
        });

        if (!positioning.applies || positioning.satisfied) {
            return {
                ...positioning,
                targetCombatant,
                tokenPositions: effectiveTokenPositions,
                movementEffect: null,
                movementAction: null
            };
        }

        const movementAction = buildImpliedMovementAction(action, positioning);
        const movementEffect = movementAction
            ? this.planMovement({
                combatant,
                action: movementAction,
                tokenPositions: effectiveTokenPositions,
                tickEffects
            })
            : null;

        return {
            ...positioning,
            targetCombatant,
            tokenPositions: effectiveTokenPositions,
            movementEffect,
            movementAction
        };
    }
}
