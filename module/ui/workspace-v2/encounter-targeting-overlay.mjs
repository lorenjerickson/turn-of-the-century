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