import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildTimelineClauseMetadata,
    orderIdForAction,
    withOrderClauseMetadata
} from "../../module/encounters/encounter-order-clauses.mjs";

describe("encounter order clauses", () => {
    it("resolves stable order ids from configured and legacy actions", () => {
        assert.equal(orderIdForAction({ orderId: "order-1", id: "strike" }, 0), "order-1");
        assert.equal(orderIdForAction({ impliedForOrderId: "order-strike", id: "pursue" }, 0), "order-strike");
        assert.equal(orderIdForAction({ id: "strike" }, 2), "strike");
        assert.equal(orderIdForAction({}, 2), "order-3");
    });

    it("builds metadata from a matching configured clause", () => {
        const metadata = buildTimelineClauseMetadata({
            action: {
                orderId: "order-strike",
                targetId: "c2",
                clauses: [
                    { clauseId: "close", clauseType: "positioning", text: "close on Elias" },
                    { clauseId: "attack", clauseType: "effect", text: "attack with dagger" }
                ]
            },
            outcome: { result: "movementStep" },
            clauseType: "positioning"
        });

        assert.equal(metadata.orderId, "order-strike");
        assert.equal(metadata.clauseId, "close");
        assert.equal(metadata.clauseText, "close on Elias");
        assert.equal(metadata.clauseStatus, "active");
        assert.deepEqual(metadata.relatedCombatantIds, ["c2"]);
    });

    it("maps failed and interrupted outcomes to clause statuses", () => {
        assert.equal(buildTimelineClauseMetadata({ action: { id: "strike" }, outcome: { result: "outOfRange" } }).clauseStatus, "failed");
        assert.equal(buildTimelineClauseMetadata({ action: { id: "strike" }, outcome: { result: "interrupted" } }).clauseStatus, "interrupted");
        assert.equal(buildTimelineClauseMetadata({ action: { id: "strike" }, outcome: { result: "hit" } }).clauseStatus, "completed");
    });

    it("adds clause metadata to timeline entries without mutating the source", () => {
        const entry = {
            tick: 1,
            action: { id: "strike", label: "Strike" },
            outcome: { result: "hit" }
        };

        const annotated = withOrderClauseMetadata(entry, { actionIndex: 1 });

        assert.equal(entry.orderId, undefined);
        assert.equal(annotated.orderId, "strike");
        assert.equal(annotated.clauseId, "clause-2-effect");
        assert.equal(annotated.clauseStatus, "completed");
    });
});
