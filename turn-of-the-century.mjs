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
import { TOTC_WORLD_SCHEMA_VERSION, migrateTotcActorProfiles, migrateTotcEquipmentSlots, runTotcMigrations } from "./module/migrations.mjs";
import { TurnOfTheCenturyActor, TurnOfTheCenturyItem } from "./module/documents.mjs";
import {
    TurnOfTheCenturyHeroSheet,
    TurnOfTheCenturyPawnSheet,
    TurnOfTheCenturyVillainSheet
} from "./module/sheets/actor-sheet.mjs";
import { TurnOfTheCenturyItemSheet } from "./module/sheets/item-sheet.mjs";

const STARTER_CONTENT_SEEDED_SETTING = "starterContentSeeded";
const WORLD_SCHEMA_VERSION_SETTING = "worldSchemaVersion";

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
        run: async () => {
            const result = await runTotcMigrations({
                currentVersion: game.settings.get("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING),
                migrateActorProfiles: migrateTotcActorProfiles,
                migrateEquipmentSlots: migrateTotcEquipmentSlots,
                notify: true
            });
            await game.settings.set("turn-of-the-century", WORLD_SCHEMA_VERSION_SETTING, result.toVersion);
            return result;
        }
    };

    void maybeRunAutomatedMigrations();
    void maybeSeedStarterCompendiums();
});
