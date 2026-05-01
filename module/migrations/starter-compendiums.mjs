import { publishTotcSampleCompendiums } from "../sample-content.mjs";

export async function migrateTotcStarterCompendiums({
    overwrite = true,
    notify = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (!game.user?.isGM) {
        throw new Error("Only a GM can run starter compendium migrations.");
    }

    const report = await publishTotcSampleCompendiums({ overwrite });

    if (notify) {
        ui.notifications?.info(
            `Turn of the Century starter compendiums refreshed (${report.totalImported} imported across ${Object.keys(report.byPack ?? {}).length} packs).`
        );
    }

    return report;
}
