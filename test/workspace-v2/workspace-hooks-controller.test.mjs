import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkspaceHooksController } from "../../module/ui/workspace-v2/controllers/workspace-hooks-controller.mjs";

describe("WorkspaceHooksController", () => {
    it("binds and unbinds named hook families once", () => {
        const calls = [];
        const hooks = {
            on: (event, handler) => calls.push(["on", event, handler.name]),
            off: (event, handler) => calls.push(["off", event, handler.name]),
            once: (event, handler) => calls.push(["once", event, handler.name])
        };
        function handler() {}
        const controller = new WorkspaceHooksController({ hooks });
        controller.registerFamily("scene", [
            { event: "updateScene", handler },
            { event: "deleteScene", handler }
        ]);

        controller.bindFamily("scene");
        controller.bindFamily("scene");
        controller.unbindFamily("scene");

        assert.deepEqual(calls, [
            ["on", "updateScene", "handler"],
            ["on", "deleteScene", "handler"],
            ["off", "updateScene", "handler"],
            ["off", "deleteScene", "handler"]
        ]);
        assert.equal(controller.isBound("scene"), false);
    });

    it("runs compendium startup refresh immediately when game is already ready", () => {
        let refreshCount = 0;
        const hooks = {
            on: () => {},
            off: () => {},
            once: () => {
                throw new Error("ready hook should not be deferred");
            }
        };
        const controller = new WorkspaceHooksController({
            hooks,
            gameReady: () => true,
            onCompendiumReady: () => {
                refreshCount += 1;
            }
        });
        controller.registerFamily("compendium", [{ event: "createCompendium", handler: () => {} }]);

        controller.bindFamily("compendium");

        assert.equal(refreshCount, 1);
    });

    it("defers compendium startup refresh until ready when needed", () => {
        const calls = [];
        function refresh() {}
        const controller = new WorkspaceHooksController({
            hooks: {
                on: (event) => calls.push(["on", event]),
                off: () => {},
                once: (event, handler) => calls.push(["once", event, handler.name])
            },
            gameReady: () => false,
            onCompendiumReady: refresh
        });
        controller.registerFamily("compendium", [{ event: "totcStarterCompendiumsReady", handler: refresh }]);

        controller.bindFamily("compendium");

        assert.deepEqual(calls, [
            ["once", "ready", "refresh"],
            ["on", "totcStarterCompendiumsReady"]
        ]);
    });
});
