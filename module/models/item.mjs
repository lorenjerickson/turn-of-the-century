import { TOTC_EQUIPMENT_SLOT_KEYS, TOTC_SKILL_CONFIG } from "./actor.mjs";
import { createModifierEntryField } from "./modifier.mjs";

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_ITEM_CATEGORIES = ["tool", "trinket", "instrument", "document", "clothing", "container", "apparatus", "miscellaneous"];
export const TOTC_ITEM_EFFECT_TARGETS = ["attribute", "ability", "skill", "sense", "movement", "defense", "resource", "action", "custom"];
export const TOTC_ITEM_EFFECT_OPERATIONS = ["add", "multiply", "set", "grant", "remove", "enable"];
export const TOTC_ITEM_QUALITIES = ["poor", "standard", "fine", "exceptional", "masterwork", "experimental"];
export const TOTC_ITEM_RARITIES = ["common", "uncommon", "rare", "veryRare", "unique"];
export const TOTC_ITEM_SKILL_KEYS = Object.keys(TOTC_SKILL_CONFIG);

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createSkillCheckField() {
    return new SchemaField({
        skill: new StringField({
            required: true,
            blank: false,
            choices: TOTC_ITEM_SKILL_KEYS,
            initial: "investigation"
        }),
        difficulty: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        required: new BooleanField({ required: true, initial: false }),
        purpose: new HTMLField({ required: true, blank: true })
    });
}

function createMechanicalEffectField() {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: "Item Effect" }),
        targetType: new StringField({
            required: true,
            blank: false,
            choices: TOTC_ITEM_EFFECT_TARGETS,
            initial: "skill"
        }),
        target: new StringField({ required: true, blank: false, initial: "investigation" }),
        operation: new StringField({
            required: true,
            blank: false,
            choices: TOTC_ITEM_EFFECT_OPERATIONS,
            initial: "add"
        }),
        value: new NumberField({ required: true, initial: 0 }),
        formula: new StringField({ required: true, blank: true, initial: "" }),
        condition: new StringField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true })
    });
}

function createActionVariantField({ defaultId = "useItem", defaultLabel = "Use Item", defaultType = "utility", defaultApCost = 1 } = {}) {
    return new SchemaField({
        id: new StringField({ required: true, blank: false, initial: defaultId }),
        label: new StringField({ required: true, blank: false, initial: defaultLabel }),
        type: new StringField({ required: true, blank: false, initial: defaultType }),
        apCost: new NumberField({ required: true, integer: true, min: 1, initial: defaultApCost }),
        requiresToHit: new BooleanField({ required: true, initial: false }),
        toHitBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        notes: new HTMLField({ required: true, blank: true })
    });
}

export class ItemDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            commonName: new StringField({ required: true, blank: true, initial: "" }),
            description: new HTMLField({ required: true, blank: true }),
            category: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ITEM_CATEGORIES,
                initial: "miscellaneous"
            }),
            quality: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ITEM_QUALITIES,
                initial: "standard"
            }),
            rarity: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ITEM_RARITIES,
                initial: "common"
            }),
            slot: new StringField({
                required: true,
                blank: false,
                choices: TOTC_EQUIPMENT_SLOT_KEYS,
                initial: "belt"
            }),
            use: new SchemaField({
                actionCost: new NumberField({ required: true, min: 0, initial: 1 }),
                requiresHands: new BooleanField({ required: true, initial: true }),
                consumedOnUse: new BooleanField({ required: true, initial: false }),
                skillCheck: createSkillCheckField()
            }),
            actions: new SchemaField({
                defaultActionId: new StringField({ required: true, blank: false, initial: "useItem" }),
                variants: new ArrayField(
                    createActionVariantField({ defaultId: "useItem", defaultLabel: "Use Item", defaultType: "utility", defaultApCost: 1 }),
                    {
                        required: true,
                        initial: () => [{
                            id: "useItem",
                            label: "Use Item",
                            type: "utility",
                            apCost: 1,
                            requiresToHit: false,
                            toHitBonus: 0,
                            notes: ""
                        }]
                    }
                )
            }),
            effects: new ArrayField(createMechanicalEffectField(), { required: true, initial: () => [] }),
            physical: new SchemaField({
                weight: new NumberField({ required: true, min: 0, initial: 0 }),
                bulk: new NumberField({ required: true, min: 0, initial: 0 }),
                quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
                unit: new StringField({ required: true, blank: false, initial: "item" })
            }),
            value: new SchemaField({
                price: new NumberField({ required: true, min: 0, initial: 0 }),
                currency: new StringField({ required: true, blank: false, initial: "pounds" })
            }),
            properties: new SchemaField({
                tags: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                concealable: new BooleanField({ required: true, initial: false }),
                fragile: new BooleanField({ required: true, initial: false }),
                experimental: new BooleanField({ required: true, initial: false }),
                restricted: new BooleanField({ required: true, initial: false })
            }),
            modifiers: new ArrayField(createModifierEntryField(), { required: true, initial: () => [] })
        };
    }
}
