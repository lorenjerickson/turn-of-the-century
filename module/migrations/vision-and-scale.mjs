import { DEFAULT_TOKEN_VISION_RANGE } from "../document-defaults.mjs";
import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const SYSTEM_ID = "turn-of-the-century";
const MIGRATION_FLAG_PATH = `flags.${SYSTEM_ID}.visionAndScaleV20`;
const OLD_GRID_DISTANCE = 10;
const NEW_GRID_DISTANCE = 5;
const OLD_MOVEMENT_FEET_PER_AP = 10;
const NEW_MOVEMENT_FEET_PER_AP = 5;

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function collectionContents(collection = null) {
    return toArray(collection?.contents ?? collection ?? []);
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function hasMigrationFlag(document = null) {
    return Boolean(document?.flags?.[SYSTEM_ID]?.visionAndScaleV20);
}

function doubledVisionRange(currentRange = null) {
    const range = finiteNumber(currentRange);
    if (range === null || range <= 0) return DEFAULT_TOKEN_VISION_RANGE;
    return Math.max(1, range * 2);
}

export function buildVisionRangeUpdate(document = null, { pathPrefix = "" } = {}) {
    if (hasMigrationFlag(document)) return null;
    const prefix = pathPrefix ? `${pathPrefix}.` : "";
    const currentRange = finiteNumber(pathPrefix
        ? document?.prototypeToken?.sight?.range
        : document?.sight?.range);
    const nextRange = doubledVisionRange(currentRange);

    return {
        [`${prefix}sight.enabled`]: true,
        [`${prefix}sight.range`]: nextRange,
        [MIGRATION_FLAG_PATH]: {
            fromRange: currentRange,
            toRange: nextRange
        }
    };
}

export function buildSceneScaleUpdate(scene = null) {
    const currentDistance = finiteNumber(scene?.grid?.distance);
    if (currentDistance !== OLD_GRID_DISTANCE) return null;
    return {
        "grid.distance": NEW_GRID_DISTANCE,
        "grid.units": "ft"
    };
}

async function updateActor(actor, report, source, { dryRun = false } = {}) {
    report.actorsScanned += 1;
    const update = buildVisionRangeUpdate(actor, { pathPrefix: "prototypeToken" });
    if (!update) return;
    report.actorsUpdated += 1;
    report.changedDocuments.push({ source, id: actor?.id, name: actor?.name, type: "actor" });
    if (!dryRun) await actor.update(update);
}

async function updateScene(scene, report, { dryRun = false } = {}) {
    report.scenesScanned += 1;
    const sceneUpdate = buildSceneScaleUpdate(scene);
    if (sceneUpdate) {
        report.scenesUpdated += 1;
        report.changedDocuments.push({ source: "world-scene", id: scene?.id, name: scene?.name, type: "scene" });
        if (!dryRun) await scene.update(sceneUpdate);
    }

    for (const token of collectionContents(scene?.tokens)) {
        report.tokensScanned += 1;
        const update = buildVisionRangeUpdate(token);
        if (!update) continue;
        report.tokensUpdated += 1;
        report.changedDocuments.push({ source: `scene:${scene?.name ?? scene?.id ?? "unknown"}`, id: token?.id, name: token?.name, type: "token" });
        if (dryRun) continue;
        if (typeof token?.update === "function") {
            await token.update(update);
        } else if (typeof scene?.updateEmbeddedDocuments === "function" && token?.id) {
            await scene.updateEmbeddedDocuments("Token", [{ _id: token.id, ...update }]);
        }
    }
}

async function updateActorPack(pack, report, { dryRun = false } = {}) {
    await withUnlockedCompendiumPack(pack, async () => {
        const documents = await pack.getDocuments();
        for (const actor of documents) {
            await updateActor(actor, report, pack.collection ?? "actor-pack", { dryRun });
        }
    }, { dryRun });
}

async function migrateMovementSetting(report, { dryRun = false } = {}) {
    const settings = game?.settings;
    if (typeof settings?.get !== "function" || typeof settings?.set !== "function") return;
    const current = finiteNumber(settings.get(SYSTEM_ID, "encounterMovementFeetPerAp"));
    if (current !== OLD_MOVEMENT_FEET_PER_AP) return;
    report.settingsUpdated += 1;
    if (!dryRun) await settings.set(SYSTEM_ID, "encounterMovementFeetPerAp", NEW_MOVEMENT_FEET_PER_AP);
}

export async function migrateTotcVisionAndScale({
    dryRun = false,
    notify = true,
    includeCompendiums = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (!game.user?.isGM) throw new Error("Only a GM can run the vision and scale migration.");

    const report = {
        dryRun: Boolean(dryRun),
        includeCompendiums: Boolean(includeCompendiums),
        actorsScanned: 0,
        actorsUpdated: 0,
        scenesScanned: 0,
        scenesUpdated: 0,
        tokensScanned: 0,
        tokensUpdated: 0,
        settingsUpdated: 0,
        changedDocuments: []
    };

    await migrateMovementSetting(report, { dryRun });

    for (const actor of collectionContents(game.actors)) {
        await updateActor(actor, report, "world-actor", { dryRun });
    }

    for (const scene of collectionContents(game.scenes)) {
        await updateScene(scene, report, { dryRun });
    }

    if (includeCompendiums) {
        const actorPacks = collectionContents(game.packs).filter((pack) => (
            pack?.documentName === "Actor" && pack?.metadata?.packageType === "system"
        ));
        for (const pack of actorPacks) {
            await updateActorPack(pack, report, { dryRun });
        }
    }

    if (notify) {
        ui.notifications?.info(
            `Turn of the Century vision and scale migration: ${report.actorsUpdated} actors, ${report.tokensUpdated} tokens, ${report.scenesUpdated} scenes updated.`
        );
    }

    return report;
}
