import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildEncounterTargetingOverlayModel
} from "../../module/ui/workspace-v2/encounter-targeting-overlay.mjs";

describe("encounter targeting overlay", () => {
    it("builds an active overlay with target tokens limited to range", () => {
        const model = buildEncounterTargetingOverlayModel({
            scene: {
                id: "scene-1",
                grid: { size: 100, distance: 5 }
            },
            sourceToken: { id: "source", x: 200, y: 200, width: 1, height: 1 },
            targetTokens: [
                { id: "near", x: 400, y: 200, width: 1, height: 1 },
                { id: "far", x: 1200, y: 200, width: 1, height: 1 }
            ],
            maxRangeFeet: 15,
            rangeType: "normal"
        });

        assert.equal(model.active, true);
        assert.equal(model.rangeFeet, 15);
        assert.equal(model.rangeType, "normal");
        assert.equal(model.radiusPixels, 300);
        assert.deepEqual(model.targetTokenIds, ["near"]);
    });

    it("returns an inactive model when source token or range is unavailable", () => {
        const model = buildEncounterTargetingOverlayModel({
            scene: { id: "scene-1", grid: { size: 100, distance: 5 } },
            sourceToken: null,
            targetTokens: [{ id: "near", x: 400, y: 200, width: 1, height: 1 }],
            maxRangeFeet: 0,
            rangeType: "melee"
        });

        assert.equal(model.active, false);
        assert.deepEqual(model.targetTokenIds, []);
    });
});