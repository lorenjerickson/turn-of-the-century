/**
 * Item Trait system.
 *
 * A trait is a composable capability token.  Items are described by a set of
 * traits rather than a single monolithic classification, allowing behaviours to
 * combine naturally.  Examples:
 *
 *   Pistol     = ["firearm", "projectileAmmo", "singleHanded"]
 *   Dagger     = ["meleeWeapon", "thrownWeapon", "singleHanded"]
 *   Spear      = ["meleeWeapon", "thrownWeapon", "versatileGrip"]
 *   Shotgun    = ["firearm", "projectileAmmo", "twoHanded"]
 *   Molotov    = ["thrownWeapon", "fusedDetonator", "explosive"]
 *   Flamethrower = ["rangedWeapon", "elementalDamage", "twoHanded"]
 *
 * Each trait has three concerns:
 *
 *   actionContributions   — action templates this trait adds to the item
 *   requirementInjections — requirements pushed into actions from OTHER traits
 *                           (e.g. projectileAmmo injects a loaded-ammo check
 *                           into every attack action regardless of origin)
 *   schemaDefaults        — suggested field values applied when the trait is
 *                           first assigned to an item
 *
 * The public API exposed by this module is purely functional.
 * {@link composeActionsFromTraits} returns the composed action variants array
 * (the baked-in output stored in item.system.actions.variants).
 *
 * Design note — ammunition as separate items:
 *   projectileAmmo currently treats ammunition as fields on the weapon itself
 *   (system.ammunition.*).  A future iteration should model each ammunition
 *   type as its own Item document with traits such as "elementalDamage" or
 *   "phosphorousRound".  At that point, requirementInjections from
 *   projectileAmmo will need to resolve through the actor's equipped ammo
 *   rather than the weapon's own fields.
 */

// ---------------------------------------------------------------------------
// Trait definitions
// ---------------------------------------------------------------------------

/**
 * All available item traits, keyed by trait ID.
 *
 * @type {Readonly<Record<string, ItemTrait>>}
 *
 * @typedef {object} ItemTrait
 * @property {string}   id
 * @property {string}   label
 * @property {string[]} applicableTypes   Foundry item document types this trait
 *                                        is valid on.  ["*"] means all types.
 * @property {string[]} schemaActivations Dot-notation prefixes that become
 *                                        meaningful when this trait is present
 *                                        (used by the item sheet to show/hide
 *                                        field groups).
 * @property {ActionContribution[]} actionContributions
 * @property {RequirementInjection[]} requirementInjections
 * @property {Record<string, *>} schemaDefaults
 *
 * @typedef {object} ActionContribution
 * @property {string}  id
 * @property {string}  label
 * @property {string}  type         One of TOTC_ACTION_TYPES
 * @property {number}  apCost
 * @property {boolean} requiresToHit
 * @property {number}  toHitBonus
 * @property {Array}   requirements  ActionRequirement objects (see action-template.mjs)
 *
 * @typedef {object} RequirementInjection
 * @property {{ actionType?: string, actionId?: string }} appliesTo
 *   Selects which contributed actions receive the injected requirements.
 *   Matching is OR-less: all specified filters must match.
 * @property {Array} requirements   ActionRequirement objects to inject
 */
