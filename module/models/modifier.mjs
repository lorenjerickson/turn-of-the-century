const {
    BooleanField,
    HTMLField,
    NumberField,
    SchemaField,
    StringField
} = foundry.data.fields;

// ---------------------------------------------------------------------------
// Target registry
// Each key is a dot-path into the actor or item schema. `applicableTo` lists
// which document types can receive this modifier: "actor", "weapon", "armor".
// ---------------------------------------------------------------------------

export const TOTC_MODIFIER_TARGETS = {
    // Defenses
    "defenses.armorClass":          { label: "Armor Class",          applicableTo: ["actor"] },
    "defenses.initiative":          { label: "Initiative",           applicableTo: ["actor"] },

    // Movement
    "movement.walk":                { label: "Walk Speed",           applicableTo: ["actor"] },
    "movement.climb":               { label: "Climb Speed",          applicableTo: ["actor"] },
    "movement.swim":                { label: "Swim Speed",           applicableTo: ["actor"] },
    "movement.fly":                 { label: "Fly Speed",            applicableTo: ["actor"] },

    // Resources
    "resources.health.max":         { label: "Max Hit Points",       applicableTo: ["actor"] },
    "resources.health.temp":        { label: "Temporary Hit Points", applicableTo: ["actor"] },
    "resources.grit.max":           { label: "Max Grit",             applicableTo: ["actor"] },
    "resources.grit.temp":          { label: "Temporary Grit",       applicableTo: ["actor"] },

    // Ability scores
    "abilities.str.value":          { label: "Strength",             applicableTo: ["actor"] },
    "abilities.str.bonus":          { label: "Strength Bonus",       applicableTo: ["actor"] },
    "abilities.str.save":           { label: "Strength Save",        applicableTo: ["actor"] },
    "abilities.dex.value":          { label: "Dexterity",            applicableTo: ["actor"] },
    "abilities.dex.bonus":          { label: "Dexterity Bonus",      applicableTo: ["actor"] },
    "abilities.dex.save":           { label: "Dexterity Save",       applicableTo: ["actor"] },
    "abilities.con.value":          { label: "Constitution",         applicableTo: ["actor"] },
    "abilities.con.bonus":          { label: "Constitution Bonus",   applicableTo: ["actor"] },
    "abilities.con.save":           { label: "Constitution Save",    applicableTo: ["actor"] },
    "abilities.int.value":          { label: "Intelligence",         applicableTo: ["actor"] },
    "abilities.int.bonus":          { label: "Intelligence Bonus",   applicableTo: ["actor"] },
    "abilities.int.save":           { label: "Intelligence Save",    applicableTo: ["actor"] },
    "abilities.wis.value":          { label: "Wisdom",               applicableTo: ["actor"] },
    "abilities.wis.bonus":          { label: "Wisdom Bonus",         applicableTo: ["actor"] },
    "abilities.wis.save":           { label: "Wisdom Save",          applicableTo: ["actor"] },
    "abilities.cha.value":          { label: "Charisma",             applicableTo: ["actor"] },
    "abilities.cha.bonus":          { label: "Charisma Bonus",       applicableTo: ["actor"] },
    "abilities.cha.save":           { label: "Charisma Save",        applicableTo: ["actor"] },
    "abilities.san.value":          { label: "Sanity",               applicableTo: ["actor"] },
    "abilities.san.bonus":          { label: "Sanity Bonus",         applicableTo: ["actor"] },
    "abilities.san.save":           { label: "Sanity Save",          applicableTo: ["actor"] },

    // Skills
    "skills.acrobatics.value":      { label: "Acrobatics",           applicableTo: ["actor"] },
    "skills.acrobatics.bonus":      { label: "Acrobatics Bonus",     applicableTo: ["actor"] },
    "skills.animalHandling.value":  { label: "Animal Handling",      applicableTo: ["actor"] },
    "skills.animalHandling.bonus":  { label: "Animal Handling Bonus",applicableTo: ["actor"] },
    "skills.arcana.value":          { label: "Arcana",               applicableTo: ["actor"] },
    "skills.arcana.bonus":          { label: "Arcana Bonus",         applicableTo: ["actor"] },
    "skills.athletics.value":       { label: "Athletics",            applicableTo: ["actor"] },
    "skills.athletics.bonus":       { label: "Athletics Bonus",      applicableTo: ["actor"] },
    "skills.deception.value":       { label: "Deception",            applicableTo: ["actor"] },
    "skills.deception.bonus":       { label: "Deception Bonus",      applicableTo: ["actor"] },
    "skills.history.value":         { label: "History",              applicableTo: ["actor"] },
    "skills.history.bonus":         { label: "History Bonus",        applicableTo: ["actor"] },
    "skills.insight.value":         { label: "Insight",              applicableTo: ["actor"] },
    "skills.insight.bonus":         { label: "Insight Bonus",        applicableTo: ["actor"] },
    "skills.intimidation.value":    { label: "Intimidation",         applicableTo: ["actor"] },
    "skills.intimidation.bonus":    { label: "Intimidation Bonus",   applicableTo: ["actor"] },
    "skills.investigation.value":   { label: "Investigation",        applicableTo: ["actor"] },
    "skills.investigation.bonus":   { label: "Investigation Bonus",  applicableTo: ["actor"] },
    "skills.medicine.value":        { label: "Medicine",             applicableTo: ["actor"] },
    "skills.medicine.bonus":        { label: "Medicine Bonus",       applicableTo: ["actor"] },
    "skills.nature.value":          { label: "Nature",               applicableTo: ["actor"] },
    "skills.nature.bonus":          { label: "Nature Bonus",         applicableTo: ["actor"] },
    "skills.perception.value":      { label: "Perception",           applicableTo: ["actor"] },
    "skills.perception.bonus":      { label: "Perception Bonus",     applicableTo: ["actor"] },
    "skills.performance.value":     { label: "Performance",          applicableTo: ["actor"] },
    "skills.performance.bonus":     { label: "Performance Bonus",    applicableTo: ["actor"] },
    "skills.persuasion.value":      { label: "Persuasion",           applicableTo: ["actor"] },
    "skills.persuasion.bonus":      { label: "Persuasion Bonus",     applicableTo: ["actor"] },
    "skills.religion.value":        { label: "Religion",             applicableTo: ["actor"] },
    "skills.religion.bonus":        { label: "Religion Bonus",       applicableTo: ["actor"] },
    "skills.sleightOfHand.value":   { label: "Sleight of Hand",      applicableTo: ["actor"] },
    "skills.sleightOfHand.bonus":   { label: "Sleight of Hand Bonus",applicableTo: ["actor"] },
    "skills.stealth.value":         { label: "Stealth",              applicableTo: ["actor"] },
    "skills.stealth.bonus":         { label: "Stealth Bonus",        applicableTo: ["actor"] },
    "skills.survival.value":        { label: "Survival",             applicableTo: ["actor"] },
    "skills.survival.bonus":        { label: "Survival Bonus",       applicableTo: ["actor"] },

    // Senses
    "senses.passivePerception":     { label: "Passive Perception",   applicableTo: ["actor"] },
    "senses.passiveInsight":        { label: "Passive Insight",      applicableTo: ["actor"] },

    // Progression
    "progression.proficiencyBonus": { label: "Proficiency Bonus",    applicableTo: ["actor"] },

    // Inventory
    "inventory.pack.capacity":      { label: "Pack Capacity",        applicableTo: ["actor"] },

    // Weapon self-targets
    "damage.bonus":                 { label: "Damage Bonus",         applicableTo: ["weapon"] },
    "toHitBonus":                   { label: "To-Hit Bonus",         applicableTo: ["weapon"] },

    // Armor self-targets
    "armorClass.increment":         { label: "AC Increment",         applicableTo: ["armor"] },
    "encumbrance.stealthPenalty":   { label: "Stealth Penalty",      applicableTo: ["armor"] },
    "encumbrance.movementPenalty":  { label: "Movement Penalty",     applicableTo: ["armor"] }
};

