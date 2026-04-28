const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha", "san"];
const SKILL_ABILITY_MAP = {
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

const ABILITY_MINIMUMS_NONE = Object.fromEntries(ABILITY_KEYS.map((ability) => [ability, 0]));

function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
}

function merge(base, overrides) {
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

function html(text) {
    return `<p>${text}</p>`;
}

function createDefaultSkills() {
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

function createBaseActorSystem() {
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
            armorClass: 10,
            initiative: 0
        },
        inventory: {
            equipment: {
                head: { label: "Head", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                neck: { label: "Neck", capacity: 1, quality: "standard", allowedTypes: ["armor", "equipment"], itemIds: [] },
                torso: { label: "Torso", capacity: 2, quality: "standard", allowedTypes: ["armor", "equipment", "item"], itemIds: [] },
                hands: { label: "Hands", capacity: 2, quality: "standard", allowedTypes: ["armor", "weapon", "tool", "equipment"], itemIds: [] },
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

function createActorEntry(config) {
    return {
        name: config.name,
        type: config.type,
        img: config.img ?? "icons/svg/mystery-man.svg",
        system: merge(createBaseActorSystem(), config.system ?? {})
    };
}

function createArtwork(image, caption) {
    return {
        image,
        caption,
        credit: "Core icon set"
    };
}

function createBaseItemLikeSystem() {
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

function createItemLikeEntry(type, config) {
    return {
        name: config.name,
        type,
        img: config.img,
        system: merge(createBaseItemLikeSystem(), config.system ?? {})
    };
}

function createBaseArmorSystem() {
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

function createArmorEntry(config) {
    return {
        name: config.name,
        type: "armor",
        img: config.img ?? "icons/equipment/chest/breastplate-layered-steel.webp",
        system: merge(createBaseArmorSystem(), config.system ?? {})
    };
}

function createBaseWeaponSystem() {
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

function createWeaponEntry(config) {
    return {
        name: config.name,
        type: "weapon",
        img: config.img ?? "icons/weapons/swords/sword-guard-steel.webp",
        system: merge(createBaseWeaponSystem(), config.system ?? {})
    };
}

function createBaseConsumableSystem() {
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

function createConsumableEntry(config) {
    return {
        name: config.name,
        type: "consumable",
        img: config.img ?? "icons/consumables/potions/potion-vial-corked-red.webp",
        system: merge(createBaseConsumableSystem(), config.system ?? {})
    };
}

function createBaseEffectSystem() {
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

function createEffectEntry(config) {
    const base = createBaseEffectSystem();
    base.name = config.name;

    return {
        name: config.name,
        type: "effect",
        img: config.img ?? "icons/magic/perception/eye-ringed-glow-angry-small-teal.webp",
        system: merge(base, config.system ?? {})
    };
}

function createBaseEthnicitySystem() {
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

function createEthnicityEntry(config) {
    return {
        name: config.name,
        type: "ethnicity",
        img: config.img ?? "icons/commodities/treasure/token-engraved-blue.webp",
        system: merge(createBaseEthnicitySystem(), config.system ?? {})
    };
}

function defaultExpertiseLevels() {
    return [
        { rank: "unskilled", title: "Unskilled", level: 0, requiredExperience: 0, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "apprentice", title: "Apprentice", level: 1, requiredExperience: 10, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "journeyman", title: "Journeyman", level: 2, requiredExperience: 25, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "master", title: "Master", level: 3, requiredExperience: 50, requiredSkillUses: [], grantedQuirks: [], description: "" },
        { rank: "expert", title: "Expert", level: 4, requiredExperience: 100, requiredSkillUses: [], grantedQuirks: [], description: "" }
    ];
}

function createBaseProfessionSystem() {
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

function createProfessionEntry(config) {
    return {
        name: config.name,
        type: "profession",
        img: config.img ?? "icons/tools/scribal/magnifying-glass.webp",
        system: merge(createBaseProfessionSystem(), config.system ?? {})
    };
}

function createBaseQuirkSystem() {
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

function createQuirkEntry(config) {
    return {
        name: config.name,
        type: "quirk",
        img: config.img ?? "icons/skills/social/diplomacy-handshake.webp",
        system: merge(createBaseQuirkSystem(), config.system ?? {})
    };
}

const ACTOR_CONFIGS = [
    {
        name: "Inspector Eleanor Thorne",
        type: "hero",
        system: {
            biography: html("An exacting investigator whose notebooks are as feared in court as in criminal circles."),
            classification: { category: "character", profession: "Inspector", origin: "London" },
            abilities: { int: { value: 13, bonus: 1 }, wis: { value: 12, bonus: 1 } },
            skills: {
                investigation: { ability: "int", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                insight: { ability: "wis", value: 2, bonus: 1, proficiency: 1, passive: 12 },
                perception: { ability: "wis", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "fine", capacity: 5 } } },
            traits: { languages: ["english", "french"] }
        }
    },
    {
        name: "Sergeant Amos Pike",
        type: "hero",
        system: {
            biography: html("A veteran constable who believes every alley remembers the men who bled there."),
            classification: { category: "character", profession: "Constable", origin: "Manchester" },
            abilities: { str: { value: 13, bonus: 1 }, con: { value: 12, bonus: 1 } },
            defenses: { armorClass: 12, initiative: 1 },
            skills: { athletics: { ability: "str", value: 2, bonus: 1, proficiency: 1, passive: 12 } },
            inventory: { equipment: { belt: { quality: "poor", capacity: 2 } } },
            traits: { languages: ["english"] }
        }
    },
    {
        name: "Lady Miriam Foxe",
        type: "hero",
        system: {
            biography: html("A society patron with a private archive of forbidden correspondence and ruined pedigrees."),
            classification: { category: "character", profession: "Antiquarian", origin: "Bath" },
            abilities: { cha: { value: 13, bonus: 1 }, int: { value: 12, bonus: 1 } },
            skills: {
                history: { ability: "int", value: 2, bonus: 1, proficiency: 1, passive: 12 },
                persuasion: { ability: "cha", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "exceptional", capacity: 6 } } },
            traits: { languages: ["english", "latin"] }
        }
    },
    {
        name: "Doctor Mordecai Vale",
        type: "villain",
        system: {
            biography: html("A surgeon of singular talent who maintains that conscience is merely an inherited superstition."),
            classification: { category: "npc", profession: "Occult Surgeon", origin: "Leipzig" },
            abilities: { int: { value: 14, bonus: 2 }, san: { value: 12, bonus: 1 } },
            skills: {
                medicine: { ability: "wis", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                arcana: { ability: "int", value: 3, bonus: 2, proficiency: 1, passive: 13 }
            },
            inventory: { equipment: { belt: { quality: "masterwork", capacity: 7 } } }
        }
    },
    {
        name: "Magistrate Harlan Crowthorne",
        type: "villain",
        system: {
            biography: html("A polished jurist who shapes verdicts to protect investors in dubious industrial concerns."),
            classification: { category: "npc", profession: "Magistrate", origin: "York" },
            abilities: { cha: { value: 14, bonus: 2 }, wis: { value: 12, bonus: 1 } },
            skills: {
                deception: { ability: "cha", value: 3, bonus: 2, proficiency: 1, passive: 13 },
                persuasion: { ability: "cha", value: 3, bonus: 2, proficiency: 1, passive: 13 }
            },
            inventory: { equipment: { belt: { quality: "standard", capacity: 4 } } }
        }
    },
    {
        name: "Foreman Silas Grigg",
        type: "villain",
        system: {
            biography: html("Master of a clandestine refinery where laborers vanish and invoices are always immaculate."),
            classification: { category: "npc", profession: "Factory Foreman", origin: "Birmingham" },
            abilities: { str: { value: 12, bonus: 1 }, con: { value: 13, bonus: 1 } },
            skills: {
                intimidation: { ability: "cha", value: 2, bonus: 0, proficiency: 2, passive: 12 },
                athletics: { ability: "str", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "experimental", capacity: 8 } } }
        }
    },
    {
        name: "Brassbound Hound",
        type: "pawn",
        system: {
            biography: html("A clockwork pursuit beast that hunts by heat, blood-trace, and telegraph whistle."),
            classification: { category: "monster", species: "Construct", profession: "Pursuit Unit", origin: "Dockside Workshops" },
            movement: { walk: 40, climb: 20, swim: 0, fly: 0 },
            abilities: { str: { value: 12, bonus: 1 }, dex: { value: 12, bonus: 1 }, san: { value: 6, bonus: -2 } },
            defenses: { armorClass: 13, initiative: 2 },
            traits: { languages: [], immunities: ["fear"], resistances: ["poison"], vulnerabilities: ["electric"] }
        }
    },
    {
        name: "Smog Wretch",
        type: "pawn",
        system: {
            biography: html("A coughing scavenger warped by prolonged refinery exposure and hunger."),
            classification: { category: "monster", species: "Mutated Human", profession: "Scavenger", origin: "Riverside Slums" },
            abilities: { dex: { value: 12, bonus: 1 }, con: { value: 12, bonus: 1 }, san: { value: 8, bonus: -1 } },
            skills: { stealth: { ability: "dex", value: 2, bonus: 1, proficiency: 1, passive: 12 } },
            traits: { languages: ["english"], resistances: ["acid"], vulnerabilities: ["fire"] }
        }
    },
    {
        name: "Catacomb Leech-Swarm",
        type: "pawn",
        system: {
            biography: html("A writhing mass of pale feeders disturbed by boiler heat and crypt runoff."),
            classification: { category: "monster", species: "Vermin Swarm", profession: "Swarm", origin: "Lower Catacombs" },
            movement: { walk: 20, climb: 20, swim: 10, fly: 0 },
            abilities: { str: { value: 8, bonus: -1 }, dex: { value: 14, bonus: 2 }, con: { value: 11, bonus: 0 } },
            defenses: { armorClass: 12, initiative: 2 },
            traits: { languages: [], immunities: ["charm"], resistances: ["slashing"], vulnerabilities: ["fire"] }
        }
    },
    {
        name: "Railway Lamp Runner",
        type: "pawn",
        system: {
            biography: html("A depot runner who knows every catwalk, signal stair, and emergency hatch by feel."),
            classification: { category: "npc", species: "Human", profession: "Railway Runner", origin: "Kingscross Freight Yard" },
            abilities: { dex: { value: 12, bonus: 1 }, wis: { value: 11, bonus: 0 }, con: { value: 11, bonus: 0 } },
            skills: {
                athletics: { ability: "str", value: 1, bonus: 0, proficiency: 1, passive: 11 },
                perception: { ability: "wis", value: 2, bonus: 0, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "poor", capacity: 2 } } },
            traits: { languages: ["english"], immunities: [], resistances: [], vulnerabilities: [] }
        }
    },
    {
        name: "Tanglefoot Cutpurse",
        type: "pawn",
        system: {
            biography: html("A nimble alley operative with hidden tools and an encyclopedic memory for routes."),
            classification: { category: "npc", species: "Human", profession: "Cutpurse", origin: "Rookery Lanes" },
            abilities: { dex: { value: 13, bonus: 1 }, cha: { value: 11, bonus: 0 }, int: { value: 11, bonus: 0 } },
            skills: {
                stealth: { ability: "dex", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                sleightOfHand: { ability: "dex", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "fine", capacity: 5 } } },
            traits: { languages: ["english"], immunities: [], resistances: [], vulnerabilities: [] }
        }
    },
    {
        name: "Catacomb Survey Porter",
        type: "pawn",
        system: {
            biography: html("A burdened guide carrying chalk, rope, and remedies through unstable underworks."),
            classification: { category: "npc", species: "Human", profession: "Survey Porter", origin: "South Tunnel Ward" },
            abilities: { str: { value: 12, bonus: 1 }, con: { value: 12, bonus: 1 }, wis: { value: 10, bonus: 0 } },
            skills: {
                athletics: { ability: "str", value: 2, bonus: 1, proficiency: 1, passive: 12 },
                survival: { ability: "wis", value: 2, bonus: 0, proficiency: 2, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "exceptional", capacity: 6 } } },
            traits: { languages: ["english"], immunities: [], resistances: [], vulnerabilities: [] }
        }
    }
];

const ARMOR_CONFIGS = [
    {
        name: "Warden's Lamellar Coat",
        system: {
            description: html("Oilskin over articulated steel scales, favored by constables on night patrol."),
            category: "medium",
            quality: "fine",
            rarity: "uncommon",
            armorClass: { increment: 2 },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, str: 10 } },
            encumbrance: { weight: 12, bulk: 2, stealthPenalty: -1 },
            properties: { tags: ["city-issue", "layered"] }
        }
    },
    {
        name: "Boiler-Forged Cuirass",
        system: {
            description: html("Heavy riveted plating for furnace crews and industrial marshals."),
            category: "heavy",
            quality: "standard",
            armorClass: { increment: 3 },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, str: 12 }, requiresTraining: true },
            encumbrance: { weight: 18, bulk: 3, stealthPenalty: -2, movementPenalty: -5 },
            properties: { tags: ["industrial", "plated"], noisy: true }
        }
    },
    {
        name: "Mourning Silk Vest",
        system: {
            description: html("Black tailored silk lined with discreet mesh and whale-bone ribs."),
            category: "clothing",
            quality: "exceptional",
            rarity: "rare",
            armorClass: { increment: 1 },
            encumbrance: { weight: 3, bulk: 0 },
            properties: { tags: ["formal", "concealed"], concealable: true }
        }
    },
    {
        name: "Pneumatic Bracer Rig",
        system: {
            description: html("A forearm assembly of brass cylinders that absorbs impact at the wrist and elbow."),
            category: "prosthetic",
            quality: "experimental",
            rarity: "veryRare",
            slot: "hands",
            armorClass: { increment: 1 },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, dex: 11 }, requiresTraining: true },
            encumbrance: { weight: 5, bulk: 1 },
            properties: { tags: ["prosthetic", "pneumatic"], experimental: true, noisy: true }
        }
    },
    {
        name: "Dockside Leather Jerkin",
        system: {
            description: html("Salt-stiffened leather with extra stitching over ribs and shoulders."),
            category: "light",
            armorClass: { increment: 1 },
            encumbrance: { weight: 6, bulk: 1 },
            properties: { tags: ["dockwork"] }
        }
    },
    {
        name: "Asylum Keeper Helm",
        system: {
            description: html("A narrow steel cap with brow guard and leather ear braces."),
            category: "medium",
            quality: "fine",
            slot: "head",
            armorClass: { increment: 1 },
            encumbrance: { weight: 4, bulk: 1, stealthPenalty: -1 },
            properties: { tags: ["helmet", "institutional"], noisy: true }
        }
    }
];

const WEAPON_CONFIGS = [
    {
        name: "Service Revolver",
        img: "icons/weapons/guns/gun-pistol-brass.webp",
        system: {
            commonName: "Revolver",
            description: html("A six-shot sidearm trusted by inspectors and discreet bodyguards."),
            classification: "firearm",
            damage: { formula: "1d8", type: "ballistic" },
            handedness: "oneHanded",
            actions: {
                defaultActionId: "pistolAimedShot",
                variants: [
                    {
                        id: "pistolQuickShot",
                        label: "Quick Shot",
                        type: "attack",
                        apCost: 2,
                        requiresToHit: true,
                        toHitBonus: -2,
                        notes: "Fast draw and fire with reduced accuracy."
                    },
                    {
                        id: "pistolAimedShot",
                        label: "Aim and Fire",
                        type: "attack",
                        apCost: 3,
                        requiresToHit: true,
                        toHitBonus: 0,
                        notes: "Deliberate shot with full accuracy."
                    }
                ]
            },
            ammunition: { required: true, type: "revolver-round", capacity: 6, loaded: 6, consumedPerAttack: 1 },
            prerequisites: {
                abilityMinimums: { ...ABILITY_MINIMUMS_NONE, dex: 10 },
                requiredProficiencies: [{ type: "firearm", key: "", label: "Firearm Training" }]
            },
            physical: { weight: 2.5, bulk: 1, range: { normal: 40, long: 120 } },
            properties: { tags: ["sidearm", "firearm"], concealable: true, noisy: true }
        }
    },
    {
        name: "Trench Truncheon",
        img: "icons/weapons/maces/mace-round-steel-black.webp",
        system: {
            commonName: "Truncheon",
            description: html("A weighted baton designed for close restraint and brutal certainty."),
            classification: "simpleMelee",
            damage: { formula: "1d6", type: "bludgeoning" },
            handedness: "oneHanded",
            physical: { weight: 1.5, bulk: 0, range: { normal: 5, long: 5 } },
            properties: { tags: ["baton", "police"], concealable: true }
        }
    },
    {
        name: "Ratcatcher Carbine",
        img: "icons/weapons/guns/gun-rifle-brown.webp",
        system: {
            commonName: "Carbine",
            description: html("A short rifle favored on railways and warehouse roofs."),
            classification: "firearm",
            quality: "fine",
            damage: { formula: "1d10", type: "ballistic" },
            handedness: "twoHanded",
            ammunition: { required: true, type: "carbine-round", capacity: 5, loaded: 5, consumedPerAttack: 1 },
            prerequisites: {
                abilityMinimums: { ...ABILITY_MINIMUMS_NONE, dex: 11 },
                requiredProficiencies: [{ type: "firearm", key: "", label: "Longarm Training" }]
            },
            physical: { weight: 7, bulk: 2, range: { normal: 90, long: 240 } },
            properties: { tags: ["longarm"], noisy: true }
        }
    },
    {
        name: "Clockmaker's Stiletto",
        img: "icons/weapons/daggers/dagger-thin-steel.webp",
        system: {
            commonName: "Stiletto",
            description: html("A narrow blade meant for seams in armor and seams in conversation."),
            classification: "simpleMelee",
            quality: "exceptional",
            damage: { formula: "1d4", type: "piercing" },
            handedness: "oneHanded",
            physical: { weight: 0.8, bulk: 0, range: { normal: 5, long: 20 } },
            properties: { tags: ["blade", "thrown"], concealable: true }
        }
    },
    {
        name: "Ashwood Hunting Spear",
        img: "icons/weapons/polearms/spear-simple.webp",
        system: {
            commonName: "Spear",
            description: html("A sturdy ash shaft tipped in hardened steel for boar and worse."),
            classification: "martialMelee",
            damage: { formula: "1d8", type: "piercing", versatileFormula: "1d10" },
            handedness: "versatile",
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, str: 10 } },
            physical: { weight: 4, bulk: 2, range: { normal: 10, long: 30 } },
            properties: { tags: ["polearm", "thrown"] }
        }
    },
    {
        name: "Galvanic Prod",
        img: "icons/weapons/staves/staff-orb-sh lightning.webp",
        system: {
            commonName: "Galvanic Prod",
            description: html("A brass baton with insulated grips and a volatile induction coil."),
            classification: "tool",
            quality: "experimental",
            rarity: "rare",
            damage: { formula: "1d6", type: "electric" },
            handedness: "oneHanded",
            prerequisites: {
                requiredProficiencies: [{ type: "special", key: "galvanic", label: "Galvanic Handling" }],
                notes: html("Misuse risks self-injury and panic in close quarters.")
            },
            physical: { weight: 3, bulk: 1, range: { normal: 5, long: 5 } },
            properties: { tags: ["electric", "coil"], noisy: true, experimental: true }
        }
    },
    {
        name: "Factory Cleaver",
        img: "icons/weapons/swords/shortsword-broad.webp",
        system: {
            commonName: "Cleaver",
            description: html("An improvised blade from the slaughter line, brutal and ill-balanced."),
            classification: "improvised",
            quality: "poor",
            damage: { formula: "1d6", type: "slashing" },
            handedness: "oneHanded",
            physical: { weight: 2.2, bulk: 1, range: { normal: 5, long: 5 } },
            properties: { tags: ["improvised", "industrial"], noisy: false }
        }
    },
    {
        name: "Signal Flare Bomb",
        img: "icons/weapons/thrown/bomb-fuse-black.webp",
        system: {
            commonName: "Flare Bomb",
            description: html("A thrown pyrotechnic cartridge for marking targets or starting panic."),
            classification: "explosive",
            damage: { formula: "1d8", type: "explosive" },
            handedness: "thrown",
            ammunition: { required: false, type: "", capacity: 0, loaded: 0, consumedPerAttack: 0 },
            physical: { weight: 1, bulk: 0, range: { normal: 20, long: 60 } },
            properties: { tags: ["thrown", "pyrotechnic"], noisy: true }
        }
    }
];

const CONSUMABLE_CONFIGS = [
    {
        name: "Galvanic Stimulant",
        img: "icons/consumables/potions/potion-vial-corked-blue.webp",
        system: {
            commonName: "Stimulant Draught",
            description: html("A bitter tonic that restores vigor at the cost of trembling hands."),
            category: "tonic",
            use: { method: "drink" },
            timing: { duration: "1 hour", recoveryInterval: "short rest" },
            effects: [
                { label: "Restore Health", type: "restoreResource", target: "resources.health", formula: "1d4+1", value: 0, condition: "", notes: html("Immediate restoration.") }
            ],
            sideEffects: [
                { label: "Hand Tremor", type: "applyModifier", target: "skills.sleightOfHand.value", formula: "", value: -1, condition: "for 1 hour", notes: html("Fine motor tasks are impaired.") }
            ],
            properties: { tags: ["medical", "chemical"] }
        }
    },
    {
        name: "Ether Cough Syrup",
        system: {
            commonName: "Cough Syrup",
            description: html("A dark spoonful that eases spasms and dulls panic in crowded wards."),
            category: "medicine",
            use: { method: "drink" },
            effects: [
                { label: "Steady Breath", type: "relieveSymptom", target: "respiratory", formula: "", value: 1, condition: "", notes: html("Suppresses cough for one scene.") }
            ],
            properties: { tags: ["medicine", "ward"], addictive: true }
        }
    },
    {
        name: "Field Bandage Roll",
        system: {
            commonName: "Bandage Roll",
            description: html("Sterile cloth and clasp pins wrapped for rapid field dressing."),
            category: "bandage",
            use: { method: "apply" },
            quantity: { value: 3, max: 3, unit: "wrap" },
            effects: [
                { label: "Staunch Bleeding", type: "removePenalty", target: "bleeding", formula: "", value: 1, condition: "", notes: html("Ends minor ongoing bleed conditions.") }
            ],
            physical: { weight: 0.4, bulk: 0, perishable: false, shelfLife: "24 months" },
            properties: { tags: ["first-aid"] }
        }
    },
    {
        name: "Antitoxin Ampoule",
        system: {
            commonName: "Antitoxin",
            description: html("A cloudy serum prepared against common industrial venoms."),
            category: "antidote",
            use: { method: "inject" },
            effects: [
                { label: "Counter Poison", type: "cureCondition", target: "poisoned", formula: "", value: 1, condition: "", notes: html("Attempts to neutralize ongoing toxins.") }
            ],
            sideEffects: [
                { label: "Nausea", type: "causeCondition", target: "queasy", formula: "", value: 1, condition: "for 10 minutes", notes: html("Mild nausea follows injection.") }
            ],
            properties: { tags: ["antidote", "injectable"], restricted: true }
        }
    },
    {
        name: "Noctilucent Salts",
        system: {
            commonName: "Luminous Salts",
            description: html("A pinch of phosphor salts that reveal oils and prints under low light."),
            category: "chemical",
            use: { method: "apply" },
            effects: [
                { label: "Reveal Residue", type: "grantResistance", target: "evidence-loss", formula: "", value: 1, condition: "in darkness", notes: html("Improves forensic visibility.") }
            ],
            physical: { weight: 0.1, bulk: 0, perishable: true, shelfLife: "6 months" },
            properties: { tags: ["forensic", "luminous"], experimental: true }
        }
    },
    {
        name: "Smelling Vial",
        system: {
            commonName: "Smelling Salts",
            description: html("A sharp ammonia draft to rouse fainted subjects."),
            category: "other",
            use: { method: "inhale" },
            effects: [
                { label: "Rouse Subject", type: "removePenalty", target: "stunned", formula: "", value: 1, condition: "", notes: html("May end a brief incapacitation.") }
            ],
            properties: { tags: ["revival"] }
        }
    },
    {
        name: "Iron Lung Draught",
        system: {
            commonName: "Iron Lung",
            description: html("A dense syrup for gas-workers, harsh but effective against smoke inhalation."),
            category: "drink",
            quality: "fine",
            use: { method: "drink" },
            timing: { duration: "1 scene" },
            effects: [
                { label: "Smog Tolerance", type: "grantResistance", target: "environmental-smoke", formula: "", value: 1, condition: "", notes: html("Reduces penalties from smoke and soot.") }
            ],
            sideEffects: [
                { label: "Heavy Stomach", type: "applyModifier", target: "movement.walk", formula: "", value: -5, condition: "for 10 minutes", notes: html("Movement slows briefly.") }
            ],
            properties: { tags: ["industrial", "respiratory"] }
        }
    },
    {
        name: "Combat Morphia",
        system: {
            commonName: "Morphia Dose",
            description: html("A war-surplus pain suppressant used in desperate surgery."),
            category: "drug",
            quality: "fine",
            rarity: "uncommon",
            use: { method: "inject" },
            effects: [
                { label: "Dull Pain", type: "applyModifier", target: "resources.grit", formula: "", value: 2, condition: "", notes: html("Temporary grit increase.") }
            ],
            sideEffects: [
                { label: "Dependency Risk", type: "causeCondition", target: "withdrawal", formula: "", value: 1, condition: "on repeated use", notes: html("Repeated use may cause dependency.") }
            ],
            properties: { tags: ["analgesic", "surgical"], addictive: true, restricted: true }
        }
    },
    {
        name: "Nightwatch Tonic",
        img: "icons/consumables/potions/potion-bottle-corked-cyan.webp",
        system: {
            commonName: "Nightwatch",
            description: html("A bitter wakefulness tonic favored by watchmen and telegraph operators."),
            category: "tonic",
            slot: "belt",
            use: { method: "drink" },
            effects: [
                { label: "Alert Eyes", type: "applyModifier", target: "skills.perception.value", formula: "", value: 1, condition: "for 1 scene", notes: html("Perception checks sharpen briefly.") }
            ],
            sideEffects: [
                { label: "Jitter", type: "applyModifier", target: "skills.stealth.value", formula: "", value: -1, condition: "for 1 scene", notes: html("Fine stealth suffers from tremor.") }
            ],
            properties: { tags: ["stimulant", "watch"] }
        }
    },
    {
        name: "Aetheric Elixir",
        img: "icons/consumables/potions/potion-jug-corked-purple.webp",
        system: {
            commonName: "Aetheric Elixir",
            description: html("An iridescent draught rumored to steady the mind near uncanny phenomena."),
            category: "drink",
            slot: "belt",
            quality: "exceptional",
            rarity: "rare",
            use: { method: "drink", actionCost: 2 },
            actions: {
                defaultActionId: "consumeBeltElixir",
                variants: [
                    {
                        id: "consumeBeltElixir",
                        label: "Consume Belt Elixir",
                        type: "consumable",
                        apCost: 2,
                        requiresToHit: false,
                        toHitBonus: 0,
                        notes: "Retrieve from belt and consume under pressure."
                    }
                ]
            },
            effects: [
                { label: "Calm Resolve", type: "applyModifier", target: "abilities.san.value", formula: "", value: 1, condition: "for 1 scene", notes: html("A brief buffer against psychic strain.") }
            ],
            sideEffects: [
                { label: "Afterglow", type: "causeCondition", target: "lightheaded", formula: "", value: 1, condition: "for 10 minutes", notes: html("Vision wavers after the effect fades.") }
            ],
            properties: { tags: ["elixir", "occult"], experimental: true }
        }
    }
];

const EFFECT_CONFIGS = [
    {
        name: "Night Terrors",
        system: {
            description: html("Disturbed sleep and intrusive visions leave the subject uncertain by dawn."),
            disposition: "detrimental",
            category: "mental",
            duration: { value: 1, unit: "day" },
            impacts: [
                { label: "Fogged Judgment", targetType: "ability", target: "wis", path: "", operation: "add", value: -1, formula: "", condition: "until full rest", notes: html("Penalty to Wisdom-based tasks.") }
            ],
            affectedKeys: { abilities: ["wis"], skills: ["insight", "perception"], actions: [] },
            removal: { removable: true, method: "Medical care and uninterrupted sleep", difficulty: 12 },
            stacking: { stackable: false, maxStacks: 1, stackKey: "night-terrors" },
            source: { type: "haunting", itemId: "", actorId: "", notes: html("Often follows exposure to forbidden rites.") }
        }
    },
    {
        name: "Galvanic Overcharge",
        system: {
            description: html("A surge through the nerves causes spasms and involuntary movement."),
            disposition: "mixed",
            category: "chemical",
            duration: { value: 5, unit: "minute" },
            impacts: [
                { label: "Quickened Reflex", targetType: "defense", target: "initiative", path: "", operation: "add", value: 2, formula: "", condition: "", notes: html("Initiative rises briefly.") },
                { label: "Muscle Tremor", targetType: "skill", target: "sleightOfHand", path: "", operation: "add", value: -1, formula: "", condition: "", notes: html("Fine motor checks worsen.") }
            ],
            affectedKeys: { abilities: ["dex"], skills: ["sleightOfHand"], actions: [] },
            source: { type: "device", notes: html("Usually caused by faulty induction rigs.") }
        }
    },
    {
        name: "Smog-Lung",
        system: {
            description: html("Long exposure to refinery vapors inflames the chest and steals breath."),
            disposition: "detrimental",
            category: "medical",
            duration: { value: 3, unit: "day" },
            impacts: [
                { label: "Labored Breathing", targetType: "movement", target: "walk", path: "", operation: "add", value: -10, formula: "", condition: "", notes: html("Walking speed reduced.") }
            ],
            affectedKeys: { abilities: ["con"], skills: ["athletics"], actions: [] },
            removal: { removable: true, method: "Clean air and physician treatment", difficulty: 11 }
        }
    },
    {
        name: "Hysteric Contagion",
        system: {
            description: html("Panic spreads through a crowd like static in telegraph wire."),
            disposition: "detrimental",
            category: "morale",
            duration: { value: 1, unit: "scene" },
            impacts: [
                { label: "Fractured Focus", targetType: "skill", target: "investigation", path: "", operation: "add", value: -2, formula: "", condition: "in crowds", notes: html("Concentration is impaired.") }
            ],
            affectedKeys: { abilities: [], skills: ["investigation", "insight"], actions: [] },
            stacking: { stackable: true, maxStacks: 2, stackKey: "panic" }
        }
    },
    {
        name: "Lantern-Blessed Clarity",
        system: {
            description: html("A disciplined breathing exercise under phosphor light steadies perception."),
            disposition: "beneficial",
            category: "sensory",
            duration: { value: 1, unit: "hour" },
            impacts: [
                { label: "Clear Observation", targetType: "skill", target: "perception", path: "", operation: "add", value: 2, formula: "", condition: "in low light", notes: html("Improves perception checks.") }
            ],
            affectedKeys: { abilities: [], skills: ["perception"], actions: [] }
        }
    },
    {
        name: "Clockwork Fatigue",
        system: {
            description: html("Exhaustion from prolonged operation of heavy mechanical harness."),
            disposition: "detrimental",
            category: "physical",
            duration: { value: 2, unit: "hour" },
            impacts: [
                { label: "Lead Limbs", targetType: "ability", target: "str", path: "", operation: "add", value: -1, formula: "", condition: "", notes: html("Strength checks suffer.") }
            ],
            affectedKeys: { abilities: ["str"], skills: ["athletics"], actions: [] },
            removal: { removable: true, method: "Rest and hydration", difficulty: 8 }
        }
    },
    {
        name: "Surgical Resolve",
        system: {
            description: html("Focused post-operative care grants brief but valuable composure."),
            disposition: "beneficial",
            category: "medical",
            duration: { value: 1, unit: "day" },
            impacts: [
                { label: "Steady Nerves", targetType: "resource", target: "resources.grit", path: "", operation: "add", value: 1, formula: "", condition: "", notes: html("Temporary grit increase.") }
            ],
            affectedKeys: { abilities: ["san"], skills: [], actions: [] }
        }
    },
    {
        name: "Acid Scald",
        system: {
            description: html("Corrosive splash burns skin and leaves persistent pain."),
            disposition: "detrimental",
            category: "chemical",
            duration: { value: 10, unit: "minute" },
            impacts: [
                { label: "Burn Trauma", targetType: "defense", target: "armorClass", path: "", operation: "add", value: -1, formula: "", condition: "until treated", notes: html("Armor effectiveness reduced.") }
            ],
            affectedKeys: { abilities: [], skills: [], actions: ["dash", "grapple"] },
            removal: { removable: true, method: "Neutralizing wash", difficulty: 10 }
        }
    },
    {
        name: "Electro-Mesmeric Focus",
        system: {
            description: html("A calibrated pulse train sharpens concentration on one immediate task."),
            disposition: "beneficial",
            category: "experimental",
            duration: { value: 10, unit: "minute" },
            impacts: [
                { label: "Task Focus", targetType: "skill", target: "arcana", path: "", operation: "add", value: 2, formula: "", condition: "single declared task", notes: html("Only applies to one chosen inquiry.") }
            ],
            affectedKeys: { abilities: ["int"], skills: ["arcana", "history"], actions: [] },
            removal: { removable: true, method: "Ends naturally", difficulty: 0 },
            source: { type: "procedure", notes: html("Developed in private clinics of uncertain legality.") }
        }
    },
    {
        name: "Funeral Bell Dread",
        system: {
            description: html("Repeated tolling from a nearby belfry unsettles even seasoned operatives."),
            disposition: "mixed",
            category: "mental",
            duration: { value: 1, unit: "scene" },
            impacts: [
                { label: "Shaken Courage", targetType: "ability", target: "san", path: "", operation: "add", value: -1, formula: "", condition: "while bell is audible", notes: html("Sanity tests become more difficult.") },
                { label: "Heightened Alert", targetType: "skill", target: "perception", path: "", operation: "add", value: 1, formula: "", condition: "while bell is audible", notes: html("Perception rises from anxiety.") }
            ],
            affectedKeys: { abilities: ["san"], skills: ["perception"], actions: [] }
        }
    }
];

const ETHNICITY_CONFIGS = [
    {
        name: "British Exile Circle",
        system: {
            description: html("Families displaced by scandal and debt, bound by etiquette and careful silence."),
            nationalIdentity: "british",
            languages: { primary: "english", spoken: ["english", "french"], literate: ["english", "latin"] },
            culturalNotes: {
                homeland: "London and coastal estates",
                diaspora: html("Exile circles gather in port cities through clubs and private chapels."),
                periodContext: html("Status is preserved in appearance while fortunes quietly decline.")
            }
        }
    },
    {
        name: "Parisian Industrial Migrants",
        system: {
            nationalIdentity: "french",
            languages: { primary: "french", spoken: ["french", "english"], literate: ["french"] },
            culturalNotes: {
                homeland: "Paris outskirts",
                diaspora: html("Workers follow foundry contracts across the Channel and river ports."),
                periodContext: html("Union ties and rent strikes shape neighborhood politics.")
            }
        }
    },
    {
        name: "Prussian Technical Guild",
        system: {
            nationalIdentity: "german",
            languages: { primary: "german", spoken: ["german", "english"], literate: ["german", "english"] },
            culturalNotes: {
                homeland: "Rhineland workshops",
                diaspora: html("Guild engineers are prized in rail depots and telegraph houses."),
                periodContext: html("Apprenticeship records carry social weight beyond the workshop.")
            }
        }
    },
    {
        name: "Italian Dock Brotherhood",
        system: {
            nationalIdentity: "italian",
            languages: { primary: "italian", spoken: ["italian", "english"], literate: ["italian"] },
            culturalNotes: {
                homeland: "Liguria and Naples",
                diaspora: html("Mutual aid halls provide credit, lodging, and legal witness."),
                periodContext: html("Dock labor and organized crime often compete for the same recruits.")
            }
        }
    },
    {
        name: "Imperial Russian Refugees",
        system: {
            nationalIdentity: "russian",
            languages: { primary: "russian", spoken: ["russian", "english"], literate: ["russian", "french"] },
            culturalNotes: {
                homeland: "St. Petersburg and Odessa",
                diaspora: html("Refugee committees circulate coded news through tea rooms and print shops."),
                periodContext: html("Political surveillance follows them across borders.")
            }
        }
    },
    {
        name: "Tokyo Telegraph Students",
        system: {
            nationalIdentity: "japanese",
            languages: { primary: "japanese", spoken: ["japanese", "english"], literate: ["japanese", "english"] },
            culturalNotes: {
                homeland: "Tokyo",
                diaspora: html("Students and engineers exchange methods in telegraph and rail academies."),
                periodContext: html("Rapid modernization produces both prestige and suspicion abroad.")
            }
        }
    },
    {
        name: "Ottoman Merchant House",
        system: {
            nationalIdentity: "ottoman",
            languages: { primary: "ottomanTurkish", spoken: ["ottomanTurkish", "arabic", "french"], literate: ["ottomanTurkish", "french"] },
            culturalNotes: {
                homeland: "Istanbul and Smyrna",
                diaspora: html("Trade envoys maintain credit routes linking ports and inland caravans."),
                periodContext: html("Customs reforms and debt pressure reshape old mercantile privileges.")
            }
        }
    },
    {
        name: "American Rail Settlers",
        system: {
            nationalIdentity: "american",
            languages: { primary: "english", spoken: ["english", "spanish"], literate: ["english"] },
            culturalNotes: {
                homeland: "Midwestern rail towns",
                diaspora: html("Mechanics and surveyors follow overseas concessions and tunneling projects."),
                periodContext: html("They bring frontier habits into densely policed imperial cities.")
            }
        }
    }
];

function specializationPath(key, name, progression) {
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

const PROFESSION_CONFIGS = [
    {
        name: "Urban Detective",
        system: {
            description: html("Investigators trained to gather testimony, reconstruct scenes, and navigate institutions that prefer silence."),
            category: "investigative",
            primarySkills: ["investigation", "insight", "perception"],
            specializations: [specializationPath("forensic", "Forensic Specialist", "Clerk -> Analyst -> Lead -> Consultant")]
        }
    },
    {
        name: "Field Surgeon",
        system: {
            category: "medical",
            primarySkills: ["medicine", "insight", "investigation"],
            specializations: [specializationPath("triage", "Triage Marshal", "Orderly -> Surgeon -> Chief Surgeon -> Hospital Director")],
            advancementNotes: html("Advance through successful surgeries under adverse conditions.")
        }
    },
    {
        name: "Occult Natural Philosopher",
        system: {
            category: "occultScience",
            primarySkills: ["arcana", "history", "investigation"],
            specializations: [specializationPath("aetheric", "Aetheric Researcher", "Reader -> Experimenter -> Lecturer -> Society Fellow")],
            advancementNotes: html("Permit progress only when observations are documented and replicated.")
        }
    },
    {
        name: "Railway Marshal",
        system: {
            category: "military",
            primarySkills: ["athletics", "perception", "intimidation"],
            specializations: [specializationPath("escort", "Armored Escort", "Guard -> Senior Guard -> Captain -> Inspector")]
        }
    },
    {
        name: "Smokestack Mechanist",
        system: {
            category: "industrial",
            primarySkills: ["athletics", "investigation", "nature"],
            specializations: [specializationPath("boiler", "Boiler Specialist", "Stoker -> Technician -> Foreman -> Master Engineer")]
        }
    },
    {
        name: "Underworld Liaison",
        system: {
            category: "criminal",
            primarySkills: ["deception", "persuasion", "stealth"],
            specializations: [specializationPath("smuggling", "Smuggling Broker", "Runner -> Broker -> Controller -> Syndicate Partner")]
        }
    }
];

const QUIRK_CONFIGS = [
    {
        name: "Streetwise Instinct",
        system: {
            description: html("Years among markets and dock roads make ambushes in crowds less likely."),
            source: { type: "profession", label: "Urban Detective" },
            effects: [{ label: "Crowd Awareness", targetType: "skill", target: "perception", operation: "add", value: 1, path: "", condition: "in urban scenes", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Boiler Ears",
        system: {
            description: html("Can distinguish dangerous valve rhythms from ordinary machinery noise."),
            source: { type: "profession", label: "Smokestack Mechanist" },
            effects: [{ label: "Machine Listening", targetType: "skill", target: "investigation", operation: "add", value: 1, path: "", condition: "around engines", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Surgical Calm",
        system: {
            description: html("Maintains precision under blood, shouting, and failing light."),
            source: { type: "profession", label: "Field Surgeon" },
            effects: [{ label: "Steady Hands", targetType: "skill", target: "medicine", operation: "add", value: 1, path: "", condition: "during active treatment", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Unnerving Stare",
        system: {
            description: html("A fixed, cold gaze unsettles witnesses and lesser officials."),
            source: { type: "other", label: "Personal Reputation" },
            effects: [{ label: "Forceful Presence", targetType: "skill", target: "intimidation", operation: "add", value: 1, path: "", condition: "direct eye contact", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Crowded-Footed",
        system: {
            description: html("Moves deftly in markets and queues, but not in open wilderness."),
            source: { type: "ethnicity", label: "Port City Upbringing" },
            effects: [{ label: "Urban Pace", targetType: "speed", target: "walk", operation: "add", value: 5, path: "", condition: "in crowded streets", appliesWhenEncumbered: true }]
        }
    },
    {
        name: "Powder Caution",
        system: {
            description: html("Checks vents and seams before discharge, reducing accidents."),
            source: { type: "talent", label: "Ballistic Discipline" },
            effects: [{ label: "Safe Handling", targetType: "weaponProficiency", target: "firearm", operation: "grant", value: 1, path: "", condition: "with maintained firearms", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Tight-Laced Endurance",
        system: {
            description: html("Can wear heavy formal layers for hours without complaint."),
            source: { type: "other", label: "Social Conditioning" },
            effects: [{ label: "Wardrobe Tolerance", targetType: "encumbrance", target: "bulk", operation: "add", value: 1, path: "", condition: "while wearing clothing armor", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Night Ledger",
        system: {
            description: html("A habit of immediate note-taking preserves details others misremember."),
            source: { type: "feat", label: "Casebook Discipline" },
            effects: [{ label: "Recorded Details", targetType: "skill", target: "history", operation: "add", value: 1, path: "", condition: "when notes were taken in scene", appliesWhenEncumbered: false }]
        }
    }
];

const EQUIPMENT_CONFIGS = [
    {
        name: "Field Investigator Kit",
        img: "icons/tools/scribal/lens-glass-brown.webp",
        system: {
            commonName: "Investigator Kit",
            description: html("Casebook, lens, gloves, and envelopes for deliberate scene work."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Aids structured scene examination.") } },
            effects: [{ label: "Documented Scene", targetType: "skill", target: "investigation", operation: "add", value: 1, formula: "", condition: "kit present", notes: html("Bonus to scene analysis.") }],
            physical: { weight: 3, bulk: 1, quantity: 1, unit: "kit" },
            value: { price: 7, currency: "pounds" },
            properties: { tags: ["investigation", "fieldwork"] }
        }
    },
    {
        name: "Portable Telegraph Tap",
        img: "icons/tools/instruments/keyboard-keys-brown.webp",
        system: {
            commonName: "Telegraph Tap",
            description: html("A foldable tapping set for line diagnostics and coded dispatches."),
            category: "apparatus",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "history", difficulty: 12, purpose: html("Decode or send brief line traffic.") } },
            physical: { weight: 2, bulk: 1, quantity: 1, unit: "set" },
            value: { price: 12, currency: "pounds" },
            properties: { tags: ["communication", "telegraph"], restricted: true }
        }
    },
    {
        name: "Locksmith Roll",
        img: "icons/tools/hand/pick-steel-white.webp",
        system: {
            commonName: "Locksmith Tools",
            description: html("Fine picks, torsion bars, and graphite cloth for stubborn wards."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "sleightOfHand", difficulty: 12, purpose: html("Manipulate locks and catches.") } },
            physical: { weight: 1, bulk: 0, quantity: 1, unit: "roll" },
            value: { price: 5, currency: "pounds" },
            properties: { tags: ["lockpicking"], concealable: true, restricted: true }
        }
    },
    {
        name: "Surveyor's Transit",
        img: "icons/tools/navigation/spyglass-brass.webp",
        system: {
            commonName: "Transit",
            description: html("Tripod optics for line-of-sight measurement and distance estimation."),
            category: "instrument",
            slot: "hands",
            use: { skillCheck: { skill: "nature", difficulty: 11, purpose: html("Chart terrain and establish bearings.") } },
            physical: { weight: 5, bulk: 2, quantity: 1, unit: "instrument" },
            value: { price: 15, currency: "pounds" },
            properties: { tags: ["survey", "optics"], fragile: true }
        }
    },
    {
        name: "Ritual Chalk Cylinder",
        img: "icons/commodities/materials/powder-white.webp",
        system: {
            commonName: "Marking Chalk",
            description: html("Compressed white chalk for notation on stone, iron, and timber."),
            category: "miscellaneous",
            slot: "belt",
            use: { actionCost: 0, requiresHands: true, consumedOnUse: true, skillCheck: { skill: "arcana", difficulty: 10, required: false, purpose: html("Mark warning sigils and directional signs.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 6, unit: "stick" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["marking", "ritual"], concealable: true }
        }
    },
    {
        name: "Mortuary Lantern",
        img: "icons/sundries/lights/lantern-bullseye-silver.webp",
        system: {
            commonName: "Lantern",
            description: html("A shuttered lamp with mirrored housing for low-glare examinations."),
            category: "apparatus",
            slot: "hands",
            use: { skillCheck: { skill: "perception", difficulty: 9, required: false, purpose: html("Illuminate close details without flooding a room.") } },
            physical: { weight: 2, bulk: 1, quantity: 1, unit: "lantern" },
            value: { price: 4, currency: "pounds" },
            properties: { tags: ["light", "forensic"], fragile: true }
        }
    },
    {
        name: "Coiled Hemp Rope",
        img: "icons/sundries/survival/rope-coiled-brown.webp",
        system: {
            commonName: "Hemp Rope",
            description: html("A compact thirty-foot coil with brass clips for harnessing and descent."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "athletics", difficulty: 10, purpose: html("Secure climbs and controlled descents.") } },
            physical: { weight: 3, bulk: 1, quantity: 1, unit: "coil" },
            value: { price: 2, currency: "pounds" },
            properties: { tags: ["climbing", "utility"] }
        }
    },
    {
        name: "Folding Pry Hook",
        img: "icons/tools/hand/crowbar-steel.webp",
        system: {
            commonName: "Pry Hook",
            description: html("A short folding lever for crates, stuck hatches, and iron hasps."),
            category: "tool",
            slot: "belt",
            use: { skillCheck: { skill: "athletics", difficulty: 11, purpose: html("Force simple barriers and jammed catches.") } },
            physical: { weight: 1.2, bulk: 0, quantity: 1, unit: "tool" },
            value: { price: 3, currency: "pounds" },
            properties: { tags: ["breach", "utility"], concealable: true }
        }
    },
    {
        name: "Pocket Tool Roll",
        img: "icons/tools/hand/hammer-and-nail.webp",
        system: {
            commonName: "Tool Roll",
            description: html("Needles, wire, and a miniature spanner for field adjustments."),
            category: "tool",
            slot: "belt",
            quality: "fine",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Perform hasty repairs on delicate gear.") } },
            physical: { weight: 0.8, bulk: 0, quantity: 1, unit: "roll" },
            value: { price: 4, currency: "pounds" },
            properties: { tags: ["repair", "utility"], concealable: true }
        }
    }
];

const ITEM_CONFIGS = [
    {
        name: "Cipher Notebook",
        img: "icons/sundries/books/book-red-exclamation.webp",
        system: {
            commonName: "Pocket Cipher Book",
            description: html("Wax-sealed pages indexed by private shorthand and witness initials."),
            category: "document",
            slot: "belt",
            quality: "fine",
            rarity: "uncommon",
            use: { skillCheck: { skill: "history", difficulty: 11, purpose: html("Recover old links across current investigations.") } },
            physical: { weight: 0.5, bulk: 0, quantity: 1, unit: "book" },
            value: { price: 2, currency: "pounds" },
            properties: { tags: ["document", "cipher"], concealable: true, fragile: true }
        }
    },
    {
        name: "Brass Calling Whistle",
        img: "icons/tools/instruments/whistle-brass.webp",
        system: {
            commonName: "Signal Whistle",
            description: html("A sharp whistle carrying over rain, steam, and station noise."),
            category: "instrument",
            slot: "neck",
            use: { actionCost: 0, requiresHands: true, consumedOnUse: false, skillCheck: { skill: "performance", difficulty: 8, required: false, purpose: html("Signal allies over short distances.") } },
            physical: { weight: 0.1, bulk: 0, quantity: 1, unit: "whistle" },
            properties: { tags: ["signal"], concealable: true }
        }
    },
    {
        name: "Witness Satchel",
        img: "icons/containers/bags/pack-simple-leather-tan.webp",
        system: {
            commonName: "Satchel",
            description: html("A partitioned leather satchel for transcripts, sketches, and sealed evidence."),
            category: "container",
            slot: "belt",
            use: { actionCost: 1, requiresHands: true, consumedOnUse: false, skillCheck: { skill: "investigation", difficulty: 8, required: false, purpose: html("Retrieve stored evidence quickly.") } },
            physical: { weight: 1.8, bulk: 1, quantity: 1, unit: "satchel" },
            value: { price: 3, currency: "pounds" },
            properties: { tags: ["container", "evidence"] }
        }
    },
    {
        name: "Sootproof Cloak",
        img: "icons/equipment/back/cloak-hooded-black.webp",
        system: {
            commonName: "Protective Cloak",
            description: html("A waxed black cloak that sheds rain and light chimney soot."),
            category: "clothing",
            slot: "torso",
            use: { actionCost: 0, requiresHands: false, consumedOnUse: false, skillCheck: { skill: "survival", difficulty: 9, required: false, purpose: html("Reduce exposure in foul weather.") } },
            physical: { weight: 2, bulk: 1, quantity: 1, unit: "cloak" },
            value: { price: 2, currency: "pounds" },
            properties: { tags: ["weatherproof"], concealable: false }
        }
    },
    {
        name: "Pocket Reliquary",
        img: "icons/commodities/treasure/token-gold-red.webp",
        system: {
            commonName: "Reliquary",
            description: html("A small silver case containing a relic, prayer slip, and lock of hair."),
            category: "trinket",
            slot: "neck",
            quality: "exceptional",
            rarity: "rare",
            use: { actionCost: 0, requiresHands: true, consumedOnUse: false, skillCheck: { skill: "religion", difficulty: 12, required: false, purpose: html("Calm panic during uncanny encounters.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 1, unit: "reliquary" },
            value: { price: 9, currency: "pounds" },
            properties: { tags: ["devotional", "ward"], concealable: true, restricted: true }
        }
    },
    {
        name: "Lecture Broadsheet Bundle",
        img: "icons/sundries/documents/document-sealed-signatures-red.webp",
        system: {
            commonName: "Broadsheets",
            description: html("Folded circulars from engineering societies and scandalous lecture halls."),
            category: "document",
            slot: "belt",
            use: { skillCheck: { skill: "history", difficulty: 10, purpose: html("Identify current theories and rival schools.") } },
            physical: { weight: 0.4, bulk: 0, quantity: 12, unit: "sheet" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["academic", "press"], fragile: true }
        }
    },
    {
        name: "Unlit Tallow Torch",
        img: "icons/sundries/lights/torch-brown.webp",
        system: {
            commonName: "Torch",
            description: html("A resin-wrapped tallow torch carried unlit until needed in tunnels or basements."),
            category: "apparatus",
            slot: "belt",
            use: { actionCost: 1, requiresHands: true, consumedOnUse: false, skillCheck: { skill: "survival", difficulty: 8, required: false, purpose: html("Provide emergency light in dark spaces.") } },
            physical: { weight: 0.6, bulk: 0, quantity: 1, unit: "torch" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["light", "utility"] }
        }
    },
    {
        name: "Brass Oil Flask",
        img: "icons/consumables/potions/bottle-round-corked-yellow.webp",
        system: {
            commonName: "Oil Flask",
            description: html("A stoppered brass flask of lamp oil for torches, lanterns, and burners."),
            category: "container",
            slot: "belt",
            use: { actionCost: 1, requiresHands: true, consumedOnUse: true, skillCheck: { skill: "investigation", difficulty: 8, required: false, purpose: html("Refuel light sources and lubricate mechanisms.") } },
            physical: { weight: 0.5, bulk: 0, quantity: 1, unit: "flask" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["fuel", "utility"], concealable: true }
        }
    }
];

const SKILL_ITEM_CONFIGS = [
    {
        name: "Basic Fieldcraft",
        img: "icons/tools/navigation/compass-brass-blue-red.webp",
        system: {
            commonName: "Fieldcraft",
            description: html("Route planning, camp routine, and practical hazard checks."),
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "survival", difficulty: 10, purpose: html("Plan safe movement through hazardous districts.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "core"] }
        }
    },
    {
        name: "Urban Interviewing",
        img: "icons/skills/social/diplomacy-handshake-yellow.webp",
        system: {
            commonName: "Interviewing",
            description: html("Methods for extracting testimony without provoking silence."),
            category: "miscellaneous",
            use: { requiresHands: false, skillCheck: { skill: "persuasion", difficulty: 10, purpose: html("Improve witness cooperation.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "social"] }
        }
    },
    {
        name: "Ballistic Drill",
        img: "icons/weapons/guns/gun-pistol-brown.webp",
        system: {
            commonName: "Ballistic Drill",
            description: html("Foundational firearm handling, stance, and safe reloading."),
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "perception", difficulty: 11, purpose: html("Maintain awareness during ranged exchanges.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "firearm"] }
        }
    },
    {
        name: "Archive Methods",
        img: "icons/sundries/books/book-simple-brown.webp",
        system: {
            commonName: "Archive Methods",
            description: html("Cataloguing methods for parish records, guild ledgers, and shipping logs."),
            category: "document",
            use: { requiresHands: false, skillCheck: { skill: "history", difficulty: 10, purpose: html("Locate relevant records quickly.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "research"] }
        }
    }
];

const TALENT_CONFIGS = [
    {
        name: "Nerves of Iron",
        img: "icons/magic/control/fear-fright-monster-purple-blue.webp",
        system: {
            commonName: "Iron Nerves",
            description: html("Discipline and grim experience keep the mind ordered under dread."),
            category: "miscellaneous",
            quality: "fine",
            rarity: "uncommon",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "insight", difficulty: 12, purpose: html("Center yourself before fear effects.") } },
            effects: [{ label: "Steeled Mind", targetType: "ability", target: "san", operation: "add", value: 1, formula: "", condition: "against fear effects", notes: html("Applies to sanity-related tests.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "mental"] }
        }
    },
    {
        name: "Measured Breathing",
        img: "icons/magic/life/cross-beam-green.webp",
        system: {
            commonName: "Measured Breathing",
            description: html("A clinical breathing sequence for steadier hands during surgery and shooting."),
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "medicine", difficulty: 10, purpose: html("Reduce panic in high-pressure procedures.") } },
            effects: [{ label: "Steady Rhythm", targetType: "skill", target: "medicine", operation: "add", value: 1, formula: "", condition: "if uninterrupted for 1 round", notes: html("Only in scenes allowing preparation.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "discipline"] }
        }
    },
    {
        name: "Cold-Read Etiquette",
        img: "icons/skills/social/thumbsup-approval-like.webp",
        system: {
            commonName: "Cold-Read",
            description: html("Reads posture and speech cadence to infer intent behind polite words."),
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "insight", difficulty: 11, purpose: html("Estimate hidden motives in formal meetings.") } },
            effects: [],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "social"] }
        }
    },
    {
        name: "Railway Legs",
        img: "icons/environment/settlement/train.webp",
        system: {
            commonName: "Railway Legs",
            description: html("Maintains footing on moving carriages and unstable platforms."),
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "acrobatics", difficulty: 10, purpose: html("Keep balance on moving machinery.") } },
            effects: [{ label: "Rolling Balance", targetType: "skill", target: "acrobatics", operation: "add", value: 1, formula: "", condition: "on moving platforms", notes: html("Applies in train and carriage scenes.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "mobility"] }
        }
    }
];

export const TOTC_SAMPLE_ITEMS = [
    ...ARMOR_CONFIGS.map(createArmorEntry),
    ...WEAPON_CONFIGS.map(createWeaponEntry),
    ...CONSUMABLE_CONFIGS.map(createConsumableEntry),
    ...EFFECT_CONFIGS.map(createEffectEntry),
    ...ETHNICITY_CONFIGS.map(createEthnicityEntry),
    ...PROFESSION_CONFIGS.map(createProfessionEntry),
    ...QUIRK_CONFIGS.map(createQuirkEntry),
    ...EQUIPMENT_CONFIGS.map((entry) => createItemLikeEntry("equipment", entry)),
    ...ITEM_CONFIGS.map((entry) => createItemLikeEntry("item", entry)),
    ...SKILL_ITEM_CONFIGS.map((entry) => createItemLikeEntry("skill", entry)),
    ...TALENT_CONFIGS.map((entry) => createItemLikeEntry("talent", entry))
];

const STARTER_ACTOR_LOADOUTS = {
    "Inspector Eleanor Thorne": {
        equipped: [
            { type: "weapon", name: "Service Revolver", slot: "hands", position: 1 },
            { type: "armor", name: "Mourning Silk Vest", slot: "torso", position: 1 },
            { type: "equipment", name: "Field Investigator Kit", slot: "belt", position: 1 },
            { type: "item", name: "Unlit Tallow Torch", slot: "belt", position: 2 },
            { type: "consumable", name: "Galvanic Stimulant", slot: "belt", position: 3 },
            { type: "equipment", name: "Coiled Hemp Rope", slot: "belt", position: 4 },
            { type: "item", name: "Cipher Notebook", slot: "belt", position: 5 }
        ],
        pack: [
            { type: "consumable", name: "Field Bandage Roll" },
            { type: "item", name: "Brass Oil Flask" }
        ]
    },
    "Sergeant Amos Pike": {
        equipped: [
            { type: "weapon", name: "Trench Truncheon", slot: "hands", position: 1 },
            { type: "armor", name: "Dockside Leather Jerkin", slot: "torso", position: 1 },
            { type: "armor", name: "Asylum Keeper Helm", slot: "head", position: 1 },
            { type: "equipment", name: "Locksmith Roll", slot: "belt", position: 1 },
            { type: "consumable", name: "Smelling Vial", slot: "belt", position: 2 }
        ],
        pack: [
            { type: "equipment", name: "Folding Pry Hook" }
        ]
    },
    "Lady Miriam Foxe": {
        equipped: [
            { type: "weapon", name: "Clockmaker's Stiletto", slot: "hands", position: 1 },
            { type: "armor", name: "Mourning Silk Vest", slot: "torso", position: 1 },
            { type: "item", name: "Lecture Broadsheet Bundle", slot: "belt", position: 1 },
            { type: "consumable", name: "Noctilucent Salts", slot: "belt", position: 2 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 3 },
            { type: "equipment", name: "Ritual Chalk Cylinder", slot: "belt", position: 4 },
            { type: "equipment", name: "Pocket Tool Roll", slot: "belt", position: 5 },
            { type: "consumable", name: "Aetheric Elixir", slot: "belt", position: 6 }
        ],
        pack: [
            { type: "item", name: "Pocket Reliquary" },
            { type: "item", name: "Unlit Tallow Torch" }
        ]
    },
    "Doctor Mordecai Vale": {
        equipped: [
            { type: "weapon", name: "Galvanic Prod", slot: "hands", position: 1 },
            { type: "armor", name: "Pneumatic Bracer Rig", slot: "hands", position: 2 },
            { type: "consumable", name: "Combat Morphia", slot: "belt", position: 1 },
            { type: "equipment", name: "Portable Telegraph Tap", slot: "belt", position: 2 },
            { type: "consumable", name: "Antitoxin Ampoule", slot: "belt", position: 3 },
            { type: "consumable", name: "Nightwatch Tonic", slot: "belt", position: 4 },
            { type: "equipment", name: "Folding Pry Hook", slot: "belt", position: 5 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 6 },
            { type: "consumable", name: "Aetheric Elixir", slot: "belt", position: 7 }
        ],
        pack: [
            { type: "equipment", name: "Coiled Hemp Rope" }
        ]
    },
    "Magistrate Harlan Crowthorne": {
        equipped: [
            { type: "weapon", name: "Service Revolver", slot: "hands", position: 1 },
            { type: "armor", name: "Mourning Silk Vest", slot: "torso", position: 1 },
            { type: "item", name: "Cipher Notebook", slot: "belt", position: 1 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 2 },
            { type: "consumable", name: "Field Bandage Roll", slot: "belt", position: 3 },
            { type: "item", name: "Unlit Tallow Torch", slot: "belt", position: 4 }
        ],
        pack: [
            { type: "item", name: "Pocket Reliquary" },
            { type: "equipment", name: "Mortuary Lantern" }
        ]
    },
    "Foreman Silas Grigg": {
        equipped: [
            { type: "weapon", name: "Factory Cleaver", slot: "hands", position: 1 },
            { type: "armor", name: "Boiler-Forged Cuirass", slot: "torso", position: 1 },
            { type: "consumable", name: "Galvanic Stimulant", slot: "belt", position: 1 },
            { type: "equipment", name: "Folding Pry Hook", slot: "belt", position: 2 },
            { type: "equipment", name: "Coiled Hemp Rope", slot: "belt", position: 3 },
            { type: "item", name: "Unlit Tallow Torch", slot: "belt", position: 4 },
            { type: "equipment", name: "Field Investigator Kit", slot: "belt", position: 5 },
            { type: "consumable", name: "Nightwatch Tonic", slot: "belt", position: 6 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 7 },
            { type: "equipment", name: "Pocket Tool Roll", slot: "belt", position: 8 }
        ],
        pack: [
            { type: "equipment", name: "Surveyor's Transit" }
        ]
    },
    "Railway Lamp Runner": {
        equipped: [
            { type: "item", name: "Unlit Tallow Torch", slot: "belt", position: 1 },
            { type: "consumable", name: "Smelling Vial", slot: "belt", position: 2 }
        ],
        pack: [
            { type: "item", name: "Brass Oil Flask" }
        ]
    },
    "Tanglefoot Cutpurse": {
        equipped: [
            { type: "weapon", name: "Clockmaker's Stiletto", slot: "hands", position: 1 },
            { type: "equipment", name: "Locksmith Roll", slot: "belt", position: 1 },
            { type: "equipment", name: "Pocket Tool Roll", slot: "belt", position: 2 },
            { type: "item", name: "Cipher Notebook", slot: "belt", position: 3 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 4 },
            { type: "consumable", name: "Nightwatch Tonic", slot: "belt", position: 5 }
        ],
        pack: [
            { type: "equipment", name: "Folding Pry Hook" }
        ]
    },
    "Catacomb Survey Porter": {
        equipped: [
            { type: "weapon", name: "Trench Truncheon", slot: "hands", position: 1 },
            { type: "equipment", name: "Coiled Hemp Rope", slot: "belt", position: 1 },
            { type: "equipment", name: "Ritual Chalk Cylinder", slot: "belt", position: 2 },
            { type: "item", name: "Unlit Tallow Torch", slot: "belt", position: 3 },
            { type: "consumable", name: "Field Bandage Roll", slot: "belt", position: 4 },
            { type: "consumable", name: "Antitoxin Ampoule", slot: "belt", position: 5 },
            { type: "item", name: "Brass Oil Flask", slot: "belt", position: 6 }
        ],
        pack: [
            { type: "equipment", name: "Surveyor's Transit" }
        ]
    }
};

function toStarterItemKey(type, name) {
    return `${type}:${name}`;
}

function createStarterItemId(actorIndex, itemIndex) {
    const actorPart = actorIndex.toString(36).padStart(2, "0");
    const itemPart = itemIndex.toString(36).padStart(12, "0");
    return `ld${actorPart}${itemPart}`;
}

function isLoadoutSlotCompatible(itemData, slotKey, slotData) {
    const allowedTypes = new Set(slotData?.allowedTypes ?? []);
    if (itemData.system?.slot !== slotKey) {
        return false;
    }

    if (itemData.type === "armor") {
        return allowedTypes.has("armor");
    }

    if (allowedTypes.has(itemData.type)) {
        return true;
    }

    const category = itemData.system?.category ?? "";
    if (allowedTypes.has("tool") && (itemData.type === "equipment" || itemData.type === "item") && category === "tool") {
        return true;
    }

    return false;
}

function buildActorsWithLoadouts() {
    const starterItemLibrary = new Map(
        TOTC_SAMPLE_ITEMS.map((item) => [toStarterItemKey(item.type, item.name), maybeDeepClone(item)])
    );

    return ACTOR_CONFIGS.map((config, actorIndex) => {
        const actorEntry = createActorEntry(config);
        const loadout = STARTER_ACTOR_LOADOUTS[actorEntry.name];
        if (!loadout) return actorEntry;

        const actorWithLoadout = maybeDeepClone(actorEntry);
        const embeddedItems = [];
        const packItemIds = [];
        let embeddedItemIndex = 0;

        const addEmbeddedItem = (reference) => {
            const key = toStarterItemKey(reference.type, reference.name);
            const sourceItem = starterItemLibrary.get(key);
            if (!sourceItem) {
                console.warn(`[turn-of-the-century] Missing starter item for ${actorWithLoadout.name}: ${key}`);
                return null;
            }

            const embedded = maybeDeepClone(sourceItem);
            embedded._id = createStarterItemId(actorIndex, embeddedItemIndex);
            embeddedItemIndex += 1;
            embeddedItems.push(embedded);
            return embedded;
        };

        for (const equippedItem of loadout.equipped ?? []) {
            const embedded = addEmbeddedItem(equippedItem);
            if (!embedded) continue;

            const slotData = actorWithLoadout.system?.inventory?.equipment?.[equippedItem.slot];
            const capacity = Number(slotData?.capacity ?? 0);
            if (!slotData || capacity < 1 || !isLoadoutSlotCompatible(embedded, equippedItem.slot, slotData)) {
                packItemIds.push(embedded._id);
                continue;
            }

            const itemIds = Array.isArray(slotData.itemIds) ? [...slotData.itemIds] : [];
            const requestedIndex = Math.max(Number(equippedItem.position ?? 1) - 1, 0);
            const boundedIndex = Math.min(requestedIndex, capacity - 1);

            if (!itemIds[boundedIndex]) {
                itemIds[boundedIndex] = embedded._id;
            } else {
                const firstOpenIndex = Array.from({ length: capacity }, (_, index) => index).find((index) => !itemIds[index]);
                if (firstOpenIndex === undefined) {
                    packItemIds.push(embedded._id);
                    continue;
                }
                itemIds[firstOpenIndex] = embedded._id;
            }

            slotData.itemIds = itemIds.filter(Boolean).slice(0, capacity);
        }

        for (const packItem of loadout.pack ?? []) {
            const embedded = addEmbeddedItem(packItem);
            if (!embedded) continue;
            packItemIds.push(embedded._id);
        }

        actorWithLoadout.items = embeddedItems;
        actorWithLoadout.system.inventory.pack.itemIds = packItemIds;
        return actorWithLoadout;
    });
}

export const TOTC_SAMPLE_ACTORS = buildActorsWithLoadouts();

export const TOTC_SAMPLE_LIBRARY_STATS = {
    actors: {
        total: TOTC_SAMPLE_ACTORS.length,
        byType: Object.fromEntries(
            TOTC_SAMPLE_ACTORS.reduce((map, actor) => {
                map.set(actor.type, (map.get(actor.type) ?? 0) + 1);
                return map;
            }, new Map())
        )
    },
    items: {
        total: TOTC_SAMPLE_ITEMS.length,
        byType: Object.fromEntries(
            TOTC_SAMPLE_ITEMS.reduce((map, item) => {
                map.set(item.type, (map.get(item.type) ?? 0) + 1);
                return map;
            }, new Map())
        )
    }
};

export const TOTC_SAMPLE_COMPENDIUMS = {
    actors: "starter-actors",
    items: "starter-items"
};

function normalizeSet(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    return new Set(values.map((value) => String(value)));
}

function shouldInclude(type, setOrNull) {
    if (!setOrNull) return true;
    return setOrNull.has(type);
}

function maybeDeepClone(data) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(data);
    return clone(data);
}

async function withPackUnlocked(pack, fn) {
    const collection = pack.collection;
    let activePack = pack;
    const wasLocked = activePack.locked;

    if (wasLocked) {
        await activePack.configure({ locked: false });

        // Re-acquire the pack so lock-sensitive methods use the updated instance.
        activePack = game.packs.get(collection) ?? activePack;
        if (activePack.locked) {
            throw new Error(`Unable to unlock compendium \"${collection}\" for write operations.`);
        }
    }

    try {
        return await fn(activePack);
    } finally {
        if (wasLocked) {
            await activePack.configure({ locked: true });
        }
    }
}

async function clearCompendiumPack(pack) {
    await pack.getIndex();
    const ids = pack.index.map((entry) => entry._id).filter(Boolean);
    if (!ids.length) return 0;

    return withPackUnlocked(pack, async (activePack) => {
        await activePack.documentClass.deleteDocuments(ids, { pack: activePack.collection });
        return ids.length;
    });
}

async function importIntoCompendium(pack, entries) {
    let imported = 0;

    await withPackUnlocked(pack, async (activePack) => {
        for (const entry of entries) {
            const temporaryDocument = await activePack.documentClass.create(maybeDeepClone(entry), { temporary: true });
            await activePack.importDocument(temporaryDocument);
            imported += 1;
        }
    });

    return imported;
}

export async function createTotcSampleContent({
    createActors = true,
    createItems = true,
    overwrite = false,
    actorTypes = [],
    itemTypes = [],
    limitPerType = 0
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const actorTypeFilter = normalizeSet(actorTypes);
    const itemTypeFilter = normalizeSet(itemTypes);
    const perTypeLimit = Math.max(Number(limitPerType) || 0, 0);

    let createdActors = 0;
    let createdItems = 0;
    let skippedExisting = 0;

    const createdByType = {};
    const attemptedByType = {};

    if (createActors) {
        for (const actorData of TOTC_SAMPLE_ACTORS) {
            if (!shouldInclude(actorData.type, actorTypeFilter)) continue;

            attemptedByType[actorData.type] = (attemptedByType[actorData.type] ?? 0) + 1;
            if (perTypeLimit && attemptedByType[actorData.type] > perTypeLimit) continue;

            const existing = game.actors?.find((actor) => actor.name === actorData.name && actor.type === actorData.type);
            if (existing && !overwrite) {
                skippedExisting += 1;
                continue;
            }
            if (existing && overwrite) await existing.delete();

            await Actor.create(maybeDeepClone(actorData));
            createdActors += 1;
            createdByType[actorData.type] = (createdByType[actorData.type] ?? 0) + 1;
        }
    }

    if (createItems) {
        for (const itemData of TOTC_SAMPLE_ITEMS) {
            if (!shouldInclude(itemData.type, itemTypeFilter)) continue;

            attemptedByType[itemData.type] = (attemptedByType[itemData.type] ?? 0) + 1;
            if (perTypeLimit && attemptedByType[itemData.type] > perTypeLimit) continue;

            const existing = game.items?.find((item) => item.name === itemData.name && item.type === itemData.type);
            if (existing && !overwrite) {
                skippedExisting += 1;
                continue;
            }
            if (existing && overwrite) await existing.delete();

            await Item.create(maybeDeepClone(itemData));
            createdItems += 1;
            createdByType[itemData.type] = (createdByType[itemData.type] ?? 0) + 1;
        }
    }

    return {
        createdActors,
        createdItems,
        totalCreated: createdActors + createdItems,
        skippedExisting,
        createdByType,
        stats: TOTC_SAMPLE_LIBRARY_STATS
    };
}

export async function publishTotcSampleCompendiums({
    overwrite = true,
    actorTypes = [],
    itemTypes = []
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const systemId = game.system?.id;
    const actorPackName = TOTC_SAMPLE_COMPENDIUMS.actors;
    const itemPackName = TOTC_SAMPLE_COMPENDIUMS.items;

    const actorPack = game.packs.get(`${systemId}.${actorPackName}`);
    const itemPack = game.packs.get(`${systemId}.${itemPackName}`);

    if (!actorPack || !itemPack) {
        throw new Error(
            "Declared compendium packs were not found. Reload the world after updating system.json, then try again."
        );
    }

    const actorTypeFilter = normalizeSet(actorTypes);
    const itemTypeFilter = normalizeSet(itemTypes);

    const actorsToImport = TOTC_SAMPLE_ACTORS.filter((entry) => shouldInclude(entry.type, actorTypeFilter));
    const itemsToImport = TOTC_SAMPLE_ITEMS.filter((entry) => shouldInclude(entry.type, itemTypeFilter));

    let clearedActors = 0;
    let clearedItems = 0;
    if (overwrite) {
        clearedActors = await clearCompendiumPack(actorPack);
        clearedItems = await clearCompendiumPack(itemPack);
    }

    const importedActors = await importIntoCompendium(actorPack, actorsToImport);
    const importedItems = await importIntoCompendium(itemPack, itemsToImport);

    return {
        packCollections: {
            actors: actorPack.collection,
            items: itemPack.collection
        },
        importedActors,
        importedItems,
        totalImported: importedActors + importedItems,
        clearedActors,
        clearedItems,
        overwrite
    };
}
