import {
    ArmorDataModel,
    ConsumableDataModel,
    EffectDataModel,
    EthnicityDataModel,
    HeroDataModel,
    ItemDataModel,
    PawnDataModel,
    ProfessionDataModel,
    QuirkDataModel,
    VillainDataModel,
    WeaponDataModel
} from "./module/data-models.mjs";
import {
    TOTC_SAMPLE_ACTORS,
    TOTC_SAMPLE_COMPENDIUMS,
    TOTC_SAMPLE_ITEMS,
    TOTC_SAMPLE_LIBRARY_STATS,
    createTotcSampleContent,
    publishTotcSampleCompendiums
} from "./module/sample-content.mjs";
import {
    getActionPointBudget,
    getBaseActionCatalog,
    getMovementFeetPerAp,
    getPlanningLimitSeconds,
    getPlanningWarningSeconds
} from "./module/encounters/action-catalog.mjs";
import {
    TOTC_WORLD_SCHEMA_VERSION,
    migrateTotcActorProfiles,
    migrateTotcActorProfessions,
    migrateTotcActorEconomy,
    migrateTotcEncounterActions,
    migrateTotcModifiers,
    migrateTotcEquipmentSlots,
    runTotcMigrations
} from "./module/migrations.mjs";
import {
    TurnOfTheCenturyActor,
    TurnOfTheCenturyCombat,
    TurnOfTheCenturyItem,
    TOTC_ENCOUNTER_EVENTS,
    getEncounterHookName
} from "./module/documents.mjs";
import {
    TurnOfTheCenturyHeroSheet,
    TurnOfTheCenturyPawnSheet,
    TurnOfTheCenturyVillainSheet
} from "./module/sheets/actor-sheet.mjs";
import { TurnOfTheCenturyCombatTracker } from "./module/sheets/combat-tracker.mjs";
import { TurnOfTheCenturyItemSheet } from "./module/sheets/item-sheet.mjs";
import {
    WorkspaceV2Coordinator,
    registerWorkspaceV2PolicySettings
} from "./module/ui/workspace-v2/index.mjs";
import {
    TOTC_THEME_SETTING,
    applyTotcTheme,
    registerTotcThemeSetting
} from "./module/ui/theme-manager.mjs";
import {
    ADVERSARY_PROFILES,
    FACTION_METADATA,
    TERRAIN_FEATURES,
    ESCALATION_TRIGGERS,
    LOOT_TABLES,
    NARRATIVE_HOOKS,
    instantiateEncounterSeed,
    getEscalationTrigger,
    getTerrainFeature,
    getNarrativeHooks,
    getFactionMetadata,
    rollLoot,
    buildEncounterContext,
    applyFactionTerrainAdaptations,
    getFactionTerrainAdaptations
} from "./module/encounters/enhanced-seeds.mjs";
import {
    createCombatEncounterWithNpcs,
    createNpcsFromEncounterSeed,
    getNpcDetails,
    getActiveTemporaryNpcs,
    cleanupTemporaryNpcs,
    NpcInstantiationConsoleAPI
} from "./module/encounters/npc-instantiation.mjs";
import {
    rollRegionAwareCampEvent,
    getDetailedCampEventReport,
    getRegionCampEvents,
    REGIONS,
    CAMP_SEASONS
} from "./module/camps/region-aware-events.mjs";
import {
    getDocumentApplications,
    renderFoundryApplication,
    requireActorSheetV2,
    requireActorsCollection,
    requireCombatDocumentClass,
    requireItemSheetV2,
    requireItemsCollection
} from "./module/foundry-v14-runtime.mjs";

const STARTER_CONTENT_SEEDED_SETTING = "starterContentSeeded";
const WORLD_SCHEMA_VERSION_SETTING = "worldSchemaVersion";
const ENCOUNTER_AP_BUDGET_SETTING = "encounterActionPointBudget";
const ENCOUNTER_MOVE_FEET_PER_AP_SETTING = "encounterMovementFeetPerAp";
const ENCOUNTER_PLANNING_LIMIT_SECONDS_SETTING = "encounterPlanningLimitSeconds";
const ENCOUNTER_PLANNING_WARNING_SECONDS_SETTING = "encounterPlanningWarningSeconds";
const ENCOUNTER_REPLAY_STYLE_SETTING = "encounterReplayNarrationStyle";
const AUTO_CREATE_ENCOUNTER_NPCS_SETTING = "autoCreateEncounterNpcs";
const ENCOUNTER_EVENT_HOOK_NAMES = [
    "totcEncounterStateInitialized",
    "totcEncounterPhaseChanged",
    "totcEncounterPlanningStarted",
    "totcEncounterPlanningEnded",
    "totcEncounterRoundStarted",
    "totcEncounterRoundResolved",
    "totcEncounterCombatantReadyChanged",
    "totcEncounterPlanUpdated"
];
const ActorsCollection = requireActorsCollection();
const ItemsCollection = requireItemsCollection();
const BaseActorSheetClass = requireActorSheetV2();
const BaseItemSheetClass = requireItemSheetV2();
const CombatDocumentClass = requireCombatDocumentClass();
let encounterPlanningWatchHandle = null;
const initiativePromptKeys = new Set();
let workspaceV2Coordinator = null;

