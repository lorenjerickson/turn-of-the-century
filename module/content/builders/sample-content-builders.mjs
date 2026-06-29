import { tickFragmentsForItemAction } from "../action-tick-fragments.mjs";

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha", "san"];
export const SKILL_ABILITY_MAP = {
    acrobatics: "dex",
    animalHandling: "wis",
    arcana: "int",
    athletics: "str",
    deception: "cha",
    history: "int",
    insight: "wis",
    intimidation: "cha",
    investigation: "int",
    medicine: "wis",
    nature: "int",
    perception: "wis",
    performance: "cha",
    persuasion: "cha",
    religion: "int",
    sleightOfHand: "dex",
    stealth: "dex",
    survival: "wis"
};

export const ABILITY_MINIMUMS_NONE = Object.fromEntries(ABILITY_KEYS.map((ability) => [ability, 0]));

export function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

export function maybeDeepClone(data) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(data);
    return clone(data);
}

export function merge(base, overrides) {
    if (!isObject(overrides)) return clone(base);

    const output = clone(base);
    for (const [key, value] of Object.entries(overrides)) {
        if (isObject(value) && isObject(output[key])) {
            output[key] = merge(output[key], value);
        } else {
            output[key] = clone(value);
        }
    }

    return output;
}

export function html(text) {
    return `<p>${text}</p>`;
}

export function createDefaultSkills() {
    return Object.fromEntries(
        Object.entries(SKILL_ABILITY_MAP).map(([skill, ability]) => [
            skill,
            {
                ability,
                value: 0,
                bonus: 0,
                proficiency: 0,
                passive: 10
            }
        ])
    );
}

