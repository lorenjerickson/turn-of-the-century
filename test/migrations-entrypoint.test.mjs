import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("migration entrypoint wiring", () => {
    it("wires the guarded starter compendium repair migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcStarterCompendiums"), true);
    });

    it("wires the seed-missing-actors migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateSeedMissingWorldActors"), true);
        assert.equal(source.includes("seedMissingActors: migrateSeedMissingWorldActors"), true);
    });

    it("wires the starter actor avatars migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcStarterActorAvatars"), true);
        assert.equal(source.includes("migrateStarterActorAvatars: migrateTotcStarterActorAvatars"), true);
    });

    it("wires the action recap formats migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcActionRecapFormats"), true);
        assert.equal(source.includes("migrateActionRecapFormats: migrateTotcActionRecapFormats"), true);
    });

    it("wires the item icon migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcItemIcons"), true);
        assert.equal(source.includes("migrateItemIcons: migrateTotcItemIcons"), true);
    });

    it("wires the action tick fragment migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcActionTickFragments"), true);
        assert.equal(source.includes("migrateActionTickFragments: migrateTotcActionTickFragments"), true);
    });

    it("does not restore the legacy repeated startup seeding flag", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("starterContentSeeded"), false);
    });
});