function logEncounterLifecycle(eventName, payload = {}) {
    const combat = payload.combat ?? payload.combatant?.combat ?? game.combat ?? null;
    const combatId = combat?.id ?? "none";
    const phase = combat?.phase ?? combat?.encounterState?.phase ?? "none";
    const planningStartedAt = Number(combat?.encounterState?.planningStartedAt ?? 0);
    const combatantCount = combat?.combatants?.size ?? combat?.combatants?.contents?.length ?? 0;

    console.debug("[turn-of-the-century] encounter lifecycle", {
        event: eventName,
        combatId,
        phase,
        planningStartedAt,
        combatantCount,
        ...payload
    });
}

function maybePromptInitiativeRolls(combat) {
    if (!combat?.hasInitiativeGateActive) return;

    const planningStartedAt = Number(combat.encounterState?.planningStartedAt ?? 0);
    if (!planningStartedAt) return;

    const rollableCombatants = (combat.getMissingInitiativeCombatants?.() ?? [])
        .filter((combatant) => combat.canCurrentUserRollInitiative?.(combatant.id));
    if (!rollableCombatants.length) return;

    const promptKey = `${game.user?.id}:${combat.id}:${planningStartedAt}`;
    if (initiativePromptKeys.has(promptKey)) return;
    initiativePromptKeys.add(promptKey);

    const names = rollableCombatants.map((combatant) => combatant.name).join(", ");
    ui.notifications?.info(game.i18n.format("TOTC.Encounter.InitiativePrompt", { names }));
}

function rerenderEncounterActorSheets(combat) {
    if (!combat) return;

    const apps = new Set();
    for (const combatant of combat.combatants?.contents ?? []) {
        for (const app of getDocumentApplications(combatant.actor)) apps.add(app);
        for (const app of getDocumentApplications(combatant.token?.actor)) apps.add(app);
        for (const app of getDocumentApplications(combatant.token?.document?.actor)) apps.add(app);
    }

    for (const app of apps) {
        if (!app?.rendered) continue;
        renderFoundryApplication(app, { force: false });
    }
}

function rerenderEncounterTracker(combat) {
    const tracker = ui.combat;
    if (!tracker?.rendered || typeof tracker.render !== "function") return;

    const viewedCombat = tracker.viewed ?? game.combat;
    if (!viewedCombat || viewedCombat.id !== combat?.id) return;

    renderFoundryApplication(tracker, { force: false });
}

function handleEncounterEventHook(hookName, payload = {}) {
    const combat = payload.combat ?? game.combat ?? null;
    const summary = {
        combat,
        phase: payload.phase,
        previousPhase: payload.previousPhase,
        round: payload.round,
        combatantId: payload.combatantId,
        ready: payload.ready,
        timelineCount: Array.isArray(payload.timeline) ? payload.timeline.length : undefined
    };

    logEncounterLifecycle(hookName, summary);
    maybePromptInitiativeRolls(combat);
    rerenderEncounterActorSheets(combat);
    rerenderEncounterTracker(combat);
}

/**
 * @typedef {object} EncounterEventSubscription
 * @property {string}   eventName        - The TOTC_ENCOUNTER_EVENTS value that was subscribed to.
 * @property {string}   hookName         - The Foundry hook name used internally.
 * @property {Function} listener         - The original listener passed to onEvent.
 * @property {Function} wrappedListener  - The internally wrapped listener registered with Hooks.
 * @property {Function} unsubscribe      - Call to remove this listener from the Foundry hook.
 */

function ensureEncounterEventName(eventName) {
    const key = String(eventName ?? "").trim();
    if (!key) throw new Error("Encounter event name is required.");
    if (!Object.values(TOTC_ENCOUNTER_EVENTS).includes(key)) {
        throw new Error(`Unsupported encounter event: ${eventName}`);
    }
    return key;
}

/**
 * Register a listener on a Foundry hook that fires for the given encounter
 * lifecycle event. Returns an {@link EncounterEventSubscription} that can be
 * passed to `removeEncounterEventSubscription` or have its `unsubscribe()`
 * method called to clean up.
 *
 * @param {string}   eventName - A value from {@link TOTC_ENCOUNTER_EVENTS}.
 * @param {Function} listener  - Callback invoked with the encounter event payload.
 * @returns {EncounterEventSubscription}
 */
