export const DIE_ROLL_REQUEST_STATUSES = Object.freeze({
    PENDING: "pending",
    ROLLING: "rolling",
    RESOLVED: "resolved",
    CANCELLED: "cancelled"
});

const DEFAULT_DIE = Object.freeze({ count: 1, faces: 20 });

function cleanString(value = "") {
    return String(value ?? "").trim();
}

function uniqueStrings(values = []) {
    return [...new Set((Array.isArray(values) ? values : [values])
        .map(cleanString)
        .filter(Boolean))];
}

function normalizeModifierEntry(entry = {}) {
    if (typeof entry === "number") {
        return { label: "Modifier", value: Number(entry) || 0, source: "request" };
    }

    return {
        label: cleanString(entry.label || entry.name || "Modifier"),
        value: Number(entry.value ?? entry.modifier ?? entry.amount ?? 0) || 0,
        source: cleanString(entry.source || "request")
    };
}

function normalizeModifiers(modifiers = []) {
    if (typeof modifiers === "number") return [normalizeModifierEntry(modifiers)];
    if (!Array.isArray(modifiers)) return [];
    return modifiers.map(normalizeModifierEntry);
}

function normalizeDice(dice = null, { advantage = false, disadvantage = false } = {}) {
    if (Array.isArray(dice) && dice.length) {
        return dice.map((die) => ({
            count: Math.max(1, Number(die.count ?? 1) || 1),
            faces: Math.max(2, Number(die.faces ?? die.sides ?? 20) || 20),
            keep: cleanString(die.keep || "")
        }));
    }

    if (typeof dice === "string") {
        const match = dice.trim().match(/^(\d*)d(\d+)(k[hl]1)?$/i);
        if (match) {
            return [{
                count: Math.max(1, Number(match[1] || 1) || 1),
                faces: Math.max(2, Number(match[2]) || 20),
                keep: match[3]?.toLowerCase() === "kh1" ? "highest" : match[3]?.toLowerCase() === "kl1" ? "lowest" : ""
            }];
        }
    }

    if (advantage) return [{ count: 2, faces: 20, keep: "highest" }];
    if (disadvantage) return [{ count: 2, faces: 20, keep: "lowest" }];
    return [{ ...DEFAULT_DIE }];
}

function normalizeRequestor({ requestor = null, initiatorId = "" } = {}) {
    if (requestor && typeof requestor === "object") {
        return {
            id: cleanString(requestor.id || initiatorId),
            type: cleanString(requestor.type || "user"),
            name: cleanString(requestor.name || requestor.label || requestor.id || initiatorId || "Unknown Requestor")
        };
    }

    return {
        id: cleanString(initiatorId || requestor || ""),
        type: "user",
        name: cleanString(requestor || initiatorId || "Unknown Requestor")
    };
}

function normalizeResultMap(results = {}) {
    if (!results || typeof results !== "object") return {};
    return Object.fromEntries(Object.entries(results).map(([userId, result]) => [cleanString(userId), result]));
}

export function sumModifiers(modifiers = []) {
    return normalizeModifiers(modifiers).reduce((total, modifier) => total + modifier.value, 0);
}

export function getRecipientAdjustment(request = {}, userId = "") {
    return Number(request.adjustments?.[userId]?.value ?? 0) || 0;
}

export function buildRollFormula({ dice = [], modifiers = [], adjustment = 0 } = {}) {
    const diceFormula = normalizeDice(dice)
        .map((die) => `${die.count}d${die.faces}${die.keep === "highest" ? "kh1" : die.keep === "lowest" ? "kl1" : ""}`)
        .join(" + ");
    const modifierTotal = sumModifiers(modifiers) + (Number(adjustment) || 0);
    if (!modifierTotal) return diceFormula;
    return `${diceFormula} ${modifierTotal >= 0 ? "+" : "-"} ${Math.abs(modifierTotal)}`;
}

export class DieRollRequest {
    constructor(options = {}) {
        const recipientIds = uniqueStrings(options.recipientIds ?? options.targetUserIds ?? options.recipients ?? []);
        const rollType = cleanString(options.rollType || options.type || "custom");
        const rollSubType = cleanString(options.rollSubType || options.subType || options.label || "Roll");
        const advantage = Boolean(options.advantage);
        const disadvantage = Boolean(options.disadvantage);

        this.id = cleanString(options.id || globalThis.crypto?.randomUUID?.() || `roll-${Date.now()}`);
        this.initiatorId = cleanString(options.initiatorId || options.requestor?.id || "");
        this.requestor = normalizeRequestor(options);
        this.recipientIds = recipientIds;
        this.targetUserIds = recipientIds;
        this.actorId = cleanString(options.actorId || "");
        this.tokenId = cleanString(options.tokenId || "");
        this.rollType = rollType;
        this.rollSubType = rollSubType;
        this.label = cleanString(options.label || `${rollSubType} ${rollType}`.trim());
        this.dice = normalizeDice(options.dice, { advantage, disadvantage });
        this.modifiers = normalizeModifiers(options.modifiers);
        this.adjustments = options.adjustments && typeof options.adjustments === "object" ? { ...options.adjustments } : {};
        this.visibility = cleanString(options.visibility || "participants");
        this.status = cleanString(options.status || DIE_ROLL_REQUEST_STATUSES.PENDING);
        this.results = normalizeResultMap(options.results);
        this.timestamp = Number(options.timestamp ?? options.createdAt ?? Date.now()) || Date.now();
        this.createdAt = this.timestamp;
        this.updatedAt = Number(options.updatedAt ?? this.timestamp) || this.timestamp;
        this.resolvedAt = Number(options.resolvedAt ?? 0) || null;
    }

    get isPending() {
        return this.status === DIE_ROLL_REQUEST_STATUSES.PENDING || this.status === DIE_ROLL_REQUEST_STATUSES.ROLLING;
    }

    get isCancelled() {
        return this.status === DIE_ROLL_REQUEST_STATUSES.CANCELLED;
    }

    hasRecipient(userId) {
        return this.recipientIds.includes(cleanString(userId));
    }

    hasResult(userId) {
        return Boolean(this.results?.[cleanString(userId)]);
    }

    isResolvedFor(userId) {
        return this.hasResult(userId) || this.status === DIE_ROLL_REQUEST_STATUSES.CANCELLED;
    }

    getFormulaFor(userId = "") {
        return buildRollFormula({
            dice: this.dice,
            modifiers: this.modifiers,
            adjustment: getRecipientAdjustment(this, cleanString(userId))
        });
    }

    toJSON() {
        return {
            id: this.id,
            initiatorId: this.initiatorId,
            requestor: this.requestor,
            recipientIds: [...this.recipientIds],
            targetUserIds: [...this.targetUserIds],
            actorId: this.actorId,
            tokenId: this.tokenId,
            rollType: this.rollType,
            rollSubType: this.rollSubType,
            label: this.label,
            dice: this.dice.map((die) => ({ ...die })),
            modifiers: this.modifiers.map((modifier) => ({ ...modifier })),
            adjustments: { ...this.adjustments },
            visibility: this.visibility,
            status: this.status,
            results: { ...this.results },
            timestamp: this.timestamp,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            resolvedAt: this.resolvedAt
        };
    }
}
