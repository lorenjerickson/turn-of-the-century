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
import { TurnOfTheCenturyItem } from "./module/documents.mjs";
import { TurnOfTheCenturyItemSheet } from "./module/sheets/item-sheet.mjs";

const STARTER_CONTENT_SEEDED_SETTING = "starterContentSeeded";

async function maybeSeedStarterCompendiums() {
    if (!game?.ready || !game.user?.isGM) return;

    const isSeeded = game.settings.get("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING);
    if (isSeeded) return;

    const systemId = game.system?.id;
    const actorPack = game.packs.get(`${systemId}.${TOTC_SAMPLE_COMPENDIUMS.actors}`);
    const itemPack = game.packs.get(`${systemId}.${TOTC_SAMPLE_COMPENDIUMS.items}`);
    if (!actorPack || !itemPack) return;

    await actorPack.getIndex();
    await itemPack.getIndex();

    const actorCount = actorPack.index?.size ?? actorPack.index?.length ?? 0;
    const itemCount = itemPack.index?.size ?? itemPack.index?.length ?? 0;
    if (actorCount > 0 || itemCount > 0) {
        await game.settings.set("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, true);
        return;
    }

    try {
        await publishTotcSampleCompendiums({ overwrite: false });
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
    CONFIG.Item.documentClass = TurnOfTheCenturyItem;

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

    game.settings.register("turn-of-the-century", STARTER_CONTENT_SEEDED_SETTING, {
        name: "Starter content seeded",
        hint: "Internal setting to avoid re-importing starter compendium content repeatedly.",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
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

    void maybeSeedStarterCompendiums();
});
