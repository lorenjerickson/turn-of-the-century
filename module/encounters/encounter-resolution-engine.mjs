import { getMovementFeetPerAp as getMovementFeetPerApDefault } from "./action-catalog.mjs";

// ---------------------------------------------------------------------------
// Pure utilities (local copies — no shared module dependency)
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function sortByInitiativeDescending(combatants = []) {
    return [...combatants].sort((l, r) => Number(r.initiative ?? 0) - Number(l.initiative ?? 0));
}

function wait(ms = 0) {
    const delay = Math.max(0, Number(ms) || 0);
    if (!delay) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, delay));
}

function reactionRuntimeFromResolution(resolution = {}) {
    return {
        consumedKeys: new Set(toArray(resolution?.reactionConsumedKeys).map((key) => String(key)))
    };
}

function serializeReactionRuntime(reactionRuntime = null) {
    return [...(reactionRuntime?.consumedKeys ?? new Set())];
}

// structuredClone fallback for environments that don't have it (older Foundry,
// older Node.js). Prefer structuredClone when available — it handles Sets,
// Maps, and circular references that JSON.parse/stringify cannot.
const deepClone = typeof structuredClone === "function"
    ? structuredClone
    : (x) => JSON.parse(JSON.stringify(x));

// Local event name constants — must match TOTC_ENCOUNTER_EVENTS in combat.mjs.
// Kept local to avoid a circular import.
const EVENT_PHASE_CHANGED = "phaseChanged";
const EVENT_ROUND_RESOLVED = "roundResolved";

// ---------------------------------------------------------------------------

/**
 * Owns the AP-tick state machine for a single encounter round.
 *
 * Each round proceeds in three phases:
 *
 * **Phase 1 — Tick-Start Evaluation** (`#evaluateTick`): Each combatant's
 * action for the current tick is evaluated against the tick-start snapshot.
 * No action sees the mutations of concurrent actions during this phase.
 *
 * **Phase 2 — Reconciliation**: Candidate outcomes are partitioned into
 * movement, consume, and damage effects. Effects are applied in that order
 * via {@link ConsumptionResolver}. Completion boundaries are validated
 * before and after damage; failing entries are marked interrupted.
 *
 * **Phase 3 — Tick-End Grid Resolution**: Tokens sharing a cell at the end
 * of the tick trigger contested Dexterity rolls via {@link CollisionResolver}.
 *
 * All Foundry I/O (state persistence, snapshot capture/apply, combatant
 * lookup, round publication) is injected as ports so the engine is
 * independently testable without a Foundry runtime.
 *
 * **Extracted from `TurnOfTheCenturyEncounter` in combat.mjs.**
 * These private methods were originally:
 * `#beginEncounterResolution`, `#evaluateResolutionTick`, `#resolveAction`,
 * `#buildRoundHistoryEntry`, `#roundHistoryWithFinalEntry`; and the body of
 * `resolveEncounterRound` and `stepEncounterResolution`.
 */
export class EncounterResolutionEngine {
    // -------------------------------------------------------------------------
    // Ports — injected Foundry I/O
    // -------------------------------------------------------------------------

    /** @type {() => object} */
    #getState;

    /** @type {(state: object) => Promise<void>} */
    #setState;

    /** @type {() => number} */
    #getApBudget;

    /** @type {() => number} */
    #getMovementFeetPerAp;

    /** @type {() => number} */
    #getCurrentRound;

    /** @type {() => object[]} */
    #getCombatants;

    /** @type {(id: string) => object|null} */
    #resolveCombatant;

    /** @type {(opts: object) => Promise<object>} */
    #captureSnapshot;

    /** @type {(snapshot: object|null) => Promise<void>} */
    #applySnapshot;

    /** @type {(perCombatant: object) => Promise<void>} */
    #restorePlanningOrigins;

    /** @type {(combatant: object, opts?: object) => boolean} */
    #isCombatantIncapacitated;

    /** @type {(sourceId: string, targetId: string) => object|null} */
    #resolveDeclaredTarget;

    /**
     * Dry-run an item action (consume: false) to check feasibility.
     * @type {(item: object, actor: object, actionId: string) => Promise<{ success?: boolean, reason?: string }|undefined>}
     */
    #checkItemAction;

