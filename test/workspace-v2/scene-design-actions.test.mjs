import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activateSceneWallDesignMode } from "../../module/ui/workspace-v2/design-actions/scene-actions.mjs";

describe("scene design actions", () => {
    it("activates Foundry scene controls for wall editing when available", async () => {
        let initializedWith = null;
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: { ready: true },
            ui: {
                controls: {
                    initialize: async (payload) => {
                        initializedWith = payload;
                    }
                }
            }
        });

        assert.deepEqual(initializedWith, { control: "walls", tool: "walls" });
        assert.deepEqual(result, {
            ok: true,
            message: "Wall design tools activated."
        });
    });

    it("falls back to activating the wall layer when controls are unavailable", async () => {
        let activated = false;
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: {
                ready: true,
                walls: {
                    activate: async () => {
                        activated = true;
                    }
                }
            },
            ui: {}
        });

        assert.equal(activated, true);
        assert.deepEqual(result, {
            ok: true,
            message: "Wall layer activated."
        });
    });

    it("warns when no scene is active", async () => {
        const result = await activateSceneWallDesignMode({
            scene: null,
            canvas: { ready: true },
            ui: {}
        });

        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(result.message, /Open a scene/);
    });

    it("warns while the canvas is still loading", async () => {
        const result = await activateSceneWallDesignMode({
            scene: { id: "scene-1" },
            canvas: { ready: false },
            ui: {}
        });

        assert.equal(result.ok, false);
        assert.equal(result.level, "warn");
        assert.match(result.message, /canvas/);
    });
});
