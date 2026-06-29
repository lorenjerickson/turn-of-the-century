function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function defaultClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function cloneValue(value, cloneData = defaultClone) {
    if (value === undefined) return undefined;
    return cloneData(value);
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

function pluralAp(value) {
    const ap = Math.max(1, Math.floor(toNumber(value, 1)));
    return `${ap} AP`;
}

function targetPhrase(targetName = "") {
    return text(targetName, "the selected target");
}

function itemPhrase(itemName = "", actionLabel = "") {
    return text(itemName, text(actionLabel, "the selected action"));
}

function normalizeApEnvelope(action = {}, apCost = 1, cloneData) {
    const source = action.apEnvelope && typeof action.apEnvelope === "object"
        ? action.apEnvelope
        : {};
    const positioningAp = Math.max(0, Math.floor(toNumber(source.positioningAp, 0)));
    const effectAp = Math.max(0, Math.floor(toNumber(source.effectAp, apCost)));
    const maxAp = Math.max(1, Math.floor(toNumber(source.maxAp, apCost || positioningAp + effectAp || 1)));

    return {
        ...cloneValue(source, cloneData),
        positioningAp,
        effectAp,
        maxAp
    };
}

function normalizeClauses(action = {}, cloneData) {
    return toArray(action.clauses).map((clause, index) => ({
        ...cloneValue(clause, cloneData),
        clauseId: text(clause?.clauseId, `clause-${index + 1}`),
        clauseType: text(clause?.clauseType, "effect"),
        text: text(clause?.text, text(clause?.clauseText, "")),
        clauseStatus: text(clause?.clauseStatus, "pending")
    }));
}

function normalizeOrderField(action = {}, fieldName = "", fallbackType = "", cloneData) {
    const source = action[fieldName];
    if (!source || typeof source !== "object") return null;
    return {
        ...cloneValue(source, cloneData),
        type: text(source.type, fallbackType)
    };
}

export function hasEncounterOrderData(action = {}) {
    return Boolean(
        action?.orderId
        || action?.intentType
        || action?.summary
        || action?.apEnvelope
        || action?.positioningRequirement
        || action?.followThrough
        || action?.failureOutcome
        || action?.sourceAction
        || toArray(action?.clauses).length
    );
}

export function normalizeEncounterOrderData(action = {}, { apCost = 1, index = 0, cloneData = defaultClone } = {}) {
    if (!hasEncounterOrderData(action)) return {};

    const orderId = text(action.orderId, `order-${index + 1}`);
    const intentType = text(action.intentType, text(action.type, "action"));
    const label = text(action.label, `Action ${index + 1}`);
    const summary = text(action.summary, `Spend ${apCost} AP to ${label}.`);

    return {
        orderId,
        intentType,
        summary,
        clauses: normalizeClauses(action, cloneData),
        apEnvelope: normalizeApEnvelope(action, apCost, cloneData),
        positioningRequirement: normalizeOrderField(action, "positioningRequirement", "", cloneData),
        followThrough: normalizeOrderField(action, "followThrough", "hold", cloneData),
        failureOutcome: normalizeOrderField(action, "failureOutcome", "bestReachablePosition", cloneData),
        sourceAction: action.sourceAction && typeof action.sourceAction === "object"
            ? cloneValue(action.sourceAction, cloneData)
            : null
    };
}

export function buildLegacyOrderSummary(action = {}, { targetName = "", itemName = "" } = {}) {
    const apCost = Math.max(1, Math.floor(toNumber(action.apCost, 1)));
    const actionId = text(action.actionId, text(action.id, "")).toLowerCase();
    const actionType = text(action.type, "action").toLowerCase();
    const label = text(action.label, "Action");
    const target = targetPhrase(targetName);
    const item = itemPhrase(itemName, label);

    if (actionType === "movement") {
        if (actionId === "pursue") return `Spend up to ${pluralAp(apCost)} pursuing ${target}.`;
        if (actionId === "follow") return `Spend up to ${pluralAp(apCost)} following ${target}.`;
        if (actionId === "avoid") return `Spend up to ${pluralAp(apCost)} avoiding ${target}.`;
        if (actionId === "evade") return `Spend up to ${pluralAp(apCost)} evading ${target}.`;
        return `Spend ${pluralAp(apCost)} moving toward the selected location.`;
    }

    if (actionType === "attack" || action.requiresToHit) {
        return `Spend ${pluralAp(apCost)} to attack ${target} with ${item}.`;
    }

    if (action.isReaction || actionId === "overwatch") {
        return `Hold ${label} for up to ${pluralAp(apCost)}.`;
    }

    if (actionType === "consumable") {
        return `Spend ${pluralAp(apCost)} to use ${item}.`;
    }

    if (actionType === "utility" || actionType === "defense") {
        return `Spend ${pluralAp(apCost)} to ${label}.`;
    }

    return `Spend ${pluralAp(apCost)} on ${label}.`;
}

export function buildEncounterOrderDisplay(action = {}, { index = 0, targetName = "", itemName = "", cloneData = defaultClone } = {}) {
    const apCost = Math.max(1, Math.floor(toNumber(action.apCost, 1)));
    const normalizedOrder = normalizeEncounterOrderData(action, { apCost, index, cloneData });
    const apEnvelope = normalizedOrder.apEnvelope ?? normalizeApEnvelope(action, apCost, cloneData);
    const summary = text(action.summary, buildLegacyOrderSummary(action, { targetName, itemName }));
    const clauses = normalizedOrder.clauses?.length
        ? normalizedOrder.clauses
        : [{
            clauseId: `clause-${index + 1}-effect`,
            clauseType: text(action.type, "action"),
            text: summary,
            clauseStatus: "pending"
        }];

    return {
        ...normalizedOrder,
        summary,
        apEnvelope,
        clauses
    };
}
