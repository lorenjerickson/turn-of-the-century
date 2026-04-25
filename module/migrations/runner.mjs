export const TOTC_WORLD_SCHEMA_VERSION = 1;

export async function runTotcMigrations({
    currentVersion = 0,
    migrateActorProfiles,
    notify = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (typeof migrateActorProfiles !== "function") {
        throw new Error("runTotcMigrations requires a migrateActorProfiles function.");
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

    if (notify && appliedSteps.length) {
        const summary = appliedSteps
            .map((step) => `${step.key}: ${step.report.worldActorsUpdated} world actors updated`)
            .join(", ");
        ui.notifications?.info(`Turn of the Century migrations applied (v${appliedVersion}): ${summary}.`);
    }

    return {
        fromVersion: Number(currentVersion) || 0,
        toVersion: appliedVersion,
        applied: appliedSteps
    };
}
