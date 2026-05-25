import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    buildPersistedMapViewportState,
    buildRestoredMapViewportTransform
} from "../../module/ui/workspace-v2/panels/map-viewport-state.mjs";
import { normalizeMapViewportState } from "../../module/ui/workspace-v2/workspace-state-store.mjs";

describe("map viewport state", () => {
    it("restores a saved zoom and image-space center without refitting the map", () => {
        const restored = buildRestoredMapViewportTransform({
            saved: {
                scale: 2,
                centerX: 300,
                centerY: 200
            },
            viewportWidth: 500,
            viewportHeight: 400,
            imageWidth: 1000,
            imageHeight: 800,
            minScale: 0.5
        });

        assert.deepEqual(restored, {
            scale: 2,
            offsetX: -350,
            offsetY: -200
        });
    });

    it("falls back to fit-to-panel only when no saved viewport exists", () => {
        const restored = buildRestoredMapViewportTransform({
            saved: null,
            viewportWidth: 500,
            viewportHeight: 400,
            imageWidth: 1000,
            imageHeight: 800,
            minScale: 0.5
        });

        assert.deepEqual(restored, {
            scale: 0.5,
            offsetX: 0,
            offsetY: 0
        });
    });

    it("persists the current image-space center for session restoration", () => {
        assert.deepEqual(buildPersistedMapViewportState({
            scale: 2,
            offsetX: -350,
            offsetY: -200,
            viewportWidth: 500,
            viewportHeight: 400,
            imageWidth: 1000,
            imageHeight: 800
        }), {
            scale: 2,
            centerX: 300,
            centerY: 200
        });
    });

    it("rejects incomplete persisted viewport state", () => {
        assert.equal(normalizeMapViewportState({ scale: 2, centerX: 10 }), null);
        assert.equal(normalizeMapViewportState({ scale: 0, centerX: 10, centerY: 20 }), null);
    });
});
