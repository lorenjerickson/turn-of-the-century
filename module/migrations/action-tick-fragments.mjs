import { tickFragmentsForItemAction } from "../content/action-tick-fragments.mjs";
import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const MIGRATABLE_ITEM_TYPES = new Set([
    "armor",
    "consumable",
    "equipment",
    "item",
    "skill",
    "talent",
    "weapon"
]);

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function hasFragments(variant = {}) {
    return toArray(variant.tickNarrativeFragments).some((fragment) => String(fragment ?? "").trim());
}

export function buildTickFragmentVariantUpdate(item, variant) {
    if (!variant || hasFragments(variant)) return null;
    const fragments = tickFragmentsForItemAction(item?.name, variant.id);
    if (!fragments.length) return null;
    return {
        ...variant,
        tickNarrativeFragments: fragments
    };
}

function buildItemUpdate(item) {
    if (!MIGRATABLE_ITEM_TYPES.has(String(item?.type ?? "").toLowerCase())) return null;

    const variants = toArray(item.system?.actions?.variants);
    if (!variants.length) return null;

    const nextVariants = variants.map((variant) => buildTickFragmentVariantUpdate(item, variant) ?? variant);
    const changed = nextVariants.some((variant, index) => variant !== variants[index]);
    if (!changed) return null;

    return {
        "system.actions.variants": nextVariants
    };
}

async function migrateItems(items, report, source, { dryRun = false } = {}) {
    for (const item of items ?? []) {
        report.itemsScanned += 1;
        const update = buildItemUpdate(item);
        if (!update) continue;
        report.itemsUpdated += 1;
        report.changedDocuments.push({ source, id: item.id, name: item.name });
        if (!dryRun) await item.update(update);
    }
}

export async function migrateTotcActionTickFragments({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun: Boolean(dryRun),
        includeCompendiums: Boolean(includeCompendiums),
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

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
        ui.notifications?.info(`Turn of the Century action tick-fragment migration: ${report.itemsUpdated} items updated.`);
    }

    return report;
}
