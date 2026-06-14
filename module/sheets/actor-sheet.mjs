import { TOTC_EQUIPMENT_SLOT_KEYS } from "../models/actor.mjs";
import {
    requireActorSheetV2,
    requireItemDocumentClass
} from "../foundry-v14-runtime.mjs";

const BaseActorSheet = requireActorSheetV2();
const BaseItemDocument = requireItemDocumentClass();

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

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

const EQUIPMENT_SLOT_FORM_PREFIX = "_slot.system.inventory.equipment.";
const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";
const BELT_QUALITY_CAPACITY = {
    poor: 2,
    standard: 4,
    fine: 5,
    exceptional: 6,
    masterwork: 7,
    experimental: 8
};
const BELT_QUALITY_OPTIONS = [
    { value: "poor", label: "Poor" },
    { value: "standard", label: "Standard" },
    { value: "fine", label: "Fine" },
    { value: "exceptional", label: "Exceptional" },
    { value: "masterwork", label: "Masterwork" },
    { value: "experimental", label: "Experimental" }
];

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

function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function briefDescription(value, maxLength = 96) {
    const description = stripHtml(value);
    if (description.length <= maxLength) return description;
    return `${description.slice(0, maxLength - 1).trim()}...`;
}

function summarizeInventoryItem(item) {
    const system = item?.system?.toObject?.() ?? item?.system ?? {};
    return {
        id: item.id,
        name: item.name,
        type: formatTypeLabel(item.type),
        img: String(item.img ?? system.artwork?.image ?? "").trim() || DEFAULT_ITEM_ICON,
        description: briefDescription(system.description)
    };
}

function isSlotCompatible(item, slotKey, slot) {
    const allowedTypes = new Set(slot.allowedTypes ?? []);
    const itemSlot = item.system?.slot;

    if (itemSlot !== slotKey) {
        return false;
    }

    if (item.type === "armor") {
        return allowedTypes.has("armor");
    }

    if (allowedTypes.has(item.type)) {
        return true;
    }

    if (allowedTypes.has("tool") && isToolItem(item)) {
        return true;
    }

    return false;
}

function getBeltCapacityFromQuality(quality, fallback = 4) {
    return BELT_QUALITY_CAPACITY[quality] ?? fallback;
}

