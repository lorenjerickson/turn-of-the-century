import { TOTC_SAMPLE_COMPENDIUMS } from "./manifest.mjs";
import { migrateLegacyExportSourceData } from "./legacy-normalizer.mjs";
import { validateStarterCompendiumPlans, formatStarterCompendiumPreflightError } from "./validator.mjs";
import {
    TOTC_SAMPLE_ACTORS,
    TOTC_SAMPLE_ITEMS,
    TOTC_SAMPLE_SCENES,
    TOTC_SAMPLE_LIBRARY_STATS
} from "../sample-content.mjs";
import {
    requireActorDocumentClass,
    requireItemDocumentClass
} from "../foundry-v14-runtime.mjs";

const ACTOR_PACK_FILTERS = {
    [TOTC_SAMPLE_COMPENDIUMS.monsters]: (entry) => entry.type === "pawn" && entry.system?.classification?.category === "monster",
    [TOTC_SAMPLE_COMPENDIUMS.heroes]: (entry) => entry.type === "hero",
    [TOTC_SAMPLE_COMPENDIUMS.villains]: (entry) => entry.type === "villain",
    [TOTC_SAMPLE_COMPENDIUMS.pawns]: (entry) => entry.type === "pawn" && entry.system?.classification?.category !== "monster",
    [TOTC_SAMPLE_COMPENDIUMS.actors]: () => true
};

const ITEM_PACK_FILTERS = {
    [TOTC_SAMPLE_COMPENDIUMS.professions]: (entry) => entry.type === "profession",
    [TOTC_SAMPLE_COMPENDIUMS.ethnicities]: (entry) => entry.type === "ethnicity",
    [TOTC_SAMPLE_COMPENDIUMS.skills]: (entry) => entry.type === "skill",
    [TOTC_SAMPLE_COMPENDIUMS.talents]: (entry) => entry.type === "talent",
    [TOTC_SAMPLE_COMPENDIUMS.quirks]: (entry) => entry.type === "quirk",
    [TOTC_SAMPLE_COMPENDIUMS.armor]: (entry) => entry.type === "armor",
    [TOTC_SAMPLE_COMPENDIUMS.weapons]: (entry) => entry.type === "weapon",
    [TOTC_SAMPLE_COMPENDIUMS.consumables]: (entry) => entry.type === "consumable",
    [TOTC_SAMPLE_COMPENDIUMS.effects]: (entry) => entry.type === "effect",
    [TOTC_SAMPLE_COMPENDIUMS.equipment]: (entry) => entry.type === "equipment" || entry.type === "item",
    [TOTC_SAMPLE_COMPENDIUMS.items]: () => true
};

function normalizeSet(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    return new Set(values.map((value) => String(value)));
}

function shouldInclude(type, setOrNull) {
    if (!setOrNull) return true;
    return setOrNull.has(type);
}

function listCompendiumPlans({ actorTypes = [], itemTypes = [] } = {}) {
    const actorTypeFilter = normalizeSet(actorTypes);
    const itemTypeFilter = normalizeSet(itemTypes);

    const actorPlans = Object.entries(ACTOR_PACK_FILTERS).map(([packName, predicate]) => ({
        packName,
        documentType: "Actor",
        entries: TOTC_SAMPLE_ACTORS.filter((entry) => shouldInclude(entry.type, actorTypeFilter) && predicate(entry))
    }));

    const itemPlans = Object.entries(ITEM_PACK_FILTERS).map(([packName, predicate]) => ({
        packName,
        documentType: "Item",
        entries: TOTC_SAMPLE_ITEMS.filter((entry) => shouldInclude(entry.type, itemTypeFilter) && predicate(entry))
    }));

    const scenePlans = [{
        packName: TOTC_SAMPLE_COMPENDIUMS.scenes,
        documentType: "Scene",
        entries: TOTC_SAMPLE_SCENES
    }];

    return [...actorPlans, ...itemPlans, ...scenePlans].filter((plan) => plan.entries.length > 0);
}

async function withPackUnlocked(pack, fn) {
    const collection = pack.collection;
    let activePack = pack;
    const wasLocked = activePack.locked;

    if (wasLocked) {
        await activePack.configure({ locked: false });

        // Re-acquire the pack so lock-sensitive methods use the updated instance.
        activePack = game.packs.get(collection) ?? activePack;
        if (activePack.locked) {
            throw new Error(`Unable to unlock compendium "${collection}" for write operations.`);
        }
    }

    try {
        return await fn(activePack);
    } finally {
        if (wasLocked) {
            await activePack.configure({ locked: true });
        }
    }
}

async function clearCompendiumPack(pack) {
    await pack.getIndex();
    const ids = pack.index.map((entry) => entry._id).filter(Boolean);
    if (!ids.length) return 0;

    return withPackUnlocked(pack, async (activePack) => {
        await activePack.documentClass.deleteDocuments(ids, { pack: activePack.collection });
        return ids.length;
    });
}

