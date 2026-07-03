const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

export const CODEX_ITEM_TYPES = ["item", "weapon", "armor", "consumable", "effect"];

const TYPE_LABELS = {
    armor: "Armor",
    consumable: "Consumable",
    effect: "Effect",
    item: "Equipment",
    weapon: "Weapon"
};

const TYPE_FIELDS = {
    armor: [
        { name: "system.category", label: "Category", type: "select", options: ["clothing", "light", "medium", "heavy", "natural", "prosthetic"] },
        { name: "system.armorClass.increment", label: "Armor Class", type: "number", min: 0 },
        { name: "system.slot", label: "Slot", type: "text" }
    ],
    consumable: [
        { name: "system.category", label: "Category", type: "select", options: ["food", "drink", "medicine", "bandage", "tonic", "drug", "antidote", "surgicalSupply", "chemical", "other"] },
        { name: "system.use.method", label: "Use Method", type: "select", options: ["eat", "drink", "apply", "inject", "inhale", "administer", "other"] },
        { name: "system.quantity.value", label: "Quantity", type: "number", min: 0 }
    ],
    effect: [
        { name: "system.disposition", label: "Disposition", type: "select", options: ["beneficial", "detrimental", "mixed", "neutral"] },
        { name: "system.category", label: "Category", type: "select", options: ["physical", "mental", "sensory", "movement", "defense", "medical", "chemical", "environmental", "morale", "experimental"] },
        { name: "system.duration.value", label: "Duration", type: "number", min: 0 },
        { name: "system.duration.unit", label: "Duration Unit", type: "select", options: ["instant", "round", "minute", "hour", "day", "scene", "untilRemoved", "permanent"] }
    ],
    item: [
        { name: "system.category", label: "Category", type: "select", options: ["tool", "trinket", "instrument", "document", "clothing", "container", "apparatus", "miscellaneous"] },
        { name: "system.slot", label: "Slot", type: "text" },
        { name: "system.physical.quantity", label: "Quantity", type: "number", min: 0 }
    ],
    weapon: [
        { name: "system.classification", label: "Classification", type: "select", options: ["unarmed", "simpleMelee", "simpleRanged", "martialMelee", "martialRanged", "firearm", "explosive", "improvised", "tool"] },
        { name: "system.damage.formula", label: "Damage", type: "text" },
        { name: "system.damage.type", label: "Damage Type", type: "select", options: ["bludgeoning", "piercing", "slashing", "ballistic", "fire", "acid", "poison", "electric", "explosive", "psychological"] }
    ]
};

const ACTION_TYPE_OPTIONS = ["attack", "movement", "defense", "consumable", "utility"];
const RANGE_TYPE_OPTIONS = ["melee", "normal", "long"];
const EFFECT_TYPE_OPTIONS = ["damage", "healing", "condition", "modifier", "resource", "movement", "custom"];
const EFFECT_TARGET_OPTIONS = ["self", "target", "area", "origin", "item", "custom"];
const EFFECT_TIMING_OPTIONS = ["onUse", "onHit", "onMiss", "onComplete", "onSaveFail", "onSaveSuccess", "always"];
const EFFECT_OPERATION_OPTIONS = ["add", "subtract", "set", "grant", "remove", "roll", "custom"];
const SAVE_ABILITY_OPTIONS = ["", "str", "dex", "con", "int", "wis", "cha", "san"];
const EFFECT_TARGET_PATH_OPTIONS = [
    { value: "", label: "None" },
    { value: "system.resources.health.value", label: "Health" },
    { value: "system.resources.health.max", label: "Health Maximum" },
    { value: "system.resources.grit.value", label: "Grit" },
    { value: "system.resources.grit.max", label: "Grit Maximum" },
    { value: "system.abilities.san.value", label: "Sanity" },
    { value: "system.abilities.san.save", label: "Sanity Save" },
    { value: "system.movement.walk", label: "Walking Speed" },
    { value: "system.movement.climb", label: "Climbing Speed" },
    { value: "system.movement.swim", label: "Swimming Speed" },
    { value: "system.movement.fly", label: "Flying Speed" },
    { value: "system.defenses.armorClass", label: "Armor Class" },
    { value: "system.abilities.str.value", label: "Strength" },
    { value: "system.abilities.dex.value", label: "Dexterity" },
    { value: "system.abilities.con.value", label: "Constitution" },
    { value: "system.abilities.int.value", label: "Intelligence" },
    { value: "system.abilities.wis.value", label: "Wisdom" },
    { value: "system.abilities.cha.value", label: "Charisma" },
    { value: "system.abilities.str.save", label: "Strength Save" },
    { value: "system.abilities.dex.save", label: "Dexterity Save" },
    { value: "system.abilities.con.save", label: "Constitution Save" },
    { value: "system.abilities.int.save", label: "Intelligence Save" },
    { value: "system.abilities.wis.save", label: "Wisdom Save" },
    { value: "system.abilities.cha.save", label: "Charisma Save" }
];

