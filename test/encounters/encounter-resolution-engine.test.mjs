import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EncounterResolutionEngine } from "../../module/encounters/encounter-resolution-engine.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(overrides = {}) {
    return {
        id: "c1",
        name: "Alice",
        initiative: 10,
        actor: null,
        ...overrides
    };
}

function makeAction(overrides = {}) {
    return {
        id: "move",
        actionId: "move",
        type: "movement",
        label: "Move",
        apCost: 1,
        apMin: 1,
        apMax: 1,
        ...overrides
    };
}

function makeNullResolvers() {
    return {
        movementResolver: {
            planMovement: () => null
        },
        attackResolver: {
            resolveAttack: async () => ({ result: "hit", detail: "Hit.", pendingDamage: null })
        },
        reactionResolver: {
            resolveOverwatch: async () => ({ entries: [], effects: [] }),
            findReactionAtTick: () => null
        },
        collisionResolver: {
            resolveTickEndGridConflicts: async ({ snapshot } = {}) => snapshot ?? {}
        },
        consumptionResolver: {
            buildTickReconcilePlan: () => ({ consumeEffects: [], movementEffects: [], damageEntries: [] }),
            buildSimultaneousDamageEntriesFromTimeline: () => [],
            markTimelineEntryInterrupted: () => {},
            validateCompletionBoundary: () => ({ valid: true }),
            applyConsumeActionEffect: async () => {},
            applySimultaneousDamageEntries: async () => {}
        },
        narrator: {
            buildTickNarrative: (entries, tick) => ({ tick, entries: [] })
        }
    };
}

/**
 * Build an engine with all ports wired from a plain options bag. Callers can
 * override individual fields; everything else gets a sensible no-op default.
 */
function makeEngine({
    state = {},
    apBudget = 3,
    round = 1,
    combatants = [],
    stateLog = [],
    snapshotLog = [],
    applyLog = [],
    originLog = [],
    emitLog = [],
    replayLog = [],
    snapshotBuilder = null,
    isCombatantIncapacitated = () => false,
    resolveDeclaredTarget = () => null,
    checkItemAction = async () => undefined,
    resolvers = null
} = {}) {
    let currentState = { ...state };

    const captureSnapshot = snapshotBuilder ?? (async (opts) => {
        const snap = { tick: opts.tick ?? 0, perCombatant: opts.perCombatant ?? {}, timeline: opts.timeline ?? [], tokenPositions: opts.tokenPositionOverrides ?? {} };
        snapshotLog.push(snap);
        return snap;
    });

    const r = resolvers ?? makeNullResolvers();

    return new EncounterResolutionEngine({
        getState: () => currentState,
        setState: async (next) => { currentState = next; stateLog.push(next); },
        getApBudget: () => apBudget,
        getMovementFeetPerAp: () => 10,
        getCurrentRound: () => round,
        getCombatants: () => combatants,
        resolveCombatant: (id) => combatants.find((c) => c.id === id) ?? null,
        captureSnapshot,
        applySnapshot: async (snap) => { applyLog.push(snap); },
        restorePlanningOrigins: async (pc) => { originLog.push(pc); },
        isCombatantIncapacitated,
        resolveDeclaredTarget,
        checkItemAction,
        publishRoundReplay: async (tl) => { replayLog.push(tl); },
        emit: (name, payload) => { emitLog.push({ name, payload }); },
        ...r
    });
}

