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
    it("exports TOTC_WORLD_SCHEMA_VERSION as 19", () => {
        assert.equal(TOTC_WORLD_SCHEMA_VERSION, 19);
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
                migrateUnlockActions: noop,
                migrateActionTickFragments: noop,
                migrateStarterCompendiums: noop,
                seedMissingActors: undefined,
                migrateStarterActorAvatars: noop,
                migrateStarterActorTokenArt: noop
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
                migrateUnlockActions: noop,
                migrateActionTickFragments: noop,
                migrateStarterCompendiums: noop,
                seedMissingActors: noop,
                migrateStarterActorAvatars: undefined,
                migrateStarterActorTokenArt: noop
            }),
            /migrateStarterActorAvatars/
        );
    });

    it("throws when migrateStarterActorTokenArt is not a function", async () => {
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
                migrateUnlockActions: noop,
                migrateActionTickFragments: noop,
                migrateStarterCompendiums: noop,
                seedMissingActors: noop,
                migrateStarterActorAvatars: noop,
                migrateStarterActorTokenArt: undefined
            }),
            /migrateStarterActorTokenArt/
        );
    });

    it("throws when migrateActionTickFragments is not a function", async () => {
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
                migrateUnlockActions: noop,
                migrateActionTickFragments: undefined,
                migrateStarterCompendiums: noop,
                seedMissingActors: noop,
                migrateStarterActorAvatars: noop,
                migrateStarterActorTokenArt: noop
            }),
            /migrateActionTickFragments/
        );
    });

    it("calls seedMissingActors during v12 migration and includes it in applied steps", async () => {
        let seedCalled = false;
        let avatarsCalled = false;
        let recapCalled = false;
        let iconsCalled = false;
        let unlockActionsCalled = false;
        let tokenArtCalled = false;
        let handArmorCalled = false;
        let tickFragmentsCalled = false;
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
        const migrateUnlockActions = async () => {
            unlockActionsCalled = true;
            return { itemsScanned: 6, itemsUpdated: 3, changedDocuments: [] };
        };
        const migrateStarterActorTokenArt = async () => {
            tokenArtCalled = true;
            return { scanned: 4, updated: 4, skipped: 0 };
        };
        const migrateEquipmentSlots = async () => {
            handArmorCalled = true;
            return { actorsUpdated: 2, itemsUpdated: 1 };
        };
        const migrateActionTickFragments = async () => {
            tickFragmentsCalled = true;
            return { itemsScanned: 9, itemsUpdated: 6, changedDocuments: [] };
        };

        const result = await runTotcMigrations({
            currentVersion: 11,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats,
            migrateItemIcons,
            migrateUnlockActions,
            migrateActionTickFragments,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            migrateStarterActorTokenArt,
            notify: false
        });

        assert.equal(seedCalled, true);
        assert.equal(avatarsCalled, true);
        assert.equal(recapCalled, true);
        assert.equal(iconsCalled, true);
        assert.equal(unlockActionsCalled, true);
        assert.equal(tokenArtCalled, true);
        assert.equal(handArmorCalled, true);
        assert.equal(tickFragmentsCalled, true);
        assert.equal(result.toVersion, 19);
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
        const unlockStep = result.applied.find((s) => s.key === "unlock-actions");
        assert.ok(unlockStep, "unlock-actions step should be present");
        assert.equal(unlockStep.version, 16);
        assert.equal(unlockStep.report.itemsUpdated, 3);
        const tokenArtStep = result.applied.find((s) => s.key === "starter-actor-token-art");
        assert.ok(tokenArtStep, "starter-actor-token-art step should be present");
        assert.equal(tokenArtStep.version, 17);
        assert.equal(tokenArtStep.report.updated, 4);
        const handArmorStep = result.applied.find((s) => s.key === "hand-armor-equipment-slot");
        assert.ok(handArmorStep, "hand-armor-equipment-slot step should be present");
        assert.equal(handArmorStep.version, 18);
        assert.equal(handArmorStep.report.actorsUpdated, 2);
        const tickFragmentStep = result.applied.find((s) => s.key === "action-tick-fragments");
        assert.ok(tickFragmentStep, "action-tick-fragments step should be present");
        assert.equal(tickFragmentStep.version, 19);
        assert.equal(tickFragmentStep.report.itemsUpdated, 6);
    });

    it("runs v18 hand-armor split and v19 tick fragments when currentVersion is 17", async () => {
        let handArmorCalled = false;
        let tickFragmentsCalled = false;
        const noop = async () => ({});
        const migrateEquipmentSlots = async () => {
            handArmorCalled = true;
            return { actorsUpdated: 1, itemsUpdated: 2 };
        };
        const migrateActionTickFragments = async () => {
            tickFragmentsCalled = true;
            return { itemsScanned: 3, itemsUpdated: 3, changedDocuments: [] };
        };

        const result = await runTotcMigrations({
            currentVersion: 17,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats: noop,
            migrateItemIcons: noop,
            migrateUnlockActions: noop,
            migrateActionTickFragments,
            migrateStarterCompendiums: noop,
            seedMissingActors: noop,
            migrateStarterActorAvatars: noop,
            migrateStarterActorTokenArt: noop,
            notify: false
        });

        assert.equal(handArmorCalled, true);
        assert.equal(tickFragmentsCalled, true);
        assert.equal(result.toVersion, 19);
        assert.deepEqual(result.applied.map((step) => step.key), ["hand-armor-equipment-slot", "action-tick-fragments"]);
    });

    it("runs only v19 tick fragments when currentVersion is 18", async () => {
        let tickFragmentsCalled = false;
        const noop = async () => ({});
        const migrateActionTickFragments = async () => {
            tickFragmentsCalled = true;
            return { itemsScanned: 3, itemsUpdated: 2, changedDocuments: [] };
        };

        const result = await runTotcMigrations({
            currentVersion: 18,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots: noop,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats: noop,
            migrateItemIcons: noop,
            migrateUnlockActions: noop,
            migrateActionTickFragments,
            migrateStarterCompendiums: noop,
            seedMissingActors: noop,
            migrateStarterActorAvatars: noop,
            migrateStarterActorTokenArt: noop,
            notify: false
        });

        assert.equal(tickFragmentsCalled, true);
        assert.equal(result.toVersion, 19);
        assert.deepEqual(result.applied.map((step) => step.key), ["action-tick-fragments"]);
    });

    it("skips v12 through v19 when currentVersion is already 19", async () => {
        let seedCalled = false;
        let avatarsCalled = false;
        let recapCalled = false;
        let iconsCalled = false;
        let unlockActionsCalled = false;
        let tokenArtCalled = false;
        let handArmorCalled = false;
        let tickFragmentsCalled = false;
        const noop = async () => ({});
        const seedMissingActors = async () => { seedCalled = true; return {}; };
        const migrateActionRecapFormats = async () => { recapCalled = true; return {}; };
        const migrateStarterActorAvatars = async () => { avatarsCalled = true; return {}; };
        const migrateItemIcons = async () => { iconsCalled = true; return {}; };
        const migrateUnlockActions = async () => { unlockActionsCalled = true; return {}; };
        const migrateStarterActorTokenArt = async () => { tokenArtCalled = true; return {}; };
        const migrateEquipmentSlots = async () => { handArmorCalled = true; return {}; };
        const migrateActionTickFragments = async () => { tickFragmentsCalled = true; return {}; };

        const result = await runTotcMigrations({
            currentVersion: 19,
            migrateActorProfiles: noop,
            migrateActorProfessions: noop,
            migrateActorEconomy: noop,
            migrateEquipmentSlots,
            migrateEncounterActions: noop,
            migrateModifiers: noop,
            migrateActionRecapFormats,
            migrateItemIcons,
            migrateUnlockActions,
            migrateActionTickFragments,
            migrateStarterCompendiums: noop,
            seedMissingActors,
            migrateStarterActorAvatars,
            migrateStarterActorTokenArt,
            notify: false
        });

        assert.equal(seedCalled, false);
        assert.equal(avatarsCalled, false);
        assert.equal(recapCalled, false);
        assert.equal(iconsCalled, false);
        assert.equal(unlockActionsCalled, false);
        assert.equal(tokenArtCalled, false);
        assert.equal(handArmorCalled, false);
        assert.equal(tickFragmentsCalled, false);
        assert.equal(result.applied.length, 0);
    });
});
