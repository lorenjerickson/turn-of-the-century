export const TOTC_WORLD_SCHEMA_VERSION = 7;

export async function runTotcMigrations({
    currentVersion = 0,
    migrateActorProfiles,
    migrateActorProfessions,
    migrateEquipmentSlots,
    migrateEncounterActions,
    migrateModifiers,
    migrateStarterCompendiums,
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
    if (typeof migrateEncounterActions !== "function") {
        throw new Error("runTotcMigrations requires a migrateEncounterActions function.");
    }
    if (typeof migrateModifiers !== "function") {
        throw new Error("runTotcMigrations requires a migrateModifiers function.");
    }
    if (typeof migrateStarterCompendiums !== "function") {
        throw new Error("runTotcMigrations requires a migrateStarterCompendiums function.");
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

    if (appliedVersion < 6) {
        const report = await migrateStarterCompendiums({
            overwrite: true,
            notify: false
        });

        appliedSteps.push({
            version: 6,
            key: "starter-compendiums",
            report
        });
        appliedVersion = 6;
    }

    if (appliedVersion < 7) {
        const report = await migrateStarterCompendiums({
            overwrite: true,
            notify: false
        });

        appliedSteps.push({
            version: 7,
            key: "starter-compendiums-refresh",
            report
        });
        appliedVersion = 7;
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

                if (step.key === "starter-compendiums") {
                    return `${step.key}: ${step.report.totalImported} documents imported`;
                }

                if (step.key === "starter-compendiums-refresh") {
                    return `${step.key}: ${step.report.totalImported} documents imported`;
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
