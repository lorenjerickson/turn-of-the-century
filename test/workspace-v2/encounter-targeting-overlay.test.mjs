import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildEncounterTargetingOverlayModel,
    findEncounterTargetTokenAtPoint
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

    it("accepts only an eligible visible token under the selected canvas square", () => {
        const tokens = [
            { id: "source", x: 0, y: 0, width: 1, height: 1, visible: true },
            { id: "eligible", x: 100, y: 100, width: 1, height: 1, visible: true },
            { id: "hidden", x: 200, y: 100, width: 1, height: 1, visible: false }
        ];

        assert.equal(findEncounterTargetTokenAtPoint({
            tokens,
            targetTokenIds: ["eligible", "hidden"],
            point: { x: 150, y: 150 },
            gridSize: 100
        })?.id, "eligible");
        assert.equal(findEncounterTargetTokenAtPoint({
            tokens,
            targetTokenIds: ["eligible", "hidden"],
            point: { x: 250, y: 150 },
            gridSize: 100
        }), null);
        assert.equal(findEncounterTargetTokenAtPoint({
            tokens,
            targetTokenIds: ["eligible"],
            point: { x: 450, y: 450 },
            gridSize: 100
        }), null);
    });

    it("matches eligible token document ids when scanning canvas placeables", () => {
        const token = {
            id: "placeable-target",
            x: 100,
            y: 100,
            width: 1,
            height: 1,
            visible: true,
            document: { id: "document-target" }
        };

        assert.equal(findEncounterTargetTokenAtPoint({
            tokens: [token],
            targetTokenIds: ["document-target"],
            point: { x: 150, y: 150 },
            gridSize: 100
        }), token);
    });

    it("uses token placeable hit APIs before rectangular fallback bounds", () => {
        const token = {
            id: "eligible",
            x: 1000,
            y: 1000,
            width: 1,
            height: 1,
            visible: true,
            containsPoint: (point) => point.x === 150 && point.y === 150
        };

        assert.equal(findEncounterTargetTokenAtPoint({
            tokens: [token],
            targetTokenIds: ["eligible"],
            point: { x: 150, y: 150 },
            gridSize: 100
        }), token);
    });

    it("uses PIXI bounds contains APIs when exposed by the token placeable", () => {
        const token = {
            id: "eligible",
            visible: true,
            bounds: {
                contains: (x, y) => x === 250 && y === 125
            }
        };

        assert.equal(findEncounterTargetTokenAtPoint({
            tokens: [token],
            targetTokenIds: ["eligible"],
            point: { x: 250, y: 125 },
            gridSize: 100
        }), token);
    });
});
