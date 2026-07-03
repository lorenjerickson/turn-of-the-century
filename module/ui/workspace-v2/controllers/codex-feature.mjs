import { WorkspaceFeature } from "../workspace-feature.mjs";
import {
    buildCodexPanelModel,
    CODEX_ITEM_TYPES,
    renderCodexPanel
} from "../panels/codex-panel.mjs";

const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";
const TYPE_PACK_NAMES = {
    armor: "armor",
    consumable: "consumables",
    effect: "effects",
    item: "equipment",
    weapon: "weapons"
};

const SYSTEM_FIELD_ALLOWLIST = {
    armor: ["system.description", "system.category", "system.armorClass", "system.slot", "system.actions"],
    consumable: ["system.description", "system.category", "system.use", "system.quantity", "system.actions"],
    effect: ["system.description", "system.disposition", "system.category", "system.duration"],
    item: ["system.description", "system.category", "system.slot", "system.physical", "system.actions"],
    weapon: ["system.description", "system.classification", "system.damage", "system.actions"]
};

function normalizeType(type) {
    const normalized = String(type ?? "item").trim();
    return CODEX_ITEM_TYPES.includes(normalized) ? normalized : "item";
}

function setDottedValue(target, path, value) {
    const segments = String(path ?? "").split(".").filter(Boolean);
    if (!segments.length) return;

    let cursor = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const nextSegment = segments[index + 1];
        if (/^\d+$/.test(nextSegment)) cursor[segment] ??= [];
        else cursor[segment] ??= {};
        cursor = cursor[segment];
    }
    cursor[segments.at(-1)] = value;
}

function coerceFormValue(value) {
    const rawValue = String(value ?? "");
    if (rawValue === "") return "";
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) && /^-?\d+(\.\d+)?$/.test(rawValue) ? numericValue : rawValue;
}

function isAllowedSystemFieldForType(key, type) {
    const allowlist = SYSTEM_FIELD_ALLOWLIST[normalizeType(type)] ?? SYSTEM_FIELD_ALLOWLIST.item;
    return allowlist.some((path) => key === path || key.startsWith(`${path}.`));
}

export function buildItemDataFromCodexForm(form = {}) {
    const type = normalizeType(form.type);
    const itemData = {
        name: String(form.name ?? "").trim() || "New Item",
        type,
        img: String(form.img ?? "").trim() || DEFAULT_ITEM_ICON,
        system: {}
    };

    for (const [key, value] of Object.entries(form)) {
        if (!key.startsWith("system.")) continue;
        if (!isAllowedSystemFieldForType(key, type)) continue;
        setDottedValue(itemData, key, coerceFormValue(value));
    }

    return itemData;
}

export function buildItemUpdateDataFromCodexForm(form = {}) {
    const itemData = form?.system && typeof form.system === "object"
        ? { ...form }
        : buildItemDataFromCodexForm(form);
    delete itemData.type;
    return itemData;
}

function flattenActionFormFields(document) {
    const fields = {};
    const variants = Array.isArray(document.system?.actions?.variants) ? document.system.actions.variants : [];
    variants.forEach((variant, actionIndex) => {
        const actionPrefix = `system.actions.variants.${actionIndex}`;
        for (const [key, value] of Object.entries(variant ?? {})) {
            if (key === "effects" || Array.isArray(value) || (value && typeof value === "object")) continue;
            fields[`${actionPrefix}.${key}`] = value ?? "";
        }
        (Array.isArray(variant?.effects) ? variant.effects : []).forEach((effect, effectIndex) => {
            const effectPrefix = `${actionPrefix}.effects.${effectIndex}`;
            for (const [key, value] of Object.entries(effect ?? {})) {
                if (value && typeof value === "object" && !Array.isArray(value)) {
                    for (const [nestedKey, nestedValue] of Object.entries(value)) {
                        fields[`${effectPrefix}.${key}.${nestedKey}`] = nestedValue ?? "";
                    }
                    continue;
                }
                if (!Array.isArray(value)) fields[`${effectPrefix}.${key}`] = value ?? "";
            }
        });
    });
    return fields;
}

