import {
    TOTC_SAMPLE_COMPENDIUMS,
    publishTotcSampleCompendiums
} from "../sample-content.mjs";

async function getStarterCompendiumDocumentCount() {
    const systemId = game.system?.id;
    const packNames = Object.values(TOTC_SAMPLE_COMPENDIUMS);
    let total = 0;

    for (const packName of packNames) {
        const pack = game.packs.get(`${systemId}.${packName}`);
        if (!pack) continue;

        try {
            const index = await pack.getIndex();
            total += Number(index?.size ?? index?.length ?? pack.index?.size ?? pack.index?.length ?? 0);
        } catch (error) {
            console.warn("[turn-of-the-century] Failed to inspect starter compendium pack.", packName, error);
        }
    }

    return total;
}

export async function migrateTotcStarterCompendiums({
    overwrite = true,
    notify = true,
    onlyIfEmpty = false
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (!game.user?.isGM) {
        throw new Error("Only a GM can run starter compendium migrations.");
    }

    if (onlyIfEmpty) {
        const existingDocuments = await getStarterCompendiumDocumentCount();
        if (existingDocuments > 0) {
            return {
                skipped: true,
                reason: "starter compendiums already contain documents",
                existingDocuments,
                totalImported: 0,
                byPack: {}
            };
        }
    }

    const report = await publishTotcSampleCompendiums({ overwrite });

    if (notify) {
        ui.notifications?.info(
            `Turn of the Century starter compendiums refreshed (${report.totalImported} imported across ${Object.keys(report.byPack ?? {}).length} packs).`
        );
    }

    return report;
}
