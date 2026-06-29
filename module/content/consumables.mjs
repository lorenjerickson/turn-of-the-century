import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";
import { tickFragmentsForItemAction } from "./action-tick-fragments.mjs";

export const CONSUMABLE_CONFIGS = [
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
                        recapFormat: "{{Owner.name}} drinks {{Item.name}}.",
                        tickNarrativeFragments: tickFragmentsForItemAction("Aetheric Elixir", "consumeBeltElixir"),
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
    },
    {
        name: "Coalbreaker Tonic",
        system: {
            commonName: "Coalbreaker",
            category: "tonic",
            use: { method: "drink" },
            effects: [{ label: "Work Surge", type: "applyModifier", target: "abilities.str.value", formula: "", value: 1, condition: "for 1 scene", notes: html("Briefly boosts strength tasks.") }],
            sideEffects: [{ label: "Crash", type: "applyModifier", target: "abilities.con.value", formula: "", value: -1, condition: "for 10 minutes", notes: html("Fatigue follows the boost.") }]
        }
    },
    {
        name: "Mercury Fever Drops",
        system: {
            commonName: "Fever Drops",
            category: "medicine",
            use: { method: "drink" },
            effects: [{ label: "Reduce Fever", type: "relieveSymptom", target: "fever", formula: "", value: 1, condition: "", notes: html("Suppresses fever symptoms for one scene.") }],
            properties: { tags: ["medical"] }
        }
    },
    {
        name: "Wound Stitch Kit",
        system: {
            commonName: "Stitch Kit",
            category: "surgicalSupply",
            use: { method: "administer" },
            quantity: { value: 2, max: 2, unit: "use" },
            effects: [{ label: "Close Wound", type: "restoreResource", target: "resources.health", formula: "1d4", value: 0, condition: "", notes: html("Stabilizes and restores minor health.") }],
            properties: { tags: ["surgical", "field"] }
        }
    },
    {
        name: "Soot Filter Paste",
        system: {
            commonName: "Filter Paste",
            category: "chemical",
            use: { method: "apply" },
            effects: [{ label: "Air Filter", type: "grantResistance", target: "environmental-smoke", formula: "", value: 1, condition: "for 1 scene", notes: html("Improves resilience to smoke.") }],
            properties: { tags: ["respiratory", "industrial"] }
        }
    },
    {
        name: "Revival Ether",
        system: {
            commonName: "Revival Ether",
            category: "drug",
            use: { method: "inhale" },
            effects: [{ label: "Snap Awake", type: "removePenalty", target: "stunned", formula: "", value: 1, condition: "", notes: html("Can clear brief incapacitation.") }],
            sideEffects: [{ label: "Fogged Focus", type: "applyModifier", target: "skills.investigation.value", formula: "", value: -1, condition: "for 1 scene", notes: html("Sharp analysis suffers briefly.") }],
            properties: { tags: ["ether", "stimulant"], restricted: true }
        }
    },
    {
        name: "Ironlung Vapour Cartridge",
        system: {
            commonName: "Vapour Cartridge",
            description: html("A compressed cylinder of filtered air fitted with a rubber mouthpiece; permits coherent movement through smog, chemical fume, and coal-gas without immediate injury."),
            category: "chemical",
            use: { method: "inhale" },
            quantity: { value: 5, max: 5, unit: "breath" },
            timing: { duration: "5 rounds", recoveryInterval: "short rest" },
            effects: [
                { label: "Clear Breath", type: "grantResistance", target: "suffocation", formula: "", value: 1, condition: "while using cartridge", notes: html("Each use grants one round of breathable air.") }
            ],
            physical: { weight: 0.8, bulk: 0, perishable: true, shelfLife: "6 months" },
            properties: { tags: ["breathing", "industrial", "chemical"] }
        }
    },
    {
        name: "Vital Saline Infusion",
        system: {
            commonName: "Saline Infusion",
            description: html("A glass ampoule of sterile salt solution administered by needle to stabilise blood loss and restore circulatory volume after heavy exertion or wound trauma."),
            category: "medicine",
            use: { method: "inject" },
            effects: [
                { label: "Restore Volume", type: "restoreResource", target: "resources.health", formula: "1d6", value: 0, condition: "", notes: html("Administered over one round.") }
            ],
            sideEffects: [
                { label: "Chill", type: "applyModifier", target: "skills.athletics.value", formula: "", value: -1, condition: "for 10 minutes", notes: html("Cold fluid briefly reduces vigour.") }
            ],
            physical: { weight: 0.4, bulk: 0, perishable: true, shelfLife: "12 months" },
            properties: { tags: ["medical", "restorative"] }
        }
    },
    {
        name: "Acid-Wash Solution",
        system: {
            commonName: "Acid Wash",
            description: html("A stoppered glass vial of dilute vitriol intended for descaling boiler parts; applied to corroded locks or seized mechanisms, it softens both metal and the confidence of their makers."),
            category: "chemical",
            use: { method: "apply" },
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
                        recapFormat: "{{Owner.name}} uses {{Item.name}}.",
                        tickNarrativeFragments: tickFragmentsForItemAction("Acid-Wash Solution", "consumeItem"),
                        notes: ""
                    },
                    createUnlockAction("{{Owner.name}} applies {{Item.name}} and frees the lock.")
                ]
            },
            quantity: { value: 3, max: 3, unit: "application" },
            effects: [
                { label: "Dissolve Obstruction", type: "removePenalty", target: "rusted", formula: "", value: 1, condition: "applied to corroded mechanism", notes: html("Reduces lock difficulty by 2 per application.") }
            ],
            sideEffects: [
                { label: "Acid Fume", type: "causeCondition", target: "eyes", formula: "", value: 1, condition: "if exposed unprotected", notes: html("Inflames mucous membranes without protective eyewear.") }
            ],
            physical: { weight: 0.6, bulk: 0, perishable: false, shelfLife: "indefinite" },
            properties: { tags: ["chemical", "tool"], restricted: true }
        }
    }
];
