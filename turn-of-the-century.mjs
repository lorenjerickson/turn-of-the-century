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
    migrateTotcEncounterActions,
    migrateTotcModifiers,
    migrateTotcStarterCompendiums,
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

const STARTER_CONTENT_SEEDED_SETTING = "starterContentSeeded";
const WORLD_SCHEMA_VERSION_SETTING = "worldSchemaVersion";
const ENCOUNTER_AP_BUDGET_SETTING = "encounterActionPointBudget";
const ENCOUNTER_MOVE_FEET_PER_AP_SETTING = "encounterMovementFeetPerAp";
const ENCOUNTER_PLANNING_LIMIT_SECONDS_SETTING = "encounterPlanningLimitSeconds";
const ENCOUNTER_PLANNING_WARNING_SECONDS_SETTING = "encounterPlanningWarningSeconds";
const ENCOUNTER_REPLAY_STYLE_SETTING = "encounterReplayNarrationStyle";
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
let encounterPlanningWatchHandle = null;
const initiativePromptKeys = new Set();

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

    const combatActorIds = new Set(
        (combat.combatants?.contents ?? [])
            .map((combatant) => combatant.actor?.id ?? combatant.actorId)
            .filter(Boolean)
    );
    const combatTokenIds = new Set(
        (combat.combatants?.contents ?? [])
            .map((combatant) => combatant.tokenId ?? combatant.token?.id)
            .filter(Boolean)
    );

    for (const app of Object.values(ui.windows ?? {})) {
        const classes = app?.options?.classes ?? [];
        if (!Array.isArray(classes)) continue;
        if (!classes.includes("turn-of-the-century") || !classes.includes("actor")) continue;
        if (!app?.rendered || typeof app.render !== "function") continue;

        const actorId = app.actor?.id;
        const tokenId = app.token?.id ?? app.token?.document?.id;
        const shouldRender = Boolean(
            (actorId && combatActorIds.has(actorId))
            || (tokenId && combatTokenIds.has(tokenId))
        );

        if (shouldRender) {
            app.render(false);
        }
    }
}

function rerenderEncounterTracker(combat) {
    const tracker = ui.combat;
    if (!tracker?.rendered || typeof tracker.render !== "function") return;

    const viewedCombat = tracker.viewed ?? game.combat;
    if (!viewedCombat || viewedCombat.id !== combat?.id) return;

    tracker.render(false);
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
            migrateEquipmentSlots: migrateTotcEquipmentSlots,
            migrateEncounterActions: migrateTotcEncounterActions,
            migrateModifiers: migrateTotcModifiers,
            migrateStarterCompendiums: migrateTotcStarterCompendiums,
            notify: true
        });

        await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);
    } catch (error) {
        console.error("[turn-of-the-century] Failed to run automated migrations.", error);
        ui.notifications?.error(
            "Turn of the Century failed to run world migrations. Run `await game.turnOfTheCentury.migrations.run()` as a GM after checking console errors."
        );
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

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("turn-of-the-century", TurnOfTheCenturyItemSheet, {
        makeDefault: true,
        label: "Turn of the Century Item Sheet"
    });

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("turn-of-the-century", TurnOfTheCenturyHeroSheet, {
        types: ["hero"],
        makeDefault: true,
        label: "Turn of the Century Hero Sheet"
    });
    Actors.registerSheet("turn-of-the-century", TurnOfTheCenturyVillainSheet, {
        types: ["villain"],
        makeDefault: true,
        label: "Turn of the Century Villain Sheet"
    });
    Actors.registerSheet("turn-of-the-century", TurnOfTheCenturyPawnSheet, {
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
});

Hooks.once("ready", () => {
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
        migrateEquipmentSlots: migrateTotcEquipmentSlots,
        migrateEncounterActions: migrateTotcEncounterActions,
        migrateModifiers: migrateTotcModifiers,
        run: async () => {
            const result = await runTotcMigrations({
                currentVersion: game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING),
                migrateActorProfiles: migrateTotcActorProfiles,
                migrateActorProfessions: migrateTotcActorProfessions,
                migrateEquipmentSlots: migrateTotcEquipmentSlots,
                migrateEncounterActions: migrateTotcEncounterActions,
                migrateModifiers: migrateTotcModifiers,
                migrateStarterCompendiums: migrateTotcStarterCompendiums,
                notify: true
            });
            await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);
            return result;
        }
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

    void maybeRunAutomatedMigrations();
    void maybeSeedStarterCompendiums();
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
    if (!encounterPlanningWatchHandle) return;
    clearInterval(encounterPlanningWatchHandle);
    encounterPlanningWatchHandle = null;
});
