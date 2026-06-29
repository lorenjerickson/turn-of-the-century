import { ABILITY_MINIMUMS_NONE, createArtwork, createUnlockAction, createUseItemAction, html } from "./builders/sample-content-builders.mjs";

export const ARMOR_CONFIGS = [
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
            slot: "handsArmor",
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
    },
    {
        name: "Rail Gendarme Greatcoat",
        system: {
            description: html("A reinforced wool greatcoat lined with chain mesh at the chest."),
            category: "medium",
            armorClass: { increment: 2 },
            encumbrance: { weight: 9, bulk: 2 },
            properties: { tags: ["greatcoat", "rail"] }
        }
    },
    {
        name: "Canal Brigand Jack",
        system: {
            description: html("Layered leather and tarcloth favored by river gangs."),
            category: "light",
            armorClass: { increment: 1 },
            encumbrance: { weight: 5, bulk: 1 },
            properties: { tags: ["canal", "leather"] }
        }
    },
    {
        name: "Refinery Face Shield",
        system: {
            description: html("A hinged visor and throat guard for furnace operators."),
            category: "heavy",
            slot: "head",
            armorClass: { increment: 2 },
            encumbrance: { weight: 7, bulk: 2, stealthPenalty: -1 },
            properties: { tags: ["refinery", "visor"], noisy: true }
        }
    },
    {
        name: "Courier's Padded Vest",
        system: {
            description: html("A quilted under-vest built to hide beneath formal wear."),
            category: "clothing",
            armorClass: { increment: 1 },
            encumbrance: { weight: 2, bulk: 0 },
            properties: { tags: ["padded", "concealed"], concealable: true }
        }
    },
    {
        name: "Dock Foreman's Plate Apron",
        system: {
            description: html("Segmented steel apron worn over work leathers in loading yards."),
            category: "medium",
            slot: "torso",
            armorClass: { increment: 2 },
            encumbrance: { weight: 10, bulk: 2, movementPenalty: -5 },
            properties: { tags: ["dock", "industrial"], noisy: true }
        }
    },
    {
        name: "Storm Warden's Oilcloak",
        system: {
            description: html("A waxed canvas longcoat with triple-sealed seams and weighted hem, issued to aerostat crews and highland marshals who cannot afford to be wet."),
            category: "light",
            quality: "fine",
            rarity: "uncommon",
            armorClass: { increment: 1 },
            encumbrance: { weight: 5, bulk: 1 },
            properties: { tags: ["weatherproof", "expedition"], concealable: false }
        }
    },
    {
        name: "Surgeon's Rubber Apron",
        system: {
            description: html("Vulcanised rubber over canvas, fastened behind the neck and tied at the waist; impermeable to most biological fluids and common reagents."),
            category: "light",
            quality: "standard",
            rarity: "common",
            armorClass: { increment: 1 },
            encumbrance: { weight: 3, bulk: 0 },
            properties: { tags: ["medical", "fluid-resistant"] }
        }
    },
    {
        name: "Mechanist's Canvas Duster",
        system: {
            description: html("A long coat of boiled canvas with riveted interior pockets and a leather collar reinforced against abrasion and flying scale from the grinding wheel."),
            category: "light",
            quality: "standard",
            rarity: "common",
            armorClass: { increment: 1 },
            encumbrance: { weight: 4, bulk: 1 },
            properties: { tags: ["industrial", "workshop"] }
        }
    }
];