function getFormSnapshot(form) {
    const formData = new FormData(form);
    return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value ?? "")]));
}

function nextIndex(form = {}, prefix = "") {
    const escapedPrefix = String(prefix ?? "").replaceAll(".", "\\.");
    const indices = Object.keys(form)
        .map((key) => key.match(new RegExp(`^${escapedPrefix}\\.(\\d+)\\.`))?.[1])
        .filter((value) => value !== undefined)
        .map((value) => Number(value));
    return indices.length ? Math.max(...indices) + 1 : 0;
}

async function withPackUnlocked(pack, operation) {
    const collection = pack?.collection;
    let activePack = pack;
    const wasLocked = Boolean(activePack?.locked);

    if (wasLocked) {
        await activePack.configure?.({ locked: false });
        activePack = globalThis.game?.packs?.get?.(collection) ?? activePack;
    }

    try {
        return await operation(activePack);
    } finally {
        if (wasLocked) await activePack?.configure?.({ locked: true });
    }
}

export class CodexFeature extends WorkspaceFeature {
    constructor({
        compendiumCacheController,
        createItem = async () => null,
        render = () => {},
        escapeHTML = (value) => String(value ?? "")
    } = {}) {
        super();
        this.compendiumCacheController = compendiumCacheController;
        this.createItem = createItem;
        this.renderCallback = render;
        this.escapeHTML = escapeHTML;
        this.state = {
            searchQuery: "",
            typeFilter: "",
            selectedUuid: "",
            mode: "view",
            form: { type: "item", img: DEFAULT_ITEM_ICON },
            editorStack: [{ type: "item" }]
        };
    }

    async prepareContext(context) {
        const codexItems = await this.compendiumCacheController.getItems();
        context.codexPanel = buildCodexPanelModel({
            items: codexItems,
            searchQuery: this.state.searchQuery,
            typeFilter: this.state.typeFilter,
            state: this.state,
            loadingState: this.compendiumCacheController.loadingFailureMessage,
            isGM: Boolean(globalThis.game?.user?.isGM)
        });
    }

    render(panel, context) {
        if (panel?.id !== "codex") return undefined;
        return renderCodexPanel(context.codexPanel ?? {}, {
            escapeHTML: (value) => this.escapeHTML(value)
        });
    }

