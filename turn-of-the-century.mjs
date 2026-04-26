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
    getPlanningWarningSeconds
} from "./module/encounters/action-catalog.mjs";
import {
    TOTC_WORLD_SCHEMA_VERSION,
    migrateTotcActorProfiles,
    migrateTotcEncounterActions,
    migrateTotcEquipmentSlots,
    runTotcMigrations
} from "./module/migrations.mjs";
import { TurnOfTheCenturyActor, TurnOfTheCenturyCombat, TurnOfTheCenturyItem } from "./module/documents.mjs";
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
const ENCOUNTER_PLANNING_WARNING_SECONDS_SETTING = "encounterPlanningWarningSeconds";
const ENCOUNTER_REPLAY_STYLE_SETTING = "encounterReplayNarrationStyle";

function getIndexCount(pack) {
    return pack.index?.size ?? pack.index?.length ?? 0;
}

async function maybeRunAutomatedMigrations() {
    if (!game?.ready || !game.user?.isGM) return;

    const currentVersion = game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING);
    if ((Number(currentVersion) || 0) >= TOTC_WORLD_SCHEMA_VERSION) return;

    try {
        const result = await runTotcMigrations({
            currentVersion,
            migrateActorProfiles: migrateTotcActorProfiles,
            migrateEquipmentSlots: migrateTotcEquipmentSlots,
            migrateEncounterActions: migrateTotcEncounterActions,
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

    const systemId = game.system?.id;
    const actorPack = game.packs.get(`${systemId}.${TOTC_SAMPLE_COMPENDIUMS.actors}`);
    const itemPack = game.packs.get(`${systemId}.${TOTC_SAMPLE_COMPENDIUMS.items}`);
    if (!actorPack || !itemPack) return;

    const isSeeded = game.settings.get("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING);

    await actorPack.getIndex();
    await itemPack.getIndex();

    const actorCount = getIndexCount(actorPack);
    const itemCount = getIndexCount(itemPack);
    const expectedActorCount = TOTC_SAMPLE_LIBRARY_STATS.actors.total;
    const expectedItemCount = TOTC_SAMPLE_LIBRARY_STATS.items.total;

    const isSynced = actorCount === expectedActorCount && itemCount === expectedItemCount;
    if (isSeeded && isSynced) return;

    if (isSynced) {
        await game.settings.set("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, true);
        return;
    }

    try {
        const overwrite = actorCount > 0 || itemCount > 0;
        await publishTotcSampleCompendiums({ overwrite });
        await game.settings.set("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, true);
        ui.notifications?.info(
            overwrite
                ? "Turn of the Century starter compendiums were refreshed to match the current starter library."
                : "Turn of the Century starter compendiums were populated for this world."
        );
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
        migrateEquipmentSlots: migrateTotcEquipmentSlots,
        migrateEncounterActions: migrateTotcEncounterActions,
        run: async () => {
            const result = await runTotcMigrations({
                currentVersion: game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING),
                migrateActorProfiles: migrateTotcActorProfiles,
                migrateEquipmentSlots: migrateTotcEquipmentSlots,
                migrateEncounterActions: migrateTotcEncounterActions,
                notify: true
            });
            await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);
            return result;
        }
    };
    game.turnOfTheCentury.encounters = {
        getCatalog: () => getBaseActionCatalog(),
        getSettings: () => ({
            apBudget: getActionPointBudget(),
            movementFeetPerAp: getMovementFeetPerAp(),
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
        resolveRound: async (combat = game.combat) => {
            if (!combat?.resolveEncounterRound) throw new Error("Active combat does not support AP resolution.");
            return combat.resolveEncounterRound();
        },
        setPhase: async ({ combat = game.combat, phase }) => {
            if (!combat?.setEncounterPhase) throw new Error("Active combat does not support AP encounter phases.");
            return combat.setEncounterPhase(phase);
        }
    };

    void maybeRunAutomatedMigrations();
    void maybeSeedStarterCompendiums();
});
