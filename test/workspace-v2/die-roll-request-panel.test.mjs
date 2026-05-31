import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DieRollRequestManager } from "../../module/die-roll-request-manager.mjs";
import {
    buildDieRollRequestPanelModel,
    renderDieRollRequestPanel
} from "../../module/ui/workspace-v2/panels/die-roll-request-panel.mjs";

function makeManager(requests = []) {
    const manager = new DieRollRequestManager({ socketService: { on() {}, emit() {} } });
    for (const request of requests) manager.sendRequest(request);
    return manager;
}

describe("Die roll request panel", () => {
    it("shows targeted player requests with dice and modifier controls", () => {
        const manager = makeManager([{
            id: "req1",
            recipientIds: ["player1"],
            label: "Constitution Saving Throw",
            rollType: "attribute-save",
            dice: [{ count: 2, faces: 20, keep: "lowest" }],
            modifiers: [{ label: "Constitution", value: 3 }]
        }]);

        const model = buildDieRollRequestPanelModel({
            userId: "player1",
            isGM: false,
            manager
        });
        const html = renderDieRollRequestPanel(model);

        assert.equal(model.request.id, "req1");
        assert.match(html, /Constitution Saving Throw/);
        assert.match(html, /2d20kl1 \+ 3/);
        assert.match(html, /data-action="die-roll-adjust"/);
        assert.match(html, /data-action="die-roll-request-roll"/);
    });

    it("renders a GM request form and multi-player status table", () => {
        const manager = makeManager([{
            id: "req2",
            recipientIds: ["player1", "player2"],
            label: "Group Dexterity Save",
            rollType: "attribute-save"
        }]);

        const model = buildDieRollRequestPanelModel({
            userId: "gm1",
            isGM: true,
            users: [
                { id: "gm1", name: "GM", isGM: true },
                { id: "player1", name: "Ada" },
                { id: "player2", name: "Bert" }
            ],
            manager
        });
        const html = renderDieRollRequestPanel(model);

        assert.match(html, /data-action="die-roll-request-create"/);
        assert.match(html, /Ada/);
        assert.match(html, /Bert/);
        assert.match(html, /Group Dexterity Save/);
    });
});
