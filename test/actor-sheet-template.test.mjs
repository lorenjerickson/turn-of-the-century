import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actorSheetTemplates = [
    "hero-sheet.hbs",
    "pawn-sheet.hbs",
    "villain-sheet.hbs"
].map((fileName) => ({
    fileName,
    source: readFileSync(new URL(`../templates/actors/${fileName}`, import.meta.url), "utf8")
}));

describe("actor sheet templates", () => {
    it("render biography and GM notes as inline HTML rather than editor fields", () => {
        for (const { fileName, source } of actorSheetTemplates) {
            assert.doesNotMatch(source, /{{editor\s+system\.(biography|notes)\b/, fileName);
            assert.match(
                source,
                /<div class="totc-inline-html">\{\{\{system\.biography\}\}\}<\/div>/,
                fileName
            );
            assert.match(
                source,
                /<div class="totc-inline-html totc-inline-html--gm-notes">\{\{\{system\.notes\}\}\}<\/div>/,
                fileName
            );
        }
    });

    it("renders inventory item lists with icon, name, type, and description slots", () => {
        for (const { fileName, source } of actorSheetTemplates) {
            assert.match(source, /<img src="\{\{item\.img\}\}" alt="\{\{item\.name\}\}" \/>/, fileName);
            assert.match(source, /<span class="totc-inventory-item__body">/, fileName);
            assert.match(source, /<strong>\{\{item\.name\}\}<\/strong>/, fileName);
            assert.match(source, /<span>\{\{item\.type\}\}<\/span>/, fileName);
            assert.match(source, /<small>\{\{item\.description\}\}<\/small>/, fileName);
        }
    });
});
