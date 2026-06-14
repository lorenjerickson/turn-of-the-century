function addReferenceId(set, value) {
    const id = String(value ?? "").trim();
    if (id) set.add(id);
}

function collectTokenReferenceIds(token = null) {
    const ids = new Set();
    addReferenceId(ids, token?.id);
    addReferenceId(ids, token?._id);
    addReferenceId(ids, token?.uuid);
    addReferenceId(ids, token?.object?.id);
    addReferenceId(ids, token?.object?._id);
    addReferenceId(ids, token?.object?.document?.id);
    addReferenceId(ids, token?.document?.id);
    addReferenceId(ids, token?.document?._id);
    addReferenceId(ids, token?.document?.uuid);
    return ids;
}

function collectActorReferenceIds(actor = null, token = null) {
    const ids = new Set();
    addReferenceId(ids, actor?.id);
    addReferenceId(ids, actor?._id);
    addReferenceId(ids, actor?.uuid);
    addReferenceId(ids, actor?.baseActor?.id);
    addReferenceId(ids, actor?.baseActor?._id);
    addReferenceId(ids, actor?.baseActor?.uuid);
    addReferenceId(ids, actor?.parent?.id);
    addReferenceId(ids, actor?.parent?._id);
    addReferenceId(ids, token?.actorId);
    addReferenceId(ids, token?.document?.actorId);
    addReferenceId(ids, token?.actor?.id);
    addReferenceId(ids, token?.actor?._id);
    addReferenceId(ids, token?.actor?.uuid);
    addReferenceId(ids, token?.actor?.baseActor?.id);
    addReferenceId(ids, token?.actor?.baseActor?._id);
    addReferenceId(ids, token?.actor?.baseActor?.uuid);
    return ids;
}

function getCombatantTokenReferenceIds(combatant = null) {
    const ids = new Set();
    addReferenceId(ids, combatant?.tokenId);
    addReferenceId(ids, combatant?.token?._id);
    addReferenceId(ids, combatant?.token?.id);
    addReferenceId(ids, combatant?.token?.uuid);
    addReferenceId(ids, combatant?.token?.object?.id);
    addReferenceId(ids, combatant?.token?.object?._id);
    addReferenceId(ids, combatant?.token?.object?.document?.id);
    addReferenceId(ids, combatant?.token?.document?.id);
    addReferenceId(ids, combatant?.token?.document?._id);
    addReferenceId(ids, combatant?.token?.document?.uuid);
    return ids;
}

function getCombatantActorReferenceIds(combatant = null) {
    const ids = new Set();
    addReferenceId(ids, combatant?.actorId);
    addReferenceId(ids, combatant?.actor?._id);
    addReferenceId(ids, combatant?.actor?.id);
    addReferenceId(ids, combatant?.actor?.uuid);
    addReferenceId(ids, combatant?.actor?.baseActor?.id);
    addReferenceId(ids, combatant?.actor?.baseActor?._id);
    addReferenceId(ids, combatant?.actor?.baseActor?.uuid);
    addReferenceId(ids, combatant?.token?.actorId);
    addReferenceId(ids, combatant?.token?.document?.actorId);
    addReferenceId(ids, combatant?.token?.actor?.id);
    addReferenceId(ids, combatant?.token?.actor?._id);
    addReferenceId(ids, combatant?.token?.actor?.uuid);
    addReferenceId(ids, combatant?.token?.actor?.baseActor?.id);
    addReferenceId(ids, combatant?.token?.actor?.baseActor?._id);
    addReferenceId(ids, combatant?.token?.actor?.baseActor?.uuid);
    return ids;
}

function hasAnyReferenceMatch(sourceIds, targetIds) {
    for (const id of sourceIds) {
        if (targetIds.has(id)) return true;
    }
    return false;
}

function findCombatantForToken({ combatants = [], token = null, actor = null } = {}) {
    if (!token) return null;
    const tokenIds = collectTokenReferenceIds(token);
    const actorIds = collectActorReferenceIds(actor ?? token?.actor ?? null, token);

    return combatants.find((combatant) => (
        hasAnyReferenceMatch(tokenIds, getCombatantTokenReferenceIds(combatant))
        || hasAnyReferenceMatch(actorIds, getCombatantActorReferenceIds(combatant))
    )) ?? null;
}

function getCombatantReferenceDiagnostics(combatants = []) {
    return combatants.map((combatant) => ({
        id: String(combatant?.id ?? ""),
        tokenId: String(combatant?.tokenId ?? ""),
        tokenDocumentId: String(combatant?.token?.document?.id ?? ""),
        tokenUuid: String(combatant?.token?.uuid ?? combatant?.token?.document?.uuid ?? ""),
        actorId: String(combatant?.actorId ?? combatant?.actor?.id ?? combatant?.token?.actorId ?? combatant?.token?.actor?.id ?? ""),
        actorUuid: String(combatant?.actor?.uuid ?? combatant?.token?.actor?.uuid ?? "")
    }));
}

export {
    collectActorReferenceIds,
    collectTokenReferenceIds,
    findCombatantForToken,
    getCombatantActorReferenceIds,
    getCombatantReferenceDiagnostics,
    getCombatantTokenReferenceIds
};
