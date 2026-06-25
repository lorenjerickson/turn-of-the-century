import {
    adjacentFreePosition,
    findGridConflicts,
    lowestStrengthCombatantId,
    resolveContestedDexterity
} from "./round-end-collision.mjs";

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

// ---------------------------------------------------------------------------

/**
 * Resolves end-of-tick grid conflicts — two or more non-prone combatants
 * occupying the same cell after movement has been applied.
 *
 * The resolution sequence for each conflicting group is:
 *
 * 1. Apply the current snapshot to canvas so that tokens are visibly in their
 *    contested positions.
 * 2. Send a contested Dexterity roll request to each combatant's owner.
 * 3. Await all resolutions simultaneously.
 * 4. Determine winners and losers via {@link resolveContestedDexterity}.
 * 5. Apply prone to losers and concussive damage to critical failures.
 * 6. Displace the weakest combatant when all critical-succeeded or all failed.
 * 7. Capture and return a new snapshot that reflects the resolved positions.
 *
 * All Foundry-specific operations (document updates, roll requests, canvas
 * snapshots) are provided through injected ports so the resolver is
 * independently testable.
 *
 * @example
 * ```js
 * const resolver = new CollisionResolver({
 *   getCombatants:         () => combat.combatants.contents,
 *   getGridSize:           () => canvas?.scene?.grid?.size ?? 100,
 *   canResolveConflicts:   () => Boolean(game?.users),
 *   isActorProne:          (actor) => encounter.isActorProne(actor),
 *   ownerUserIdForActor:   (actor) => encounter.ownerUserIdForActor(actor),
 *   sendRollRequest:       (params) => dieRollRequestManager.sendRequest(params),
 *   waitForRollResolution: async (id) => dieRollRequestManager.waitForResolution(id),
 *   applyProneEffect:      async (combatant) => encounter.applyProneEffect(combatant),
 *   applyConcussiveDamage: async (combatant) => encounter.applyConcussiveDamage(combatant),
 *   notifyAwaitingRolls:   async (opts) => encounter.setAwaitingContestedRolls(opts),
 *   applySnapshot:         async (snapshot) => encounter.applyResolutionSnapshot(snapshot),
 *   captureSnapshot:       async (opts) => encounter.captureResolutionSnapshot(opts)
 * });
 *
 * const updatedSnapshot = await resolver.resolveTickEndGridConflicts({
 *   tick, snapshot, timeline, tickNarratives, perCombatant
 * });
 * ```
 */
export class CollisionResolver {
    /** @type {() => object[]} */
    #getCombatants;

    /** @type {() => number} */
    #getGridSize;

    /** @type {() => boolean} */
    #canResolveConflicts;

    /** @type {(actor: object|null) => boolean} */
    #isActorProne;

    /** @type {(actor: object|null) => string} */
    #ownerUserIdForActor;

    /** @type {(params: object) => object} */
    #sendRollRequest;

    /** @type {(id: string) => Promise<object>} */
    #waitForRollResolution;

    /** @type {(combatant: object|null) => Promise<void>} */
    #applyProneEffect;

    /** @type {(combatant: object|null) => Promise<number>} */
    #applyConcussiveDamage;

    /**
     * @type {(opts: {
     *   tick: number,
     *   timeline: object[],
     *   perCombatant: object,
     *   requestIds: string[]
     * }) => Promise<void>}
     */
    #notifyAwaitingRolls;

    /** @type {(snapshot: object|null) => Promise<void>} */
    #applySnapshot;

    /** @type {(opts: object) => Promise<object>} */
    #captureSnapshot;

