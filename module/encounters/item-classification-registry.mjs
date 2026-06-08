/**
 * Item Classification Registry.
 *
 * A classification is a named bundle of traits plus schema overrides that
 * together describe a recognisable item archetype (pistol, revolver, dagger,
 * etc.).  It is a convenience layer on top of the trait system — the traits
 * define all behaviour; the classification supplies sensible data defaults so
 * GMs don't have to configure every field from scratch.
 *
 * When a GM creates a new item and picks a classification, the system:
 *   1. Applies the classification's trait list to the item.
 *   2. Merges schema overrides into the item data.
 *   3. Composes and stores the resulting actions.variants array.
 *
 * Adding a new classification never requires modifying existing code — it is
 * purely additive data.
 */

import { composeActionsFromTraits, getSchemaDefaultsForTraits } from "./item-traits.mjs";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ItemClassification
 * @property {string}   id
 * @property {string}   label
 * @property {string}   documentType     Foundry item type: "weapon" | "consumable" | "item"
 * @property {string[]} traits           Ordered trait IDs to apply
 * @property {Record<string, *>} schemaOverrides
 *   Field values (dot-notation paths or shallow keys) that override the
 *   merged trait schema defaults.  These set the archetype-specific data —
 *   e.g. a revolver has capacity 6, a derringer has capacity 2.
 */

