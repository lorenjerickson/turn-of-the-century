import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const UNLOCK_ACTIONS_BY_ITEM_NAME = Object.freeze({
    "locksmith roll": "{{Owner.name}} works {{Item.name}} through the lock.",
    "folding pry hook": "{{Owner.name}} levers the lock open with {{Item.name}}.",
    "acid-wash solution": "{{Owner.name}} applies {{Item.name}} and frees the lock."
});

function unlockRecapForItem(item) {
    return UNLOCK_ACTIONS_BY_ITEM_NAME[String(item?.name ?? "").trim().toLowerCase()] ?? null;
}

export function buildUnlockActionMigrationUpdate(item) {
    const recapFormat = unlockRecapForItem(item);
    if (!recapFormat) return null;

    const currentActions = item.system?.actions ?? {};
    const variants = Array.isArray(currentActions.variants) ? currentActions.variants : [];
    if (variants.some((variant) => String(variant?.id ?? "") === "unlock")) return null;

    return {
        "system.actions.defaultActionId": currentActions.defaultActionId || variants[0]?.id || "unlock",
        "system.actions.variants": [
            ...variants,
            {
                id: "unlock",
                label: "Unlock",
                type: "utility",
                apCost: 2,
                requiresToHit: false,
                toHitBonus: 0,
                recapFormat,
                notes: "<p>Unlock an adjacent locked door, chest, hatch, or similar mechanism.</p>",
                requirements: []
            }
        ]
    };
}

async function migrateItems(items, report, source, { dryRun = false } = {}) {
    for (const item of items ?? []) {
        report.itemsScanned += 1;
        const update = buildUnlockActionMigrationUpdate(item);
        if (!update) continue;
        report.itemsUpdated += 1;
        report.changedDocuments.push({ source, id: item.id, name: item.name });
        if (!dryRun) await item.update(update);
    }
}

export async function migrateTotcUnlockActions({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = { dryRun, includeCompendiums, itemsScanned: 0, itemsUpdated: 0, changedDocuments: [] };
    await migrateItems(game.items?.contents, report, "world-item", { dryRun });

    for (const actor of game.actors?.contents ?? []) {
        await migrateItems(actor.items?.contents, report, `actor:${actor.name}`, { dryRun });
    }

    if (includeCompendiums) {
        const packs = game.packs?.filter?.((pack) => (
            pack.documentName === "Item" && pack.metadata?.packageType === "system"
        )) ?? [];
        for (const pack of packs) {
            await withUnlockedCompendiumPack(pack, async () => {
                await migrateItems(await pack.getDocuments(), report, pack.collection, { dryRun });
            }, { dryRun });
        }
    }

    if (notify) {
        ui.notifications?.info(`Turn of the Century unlock-action migration: ${report.itemsUpdated} items updated.`);
    }
    return report;
}
