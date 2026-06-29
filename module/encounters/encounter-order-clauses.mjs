function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

function normalizeStatus(status = "") {
    const normalized = String(status ?? "").trim().toLowerCase();
    if (normalized === "failed") return "failed";
    if (normalized === "interrupted") return "interrupted";
    if (normalized === "complete") return "completed";
    if (normalized === "completed") return "completed";
    if (normalized === "active") return "active";
    return "pending";
}

function outcomeStatus(outcome = null, fallback = "completed") {
    const result = String(outcome?.result ?? "").trim().toLowerCase();
    if (!result) return normalizeStatus(fallback);
    if (["failed", "outofrange", "criticalfailure"].includes(result)) return "failed";
    if (["interrupted", "incapacitated", "prone"].includes(result)) return "interrupted";
    if (["progress", "movementstep", "reactionready"].includes(result)) return "active";
    return "completed";
}

function clauseForType(action = {}, clauseType = "") {
    const clauses = toArray(action.clauses);
    if (!clauses.length) return null;
    const requestedType = String(clauseType ?? "").trim().toLowerCase();
    if (requestedType) {
        const matched = clauses.find((clause) => String(clause?.clauseType ?? "").trim().toLowerCase() === requestedType);
        if (matched) return matched;
    }
    return clauses[0] ?? null;
}

function relatedIds(action = {}, outcome = {}, relatedCombatantIds = []) {
    return [
        ...toArray(relatedCombatantIds),
        action.targetId,
        outcome.targetCombatantId,
        outcome.pendingDamage?.targetCombatantId
    ]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
        .filter((id, index, all) => all.indexOf(id) === index);
}

export function orderIdForAction(action = {}, actionIndex = 0) {
    return text(
        action.orderId,
        text(
            action.impliedForOrderId,
            text(
                action.followThroughSourceOrderId,
                text(action.id, text(action.actionId, `order-${Math.max(0, Number(actionIndex) || 0) + 1}`))
            )
        )
    );
}

export function buildTimelineClauseMetadata({
    action = null,
    outcome = null,
    actionIndex = 0,
    clauseType = "",
    clauseText = "",
    clauseStatus = "",
    relatedCombatantIds = []
} = {}) {
    if (!action) return {};

    const orderId = orderIdForAction(action, actionIndex);
    const selectedClause = clauseForType(action, clauseType);
    const resolvedType = text(clauseType, text(selectedClause?.clauseType, "effect"));
    const fallbackClauseId = `clause-${Math.max(0, Number(actionIndex) || 0) + 1}-effect`;
    const resolvedText = text(
        clauseText,
        text(selectedClause?.text, text(selectedClause?.clauseText, text(action.summary, text(action.label, "Action"))))
    );

    return {
        orderId,
        clauseId: text(selectedClause?.clauseId, fallbackClauseId),
        clauseType: resolvedType,
        clauseText: resolvedText,
        clauseStatus: clauseStatus ? normalizeStatus(clauseStatus) : outcomeStatus(outcome),
        relatedCombatantIds: relatedIds(action, outcome, relatedCombatantIds)
    };
}

export function withOrderClauseMetadata(entry = {}, options = {}) {
    const metadata = buildTimelineClauseMetadata({
        action: entry?.action,
        outcome: entry?.outcome,
        ...options
    });
    return Object.keys(metadata).length ? { ...entry, ...metadata } : entry;
}
