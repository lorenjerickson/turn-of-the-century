const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_CONSUMABLE_CATEGORIES = [
    "food",
    "drink",
    "medicine",
    "bandage",
    "tonic",
    "drug",
    "antidote",
    "surgicalSupply",
    "chemical",
    "other"
];
export const TOTC_CONSUMABLE_EFFECT_TYPES = [
    "restoreResource",
    "cureCondition",
    "relieveSymptom",
    "applyModifier",
    "grantResistance",
    "removePenalty",
    "causeCondition",
    "custom"
];
export const TOTC_CONSUMABLE_QUALITIES = ["poor", "standard", "fine", "exceptional", "masterwork", "experimental"];
export const TOTC_CONSUMABLE_RARITIES = ["common", "uncommon", "rare", "veryRare", "unique"];
export const TOTC_CONSUMABLE_USE_METHODS = ["eat", "drink", "apply", "inject", "inhale", "administer", "other"];

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createConsumableEffectField() {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: "Consumable Effect" }),
        type: new StringField({
            required: true,
            blank: false,
            choices: TOTC_CONSUMABLE_EFFECT_TYPES,
            initial: "restoreResource"
        }),
        target: new StringField({ required: true, blank: true, initial: "resources.health" }),
        formula: new StringField({ required: true, blank: true, initial: "" }),
        value: new NumberField({ required: true, initial: 0 }),
        condition: new StringField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true })
    });
}

export class ConsumableDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            commonName: new StringField({ required: true, blank: true, initial: "" }),
            description: new HTMLField({ required: true, blank: true }),
            category: new StringField({
                required: true,
                blank: false,
                choices: TOTC_CONSUMABLE_CATEGORIES,
                initial: "medicine"
            }),
            quality: new StringField({
                required: true,
                blank: false,
                choices: TOTC_CONSUMABLE_QUALITIES,
                initial: "standard"
            }),
            rarity: new StringField({
                required: true,
                blank: false,
                choices: TOTC_CONSUMABLE_RARITIES,
                initial: "common"
            }),
            use: new SchemaField({
                method: new StringField({
                    required: true,
                    blank: false,
                    choices: TOTC_CONSUMABLE_USE_METHODS,
                    initial: "administer"
                }),
                actionCost: new NumberField({ required: true, min: 0, initial: 1 }),
                consumesCharge: new BooleanField({ required: true, initial: true }),
                requiresHands: new BooleanField({ required: true, initial: true })
            }),
            quantity: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
                max: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
                unit: new StringField({ required: true, blank: false, initial: "dose" })
            }),
            timing: new SchemaField({
                onset: new StringField({ required: true, blank: true, initial: "immediate" }),
                duration: new StringField({ required: true, blank: true, initial: "" }),
                recoveryInterval: new StringField({ required: true, blank: true, initial: "" })
            }),
            effects: new ArrayField(createConsumableEffectField(), { required: true, initial: () => [] }),
            sideEffects: new ArrayField(createConsumableEffectField(), { required: true, initial: () => [] }),
            physical: new SchemaField({
                weight: new NumberField({ required: true, min: 0, initial: 0 }),
                bulk: new NumberField({ required: true, min: 0, initial: 0 }),
                perishable: new BooleanField({ required: true, initial: false }),
                shelfLife: new StringField({ required: true, blank: true, initial: "" })
            }),
            properties: new SchemaField({
                tags: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                addictive: new BooleanField({ required: true, initial: false }),
                experimental: new BooleanField({ required: true, initial: false }),
                restricted: new BooleanField({ required: true, initial: false })
            })
        };
    }
}
