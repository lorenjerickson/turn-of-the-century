import {
    requireItemSheetV2
} from "../foundry-v14-runtime.mjs";

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

const BaseItemSheet = requireItemSheetV2();

/**
 * Converts a dot-separated system field path into a human-readable label.
 * E.g. "system.armorClass.increment" → "Armor Class › Increment"
 */
function formatFieldLabel(path) {
    const cleaned = path.startsWith("system.") ? path.slice("system.".length) : path;
    return cleaned
        .split(".")
        .map((segment) => segment
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (c) => c.toUpperCase())
            .trim()
        )
        .join(" › ");
}

function formatValue(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return value;
}

function flattenSystemData(source, prefix = "system") {
    return Object.entries(source ?? {}).flatMap(([key, value]) => {
        const path = `${prefix}.${key}`;

        if (Array.isArray(value)) {
            return [{
                path,
                label: formatFieldLabel(path),
                type: "json",
                value: formatValue(value),
                isJson: true,
                isCheckbox: false
            }];
        }

        if (isPlainObject(value)) return flattenSystemData(value, path);

        return [{
            path,
            label: formatFieldLabel(path),
            type: typeof value === "boolean" ? "checkbox" : "text",
            value,
            isJson: false,
            isCheckbox: typeof value === "boolean"
        }];
    });
}

export class TurnOfTheCenturyItemSheet extends BaseItemSheet {
    static TABS = {
        primary: {
            navSelector: ".sheet-tabs",
            contentSelector: ".sheet-body",
            initial: "details"
        }
    };

    static get DEFAULT_OPTIONS() {
        return foundry.utils.mergeObject(super.DEFAULT_OPTIONS ?? {}, {
            classes: ["turn-of-the-century", "sheet", "item"],
            position: {
                width: 620,
                height: 720
            },
            window: {
                resizable: true
            },
            template: "systems/turn-of-the-century/templates/items/item-sheet.hbs"
        });
    }

    get template() {
        return this.options.template;
    }

    async _prepareContext(options = {}) {
        const context = await super._prepareContext(options);
        const systemSource = this.item.system?.toObject?.() ?? foundry.utils.deepClone(this.item.system ?? {});

        context.item = this.item;
        context.system = systemSource;
        context.displayName = this.item.displayName ?? this.item.name;
        context.artworkImage = this.item.artworkImage ?? this.item.img;
        context.systemFields = flattenSystemData(systemSource);
        context.hasSystemFields = context.systemFields.length > 0;

        return context;
    }

    async _renderHTML(context) {
        return renderTemplate(this.template, context);
    }

    _replaceHTML(result, content) {
        content.innerHTML = result;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);

        this.element.querySelectorAll("[data-action='use-item']").forEach((element) => element.addEventListener("click", async (event) => {
            event.preventDefault();
            const result = await this.item.use?.();
            if (!result?.success) ui.notifications.warn(game.i18n.localize("TOTC.Item.UseUnavailable"));
        }));

        this.element.querySelectorAll("[data-action='save-item']").forEach((element) => element.addEventListener("click", () => this._syncImageField()));
    }

    _prepareSubmitData(event, form, formData, updateData = {}) {
        this._syncImageField();
        const submitData = super._prepareSubmitData(event, form, formData, updateData);

        for (const [key, value] of Object.entries(submitData)) {
            if (!key.startsWith("_json.")) continue;

            const path = key.slice("_json.".length);
            delete submitData[key];

            try {
                submitData[path] = value ? JSON.parse(value) : [];
            } catch (error) {
                ui.notifications.error(game.i18n.format("TOTC.Item.InvalidJson", { path }));
                throw error;
            }
        }

        return submitData;
    }

    async close(options = {}) {
        if (this.isEditable && this.form) {
            try {
                this._syncImageField();
                await this.submit({ preventClose: true, preventRender: true });
            } catch (error) {
                console.error("[turn-of-the-century] Failed to save item sheet before close.", error);
                return this;
            }
        }

        return super.close(options);
    }

    _syncImageField() {
        if (!this.form) return;

        const imageInput = this.form.querySelector("input[name='img']");
        const imageElement = this.form.querySelector(".profile-img[data-edit='img']");
        const src = imageElement?.getAttribute("src") ?? "";

        if (imageInput && src) imageInput.value = src;
    }
}
