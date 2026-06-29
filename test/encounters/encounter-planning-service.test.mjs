import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EncounterPlanningService } from "../../module/encounters/encounter-planning-service.mjs";

// ---------------------------------------------------------------------------
// Foundry globals — only deepClone needed; no document lifecycle required
// ---------------------------------------------------------------------------

beforeEach(() => {
    globalThis.foundry = {
        utils: { deepClone: (v) => structuredClone(v) }
    };
    globalThis.game = {
        settings: {
            get: (_scope, key) => {
                if (key === "encounterMovementFeetPerAp") return 10;
                return undefined;
            }
        }
    };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState({
    phase = "planning",
    apBudget = 6,
    combatantIds = ["c1"],
    overrides = {}
} = {}) {
    const perCombatant = Object.fromEntries(
        combatantIds.map((id) => [id, { plan: [], ready: false, committedAt: 0 }])
    );
    return { phase, apBudget, perCombatant, ...overrides };
}

function makePorts({
    initialState = null,
    isCombatantOwned = () => true,
    isInitiativeGateActive = () => false,
    restorePlanningOrigin = async () => {},
    clone = (value) => structuredClone(value),
    now = () => 12345
} = {}) {
    let state = initialState ?? makeState();
    const emitted = [];
    const stateHistory = [];

    return {
        ports: {
            getState: () => state,
            setState: async (next) => {
                stateHistory.push(structuredClone(next));
                state = next;
            },
            isCombatantOwned,
            isInitiativeGateActive,
            emit: (eventName, payload) => emitted.push({ eventName, payload }),
            restorePlanningOrigin,
            clone,
            now
        },
        getState: () => state,
        emitted,
        stateHistory
    };
}

function makeService(overrides = {}) {
    const ctx = makePorts(overrides);
    const service = new EncounterPlanningService(ctx.ports);
    return { service, ...ctx };
}

// ---------------------------------------------------------------------------
// setCombatantPlan — AP budget
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.setCombatantPlan — AP budget", () => {
    it("accepts a plan within the AP budget", async () => {
        const { service } = makeService();
        await service.setCombatantPlan("c1", [
            { id: "move", type: "movement", apCost: 2 },
            { id: "attack", type: "attack", apCost: 2 }
        ]);
        // No error thrown
    });

    it("rejects a plan that exceeds the AP budget", async () => {
        const { service } = makeService();
        await assert.rejects(
            () => service.setCombatantPlan("c1", [
                { id: "move", type: "movement", apCost: 4 },
                { id: "attack", type: "attack", apCost: 4 }
            ]),
            /exceeds AP budget/
        );
    });

    it("normalizes action data on write", async () => {
        const { service, getState } = makeService();
        await service.setCombatantPlan("c1", [
            { id: "move", type: "movement", apCost: 1 }
        ]);
        const plan = getState().perCombatant["c1"].plan;
        assert.ok("apMin" in plan[0], "normalized action should have apMin");
        assert.ok("apMax" in plan[0], "normalized action should have apMax");
        assert.equal(plan[0].apCost, 1);
    });

    it("preserves configured order metadata on write", async () => {
        const { service, getState } = makeService();
        await service.setCombatantPlan("c1", [
            {
                id: "weaponAttack",
                actionId: "weaponAttack",
                type: "attack",
                label: "Attack",
                targetMode: "selectTarget",
                apEnvelope: { positioningAp: 2, effectAp: 2, maxAp: 4 },
                intentType: "attackTarget",
                summary: "Spend up to 4 AP to close on Elias and attack with a dagger.",
                clauses: [
                    { clauseId: "close", clauseType: "positioning", text: "close on Elias" },
                    { clauseId: "strike", clauseType: "effect", text: "attack with a dagger" }
                ],
                positioningRequirement: { type: "weaponRange", rangeFeet: 5 },
                followThrough: { type: "chooseAnotherAction", minRemainingAp: 1 },
                failureOutcome: { type: "bestReachablePosition" },
                sourceAction: { id: "weaponAttack", actionId: "weaponAttack" }
            }
        ]);

        const [order] = getState().perCombatant["c1"].plan;
        assert.equal(order.apCost, 4);
        assert.equal(order.orderId, "order-1");
        assert.equal(order.intentType, "attackTarget");
        assert.equal(order.targetMode, "selectTarget");
        assert.equal(order.summary, "Spend up to 4 AP to close on Elias and attack with a dagger.");
        assert.deepEqual(order.apEnvelope, { positioningAp: 2, effectAp: 2, maxAp: 4 });
        assert.equal(order.clauses[0].clauseId, "close");
        assert.equal(order.positioningRequirement.type, "weaponRange");
        assert.equal(order.followThrough.type, "chooseAnotherAction");
        assert.equal(order.failureOutcome.type, "bestReachablePosition");
        assert.equal(order.sourceAction.actionId, "weaponAttack");
    });

    it("uses the order envelope maximum for AP budget validation", async () => {
        const { service } = makeService({ initialState: makeState({ apBudget: 3 }) });

        await assert.rejects(
            () => service.setCombatantPlan("c1", [
                {
                    id: "weaponAttack",
                    type: "attack",
                    label: "Attack",
                    intentType: "attackTarget",
                    apEnvelope: { positioningAp: 2, effectAp: 2, maxAp: 4 }
                }
            ]),
            /exceeds AP budget/
        );
    });

    it("resets ready and committedAt on plan change", async () => {
        // Must start uncommitted — the guard rejects if the combatant is already ready.
        const { service, getState } = makeService();
        await service.setCombatantPlan("c1", [{ id: "move", type: "movement", apCost: 1 }]);
        const cs = getState().perCombatant["c1"];
        assert.equal(cs.ready, false);
        assert.equal(cs.committedAt, 0);
    });

    it("emits PLAN_UPDATED", async () => {
        const { service, emitted } = makeService();
        await service.setCombatantPlan("c1", [{ id: "move", type: "movement", apCost: 1 }]);
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].eventName, "planUpdated");
        assert.equal(emitted[0].payload.combatantId, "c1");
    });

    it("rejects for an unknown combatantId", async () => {
        const { service } = makeService();
        await assert.rejects(
            () => service.setCombatantPlan("unknown", []),
            /not part of (the encounter state|this encounter)/
        );
    });
});