// ---------------------------------------------------------------------------
// beginResolution
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.beginResolution", () => {
    it("returns a structured resolution context", async () => {
        const engine = makeEngine({
            state: { perCombatant: { c1: { remainingAp: 3, spentAp: 0, progress: 0, pointer: 0, plan: [] } } },
            apBudget: 4,
            combatants: [makeCombatant()]
        });
        const result = await engine.beginResolution({ persistInitialState: false });

        assert.ok(Array.isArray(result.snapshots));
        assert.equal(result.snapshots.length, 1, "initial snapshot captured");
        assert.equal(result.totalTicks, 4);
        assert.ok(Array.isArray(result.orderedCombatants));
        assert.ok(Array.isArray(result.timeline));
        assert.ok(result.reactionRuntime.consumedKeys instanceof Set);
    });

    it("orders combatants by initiative descending", async () => {
        const low = makeCombatant({ id: "c1", initiative: 5 });
        const high = makeCombatant({ id: "c2", initiative: 15 });
        const engine = makeEngine({ combatants: [low, high] });
        const result = await engine.beginResolution({ persistInitialState: false });
        assert.equal(result.orderedCombatants[0].id, "c2");
        assert.equal(result.orderedCombatants[1].id, "c1");
    });

    it("calls restorePlanningOrigins with a deep-clone of perCombatant", async () => {
        const originLog = [];
        const origPc = { c1: { remainingAp: 2 } };
        const engine = makeEngine({ state: { perCombatant: origPc }, originLog });
        await engine.beginResolution({ persistInitialState: false });
        assert.equal(originLog.length, 1);
        // Deep clone — mutating the result should not affect the original
        originLog[0].c1.remainingAp = 99;
        assert.equal(origPc.c1.remainingAp, 2, "original perCombatant not mutated");
    });

    it("persists resolving state when persistInitialState is true", async () => {
        const stateLog = [];
        const engine = makeEngine({ stateLog, apBudget: 2 });
        await engine.beginResolution({ persistInitialState: true });
        assert.equal(stateLog.length, 1);
        assert.equal(stateLog[0].phase, "resolving");
        assert.equal(stateLog[0].resolution?.totalTicks, 2);
    });

    it("does not write state when persistInitialState is false", async () => {
        const stateLog = [];
        const engine = makeEngine({ stateLog });
        await engine.beginResolution({ persistInitialState: false });
        assert.equal(stateLog.length, 0, "setState not called");
    });

    it("captures tick-0 snapshot", async () => {
        const snapshotLog = [];
        const engine = makeEngine({ snapshotLog });
        await engine.beginResolution({ persistInitialState: false });
        assert.equal(snapshotLog.length, 1);
        assert.equal(snapshotLog[0].tick, 0);
    });
});

// ---------------------------------------------------------------------------
// evaluateTick — Phase 1 combatant iteration
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.evaluateTick — combatant iteration", () => {
    it("skips combatant with no remaining AP", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const perCombatant = { c1: { remainingAp: 0, spentAp: 3, progress: 0, pointer: 0, plan: [] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline.length, 0, "no entry for AP-exhausted combatant");
    });

    it("produces 'incapacitated' entry when combatant cannot act", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [] } };
        const timeline = [];
        const engine = makeEngine({
            combatants: [combatant],
            isCombatantIncapacitated: () => true
        });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline.length, 1);
        assert.equal(timeline[0].outcome.result, "incapacitated");
    });

    it("produces 'interrupted' entry when incapacitated mid-action", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ apCost: 2 });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 1, progress: 1, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({
            combatants: [combatant],
            isCombatantIncapacitated: () => true
        });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline[0].outcome.result, "interrupted");
    });

    it("produces 'forfeit' entry when no action is planned", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline.length, 1);
        assert.equal(timeline[0].outcome.result, "forfeit");
    });

    it("produces 'failed' when movement requiresTarget but no targetId", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "movement", requiresTarget: true, targetId: null });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline[0].outcome.result, "failed");
    });

    it("produces 'movementStep' entry for movement action", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ id: "walk", type: "movement", apCost: 1 });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.ok(timeline.some((e) => e.outcome.result === "movementStep"), "movementStep entry present");
    });

    it("produces 'progress' entry while multi-AP action is in progress", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "attack", apCost: 2 });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline[0].outcome.result, "progress");
        assert.equal(perCombatant.c1.progress, 1, "progress counter incremented");
        assert.equal(perCombatant.c1.pointer, 0, "pointer not advanced yet");
    });

    it("produces 'reactionReady' while reaction action is in progress", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "attack", apCost: 2, isReaction: true });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(timeline[0].outcome.result, "reactionReady");
    });

    it("advances pointer when action completes", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "defense", apCost: 1 });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({ combatants: [combatant] });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(perCombatant.c1.pointer, 1, "pointer advanced after completion");
        assert.equal(perCombatant.c1.progress, 0, "progress reset after completion");
    });
});

