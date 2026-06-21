export const TOTC_WORLD_SCHEMA_VERSION = 16;

import { migrateTotcItems } from "./items.mjs";
import { migrateTotcActionRecapFormats } from "./action-recap-formats.mjs";

export async function runTotcMigrations({
    currentVersion = 0,
    migrateActorProfiles,
    migrateActorProfessions,
    migrateActorEconomy,
    migrateEquipmentSlots,
    migrateEncounterActions,
    migrateModifiers,
    migrateActionRecapFormats,
    migrateItemIcons,
    migrateUnlockActions,
    migrateStarterCompendiums,
    seedMissingActors,
    migrateStarterActorAvatars,
    notify = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (typeof migrateActorProfiles !== "function") {
        throw new Error("runTotcMigrations requires a migrateActorProfiles function.");
    }
    if (typeof migrateEquipmentSlots !== "function") {
        throw new Error("runTotcMigrations requires a migrateEquipmentSlots function.");
    }
    if (typeof migrateActorProfessions !== "function") {
        throw new Error("runTotcMigrations requires a migrateActorProfessions function.");
    }
    if (typeof migrateActorEconomy !== "function") {
        throw new Error("runTotcMigrations requires a migrateActorEconomy function.");
    }
    if (typeof migrateEncounterActions !== "function") {
        throw new Error("runTotcMigrations requires a migrateEncounterActions function.");
    }
    if (typeof migrateModifiers !== "function") {
        throw new Error("runTotcMigrations requires a migrateModifiers function.");
    }
    if (typeof migrateActionRecapFormats !== "function") {
        throw new Error("runTotcMigrations requires a migrateActionRecapFormats function.");
    }
    if (typeof migrateItemIcons !== "function") {
        throw new Error("runTotcMigrations requires a migrateItemIcons function.");
    }
    if (typeof migrateUnlockActions !== "function") {
        throw new Error("runTotcMigrations requires a migrateUnlockActions function.");
    }
    if (typeof migrateStarterCompendiums !== "function") {
        throw new Error("runTotcMigrations requires a migrateStarterCompendiums function.");
    }
    if (typeof seedMissingActors !== "function") {
        throw new Error("runTotcMigrations requires a seedMissingActors function.");
    }
    if (typeof migrateStarterActorAvatars !== "function") {
        throw new Error("runTotcMigrations requires a migrateStarterActorAvatars function.");
    }

    let appliedVersion = Number(currentVersion) || 0;
    const appliedSteps = [];

    if (appliedVersion < 1) {
        const report = await migrateActorProfiles({
            includeCompendiums: false,
            dryRun: false,
            notify: false
        });

        appliedSteps.push({
            version: 1,
            key: "actor-profile",
            report
        });
        appliedVersion = 1;
    }

    if (appliedVersion < 2) {
        const report = await migrateEquipmentSlots({
            dryRun: false,
            notify: false
        });

        appliedSteps.push({
            version: 2,
            key: "equipment-slots",
            report
        });
        appliedVersion = 2;
    }

    if (appliedVersion < 3) {
        const report = await migrateEncounterActions({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });

        appliedSteps.push({
            version: 3,
            key: "encounter-actions",
            report
        });
        appliedVersion = 3;
    }

    if (appliedVersion < 4) {
        const report = await migrateModifiers({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });

        appliedSteps.push({
            version: 4,
            key: "modifiers",
            report
        });
        appliedVersion = 4;
    }

    if (appliedVersion < 5) {
        const report = await migrateActorProfessions({
            dryRun: false,
            notify: false,
            includeCompendiums: false
        });

        appliedSteps.push({
            version: 5,
            key: "actor-professions",
            report
        });
        appliedVersion = 5;
    }

    if (appliedVersion < 8) {
        const report = await migrateActorEconomy({
            dryRun: false,
            notify: false,
            includeCompendiums: false
        });

        appliedSteps.push({
            version: 8,
            key: "actor-economy",
            report
        });
        appliedVersion = 8;
    }

    if (appliedVersion < 9) {
        const report = await migrateTotcItems({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });

        appliedSteps.push({
            version: 9,
            key: "totc-items",
            report
        });
        appliedVersion = 9;
    }

    if (appliedVersion < 10) {
        const report = await migrateStarterCompendiums({
            overwrite: true,
            notify: false,
            onlyIfEmpty: true
        });

        appliedSteps.push({
            version: 10,
            key: "starter-compendiums-repair",
            report
        });
        appliedVersion = 10;
    }

    // v11: migrate exportSource flag to _stats.exportSource (idempotent)
    if (appliedVersion < 11) {
        const report = await migrateTotcItems({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });
        appliedSteps.push({
            version: 11,
            key: "exportSource-flag-migration",
            report
        });
        appliedVersion = 11;
    }

    // v12: seed any world actors defined in ACTOR_CONFIGS that are not yet in the world
    if (appliedVersion < 12) {
        const report = await seedMissingActors({ notify: false });
        appliedSteps.push({
            version: 12,
            key: "seed-missing-actors",
            report
        });
        appliedVersion = 12;
    }

    // v13: assign deterministic DiceBear avatars to starter actor compendium entries
    if (appliedVersion < 13) {
        const report = await migrateStarterActorAvatars({
            dryRun: false,
            notify: false,
            overwrite: false
        });
        appliedSteps.push({
            version: 13,
            key: "starter-actor-avatars",
            report
        });
        appliedVersion = 13;
    }

    // v14: backfill recap template strings on existing action variants
    if (appliedVersion < 14) {
        const report = await migrateActionRecapFormats({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });
        appliedSteps.push({
            version: 14,
            key: "action-recap-formats",
            report
        });
        appliedVersion = 14;
    }

    // v15: replace broken and generic starter-item artwork with curated icons
    if (appliedVersion < 15) {
        const report = await migrateItemIcons({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });
        appliedSteps.push({
            version: 15,
            key: "item-icons",
            report
        });
        appliedVersion = 15;
    }

    // v16: add Unlock to compatible standalone and actor-embedded items
    if (appliedVersion < 16) {
        const report = await migrateUnlockActions({
            dryRun: false,
            notify: false,
            includeCompendiums: true
        });
        appliedSteps.push({
            version: 16,
            key: "unlock-actions",
            report
        });
        appliedVersion = 16;
    }

    if (notify && appliedSteps.length) {
        const summary = appliedSteps
            .map((step) => {
                if (step.key === "equipment-slots") {
                    return `${step.key}: ${step.report.actorsUpdated} actors and ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "encounter-actions") {
                    return `${step.key}: ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "modifiers") {
                    return `${step.key}: ${step.report.actorsUpdated} actors and ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "actor-professions") {
                    return `${step.key}: ${step.report.actorsUpdated} actors updated`;
                }

                if (step.key === "actor-economy") {
                    return `${step.key}: ${step.report.actorsUpdated} actors updated`;
                }

                if (step.key === "totc-items") {
                    return `${step.key}: ${step.report.actorsUpdated} actors and ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "starter-compendiums-repair") {
                    if (step.report.skipped) return `${step.key}: skipped (${step.report.existingDocuments} existing documents)`;
                    return `${step.key}: ${step.report.totalImported} documents imported`;
                }

                if (step.key === "seed-missing-actors") {
                    return `${step.key}: ${step.report.createdActors} actors seeded`;
                }

                if (step.key === "starter-actor-avatars") {
                    return `${step.key}: ${step.report.updated} avatars updated`;
                }

                if (step.key === "action-recap-formats") {
                    return `${step.key}: ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "item-icons") {
                    return `${step.key}: ${step.report.itemsUpdated} items updated`;
                }

                if (step.key === "unlock-actions") {
                    return `${step.key}: ${step.report.itemsUpdated} items updated`;
                }

                return `${step.key}: ${step.report.worldActorsUpdated} world actors updated`;
            })
            .join(", ");
        ui.notifications?.info(`Turn of the Century migrations applied (v${appliedVersion}): ${summary}.`);
    }

    return {
        fromVersion: Number(currentVersion) || 0,
        toVersion: appliedVersion,
        applied: appliedSteps
    };
}
