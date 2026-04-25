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
        context.profileTags = toArrayInput(systemSource.profile?.tags);
        context.heroBonds = toArrayInput(systemSource.hero?.bonds);
        context.villainLieutenants = toArrayInput(systemSource.villain?.lieutenants);

        return context;
    }

    async _updateObject(event, formData) {
        const updateData = foundry.utils.deepClone(formData);

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
