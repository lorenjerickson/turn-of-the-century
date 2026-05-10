/**
 * Enhanced Encounter Seeding Templates
 * 
 * Provides detailed encounter seed templates with:
 * - NPC/adversary profiles with stat variants
 * - Faction metadata and objectives
 * - Terrain features and cover mechanics
 * - Scripted escalation triggers
 * - Regional thematic variations
 * - Loot tables and story hooks
 */

/**
 * NPC/Adversary profile definitions for instantiation
 * Each profile can be instantiated into actual Actor documents
 */
export const ADVERSARY_PROFILES = Object.freeze({
    // Frontier profiles
    banditLookout: {
        name: "Bandit Lookout",
        type: "pawn",
        role: "scout",
        faction: "frontier-raiders",
        difficulty: "standard",
        equipment: ["rifle", "knife"],
        skills: { perception: 3, survival: 2 },
        healthBonus: 0,
        notes: "Spotter role; escapes if alerted"
    },
    banditRifleman: {
        name: "Bandit Rifleman",
        type: "pawn",
        role: "ranged",
        faction: "frontier-raiders",
        difficulty: "standard",
        equipment: ["rifle", "sidearm", "ammo-pack"],
        skills: { marksmanship: 3, tactics: 1 },
        healthBonus: 2,
        notes: "Damage dealer; occupies high ground when possible"
    },
    mountedCutthroat: {
        name: "Mounted Cutthroat",
        type: "pawn",
        role: "cavalry",
        faction: "frontier-raiders",
        difficulty: "hard",
        equipment: ["saber", "revolver", "horse"],
        skills: { melee: 3, riding: 2 },
        healthBonus: 4,
        notes: "Mobile; harasses flanks; mounted combat specialist"
    },
    direHound: {
        name: "Dire Hound",
        type: "pawn",
        role: "beast",
        faction: "predators",
        difficulty: "standard",
        equipment: [],
        skills: { melee: 2, hunting: 3, endurance: 2 },
        healthBonus: 3,
        notes: "Pack animal; +1 bonus in groups"
    },
    alphaStalker: {
        name: "Alpha Stalker",
        type: "pawn",
        role: "beast-leader",
        faction: "predators",
        difficulty: "hard",
        equipment: [],
        skills: { melee: 3, hunting: 4, tactics: 2 },
        healthBonus: 6,
        notes: "Pack leader; other beasts follow; primal intelligence"
    },

    // Urban profiles
    streetEnforcer: {
        name: "Street Enforcer",
        type: "pawn",
        role: "melee",
        faction: "urban-gang",
        difficulty: "standard",
        equipment: ["truncheon", "armor-jacket", "knife"],
        skills: { melee: 3, intimidation: 2 },
        healthBonus: 2,
        notes: "Territory control; uses crowd as cover"
    },
    lookout: {
        name: "Lookout",
        type: "pawn",
        role: "scout",
        faction: "urban-gang",
        difficulty: "standard",
        equipment: ["whistle", "knife", "camera"],
        skills: { perception: 3, streetwise: 2 },
        healthBonus: 0,
        notes: "Signal specialist; calls for reinforcements"
    },
    saboteur: {
        name: "Saboteur",
        type: "pawn",
        role: "specialist",
        faction: "urban-gang",
        difficulty: "hard",
        equipment: ["explosives", "detonator", "tools", "sidearm"],
        skills: { engineering: 3, tactics: 2, precision: 2 },
        healthBonus: 2,
        notes: "Objective specialist; can plant or disable traps"
    },
    agitator: {
        name: "Agitator",
        type: "pawn",
        role: "crowd-control",
        faction: "riot-mob",
        difficulty: "standard",
        equipment: ["sign", "torch", "voice"],
        skills: { persuasion: 3, streetwise: 2 },
        healthBonus: 1,
        notes: "Inflames crowd; crowd grows if agitator free"
    },
    militiaSkirmisher: {
        name: "Militia Skirmisher",
        type: "pawn",
        role: "ranged",
        faction: "militia",
        difficulty: "standard",
        equipment: ["rifle", "bayonet", "ammo-pack"],
        skills: { marksmanship: 2, tactics: 2 },
        healthBonus: 1,
        notes: "Disciplined formation fighter"
    },

    // Industrial profiles
    saboteurEngineer: {
        name: "Saboteur Engineer",
        type: "pawn",
        role: "specialist",
        faction: "industrial-saboteurs",
        difficulty: "hard",
        equipment: ["explosives", "engineering-kit", "detonators", "wrench"],
        skills: { engineering: 4, precision: 2, tactics: 1 },
        healthBonus: 2,
        notes: "Critical objective; must reach terminal before detonation"
    },
    guardGunner: {
        name: "Guard Gunner",
        type: "pawn",
        role: "ranged",
        faction: "rail-security",
        difficulty: "standard",
        equipment: ["rifle", "armor-vest", "ammo-pack"],
        skills: { marksmanship: 3, tactics: 1 },
        healthBonus: 3,
        notes: "Defensive position; covers entrance"
    },
    strikebreaker: {
        name: "Strikebreaker",
        type: "pawn",
        role: "melee",
        faction: "corp-forces",
        difficulty: "standard",
        equipment: ["baton", "armor-jacket", "gas-mask"],
        skills: { melee: 3, intimidation: 2 },
        healthBonus: 2,
        notes: "Crowd dispersal specialist"
    },
    foremanBrute: {
        name: "Foreman Brute",
        type: "pawn",
        role: "leader",
        faction: "corp-forces",
        difficulty: "hard",
        equipment: ["sledgehammer", "heavy-armor"],
        skills: { melee: 3, leadership: 2, endurance: 2 },
        healthBonus: 6,
        notes: "Boss unit; morale anchor for other strikebreakers"
    },

    // Wilderness profiles
    feralStalker: {
        name: "Feral Stalker",
        type: "pawn",
        role: "hunter",
        faction: "feral-fauna",
        difficulty: "standard",
        equipment: [],
        skills: { melee: 2, hunting: 3, stealth: 2 },
        healthBonus: 3,
        notes: "Ambush predator; uses terrain cover"
    },
    broodMatriarch: {
        name: "Brood Matriarch",
        type: "pawn",
        role: "beast-leader",
        faction: "feral-fauna",
        difficulty: "hard",
        equipment: [],
        skills: { melee: 3, hunting: 4, endurance: 3 },
        healthBonus: 8,
        notes: "Mother creature; defends nest fiercely"
    },
    packHunter: {
        name: "Pack Hunter",
        type: "pawn",
        role: "scout",
        faction: "feral-fauna",
        difficulty: "standard",
        equipment: [],
        skills: { melee: 2, hunting: 3, perception: 2 },
        healthBonus: 2,
        notes: "Pack member; flees if isolated"
    },
    trackerAlpha: {
        name: "Tracker Alpha",
        type: "pawn",
        role: "leader",
        faction: "feral-fauna",
        difficulty: "hard",
        equipment: [],
        skills: { melee: 3, hunting: 4, tactics: 2 },
        healthBonus: 5,
        notes: "Pack coordinator; coordinate attacks on single targets"
    }
});

