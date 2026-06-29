import { collectTokenReferenceIds } from "../../encounters/combatant-token-matching.mjs";

function numberOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function tokenCenter(token = null, gridSize = 100) {
    const x = numberOr(token?.x ?? token?.document?.x, 0);
    const y = numberOr(token?.y ?? token?.document?.y, 0);
    const width = positiveNumber(token?.width ?? token?.document?.width, 1) * gridSize;
    const height = positiveNumber(token?.height ?? token?.document?.height, 1) * gridSize;
    return {
        x: x + (width / 2),
        y: y + (height / 2)
    };
}

function tokenBounds(token = null, gridSize = 100) {
    const x = numberOr(token?.x ?? token?.document?.x, 0);
    const y = numberOr(token?.y ?? token?.document?.y, 0);
    return {
        x,
        y,
        width: positiveNumber(token?.width ?? token?.document?.width, 1) * gridSize,
        height: positiveNumber(token?.height ?? token?.document?.height, 1) * gridSize
    };
}

function tokenContainsPoint(token = null, point = null, gridSize = 100) {
    if (!token || !point) return false;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    if (typeof token.containsPoint === "function" && token.containsPoint(point)) return true;
    if (typeof token.bounds?.contains === "function" && token.bounds.contains(x, y)) return true;
    if (typeof token.getBounds === "function") {
        const bounds = token.getBounds();
        if (typeof bounds?.contains === "function" && bounds.contains(x, y)) return true;
    }
    if (typeof token.hitArea?.contains === "function") {
        const localPoint = typeof token.toLocal === "function" ? token.toLocal(point) : point;
        if (token.hitArea.contains(Number(localPoint?.x), Number(localPoint?.y))) return true;
    }

    const bounds = tokenBounds(token, gridSize);
    if (x < bounds.x || x > bounds.x + bounds.width) return false;
    return y >= bounds.y && y <= bounds.y + bounds.height;
}

export function findEncounterTargetTokenAtPoint({
    tokens = [],
    targetTokenIds = [],
    point = null,
    gridSize = 100
} = {}) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
    const eligible = new Set(targetTokenIds.map((id) => String(id)));
    for (const token of [...tokens].reverse()) {
        const tokenIds = collectTokenReferenceIds(token);
        const eligibleToken = [...tokenIds].some((id) => eligible.has(id));
        if (!eligibleToken || token?.visible === false) continue;
        if (!tokenContainsPoint(token, point, gridSize)) continue;
        return token;
    }
    return null;
}

export function buildEncounterTargetingOverlayModel({
    scene = null,
    sourceToken = null,
    targetTokens = [],
    maxRangeFeet = 0,
    rangeType = "melee"
} = {}) {
    const gridSize = positiveNumber(scene?.grid?.size, 100);
    const feetPerSquare = positiveNumber(scene?.grid?.distance, 5);
    const rangeFeet = Math.max(0, numberOr(maxRangeFeet, 0));
    const radiusPixels = (rangeFeet / feetPerSquare) * gridSize;

    if (!scene || !sourceToken || rangeFeet <= 0) {
        return {
            active: false,
            rangeFeet,
            rangeType: String(rangeType ?? "melee"),
            radiusPixels,
            targetTokenIds: [],
            sourceTokenId: "",
            origin: { x: 0, y: 0 }
        };
    }

    const origin = tokenCenter(sourceToken, gridSize);
    const targetTokenIds = [];

    for (const token of targetTokens) {
        const tokenId = String(token?.id ?? token?._id ?? token?.document?.id ?? "").trim();
        if (!tokenId) continue;

        const center = tokenCenter(token, gridSize);
        const distancePixels = Math.hypot(center.x - origin.x, center.y - origin.y);
        if (distancePixels > radiusPixels + 0.0001) continue;
        targetTokenIds.push(tokenId);
    }

    return {
        active: true,
        rangeFeet,
        rangeType: String(rangeType ?? "melee"),
        radiusPixels,
        targetTokenIds,
        sourceTokenId: String(sourceToken?.id ?? sourceToken?._id ?? sourceToken?.document?.id ?? "").trim(),
        origin
    };
}
