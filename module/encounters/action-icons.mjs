const GAME_ICONS_ROOT = "modules/game-icons-net/blackbackground";

function gameIcon(name) {
    return `${GAME_ICONS_ROOT}/${name}.svg`;
}

export const ACTION_ICONS = Object.freeze({
    move: gameIcon("move"),
    pursue: gameIcon("run"),
    follow: gameIcon("shadow-follower"),
    avoid: gameIcon("avoidance"),
    hunkDown: gameIcon("bunker"),
    dodge: gameIcon("dodge"),
    overwatch: gameIcon("watchtower"),

    meleeStrike: gameIcon("sword-brandish"),
    twoHandedStrike: gameIcon("sword-clash"),
    thrownAttack: gameIcon("throwing-ball"),
    rangedAttack: gameIcon("target-shot"),
    quickShot: gameIcon("gunshot"),
    pistolQuickShot: gameIcon("gunshot"),
    aimedShot: gameIcon("bullseye"),
    pistolAimedShot: gameIcon("bullseye"),
    precisionStrike: gameIcon("target-shot"),
    reload: gameIcon("reload-gun-barrel"),
    lightAndThrow: gameIcon("grenade"),
    flareShot: gameIcon("torch"),
    weaponAttack: gameIcon("attack-gauge"),

    consumeBeltElixir: gameIcon("drinking"),
    consumeItem: gameIcon("drinking"),
    useItem: gameIcon("gear-hammer")
});

const ACTION_TYPE_ICONS = Object.freeze({
    attack: gameIcon("attack-gauge"),
    movement: gameIcon("move"),
    defense: gameIcon("bordered-shield"),
    consumable: gameIcon("drink-me"),
    utility: gameIcon("gear-hammer")
});

const ACTION_FALLBACK_ICON = "icons/svg/d20-grey.svg";

export function resolveActionIcon(action = {}, { itemIcon = "" } = {}) {
    const explicitIcon = String(action?.img ?? action?.icon ?? "").trim();
    if (explicitIcon) return explicitIcon;

    const actionId = String(action?.actionId ?? action?.id ?? "").trim();
    if (ACTION_ICONS[actionId]) return ACTION_ICONS[actionId];

    const inheritedItemIcon = String(itemIcon ?? "").trim();
    if (inheritedItemIcon) return inheritedItemIcon;

    return ACTION_TYPE_ICONS[String(action?.type ?? "").trim()] ?? ACTION_FALLBACK_ICON;
}
