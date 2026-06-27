import {
    createActorEntry,
    createArmorEntry,
    createConsumableEntry,
    createEffectEntry,
    createEthnicityEntry,
    createItemLikeEntry,
    createProfessionEntry,
    createQuirkEntry,
    createWeaponEntry,
    maybeDeepClone
} from "./content/builders/sample-content-builders.mjs";
import { ACTOR_CONFIGS } from "./content/actors.mjs";
import { ARMOR_CONFIGS } from "./content/armor.mjs";
import { CONSUMABLE_CONFIGS } from "./content/consumables.mjs";
import { EFFECT_CONFIGS } from "./content/effects.mjs";
import { ETHNICITY_CONFIGS } from "./content/ethnicities.mjs";
import { EQUIPMENT_CONFIGS } from "./content/equipment.mjs";
import { ITEM_CONFIGS } from "./content/items.mjs";
import { PROFESSION_CONFIGS } from "./content/professions.mjs";
import { QUIRK_CONFIGS } from "./content/quirks.mjs";
import { SKILL_ITEM_CONFIGS } from "./content/skills.mjs";
import { TALENT_CONFIGS } from "./content/talents.mjs";
import { WEAPON_CONFIGS } from "./content/weapons.mjs";
import { STARTER_ACTOR_LOADOUTS } from "./content/starter-loadouts.mjs";
export const TOTC_SAMPLE_ITEMS = [
    ...ARMOR_CONFIGS.map(createArmorEntry),
    ...WEAPON_CONFIGS.map(createWeaponEntry),
    ...CONSUMABLE_CONFIGS.map(createConsumableEntry),
    ...EFFECT_CONFIGS.map(createEffectEntry),
    ...ETHNICITY_CONFIGS.map(createEthnicityEntry),
    ...PROFESSION_CONFIGS.map(createProfessionEntry),
    ...QUIRK_CONFIGS.map(createQuirkEntry),
    ...EQUIPMENT_CONFIGS.map((entry) => createItemLikeEntry("equipment", entry)),
    ...ITEM_CONFIGS.map((entry) => createItemLikeEntry("item", entry)),
    ...SKILL_ITEM_CONFIGS.map((entry) => createItemLikeEntry("skill", entry)),
    ...TALENT_CONFIGS.map((entry) => createItemLikeEntry("talent", entry))
];

function toStarterItemKey(type, name) {
    return `${type}:${name}`;
}

function createStarterItemId(actorIndex, itemIndex) {
    const actorPart = actorIndex.toString(36).padStart(2, "0");
    const itemPart = itemIndex.toString(36).padStart(12, "0");
    return `ld${actorPart}${itemPart}`;
}

function isLoadoutSlotCompatible(itemData, slotKey, slotData) {
    const allowedTypes = new Set(slotData?.allowedTypes ?? []);
    if (itemData.system?.slot !== slotKey) {
        return false;
    }

    if (itemData.type === "armor") {
        return allowedTypes.has("armor");
    }

    if (allowedTypes.has(itemData.type)) {
        return true;
    }

    const category = itemData.system?.category ?? "";
    if (allowedTypes.has("tool") && (itemData.type === "equipment" || itemData.type === "item") && category === "tool") {
        return true;
    }

    return false;
}

function buildActorsWithLoadouts() {
    const starterItemLibrary = new Map(
        TOTC_SAMPLE_ITEMS.map((item) => [toStarterItemKey(item.type, item.name), maybeDeepClone(item)])
    );

    return ACTOR_CONFIGS.map((config, actorIndex) => {
        const actorEntry = createActorEntry(config);
        const loadout = STARTER_ACTOR_LOADOUTS[actorEntry.name];
        if (!loadout) return actorEntry;

        const actorWithLoadout = maybeDeepClone(actorEntry);
        const embeddedItems = [];
        const packItemIds = [];
        let embeddedItemIndex = 0;

        const addEmbeddedItem = (reference) => {
            const key = toStarterItemKey(reference.type, reference.name);
            const sourceItem = starterItemLibrary.get(key);
            if (!sourceItem) {
                console.warn(`[turn-of-the-century] Missing starter item for ${actorWithLoadout.name}: ${key}`);
                return null;
            }

            const embedded = maybeDeepClone(sourceItem);
            embedded._id = createStarterItemId(actorIndex, embeddedItemIndex);
            embeddedItemIndex += 1;
            embeddedItems.push(embedded);
            return embedded;
        };

        for (const equippedItem of loadout.equipped ?? []) {
            const embedded = addEmbeddedItem(equippedItem);
            if (!embedded) continue;

            const slotData = actorWithLoadout.system?.inventory?.equipment?.[equippedItem.slot];
            const capacity = Number(slotData?.capacity ?? 0);
            if (!slotData || capacity < 1 || !isLoadoutSlotCompatible(embedded, equippedItem.slot, slotData)) {
                packItemIds.push(embedded._id);
                continue;
            }

            const itemIds = Array.isArray(slotData.itemIds) ? [...slotData.itemIds] : [];
            const requestedIndex = Math.max(Number(equippedItem.position ?? 1) - 1, 0);
            const boundedIndex = Math.min(requestedIndex, capacity - 1);

            if (!itemIds[boundedIndex]) {
                itemIds[boundedIndex] = embedded._id;
            } else {
                const firstOpenIndex = Array.from({ length: capacity }, (_, index) => index).find((index) => !itemIds[index]);
                if (firstOpenIndex === undefined) {
                    packItemIds.push(embedded._id);
                    continue;
                }
                itemIds[firstOpenIndex] = embedded._id;
            }

            slotData.itemIds = itemIds.filter(Boolean).slice(0, capacity);
        }

        for (const packItem of loadout.pack ?? []) {
            const embedded = addEmbeddedItem(packItem);
            if (!embedded) continue;
            packItemIds.push(embedded._id);
        }

        actorWithLoadout.items = embeddedItems;
        actorWithLoadout.system.inventory.pack.itemIds = packItemIds;
        return actorWithLoadout;
    });
}

export const TOTC_SAMPLE_ACTORS = buildActorsWithLoadouts();
export const TOTC_SAMPLE_SCENES = [];

export const TOTC_SAMPLE_LIBRARY_STATS = {
    actors: {
        total: TOTC_SAMPLE_ACTORS.length,
        byType: Object.fromEntries(
            TOTC_SAMPLE_ACTORS.reduce((map, actor) => {
                map.set(actor.type, (map.get(actor.type) ?? 0) + 1);
                return map;
            }, new Map())
        )
    },
    items: {
        total: TOTC_SAMPLE_ITEMS.length,
        byType: Object.fromEntries(
            TOTC_SAMPLE_ITEMS.reduce((map, item) => {
                map.set(item.type, (map.get(item.type) ?? 0) + 1);
                return map;
            }, new Map())
        )
    },
    scenes: {
        total: TOTC_SAMPLE_SCENES.length
    }
};