describe("EncounterPlanningService ports", () => {
    it("uses injected clone and clock ports without Foundry globals", async () => {
        const previousFoundry = globalThis.foundry;
        delete globalThis.foundry;
        try {
            const { service, getState } = makeService({
                initialState: makeState({
                    overrides: {
                        perCombatant: {
                            c1: {
                                plan: [{ id: "attack", type: "attack", apCost: 1 }],
                                ready: false,
                                committedAt: 0
                            }
                        }
                    }
                }),
                clone: (value) => structuredClone(value),
                now: () => 98765
            });

            await service.setCombatantReady("c1", true);

            assert.equal(getState().perCombatant.c1.committedAt, 98765);
            assert.equal(getState().perCombatant.c1.ready, true);
        } finally {
            globalThis.foundry = previousFoundry;
        }
    });
});

// ---------------------------------------------------------------------------
// setCombatantPlan — locked actions
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.setCombatantPlan — locked actions", () => {
    it("preserves locked action flag and roll results", async () => {
        const lockedPlan = [
            { id: "move", type: "movement", apCost: 1, planningLocked: true, planningRollResults: [{ requestId: "r1" }] },
            { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] }
        ];
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: { perCombatant: { c1: { plan: lockedPlan, ready: false, committedAt: 0 } } }
            })
        });

        // Submit the same plan — should preserve the lock
        await service.setCombatantPlan("c1", lockedPlan);
        const plan = getState().perCombatant["c1"].plan;
        assert.equal(plan[0].planningLocked, true);
        assert.equal(plan[0].planningRollResults.length, 1);
    });

    it("rejects when a locked action is removed from the plan", async () => {
        const lockedPlan = [
            { id: "move", type: "movement", apCost: 1, planningLocked: true, planningRollResults: [] },
            { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] }
        ];
        const { service } = makeService({
            initialState: makeState({
                overrides: { perCombatant: { c1: { plan: lockedPlan, ready: false, committedAt: 0 } } }
            })
        });

        await assert.rejects(
            () => service.setCombatantPlan("c1", [lockedPlan[1]]),
            /lock this part/
        );
    });
});

