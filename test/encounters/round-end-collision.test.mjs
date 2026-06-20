import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    adjacentFreePosition,
    findGridConflicts,
    lowestStrengthCombatantId,
    resolveContestedDexterity
} from "../../module/encounters/round-end-collision.mjs";

const result = (natural, total = natural) => ({ dice: [{ value: natural, kept: true }], total });

describe("tick-end collision reconciliation", () => {
    it("groups tokens by their final grid cell rather than exact pixel position", () => {
        const conflicts = findGridConflicts({
            gridSize: 100,
            combatants: [{ id: "a", tokenId: "ta" }, { id: "b", tokenId: "tb" }, { id: "c", tokenId: "tc" }],
            tokenPositions: { ta: { x: 101, y: 10 }, tb: { x: 175, y: 90 }, tc: { x: 200, y: 0 } }
        });
        assert.deepEqual(conflicts.map((group) => group.map((entry) => entry.combatantId)), [["a", "b"]]);
    });

    it("keeps a critical success standing and makes its opponent fail", () => {
        const outcomes = resolveContestedDexterity([
            { combatantId: "a", result: result(20, 22) },
            { combatantId: "b", result: result(18, 23) }
        ]);
        assert.deepEqual(outcomes.map(({ outcome }) => outcome), ["criticalSuccess", "failure"]);
    });

    it("marks tied ordinary rolls as both failed", () => {
        const outcomes = resolveContestedDexterity([
            { combatantId: "a", result: result(12, 14) },
            { combatantId: "b", result: result(13, 14) }
        ]);
        assert.deepEqual(outcomes.map(({ outcome }) => outcome), ["failure", "failure"]);
    });

    it("preserves critical success and critical failure outcomes", () => {
        const bothCritical = resolveContestedDexterity([
            { combatantId: "a", result: result(20, 22) },
            { combatantId: "b", result: result(20, 20) }
        ]);
        const criticalFailure = resolveContestedDexterity([
            { combatantId: "a", result: result(1, 5) },
            { combatantId: "b", result: result(11, 13) }
        ]);
        assert.deepEqual(bothCritical.map(({ outcome }) => outcome), ["criticalSuccess", "criticalSuccess"]);
        assert.deepEqual(criticalFailure.map(({ outcome }) => outcome), ["criticalFailure", "success"]);
    });

    it("identifies only a uniquely weaker actor and finds a free adjacent square", () => {
        assert.equal(lowestStrengthCombatantId([
            { combatantId: "a", strength: 8 },
            { combatantId: "b", strength: 12 }
        ]), "a");
        assert.equal(lowestStrengthCombatantId([
            { combatantId: "a", strength: 10 },
            { combatantId: "b", strength: 10 }
        ]), null);
        assert.deepEqual(adjacentFreePosition({
            origin: { x: 100, y: 100 },
            occupiedPositions: [{ x: 100, y: 0 }, { x: 200, y: 100 }],
            gridSize: 100
        }), { x: 100, y: 200 });
    });
});
