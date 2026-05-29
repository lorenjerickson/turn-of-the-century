import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

describe("Dock collapse styles", () => {
    it("hides stack content when a dock is collapsed", () => {
        assert.match(
            styles,
            /\.turn-of-the-century \.totc-v2-dock\.is-collapsed \.totc-v2-stack__content\s*\{[^}]*display:\s*none;[^}]*\}/
        );
    });

    it("rotates left and right collapsed tab labels toward their dock interiors", () => {
        assert.match(
            styles,
            /\.turn-of-the-century \.totc-v2-dock--leftDock\.is-collapsed \.totc-v2-stack__tab span\s*\{[^}]*transform:\s*rotate\(-90deg\);[^}]*\}/
        );
        assert.match(
            styles,
            /\.turn-of-the-century \.totc-v2-dock--rightDock\.is-collapsed \.totc-v2-stack__tab span\s*\{[^}]*transform:\s*rotate\(90deg\);[^}]*\}/
        );
    });
});
