import { TOTC_EQUIPMENT_SLOT_KEYS } from "../models/actor.mjs";

function toArrayInput(value) {
    if (!Array.isArray(value)) return "";
    return value.join(", ");
}

function parseArrayInput(value) {
    return String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

const EQUIPMENT_SLOT_FORM_PREFIX = "_slot.system.inventory.equipment.";

function toPlainObject(value) {
    return value?.toObject?.() ?? foundry.utils.deepClone(value ?? {});
}

function isToolItem(item) {
    const category = item.system?.category ?? "";
    return (item.type === "equipment" || item.type === "item") && category === "tool";
}

function formatTypeLabel(type) {
    return String(type ?? "")
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (value) => value.toUpperCase())
        .trim();
}

function isSlotCompatible(item, slotKey, slot) {
    const allowedTypes = new Set(slot.allowedTypes ?? []);

    if (item.type === "armor") {
        return allowedTypes.has("armor") && item.system?.slot === slotKey;
    }

    if (allowedTypes.has(item.type)) {
        return true;
    }

    if (allowedTypes.has("tool") && isToolItem(item)) {
        return true;
    }

    return false;
}

function buildEquipmentSlots(actor, systemSource) {
    const slotData = systemSource.inventory?.equipment ?? {};
    const inventoryItems = actor.items.contents.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        system: toPlainObject(item.system)
    }));
    const selectedBySlot = Object.fromEntries(
        TOTC_EQUIPMENT_SLOT_KEYS.map((slotKey) => [slotKey, Array.isArray(slotData[slotKey]?.itemIds) ? [...slotData[slotKey].itemIds] : []])
    );

    return TOTC_EQUIPMENT_SLOT_KEYS
        .filter((slotKey) => slotData[slotKey])
        .map((slotKey) => {
            const slot = slotData[slotKey];
            const compatibleItems = inventoryItems.filter((item) => isSlotCompatible(item, slotKey, slot));

            return {
                key: slotKey,
                label: slot.label,
                capacity: slot.capacity,
                allowedTypes: [...(slot.allowedTypes ?? [])],
                allowedSummary: (slot.allowedTypes ?? []).map((type) => formatTypeLabel(type)).join(", "),
                hasOptions: compatibleItems.length > 0,
                positions: Array.from({ length: slot.capacity }, (_, index) => {
                    const selectedItemId = selectedBySlot[slotKey][index] ?? "";
                    const blockedIds = new Set(
                        TOTC_EQUIPMENT_SLOT_KEYS.flatMap((otherSlotKey) => {
                            const itemIds = selectedBySlot[otherSlotKey] ?? [];
                            if (otherSlotKey !== slotKey) {
                                return itemIds;
                            }

                            return itemIds.filter((itemId, itemIndex) => itemIndex !== index);
                        }).filter(Boolean)
                    );

                    return {
                        index,
                        label: `${slot.label} ${index + 1}`,
                        fieldName: `${EQUIPMENT_SLOT_FORM_PREFIX}${slotKey}.${index}`,
                        selectedItemId,
                        options: compatibleItems.map((item) => ({
                            id: item.id,
                            name: item.name,
                            type: formatTypeLabel(item.type),
                            disabled: blockedIds.has(item.id)
                        }))
                    };
                })
            };
        });
}

function extractEquipmentSlotUpdates(updateData) {
    const slotSelections = new Map();

    for (const key of Object.keys(updateData)) {
        if (!key.startsWith(EQUIPMENT_SLOT_FORM_PREFIX)) continue;

        const slotPath = key.slice(EQUIPMENT_SLOT_FORM_PREFIX.length).split(".");
        const [slotKey, indexString] = slotPath;
        const index = Number(indexString);

        if (!slotKey || Number.isNaN(index)) {
            delete updateData[key];
            continue;
        }

        const selectedItemId = String(updateData[key] ?? "").trim();
        const entries = slotSelections.get(slotKey) ?? [];
        entries[index] = selectedItemId;
        slotSelections.set(slotKey, entries);
        delete updateData[key];
    }

    const seenIds = new Set();

    for (const slotKey of TOTC_EQUIPMENT_SLOT_KEYS) {
        if (!slotSelections.has(slotKey)) continue;

        const itemIds = (slotSelections.get(slotKey) ?? []).filter((itemId) => {
            if (!itemId || seenIds.has(itemId)) return false;
            seenIds.add(itemId);
            return true;
        });

        updateData[`system.inventory.equipment.${slotKey}.itemIds`] = itemIds;
    }
}

export class TurnOfTheCenturyActorSheet extends ActorSheet {
    static templatePath = "systems/turn-of-the-century/templates/actors/hero-sheet.hbs";

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["turn-of-the-century", "sheet", "actor"],
            width: 760,
            height: 760,
            resizable: true,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }],
            template: this.templatePath
        });
    }

    get template() {
        return this.options.template;
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        const systemSource = this.actor.system?.toObject?.() ?? foundry.utils.deepClone(this.actor.system ?? {});

        context.system = systemSource;
        context.equipmentSlots = buildEquipmentSlots(this.actor, systemSource);
        context.profileTags = toArrayInput(systemSource.profile?.tags);
        context.heroBonds = toArrayInput(systemSource.hero?.bonds);
        context.villainLieutenants = toArrayInput(systemSource.villain?.lieutenants);

        return context;
    }

    async _updateObject(event, formData) {
        const updateData = foundry.utils.deepClone(formData);

        extractEquipmentSlotUpdates(updateData);

        if (Object.hasOwn(updateData, "_array.system.profile.tags")) {
            updateData["system.profile.tags"] = parseArrayInput(updateData["_array.system.profile.tags"]);
            delete updateData["_array.system.profile.tags"];
        }

        if (Object.hasOwn(updateData, "_array.system.hero.bonds")) {
            updateData["system.hero.bonds"] = parseArrayInput(updateData["_array.system.hero.bonds"]);
            delete updateData["_array.system.hero.bonds"];
        }

        if (Object.hasOwn(updateData, "_array.system.villain.lieutenants")) {
            updateData["system.villain.lieutenants"] = parseArrayInput(updateData["_array.system.villain.lieutenants"]);
            delete updateData["_array.system.villain.lieutenants"];
        }

        return this.object.update(updateData);
    }
}

export class TurnOfTheCenturyHeroSheet extends TurnOfTheCenturyActorSheet {
    static templatePath = "systems/turn-of-the-century/templates/actors/hero-sheet.hbs";
}

export class TurnOfTheCenturyVillainSheet extends TurnOfTheCenturyActorSheet {
    static templatePath = "systems/turn-of-the-century/templates/actors/villain-sheet.hbs";
}

export class TurnOfTheCenturyPawnSheet extends TurnOfTheCenturyActorSheet {
    static templatePath = "systems/turn-of-the-century/templates/actors/pawn-sheet.hbs";
}
