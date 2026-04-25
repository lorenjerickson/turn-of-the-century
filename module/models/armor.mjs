import { TOTC_ABILITY_KEYS, TOTC_ARMOR_SLOT_KEYS } from "./actor.mjs";

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_ARMOR_CATEGORIES = ["clothing", "light", "medium", "heavy", "natural", "prosthetic"];
export const TOTC_ARMOR_QUALITIES = ["poor", "standard", "fine", "exceptional", "masterwork", "experimental"];
export const TOTC_ARMOR_RARITIES = ["common", "uncommon", "rare", "veryRare", "unique"];

function createAbilityMinimumsField() {
    return new SchemaField(
        Object.fromEntries(
            TOTC_ABILITY_KEYS.map((ability) => [
                ability,
                new NumberField({ required: true, integer: true, min: 0, max: 30, initial: 0 })
            ])
        )
    );
}

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

export class ArmorDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            description: new HTMLField({ required: true, blank: true }),
            category: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ARMOR_CATEGORIES,
                initial: "light"
            }),
            quality: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ARMOR_QUALITIES,
                initial: "standard"
            }),
            rarity: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ARMOR_RARITIES,
                initial: "common"
            }),
            slot: new StringField({
                required: true,
                blank: false,
                choices: TOTC_ARMOR_SLOT_KEYS,
                initial: "torso"
            }),
            armorClass: new SchemaField({
                increment: new NumberField({ required: true, min: 0, initial: 0 }),
                appliesWhenWorn: new BooleanField({ required: true, initial: true })
            }),
            prerequisites: new SchemaField({
                abilityMinimums: createAbilityMinimumsField(),
                requiresTraining: new BooleanField({ required: true, initial: false }),
                requiredTrait: new StringField({ required: true, blank: true, initial: "" }),
                notes: new HTMLField({ required: true, blank: true })
            }),
            encumbrance: new SchemaField({
                weight: new NumberField({ required: true, min: 0, initial: 0 }),
                bulk: new NumberField({ required: true, min: 0, initial: 0 }),
                stealthPenalty: new NumberField({ required: true, integer: true, initial: 0 }),
                movementPenalty: new NumberField({ required: true, integer: true, initial: 0 })
            }),
            properties: new SchemaField({
                tags: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                concealable: new BooleanField({ required: true, initial: false }),
                noisy: new BooleanField({ required: true, initial: false }),
                experimental: new BooleanField({ required: true, initial: false })
            })
        };
    }
}