    /**
     * @param {{
     *   getCombatants:         () => object[],
     *   getGridSize:           () => number,
     *   canResolveConflicts:   () => boolean,
     *   isActorProne:          (actor: object|null) => boolean,
     *   ownerUserIdForActor:   (actor: object|null) => string,
     *   sendRollRequest:       (params: object) => object,
     *   waitForRollResolution: (id: string) => Promise<object>,
     *   applyProneEffect:      (combatant: object|null) => Promise<void>,
     *   applyConcussiveDamage: (combatant: object|null) => Promise<number>,
     *   notifyAwaitingRolls:   (opts: object) => Promise<void>,
     *   applySnapshot:         (snapshot: object|null) => Promise<void>,
     *   captureSnapshot:       (opts: object) => Promise<object>
     * }} ports
     */
    constructor({
        getCombatants,
        getGridSize,
        canResolveConflicts,
        isActorProne,
        ownerUserIdForActor,
        sendRollRequest,
        waitForRollResolution,
        applyProneEffect,
        applyConcussiveDamage,
        notifyAwaitingRolls,
        applySnapshot,
        captureSnapshot
    }) {
        this.#getCombatants = getCombatants;
        this.#getGridSize = getGridSize;
        this.#canResolveConflicts = canResolveConflicts;
        this.#isActorProne = isActorProne;
        this.#ownerUserIdForActor = ownerUserIdForActor;
        this.#sendRollRequest = sendRollRequest;
        this.#waitForRollResolution = waitForRollResolution;
        this.#applyProneEffect = applyProneEffect;
        this.#applyConcussiveDamage = applyConcussiveDamage;
        this.#notifyAwaitingRolls = notifyAwaitingRolls;
        this.#applySnapshot = applySnapshot;
        this.#captureSnapshot = captureSnapshot;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Detect and resolve end-of-tick grid conflicts for the current `snapshot`.
     *
     * Returns `snapshot` unchanged when there are no conflicts or when the roll
     * system is unavailable. Otherwise processes each conflicting group in
     * initiative order, applies prone and displacement effects, and returns a
     * freshly captured snapshot that reflects the post-resolution positions.
     *
     * @param {{
     *   tick:           number,
     *   snapshot:       object|null,
     *   timeline:       object[],
     *   tickNarratives: object[],
     *   perCombatant:   object
     * }} options
     * @returns {Promise<object>} The post-resolution snapshot.
     */
    async resolveTickEndGridConflicts({ tick = 0, snapshot = null, timeline = [], tickNarratives = [], perCombatant = {} } = {}) {
        if (!this.#canResolveConflicts()) return snapshot;

        const gridSize = Math.max(1, toNumber(this.#getGridSize(), 100));
        const combatants = this.#getCombatants();
        const conflicts = findGridConflicts({
            tokenPositions: snapshot?.tokenPositions,
            combatants: combatants.filter((combatant) => !this.#isActorProne(combatant?.actor)),
            gridSize
        });
        if (!conflicts.length) return snapshot;

        await this.#applySnapshot(snapshot);

        for (const conflict of conflicts) {
            const requests = conflict.map((member) => {
                const combatant = combatants.find((c) => c?.id === member.combatantId) ?? null;
                const actor = combatant?.actor ?? null;
                const recipientId = this.#ownerUserIdForActor(actor);
                const dexBonus = toNumber(actor?.system?.abilities?.dex?.bonus, 0);
                return {
                    member,
                    combatant,
                    recipientId,
                    request: this.#sendRollRequest({
                        member,
                        combatant,
                        recipientId,
                        dexBonus,
                        tick
                    })
                };
            });

            await this.#notifyAwaitingRolls({
                tick,
                timeline,
                perCombatant,
                requestIds: requests.map(({ request }) => request.id)
            });

            const resolvedRequests = await Promise.all(requests.map(async (entry) => ({
                ...entry,
                request: await this.#waitForRollResolution(entry.request.id)
            })));

            const contest = resolveContestedDexterity(resolvedRequests.map(({ combatant, request, recipientId }) => ({
                combatantId: combatant?.id,
                strength: toNumber(combatant?.actor?.system?.abilities?.str?.value, 0),
                result: request?.results?.[recipientId] ?? {}
            })));
            const allCriticalSuccess = contest.every((entry) => entry.outcome === "criticalSuccess");
            const allFailed = contest.every((entry) => ["failure", "criticalFailure"].includes(entry.outcome));
            const displaceId = (allCriticalSuccess || allFailed) ? lowestStrengthCombatantId(contest) : null;

            for (const entry of contest) {
                const combatant = combatants.find((c) => c?.id === entry.combatantId) ?? null;
                let damage = 0;
                if (["failure", "criticalFailure"].includes(entry.outcome)) {
                    await this.#applyProneEffect(combatant);
                    const state = perCombatant?.[entry.combatantId];
                    if (state) {
                        state.spentAp += Math.max(0, toNumber(state.remainingAp, 0));
                        state.remainingAp = 0;
                        state.pointer = toArray(state.plan).length;
                        state.progress = 0;
                    }
                }
                if (entry.outcome === "criticalFailure") {
                    damage = await this.#applyConcussiveDamage(combatant);
                }

                timeline.push({
                    tick,
                    combatantId: entry.combatantId,
                    combatantName: combatant?.name ?? "Combatant",
                    action: null,
                    outcome: {
                        result: entry.outcome === "criticalFailure"
                            ? "criticalFailure"
                            : entry.outcome === "failure" ? "prone" : "standing",
                        roll: entry.natural,
                        total: entry.total,
                        damage,
                        damageType: damage ? "concussive" : null,
                        detail: entry.outcome === "criticalFailure"
                            ? `${combatant?.name ?? "The actor"} critically fails the contested Dexterity roll, is knocked prone, forfeits their remaining plan, and takes ${damage} concussive damage.`
                            : ["failure"].includes(entry.outcome)
                                ? `${combatant?.name ?? "The actor"} loses the contested Dexterity roll, is knocked prone, and forfeits their remaining plan.`
                                : `${combatant?.name ?? "The actor"} remains standing after the contested Dexterity roll.`
                    }
                });
            }

            if (displaceId) {
                const displaced = conflict.find((member) => member.combatantId === displaceId);
                const origin = snapshot.tokenPositions?.[displaced?.tokenId];
                const destination = adjacentFreePosition({
                    origin,
                    occupiedPositions: Object.values(snapshot.tokenPositions ?? {}),
                    gridSize
                });
                if (destination && displaced?.tokenId) {
                    snapshot.tokenPositions[displaced.tokenId] = destination;
                    const displacedName = combatants.find((c) => c?.id === displaceId)?.name ?? "Combatant";
                    timeline.push({
                        tick,
                        combatantId: displaceId,
                        combatantName: displacedName,
                        action: null,
                        outcome: {
                            result: "displaced",
                            detail: `${displacedName} is displaced to an adjacent square.`
                        }
                    });
                }
            }
        }

        return this.#captureSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: snapshot?.tokenPositions ?? {}
        });
    }
}
