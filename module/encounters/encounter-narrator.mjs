import { getMovementFeetPerAp } from "./action-catalog.mjs";

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function resolvePropertyPath(source, path) {
    if (!path) return undefined;
    return String(path).split(".").reduce((current, key) => current?.[key], source);
}

function formatRecapTemplate(template, context = {}) {
    const rawTemplate = String(template ?? "").trim();
    if (!rawTemplate) return "";
    return rawTemplate.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression) => {
        const value = resolvePropertyPath(context, String(expression).trim());
        return value === null || value === undefined ? "" : String(value);
    });
}

function resolveDeclaredTarget(combatants, sourceCombatantId, targetCombatantId) {
    if (targetCombatantId) {
        return combatants?.get?.(targetCombatantId) ?? null;
    }
    const candidates = (combatants?.contents ?? []).filter(
        (combatant) => combatant.id !== sourceCombatantId
    );
    return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------

/**
 * Produces human-readable narrative text for encounter timeline entries.
 *
 * `EncounterNarrator` is a pure domain class: it accepts a read-only combatants
 * port and returns plain string output. It does not read or write Foundry
 * documents, flags, or globals.
 *
 * @example
 * ```js
 * const narrator = new EncounterNarrator({ combatants: combat.combatants });
 * const narrative = narrator.buildTickNarrative(timeline, tick);
 * console.log(narrative.summary);
 * ```
 */
export class EncounterNarrator {
    /** @type {{ get(id: string): object|null, contents: object[] }} */
    #combatants;

    /**
     * @param {{ combatants: { get(id: string): object|null, contents: object[] } }} options
     */
    constructor({ combatants }) {
        this.#combatants = combatants;
    }

    /**
     * Build a narrative summary for all timeline entries occurring at a given tick.
     *
     * @param {object[]} timelineEntries - The full encounter timeline array.
     * @param {number}   tick            - The AP tick to describe.
     * @returns {{ tick: number, lines: string[], summary: string }}
     */
    buildTickNarrative(timelineEntries = [], tick = 0) {
        const filtered = toArray(timelineEntries).filter(
            (entry) => toNumber(entry?.tick, 0) === toNumber(tick, 0)
        );
        const lines = filtered.map((entry) => this.describeEntry(entry)).filter(Boolean);
        return {
            tick: Number(tick) || 0,
            lines,
            summary: lines.join(" ")
        };
    }

    /**
     * Produce a single narrative line for one timeline entry.
     * Returns an empty string when no description can be determined.
     *
     * @param {object} entry - A single timeline entry.
     * @returns {string}
     */
    describeEntry(entry = null) {
        const combatantName = String(entry?.combatantName ?? "Combatant").trim() || "Combatant";
        const action = entry?.action ?? {};
        const outcome = entry?.outcome ?? {};
        const result = String(outcome?.result ?? "").trim();
        const actionType = String(action?.type ?? "").trim().toLowerCase();
        const actionId = String(action?.id ?? action?.actionId ?? "").trim().toLowerCase();
        const targetCombatant = resolveDeclaredTarget(
            this.#combatants,
            String(entry?.combatantId ?? ""),
            action?.targetId
        );
        const item = this.#getItem(entry);

        const recapText = formatRecapTemplate(action?.recapFormat, {
            Owner: { id: String(entry?.combatantId ?? ""), name: combatantName },
            Item: item,
            Target: targetCombatant
                ? { id: targetCombatant.id, name: targetCombatant.name }
                : { id: "", name: "the target" },
            action: {
                ...action,
                hitResult: this.describeHitResult(result)
            },
            outcome: {
                ...outcome,
                result
            }
        });

        if (recapText) return recapText;

        if (actionType === "movement" || result === "movementStep") {
            const movementFeet = Math.max(
                1,
                toNumber(action?.movementFeet || action?.movementFeetPerAp || getMovementFeetPerAp() || 10, 10)
            );
            return `${combatantName} moved ${movementFeet} feet.`;
        }

        if (actionType === "attack" || action?.requiresToHit) {
            const fallbackWeaponName = String(action?.label ?? "weapon").trim() || "weapon";
            const weaponName = this.#getWeaponName(entry) ?? fallbackWeaponName;
            const targetCandidate = outcome?.targetName ?? targetCombatant?.name ?? "the target";
            const targetName = String(targetCandidate).trim() || "the target";
            const hits = ["hit", "criticalhit"].includes(result.toLowerCase());
            const misses = ["miss", "criticalfailure", "interrupted", "outofrange", "reacted", "failed"].includes(
                result.toLowerCase()
            );
            if (hits) return `${combatantName} fires ${weaponName} at ${targetName} and hits.`;
            if (misses) return `${combatantName} fires ${weaponName} at ${targetName} and misses.`;
            return `${combatantName} fires ${weaponName} at ${targetName}.`;
        }

        if (actionType === "consumable") {
            return `${combatantName} uses ${String(action?.label ?? "an item").trim() || "an item"}.`;
        }

        if (actionId === "pursue" || actionId === "follow" || actionId === "avoid") {
            const movementFeet = Math.max(
                1,
                toNumber(action?.movementFeet || action?.movementFeetPerAp || getMovementFeetPerAp() || 10, 10)
            );
            return `${combatantName} moved ${movementFeet} feet.`;
        }

        return String(outcome?.detail ?? "").trim();
    }

    /**
     * Convert a raw outcome result string into a readable verb phrase.
     *
     * @param {string} result
     * @returns {string}
     */
    describeHitResult(result = "") {
        switch (String(result ?? "").trim().toLowerCase()) {
            case "hit":
            case "criticalhit":
                return "hits";
            case "miss":
            case "criticalfailure":
                return "misses";
            case "interrupted":
                return "is interrupted";
            case "outofrange":
                return "is out of range";
            case "reacted":
                return "is countered";
            case "failed":
                return "fails";
            default:
                return String(result ?? "").trim();
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    #getItem(entry = null) {
        const combatant = this.#combatants?.get?.(String(entry?.combatantId ?? "").trim()) ?? null;
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!combatant?.actor || !itemId) {
            return {
                id: "",
                name: String(action?.label ?? "item").trim() || "item"
            };
        }
        const item = combatant.actor.items?.get?.(itemId) ?? null;
        return {
            id: itemId,
            name: String(item?.name ?? item?.label ?? action?.label ?? itemId).trim() || itemId
        };
    }

    #getWeaponName(entry = null) {
        const combatant = this.#combatants?.get?.(String(entry?.combatantId ?? "").trim()) ?? null;
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!combatant?.actor || !itemId) return null;
        const item = combatant.actor.items?.get?.(itemId) ?? null;
        return String(item?.name ?? item?.label ?? action?.label ?? itemId).trim() || null;
    }
}
