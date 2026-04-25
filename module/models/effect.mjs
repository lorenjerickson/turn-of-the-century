import { TOTC_ABILITY_KEYS, TOTC_SKILL_CONFIG } from "./actor.mjs";

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_EFFECT_DISPOSITIONS = ["beneficial", "detrimental", "mixed", "neutral"];
export const TOTC_EFFECT_CATEGORIES = [
    "physical",
    "mental",
    "sensory",
    "movement",
    "defense",
    "medical",
    "chemical",
    "environmental",
    "morale",
    "experimental"
];
export const TOTC_EFFECT_TARGET_TYPES = [
    "attribute",
    "ability",
    "savingThrow",
    "skill",
    "sense",
    "movement",
    "defense",
    "resource",
    "action",
    "condition",
    "proficiency",
    "custom"
];
export const TOTC_EFFECT_OPERATIONS = ["add", "multiply", "set", "grant", "remove", "override"];
export const TOTC_EFFECT_DURATION_UNITS = ["instant", "round", "minute", "hour", "day", "scene", "untilRemoved", "permanent"];
export const TOTC_EFFECT_SKILL_KEYS = Object.keys(TOTC_SKILL_CONFIG);

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createMechanicalImpactField() {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: "Effect Impact" }),
        targetType: new StringField({
            required: true,
            blank: false,
            choices: TOTC_EFFECT_TARGET_TYPES,
            initial: "ability"
        }),
        target: new StringField({ required: true, blank: false, initial: "str" }),
        path: new StringField({ required: true, blank: true, initial: "" }),
        operation: new StringField({
            required: true,
            blank: false,
            choices: TOTC_EFFECT_OPERATIONS,
            initial: "add"
        }),
        value: new NumberField({ required: true, initial: 0 }),
        formula: new StringField({ required: true, blank: true, initial: "" }),
        condition: new StringField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true })
    });
}

export class EffectDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            name: new StringField({ required: true, blank: false, initial: "New Effect" }),
            description: new HTMLField({ required: true, blank: true }),
            disposition: new StringField({
                required: true,
                blank: false,
                choices: TOTC_EFFECT_DISPOSITIONS,
                initial: "detrimental"
            }),
            category: new StringField({
                required: true,
                blank: false,
                choices: TOTC_EFFECT_CATEGORIES,
                initial: "physical"
            }),
            duration: new SchemaField({
                value: new NumberField({ required: true, min: 0, initial: 1 }),
                unit: new StringField({
                    required: true,
                    blank: false,
                    choices: TOTC_EFFECT_DURATION_UNITS,
                    initial: "hour"
                }),
                rounds: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                startTime: new NumberField({ required: true, min: 0, initial: 0 }),
                expiresOnRest: new BooleanField({ required: true, initial: false })
            }),
            impacts: new ArrayField(createMechanicalImpactField(), { required: true, initial: () => [] }),
            affectedKeys: new SchemaField({
                abilities: new ArrayField(
                    new StringField({ required: true, blank: false, choices: TOTC_ABILITY_KEYS }),
                    { required: true, initial: () => [] }
                ),
                skills: new ArrayField(
                    new StringField({ required: true, blank: false, choices: TOTC_EFFECT_SKILL_KEYS }),
                    { required: true, initial: () => [] }
                ),
                actions: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
            }),
            removal: new SchemaField({
                removable: new BooleanField({ required: true, initial: true }),
                method: new StringField({ required: true, blank: true, initial: "" }),
                difficulty: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            stacking: new SchemaField({
                stackable: new BooleanField({ required: true, initial: false }),
                maxStacks: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
                stackKey: new StringField({ required: true, blank: true, initial: "" })
            }),
            source: new SchemaField({
                type: new StringField({ required: true, blank: true, initial: "" }),
                itemId: new StringField({ required: true, blank: true, initial: "" }),
                actorId: new StringField({ required: true, blank: true, initial: "" }),
                notes: new HTMLField({ required: true, blank: true })
            })
        };
    }
}
