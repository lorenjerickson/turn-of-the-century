import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const EFFECT_CONFIGS = [
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
                { label: "Heightened Guard", targetType: "defense", target: "armorClass", path: "", operation: "add", value: 1, formula: "", condition: "", notes: html("Defensive posture improves briefly.") },
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
    },
    {
        name: "Boiler Rattle Panic",
        system: {
            description: html("Violent pressure knocks in the pipes trigger a contagious fear response."),
            disposition: "detrimental",
            category: "morale",
            duration: { value: 1, unit: "scene" },
            impacts: [{ label: "Startled", targetType: "skill", target: "insight", path: "", operation: "add", value: -1, formula: "", condition: "near heavy machinery", notes: html("Judgment is disrupted by noise.") }],
            affectedKeys: { abilities: [], skills: ["insight"], actions: [] }
        }
    },
    {
        name: "Sanitorium Composure",
        system: {
            description: html("Sedation and supervised rest create a fragile calm."),
            disposition: "beneficial",
            category: "medical",
            duration: { value: 8, unit: "hour" },
            impacts: [{ label: "Quiet Mind", targetType: "ability", target: "san", path: "", operation: "add", value: 1, formula: "", condition: "", notes: html("Improves sanity checks while active.") }],
            affectedKeys: { abilities: ["san"], skills: [], actions: [] }
        }
    },
    {
        name: "Electrum Burn",
        system: {
            description: html("A pale electrical burn leaves muscles twitching and unsteady."),
            disposition: "detrimental",
            category: "chemical",
            duration: { value: 20, unit: "minute" },
            impacts: [{ label: "Shaky Grip", targetType: "skill", target: "sleightOfHand", path: "", operation: "add", value: -2, formula: "", condition: "", notes: html("Fine handwork is impaired.") }],
            affectedKeys: { abilities: ["dex"], skills: ["sleightOfHand"], actions: [] }
        }
    },
    {
        name: "Crow-Footed Focus",
        system: {
            description: html("A practiced stance keeps footing stable in cramped streets."),
            disposition: "beneficial",
            category: "sensory",
            duration: { value: 1, unit: "hour" },
            impacts: [{ label: "Urban Balance", targetType: "skill", target: "acrobatics", path: "", operation: "add", value: 1, formula: "", condition: "in urban terrain", notes: html("Improves balance in cluttered environments.") }],
            affectedKeys: { abilities: [], skills: ["acrobatics"], actions: [] }
        }
    },
    {
        name: "Steam-Lung Adaptation",
        system: {
            description: html("Repeated exposure grants short-term resilience to fumes."),
            disposition: "mixed",
            category: "physical",
            duration: { value: 1, unit: "day" },
            impacts: [{ label: "Fume Tolerance", targetType: "resource", target: "resources.grit", path: "", operation: "add", value: 1, formula: "", condition: "in polluted zones", notes: html("Improves grit under smog pressure.") }],
            affectedKeys: { abilities: ["con"], skills: [], actions: [] }
        }
    },
    {
        name: "Vapour Blindness",
        system: {
            description: html("Exposure to caustic vapour or bright chemical flash inflames the corneas and obscures vision for a distressing interval."),
            disposition: "detrimental",
            category: "chemical",
            duration: { value: 1, unit: "scene" },
            impacts: [
                { label: "Compromised Sight", targetType: "skill", target: "perception", path: "", operation: "add", value: -2, formula: "", condition: "while affected", notes: html("Heavily penalises sight-dependent tasks.") }
            ],
            affectedKeys: { abilities: ["dex"], skills: ["perception", "investigation"], actions: [] },
            removal: { removable: true, method: "Clean water irrigation and resting in darkness", difficulty: 10 }
        }
    },
    {
        name: "Surgical Fever",
        system: {
            description: html("Post-operative inflammation; the body answers even competent surgery with a brief and alarming elevation of temperature."),
            disposition: "detrimental",
            category: "medical",
            duration: { value: 1, unit: "day" },
            impacts: [
                { label: "Febrile State", targetType: "ability", target: "con", path: "", operation: "add", value: -1, formula: "", condition: "while feverish", notes: html("Penalties to constitution-based tests.") },
                { label: "Heightened Sensitivity", targetType: "ability", target: "san", path: "", operation: "add", value: 1, formula: "", condition: "while feverish", notes: html("Dreams and perceptions become unusually vivid.") }
            ],
            affectedKeys: { abilities: ["con", "san"], skills: ["athletics"], actions: [] },
            removal: { removable: true, method: "Physician-prescribed rest and febrifuge", difficulty: 10 }
        }
    }
];
