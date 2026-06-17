export const DEFAULT_ACTOR_EDITOR_STATE = Object.freeze({
    mode: "empty",
    actorId: "",
    actorType: "pawn",
    additionalPrompt: "",
    isGenerating: false,
    formData: {},
    dirty: false,
    status: "",
    error: ""
});

const COMPENDIUM_ITEM_DRAG_MIME = "application/x-totc-compendium-item";
const TEXT_PLAIN_MIME = "text/plain";
const EQUIPMENT_SLOT_KEYS = Object.freeze(["head", "neck", "torso", "hands", "legs", "feet", "belt"]);
const EQUIPMENT_SLOT_CONFIG = Object.freeze({
    head: { capacity: 1, allowedTypes: ["armor", "equipment"] },
    neck: { capacity: 1, allowedTypes: ["armor", "equipment"] },
    torso: { capacity: 2, allowedTypes: ["armor", "equipment", "item"] },
    hands: { capacity: 2, allowedTypes: ["armor", "weapon", "tool", "equipment"] },
    legs: { capacity: 1, allowedTypes: ["armor", "equipment"] },
    feet: { capacity: 1, allowedTypes: ["armor", "equipment"] },
    belt: { capacity: 4, allowedTypes: ["weapon", "tool", "equipment", "consumable", "item"] }
});
const BELT_QUALITY_CAPACITY = Object.freeze({
    poor: 2,
    standard: 4,
    fine: 5,
    exceptional: 6,
    masterwork: 7,
    experimental: 8
});

function userId(user) {
    return String(user?.id ?? user?._id ?? "").trim();
}

function itemSystem(item) {
    return item?.system?.toObject?.() ?? item?.system ?? {};
}

function isToolItem(item) {
    const system = itemSystem(item);
    return (item?.type === "equipment" || item?.type === "item") && system.category === "tool";
}

function getSlotCapacity(slotKey, slot) {
    if (slotKey === "belt") {
        return BELT_QUALITY_CAPACITY[slot?.quality] ?? Math.max(1, Number(slot?.capacity ?? EQUIPMENT_SLOT_CONFIG.belt.capacity));
    }
    return Math.max(1, Number(slot?.capacity ?? EQUIPMENT_SLOT_CONFIG[slotKey]?.capacity ?? 1));
}

function isSlotCompatible(item, slotKey, slot) {
    const allowedTypes = new Set(Array.isArray(slot?.allowedTypes) ? slot.allowedTypes : []);
    const system = itemSystem(item);
    if (system.slot !== slotKey) return false;
    if (item?.type === "armor") return allowedTypes.has("armor");
    if (allowedTypes.has(item?.type)) return true;
    return allowedTypes.has("tool") && isToolItem(item);
}

function findEmptyEquipmentSlot(actor, item) {
    const equipment = actor?.system?.inventory?.equipment ?? {};
    for (const slotKey of EQUIPMENT_SLOT_KEYS) {
        const fallback = EQUIPMENT_SLOT_CONFIG[slotKey] ?? { capacity: 1, allowedTypes: [] };
        const slot = {
            ...fallback,
            ...(equipment?.[slotKey] ?? {})
        };
        if (!isSlotCompatible(item, slotKey, slot)) continue;
        const itemIds = Array.isArray(slot.itemIds) ? slot.itemIds : [];
        if (itemIds.length < getSlotCapacity(slotKey, slot)) {
            return { slotKey, index: itemIds.length, itemIds };
        }
    }
    return null;
}

function parseDropPayload(dataTransfer) {
    const compendiumData = String(dataTransfer?.getData?.(COMPENDIUM_ITEM_DRAG_MIME) ?? "").trim();
    if (compendiumData) {
        try {
            const payload = JSON.parse(compendiumData);
            if (payload?.type === "Item" && (payload?.uuid || payload?.data)) return payload;
        } catch {
            // Ignore invalid mime payload and fall back to text/plain parsing.
        }
    }

    const text = String(dataTransfer?.getData?.(TEXT_PLAIN_MIME) ?? "").trim();
    if (!text) return null;
    try {
        const payload = JSON.parse(text);
        if (payload?.type === "Item" && (payload?.uuid || payload?.data)) return payload;
    } catch {
        return null;
    }
    return null;
}

