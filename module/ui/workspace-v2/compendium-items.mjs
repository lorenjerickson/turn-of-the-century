function normalizeIndexEntries(index) {
    if (Array.isArray(index)) return index;
    if (Array.isArray(index?.contents)) return index.contents;
    if (typeof index?.values === "function") return Array.from(index.values());
    return [];
}

function getPackLabel(pack) {
    return pack?.metadata?.label ?? pack?.title ?? pack?.collection ?? "Compendium";
}

function isAggregateCompendiumPack(pack) {
    const collection = String(pack?.collection ?? "").toLowerCase();
    return collection.endsWith(".starter-items") || collection.endsWith(".starter-actors");
}

function buildCompendiumSemanticKey(entry) {
    const type = String(entry?.type ?? "").trim().toLowerCase();
    const name = String(entry?.name ?? "").trim().toLowerCase();
    if (!name) return null;
    return `${type}|${name}`;
}

function isBetterSemanticCompendiumEntry(candidate, existing) {
    const existingAggregate = Boolean(existing?.aggregate);
    const candidateAggregate = Boolean(candidate?.aggregate);
    if (existingAggregate !== candidateAggregate) return !candidateAggregate;

    const existingLabel = String(existing?.packLabel ?? "").toLowerCase();
    const candidateLabel = String(candidate?.packLabel ?? "").toLowerCase();
    return candidateLabel < existingLabel;
}

export function getCompendiumPacks(packsCollection = globalThis.game?.packs) {
    if (Array.isArray(packsCollection?.contents)) return packsCollection.contents;
    if (typeof packsCollection?.values === "function") return Array.from(packsCollection.values());

    const iterablePacks = Array.from(packsCollection ?? []);
    return iterablePacks.map((pack) => Array.isArray(pack) && pack.length > 1 ? pack[1] : pack);
}

export async function loadUnifiedCompendiumItems({
    packs = getCompendiumPacks(),
    gameReady = Boolean(globalThis.game?.ready),
    logger = console
} = {}) {
    if (!gameReady || !Array.isArray(packs) || !packs.length) {
        return { entries: [], ready: false };
    }

    const dedupedEntries = new Map();
    const semanticEntries = new Map();
    let itemPackCount = 0;
    let loadedPackCount = 0;
    let indexedEntryCount = 0;

    for (const pack of packs) {
        if (String(pack?.documentName ?? "").toLowerCase() !== "item") continue;

        itemPackCount += 1;
        const aggregate = isAggregateCompendiumPack(pack);
        let indexEntries = [];
        try {
            indexEntries = normalizeIndexEntries(await pack.getIndex());
            loadedPackCount += 1;
            indexedEntryCount += indexEntries.length;
        } catch (error) {
            logger?.warn?.(
                "[turn-of-the-century] Failed to load compendium index",
                pack?.collection ?? pack?.metadata?.label,
                error
            );
            continue;
        }

        for (const entry of indexEntries) {
            const entryId = entry?._id ?? entry?.id;
            const uuid = entry?.uuid ?? (entryId ? `Compendium.${pack.collection}.${entryId}` : null);
            if (!uuid || dedupedEntries.has(uuid)) continue;

            const itemEntry = {
                uuid,
                name: entry?.name ?? "Unnamed Entry",
                type: String(entry?.type ?? "item"),
                packLabel: getPackLabel(pack),
                aggregate
            };
            dedupedEntries.set(uuid, itemEntry);

            const semanticKey = buildCompendiumSemanticKey(itemEntry);
            if (!semanticKey) continue;
            const existing = semanticEntries.get(semanticKey);
            if (!existing || isBetterSemanticCompendiumEntry(itemEntry, existing)) {
                semanticEntries.set(semanticKey, itemEntry);
            }
        }
    }

    const entries = (semanticEntries.size ? Array.from(semanticEntries.values()) : Array.from(dedupedEntries.values()))
        .map(({ aggregate, ...entry }) => entry);

    entries.sort((left, right) => {
        const nameCompare = String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, { sensitivity: "base" });
        if (nameCompare !== 0) return nameCompare;
        return String(left.packLabel ?? "").localeCompare(String(right.packLabel ?? ""), undefined, { sensitivity: "base" });
    });

    return {
        entries,
        ready: itemPackCount > 0 && loadedPackCount > 0 && indexedEntryCount > 0,
        itemPackCount,
        loadedPackCount,
        indexedEntryCount
    };
}
