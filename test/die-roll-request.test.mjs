import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DIE_ROLL_REQUEST_STATUSES,
    DieRollRequest
} from "../module/models/die-roll-request.mjs";
import {
    rollDieRequestForUser,
    rollDieRequestForUserWithFoundry
} from "../module/die-roll-engine.mjs";

describe("DieRollRequest", () => {
    it("normalizes durable roll request fields", () => {
        const req = new DieRollRequest({
            id: "req1",
            initiatorId: "gm1",
            recipientIds: ["player1", "player2", "player1"],
            rollType: "attribute-save",
            rollSubType: "Constitution",
            label: "Constitution Saving Throw",
            combatId: "combat-1",
            combatantId: "combatant-1",
            actionIndex: 2,
            actionId: "resist",
            dice: [{ count: 2, faces: 20, keep: "lowest" }],
            modifiers: [{ label: "Constitution", value: 3 }]
        });

        assert.equal(req.id, "req1");
        assert.deepEqual(req.recipientIds, ["player1", "player2"]);
        assert.equal(req.status, DIE_ROLL_REQUEST_STATUSES.PENDING);
        assert.deepEqual(
            (({ combatId, combatantId, actionIndex, actionId }) => ({ combatId, combatantId, actionIndex, actionId }))(req.toJSON()),
            { combatId: "combat-1", combatantId: "combatant-1", actionIndex: 2, actionId: "resist" }
        );
        assert.equal(req.getFormulaFor("player1"), "2d20kl1 + 3");
    });

    it("does not turn a serialized null action index into action zero", () => {
        const req = new DieRollRequest(new DieRollRequest({ recipientIds: ["player1"] }).toJSON());
        assert.equal(req.actionIndex, null);
    });

    it("tracks player adjustments without changing base modifiers", () => {
        const req = new DieRollRequest({
            recipientIds: ["player1"],
            dice: "1d20",
            modifiers: [2],
            adjustments: { player1: { value: -1 } }
        });

        assert.equal(req.getFormulaFor("player1"), "1d20 + 1");
        assert.equal(req.modifiers[0].value, 2);
    });

    it("uses Foundry Roll when available so dice modules can observe the roll", async () => {
        const req = new DieRollRequest({
            id: "req-foundry",
            recipientIds: ["player1"],
            label: "Attack",
            dice: "1d20",
            modifiers: [{ label: "Action bonus", value: 2 }]
        });
        const messages = [];
        class FakeRoll {
            constructor(formula) {
                this.formula = formula;
                this.total = 19;
                this.dice = [{ faces: 20, results: [{ result: 17, active: true }] }];
            }

            async roll() {
                return this;
            }

            async toMessage(message) {
                messages.push(message);
            }
        }

        const result = await rollDieRequestForUserWithFoundry(req, "player1", {
            RollClass: FakeRoll,
            now: () => 456
        });

        assert.equal(result.formula, "1d20 + 2");
        assert.equal(result.total, 19);
        assert.deepEqual(result.dice.map((die) => die.value), [17]);
        assert.equal(messages[0].flavor, "Attack");
    });
});

describe("rollDieRequestForUser", () => {
    it("rolls all dice and emphasizes the kept die for disadvantage", async () => {
        const req = new DieRollRequest({
            id: "req-dis",
            recipientIds: ["player1"],
            label: "Constitution Saving Throw",
            dice: [{ count: 2, faces: 20, keep: "lowest" }],
            modifiers: [{ label: "Constitution", value: 3 }],
            adjustments: { player1: { value: 1 } }
        });
        const rolls = [0.7, 0.2];
        const result = await rollDieRequestForUser(req, "player1", {
            rng: () => rolls.shift(),
            now: () => 123
        });

        assert.deepEqual(result.dice.map((die) => die.value), [15, 5]);
        assert.deepEqual(result.dice.map((die) => die.kept), [false, true]);
        assert.equal(result.formula, "2d20kl1 + 4");
        assert.equal(result.total, 9);
        assert.equal(result.timestamp, 123);
    });
});