// ---------------------------------------------------------------------------
// evaluateTick — Phase 1 attack / item resolution
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.evaluateTick — action resolution", () => {
    it("calls attackResolver when action requires a hit roll", async () => {
        const attackLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "attack", apCost: 1, requiresToHit: true });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];

        const r = makeNullResolvers();
        r.attackResolver.resolveAttack = async (opts) => {
            attackLog.push(opts);
            return { result: "hit", detail: "Hit.", pendingDamage: { targetCombatantId: "c2", amount: 5 } };
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(attackLog.length, 1, "attackResolver was called");
        assert.equal(timeline[0].outcome.result, "hit");
    });

    it("pushes consumeAction effect when itemId is present and action succeeds", async () => {
        const consumeLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "consumable", apCost: 1, itemId: "item1", actionId: "use" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];

        const r = makeNullResolvers();
        r.consumptionResolver.buildTickReconcilePlan = ({ tickEffects }) => {
            consumeLog.push(...tickEffects.filter((e) => e.type === "consumeAction"));
            return { consumeEffects: [], movementEffects: [], damageEntries: [] };
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(consumeLog.length, 1);
        assert.equal(consumeLog[0].itemId, "item1");
    });

    it("does not push consumeAction when reaction action has already triggered", async () => {
        const effectLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "attack", apCost: 1, isReaction: true, itemId: "item1", actionId: "react" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];

        const r = makeNullResolvers();
        r.reactionResolver.findReactionAtTick = () => ({ consumed: true });
        r.consumptionResolver.buildTickReconcilePlan = ({ tickEffects }) => {
            effectLog.push(...tickEffects);
            return { consumeEffects: [], movementEffects: [], damageEntries: [] };
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        const consumeEffects = effectLog.filter((e) => e.type === "consumeAction");
        assert.equal(consumeEffects.length, 0, "no consumeAction pushed for already-triggered reaction");
        assert.equal(timeline[0].outcome.result, "reactionResolved");
    });

    it("calls checkItemAction for item-backed action and marks failed if unsuccessful", async () => {
        const checkLog = [];
        const actor = { items: { get: () => ({ id: "item1" }) } };
        const combatant = makeCombatant({ id: "c1", actor });
        const action = makeAction({ type: "consumable", apCost: 1, itemId: "item1", actionId: "use" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };
        const timeline = [];
        const engine = makeEngine({
            combatants: [combatant],
            checkItemAction: async (item, a, actionId) => {
                checkLog.push({ item, actor: a, actionId });
                return { success: false, reason: "empty" };
            }
        });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline, tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(checkLog.length, 1, "checkItemAction called");
        assert.equal(timeline[0].outcome.result, "failed");
    });
});

// ---------------------------------------------------------------------------
// evaluateTick — Phase 2/3 reconciliation
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.evaluateTick — reconciliation", () => {
    it("calls buildTickReconcilePlan with accumulated tickEffects", async () => {
        const planLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "movement", apCost: 1 });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };

        const r = makeNullResolvers();
        r.consumptionResolver.buildTickReconcilePlan = (opts) => {
            planLog.push(opts);
            return { consumeEffects: [], movementEffects: [], damageEntries: [] };
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline: [], tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(planLog.length, 1);
    });

    it("calls collisionResolver.resolveTickEndGridConflicts", async () => {
        const collisionLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [] } };

        const r = makeNullResolvers();
        r.collisionResolver.resolveTickEndGridConflicts = async (opts) => {
            collisionLog.push(opts);
            return opts.snapshot ?? {};
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline: [], tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.equal(collisionLog.length, 1, "collision resolver called once per tick");
    });

    it("returns { snapshot, narrative } from evaluateTick", async () => {
        const combatant = makeCombatant({ id: "c1" });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [] } };
        const engine = makeEngine({ combatants: [combatant] });

        const result = await engine.evaluateTick({ tick: 1, perCombatant, timeline: [], tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.ok(result.snapshot !== undefined, "snapshot returned");
        assert.ok(result.narrative !== undefined, "narrative returned");
    });

    it("validates completion boundary twice per tick (pre- and post-damage)", async () => {
        const validateLog = [];
        const combatant = makeCombatant({ id: "c1" });
        const action = makeAction({ type: "attack", apCost: 1, requiresToHit: true });
        const perCombatant = { c1: { remainingAp: 1, spentAp: 0, progress: 0, pointer: 0, plan: [action] } };

        const r = makeNullResolvers();
        r.attackResolver.resolveAttack = async () => ({ result: "hit", detail: "Hit." });
        r.consumptionResolver.validateCompletionBoundary = (opts) => {
            validateLog.push(opts);
            return { valid: true };
        };
        const engine = makeEngine({ combatants: [combatant], resolvers: r });

        await engine.evaluateTick({ tick: 1, perCombatant, timeline: [], tickNarratives: [], reactionRuntime: { consumedKeys: new Set() }, orderedCombatants: [combatant] });
        assert.ok(validateLog.length >= 2, "boundary validation called at least twice");
    });
});

