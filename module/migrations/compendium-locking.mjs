export async function withUnlockedCompendiumPack(pack, operation, { dryRun = false } = {}) {
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