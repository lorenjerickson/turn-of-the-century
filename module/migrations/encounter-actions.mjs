function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function getDefaultActionType(itemType) {
    if (itemType === "weapon") return "attack";
    if (itemType === "consumable") return "consumable";
    return "utility";
}

function getDefaultActionId(item) {
    if (item.type === "weapon") {
        const classification = item.system?.classification;
        if (classification === "firearm") return "pistolAimedShot";
        return "weaponAttack";
    }

    if (item.type === "consumable") {
        if (item.system?.slot === "belt") return "consumeBeltElixir";
        return "consumeItem";
    }

    return "useItem";
}

function getDefaultVariants(item) {
    if (item.type === "weapon") {
        const classification = item.system?.classification;
        if (classification === "firearm") {
            return [
                {
                    id: "pistolQuickShot",
                    label: "Quick Shot",
                    type: "attack",
                    apCost: 2,
                    requiresToHit: true,
                    toHitBonus: -2,
                    notes: "Fast draw and fire with reduced accuracy."
                },
                {
                    id: "pistolAimedShot",
                    label: "Aim and Fire",
                    type: "attack",
                    apCost: 3,
                    requiresToHit: true,
                    toHitBonus: 0,
                    notes: "Deliberate shot with full accuracy."
                }
            ];
        }

        return [
            {
                id: "weaponAttack",
                label: "Attack",
                type: "attack",
                apCost: Number(item.system?.use?.actionCost ?? 2),
                requiresToHit: true,
                toHitBonus: 0,
                notes: "Standard attack action."
            }
        ];
    }

    if (item.type === "consumable") {
        const isBelt = item.system?.slot === "belt";
        const id = isBelt ? "consumeBeltElixir" : "consumeItem";

        return [
            {
                id,
                label: isBelt ? "Consume Belt Elixir" : "Consume Item",
                type: "consumable",
                apCost: Number(item.system?.use?.actionCost ?? (isBelt ? 2 : 1)),
                requiresToHit: false,
                toHitBonus: 0,
                notes: "Consume or apply this item."
            }
        ];
    }

    return [
        {
            id: "useItem",
            label: "Use Item",
            type: getDefaultActionType(item.type),
            apCost: Number(item.system?.use?.actionCost ?? 1),
            requiresToHit: false,
            toHitBonus: 0,
            notes: "Use the item in context."
        }
    ];
}

function needsItemUpdate(item) {
    const system = item.system ?? {};
    const current = system.actions ?? {};
    if (!current.defaultActionId) return true;
    if (!toArray(current.variants).length) return true;
    return false;
}

function buildItemUpdate(item) {
    if (!needsItemUpdate(item)) return null;

    const defaultActionId = getDefaultActionId(item);
    const variants = getDefaultVariants(item);

    return {
        "system.actions.defaultActionId": defaultActionId,
        "system.actions.variants": variants
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

export async function migrateTotcEncounterActions({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun,
        includeCompendiums,
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

    const worldItems = (game.items?.contents ?? []).filter((item) => ["weapon", "consumable", "equipment", "item", "skill", "talent"].includes(item.type));
    await migrateCollectionItems(worldItems, report, "world-item", { dryRun });

    for (const actor of game.actors?.contents ?? []) {
        const actorItems = (actor.items?.contents ?? []).filter((item) => ["weapon", "consumable", "equipment", "item", "skill", "talent"].includes(item.type));
        await migrateCollectionItems(actorItems, report, `actor:${actor.name}`, { dryRun });
    }

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === "Item" && pack.metadata.packageType === "system") ?? []);
        for (const pack of packs) {
            const wasLocked = pack.locked;
            if (wasLocked && !dryRun) await pack.configure({ locked: false });

            try {
                const docs = await pack.getDocuments();
                const filtered = docs.filter((item) => ["weapon", "consumable", "equipment", "item", "skill", "talent"].includes(item.type));
                await migrateCollectionItems(filtered, report, pack.collection, { dryRun });
            } finally {
                if (wasLocked && !dryRun) await pack.configure({ locked: true });
            }
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(`Turn of the Century encounter-action ${label}: ${report.itemsUpdated} items updated.`);
    }

    return report;
}
