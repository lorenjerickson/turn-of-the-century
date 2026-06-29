import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildEncounterOrderDisplay,
    buildLegacyOrderSummary,
    hasEncounterOrderData,
    normalizeEncounterOrderData
} from "../../module/encounters/encounter-order-model.mjs";

describe("encounter order model", () => {
    it("does not emit order data for legacy action entries", () => {
        const action = { id: "move", type: "movement", label: "Move", apCost: 2 };

        assert.equal(hasEncounterOrderData(action), false);
        assert.deepEqual(normalizeEncounterOrderData(action, { apCost: 2, index: 0 }), {});
    });

    it("normalizes configured order metadata", () => {
        const order = normalizeEncounterOrderData({
            orderId: "order-attack-1",
            intentType: "attackTarget",
            label: "Attack",
            summary: "Spend up to 4 AP to close on Elias and attack with a dagger.",
            clauses: [
                { clauseId: "close", clauseType: "positioning", text: "close on Elias" },
                { clauseType: "effect", clauseText: "attack with a dagger", clauseStatus: "ready" }
            ],
            apEnvelope: {
                positioningAp: 2,
                effectAp: 2,
                maxAp: 4
            },
            positioningRequirement: {
                type: "weaponRange",
                rangeFeet: 5
            },
            followThrough: {
                type: "chooseAnotherAction",
                minRemainingAp: 1
            },
            failureOutcome: {
                type: "bestReachablePosition"
            },
            sourceAction: {
                id: "daggerAttack",
                actionId: "weaponAttack"
            }
        }, { apCost: 4, index: 0 });

        assert.equal(order.orderId, "order-attack-1");
        assert.equal(order.intentType, "attackTarget");
        assert.equal(order.summary, "Spend up to 4 AP to close on Elias and attack with a dagger.");
        assert.equal(order.clauses.length, 2);
        assert.equal(order.clauses[1].clauseId, "clause-2");
        assert.equal(order.clauses[1].text, "attack with a dagger");
        assert.equal(order.clauses[1].clauseStatus, "ready");
        assert.deepEqual(order.apEnvelope, { positioningAp: 2, effectAp: 2, maxAp: 4 });
        assert.equal(order.positioningRequirement.type, "weaponRange");
        assert.equal(order.followThrough.type, "chooseAnotherAction");
        assert.equal(order.failureOutcome.type, "bestReachablePosition");
        assert.equal(order.sourceAction.actionId, "weaponAttack");
    });

    it("derives stable defaults for partial order metadata", () => {
        const order = normalizeEncounterOrderData({
            id: "open",
            type: "utility",
            label: "Open",
            intentType: "interactWithObject",
            clauses: [{}]
        }, { apCost: 1, index: 2 });

        assert.equal(order.orderId, "order-3");
        assert.equal(order.intentType, "interactWithObject");
        assert.equal(order.summary, "Spend 1 AP to Open.");
        assert.deepEqual(order.apEnvelope, { positioningAp: 0, effectAp: 1, maxAp: 1 });
        assert.equal(order.clauses[0].clauseId, "clause-1");
        assert.equal(order.clauses[0].clauseType, "effect");
        assert.equal(order.clauses[0].clauseStatus, "pending");
    });

    it("builds readable summaries for legacy action entries", () => {
        assert.equal(
            buildLegacyOrderSummary({ id: "pursue", actionId: "pursue", type: "movement", label: "Pursue", apCost: 3 }, { targetName: "Elias Vane" }),
            "Spend up to 3 AP closing with Elias Vane."
        );
        assert.equal(
            buildLegacyOrderSummary({ id: "weaponAttack", type: "attack", label: "Attack", apCost: 2, requiresToHit: true }, { targetName: "Elias Vane", itemName: "Clockmaker's Stiletto" }),
            "Spend 2 AP to attack Elias Vane with Clockmaker's Stiletto."
        );
        assert.equal(
            buildLegacyOrderSummary({ id: "overwatch", actionId: "overwatch", type: "defense", label: "Overwatch", apCost: 4, isReaction: true }),
            "Hold Overwatch for up to 4 AP."
        );
        assert.equal(
            buildLegacyOrderSummary({ id: "consumeItem", type: "consumable", label: "Consume Item", apCost: 1 }, { itemName: "Vital Saline Infusion" }),
            "Spend 1 AP to use Vital Saline Infusion."
        );
    });

    it("builds display metadata for legacy actions", () => {
        const display = buildEncounterOrderDisplay({
            id: "weaponAttack",
            type: "attack",
            label: "Attack",
            apCost: 2,
            requiresToHit: true
        }, { index: 1, targetName: "Elias Vane", itemName: "Clockmaker's Stiletto" });

        assert.equal(display.summary, "Spend 2 AP to attack Elias Vane with Clockmaker's Stiletto.");
        assert.deepEqual(display.apEnvelope, { positioningAp: 0, effectAp: 2, maxAp: 2 });
        assert.equal(display.clauses.length, 1);
        assert.equal(display.clauses[0].clauseId, "clause-2-effect");
        assert.equal(display.clauses[0].text, display.summary);
    });

    it("keeps contextual display summaries for configured actions without explicit summary text", () => {
        const display = buildEncounterOrderDisplay({
            id: "weaponAttack",
            type: "attack",
            label: "Attack",
            apCost: 2,
            requiresToHit: true,
            intentType: "attackTarget",
            apEnvelope: { positioningAp: 0, effectAp: 2, maxAp: 2 },
            followThrough: { type: "chooseAnotherAction" },
            failureOutcome: { type: "bestReachablePosition" }
        }, { index: 0, targetName: "Elias Vane", itemName: "Clockmaker's Stiletto" });

        assert.equal(display.summary, "Spend 2 AP to attack Elias Vane with Clockmaker's Stiletto.");
        assert.equal(display.intentType, "attackTarget");
        assert.equal(display.followThrough.type, "chooseAnotherAction");
    });
});