function createEncounterEventSubscription(eventName, listener) {
    const resolvedEventName = ensureEncounterEventName(eventName);
    if (typeof listener !== "function") {
        throw new Error("Encounter event listener must be a function.");
    }

    const hookName = getEncounterHookName(resolvedEventName);
    if (!hookName) {
        throw new Error(`No Foundry hook mapping exists for encounter event: ${resolvedEventName}`);
    }

    const wrappedListener = (payload) => {
        listener(payload);
    };

    Hooks.on(hookName, wrappedListener);
    return {
        eventName: resolvedEventName,
        hookName,
        listener,
        wrappedListener,
        unsubscribe: () => {
            Hooks.off(hookName, wrappedListener);
        }
    };
}

/**
 * Remove a listener created by {@link createEncounterEventSubscription}.
 *
 * @param {EncounterEventSubscription} subscription
 * @returns {boolean} `true` if the listener was found and removed.
 */
function removeEncounterEventSubscription(subscription) {
    if (!subscription?.hookName || typeof subscription?.wrappedListener !== "function") return false;
    Hooks.off(subscription.hookName, subscription.wrappedListener);
    return true;
}

async function ensureTotcLocalizationLoaded() {
    const probeKey = "TOTC.Sheet.Profile";
    if (!game?.i18n || game.i18n.localize(probeKey) !== probeKey) return;

    const systemId = game.system?.id ?? "turn-of-the-century";
    const activeLang = String(game.i18n.lang ?? "en").trim() || "en";
    const systemPath = String(game.system?.path ?? "").replace(/\/+$/, "");
    const configuredLanguages = Array.isArray(game.system?.languages) ? game.system.languages : [];

    const resolveConfiguredPath = (lang) => {
        const configuredPath = configuredLanguages.find((entry) => entry?.lang === lang)?.path;
        if (!configuredPath) return null;

        if (configuredPath.startsWith("/")) return configuredPath;
        if (configuredPath.startsWith("systems/")) return configuredPath;
        if (systemPath) return `${systemPath}/${configuredPath.replace(/^\.?\//, "")}`;
        return configuredPath;
    };

    const candidatePaths = Array.from(new Set([
        resolveConfiguredPath(activeLang),
        resolveConfiguredPath("en"),
        `systems/${systemId}/lang/${activeLang}.json`,
        `systems/${systemId}/lang/en.json`
    ].filter(Boolean)));

    if (!game.i18n.translations || typeof game.i18n.translations !== "object") {
        game.i18n.translations = {};
    }

    for (const path of candidatePaths) {
        try {
            const response = await fetch(path, { cache: "no-store" });
            if (!response.ok) continue;

            const translations = await response.json();
            if (!translations || typeof translations !== "object") continue;

            const mergeOptions = {
                insertKeys: true,
                insertValues: true,
                overwrite: true,
                inplace: true,
                recursive: true
            };

            game.i18n.translations = foundry.utils.mergeObject(game.i18n.translations, translations, mergeOptions);

            if (game.i18n.localize(probeKey) !== probeKey) {
                console.warn(`[turn-of-the-century] Recovered missing i18n translations from ${path}.`);
                if (ui.combat?.rendered && typeof ui.combat.render === "function") {
                    renderFoundryApplication(ui.combat, { force: false });
                }
                return;
            }
        } catch (error) {
            console.warn(`[turn-of-the-century] Failed to load i18n file at ${path}.`, error);
        }
    }

    console.error("[turn-of-the-century] Could not recover missing i18n translations. Check system language files and manifest paths.");
}

function getIndexCount(pack) {
    return pack.index?.size ?? pack.index?.length ?? 0;
}

async function getStarterCompendiumDocumentCount() {
    const systemId = game.system?.id;
    const packNames = Object.values(TOTC_SAMPLE_COMPENDIUMS);
    let total = 0;

    for (const packName of packNames) {
        const pack = game.packs.get(`${systemId}.${packName}`);
        if (!pack) continue;

        await pack.getIndex();
        total += getIndexCount(pack);
    }

    return total;
}

async function maybeRunAutomatedMigrations() {
    if (!game?.ready || !game.user?.isGM) return;

    const currentVersion = game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING);
    if ((Number(currentVersion) || 0) >= TOTC_WORLD_SCHEMA_VERSION) return;

    try {
        const result = await runTotcMigrations({
            currentVersion,
            migrateActorProfiles: migrateTotcActorProfiles,
            migrateActorProfessions: migrateTotcActorProfessions,
            migrateActorEconomy: migrateTotcActorEconomy,
            migrateEquipmentSlots: migrateTotcEquipmentSlots,
            migrateEncounterActions: migrateTotcEncounterActions,
            migrateModifiers: migrateTotcModifiers,
            notify: true
        });

        await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);

        return result;
    } catch (error) {
        console.error("[turn-of-the-century] Failed to run automated migrations.", error);
        ui.notifications?.error(
            "Turn of the Century failed to run world migrations. Run `await game.turnOfTheCentury.migrations.run()` as a GM after checking console errors."
        );
        return null;
    }
}

