import { withUnlockedCompendiumPack } from './compendium-locking.mjs';

const MIGRATABLE_ITEM_TYPES = new Set([
    'armor',
    'consumable',
    'equipment',
    'item',
    'skill',
    'talent',
    'weapon'
]);

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function defaultRecapFormatForItem(item, variant) {
    const type = String(item?.type ?? '').toLowerCase();
    const actionType = String(variant?.type ?? '').toLowerCase();

    if (actionType === 'movement') {
        return '{{Owner.name}} moves.';
    }

    if (actionType === 'consumable') {
        return '{{Owner.name}} uses {{Item.name}}.';
    }

    if (type === 'weapon' || actionType === 'attack') {
        return '{{Owner.name}} uses {{Item.name}} on {{Target.name}} and {{action.hitResult}}.';
    }

    return '{{Owner.name}} uses {{Item.name}}.';
}

function buildVariantUpdate(item, variant) {
    if (!variant || String(variant.recapFormat ?? '').trim()) return null;
    return {
        ...variant,
        recapFormat: defaultRecapFormatForItem(item, variant)
    };
}

function buildItemUpdate(item) {
    if (!MIGRATABLE_ITEM_TYPES.has(String(item?.type ?? '').toLowerCase())) return null;

    const variants = toArray(item.system?.actions?.variants);
    if (!variants.length) return null;

    const nextVariants = variants.map((variant) => buildVariantUpdate(item, variant) ?? variant);
    const changed = nextVariants.some((variant, index) => variant !== variants[index]);
    if (!changed) return null;

    return {
        'system.actions.variants': nextVariants
    };
}

async function migrateItem(item, { dryRun = false } = {}) {
    const updateData = buildItemUpdate(item);
    if (!updateData) {
        return { id: item.id, name: item.name, type: item.type, changedPaths: [], updated: false };
    }

    if (!dryRun) await item.update(updateData);

    return {
        id: item.id,
        name: item.name,
        type: item.type,
        changedPaths: Object.keys(updateData),
        updated: !dryRun
    };
}

async function migrateCollectionItems(documents, report, sourceLabel, { dryRun = false } = {}) {
    for (const item of documents) {
        report.itemsScanned += 1;
        const result = await migrateItem(item, { dryRun });
        if (!result.changedPaths.length) continue;

        report.itemsUpdated += 1;
        report.changedDocuments.push({ source: sourceLabel, ...result });
    }
}

export async function migrateTotcActionRecapFormats({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error('Game is not ready yet.');

    const report = {
        dryRun: Boolean(dryRun),
        includeCompendiums: Boolean(includeCompendiums),
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

    const worldItems = (game.items?.contents ?? []).filter((item) => MIGRATABLE_ITEM_TYPES.has(String(item.type ?? '').toLowerCase()));
    await migrateCollectionItems(worldItems, report, 'world-item', { dryRun });

    for (const actor of game.actors?.contents ?? []) {
        const actorItems = (actor.items?.contents ?? []).filter((item) => MIGRATABLE_ITEM_TYPES.has(String(item.type ?? '').toLowerCase()));
        await migrateCollectionItems(actorItems, report, `actor:${actor.name}`, { dryRun });
    }

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === 'Item' && pack.metadata.packageType === 'system') ?? []);
        for (const pack of packs) {
            await withUnlockedCompendiumPack(pack, async () => {
                const docs = await pack.getDocuments();
                const filtered = docs.filter((item) => MIGRATABLE_ITEM_TYPES.has(String(item.type ?? '').toLowerCase()));
                await migrateCollectionItems(filtered, report, pack.collection, { dryRun });
            }, { dryRun });
        }
    }

    if (notify) {
        const label = dryRun ? 'dry-run' : 'migration';
        ui.notifications?.info(`Turn of the Century recap-format ${label}: ${report.itemsUpdated} items updated.`);
    }

    return report;
}