export class ActorWorkspaceController {
    constructor({
        getActorById = () => null,
        createActor = async () => null,
        generate = async () => null,
        buildGeneratedActorDocumentData = (data) => data,
        buildActorUpdateDataFromFormData = () => ({}),
        fromUuid = async (uuid) => globalThis.fromUuid?.(uuid),
        openActorEditor = async () => {},
        render = () => {},
        logger = console
    } = {}) {
        this.getActorById = getActorById;
        this.createActor = createActor;
        this.generate = generate;
        this.buildGeneratedActorDocumentData = buildGeneratedActorDocumentData;
        this.buildActorUpdateDataFromFormData = buildActorUpdateDataFromFormData;
        this.fromUuid = fromUuid;
        this.openActorEditor = openActorEditor;
        this.render = render;
        this.logger = logger;
        this.searchQuery = "";
        this.typeFilter = "all";
        this.selectedActorIds = new Set();
        this.editorState = { ...DEFAULT_ACTOR_EDITOR_STATE };
    }

    async importItemToActor(actor, payload) {
        if (!actor?.createEmbeddedDocuments) {
            throw new Error("Actor item import is not available.");
        }

        let itemData = null;
        if (payload?.uuid) {
            const source = await this.fromUuid?.(payload.uuid);
            if (source?.toObject) itemData = source.toObject();
            else if (source && typeof source === "object") itemData = source;
        } else if (payload?.data && typeof payload.data === "object") {
            itemData = payload.data;
        }

        if (!itemData) {
            throw new Error("Could not resolve dropped item.");
        }

        const clonedItemData = { ...itemData };
        delete clonedItemData._id;
        const createdItems = await actor.createEmbeddedDocuments("Item", [clonedItemData]);
        const createdItem = createdItems?.[0] ?? null;
        if (!createdItem?.id) throw new Error("Dropped item could not be created on actor.");

        const slot = findEmptyEquipmentSlot(actor, createdItem);
        if (!slot) {
            return { createdItem, equipped: false };
        }

        const nextItemIds = [...slot.itemIds];
        nextItemIds[slot.index] = createdItem.id;
        await actor.update({
            [`system.inventory.equipment.${slot.slotKey}.itemIds`]: nextItemIds
        });
        return { createdItem, equipped: true, slotKey: slot.slotKey };
    }

    get state() {
        return {
            searchQuery: this.searchQuery,
            typeFilter: this.typeFilter,
            selectedActorIds: this.selectedActorIds,
            editorState: this.editorState
        };
    }

    getSelectedActorIds() {
        return this.selectedActorIds;
    }

    getSelectedActor() {
        return this.editorState.actorId ? this.getActorById(this.editorState.actorId) : null;
    }

    setSearchQuery(value = "") {
        this.searchQuery = String(value ?? "");
    }

    setTypeFilter(value = "all") {
        this.typeFilter = String(value ?? "all").trim() || "all";
    }

    toggleSelectedActor(actorId = "", selected = false) {
        const safeActorId = String(actorId ?? "").trim();
        if (!safeActorId) return;
        if (selected) this.selectedActorIds.add(safeActorId);
        else this.selectedActorIds.delete(safeActorId);
    }

    beginCreate() {
        this.editorState = { ...DEFAULT_ACTOR_EDITOR_STATE, mode: "create" };
    }

    openDetails(actorId = "") {
        const safeActorId = String(actorId ?? "").trim();
        if (!safeActorId) return false;
        this.editorState = {
            ...this.editorState,
            mode: "edit",
            actorId: safeActorId,
            actorType: this.getActorById(safeActorId)?.type ?? "pawn",
            additionalPrompt: "",
            isGenerating: false,
            formData: {},
            dirty: false,
            status: "",
            error: ""
        };
        return true;
    }

    clearDetails() {
        this.editorState = {
            ...this.editorState,
            mode: "empty",
            actorId: "",
            additionalPrompt: "",
            isGenerating: false,
            formData: {},
            dirty: false,
            status: "",
            error: ""
        };
    }

    setCreateActorType(actorType = "pawn") {
        this.editorState = {
            ...this.editorState,
            actorType,
            error: "",
            status: ""
        };
    }

    setCreatePrompt(value = "") {
        this.editorState.additionalPrompt = String(value ?? "");
    }

