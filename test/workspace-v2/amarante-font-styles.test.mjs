import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const systemStyles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");
const typographyStyles = readFileSync(new URL("../../styles/totc-theme-typography.css", import.meta.url), "utf8");

describe("Amarante font styles", () => {
    it("imports Amarante from Google Fonts in active stylesheet paths", () => {
        const importRule = /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Amarante&display=swap"\);/;

        assert.match(systemStyles, importRule);
        assert.match(typographyStyles, importRule);
    });

    it("defines the art nouveau serif family with Amarante first", () => {
        assert.match(
            systemStyles,
            /--totc-font-art-nouveau:\s*"Amarante", Georgia, "Times New Roman", serif;/
        );
        assert.match(
            typographyStyles,
            /--totc-font-art-nouveau:\s*"Amarante", Georgia, "Times New Roman", serif;/
        );
    });

    it("uses the shared Amarante family for Victorian decorative labels", () => {
        assert.doesNotMatch(systemStyles, /font-family:\s*Georgia, "Times New Roman", serif;/);
        assert.match(systemStyles, /\.totc-v2-stack__tab\s*\{[^}]*font-family:\s*var\(--totc-font-art-nouveau\);/);
    });
});