// ---------------------------------------------------------------------------
// resolveRound
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.resolveRound", () => {
    it("emits phaseChanged and roundResolved at completion", async () => {
        const emitLog = [];
        const engine = makeEngine({ apBudget: 1, emitLog });
        await engine.resolveRound({ tickDelayMs: 0 });

        const names = emitLog.map((e) => e.name);
        assert.ok(names.includes("phaseChanged"), "phaseChanged emitted");
        assert.ok(names.includes("roundResolved"), "roundResolved emitted");
    });

    it("calls publishRoundReplay with the final timeline", async () => {
        const replayLog = [];
        const engine = makeEngine({ apBudget: 1, replayLog });
        await engine.resolveRound({ tickDelayMs: 0 });
        assert.equal(replayLog.length, 1, "publishRoundReplay called once");
        assert.ok(Array.isArray(replayLog[0]));
    });

    it("applies snapshot after each tick", async () => {
        const applyLog = [];
        const engine = makeEngine({ apBudget: 3, applyLog });
        await engine.resolveRound({ tickDelayMs: 0 });
        assert.equal(applyLog.length, 3, "snapshot applied for each of 3 ticks");
    });

    it("persists final state with phase roundComplete", async () => {
        const stateLog = [];
        const engine = makeEngine({ apBudget: 1, stateLog });
        await engine.resolveRound({ tickDelayMs: 0 });
        const finalState = stateLog.at(-1);
        assert.equal(finalState.phase, "roundComplete");
        assert.equal(finalState.resolution.status, "complete");
    });

    it("writes round history entry with round number", async () => {
        const stateLog = [];
        const engine = makeEngine({ apBudget: 1, round: 3, stateLog });
        await engine.resolveRound({ tickDelayMs: 0 });
        const finalState = stateLog.at(-1);
        assert.ok(Array.isArray(finalState.roundHistory), "roundHistory present");
        assert.equal(finalState.roundHistory.at(-1).round, 3);
    });

    it("returns the timeline array", async () => {
        const engine = makeEngine({ apBudget: 1 });
        const timeline = await engine.resolveRound({ tickDelayMs: 0 });
        assert.ok(Array.isArray(timeline));
    });

    it("evaluates each AP tick in sequence", async () => {
        const ticks = [];
        const r = makeNullResolvers();
        const snapshotBuilder = async (opts) => {
            if (opts.tick > 0) ticks.push(opts.tick);
            return { tick: opts.tick, perCombatant: {}, timeline: [], tokenPositions: {} };
        };
        const engine = makeEngine({ apBudget: 3, resolvers: r, snapshotBuilder });
        await engine.resolveRound({ tickDelayMs: 0 });
        // At least one snapshot per tick (multiple captures happen per tick)
        assert.ok(ticks.some((t) => t === 1), "tick 1 captured");
        assert.ok(ticks.some((t) => t === 2), "tick 2 captured");
        assert.ok(ticks.some((t) => t === 3), "tick 3 captured");
    });
});

// ---------------------------------------------------------------------------
// stepResolution — backward
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.stepResolution — backward", () => {
    function makeEngineWithSnapshots(snapshotCount, extraOpts = {}) {
        const snapshots = Array.from({ length: snapshotCount + 1 }, (_, i) => ({
            tick: i, perCombatant: {}, timeline: [], tokenPositions: {}
        }));
        const stateLog = [];
        const applyLog = [];
        const emitLog = [];
        const engine = makeEngine({
            state: {
                phase: "resolving",
                perCombatant: {},
                currentEvaluationTick: snapshotCount,
                resolution: {
                    status: "paused",
                    currentTick: snapshotCount,
                    totalTicks: snapshotCount,
                    snapshots,
                    tickNarratives: [],
                    reactionConsumedKeys: []
                }
            },
            apBudget: snapshotCount,
            stateLog,
            applyLog,
            emitLog,
            ...extraOpts
        });
        return { engine, stateLog, applyLog, emitLog };
    }

    it("returns null when no snapshots available", async () => {
        const engine = makeEngine({
            state: { resolution: { snapshots: [], currentTick: 0, totalTicks: 3 } }
        });
        const result = await engine.stepResolution(-1);
        assert.equal(result, null);
    });

    it("restores the previous snapshot going backward", async () => {
        const { engine, applyLog } = makeEngineWithSnapshots(3);
        const result = await engine.stepResolution(-1);
        assert.ok(result !== null, "snapshot returned");
        assert.equal(applyLog.length, 1, "snapshot applied");
        assert.equal(result.tick, 2, "tick 2 snapshot restored");
    });

    it("persists phase resolving when stepping back", async () => {
        const { engine, stateLog } = makeEngineWithSnapshots(3);
        await engine.stepResolution(-1);
        assert.equal(stateLog.at(-1).phase, "resolving");
        assert.equal(stateLog.at(-1).resolution.status, "paused");
    });

    it("emits phaseChanged on backward step", async () => {
        const { engine, emitLog } = makeEngineWithSnapshots(3);
        await engine.stepResolution(-1);
        assert.ok(emitLog.some((e) => e.name === "phaseChanged"), "phaseChanged emitted");
    });

    it("does not step below tick 0", async () => {
        const { engine, applyLog } = makeEngineWithSnapshots(3);
        // Already at tick 0
        const engine0 = makeEngine({
            state: {
                phase: "resolving",
                resolution: { currentTick: 0, totalTicks: 3, snapshots: [{ tick: 0 }] }
            }
        });
        const result = await engine0.stepResolution(-1);
        // Should return the tick-0 snapshot without applying
        assert.equal(result?.tick ?? null, 0);
    });
});

