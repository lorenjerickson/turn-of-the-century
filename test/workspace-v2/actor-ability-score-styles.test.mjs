import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const systemStyles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");
const actorThemeStyles = readFileSync(new URL("../../styles/totc-theme-actor-overrides.css", import.meta.url), "utf8");

function ruleFor(styles, selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\ ", "\\s+");
    return styles.match(new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`))?.[0] ?? "";
}

describe("Actor ability score styles", () => {
    it("renders the ability collection as a wrapping row above the actor sheet main content", () => {
        const sheetBodyRule = ruleFor(systemStyles, ".turn-of-the-century.sheet.actor .sheet-body--sidebar");
        const scoreCollectionRule = ruleFor(systemStyles, ".turn-of-the-century.sheet.actor .totc-ability-scores");

        assert.match(sheetBodyRule, /flex-direction:\s*column;/);
        assert.match(scoreCollectionRule, /flex-direction:\s*row;/);
        assert.match(scoreCollectionRule, /flex-wrap:\s*wrap;/);
    });

    it("uses bordered rectangular boxes with the modifier emphasized in the center", () => {
        const scoreRule = ruleFor(systemStyles, ".turn-of-the-century.sheet.actor .totc-ability-score");
        const modifierRule = ruleFor(systemStyles, ".turn-of-the-century.sheet.actor .totc-ability-score__modifier");

        assert.match(scoreRule, /border:\s*2px solid #3d3926;/);
        assert.match(scoreRule, /border-radius:\s*8px;/);
        assert.match(scoreRule, /flex:\s*1 1 86px;/);
        assert.match(modifierRule, /font-size:\s*1\.8rem;/);
        assert.match(modifierRule, /font-weight:\s*bold;/);
    });

    it("centers the score circle on the bottom border of each box", () => {
        const valueRule = ruleFor(systemStyles, ".turn-of-the-century.sheet.actor .totc-ability-score__value");

        assert.match(valueRule, /position:\s*absolute;/);
        assert.match(valueRule, /bottom:\s*-17px;/);
        assert.match(valueRule, /border-radius:\s*50%;/);
        assert.match(valueRule, /height:\s*34px;/);
        assert.match(valueRule, /width:\s*34px;/);
    });

    it("keeps themed ability ornamentation rectangular and themes the score circle", () => {
        const ornamentRule = ruleFor(actorThemeStyles, "body.totc-system-theme .turn-of-the-century.sheet.actor .totc-ability-score::before");
        const valueRule = ruleFor(actorThemeStyles, "body.totc-system-theme .turn-of-the-century.sheet.actor .totc-ability-score__value");

        assert.match(ornamentRule, /border-radius:\s*5px;/);
        assert.match(valueRule, /border-color:\s*var\(--totc-color-brass\);/);
    });
});