/**
 * Faction metadata: objectives, relationships, escalation triggers
 */
export const FACTION_METADATA = Object.freeze({
    "frontier-raiders": {
        name: "Frontier Raiders",
        objective: "Ambush and loot caravan",
        alignment: "hostile",
        reinforcementTrigger: "alarm-horn-after-3-rounds",
        surrenderThreshold: 0.5,
        lootProbability: 0.7,
        cruelty: "moderate",
        terrainAdaptations: {
            ridgeline: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 },
            brushPass: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 },
            alleyGrid: { coverBonusModifier: 0, mobilityPenaltyModifier: 1 },
            marketSquare: { coverBonusModifier: -1, mobilityPenaltyModifier: -1 }
        }
    },
    predators: {
        name: "Predatory Fauna",
        objective: "Scatter supplies and feed",
        alignment: "neutral",
        reinforcementTrigger: "second-pack-emerges-rear",
        surrenderThreshold: 0.3,
        lootProbability: 0.1,
        cruelty: "high",
        terrainAdaptations: {
            ridgeline: { coverBonusModifier: 0, mobilityPenaltyModifier: -1 },
            brushPass: { coverBonusModifier: 0, mobilityPenaltyModifier: 0 },
            forest: { coverBonusModifier: 0, mobilityPenaltyModifier: -2 },
            swamp: { coverBonusModifier: 0, mobilityPenaltyModifier: -2 }
        }
    },
    "urban-gang": {
        name: "Urban Gang",
        objective: "Control territory and extract tribute",
        alignment: "hostile",
        reinforcementTrigger: "watch-arrives-round-4",
        surrenderThreshold: 0.6,
        lootProbability: 0.5,
        cruelty: "moderate",
        terrainAdaptations: {
            alleyGrid: { coverBonusModifier: 1, mobilityPenaltyModifier: -1 },
            marketSquare: { coverBonusModifier: 0, mobilityPenaltyModifier: 0 },
            rooftopChase: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 }
        }
    },
    "riot-mob": {
        name: "Riot Mob",
        objective: "Overwhelm and disperse",
        alignment: "hostile",
        reinforcementTrigger: "fire-spreads-each-round",
        surrenderThreshold: 0.2,
        lootProbability: 0.0,
        cruelty: "moderate",
        terrainAdaptations: {
            marketSquare: { coverBonusModifier: -1, mobilityPenaltyModifier: 0 },
            alleyGrid: { coverBonusModifier: 0, mobilityPenaltyModifier: 1 }
        }
    },
    militia: {
        name: "Civic Militia",
        objective: "Arrest or disperse",
        alignment: "unfriendly",
        reinforcementTrigger: "backup-patrol-round-5",
        surrenderThreshold: 0.8,
        lootProbability: 0.2,
        cruelty: "low",
        terrainAdaptations: {
            alleyGrid: { coverBonusModifier: 0, mobilityPenaltyModifier: -1 },
            marketSquare: { coverBonusModifier: -1, mobilityPenaltyModifier: -1 },
            fortifiedPosition: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 }
        }
    },
    "industrial-saboteurs": {
        name: "Industrial Saboteurs",
        objective: "Destroy critical infrastructure",
        alignment: "hostile",
        reinforcementTrigger: "secondary-team-round-3",
        surrenderThreshold: 0.4,
        lootProbability: 0.3,
        cruelty: "low",
        terrainAdaptations: {
            factoryFloor: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 },
            machineVault: { coverBonusModifier: 1, mobilityPenaltyModifier: -1 }
        }
    },
    "rail-security": {
        name: "Rail Security",
        objective: "Defend switching station",
        alignment: "neutral",
        reinforcementTrigger: "guard-rotation-round-4",
        surrenderThreshold: 0.7,
        lootProbability: 0.1,
        cruelty: "low",
        terrainAdaptations: {
            trainCars: { coverBonusModifier: 1, mobilityPenaltyModifier: -1 },
            switchingYard: { coverBonusModifier: 0, mobilityPenaltyModifier: -1 },
            railStation: { coverBonusModifier: 0, mobilityPenaltyModifier: 0 }
        }
    },
    "corp-forces": {
        name: "Corporate Strike Force",
        objective: "Suppress labor action",
        alignment: "hostile",
        reinforcementTrigger: "additional-squad-round-6",
        surrenderThreshold: 0.5,
        lootProbability: 0.2,
        cruelty: "moderate",
        terrainAdaptations: {
            fortifiedPosition: { coverBonusModifier: 1, mobilityPenaltyModifier: 0 },
            factoryFloor: { coverBonusModifier: 0, mobilityPenaltyModifier: 0 },
            openCourt: { coverBonusModifier: -1, mobilityPenaltyModifier: 0 }
        }
    },
    "feral-fauna": {
        name: "Feral Fauna",
        objective: "Protect nest and hunt",
        alignment: "neutral",
        reinforcementTrigger: "hatch-eggs-round-5",
        surrenderThreshold: 0.2,
        lootProbability: 0.0,
        cruelty: "high",
        terrainAdaptations: {
            nest: { coverBonusModifier: 0, mobilityPenaltyModifier: -3 },
            forest: { coverBonusModifier: 0, mobilityPenaltyModifier: -1 },
            swamp: { coverBonusModifier: 0, mobilityPenaltyModifier: -1 }
        }
    }
});

