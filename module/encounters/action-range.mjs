function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function optionalNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function isRangedWeapon(item = null) {
    const classification = String(item?.system?.classification ?? "").trim();
    return ["simpleRanged", "martialRanged", "firearm", "explosive", "thrown"].includes(classification);
}

function hasWeaponClassification(item = null) {
    return String(item?.system?.classification ?? "").trim() !== "";
}

function normalizeRangeType(action = {}, item = null) {
    const explicitRangeType = String(action?.rangeType ?? "").trim().toLowerCase();
    if (["melee", "normal", "long"].includes(explicitRangeType)) return explicitRangeType;
    return isRangedWeapon(item) ? "normal" : "melee";
}

export function resolveActionRangeFeet(action = null, item = null) {
    const explicitRangeFeet = optionalNumber(action?.targetingRangeFeet ?? action?.effectiveRangeFeet);
    if (explicitRangeFeet !== null) return Math.max(0, explicitRangeFeet);

    const rangeType = normalizeRangeType(action ?? {}, item);
    const physicalRange = item?.system?.physical?.range ?? {};
    const rangedWeapon = isRangedWeapon(item);
    const meleeClassifiedWeapon = hasWeaponClassification(item) && !rangedWeapon;
    const defaultNormal = rangeType === "melee" || meleeClassifiedWeapon ? 5 : 30;
    const normal = toNumber(physicalRange.normal, defaultNormal);
    const long = toNumber(physicalRange.long, rangeType === "melee" || meleeClassifiedWeapon ? normal : Math.max(normal, 60));

    if (rangeType === "long") return Math.max(5, long || normal || 60);
    if (rangeType === "normal") return Math.max(5, normal || 30);
    return Math.max(5, normal || 5);
}

export function resolveActionRangeType(action = null, item = null) {
    return normalizeRangeType(action ?? {}, item);
}
