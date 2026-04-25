import { TOTC_SKILL_CONFIG } from "./actor.mjs";

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_QUIRK_SOURCE_TYPES = ["ethnicity", "feat", "talent", "profession", "other"];
export const TOTC_QUIRK_EFFECT_TARGETS = [
    "attribute",
    "ability",
    "skill",
    "speed",
    "encumbrance",
    "weaponProficiency",
    "armorProficiency"
];
export const TOTC_QUIRK_EFFECT_OPERATIONS = ["add", "multiply", "set", "grant", "remove"];
export const TOTC_QUIRK_SKILL_KEYS = Object.keys(TOTC_SKILL_CONFIG);

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createSourceField() {
    return new SchemaField({
        type: new StringField({
            required: true,
            blank: false,
            choices: TOTC_QUIRK_SOURCE_TYPES,
            initial: "other"
        }),
        itemId: new StringField({ required: true, blank: true, initial: "" }),
        label: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createEffectField() {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: "Quirk Effect" }),
        targetType: new StringField({
            required: true,
            blank: false,
            choices: TOTC_QUIRK_EFFECT_TARGETS,
            initial: "skill"
        }),
        target: new StringField({ required: true, blank: false, initial: "stealth" }),
        operation: new StringField({
            required: true,
            blank: false,
            choices: TOTC_QUIRK_EFFECT_OPERATIONS,
            initial: "add"
        }),
        value: new NumberField({ required: true, initial: 0 }),
        path: new StringField({ required: true, blank: true, initial: "" }),
        condition: new StringField({ required: true, blank: true, initial: "" }),
        appliesWhenEncumbered: new BooleanField({ required: true, initial: false })
    });
}

export class QuirkDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            description: new HTMLField({ required: true, blank: true }),
            source: createSourceField(),
            effects: new ArrayField(createEffectField(), { required: true, initial: () => [] }),
            notes: new HTMLField({ required: true, blank: true })
        };
    }
}
