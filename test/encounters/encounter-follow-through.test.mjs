import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildFollowThroughAction,
    remainingFollowThroughAp
} from "../../module/encounters/encounter-follow-through.mjs";

describe("encounter follow-through", () => {
    it("computes leftover AP inside the order envelope and current round", () => {
        assert.equal(
            remainingFollowThroughAp(
                { apCost: 4, apEnvelope: { maxAp: 4 } },
                { spentAp: 1, roundRemainingAp: 5 }
            ),
            3
        );
        assert.equal(
            remainingFollowThroughAp(
                { apCost: 4, apEnvelope: { maxAp: 4 } },
                { spentAp: 1, roundRemainingAp: 2 }
            ),
            2
        );
    });

    it("does not build a synthetic action for choose-another-action follow-through", () => {
        const action = buildFollowThroughAction({
            id: "strike",
            followThrough: { type: "chooseAnotherAction" }
        }, { remainingAp: 2 });

        assert.equal(action, null);
    });

    it("does not build a synthetic action when no AP remains", () => {
        const action = buildFollowThroughAction({
            id: "strike",
            followThrough: { type: "overwatch" }
        }, { remainingAp: 0 });

        assert.equal(action, null);
    });

    it("builds an overwatch reaction for leftover AP", () => {
        const action = buildFollowThroughAction({
            id: "strike",
            orderId: "order-1",
            followThrough: { type: "overwatch" }
        }, { remainingAp: 3 });

        assert.equal(action.actionId, "overwatch");
        assert.equal(action.apCost, 3);
        assert.equal(action.isReaction, true);
        assert.equal(action.reactionTriggerType, "overwatch");
        assert.equal(action.followThroughSourceOrderId, "order-1");
    });

    it("builds a hold-position defense action for holding follow-through", () => {
        const action = buildFollowThroughAction({
            id: "unlockDoor",
            followThrough: { type: "hold" }
        }, { remainingAp: 2 });

        assert.equal(action.actionId, "holdPosition");
        assert.equal(action.type, "defense");
        assert.equal(action.apCost, 2);
        assert.equal(action.isReaction, false);
    });
});