// ---------------------------------------------------------------------------
// stepResolution — forward (cached snapshot)
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.stepResolution — forward from cache", () => {
    function makeEngineAtTick(currentTick, totalTicks) {
        const snapshots = Array.from({ length: totalTicks + 1 }, (_, i) => ({
            tick: i, perCombatant: {}, timeline: [], tokenPositions: {}
        }));
        const stateLog = [];
        const applyLog = [];
        const emitLog = [];
        const engine = makeEngine({
            state: {
                phase: "resolving",
                perCombatant: {},
                currentEvaluationTick: currentTick,
                resolution: {
                    status: "paused",
                    currentTick,
                    totalTicks,
                    snapshots,
                    tickNarratives: [],
                    reactionConsumedKeys: []
                }
            },
            apBudget: totalTicks,
            stateLog,
            applyLog,
            emitLog
        });
        return { engine, stateLog, applyLog, emitLog };
    }

    it("steps forward using the cached snapshot", async () => {
        const { engine, applyLog } = makeEngineAtTick(1, 3);
        const result = await engine.stepResolution(1);
        assert.equal(result?.tick, 2, "tick 2 snapshot returned");
        assert.equal(applyLog.length, 1, "snapshot applied");
    });

    it("transitions to roundComplete when reaching final tick", async () => {
        const { engine, stateLog, emitLog } = makeEngineAtTick(2, 3);
        await engine.stepResolution(1);
        assert.equal(stateLog.at(-1)?.phase, "roundComplete");
        assert.ok(emitLog.some((e) => e.name === "roundResolved"), "roundResolved emitted at final tick");
    });

    it("does not step beyond totalTicks", async () => {
        const { engine } = makeEngineAtTick(3, 3);
        const result = await engine.stepResolution(1);
        assert.equal(result?.tick, 3, "remains at final tick");
    });
});

// ---------------------------------------------------------------------------
// stepResolution — forward (evaluate new tick)
// ---------------------------------------------------------------------------

describe("EncounterResolutionEngine.stepResolution — forward, evaluating a new tick", () => {
    it("evaluates a new tick when no cached snapshot exists", async () => {
        const evaluateLog = [];
        const snapshots = [
            { tick: 0, perCombatant: {}, timeline: [], tokenPositions: {} },
            { tick: 1, perCombatant: {}, timeline: [], tokenPositions: {} }
            // tick 2 deliberately absent
        ];
        const r = makeNullResolvers();
        const stateLog = [];
        const applyLog = [];
        const emitLog = [];
        const engine = makeEngine({
            state: {
                phase: "resolving",
                perCombatant: {},
                currentEvaluationTick: 1,
                resolution: {
                    status: "paused",
                    currentTick: 1,
                    totalTicks: 3,
                    snapshots,
                    tickNarratives: [],
                    reactionConsumedKeys: []
                }
            },
            apBudget: 3,
            stateLog,
            applyLog,
            emitLog,
            resolvers: r,
            snapshotBuilder: async (opts) => {
                if (opts.tick === 2) evaluateLog.push(opts.tick);
                return { tick: opts.tick, perCombatant: opts.perCombatant ?? {}, timeline: [], tokenPositions: {} };
            }
        });

        const result = await engine.stepResolution(1);
        assert.ok(result !== null, "result returned");
        assert.ok(evaluateLog.length > 0, "new tick was evaluated");
        assert.equal(applyLog.length, 1, "snapshot applied");
    });
});
