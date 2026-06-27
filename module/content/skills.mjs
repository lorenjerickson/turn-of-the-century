import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const SKILL_ITEM_CONFIGS = [
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
    },
    {
        name: "Boiler Safety Drill",
        img: "icons/tools/smithing/furnace-fire-orange.webp",
        system: {
            commonName: "Safety Drill",
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Identify imminent pressure hazards.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["skill", "industrial"] }
        }
    },
    {
        name: "Canal Navigation",
        img: "icons/environment/wilderness/river.webp",
        system: {
            commonName: "Canal Navigation",
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "survival", difficulty: 10, purpose: html("Chart routes through locks and floodgates.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["skill", "navigation"] }
        }
    },
    {
        name: "Forensic Photography",
        img: "icons/tools/hand/camera-brass.webp",
        system: {
            commonName: "Forensic Photo",
            category: "instrument",
            use: { requiresHands: false, skillCheck: { skill: "investigation", difficulty: 11, purpose: html("Capture and preserve scene evidence.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["skill", "forensic"] }
        }
    },
    {
        name: "Steamworks Negotiation",
        img: "icons/skills/social/diplomacy-peace.webp",
        system: {
            commonName: "Labor Mediation",
            category: "miscellaneous",
            use: { requiresHands: false, skillCheck: { skill: "persuasion", difficulty: 11, purpose: html("Negotiate disputes among crews and foremen.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["skill", "social"] }
        }
    },
    {
        name: "Subterranean Recon",
        img: "icons/environment/underground/cave-entrance.webp",
        system: {
            commonName: "Tunnel Recon",
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "perception", difficulty: 10, purpose: html("Read signs and threats in underground passages.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            properties: { tags: ["skill", "recon"] }
        }
    },
    {
        name: "Aerial Navigation",
        img: "icons/environment/wilderness/weather-wind-gusts.webp",
        system: {
            commonName: "Aerial Navigation",
            description: html("Compass reading, barometric trend recognition, and chart correction for high-altitude travel by aerostat or mountain traverse."),
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "survival", difficulty: 12, purpose: html("Plan or execute movement above the treeline or in unpredictable airstreams.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "navigation", "expedition"] }
        }
    },
    {
        name: "Mechanism Disassembly",
        img: "icons/tools/hand/tool-cog-yellow.webp",
        system: {
            commonName: "Mechanism Disassembly",
            description: html("A precise discipline for removing, cataloguing, and reassembling mechanical components without loss or damage; useful for both study and deliberate interference."),
            category: "tool",
            use: { requiresHands: false, skillCheck: { skill: "investigation", difficulty: 11, purpose: html("Take apart a mechanical assembly and reassemble it, or identify its original design from its parts.") } },
            physical: { weight: 0, bulk: 0, quantity: 1, unit: "training" },
            value: { price: 0, currency: "pounds" },
            properties: { tags: ["skill", "industrial", "mechanical"] }
        }
    }
];
