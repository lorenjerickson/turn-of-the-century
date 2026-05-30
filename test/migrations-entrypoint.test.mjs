import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("migration entrypoint wiring", () => {
    it("wires the guarded starter compendium repair migration", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("migrateTotcStarterCompendiums"), true);
    });

    it("does not restore the legacy repeated startup seeding flag", () => {
        const source = readFileSync(new URL("../turn-of-the-century.mjs", import.meta.url), "utf8");

        assert.equal(source.includes("starterContentSeeded"), false);
    });
});
