import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { refreshGmTokenVisionPreview } from "../module/canvas-vision-preview.mjs";

function visionCanvas() {
    const updates = [];
    return {
        canvas: {
            ready: true,
            scene: { tokenVision: true },
            perception: { update: (flags) => updates.push(flags) }
        },
        updates
    };
}

describe("GM token vision preview", () => {
    it("refreshes native vision when the GM controls a sight-enabled token", () => {
        const { canvas, updates } = visionCanvas();
        const refreshed = refreshGmTokenVisionPreview(
            { document: { sight: { enabled: true, range: 60 } } },
            true,
            { game: { user: { isGM: true } }, canvas }
        );

        assert.equal(refreshed, true);
        assert.deepEqual(updates, [{ initializeVision: true, refreshVision: true }]);
    });

    it("refreshes unrestricted GM vision when a token is released", () => {
        const { canvas, updates } = visionCanvas();
        const refreshed = refreshGmTokenVisionPreview(null, false, {
            game: { user: { isGM: true } },
            canvas
        });

        assert.equal(refreshed, true);
        assert.equal(updates.length, 1);
    });

    it("does not alter player vision or scenes without token vision", () => {
        const { canvas, updates } = visionCanvas();
        assert.equal(refreshGmTokenVisionPreview(null, false, {
            game: { user: { isGM: false } },
            canvas
        }), false);
        canvas.scene.tokenVision = false;
        assert.equal(refreshGmTokenVisionPreview(null, false, {
            game: { user: { isGM: true } },
            canvas
        }), false);
        assert.deepEqual(updates, []);
    });
});
