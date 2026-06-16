import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
    TOTC_WORLD_SCHEMA_VERSION,
    runTotcMigrations
} from "../../module/migrations/runner.mjs";

before(() => {
    globalThis.game = { ready: true, user: { isGM: true } };
});

describe("runTotcMigrations", () => {
    it("exports TOTC_WORLD_SCHEMA_VERSION as 13", () => {
        assert.equal(TOTC_WORLD_SCHEMA_VERSION, 13);
    });

    it("throws when seedMissingActors is not a function", async () => {
        const noop = async () => ({});
        await assert.rejects(
            () => runTotcMigrations({
                currentVersion: 100,
                migrateActorProfiles: noop,
                migrateActorProfessions: noop,
                migrateActorEconomy: noop,
                migrateEquipmentSlots: noop,
                migrateEncounterActions: noop,
                migrateModifiers: noop,
                migrateStarterCompendiums: noop,
                seedMissingActors: undefined,
                migrateStarterActorAvatars: noop
            }),
            /seedMissingActors/
        );
    });

    it("throws when migrateStarterActorAvatars is not a function", async () => {
        const noop = async () => ({});
        await assert.rejects(
            () => runTotcMigrations({
                currentVersion: 100,
                migrateActorProfiles: noop,
                migrateActorProfessions: noop,
                migrateActorEconomy: noop,
                migrateEquipmentSlots: noop,
                migrateEncounterActions: noop,
                migrateModifiers: noop,
                migrateStarterCompendiums: noop,
                seedMissingActors: noop,
                migrateStarterActorAvatars: undefined
            }),
            /migrateStarterActorAvatars/
        );
    });

    it("calls seedMissingActors during v12 migration and includes it in applied steps", async () => {
        let seedCalled = false;
        let avatarsCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => {
            seedCalled = true;
            return { createdActors: 3, createdItems: 0, totalCreated: 3, skippedExisting: 0, createdByType: {}, stats: {} };
        };
        const migrateStarterActorAvatars = async () => {
            avatarsCalled = true;
            return { scanned: 3, updated: 2 };
        };

        const result = await runTotcMigrations({
            currentVersion: 11,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            notify: false
        });

        assert.equal(seedCalled, true);
        assert.equal(avatarsCalled, true);
        assert.equal(result.toVersion, 13);
        const step = result.applied.find((s) => s.key === "seed-missing-actors");
        assert.ok(step, "seed-missing-actors step should be present");
        assert.equal(step.version, 12);
        assert.equal(step.report.createdActors, 3);
        const avatarStep = result.applied.find((s) => s.key === "starter-actor-avatars");
        assert.ok(avatarStep, "starter-actor-avatars step should be present");
        assert.equal(avatarStep.version, 13);
        assert.equal(avatarStep.report.updated, 2);
    });

    it("skips v12 and v13 when currentVersion is already 13", async () => {
        let seedCalled = false;
        let avatarsCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => { seedCalled = true; return {}; };
        const migrateStarterActorAvatars = async () => { avatarsCalled = true; return {}; };

        const result = await runTotcMigrations({
            currentVersion: 13,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            notify: false
        });

        assert.equal(seedCalled, false);
        assert.equal(avatarsCalled, false);
        assert.equal(result.applied.length, 0);
    });
});