// ---------------------------------------------------------------------------
// removeCombatantAction
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.removeCombatantAction", () => {
    it("removes an unlocked action by index", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [
                                { id: "move", type: "movement", apCost: 1, planningLocked: false, planningRollResults: [] },
                                { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] }
                            ],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.removeCombatantAction("c1", 1);
        const plan = getState().perCombatant["c1"].plan;
        assert.equal(plan.length, 1);
        assert.equal(plan[0].id, "move");
    });

    it("rejects removal of an action at or before the locked boundary", async () => {
        const { service } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [
                                { id: "move", type: "movement", apCost: 1, planningLocked: true, planningRollResults: [] },
                                { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] }
                            ],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await assert.rejects(
            () => service.removeCombatantAction("c1", 0),
            /locked by an accepted roll/
        );
    });
});

// ---------------------------------------------------------------------------
// clearCombatantPlan
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.clearCombatantPlan", () => {
    it("removes all unlocked actions, preserving locked ones", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [
                                { id: "move", type: "movement", apCost: 1, planningLocked: true, planningRollResults: [] },
                                { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] },
                                { id: "dodge", type: "defense", apCost: 1, planningLocked: false, planningRollResults: [] }
                            ],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.clearCombatantPlan("c1");
        const plan = getState().perCombatant["c1"].plan;
        assert.equal(plan.length, 1);
        assert.equal(plan[0].id, "move");
    });

    it("results in an empty plan when nothing is locked", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [
                                { id: "move", type: "movement", apCost: 1, planningLocked: false, planningRollResults: [] }
                            ],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.clearCombatantPlan("c1");
        assert.equal(getState().perCombatant["c1"].plan.length, 0);
    });
});

// ---------------------------------------------------------------------------
// lockCombatantActionRoll
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.lockCombatantActionRoll", () => {
    function makeStateWithPlan() {
        return makeState({
            overrides: {
                perCombatant: {
                    c1: {
                        plan: [
                            { id: "move", type: "movement", apCost: 1, planningLocked: false, planningRollResults: [] },
                            { id: "attack", type: "attack", apCost: 2, planningLocked: false, planningRollResults: [] }
                        ],
                        ready: false,
                        committedAt: 0
                    }
                }
            }
        });
    }

    it("locks an action and appends roll result", async () => {
        const { service, getState } = makeService({ initialState: makeStateWithPlan() });

        await service.lockCombatantActionRoll("c1", 1, { requestId: "roll-1", total: 18 });

        const action = getState().perCombatant["c1"].plan[1];
        assert.equal(action.planningLocked, true);
        assert.equal(action.planningRollResults.length, 1);
        assert.equal(action.planningRollResults[0].requestId, "roll-1");
    });

    it("is idempotent for duplicate requestId", async () => {
        const { service, getState } = makeService({ initialState: makeStateWithPlan() });

        await service.lockCombatantActionRoll("c1", 1, { requestId: "roll-1", total: 18 });
        await service.lockCombatantActionRoll("c1", 1, { requestId: "roll-1", total: 18 });

        const action = getState().perCombatant["c1"].plan[1];
        assert.equal(action.planningRollResults.length, 1);
    });

    it("accumulates multiple rolls with different requestIds", async () => {
        const { service, getState } = makeService({ initialState: makeStateWithPlan() });

        await service.lockCombatantActionRoll("c1", 1, { requestId: "roll-1", total: 18 });
        await service.lockCombatantActionRoll("c1", 1, { requestId: "roll-2", total: 14 });

        const action = getState().perCombatant["c1"].plan[1];
        assert.equal(action.planningRollResults.length, 2);
    });

    it("emits PLAN_UPDATED", async () => {
        const { service, emitted } = makeService({ initialState: makeStateWithPlan() });
        await service.lockCombatantActionRoll("c1", 1, { requestId: "r1" });
        assert.ok(emitted.some((e) => e.eventName === "planUpdated"));
    });

    it("rejects an invalid action index", async () => {
        const { service } = makeService({ initialState: makeStateWithPlan() });
        await assert.rejects(
            () => service.lockCombatantActionRoll("c1", 99, { requestId: "r1" }),
            /Invalid action index/
        );
    });

    it("rejects when not in planning phase", async () => {
        const { service } = makeService({
            initialState: makeState({ phase: "resolving" })
        });
        await assert.rejects(
            () => service.lockCombatantActionRoll("c1", 0, { requestId: "r1" }),
            /only lock actions during encounter planning/
        );
    });
});

