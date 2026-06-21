function collectionGet(collection, id) {
    return collection?.get?.(id)
        ?? collection?.contents?.find?.((entry) => String(entry?.id ?? "") === String(id ?? ""))
        ?? null;
}

/** Accept a completed, action-linked planning roll exactly once on its recipient's client. */
export async function acceptCompletedPlanningRoll({
    change = {},
    game = globalThis.game
} = {}) {
    if (change?.type !== "result") return false;
    const request = change.request;
    const recipientId = String(change.recipientId ?? "").trim();
    if (!request || !recipientId || recipientId !== String(game?.user?.id ?? "")) return false;
    if (!request.combatId || !request.combatantId || !Number.isInteger(request.actionIndex)) return false;

    const combat = collectionGet(game?.combats, request.combatId)
        ?? (String(game?.combat?.id ?? "") === request.combatId ? game.combat : null);
    const phase = String(combat?.phase ?? combat?.encounterState?.phase ?? "");
    if (phase !== "planning" || typeof combat?.lockCombatantActionRoll !== "function") return false;

    await combat.lockCombatantActionRoll(request.combatantId, request.actionIndex, {
        requestId: request.id,
        actionId: request.actionId,
        rollType: request.rollType,
        rollSubType: request.rollSubType,
        result: change.result
    });
    return true;
}

