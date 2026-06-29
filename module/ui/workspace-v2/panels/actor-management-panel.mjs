const ACTOR_TYPES = Object.freeze(["hero", "pawn", "villain"]);
const DEFAULT_ACTOR_TYPE = "pawn";
export const ACTOR_LIST_DRAG_MIME = "application/x-totc-actor-list";
const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";
const EQUIPMENT_SLOT_KEYS = Object.freeze(["head", "neck", "torso", "hands", "handsArmor", "legs", "feet", "belt"]);
const EQUIPMENT_SLOT_CONFIG = Object.freeze({
    head: { label: "Head", capacity: 1, allowedTypes: ["armor", "equipment"] },
    neck: { label: "Neck", capacity: 1, allowedTypes: ["armor", "equipment"] },
    torso: { label: "Torso", capacity: 2, allowedTypes: ["armor", "equipment", "item"] },
    hands: { label: "Hands", capacity: 2, allowedTypes: ["weapon", "tool", "equipment"] },
    handsArmor: { label: "Hand Armor", capacity: 1, allowedTypes: ["armor"] },
    legs: { label: "Legs", capacity: 1, allowedTypes: ["armor", "equipment"] },
    feet: { label: "Feet", capacity: 1, allowedTypes: ["armor", "equipment"] },
    belt: { label: "Belt", capacity: 4, allowedTypes: ["weapon", "tool", "equipment", "consumable", "item"] }
});
const BELT_QUALITY_CAPACITY = Object.freeze({
    poor: 2,
    standard: 4,
    fine: 5,
    exceptional: 6,
    masterwork: 7,
    experimental: 8
});
const EQUIPMENT_ITEM_IDS_PREFIX = "system.inventory.equipment.";
const PACK_ITEM_IDS_PREFIX = "system.inventory.pack.itemIds.";

function getCollectionEntries(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
    return [];
}

function actorId(actor) {
    return String(actor?.id ?? actor?._id ?? actor?.uuid ?? "");
}

function actorName(actor) {
    return String(actor?.name ?? "Unnamed Actor");
}

function actorSystem(actor) {
    return actor?.system ?? {};
}

function actorImage(actor) {
    return String(actor?.img ?? actor?.prototypeToken?.texture?.src ?? "").trim();
}

function normalizeActorType(type) {
    const value = String(type ?? "").trim().toLowerCase();
    return ACTOR_TYPES.includes(value) ? value : DEFAULT_ACTOR_TYPE;
}

function getPathValue(source, path, fallback = "") {
    const parts = String(path ?? "").split(".").filter(Boolean);
    let value = source;
    for (const part of parts) {
        value = value?.[part];
        if (value === undefined || value === null) return fallback;
    }
    return value;
}

function setPathValue(target, path, value) {
    const parts = String(path ?? "").split(".").filter(Boolean);
    if (!parts.length) return;
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
        cursor[part] ??= {};
        cursor = cursor[part];
    }
    cursor[parts.at(-1)] = value;
}