function normalizeType(type) {
    const normalized = String(type ?? "item").trim() || "item";
    return CODEX_ITEM_TYPES.includes(normalized) ? normalized : "item";
}

function labelForType(type) {
    const normalized = String(type ?? "item").trim();
    return TYPE_LABELS[normalized] ?? normalized.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getFieldValue(form = {}, name = "") {
    if (Object.hasOwn(form, name)) return form[name];
    if (name === "system.damage.formula") return "1d4";
    if (name === "system.damage.type") return "bludgeoning";
    if (name === "system.classification") return "simpleMelee";
    if (name === "system.category") return "miscellaneous";
    if (name === "system.disposition") return "detrimental";
    if (name === "system.duration.value") return 1;
    if (name === "system.duration.unit") return "hour";
    if (name.endsWith(".targetingRangeFeet")) return 5;
    if (name === "system.use.method") return "administer";
    if (name === "system.armorClass.increment") return 0;
    if (name === "system.quantity.value") return 1;
    if (name === "system.physical.quantity") return 1;
    return "";
}

function getEditorStack(stack = []) {
    return Array.isArray(stack) && stack.length ? stack : [{ type: "item" }];
}

function getStackFrame(model = {}) {
    return getEditorStack(model.editorStack).at(-1) ?? { type: "item" };
}

function getIndexedEntries(form = {}, prefix = "") {
    const indices = new Set();
    for (const key of Object.keys(form)) {
        const match = key.match(new RegExp(`^${prefix.replaceAll(".", "\\.")}\\.(\\d+)\\.`));
        if (match) indices.add(Number(match[1]));
    }
    return [...indices].sort((a, b) => a - b);
}

function renderGenericOptions(options, selectedValue, escapeHTML) {
    return options.map((option) => {
        const selected = String(option) === String(selectedValue) ? " selected" : "";
        return `<option value="${escapeHTML(option)}"${selected}>${escapeHTML(option)}</option>`;
    }).join("");
}

function renderOption(value, selectedValue, escapeHTML) {
    const optionValue = typeof value === "object" && value !== null ? value.value : value;
    const optionLabel = typeof value === "object" && value !== null ? value.label : labelForType(value);
    const selected = String(optionValue) === String(selectedValue) ? " selected" : "";
    return `<option value="${escapeHTML(optionValue)}"${selected}>${escapeHTML(optionLabel)}</option>`;
}

function renderTypeOptions(types, selectedType, escapeHTML, { includeAll = false } = {}) {
    const availableTypes = [...new Set(types.map((type) => String(type ?? "item")).filter(Boolean))].sort();
    const options = includeAll ? [`<option value="">All types</option>`] : [];
    return [
        ...options,
        ...availableTypes.map((type) => renderOption(type, selectedType, escapeHTML))
    ].join("");
}

function renderEditField(field, form, escapeHTML) {
    const value = getFieldValue(form, field.name);
    if (field.type === "select") {
        return `
            <label class="totc-v2-codex-panel__field">
                <span>${escapeHTML(field.label)}</span>
                <select name="${escapeHTML(field.name)}">
                    ${field.options.map((option) => renderOption(option, value, escapeHTML)).join("")}
                </select>
            </label>`;
    }

    const min = Number.isFinite(field.min) ? ` min="${field.min}"` : "";
    return `
        <label class="totc-v2-codex-panel__field">
            <span>${escapeHTML(field.label)}</span>
            <input type="${field.type}" name="${escapeHTML(field.name)}" value="${escapeHTML(value)}"${min}>
        </label>`;
}

export function buildCodexPanelModel({
    items = [],
    searchQuery = "",
    typeFilter = "",
    state = {},
    loadingState = null,
    isGM = false
} = {}) {
    const query = String(searchQuery ?? "").trim().toLowerCase();
    const selectedTypeFilter = String(typeFilter ?? "").trim().toLowerCase();
    const allEntries = Array.isArray(items) ? items : [];

    let entries = allEntries;
    if (query) entries = entries.filter((entry) => String(entry.name ?? "").toLowerCase().includes(query));
    if (selectedTypeFilter) entries = entries.filter((entry) => String(entry.type ?? "item") === selectedTypeFilter);

    const selectedUuid = String(state.selectedUuid ?? "").trim();
    const selectedEntry = allEntries.find((entry) => String(entry.uuid ?? "") === selectedUuid) ?? null;
    const mode = ["create", "edit"].includes(state.mode) ? state.mode : "view";
    const editType = normalizeType(state.form?.type ?? selectedEntry?.type);
    const isFiltered = Boolean(query || selectedTypeFilter);
    const isLoading = !loadingState && !allEntries.length;

    let emptyMessage = "No items found.";
    if (isFiltered && !entries.length && allEntries.length) emptyMessage = "No items match the current filter.";
    else if (!allEntries.length && loadingState) emptyMessage = `Codex data unavailable: ${loadingState}`;
    else if (!allEntries.length) emptyMessage = "Loading Codex...";

    return {
        entries,
        allEntries,
        availableTypes: [...new Set([...allEntries.map((entry) => String(entry.type ?? "item")), ...CODEX_ITEM_TYPES])],
        searchQuery,
        typeFilter,
        selectedEntry,
        selectedUuid,
        mode,
        editType,
        form: state.form ?? {},
        editorStack: getEditorStack(state.editorStack),
        isGM: Boolean(isGM),
        isFiltered,
        isLoading,
        emptyMessage
    };
}

export function renderCodexPanel(model = {}, { escapeHTML = (value) => String(value ?? "") } = {}) {
    const typeOptions = renderTypeOptions(model.availableTypes ?? CODEX_ITEM_TYPES, model.typeFilter ?? "", escapeHTML, { includeAll: true });
    const addButton = model.isGM
        ? `<button type="button" class="totc-v2-codex-panel__add" data-action="codex-add-item">Add Item</button>`
        : "";

    return `
        <section class="totc-v2-codex-panel">
            <div class="totc-v2-codex-panel__controls">
                <label class="totc-v2-codex-panel__search">
                    <span>Search</span>
                    <input type="search" data-action="codex-search" value="${escapeHTML(model.searchQuery ?? "")}" placeholder="Filter by name">
                </label>
                <label class="totc-v2-codex-panel__type-filter">
                    <span>Type</span>
                    <select data-action="codex-type-filter">${typeOptions}</select>
                </label>
                ${addButton}
            </div>
            <div class="totc-v2-codex-panel__summary">
                ${(model.allEntries ?? []).length} item${(model.allEntries ?? []).length === 1 ? "" : "s"} available
                ${model.isFiltered && (model.allEntries ?? []).length ? ` - ${(model.entries ?? []).length} shown` : ""}
            </div>
            <div class="totc-v2-codex-panel__body">
                <div class="totc-v2-codex-panel__list" role="list">
                    ${renderCodexEntries(model, escapeHTML)}
                </div>
                ${renderCodexDetail(model, escapeHTML)}
            </div>
        </section>`;
}

function renderCodexEntries(model, escapeHTML) {
    if (!(model.entries ?? []).length) {
        return `<div class="totc-v2-codex-panel__empty${model.isLoading ? " is-loading" : ""}">${escapeHTML(model.emptyMessage)}</div>`;
    }

    return model.entries.map((entry) => {
        const selected = String(entry.uuid ?? "") === String(model.selectedUuid ?? "");
        return `
            <article class="totc-v2-codex-panel__entry${selected ? " is-selected" : ""}" role="listitem" draggable="true" data-action="codex-select-item" data-codex-item-draggable="true" data-entry-uuid="${escapeHTML(entry.uuid ?? "")}">
                <img class="totc-v2-codex-panel__entry-img" src="${escapeHTML(entry.img || DEFAULT_ITEM_ICON)}" alt="">
                <div class="totc-v2-codex-panel__entry-main">
                    <div class="totc-v2-codex-panel__entry-name">${escapeHTML(entry.name)}</div>
                    <div class="totc-v2-codex-panel__entry-pack">${escapeHTML(entry.type ?? "item")} · ${escapeHTML(entry.packLabel)}</div>
                    ${entry.description ? `<div class="totc-v2-codex-panel__entry-description">${escapeHTML(entry.description)}</div>` : ""}
                </div>
            </article>`;
    }).join("");
}

function renderCodexDetail(model, escapeHTML) {
    if (model.mode === "create" || model.mode === "edit") {
        return renderCodexEditor(model, escapeHTML);
    }

    const entry = model.selectedEntry;
    if (!entry) {
        return `<section class="totc-v2-codex-panel__detail"><div class="totc-v2-codex-panel__detail-empty">Select an item to inspect its details.</div></section>`;
    }

    const editButton = model.isGM
        ? `<button type="button" class="totc-v2-codex-panel__detail-action" data-action="codex-edit-item" data-entry-uuid="${escapeHTML(entry.uuid ?? "")}">Edit</button>`
        : "";

    return `
        <section class="totc-v2-codex-panel__detail">
            <div class="totc-v2-codex-panel__detail-header">
                <img class="totc-v2-codex-panel__detail-img" src="${escapeHTML(entry.img || DEFAULT_ITEM_ICON)}" alt="">
                <div class="totc-v2-codex-panel__detail-title">
                    <h3>${escapeHTML(entry.name)}</h3>
                    <p>${escapeHTML(labelForType(entry.type))} - ${escapeHTML(entry.packLabel)}</p>
                </div>
                ${editButton}
            </div>
            <p class="totc-v2-codex-panel__detail-description">${escapeHTML(entry.description || "No description available.")}</p>
        </section>`;
}

function renderCodexEditor(model, escapeHTML) {
    const form = model.form ?? {};
    const editorTitle = model.mode === "create" ? "New Codex Item" : "Edit Codex Item";
    const frame = getStackFrame(model);
    const panelTitle = frame.type === "action" ? "Edit Action" : frame.type === "effect" ? "Edit Effect" : editorTitle;

    if (frame.type === "action") return renderActionEditor(model, frame, panelTitle, escapeHTML);
    if (frame.type === "effect") return renderEffectEditor(model, frame, panelTitle, escapeHTML);

    const typeOptions = renderTypeOptions(CODEX_ITEM_TYPES, model.editType, escapeHTML);
    const typeControl = model.mode === "create"
        ? `
            <label class="totc-v2-codex-panel__field">
                <span>Type</span>
                <select name="type" data-action="codex-edit-type">${typeOptions}</select>
            </label>`
        : `
            <label class="totc-v2-codex-panel__field">
                <span>Type</span>
                <input type="text" value="${escapeHTML(labelForType(model.editType))}" readonly>
                <input type="hidden" name="type" value="${escapeHTML(model.editType)}">
            </label>`;
    const fields = (TYPE_FIELDS[model.editType] ?? TYPE_FIELDS.item)
        .map((field) => renderEditField(field, form, escapeHTML))
        .join("");

    return `
        <section class="totc-v2-codex-panel__detail">
            <form class="totc-v2-codex-panel__editor" data-action="codex-save-item">
                <div class="totc-v2-codex-panel__editor-header">
                    <h3>${escapeHTML(editorTitle)}</h3>
                    <button type="submit" class="totc-v2-codex-panel__detail-action totc-v2-codex-panel__detail-action--primary">Save Item</button>
                </div>
                ${renderEditorBreadcrumbs(model, escapeHTML)}
                ${typeControl}
                <label class="totc-v2-codex-panel__field">
                    <span>Name</span>
                    <input type="text" name="name" value="${escapeHTML(form.name ?? "")}" placeholder="Unnamed Item">
                </label>
                <label class="totc-v2-codex-panel__field">
                    <span>Image</span>
                    <input type="text" name="img" value="${escapeHTML(form.img ?? DEFAULT_ITEM_ICON)}">
                </label>
                <label class="totc-v2-codex-panel__field totc-v2-codex-panel__field--wide">
                    <span>Description</span>
                    <textarea name="system.description" rows="5">${escapeHTML(form["system.description"] ?? "")}</textarea>
                </label>
                <div class="totc-v2-codex-panel__type-fields">
                    ${fields}
                </div>
                ${model.editType === "effect" ? "" : renderActionList(form, escapeHTML)}
            </form>
        </section>`;
}

function renderEditorBreadcrumbs(model, escapeHTML) {
    const stack = getEditorStack(model.editorStack);
    if (stack.length <= 1) return "";
    const crumbs = stack.map((frame, index) => {
        const label = frame.type === "action"
            ? `Action ${Number(frame.actionIndex ?? 0) + 1}`
            : frame.type === "effect"
                ? `Effect ${Number(frame.effectIndex ?? 0) + 1}`
                : "Item";
        return index === stack.length - 1
            ? `<span>${escapeHTML(label)}</span>`
            : `<button type="button" data-action="codex-editor-stack-pop" data-stack-depth="${index + 1}">${escapeHTML(label)}</button>`;
    }).join("<span>/</span>");
    return `<nav class="totc-v2-codex-panel__breadcrumbs">${crumbs}</nav>`;
}

function renderActionList(form, escapeHTML) {
    const indices = getIndexedEntries(form, "system.actions.variants");
    const rows = indices.map((index) => {
        const prefix = `system.actions.variants.${index}`;
        const label = getFieldValue(form, `${prefix}.label`) || `Action ${index + 1}`;
        const type = getFieldValue(form, `${prefix}.type`) || "utility";
        return `
            <div class="totc-v2-codex-panel__nested-row">
                <span><strong>${escapeHTML(label)}</strong> ${escapeHTML(type)}</span>
                <button type="button" data-action="codex-edit-action" data-action-index="${index}">Edit</button>
            </div>`;
    }).join("");

    return `
        <section class="totc-v2-codex-panel__nested">
            <div class="totc-v2-codex-panel__nested-header">
                <h4>Actions</h4>
                <button type="button" data-action="codex-add-action">Add Action</button>
            </div>
            ${rows || `<p class="totc-v2-codex-panel__nested-empty">No actions yet.</p>`}
        </section>`;
}

function renderActionEditor(model, frame, title, escapeHTML) {
    const form = model.form ?? {};
    const index = Number(frame.actionIndex ?? 0);
    const prefix = `system.actions.variants.${index}`;
    return `
        <section class="totc-v2-codex-panel__detail">
            <form class="totc-v2-codex-panel__editor" data-action="codex-save-item">
                <div class="totc-v2-codex-panel__editor-header">
                    <h3>${escapeHTML(title)}</h3>
                    <button type="submit" class="totc-v2-codex-panel__detail-action totc-v2-codex-panel__detail-action--primary">Save Item</button>
                </div>
                ${renderEditorBreadcrumbs(model, escapeHTML)}
                ${renderEditField({ name: `${prefix}.id`, label: "Action ID", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.label`, label: "Label", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.type`, label: "Type", type: "select", options: ACTION_TYPE_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.apCost`, label: "AP Cost", type: "number", min: 1 }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.rangeType`, label: "Range", type: "select", options: RANGE_TYPE_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.targetingRangeFeet`, label: "Range Feet", type: "number", min: 0 }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.recapFormat`, label: "Narrative Format", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.notes`, label: "Notes", type: "text" }, form, escapeHTML)}
                ${renderEffectList(form, index, escapeHTML)}
            </form>
        </section>`;
}

function renderEffectList(form, actionIndex, escapeHTML) {
    const effectPrefix = `system.actions.variants.${actionIndex}.effects`;
    const indices = getIndexedEntries(form, effectPrefix);
    const rows = indices.map((effectIndex) => {
        const prefix = `${effectPrefix}.${effectIndex}`;
        const label = getFieldValue(form, `${prefix}.label`) || `Effect ${effectIndex + 1}`;
        const target = getFieldValue(form, `${prefix}.target`) || "target";
        return `
            <div class="totc-v2-codex-panel__nested-row">
                <span><strong>${escapeHTML(label)}</strong> ${escapeHTML(target)}</span>
                <button type="button" data-action="codex-edit-effect" data-action-index="${actionIndex}" data-effect-index="${effectIndex}">Edit</button>
            </div>`;
    }).join("");

    return `
        <section class="totc-v2-codex-panel__nested">
            <div class="totc-v2-codex-panel__nested-header">
                <h4>Effects</h4>
                <button type="button" data-action="codex-add-effect" data-action-index="${actionIndex}">Add Effect</button>
            </div>
            ${rows || `<p class="totc-v2-codex-panel__nested-empty">No effects yet.</p>`}
        </section>`;
}

function renderEffectEditor(model, frame, title, escapeHTML) {
    const form = model.form ?? {};
    const actionIndex = Number(frame.actionIndex ?? 0);
    const effectIndex = Number(frame.effectIndex ?? 0);
    const prefix = `system.actions.variants.${actionIndex}.effects.${effectIndex}`;
    return `
        <section class="totc-v2-codex-panel__detail">
            <form class="totc-v2-codex-panel__editor" data-action="codex-save-item">
                <div class="totc-v2-codex-panel__editor-header">
                    <h3>${escapeHTML(title)}</h3>
                    <button type="submit" class="totc-v2-codex-panel__detail-action totc-v2-codex-panel__detail-action--primary">Save Item</button>
                </div>
                ${renderEditorBreadcrumbs(model, escapeHTML)}
                ${renderEditField({ name: `${prefix}.id`, label: "Effect ID", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.label`, label: "Label", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.type`, label: "Type", type: "select", options: EFFECT_TYPE_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.target`, label: "Target", type: "select", options: EFFECT_TARGET_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.timing`, label: "Timing", type: "select", options: EFFECT_TIMING_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.operation`, label: "Operation", type: "select", options: EFFECT_OPERATION_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.path`, label: "Increment Target", type: "select", options: EFFECT_TARGET_PATH_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.value`, label: "Value", type: "number", min: 0 }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.formula`, label: "Formula", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.condition`, label: "Condition", type: "text" }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.duration.rounds`, label: "Duration Rounds", type: "number", min: 0 }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.area.radiusFeet`, label: "Area Radius", type: "number", min: 0 }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.save.ability`, label: "Save Ability", type: "select", options: SAVE_ABILITY_OPTIONS }, form, escapeHTML)}
                ${renderEditField({ name: `${prefix}.save.difficulty`, label: "Save Difficulty", type: "number", min: 0 }, form, escapeHTML)}
                <button type="button" class="totc-v2-codex-panel__detail-action" data-action="codex-editor-stack-pop" data-stack-depth="2">Back to Action</button>
            </form>
        </section>`;
}
