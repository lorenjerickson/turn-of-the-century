import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(new URL("../system.json", import.meta.url)));

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
