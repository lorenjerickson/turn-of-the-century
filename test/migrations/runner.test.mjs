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
    it("exports TOTC_WORLD_SCHEMA_VERSION as 12", () => {
        assert.equal(TOTC_WORLD_SCHEMA_VERSION, 12);
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
                seedMissingActors: undefined
            }),
            /seedMissingActors/
        );
    });

    it("calls seedMissingActors during v12 migration and includes it in applied steps", async () => {
        let seedCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => {
            seedCalled = true;
            return { createdActors: 3, createdItems: 0, totalCreated: 3, skippedExisting: 0, createdByType: {}, stats: {} };
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
            notify: false
        });

        assert.equal(seedCalled, true);
        assert.equal(result.toVersion, 12);
        const step = result.applied.find((s) => s.key === "seed-missing-actors");
        assert.ok(step, "seed-missing-actors step should be present");
        assert.equal(step.version, 12);
        assert.equal(step.report.createdActors, 3);
    });

    it("skips v12 when currentVersion is already 12", async () => {
        let seedCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => { seedCalled = true; return {}; };

        const result = await runTotcMigrations({
            currentVersion: 12,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            notify: false
        });

        assert.equal(seedCalled, false);
        assert.equal(result.applied.length, 0);
    });
});
