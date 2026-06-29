import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const WEAPON_CONFIGS = [
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
                        recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Fast draw and fire with reduced accuracy."
                    },
                    {
                        id: "pistolAimedShot",
                        label: "Aim and Fire",
                        type: "attack",
                        apCost: 3,
                        requiresToHit: true,
                        toHitBonus: 0,
                        recapFormat: "{{Owner.name}} carefully sights {{Target.name}} with {{Item.name}} and {{action.hitResult}}.",
                        tickNarrativeFragments: [
                            "{{Owner.name}} raises {{Item.name}}.",
                            "{{Owner.name}} sights {{Target.name}}.",
                            "{{Owner.name}} fires."
                        ],
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
                        recapFormat: "{{Owner.name}} strikes with {{Item.name}} and {{action.hitResult}}.",
                        notes: "Close-range restraint blow."
                    }
                ]
            },
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
                        recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Controlled longarm shot."
                    }
                ]
            },
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
                        recapFormat: "{{Owner.name}} slips {{Item.name}} into the opening and {{action.hitResult}}.",
                        notes: "Precise close-quarters cut."
                    }
                ]
            },
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
                        recapFormat: "{{Owner.name}} thrusts {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Measured spear thrust."
                    }
                ]
            },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, str: 10 } },
            physical: { weight: 4, bulk: 2, range: { normal: 10, long: 30 } },
            properties: { tags: ["polearm", "thrown"] }
        }
    },
    {
        name: "Galvanic Prod",
        img: "icons/weapons/staves/staff-orb-lightning.webp",
        system: {
            commonName: "Galvanic Prod",
            description: html("A brass baton with insulated grips and a volatile induction coil."),
            classification: "tool",
            quality: "experimental",
            rarity: "rare",
            damage: { formula: "1d6", type: "electric" },
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
                        recapFormat: "{{Owner.name}} jabs with {{Item.name}} and {{action.hitResult}}.",
                        notes: "Unstable electrical strike."
                    }
                ]
            },
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
                        recapFormat: "{{Owner.name}} hacks with {{Item.name}} and {{action.hitResult}}.",
                        notes: "Rough industrial swing."
                    }
                ]
            },
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
                        recapFormat: "{{Owner.name}} throws {{Item.name}} toward {{Target.name}} and {{action.hitResult}}.",
                        notes: "Thrown pyrotechnic burst."
                    }
                ]
            },
            ammunition: { required: false, type: "", capacity: 0, loaded: 0, consumedPerAttack: 0 },
            physical: { weight: 1, bulk: 0, range: { normal: 20, long: 60 } },
            properties: { tags: ["thrown", "pyrotechnic"], noisy: true }
        }
    },
    {
        name: "Foundry Hammer",
        img: "icons/tools/hand/hammer-mallete-steel.webp",
        system: {
            commonName: "Foundry Hammer",
            classification: "martialMelee",
            damage: { formula: "1d8", type: "bludgeoning" },
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
                        recapFormat: "{{Owner.name}} swings {{Item.name}} and {{action.hitResult}}.",
                        notes: "Heavy hammer blow."
                    }
                ]
            },
            physical: { weight: 5, bulk: 2, range: { normal: 5, long: 5 } },
            properties: { tags: ["hammer", "industrial"] }
        }
    },
    {
        name: "Streetline Shotgun",
        img: "icons/weapons/guns/gun-shotgun.webp",
        system: {
            commonName: "Shotgun",
            classification: "firearm",
            damage: { formula: "1d10", type: "ballistic" },
            handedness: "twoHanded",
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
                        recapFormat: "{{Owner.name}} blasts {{Target.name}} with {{Item.name}} and {{action.hitResult}}.",
                        notes: "Close-range scatter shot."
                    }
                ]
            },
            ammunition: { required: true, type: "shot-shell", capacity: 2, loaded: 2, consumedPerAttack: 1 },
            physical: { weight: 6.5, bulk: 2, range: { normal: 30, long: 90 } },
            properties: { tags: ["shotgun"], noisy: true }
        }
    },
    {
        name: "Dock Hook Pike",
        img: "icons/weapons/polearms/halberd-simple.webp",
        system: {
            commonName: "Hook Pike",
            classification: "martialMelee",
            damage: { formula: "1d8", type: "piercing" },
            handedness: "twoHanded",
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
                        recapFormat: "{{Owner.name}} drives {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Hooked polearm strike."
                    }
                ]
            },
            physical: { weight: 5.5, bulk: 2, range: { normal: 10, long: 20 } },
            properties: { tags: ["hook", "polearm"] }
        }
    },
    {
        name: "Clockwork Derringer",
        img: "icons/weapons/guns/gun-pistol-doublebarrel.webp",
        system: {
            commonName: "Derringer",
            classification: "firearm",
            damage: { formula: "1d6", type: "ballistic" },
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
                        recapFormat: "{{Owner.name}} snaps off a shot with {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Very short-range concealed shot."
                    }
                ]
            },
            ammunition: { required: true, type: "pistol-round", capacity: 2, loaded: 2, consumedPerAttack: 1 },
            physical: { weight: 1.2, bulk: 0, range: { normal: 20, long: 60 } },
            properties: { tags: ["sidearm", "concealed"], concealable: true, noisy: true }
        }
    },
    {
        name: "Wire Garrote",
        img: "icons/weapons/swords/sword-thin-grey.webp",
        system: {
            commonName: "Garrote",
            classification: "improvised",
            damage: { formula: "1d4", type: "slashing" },
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
                        recapFormat: "{{Owner.name}} tightens {{Item.name}} on {{Target.name}} and {{action.hitResult}}.",
                        notes: "Silent close-quarters attack."
                    }
                ]
            },
            physical: { weight: 0.3, bulk: 0, range: { normal: 5, long: 5 } },
            properties: { tags: ["silent", "wire"], concealable: true }
        }
    },
    {
        name: "Signal Flare Pistol",
        img: "icons/weapons/guns/gun-pistol-flintlock-black.webp",
        system: {
            commonName: "Flare Pistol",
            description: html("A single-shot brass pistol firing coloured phosphor cartridges for maritime and highland signalling; seldom chosen for combat, but singularly discouraging at close range."),
            classification: "firearm",
            damage: { formula: "1d4", type: "fire" },
            handedness: "oneHanded",
            actions: {
                defaultActionId: "flareShot",
                variants: [
                    {
                        id: "flareShot",
                        label: "Fire Signal",
                        type: "attack",
                        apCost: 3,
                        requiresToHit: true,
                        toHitBonus: -1,
                        recapFormat: "{{Owner.name}} fires {{Item.name}} at {{Target.name}} and {{action.hitResult}}.",
                        notes: "Single discharge; imposes Blinded on target if fired within 10 feet."
                    }
                ]
            },
            ammunition: { required: true, type: "flare-cartridge", capacity: 1, loaded: 1, consumedPerAttack: 1 },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, dex: 10 } },
            physical: { weight: 2, bulk: 0, range: { normal: 30, long: 60 } },
            properties: { tags: ["sidearm", "signal", "firearm"], concealable: true, noisy: true }
        }
    },
    {
        name: "Surgeon's Lancet",
        img: "icons/weapons/daggers/dagger-silver-blue.webp",
        system: {
            commonName: "Lancet",
            description: html("A slender steel instrument of uncommon precision, ground for incision and, under duress, applied at close quarters with unhappy efficiency."),
            classification: "simpleMelee",
            damage: { formula: "1d4", type: "piercing" },
            handedness: "oneHanded",
            actions: {
                defaultActionId: "precisionStrike",
                variants: [
                    {
                        id: "precisionStrike",
                        label: "Precision Strike",
                        type: "attack",
                        apCost: 2,
                        requiresToHit: true,
                        toHitBonus: 1,
                        recapFormat: "{{Owner.name}} strikes carefully with {{Item.name}} and {{action.hitResult}}.",
                        notes: "Advantage on attacks against unaware or restrained targets."
                    }
                ]
            },
            prerequisites: { abilityMinimums: { ...ABILITY_MINIMUMS_NONE, dex: 11 } },
            physical: { weight: 0.3, bulk: 0, range: { normal: 5, long: 5 } },
            properties: { tags: ["medical", "finesse"], concealable: true }
        }
    },
    {
        name: "Rivet Hammer",
        img: "icons/weapons/hammers/hammer-riveted.webp",
        system: {
            commonName: "Rivet Hammer",
            description: html("A heavy-headed iron hammer used to set rivets in plate and girder; foundry workers rarely surrender it, and its weight makes that preference apparent."),
            classification: "simpleMelee",
            damage: { formula: "1d6", type: "bludgeoning" },
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
                        recapFormat: "{{Owner.name}} brings down {{Item.name}} and {{action.hitResult}}.",
                        notes: "Brutal hammer strike."
                    }
                ]
            },
            physical: { weight: 3, bulk: 0, range: { normal: 5, long: 5 } },
            properties: { tags: ["industrial", "improvised"] }
        }
    }
];
