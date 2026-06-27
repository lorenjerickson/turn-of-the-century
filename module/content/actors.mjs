import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const ACTOR_CONFIGS = [
    {
        name: "Inspector Eleanor Thorne",
        type: "hero",
        system: {
            biography: html("An exacting investigator whose notebooks are as feared in court as in criminal circles."),
            classification: { category: "character", profession: "Urban Detective", origin: "London" },
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
            classification: { category: "character", profession: "Railway Marshal", origin: "Manchester" },
            abilities: { str: { value: 13, bonus: 1 }, con: { value: 12, bonus: 1 } },
            defenses: { armorClass: 12 },
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
            classification: { category: "character", profession: "Occult Natural Philosopher", origin: "Bath" },
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
            classification: { category: "npc", profession: "Field Surgeon", origin: "Leipzig" },
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
            classification: { category: "npc", profession: "Underworld Liaison", origin: "York" },
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
            classification: { category: "npc", profession: "Smokestack Mechanist", origin: "Birmingham" },
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
            defenses: { armorClass: 13 },
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
            defenses: { armorClass: 12 },
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
    },
    {
        name: "Captain Beatrice Holloway",
        type: "hero",
        system: {
            biography: html("A former aerostat captain who now guides impossible expeditions through soot and storm."),
            classification: { category: "character", profession: "Railway Marshal", origin: "Portsmouth" },
            abilities: { dex: { value: 13, bonus: 1 }, wis: { value: 12, bonus: 1 } },
            skills: {
                perception: { ability: "wis", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                survival: { ability: "wis", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "fine", capacity: 5 } } },
            traits: { languages: ["english", "german"] }
        }
    },
    {
        name: "Brother Lucien March",
        type: "hero",
        system: {
            biography: html("A hospital chaplain and code-breaker who documents hauntings as if they were parish accounts."),
            classification: { category: "character", profession: "Field Surgeon", origin: "Marseilles" },
            abilities: { wis: { value: 13, bonus: 1 }, san: { value: 12, bonus: 1 } },
            skills: {
                medicine: { ability: "wis", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                insight: { ability: "wis", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "standard", capacity: 4 } } },
            traits: { languages: ["english", "french", "latin"] }
        }
    },
    {
        name: "Ada Kingsley",
        type: "hero",
        system: {
            biography: html("An investigative machinist who tests every lock, valve, and lie with equal patience."),
            classification: { category: "character", profession: "Smokestack Mechanist", origin: "Leeds" },
            abilities: { int: { value: 13, bonus: 1 }, dex: { value: 12, bonus: 1 } },
            skills: {
                investigation: { ability: "int", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                sleightOfHand: { ability: "dex", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "masterwork", capacity: 7 } } },
            traits: { languages: ["english"] }
        }
    },
    {
        name: "Baron Ilya Soren",
        type: "villain",
        system: {
            biography: html("A debt-ridden noble funding forbidden experiments through rail sabotage and insurance fraud."),
            classification: { category: "npc", profession: "Underworld Liaison", origin: "Odessa" },
            abilities: { cha: { value: 13, bonus: 1 }, int: { value: 12, bonus: 1 } },
            skills: {
                deception: { ability: "cha", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                history: { ability: "int", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "exceptional", capacity: 6 } } }
        }
    },
    {
        name: "Sister Beulah Crow",
        type: "villain",
        system: {
            biography: html("A charity matron who turns orphan records into blackmail ledgers."),
            classification: { category: "npc", profession: "Urban Detective", origin: "Glasgow" },
            abilities: { wis: { value: 13, bonus: 1 }, cha: { value: 12, bonus: 1 } },
            skills: {
                insight: { ability: "wis", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                persuasion: { ability: "cha", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "fine", capacity: 5 } } }
        }
    },
    {
        name: "Superintendent Garrow Vane",
        type: "villain",
        system: {
            biography: html("A police administrator who auctions case outcomes to industrial patrons."),
            classification: { category: "npc", profession: "Railway Marshal", origin: "London" },
            abilities: { str: { value: 12, bonus: 1 }, cha: { value: 12, bonus: 1 } },
            skills: {
                intimidation: { ability: "cha", value: 3, bonus: 1, proficiency: 2, passive: 13 },
                athletics: { ability: "str", value: 2, bonus: 1, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "standard", capacity: 4 } } }
        }
    },
    {
        name: "Millhand Bruiser",
        type: "pawn",
        system: {
            biography: html("A foundry enforcer with scarred knuckles and a short list of loyalties."),
            classification: { category: "npc", species: "Human", profession: "Factory Guard", origin: "Birmingham" },
            abilities: { str: { value: 13, bonus: 1 }, con: { value: 12, bonus: 1 } },
            skills: {
                athletics: { ability: "str", value: 2, bonus: 1, proficiency: 1, passive: 12 },
                intimidation: { ability: "cha", value: 2, bonus: 0, proficiency: 2, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "standard", capacity: 4 } } },
            traits: { languages: ["english"], immunities: [], resistances: [], vulnerabilities: [] }
        }
    },
    {
        name: "Telegraph Cabin Clerk",
        type: "pawn",
        system: {
            biography: html("A night-shift line clerk who hears coded messages no court will admit."),
            classification: { category: "npc", species: "Human", profession: "Signal Clerk", origin: "Liverpool" },
            abilities: { int: { value: 12, bonus: 1 }, dex: { value: 11, bonus: 0 } },
            skills: {
                history: { ability: "int", value: 2, bonus: 1, proficiency: 1, passive: 12 },
                perception: { ability: "wis", value: 2, bonus: 0, proficiency: 1, passive: 12 }
            },
            inventory: { equipment: { belt: { quality: "poor", capacity: 2 } } },
            traits: { languages: ["english"], immunities: [], resistances: [], vulnerabilities: [] }
        }
    },
    {
        name: "Tunnel Ash Stalker",
        type: "pawn",
        system: {
            biography: html("A lean predator that hunts by cinder-heat in disused furnace tunnels."),
            classification: { category: "monster", species: "Mutated Beast", profession: "Stalker", origin: "Ash Tunnels" },
            movement: { walk: 35, climb: 15, swim: 0, fly: 0 },
            abilities: { str: { value: 11, bonus: 0 }, dex: { value: 14, bonus: 2 }, con: { value: 12, bonus: 1 } },
            defenses: { armorClass: 13 },
            traits: { languages: [], immunities: [], resistances: ["fire"], vulnerabilities: ["cold"] }
        }
    }
];
