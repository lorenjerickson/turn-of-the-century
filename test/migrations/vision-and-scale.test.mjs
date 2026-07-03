import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
    buildSceneScaleUpdate,
    buildVisionRangeUpdate,
    migrateTotcVisionAndScale
} from "../../module/migrations/vision-and-scale.mjs";

function makeActor({ id = "actor-1", name = "Actor", range = 60, migrated = false } = {}) {
    return {
        id,
        name,
        prototypeToken: { sight: { enabled: true, range } },
        flags: migrated ? { "turn-of-the-century": { visionAndScaleV20: true } } : {},
        updates: [],
        async update(data) {
            this.updates.push(data);
            if (Object.hasOwn(data, "prototypeToken.sight.enabled")) this.prototypeToken.sight.enabled = data["prototypeToken.sight.enabled"];
            if (Object.hasOwn(data, "prototypeToken.sight.range")) this.prototypeToken.sight.range = data["prototypeToken.sight.range"];
            if (data["flags.turn-of-the-century.visionAndScaleV20"]) {
                this.flags["turn-of-the-century"] = { visionAndScaleV20: data["flags.turn-of-the-century.visionAndScaleV20"] };
            }
        }
    };
}

function makeToken({ id = "token-1", name = "Token", range = 60, migrated = false } = {}) {
    return {
        id,
        name,
        sight: { enabled: true, range },
        flags: migrated ? { "turn-of-the-century": { visionAndScaleV20: true } } : {},
        updates: [],
        async update(data) {
            this.updates.push(data);
            if (Object.hasOwn(data, "sight.enabled")) this.sight.enabled = data["sight.enabled"];
            if (Object.hasOwn(data, "sight.range")) this.sight.range = data["sight.range"];
            if (data["flags.turn-of-the-century.visionAndScaleV20"]) {
                this.flags["turn-of-the-century"] = { visionAndScaleV20: data["flags.turn-of-the-century.visionAndScaleV20"] };
            }
        }
    };
}

function makeScene({ id = "scene-1", name = "Scene", distance = 10, tokens = [] } = {}) {
    return {
        id,
        name,
        grid: { distance, units: "ft" },
        tokens: { contents: tokens },
        updates: [],
        async update(data) {
            this.updates.push(data);
            if (Object.hasOwn(data, "grid.distance")) this.grid.distance = data["grid.distance"];
            if (Object.hasOwn(data, "grid.units")) this.grid.units = data["grid.units"];
        }
    };
}

function makePack(documents = []) {
    return {
        collection: "turn-of-the-century.actors",
        documentName: "Actor",
        metadata: { packageType: "system" },
        locked: true,
        lockStates: [],
        async configure(update) {
            this.lockStates.push(update.locked);
            this.locked = update.locked;
        },
        async getDocuments() {
            return documents;
        }
    };
}

beforeEach(() => {
    globalThis.ui = { notifications: { info: () => {} } };
    globalThis.game = {
        ready: true,
        user: { isGM: true },
        actors: { contents: [] },
        scenes: { contents: [] },
        packs: [],
        settings: {
            value: 10,
            setCalls: [],
            get() {
                return this.value;
            },
            async set(scope, key, value) {
                this.setCalls.push({ scope, key, value });
                this.value = value;
            }
        }
    };
});

describe("vision and scale migration", () => {
    it("builds actor prototype-token and placed-token vision updates once", () => {
        assert.deepEqual(buildVisionRangeUpdate(makeActor(), { pathPrefix: "prototypeToken" }), {
            "prototypeToken.sight.enabled": true,
            "prototypeToken.sight.range": 120,
            "flags.turn-of-the-century.visionAndScaleV20": { fromRange: 60, toRange: 120 }
        });

        assert.deepEqual(buildVisionRangeUpdate(makeToken({ range: 30 })), {
            "sight.enabled": true,
            "sight.range": 60,
            "flags.turn-of-the-century.visionAndScaleV20": { fromRange: 30, toRange: 60 }
        });

        assert.equal(buildVisionRangeUpdate(makeActor({ migrated: true }), { pathPrefix: "prototypeToken" }), null);
    });

    it("builds scene scale updates only for old 10-foot grids", () => {
        assert.deepEqual(buildSceneScaleUpdate(makeScene({ distance: 10 })), {
            "grid.distance": 5,
            "grid.units": "ft"
        });
        assert.equal(buildSceneScaleUpdate(makeScene({ distance: 7 })), null);
    });

    it("updates world actors, scene tokens, scene grid distance, settings, and actor packs", async () => {
        const actor = makeActor({ id: "actor-1", range: 60 });
        const migratedActor = makeActor({ id: "actor-2", range: 120, migrated: true });
        const token = makeToken({ id: "token-1", range: 60 });
        const customScene = makeScene({ id: "scene-2", distance: 7 });
        const scene = makeScene({ id: "scene-1", distance: 10, tokens: [token] });
        const packActor = makeActor({ id: "pack-actor", range: 45 });
        const pack = makePack([packActor]);

        game.actors.contents = [actor, migratedActor];
        game.scenes.contents = [scene, customScene];
        game.packs = [pack];

        const report = await migrateTotcVisionAndScale({ notify: false });

        assert.equal(report.actorsScanned, 3);
        assert.equal(report.actorsUpdated, 2);
        assert.equal(report.tokensUpdated, 1);
        assert.equal(report.scenesUpdated, 1);
        assert.equal(report.settingsUpdated, 1);
        assert.equal(actor.prototypeToken.sight.range, 120);
        assert.equal(migratedActor.updates.length, 0);
        assert.equal(token.sight.range, 120);
        assert.equal(scene.grid.distance, 5);
        assert.equal(customScene.grid.distance, 7);
        assert.equal(packActor.prototypeToken.sight.range, 90);
        assert.deepEqual(pack.lockStates, [false, true]);
        assert.deepEqual(game.settings.setCalls, [{
            scope: "turn-of-the-century",
            key: "encounterMovementFeetPerAp",
            value: 5
        }]);
    });

    it("reports dry-run changes without mutating documents or settings", async () => {
        const actor = makeActor({ range: 60 });
        const token = makeToken({ range: 60 });
        const scene = makeScene({ distance: 10, tokens: [token] });
        game.actors.contents = [actor];
        game.scenes.contents = [scene];

        const report = await migrateTotcVisionAndScale({ dryRun: true, notify: false, includeCompendiums: false });

        assert.equal(report.actorsUpdated, 1);
        assert.equal(report.tokensUpdated, 1);
        assert.equal(report.scenesUpdated, 1);
        assert.equal(report.settingsUpdated, 1);
        assert.equal(actor.prototypeToken.sight.range, 60);
        assert.equal(token.sight.range, 60);
        assert.equal(scene.grid.distance, 10);
        assert.deepEqual(game.settings.setCalls, []);
    });
});
