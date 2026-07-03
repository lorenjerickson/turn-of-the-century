const {
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_ACTION_EFFECT_TYPES = Object.freeze([
    "damage",
    "healing",
    "condition",
    "modifier",
    "resource",
    "movement",
    "custom"
]);

export const TOTC_ACTION_EFFECT_TARGETS = Object.freeze([
    "self",
    "target",
    "area",
    "origin",
    "item",
    "custom"
]);

export const TOTC_ACTION_EFFECT_TIMINGS = Object.freeze([
    "onUse",
    "onHit",
    "onMiss",
    "onComplete",
    "onSaveFail",
    "onSaveSuccess",
    "always"
]);

export const TOTC_ACTION_EFFECT_OPERATIONS = Object.freeze([
    "add",
    "subtract",
    "set",
    "grant",
    "remove",
    "roll",
    "custom"
]);

export function createActionEffectField() {
    return new SchemaField({
        id: new StringField({ required: true, blank: false, initial: "effect" }),
        label: new StringField({ required: true, blank: false, initial: "Effect" }),
        type: new StringField({ required: true, blank: false, choices: TOTC_ACTION_EFFECT_TYPES, initial: "condition" }),
        target: new StringField({ required: true, blank: false, choices: TOTC_ACTION_EFFECT_TARGETS, initial: "target" }),
        timing: new StringField({ required: true, blank: false, choices: TOTC_ACTION_EFFECT_TIMINGS, initial: "onComplete" }),
        operation: new StringField({ required: true, blank: false, choices: TOTC_ACTION_EFFECT_OPERATIONS, initial: "grant" }),
        path: new StringField({ required: true, blank: true, initial: "" }),
        value: new NumberField({ required: true, initial: 0 }),
        formula: new StringField({ required: true, blank: true, initial: "" }),
        condition: new StringField({ required: true, blank: true, initial: "" }),
        duration: new SchemaField({
            rounds: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            text: new StringField({ required: true, blank: true, initial: "" })
        }),
        area: new SchemaField({
            shape: new StringField({ required: true, blank: true, initial: "" }),
            radiusFeet: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        save: new SchemaField({
            required: new BooleanField({ required: true, initial: false }),
            ability: new StringField({ required: true, blank: true, initial: "" }),
            difficulty: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        notes: new HTMLField({ required: true, blank: true })
    });
}
