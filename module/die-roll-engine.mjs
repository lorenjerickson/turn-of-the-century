import {
    buildRollFormula,
    getRecipientAdjustment,
    sumModifiers
} from "./models/die-roll-request.mjs";

function rollOne(faces, rng) {
    return Math.floor(rng() * faces) + 1;
}

function selectKeptIndex(values = [], keep = "") {
    if (!values.length) return -1;
    if (keep === "highest") {
        return values.reduce((bestIndex, value, index) => value > values[bestIndex] ? index : bestIndex, 0);
    }
    if (keep === "lowest") {
        return values.reduce((bestIndex, value, index) => value < values[bestIndex] ? index : bestIndex, 0);
    }
    return -1;
}

export function rollDieRequestForUser(request, userId, { rng = Math.random, now = () => Date.now() } = {}) {
    const dice = Array.isArray(request?.dice) && request.dice.length ? request.dice : [{ count: 1, faces: 20 }];
    const rolledDice = dice.flatMap((die, groupIndex) => {
        const count = Math.max(1, Number(die.count ?? 1) || 1);
        const faces = Math.max(2, Number(die.faces ?? 20) || 20);
        const values = Array.from({ length: count }, () => rollOne(faces, rng));
        const keptIndex = selectKeptIndex(values, die.keep);

        return values.map((value, index) => ({
            groupIndex,
            index,
            faces,
            value,
            kept: keptIndex === -1 || keptIndex === index
        }));
    });
    const diceTotal = rolledDice.filter((die) => die.kept).reduce((total, die) => total + die.value, 0);
    const baseModifier = sumModifiers(request?.modifiers ?? []);
    const adjustment = getRecipientAdjustment(request, userId);
    const total = diceTotal + baseModifier + adjustment;

    return {
        requestId: request.id,
        userId,
        label: request.label,
        rollType: request.rollType,
        rollSubType: request.rollSubType,
        formula: buildRollFormula({ dice: request.dice, modifiers: request.modifiers, adjustment }),
        dice: rolledDice,
        modifiers: request.modifiers ?? [],
        adjustment,
        total,
        timestamp: now()
    };
}

function keptDiceFromFoundryRoll(roll = null, requestDice = []) {
    const diceTerms = Array.isArray(roll?.dice) ? roll.dice : [];
    const fallbackFaces = requestDice[0]?.faces ?? 20;
    return diceTerms.flatMap((term, groupIndex) => {
        const faces = Number(term?.faces ?? fallbackFaces) || fallbackFaces;
        const results = Array.isArray(term?.results) ? term.results : [];
        return results.map((result, index) => ({
            groupIndex,
            index,
            faces,
            value: Number(result?.result ?? result?.value ?? 0) || 0,
            kept: result?.active !== false && result?.discarded !== true
        }));
    });
}

export async function rollDieRequestForUserWithFoundry(request, userId, {
    RollClass = globalThis.Roll,
    rollMode = undefined,
    createChatMessage = true,
    fallback = rollDieRequestForUser,
    now = () => Date.now(),
    rng = Math.random
} = {}) {
    if (typeof RollClass !== "function") {
        return fallback(request, userId, { rng, now });
    }

    const adjustment = getRecipientAdjustment(request, userId);
    const formula = buildRollFormula({ dice: request?.dice, modifiers: request?.modifiers, adjustment });
    const roll = await new RollClass(formula).roll({ async: true });
    if (createChatMessage && typeof roll?.toMessage === "function") {
        await roll.toMessage({
            flavor: request?.label ?? "Requested Roll",
            rollMode
        });
    }

    const dice = keptDiceFromFoundryRoll(roll, request?.dice ?? []);
    return {
        requestId: request.id,
        userId,
        label: request.label,
        rollType: request.rollType,
        rollSubType: request.rollSubType,
        formula: String(roll?.formula ?? formula),
        dice,
        modifiers: request.modifiers ?? [],
        adjustment,
        total: Number(roll?.total ?? 0) || 0,
        timestamp: now()
    };
}
