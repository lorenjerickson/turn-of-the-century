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
    it("exports TOTC_WORLD_SCHEMA_VERSION as 15", () => {
        assert.equal(TOTC_WORLD_SCHEMA_VERSION, 15);
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
                migrateActionRecapFormats: noop,
                migrateItemIcons: noop,
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
                migrateActionRecapFormats: noop,
                migrateItemIcons: noop,
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
        let recapCalled = false;
        let iconsCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => {
            seedCalled = true;
            return { createdActors: 3, createdItems: 0, totalCreated: 3, skippedExisting: 0, createdByType: {}, stats: {} };
        };
        const migrateActionRecapFormats = async () => {
            recapCalled = true;
            return { itemsScanned: 8, itemsUpdated: 5, changedDocuments: [] };
        };
        const migrateStarterActorAvatars = async () => {
            avatarsCalled = true;
            return { scanned: 3, updated: 2 };
        };
        const migrateItemIcons = async () => {
            iconsCalled = true;
            return { itemsScanned: 8, itemsUpdated: 4, changedDocuments: [] };
        };

        const result = await runTotcMigrations({
            currentVersion: 11,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats,
            migrateItemIcons,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            notify: false
        });

        assert.equal(seedCalled, true);
        assert.equal(avatarsCalled, true);
        assert.equal(recapCalled, true);
        assert.equal(iconsCalled, true);
        assert.equal(result.toVersion, 15);
        const step = result.applied.find((s) => s.key === "seed-missing-actors");
        assert.ok(step, "seed-missing-actors step should be present");
        assert.equal(step.version, 12);
        assert.equal(step.report.createdActors, 3);
        const avatarStep = result.applied.find((s) => s.key === "starter-actor-avatars");
        assert.ok(avatarStep, "starter-actor-avatars step should be present");
        assert.equal(avatarStep.version, 13);
        assert.equal(avatarStep.report.updated, 2);
        const recapStep = result.applied.find((s) => s.key === "action-recap-formats");
        assert.ok(recapStep, "action-recap-formats step should be present");
        assert.equal(recapStep.version, 14);
        assert.equal(recapStep.report.itemsUpdated, 5);
        const iconStep = result.applied.find((s) => s.key === "item-icons");
        assert.ok(iconStep, "item-icons step should be present");
        assert.equal(iconStep.version, 15);
        assert.equal(iconStep.report.itemsUpdated, 4);
    });

    it("skips v12 through v15 when currentVersion is already 15", async () => {
        let seedCalled = false;
        let avatarsCalled = false;
        let recapCalled = false;
        let iconsCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => { seedCalled = true; return {}; };
        const migrateActionRecapFormats = async () => { recapCalled = true; return {}; };
        const migrateStarterActorAvatars = async () => { avatarsCalled = true; return {}; };
        const migrateItemIcons = async () => { iconsCalled = true; return {}; };

        const result = await runTotcMigrations({
            currentVersion: 15,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats,
            migrateItemIcons,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            notify: false
        });

        assert.equal(seedCalled, false);
        assert.equal(avatarsCalled, false);
        assert.equal(recapCalled, false);
        assert.equal(iconsCalled, false);
        assert.equal(result.applied.length, 0);
    });
});
