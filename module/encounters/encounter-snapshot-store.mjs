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

/**
 * Extract the canonical string ID from a token or token-like object,
 * handling both the document wrapper and the placeable form.
 *
 * @param {object|null} token
 * @returns {string}
 */
function tokenDocumentId(token = null) {
    return String(token?.id ?? token?._id ?? token?.document?.id ?? token?.document?._id ?? "").trim();
}

/**
 * Return the TokenDocument instance suitable for calling `.update()` on,
 * unwrapping the placeable's `.document` wrapper when present.
 *
 * @param {object|null} token
 * @returns {object|null}
 */
function tokenDocumentForUpdate(token = null) {
    return token?.document ?? token ?? null;
}

// ---------------------------------------------------------------------------

/**
 * Captures and restores Foundry document state at each tick of encounter
 * resolution. This is the only class that should read from or write to
 * Foundry actor documents, item documents, and token documents during
 * resolution playback.
 *
 * All other resolution logic works with plain snapshot objects returned
 * by {@link capture}. The engine passes those snapshots back to
 * {@link apply} only when it needs to rewind or advance the document state.
 *
 * @example
 * ```js
 * const store = new EncounterSnapshotStore({
 *   combatants: combat.combatants,
 *   resolveTokenDocument: (combatant) => getTokenDocumentForCombatant(combatant)
 * });
 *
 * const snapshot = await store.capture({ tick: 0, perCombatant, timeline, tickNarratives });
 * // ... run a tick ...
 * await store.apply(snapshot); // rewind to tick 0
 * ```
 */
export class EncounterSnapshotStore {
    /** @type {{ contents: object[] }} */
    #combatants;

    /** @type {(combatant: object) => object|null} */
    #resolveTokenDocument;

    /**
     * @param {{
     *   combatants: { contents: object[] },
     *   resolveTokenDocument: (combatant: object) => object|null
     * }} options
     */
    constructor({ combatants, resolveTokenDocument }) {
        this.#combatants = combatants;
        this.#resolveTokenDocument = resolveTokenDocument;
    }

    /**
     * Capture a snapshot of the current Foundry document state.
     *
     * Reads actor health, resources, item systems, and token positions from
     * all combatants active in the encounter. Optionally overrides token
     * positions with pre-computed values (used when positions are updated
     * within a tick before the snapshot is taken).
     *
     * @param {{
     *   tick?: number,
     *   perCombatant?: object,
     *   timeline?: object[],
     *   tickNarratives?: object[],
     *   tokenPositionOverrides?: Record<string, { x: number, y: number }> | null
     * }} options
     * @returns {Promise<object>} A plain snapshot object.
     */
    async capture({ tick = 0, perCombatant = {}, timeline = [], tickNarratives = [], tokenPositionOverrides = null } = {}) {
        const actorHealth = {};
        const actorResources = {};
        const actorItemSystems = {};
        const tokenPositions = {};

        for (const combatant of this.#combatants?.contents ?? []) {
            const actorId = String(combatant?.actor?.id ?? "").trim();
            if (actorId) {
                actorHealth[actorId] = toNumber(combatant?.actor?.system?.resources?.health?.value, 0);
                actorResources[actorId] = foundry.utils.deepClone(combatant?.actor?.system?.resources ?? {});

                const itemSystems = {};
                for (const item of combatant?.actor?.items?.contents ?? []) {
                    if (!item?.id) continue;
                    itemSystems[item.id] = foundry.utils.deepClone(item.system ?? {});
                }
                actorItemSystems[actorId] = itemSystems;
            }

            const token = this.#resolveTokenDocument(combatant);
            const id = tokenDocumentId(token);
            if (id) {
                tokenPositions[id] = tokenPositionOverrides?.[id] ?? {
                    x: toNumber(token.x ?? token.document?.x, 0),
                    y: toNumber(token.y ?? token.document?.y, 0)
                };
            }
        }

        return {
            tick: Number(tick) || 0,
            timeline: foundry.utils.deepClone(toArray(timeline)),
            perCombatant: foundry.utils.deepClone(perCombatant),
            tickNarratives: foundry.utils.deepClone(toArray(tickNarratives)),
            actorHealth,
            actorResources,
            actorItemSystems,
            tokenPositions
        };
    }

