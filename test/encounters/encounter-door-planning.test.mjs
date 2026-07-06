import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildReachableDoorOverlayModel,
    EncounterDoorPlanningController
} from "../../module/encounters/encounter-door-planning.mjs";

function makeDoor(overrides = {}) {
    return {
        id: "door-1",
        c: [100, 0, 100, 100],
        door: 1,
        ds: 0,
        parent: { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [] },
        ...overrides
    };
}

function makeContext({ phase = "planning", isGM = false, tokenX = 0, tokenY = 0 } = {}) {
    const token = { id: "source-token", x: tokenX, y: tokenY, width: 1, height: 1, visible: true };
    const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [token] };
    let draftPlan = {
        apBudget: 6,
        clauses: [{ clauseId: "draft-clause-1", actionId: "open", id: "open", type: "utility", label: "Open", apCost: 1 }]
    };
    const combat = {
        id: "combat-1",
        phase,
        scene,
        combatants: new Map([["source-combatant", { id: "source-combatant", tokenId: "source-token" }]]),
        getCombatantDraftPlan: () => draftPlan,
        setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
            draftPlan = nextDraftPlan;
        }
    };
    const warnings = [];
    return {
        get draftPlan() { return draftPlan; },
        combat,
        scene,
        token,
        game: { user: { isGM }, combat },
        canvas: { scene, tokens: { placeables: [token] } },
        ui: { notifications: { warn: (message) => warnings.push(message) } },
        warnings
    };
}

async function flushDoorFinalizer() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("EncounterDoorPlanningController", () => {
    it("blocks player door-opening updates during planning without an armed Open action", () => {
        const context = makeContext();
        const controller = new EncounterDoorPlanningController();

        const result = controller.handlePreUpdateWall(makeDoor({ parent: context.scene }), { ds: 1 }, context);

        assert.equal(result, false);
        assert.deepEqual(context.draftPlan.clauses.map((clause) => clause.actionId), ["open"]);
    });

    it("allows non-planning door updates to use Foundry's native behavior", () => {
        const context = makeContext({ phase: "resolving" });
        const controller = new EncounterDoorPlanningController();

        const result = controller.handlePreUpdateWall(makeDoor({ parent: context.scene }), { ds: 1 }, context);

        assert.equal(result, undefined);
    });

    it("builds an overlay containing only doors reachable after reserving the Open AP", () => {
        const context = makeContext({ tokenX: 0, tokenY: 0 });
        context.scene.walls = [
            makeDoor({ id: "near-door", c: [300, 0, 300, 100], parent: context.scene }),
            makeDoor({ id: "far-door", c: [600, 0, 600, 100], parent: context.scene }),
            makeDoor({ id: "open-door", c: [100, 200, 100, 300], ds: 1, parent: context.scene }),
            makeDoor({ id: "locked-door", c: [100, 400, 100, 500], ds: 2, parent: context.scene })
        ];

        const overlay = buildReachableDoorOverlayModel({
            token: context.token,
            scene: context.scene,
            remainingAp: 4,
            openAp: 1,
            feetPerAp: 5,
            rangeFeet: 5
        });

        assert.equal(overlay.active, true);
        assert.equal(overlay.movementAp, 3);
        assert.deepEqual(overlay.doors.map((door) => door.id), ["near-door"]);
        assert.equal(overlay.doors[0].movementAp, 2);
    });

    it("opens an unlocked reachable door and reserves only the AP needed to reach and open it", async () => {
        const context = makeContext({ tokenX: 0, tokenY: 0 });
        const controller = new EncounterDoorPlanningController();
        let completed = false;
        const door = makeDoor({ c: [300, 0, 300, 100], parent: context.scene });

        controller.beginInteraction({
            combat: context.combat,
            combatantId: "source-combatant",
            actionIndex: 0,
            tokenId: "source-token",
            sceneId: "scene-1",
            remainingAp: 4,
            rangeFeet: 5,
            onComplete: () => { completed = true; }
        });

        const result = controller.handlePreUpdateWall(door, { ds: 1 }, context);
        await flushDoorFinalizer();

        assert.equal(result, undefined);
        assert.equal(completed, true);
        assert.equal(context.draftPlan.clauses[0].actionId, "open");
        assert.equal(context.draftPlan.clauses[0].doorId, "door-1");
        assert.equal(context.draftPlan.clauses[0].doorOpenedDuringPlanning, true);
        assert.equal(context.draftPlan.clauses[0].apCost, 3);
        assert.equal(context.draftPlan.clauses[0].positioningAp, 2);
        assert.equal(context.draftPlan.clauses[0].effectAp, 1);
        assert.equal(context.draftPlan.clauses[0].positioningRequirement.targetKind, "location");
        assert.equal(context.draftPlan.clauses[0].effects[0].type, "door");
        assert.equal(context.draftPlan.clauses.length, 1);
    });

    it("does not open locked or out-of-range doors after Open is armed", () => {
        for (const { context, door, expectedWarning } of [
            {
                context: makeContext({ tokenX: 0, tokenY: 0 }),
                door: makeDoor({ ds: 2 }),
                expectedWarning: "That door is locked."
            },
            {
                context: makeContext({ tokenX: 500, tokenY: 500 }),
                door: makeDoor(),
                expectedWarning: "Choose a door within reach after reserving 1 AP to open it."
            }
        ]) {
            door.parent = context.scene;
            const controller = new EncounterDoorPlanningController();
            controller.beginInteraction({
                combat: context.combat,
                combatantId: "source-combatant",
                actionIndex: 0,
                tokenId: "source-token",
                sceneId: "scene-1",
                remainingAp: 4,
                rangeFeet: 5
            });

            const result = controller.handlePreUpdateWall(door, { ds: 1 }, context);

            assert.equal(result, false);
            assert.deepEqual(context.warnings, [expectedWarning]);
            assert.equal(context.draftPlan.clauses.length, 1);
        }
    });
});
