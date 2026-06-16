/**
 * Migration script to move deprecated flags.exportSource to _stats.exportSource for all items in world and compendiums.
 * Run this in the Foundry VTT console or as a macro.
 */
export function getLegacyExportSourceFromItemSource(item) {
  const source = item && typeof item.toObject === "function" ? item.toObject() : (item?._source ?? item);
  return source?.["flags.exportSource"] ?? source?.flags?.exportSource;
}

async function withUnlockedCompendiumPack(pack, operation, { dryRun = false } = {}) {
  if (!pack || typeof operation !== "function") {
    throw new Error("withUnlockedCompendiumPack requires a pack and an operation callback.");
  }

  const wasLocked = Boolean(pack.locked);
  if (wasLocked && !dryRun) await pack.configure({ locked: false });

  try {
    return await operation(pack);
  } finally {
    if (wasLocked && !dryRun) await pack.configure({ locked: true });
  }
}

export async function migrateExportSourceFlag({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
  let updated = 0, scanned = 0;
  // Helper to migrate a single item
  async function migrateItem(item) {
    scanned++;
    const exportSource = getLegacyExportSourceFromItemSource(item);
    if (exportSource !== undefined) {
      if (!dryRun) {
        const stats = foundry.utils.deepClone(item._stats ?? {});
        stats.exportSource = exportSource;
        await item.update({ _stats: stats, 'flags.-=exportSource': null });
      }
      updated++;
    }
  }

  // World items
  for (const item of game.items ?? []) {
    await migrateItem(item);
  }

  // Compendium items
  if (includeCompendiums) {
    for (const pack of game.packs.filter(p => p.documentName === "Item")) {
      await withUnlockedCompendiumPack(pack, async () => {
        for (const entry of await pack.getDocuments()) {
          await migrateItem(entry);
        }
      }, { dryRun });
    }
  }

  if (notify) {
    ui.notifications?.info(`TOTC Migration: ${updated} items updated out of ${scanned} scanned.`);
  }
  return { updated, scanned };
}