    /**
     * Apply a previously captured snapshot back to Foundry documents.
     *
     * Compares the snapshot's actor state against the current document values
     * and issues targeted `.update()` calls only where values differ.
     * Token positions are applied in parallel with actor updates.
     *
     * @param {object|null} snapshot - A snapshot previously returned by {@link capture}.
     * @returns {Promise<void>}
     */
    async apply(snapshot = null) {
        if (!snapshot || typeof snapshot !== "object") return;

        const actorUpdates = [];
        for (const combatant of this.#combatants?.contents ?? []) {
            const actor = combatant?.actor;
            const actorId = String(actor?.id ?? "").trim();
            if (!actor || !actorId) continue;

            const nextHealth = snapshot.actorHealth?.[actorId];
            const currentHealth = toNumber(actor.system?.resources?.health?.value, 0);
            if (Number.isFinite(nextHealth) && Math.abs(currentHealth - nextHealth) > Number.EPSILON) {
                actorUpdates.push(actor.update({ "system.resources.health.value": nextHealth }));
            }

            const nextResources = snapshot.actorResources?.[actorId];
            if (nextResources && JSON.stringify(nextResources) !== JSON.stringify(actor.system?.resources ?? {})) {
                actorUpdates.push(actor.update({ "system.resources": foundry.utils.deepClone(nextResources) }));
            }

            const itemSnapshots = snapshot.actorItemSystems?.[actorId] ?? {};
            for (const item of actor?.items?.contents ?? []) {
                if (!item?.id) continue;
                const nextSystem = itemSnapshots[item.id];
                if (!nextSystem) continue;
                if (JSON.stringify(nextSystem) === JSON.stringify(item.system ?? {})) continue;
                actorUpdates.push(item.update({ system: foundry.utils.deepClone(nextSystem) }));
            }
        }

        const tokenUpdates = [];
        for (const [tokenId, position] of Object.entries(snapshot.tokenPositions ?? {})) {
            // First try to find the token via an active combatant relationship.
            const owningCombatant = (this.#combatants?.contents ?? []).find(
                (candidate) =>
                    String(candidate?.tokenId ?? "").trim() === tokenId ||
                    tokenDocumentId(candidate?.token) === tokenId
            ) ?? null;

            // Fall back to canvas and scene searches when no combatant owns the token.
            const token =
                this.#resolveTokenDocument(owningCombatant) ??
                canvas?.scene?.tokens?.get?.(tokenId) ??
                toArray(canvas?.tokens?.placeables).find(
                    (placeable) => tokenDocumentId(placeable) === tokenId
                ) ??
                [...(game.scenes?.contents ?? [])]
                    .map((scene) => scene?.tokens?.get?.(tokenId))
                    .find(Boolean) ??
                null;

            const tokenDocument = tokenDocumentForUpdate(token);
            if (!tokenDocument) continue;

            const nextX = toNumber(position?.x, toNumber(tokenDocument.x ?? token.x, 0));
            const nextY = toNumber(position?.y, toNumber(tokenDocument.y ?? token.y, 0));
            const currentX = toNumber(tokenDocument.x ?? token.x, 0);
            const currentY = toNumber(tokenDocument.y ?? token.y, 0);
            if (Math.abs(currentX - nextX) <= Number.EPSILON && Math.abs(currentY - nextY) <= Number.EPSILON) {
                continue;
            }

            tokenUpdates.push(tokenDocument.update({ x: nextX, y: nextY }));
        }

        await Promise.all([...actorUpdates, ...tokenUpdates]);
    }
}
