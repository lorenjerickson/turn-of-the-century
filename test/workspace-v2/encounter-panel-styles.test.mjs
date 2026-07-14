import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const styles = readFileSync(new URL("../../styles/system-styles.css", import.meta.url), "utf8");

describe("Encounter panel styles", () => {
    it("stacks player encounter subviews vertically while allowing the planner to fill spare height", () => {
        const dockviewFullHeightRule = styles.match(/\.turn-of-the-century \.totc-v2-dockview-panel > \.totc-v2-actor-list-panel,[\s\S]*?\.turn-of-the-century \.totc-v2-dockview-panel > \.totc-v2-panel-with-design-lens\s*\{[^}]+\}/)?.[0] ?? "";
        const designLensBodyRule = styles.match(/\.turn-of-the-century \.totc-v2-panel-with-design-lens__body\s*\{[^}]+\}/)?.[0] ?? "";
        const panelRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel\s*\{[^}]+\}/)?.[0] ?? "";
        const subviewRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__status,\s*\.turn-of-the-century \.totc-v2-encounter-panel__planner\s*\{[^}]+\}/)?.[0] ?? "";
        const plannerRule = [...styles.matchAll(/\.turn-of-the-century \.totc-v2-encounter-panel__planner\s*\{[^}]+\}/g)]
            .map((match) => match[0])
            .find((rule) => /display:\s*flex/.test(rule)) ?? "";
        const planningViewRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__planning-view\s*\{[^}]+\}/)?.[0] ?? "";
        const narrativeRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-narrative\s*\{[^}]+\}/)?.[0] ?? "";
        const ordersRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-panel__orders\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(dockviewFullHeightRule, /> \.totc-v2-encounter-panel/);
        assert.match(dockviewFullHeightRule, /> \.totc-v2-panel-with-design-lens/);
        assert.match(dockviewFullHeightRule, /flex:\s*1 1 auto/);
        assert.match(dockviewFullHeightRule, /height:\s*100%/);
        assert.match(dockviewFullHeightRule, /min-height:\s*0/);
        assert.match(designLensBodyRule, /height:\s*100%/);
        assert.match(designLensBodyRule, /min-height:\s*0/);
        assert.match(panelRule, /display:\s*flex/);
        assert.match(panelRule, /flex-direction:\s*column/);
        assert.match(panelRule, /height:\s*100%/);
        assert.match(panelRule, /min-height:\s*0/);
        assert.doesNotMatch(panelRule, /grid-template-columns/);
        assert.match(subviewRule, /flex:\s*0 0 auto/);
        assert.match(plannerRule, /display:\s*flex/);
        assert.match(plannerRule, /flex:\s*1 1 auto/);
        assert.match(plannerRule, /flex-direction:\s*column/);
        assert.match(plannerRule, /overflow:\s*hidden/);
        assert.match(planningViewRule, /flex:\s*1 1 0/);
        assert.match(planningViewRule, /min-height:\s*0/);
        assert.match(planningViewRule, /position:\s*relative/);
        assert.match(narrativeRule, /flex:\s*1 1 0/);
        assert.match(narrativeRule, /justify-content:\s*flex-start/);
        assert.match(narrativeRule, /overflow:\s*auto/);
        assert.match(ordersRule, /flex:\s*0 0 auto/);
        assert.doesNotMatch(styles, /totc-v2-encounter-panel__history/);
    });

    it("aligns the player current-tick highlight using align-self stretch without positional offsets", () => {
        const panelLine = styles.match(/\.totc-v2-encounter-panel__current-line\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(panelLine, /align-self:\s*stretch/);

        assert.doesNotMatch(panelLine, /position:\s*relative/);
        assert.doesNotMatch(panelLine, /\btop:/);

        assert.match(panelLine, /border:\s*1px solid rgba\(251, 191, 36/);
        assert.match(panelLine, /background:\s*transparent/);
        assert.doesNotMatch(styles, /\.totc-v2-encounter-manager__current-line\s*\{/);
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

    it("styles the GM combatant plans as a dense stacked list", () => {
        const actorsRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager__actors\s*\{[^}]+\}/)?.[0] ?? "";
        const actorPlanRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager__actor-plan\s*\{[^}]+\}/)?.[0] ?? "";
        const actorPlanLabelRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager__actor-plan-label\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(actorsRule, /gap:\s*0\.25rem/);
        assert.match(actorPlanRule, /gap:\s*0\.22rem/);
        assert.match(actorPlanRule, /padding:\s*0\.28rem/);
        assert.match(actorPlanLabelRule, /display:\s*grid/);
        assert.match(actorPlanLabelRule, /grid-template-columns:\s*minmax\(0,\s*1fr\) max-content max-content/);
        assert.match(styles, /\.totc-v2-encounter-manager__actor-ready\.is-awaiting-rolls/);
        assert.doesNotMatch(styles, /\.totc-v2-encounter-manager__draft/);
        assert.doesNotMatch(styles, /\.totc-v2-encounter-manager__draft-state/);
    });

    it("keeps GM encounter controls fixed above the scrolling encounter content", () => {
        const dockviewFullHeightRule = styles.match(/\.turn-of-the-century \.totc-v2-dockview-panel > \.totc-v2-actor-list-panel,[\s\S]*?\.turn-of-the-century \.totc-v2-dockview-panel > \.totc-v2-panel-with-design-lens\s*\{[^}]+\}/)?.[0] ?? "";
        const managerRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager\s*\{[^}]+\}/)?.[0] ?? "";
        const controlsRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager__controls\s*\{[^}]+\}/)?.[0] ?? "";
        const scrollRule = styles.match(/\.turn-of-the-century \.totc-v2-encounter-manager__scroll\s*\{[^}]+\}/)?.[0] ?? "";

        assert.match(dockviewFullHeightRule, /> \.totc-v2-encounter-manager/);
        assert.match(managerRule, /display:\s*flex/);
        assert.match(managerRule, /flex-direction:\s*column/);
        assert.match(managerRule, /overflow:\s*hidden/);
        assert.match(controlsRule, /flex:\s*0 0 auto/);
        assert.match(scrollRule, /flex:\s*1 1 auto/);
        assert.match(scrollRule, /min-height:\s*0/);
        assert.match(scrollRule, /overflow:\s*auto/);
    });

    it("styles GM narration as current tick text with linked detail popups", () => {
        assert.match(styles, /\.totc-v2-encounter-manager__tick-narrative\.is-current/);
        assert.match(styles, /\.totc-v2-encounter-manager__tick-label/);
        assert.match(styles, /\.totc-v2-encounter-manager__narrative-link/);
        assert.match(styles, /\.totc-v2-encounter-manager__narrative-detail/);
        assert.match(styles, /\.totc-v2-encounter-manager__last-round/);
        assert.doesNotMatch(styles, /\.totc-v2-encounter-manager__plan\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-encounter-manager__segment\s*\{/);
    });
});
