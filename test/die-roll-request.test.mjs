// Unit tests for DieRollRequest data model
import { DieRollRequest } from "../module/models/die-roll-request.mjs";

describe("DieRollRequest", () => {
  it("should construct with all required fields", () => {
    const req = new DieRollRequest({
      id: "req1",
      initiatorId: "gm1",
      recipientIds: ["player1", "player2"],
      rollType: "skill",
      rollSubType: "Animal Handling",
      modifiers: [2, -1],
    });
    expect(req.id).toBe("req1");
    expect(req.initiatorId).toBe("gm1");
    expect(req.recipientIds).toEqual(["player1", "player2"]);
    expect(req.rollType).toBe("skill");
    expect(req.rollSubType).toBe("Animal Handling");
    expect(req.modifiers).toEqual([2, -1]);
    expect(req.status).toBe("pending");
    expect(req.results).toEqual({});
    expect(typeof req.timestamp).toBe("number");
  });

  it("should allow setting status and results", () => {
    const req = new DieRollRequest({
      id: "req2",
      initiatorId: "effect1",
      recipientIds: ["player3"],
      rollType: "attribute",
      rollSubType: "Strength",
      modifiers: 1,
      status: "completed",
      results: { player3: { roll: 15, total: 16, timestamp: 1234567890 } },
      timestamp: 1234567890,
    });
    expect(req.status).toBe("completed");
    expect(req.results.player3.total).toBe(16);
    expect(req.timestamp).toBe(1234567890);
  });
});
