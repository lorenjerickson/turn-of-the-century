import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { hasAnyCompendiumData, runStarterCompendiumBootstrap } =
    await import("../module/bootstrap.mjs");

// ---------------------------------------------------------------------------
// hasAnyCompendiumData
// ---------------------------------------------------------------------------

describe("hasAnyCompendiumData", () => {
    it("returns false when packs is null", async () => {
        const result = await hasAnyCompendiumData({ packs: null });
        assert.equal(result, false);
    });

    it("returns false when no system-owned packs exist", async () => {
        const packs = {
            values: () => [
                { collection: "other-system.actors", metadata: { packageName: "other-system" } }
            ][Symbol.iterator]()
        };
        const result = await hasAnyCompendiumData({ systemId: "turn-of-the-century", packs });
        assert.equal(result, false);
    });

    it("returns false when all system packs are empty", async () => {
        const packs = {
            values: () => [
                {
                    collection: "turn-of-the-century.actors",
                    metadata: { packageName: "turn-of-the-century" },
                    getIndex: async () => ({ size: 0 })
                }
            ][Symbol.iterator]()
        };
        const result = await hasAnyCompendiumData({ systemId: "turn-of-the-century", packs });
        assert.equal(result, false);
    });

    it("returns true when at least one system pack has entries", async () => {
        const packs = {
            values: () => [
                {
                    collection: "turn-of-the-century.actors",
                    metadata: { packageName: "turn-of-the-century" },
                    getIndex: async () => ({ size: 0 })
                },
                {
                    collection: "turn-of-the-century.items",
                    metadata: { packageName: "turn-of-the-century" },
                    getIndex: async () => ({ size: 42 })
                }
            ][Symbol.iterator]()
        };
        const result = await hasAnyCompendiumData({ systemId: "turn-of-the-century", packs });
        assert.equal(result, true);
    });

    it("ignores packs that throw during getIndex", async () => {
        const packs = {
            values: () => [
                {
                    collection: "turn-of-the-century.broken",
                    metadata: { packageName: "turn-of-the-century" },
                    getIndex: async () => { throw new Error("LevelDB corrupt"); }
                }
            ][Symbol.iterator]()
        };
        const result = await hasAnyCompendiumData({ systemId: "turn-of-the-century", packs });
        assert.equal(result, false);
    });

    it("matches packs by packageName as well as collection prefix", async () => {
        const packs = {
            values: () => [
                {
                    collection: "world.some-world-pack",
                    metadata: { packageName: "turn-of-the-century" },
                    getIndex: async () => [{ _id: "abc" }]
                }
            ][Symbol.iterator]()
        };
        const result = await hasAnyCompendiumData({ systemId: "turn-of-the-century", packs });
        assert.equal(result, true);
    });
});

// ---------------------------------------------------------------------------
// runStarterCompendiumBootstrap
// ---------------------------------------------------------------------------

function makeDeps({ isGM = true, isReady = true, packSize = 0, hooksCalled = [] } = {}) {
    const packs = {
        values: () => [
            {
                collection: "turn-of-the-century.items",
                metadata: { packageName: "turn-of-the-century" },
                getIndex: async () => ({ size: packSize })
            }
        ][Symbol.iterator]()
    };

    return {
        game: {
            ready: isReady,
            user: { isGM },
            packs
        },
        ui: {
            notifications: {
                info: () => {},
                error: () => {}
            }
        },
        Hooks: {
            callAll: (name) => { hooksCalled.push(name); }
        }
    };
}

describe("runStarterCompendiumBootstrap", () => {
    it("skips when game is not ready", async () => {
        const deps = makeDeps({ isReady: false });
        const result = await runStarterCompendiumBootstrap({ deps });
        assert.equal(result.skipped, true);
        assert.equal(result.populated, false);
    });

    it("skips when user is not GM", async () => {
        const deps = makeDeps({ isGM: false });
        const result = await runStarterCompendiumBootstrap({ deps });
        assert.equal(result.skipped, true);
        assert.equal(result.populated, false);
    });

    it("skips when compendiums are already populated", async () => {
        const deps = makeDeps({ packSize: 10 });
        let populateCalled = false;
        const result = await runStarterCompendiumBootstrap({
            deps,
            populate: () => { populateCalled = true; }
        });
        assert.equal(result.skipped, true);
        assert.equal(result.populated, false);
        assert.equal(populateCalled, false);
    });

    it("populates and fires hook on a fresh install", async () => {
        const hooksCalled = [];
        const deps = makeDeps({ packSize: 0, hooksCalled });
        let populateCalled = false;

        const result = await runStarterCompendiumBootstrap({
            deps,
            populate: async () => { populateCalled = true; }
        });

        assert.equal(result.skipped, false);
        assert.equal(result.populated, true);
        assert.equal(result.error, null);
        assert.equal(populateCalled, true);
        assert.ok(hooksCalled.includes("totcStarterCompendiumsReady"));
    });

    it("returns error and does not throw when population fails", async () => {
        const deps = makeDeps({ packSize: 0 });
        const boom = new Error("DB write failed");

        const result = await runStarterCompendiumBootstrap({
            deps,
            populate: async () => { throw boom; }
        });

        assert.equal(result.skipped, false);
        assert.equal(result.populated, false);
        assert.equal(result.error, boom);
    });

    it("does not fire hook when population fails", async () => {
        const hooksCalled = [];
        const deps = makeDeps({ packSize: 0, hooksCalled });

        await runStarterCompendiumBootstrap({
            deps,
            populate: async () => { throw new Error("fail"); }
        });

        assert.equal(hooksCalled.length, 0);
    });
});
