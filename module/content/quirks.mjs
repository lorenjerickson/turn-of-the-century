import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const QUIRK_CONFIGS = [
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
    },
    {
        name: "Smoke-Honed Eyes",
        system: {
            description: html("Can pick movement from haze where others see only soot."),
            source: { type: "other", label: "Foundry Exposure" },
            effects: [{ label: "Haze Sight", targetType: "skill", target: "perception", operation: "add", value: 1, path: "", condition: "in smoke", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Tunnel Step",
        system: {
            description: html("Footwork adapted for slick stone, rails, and maintenance ladders."),
            source: { type: "profession", label: "Canal Inspector" },
            effects: [{ label: "Sure Footing", targetType: "skill", target: "acrobatics", operation: "add", value: 1, path: "", condition: "in cramped terrain", appliesWhenEncumbered: true }]
        }
    },
    {
        name: "Cold Telegraph Nerves",
        system: {
            description: html("Keeps hands steady while decoding urgent or threatening dispatches."),
            source: { type: "profession", label: "Signal Cryptographer" },
            effects: [{ label: "Steady Decode", targetType: "skill", target: "history", operation: "add", value: 1, path: "", condition: "during codework", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Gallows Humor",
        system: {
            description: html("Dark wit that keeps panic from taking hold in grim company."),
            source: { type: "other", label: "Field Experience" },
            effects: [{ label: "Morale Lift", targetType: "skill", target: "persuasion", operation: "add", value: 1, path: "", condition: "under stress", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Iron Grip",
        system: {
            description: html("A crushing hold practiced in docks, mills, and prison yards."),
            source: { type: "profession", label: "Railway Marshal" },
            effects: [{ label: "Hold Fast", targetType: "skill", target: "athletics", operation: "add", value: 1, path: "", condition: "during grapples", appliesWhenEncumbered: true }]
        }
    },
    {
        name: "Compass Bone",
        system: {
            description: html("A residual sense of true north, confirmed by years of high-altitude navigation and refined by intimate acquaintance with the magnetics of the upper atmosphere."),
            source: { type: "profession", label: "Railway Marshal" },
            effects: [{ label: "Innate Bearing", targetType: "skill", target: "survival", operation: "add", value: 1, path: "", condition: "outdoors or in unfamiliar terrain", appliesWhenEncumbered: false }]
        }
    },
    {
        name: "Parish Memory",
        system: {
            description: html("A chaplain's trained recall for names, dates, and family connections preserves genealogical links others overlook or entirely misremember."),
            source: { type: "profession", label: "Field Surgeon" },
            effects: [{ label: "Recorded Connections", targetType: "skill", target: "history", operation: "add", value: 1, path: "", condition: "when recalling social or family links", appliesWhenEncumbered: false }]
        }
    }
];