function stringifyArray(value) {
    return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function parseArray(value) {
    return String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function coerceFieldValue(path, value) {
    const numberPaths = new Set([
        "system.progression.level",
        "system.progression.proficiencyBonus",
        "system.villain.threatTier",
        "system.villain.notoriety",
        "system.pawn.threat",
        "system.hero.renown",
        "system.abilities.str.value",
        "system.abilities.dex.value",
        "system.abilities.con.value",
        "system.abilities.int.value",
        "system.abilities.wis.value",
        "system.abilities.cha.value",
        "system.abilities.san.value"
    ]);
    const arrayPaths = new Set([
        "system.profile.tags",
        "system.traits.languages",
        "system.hero.bonds",
        "system.villain.lieutenants"
    ]);

    if (arrayPaths.has(path)) return parseArray(value);
    if (!numberPaths.has(path)) return String(value ?? "");
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function isEquipmentItemIdPath(path) {
    return /^system\.inventory\.equipment\.[^.]+\.itemIds\.\d+$/.test(String(path ?? ""));
}

function collectEquipmentSlotSelection(selections, path, value) {
    const [, slotKey, indexString] = String(path ?? "").match(/^system\.inventory\.equipment\.([^.]+)\.itemIds\.(\d+)$/) ?? [];
    const index = Number(indexString);
    if (!slotKey || !Number.isInteger(index)) return;

    const selected = String(value ?? "").trim();
    const entries = selections.get(slotKey) ?? [];
    entries[index] = selected;
    selections.set(slotKey, entries);
}

function applyEquipmentSlotSelections(updateData, selections) {
    const seenIds = new Set();
    for (const slotKey of EQUIPMENT_SLOT_KEYS) {
        if (!selections.has(slotKey)) continue;

        const itemIds = (selections.get(slotKey) ?? []).filter((itemId) => {
            if (!itemId || seenIds.has(itemId)) return false;
            seenIds.add(itemId);
            return true;
        });
        setPathValue(updateData, `${EQUIPMENT_ITEM_IDS_PREFIX}${slotKey}.itemIds`, itemIds);
    }
}

function isPackItemIdPath(path) {
    return /^system\.inventory\.pack\.itemIds\.\d+$/.test(String(path ?? ""));
}

function collectPackItemSelection(selections, path, value) {
    const [, indexString] = String(path ?? "").match(/^system\.inventory\.pack\.itemIds\.(\d+)$/) ?? [];
    const index = Number(indexString);
    if (!Number.isInteger(index)) return;
    selections[index] = String(value ?? "").trim();
}

function applyPackSelections(updateData, selections) {
    if (!selections.length) return;
    const seenIds = new Set();
    const packItemIds = selections.filter((itemId) => {
        if (!itemId || seenIds.has(itemId)) return false;
        seenIds.add(itemId);
        return true;
    });
    setPathValue(updateData, "system.inventory.pack.itemIds", packItemIds);
}

function fieldValue(actor, path, staged = {}) {
    if (Object.hasOwn(staged, path)) return staged[path];
    const source = path === "name" ? actor : actor;
    const value = getPathValue(source, path, "");
    return Array.isArray(value) ? stringifyArray(value) : String(value ?? "");
}

function itemSystem(item) {
    return item?.system?.toObject?.() ?? item?.system ?? {};
}

function itemImage(item) {
    return String(item?.img ?? item?.system?.artwork?.image ?? "").trim() || DEFAULT_ITEM_ICON;
}

function stripHtml(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function briefDescription(value, maxLength = 96) {
    const description = stripHtml(value);
    if (description.length <= maxLength) return description;
    return `${description.slice(0, maxLength - 1).trim()}...`;
}

function formatItemDetails(system = {}) {
    const damage = system.damage ?? system.attack?.damage ?? system.combat?.damage ?? null;
    const effects = system.effects ?? system.effect ?? system.action?.effect ?? system.use?.effect ?? null;
    const parts = [];

    const damageText = Array.isArray(damage)
        ? damage.map((entry) => String(entry?.formula ?? entry?.value ?? entry ?? "").trim()).filter(Boolean).join(", ")
        : String(damage?.formula ?? damage?.value ?? damage ?? "").trim();
    if (damageText) parts.push(`Damage: ${damageText}`);

    const effectText = Array.isArray(effects)
        ? effects.map((entry) => String(entry?.label ?? entry?.name ?? entry?.description ?? entry ?? "").trim()).filter(Boolean).join(", ")
        : String(effects?.label ?? effects?.name ?? effects?.description ?? effects ?? "").trim();
    if (effectText) parts.push(`Effects: ${stripHtml(effectText)}`);

    return parts.join(" | ");
}

function formatItemType(type) {
    return String(type ?? "")
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (value) => value.toUpperCase())
        .trim();
}

function isToolItem(item) {
    const system = itemSystem(item);
    return (item?.type === "equipment" || item?.type === "item") && system.category === "tool";
}

function itemTags(item) {
    const tags = item.system?.properties?.tags;
    return Array.isArray(tags) ? tags.map((tag) => String(tag ?? "").toLowerCase()) : [];
}

function itemSearchText(item) {
    return [
        item.name,
        item.system?.commonName,
        item.system?.category,
        ...itemTags(item)
    ].map((part) => String(part ?? "").toLowerCase()).join(" ");
}

function isPackContainerItem(item) {
    if (item.system?.category !== "container") return false;
    return /\b(pack|satchel|valise|bag|case|rucksack)\b/.test(itemSearchText(item));
}

function isBeltContainerItem(item) {
    if (item.system?.category !== "container") return false;
    return /\b(belt|bandolier|harness|pouch)\b/.test(itemSearchText(item));
}

function getSlotDefinition(actor, slotKey) {
    const fallback = EQUIPMENT_SLOT_CONFIG[slotKey] ?? { label: slotKey, capacity: 1, allowedTypes: [] };
    const source = actorSystem(actor)?.inventory?.equipment?.[slotKey] ?? {};
    return {
        key: slotKey,
        label: String(source.label ?? fallback.label),
        capacity: Number(source.capacity ?? fallback.capacity),
        quality: String(source.quality ?? "standard"),
        allowedTypes: Array.isArray(source.allowedTypes) ? source.allowedTypes : [...fallback.allowedTypes],
        itemIds: Array.isArray(source.itemIds) ? [...source.itemIds] : []
    };
}

function getSlotCapacity(slotKey, slot) {
    if (slotKey === "belt") {
        return BELT_QUALITY_CAPACITY[slot.quality] ?? Number(slot.capacity ?? EQUIPMENT_SLOT_CONFIG.belt.capacity);
    }
    return Math.max(1, Number(slot.capacity ?? 1));
}

function isSlotCompatible(item, slotKey, slot) {
    const allowedTypes = new Set(slot.allowedTypes ?? []);
    const system = itemSystem(item);

    if (system.slot !== slotKey) return false;
    if (item.type === "armor") return allowedTypes.has("armor");
    if (allowedTypes.has(item.type)) return true;
    return allowedTypes.has("tool") && isToolItem(item);
}

function buildEquipmentViewModel(actor, staged = {}) {
    const items = getCollectionEntries(actor?.items).map((item) => ({
        id: String(item?.id ?? item?._id ?? ""),
        name: String(item?.name ?? "Unnamed Item"),
        img: itemImage(item),
        type: String(item?.type ?? ""),
        typeLabel: formatItemType(item?.type),
        description: briefDescription(itemSystem(item).description),
        details: formatItemDetails(itemSystem(item)),
        system: itemSystem(item)
    })).filter((item) => item.id);
    const slots = Object.fromEntries(EQUIPMENT_SLOT_KEYS.map((slotKey) => [slotKey, getSlotDefinition(actor, slotKey)]));
    const selectedBySlot = Object.fromEntries(EQUIPMENT_SLOT_KEYS.map((slotKey) => [
        slotKey,
        Array.from({ length: getSlotCapacity(slotKey, slots[slotKey]) }, (_, index) => {
            const path = `${EQUIPMENT_ITEM_IDS_PREFIX}${slotKey}.itemIds.${index}`;
            return Object.hasOwn(staged, path) ? String(staged[path] ?? "") : String(slots[slotKey].itemIds[index] ?? "");
        })
    ]));

    const packDef = actorSystem(actor)?.inventory?.pack ?? {};
    const packStoredIds = Array.isArray(packDef.itemIds) ? packDef.itemIds : [];
    const packCapacity = Math.max(1, Number(packDef.capacity ?? 20));
    const packSlotCount = packCapacity;
    const selectedByPackPosition = Array.from({ length: packSlotCount }, (_, index) => {
        const path = `${PACK_ITEM_IDS_PREFIX}${index}`;
        return Object.hasOwn(staged, path) ? String(staged[path] ?? "") : String(packStoredIds[index] ?? "");
    });
    const equippedIds = new Set(Object.values(selectedBySlot).flatMap((ids) => ids).filter(Boolean));
    const itemById = new Map(items.map((item) => [item.id, item]));
    const equippedTorsoItems = (selectedBySlot.torso ?? []).map((itemId) => itemById.get(itemId)).filter(Boolean);
    const equippedBeltItems = (selectedBySlot.belt ?? []).map((itemId) => itemById.get(itemId)).filter(Boolean);
    const hasEquippedPack = equippedTorsoItems.some((item) => isPackContainerItem(item));
    const hasEquippedBelt = equippedBeltItems.some((item) => isBeltContainerItem(item)) || equippedBeltItems.length > 0;
    const packSlots = Array.from({ length: packSlotCount }, (_, position) => {
        const selectedItemId = selectedByPackPosition[position] ?? "";
        const selectedElsewhereInPack = new Set(selectedByPackPosition.filter((id, i) => id && i !== position));
        const packableItems = items.filter((item) => !equippedIds.has(item.id) || item.id === selectedItemId);
        return {
            area: "pack",
            slotKey: "pack",
            position,
            label: `Pack ${position + 1}`,
            name: `${PACK_ITEM_IDS_PREFIX}${position}`,
            selectedItemId,
            selectedItem: items.find((item) => item.id === selectedItemId) ?? null,
            options: packableItems.map((item) => ({
                id: item.id,
                name: item.name,
                type: item.typeLabel,
                img: item.img,
                description: item.description,
                details: item.details,
                selected: item.id === selectedItemId,
                disabled: selectedElsewhereInPack.has(item.id)
            }))
        };
    });

    return {
        bodySlots: [
            { area: "head", slotKey: "head", position: 0 },
            { area: "neck", slotKey: "neck", position: 0 },
            { area: "torso", slotKey: "torso", position: 0 },
            { area: "torso-extra", slotKey: "torso", position: 1 },
            { area: "hand-left", slotKey: "hands", position: 0 },
            { area: "hand-right", slotKey: "hands", position: 1 },
            { area: "hands-armor", slotKey: "handsArmor", position: 0 },
            { area: "legs", slotKey: "legs", position: 0 },
            { area: "feet", slotKey: "feet", position: 0 }
        ].map((placement) => buildEquipmentSlotControl(placement, slots, selectedBySlot, items)),
        beltSlots: hasEquippedBelt
            ? Array.from({ length: getSlotCapacity("belt", slots.belt) }, (_, position) => (
                buildEquipmentSlotControl({ area: "belt", slotKey: "belt", position }, slots, selectedBySlot, items)
            ))
            : [],
        packSlots: hasEquippedPack ? packSlots : []
    };
}

function buildEquipmentSlotControl(placement, slots, selectedBySlot, items) {
    const slot = slots[placement.slotKey];
    const selectedItemId = selectedBySlot[placement.slotKey]?.[placement.position] ?? "";
    const selectedElsewhere = new Set(
        Object.entries(selectedBySlot)
            .flatMap(([slotKey, itemIds]) => itemIds.map((itemId, index) => ({ slotKey, itemId, index })))
            .filter((entry) => entry.itemId && (entry.slotKey !== placement.slotKey || entry.index !== placement.position))
            .map((entry) => entry.itemId)
    );
    const compatibleItems = items.filter((item) => isSlotCompatible(item, placement.slotKey, slot));
    const selectedItem = compatibleItems.find((item) => item.id === selectedItemId)
        ?? items.find((item) => item.id === selectedItemId)
        ?? null;

    return {
        ...placement,
        label: placement.slotKey === "hands"
            ? (placement.position === 0 ? "Left Hand" : "Right Hand")
            : placement.slotKey === "handsArmor"
                ? "Hand Armor"
            : placement.slotKey === "torso"
                ? `Torso ${placement.position + 1}`
            : slot.label,
        name: `${EQUIPMENT_ITEM_IDS_PREFIX}${placement.slotKey}.itemIds.${placement.position}`,
        selectedItemId,
        selectedItem,
        options: compatibleItems.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.typeLabel,
            img: item.img,
            description: item.description,
            details: item.details,
            selected: item.id === selectedItemId,
            disabled: item.id !== selectedItemId && selectedElsewhere.has(item.id)
        }))
    };
}

