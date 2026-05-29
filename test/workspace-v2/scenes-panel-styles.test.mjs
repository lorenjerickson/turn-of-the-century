import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

describe("Scenes panel styles", () => {
    it("keeps the scene list in the flexible row below the panel controls", () => {
        const rule = styles.match(/\.turn-of-the-century \.totc-v2-scenes-panel\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(rule, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/);
    });
});
