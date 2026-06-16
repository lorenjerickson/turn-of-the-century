import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function buildActorEconomyUpdate(actor) {
    const systemEconomy = actor.system?.economy ?? {};
    const currentMerchant = Boolean(systemEconomy.isMerchant);
    const currentWallet = Math.max(0, toNumber(systemEconomy.wallet?.gbp, 100));

    const legacyMerchant = Boolean(actor.getFlag("turn-of-the-century", "merchantRole"));
    const legacyWallet = actor.getFlag("turn-of-the-century", "wallet") ?? {};
    const legacyWalletGbp = Math.max(0, toNumber(legacyWallet?.gbp, currentWallet));

    const nextMerchant = currentMerchant || legacyMerchant;
    const nextWallet = Math.max(currentWallet, legacyWalletGbp);

    const updateData = {};
    if (nextMerchant !== currentMerchant) {
        updateData["system.economy.isMerchant"] = nextMerchant;
    }

    if (Math.abs(nextWallet - currentWallet) > Number.EPSILON) {
        updateData["system.economy.wallet.gbp"] = nextWallet;
    }

    return updateData;
}

async function migrateActor(actor, { dryRun = false } = {}) {
    const updateData = buildActorEconomyUpdate(actor);
    const changedPaths = Object.keys(updateData);

    if (!changedPaths.length) {
        return {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            changedPaths,
            updated: false
        };
    }

    if (!dryRun) {
        await actor.update(updateData);

        if (actor.getFlag("turn-of-the-century", "merchantRole") !== undefined) {
            await actor.unsetFlag("turn-of-the-century", "merchantRole");
        }

        if (actor.getFlag("turn-of-the-century", "wallet") !== undefined) {
            await actor.unsetFlag("turn-of-the-century", "wallet");
        }
    }

    return {
        id: actor.id,
        name: actor.name,
        type: actor.type,
        changedPaths,
        updated: !dryRun
    };
}

export async function migrateTotcActorEconomy({ dryRun = false, notify = true, includeCompendiums = false } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun,
        includeCompendiums,
        actorsScanned: 0,
        actorsUpdated: 0,
        changedDocuments: []
    };

    for (const actor of game.actors?.contents ?? []) {
        report.actorsScanned += 1;
        const result = await migrateActor(actor, { dryRun });
        if (!result.changedPaths.length) continue;

        report.actorsUpdated += 1;
        report.changedDocuments.push({ source: "world-actor", ...result });
    }

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === "Actor" && pack.metadata.packageType === "system") ?? []);
        for (const pack of packs) {
            await withUnlockedCompendiumPack(pack, async () => {
                const docs = await pack.getDocuments();
                for (const actor of docs) {
                    report.actorsScanned += 1;
                    const result = await migrateActor(actor, { dryRun });
                    if (!result.changedPaths.length) continue;

                    report.actorsUpdated += 1;
                    report.changedDocuments.push({ source: pack.collection, ...result });
                }
            }, { dryRun });
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(
            `Turn of the Century actor-economy ${label}: ${report.actorsUpdated} actors updated.`
        );
    }

    return report;
}