function getSlotCapacity(slotKey, slot) {
    if (slotKey === "belt") {
        return getBeltCapacityFromQuality(slot?.quality, Number(slot?.capacity ?? 4));
    }

    return Number(slot?.capacity ?? 0);
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
                capacity: getSlotCapacity(slotKey, slot),
                isBelt: slotKey === "belt",
                quality: slot.quality ?? "standard",
                qualityOptions: BELT_QUALITY_OPTIONS,
                allowedTypes: [...(slot.allowedTypes ?? [])],
                allowedSummary: (slot.allowedTypes ?? []).map((type) => formatTypeLabel(type)).join(", "),
                hasOptions: compatibleItems.length > 0,
                positions: Array.from({ length: getSlotCapacity(slotKey, slot) }, (_, index) => {
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
                        selectedItemName: compatibleItems.find((item) => item.id === selectedItemId)?.name ?? "",
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

function buildInventorySummary(actor, systemSource) {
    const equipment = systemSource.inventory?.equipment ?? {};
    const equippedBySlot = TOTC_EQUIPMENT_SLOT_KEYS
        .filter((slotKey) => equipment[slotKey])
        .map((slotKey) => {
            const slot = equipment[slotKey];
            const equippedItems = toArray(slot.itemIds)
                .map((itemId) => actor.items.get(itemId))
                .filter(Boolean)
                .map((item) => summarizeInventoryItem(item));

            return {
                key: slotKey,
                label: slot.label,
                equippedItems
            };
        });

    const equippedIds = new Set(equippedBySlot.flatMap((slot) => slot.equippedItems.map((item) => item.id)));
    const packIds = new Set(toArray(systemSource.inventory?.pack?.itemIds));

    const packItems = [];
    const otherItems = [];
    for (const item of actor.items.contents) {
        const summary = summarizeInventoryItem(item);

        if (equippedIds.has(item.id)) continue;
        if (packIds.has(item.id)) {
            packItems.push(summary);
        } else {
            otherItems.push(summary);
        }
    }

    return {
        equippedBySlot,
        packItems,
        otherItems
    };
}

function addProfessionOption(optionsByKey, value) {
    const name = String(value ?? "").trim();
    if (!name) return;

    const key = name.toLowerCase();
    if (!optionsByKey.has(key)) {
        optionsByKey.set(key, name);
    }
}

async function collectProfessionOptions(selectedProfession) {
    const optionsByKey = new Map();

    addProfessionOption(optionsByKey, selectedProfession);

    for (const item of game.items?.contents ?? []) {
        if (item.type !== "profession") continue;
        addProfessionOption(optionsByKey, item.name);
    }

    const itemPacks = game.packs?.filter((pack) => pack.documentName === "Item") ?? [];
    for (const pack of itemPacks) {
        try {
            const index = await pack.getIndex();
            for (const entry of index ?? []) {
                if (entry.type !== "profession") continue;
                addProfessionOption(optionsByKey, entry.name);
            }
        } catch (error) {
            console.warn(`[turn-of-the-century] Failed to read profession index from pack ${pack.collection}.`, error);
        }
    }

    return [...optionsByKey.values()]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name }));
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

function findEmptyEquipmentSlot(actor, item) {
    const slotData = actor.system?.inventory?.equipment ?? {};
    for (const [slotKey, slotInfo] of Object.entries(slotData)) {
        if (!isSlotCompatible(item, slotKey, slotInfo)) continue;
        const currentItems = slotInfo?.itemIds ?? [];
        if (currentItems.length < getSlotCapacity(slotKey, slotInfo)) {
            return { slotKey, slotInfo, index: currentItems.length };
        }
    }
    return null;
}

async function assignItemToSlot(actor, itemId, slotKey, index) {
    const currentItems = actor.system?.inventory?.equipment?.[slotKey]?.itemIds ?? [];
    const updated = [...currentItems];
    updated[index] = itemId;
    return actor.update({
        [`system.inventory.equipment.${slotKey}.itemIds`]: updated
    });
}

export class TurnOfTheCenturyActorSheet extends BaseActorSheet {
    static templatePath = "systems/turn-of-the-century/templates/actors/hero-sheet.hbs";

    static TABS = {
        primary: {
            navSelector: ".sheet-tabs",
            contentSelector: ".sheet-body",
            initial: "profile"
        }
    };

    static get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS ?? {}, {
            classes: ["turn-of-the-century", "sheet", "actor"],
            position: {
                width: 760,
                height: 760
            },
            window: {
                resizable: true
            },
            template: this.templatePath
        });
    }

    get template() {
        return this.options.template;
    }

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
        const systemSource = this.actor.system?.toObject?.() ?? foundry.utils.deepClone(this.actor.system ?? {});

        if (game.user?.isGM && game.combat?.phase === "planning") {
            await game.combat.maybeAutoFinalizePlanning?.();
        }

        context.actor = this.actor;
        context.system = systemSource;
        context.equipmentSlots = buildEquipmentSlots(this.actor, systemSource);
        context.inventorySummary = buildInventorySummary(this.actor, systemSource);
        
        const packItemIds = systemSource.inventory?.pack?.itemIds ?? [];
        context.packItems = packItemIds
            .map((itemId) => this.actor.items.get(itemId))
            .filter(Boolean)
            .map((item) => ({
                ...summarizeInventoryItem(item),
                data: item.toObject()
            }));
        
        context.profileTags = toArrayInput(systemSource.profile?.tags);
        context.heroBonds = toArrayInput(systemSource.hero?.bonds);
        context.villainLieutenants = toArrayInput(systemSource.villain?.lieutenants);
        context.professionOptions = await collectProfessionOptions(systemSource.classification?.profession);

        return context;
    }

    async _renderHTML(context) {
        return renderTemplate(this.template, context);
    }

    _replaceHTML(result, content) {
        content.innerHTML = result;
    }

    _prepareSubmitData(event, form, formData, updateData = {}) {
        const submitData = super._prepareSubmitData(event, form, formData, updateData);

        extractEquipmentSlotUpdates(submitData);

        if (Object.hasOwn(submitData, "_array.system.profile.tags")) {
            submitData["system.profile.tags"] = parseArrayInput(submitData["_array.system.profile.tags"]);
            delete submitData["_array.system.profile.tags"];
        }

        if (Object.hasOwn(submitData, "_array.system.hero.bonds")) {
            submitData["system.hero.bonds"] = parseArrayInput(submitData["_array.system.hero.bonds"]);
            delete submitData["_array.system.hero.bonds"];
        }

        if (Object.hasOwn(submitData, "_array.system.villain.lieutenants")) {
            submitData["system.villain.lieutenants"] = parseArrayInput(submitData["_array.system.villain.lieutenants"]);
            delete submitData["_array.system.villain.lieutenants"];
        }

        const beltQuality = submitData["system.inventory.equipment.belt.quality"]
            ?? this.actor.system?.inventory?.equipment?.belt?.quality
            ?? "standard";
        const beltCapacity = getBeltCapacityFromQuality(beltQuality);
        submitData["system.inventory.equipment.belt.capacity"] = beltCapacity;

        if (Array.isArray(submitData["system.inventory.equipment.belt.itemIds"])) {
            submitData["system.inventory.equipment.belt.itemIds"] = submitData["system.inventory.equipment.belt.itemIds"].slice(0, beltCapacity);
        }

        return submitData;
    }

    async _onDrop(event) {
        event.preventDefault();

        let dropData;
        try {
            const dataString = event.dataTransfer?.getData("text/plain") ?? "";
            dropData = JSON.parse(dataString);
        } catch (error) {
            console.warn("[turn-of-the-century] Invalid drop data.", error);
            return;
        }

        if (dropData.type !== "Item") {
            return super._onDrop(event);
        }

        let item;
        if (dropData.uuid) {
            item = await fromUuid(dropData.uuid);
        } else if (dropData.id && dropData.data) {
            item = dropData.data;
        }

        if (!item) {
            console.warn("[turn-of-the-century] Could not resolve dropped item.", dropData);
            return;
        }

        const itemData = item instanceof BaseItemDocument ? item.toObject() : item;
        const createdItems = await this.actor.createEmbeddedDocuments("Item", [itemData]);

        if (!createdItems?.length) {
            console.warn("[turn-of-the-century] Failed to create item on actor.");
            return;
        }

        const createdItem = createdItems[0];
        const slotAssignment = findEmptyEquipmentSlot(this.actor, createdItem);

        if (slotAssignment) {
            await assignItemToSlot(this.actor, createdItem.id, slotAssignment.slotKey, slotAssignment.index);
        } else {
            const packItems = this.actor.system?.inventory?.pack?.itemIds ?? [];
            if (!packItems.includes(createdItem.id)) {
                await this.actor.update({
                    "system.inventory.pack.itemIds": [...packItems, createdItem.id]
                });
            }
        }
    }

    async _onRender(context, options) {
        await super._onRender(context, options);

        this.element.querySelectorAll(".totc-pack-item__delete").forEach((element) => element.addEventListener("click", (event) => {
            event.preventDefault();
            const itemId = event.currentTarget.dataset.itemId;
            if (itemId) {
                this.actor.deleteEmbeddedDocuments("Item", [itemId]);
            }
        }));

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
