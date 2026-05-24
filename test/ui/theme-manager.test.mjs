import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    TOTC_THEME_CLEAN,
    TOTC_THEME_VICTORIAN,
    applyTotcTheme,
    getTotcThemeBodyClasses,
    normalizeTotcTheme
} from "../../module/ui/theme-manager.mjs";

function makeBody() {
    const classes = new Set();
    return {
        classList: {
            add: (...values) => values.forEach((value) => classes.add(value)),
            remove: (...values) => values.forEach((value) => classes.delete(value)),
            contains: (value) => classes.has(value)
        },
        classes
    };
}

describe("theme manager", () => {
    it("normalizes unknown themes to clean", () => {
        assert.equal(normalizeTotcTheme("victorian"), TOTC_THEME_VICTORIAN);
        assert.equal(normalizeTotcTheme("unknown"), TOTC_THEME_CLEAN);
        assert.equal(normalizeTotcTheme(null), TOTC_THEME_CLEAN);
    });

    it("adds legacy system theme class only for Victorian theme", () => {
        assert.deepEqual(getTotcThemeBodyClasses("clean"), ["totc-theme", "totc-theme-clean"]);
        assert.deepEqual(getTotcThemeBodyClasses("victorian"), ["totc-theme", "totc-theme-victorian", "totc-system-theme"]);
    });

    it("replaces managed body theme classes", () => {
        const body = makeBody();
        body.classList.add("totc-theme", "totc-theme-clean", "unrelated");

        const theme = applyTotcTheme("victorian", { body });

        assert.equal(theme, TOTC_THEME_VICTORIAN);
        assert.equal(body.classList.contains("totc-theme-clean"), false);
        assert.equal(body.classList.contains("totc-theme-victorian"), true);
        assert.equal(body.classList.contains("totc-system-theme"), true);
        assert.equal(body.classList.contains("unrelated"), true);
    });
});
