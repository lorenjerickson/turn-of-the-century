import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("migration entrypoint wiring", () => {
    it("does not import the removed starter compendium migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcStarterCompendiums"), false);
        assert.equal(source.includes("migrateStarterCompendiums"), false);
    });

    it("does not import runtime sample content seeding", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("./module/sample-content.mjs"), false);
        assert.equal(source.includes("publishTotcSampleCompendiums"), false);
        assert.equal(source.includes("starterContentSeeded"), false);
    });
});
