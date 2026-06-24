import { migrateTotcStarterCompendiums } from "./migrations/starter-compendiums.mjs";

/**
 * Check whether any system-owned compendium pack already has entries.
 *
 * Scoped to the system's own packs so that content from installed modules
 * does not mask a genuinely empty starter set.
 *
 * @param {object} [options]
 * @param {string} [options.systemId]
 * @param {object} [options.packs] - Foundry game.packs (injectable for tests).
 * @returns {Promise<boolean>}
 */
export async function hasAnyCompendiumData({
    systemId = "turn-of-the-century",
    packs = null
} = {}) {
    const packSource = packs ?? globalThis.game?.packs;
    if (!packSource) return false;

    const allPacks = Array.from(packSource?.values?.() ?? packSource ?? []);
    const systemPacks = allPacks.filter((p) => {
        const collection = String(p.collection ?? p.metadata?.id ?? "");
        const packageName = String(p.metadata?.packageName ?? p.metadata?.package ?? "");
        return collection.startsWith(`${systemId}.`) || packageName === systemId;
    });

    if (!systemPacks.length) return false;

    for (const pack of systemPacks) {
        try {
            const index = await pack.getIndex();
            const count = Array.isArray(index) ? index.length : (index?.size ?? 0);
            if (count > 0) return true;
        } catch {
            // Ignore individual pack errors — a corrupt pack should not block
            // the check for other packs.
        }
    }

    return false;
}

/**
 * Show a modal dialog offering the GM a single "Repair Compendiums" action.
 *
 * Falls back to an error notification on Foundry versions that do not expose
 * the v13+ `DialogV2` API.
 *
 * @param {Function} onRepair - Callback invoked when the GM confirms repair.
 * @param {object}  [deps]
 * @param {object}  [deps.foundry]      - `globalThis.foundry` (injectable).
 * @param {object}  [deps.ui]           - `globalThis.ui` (injectable).
 * @param {object}  [deps.game]         - `globalThis.game` (injectable).
 */
export function showCompendiumRepairDialog(onRepair, {
    foundry: foundryGlobal = null,
    ui: uiGlobal = null,
    game: gameGlobal = null
} = {}) {
    const resolvedGame = gameGlobal ?? globalThis.game;
    const resolvedUi = uiGlobal ?? globalThis.ui;
    const resolvedFoundry = foundryGlobal ?? globalThis.foundry;

    if (!resolvedGame?.user?.isGM) return;

    const safeRepair = typeof onRepair === "function" ? onRepair : () => {};
    const DialogV2 = resolvedFoundry?.applications?.api?.DialogV2;

    if (DialogV2) {
        new DialogV2({
            window: { title: "Compendium Data Missing" },
            content:
                `<p>No compendium data was found for this system. This can break core features.</p>` +
                `<p><strong>Repair will repopulate the starter compendiums. Existing world data will not be affected.</strong></p>`,
            buttons: [
                {
                    action: "repair",
                    label: "Repair Compendiums",
                    default: true,
                    callback: () => safeRepair()
                },
                {
                    action: "cancel",
                    label: "Cancel"
                }
            ]
        }).render(true);
    } else {
        resolvedUi?.notifications?.error(
            "Turn of the Century: compendium data is missing. Please reload and allow the repair prompt, or contact your system maintainer."
        );
    }
}

/**
 * Run the starter compendium bootstrap on a freshly installed world.
 *
 * Behaviour:
 * - Returns immediately if the game is not yet ready or the current user is not a GM.
 * - Skips population and returns `{ skipped: true }` if any system pack already has data.
 * - On a fresh install, calls `populate` (defaults to `migrateTotcStarterCompendiums`)
 *   and emits the `totcStarterCompendiumsReady` hook on success.
 * - On failure, surfaces a notification and returns the error without throwing.
 *
 * All Foundry singletons are injectable via `deps` so the function is fully
 * testable without a running Foundry instance.
 *
 * @param {object}   [options]
 * @param {string}   [options.systemId]  - System id used to scope the pack check.
 * @param {Function} [options.populate]  - Override for the population function.
 * @param {object}   [options.deps]      - Injected Foundry globals (game, ui, Hooks).
 *
 * @returns {Promise<{skipped: boolean, populated: boolean, error: Error|null}>}
 */
export async function runStarterCompendiumBootstrap({
    systemId = "turn-of-the-century",
    populate = null,
    deps = {}
} = {}) {
    const resolvedGame = deps.game ?? globalThis.game;
    const resolvedUi = deps.ui ?? globalThis.ui;
    const resolvedHooks = deps.Hooks ?? globalThis.Hooks;

    if (!resolvedGame?.ready) {
        return { skipped: true, populated: false, error: null };
    }
    if (!resolvedGame?.user?.isGM) {
        return { skipped: true, populated: false, error: null };
    }

    const alreadyPopulated = await hasAnyCompendiumData({
        systemId,
        packs: resolvedGame?.packs
    });
    if (alreadyPopulated) {
        return { skipped: true, populated: false, error: null };
    }

    const doPopulate = typeof populate === "function"
        ? populate
        : () => migrateTotcStarterCompendiums({ overwrite: false, notify: false });

    resolvedUi?.notifications?.info("Turn of the Century: Populating starter content…");

    try {
        await doPopulate();
        resolvedUi?.notifications?.info("Turn of the Century: Starter content ready.");
        resolvedHooks?.callAll?.("totcStarterCompendiumsReady");
        return { skipped: false, populated: true, error: null };
    } catch (error) {
        resolvedUi?.notifications?.error(
            "Turn of the Century: Starter content population failed — " + (error?.message ?? String(error))
        );
        console.error("[turn-of-the-century] Starter compendium population error", error);
        return { skipped: false, populated: false, error };
    }
}
