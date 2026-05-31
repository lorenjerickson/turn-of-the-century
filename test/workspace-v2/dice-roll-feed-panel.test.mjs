import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildDiceRollFeedPanelModel,
    renderDiceRollFeedPanel
} from "../../module/ui/workspace-v2/panels/dice-roll-feed-panel.mjs";
import { DieRollRequest } from "../../module/models/die-roll-request.mjs";

describe("Dice and Roll Feed panel", () => {
    it("normalizes recent roll messages newest first", () => {
        const model = buildDiceRollFeedPanelModel({
            messages: [
                {
                    id: "old",
                    timestamp: 100,
                    speaker: { alias: "Inspector Vale" },
                    user: { name: "Loren" },
                    flavor: "<p>Revolver shot</p>",
                    rolls: [{ formula: "1d20 + 3", total: 14 }]
                },
                {
                    id: "new",
                    timestamp: 200,
                    speaker: { alias: "Dr. Ashcroft" },
                    content: "<strong>Galvanic calibration</strong>",
                    rolls: [{ formula: "2d6", total: 9 }]
                }
            ]
        });

        assert.equal(model.rollCount, 2);
        assert.equal(model.messageCount, 2);
        assert.deepEqual(model.entries.map((entry) => entry.id), ["new", "old"]);
        assert.equal(model.entries[0].flavor, "Galvanic calibration");
        assert.deepEqual(model.entries[0].rolls, [{ formula: "2d6", total: 9 }]);
    });

    it("keeps flavorful non-roll messages but excludes empty messages", () => {
        const model = buildDiceRollFeedPanelModel({
            messages: [
                { id: "empty", timestamp: 3, content: "" },
                { id: "flavor", timestamp: 2, speaker: { alias: "Narrator" }, content: "The fog thickens." }
            ]
        });

        assert.equal(model.rollCount, 0);
        assert.equal(model.messageCount, 1);
        assert.equal(model.entries[0].id, "flavor");
    });

    it("renders escaped roll totals and formulas", () => {
        const html = renderDiceRollFeedPanel({
            rollCount: 1,
            entries: [
                {
                    speaker: "Ada <Danger>",
                    user: "GM",
                    flavor: "Aetheric static",
                    rolls: [{ formula: "1d20 < 18", total: 17 }],
                    hasRoll: true
                }
            ]
        }, {
            escapeHTML: (value) => String(value)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
        });

        assert.match(html, /Ada &lt;Danger&gt;/);
        assert.match(html, /1d20 &lt; 18/);
        assert.match(html, /totc-v2-roll-feed-panel__total/);
    });

    it("includes active roll requests and completed request results", () => {
        const pending = new DieRollRequest({
            id: "pending",
            recipientIds: ["player1"],
            label: "Constitution Saving Throw",
            timestamp: 300
        });
        const resolved = new DieRollRequest({
            id: "resolved",
            recipientIds: ["player1"],
            label: "Attack",
            status: "resolved",
            results: {
                player1: {
                    formula: "1d20 + 2",
                    total: 18,
                    adjustment: 1,
                    timestamp: 250
                }
            },
            timestamp: 250
        });

        const model = buildDiceRollFeedPanelModel({
            rollRequests: [pending, resolved],
            users: [{ id: "player1", name: "Ada" }]
        });

        assert.equal(model.activeRequestCount, 1);
        assert.equal(model.rollCount, 1);
        assert.equal(model.entries[0].id, "pending");
        assert.equal(model.entries[1].rolls[0].total, 18);
    });
});