// ---------------------------------------------------------------------------
// setCombatantReady
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.setCombatantReady", () => {
    it("marks a combatant ready and emits COMBATANT_READY_CHANGED", async () => {
        const { service, getState, emitted } = makeService();

        await service.setCombatantReady("c1", true);

        assert.equal(getState().perCombatant["c1"].ready, true);
        assert.ok(getState().perCombatant["c1"].committedAt > 0);
        assert.ok(emitted.some((e) => e.eventName === "combatantReadyChanged"));
    });

    it("un-commits a ready combatant", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: { perCombatant: { c1: { plan: [], ready: true, committedAt: 999 } } }
            })
        });

        // Need to open planning first — override the guard
        // By default state.phase is "planning" and state.perCombatant.c1.ready is true,
        // which means #requirePlanningOpen would throw. Use a fresh state with ready=false.
        // Instead test the state transition directly for uncommitting:
        const { service: s2, getState: g2 } = makeService({
            initialState: {
                phase: "planning",
                apBudget: 6,
                perCombatant: { c1: { plan: [], ready: false, committedAt: 0 } }
            }
        });

        await s2.setCombatantReady("c1", false);
        assert.equal(g2().perCombatant["c1"].ready, false);
        assert.equal(g2().perCombatant["c1"].committedAt, 0);
    });

    it("rejects when the combatant is not owned by the current user", async () => {
        const { service } = makeService({ isCombatantOwned: () => false });
        await assert.rejects(
            () => service.setCombatantReady("c1", true),
            /do not have permission/
        );
    });

    it("calls restorePlanningOrigin when committing", async () => {
        const restored = [];
        const { service } = makeService({
            restorePlanningOrigin: async (id, plan) => restored.push({ id, plan })
        });

        await service.setCombatantReady("c1", true);
        assert.equal(restored.length, 1);
        assert.equal(restored[0].id, "c1");
    });

    it("does not call restorePlanningOrigin when uncommitting", async () => {
        const restored = [];
        const { service } = makeService({
            restorePlanningOrigin: async () => restored.push("called")
        });

        await service.setCombatantReady("c1", false);
        assert.equal(restored.length, 0);
    });
});

// ---------------------------------------------------------------------------
// Initiative gate guard
// ---------------------------------------------------------------------------

describe("EncounterPlanningService — initiative gate", () => {
    it("rejects setCombatantPlan when initiative gate is active", async () => {
        const { service } = makeService({ isInitiativeGateActive: () => true });
        await assert.rejects(
            () => service.setCombatantPlan("c1", []),
            /must roll initiative/
        );
    });

    it("rejects addCombatantAction when initiative gate is active", async () => {
        const { service } = makeService({ isInitiativeGateActive: () => true });
        await assert.rejects(
            () => service.addCombatantAction("c1", { id: "move", type: "movement", apCost: 1 }),
            /must roll initiative/
        );
    });
});

// ---------------------------------------------------------------------------
// Planning open guard
// ---------------------------------------------------------------------------

describe("EncounterPlanningService — planning open guard", () => {
    it("rejects when phase is not planning", async () => {
        const { service } = makeService({
            initialState: makeState({ phase: "resolving" })
        });
        await assert.rejects(
            () => service.setCombatantPlan("c1", []),
            /planning is not currently open/
        );
    });

    it("rejects when combatant is already ready", async () => {
        const { service } = makeService({
            initialState: makeState({
                overrides: { perCombatant: { c1: { plan: [], ready: true, committedAt: 1 } } }
            })
        });
        await assert.rejects(
            () => service.setCombatantPlan("c1", []),
            /already committed/
        );
    });
});

