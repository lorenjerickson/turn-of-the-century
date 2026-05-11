import { TOTC_EQUIPMENT_SLOT_KEYS } from "../models/actor.mjs";
import { buildEncounterPlanner } from "../encounters/planner-context.mjs";

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
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    type: formatTypeLabel(item.type),
                    img: item.img
                }));

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
        const summary = {
            id: item.id,
            name: item.name,
            type: formatTypeLabel(item.type),
            img: item.img
        };

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

function readActionFromElement(el) {
    if (!el) return null;
    const d = el.dataset;
    return {
        id: d.id,
        actionId: d.actionId,
        type: d.type,
        label: d.label,
        img: d.img || null,
        apCost: Number(d.apCost || 1),
        apMin: Number(d.apMin || d.apCost || 1),
        apMax: Number(d.apMax || d.apCost || 1),
        variableAp: d.variableAp === "true",
        requiresToHit: d.requiresToHit === "true",
        toHitBonus: Number(d.toHitBonus || 0),
        movementFeet: Number(d.movementFeet || 0),
        movementFeetPerAp: Number(d.movementFeetPerAp || 0),
        itemId: d.itemId || null,
        targetId: null
    };
}

function finalizeActionData(actionData, apCost, targetId) {
    const min = Math.max(1, Number(actionData.apMin || 1));
    const max = Math.max(min, Number(actionData.apMax || min));
    const cost = Math.max(min, Math.min(max, Number(apCost) || min));
    const result = { ...actionData, apCost: cost, targetId: targetId || null };
    if (result.type === "movement") {
        const feetPerAp = Number(result.movementFeetPerAp || 10);
        result.movementFeet = feetPerAp * cost;
    }
    return result;
}