/**
 * Terrain features and environmental hazards for combat encounters
 */
export const TERRAIN_FEATURES = Object.freeze({
    // Frontier
    ridgeline: {
        name: "Broken Ridgeline",
        region: "frontier",
        coverBonus: 2,
        mobilityPenalty: -1,
        features: ["rocks", "elevation-changes", "wagon-cover"],
        hazards: []
    },
    brushPass: {
        name: "Narrow Pass with Brush",
        region: "frontier",
        coverBonus: 1,
        mobilityPenalty: -2,
        features: ["dense-brush", "limited-visibility", "ambush-friendly"],
        hazards: ["low-visibility"]
    },

    // Urban
    alleyGrid: {
        name: "Dense Alleys and Rooftops",
        region: "urban",
        coverBonus: 2,
        mobilityPenalty: 0,
        features: ["elevated-rooftops", "narrow-alleys", "crowd-cover"],
        hazards: []
    },
    marketSquare: {
        name: "Crowded Market Square",
        region: "urban",
        coverBonus: 1,
        mobilityPenalty: -1,
        features: ["merchant-stalls", "civilian-crowd", "barricades"],
        hazards: ["collateral-damage-risk"]
    },

    // Industrial
    railYard: {
        name: "Rail Yard with Catwalks",
        region: "industrial",
        coverBonus: 1,
        mobilityPenalty: 0,
        features: ["catwalks", "steam-vents", "heavy-machinery"],
        hazards: ["steam-jets", "collision-risk"]
    },
    factoryGate: {
        name: "Factory Gate with Heavy Machinery",
        region: "industrial",
        coverBonus: 2,
        mobilityPenalty: -1,
        features: ["heavy-machinery", "loading-crane", "chain-drive"],
        hazards: ["machinery-hazard"]
    },

    // Wilderness
    rockyBasin: {
        name: "Rocky Basin with Ledges",
        region: "wilds",
        coverBonus: 2,
        mobilityPenalty: -1,
        features: ["rocky-outcrops", "elevation-changes", "unstable-ledges"],
        hazards: ["falling-hazard"]
    },
    foggyTreeline: {
        name: "Foggy Treeline and Marsh",
        region: "wilds",
        coverBonus: 1,
        mobilityPenalty: -2,
        features: ["dense-trees", "shallow-marsh", "fog"],
        hazards: ["low-visibility", "swamp-slowdown"]
    }
});

