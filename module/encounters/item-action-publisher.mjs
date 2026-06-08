/**
 * Item Action Publisher.
 *
 * Computes the set of actions currently available to an actor by walking all
 * items in their possession, reading each item's stored action variants, and
 * filtering out those whose data-driven requirements are not currently met.
 *
 * Universal actions (move, defend) are prepended and are always available
 * regardless of equipment.
 *
 * This module contains no Foundry document-creation logic; it is a pure
 * read-and-filter pass over existing document data.
 */

import { evaluateRequirements } from "./action-template.mjs";

// ---------------------------------------------------------------------------
// Universal actions
// ---------------------------------------------------------------------------

/**
 * Builds the universal actions available to every combatant.
 * Kept as a function so that AP budget and movement rate can be resolved from
 * game settings at call time.
 *
 * @param {object} options
 * @param {number} options.apBudget           Total AP available per round
 * @param {number} options.movementFeetPerAp  Feet of movement per AP spent
 * @returns {object[]}
 */
export function buildUniversalActions({ apBudget = 6, movementFeetPerAp = 10 } = {}) {
    return [
        {
            id: "move",
            actionId: "move",
            type: "movement",
            label: "Move",
            description: null,
            apCost: 1,
            apMin: 1,
            apMax: apBudget,
            variableAp: true,
            movementFeetPerAp,
            movementFeet: movementFeetPerAp,
            requiresToHit: false,
            toHitBonus: 0,
            requirements: [],
            itemId: null
        },
        {
            id: "defend",
            actionId: "defend",
            type: "defense",
            label: "Defend",
            description: null,
            apCost: 1,
            apMin: 1,
            apMax: apBudget,
            variableAp: true,
            movementFeetPerAp: 0,
            movementFeet: 0,
            requiresToHit: false,
            toHitBonus: 0,
            requirements: [],
            itemId: null
        }
    ];
}

// ---------------------------------------------------------------------------
// Per-item action publishing
// ---------------------------------------------------------------------------

/**
 * Returns the enabled action descriptors for a single item, filtering out
 * variants whose requirements are not satisfied by the item's current state.
 *
 * Each returned descriptor is a plain object ready to be consumed by the
 * encounter planning UI.  The `id` is namespaced as `<itemId>:<variantId>`
 * to avoid collisions across items.
 *
 * @param {object} item  A Foundry Item document (or a mock with the same shape)
 * @returns {object[]}
 */
export function getEnabledActionsForItem(item) {
    const variants = item.system?.actions?.variants ?? [];

    return variants
        .filter((variant) => evaluateRequirements(variant.requirements ?? [], item))
        .map((variant) => ({
            id: `${item.id}:${variant.id}`,
            actionId: variant.id,
            type: variant.type,
            label: `${item.name}: ${variant.label}`,
            description: String(item.system?.description ?? "").trim() || null,
            apCost: Number(variant.apCost ?? 1),
            apMin: Number(variant.apCost ?? 1),
            apMax: Number(variant.apCost ?? 1),
            variableAp: false,
            movementFeetPerAp: 0,
            movementFeet: 0,
            requiresToHit: Boolean(variant.requiresToHit),
            toHitBonus: Number(variant.toHitBonus ?? 0),
            requirements: variant.requirements ?? [],
            itemId: item.id
        }));
}

// ---------------------------------------------------------------------------
// Actor-level aggregation
// ---------------------------------------------------------------------------

/**
 * Returns the full set of actions available to an actor for the current
 * encounter planning phase.
 *
 * Order:
 *   1. Universal actions (move, defend)
 *   2. Actions from each item in `actor.items.contents`, in item order
 *
 * Items with no action variants (or all variants filtered out by requirements)
 * contribute nothing.
 *
 * @param {object} actor   A Foundry Actor document (or a compatible mock)
 * @param {object} [options]
 * @param {number} [options.apBudget=6]
 * @param {number} [options.movementFeetPerAp=10]
 * @returns {object[]}
 */
export function getEnabledActionsForActor(actor, { apBudget = 6, movementFeetPerAp = 10 } = {}) {
    const universal = buildUniversalActions({ apBudget, movementFeetPerAp });

    if (!actor?.items?.contents) return universal;

    const itemActions = actor.items.contents.flatMap((item) =>
        getEnabledActionsForItem(item)
    );

    return [...universal, ...itemActions];
}