export const ITEM_CLASSIFICATION_REGISTRY = Object.freeze({

    // -----------------------------------------------------------------------
    // Firearms
    // -----------------------------------------------------------------------

    pistol: {
        id: "pistol",
        label: "Pistol",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "singleHanded"],
        schemaOverrides: {
            "damage.formula": "1d6",
            "damage.type": "ballistic",
            "ammunition.capacity": 6,
            "ammunition.loaded": 6,
            "ammunition.type": "pistol-round",
            "physical.range.normal": 30,
            "physical.range.long": 90
        }
    },

    revolver: {
        id: "revolver",
        label: "Revolver",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "singleHanded"],
        schemaOverrides: {
            "damage.formula": "1d8",
            "damage.type": "ballistic",
            "ammunition.capacity": 6,
            "ammunition.loaded": 6,
            "ammunition.type": "revolver-round",
            "physical.range.normal": 40,
            "physical.range.long": 120
        }
    },

    derringer: {
        id: "derringer",
        label: "Derringer",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "singleHanded"],
        schemaOverrides: {
            "damage.formula": "1d6",
            "damage.type": "ballistic",
            "ammunition.capacity": 2,
            "ammunition.loaded": 2,
            "ammunition.type": "pistol-round",
            "physical.range.normal": 20,
            "physical.range.long": 60,
            handedness: "oneHanded",
            properties: { concealable: true }
        }
    },

    rifle: {
        id: "rifle",
        label: "Rifle",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "twoHanded"],
        schemaOverrides: {
            "damage.formula": "1d10",
            "damage.type": "ballistic",
            "ammunition.capacity": 5,
            "ammunition.loaded": 5,
            "ammunition.type": "rifle-round",
            "physical.range.normal": 80,
            "physical.range.long": 320
        }
    },

    carbine: {
        id: "carbine",
        label: "Carbine",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "twoHanded"],
        schemaOverrides: {
            "damage.formula": "1d8",
            "damage.type": "ballistic",
            "ammunition.capacity": 10,
            "ammunition.loaded": 10,
            "ammunition.type": "rifle-round",
            "physical.range.normal": 60,
            "physical.range.long": 200
        }
    },

    shotgun: {
        id: "shotgun",
        label: "Shotgun",
        documentType: "weapon",
        traits: ["firearm", "projectileAmmo", "twoHanded"],
        schemaOverrides: {
            "damage.formula": "2d6",
            "damage.type": "ballistic",
            "ammunition.capacity": 2,
            "ammunition.loaded": 2,
            "ammunition.type": "shot-shell",
            "physical.range.normal": 15,
            "physical.range.long": 30
        }
    },

    // -----------------------------------------------------------------------
    // Melee weapons
    // -----------------------------------------------------------------------

    simpleMeleeOneHanded: {
        id: "simpleMeleeOneHanded",
        label: "Simple Melee (One-Handed)",
        documentType: "weapon",
        traits: ["meleeWeapon", "singleHanded"],
        schemaOverrides: {
            classification: "simpleMelee",
            "damage.formula": "1d4",
            "damage.type": "bludgeoning"
        }
    },

    martialMeleeOneHanded: {
        id: "martialMeleeOneHanded",
        label: "Martial Melee (One-Handed)",
        documentType: "weapon",
        traits: ["meleeWeapon", "singleHanded"],
        schemaOverrides: {
            classification: "martialMelee",
            "damage.formula": "1d6",
            "damage.type": "slashing"
        }
    },

    martialMeleeTwoHanded: {
        id: "martialMeleeTwoHanded",
        label: "Martial Melee (Two-Handed)",
        documentType: "weapon",
        traits: ["meleeWeapon", "twoHanded"],
        schemaOverrides: {
            classification: "martialMelee",
            "damage.formula": "1d10",
            "damage.type": "slashing"
        }
    },

    versatileMelee: {
        id: "versatileMelee",
        label: "Versatile Melee",
        documentType: "weapon",
        traits: ["meleeWeapon", "versatileGrip"],
        schemaOverrides: {
            classification: "martialMelee",
            "damage.formula": "1d6",
            "damage.type": "piercing"
        }
    },

    dagger: {
        id: "dagger",
        label: "Dagger",
        documentType: "weapon",
        traits: ["meleeWeapon", "thrownWeapon", "singleHanded"],
        schemaOverrides: {
            classification: "simpleMelee",
            "damage.formula": "1d4",
            "damage.type": "piercing",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    spear: {
        id: "spear",
        label: "Spear",
        documentType: "weapon",
        traits: ["meleeWeapon", "thrownWeapon", "versatileGrip"],
        schemaOverrides: {
            classification: "martialMelee",
            "damage.formula": "1d6",
            "damage.type": "piercing",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    // -----------------------------------------------------------------------
    // Thrown / explosive weapons
    // -----------------------------------------------------------------------

    thrownExplosive: {
        id: "thrownExplosive",
        label: "Thrown Explosive",
        documentType: "weapon",
        traits: ["thrownWeapon", "explosive"],
        schemaOverrides: {
            classification: "explosive",
            "damage.formula": "2d6",
            "damage.type": "explosive",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    fusedThrownExplosive: {
        id: "fusedThrownExplosive",
        label: "Fused Thrown Explosive",
        documentType: "weapon",
        traits: ["fusedDetonator", "thrownWeapon", "explosive"],
        schemaOverrides: {
            classification: "explosive",
            "damage.formula": "2d6",
            "damage.type": "explosive",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    signalFlare: {
        id: "signalFlare",
        label: "Signal Flare",
        documentType: "weapon",
        traits: ["fusedDetonator", "thrownWeapon", "explosive"],
        schemaOverrides: {
            classification: "explosive",
            "damage.formula": "1d8",
            "damage.type": "explosive",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    // -----------------------------------------------------------------------
    // Consumables
    // -----------------------------------------------------------------------

    beltElixir: {
        id: "beltElixir",
        label: "Belt Elixir",
        documentType: "consumable",
        traits: ["beltConsumable"],
        schemaOverrides: {
            slot: "belt",
            category: "tonic",
            "use.actionCost": 2
        }
    },

    fieldMedicine: {
        id: "fieldMedicine",
        label: "Field Medicine",
        documentType: "consumable",
        traits: ["usableItem"],
        schemaOverrides: {
            category: "medicine",
            "use.actionCost": 1
        }
    }
});

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns the classification preset for the given key, or `null` if not found.
 *
 * @param {string} classificationKey
 * @returns {ItemClassification|null}
 */
export function getClassification(classificationKey) {
    return ITEM_CLASSIFICATION_REGISTRY[classificationKey] ?? null;
}

/**
 * Returns an array of all classification entries sorted by label.
 *
 * @returns {ItemClassification[]}
 */
export function listClassifications() {
    return Object.values(ITEM_CLASSIFICATION_REGISTRY).sort((a, b) =>
        a.label.localeCompare(b.label)
    );
}

/**
 * Returns classifications applicable to a given Foundry document type.
 *
 * @param {string} documentType  e.g. "weapon", "consumable", "item"
 * @returns {ItemClassification[]}
 */
export function listClassificationsForType(documentType) {
    return listClassifications().filter((c) => c.documentType === documentType);
}

/**
 * Builds the data that should be merged into a new item when a classification
 * is applied.  Returns:
 *
 * - `traits`   — the trait IDs to store on the item
 * - `actions`  — the composed actions.variants array
 * - `defaults` — merged schema defaults (traits + overrides)
 *
 * The caller is responsible for writing these back to the item document.
 *
 * @param {string} classificationKey
 * @returns {{ traits: string[], actions: object[], defaults: Record<string, *> } | null}
 */
export function buildClassificationData(classificationKey) {
    const classification = getClassification(classificationKey);
    if (!classification) return null;

    const { traits, schemaOverrides } = classification;
    const traitDefaults = getSchemaDefaultsForTraits(traits);
    const actions = composeActionsFromTraits(traits);

    return {
        traits,
        actions,
        defaults: { ...traitDefaults, ...schemaOverrides }
    };
}