export const TOTC_ITEM_TRAITS = Object.freeze({

    // -----------------------------------------------------------------------
    // Weapon traits
    // -----------------------------------------------------------------------

    meleeWeapon: {
        id: "meleeWeapon",
        label: "Melee Weapon",
        applicableTypes: ["weapon"],
        schemaActivations: ["damage"],
        actionContributions: [
            {
                id: "meleeStrike",
                label: "Strike",
                type: "attack",
                apCost: 1,
                requiresToHit: true,
                toHitBonus: 0,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: {}
    },

    thrownWeapon: {
        id: "thrownWeapon",
        label: "Thrown Weapon",
        applicableTypes: ["weapon"],
        schemaActivations: ["damage", "physical.range"],
        actionContributions: [
            {
                id: "thrownAttack",
                label: "Throw",
                type: "attack",
                apCost: 2,
                requiresToHit: true,
                toHitBonus: 0,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: {
            handedness: "thrown",
            "physical.range.normal": 20,
            "physical.range.long": 60
        }
    },

    rangedWeapon: {
        id: "rangedWeapon",
        label: "Ranged Weapon",
        applicableTypes: ["weapon"],
        schemaActivations: ["damage", "physical.range"],
        actionContributions: [
            {
                id: "rangedAttack",
                label: "Ranged Attack",
                type: "attack",
                apCost: 2,
                requiresToHit: true,
                toHitBonus: 0,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: {
            "physical.range.normal": 30,
            "physical.range.long": 90
        }
    },

    /**
     * Firearm trait — contributes the distinctive quick-shot / aimed-shot
     * action pair.  Combine with projectileAmmo to gate both shots on
     * ammunition availability.
     */
    firearm: {
        id: "firearm",
        label: "Firearm",
        applicableTypes: ["weapon"],
        schemaActivations: ["damage", "physical.range", "ammunition"],
        actionContributions: [
            {
                id: "quickShot",
                label: "Quick Shot",
                type: "attack",
                apCost: 2,
                requiresToHit: true,
                toHitBonus: -2,
                requirements: []
            },
            {
                id: "aimedShot",
                label: "Aim and Fire",
                type: "attack",
                apCost: 3,
                requiresToHit: true,
                toHitBonus: 0,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: {
            classification: "firearm",
            "damage.type": "ballistic"
        }
    },

    /**
     * Projectile ammunition trait — contributes a reload action and injects an
     * ammo-availability requirement into every attack action contributed by any
     * other trait on the same item.
     */
    projectileAmmo: {
        id: "projectileAmmo",
        label: "Projectile Ammunition",
        applicableTypes: ["weapon"],
        schemaActivations: ["ammunition"],
        actionContributions: [
            {
                id: "reload",
                label: "Reload",
                type: "utility",
                apCost: 2,
                requiresToHit: false,
                toHitBonus: 0,
                // Only available when the weapon is not fully loaded
                requirements: [
                    {
                        field: "system.ammunition.loaded",
                        op: "lt",
                        value: 0,
                        fieldRef: "system.ammunition.capacity"
                    }
                ]
            }
        ],
        requirementInjections: [
            {
                appliesTo: { actionType: "attack" },
                requirements: [
                    {
                        field: "system.ammunition.loaded",
                        op: "gt",
                        value: 0,
                        fieldRef: ""
                    }
                ]
            }
        ],
        schemaDefaults: {
            "ammunition.required": true,
            "ammunition.capacity": 6,
            "ammunition.loaded": 6,
            "ammunition.consumedPerAttack": 1
        }
    },

    singleHanded: {
        id: "singleHanded",
        label: "Single Handed",
        applicableTypes: ["weapon"],
        schemaActivations: [],
        actionContributions: [],
        requirementInjections: [],
        schemaDefaults: { handedness: "oneHanded" }
    },

    twoHanded: {
        id: "twoHanded",
        label: "Two Handed",
        applicableTypes: ["weapon"],
        schemaActivations: [],
        actionContributions: [],
        requirementInjections: [],
        schemaDefaults: { handedness: "twoHanded" }
    },

    versatileGrip: {
        id: "versatileGrip",
        label: "Versatile Grip",
        applicableTypes: ["weapon"],
        schemaActivations: [],
        actionContributions: [
            {
                id: "twoHandedStrike",
                label: "Two-Handed Strike",
                type: "attack",
                apCost: 2,
                requiresToHit: true,
                toHitBonus: 1,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: { handedness: "versatile" }
    },

    // -----------------------------------------------------------------------
    // Damage / effect traits
    // -----------------------------------------------------------------------

    explosive: {
        id: "explosive",
        label: "Explosive",
        applicableTypes: ["weapon", "consumable"],
        schemaActivations: ["damage"],
        actionContributions: [],
        requirementInjections: [],
        schemaDefaults: {
            "damage.type": "explosive",
            classification: "explosive"
        }
    },

    elementalDamage: {
        id: "elementalDamage",
        label: "Elemental Damage",
        applicableTypes: ["weapon", "consumable"],
        schemaActivations: ["damage"],
        actionContributions: [],
        requirementInjections: [],
        schemaDefaults: {
            "damage.type": "fire"
        }
    },

    /**
     * Fused detonator trait — for thrown items that must be lit before
     * throwing (molotov cocktails, signal flares, pipe bombs).
     *
     * The lightAndThrow action is modelled as a single-phase action for now.
     * When multi-phase action support is added to the encounter game loop,
     * this should be split into:
     *   prepare (2 AP, interruptible — if interrupted while lit: detonates
     *            at current position)
     *   flight  (1 AP)
     *   impact  (0 AP, instantaneous)
     */
    fusedDetonator: {
        id: "fusedDetonator",
        label: "Fused Detonator",
        applicableTypes: ["weapon", "consumable"],
        schemaActivations: ["damage"],
        actionContributions: [
            {
                id: "lightAndThrow",
                label: "Light and Throw",
                type: "attack",
                apCost: 3,
                requiresToHit: true,
                toHitBonus: 0,
                requirements: []
            }
        ],
        requirementInjections: [],
        schemaDefaults: {}
    },

    // -----------------------------------------------------------------------
    // Consumable / charge traits
    // -----------------------------------------------------------------------

    /**
     * Belt consumable — a quick-access item worn on the belt that can be
     * used as a 2-AP action.  Requires quantity > 0.
     */
    beltConsumable: {
        id: "beltConsumable",
        label: "Belt Consumable",
        applicableTypes: ["consumable"],
        schemaActivations: ["quantity", "use"],
        actionContributions: [
            {
                id: "consumeBeltElixir",
                label: "Consume",
                type: "consumable",
                apCost: 2,
                requiresToHit: false,
                toHitBonus: 0,
                requirements: [
                    {
                        field: "system.quantity.value",
                        op: "gt",
                        value: 0,
                        fieldRef: ""
                    }
                ]
            }
        ],
        requirementInjections: [],
        schemaDefaults: {
            slot: "belt",
            "use.actionCost": 2
        }
    },

    /**
     * General usable item — slower use (1 AP) for items not belt-mounted.
     * Requires quantity > 0.
     */
    usableItem: {
        id: "usableItem",
        label: "Usable Item",
        applicableTypes: ["consumable", "item"],
        schemaActivations: ["quantity", "use"],
        actionContributions: [
            {
                id: "useItem",
                label: "Use",
                type: "consumable",
                apCost: 1,
                requiresToHit: false,
                toHitBonus: 0,
                requirements: [
                    {
                        field: "system.quantity.value",
                        op: "gt",
                        value: 0,
                        fieldRef: ""
                    }
                ]
            }
        ],
        requirementInjections: [],
        schemaDefaults: {}
    },

    /**
     * Consumable charge — for weapons that deplete per use (e.g. a
     * poison-coated blade with 3 applications).  Reuses the ammunition
     * schema as a charge counter and injects a charge-available requirement
     * into all attack actions.
     */
    consumableCharge: {
        id: "consumableCharge",
        label: "Consumable Charge",
        applicableTypes: ["weapon", "consumable", "item"],
        schemaActivations: ["ammunition"],
        actionContributions: [],
        requirementInjections: [
            {
                appliesTo: { actionType: "attack" },
                requirements: [
                    {
                        field: "system.ammunition.loaded",
                        op: "gt",
                        value: 0,
                        fieldRef: ""
                    }
                ]
            }
        ],
        schemaDefaults: {
            "ammunition.required": true,
            "ammunition.capacity": 3,
            "ammunition.loaded": 3,
            "ammunition.consumedPerAttack": 1,
            "ammunition.type": "charge"
        }
    }
});

// ---------------------------------------------------------------------------
// Composition utilities (pure functions)
// ---------------------------------------------------------------------------

/**
 * Resolves the set of trait definitions for the given trait IDs, silently
 * ignoring any unknown IDs.
 *
 * @param {string[]} traitIds
 * @returns {ItemTrait[]}
 */
function resolveTraits(traitIds) {
    return (traitIds ?? [])
        .map((id) => TOTC_ITEM_TRAITS[id])
        .filter(Boolean);
}

/**
 * Composes the full `actions.variants` array from a set of trait IDs.
 *
 * 1. Collects all action contributions from each trait (in order).
 * 2. For each RequirementInjection, identifies which contributed actions
 *    match its `appliesTo` selector and appends the extra requirements.
 *
 * The returned array is ready to be stored in `item.system.actions.variants`.
 * Each entry is a plain object — no Foundry document instances are created.
 *
 * @param {string[]} traitIds
 * @returns {object[]}  Composed action variant plain objects
 */
export function composeActionsFromTraits(traitIds) {
    const traits = resolveTraits(traitIds);

    // Collect base actions, deep-copying requirements so injections don't
    // mutate the frozen source objects.
    const composed = traits.flatMap((trait) =>
        trait.actionContributions.map((action) => ({
            ...action,
            requirements: action.requirements.map((r) => ({ ...r }))
        }))
    );

    // Apply requirement injections from all traits
    const injections = traits.flatMap((trait) => trait.requirementInjections ?? []);

    for (const injection of injections) {
        for (const action of composed) {
            const { actionType, actionId } = injection.appliesTo ?? {};
            const typeMatches = !actionType || action.type === actionType;
            const idMatches = !actionId || action.id === actionId;
            if (typeMatches && idMatches) {
                action.requirements = [
                    ...action.requirements,
                    ...injection.requirements.map((r) => ({ ...r }))
                ];
            }
        }
    }

    return composed;
}

/**
 * Returns a merged object of schema default values contributed by the given
 * set of traits.  Later traits in the array override earlier ones when keys
 * conflict.
 *
 * @param {string[]} traitIds
 * @returns {Record<string, *>}
 */
export function getSchemaDefaultsForTraits(traitIds) {
    const traits = resolveTraits(traitIds);
    return Object.assign({}, ...traits.map((t) => t.schemaDefaults ?? {}));
}

/**
 * Returns the union of all `schemaActivations` across the given traits.
 * The item sheet uses this to decide which field groups to display.
 *
 * @param {string[]} traitIds
 * @returns {string[]}
 */
export function getSchemaActivationsForTraits(traitIds) {
    const traits = resolveTraits(traitIds);
    return [...new Set(traits.flatMap((t) => t.schemaActivations ?? []))];
}

/**
 * Returns `true` when every trait ID in `traitIds` is a known trait and
 * all are applicable to `documentType`.
 *
 * @param {string[]} traitIds
 * @param {string}   documentType  e.g. "weapon", "consumable", "item"
 * @returns {boolean}
 */
export function validateTraitsForType(traitIds, documentType) {
    return (traitIds ?? []).every((id) => {
        const trait = TOTC_ITEM_TRAITS[id];
        if (!trait) return false;
        return (
            trait.applicableTypes.includes("*") ||
            trait.applicableTypes.includes(documentType)
        );
    });
}