export const TOTC_MODIFIER_TARGET_KEYS = Object.keys(TOTC_MODIFIER_TARGETS);

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** How the modifier value is applied to the target. */
export const TOTC_MODIFIER_OPERATIONS = ["add", "multiply", "set", "override"];

/**
 * Duration type determines which sub-fields are relevant.
 *   permanent — no expiry; lasts as long as the source is equipped/active
 *   encounter  — expires after a number of encounter-interval units
 *   temporal   — expires after a real-world/calendar time interval
 */
export const TOTC_MODIFIER_DURATION_TYPES = ["permanent", "encounter", "temporal"];

/** Encounter-based time units. */
export const TOTC_MODIFIER_ENCOUNTER_UNITS = ["round", "turn", "scene"];

/** Calendar/clock time units. */
export const TOTC_MODIFIER_TEMPORAL_UNITS = ["minute", "hour", "day", "week", "month"];

// ---------------------------------------------------------------------------
// Shared field factory
// Used by armor, weapon, consumable, item, effect, and ethnicity models,
// as well as the actor's active/suppressed modifier tracking arrays.
// ---------------------------------------------------------------------------

/**
 * Creates the schema for a single modifier entry.
 * @returns {SchemaField}
 */
export function createModifierEntryField() {
    return new SchemaField({
        label: new StringField({ required: true, blank: false, initial: "Modifier" }),

        // What scalar path this modifier affects (e.g. "defenses.armorClass")
        target: new StringField({ required: true, blank: false, initial: "defenses.armorClass" }),

        // How the value is applied
        operation: new StringField({
            required: true,
            blank: false,
            choices: TOTC_MODIFIER_OPERATIONS,
            initial: "add"
        }),

        // The numeric delta or absolute value, depending on operation
        value: new NumberField({ required: true, initial: 0 }),

        // Duration configuration
        duration: new SchemaField({
            type: new StringField({
                required: true,
                blank: false,
                choices: TOTC_MODIFIER_DURATION_TYPES,
                initial: "permanent"
            }),
            // Encounter-interval fields (used when type === "encounter")
            encounterUnit: new StringField({
                required: true,
                blank: false,
                choices: TOTC_MODIFIER_ENCOUNTER_UNITS,
                initial: "round"
            }),
            encounterCount: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
            // Calendar-time fields (used when type === "temporal")
            temporalUnit: new StringField({
                required: true,
                blank: false,
                choices: TOTC_MODIFIER_TEMPORAL_UNITS,
                initial: "hour"
            }),
            temporalCount: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
        }),

        // Optional freeform condition (e.g. "only when no armor is worn")
        condition: new StringField({ required: true, blank: true, initial: "" }),

        notes: new HTMLField({ required: true, blank: true })
    });
}

// ---------------------------------------------------------------------------
// Active modifier entry (used on the actor to track runtime state)
// Extends the base modifier entry with source attribution and expiry tracking.
// ---------------------------------------------------------------------------

/**
 * Creates the schema for a modifier that is currently active on an actor.
 * Includes all base modifier fields plus source and expiry tracking fields.
 * @returns {SchemaField}
 */
export function createActiveModifierEntryField() {
    const base = createModifierEntryField();
    return new SchemaField({
        ...base.fields,

        // Source attribution
        sourceId: new StringField({ required: true, blank: true, initial: "" }),
        sourceType: new StringField({
            required: true,
            blank: false,
            choices: ["armor", "weapon", "consumable", "item", "effect", "ethnicity", "manual"],
            initial: "manual"
        }),
        sourceName: new StringField({ required: true, blank: true, initial: "" }),

        // Expiry tracking (populated at runtime for encounter/temporal durations)
        expiresAtRound: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        expiresAtTime: new NumberField({ required: true, min: 0, initial: 0 }),
        appliedAt: new NumberField({ required: true, min: 0, initial: 0 }),

        // Whether this modifier is currently being suppressed rather than active
        suppressed: new BooleanField({ required: true, initial: false })
    });
}
