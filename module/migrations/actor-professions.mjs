const LEGACY_STARTER_PROFESSION_MAP = {
    inspector: "Urban Detective",
    constable: "Railway Marshal",
    antiquarian: "Occult Natural Philosopher",
    "occult surgeon": "Field Surgeon",
    magistrate: "Underworld Liaison",
    "factory foreman": "Smokestack Mechanist"
};

function asString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function toProfessionEntryMap(values) {
    const entries = new Map();

    for (const value of values) {
        const name = asString(value);
        if (!name) continue;

        const key = name.toLowerCase();
        if (!entries.has(key)) {
            entries.set(key, name);
        }
    }

    return entries;
}

async function getAvailableProfessions() {
    const names = [];

    for (const item of game.items?.contents ?? []) {
        if (item.type !== "profession") continue;
        names.push(item.name);
    }

    const itemPacks = game.packs?.filter((pack) => pack.documentName === "Item") ?? [];
    for (const pack of itemPacks) {
        try {
            const index = await pack.getIndex();
            for (const entry of index ?? []) {
                if (entry.type !== "profession") continue;
                names.push(entry.name);
            }
        } catch (error) {
            console.warn(`[turn-of-the-century] Could not inspect profession entries in ${pack.collection}.`, error);
        }
    }

    return toProfessionEntryMap(names);
}

function getFallbackProfession(availableByKey) {
    if (!availableByKey.size) return "";

    const preferred = availableByKey.get("urban detective");
    if (preferred) return preferred;

    return [...availableByKey.values()].sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function normalizeProfession(currentProfession, availableByKey, fallbackProfession) {
    const current = asString(currentProfession);
    if (!current) return fallbackProfession;

    const exact = availableByKey.get(current.toLowerCase());
    if (exact) return exact;

    const mapped = LEGACY_STARTER_PROFESSION_MAP[current.toLowerCase()];
    if (!mapped) return current;

    return availableByKey.get(mapped.toLowerCase()) ?? current;
}

function buildActorProfessionUpdate(actor, availableByKey, fallbackProfession) {
    const currentProfession = actor.system?.classification?.profession;
    const normalizedProfession = normalizeProfession(currentProfession, availableByKey, fallbackProfession);

    if (normalizedProfession === asString(currentProfession)) return {};

    return {
        "system.classification.profession": normalizedProfession
    };
}

async function migrateActor(actor, availableByKey, fallbackProfession, { dryRun = false } = {}) {
    const updateData = buildActorProfessionUpdate(actor, availableByKey, fallbackProfession);
    const changedPaths = Object.keys(updateData);

    if (!changedPaths.length) {
        return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: false };
    }

    if (!dryRun) await actor.update(updateData);
    return { id: actor.id, name: actor.name, type: actor.type, changedPaths, updated: !dryRun };
}

async function migrateActorCollection(actors, report, sourceLabel, availableByKey, fallbackProfession, { dryRun = false } = {}) {
    for (const actor of actors) {
        report.actorsScanned += 1;
        const result = await migrateActor(actor, availableByKey, fallbackProfession, { dryRun });
        if (!result.changedPaths.length) continue;

        report.actorsUpdated += 1;
        report.changedDocuments.push({ source: sourceLabel, ...result });
    }
}

export async function migrateTotcActorProfessions({ dryRun = false, notify = true, includeCompendiums = false } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const availableByKey = await getAvailableProfessions();
    const fallbackProfession = getFallbackProfession(availableByKey);

    const report = {
        dryRun,
        includeCompendiums,
        availableProfessionCount: availableByKey.size,
        fallbackProfession,
        actorsScanned: 0,
        actorsUpdated: 0,
        changedDocuments: []
    };

    await migrateActorCollection(game.actors?.contents ?? [], report, "world-actor", availableByKey, fallbackProfession, { dryRun });

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === "Actor" && pack.metadata.packageType === "system") ?? []);
        for (const pack of packs) {
            const wasLocked = pack.locked;
            if (wasLocked && !dryRun) await pack.configure({ locked: false });

            try {
                const docs = await pack.getDocuments();
                await migrateActorCollection(docs, report, pack.collection, availableByKey, fallbackProfession, { dryRun });
            } finally {
                if (wasLocked && !dryRun) await pack.configure({ locked: true });
            }
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(
            `Turn of the Century actor-profession ${label}: ${report.actorsUpdated} actors updated using ${report.availableProfessionCount} available professions.`
        );
    }

    return report;
}
