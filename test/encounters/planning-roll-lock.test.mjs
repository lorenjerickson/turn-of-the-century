import assert from "node:assert/strict";
import test from "node:test";

import { acceptCompletedPlanningRoll } from "../../module/encounters/planning-roll-lock.mjs";

test("locks the linked planning action when its recipient completes the roll", async () => {
    const calls = [];
    const combat = {
        id: "combat-1",
        phase: "planning",
        lockCombatantActionRoll: async (...args) => calls.push(args)
    };
    const game = {
        user: { id: "player-1" },
        combat,
        combats: { get: (id) => id === combat.id ? combat : null }
    };
    const request = {
        id: "roll-1",
        combatId: "combat-1",
        combatantId: "combatant-1",
        actionIndex: 2,
        actionId: "attack",
        rollType: "attack",
        rollSubType: "toHit"
    };

    assert.equal(await acceptCompletedPlanningRoll({
        game,
        change: { type: "result", request, recipientId: "player-1", result: { total: 17 } }
    }), true);
    assert.deepEqual(calls, [["combatant-1", 2, {
        requestId: "roll-1",
        actionId: "attack",
        rollType: "attack",
        rollSubType: "toHit",
        result: { total: 17 }
    }]]);
});

test("ignores unlinked, non-planning, and other-player roll results", async () => {
    const calls = [];
    const combat = {
        id: "combat-1",
        phase: "resolving",
        lockCombatantActionRoll: async (...args) => calls.push(args)
    };
    const game = { user: { id: "player-1" }, combat, combats: { get: () => combat } };
    const linked = { combatId: "combat-1", combatantId: "c-1", actionIndex: 0 };

    assert.equal(await acceptCompletedPlanningRoll({ game, change: { type: "result", request: linked, recipientId: "player-1" } }), false);
    combat.phase = "planning";
    assert.equal(await acceptCompletedPlanningRoll({ game, change: { type: "result", request: linked, recipientId: "player-2" } }), false);
    assert.equal(await acceptCompletedPlanningRoll({ game, change: { type: "result", request: {}, recipientId: "player-1" } }), false);
    assert.deepEqual(calls, []);
});