function showInlinePlannerConfig(plannerSection, planner, actionData, remainingAp, combatantId, sheet) {
    // Remove any existing inline config panel
    plannerSection?.querySelector(".totc-planner-inline-config")?.remove();

    const targetOptions = game.combat?.getTargetOptionsForCombatant?.(combatantId) ?? [];
    const needsTarget = actionData.requiresToHit && targetOptions.length > 0;
    const needsAp = actionData.variableAp;
    const apMin = Math.max(1, Number(actionData.apMin || 1));
    const apMax = Math.min(Math.max(apMin, Number(actionData.apMax || apMin)), remainingAp);
    const apDefault = Math.max(apMin, Math.min(apMax, Number(actionData.apCost || apMin)));

    const panel = document.createElement("div");
    panel.className = "totc-planner-inline-config";

    let apHtml = "";
    if (needsAp) {
        apHtml = `
            <label class="totc-planner-config-row">
                <span>${game.i18n?.localize("TOTC.Encounter.ActionPoints") ?? "Action Points"} (${apMin}–${apMax})</span>
                <input type="range" class="totc-planner-config__ap-range" min="${apMin}" max="${apMax}" step="1" value="${apDefault}" />
                <span class="totc-planner-config__ap-display">${apDefault}</span>
            </label>`;
    }

    let targetHtml = "";
    if (needsTarget) {
        const options = targetOptions.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
        targetHtml = `
            <label class="totc-planner-config-row">
                <span>${game.i18n?.localize("TOTC.Encounter.TargetLabel") ?? "Target"}</span>
                <select class="totc-planner-config__target">${options}</select>
            </label>`;
    }

    panel.innerHTML = `
        <div class="totc-planner-config-header">
            <img src="${actionData.img || "icons/svg/d20-grey.svg"}" class="totc-planner-config__img" onerror="this.src='icons/svg/d20-grey.svg'" />
            <span class="totc-planner-config__name">${actionData.label}</span>
        </div>
        ${apHtml}
        ${targetHtml}
        <div class="totc-planner-config-footer">
            <button type="button" class="totc-planner-config__cancel">${game.i18n?.localize("TOTC.Encounter.Cancel") ?? "Cancel"}</button>
            <button type="button" class="totc-planner-config__confirm">${game.i18n?.localize("TOTC.Encounter.ConfirmAction") ?? "Confirm"}</button>
        </div>`;

    // Live-update the AP display as the slider moves
    const rangeInput = panel.querySelector(".totc-planner-config__ap-range");
    const apDisplay = panel.querySelector(".totc-planner-config__ap-display");
    if (rangeInput && apDisplay) {
        rangeInput.addEventListener("input", () => { apDisplay.textContent = rangeInput.value; });
    }

    panel.querySelector(".totc-planner-config__cancel").addEventListener("click", () => {
        panel.remove();
    });

    panel.querySelector(".totc-planner-config__confirm").addEventListener("click", async () => {
        const apCost = rangeInput ? Number(rangeInput.value) : actionData.apCost;
        const targetId = panel.querySelector(".totc-planner-config__target")?.value ?? null;
        const final = finalizeActionData(actionData, apCost, targetId);
        panel.remove();
        if (!game.combat?.addCombatantAction) return;
        await game.combat.addCombatantAction(combatantId, final);
        sheet.render(true);
    });

    // Insert just before the planned column footer
    const footer = plannerSection?.querySelector(".totc-planner-footer");
    if (footer) {
        footer.closest(".totc-planner-planned")?.insertBefore(panel, footer);
    } else {
        plannerSection?.appendChild(panel);
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
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "profile" }],
            template: this.templatePath
        });
    }

    get template() {
        return this.options.template;
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        const systemSource = this.actor.system?.toObject?.() ?? foundry.utils.deepClone(this.actor.system ?? {});

        if (game.user?.isGM && game.combat?.phase === "planning") {
            await game.combat.maybeAutoFinalizePlanning?.();
        }

        context.system = systemSource;
        context.equipmentSlots = buildEquipmentSlots(this.actor, systemSource);
        context.inventorySummary = buildInventorySummary(this.actor, systemSource);
        context.encounterPlanner = buildEncounterPlanner(this.actor, this.token);
        
        const packItemIds = systemSource.inventory?.pack?.itemIds ?? [];
        context.packItems = packItemIds
            .map((itemId) => this.actor.items.get(itemId))
            .filter(Boolean)
            .map((item) => ({
                id: item.id,
                name: item.name,
                type: item.type,
                img: item.img,
                data: item.toObject()
            }));
        
        context.profileTags = toArrayInput(systemSource.profile?.tags);
        context.heroBonds = toArrayInput(systemSource.hero?.bonds);
        context.villainLieutenants = toArrayInput(systemSource.villain?.lieutenants);
        context.professionOptions = await collectProfessionOptions(systemSource.classification?.profession);

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

        const beltQuality = updateData["system.inventory.equipment.belt.quality"]
            ?? this.actor.system?.inventory?.equipment?.belt?.quality
            ?? "standard";
        const beltCapacity = getBeltCapacityFromQuality(beltQuality);
        updateData["system.inventory.equipment.belt.capacity"] = beltCapacity;

        if (Array.isArray(updateData["system.inventory.equipment.belt.itemIds"])) {
            updateData["system.inventory.equipment.belt.itemIds"] = updateData["system.inventory.equipment.belt.itemIds"].slice(0, beltCapacity);
        }

        return this.object.update(updateData);
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

        const itemData = item instanceof Item ? item.toObject() : item;
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

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".totc-pack-item__delete").on("click", (event) => {
            event.preventDefault();
            const itemId = event.currentTarget.dataset.itemId;
            if (itemId) {
                this.actor.deleteEmbeddedDocuments("Item", [itemId]);
            }
        });

        html.find("[data-action='totc-encounter-toggle-ready']").on("click", async (event) => {
            event.preventDefault();
            const combatantId = event.currentTarget.dataset.combatantId;
            const ready = event.currentTarget.dataset.ready === "true";
            if (!combatantId || !game.combat?.setCombatantReady) return;

            await game.combat.setCombatantReady(combatantId, !ready);
            this.render(true);
        });

        html.find("[data-action='totc-roll-initiative']").on("click", async (event) => {
            event.preventDefault();
            const combatId = event.currentTarget.dataset.combatId;
            const combatantId = event.currentTarget.dataset.combatantId;
            const combat = (combatId && game.combats?.get(combatId)) || game.combat;
            if (!combatantId || !combat?.rollEncounterInitiative) return;

            await combat.rollEncounterInitiative(combatantId);
            this.render(true);
        });

        // ── Available Action: double-click to add ──────────────────────────
        html.find(".totc-planner-available-action").on("dblclick", async (event) => {
            event.preventDefault();
            const el = event.currentTarget;
            if (el.classList.contains("totc-planner-available-action--disabled")) return;

            const planner = el.closest(".totc-planner-columns");
            const combatantId = planner?.dataset.combatantId;
            if (!combatantId || !game.combat?.addCombatantAction) return;

            const actionData = readActionFromElement(el);
            if (!actionData) return;

            const remainingAp = Number(planner.dataset.remainingAp ?? 0);
            if (actionData.apMin > remainingAp) {
                ui.notifications?.warn(game.i18n?.localize("TOTC.Encounter.InsufficientAp") ?? "Insufficient AP remaining.");
                return;
            }

            const needsConfig = actionData.variableAp
                || (actionData.requiresToHit && (game.combat?.getTargetOptionsForCombatant?.(combatantId) ?? []).length > 0);

            if (needsConfig) {
                showInlinePlannerConfig(el.closest(".totc-encounter-planner"), planner, actionData, remainingAp, combatantId, this);
            } else {
                await game.combat.addCombatantAction(combatantId, actionData);
                this.render(true);
            }
        });

        // ── Available Action: drag start ────────────────────────────────────
        html.find(".totc-planner-available-action").on("dragstart", (event) => {
            const el = event.currentTarget;
            if (el.classList.contains("totc-planner-available-action--disabled")) {
                event.preventDefault();
                return;
            }
            const actionData = readActionFromElement(el);
            if (!actionData) return;
            event.originalEvent.dataTransfer.effectAllowed = "copy";
            event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({ totcAction: actionData }));
        });

        // ── Planned slot: drag-over / drop ─────────────────────────────────
        html.find(".totc-planner-slot--empty").on("dragover", (event) => {
            event.preventDefault();
            event.originalEvent.dataTransfer.dropEffect = "copy";
            event.currentTarget.classList.add("totc-planner-slot--drag-over");
        });

        html.find(".totc-planner-slot--empty").on("dragleave", (event) => {
            event.currentTarget.classList.remove("totc-planner-slot--drag-over");
        });

        html.find(".totc-planner-slot--empty").on("drop", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.classList.remove("totc-planner-slot--drag-over");

            let payload;
            try {
                payload = JSON.parse(event.originalEvent.dataTransfer.getData("text/plain") ?? "{}");
            } catch {
                return;
            }
            if (!payload?.totcAction) return;

            const actionData = payload.totcAction;
            const slot = event.currentTarget;
            const planner = slot.closest(".totc-planner-columns");
            const combatantId = slot.dataset.combatantId ?? planner?.dataset.combatantId;
            if (!combatantId || !game.combat?.addCombatantAction) return;

            const remainingAp = Number(planner?.dataset.remainingAp ?? 0);
            if (actionData.apMin > remainingAp) {
                ui.notifications?.warn(game.i18n?.localize("TOTC.Encounter.InsufficientAp") ?? "Insufficient AP remaining.");
                return;
            }

            const needsConfig = actionData.variableAp
                || (actionData.requiresToHit && (game.combat?.getTargetOptionsForCombatant?.(combatantId) ?? []).length > 0);

            if (needsConfig) {
                showInlinePlannerConfig(slot.closest(".totc-encounter-planner"), planner, actionData, remainingAp, combatantId, this);
            } else {
                await game.combat.addCombatantAction(combatantId, actionData);
                this.render(true);
            }
        });

        // ── Remove action from planned list ────────────────────────────────
        html.find("[data-action='totc-encounter-remove-action']").on("click", async (event) => {
            event.preventDefault();

            const combatantId = event.currentTarget.dataset.combatantId;
            const actionIndex = Number(event.currentTarget.dataset.actionIndex);
            if (!combatantId || Number.isNaN(actionIndex) || !game.combat?.removeCombatantAction) return;

            await game.combat.removeCombatantAction(combatantId, actionIndex);
            this.render(true);
        });

        html.find("[data-action='totc-encounter-clear-plan']").on("click", async (event) => {
            event.preventDefault();

            const combatantId = event.currentTarget.dataset.combatantId;
            if (!combatantId || !game.combat?.clearCombatantPlan) return;

            await game.combat.clearCombatantPlan(combatantId);
            this.render(true);
        });
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
