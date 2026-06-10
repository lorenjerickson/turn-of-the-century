import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    CompendiumCacheController
} from "../../module/ui/workspace-v2/controllers/compendium-cache-controller.mjs";

describe("CompendiumCacheController", () => {
    it("caches loaded entries and reuses an in-flight load", async () => {
        let loadCount = 0;
        let resolveLoad;
        const loadPromise = new Promise((resolve) => {
            resolveLoad = resolve;
        });
        const controller = new CompendiumCacheController({
            load: async () => {
                loadCount += 1;
                return await loadPromise;
            }
        });

        const first = controller.getItems();
        const second = controller.getItems();
        resolveLoad({ entries: [{ id: "a" }], ready: true });

        assert.deepEqual(await first, [{ id: "a" }]);
        assert.deepEqual(await second, [{ id: "a" }]);
        assert.deepEqual(await controller.getItems(), [{ id: "a" }]);
        assert.equal(loadCount, 1);
    });

    it("schedules retries for not-ready empty loads and reports loading failure after the limit", async () => {
        const callbacks = [];
        const controller = new CompendiumCacheController({
            retryLimit: 2,
            retryBaseMs: 10,
            maxRetryDelayMs: 50,
            load: async () => ({ entries: [], ready: false }),
            setTimeoutFn: (callback, delay) => {
                callbacks.push({ callback, delay });
                return callbacks.length;
            },
            clearTimeoutFn: () => {}
        });

        assert.deepEqual(await controller.getItems(), []);
        assert.equal(controller.retryCount, 1);
        assert.equal(callbacks[0].delay, 10);
        assert.equal(controller.loadingFailureMessage, null);

        callbacks[0].callback();
        assert.deepEqual(await controller.getItems(), []);
        assert.equal(controller.retryCount, 2);
        assert.match(controller.loadingFailureMessage, /No entries found after 2 load attempts/);
    });

    it("invalidate clears cached entries and pending retry timers", async () => {
        let clearedTimer = null;
        const controller = new CompendiumCacheController({
            load: async () => ({ entries: [], ready: false }),
            setTimeoutFn: () => "timer-1",
            clearTimeoutFn: (timer) => {
                clearedTimer = timer;
            }
        });

        await controller.getItems();
        assert.equal(controller.retryTimer, "timer-1");

        controller.invalidate();

        assert.equal(controller.entries, null);
        assert.equal(controller.promise, null);
        assert.equal(controller.retryCount, 0);
        assert.equal(controller.retryTimer, null);
        assert.equal(clearedTimer, "timer-1");
    });
});
