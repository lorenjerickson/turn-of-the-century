import { TOTC_SAMPLE_COMPENDIUMS } from "../sample-content.mjs";
import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const STARTER_ACTOR_PACK_NAMES = [
    TOTC_SAMPLE_COMPENDIUMS.monsters,
    TOTC_SAMPLE_COMPENDIUMS.heroes,
    TOTC_SAMPLE_COMPENDIUMS.villains,
    TOTC_SAMPLE_COMPENDIUMS.pawns,
    TOTC_SAMPLE_COMPENDIUMS.actors
];

const STYLE_BY_ROLE = {
    hero: ["adventurer", "adventurer-neutral", "open-peeps", "personas"],
    villain: ["lorelei", "lorelei-neutral", "notionists", "notionists-neutral"],
    pawn: ["micah", "big-ears-neutral", "adventurer-neutral", "shapes"],
    monster: ["bottts", "pixel-art", "thumbs", "identicon"]
};

const DEFAULT_STYLE_POOL = ["adventurer-neutral", "personas", "micah", "identicon"];
const BACKGROUND_COLORS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c4f2c4", "f4f4f5"];

function hashString(value = "") {
    const source = String(value ?? "");
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function pick(list = [], seedValue = "") {
    if (!Array.isArray(list) || !list.length) return null;
    return list[hashString(seedValue) % list.length];
}

function actorRole(actor = null) {
    const type = String(actor?.type ?? "").toLowerCase();
    const category = String(actor?.system?.classification?.category ?? "").toLowerCase();
    if (category === "monster") return "monster";
    if (type === "hero" || type === "villain" || type === "pawn") return type;
    return "pawn";
}

function actorSeed(actor = null) {
    const id = String(actor?.id ?? actor?._id ?? "").trim();
    const name = String(actor?.name ?? "unknown").trim();
    const type = String(actor?.type ?? "actor").trim();
    return `${name}:${type}:${id}`;
}

function buildDiceBearAvatarUrl(actor = null) {
    const role = actorRole(actor);
    const seed = actorSeed(actor);
    const stylePool = STYLE_BY_ROLE[role] ?? DEFAULT_STYLE_POOL;
    const style = pick(stylePool, `${seed}:style`) ?? "adventurer-neutral";
    const backgroundColor = pick(BACKGROUND_COLORS, `${seed}:background`) ?? "b6e3f4";
    const params = new URLSearchParams({
        seed,
        backgroundColor,
        radius: "20"
    });

    return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`;
}

function isDefaultActorImage(img = "") {
    const value = String(img ?? "").trim().toLowerCase();
    if (!value) return true;
    if (value.includes("icons/svg/mystery-man.svg")) return true;
    if (value.includes("icons/svg/cowled.svg")) return true;
    if (value.startsWith("https://api.dicebear.com/")) return true;
    return false;
}

function buildActorAvatarUpdate(actor = null, { overwrite = false } = {}) {
    const currentImg = String(actor?.img ?? "").trim();
    if (!overwrite && !isDefaultActorImage(currentImg)) return null;

    const avatarUrl = buildDiceBearAvatarUrl(actor);
    return {
        img: avatarUrl,
        "prototypeToken.texture.src": avatarUrl,
        "system.artwork.image": avatarUrl,
        "system.tokenArtwork.image": avatarUrl
    };
}

async function migratePackActors(pack, report, { dryRun = false, overwrite = false } = {}) {
    const packKey = String(pack?.collection ?? "unknown");
    report.byPack[packKey] = report.byPack[packKey] ?? { scanned: 0, updated: 0 };

    const documents = await pack.getDocuments();
    for (const actor of documents) {
        report.scanned += 1;
        report.byPack[packKey].scanned += 1;

        const updateData = buildActorAvatarUpdate(actor, { overwrite });
        if (!updateData) continue;

        if (!dryRun) await actor.update(updateData);
        report.updated += 1;
        report.byPack[packKey].updated += 1;
    }
}

export async function migrateTotcStarterActorAvatars({
    dryRun = false,
    notify = true,
    overwrite = false
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (!game.user?.isGM) throw new Error("Only a GM can run starter actor avatar migration.");

    const report = {
        dryRun: Boolean(dryRun),
        overwrite: Boolean(overwrite),
        scanned: 0,
        updated: 0,
        byPack: {}
    };

    const systemId = String(game.system?.id ?? "turn-of-the-century");
    const packIds = STARTER_ACTOR_PACK_NAMES.map((packName) => `${systemId}.${packName}`);

    for (const packId of packIds) {
        const pack = game.packs?.get?.(packId);
        if (!pack || pack.documentName !== "Actor") continue;

        await withUnlockedCompendiumPack(pack, async () => {
            await migratePackActors(pack, report, { dryRun, overwrite });
        }, { dryRun });
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(`Turn of the Century starter actor avatar ${label}: ${report.updated} updated out of ${report.scanned} scanned.`);
    }

    return report;
}

export {
    buildDiceBearAvatarUrl,
    buildActorAvatarUpdate
};