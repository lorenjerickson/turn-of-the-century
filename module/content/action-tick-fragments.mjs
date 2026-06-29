const ITEM_ACTION_TICK_FRAGMENTS = Object.freeze({
    "service revolver:pistolquickshot": [
        "{{Owner.name}} snaps {{Item.name}} up.",
        "{{Owner.name}} fires."
    ],
    "service revolver:pistolaimedshot": [
        "{{Owner.name}} raises {{Item.name}}.",
        "{{Owner.name}} sights {{Target.name}}.",
        "{{Owner.name}} fires."
    ],
    "trench truncheon:weaponattack": [
        "{{Owner.name}} brings {{Item.name}} to hand.",
        "{{Owner.name}} strikes."
    ],
    "ratcatcher carbine:weaponattack": [
        "{{Owner.name}} shoulders {{Item.name}}.",
        "{{Owner.name}} fires."
    ],
    "clockmaker's stiletto:weaponattack": [
        "{{Owner.name}} turns {{Item.name}} in close.",
        "{{Owner.name}} slips the point in."
    ],
    "ashwood hunting spear:weaponattack": [
        "{{Owner.name}} sets {{Item.name}}.",
        "{{Owner.name}} thrusts."
    ],
    "galvanic prod:weaponattack": [
        "{{Owner.name}} primes {{Item.name}}.",
        "{{Owner.name}} jabs with the crackling prod."
    ],
    "factory cleaver:weaponattack": [
        "{{Owner.name}} hauls {{Item.name}} back.",
        "{{Owner.name}} hacks forward."
    ],
    "signal flare bomb:weaponattack": [
        "{{Owner.name}} readies {{Item.name}}.",
        "{{Owner.name}} throws it toward {{Target.name}}."
    ],
    "foundry hammer:weaponattack": [
        "{{Owner.name}} hefts {{Item.name}}.",
        "{{Owner.name}} swings hard."
    ],
    "streetline shotgun:weaponattack": [
        "{{Owner.name}} levels {{Item.name}}.",
        "{{Owner.name}} blasts toward {{Target.name}}."
    ],
    "dock hook pike:weaponattack": [
        "{{Owner.name}} lowers {{Item.name}}.",
        "{{Owner.name}} drives the hook forward."
    ],
    "clockwork derringer:weaponattack": [
        "{{Owner.name}} palms {{Item.name}}.",
        "{{Owner.name}} snaps off the shot."
    ],
    "wire garrote:weaponattack": [
        "{{Owner.name}} draws {{Item.name}} taut.",
        "{{Owner.name}} tightens the wire."
    ],
    "signal flare pistol:flareshot": [
        "{{Owner.name}} cocks {{Item.name}}.",
        "{{Owner.name}} sights {{Target.name}}.",
        "{{Owner.name}} fires the flare."
    ],
    "surgeon's lancet:precisionstrike": [
        "{{Owner.name}} angles {{Item.name}}.",
        "{{Owner.name}} makes a careful strike."
    ],
    "rivet hammer:weaponattack": [
        "{{Owner.name}} lifts {{Item.name}}.",
        "{{Owner.name}} brings it down."
    ],
    "aetheric elixir:consumebeltelixir": [
        "{{Owner.name}} draws {{Item.name}} from the belt.",
        "{{Owner.name}} drinks it down."
    ],
    "acid-wash solution:consumeitem": [
        "{{Owner.name}} uncorks {{Item.name}}."
    ],
    "*:useitem": [
        "{{Owner.name}} brings {{Item.name}} to hand."
    ],
    "*:unlock": [
        "{{Owner.name}} sets {{Item.name}} to the lock.",
        "{{Owner.name}} works the mechanism."
    ]
});

function key(itemName = "", actionId = "") {
    return `${String(itemName ?? "").trim().toLowerCase()}:${String(actionId ?? "").trim().toLowerCase()}`;
}

export function tickFragmentsForItemAction(itemName = "", actionId = "") {
    const exact = ITEM_ACTION_TICK_FRAGMENTS[key(itemName, actionId)];
    const generic = ITEM_ACTION_TICK_FRAGMENTS[key("*", actionId)];
    return [...(exact ?? generic ?? [])];
}

export function hasTickFragmentsForItemAction(itemName = "", actionId = "") {
    return tickFragmentsForItemAction(itemName, actionId).length > 0;
}
