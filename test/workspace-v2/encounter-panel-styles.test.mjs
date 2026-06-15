import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

describe("Encounter panel styles", () => {
    it("styles the search input padding to clear the caret", () => {
        const rule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__picker input\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(rule, /padding:\s*0\.4rem\s+1\.75rem\s+0\.4rem\s+0\.5rem;/);
    });

    it("styles the calendar picker indicator to center and margin-right", () => {
        const rule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__picker input::-webkit-calendar-picker-indicator\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(rule, /cursor:\s*pointer;/);
        assert.match(rule, /vertical-align:\s*middle;/);
        assert.match(rule, /margin-right:\s*0\.25rem;/);
    });
});