/**
 * Escalation triggers: define how encounters escalate during combat
 */
export const ESCALATION_TRIGGERS = Object.freeze({
    "reinforcement-horn": {
        name: "Reinforcement Horn Signal",
        triggerCondition: "round-3-if-leader-alive",
        effect: "+2 enemies spawn at battlefield edge",
        counterplay: "Silence the horn or the leader"
    },
    "second-pack-emerges": {
        name: "Second Pack Emerges from Rear",
        triggerCondition: "round-2-or-on-initial-contact",
        effect: "+3 predators attack from rear",
        counterplay: "Establish rear guard or rapid advance"
    },
    "city-watch-arrives": {
        name: "City Watch Arrives",
        triggerCondition: "round-4-or-on-alarm-trigger",
        effect: "Authority faction arrives (may aid or complicate)",
        counterplay: "Avoid witness or bribe the watch"
    },
    "fire-spreads": {
        name: "Fire Spreads Each Round",
        triggerCondition: "round-1-ongoing",
        effect: "Safe zone shrinks; cumulative damage tick each round",
        counterplay: "Extinguish fire sources or rapid extraction"
    },
    "boiler-vents": {
        name: "Boiler Pressure Vents",
        triggerCondition: "round-3-or-critical-damage",
        effect: "Steam jets create hazard zones; partial cover destroyed",
        counterplay: "Vent pressure manually or avoid steam jets"
    },
    "hatch-eggs": {
        name: "Egg Clusters Hatch",
        triggerCondition: "round-5-if-nest-not-destroyed",
        effect: "+1d4 new creatures spawn",
        counterplay: "Destroy eggs or retreat before hatching"
    },
    "loading-crane-collapse": {
        name: "Loading Crane Collapses",
        triggerCondition: "crane-damaged-twice-or-round-4",
        effect: "Crane falls; destroys cover and creates new hazard",
        counterplay: "Stabilize crane or use collapse to crush enemies"
    }
});

/**
 * Loot tables by faction and difficulty
 */