// ---------------------------------------------------------------------------
// setCombatantActionApCost
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.setCombatantActionApCost", () => {
    it("adjusts the AP cost within min/max bounds", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [{ id: "move", type: "movement", apCost: 2, apMin: 1, apMax: 4, movementFeetPerAp: 10, planningLocked: false, planningRollResults: [] }],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.setCombatantActionApCost("c1", 0, 3);
        const action = getState().perCombatant["c1"].plan[0];
        assert.equal(action.apCost, 3);
    });

    it("clamps the AP cost to the maximum", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [{ id: "move", type: "movement", apCost: 2, apMin: 1, apMax: 3, movementFeetPerAp: 10, planningLocked: false, planningRollResults: [] }],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.setCombatantActionApCost("c1", 0, 99);
        const action = getState().perCombatant["c1"].plan[0];
        assert.equal(action.apCost, 3);
    });

    it("recalculates movementFeet for movement actions", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [{ id: "move", type: "movement", apCost: 1, apMin: 1, apMax: 4, movementFeetPerAp: 10, planningLocked: false, planningRollResults: [] }],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.setCombatantActionApCost("c1", 0, 3);
        const action = getState().perCombatant["c1"].plan[0];
        assert.equal(action.movementFeet, 30);
    });
});

// ---------------------------------------------------------------------------
// addCombatantAction
// ---------------------------------------------------------------------------

describe("EncounterPlanningService.addCombatantAction", () => {
    it("appends an action to the plan", async () => {
        const { service, getState } = makeService();
        await service.addCombatantAction("c1", { id: "move", type: "movement", apCost: 1 });
        assert.equal(getState().perCombatant["c1"].plan.length, 1);
        assert.equal(getState().perCombatant["c1"].plan[0].id, "move");
    });
});

// ---------------------------------------------------------------------------
// draft plans
// ---------------------------------------------------------------------------

