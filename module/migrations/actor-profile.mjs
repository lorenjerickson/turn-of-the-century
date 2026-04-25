const HTML_TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/g;

function asString(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function htmlToText(value) {
    const text = asString(value).replace(HTML_TAG_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim();
    return text;
}

function isBlank(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
}

function normalizeTag(value) {
    return asString(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function uniqueNonEmpty(values) {
    return Array.from(new Set(values.map(asString).filter(Boolean)));
}

function setIfBlank(updateData, path, currentValue, fallbackValue) {
    if (!isBlank(currentValue) || isBlank(fallbackValue)) return;
    updateData[path] = fallbackValue;
}

function buildActorProfileUpdate(actor) {
    const system = actor.system?.toObject?.() ?? foundry.utils.deepClone(actor.system ?? {});
    const classification = system.classification ?? {};
    const profile = system.profile ?? {};
    const progression = system.progression ?? {};

    const updateData = {};

    setIfBlank(updateData, "system.profile.role", profile.role, classification.profession);
    setIfBlank(updateData, "system.profile.faction", profile.faction, classification.origin);

    const biographyText = htmlToText(system.biography).slice(0, 180);
    setIfBlank(updateData, "system.profile.summary", profile.summary, biographyText);

    if (isBlank(profile.tags)) {
        const tags = uniqueNonEmpty([
            normalizeTag(actor.type),
            normalizeTag(classification.category),
            normalizeTag(classification.profession),
            normalizeTag(classification.origin)
        ]);
        if (tags.length) updateData["system.profile.tags"] = tags;
    }

    if (actor.type === "hero") {
        const hero = system.hero ?? {};
        setIfBlank(updateData, "system.hero.archetype", hero.archetype, profile.role || classification.profession);
    }

    if (actor.type === "villain") {
        const villain = system.villain ?? {};
        const noteSeed = htmlToText(system.notes).slice(0, 120);
        setIfBlank(updateData, "system.villain.scheme", villain.scheme, noteSeed);
    }

    if (actor.type === "pawn") {
        const pawn = system.pawn ?? {};
        setIfBlank(updateData, "system.pawn.role", pawn.role, profile.role || classification.profession);
        if (pawn.threat === undefined || pawn.threat === null) {
            updateData["system.pawn.threat"] = clamp(progression.level || 1, 0, 10);
        }
        setIfBlank(updateData, "system.pawn.disposition", pawn.disposition, "neutral");
    }

    return updateData;
}

async function migrateDocument(document, { dryRun = false } = {}) {
    const updateData = buildActorProfileUpdate(document);
    const changedPaths = Object.keys(updateData);

    if (!changedPaths.length) {
        return {
            id: document.id,
            name: document.name,
            type: document.type,
            changedPaths,
            updated: false
        };
    }

    if (!dryRun) await document.update(updateData);

    return {
        id: document.id,
        name: document.name,
        type: document.type,
        changedPaths,
        updated: !dryRun
    };
}

export async function migrateTotcActorProfiles({
    includeCompendiums = false,
    dryRun = false,
    notify = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun,
        includeCompendiums,
        worldActorsScanned: 0,
        worldActorsUpdated: 0,
        compendiumActorsScanned: 0,
        compendiumActorsUpdated: 0,
        changedDocuments: []
    };

    for (const actor of game.actors?.contents ?? []) {
        report.worldActorsScanned += 1;
        const result = await migrateDocument(actor, { dryRun });
        if (result.changedPaths.length) {
            report.changedDocuments.push({
                source: "world",
                ...result
            });
            report.worldActorsUpdated += 1;
        }
    }

    if (includeCompendiums) {
        const packs = (game.packs?.filter((pack) => pack.documentName === "Actor" && pack.metadata.packageType === "system") ?? []);

        for (const pack of packs) {
            const wasLocked = pack.locked;
            if (wasLocked && !dryRun) await pack.configure({ locked: false });

            try {
                const documents = await pack.getDocuments();
                for (const actor of documents) {
                    report.compendiumActorsScanned += 1;
                    const result = await migrateDocument(actor, { dryRun });
                    if (result.changedPaths.length) {
                        report.changedDocuments.push({
                            source: pack.collection,
                            ...result
                        });
                        report.compendiumActorsUpdated += 1;
                    }
                }
            } finally {
                if (wasLocked && !dryRun) await pack.configure({ locked: true });
            }
        }
    }

    if (notify) {
        const updated = report.worldActorsUpdated + report.compendiumActorsUpdated;
        const scanned = report.worldActorsScanned + report.compendiumActorsScanned;
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(`Turn of the Century actor ${label}: ${updated} of ${scanned} actor documents require updates.`);
    }

    return report;
}
