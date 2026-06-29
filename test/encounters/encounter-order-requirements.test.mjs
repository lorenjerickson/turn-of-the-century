import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildImpliedMovementAction,
    evaluateOrderPositioningRequirement,
    inferOrderPositioningRequirement
} from "../../module/encounters/encounter-order-requirements.mjs";

const scene = Object.freeze({ grid: { size: 100, distance: 5 } });

function token(id, x, y) {
    return { id, x, y, parent: scene };
}

describe("encounter order requirements", () => {
    it("infers weapon range for attack target orders", () => {
        const requirement = inferOrderPositioningRequirement({
            type: "attack",
            intentType: "attackTarget",
            targetId: "c2",
            rangeType: "melee"
        });

        assert.equal(requirement.type, "weaponRange");
        assert.equal(requirement.targetKind, "combatant");
        assert.equal(requirement.rangeFeet, 5);
    });

    it("evaluates combatant weapon range from token positions", () => {
        const result = evaluateOrderPositioningRequirement({
            action: {
                type: "attack",
                intentType: "attackTarget",
                targetId: "c2",
                targetingRangeFeet: 10
            },
            sourceToken: token("t1", 0, 0),
            targetToken: token("t2", 200, 0),
            scene
        });

        assert.equal(result.applies, true);
        assert.equal(result.satisfied, true);
        assert.equal(result.distanceFeet, 10);
    });

    it("evaluates object adjacency for location-backed interaction orders", () => {
        const result = evaluateOrderPositioningRequirement({
            action: {
                type: "utility",
                intentType: "interactWithObject",
                targetX: 100,
                targetY: 0
            },
            sourceToken: token("t1", 0, 0),
            scene
        });

        assert.equal(result.applies, true);
        assert.equal(result.satisfied, true);
    });

    it("builds pursue movement for combatant-backed implied movement", () => {
        const action = buildImpliedMovementAction({
            id: "strike",
            actionId: "strike",
            type: "attack",
            label: "Strike",
            targetId: "c2",
            apCost: 4
        }, {
            requirement: { type: "weaponRange", targetKind: "combatant" }
        });

        assert.equal(action.type, "movement");
        assert.equal(action.actionId, "pursue");
        assert.equal(action.targetId, "c2");
        assert.equal(action.impliedForOrderId, "strike");
    });
});