async function maybeSeedStarterCompendiums() {
    if (!game?.ready || !game.user?.isGM) return;

    const isSeeded = game.settings.get("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING);
    if (isSeeded) {
        const starterDocumentCount = await getStarterCompendiumDocumentCount();
        if (starterDocumentCount > 0) return;

        console.warn("[turn-of-the-century] Starter compendium seeded flag is true but packs are empty. Re-seeding starter compendiums.");
    }

    try {
        await publishTotcSampleCompendiums({ overwrite: true });
        await game.settings.set("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, true);
        ui.notifications?.info("Turn of the Century starter compendiums were populated for this world.");
    } catch (error) {
        console.error("[turn-of-the-century] Failed to auto-populate starter compendiums.", error);
        ui.notifications?.warn(
            "Turn of the Century starter compendiums could not be auto-populated. Run `await game.turnOfTheCentury.sampleContent.publishToCompendiums()` in the console as a GM."
        );
    }
}

Hooks.once("init", () => {
    CONFIG.Actor.dataModels ??= {};
    CONFIG.Item.dataModels ??= {};
    CONFIG.Actor.documentClass = TurnOfTheCenturyActor;
    CONFIG.Combat.documentClass = TurnOfTheCenturyCombat;
    CONFIG.ui.combat = TurnOfTheCenturyCombatTracker;
    CONFIG.Item.documentClass = TurnOfTheCenturyItem;

    CONFIG.Actor.compendiumIndexFields = Array.from(
        new Set([
            ...(CONFIG.Actor.compendiumIndexFields ?? []),
            "system.classification.category",
            "system.classification.profession",
            "system.classification.origin",
            "system.profile.role",
            "system.profile.faction",
            "system.profile.summary",
            "system.economy.isMerchant",
            "system.economy.wallet.gbp",
            "system.progression.level",
            "system.hero.archetype",
            "system.villain.scheme",
            "system.pawn.role",
            "system.pawn.threat"
        ])
    );

    Object.assign(CONFIG.Actor.dataModels, {
        hero: HeroDataModel,
        villain: VillainDataModel,
        pawn: PawnDataModel
    });

    Object.assign(CONFIG.Item.dataModels, {
        armor: ArmorDataModel,
        consumable: ConsumableDataModel,
        effect: EffectDataModel,
        equipment: ItemDataModel,
        ethnicity: EthnicityDataModel,
        item: ItemDataModel,
        profession: ProfessionDataModel,
        quirk: QuirkDataModel,
        skill: ItemDataModel,
        talent: ItemDataModel,
        weapon: WeaponDataModel
    });

    ItemsCollection.unregisterSheet("core", BaseItemSheetClass);
    ItemsCollection.registerSheet("turn-of-the-century", TurnOfTheCenturyItemSheet, {
        makeDefault: true,
        label: "Turn of the Century Item Sheet"
    });

    ActorsCollection.unregisterSheet("core", BaseActorSheetClass);
    ActorsCollection.registerSheet("turn-of-the-century", TurnOfTheCenturyHeroSheet, {
        types: ["hero"],
        makeDefault: true,
        label: "Turn of the Century Hero Sheet"
    });
    ActorsCollection.registerSheet("turn-of-the-century", TurnOfTheCenturyVillainSheet, {
        types: ["villain"],
        makeDefault: true,
        label: "Turn of the Century Villain Sheet"
    });
    ActorsCollection.registerSheet("turn-of-the-century", TurnOfTheCenturyPawnSheet, {
        types: ["pawn"],
        makeDefault: true,
        label: "Turn of the Century Pawn Sheet"
    });

    game.settings.register("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, {
        name: "Starter content seeded",
        hint: "Internal setting to avoid re-importing starter compendium content repeatedly.",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, {
        name: "World schema version",
        hint: "Internal setting for one-time world data migrations.",
        scope: "world",
        config: false,
        type: Number,
        default: 0
    });

    game.settings.register("turn-of-the-century", ENCOUNTER_AP_BUDGET_SETTING, {
        name: "Encounter AP budget",
        hint: "Action points available per combatant each round during AP encounters.",
        scope: "world",
        config: false,
        type: Number,
        default: 6
    });

    game.settings.register("turn-of-the-century", ENCOUNTER_MOVE_FEET_PER_AP_SETTING, {
        name: "Encounter movement feet per AP",
        hint: "Distance in feet represented by one action point for movement actions.",
        scope: "world",
        config: false,
        type: Number,
        default: 10
    });

    game.settings.register("turn-of-the-century", ENCOUNTER_PLANNING_WARNING_SECONDS_SETTING, {
        name: "Encounter planning warning seconds",
        hint: "Soft warning threshold for round planning in AP encounters.",
        scope: "world",
        config: false,
        type: Number,
        default: 45
    });

    game.settings.register("turn-of-the-century", ENCOUNTER_PLANNING_LIMIT_SECONDS_SETTING, {
        name: "Encounter planning limit seconds",
        hint: "Hard planning time limit before unresolved AP are forfeited for the round.",
        scope: "world",
        config: false,
        type: Number,
        default: 60
    });

    game.settings.register("turn-of-the-century", ENCOUNTER_REPLAY_STYLE_SETTING, {
        name: "Encounter replay narration style",
        hint: "Controls formatting style for GM-only AP replay narration output.",
        scope: "world",
        config: false,
        type: String,
        choices: {
            concise: "Concise",
            detailed: "Detailed"
        },
        default: "detailed"
    });

    game.settings.register("turn-of-the-century", AUTO_CREATE_ENCOUNTER_NPCS_SETTING, {
        name: "Auto-create encounter NPCs",
        hint: "Automatically instantiate NPC actors from encounter seeds during travel combat initiation.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    registerTotcThemeSetting("turn-of-the-century");

    registerWorkspaceV2PolicySettings("turn-of-the-century", {
        onEnabledChange: async (enabled) => {
            if (!workspaceV2Coordinator) return;
            if (enabled) {
                await workspaceV2Coordinator.start();
            } else {
                await workspaceV2Coordinator.stop();
            }
        },
        onDebugChange: async (enabled) => {
            if (!workspaceV2Coordinator) return;
            workspaceV2Coordinator.applyDebugGovernance(enabled);
        }
    });
});

Hooks.once("ready", async () => {
    await ensureTotcLocalizationLoaded();
    applyTotcTheme(game.settings.get("turn-of-the-century", TOTC_THEME_SETTING));

    game.turnOfTheCentury ??= {};
    game.turnOfTheCentury.sampleContent = {
        actors: TOTC_SAMPLE_ACTORS,
        items: TOTC_SAMPLE_ITEMS,
        stats: TOTC_SAMPLE_LIBRARY_STATS,
        compendiums: TOTC_SAMPLE_COMPENDIUMS,
        create: createTotcSampleContent,
        publishToCompendiums: publishTotcSampleCompendiums
    };
    game.turnOfTheCentury.migrations = {
        migrateActorProfiles: migrateTotcActorProfiles,
        migrateActorProfessions: migrateTotcActorProfessions,
        migrateActorEconomy: migrateTotcActorEconomy,
        migrateEquipmentSlots: migrateTotcEquipmentSlots,
        migrateEncounterActions: migrateTotcEncounterActions,
        migrateModifiers: migrateTotcModifiers,
        run: async () => {
            const result = await runTotcMigrations({
                currentVersion: game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING),
                migrateActorProfiles: migrateTotcActorProfiles,
                migrateActorProfessions: migrateTotcActorProfessions,
                migrateActorEconomy: migrateTotcActorEconomy,
                migrateEquipmentSlots: migrateTotcEquipmentSlots,
                migrateEncounterActions: migrateTotcEncounterActions,
                migrateModifiers: migrateTotcModifiers,
                notify: true
            });
            await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);
            return result;
        }
    };

    // Run migrations and starter seeding in sequence before booting Workspace V2
    // so compendium-backed panels read stable data on first world load after updates.
    await maybeRunAutomatedMigrations();
    await maybeSeedStarterCompendiums();

    workspaceV2Coordinator = new WorkspaceV2Coordinator({
        systemId: "turn-of-the-century"
    });
    await workspaceV2Coordinator.initialize();

    game.turnOfTheCentury.uiV2 = {
        getStatus: () => workspaceV2Coordinator?.getStatus?.() ?? {
            enabledSetting: false,
            debugGovernance: false,
            running: false,
            supported: false
        },
        enable: async () => {
            await workspaceV2Coordinator?.setEnabled?.(true);
        },
        disable: async () => {
            await workspaceV2Coordinator?.setEnabled?.(false);
        },
        start: async () => {
            await workspaceV2Coordinator?.start?.();
        },
        stop: async () => {
            await workspaceV2Coordinator?.stop?.();
        },
        setDebugGovernance: async (enabled) => {
            await workspaceV2Coordinator?.setDebugGovernance?.(Boolean(enabled));
        },
        auditRegions: () => workspaceV2Coordinator?.auditRegions?.() ?? {
            active: false,
            hiddenCount: 0,
            rows: []
        },
        getUserLayout: () => workspaceV2Coordinator?.stateStore?.getUserLayout?.() ?? null,
        setUserLayout: async (layout) => workspaceV2Coordinator?.stateStore?.setUserLayout?.(layout),
        clearUserLayout: async () => workspaceV2Coordinator?.stateStore?.clearUserLayout?.()
    };

    game.turnOfTheCentury.encounters = {
        /**
         * Read-only map of all encounter event name constants.
         * Use these as the `eventName` argument for `onEvent`.
         * @type {Readonly<Record<string,string>>}
         */
        events: Object.freeze(foundry.utils.deepClone(TOTC_ENCOUNTER_EVENTS)),

        /**
         * Resolve the Foundry hook name that is called when a given encounter
         * event fires. Useful if you prefer `Hooks.on` directly over `onEvent`.
         *
         * @param {string} eventName - A value from `encounters.events`.
         * @returns {string} The matching Foundry hook name.
         * @throws If `eventName` is not a recognized encounter event.
         */
        getEventHookName: (eventName) => {
            const resolvedEventName = ensureEncounterEventName(eventName);
            return getEncounterHookName(resolvedEventName);
        },

        /**
         * Subscribe to an encounter lifecycle event. Returns an
         * {@link EncounterEventSubscription} object with an `unsubscribe()`
         * method and the original event/hook metadata.
         *
         * @param {object}   options
         * @param {string}   options.eventName - A value from `encounters.events`.
         * @param {Function} options.listener  - Callback invoked with the event payload.
         * @returns {EncounterEventSubscription}
         *
         * @example
         * const sub = game.turnOfTheCentury.encounters.onEvent({
         *   eventName: game.turnOfTheCentury.encounters.events.PLANNING_STARTED,
         *   listener: ({ combat, round }) => console.log(`Round ${round} planning began`)
         * });
         * // Clean up:
         * sub.unsubscribe();
         */
        onEvent: ({ eventName, listener }) => {
            return createEncounterEventSubscription(eventName, listener);
        },

        /**
         * Unsubscribe a listener that was registered with `onEvent`.
         *
         * @param {EncounterEventSubscription} subscription - The object returned by `onEvent`.
         * @returns {boolean} `true` if the listener was found and removed.
         */
        offEvent: (subscription) => {
            return removeEncounterEventSubscription(subscription);
        },
        getCatalog: () => getBaseActionCatalog(),
        getSettings: () => ({
            apBudget: getActionPointBudget(),
            movementFeetPerAp: getMovementFeetPerAp(),
            planningLimitSeconds: getPlanningLimitSeconds(),
            planningWarningSeconds: getPlanningWarningSeconds(),
            replayStyle: game.settings.get("turn-of-the-century", ENCOUNTER_REPLAY_STYLE_SETTING)
        }),
        initializeRound: async (combat = game.combat) => {
            if (!combat?.initializeEncounterRound) throw new Error("Active combat does not support AP encounter initialization.");
            return combat.initializeEncounterRound();
        },
        setPlan: async ({ combat = game.combat, combatantId, actions }) => {
            if (!combat?.setCombatantPlan) throw new Error("Active combat does not support AP planning.");
            return combat.setCombatantPlan(combatantId, actions);
        },
        addAction: async ({ combat = game.combat, combatantId, action }) => {
            if (!combat?.addCombatantAction) throw new Error("Active combat does not support AP action queue editing.");
            return combat.addCombatantAction(combatantId, action);
        },
        removeAction: async ({ combat = game.combat, combatantId, index }) => {
            if (!combat?.removeCombatantAction) throw new Error("Active combat does not support AP action removal.");
            return combat.removeCombatantAction(combatantId, index);
        },
        clearPlan: async ({ combat = game.combat, combatantId }) => {
            if (!combat?.clearCombatantPlan) throw new Error("Active combat does not support AP plan clearing.");
            return combat.clearCombatantPlan(combatantId);
        },
        setReady: async ({ combat = game.combat, combatantId, ready }) => {
            if (!combat?.setCombatantReady) throw new Error("Active combat does not support AP ready state updates.");
            return combat.setCombatantReady(combatantId, ready);
        },
        rollInitiative: async ({ combat = game.combat, combatantId }) => {
            if (!combat?.rollEncounterInitiative) throw new Error("Active combat does not support participant initiative rolls.");
            return combat.rollEncounterInitiative(combatantId);
        },
        rollAllMissingInitiatives: async (combat = game.combat) => {
            if (!combat?.rollAllMissingInitiatives) throw new Error("Active combat does not support bulk initiative rolls.");
            return combat.rollAllMissingInitiatives();
        },
        resolveRound: async (combat = game.combat) => {
            if (!combat?.resolveEncounterRound) throw new Error("Active combat does not support AP resolution.");
            return combat.resolveEncounterRound();
        },
        setPhase: async ({ combat = game.combat, phase }) => {
            if (!combat?.setEncounterPhase) throw new Error("Active combat does not support AP encounter phases.");
            return combat.setEncounterPhase(phase);
        }
    };

    game.turnOfTheCentury.seeds = {
        /**
         * Reference data for encounter seeding
         * @type {Object}
         */
        adversaryProfiles: Object.freeze(foundry.utils.deepClone(ADVERSARY_PROFILES)),
        factionMetadata: Object.freeze(foundry.utils.deepClone(FACTION_METADATA)),
        terrainFeatures: Object.freeze(foundry.utils.deepClone(TERRAIN_FEATURES)),
        escalationTriggers: Object.freeze(foundry.utils.deepClone(ESCALATION_TRIGGERS)),
        lootTables: Object.freeze(foundry.utils.deepClone(LOOT_TABLES)),
        narrativeHooks: Object.freeze(foundry.utils.deepClone(NARRATIVE_HOOKS)),

        /**
         * Build complete encounter context from a seed template
         * @param {Object} seed - Encounter seed template
         * @param {string} region - Region name (frontier, urban, industrial, wilds)
         * @returns {Object} Full encounter context with all metadata
         */
        buildContext: (seed, region) => buildEncounterContext(seed, region),

        /**
         * Instantiate an encounter seed into actor profiles for creation
         * @param {Object} seed - Encounter seed template
         * @param {string} difficulty - Difficulty override (standard, hard)
         * @returns {Array<Object>} Adversary profile objects ready for Actor creation
         */
        instantiate: (seed, difficulty) => instantiateEncounterSeed(seed, difficulty),

        /**
         * Get escalation trigger for a seed
         * @param {Object} seed - Encounter seed template
         * @returns {Object|null} Escalation trigger metadata
         */
        getEscalation: (seed) => getEscalationTrigger(seed),

        /**
         * Get terrain feature by name
         * @param {string} terrainName - Terrain feature name
         * @returns {Object|null} Terrain feature metadata
         */
        getTerrain: (terrainName) => getTerrainFeature(terrainName),

        /**
         * Get narrative hooks for a faction
         * @param {string} factionKey - Faction identifier
         * @returns {Object} Narrative hooks for the faction
         */
        getNarrative: (factionKey) => getNarrativeHooks(factionKey),

        /**
         * Get faction metadata
         * @param {string} factionKey - Faction identifier
         * @returns {Object} Faction metadata and objectives
         */
        getFaction: (factionKey) => getFactionMetadata(factionKey),

        /**
         * Get terrain adaptations for a faction
         * @param {string} factionKey - Faction identifier
         * @returns {Object|null} Faction terrain adaptations mapping
         */
        getFactionTerrainAdaptations: (factionKey) => getFactionTerrainAdaptations(factionKey),

        /**
         * Apply faction-specific terrain modifiers to base terrain
         * @param {Object} terrain - Base terrain feature object
         * @param {string} factionKey - Faction identifier
         * @returns {Object} Terrain with faction adaptations applied
         */
        applyFactionTerrainAdaptations: (terrain, factionKey) =>
            applyFactionTerrainAdaptations(terrain, factionKey),

        /**
         * Roll loot from faction table
         * @param {string} factionKey - Faction identifier
         * @param {string} difficulty - Difficulty level (standard, hard)
         * @returns {Array<string>} Loot descriptions
         */
        rollLoot: (factionKey, difficulty) => rollLoot(factionKey, difficulty)
    };

    /**
     * NPC Instantiation API
     * Manage auto-creation of NPC actors from encounter seeds
     */
    game.turnOfTheCentury.npcs = {
        /**
         * Create NPCs from an encounter seed
         * @param {Object} seed - Encounter seed with adversaries list
         * @param {string} difficulty - Difficulty level (standard, hard)
         * @returns {Promise<Object>} Result with combat, actors, combatants
         */
        createFromSeed: (seed, difficulty = "standard") =>
            createCombatEncounterWithNpcs(seed, difficulty),

        /**
         * Create NPCs from seed and add to existing combat
         * @param {Object} seed - Encounter seed
         * @param {string} difficulty - Difficulty level
         * @param {Combat} combat - Existing combat to add to
         * @returns {Promise<Object>} Result with combat, actors, combatants
         */
        createFromSeedForCombat: (seed, difficulty, combat) =>
            createCombatEncounterWithNpcs(seed, difficulty, combat),

        /**
         * List all active temporary NPCs
         * @returns {Array<Actor>} Temporary NPC actors
         */
        listActive: () => getActiveTemporaryNpcs(),

        /**
         * Get details for a specific NPC
         * @param {Actor} actor - NPC actor
         * @returns {Object} Display details (name, role, faction, health, etc)
         */
        getDetails: (actor) => getNpcDetails(actor),

        /**
         * Clean up temporary NPCs after encounter
         * @param {Array<Actor>} actors - Specific actors to delete (optional)
         * @returns {Promise<Array>} Deleted actor IDs
         */
        cleanup: (actors = null) => cleanupTemporaryNpcs(actors),

        /**
         * Toggle auto-creation of NPCs for travel encounters
         * @param {boolean} enabled - Enable or disable auto-creation
         */
        setAutoCreate: (enabled) =>
            game.settings.set("turn-of-the-century", AUTO_CREATE_ENCOUNTER_NPCS_SETTING, Boolean(enabled)),

        /**
         * Check if auto-creation is enabled
         * @returns {boolean} Auto-creation enabled state
         */
        isAutoCreateEnabled: () =>
            game.settings.get("turn-of-the-century", AUTO_CREATE_ENCOUNTER_NPCS_SETTING) ?? true,

        /**
         * Console API for NPC operations
         */
        console: NpcInstantiationConsoleAPI
    };

    game.turnOfTheCentury.campEvents = {
        /**
         * Roll a region-aware camp event
         * @param {Object} options - Roll options
         * @param {string} options.region - Region (frontier, urban, industrial, wilds)
         * @param {string} options.season - Season (spring, summer, autumn, winter)
         * @param {string} options.morale - Morale level (low, normal, high)
         * @returns {Object} Event details
         */
        rollEvent: (options = {}) => rollRegionAwareCampEvent(options),

        /**
         * Get detailed report for a camp event
         * @param {Object} options - Options for event
         * @returns {Object} Detailed report with narrative
         */
        getReport: (options = {}) => getDetailedCampEventReport(options),

        /**
         * Get all camp events for a region
         * @param {string} region - Region name
         * @returns {Object} Event table for that region
         */
        getEventsForRegion: (region = "frontier") => getRegionCampEvents(region),

        /**
         * Get available regions
         * @returns {Array<string>} Array of region names
         */
        getRegions: () => [...REGIONS],

        /**
         * Get available seasons
         * @returns {Array<string>} Array of season names
         */
        getSeasons: () => Object.values(CAMP_SEASONS)
    };

    if (encounterPlanningWatchHandle) {
        clearInterval(encounterPlanningWatchHandle);
        encounterPlanningWatchHandle = null;
    }

    if (game.user?.isGM) {
        encounterPlanningWatchHandle = setInterval(async () => {
            const combat = game.combat;
            if (!combat?.maybeAutoFinalizePlanning) return;
            if ((combat.phase ?? "planning") !== "planning") return;

            try {
                await combat.maybeAutoFinalizePlanning();
            } catch (error) {
                console.warn("[turn-of-the-century] Failed to auto-finalize AP planning.", error);
            }
        }, 1000);
    }

    maybePromptInitiativeRolls(game.combat);

});

Hooks.on("updateCombat", (combat) => {
    logEncounterLifecycle("updateCombat", { combat });
    maybePromptInitiativeRolls(combat);
    rerenderEncounterActorSheets(combat);
    rerenderEncounterTracker(combat);
});

for (const hookName of ENCOUNTER_EVENT_HOOK_NAMES) {
    Hooks.on(hookName, (payload) => {
        handleEncounterEventHook(hookName, payload);
    });
}

Hooks.on("createCombatant", (combatant) => {
    logEncounterLifecycle("createCombatant", { combatantId: combatant?.id, combatant });
    rerenderEncounterActorSheets(combatant?.combat);
});

Hooks.on("deleteCombatant", (combatant) => {
    logEncounterLifecycle("deleteCombatant", { combatantId: combatant?.id, combatant });
    rerenderEncounterActorSheets(combatant?.combat);
});

Hooks.on("updateCombatant", (combatant, change) => {
    logEncounterLifecycle("updateCombatant", {
        combatantId: combatant?.id,
        initiative: combatant?.initiative,
        change,
        combatant
    });
    rerenderEncounterActorSheets(combatant?.combat);
});

Hooks.on("deleteCombat", (combat) => {
    logEncounterLifecycle("deleteCombat", { combat });
    rerenderEncounterActorSheets(combat);
});

Hooks.on("createCombat", (combat) => {
    logEncounterLifecycle("createCombat", { combat });
    rerenderEncounterActorSheets(combat);
});

Hooks.on("combatStart", (combat) => {
    logEncounterLifecycle("combatStart", { combat });
    rerenderEncounterActorSheets(combat);
});

Hooks.once("shutdown", () => {
    if (encounterPlanningWatchHandle) {
        clearInterval(encounterPlanningWatchHandle);
        encounterPlanningWatchHandle = null;
    }

    void workspaceV2Coordinator?.shutdown?.();
    workspaceV2Coordinator = null;
});
