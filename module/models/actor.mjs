const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

export const TOTC_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha", "san"];

export const TOTC_SKILL_CONFIG = {
    acrobatics: { ability: "dex" },
    animalHandling: { ability: "wis" },
    arcana: { ability: "int" },
    athletics: { ability: "str" },
    deception: { ability: "cha" },
    history: { ability: "int" },
    insight: { ability: "wis" },
    intimidation: { ability: "cha" },
    investigation: { ability: "int" },
    medicine: { ability: "wis" },
    nature: { ability: "int" },
    perception: { ability: "wis" },
    performance: { ability: "cha" },
    persuasion: { ability: "cha" },
    religion: { ability: "int" },
    sleightOfHand: { ability: "dex" },
    stealth: { ability: "dex" },
    survival: { ability: "wis" }
};

export const TOTC_EQUIPMENT_SLOTS = {
    head: { capacity: 1, allowed: ["armor", "equipment"] },
    neck: { capacity: 1, allowed: ["armor", "equipment"] },
    torso: { capacity: 2, allowed: ["armor", "equipment", "item"] },
    hands: { capacity: 2, allowed: ["armor", "weapon", "tool", "equipment"] },
    legs: { capacity: 1, allowed: ["armor", "equipment"] },
    feet: { capacity: 1, allowed: ["armor", "equipment"] },
    belt: { capacity: 4, allowed: ["weapon", "tool", "equipment", "consumable", "item"] }
};

export const TOTC_EQUIPMENT_SLOT_KEYS = Object.keys(TOTC_EQUIPMENT_SLOTS);
export const TOTC_ARMOR_SLOT_KEYS = Object.entries(TOTC_EQUIPMENT_SLOTS)
    .filter(([, config]) => config.allowed.includes("armor"))
    .map(([slot]) => slot);

function createTrackedResourceField(initialValue) {
    return new SchemaField({
        min: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        value: new NumberField({ required: true, integer: true, min: 0, initial: initialValue }),
        max: new NumberField({ required: true, integer: true, min: 0, initial: initialValue }),
        temp: new NumberField({ required: true, integer: true, initial: 0 }),
        tempmax: new NumberField({ required: true, integer: true, initial: 0 })
    });
}

function createAbilityField(initial = 10) {
    return new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 1, max: 30, initial }),
        bonus: new NumberField({ required: true, integer: true, min: -10, max: 10, initial: 0 }),
        save: new NumberField({ required: true, integer: true, min: -10, max: 20, initial: 0 }),
        proficient: new BooleanField({ required: true, initial: false })
    });
}

function createSkillField(ability) {
    return new SchemaField({
        ability: new StringField({
            required: true,
            blank: false,
            choices: TOTC_ABILITY_KEYS,
            initial: ability
        }),
        value: new NumberField({ required: true, integer: true, min: -10, max: 20, initial: 0 }),
        bonus: new NumberField({ required: true, integer: true, min: -10, max: 20, initial: 0 }),
        proficiency: new NumberField({ required: true, integer: true, min: 0, max: 2, initial: 0 }),
        passive: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
    });
}

function createClassificationField(initialCategory = "npc") {
    return new SchemaField({
        category: new StringField({
            required: true,
            blank: false,
            choices: ["character", "npc", "monster"],
            initial: initialCategory
        }),
        species: new StringField({ required: true, blank: true, initial: "Human" }),
        ancestry: new StringField({ required: true, blank: true, initial: "" }),
        profession: new StringField({ required: true, blank: true, initial: "" }),
        size: new StringField({
            required: true,
            blank: false,
            choices: ["tiny", "sm", "med", "lg", "huge"],
            initial: "med"
        }),
        origin: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        caption: new StringField({ required: true, blank: true, initial: "" }),
        credit: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createTokenArtworkField() {
    return new SchemaField({
        image: new StringField({ required: true, blank: true, initial: "" }),
        scale: new NumberField({ required: true, min: 0.1, initial: 1 }),
        notes: new StringField({ required: true, blank: true, initial: "" })
    });
}

function createProfileField() {
    return new SchemaField({
        role: new StringField({ required: true, blank: true, initial: "" }),
        faction: new StringField({ required: true, blank: true, initial: "" }),
        summary: new StringField({ required: true, blank: true, initial: "" }),
        tags: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
    });
}

function createSlotField({ label, capacity, allowed }) {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: label }),
        capacity: new NumberField({ required: true, integer: true, min: 1, initial: capacity }),
        quality: new StringField({
            required: true,
            blank: false,
            choices: ["poor", "standard", "fine", "exceptional", "masterwork", "experimental"],
            initial: "standard"
        }),
        allowedTypes: new ArrayField(
            new StringField({ required: true, blank: false, choices: ["armor", "consumable", "equipment", "item", "tool", "weapon"] }),
            { required: true, initial: () => [...allowed] }
        ),
        itemIds: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
    });
}