    /** @type {(timeline: object[]) => Promise<void>} */
    #publishRoundReplay;

    /** @type {(eventName: string, payload?: object) => void} */
    #emit;

    // -------------------------------------------------------------------------
    // Resolver instances
    // -------------------------------------------------------------------------

    #movementResolver;
    #attackResolver;
    #reactionResolver;
    #collisionResolver;
    #consumptionResolver;
    #narrator;

    /**
     * @param {{
     *   getState:                   () => object,
     *   setState:                   (state: object) => Promise<void>,
     *   getApBudget:                () => number,
     *   getMovementFeetPerAp?:      () => number,
     *   getCurrentRound:            () => number,
     *   getCombatants:              () => object[],
     *   resolveCombatant:           (id: string) => object|null,
     *   captureSnapshot:            (opts: object) => Promise<object>,
     *   applySnapshot:              (snapshot: object|null) => Promise<void>,
     *   restorePlanningOrigins:     (perCombatant: object) => Promise<void>,
     *   isCombatantIncapacitated:   (combatant: object, opts?: object) => boolean,
     *   resolveDeclaredTarget:      (sourceId: string, targetId: string) => object|null,
     *   checkItemAction:            (item: object, actor: object, actionId: string) => Promise<object|undefined>,
     *   publishRoundReplay:         (timeline: object[]) => Promise<void>,
     *   emit:                       (eventName: string, payload?: object) => void,
     *   movementResolver:           object,
     *   attackResolver:             object,
     *   reactionResolver:           object,
     *   collisionResolver:          object,
     *   consumptionResolver:        object,
     *   narrator:                   object
     * }} opts
     */
    constructor({
        getState,
        setState,
        getApBudget,
        getMovementFeetPerAp = getMovementFeetPerApDefault,
        getCurrentRound,
        getCombatants,
        resolveCombatant,
        captureSnapshot,
        applySnapshot,
        restorePlanningOrigins,
        isCombatantIncapacitated,
        resolveDeclaredTarget,
        checkItemAction,
        publishRoundReplay,
        emit,
        movementResolver,
        attackResolver,
        reactionResolver,
        collisionResolver,
        consumptionResolver,
        narrator
    }) {
        this.#getState = getState;
        this.#setState = setState;
        this.#getApBudget = getApBudget;
        this.#getMovementFeetPerAp = getMovementFeetPerAp;
        this.#getCurrentRound = getCurrentRound;
        this.#getCombatants = getCombatants;
        this.#resolveCombatant = resolveCombatant;
        this.#captureSnapshot = captureSnapshot;
        this.#applySnapshot = applySnapshot;
        this.#restorePlanningOrigins = restorePlanningOrigins;
        this.#isCombatantIncapacitated = isCombatantIncapacitated;
        this.#resolveDeclaredTarget = resolveDeclaredTarget;
        this.#checkItemAction = checkItemAction;
        this.#publishRoundReplay = publishRoundReplay;
        this.#emit = emit;
        this.#movementResolver = movementResolver;
        this.#attackResolver = attackResolver;
        this.#reactionResolver = reactionResolver;
        this.#collisionResolver = collisionResolver;
        this.#consumptionResolver = consumptionResolver;
        this.#narrator = narrator;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Prepare the initial resolution context for a new round, optionally
     * persisting the "resolving" phase to encounter state.
     *
     * @param {{ persistInitialState?: boolean }} options
     * @returns {Promise<{
     *   initialState:       object,
     *   perCombatant:       object,
     *   timeline:           object[],
     *   tickNarratives:     object[],
     *   snapshots:          object[],
     *   reactionRuntime:    object,
     *   orderedCombatants:  object[],
     *   totalTicks:         number
     * }>}
     */
    async beginResolution({ persistInitialState = true } = {}) {
        const initialState = this.#getState();
        const perCombatant = deepClone(initialState.perCombatant ?? {});
        const timeline = [];
        const tickNarratives = [];
        await this.#restorePlanningOrigins(perCombatant);
        const snapshots = [await this.#captureSnapshot({
            tick: 0,
            perCombatant,
            timeline,
            tickNarratives
        })];
        const orderedCombatants = sortByInitiativeDescending(this.#getCombatants());
        const totalTicks = this.#getApBudget();
        const result = {
            initialState,
            perCombatant,
            timeline,
            tickNarratives,
            snapshots,
            reactionRuntime: { consumedKeys: new Set() },
            orderedCombatants,
            totalTicks
        };

        if (persistInitialState) {
            await this.#setState({
                ...initialState,
                phase: "resolving",
                timeline,
                perCombatant,
                currentEvaluationTick: 0,
                resolution: {
                    status: "paused",
                    currentTick: 0,
                    totalTicks,
                    snapshots,
                    tickNarratives,
                    reactionConsumedKeys: []
                }
            });
        }

        return result;
    }

    /**
     * Evaluate a single AP tick, producing timeline entries and a snapshot.
     *
     * Runs all three resolution phases for `tick`:
     * 1. Per-combatant action evaluation (in initiative order).
     * 2. Reconciliation (movement priority, consume effects, simultaneous damage,
     *    completion boundary validation).
     * 3. Tick-end grid conflict resolution.
     *
     * @param {{
     *   tick:               number,
     *   perCombatant:       object,
     *   timeline:           object[],
     *   tickNarratives:     object[],
     *   reactionRuntime:    object,
     *   orderedCombatants:  object[]
     * }} options
     * @returns {Promise<{ snapshot: object, narrative: object }>}
     */
    async evaluateTick({
        tick = 0,
        perCombatant = {},
        timeline = [],
        tickNarratives = [],
        reactionRuntime = null,
        orderedCombatants = []
    } = {}) {
        // ------------------------------------------------------------------
        // Phase 1: Tick-start evaluation
        // ------------------------------------------------------------------
        const evaluationSnapshot = await this.#captureSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives
        });
        const tickEffects = [];
        const movementFeetPerAp = Number(this.#getMovementFeetPerAp() || 10);

        for (const combatant of orderedCombatants) {
            const state = perCombatant[combatant.id];
            if (!state || state.remainingAp <= 0) continue;

            if (this.#isCombatantIncapacitated(combatant, { actorHealth: evaluationSnapshot.actorHealth })) {
                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                const interrupted = state.progress > 0;
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action: state.plan?.[state.pointer] ?? null,
                    outcome: {
                        result: interrupted ? "interrupted" : "incapacitated",
                        detail: interrupted
                            ? `${combatant.name} is interrupted by incapacitation before completing their action.`
                            : `${combatant.name} is incapacitated and cannot act.`
                    }
                });
                state.progress = 0;
                if (interrupted) state.pointer += 1;
                continue;
            }

            const action = state.plan?.[state.pointer];
            if (!action) {
                state.remainingAp = Math.max(0, state.remainingAp - 1);
                state.spentAp += 1;
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action: null,
                    outcome: {
                        result: "forfeit",
                        detail: `${combatant.name} forfeits 1 AP with no planned action.`
                    }
                });
                continue;
            }

            state.remainingAp = Math.max(0, state.remainingAp - 1);
            state.spentAp += 1;
            state.progress += 1;
            action._runtimeProgress = state.progress;
            const isReactionWindow = Boolean(action.isReaction);

            if (action.type === "movement") {
                if (action.requiresTarget && !action.targetId) {
                    timeline.push({
                        tick,
                        combatantId: combatant.id,
                        combatantName: combatant.name,
                        action,
                        outcome: {
                            result: "failed",
                            detail: `${combatant.name} cannot complete ${action.label}; no target was selected.`
                        }
                    });
                    state.pointer += 1;
                    state.progress = 0;
                    delete action._runtimeProgress;
                    continue;
                }

                const movementEffect = this.#movementResolver.planMovement({
                    combatant,
                    action,
                    tokenPositions: evaluationSnapshot.tokenPositions,
                    tickEffects
                });

                const targetCombatant = action.targetId
                    ? this.#resolveDeclaredTarget(combatant.id, action.targetId)
                    : null;
                if (movementEffect) {
                    tickEffects.push({
                        type: "movement",
                        combatantId: combatant.id,
                        ...movementEffect
                    });
                }

                const stepFeet = Number(action.movementFeetPerAp || movementFeetPerAp || 10);
                const movementMode = String(action.id ?? action.actionId ?? "").toLowerCase();
                const targetSuffix = targetCombatant?.name ? ` ${targetCombatant.name}` : "their target";
                const movementDetail = movementMode === "pursue"
                    ? `${combatant.name} pursues${targetSuffix} (${stepFeet} ft).`
                    : movementMode === "follow"
                        ? `${combatant.name} follows${targetSuffix} (${stepFeet} ft).`
                        : movementMode === "avoid"
                            ? `${combatant.name} avoids${targetSuffix} (${stepFeet} ft).`
                            : `${combatant.name} moves ${stepFeet} ft.`;
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome: {
                        result: "movementStep",
                        detail: movementDetail
                    }
                });

                const tokenPositionsForReaction = {
                    ...(evaluationSnapshot.tokenPositions ?? {})
                };
                if (movementEffect?.tokenId) {
                    tokenPositionsForReaction[movementEffect.tokenId] = {
                        x: movementEffect.x,
                        y: movementEffect.y
                    };
                }

                const overwatchResolution = await this.#reactionResolver.resolveOverwatch({
                    mover: combatant,
                    tick,
                    perCombatant,
                    reactionRuntime,
                    orderedCombatants,
                    evaluationSnapshot,
                    tokenPositions: tokenPositionsForReaction
                });
                if (overwatchResolution.entries.length) {
                    timeline.push(...overwatchResolution.entries);
                }
                if (overwatchResolution.effects.length) {
                    tickEffects.push(...overwatchResolution.effects);
                }
            } else if (state.progress < action.apCost) {
                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome: {
                        result: isReactionWindow ? "reactionReady" : "progress",
                        detail: isReactionWindow
                            ? `${combatant.name} holds ${action.label} (${state.progress}/${action.apCost} AP).`
                            : `${combatant.name} continues ${action.label} (${state.progress}/${action.apCost} AP).`
                    }
                });
            }

            if (state.progress < action.apCost) continue;

            if (action.type !== "movement") {
                let outcome;
                if (action.isReaction) {
                    const reactionWindow = this.#reactionResolver.findReactionAtTick({
                        combatant,
                        tick,
                        triggerType: action.reactionTriggerType ?? "",
                        perCombatant,
                        reactionRuntime
                    });
                    const alreadyTriggered = reactionWindow?.consumed ?? false;
                    if (alreadyTriggered) {
                        outcome = {
                            result: "reactionResolved",
                            detail: `${combatant.name} already spent ${action.label} on a prior trigger this round.`
                        };
                    }
                }

                if (!outcome) {
                    outcome = await this.#resolveAction(combatant, action, {
                        tick,
                        perCombatant,
                        reactionRuntime,
                        evaluationSnapshot,
                        applyEffects: false
                    });
                }

                const pendingDamage = outcome?.pendingDamage;
                if (pendingDamage?.targetCombatantId && toNumber(pendingDamage?.amount, 0) > 0) {
                    tickEffects.push({
                        type: "damage",
                        sourceCombatantId: combatant.id,
                        targetCombatantId: pendingDamage.targetCombatantId,
                        amount: toNumber(pendingDamage.amount, 0)
                    });
                }

                timeline.push({
                    tick,
                    combatantId: combatant.id,
                    combatantName: combatant.name,
                    action,
                    outcome
                });
                const timelineIndex = timeline.length - 1;

                if (action.itemId && !action.isReaction && outcome?.result !== "failed") {
                    tickEffects.push({
                        type: "consumeAction",
                        combatantId: combatant.id,
                        itemId: action.itemId,
                        actionId: action.actionId,
                        cancelIfProne: action.type === "consumable",
                        timelineIndex,
                        actionLabel: action.label,
                        combatantName: combatant.name
                    });
                }
            }

            state.pointer += 1;
            state.progress = 0;
            delete action._runtimeProgress;
            delete action._followOffsetX;
            delete action._followOffsetY;
        }

        // ------------------------------------------------------------------
        // Phase 2: Reconciliation
        // ------------------------------------------------------------------
        const reconcilePlan = this.#consumptionResolver.buildTickReconcilePlan({ tickEffects, orderedCombatants });

        const projectedTokenPositions = {};
        for (const effect of reconcilePlan.movementEffects) {
            if (effect?.tokenId && Number.isFinite(effect.x) && Number.isFinite(effect.y)) {
                projectedTokenPositions[effect.tokenId] = { x: effect.x, y: effect.y };
            }
        }

        const collisionResolution = { proneCombatantIds: new Set() };

        for (const effect of reconcilePlan.consumeEffects) {
            const requiresStableStance = Boolean(effect?.cancelIfProne);
            const combatantId = String(effect?.combatantId ?? "").trim();
            const interruptedByProne = requiresStableStance && collisionResolution.proneCombatantIds.has(combatantId);
            if (interruptedByProne) {
                this.#consumptionResolver.markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: effect?.timelineIndex,
                    combatantName: effect?.combatantName ?? this.#resolveCombatant(combatantId)?.name ?? "Combatant",
                    actionLabel: effect?.actionLabel ?? "the action",
                    reason: "they are knocked prone during reconciliation"
                });
                continue;
            }

            await this.#consumptionResolver.applyConsumeActionEffect(effect);
        }

        const preDamageBoundaryState = await this.#captureSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: projectedTokenPositions
        });

        for (let idx = 0; idx < timeline.length; idx += 1) {
            const entry = timeline[idx];
            if (toNumber(entry?.tick, 0) !== tick) continue;
            if (["prone", "interrupted"].includes(String(entry?.outcome?.result ?? "")) || !entry?.action) continue;

            const boundary = this.#consumptionResolver.validateCompletionBoundary({
                timelineEntry: entry,
                projectedState: preDamageBoundaryState,
                proneCombatantIds: collisionResolution.proneCombatantIds
            });

            if (!boundary.valid) {
                const reason = boundary.violations?.join("; ") ?? "completion boundary not satisfied";
                this.#consumptionResolver.markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: idx,
                    combatantName: entry?.combatantName ?? "Combatant",
                    actionLabel: entry?.action?.label ?? "the action",
                    reason
                });
            }
        }

        await this.#consumptionResolver.applySimultaneousDamageEntries({
            damageEntries: this.#consumptionResolver.buildSimultaneousDamageEntriesFromTimeline({ timeline, tick }),
            evaluationSnapshot
        });

        const projectedEndState = await this.#captureSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: projectedTokenPositions
        });

        for (let idx = 0; idx < timeline.length; idx += 1) {
            const entry = timeline[idx];
            if (toNumber(entry?.tick, 0) !== tick) continue;
            if (["prone", "interrupted"].includes(String(entry?.outcome?.result ?? "")) || !entry?.action) continue;

            const boundary = this.#consumptionResolver.validateCompletionBoundary({
                timelineEntry: entry,
                projectedState: projectedEndState,
                proneCombatantIds: collisionResolution.proneCombatantIds
            });

            if (!boundary.valid) {
                const reason = boundary.violations?.join("; ") ?? "completion boundary not satisfied";
                this.#consumptionResolver.markTimelineEntryInterrupted({
                    timeline,
                    timelineIndex: idx,
                    combatantName: entry?.combatantName ?? "Combatant",
                    actionLabel: entry?.action?.label ?? "the action",
                    reason
                });
            }
        }

        // ------------------------------------------------------------------
        // Phase 3: Tick-end grid conflict resolution
        // ------------------------------------------------------------------
        const reconciledEndState = await this.#collisionResolver.resolveTickEndGridConflicts({
            tick,
            snapshot: projectedEndState,
            timeline,
            tickNarratives,
            perCombatant
        });

        const narrative = this.#narrator.buildTickNarrative(timeline, tick);
        tickNarratives.push(narrative);
        const snapshot = await this.#captureSnapshot({
            tick,
            perCombatant,
            timeline,
            tickNarratives,
            tokenPositionOverrides: reconciledEndState?.tokenPositions ?? projectedTokenPositions
        });

        return { snapshot, narrative };
    }

    /**
     * Execute the full AP-tick resolution loop for the current round.
     *
     * Iterates from tick 1 through the AP budget, evaluating each tick,
     * applying the resulting snapshot to the canvas, and persisting state
     * after each tick. Emits {@link EVENT_PHASE_CHANGED} and
     * {@link EVENT_ROUND_RESOLVED} on completion.
     *
     * GM guards should be applied by the caller before invoking this method.
     *
     * @param {{ tickDelayMs?: number }} options
     * @returns {Promise<object[]>} The completed timeline.
     */
    async resolveRound({ tickDelayMs = 1000 } = {}) {
        const result = await this.beginResolution({ persistInitialState: false });
        if (!result?.snapshots?.length) return [];

        let lastSnapshot = null;
        for (let tick = 1; tick <= result.totalTicks; tick += 1) {
            lastSnapshot = (await this.evaluateTick({
                tick,
                perCombatant: result.perCombatant,
                timeline: result.timeline,
                tickNarratives: result.tickNarratives,
                reactionRuntime: result.reactionRuntime,
                orderedCombatants: result.orderedCombatants
            })).snapshot;
            result.snapshots.push(lastSnapshot);
            await this.#applySnapshot(lastSnapshot);

            await this.#setState({
                ...this.#getState(),
                phase: tick >= result.totalTicks ? "roundComplete" : "resolving",
                timeline: deepClone(result.timeline),
                perCombatant: deepClone(result.perCombatant),
                currentEvaluationTick: tick,
                resolution: {
                    status: tick < result.totalTicks ? "running" : "complete",
                    currentTick: tick,
                    totalTicks: result.totalTicks,
                    snapshots: deepClone(result.snapshots),
                    tickNarratives: deepClone(result.tickNarratives)
                }
            });

            if (tick < result.totalTicks) {
                await wait(tickDelayMs);
            }
        }

        const round = this.#getCurrentRound();
        const currentState = this.#getState();
        const nextHistory = [
            ...toArray(currentState.roundHistory),
            this.#buildRoundHistoryEntry({
                round,
                timeline: result.timeline,
                tickNarratives: result.tickNarratives
            })
        ];

        await this.#setState({
            ...currentState,
            phase: "roundComplete",
            timeline: result.timeline,
            planningStartedAt: 0,
            perCombatant: result.perCombatant,
            currentEvaluationTick: result.totalTicks,
            roundHistory: nextHistory,
            resolution: {
                status: "complete",
                currentTick: result.totalTicks,
                totalTicks: result.totalTicks,
                snapshots: result.snapshots,
                tickNarratives: result.tickNarratives,
                reactionConsumedKeys: serializeReactionRuntime(result.reactionRuntime)
            }
        });

        this.#emit(EVENT_PHASE_CHANGED, { phase: "roundComplete", previousPhase: "resolving" });
        this.#emit(EVENT_ROUND_RESOLVED, { round, timeline: result.timeline });

        await this.#publishRoundReplay(result.timeline);
        return result.timeline;
    }

    /**
     * Step the encounter resolution backward or forward by one tick.
     *
     * Backward steps restore the previous snapshot from the cache. Forward
     * steps use the cached snapshot when available, or evaluate a new tick.
     *
     * GM guards should be applied by the caller before invoking this method.
     *
     * @param {number} direction — Positive (≥ 0) steps forward; negative steps backward.
     * @returns {Promise<object|null>} The snapshot for the target tick, or `null` when
     *   the step cannot be completed (e.g. no snapshots loaded, already at boundary).
     */
    async stepResolution(direction = 1) {
        const currentState = this.#getState();
        const resolution = currentState.resolution ?? {};
        const snapshots = toArray(resolution.snapshots);
        if (!snapshots.length) return null;

        const totalTicks = Math.max(0, toNumber(resolution.totalTicks, this.#getApBudget()));
        const currentTick = Math.max(0, Math.min(totalTicks, toNumber(resolution.currentTick, currentState.currentEvaluationTick)));
        const delta = direction >= 0 ? 1 : -1;
        const nextTick = Math.max(0, Math.min(totalTicks, currentTick + delta));
        if (nextTick === currentTick) return snapshots[nextTick] ?? null;

        if (delta < 0) {
            const snapshot = snapshots[nextTick] ?? null;
            if (!snapshot) return null;

            await this.#applySnapshot(snapshot);

            const nextPhase = "resolving";
            await this.#setState({
                ...currentState,
                phase: nextPhase,
                timeline: deepClone(toArray(snapshot.timeline)),
                perCombatant: deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
                currentEvaluationTick: nextTick,
                resolution: {
                    ...resolution,
                    currentTick: nextTick,
                    status: "paused"
                }
            });

            this.#emit(EVENT_PHASE_CHANGED, { phase: nextPhase, previousPhase: currentState.phase });

            return snapshot;
        }

        let snapshot = snapshots[nextTick] ?? null;
        if (!snapshot && nextTick > currentTick) {
            const orderedCombatants = sortByInitiativeDescending(this.#getCombatants());
            const perCombatant = deepClone(currentState.perCombatant ?? {});
            const timeline = deepClone(toArray(resolution.timeline ?? currentState.timeline));
            const tickNarratives = deepClone(toArray(resolution.tickNarratives ?? []));
            const reactionRuntime = reactionRuntimeFromResolution(resolution);

            const result = await this.evaluateTick({
                tick: nextTick,
                perCombatant,
                timeline,
                tickNarratives,
                reactionRuntime,
                orderedCombatants
            });
            snapshot = result.snapshot;
            snapshots[nextTick] = snapshot;
            tickNarratives[nextTick - 1] = result.narrative;

            await this.#applySnapshot(snapshot);

            const nextPhase = nextTick >= totalTicks ? "roundComplete" : "resolving";
            const round = this.#getCurrentRound();
            const nextRoundHistory = nextPhase === "roundComplete"
                ? this.#roundHistoryWithFinalEntry({
                    round,
                    timeline: snapshot.timeline ?? [],
                    tickNarratives,
                    existingHistory: currentState.roundHistory
                })
                : currentState.roundHistory;

            await this.#setState({
                ...currentState,
                phase: nextPhase,
                timeline: deepClone(toArray(snapshot.timeline)),
                perCombatant: deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
                currentEvaluationTick: nextTick,
                planningStartedAt: nextPhase === "roundComplete" ? 0 : currentState.planningStartedAt,
                roundHistory: nextRoundHistory,
                resolution: {
                    ...resolution,
                    currentTick: nextTick,
                    status: nextTick >= totalTicks ? "complete" : "paused",
                    snapshots: deepClone(snapshots),
                    tickNarratives: deepClone(tickNarratives),
                    reactionConsumedKeys: serializeReactionRuntime(reactionRuntime)
                }
            });

            this.#emit(EVENT_PHASE_CHANGED, { phase: nextPhase, previousPhase: currentState.phase });

            if (nextPhase === "roundComplete") {
                this.#emit(EVENT_ROUND_RESOLVED, { round, timeline: snapshot.timeline ?? [] });
            }

            return snapshot;
        }

        if (!snapshot) return null;

        await this.#applySnapshot(snapshot);

        const nextPhase = nextTick >= totalTicks ? "roundComplete" : "resolving";
        const round = this.#getCurrentRound();
        const tickNarratives = deepClone(toArray(snapshot.tickNarratives ?? resolution.tickNarratives ?? []));
        const nextRoundHistory = nextPhase === "roundComplete"
            ? this.#roundHistoryWithFinalEntry({
                round,
                timeline: snapshot.timeline ?? [],
                tickNarratives,
                existingHistory: currentState.roundHistory
            })
            : currentState.roundHistory;

        await this.#setState({
            ...currentState,
            phase: nextPhase,
            timeline: deepClone(toArray(snapshot.timeline)),
            perCombatant: deepClone(snapshot.perCombatant ?? currentState.perCombatant ?? {}),
            currentEvaluationTick: nextTick,
            planningStartedAt: nextPhase === "roundComplete" ? 0 : currentState.planningStartedAt,
            roundHistory: nextRoundHistory,
            resolution: {
                ...resolution,
                currentTick: nextTick,
                status: nextTick >= totalTicks ? "complete" : "paused",
                tickNarratives
            }
        });

        this.#emit(EVENT_PHASE_CHANGED, { phase: nextPhase, previousPhase: currentState.phase });

        if (nextPhase === "roundComplete") {
            this.#emit(EVENT_ROUND_RESOLVED, { round, timeline: snapshot.timeline ?? [] });
        }

        return snapshot;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Evaluate a single combatant's action, returning an outcome object.
     *
     * Movement, reaction, item, defense, and attack branches are each handled
     * separately. The result is always a plain outcome object — no mutations
     * of encounter state occur here.
     *
     * @param {object} combatant
     * @param {object} action
     * @param {{
     *   tick?:               number,
     *   perCombatant?:       object,
     *   reactionRuntime?:    object,
     *   reactionContext?:    object,
     *   evaluationSnapshot?: object,
     *   applyEffects?:       boolean,
     *   tokenPositions?:     object
     * }} opts
     * @returns {Promise<object>} outcome
     */
    async #resolveAction(combatant, action, {
        tick = 0,
        perCombatant = {},
        reactionRuntime = null,
        reactionContext = null,
        evaluationSnapshot = null,
        applyEffects = true,
        tokenPositions = null
    } = {}) {
        const actor = combatant.actor;
        const item = action.itemId ? actor?.items?.get(action.itemId) : null;

        if (action.type === "movement") {
            return {
                result: "moved",
                detail: `${combatant.name} advances ${toNumber(action.movementFeet, 10)} ft.`
            };
        }

        if (action.isReaction) {
            if (reactionContext?.sourceAction) {
                return {
                    result: "reactionResolved",
                    detail: `${combatant.name} resolves ${reactionContext.sourceLabel ?? action.label}.`
                };
            }

            return {
                result: "reactionExpired",
                detail: `${combatant.name} finds no trigger for ${action.label}.`
            };
        }

        if (item) {
            const useResult = await this.#checkItemAction(item, actor, action.actionId);
            if (useResult && !useResult.success) {
                return {
                    result: "failed",
                    detail: `${combatant.name} cannot complete ${action.label} (${useResult.reason}).`
                };
            }
        }

        if (action.type === "defense") {
            return {
                result: "defended",
                detail: `${combatant.name} braces defensively for ${Math.max(1, toNumber(action.apCost, 1))} AP.`
            };
        }

        if (!action.requiresToHit && action.type !== "attack") {
            return {
                result: "resolved",
                detail: `${combatant.name} completes ${action.label}.`
            };
        }

        return this.#attackResolver.resolveAttack({
            combatant,
            action,
            tick,
            perCombatant,
            reactionRuntime,
            evaluationSnapshot,
            tokenPositions,
            applyEffects
        });
    }

    /**
     * Build a single round-history entry.
     *
     * @param {{ round: number, timeline: object[], tickNarratives: object[] }} opts
     * @returns {object}
     */
    #buildRoundHistoryEntry({ round = 1, timeline = [], tickNarratives = [] } = {}) {
        return {
            round,
            resolvedAt: Date.now(),
            timeline: deepClone(toArray(timeline)),
            tickNarratives: deepClone(toArray(tickNarratives))
        };
    }

    /**
     * Return a new round-history array with the current round appended as the
     * final entry. If a matching entry for the same round already exists it is
     * replaced; otherwise the entry is appended.
     *
     * @param {{
     *   round:           number,
     *   timeline:        object[],
     *   tickNarratives:  object[],
     *   existingHistory: object[]
     * }} opts
     * @returns {object[]}
     */
    #roundHistoryWithFinalEntry({ round = 1, timeline = [], tickNarratives = [], existingHistory = [] } = {}) {
        const history = toArray(existingHistory);
        const newEntry = this.#buildRoundHistoryEntry({ round, timeline, tickNarratives });
        const existing = history.findIndex((e) => e?.round === round);
        if (existing >= 0) {
            return [...history.slice(0, existing), newEntry, ...history.slice(existing + 1)];
        }
        return [...history, newEntry];
    }
}
