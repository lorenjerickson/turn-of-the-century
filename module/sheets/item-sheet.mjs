function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
                label: key,
                type: "json",
                value: formatValue(value),
                isJson: true,
                isCheckbox: false
            }];
        }

        if (isPlainObject(value)) return flattenSystemData(value, path);

        return [{
            path,
            label: key,
            type: typeof value === "boolean" ? "checkbox" : "text",
            value,
            isJson: false,
            isCheckbox: typeof value === "boolean"
        }];
    });
}

export class TurnOfTheCenturyItemSheet extends ItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["turn-of-the-century", "sheet", "item"],
            width: 620,
            height: 720,
            resizable: true,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }],
            template: "systems/turn-of-the-century/templates/items/item-sheet.hbs"
        });
    }

    get template() {
        return this.options.template;
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        const systemSource = this.item.system?.toObject?.() ?? foundry.utils.deepClone(this.item.system ?? {});

        context.system = systemSource;
        context.displayName = this.item.displayName ?? this.item.name;
        context.artworkImage = this.item.artworkImage ?? this.item.img;
        context.systemFields = flattenSystemData(systemSource);
        context.hasSystemFields = context.systemFields.length > 0;

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find("[data-action='use-item']").on("click", async (event) => {
            event.preventDefault();
            const result = await this.item.use?.();
            if (!result?.success) ui.notifications.warn(game.i18n.localize("TOTC.Item.UseUnavailable"));
        });
    }

    async _updateObject(event, formData) {
        const updateData = foundry.utils.deepClone(formData);

        for (const [key, value] of Object.entries(formData)) {
            if (!key.startsWith("_json.")) continue;

            const path = key.slice("_json.".length);
            delete updateData[key];

            try {
                updateData[path] = value ? JSON.parse(value) : [];
            } catch (error) {
                ui.notifications.error(game.i18n.format("TOTC.Item.InvalidJson", { path }));
                throw error;
            }
        }

        return this.object.update(updateData);
    }
}
