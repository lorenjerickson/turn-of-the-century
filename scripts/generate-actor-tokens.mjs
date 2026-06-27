/**
 * generate-actor-tokens.mjs
 *
 * Generates token portrait art for every actor in packs/starter-actors/ using
 * OpenAI's DALL-E 3 API, saves the images to assets/images/actors/tokens/,
 * and updates all four image fields in each actor's JSON file.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-actor-tokens.mjs
 *   OPENAI_API_KEY=sk-... node scripts/generate-actor-tokens.mjs --overwrite
 *   OPENAI_API_KEY=sk-... node scripts/generate-actor-tokens.mjs --dry-run
 *
 * After generation, run `node scripts/build-packs.mjs` to sync the image paths
 * into all other pack directories (heroes, villains, monsters, pawns).
 *
 * Foundry asset path: systems/turn-of-the-century/assets/images/actors/tokens/
 * File system path:   <repo>/assets/images/actors/tokens/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PACKS_DIR = join(ROOT, "packs", "starter-actors");
const TOKENS_DIR = join(ROOT, "assets", "images", "actors", "tokens");
const FOUNDRY_PATH_PREFIX = "systems/turn-of-the-century/assets/images/actors/tokens";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const OVERWRITE = args.has("--overwrite");

// DALL-E 3 rate limit is 5 images/min on tier 1. 15s between calls = 4/min.
const DELAY_MS = 15_000;

// ---------------------------------------------------------------------------
// OpenAI image generation
// ---------------------------------------------------------------------------

function getApiKey() {
    const key = process.env.OPENAI_API_KEY ?? "";
    if (!key) {
        console.error("ERROR: Set the OPENAI_API_KEY environment variable before running this script.");
        process.exit(1);
    }
    return key;
}

async function generateImageB64(prompt, apiKey) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            response_format: "b64_json"
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenAI ${response.status}: ${err?.error?.message ?? response.statusText}`);
    }

    const data = await response.json();
    return String(data.data?.[0]?.b64_json ?? "");
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function stripHtml(html = "") {
    return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const ART_STYLE_SUFFIX = [
    "Style: gothic-steampunk 1890s–1910s aesthetic.",
    "Favour brass, iron, leather, soot, gaslight, cabinet-card portrait quality, Victorian engravings.",
    "No modern sci-fi, no fantasy tropes, no neon or plastic.",
    "Square 1024×1024 canvas, subject centred, dark vignette border.",
    "Suitable for a miniature token on a tabletop battle-map. No text or UI overlays."
].join(" ");

function buildPrompt(actor) {
    const name = actor.name ?? "Unknown";
    const bio = stripHtml(actor.system?.biography ?? "");
    const classification = actor.system?.classification ?? {};
    const profession = classification.profession ?? "";
    const origin = classification.origin ?? "";
    const category = classification.category ?? "";
    const species = classification.species ?? "Human";
    const isCreature = category === "monster" || (species !== "Human" && species !== "");

    if (isCreature) {
        const speciesLabel = species && species !== "Human" ? `, ${species}` : "";
        const profLabel = profession ? `, role: ${profession}` : "";
        return [
            `Token art for a tabletop RPG creature in a gothic Victorian steampunk setting.`,
            `Creature: ${name}${speciesLabel}${profLabel}.`,
            bio ? `Description: ${bio}` : "",
            "Show the creature's full form or a menacing close-up.",
            "Dramatic gaslit shadows, Victorian scientific-illustration aesthetic meets gothic horror.",
            ART_STYLE_SUFFIX
        ].filter(Boolean).join(" ");
    }

    const locationLabel = origin ? ` from ${origin}` : "";
    const profLabel = profession ? `, ${profession}` : "";
    return [
        `Token portrait for a tabletop RPG character in a gothic Victorian steampunk setting.`,
        `Character: ${name}${profLabel}${locationLabel}.`,
        bio ? `Description: ${bio}` : "",
        "Shoulder-up bust portrait, period-appropriate clothing, gaslit illumination, rich detail.",
        ART_STYLE_SUFFIX
    ].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// JSON update
// ---------------------------------------------------------------------------

function foundryTokenPath(slug) {
    return `${FOUNDRY_PATH_PREFIX}/${slug}.png`;
}

function patchActorJson(actor, slug) {
    const src = foundryTokenPath(slug);
    const patched = { ...actor, img: src };

    patched.system = { ...actor.system };
    if (patched.system.artwork) {
        patched.system.artwork = { ...patched.system.artwork, image: src };
    }
    if (patched.system.tokenArtwork) {
        patched.system.tokenArtwork = { ...patched.system.tokenArtwork, image: src };
    }

    patched.prototypeToken = {
        ...(actor.prototypeToken ?? {}),
        texture: {
            ...(actor.prototypeToken?.texture ?? {}),
            src
        }
    };

    return patched;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    mkdirSync(TOKENS_DIR, { recursive: true });

    const apiKey = DRY_RUN ? "dry-run" : getApiKey();
    const files = readdirSync(PACKS_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort();

    console.log(`Found ${files.length} actors in packs/starter-actors/`);
    if (DRY_RUN) console.log("DRY RUN — no API calls or file writes will occur.");
    if (OVERWRITE) console.log("OVERWRITE mode — existing images will be regenerated.");
    console.log();

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const slug = filename.slice(0, -5); // strip .json
        const packPath = join(PACKS_DIR, filename);
        const imagePath = join(TOKENS_DIR, `${slug}.png`);
        const foundryRef = foundryTokenPath(slug);

        const actor = JSON.parse(readFileSync(packPath, "utf8"));

        if (!OVERWRITE && existsSync(imagePath)) {
            console.log(`[${i + 1}/${files.length}] SKIP  ${actor.name} (image exists)`);
            skipped++;
            continue;
        }

        const prompt = buildPrompt(actor);
        console.log(`[${i + 1}/${files.length}] GEN   ${actor.name}`);
        console.log(`       Prompt: ${prompt.slice(0, 110)}…`);

        if (DRY_RUN) {
            console.log(`       Would save: ${imagePath}`);
            console.log(`       Would set img: ${foundryRef}`);
            skipped++;
            continue;
        }

        try {
            const b64 = await generateImageB64(prompt, apiKey);
            if (!b64) throw new Error("Empty response from API");

            writeFileSync(imagePath, Buffer.from(b64, "base64"));
            console.log(`       Saved:   ${imagePath}`);

            const patched = patchActorJson(actor, slug);
            writeFileSync(packPath, JSON.stringify(patched, null, 2) + "\n", "utf8");
            console.log(`       Updated: packs/starter-actors/${filename}`);

            generated++;
        } catch (err) {
            console.error(`       FAILED: ${err.message}`);
            failed++;
        }

        if (i < files.length - 1) {
            process.stdout.write(`       Waiting ${DELAY_MS / 1000}s (rate limit)…\r`);
            await sleep(DELAY_MS);
            process.stdout.write(" ".repeat(60) + "\r");
        }
    }

    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Generated: ${generated}  Skipped: ${skipped}  Failed: ${failed}`);
    if (generated > 0) {
        console.log();
        console.log("Next: run `node scripts/build-packs.mjs` to sync paths into");
        console.log("      the heroes/, villains/, monsters/, and pawns/ pack dirs.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
