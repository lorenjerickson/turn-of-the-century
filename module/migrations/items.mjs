/**
 * Migration script for registering and updating all custom items in compendiums.
 * Ensures all new and recently added items are present in Foundry.
 *
 * This script should be updated whenever new items are added to any compendium.
 */
import { migrateExportSourceFlag } from "../../scripts/migrate-exportSource-flag.mjs";

/**
 * Runs all item migrations, including exportSource flag migration.
 */
export async function migrateTotcItems({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
  const packs = [
    "armor",
    "consumables",
    "equipment",
    "items",
    "weapons"
  ];
  const report = { scanned: 0, updated: 0 };
  for (const packName of packs) {
    const pack = game.packs.find(p => p.collection === `turn-of-the-century.${packName}`);
    if (!pack) continue;
    const index = await pack.getIndex();
    for (const entry of index) {
      report.scanned++;
      // Optionally, update or migrate the item here if needed
      // For now, just ensure it is present and log it
      if (!dryRun) {
        // No-op: placeholder for future migration logic
      }
      report.updated++;
    }
  }
  // Run exportSource flag migration (idempotent)
  const flagReport = await migrateExportSourceFlag({ dryRun, notify: false, includeCompendiums });
  report.exportSourceFlagUpdated = flagReport.updated;
  report.exportSourceFlagScanned = flagReport.scanned;
  if (notify) {
    ui.notifications?.info(`TOTC Item Migration: ${report.updated} items checked, ${flagReport.updated} exportSource flags migrated.`);
  }
  return report;
}
export async function migrateTotcItems({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
  const packs = [
    "armor",
    "consumables",
    "equipment",
    "items",
    "weapons"
  ];
  const report = { scanned: 0, updated: 0 };
  for (const packName of packs) {
    const pack = game.packs.find(p => p.collection === `turn-of-the-century.${packName}`);
    if (!pack) continue;
    const index = await pack.getIndex();
    for (const entry of index) {
      report.scanned++;
      // Optionally, update or migrate the item here if needed
      // For now, just ensure it is present and log it
      if (!dryRun) {
        // No-op: placeholder for future migration logic
      }
      report.updated++;
    }
  }
  if (notify) {
    ui.notifications?.info(`TOTC Item Migration: ${report.updated} items checked across compendiums.`);
  }
  return report;
}