    updateEditorField(path = "", value = "") {
        const safePath = String(path ?? "").trim();
        if (!safePath) return;
        this.editorState.formData = {
            ...(this.editorState.formData ?? {}),
            [safePath]: String(value ?? "")
        };
        this.editorState.dirty = true;
        this.editorState.status = "";
        this.editorState.error = "";
    }

    async generateActor() {
        if (this.editorState.isGenerating) return;
        this.editorState = {
            ...this.editorState,
            isGenerating: true,
            status: "",
            error: ""
        };
        this.render();

        try {
            const actorType = this.editorState.actorType || "pawn";
            const additionalPrompt = String(this.editorState.additionalPrompt ?? "").trim();
            const prompt = additionalPrompt || `Create a ${actorType} actor for immediate use in play.`;
            const result = await this.generate(prompt, {
                elementType: "actor",
                generationContext: { actorType }
            });
            const actor = await this.createActor(this.buildGeneratedActorDocumentData(result, actorType));
            this.editorState = {
                mode: "edit",
                actorId: actor?.id ?? actor?._id ?? "",
                actorType: actor?.type ?? actorType,
                additionalPrompt: "",
                isGenerating: false,
                formData: {},
                dirty: false,
                status: `Created ${actor?.name ?? "actor"}.`,
                error: ""
            };
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Actor generation failed", error);
            this.editorState = {
                ...this.editorState,
                isGenerating: false,
                status: "",
                error: error?.message ?? "Actor generation failed."
            };
        }

        this.render();
    }

    async saveActorForm(form) {
        const formData = new FormData(form);
        const actorId = String(formData.get("actorId") ?? this.editorState.actorId ?? "").trim();
        const actor = actorId ? this.getActorById(actorId) : null;
        if (!actor?.update) {
            this.editorState = {
                ...this.editorState,
                status: "",
                error: "Actor save is not available."
            };
            this.render();
            return;
        }

        try {
            const updateData = this.buildActorUpdateDataFromFormData(formData);
            if (game.user?.isGM) {
                const ownerUserId = String(formData.get("__ownerUserId") ?? "").trim();
                const ownership = { ...(actor?.ownership ?? {}) };
                const ownershipLevels = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? {};
                const ownerLevel = Number(ownershipLevels.OWNER ?? 3);
                const noneLevel = Number(ownershipLevels.NONE ?? 0);
                const users = Array.from(globalThis.game?.users?.contents ?? globalThis.game?.users ?? []);

                for (const user of users) {
                    const id = userId(user);
                    if (!id || user?.isGM) continue;
                    const hasOwnerLevel = Number(ownership[id] ?? noneLevel) >= ownerLevel;
                    if (id === ownerUserId) ownership[id] = ownerLevel;
                    else if (hasOwnerLevel) ownership[id] = noneLevel;
                }

                updateData.ownership = ownership;
            }
            await actor.update(updateData);
            this.editorState = {
                ...this.editorState,
                mode: "edit",
                actorId,
                actorType: actor.type ?? this.editorState.actorType,
                formData: {},
                dirty: false,
                status: "Actor saved.",
                error: ""
            };
        } catch (error) {
            this.logger?.error?.("[turn-of-the-century] Actor save failed", error);
            this.editorState = {
                ...this.editorState,
                status: "",
                error: error?.message ?? "Actor save failed."
            };
        }

        this.render();
    }

