

import { installFoundryMock } from "./foundry-mock.js";
installFoundryMock();

import { dieRollRequestManager } from "../module/die-roll-request-manager.mjs";
import { v4 as uuidv4 } from "uuid";

describe("DieRollRequestManager", () => {
  it("should send and receive a request and result", () => {
    // Simulate GM sending a request
    const requestId = uuidv4();
    const request = {
      id: requestId,
      initiatorId: "gm1",
      recipientIds: ["player1"],
      rollType: "skill",
      rollSubType: "Stealth",
      modifiers: [2],
      status: "pending",
      results: {},
      timestamp: Date.now()
    };
    dieRollRequestManager.sendRequest(request);
    const stored = dieRollRequestManager.getRequest(requestId);
    expect(stored).toBeDefined();
    expect(stored.rollType).toBe("skill");
    // Simulate player sending result
    // Simulate socket delivery by calling _handleResult directly
    dieRollRequestManager._handleResult({ requestId, recipientId: "player1", result: { roll: { total: 15 }, total: 17, timestamp: Date.now() } });
    const updated = dieRollRequestManager.getRequest(requestId);
    expect(updated.results["player1"].total).toBe(17);
  });
});
