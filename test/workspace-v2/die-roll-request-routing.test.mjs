import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDieRollRequestHostPanelId } from "../../module/ui/workspace-v2/die-roll-request-routing.mjs";

describe("die roll request workspace routing", () => {
    it("routes player roll requests to the Encounter panel", () => {
        assert.equal(getDieRollRequestHostPanelId({ isGM: false }), "encounter");
    });

    it("routes GM roll requests to the Gamemaster panel", () => {
        assert.equal(getDieRollRequestHostPanelId({ isGM: true }), "gamemaster");
    });
});
