import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
});