async function importIntoCompendium(pack, entries) {
    let imported = 0;

    await withPackUnlocked(pack, async (activePack) => {
        for (const entry of entries) {
            const temporaryDocument = new activePack.documentClass(migrateLegacyExportSourceData(entry));
            await activePack.importDocument(temporaryDocument);
            imported += 1;
        }
    });

    return imported;
}

export async function createTotcSampleContent({
    createActors = true,
    createItems = true,
    overwrite = false,
    actorTypes = [],
    itemTypes = [],
    limitPerType = 0
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    const ActorDocumentClass = createActors ? requireActorDocumentClass() : null;
    const ItemDocumentClass = createItems ? requireItemDocumentClass() : null;

    const actorTypeFilter = normalizeSet(actorTypes);
    const itemTypeFilter = normalizeSet(itemTypes);
    const perTypeLimit = Math.max(Number(limitPerType) || 0, 0);

    let createdActors = 0;
    let createdItems = 0;
    let skippedExisting = 0;

    const createdByType = {};
    const attemptedByType = {};

    if (createActors) {
        for (const actorData of TOTC_SAMPLE_ACTORS) {
            if (!shouldInclude(actorData.type, actorTypeFilter)) continue;

            attemptedByType[actorData.type] = (attemptedByType[actorData.type] ?? 0) + 1;
            if (perTypeLimit && attemptedByType[actorData.type] > perTypeLimit) continue;

            const existing = game.actors?.find((actor) => actor.name === actorData.name && actor.type === actorData.type);
            if (existing && !overwrite) {
                skippedExisting += 1;
                continue;
            }
            if (existing && overwrite) await existing.delete();

            await ActorDocumentClass.create(migrateLegacyExportSourceData(actorData));
            createdActors += 1;
            createdByType[actorData.type] = (createdByType[actorData.type] ?? 0) + 1;
        }
    }

    if (createItems) {
        for (const itemData of TOTC_SAMPLE_ITEMS) {
            if (!shouldInclude(itemData.type, itemTypeFilter)) continue;

            attemptedByType[itemData.type] = (attemptedByType[itemData.type] ?? 0) + 1;
            if (perTypeLimit && attemptedByType[itemData.type] > perTypeLimit) continue;

            const existing = game.items?.find((item) => item.name === itemData.name && item.type === itemData.type);
            if (existing && !overwrite) {
                skippedExisting += 1;
                continue;
            }
            if (existing && overwrite) await existing.delete();

            await ItemDocumentClass.create(migrateLegacyExportSourceData(itemData));
            createdItems += 1;
            createdByType[itemData.type] = (createdByType[itemData.type] ?? 0) + 1;
        }
    }

    return {
        createdActors,
        createdItems,
        totalCreated: createdActors + createdItems,
        skippedExisting,
        createdByType,
        stats: TOTC_SAMPLE_LIBRARY_STATS
    };
}

export async function publishTotcSampleCompendiums({
    overwrite = true,
    actorTypes = [],
    itemTypes = []
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const systemId = game.system?.id;
    const plans = listCompendiumPlans({ actorTypes, itemTypes });
    const preflightIssues = validateStarterCompendiumPlans(plans);
    if (preflightIssues.length) {
        throw new Error(formatStarterCompendiumPreflightError(preflightIssues));
    }

    const missingPacks = [];
    const byPack = {};

    let importedActors = 0;
    let importedItems = 0;
    let importedScenes = 0;
    let clearedActors = 0;
    let clearedItems = 0;
    let clearedScenes = 0;

    for (const plan of plans) {
        const pack = game.packs.get(`${systemId}.${plan.packName}`);
        if (!pack) {
            missingPacks.push(plan.packName);
            continue;
        }

        let cleared = 0;
        if (overwrite) {
            cleared = await clearCompendiumPack(pack);
        }
        const imported = await importIntoCompendium(pack, plan.entries);

        byPack[plan.packName] = {
            collection: pack.collection,
            documentType: plan.documentType,
            imported,
            cleared
        };

        if (plan.documentType === "Actor") {
            importedActors += imported;
            clearedActors += cleared;
        } else if (plan.documentType === "Item") {
            importedItems += imported;
            clearedItems += cleared;
        } else if (plan.documentType === "Scene") {
            importedScenes += imported;
            clearedScenes += cleared;
        }
    }

    if (missingPacks.length) {
        throw new Error(
            `Declared compendium packs were not found: ${missingPacks.join(", ")}. Reload the world after updating system.json, then try again.`
        );
    }

    return {
        byPack,
        importedActors,
        importedItems,
        importedScenes,
        totalImported: importedActors + importedItems + importedScenes,
        clearedActors,
        clearedItems,
        clearedScenes,
        overwrite
    };
}
