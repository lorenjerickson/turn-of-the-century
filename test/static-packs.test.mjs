import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../system.json", import.meta.url)));

const DEFAULT_ITEM_ICONS = {
    armor: "icons/svg/shield.svg",
    campaign: "icons/svg/book.svg",
    consumable: "icons/svg/pill.svg",
    effect: "icons/svg/aura.svg",
    equipment: "icons/svg/clockwork.svg",
    ethnicity: "icons/svg/mystery-man.svg",
    item: "icons/svg/item-bag.svg",
    location: "icons/svg/city.svg",
    profession: "icons/svg/mystery-man.svg",
    quirk: "icons/svg/hazard.svg",
    scenario: "icons/svg/combat.svg",
    skill: "icons/svg/book.svg",
    talent: "icons/svg/upgrade.svg",
    weapon: "icons/svg/sword.svg"
};

describe("static compendium pack content", () => {
    it("declares item packs with bundled JSON documents", () => {
        const system = JSON.parse(readFileSync(join(rootDir, "system.json"), "utf8"));
        const itemPacks = system.packs.filter((pack) => pack.type === "Item");

        assert.ok(itemPacks.length > 0, "system.json should declare item packs");

        for (const pack of itemPacks) {
            const packPath = join(rootDir, pack.path);
            const documents = readdirSync(packPath).filter((fileName) => fileName.endsWith(".json"));

            assert.ok(documents.length > 0, `${pack.name} should include static JSON documents`);
        }
    });

    it("gives every bundled item an explicit icon and uses type-appropriate defaults", () => {
        const system = JSON.parse(readFileSync(join(rootDir, "system.json"), "utf8"));
        const itemPacks = system.packs.filter((pack) => pack.type === "Item");
        const requiredPackages = new Set((system.relationships?.requires ?? []).map((relationship) => relationship.id));

        for (const pack of itemPacks) {
            const packPath = join(rootDir, pack.path);
            const documentFiles = readdirSync(packPath).filter((fileName) => fileName.endsWith(".json"));

            for (const fileName of documentFiles) {
                const document = JSON.parse(readFileSync(join(packPath, fileName), "utf8"));
                const image = String(document.img ?? "").trim();
                assert.ok(image, `${pack.name}/${fileName} should define an icon`);
                assert.equal(/\s/.test(image), false, `${pack.name}/${fileName} icon path should not contain whitespace`);

                if (image.startsWith("icons/svg/")) {
                    assert.equal(
                        image,
                        DEFAULT_ITEM_ICONS[document.type],
                        `${pack.name}/${fileName} should use the default icon for ${document.type}`
                    );
                }

                if (image.startsWith("modules/game-icons-net/")) {
                    assert.equal(requiredPackages.has("game-icons-net"), true, "game-icons-net should be a required system dependency");
                    assert.match(
                        image,
                        /^modules\/game-icons-net\/(?:black|white)background\/[a-z0-9_-]+\.svg$/,
                        `${pack.name}/${fileName} should use a stable Game-icons.net path`
                    );
                }
            }
        }
    });

    it("replaces generic starter item defaults with curated icons", () => {
        const starterPath = join(rootDir, "packs/starter-items");
        const documents = readdirSync(starterPath)
            .filter((fileName) => fileName.endsWith(".json"))
            .map((fileName) => JSON.parse(readFileSync(join(starterPath, fileName), "utf8")));

        assert.equal(
            documents.some((document) => String(document.img ?? "").startsWith("icons/svg/")),
            false,
            "starter items should not retain generic Foundry type icons"
        );
    });

    it("gives plausible lock-opening equipment a 2 AP Unlock action", () => {
        const capableItems = [
            ["packs/equipment", "locksmith-roll.json"],
            ["packs/equipment", "folding-pry-hook.json"],
            ["packs/consumables", "acid-wash-solution.json"]
        ];

        for (const [packPath, fileName] of capableItems) {
            const item = JSON.parse(readFileSync(join(rootDir, packPath, fileName), "utf8"));
            const unlock = item.system.actions.variants.find((action) => action.id === "unlock");
            assert.equal(unlock?.label, "Unlock", `${item.name} should provide Unlock`);
            assert.equal(unlock?.type, "utility");
            assert.equal(unlock?.apCost, 2);
        }
    });

    it("declares a starter scene pack with the Lobby scene and shipped background", () => {
        const system = JSON.parse(readFileSync(join(rootDir, "system.json"), "utf8"));
        const scenePack = system.packs.find((pack) => pack.name === "starter-scenes");

        assert.deepEqual(scenePack, {
            name: "starter-scenes",
            label: "Starter Library: Scenes",
            type: "Scene",
            path: "packs/starter-scenes",
            system: "turn-of-the-century"
        });

        const lobbyScene = JSON.parse(readFileSync(join(rootDir, "packs/starter-scenes/lobby.json"), "utf8"));
        assert.equal(lobbyScene._id, "totclobbyscene01");
        assert.equal(lobbyScene.name, "Lobby");
        assert.equal(lobbyScene.background.src, "systems/turn-of-the-century/assets/images/scenes/lobby.jpg");
        assert.equal(lobbyScene.texture.src, "systems/turn-of-the-century/assets/images/scenes/lobby.jpg");
        assert.equal(existsSync(join(rootDir, "assets/images/scenes/lobby.jpg")), true);
    });
});
