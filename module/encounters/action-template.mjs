/**
 * Action Template system.
 *
 * Defines the schema for action variants stored on item documents, and provides
 * pure-function utilities for evaluating data-driven requirements against a live
 * item instance.
 *
 * An ActionRequirement expresses a condition in the form:
 *   item[field] <op> value   (literal comparison)
 *   item[field] <op> item[fieldRef]   (field-to-field comparison)
 *
 * Design note — ammunition as items:
 *   The current implementation treats ammunition as fields on the weapon
 *   (system.ammunition.*).  A future iteration should model ammunition as
 *   separate Item documents with their own trait compositions (e.g. a
 *   "PhosphorousRound" with an elementalDamage trait and a conditional trigger
 *   "ignites in water").  When that is implemented, requirement evaluation will
 *   need to resolve ammunition references through the actor's inventory rather
 *   than against the weapon's own fields.
 */

const {
    ArrayField,
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All comparison operators recognised by {@link evaluateRequirement}. */
export const TOTC_REQUIREMENT_OPS = Object.freeze(["gt", "gte", "lt", "lte", "eq", "neq"]);

/** Action types used across the system. */
export const TOTC_ACTION_TYPES = Object.freeze([
    "attack",
    "movement",
    "defense",
    "consumable",
    "utility"
]);

// ---------------------------------------------------------------------------
// Foundry field factories (shared across weapon / consumable / item models)
// ---------------------------------------------------------------------------

/**
 * Returns a SchemaField describing a single data-driven action requirement.
 *
 * @returns {SchemaField}
 */
export function createActionRequirementField() {
    return new SchemaField({
        field: new StringField({
            required: true,
            blank: false,
            initial: "system.ammunition.loaded",
            label: "Field path into the item document (dot-notation)"
        }),
        op: new StringField({
            required: true,
            blank: false,
            choices: TOTC_REQUIREMENT_OPS,
            initial: "gt",
            label: "Comparison operator"
        }),
        value: new NumberField({
            required: true,
            initial: 0,
            label: "Literal value to compare against (ignored when fieldRef is set)"
        }),
        fieldRef: new StringField({
            required: true,
            blank: true,
            initial: "",
            label: "Optional: dot-notation path into the item document whose resolved value is used instead of 'value'"
        })
    });
}

/**
 * Returns a SchemaField describing a single action variant stored on an item.
 *
 * @param {object} [defaults]
 * @param {string} [defaults.defaultId="useItem"]
 * @param {string} [defaults.defaultLabel="Use Item"]
 * @param {string} [defaults.defaultType="utility"]
 * @param {number} [defaults.defaultApCost=1]
 * @param {number} [defaults.defaultToHitBonus=0]
 * @param {boolean} [defaults.defaultRequiresToHit=false]
 * @returns {SchemaField}
 */
export function createActionVariantField({
    defaultId = "useItem",
    defaultLabel = "Use Item",
    defaultType = "utility",
    defaultApCost = 1,
    defaultToHitBonus = 0,
    defaultRequiresToHit = false
} = {}) {
    return new SchemaField({
        id: new StringField({ required: true, blank: false, initial: defaultId }),
        label: new StringField({ required: true, blank: false, initial: defaultLabel }),
        type: new StringField({
            required: true,
            blank: false,
            choices: TOTC_ACTION_TYPES,
            initial: defaultType
        }),
        apCost: new NumberField({ required: true, integer: true, min: 1, initial: defaultApCost }),
        requiresToHit: new BooleanField({ required: true, initial: defaultRequiresToHit }),
        toHitBonus: new NumberField({ required: true, integer: true, initial: defaultToHitBonus }),
        recapFormat: new StringField({ required: true, blank: true, initial: "" }),
        tickNarrativeFragments: new ArrayField(
            new StringField({ required: true, blank: true, initial: "" }),
            { required: true, initial: () => [] }
        ),
        notes: new HTMLField({ required: true, blank: true }),
        requirements: new ArrayField(
            createActionRequirementField(),
            { required: true, initial: () => [] }
        )
    });
}

// ---------------------------------------------------------------------------
// Requirement evaluation (pure functions — no Foundry API dependencies)
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-notation path against an object, returning the value at that
 * path or `undefined` if the path does not exist.
 *
 * Uses `foundry.utils.getProperty` when available so that it is consistent
 * with Foundry's own path resolution; falls back to a minimal inline
 * implementation for use in unit tests where the global is absent.
 *
 * @param {object} obj
 * @param {string} path  Dot-notation path, e.g. "system.ammunition.loaded"
 * @returns {*}
 */
export function getPropertyByPath(obj, path) {
    if (typeof foundry?.utils?.getProperty === "function") {
        return foundry.utils.getProperty(obj, path);
    }
    // Minimal fallback for test environments
    return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Evaluates a single {@link ActionRequirement} against an item document (or
 * any plain object with matching structure).
 *
 * @param {{ field: string, op: string, value: number, fieldRef?: string }} requirement
 * @param {object} item  The item document (or a plain mock with the same shape)
 * @returns {boolean}  `true` when the requirement is satisfied
 */
export function evaluateRequirement(requirement, item) {
    const lhs = getPropertyByPath(item, requirement.field);
    const rhs = requirement.fieldRef
        ? getPropertyByPath(item, requirement.fieldRef)
        : requirement.value;

    const l = Number(lhs);
    const r = Number(rhs);

    switch (requirement.op) {
        case "gt": return l > r;
        case "gte": return l >= r;
        case "lt": return l < r;
        case "lte": return l <= r;
        case "eq": return l === r;
        case "neq": return l !== r;
        default: return false;
    }
}

/**
 * Returns `true` when every requirement in the array is satisfied.
 * An empty requirements array is always satisfied.
 *
 * @param {Array<object>} requirements
 * @param {object} item
 * @returns {boolean}
 */
export function evaluateRequirements(requirements, item) {
    if (!Array.isArray(requirements) || requirements.length === 0) return true;
    return requirements.every((req) => evaluateRequirement(req, item));
}