export function createBaseActorSystem() {
    return {
        artwork: {
            image: "icons/svg/mystery-man.svg",
            caption: "Cabinet portrait",
            credit: "Core icon set"
        },
        tokenArtwork: {
            image: "icons/svg/mystery-man.svg",
            scale: 1,
            notes: "Default token"
        },
        profile: {
            role: "",
            faction: "",
            summary: "",
            tags: []
        },
        biography: html("A figure of some consequence in the smoke-stained avenues of the modern city."),
        notes: html("Starter actor profile for immediate play."),
        classification: {
            category: "npc",
            species: "Human",
            ancestry: "",
            profession: "",
            size: "med",
            origin: ""
        },
        progression: {
            level: 1,
            proficiencyBonus: 2,
            challenge: "",
            experience: 0
        },
        hero: {
            archetype: "",
            rank: "",
            renown: 0,
            bonds: []
        },
        villain: {
            scheme: "",
            threatTier: 1,
            notoriety: 0,
            lieutenants: []
        },
        pawn: {
            role: "",
            threat: 1,
            disposition: "neutral",
            squad: ""
        },
        movement: {
            walk: 30,
            climb: 10,
            swim: 10,
            fly: 0
        },
        resources: {
            health: { min: 0, value: 12, max: 12, temp: 0, tempmax: 0 },
            grit: { min: 0, value: 2, max: 2, temp: 0, tempmax: 0 }
        },
        abilities: {
            str: { value: 10, bonus: 0, save: 0, proficient: false },
            dex: { value: 10, bonus: 0, save: 0, proficient: false },
            con: { value: 10, bonus: 0, save: 0, proficient: false },
            int: { value: 10, bonus: 0, save: 0, proficient: false },
            wis: { value: 10, bonus: 0, save: 0, proficient: false },
            cha: { value: 10, bonus: 0, save: 0, proficient: false },
            san: { value: 10, bonus: 0, save: 0, proficient: false }
        },
        skills: createDefaultSkills(),
        senses: {
            passivePerception: 10,
            passiveInsight: 10
        },
        defenses: {
            armorClass: 10
        },
        inventory: {
            equipment: {
                head: { label: "Head", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                neck: { label: "Neck", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                torso: { label: "Torso", capacity: 2, quality: "standard", allowedTypes: ["armor", "equipment", "item"], itemIds: [] },
                hands: { label: "Hands", capacity: 2, quality: "standard", allowedTypes: ["weapon", "tool", "equipment"], itemIds: [] },
                handsArmor: { label: "Hand Armor", capacity: 1, quality: "standard", allowedTypes: ["armor"], itemIds: [] },
                legs: { label: "Legs", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                feet: { label: "Feet", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                belt: { label: "Belt", capacity: 4, quality: "standard", allowedTypes: ["weapon", "tool", "equipment", "consumable", "item"], itemIds: [] }
            },
            pack: { itemIds: [], capacity: 20, encumbrance: 0 },
            combat: { readyWeaponIds: [] }
        },
        traits: {
            languages: ["english"],
            immunities: [],
            resistances: [],
            vulnerabilities: []
        }
    };
}

export function createActorEntry(config) {
    return {
        name: config.name,
        type: config.type,
        img: config.img ?? "icons/svg/mystery-man.svg",
        system: merge(createBaseActorSystem(), config.system ?? {})
    };
}

export function createArtwork(image, caption) {
    return {
        image,
        caption,
        credit: "Core icon set"
    };
}

export function createUnlockAction(recapFormat = "{{Owner.name}} uses {{Item.name}} to defeat the lock.") {
    return {
        id: "unlock",
        label: "Unlock",
        type: "utility",
        apCost: 2,
        requiresToHit: false,
        toHitBonus: 0,
        recapFormat,
        tickNarrativeFragments: tickFragmentsForItemAction("", "unlock"),
        notes: html("Unlock an adjacent locked door, chest, hatch, or similar mechanism.")
    };
}

export function createUseItemAction() {
    return {
        id: "useItem",
        label: "Use Item",
        type: "utility",
        apCost: 1,
        requiresToHit: false,
        toHitBonus: 0,
        recapFormat: "{{Owner.name}} uses {{Item.name}}.",
        tickNarrativeFragments: tickFragmentsForItemAction("", "useItem"),
        notes: ""
    };
}

export function createBaseItemLikeSystem() {
    return {
        artwork: createArtwork("icons/svg/item-bag.svg", "Utility item"),
        commonName: "",
        description: html("A practical article of the present age."),
        category: "miscellaneous",
        quality: "standard",
        rarity: "common",
        slot: "belt",
        use: {
            actionCost: 1,
            requiresHands: true,
            consumedOnUse: false,
            skillCheck: {
                skill: "investigation",
                difficulty: 10,
                required: false,
                purpose: html("Provides routine assistance at the Keeper's discretion.")
            }
        },
        actions: {
            defaultActionId: "useItem",
            variants: [
                {
                    id: "useItem",
                    label: "Use Item",
                    type: "utility",
                    apCost: 1,
                    requiresToHit: false,
                    toHitBonus: 0,
                    recapFormat: "{{Owner.name}} uses {{Item.name}}.",
                    tickNarrativeFragments: tickFragmentsForItemAction("", "useItem"),
                    notes: ""
                }
            ]
        },
        effects: [],
        physical: {
            weight: 1,
            bulk: 1,
            quantity: 1,
            unit: "item"
        },
        value: {
            price: 1,
            currency: "pounds"
        },
        properties: {
            tags: [],
            concealable: false,
            fragile: false,
            experimental: false,
            restricted: false
        }
    };
}

export function createItemLikeEntry(type, config) {
    return {
        name: config.name,
        type,
        img: config.img,
        system: merge(createBaseItemLikeSystem(), config.system ?? {})
    };
}

export function createBaseArmorSystem() {
    return {
        artwork: createArtwork("icons/equipment/chest/breastplate-layered-steel.webp", "Protective wear"),
        description: html("A serviceable piece of protective equipment."),
        category: "light",
        quality: "standard",
        rarity: "common",
        slot: "torso",
        armorClass: {
            increment: 1,
            appliesWhenWorn: true
        },
        prerequisites: {
            abilityMinimums: clone(ABILITY_MINIMUMS_NONE),
            requiresTraining: false,
            requiredTrait: "",
            notes: html("No formal training requirement.")
        },
        encumbrance: {
            weight: 8,
            bulk: 1,
            stealthPenalty: 0,
            movementPenalty: 0
        },
        properties: {
            tags: [],
            concealable: false,
            noisy: false,
            experimental: false
        }
    };
}

export function createArmorEntry(config) {
    return {
        name: config.name,
        type: "armor",
        img: config.img ?? "icons/equipment/chest/breastplate-layered-steel.webp",
        system: merge(createBaseArmorSystem(), config.system ?? {})
    };
}

export function createBaseWeaponSystem() {
    return {
        artwork: createArtwork("icons/weapons/swords/sword-guard-steel.webp", "Combat implement"),
        commonName: "",
        description: html("A robust instrument for close or distant violence."),
        classification: "simpleMelee",
        quality: "standard",
        rarity: "common",
        slot: "hands",
        damage: {
            formula: "1d6",
            type: "bludgeoning",
            versatileFormula: "",
            bonus: 0
        },
        handedness: "oneHanded",
        actions: {
            defaultActionId: "weaponAttack",
            variants: [
                {
                    id: "weaponAttack",
                    label: "Attack",
                    type: "attack",
                    apCost: 2,
                    requiresToHit: true,
                    toHitBonus: 0,
                    notes: ""
                }
            ]
        },
        ammunition: {
            required: false,
            type: "",
            capacity: 0,
            loaded: 0,
            consumedPerAttack: 0
        },
        prerequisites: {
            abilityMinimums: clone(ABILITY_MINIMUMS_NONE),
            requiredProficiencies: [],
            notes: html("Commonly understood handling.")
        },
        physical: {
            weight: 2,
            bulk: 1,
            range: {
                normal: 5,
                long: 5
            }
        },
        properties: {
            tags: [],
            concealable: false,
            noisy: false,
            experimental: false
        }
    };
}

export function createWeaponEntry(config) {
    return {
        name: config.name,
        type: "weapon",
        img: config.img ?? "icons/weapons/swords/sword-guard-steel.webp",
        system: merge(createBaseWeaponSystem(), config.system ?? {})
    };
}

export function createBaseConsumableSystem() {
    return {
        artwork: createArtwork("icons/consumables/potions/potion-vial-corked-red.webp", "Medical or chemical dose"),
        commonName: "",
        description: html("Prepared for field use under uncertain conditions."),
        category: "medicine",
        quality: "standard",
        rarity: "common",
        slot: "belt",
        use: {
            method: "administer",
            actionCost: 1,
            consumesCharge: true,
            requiresHands: true
        },
        actions: {
            defaultActionId: "consumeItem",
            variants: [
                {
                    id: "consumeItem",
                    label: "Consume Item",
                    type: "consumable",
                    apCost: 1,
                    requiresToHit: false,
                    toHitBonus: 0,
                    notes: ""
                }
            ]
        },
        quantity: {
            value: 1,
            max: 1,
            unit: "dose"
        },
        timing: {
            onset: "immediate",
            duration: "",
            recoveryInterval: ""
        },
        effects: [],
        sideEffects: [],
        physical: {
            weight: 0.1,
            bulk: 0,
            perishable: false,
            shelfLife: "12 months"
        },
        properties: {
            tags: [],
            addictive: false,
            experimental: false,
            restricted: false
        }
    };
}

export function createConsumableEntry(config) {
    return {
        name: config.name,
        type: "consumable",
        img: config.img ?? "icons/consumables/potions/potion-vial-corked-red.webp",
        system: merge(createBaseConsumableSystem(), config.system ?? {})
    };
}

export function createBaseEffectSystem() {
    return {
        artwork: createArtwork("icons/magic/perception/eye-ringed-glow-angry-small-teal.webp", "Condition marker"),
        name: "",
        description: html("A named condition with mechanical consequence."),
        disposition: "detrimental",
        category: "physical",
        duration: {
            value: 1,
            unit: "hour",
            rounds: 0,
            startTime: 0,
            expiresOnRest: false
        },
        impacts: [],
        affectedKeys: {
            abilities: [],
            skills: [],
            actions: []
        },
        removal: {
            removable: true,
            method: "",
            difficulty: 0
        },
        stacking: {
            stackable: false,
            maxStacks: 1,
            stackKey: ""
        },
        source: {
            type: "",
            itemId: "",
            actorId: "",
            notes: ""
        }
    };
}

export function createEffectEntry(config) {
    const base = createBaseEffectSystem();
    base.name = config.name;

    return {
        name: config.name,
        type: "effect",
        img: config.img ?? "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
        system: merge(base, config.system ?? {})
    };
}

export function createBaseEthnicitySystem() {
    return {
        artwork: createArtwork("icons/commodities/treasure/token-engraved-blue.webp", "Community marker"),
        description: html("A social and linguistic background package."),
        nationalIdentity: "british",
        languages: {
            primary: "english",
            spoken: ["english"],
            literate: ["english"]
        },
        grantedQuirks: [],
        culturalNotes: {
            homeland: "",
            diaspora: "",
            periodContext: ""
        }
    };
}

export function createEthnicityEntry(config) {
    return {
        name: config.name,
        type: "ethnicity",
        img: config.img ?? "icons/commodities/treasure/token-engraved-blue.webp",
        system: merge(createBaseEthnicitySystem(), config.system ?? {})
    };
}

export function defaultExpertiseLevels() {
    return [
        { rank: "unskilled", title: "Unskilled", level: 0, requiredExperience: 0, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "apprentice", title: "Apprentice", level: 1, requiredExperience: 10, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "journeyman", title: "Journeyman", level: 2, requiredExperience: 25, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "master", title: "Master", level: 3, requiredExperience: 50, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "expert", title: "Expert", level: 4, requiredExperience: 100, requiredSkillUses: [], grantedQuirks: [], description: "" }
    ];
}

export function createBaseProfessionSystem() {
    return {
        artwork: createArtwork("icons/tools/scribal/magnifying-glass.webp", "Trade discipline"),
        description: html("A vocational track with layered expertise."),
        category: "professional",
        primarySkills: ["investigation"],
        expertiseLevels: defaultExpertiseLevels(),
        specializations: [],
        grantedQuirks: [],
        advancementNotes: html("Advance after notable field outcomes.")
    };
}

export function createProfessionEntry(config) {
    return {
        name: config.name,
        type: "profession",
        img: config.img ?? "icons/tools/scribal/magnifying-glass.webp",
        system: merge(createBaseProfessionSystem(), config.system ?? {})
    };
}

export function specializationPath(key, name, progression) {
    return {
        key,
        name,
        description: html("A focused branch within the profession's wider discipline."),
        exampleProgression: progression,
        levels: [
            { level: 1, title: "Initiate", requiredExpertiseRank: "apprentice", requiredExperience: 5, requiredSkillUses: [], grantedQuirks: [], description: html("Learns baseline procedures.") },
            { level: 2, title: "Practitioner", requiredExpertiseRank: "journeyman", requiredExperience: 10, requiredSkillUses: [], grantedQuirks: [], description: html("Can operate without direct supervision.") },
            { level: 3, title: "Senior", requiredExpertiseRank: "master", requiredExperience: 15, requiredSkillUses: [], grantedQuirks: [], description: html("Handles high-risk assignments.") },
            { level: 4, title: "Principal", requiredExpertiseRank: "expert", requiredExperience: 20, requiredSkillUses: [], grantedQuirks: [], description: html("Sets standards and trains others.") }
        ]
    };
}

export function createBaseQuirkSystem() {
    return {
        artwork: createArtwork("icons/skills/social/diplomacy-handshake.webp", "Personal edge"),
        description: html("A persistent peculiarity with specific advantages or liabilities."),
        source: {
            type: "other",
            itemId: "",
            label: ""
        },
        effects: [],
        notes: html("Apply when fiction and conditions support it.")
    };
}

export function createQuirkEntry(config) {
    return {
        name: config.name,
        type: "quirk",
        img: config.img ?? "icons/skills/social/diplomacy-handshake.webp",
        system: merge(createBaseQuirkSystem(), config.system ?? {})
    };
}
