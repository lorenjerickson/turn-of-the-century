import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DieRollRequestManager } from "../module/die-roll-request-manager.mjs";

function makeSocket() {
    return {
        emitted: [],
        on() {},
        emit(type, payload) {
            this.emitted.push({ type, payload });
        }
    };
}

describe("DieRollRequestManager", () => {
    it("sends, adjusts, rolls, and resolves a request", async () => {
        const socket = makeSocket();
        const rngValues = [0.05, 0.95];
        const manager = new DieRollRequestManager({
            socketService: socket,
            rng: () => rngValues.shift(),
            now: () => 1000
        });
        const changes = [];
        manager.onChange((change) => changes.push(change.type));

        const request = manager.sendRequest({
            id: "req1",
            initiatorId: "gm1",
            recipientIds: ["player1"],
            label: "Constitution Saving Throw",
            dice: [{ count: 2, faces: 20, keep: "highest" }],
            modifiers: [{ label: "Constitution", value: 2 }]
        });
        manager.adjustModifier(request.id, "player1", 1);
        const result = await manager.rollRequestForRecipient(request.id, "player1");

        assert.deepEqual(socket.emitted.map((entry) => entry.type), ["dieRollRequest", "dieRollAdjust", "dieRollResult"]);
        assert.equal(result.total, 23);
        assert.equal(manager.getRequest("req1").status, "resolved");
        assert.deepEqual(changes, ["request", "adjust", "rolling", "result"]);
    });

    it("keeps multiple-player requests pending until every recipient rolls", async () => {
        const manager = new DieRollRequestManager({
            socketService: makeSocket(),
            rng: () => 0,
            now: () => 5
        });

        manager.sendRequest({
            id: "multi",
            recipientIds: ["p1", "p2"],
            dice: "1d20"
        });
        await manager.rollRequestForRecipient("multi", "p1");

        assert.equal(manager.getRequest("multi").status, "pending");
        assert.equal(manager.hasOutstandingRequests(), true);

        await manager.rollRequestForRecipient("multi", "p2");
        assert.equal(manager.getRequest("multi").status, "resolved");
        assert.equal(manager.hasOutstandingRequests(), false);
    });

    it("cancels requests without keeping them in visible history", () => {
        const manager = new DieRollRequestManager({ socketService: makeSocket() });
        manager.sendRequest({ id: "cancel-me", recipientIds: ["p1"] });

        manager.sendCancel("cancel-me", { cancelledBy: "p1" });

        assert.equal(manager.getRequest("cancel-me"), undefined);
        assert.deepEqual(manager.getAllRequests(), []);
    });

    it("allows encounter resolution to wait for a dispatched request", async () => {
        const manager = new DieRollRequestManager({ socketService: makeSocket(), now: () => 10 });
        manager.sendRequest({ id: "wait-for-me", recipientIds: ["p1"] });

        const waiting = manager.waitForResolution("wait-for-me");
        manager.sendResult("wait-for-me", "p1", { total: 14, dice: [{ value: 14, kept: true }] });

        assert.equal((await waiting).status, "resolved");
    });
});
