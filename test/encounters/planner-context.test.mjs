import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

let originalConsoleDebug;

beforeEach(() => {
    originalConsoleDebug = console.debug;
    console.debug = () => {};
    globalThis.game = {
        combat: null,
        combats: { contents: [] }
    };
    globalThis.ui = {
        combat: { viewed: null }
    };
    globalThis.canvas = {
        tokens: {
            controlled: [],
            placeables: []
        }
    };
});

afterEach(() => {
    console.debug = originalConsoleDebug;
});

async function loadPlannerContext() {
    const moduleUrl = new URL(`../../module/encounters/planner-context.mjs?test=${Date.now()}`, import.meta.url);
    return import(moduleUrl.href);
}

function actorFixture(id, name) {
    return {
        id,
        name,
        isOwner: true,
        items: { get: () => null },
        img: `${id}.webp`
    };
}

describe("encounter planner context", () => {
    it("builds a planner from an explicit combatant id without falling back to another actor", async () => {
        const { buildEncounterPlannerForCombatant } = await loadPlannerContext();
        const ada = actorFixture("actor-ada", "Ada Price");
        const rook = actorFixture("actor-rook", "Rook Bruiser");
        const combatants = [
            { id: "combatant-ada", actor: ada, actorId: ada.id, tokenId: "token-ada" },
            { id: "combatant-rook", actor: rook, actorId: rook.id, tokenId: "token-rook" }
        ];
        const combat = {
            id: "combat-1",
            name: "Rookery Ambush",
            phase: "planning",
            round: 1,
            apBudget: 6,
            planningRemainingSeconds: 42,
            combatants: {
                contents: combatants,
                get: (id) => combatants.find((entry) => entry.id === id) ?? null
            },
            encounterState: { initialized: true },
            getCombatantState: (id) => ({ ready: false, spentAp: 0, plan: id === "combatant-rook" ? [{ id: "dodge", label: "Dodge", apCost: 1 }] : [] }),
            getCombatantPlan: (id) => id === "combatant-rook" ? [{ id: "dodge", label: "Dodge", apCost: 1 }] : [],
            getCombatantRemainingAp: (id) => id === "combatant-rook" ? 5 : 6,
            getAvailableActionsForCombatant: (id) => id === "combatant-rook"
                ? [{ id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 5, variableAp: true }]
                : [],
            getTargetOptionsForCombatant: () => []
        };

        const planner = buildEncounterPlannerForCombatant({
            actor: rook,
            tokenDocument: { id: "token-rook", actor: rook },
            combat,
            combatantId: "combatant-rook"
        });

        assert.equal(planner.combatantId, "combatant-rook");
        assert.equal(planner.remainingAp, 5);
        assert.deepEqual(planner.queue.map((action) => action.id), ["dodge"]);
        assert.deepEqual(planner.availableActions.map((action) => action.id), ["move"]);
        assert.equal(planner.queue[0].img, "modules/game-icons-net/blackbackground/dodge.svg");
        assert.equal(planner.availableActions[0].img, "modules/game-icons-net/blackbackground/move.svg");
    });

    it("builds a planner from combat turns when the combatants collection has no contents", async () => {
        const { buildEncounterPlannerForCombatant } = await loadPlannerContext();
        const actor = actorFixture("actor-ada", "Ada Price");
        const combatant = { id: "combatant-ada", actor, actorId: actor.id, tokenId: "token-ada" };
        const combat = {
            id: "combat-1",
            name: "Rookery Ambush",
            phase: "planning",
            round: 1,
            apBudget: 6,
            planningRemainingSeconds: 42,
            combatants: {
                contents: [],
                get: () => null
            },
            turns: [combatant],
            encounterState: { initialized: true },
            getCombatantState: () => ({ ready: false, spentAp: 0, plan: [] }),
            getCombatantPlan: () => [],
            getCombatantRemainingAp: () => 6,
            getAvailableActionsForCombatant: () => [{ id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1 }],
            getTargetOptionsForCombatant: () => []
        };

        const planner = buildEncounterPlannerForCombatant({
            actor,
            tokenDocument: { id: "token-ada", actor },
            combat,
            combatantId: "combatant-ada"
        });

        assert.equal(planner.combatantId, "combatant-ada");
        assert.equal(planner.combatantCount, 1);
        assert.deepEqual(planner.availableActions.map((action) => action.id), ["move"]);
    });

    it("resolves a token document whose live token object owns the combatant", async () => {
        const { buildEncounterPlanner } = await loadPlannerContext();
        const actor = actorFixture("actor-ada", "Ada Price");
        const combatant = { id: "combatant-ada", actor, actorId: actor.id, tokenId: "token-ada" };
        const combat = {
            id: "combat-1",
            name: "Rookery Ambush",
            phase: "planning",
            round: 1,
            apBudget: 6,
            planningRemainingSeconds: 42,
            combatants: {
                contents: [combatant],
                get: (id) => id === combatant.id ? combatant : null
            },
            encounterState: { initialized: true },
            initializeEncounterRound: () => {},
            getCombatantState: () => ({ ready: false, spentAp: 0, plan: [] }),
            getCombatantPlan: () => [],
            getCombatantRemainingAp: () => 6,
            getAvailableActionsForCombatant: () => [{ id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1 }],
            getTargetOptionsForCombatant: () => []
        };
        combatant.combat = combat;

        const planner = buildEncounterPlanner(actor, {
            id: "token-ada",
            actor,
            object: { id: "token-ada", actor, combatant }
        });

        assert.equal(planner.combatantId, "combatant-ada");
        assert.equal(planner.canEditPlan, true);
        assert.deepEqual(planner.availableActions.map((action) => action.id), ["move"]);
    });
});
