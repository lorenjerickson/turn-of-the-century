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

function normalizeFragmentCollection(value) {
    if (Array.isArray(value)) {
        return value.map((fragment) => String(fragment ?? "").trim()).filter(Boolean);
    }
    if (value && typeof value === "object") {
        return Object.entries(value)
            .sort(([left], [right]) => toNumber(left, 0) - toNumber(right, 0))
            .map(([, fragment]) => String(fragment ?? "").trim())
            .filter(Boolean);
    }
    return [];
}

function selectProgressFragment(fragments, progress) {
    const normalized = normalizeFragmentCollection(fragments);
    if (!normalized.length) return "";
    const index = Math.max(0, Math.min(normalized.length - 1, toNumber(progress, 1) - 1));
    return normalized[index] ?? "";
}

function sentenceCasePeriod(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return "";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
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
        const clauseText = String(entry?.clauseText ?? "").trim();
        const actionType = String(action?.type ?? "").trim().toLowerCase();
        const actionId = String(action?.id ?? action?.actionId ?? "").trim().toLowerCase();
        const resultId = result.toLowerCase();
        const isProgressResult = ["progress", "movementstep", "reactionready"].includes(resultId);
        const targetCombatant = resolveDeclaredTarget(
            this.#combatants,
            String(entry?.combatantId ?? ""),
            action?.targetId
        );
        const itemDocument = this.#getItemDocument(entry);
        const item = this.#getItem(entry, itemDocument);
        const context = {
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
            },
            tick: {
                progress: this.#getActionProgress(action, entry),
                total: this.#getActionApSpan(action)
            }
        };

        if (isProgressResult) {
            const tickFlavorText = this.#formatTickFlavor(entry, context, itemDocument);
            if (tickFlavorText) return tickFlavorText;
        }

        const recapText = formatRecapTemplate(action?.recapFormat, context);

        if (recapText) return recapText;

        if (clauseText && isProgressResult) {
            return `${combatantName}: ${clauseText}.`;
        }

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

    #getItem(entry = null, itemDocument = null) {
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!itemDocument) {
            return {
                id: itemId,
                name: String(action?.label ?? itemId ?? "item").trim() || "item"
            };
        }
        return {
            id: itemId,
            name: String(itemDocument?.name ?? itemDocument?.label ?? action?.label ?? itemId).trim() || itemId
        };
    }

    #getItemDocument(entry = null) {
        const combatant = this.#combatants?.get?.(String(entry?.combatantId ?? "").trim()) ?? null;
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!combatant?.actor || !itemId) return null;
        return combatant.actor.items?.get?.(itemId) ?? null;
    }

    #getWeaponName(entry = null) {
        const action = entry?.action ?? {};
        const itemId = String(action?.itemId ?? "").trim();
        if (!itemId) return null;
        const item = this.#getItemDocument(entry);
        return String(item?.name ?? item?.label ?? action?.label ?? itemId).trim() || null;
    }

    #formatTickFlavor(entry = null, context = {}, itemDocument = null) {
        const action = entry?.action ?? {};
        const progress = this.#getActionProgress(action, entry);
        const itemFragment = selectProgressFragment(this.#getItemTickFragments(action, itemDocument), progress);
        const actionFragment = selectProgressFragment(action?.tickNarrativeFragments, progress);
        const fragment = itemFragment || actionFragment;
        if (fragment) return sentenceCasePeriod(formatRecapTemplate(fragment, context));
        return this.#defaultProgressNarrative(entry, context);
    }

    #getItemTickFragments(action = {}, itemDocument = null) {
        const actionId = String(action?.actionId ?? action?.id ?? "").split(":").pop();
        const variants = toArray(itemDocument?.system?.actions?.variants);
        const variant = variants.find((candidate) => String(candidate?.id ?? "") === actionId) ?? null;
        return normalizeFragmentCollection(variant?.tickNarrativeFragments);
    }

    #getActionProgress(action = {}, entry = null) {
        const explicitProgress = toNumber(action?._effectProgress ?? action?._runtimeProgress ?? entry?.progress, 0);
        if (explicitProgress > 0) return explicitProgress;
        const start = toNumber(action?.apStart, 0);
        const tick = toNumber(entry?.tick, 0);
        if (start > 0 && tick >= start) return tick - start + 1;
        return 1;
    }

    #getActionApSpan(action = {}) {
        return Math.max(1, toNumber(action?.apEnvelope?.effectAp ?? action?.apCost ?? action?.apMax, 1));
    }

    #defaultProgressNarrative(entry = null, context = {}) {
        const action = entry?.action ?? {};
        const actionType = String(action?.type ?? "").trim().toLowerCase();
        const actionLabel = String(action?.label ?? "the action").trim() || "the action";
        const ownerName = String(context?.Owner?.name ?? entry?.combatantName ?? "Combatant").trim() || "Combatant";
        if (actionType === "attack" || action?.requiresToHit) {
            const weaponName = this.#getWeaponName(entry) ?? actionLabel;
            const targetName = String(context?.Target?.name ?? "the target").trim() || "the target";
            const progress = this.#getActionProgress(action, entry);
            if (progress <= 1) return `${ownerName} readies ${weaponName}.`;
            return `${ownerName} takes aim at ${targetName}.`;
        }
        if (actionType === "consumable") return `${ownerName} readies ${actionLabel}.`;
        if (actionType === "defense") return `${ownerName} braces for ${actionLabel}.`;
        if (actionType === "utility") return `${ownerName} continues ${actionLabel}.`;
        return "";
    }
}
