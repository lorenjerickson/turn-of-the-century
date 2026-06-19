import { withUnlockedCompendiumPack } from "./compendium-locking.mjs";

const ICON_ROOT = "modules/game-icons-net/blackbackground";

const DEFAULT_ICONS_BY_TYPE = {
    consumable: "icons/svg/pill.svg",
    equipment: "icons/svg/clockwork.svg",
    item: "icons/svg/item-bag.svg",
    skill: "icons/svg/book.svg",
    talent: "icons/svg/upgrade.svg",
    weapon: "icons/svg/sword.svg"
};

const ITEM_ICON_MIGRATIONS = new Map([
    ["Acid-Wash Solution", ["consumable", "acid-tube.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Aerial Navigation", ["skill", "air-balloon.svg", "icons/environment/wilderness/weather-wind-gusts.webp"]],
    ["Aetheric Elixir", ["consumable", "magic-potion.svg", "icons/consumables/potions/potion-jug-corked-purple.webp"]],
    ["Antitoxin Ampoule", ["consumable", "medicines.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Ashwood Hunting Spear", ["weapon", "spear-feather.svg", "icons/weapons/polearms/spear-simple.webp"]],
    ["Boiler Gauge Clamp", ["equipment", "clamp.svg", "icons/tools/hand/clamp-steel.webp"]],
    ["Boiler Safety Drill", ["skill", "furnace.svg", "icons/tools/smithing/furnace-fire-orange.webp"]],
    ["Brass Calling Whistle", ["item", "whistle.svg", "icons/tools/instruments/whistle-brass.webp"]],
    ["Caliper Rule Set", ["item", "measure-tape.svg", "icons/tools/hand/claw-hammer.webp"]],
    ["Canal Navigation", ["skill", "river.svg", "icons/environment/wilderness/river.webp"]],
    ["Clockmaker's Stiletto", ["weapon", "broad-dagger.svg", "icons/weapons/daggers/dagger-thin-steel.webp"]],
    ["Clockwork Derringer", ["weapon", "pistol-gun.svg", "icons/weapons/guns/gun-pistol-doublebarrel.webp"]],
    ["Coalbreaker Tonic", ["consumable", "coal-pile.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Combat Morphia", ["consumable", "syringe.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Dock Hook Pike", ["weapon", "spear-hook.svg", "icons/weapons/polearms/halberd-simple.webp"]],
    ["Ether Cough Syrup", ["consumable", "lungs.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Field Bandage Roll", ["consumable", "bandage-roll.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Field Investigator Kit", ["equipment", "magnifying-glass.svg", "icons/tools/scribal/lens-glass-brown.webp"]],
    ["Folded Street Atlas", ["item", "atlas.svg", "icons/sundries/documents/map-folded-leather.webp"]],
    ["Folding Pry Hook", ["equipment", "crowbar.svg", "icons/tools/hand/crowbar-steel.webp"]],
    ["Forensic Photography", ["skill", "photo-camera.svg", "icons/tools/hand/camera-brass.webp"]],
    ["Foundry Hammer", ["weapon", "flat-hammer.svg", "icons/tools/hand/hammer-mallete-steel.webp"]],
    ["Furnace Rhythm", ["talent", "furnace.svg", "icons/magic/fire/flame-burning-furnace.webp"]],
    ["Galvanic Prod", ["weapon", "electric.svg", "icons/weapons/staves/staff-orb-sh lightning.webp"]],
    ["Galvanic Stimulant", ["consumable", "bottled-bolt.svg", "icons/consumables/potions/potion-vial-corked-blue.webp"]],
    ["Iron Lung Draught", ["consumable", "lungs.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Ironlung Vapour Cartridge", ["consumable", "gas-mask.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Last-Light Resolve", ["talent", "candle-light.svg", "icons/magic/light/explosion-star-small-yellow.webp"]],
    ["Locksmith Roll", ["equipment", "lockpicks.svg", "icons/tools/hand/pick-steel-white.webp"]],
    ["Mechanism Disassembly", ["skill", "gears.svg", "icons/tools/hand/tool-cog-yellow.webp"]],
    ["Mercury Fever Drops", ["consumable", "eyedropper.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Mortuary Lantern", ["equipment", "old-lantern.svg", "icons/sundries/lights/lantern-bullseye-silver.webp"]],
    ["Nightwatch Tonic", ["consumable", "all-seeing-eye.svg", "icons/consumables/potions/potion-bottle-corked-cyan.webp"]],
    ["Noctilucent Salts", ["consumable", "chemical-drop.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Parish Register Carbon", ["item", "archive-register.svg", "icons/sundries/documents/document-worn-folded.webp"]],
    ["Pocket Hourglass", ["item", "hourglass.svg", "icons/tools/time/hourglass-brown.webp"]],
    ["Pocket Reliquary", ["item", "holy-symbol.svg", "icons/commodities/treasure/token-gold-red.webp"]],
    ["Portable Telegraph Tap", ["equipment", "electrical-socket.svg", "icons/tools/instruments/keyboard-keys-brown.webp"]],
    ["Quiet Hands", ["talent", "hand.svg", "icons/skills/melee/hand-grip-staff-brown.webp"]],
    ["Railway Legs", ["talent", "railway.svg", "icons/environment/settlement/train.webp"]],
    ["Ratcatcher Carbine", ["weapon", "winchester-rifle.svg", "icons/weapons/guns/gun-rifle-brown.webp"]],
    ["Revival Ether", ["consumable", "heart-bottle.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Ritual Chalk Cylinder", ["equipment", "pencil.svg", "icons/commodities/materials/powder-white.webp"]],
    ["Rivet Hammer", ["weapon", "gear-hammer.svg", "icons/weapons/hammers/hammer-riveted.webp"]],
    ["Signal Almanac", ["item", "rule-book.svg", "icons/sundries/books/book-embossed-compass-blue.webp"]],
    ["Signal Chalk Slate", ["item", "pencil.svg", "icons/sundries/documents/scroll-plain-white.webp"]],
    ["Signal Flare Pistol", ["weapon", "distress-signal.svg", "icons/weapons/guns/gun-pistol-flintlock-black.webp"]],
    ["Signal Mirror", ["equipment", "mirror-mirror.svg", "icons/tools/navigation/sundial-brass.webp"]],
    ["Smelling Vial", ["consumable", "perfume-bottle.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Smoke Lens Goggles", ["equipment", "steampunk-goggles.svg", "icons/equipment/head/goggles-lens-blue.webp"]],
    ["Soot Filter Paste", ["consumable", "gas-mask.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Sootproof Cloak", ["item", "cloak.svg", "icons/equipment/back/cloak-hooded-black.webp"]],
    ["Station Pass Ledger", ["item", "boarding-pass.svg", "icons/sundries/books/book-clasp-red.webp"]],
    ["Steamworks Negotiation", ["skill", "discussion.svg", "icons/skills/social/diplomacy-peace.webp"]],
    ["Storm Orientation", ["talent", "compass.svg", "icons/environment/wilderness/weather-wind.webp"]],
    ["Streetline Shotgun", ["weapon", "shotgun.svg", "icons/weapons/guns/gun-shotgun.webp"]],
    ["Subterranean Recon", ["skill", "underground-cave.svg", "icons/environment/underground/cave-entrance.webp"]],
    ["Surgeon's Field Case", ["equipment", "first-aid-kit.svg", "icons/tools/hand/tool-scissors-orange.webp"]],
    ["Surgeon's Lancet", ["weapon", "scalpel.svg", "icons/weapons/daggers/dagger-silver-blue.webp"]],
    ["Surveyor's Transit", ["equipment", "telescope.svg", "icons/tools/navigation/spyglass-brass.webp"]],
    ["Trench Truncheon", ["weapon", "baton.svg", "icons/weapons/maces/mace-round-steel-black.webp"]],
    ["Valve Key Set", ["equipment", "valve.svg", "icons/tools/hand/pliers-steel.webp"]],
    ["Vital Saline Infusion", ["consumable", "medical-drip.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]],
    ["Wire Garrote", ["weapon", "wire-coil.svg", "icons/weapons/swords/sword-thin-grey.webp"]],
    ["Wound Stitch Kit", ["consumable", "stitched-wound.svg", "icons/consumables/potions/potion-vial-corked-red.webp"]]
]);

export function buildItemIconUpdate(item) {
    const migration = ITEM_ICON_MIGRATIONS.get(String(item?.name ?? "").trim());
    if (!migration) return null;

    const [type, iconFile, legacyImg] = migration;
    if (String(item?.type ?? "").trim().toLowerCase() !== type) return null;

    const currentImg = String(item?.img ?? "").trim();
    const nextImg = `${ICON_ROOT}/${iconFile}`;
    if (currentImg === nextImg) return null;

    const defaultImg = DEFAULT_ICONS_BY_TYPE[type] ?? "";
    if (currentImg && currentImg !== legacyImg && currentImg !== defaultImg) return null;
    return { img: nextImg };
}

async function migrateCollectionItems(documents, report, source, { dryRun = false } = {}) {
    for (const item of documents ?? []) {
        report.itemsScanned += 1;
        const updateData = buildItemIconUpdate(item);
        if (!updateData) continue;

        report.itemsUpdated += 1;
        report.changedDocuments.push({ id: item.id, name: item.name, source, img: updateData.img });
        if (!dryRun) await item.update(updateData);
    }
}

export async function migrateTotcItemIcons({ dryRun = false, notify = true, includeCompendiums = true } = {}) {
    if (!game?.ready) throw new Error("Game is not ready yet.");

    const report = {
        dryRun: Boolean(dryRun),
        includeCompendiums: Boolean(includeCompendiums),
        itemsScanned: 0,
        itemsUpdated: 0,
        changedDocuments: []
    };

    await migrateCollectionItems(game.items?.contents ?? [], report, "world-item", { dryRun });

    for (const actor of game.actors?.contents ?? []) {
        await migrateCollectionItems(actor.items?.contents ?? [], report, `actor:${actor.name}`, { dryRun });
    }

    if (includeCompendiums) {
        const packs = game.packs?.filter((pack) => pack.documentName === "Item" && pack.metadata.packageType === "system") ?? [];
        for (const pack of packs) {
            await withUnlockedCompendiumPack(pack, async () => {
                await migrateCollectionItems(await pack.getDocuments(), report, pack.collection, { dryRun });
            }, { dryRun });
        }
    }

    if (notify) {
        const label = dryRun ? "dry-run" : "migration";
        ui.notifications?.info(`Turn of the Century item-icon ${label}: ${report.itemsUpdated} items updated.`);
    }

    return report;
}
