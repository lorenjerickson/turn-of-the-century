function getFoundry(overrides = {}) {
    return overrides.foundry ?? globalThis.foundry ?? null;
}

function getGame(overrides = {}) {
    return overrides.game ?? globalThis.game ?? null;
}

function requireValue(value, label) {
    if (!value) throw new Error(`[turn-of-the-century] Foundry V14 ${label} is required.`);
    return value;
}

export function requireApplicationV2(overrides = {}) {
    return requireValue(getFoundry(overrides)?.applications?.api?.ApplicationV2, "ApplicationV2");
}

export function requireActorSheetV2(overrides = {}) {
    return requireValue(getFoundry(overrides)?.applications?.sheets?.ActorSheetV2, "ActorSheetV2");
}

export function requireItemSheetV2(overrides = {}) {
    return requireValue(getFoundry(overrides)?.applications?.sheets?.ItemSheetV2, "ItemSheetV2");
}

export function requireCombatTrackerV2(overrides = {}) {
    return requireValue(getFoundry(overrides)?.applications?.sidebar?.tabs?.CombatTracker, "CombatTracker V2");
}

export function requireFilePicker(overrides = {}) {
    const FilePicker = getFoundry(overrides)?.applications?.apps?.FilePicker;
    return requireValue(FilePicker?.implementation ?? FilePicker, "namespaced FilePicker");
}

export function getSettingsConfigClass(overrides = {}) {
    const foundry = getFoundry(overrides);
    return foundry?.applications?.apps?.SettingsConfig
        ?? foundry?.applications?.settings?.SettingsConfig
        ?? null;
}

export function requireSceneDocumentClass(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.Scene, "Scene document class");
}

export function requireActorDocumentClass(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.Actor, "Actor document class");
}

export function requireItemDocumentClass(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.Item, "Item document class");
}

export function requireCombatDocumentClass(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.Combat, "Combat document class");
}

export function requireFolderDocumentClass(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.Folder, "Folder document class");
}

export function requireActorsCollection(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.collections?.Actors, "Actors collection");
}

export function requireItemsCollection(overrides = {}) {
    return requireValue(getFoundry(overrides)?.documents?.collections?.Items, "Items collection");
}

export function getFileConstructor(overrides = {}) {
    return overrides.FileClass ?? globalThis.File ?? null;
}

export function getWorldId(overrides = {}) {
    return String(overrides.worldId ?? getGame(overrides)?.world?.id ?? "").trim();
}

export function renderFoundryApplication(app, { force = false } = {}) {
    if (typeof app?.render !== "function") return false;
    app.render({ force: Boolean(force) });
    return true;
}

export function getDocumentApplications(document) {
    return Object.values(document?.apps ?? {}).filter(Boolean);
}
