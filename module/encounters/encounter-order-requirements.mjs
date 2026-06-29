function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

function tokenReferenceIds(token = null) {
    return [
        token?.id,
        token?._id,
        token?.document?.id,
        token?.document?._id
    ].map((id) => String(id ?? "").trim()).filter(Boolean);
}

function tokenPosition(token = null, tokenPositions = null) {
    const override = tokenReferenceIds(token)
        .map((id) => tokenPositions?.[id])
        .find(Boolean);

    return {
        x: toNumber(override?.x, toNumber(token?.x, toNumber(token?.document?.x, 0))),
        y: toNumber(override?.y, toNumber(token?.y, toNumber(token?.document?.y, 0)))
    };
}

function gridMetrics(scene = null, sourceToken = null, targetToken = null) {
    const gridSize = Math.max(1, toNumber(
        scene?.grid?.size
            ?? sourceToken?.parent?.grid?.size
            ?? targetToken?.parent?.grid?.size,
        100
    ));
    const feetPerSquare = Math.max(1, toNumber(
        scene?.grid?.distance
            ?? sourceToken?.parent?.grid?.distance
            ?? targetToken?.parent?.grid?.distance,
        5
    ));
    return { gridSize, feetPerSquare };
}

function distanceFeet(left = null, right = null, { scene = null, sourceToken = null, targetToken = null } = {}) {
    const { gridSize, feetPerSquare } = gridMetrics(scene, sourceToken, targetToken);
    return (Math.hypot(toNumber(left?.x, 0) - toNumber(right?.x, 0), toNumber(left?.y, 0) - toNumber(right?.y, 0)) / gridSize) * feetPerSquare;
}

function adjacentGridCell(left = null, right = null, { scene = null, sourceToken = null, targetToken = null } = {}) {
    const { gridSize } = gridMetrics(scene, sourceToken, targetToken);
    const dx = Math.abs(Math.round(toNumber(left?.x, 0) / gridSize) - Math.round(toNumber(right?.x, 0) / gridSize));
    const dy = Math.abs(Math.round(toNumber(left?.y, 0) / gridSize) - Math.round(toNumber(right?.y, 0) / gridSize));
    return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);
}

function actionRangeFeet(action = {}) {
    const explicitRange = toNumber(action.targetingRangeFeet, 0);
    if (explicitRange > 0) return explicitRange;

    const requirementRange = toNumber(action.positioningRequirement?.rangeFeet, 0);
    if (requirementRange > 0) return requirementRange;

    const rangeType = text(action.rangeType, "melee").toLowerCase();
    if (rangeType === "long") return 60;
    if (rangeType === "normal") return 30;
    return 5;
}

export function inferOrderPositioningRequirement(action = {}) {
    if (!action || String(action.type ?? "") === "movement") return null;

    const explicit = action.positioningRequirement && typeof action.positioningRequirement === "object"
        ? action.positioningRequirement
        : null;
    if (explicit) {
        return {
            ...explicit,
            type: text(explicit.type, "range"),
            targetKind: text(explicit.targetKind, action.targetId ? "combatant" : "location")
        };
    }

    const intentType = text(action.intentType).toLowerCase();
    const isAttackIntent = intentType === "attacktarget" || action.type === "attack" || action.requiresToHit;
    if (isAttackIntent && action.targetId) {
        return {
            type: "weaponRange",
            targetKind: "combatant",
            rangeFeet: actionRangeFeet(action)
        };
    }

    const isInteractionIntent = ["interactwithobject", "useontarget"].includes(intentType);
    if (isInteractionIntent && (action.targetId || Number.isFinite(Number(action.targetX)) || Number.isFinite(Number(action.movementTargetX)))) {
        return {
            type: "adjacent",
            targetKind: action.targetId ? "combatant" : "location",
            rangeFeet: 5
        };
    }

    return null;
}

export function evaluateOrderPositioningRequirement({
    action = {},
    sourceToken = null,
    targetToken = null,
    tokenPositions = null,
    scene = null
} = {}) {
    const requirement = inferOrderPositioningRequirement(action);
    if (!requirement) return { applies: false, satisfied: true, requirement: null };
    if (!sourceToken) return { applies: true, satisfied: false, requirement, reason: "missingSourceToken" };

    const sourcePosition = tokenPosition(sourceToken, tokenPositions);
    const targetPosition = targetToken
        ? tokenPosition(targetToken, tokenPositions)
        : {
            x: toNumber(action.targetX, toNumber(action.movementTargetX, sourcePosition.x)),
            y: toNumber(action.targetY, toNumber(action.movementTargetY, sourcePosition.y))
        };

    const requirementType = text(requirement.type, "range").toLowerCase();
    const isAdjacent = adjacentGridCell(sourcePosition, targetPosition, { scene, sourceToken, targetToken });
    const distance = distanceFeet(sourcePosition, targetPosition, { scene, sourceToken, targetToken });

    if (["adjacent", "objectreach", "allyreach"].includes(requirementType)) {
        return { applies: true, satisfied: isAdjacent, requirement, distanceFeet: distance, sourcePosition, targetPosition };
    }

    if (["weaponrange", "range", "lineofsight"].includes(requirementType)) {
        const rangeFeet = Math.max(5, toNumber(requirement.rangeFeet, actionRangeFeet(action)));
        return { applies: true, satisfied: distance <= rangeFeet, requirement: { ...requirement, rangeFeet }, distanceFeet: distance, sourcePosition, targetPosition };
    }

    return { applies: true, satisfied: false, requirement, distanceFeet: distance, sourcePosition, targetPosition };
}

export function buildImpliedMovementAction(action = {}, positioning = {}) {
    const requirement = positioning.requirement ?? inferOrderPositioningRequirement(action);
    if (!requirement) return null;

    const movementFeetPerAp = Math.max(1, toNumber(action.movementFeetPerAp, 10));
    const base = {
        id: "impliedMove",
        actionId: "impliedMove",
        type: "movement",
        label: `Position for ${text(action.label, "Action")}`,
        apCost: Math.max(1, toNumber(action.apCost, 1)),
        movementFeetPerAp,
        movementFeet: movementFeetPerAp,
        impliedForOrderId: text(action.orderId, text(action.id, "")),
        sourceAction: {
            id: action.id,
            actionId: action.actionId,
            type: action.type,
            label: action.label
        }
    };

    if (text(requirement.targetKind, "combatant") === "combatant" && action.targetId) {
        return {
            ...base,
            id: "pursue",
            actionId: "pursue",
            targetId: action.targetId,
            requiresTarget: true
        };
    }

    return {
        ...base,
        movementTargetX: toNumber(positioning.targetPosition?.x, toNumber(action.targetX, action.movementTargetX)),
        movementTargetY: toNumber(positioning.targetPosition?.y, toNumber(action.targetY, action.movementTargetY))
    };
}