export const LOOT_TABLES = Object.freeze({
    "frontier-raiders": {
        standard: ["5d10 gbp", "1x rifle", "ammunition", "rations"],
        hard: ["10d10 gbp", "2x rifle", "ammunition", "rations", "1x horse"]
    },
    predators: {
        standard: ["0 gbp", "bones", "hide", "teeth"],
        hard: ["0 gbp", "premium-hide", "fangs"]
    },
    "urban-gang": {
        standard: ["3d10 gbp", "knife", "documents"],
        hard: ["6d10 gbp", "2x knife", "documents", "stolen-goods"]
    },
    "rail-security": {
        standard: ["2d10 gbp", "rifle", "security-badge"],
        hard: ["4d10 gbp", "2x rifle", "security-credential", "ammunition"]
    },
    "corp-forces": {
        standard: ["4d10 gbp", "armor-vest", "baton"],
        hard: ["8d10 gbp", "premium-armor", "2x baton", "corporate-documents"]
    },
    "feral-fauna": {
        standard: ["0 gbp"],
        hard: ["0 gbp", "rare-hide"]
    }
});

/**
 * Story hooks and narrative triggers for each encounter seed
 */
export const NARRATIVE_HOOKS = Object.freeze({
    "frontier-raiders": {
        preEncounter: "The road ahead narrows. Distant smoke rises from abandoned farmsteads.",
        combat: "A horn blast echoes through the pass—coordinated attack incoming.",
        victory: "Among their camp: a map marking several other caravans headed this way.",
        defeat: "They drag supplies eastward, laughing. One mentions 'the boss' by a river crossing."
    },
    predators: {
        preEncounter: "Fresh kill site. The predators know you're here.",
        combat: "Desperate snarls and the drumming of paws—they're coordinated hunters.",
        victory: "You find a den with stolen gear from prior travelers.",
        defeat: "You hear offspring cries from the nest... they're protecting young."
    },
    "urban-gang": {
        preEncounter: "The street suddenly feels very tight. Graffiti marks this territory.",
        combat: "A whistle signals reinforcements. The gang moves with brutal efficiency.",
        victory: "Their hideout contains ledgers naming protection racket victims.",
        defeat: "They drag you into an alley. This is their domain."
    },
    "industrial-saboteurs": {
        preEncounter: "The rail yard is quiet. Too quiet. A fuse box lies exposed.",
        combat: "An explosion—they're faster than expected. The station is their target.",
        victory: "Intercepted orders reveal their employer—a rival corporation.",
        defeat: "The switching junction explodes. Your train never leaves."
    },
    "feral-fauna": {
        preEncounter: "Bone piles and matted fur. This is their territory.",
        combat: "The nest. Protective rage. Eggs crack at your approach.",
        victory: "Strange tech in the nest—not natural. Something genetic was done to them.",
        defeat: "You hear the victory snarls of your predators as darkness claims you."
    }
});

/**
 * Instantiate an encounter seed into combat participants
 * Returns actor profiles ready for Actor document creation
 */
export function instantiateEncounterSeed(seed, difficultyOverride = null) {
    if (!seed) return [];

    const difficulty = difficultyOverride || seed.difficulty || "standard";
    const adversaries = seed.adversaries || [];

    return adversaries.map((adversaryName) => {
        const profile = ADVERSARY_PROFILES[toCamelCase(adversaryName)];
        if (!profile) {
            console.warn(`[Encounter] Unknown adversary profile: ${adversaryName}`);
            return null;
        }

        const instantiated = foundry.utils.deepClone(profile);
        
        // Apply difficulty modifiers
        if (difficulty === "hard") {
            instantiated.healthBonus = Math.ceil(instantiated.healthBonus * 1.25);
            Object.keys(instantiated.skills || {}).forEach((skill) => {
                instantiated.skills[skill] = Math.min(5, instantiated.skills[skill] + 1);
            });
        }

        return instantiated;
    }).filter(Boolean);
}

/**
 * Get escalation trigger for a seed
 */
export function getEscalationTrigger(seed) {
    const escalationHint = seed.escalationHint || "";
    
    // Map hint text to trigger key
    if (escalationHint.includes("horn")) return ESCALATION_TRIGGERS["reinforcement-horn"];
    if (escalationHint.includes("pack")) return ESCALATION_TRIGGERS["second-pack-emerges"];
    if (escalationHint.includes("watch")) return ESCALATION_TRIGGERS["city-watch-arrives"];
    if (escalationHint.includes("fire")) return ESCALATION_TRIGGERS["fire-spreads"];
    if (escalationHint.includes("boiler")) return ESCALATION_TRIGGERS["boiler-vents"];
    if (escalationHint.includes("hatch")) return ESCALATION_TRIGGERS["hatch-eggs"];
    if (escalationHint.includes("crane")) return ESCALATION_TRIGGERS["loading-crane-collapse"];

    return null;
}

