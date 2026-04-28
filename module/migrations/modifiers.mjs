const MODIFIER_ITEM_TYPES = new Set(["armor", "consumable", "effect", "ethnicity", "equipment", "item", "weapon"]);

function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
}

function buildActorModifierUpdate(actor) {
    const system = actor.system?.toObject?.() ?? foundry.utils.deepClone(actor.system ?? {});
    const modifiers = asObject(system.modifiers);

    const updateData = {};
    if (!Array.isArray(modifiers.active)) updateData["system.modifiers.active"] = [];
    if (!Array.isArray(modifiers.suppressed)) updateData["system.modifiers.suppressed"] = [];

    return updateData;
}

function buildItemModifierUpdate(item) {
    if (!MODIFIER_ITEM_TYPES.has(item.type)) return null;

    const system = item.system?.toObject?.() ?? foundry.utils.deepClone(item.system ?? {});
    if (Array.isArray(system.modifiers)) return null;

    return { "system.modifiers": [] };
}

async function migrateActor(actor, { dryRun = false } = {}) {
    const updateData = buildActorModifierUpdate(actor);
    const changedPaths = Object.keys(updateData);

    if (!changedPaths.length) {
        return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: false };
    }

    if (!dryRun) await actor.update(updateData);
    return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: !dryRun };
}

async function migrateItem(item, { dryRun = false } = {}) {
    const updateData = buildItemModifierUpdate(item);
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

export async function migrateTotcModifiers({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun,
        includeCompendiums,
        actorsScanned: 0,
        actorsUpdated: 0,
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

    for (const actor of game.actors?.contents ?? []) {
        report.actorsScanned += 1;
        const actorResult = await migrateActor(actor, { dryRun });
        if (actorResult.changedPaths.length) {
            report.actorsUpdated += 1;
            report.changedDocuments.push({ source: "world-actor", ...actorResult });
        }

        const actorItems = (actor.items?.contents ?? []).filter((item) => MODIFIER_ITEM_TYPES.has(item.type));
        await migrateCollectionItems(actorItems, report, `actor:${actor.name}`, { dryRun });
    }

    const worldItems = (game.items?.contents ?? []).filter((item) => MODIFIER_ITEM_TYPES.has(item.type));
    await migrateCollectionItems(worldItems, report, "world-item", { dryRun });

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === "Item" && pack.metadata.packageType === "system") ?? []);
        for (const pack of packs) {
            const wasLocked = pack.locked;
            if (wasLocked && !dryRun) await pack.configure({ locked: false });

            try {
                const docs = await pack.getDocuments();
                const filtered = docs.filter((item) => MODIFIER_ITEM_TYPES.has(item.type));
                await migrateCollectionItems(filtered, report, pack.collection, { dryRun });
            } finally {
                if (wasLocked && !dryRun) await pack.configure({ locked: true });
            }
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(
            `Turn of the Century modifier ${label}: ${report.actorsUpdated} actors and ${report.itemsUpdated} items updated.`
        );
    }

    return report;
}
