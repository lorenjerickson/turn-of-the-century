import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const ITEM_CONFIGS = [
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
            slot: "torso",
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
    },
    {
        name: "Station Pass Ledger",
        img: "icons/sundries/books/book-clasp-red.webp",
        system: {
            commonName: "Pass Ledger",
            category: "document",
            slot: "belt",
            use: { skillCheck: { skill: "history", difficulty: 10, purpose: html("Verify routes, permits, and signatures.") } },
            physical: { weight: 0.6, bulk: 0, quantity: 1, unit: "book" },
            properties: { tags: ["records", "rail"] }
        }
    },
    {
        name: "Folded Street Atlas",
        img: "icons/sundries/documents/map-folded-leather.webp",
        system: {
            commonName: "Street Atlas",
            category: "document",
            slot: "belt",
            use: { skillCheck: { skill: "investigation", difficulty: 9, purpose: html("Trace routes and hidden alleys.") } },
            physical: { weight: 0.3, bulk: 0, quantity: 1, unit: "atlas" },
            properties: { tags: ["map", "urban"], concealable: true }
        }
    },
    {
        name: "Silver Prayer Token",
        img: "icons/commodities/treasure/token-silver-blue.webp",
        system: {
            commonName: "Prayer Token",
            category: "trinket",
            slot: "neck",
            use: { skillCheck: { skill: "religion", difficulty: 10, purpose: html("Steady morale in uncanny scenes.") } },
            physical: { weight: 0.1, bulk: 0, quantity: 1, unit: "token" },
            properties: { tags: ["ward", "token"], concealable: true }
        }
    },
    {
        name: "Signal Chalk Slate",
        img: "icons/sundries/documents/scroll-plain-white.webp",
        system: {
            commonName: "Chalk Slate",
            category: "instrument",
            slot: "belt",
            use: { skillCheck: { skill: "performance", difficulty: 8, purpose: html("Relay silent commands and coded marks.") } },
            physical: { weight: 0.4, bulk: 0, quantity: 1, unit: "slate" },
            properties: { tags: ["signal", "silent"] }
        }
    },
    {
        name: "Pocket Hourglass",
        img: "icons/tools/time/hourglass-brown.webp",
        system: {
            commonName: "Hourglass",
            category: "instrument",
            slot: "belt",
            use: { skillCheck: { skill: "insight", difficulty: 9, purpose: html("Track short intervals under pressure.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 1, unit: "glass" },
            properties: { tags: ["timing", "forensic"], fragile: true }
        }
    },
    {
        name: "Signal Almanac",
        img: "icons/sundries/books/book-embossed-compass-blue.webp",
        system: {
            commonName: "Signal Almanac",
            description: html("A waterproof-covered compendium of railway, telegraph, and flag signal codes, updated annually by the Board of Trade; essential on expeditions where any word must travel before any person."),
            category: "document",
            slot: "belt",
            quality: "standard",
            rarity: "common",
            use: { skillCheck: { skill: "history", difficulty: 10, purpose: html("Decode or compose a recognised signal sequence.") } },
            physical: { weight: 0.4, bulk: 0, quantity: 1, unit: "book" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["document", "navigation"], concealable: true }
        }
    },
    {
        name: "Parish Register Carbon",
        img: "icons/sundries/documents/document-worn-folded.webp",
        system: {
            commonName: "Register Copy",
            description: html("A carbon impression of selected parish ledger pages, folded into a waxed envelope; baptisms, marriages, and burials recorded here often carry more than genealogical interest."),
            category: "document",
            slot: "belt",
            quality: "standard",
            rarity: "common",
            use: { skillCheck: { skill: "history", difficulty: 11, purpose: html("Cross-reference identities against church or civil records.") } },
            physical: { weight: 0.2, bulk: 0, quantity: 1, unit: "document" },
            value: { price: 1, currency: "pounds" },
            properties: { tags: ["document", "evidence"], concealable: true, fragile: true }
        }
    },
    {
        name: "Caliper Rule Set",
        img: "icons/tools/hand/claw-hammer.webp",
        system: {
            commonName: "Caliper Set",
            description: html("A matched pair of spring callipers and a folding steel rule in a chamois roll; permits precise measurement of tolerances in locks, mechanisms, and suspected counterfeit castings."),
            category: "tool",
            slot: "belt",
            quality: "fine",
            rarity: "uncommon",
            use: { skillCheck: { skill: "investigation", difficulty: 10, purpose: html("Measure a mechanical component precisely enough to detect irregularity or wear.") } },
            physical: { weight: 0.6, bulk: 0, quantity: 1, unit: "set" },
            value: { price: 4, currency: "pounds" },
            properties: { tags: ["tool", "precision"] }
        }
    }
];