/**
 * Get terrain feature by name
 */
export function getTerrainFeature(terrainName) {
    if (!terrainName) return null;
    
    const key = toCamelCase(terrainName);
    return Object.values(TERRAIN_FEATURES).find(
        (t) => toCamelCase(t.name) === key || Object.keys(TERRAIN_FEATURES).some(
            (k) => toCamelCase(TERRAIN_FEATURES[k].name) === key
        )
    );
}

/**
 * Get narrative hooks for faction
 */
export function getNarrativeHooks(factionKey) {
    return NARRATIVE_HOOKS[factionKey] || NARRATIVE_HOOKS["frontier-raiders"];
}

/**
 * Get faction metadata
 */
export function getFactionMetadata(factionKey) {
    return FACTION_METADATA[factionKey] || FACTION_METADATA["frontier-raiders"];
}

/**
 * Roll loot from a faction table
 */
export function rollLoot(factionKey, difficulty = "standard") {
    const lootTable = LOOT_TABLES[factionKey];
    if (!lootTable) return [];
    
    const items = lootTable[difficulty] || lootTable.standard || [];
    return foundry.utils.deepClone(items);
}

/**
 * Apply faction-specific terrain adaptations to base terrain modifiers
 * @param {Object} terrain - Base terrain feature object
 * @param {string} factionKey - Faction key for adaptation lookup
 * @returns {Object} Terrain with faction adaptations applied
 */
export function applyFactionTerrainAdaptations(terrain, factionKey) {
    if (!terrain || !factionKey) return terrain;
    
    const faction = getFactionMetadata(factionKey);
    if (!faction?.terrainAdaptations) return terrain;
    
    // Find the terrain key that matches the current terrain
    const terrainKeys = Object.keys(TERRAIN_FEATURES);
    const terrainKey = terrainKeys.find(
        (k) => TERRAIN_FEATURES[k]?.name === terrain.name
    );
    
    if (!terrainKey || !faction.terrainAdaptations[terrainKey]) {
        return terrain;
    }
    
    // Apply adaptations
    const adaptation = faction.terrainAdaptations[terrainKey];
    return {
        ...terrain,
        coverBonus: (terrain.coverBonus ?? 0) + (adaptation.coverBonusModifier ?? 0),
        mobilityPenalty: (terrain.mobilityPenalty ?? 0) + (adaptation.mobilityPenaltyModifier ?? 0),
        factionAdapted: true,
        adaptationDetails: {
            factionKey,
            factionName: faction.name,
            baseTerrainModifiers: {
                coverBonus: terrain.coverBonus ?? 0,
                mobilityPenalty: terrain.mobilityPenalty ?? 0
            },
            adaptationModifiers: adaptation
        }
    };
}

/**
 * Get all terrain adaptations for a specific faction
 * @param {string} factionKey - Faction key for lookup
 * @returns {Object|null} Faction terrain adaptations with metadata
 */
export function getFactionTerrainAdaptations(factionKey) {
    const faction = getFactionMetadata(factionKey);
    if (!faction?.terrainAdaptations) return null;
    
    return {
        factionKey,
        factionName: faction.name,
        terrainAdaptations: faction.terrainAdaptations
    };
}

/**
 * Get full encounter context with all metadata
 */
export function buildEncounterContext(seed, region) {
    const escalation = getEscalationTrigger(seed);
    const baseTerrain = getTerrainFeature(seed.terrain);
    const factionKey = seed.adversaries?.[0]?.toLowerCase() || "frontier-raiders";
    const faction = getFactionMetadata(factionKey);
    const narrative = getNarrativeHooks(factionKey);
    
    // Apply faction-specific terrain adaptations
    const terrain = applyFactionTerrainAdaptations(baseTerrain, factionKey);

    return {
        seed,
        region,
        escalation,
        terrain,
        faction,
        narrative,
        difficulty: seed.difficulty || "standard",
        instantiatedProfiles: instantiateEncounterSeed(seed),
        loot: rollLoot(factionKey, seed.difficulty || "standard")
    };
}

/**
 * Helper: convert string to camelCase
 */
function toCamelCase(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .split("-")
        .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join("");
}
