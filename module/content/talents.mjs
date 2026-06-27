import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const TALENT_CONFIGS = [
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
    },
    {
        name: "Furnace Rhythm",
        img: "icons/magic/fire/flame-burning-furnace.webp",
        system: {
            commonName: "Furnace Rhythm",
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "athletics", difficulty: 10, purpose: html("Maintain pace during exhausting labor or combat.") } },
            effects: [{ label: "Work Tempo", targetType: "skill", target: "athletics", operation: "add", value: 1, formula: "", condition: "during sustained exertion", notes: html("Improves endurance checks.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["talent", "industrial"] }
        }
    },
    {
        name: "Counter-Snare Reflex",
        img: "icons/skills/movement/arrow-upward-yellow.webp",
        system: {
            commonName: "Counter-Snare",
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "acrobatics", difficulty: 11, purpose: html("Avoid wires, hooks, and trip snares.") } },
            effects: [{ label: "Trap Evasion", targetType: "skill", target: "acrobatics", operation: "add", value: 1, formula: "", condition: "against physical traps", notes: html("Improves evasive movement.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["talent", "defense"] }
        }
    },
    {
        name: "Battlefield Triage",
        img: "icons/skills/wounds/blood-drip-droplet-red.webp",
        system: {
            commonName: "Field Triage",
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "medicine", difficulty: 11, purpose: html("Prioritize and stabilize multiple casualties.") } },
            effects: [{ label: "Rapid Stabilize", targetType: "skill", target: "medicine", operation: "add", value: 1, formula: "", condition: "during active crisis", notes: html("Improves emergency care checks.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["talent", "medical"] }
        }
    },
    {
        name: "Quiet Hands",
        img: "icons/skills/melee/hand-grip-staff-brown.webp",
        system: {
            commonName: "Quiet Hands",
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "sleightOfHand", difficulty: 10, purpose: html("Manipulate tools and locks silently.") } },
            effects: [{ label: "Silent Work", targetType: "skill", target: "sleightOfHand", operation: "add", value: 1, formula: "", condition: "while concealed", notes: html("Improves covert manipulation.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["talent", "covert"] }
        }
    },
    {
        name: "Last-Light Resolve",
        img: "icons/magic/light/explosion-star-small-yellow.webp",
        system: {
            commonName: "Last-Light",
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "insight", difficulty: 10, purpose: html("Remain focused as allies falter.") } },
            effects: [{ label: "Steady Nerve", targetType: "ability", target: "san", operation: "add", value: 1, formula: "", condition: "when outnumbered", notes: html("Grants composure in dire scenes.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["talent", "morale"] }
        }
    },
    {
        name: "Storm Orientation",
        img: "icons/environment/wilderness/weather-wind.webp",
        system: {
            commonName: "Storm Orientation",
            description: html("Maintains a working sense of direction through fog, downpour, soot-cloud, and near-darkness by reading wind, pressure, and ground slope."),
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "survival", difficulty: 11, purpose: html("Maintain bearing and navigation in severe atmospheric conditions.") } },
            effects: [{ label: "Weather Sense", targetType: "skill", target: "survival", operation: "add", value: 1, formula: "", condition: "in adverse weather", notes: html("Applies during storms, smog, and low-visibility scenes.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "expedition"] }
        }
    },
    {
        name: "Code-Breaker's Eye",
        img: "icons/sundries/books/book-stack.webp",
        system: {
            commonName: "Code-Breaker's Eye",
            description: html("Trained pattern recognition in written material; identifies recurring substitutions, transposition schemes, and steganographic concealment in ordinary documents."),
            category: "miscellaneous",
            use: { actionCost: 0, requiresHands: false, skillCheck: { skill: "history", difficulty: 12, purpose: html("Identify cipher type and suggest probable key structure.") } },
            effects: [{ label: "Pattern Recognition", targetType: "skill", target: "history", operation: "add", value: 1, formula: "", condition: "when analysing written ciphers", notes: html("Improves decoding checks.") }],
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["talent", "cipher", "analytical"] }
        }
    }
];