function abilityModifier(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.floor((score - 10) / 2);
}

function formatSignedNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "+0";
    return numeric >= 0 ? `+${numeric}` : String(numeric);
}

export function buildActorListPanelModel({
    actors = [],
    query = "",
    typeFilter = "all",
    selectedActorId = "",
    selectedActorIds = [],
    showCreate = false
} = {}) {
    const normalizedQuery = String(query ?? "").trim().toLowerCase();
    const normalizedTypeFilter = ACTOR_TYPES.includes(String(typeFilter ?? "").trim()) ? String(typeFilter).trim() : "all";
    const selectedIds = new Set(getCollectionEntries(selectedActorIds).map((id) => String(id ?? "").trim()).filter(Boolean));
    const detailActorId = String(selectedActorId ?? "").trim();
    const allEntries = getCollectionEntries(actors)
        .filter(Boolean)
        .map((actor) => {
            const id = actorId(actor);
            const system = actorSystem(actor);
            return {
                id,
                name: actorName(actor),
                img: actorImage(actor),
                type: normalizeActorType(actor?.type),
                selected: Boolean(id && selectedIds.has(id)),
                detailSelected: Boolean(id && id === detailActorId),
                summary: system.profile?.summary ?? "",
                role: system.profile?.role ?? system.pawn?.role ?? system.hero?.archetype ?? system.villain?.scheme ?? ""
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    const typeFilteredEntries = normalizedTypeFilter === "all"
        ? allEntries
        : allEntries.filter((entry) => entry.type === normalizedTypeFilter);
    const entries = normalizedQuery
        ? typeFilteredEntries.filter((entry) => entry.name.toLowerCase().includes(normalizedQuery))
        : typeFilteredEntries;

    return {
        allCount: allEntries.length,
        typeCount: typeFilteredEntries.length,
        count: entries.length,
        query: String(query ?? ""),
        typeFilter: normalizedTypeFilter,
        typeOptions: [
            { value: "all", label: "All", selected: normalizedTypeFilter === "all" },
            ...ACTOR_TYPES.map((type) => ({
                value: type,
                label: type[0].toUpperCase() + type.slice(1),
                selected: normalizedTypeFilter === type
            }))
        ],
        selectedActorIds: [...selectedIds],
        showCreate: Boolean(showCreate),
        entries
    };
}

export function buildActorListDragPayload({ actorId = "", selectedActorIds = [] } = {}) {
    const safeActorId = String(actorId ?? "").trim();
    if (!safeActorId) return null;
    const selectedIds = getCollectionEntries(selectedActorIds).map((id) => String(id ?? "").trim()).filter(Boolean);
    const actorIds = selectedIds.includes(safeActorId) ? selectedIds : [safeActorId];
    return { actorIds: [...new Set(actorIds)] };
}

export function parseActorListDragPayload(value) {
    try {
        const parsed = JSON.parse(String(value ?? ""));
        const actorIds = getCollectionEntries(parsed?.actorIds).map((id) => String(id ?? "").trim()).filter(Boolean);
        return { actorIds: [...new Set(actorIds)] };
    } catch {
        return { actorIds: [] };
    }
}

export function buildActorEditorPanelModel({
    actor = null,
    state = {},
    users = [],
    isGM = false
} = {}) {
    const mode = state.mode === "create" ? "create" : actor ? "edit" : "empty";
    const actorType = normalizeActorType(state.actorType ?? actor?.type);
    const staged = state.formData && typeof state.formData === "object" ? state.formData : {};
    const ownerOptions = buildActorOwnerOptions({ actor, users, staged, isGM });

    return {
        mode,
        actorId: actorId(actor),
        actorType,
        actorTypeOptions: ACTOR_TYPES.map((type) => ({
            value: type,
            label: type[0].toUpperCase() + type.slice(1),
            selected: type === actorType
        })),
        isGenerating: Boolean(state.isGenerating),
        isGeneratingToken: Boolean(state.isGeneratingToken),
        dirty: Boolean(state.dirty),
        status: String(state.status ?? ""),
        error: String(state.error ?? ""),
        additionalPrompt: String(state.additionalPrompt ?? ""),
        canAssignOwner: Boolean(actor),
        ownerAssignmentDisabled: !isGM,
        ownerOptions,
        fields: actor ? buildEditableActorFields(actor, staged, actorType) : [],
        equipment: actor ? buildEquipmentViewModel(actor, staged) : null
    };
}

function userId(user) {
    return String(user?.id ?? user?._id ?? "").trim();
}

function buildActorOwnerOptions({ actor = null, users = [], staged = {}, isGM = false } = {}) {
    if (!actor) return [];

    const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
    const actorOwnership = actor?.ownership ?? {};
    const userEntries = getCollectionEntries(users)
        .filter((user) => !user?.isGM)
        .map((user) => ({ id: userId(user), name: String(user?.name ?? "") }))
        .filter((user) => user.id)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    const stagedOwnerId = String(staged.__ownerUserId ?? "").trim();
    const currentOwnerId = stagedOwnerId || userEntries.find((user) => Number(actorOwnership[user.id] ?? 0) >= ownerLevel)?.id || "";

    return [
        { value: "", label: "None", selected: currentOwnerId === "" },
        ...userEntries.map((user) => ({
            value: user.id,
            label: user.name || user.id,
            selected: user.id === currentOwnerId
        }))
    ];
}

export function buildEditableActorFields(actor, staged = {}, actorType = normalizeActorType(actor?.type)) {
    const fields = [
        { path: "name", label: "Name", type: "text", value: fieldValue(actor, "name", staged), section: "Identity" },
        { path: "system.profile.role", label: "Role", type: "text", value: fieldValue(actor, "system.profile.role", staged), section: "Identity" },
        { path: "system.profile.faction", label: "Faction", type: "text", value: fieldValue(actor, "system.profile.faction", staged), section: "Identity" },
        { path: "system.classification.category", label: "Category", type: "text", value: fieldValue(actor, "system.classification.category", staged), section: "Classification" },
        { path: "system.classification.species", label: "Species", type: "text", value: fieldValue(actor, "system.classification.species", staged), section: "Classification" },
        { path: "system.classification.profession", label: "Profession", type: "text", value: fieldValue(actor, "system.classification.profession", staged), section: "Classification" },
        { path: "system.progression.level", label: "Level", type: "number", value: fieldValue(actor, "system.progression.level", staged), section: "Progression" },
        { path: "system.progression.challenge", label: "Challenge", type: "text", value: fieldValue(actor, "system.progression.challenge", staged), section: "Progression" },
        { path: "system.profile.summary", label: "Summary", type: "textarea", value: fieldValue(actor, "system.profile.summary", staged), section: "Notes" },
        { path: "system.biography", label: "Biography", type: "html", value: fieldValue(actor, "system.biography", staged), section: "Notes" },
        { path: "system.notes", label: "GM Notes", type: "html", value: fieldValue(actor, "system.notes", staged), section: "Notes", className: "totc-v2-actor-editor__html--gm-notes" },
        { path: "system.profile.tags", label: "Tags", type: "text", value: fieldValue(actor, "system.profile.tags", staged), section: "Notes" },
        { path: "system.traits.languages", label: "Languages", type: "text", value: fieldValue(actor, "system.traits.languages", staged), section: "Notes" }
    ];

    const abilityFields = ["str", "dex", "con", "int", "wis", "cha", "san"].map((key) => {
        const value = fieldValue(actor, `system.abilities.${key}.value`, staged);
        return {
            path: `system.abilities.${key}.value`,
            label: key.toUpperCase(),
            type: "ability",
            value,
            modifier: formatSignedNumber(abilityModifier(value)),
            section: "Abilities"
        };
    });

    const typedFields = {
        hero: [
            { path: "system.hero.archetype", label: "Archetype", type: "text", value: fieldValue(actor, "system.hero.archetype", staged), section: "Hero" },
            { path: "system.hero.rank", label: "Rank", type: "text", value: fieldValue(actor, "system.hero.rank", staged), section: "Hero" },
            { path: "system.hero.renown", label: "Renown", type: "number", value: fieldValue(actor, "system.hero.renown", staged), section: "Hero" },
            { path: "system.hero.bonds", label: "Bonds", type: "text", value: fieldValue(actor, "system.hero.bonds", staged), section: "Hero" }
        ],
        pawn: [
            { path: "system.pawn.role", label: "Pawn Role", type: "text", value: fieldValue(actor, "system.pawn.role", staged), section: "Pawn" },
            { path: "system.pawn.threat", label: "Threat", type: "number", value: fieldValue(actor, "system.pawn.threat", staged), section: "Pawn" },
            { path: "system.pawn.disposition", label: "Disposition", type: "text", value: fieldValue(actor, "system.pawn.disposition", staged), section: "Pawn" },
            { path: "system.pawn.squad", label: "Squad", type: "text", value: fieldValue(actor, "system.pawn.squad", staged), section: "Pawn" }
        ],
        villain: [
            { path: "system.villain.scheme", label: "Scheme", type: "text", value: fieldValue(actor, "system.villain.scheme", staged), section: "Villain" },
            { path: "system.villain.threatTier", label: "Threat Tier", type: "number", value: fieldValue(actor, "system.villain.threatTier", staged), section: "Villain" },
            { path: "system.villain.notoriety", label: "Notoriety", type: "number", value: fieldValue(actor, "system.villain.notoriety", staged), section: "Villain" },
            { path: "system.villain.lieutenants", label: "Lieutenants", type: "text", value: fieldValue(actor, "system.villain.lieutenants", staged), section: "Villain" }
        ]
    };

    return [...fields.slice(0, 8), ...abilityFields, ...(typedFields[actorType] ?? []), ...fields.slice(8)];
}

export function buildActorUpdateDataFromFormData(formData) {
    const updateData = {};
    const equipmentSelections = new Map();
    const packSelections = [];
    for (const [path, rawValue] of formData.entries()) {
        if (!path || path === "actorId" || String(path).startsWith("__")) continue;
        if (isEquipmentItemIdPath(path)) {
            collectEquipmentSlotSelection(equipmentSelections, path, rawValue);
            continue;
        }
        if (isPackItemIdPath(path)) {
            collectPackItemSelection(packSelections, path, rawValue);
            continue;
        }
        setPathValue(updateData, path, coerceFieldValue(path, rawValue));
    }
    applyEquipmentSlotSelections(updateData, equipmentSelections);
    applyPackSelections(updateData, packSelections);
    return updateData;
}

export function buildGeneratedActorDocumentData(result = {}, actorType = DEFAULT_ACTOR_TYPE) {
    return {
        name: String(result.name ?? "Generated Actor").trim() || "Generated Actor",
        type: normalizeActorType(actorType),
        system: result.system && typeof result.system === "object" ? result.system : {}
    };
}

function renderField(field, escapeHTML) {
    const fieldClass = [
        "totc-v2-actor-editor__field",
        field.type === "textarea" ? "totc-v2-actor-editor__field--textarea" : "",
        field.type === "html" ? "totc-v2-actor-editor__field--html" : ""
    ].filter(Boolean).join(" ");

    if (field.type === "html") {
        const htmlClass = ["totc-v2-actor-editor__html", field.className].filter(Boolean).join(" ");
        return `
        <div class="${escapeHTML(fieldClass)}">
            <span>${escapeHTML(field.label)}</span>
            <div class="${escapeHTML(htmlClass)}">${String(field.value ?? "")}</div>
        </div>`;
    }

    const value = escapeHTML(field.value ?? "");
    const common = `name="${escapeHTML(field.path)}" data-action="actor-editor-field" data-actor-field="${escapeHTML(field.path)}"`;
    const control = field.type === "textarea"
        ? `<textarea ${common}>${value}</textarea>`
        : `<input ${common} type="${escapeHTML(field.type ?? "text")}" value="${value}">`;
    return `<label class="${escapeHTML(fieldClass)}"><span>${escapeHTML(field.label)}</span>${control}</label>`;
}

function renderAbilityField(field, escapeHTML) {
    const common = `name="${escapeHTML(field.path)}" data-action="actor-editor-field" data-actor-field="${escapeHTML(field.path)}"`;
    return `
    <label class="totc-v2-actor-editor__ability">
        <span class="totc-v2-actor-editor__ability-label">${escapeHTML(field.label)}</span>
        <strong class="totc-v2-actor-editor__ability-modifier">${escapeHTML(field.modifier)}</strong>
        <input class="totc-v2-actor-editor__ability-score" ${common} type="number" value="${escapeHTML(field.value ?? "")}" aria-label="${escapeHTML(`${field.label} score`)}">
    </label>`;
}

function renderFieldSection(title, fields, escapeHTML) {
    const isAbilitySection = fields.every((field) => field.type === "ability");
    return `
    <fieldset class="totc-v2-actor-editor__section${isAbilitySection ? " totc-v2-actor-editor__section--abilities" : ""}">
        <legend>${escapeHTML(title)}</legend>
        ${isAbilitySection
            ? `<div class="totc-v2-actor-editor__ability-scores">${fields.map((field) => renderAbilityField(field, escapeHTML)).join("")}</div>`
            : `<div class="totc-v2-actor-editor__section-fields">${fields.map((field) => renderField(field, escapeHTML)).join("")}</div>`}
    </fieldset>`;
}

function renderEquipmentHoverCard(item, slotLabel, escapeHTML) {
    const cardName = item?.name ?? "Empty";
    const cardDescription = item?.description || "No item equipped.";
    const cardDetails = item?.details ?? "";
    return `
    <span class="totc-v2-actor-equipment__hover-card" role="tooltip">
        <em>Slot: ${escapeHTML(slotLabel)}</em>
        <strong>${escapeHTML(cardName)}</strong>
        <span>${escapeHTML(cardDescription)}</span>
        ${cardDetails ? `<small>${escapeHTML(cardDetails)}</small>` : ""}
    </span>`;
}

function renderEquipmentIconButton(slot, escapeHTML) {
    const item = slot.selectedItem;
    const label = `${slot.label}: ${item?.name ?? "Empty"}`;
    return `
    <button type="button"
        class="totc-v2-actor-equipment__icon${item ? "" : " is-empty"}"
        data-action="actor-equipment-open-picker"
        data-equipment-field="${escapeHTML(slot.name)}"
        aria-haspopup="dialog"
        aria-label="${escapeHTML(label)}"
        title="${escapeHTML(label)}">
        ${item ? `<img src="${escapeHTML(item.img || DEFAULT_ITEM_ICON)}" alt="">` : ""}
        ${renderEquipmentHoverCard(item, slot.label, escapeHTML)}
    </button>`;
}

function renderEquipmentPickerModal(slot, escapeHTML) {
    const modalId = `totc-equipment-picker-${slot.area}-${slot.position}`;
    const selectedName = slot.selectedItem?.name ?? "Empty";
    const options = [
        { id: "", name: "Empty", type: "None", img: DEFAULT_ITEM_ICON, description: "Clear this equipment slot.", details: "", selected: !slot.selectedItemId, disabled: false },
        ...(slot.options ?? [])
    ];
    return `
    <div class="totc-v2-actor-equipment__picker" id="${escapeHTML(modalId)}" data-equipment-picker="${escapeHTML(slot.name)}" hidden>
        <div class="totc-v2-actor-equipment__picker-backdrop" data-action="actor-equipment-close-picker"></div>
        <section class="totc-v2-actor-equipment__picker-card" role="dialog" aria-modal="true" aria-labelledby="${escapeHTML(modalId)}-title">
            <header class="totc-v2-actor-equipment__picker-header">
                <div>
                    <h4 id="${escapeHTML(modalId)}-title">${escapeHTML(slot.label)}</h4>
                    <span>${escapeHTML(selectedName)}</span>
                </div>
                <button type="button" data-action="actor-equipment-close-picker" aria-label="Close equipment picker">&times;</button>
            </header>
            <div class="totc-v2-actor-equipment__picker-list" role="listbox" aria-label="${escapeHTML(`${slot.label} compatible inventory items`)}">
                ${options.map((option) => `
                    <button type="button"
                        class="totc-v2-actor-equipment__picker-option${option.selected ? " is-selected" : ""}"
                        data-action="actor-equipment-select-item"
                        data-equipment-field="${escapeHTML(slot.name)}"
                        data-item-id="${escapeHTML(option.id)}"
                        ${option.disabled ? "disabled" : ""}
                        role="option"
                        aria-selected="${option.selected ? "true" : "false"}">
                        <img src="${escapeHTML(option.img || DEFAULT_ITEM_ICON)}" alt="">
                        <span>
                            <strong>${escapeHTML(option.name)}</strong>
                            <small>${escapeHTML(option.type)}${option.description ? ` - ${escapeHTML(option.description)}` : ""}</small>
                            ${option.details ? `<em>${escapeHTML(option.details)}</em>` : ""}
                        </span>
                    </button>`).join("")}
            </div>
        </section>
    </div>`;
}

function renderEquipmentSlot(slot, escapeHTML) {
    return `
    <div class="totc-v2-actor-equipment__slot totc-v2-actor-equipment__slot--${escapeHTML(slot.area)}">
        <input type="hidden" name="${escapeHTML(slot.name)}" data-action="actor-editor-field" data-actor-field="${escapeHTML(slot.name)}" value="${escapeHTML(slot.selectedItemId)}">
        ${renderEquipmentIconButton(slot, escapeHTML)}
        ${renderEquipmentPickerModal(slot, escapeHTML)}
    </div>`;
}

function renderEquipmentBodyRows(bodySlots, escapeHTML) {
    const byArea = new Map((bodySlots ?? []).map((slot) => [slot.area, slot]));
    const rows = [
        ["head"],
        ["neck"],
        ["torso", "torso-extra"],
        ["hand-left", "hands-armor", "hand-right"],
        ["legs"],
        ["feet"]
    ];
    return rows.map((areas) => `
        <div class="totc-v2-actor-equipment__body-row">
            ${areas.map((area) => byArea.get(area)).filter(Boolean).map((slot) => renderEquipmentSlot(slot, escapeHTML)).join("")}
        </div>`).join("");
}

function renderEquipmentSection(equipment, escapeHTML) {
    if (!equipment) return "";
    const packSection = equipment.packSlots?.length
        ? `<div class="totc-v2-actor-equipment__pack" aria-label="Pack slots">
                <div class="totc-v2-actor-equipment__pack-label">Pack</div>
                ${equipment.packSlots.map((slot) => renderEquipmentSlot(slot, escapeHTML)).join("")}
            </div>`
        : "";
    const beltSection = equipment.beltSlots?.length
        ? `<div class="totc-v2-actor-equipment__belt" aria-label="Belt slots">
                <div class="totc-v2-actor-equipment__belt-label">Belt</div>
                ${equipment.beltSlots.map((slot) => renderEquipmentSlot(slot, escapeHTML)).join("")}
            </div>`
        : "";
    return `
    <fieldset class="totc-v2-actor-editor__section totc-v2-actor-editor__section--equipment">
        <legend>Equipment</legend>
        <div class="totc-v2-actor-equipment">
            <div class="totc-v2-actor-equipment__body">
                ${renderEquipmentBodyRows(equipment.bodySlots, escapeHTML)}
            </div>
            ${beltSection}
            ${packSection}
        </div>
    </fieldset>`;
}

export function renderActorListPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const summary = model.query || model.typeFilter !== "all"
        ? `${model.count} of ${model.allCount} actor${model.allCount === 1 ? "" : "s"}`
        : `${model.allCount} actor${model.allCount === 1 ? "" : "s"}`;
    return `
    <section class="totc-v2-actor-list-panel">
        <button type="button" class="totc-v2-actor-list-panel__new" data-action="actor-list-new">New Actor</button>
        <label class="totc-v2-actor-list-panel__filter">
            <span>Actor type</span>
            <select data-action="actor-list-type-filter">
                ${(model.typeOptions ?? []).map((option) => `<option value="${escapeHTML(option.value)}" ${option.selected ? "selected" : ""}>${escapeHTML(option.label)}</option>`).join("")}
            </select>
        </label>
        <label class="totc-v2-actor-list-panel__search">
            <span>Search actors</span>
            <input type="search" data-action="actor-list-search" value="${escapeHTML(model.query ?? "")}" placeholder="Filter by actor name">
        </label>
        <header class="totc-v2-actor-list-panel__summary">${escapeHTML(summary)}</header>
        <div class="totc-v2-actor-list-panel__list" role="list">
            ${model.entries?.length ? model.entries.map((actor) => `
                <article class="totc-v2-actor-list-panel__entry${actor.selected ? " is-selected" : ""}${actor.detailSelected ? " is-detail-selected" : ""}" role="listitem" draggable="true" data-actor-list-draggable="true" data-actor-id="${escapeHTML(actor.id)}">
                    <label class="totc-v2-actor-list-panel__entry-select" title="Select actor for scene placement">
                        <input type="checkbox" data-action="actor-list-toggle-selected" data-actor-id="${escapeHTML(actor.id)}" ${actor.selected ? "checked" : ""}>
                    </label>
                    ${actor.img
                        ? `<img class="totc-v2-actor-list-panel__entry-thumb" src="${escapeHTML(actor.img)}" alt="">`
                        : `<span class="totc-v2-actor-list-panel__entry-thumb totc-v2-actor-list-panel__entry-thumb--initial" aria-hidden="true">${escapeHTML(String(actor.name ?? "?").slice(0, 1).toUpperCase() || "?")}</span>`}
                    <button type="button" class="totc-v2-actor-list-panel__entry-main" data-action="actor-list-open-details" data-actor-id="${escapeHTML(actor.id)}" title="Double-click to open actor details">
                        <span class="totc-v2-actor-list-panel__entry-name">${escapeHTML(actor.name)}</span>
                        <span class="totc-v2-actor-list-panel__entry-meta">${escapeHTML(actor.type)}${actor.role ? ` - ${escapeHTML(actor.role)}` : ""}</span>
                    </button>
                </article>`).join("") : `<div class="totc-v2-actor-list-panel__empty">No actors found.</div>`}
        </div>
    </section>`;
}

export function renderActorEditorPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    if (model.mode === "create") {
        return `
        <section class="totc-v2-actor-editor">
            <header class="totc-v2-actor-editor__header">
                <h3>New Actor</h3>
            </header>
            ${model.error ? `<div class="totc-v2-actor-editor__error">${escapeHTML(model.error)}</div>` : ""}
            <div class="totc-v2-actor-editor__create-form">
                <label class="totc-v2-actor-editor__field">
                    <span>Actor Type</span>
                    <select data-action="actor-editor-create-type">
                        ${model.actorTypeOptions.map((option) => `<option value="${escapeHTML(option.value)}" ${option.selected ? "selected" : ""}>${escapeHTML(option.label)}</option>`).join("")}
                    </select>
                </label>
                <label class="totc-v2-actor-editor__field">
                    <span>Additional Prompt</span>
                    <textarea data-action="actor-editor-create-prompt" placeholder="Add constraints, relationships, equipment, or table needs.">${escapeHTML(model.additionalPrompt)}</textarea>
                </label>
                <button type="button" class="totc-v2-actor-editor__primary" data-action="actor-editor-generate" ${model.isGenerating ? "disabled" : ""}>${model.isGenerating ? "Creating..." : "Create Actor"}</button>
            </div>
        </section>`;
    }

    if (model.mode !== "edit") {
        return `<section class="totc-v2-actor-editor"><div class="totc-v2-actor-editor__empty">Select an actor or create a new one.</div></section>`;
    }

    const sections = new Map();
    for (const field of model.fields ?? []) {
        if (!sections.has(field.section)) sections.set(field.section, []);
        sections.get(field.section).push(field);
    }
    const sectionEntries = Array.from(sections.entries()).sort(([left], [right]) => {
        if (left === "Identity") return -1;
        if (right === "Identity") return 1;
        return 0;
    });

    return `
    <section class="totc-v2-actor-editor">
        <header class="totc-v2-actor-editor__header">
            <h3>Actor Details</h3>
            <span>${escapeHTML(model.actorType)}</span>
        </header>
        ${model.error ? `<div class="totc-v2-actor-editor__error">${escapeHTML(model.error)}</div>` : ""}
        ${model.status ? `<div class="totc-v2-actor-editor__status">${escapeHTML(model.status)}</div>` : ""}
        <form class="totc-v2-actor-editor__form" data-action="actor-editor-save-form">
            <input type="hidden" name="actorId" value="${escapeHTML(model.actorId)}">
            ${model.canAssignOwner ? `
            <div class="totc-v2-actor-editor__assignment-row">
                <label class="totc-v2-actor-editor__assignment-label" for="totc-v2-actor-editor-owner">Assigned Player</label>
                <select id="totc-v2-actor-editor-owner" name="__ownerUserId" data-action="actor-editor-owner-assignment" data-actor-field="__ownerUserId" ${model.ownerAssignmentDisabled ? "disabled" : ""}>
                    ${(model.ownerOptions ?? []).map((option) => `<option value="${escapeHTML(option.value)}" ${option.selected ? "selected" : ""}>${escapeHTML(option.label)}</option>`).join("")}
                </select>
            </div>` : ""}
            <div class="totc-v2-actor-editor__sections">
                ${sectionEntries.map(([title, fields], index) => `${renderFieldSection(title, fields, escapeHTML)}${index === 0 ? renderEquipmentSection(model.equipment, escapeHTML) : ""}`).join("")}
            </div>
            <footer class="totc-v2-actor-editor__actions">
                <button type="submit" class="totc-v2-actor-editor__primary" data-action="actor-editor-save" ${model.dirty ? "" : "disabled"}>Save</button>
                <button type="button" class="totc-v2-actor-editor__secondary" data-action="actor-generate-token" ${model.isGeneratingToken ? "disabled" : ""}>${model.isGeneratingToken ? "Generating…" : "Generate Token Art"}</button>
            </footer>
        </form>
    </section>`;
}