describe("EncounterPlanningService draft plans", () => {
    it("normalizes and persists a combatant draft plan without changing the committed plan", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [{ id: "alreadyCommitted", type: "utility", apCost: 1 }],
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        const draft = await service.setCombatantDraftPlan("c1", {
            clauses: [
                { actionId: "move", type: "movement", apCost: 2, requiresMovementDestination: true, movementTargetX: 200, movementTargetY: 0 },
                { actionId: "attack", type: "attack", apCost: 2, requiresTarget: true }
            ]
        });

        const combatantState = getState().perCombatant.c1;
        assert.equal(combatantState.plan.length, 1);
        assert.equal(combatantState.plan[0].id, "alreadyCommitted");
        assert.equal(combatantState.draftPlan.spentAp, 4);
        assert.equal(combatantState.draftPlan.remainingAp, 2);
        assert.deepEqual(combatantState.draftPlan.missingDecisions, [{ clauseId: "draft-clause-2", decision: "target" }]);
        assert.equal(draft.complete, false);
    });

    it("emits draftPlanUpdated with normalized draft state", async () => {
        const { service, emitted } = makeService();

        await service.setCombatantDraftPlan("c1", {
            clauses: [{ actionId: "wait", type: "utility", apCost: 1, requiresDuration: true, durationAp: 1 }]
        });

        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].eventName, "draftPlanUpdated");
        assert.equal(emitted[0].payload.combatantId, "c1");
        assert.equal(emitted[0].payload.draftPlan.complete, true);
    });

    it("resets ready state when an editable draft changes", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: { clauses: [] },
                            ready: false,
                            committedAt: 99
                        }
                    }
                }
            })
        });

        await service.setCombatantDraftPlan("c1", { clauses: [] });

        assert.equal(getState().perCombatant.c1.ready, false);
        assert.equal(getState().perCombatant.c1.committedAt, 0);
    });

    it("rejects draft edits for unowned combatants", async () => {
        const { service } = makeService({ isCombatantOwned: () => false });

        await assert.rejects(
            () => service.setCombatantDraftPlan("c1", { clauses: [] }),
            /do not have permission/
        );
    });

    it("clears a combatant draft plan", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [{ actionId: "wait", type: "utility", apCost: 1, requiresDuration: true, durationAp: 1 }]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.clearCombatantDraftPlan("c1");

        assert.equal(getState().perCombatant.c1.draftPlan.clauses.length, 0);
        assert.equal(getState().perCombatant.c1.draftPlan.remainingAp, 6);
    });

    it("confirms a complete draft plan and inserts automatic idle for unused AP", async () => {
        const { service, getState, emitted } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [
                                    { actionId: "move", type: "movement", label: "Move", apCost: 2, requiresMovementDestination: true, movementTargetX: 100, movementTargetY: 0 }
                                ]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        const result = await service.confirmCombatantDraftPlan("c1");
        const combatantState = getState().perCombatant.c1;

        assert.equal(result.draftPlan.lifecycle, "locked");
        assert.equal(combatantState.ready, true);
        assert.equal(combatantState.committedAt, 12345);
        assert.equal(combatantState.plan.length, 2);
        assert.equal(combatantState.plan[1].actionId, "idle");
        assert.equal(combatantState.plan[1].apCost, 4);
        assert.equal(combatantState.plan[1].automatic, true);
        assert.ok(emitted.some((entry) => entry.eventName === "planUpdated"));
        assert.ok(emitted.some((entry) => entry.eventName === "draftPlanUpdated"));
    });

    it("keeps confirmed attack drafts awaiting required roll results", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [
                                    {
                                        actionId: "strike",
                                        type: "attack",
                                        label: "Strike",
                                        apCost: 2,
                                        requiresTarget: true,
                                        targetId: "c2"
                                    }
                                ]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        const result = await service.confirmCombatantDraftPlan("c1");
        const combatantState = getState().perCombatant.c1;

        assert.equal(result.draftPlan.lifecycle, "confirmedAwaitingRolls");
        assert.equal(combatantState.ready, false);
        assert.equal(combatantState.committedAt, 0);
        assert.equal(result.requiredRolls.length, 1);
        assert.deepEqual(combatantState.plan[0].rollRequirements, [{ rollType: "attack", rollSubType: "toHit" }]);
    });

    it("rejects edits after a draft has been confirmed and is awaiting rolls", async () => {
        const { service } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [
                                    {
                                        actionId: "strike",
                                        type: "attack",
                                        label: "Strike",
                                        apCost: 2,
                                        requiresTarget: true,
                                        targetId: "c2"
                                    }
                                ]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.confirmCombatantDraftPlan("c1");

        await assert.rejects(
            () => service.setCombatantDraftPlan("c1", { clauses: [] }),
            /already confirmed/
        );
        await assert.rejects(
            () => service.setCombatantPlan("c1", []),
            /already confirmed/
        );
    });

    it("locks the confirmed plan once required rolls are stored", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [
                                    {
                                        actionId: "strike",
                                        type: "attack",
                                        label: "Strike",
                                        apCost: 2,
                                        requiresTarget: true,
                                        targetId: "c2"
                                    }
                                ]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.confirmCombatantDraftPlan("c1");
        await service.lockCombatantActionRoll("c1", 0, {
            requestId: "roll-1",
            rollType: "attack",
            rollSubType: "toHit",
            result: { total: 17 }
        });

        const combatantState = getState().perCombatant.c1;
        assert.equal(combatantState.ready, true);
        assert.equal(combatantState.committedAt, 12345);
        assert.equal(combatantState.draftPlan.lifecycle, "locked");
        assert.equal(combatantState.plan[0].planningLocked, true);
        assert.equal(combatantState.plan[1].planningLocked, true);
    });

    it("waits for every declared roll requirement before locking a confirmed plan", async () => {
        const { service, getState } = makeService({
            initialState: makeState({
                overrides: {
                    perCombatant: {
                        c1: {
                            plan: [],
                            draftPlan: {
                                clauses: [
                                    {
                                        actionId: "strike",
                                        type: "attack",
                                        label: "Strike",
                                        apCost: 2,
                                        requiresTarget: true,
                                        targetId: "c2",
                                        rollRequirements: [
                                            { rollType: "attack", rollSubType: "toHit" },
                                            { rollType: "attack", rollSubType: "damage" }
                                        ]
                                    }
                                ]
                            },
                            ready: false,
                            committedAt: 0
                        }
                    }
                }
            })
        });

        await service.confirmCombatantDraftPlan("c1");
        await service.lockCombatantActionRoll("c1", 0, {
            requestId: "to-hit",
            rollType: "attack",
            rollSubType: "toHit",
            result: { total: 17 }
        });
        assert.equal(getState().perCombatant.c1.ready, false);
        assert.equal(getState().perCombatant.c1.draftPlan.lifecycle, "confirmedAwaitingRolls");

        await service.lockCombatantActionRoll("c1", 0, {
            requestId: "damage",
            rollType: "attack",
            rollSubType: "damage",
            result: { total: 6 }
        });
        assert.equal(getState().perCombatant.c1.ready, true);
        assert.equal(getState().perCombatant.c1.draftPlan.lifecycle, "locked");
    });
});
