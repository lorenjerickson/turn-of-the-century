import { TOTC_SAMPLE_COMPENDIUMS } from "../compendiums/manifest.mjs";
import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const STARTER_ACTOR_PACK_NAMES = [
    TOTC_SAMPLE_COMPENDIUMS.monsters,
    TOTC_SAMPLE_COMPENDIUMS.heroes,
    TOTC_SAMPLE_COMPENDIUMS.villains,
    TOTC_SAMPLE_COMPENDIUMS.pawns,
    TOTC_SAMPLE_COMPENDIUMS.actors
];

const TOKEN_ART_PATH_PREFIX = "systems/turn-of-the-century/assets/images/actors/tokens";

export function slugifyActorName(name) {
    return String(name ?? "")
        .toLowerCase()
        .replace(/['']/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function generatedTokenPath(actorName) {
    const slug = slugifyActorName(actorName);
    return slug ? `${TOKEN_ART_PATH_PREFIX}/${slug}.png` : null;
}

export function isEligibleForTokenArtUpdate(currentImg) {
    const value = String(currentImg ?? "").trim().toLowerCase();
    if (!value) return true;
    if (value.includes("icons/svg/mystery-man.svg")) return true;
    if (value.includes("icons/svg/cowled.svg")) return true;
    if (value.startsWith("https://api.dicebear.com/")) return true;
    // Overwrite any existing generated token path — image may have been regenerated.
    if (value.includes("assets/images/actors/tokens/")) return true;
    return false;
}

async function tokenImageExists(path) {
    try {
        const response = await fetch(path, { method: "HEAD" });
        return response.ok;
    } catch {
        return false;
    }
}

async function buildTokenArtUpdate(actor) {
    const currentImg = String(actor?.img ?? "").trim();
    const targetPath = generatedTokenPath(actor?.name);
    if (!targetPath) return null;

    // Already pointing at the correct generated image — nothing to do.
    if (currentImg.toLowerCase() === targetPath.toLowerCase()) return null;

    // Don't overwrite genuine custom art.
    if (!isEligibleForTokenArtUpdate(currentImg)) return null;

    // Only apply if the generated image actually exists on the server.
    if (!await tokenImageExists(targetPath)) return null;

    return {
        img: targetPath,
        "prototypeToken.texture.src": targetPath,
        "system.artwork.image": targetPath,
        "system.tokenArtwork.image": targetPath
    };
}

async function migratePackActors(pack, report, { dryRun = false } = {}) {
    const packKey = String(pack?.collection ?? "unknown");
    report.byPack[packKey] = report.byPack[packKey] ?? { scanned: 0, updated: 0, skipped: 0 };

    const documents = await pack.getDocuments();
    for (const actor of documents) {
        report.scanned += 1;
        report.byPack[packKey].scanned += 1;

        const updateData = await buildTokenArtUpdate(actor);
        if (!updateData) {
            report.skipped += 1;
            report.byPack[packKey].skipped += 1;
            continue;
        }

        if (!dryRun) await actor.update(updateData);
        report.updated += 1;
        report.byPack[packKey].updated += 1;
    }
}

export async function migrateTotcStarterActorTokenArt({
    dryRun = false,
    notify = true
} = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");
    if (!game.user?.isGM) throw new Error("Only a GM can run the starter actor token art migration.");

    const report = {
        dryRun: Boolean(dryRun),
        scanned: 0,
        updated: 0,
        skipped: 0,
        byPack: {}
    };

    const systemId = String(game.system?.id ?? "turn-of-the-century");
    const packIds = STARTER_ACTOR_PACK_NAMES.map((packName) => `${systemId}.${packName}`);

    for (const packId of packIds) {
        const pack = game.packs?.get?.(packId);
        if (!pack || pack.documentName !== "Actor") continue;

        await withUnlockedCompendiumPack(pack, async () => {
            await migratePackActors(pack, report, { dryRun });
        }, { dryRun });
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(
            `Turn of the Century starter actor token art ${label}: ${report.updated} updated, ${report.skipped} skipped out of ${report.scanned} scanned.`
        );
    }

    return report;
}