function createEquipmentSlotsField() {
    return new SchemaField({
        head: createSlotField({ label: "Head", capacity: TOTC_EQUIPMENT_SLOTS.head.capacity, allowed: TOTC_EQUIPMENT_SLOTS.head.allowed }),
        neck: createSlotField({ label: "Neck", capacity: TOTC_EQUIPMENT_SLOTS.neck.capacity, allowed: TOTC_EQUIPMENT_SLOTS.neck.allowed }),
        torso: createSlotField({ label: "Torso", capacity: TOTC_EQUIPMENT_SLOTS.torso.capacity, allowed: TOTC_EQUIPMENT_SLOTS.torso.allowed }),
        hands: createSlotField({ label: "Hands", capacity: TOTC_EQUIPMENT_SLOTS.hands.capacity, allowed: TOTC_EQUIPMENT_SLOTS.hands.allowed }),
        legs: createSlotField({ label: "Legs", capacity: TOTC_EQUIPMENT_SLOTS.legs.capacity, allowed: TOTC_EQUIPMENT_SLOTS.legs.allowed }),
        feet: createSlotField({ label: "Feet", capacity: TOTC_EQUIPMENT_SLOTS.feet.capacity, allowed: TOTC_EQUIPMENT_SLOTS.feet.allowed }),
        belt: createSlotField({ label: "Belt", capacity: TOTC_EQUIPMENT_SLOTS.belt.capacity, allowed: TOTC_EQUIPMENT_SLOTS.belt.allowed })
    });
}

function createSkillsField() {
    return new SchemaField(
        Object.fromEntries(
            Object.entries(TOTC_SKILL_CONFIG).map(([key, config]) => [key, createSkillField(config.ability)])
        )
    );
}

class CreatureActorDataModel extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            artwork: createArtworkField(),
            tokenArtwork: createTokenArtworkField(),
            profile: createProfileField(),
            biography: new HTMLField({ required: true, blank: true }),
            notes: new HTMLField({ required: true, blank: true }),
            classification: createClassificationField("npc"),
            progression: new SchemaField({
                level: new NumberField({ required: true, integer: true, min: 0, max: 20, initial: 1 }),
                proficiencyBonus: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 2 }),
                challenge: new StringField({ required: true, blank: true, initial: "" }),
                experience: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            movement: new SchemaField({
                walk: new NumberField({ required: true, integer: true, min: 0, initial: 30 }),
                climb: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                swim: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                fly: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            resources: new SchemaField({
                health: createTrackedResourceField(10),
                grit: createTrackedResourceField(0)
            }),
            abilities: new SchemaField({
                str: createAbilityField(),
                dex: createAbilityField(),
                con: createAbilityField(),
                int: createAbilityField(),
                wis: createAbilityField(),
                cha: createAbilityField(),
                san: createAbilityField(10)
            }),
            skills: createSkillsField(),
            senses: new SchemaField({
                passivePerception: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
                passiveInsight: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
            }),
            defenses: new SchemaField({
                armorClass: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
                initiative: new NumberField({ required: true, integer: true, initial: 0 })
            }),
            inventory: new SchemaField({
                equipment: createEquipmentSlotsField(),
                pack: new SchemaField({
                    itemIds: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                    capacity: new NumberField({ required: true, integer: true, min: 0, initial: 20 }),
                    encumbrance: new NumberField({ required: true, min: 0, initial: 0 })
                }),
                combat: new SchemaField({
                    readyWeaponIds: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
                })
            }),
            traits: new SchemaField({
                languages: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                immunities: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                resistances: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] }),
                vulnerabilities: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
            })
        };
    }
}

export class HeroDataModel extends CreatureActorDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            classification: createClassificationField("character"),
            progression: new SchemaField({
                level: new NumberField({ required: true, integer: true, min: 1, max: 20, initial: 1 }),
                proficiencyBonus: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 2 }),
                challenge: new StringField({ required: true, blank: true, initial: "" }),
                experience: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            hero: new SchemaField({
                archetype: new StringField({ required: true, blank: true, initial: "" }),
                rank: new StringField({ required: true, blank: true, initial: "" }),
                renown: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                bonds: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
            })
        };
    }
}

export class VillainDataModel extends CreatureActorDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            classification: createClassificationField("npc"),
            villain: new SchemaField({
                scheme: new StringField({ required: true, blank: true, initial: "" }),
                threatTier: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 1 }),
                notoriety: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                lieutenants: new ArrayField(new StringField({ required: true, blank: false }), { required: true, initial: () => [] })
            })
        };
    }
}

export class PawnDataModel extends CreatureActorDataModel {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            classification: createClassificationField("monster"),
            progression: new SchemaField({
                level: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 0 }),
                proficiencyBonus: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 1 }),
                challenge: new StringField({ required: true, blank: true, initial: "" }),
                experience: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
            pawn: new SchemaField({
                role: new StringField({ required: true, blank: true, initial: "" }),
                threat: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 1 }),
                disposition: new StringField({ required: true, blank: true, initial: "neutral" }),
                squad: new StringField({ required: true, blank: true, initial: "" })
            })
        };
    }
}
