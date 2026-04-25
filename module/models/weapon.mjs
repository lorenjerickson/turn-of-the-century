import { TOTC_ABILITY_KEYS } from "./actor.mjs";

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_WEAPON_CLASSIFICATIONS = [
    "unarmed",
    "simpleMelee",
    "simpleRanged",
    "martialMelee",
    "martialRanged",
    "firearm",
    "explosive",
    "improvised",
    "tool"
];
export const TOTC_WEAPON_DAMAGE_TYPES = [
    "bludgeoning",
    "piercing",
    "slashing",
    "ballistic",
    "fire",
    "acid",
    "poison",
    "electric",
    "explosive",
    "psychological"
];
export const TOTC_WEAPON_HANDEDNESS = ["mainHand", "offHand", "oneHanded", "twoHanded", "versatile", "thrown", "mounted"];
export const TOTC_WEAPON_PROFICIENCY_TYPES = ["simple", "martial", "firearm", "explosive", "improvised", "tool", "special"];
export const TOTC_ITEM_QUALITIES = ["poor", "standard", "fine", "exceptional", "masterwork", "experimental"];
export const TOTC_ITEM_RARITIES = ["common", "uncommon", "rare", "veryRare", "unique"];

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

function createProficiencyRequirementField() {
    return new SchemaField({
        type: new StringField({
            required: true,
            blank: false,
            choices: TOTC_WEAPON_PROFICIENCY_TYPES,
            initial: "simple"
        }),
        key: new StringField({ required: true, blank: true, initial: "" }),
        label: new StringField({ required: true, blank: true, initial: "" })
    });
}

export class WeaponDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            commonName: new StringField({ required: true, blank: true, initial: "" }),
            description: new HTMLField({ required: true, blank: true }),
            classification: new StringField({
                required: true,
                blank: false,
                choices: TOTC_WEAPON_CLASSIFICATIONS,
                initial: "simpleMelee"
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
            damage: new SchemaField({
                formula: new StringField({ required: true, blank: false, initial: "1d4" }),
                type: new StringField({
                    required: true,
                    blank: false,
                    choices: TOTC_WEAPON_DAMAGE_TYPES,
                    initial: "bludgeoning"
                }),
                versatileFormula: new StringField({ required: true, blank: true, initial: "" }),
                bonus: new NumberField({ required: true, integer: true, initial: 0 })
            }),
            handedness: new StringField({
                required: true,
                blank: false,
                choices: TOTC_WEAPON_HANDEDNESS,
                initial: "oneHanded"
            }),
            ammunition: new SchemaField({
                required: new BooleanField({ required: true, initial: false }),
                type: new StringField({ required: true, blank: true, initial: "" }),
                capacity: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                loaded: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                consumedPerAttack: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            prerequisites: new SchemaField({
                abilityMinimums: createAbilityMinimumsField(),
                requiredProficiencies: new ArrayField(createProficiencyRequirementField(), { required: true, initial: () => [] }),
                notes: new HTMLField({ required: true, blank: true })
            }),
            physical: new SchemaField({
                weight: new NumberField({ required: true, min: 0, initial: 0 }),
                bulk: new NumberField({ required: true, min: 0, initial: 0 }),
                range: new SchemaField({
                    normal: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
                    long: new NumberField({ required: true, integer: true, min: 0, initial: 5 })
                })
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
