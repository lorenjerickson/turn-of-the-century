/**
 * build-packs.mjs
 *
 * Extracts TOTC_SAMPLE_ACTORS, TOTC_SAMPLE_ITEMS, and TOTC_SAMPLE_SCENES from sample-content.mjs
 * and writes them as individual JSON files into the appropriate packs/ directories.
 *
 * Run with: node scripts/build-packs.mjs
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TOTC_SAMPLE_ACTORS, TOTC_SAMPLE_ITEMS, TOTC_SAMPLE_SCENES } from "../module/sample-content.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_ROOT = join(__dirname, "..", "packs");

function stableId(type, name) {
    return createHash("sha1").update(`${type}:${name}`).digest("hex").slice(0, 16);
}

const ACTOR_PACK_FILTERS = {
    monsters:         (entry) => entry.type === "pawn" && entry.system?.classification?.category === "monster",
    heroes:           (entry) => entry.type === "hero",
    villains:         (entry) => entry.type === "villain",
    pawns:            (entry) => entry.type === "pawn" && entry.system?.classification?.category !== "monster",
    "starter-actors": () => true
};

const ITEM_PACK_FILTERS = {
    professions:      (entry) => entry.type === "profession",
    ethnicities:      (entry) => entry.type === "ethnicity",
    skills:           (entry) => entry.type === "skill",
    talents:          (entry) => entry.type === "talent",
    quirks:           (entry) => entry.type === "quirk",
    armor:            (entry) => entry.type === "armor",
    weapons:          (entry) => entry.type === "weapon",
    consumables:      (entry) => entry.type === "consumable",
    effects:          (entry) => entry.type === "effect",
    equipment:        (entry) => entry.type === "equipment" || entry.type === "item",
    "starter-items":  () => true
};

const SCENE_PACK_FILTERS = {
    "starter-scenes": () => true
};

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/['']/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function uniqueSlug(slug, seen) {
    if (!seen.has(slug)) { seen.add(slug); return slug; }
    let n = 2;
    while (seen.has(`${slug}-${n}`)) n++;
    const unique = `${slug}-${n}`;
    seen.add(unique);
    return unique;
}

function writePack(packName, documentType, entries) {
    const dir = join(PACKS_ROOT, packName);
    if (!existsSync(dir)) {
        console.warn(`  [skip] Pack directory not found: ${dir}`);
        return { written: 0, removed: 0 };
    }

    const seenSlugs = new Set();
    const writtenFiles = new Set();
    let written = 0;

    for (const entry of entries) {
        const doc = documentType === "Scene"
            ? { ...entry }
            : {
                _id: stableId(entry.type, entry.name),
                name: entry.name,
                type: entry.type,
                img: entry.img ?? (documentType === "Actor" ? "icons/svg/mystery-man.svg" : "icons/svg/item-bag.svg"),
                system: entry.system ?? {},
                ...(Array.isArray(entry.items) && entry.items.length ? { items: entry.items } : {}),
                ...(Array.isArray(entry.effects) && entry.effects.length ? { effects: entry.effects } : {}),
                flags: entry.flags ?? {}
            };

        const slug = uniqueSlug(slugify(entry.name), seenSlugs);
        const fileName = `${slug}.json`;
        writeFileSync(join(dir, fileName), JSON.stringify(doc, null, 2) + "\n", "utf8");
        writtenFiles.add(fileName);
        written++;
    }

    let removed = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        if (writtenFiles.has(file)) continue;
        try { rmSync(join(dir, file)); removed++; }
        catch { console.warn(`  [warn] Could not remove stale file: ${join(packName, file)}`); }
    }

    return { written, removed };
}

const totals = { written: 0, removed: 0, packs: 0 };

console.log("Building actor packs...");
for (const [packName, predicate] of Object.entries(ACTOR_PACK_FILTERS)) {
    const entries = TOTC_SAMPLE_ACTORS.filter(predicate);
    if (!entries.length) { console.log(`  ${packName}: (no entries)`); continue; }
    const { written, removed } = writePack(packName, "Actor", entries);
    console.log(`  ${packName}: ${written} written${removed ? `, ${removed} stale removed` : ""}`);
    totals.written += written;
    totals.removed += removed;
    totals.packs++;
}

console.log("Building item packs...");
for (const [packName, predicate] of Object.entries(ITEM_PACK_FILTERS)) {
    const entries = TOTC_SAMPLE_ITEMS.filter(predicate);
    if (!entries.length) { console.log(`  ${packName}: (no entries)`); continue; }
    const { written, removed } = writePack(packName, "Item", entries);
    console.log(`  ${packName}: ${written} written${removed ? `, ${removed} stale removed` : ""}`);
    totals.written += written;
    totals.removed += removed;
    totals.packs++;
}

console.log("Building scene packs...");
for (const [packName, predicate] of Object.entries(SCENE_PACK_FILTERS)) {
    const entries = TOTC_SAMPLE_SCENES.filter(predicate);
    if (!entries.length) { console.log(`  ${packName}: (no entries)`); continue; }
    const { written, removed } = writePack(packName, "Scene", entries);
    console.log(`  ${packName}: ${written} written${removed ? `, ${removed} stale removed` : ""}`);
    totals.written += written;
    totals.removed += removed;
    totals.packs++;
}

console.log(`\nDone -- ${totals.written} documents written across ${totals.packs} packs${totals.removed ? ` (${totals.removed} stale removed)` : ""}.`);
