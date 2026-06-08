/**
 * scripts/migrate-pack-items.mjs
 *
 * Populates system.traits and system.actions.variants for every weapon and
 * consumable pack JSON, replacing the old hand-authored action arrays with
 * properly composed ones (including data-driven requirements).
 *
 * Run from the project root:
 *   node scripts/migrate-pack-items.mjs
 *
 * The script is non-destructive in the sense that every file is rewritten to
 * a tidy, deterministic state.  Run it again and the output is identical.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    composeActionsFromTraits
} from "../module/encounters/item-traits.mjs";

// ---------------------------------------------------------------------------
// Weapon trait table — explicit mapping from pack filename stem to trait list.
//
// Rationale: at 16 weapons, an explicit table is more reliable and more
// readable than a heuristic, and clearly documents the design intent for
// each item.
// ---------------------------------------------------------------------------

/** @type {Record<string, { traits: string[], defaultActionId: string }>} */
const WEAPON_TRAIT_MAP = {
    // Firearms ---------------------------------------------------------------
    "service-revolver":    { traits: ["firearm", "projectileAmmo", "singleHanded"],  defaultActionId: "aimedShot" },
    "clockwork-derringer": { traits: ["firearm", "projectileAmmo", "singleHanded"],  defaultActionId: "aimedShot" },
    "ratcatcher-carbine":  { traits: ["firearm", "projectileAmmo", "twoHanded"],     defaultActionId: "aimedShot" },
    "streetline-shotgun":  { traits: ["firearm", "projectileAmmo", "twoHanded"],     defaultActionId: "aimedShot" },
    // Signal-flare pistol fires single-shot flartes; modelled as any single-
    // handed firearm — the "fire" damage type is set in the item JSON already.
    "signal-flare-pistol": { traits: ["firearm", "projectileAmmo", "singleHanded"],  defaultActionId: "aimedShot" },

    // Thrown/explosive -------------------------------------------------------
    // Signal Flare Bomb: fused, thrown, area-effect.
    "signal-flare-bomb":   { traits: ["fusedDetonator", "thrownWeapon", "explosive"], defaultActionId: "lightAndThrow" },

    // Thrown/versatile melee -------------------------------------------------
    // Ashwood Hunting Spear: one- or two-handed; also throwable.
    "ashwood-hunting-spear": { traits: ["meleeWeapon", "thrownWeapon", "versatileGrip"], defaultActionId: "meleeStrike" },

    // Dagger-class (melee + throwable) ---------------------------------------
    // Clockmaker's Stiletto: slim piercing blade, easily thrown.
    "clockmakers-stiletto": { traits: ["meleeWeapon", "thrownWeapon", "singleHanded"], defaultActionId: "meleeStrike" },

    // Pure melee, one-handed -------------------------------------------------
    "foundry-hammer":    { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    "rivet-hammer":      { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    "trench-truncheon":  { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    "factory-cleaver":   { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    "wire-garrote":      { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    // Dock Hook Pike: long two-handed polearm.
    "dock-hook-pike":    { traits: ["meleeWeapon", "twoHanded"],    defaultActionId: "meleeStrike" },
    // Galvanic Prod: electric tool repurposed as a weapon.
    "galvanic-prod":     { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" },
    // Surgeon's Lancet: a precision cutting instrument — not thrown in the
    // field, despite its size.
    "surgeons-lancet":   { traits: ["meleeWeapon", "singleHanded"], defaultActionId: "meleeStrike" }
};

// ---------------------------------------------------------------------------
// Consumable trait derivation
//
// Consumables don't carry a classification field.  We derive traits from two
// observable properties:
//   - slot == "belt" && use.actionCost == 2  →  beltConsumable (quick-draw)
//   - otherwise                               →  usableItem     (deliberate use)
// ---------------------------------------------------------------------------

/**
 * @param {object} system  item.system from a consumable pack JSON
 * @returns {{ traits: string[], defaultActionId: string }}
 */
function deriveConsumableTraits(system) {
    const isBeltQuickDraw =
        system.slot === "belt" && Number(system.use?.actionCost) === 2;

    return isBeltQuickDraw
        ? { traits: ["beltConsumable"], defaultActionId: "consumeBeltElixir" }
        : { traits: ["usableItem"],     defaultActionId: "useItem" };
}

// ---------------------------------------------------------------------------
// Pack file processing
// ---------------------------------------------------------------------------

/**
 * Reads a pack JSON, applies trait + action data, and writes it back.
 *
 * @param {string} filePath   Absolute path to the pack JSON file
 * @param {"weapon"|"consumable"} itemType
 */
async function migratePackItem(filePath, itemType) {
    const raw = await readFile(filePath, "utf8");
    const doc = JSON.parse(raw);

    const stem = basename(filePath, ".json");

    let traits, defaultActionId;

    if (itemType === "weapon") {
        const mapping = WEAPON_TRAIT_MAP[stem];
        if (!mapping) {
            console.warn(`  [SKIP] No trait mapping for weapon: ${stem}`);
            return;
        }
        ({ traits, defaultActionId } = mapping);
    } else {
        ({ traits, defaultActionId } = deriveConsumableTraits(doc.system));
    }

    const variants = composeActionsFromTraits(traits);

    // Guard: composeActionsFromTraits should never return empty for a known
    // trait list, but be explicit rather than silently corrupt the document.
    if (variants.length === 0) {
        console.warn(`  [SKIP] composeActionsFromTraits returned no variants for: ${stem} (traits: ${traits.join(", ")})`);
        return;
    }

    doc.system.traits = traits;
    doc.system.actions = {
        defaultActionId,
        variants
    };

    await writeFile(filePath, JSON.stringify(doc, null, 2) + "\n", "utf8");
    console.log(`  [OK]   ${stem}  →  traits: [${traits.join(", ")}]  actions: [${variants.map((v) => v.id).join(", ")}]`);
}

/**
 * Migrates all JSON files in a directory.
 *
 * @param {string} dir
 * @param {"weapon"|"consumable"} itemType
 */
async function migrateDirectory(dir, itemType) {
    const files = (await readdir(dir))
        .filter((f) => f.endsWith(".json"))
        .sort();

    console.log(`\n${itemType.toUpperCase()}S  (${dir})`);
    for (const file of files) {
        await migratePackItem(join(dir, file), itemType);
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

await migrateDirectory(join(projectRoot, "packs/weapons"),     "weapon");
await migrateDirectory(join(projectRoot, "packs/consumables"), "consumable");

console.log("\nDone.\n");
