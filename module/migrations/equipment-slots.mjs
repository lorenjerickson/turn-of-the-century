import { TOTC_EQUIPMENT_SLOTS } from "../models/actor.mjs";

const BELT_QUALITY_CAPACITY = {
    poor: 2,
    standard: 4,
    fine: 5,
    exceptional: 6,
    masterwork: 7,
    experimental: 8
};

const ITEM_SLOT_DEFAULTS = {
    armor: "torso",
    weapon: "hands",
    consumable: "belt",
    equipment: "belt",
    item: "belt"
};

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function unique(values) {
    return Array.from(new Set(values));
}

function beltQualityFromCapacity(capacity) {
    const value = Number(capacity) || 0;
    if (value <= 2) return "poor";
    if (value <= 4) return "standard";
    if (value === 5) return "fine";
    if (value === 6) return "exceptional";
    if (value === 7) return "masterwork";
    return "experimental";
}

function ensureSlotConfig(slotKey, slotValue) {
    const defaults = TOTC_EQUIPMENT_SLOTS[slotKey];
    const current = slotValue ?? {};

    const allowedTypes = unique([
        ...defaults.allowed,
        ...toArray(current.allowedTypes)
    ]);

    let quality = current.quality;
    if (!quality) {
        quality = slotKey === "belt"
            ? beltQualityFromCapacity(current.capacity ?? defaults.capacity)
            : "standard";
    }

    let capacity = Number(current.capacity ?? defaults.capacity) || defaults.capacity;
    if (slotKey === "belt") {
        capacity = BELT_QUALITY_CAPACITY[quality] ?? BELT_QUALITY_CAPACITY.standard;
    }

    return {
        label: current.label ?? slotKey.charAt(0).toUpperCase() + slotKey.slice(1),
        capacity,
        quality,
        allowedTypes,
        itemIds: toArray(current.itemIds).slice(0, capacity)
    };
}

function buildActorSlotUpdate(actor) {
    const system = actor.system?.toObject?.() ?? foundry.utils.deepClone(actor.system ?? {});
    const equipment = system.inventory?.equipment ?? {};

    const updates = {};
    for (const slotKey of Object.keys(TOTC_EQUIPMENT_SLOTS)) {
        const normalized = ensureSlotConfig(slotKey, equipment[slotKey]);
        const prefix = `system.inventory.equipment.${slotKey}`;
        updates[`${prefix}.label`] = normalized.label;
        updates[`${prefix}.capacity`] = normalized.capacity;
        updates[`${prefix}.quality`] = normalized.quality;
        updates[`${prefix}.allowedTypes`] = normalized.allowedTypes;
        updates[`${prefix}.itemIds`] = normalized.itemIds;
    }

    return updates;
}

function getExpectedItemSlot(item) {
    return ITEM_SLOT_DEFAULTS[item.type] ?? null;
}

function buildItemSlotUpdate(item) {
    const expected = getExpectedItemSlot(item);
    if (!expected) return null;

    const currentSlot = item.system?.slot;
    if (currentSlot) return null;

    return { "system.slot": expected };
}

async function migrateActor(actor, { dryRun = false } = {}) {
    const updateData = buildActorSlotUpdate(actor);
    const changedPaths = Object.keys(updateData);

    if (!changedPaths.length) {
        return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: false };
    }

    if (!dryRun) await actor.update(updateData);
    return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: !dryRun };
}

async function migrateItem(item, { dryRun = false } = {}) {
    const updateData = buildItemSlotUpdate(item);
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

export async function migrateTotcEquipmentSlots({ dryRun = false, notify = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun,
        actorsScanned: 0,
        actorsUpdated: 0,
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

    for (const actor of game.actors?.contents ?? []) {
        report.actorsScanned += 1;
        const result = await migrateActor(actor, { dryRun });
        if (result.changedPaths.length) {
            report.changedDocuments.push({ source: "world-actor", ...result });
            report.actorsUpdated += 1;
        }

        for (const item of actor.items?.contents ?? []) {
            report.itemsScanned += 1;
            const itemResult = await migrateItem(item, { dryRun });
            if (itemResult.changedPaths.length) {
                report.changedDocuments.push({ source: `actor:${actor.name}`, ...itemResult });
                report.itemsUpdated += 1;
            }
        }
    }

    for (const item of game.items?.contents ?? []) {
        report.itemsScanned += 1;
        const result = await migrateItem(item, { dryRun });
        if (result.changedPaths.length) {
            report.changedDocuments.push({ source: "world-item", ...result });
            report.itemsUpdated += 1;
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(
            `Turn of the Century equipment-slot ${label}: ${report.actorsUpdated} actors and ${report.itemsUpdated} items updated.`
        );
    }

    return report;
}
