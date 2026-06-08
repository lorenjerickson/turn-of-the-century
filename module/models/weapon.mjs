import { TOTC_ABILITY_KEYS, TOTC_EQUIPMENT_SLOT_KEYS } from "./actor.mjs";
import { createModifierEntryField } from "./modifier.mjs";

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

function createActionVariantField({ defaultId = "weaponAttack", defaultLabel = "Attack", defaultApCost = 2, defaultToHitBonus = 0 } = {}) {
    return new SchemaField({
        id: new StringField({ required: true, blank: false, initial: defaultId }),
        label: new StringField({ required: true, blank: false, initial: defaultLabel }),
        // Action type: "attack" | "reload" | "utility" | "defense"
        type: new StringField({ required: true, blank: false, initial: "attack" }),
        apCost: new NumberField({ required: true, integer: true, min: 1, initial: defaultApCost }),
        requiresToHit: new BooleanField({ required: true, initial: true }),
        toHitBonus: new NumberField({ required: true, integer: true, initial: defaultToHitBonus }),
        // Ammunition economy
        consumesAmmo: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        requiresAmmo: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        reloadsAmmo: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Which range band this action uses: "melee" | "normal" | "long"
        rangeType: new StringField({ required: true, blank: false, initial: "normal" }),
        // Condition IDs applied on a successful hit (e.g. "stunned", "bleeding", "blinded")
        conditions: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                // Completion phase increment: additional AP slots after action's last AP before effect lands.
        // Bullets = 0 (instantaneous). Thrown items = 1 (travel + landing). Lit fuse = 2+.
        completionPhaseIncrement: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Distance-based CPI override: if > 0, CPI = floor(targetDistance / cpiPerFeet).
        // Arrows: 30 (1 CPI per 30ft). Ballista bolt: 50. 0 = use fixed completionPhaseIncrement.
        cpiPerFeet: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // If true, effect resolves even if the actor is incapacitated (lit fuse, grenade in flight).
        autoResolve: new BooleanField({ required: true, initial: false }),
        // If autoResolve is true, a correctly-timed reaction can cancel the effect before it lands.
        interruptible: new BooleanField({ required: true, initial: true }),
        // If true, this action is declared as a reaction entry in the plan, not a proactive action.
        isReaction: new BooleanField({ required: true, initial: false }),
        // Trigger type for reaction actions: "incomingAttack" | "allyInjured" | "overwatch" | "defuse" | ""
        reactionTriggerType: new StringField({ required: true, blank: true, initial: "" }),
        notes: new HTMLField({ required: true, blank: true })
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
            slot: new StringField({
                required: true,
                blank: false,
                choices: TOTC_EQUIPMENT_SLOT_KEYS,
                initial: "hands"
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
            actions: new SchemaField({
                defaultActionId: new StringField({ required: true, blank: false, initial: "weaponAttack" }),
                variants: new ArrayField(
                    createActionVariantField({ defaultId: "weaponAttack", defaultLabel: "Attack", defaultApCost: 2, defaultToHitBonus: 0 }),
                    {
                        required: true,
                        initial: () => [{
                            id: "weaponAttack",
                            label: "Attack",
                            type: "attack",
                            apCost: 2,
                            requiresToHit: true,
                            toHitBonus: 0,
                            notes: ""
                        }]
                    }
                )
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
            }),
            modifiers: new ArrayField(createModifierEntryField(), { required: true, initial: () => [] })
        };
    }
}
