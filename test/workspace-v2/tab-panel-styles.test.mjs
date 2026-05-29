import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

function ruleFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return styles.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`))?.[0] ?? "";
}

describe("Tab panel styles", () => {
    it("centers tabs and controls within the stack header", () => {
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__header"), /align-items:\s*center;/);
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__tabs"), /align-items:\s*center;/);
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__actions"), /align-self:\s*center;/);
    });

    it("uses a more prominent selected tab border without shifting tab layout", () => {
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__tab"), /border-bottom:\s*4px solid transparent;/);
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__tab.is-active"), /border-bottom-color:\s*#f59e0b;/);
    });

    it("gives tab labels extra bottom padding for vertical balance", () => {
        assert.match(ruleFor(".turn-of-the-century .totc-v2-stack__tab"), /padding:\s*0\.42rem 0\.55rem 0\.68rem;/);
    });
});