    bind(rootElement) {
        rootElement?.querySelectorAll("[data-action='codex-type-filter']")?.forEach((select) => {
            select.addEventListener("change", () => {
                this.state = {
                    ...this.state,
                    typeFilter: String(select.value ?? "")
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-select-item']")?.forEach((entry) => {
            entry.addEventListener("click", (event) => {
                event.preventDefault();
                this.state = {
                    ...this.state,
                    selectedUuid: String(entry.dataset.entryUuid ?? ""),
                    mode: "view",
                    editorStack: [{ type: "item" }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-add-item']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.state = {
                    ...this.state,
                    selectedUuid: "",
                    mode: "create",
                    form: { type: "item", img: DEFAULT_ITEM_ICON },
                    editorStack: [{ type: "item" }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-edit-item']")?.forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#editSelectedItem(String(button.dataset.entryUuid ?? ""));
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-edit-type']")?.forEach((select) => {
            select.addEventListener("change", () => {
                const form = select.closest("form");
                this.state = {
                    ...this.state,
                    form: {
                        ...getFormSnapshot(form),
                        type: normalizeType(select.value)
                    }
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-add-action']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const form = button.closest("form");
                const snapshot = { ...this.state.form, ...getFormSnapshot(form) };
                const actionIndex = nextIndex(snapshot, "system.actions.variants");
                const prefix = `system.actions.variants.${actionIndex}`;
                this.state = {
                    ...this.state,
                    form: {
                        ...snapshot,
                        [`${prefix}.id`]: `action${actionIndex + 1}`,
                        [`${prefix}.label`]: "Use Item",
                        [`${prefix}.type`]: "utility",
                        [`${prefix}.apCost`]: "1",
                        [`${prefix}.rangeType`]: "melee",
                        [`${prefix}.targetingRangeFeet`]: "5",
                        [`${prefix}.recapFormat`]: "{{Owner.name}} uses {{Item.name}}.",
                        [`${prefix}.notes`]: ""
                    },
                    editorStack: [{ type: "item" }, { type: "action", actionIndex }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-edit-action']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const form = button.closest("form");
                this.state = {
                    ...this.state,
                    form: { ...this.state.form, ...getFormSnapshot(form) },
                    editorStack: [{ type: "item" }, { type: "action", actionIndex: Number(button.dataset.actionIndex ?? 0) }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-add-effect']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionIndex = Number(button.dataset.actionIndex ?? 0);
                const form = button.closest("form");
                const snapshot = { ...this.state.form, ...getFormSnapshot(form) };
                const effectIndex = nextIndex(snapshot, `system.actions.variants.${actionIndex}.effects`);
                const prefix = `system.actions.variants.${actionIndex}.effects.${effectIndex}`;
                this.state = {
                    ...this.state,
                    form: {
                        ...snapshot,
                        [`${prefix}.id`]: `effect${effectIndex + 1}`,
                        [`${prefix}.label`]: "Effect",
                        [`${prefix}.type`]: "condition",
                        [`${prefix}.target`]: "target",
                        [`${prefix}.timing`]: "onComplete",
                        [`${prefix}.operation`]: "grant",
                        [`${prefix}.path`]: "",
                        [`${prefix}.value`]: "0",
                        [`${prefix}.condition`]: "",
                        [`${prefix}.duration.rounds`]: "0",
                        [`${prefix}.area.radiusFeet`]: "0",
                        [`${prefix}.save.difficulty`]: "10"
                    },
                    editorStack: [{ type: "item" }, { type: "action", actionIndex }, { type: "effect", actionIndex, effectIndex }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-edit-effect']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const actionIndex = Number(button.dataset.actionIndex ?? 0);
                const effectIndex = Number(button.dataset.effectIndex ?? 0);
                const form = button.closest("form");
                this.state = {
                    ...this.state,
                    form: { ...this.state.form, ...getFormSnapshot(form) },
                    editorStack: [{ type: "item" }, { type: "action", actionIndex }, { type: "effect", actionIndex, effectIndex }]
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-editor-stack-pop']")?.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const form = button.closest("form");
                const depth = Math.max(1, Number(button.dataset.stackDepth ?? 1));
                this.state = {
                    ...this.state,
                    form: { ...this.state.form, ...getFormSnapshot(form) },
                    editorStack: (this.state.editorStack ?? [{ type: "item" }]).slice(0, depth)
                };
                this.renderCallback({ force: false });
            });
        });

        rootElement?.querySelectorAll("[data-action='codex-save-item']")?.forEach((form) => {
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.#saveItem({ ...this.state.form, ...getFormSnapshot(form) });
            });
        });
    }

    setSearchQuery(query) {
        this.state = {
            ...this.state,
            searchQuery: String(query ?? "")
        };
    }

    async #editSelectedItem(uuid) {
        const document = await this.#getItemDocument(uuid);
        if (!document) {
            globalThis.ui?.notifications?.warn?.("That Codex item could not be opened.");
            return;
        }

        this.state = {
            ...this.state,
            selectedUuid: uuid,
            mode: "edit",
            form: this.#buildEditForm(document),
            editorStack: [{ type: "item" }]
        };
        this.renderCallback({ force: false });
    }

    #buildEditForm(document) {
        const type = normalizeType(document.type);
        const base = {
            type,
            name: document.name ?? "",
            img: document.img ?? DEFAULT_ITEM_ICON,
            "system.description": document.system?.description ?? ""
        };

        if (type === "effect") {
            return {
                ...base,
                "system.disposition": document.system?.disposition ?? "detrimental",
                "system.category": document.system?.category ?? "physical",
                "system.duration.value": document.system?.duration?.value ?? 1,
                "system.duration.unit": document.system?.duration?.unit ?? "hour"
            };
        }

        return {
            ...base,
            "system.category": document.system?.category ?? "",
            "system.slot": document.system?.slot ?? "",
            "system.physical.quantity": document.system?.physical?.quantity ?? 1,
            "system.classification": document.system?.classification ?? "simpleMelee",
            "system.damage.formula": document.system?.damage?.formula ?? "1d4",
            "system.damage.type": document.system?.damage?.type ?? "bludgeoning",
            "system.armorClass.increment": document.system?.armorClass?.increment ?? 0,
            "system.use.method": document.system?.use?.method ?? "administer",
            "system.quantity.value": document.system?.quantity?.value ?? 1,
            ...flattenActionFormFields(document)
        };
    }

    async #saveItem(form) {
        if (!globalThis.game?.user?.isGM) return;

        const itemData = buildItemDataFromCodexForm(form);
        try {
            const document = this.state.mode === "edit" && this.state.selectedUuid
                ? await this.#updateExistingItem(itemData)
                : await this.#createNewItem(itemData);

            this.compendiumCacheController.invalidate();
            this.state = {
                ...this.state,
                selectedUuid: String(document?.uuid ?? this.state.selectedUuid ?? ""),
                mode: "view",
                form: { type: itemData.type, img: DEFAULT_ITEM_ICON },
                editorStack: [{ type: "item" }]
            };
            globalThis.ui?.notifications?.info?.("Codex item saved.");
            this.renderCallback({ force: false });
        } catch (error) {
            console.error("[turn-of-the-century] Codex item save failed", error);
            globalThis.ui?.notifications?.error?.("Unable to save Codex item. See console for details.");
        }
    }

    async #createNewItem(itemData) {
        const pack = this.#getPackForType(itemData.type);
        if (!pack?.collection) throw new Error(`No Codex compendium pack found for ${itemData.type}.`);

        return await withPackUnlocked(pack, async (activePack) => {
            return await this.createItem(itemData, { pack: activePack.collection });
        });
    }

    async #updateExistingItem(itemData) {
        const document = await this.#getItemDocument(this.state.selectedUuid);
        if (!document) throw new Error("Selected Codex item could not be loaded.");

        const pack = this.#getPackForUuid(this.state.selectedUuid) ?? this.#getPackForType(itemData.type);
        return await withPackUnlocked(pack, async () => {
            return await document.update?.(buildItemUpdateDataFromCodexForm(itemData));
        });
    }

    #getPackForType(type) {
        const packName = TYPE_PACK_NAMES[normalizeType(type)] ?? TYPE_PACK_NAMES.item;
        return Array.from(globalThis.game?.packs?.values?.() ?? [])
            .find((pack) => {
                const name = String(pack?.metadata?.name ?? "").trim();
                const collection = String(pack?.collection ?? "").trim();
                return name === packName || collection.endsWith(`.${packName}`);
            }) ?? null;
    }

    #getPackForUuid(uuid) {
        const parts = String(uuid ?? "").split(".");
        if (parts[0] !== "Compendium" || parts.length < 4) return null;
        const collection = `${parts[1]}.${parts[2]}`;
        return globalThis.game?.packs?.get?.(collection) ?? null;
    }

    async #getItemDocument(uuid) {
        const trimmedUuid = String(uuid ?? "").trim();
        if (!trimmedUuid) return null;
        return await globalThis.fromUuid?.(trimmedUuid);
    }
}