    wireHandlers(root) {
        root?.querySelectorAll("[data-action='actor-list-new']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.beginCreate();
                await this.openActorEditor();
            });
        });

        root?.querySelectorAll("[data-action='actor-list-type-filter']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                event.stopPropagation();
                this.setTypeFilter(select.value);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='actor-list-toggle-selected']")?.forEach((checkbox) => {
            checkbox.addEventListener("change", (event) => {
                event.stopPropagation();
                this.toggleSelectedActor(checkbox.dataset.actorId, checkbox.checked);
                this.render();
            });
        });

        root?.querySelectorAll("[data-actor-list-draggable='true']")?.forEach((entry) => {
            entry.addEventListener("dblclick", async (event) => {
                if (event.target?.closest?.("[data-action='actor-list-toggle-selected']")) return;
                event.preventDefault();
                event.stopPropagation();
                if (!this.openDetails(entry.dataset.actorId)) return;
                await this.openActorEditor();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-create-type']")?.forEach((select) => {
            select.addEventListener("change", (event) => {
                this.setCreateActorType(event.target.value);
                this.render();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-create-prompt']")?.forEach((textarea) => {
            textarea.addEventListener("input", () => {
                this.setCreatePrompt(textarea.value);
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-field']")?.forEach((input) => {
            const onFieldChange = () => {
                this.updateEditorField(input.dataset.actorField ?? input.name, input.value);
                const abilityModifier = input.closest(".totc-v2-actor-editor__ability")?.querySelector(".totc-v2-actor-editor__ability-modifier");
                if (abilityModifier) {
                    const score = Number(input.value);
                    const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
                    abilityModifier.textContent = modifier >= 0 ? `+${modifier}` : String(modifier);
                }
                input.closest("form")?.querySelector("[data-action='actor-editor-save']")?.removeAttribute("disabled");
            };

            input.addEventListener("input", onFieldChange);
            input.addEventListener("change", onFieldChange);
        });

        root?.querySelectorAll("[data-action='actor-editor-owner-assignment']")?.forEach((select) => {
            select.addEventListener("change", async (event) => {
                event.stopPropagation();
                const form = select.closest("form");
                if (!form) return;
                await this.saveActorForm(form);
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-generate']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.generateActor();
            });
        });

        root?.querySelectorAll("[data-action='actor-editor-save-form']")?.forEach((form) => {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.saveActorForm(form);
            });

            form.addEventListener("dragover", (event) => {
                const payload = parseDropPayload(event.dataTransfer);
                if (!payload) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
                form.classList?.add("is-item-drop-target");
            });

            form.addEventListener("dragleave", (event) => {
                const relatedTarget = event.relatedTarget;
                if (typeof Node !== "undefined" && relatedTarget instanceof Node && form.contains(relatedTarget)) return;
                form.classList?.remove("is-item-drop-target");
            });

            form.addEventListener("drop", async (event) => {
                const payload = parseDropPayload(event.dataTransfer);
                form.classList?.remove("is-item-drop-target");
                if (!payload) return;

                event.preventDefault();
                event.stopPropagation();

                const actorId = String(form.querySelector("[name='actorId']")?.value ?? this.editorState.actorId ?? "").trim();
                const actor = actorId ? this.getActorById(actorId) : null;
                if (!actor) {
                    this.editorState = {
                        ...this.editorState,
                        status: "",
                        error: "Actor save is not available."
                    };
                    this.render();
                    return;
                }

                if (!actor.isOwner && !game.user?.isGM) {
                    this.editorState = {
                        ...this.editorState,
                        status: "",
                        error: "You do not have permission to add items to this actor."
                    };
                    this.render();
                    return;
                }

                try {
                    const { createdItem, equipped } = await this.importItemToActor(actor, payload);
                    this.editorState = {
                        ...this.editorState,
                        mode: "edit",
                        actorId,
                        actorType: actor.type ?? this.editorState.actorType,
                        formData: {},
                        dirty: false,
                        status: equipped
                            ? `Added ${createdItem.name ?? "item"} and equipped it.`
                            : `Added ${createdItem.name ?? "item"} to inventory.`,
                        error: ""
                    };
                } catch (error) {
                    this.logger?.warn?.("[turn-of-the-century] Failed to drop item onto actor editor", error);
                    this.editorState = {
                        ...this.editorState,
                        status: "",
                        error: error?.message ?? "Item drop failed."
                    };
                }

                this.render();
            });
        });

        root?.querySelectorAll("[data-compendium-item-draggable='true']")?.forEach((entry) => {
            entry.addEventListener("dragstart", (event) => {
                const uuid = String(entry.dataset.entryUuid ?? "").trim();
                if (!uuid || !event.dataTransfer) return;
                const payload = JSON.stringify({ type: "Item", uuid });
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(COMPENDIUM_ITEM_DRAG_MIME, payload);
                event.dataTransfer.setData(TEXT_PLAIN_MIME, payload);
                entry.classList?.add("is-dragging");
            });

            entry.addEventListener("dragend", () => {
                entry.classList?.remove("is-dragging");
            });
        });
    }
}
