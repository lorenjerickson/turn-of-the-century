import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

describe("Encounter panel styles", () => {
    it("stacks player encounter subviews vertically while allowing the planner to fill spare height", () => {
        const panelRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel\s*\{[^}]+\}/)?.[0] ?? "";
        const subviewRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__status,\s*\.turn-of-the-century \.totc-v2-encounter-panel__planner,\s*\.turn-of-the-century \.totc-v2-encounter-panel__history\s*\{[^}]+\}/)?.[0] ?? "";
        const plannerRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__planner\s*\{[^}]+\}/)?.[0] ?? "";
        const planningViewRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__planning-view\s*\{[^}]+\}/)?.[0] ?? "";
        const ordersRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__orders\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(panelRule, /display:\s*flex/);
        assert.match(panelRule, /flex-direction:\s*column/);
        assert.doesNotMatch(panelRule, /grid-template-columns/);
        assert.match(subviewRule, /flex:\s*0 0 auto/);
        assert.match(plannerRule, /display:\s*flex/);
        assert.match(plannerRule, /flex:\s*1 1 auto/);
        assert.match(plannerRule, /flex-direction:\s*column/);
        assert.match(plannerRule, /overflow:\s*hidden/);
        assert.match(planningViewRule, /flex:\s*1 1 auto/);
        assert.match(planningViewRule, /position:\s*relative/);
        assert.match(ordersRule, /flex:\s*0 0 auto/);
    });

    it("aligns both current-tick highlights using align-self stretch without positional offsets", () => {
        const panelLine = styles.match(/\.totc-v2-encounter-panel__current-line\s*\{[^}]+\}/)?.[0] ?? "";
        const managerLine = styles.match(/\.totc-v2-encounter-manager__current-line\s*\{[^}]+\}/)?.[0] ?? "";

        // Both use align-self: stretch to fill the segment row height naturally
        assert.match(panelLine, /align-self:\s*stretch/);
        assert.match(managerLine, /align-self:\s*stretch/);

        // Neither should use position:relative or top/bottom hacks
        assert.doesNotMatch(panelLine, /position:\s*relative/);
        assert.doesNotMatch(managerLine, /position:\s*relative/);
        assert.doesNotMatch(panelLine, /\btop:/);
        assert.doesNotMatch(managerLine, /\btop:/);

        // Both match the amber border-box visual style
        assert.match(panelLine, /border:\s*1px solid rgba\(251, 191, 36/);
        assert.match(managerLine, /border:\s*1px solid rgba\(251, 191, 36/);
        assert.match(panelLine, /background:\s*transparent/);
        assert.match(managerLine, /background:\s*transparent/);
    });

    it("hides the player panel current-tick line when the bar reflows to single-column layout", () => {
        assert.match(styles, /\.totc-v2-encounter-panel__current-line\s*\{\s*display:\s*none;\s*\}/);
    });

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

    it("distinguishes GM draft lifecycle states in the encounter manager", () => {
        assert.match(styles, /\.totc-v2-encounter-manager__draft\.is-confirmedAwaitingRolls/);
        assert.match(styles, /\.totc-v2-encounter-manager__draft\.is-locked/);
        assert.match(styles, /\.totc-v2-encounter-manager__actor-ready\.is-awaiting-rolls/);
        assert.match(styles, /\.totc-v2-encounter-manager__draft-state\.is-confirmedAwaitingRolls/);
    });
});
