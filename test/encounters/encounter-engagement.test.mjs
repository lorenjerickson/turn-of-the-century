import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildSoftFailureOutcome,
    clearRuntimeEngagementFields,
    isBreakAwayAction,
    recordReachWindow,
    usableReachWindow
} from "../../module/encounters/encounter-engagement.mjs";

describe("encounter engagement helpers", () => {
    it("treats avoid and evade movement as explicit break-away actions", () => {
        assert.equal(isBreakAwayAction({ type: "movement", actionId: "avoid" }), true);
        assert.equal(isBreakAwayAction({ type: "movement", id: "evade" }), true);
        assert.equal(isBreakAwayAction({ type: "movement", actionId: "pursue" }), false);
        assert.equal(isBreakAwayAction({ type: "attack", actionId: "avoid" }), false);
    });

    it("records a reach window when positioning is satisfied", () => {
        const action = { id: "strike" };
        const tokenPositions = { t1: { x: 0, y: 0 }, t2: { x: 100, y: 0 } };

        const reachWindow = recordReachWindow(action, {
            tick: 2,
            positioning: { applies: true, satisfied: true, distanceFeet: 5 },
            tokenPositions
        });

        assert.deepEqual(reachWindow, {
            tick: 2,
            distanceFeet: 5,
            tokenPositions
        });
        assert.equal(action._reachWindow, reachWindow);
    });

    it("reuses a reach window unless the target is breaking away", () => {
        const action = { _reachWindow: { tick: 1, distanceFeet: 5 } };
        const targetCombatant = { id: "c2" };

        assert.equal(
            usableReachWindow(action, {
                targetCombatant,
                perCombatant: { c2: { pointer: 0, plan: [{ type: "movement", actionId: "move" }] } }
            }),
            action._reachWindow
        );

        assert.equal(
            usableReachWindow(action, {
                targetCombatant,
                perCombatant: { c2: { pointer: 0, plan: [{ type: "movement", actionId: "evade" }] } }
            }),
            null
        );
    });

    it("builds named soft-failure outcomes", () => {
        assert.equal(buildSoftFailureOutcome({ label: "Strike" }, { combatantName: "Alice" }).result, "bestReachablePosition");
        assert.equal(buildSoftFailureOutcome({ label: "Strike", failureOutcome: { type: "maintainPressure" } }, { combatantName: "Alice" }).result, "maintainedPressure");
        assert.equal(buildSoftFailureOutcome({ label: "Strike", failureOutcome: { type: "gainEngagement" } }, { combatantName: "Alice" }).result, "gainedEngagement");
        assert.equal(buildSoftFailureOutcome({ label: "Strike", failureOutcome: { type: "holdPosition" } }, { combatantName: "Alice" }).result, "heldPosition");
    });

    it("clears transient reach-window data from completed orders", () => {
        const action = { _reachWindow: { tick: 1, distanceFeet: 5 } };
        clearRuntimeEngagementFields(action);
        assert.equal(action._reachWindow, undefined);
    });
});
