/**
 * Migration script to move deprecated flags.exportSource to _stats.exportSource for all items in world and compendiums.
 * Run this in the Foundry VTT console or as a macro.
 */
export async function migrateExportSourceFlag({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
  let updated = 0, scanned = 0;
  // Helper to migrate a single item
  async function migrateItem(item) {
    scanned++;
    const exportSource = item.flags?.exportSource;
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
      for (const entry of await pack.getDocuments()) {
        await migrateItem(entry);
      }
    }
  }

  if (notify) {
    ui.notifications?.info(`TOTC Migration: ${updated} items updated out of ${scanned} scanned.`);
  }
  return { updated, scanned };
}
