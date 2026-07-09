// Behavioral regression tests: instantiate the REAL vendored Dockview under
// jsdom and drive the actual DockviewWorkspaceLayoutFeature end-to-end, so the
// edge-dock sizing contract, empty-edge removal, native-map aperture, and the
// layout-engine -> Dockview reconciliation are verified against real behavior
// rather than by string matching.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { window, makeContainer, flushMicrotasks } from "./helpers/dockview-jsdom.mjs";
import { createDockview, themeDark } from "../../module/vendor/dockview/main.esm.mjs";
import { DockviewWorkspaceLayoutFeature } from "../../module/ui/workspace-v2/controllers/dockview-workspace-layout-feature.mjs";
import {
    DOCKVIEW_PANEL_COMPONENTS,
    isNativeMapPanel,
    withDockviewWorkspaceState
} from "../../module/ui/workspace-v2/dockview-layout-state.mjs";

const rawRenderer = () => {
    const element = window.document.createElement("div");
    return { element, init() {}, update() {}, dispose() {} };
};

const panel = (id) => ({ id });
const mapPanel = (id) => ({ id, baseId: "map" });

const componentFor = (p) => (isNativeMapPanel(p)
    ? DOCKVIEW_PANEL_COMPONENTS.nativeMapAperture
    : DOCKVIEW_PANEL_COMPONENTS.workspacePanel);

// ---- Build a layout-engine model (root docks) from a dock spec ----
function buildModel(docks = {}) {
    const stackFor = (panels, dockId) => ((panels?.length)
        ? { stacks: [{ id: `${dockId}-stack`, activePanelId: panels[0].id, panels }] }
        : { stacks: [] });
    return {
        root: {
            centerDock: stackFor(docks.center, "center"),
            leftDock: stackFor(docks.left, "left"),
            rightDock: stackFor(docks.right, "right"),
            topDock: stackFor(docks.top, "top"),
            bottomDock: stackFor(docks.bottom, "bottom"),
            floatingWindows: []
        }
    };
}

// ---- Build real serialized Dockview geometry matching a dock spec ----
function buildGeometry(docks = {}, { narrow = false } = {}) {
    const host = makeContainer();
    const api = createDockview(host, { theme: themeDark, createComponent: rawRenderer });
    api.layout(1200, 800);

    for (const p of docks.center ?? []) {
        api.addPanel({ id: p.id, component: componentFor(p), params: { panel: p } });
    }
    const addEdge = (position, id, opts, panels) => {
        if (!panels?.length) return;
        const group = api.addEdgeGroup(position, { id, ...opts });
        for (const p of panels) {
            api.addPanel({ id: p.id, component: componentFor(p), params: { panel: p }, position: { referenceGroup: group.id, direction: "within" } });
        }
    };
    addEdge("left", "totc-leftDock", { initialSize: 320, minimumSize: 250, collapsedSize: 44 }, docks.left);
    addEdge("top", "totc-topDock", { initialSize: 180, minimumSize: 120, collapsedSize: 38 }, docks.top);

    api.layout(1200, 800);
    const serialized = api.toJSON();
    api.dispose();
    host.remove();

    if (narrow) {
        if (serialized.edgeGroups?.left) serialized.edgeGroups.left.size = 80;
        if (serialized.edgeGroups?.top) serialized.edgeGroups.top.size = 30;
    }
    return serialized;
}

const layoutFor = (docks, geometryOptions = null) => {
    const model = buildModel(docks);
    return geometryOptions === null
        ? model
        : withDockviewWorkspaceState(model, buildGeometry(docks, geometryOptions));
};

function makeFeature(getLayout, { renderPanelContent = () => "", render = () => {} } = {}) {
    return new DockviewWorkspaceLayoutFeature({
        layoutEngine: { getLayout, closePanel: () => getLayout(), restorePanel: () => getLayout() },
        stateStore: { setUserLayout: async () => {} },
        panelRegistry: { get: () => null },
        panelHost: { renderPanelContent },
        render,
        escapeHTML: (s) => String(s ?? ""),
        isGM: () => false,
        isRollLocked: () => false
    });
}

const mounts = [];
async function mountFeature(initialLayout, options = {}) {
    const ref = { layout: initialLayout };
    const feature = makeFeature(() => ref.layout, options);
    const appEl = window.document.createElement("div");
    window.document.body.appendChild(appEl);

    const render = () => {
        const shell = feature.renderShell({ layout: ref.layout, panelVisibility: [] });
        appEl.replaceChildren(shell);
        feature.bind(appEl);
    };
    render();
    await flushMicrotasks();

    const entry = {
        feature,
        appEl,
        rerender: async (nextLayout) => {
            if (nextLayout) ref.layout = nextLayout;
            render();
            await flushMicrotasks();
        }
    };
    mounts.push(entry);
    return entry;
}

afterEach(() => {
    while (mounts.length) {
        const { feature, appEl } = mounts.pop();
        feature.dispose?.();
        appEl.remove?.();
    }
});

const edgeView = (feature, position) => {
    const shell = feature.dockviewApi?.component?._shellManager;
    return position === "left" ? shell?._leftView : shell?._rightView ?? shell?._topView;
};
const leftEdgeMin = (feature) => feature.dockviewApi?.component?._shellManager?._leftView?._expandedMinimumSize;
const topEdgeMin = (feature) => feature.dockviewApi?.component?._shellManager?._topView?._expandedMinimumSize;
const hasPanel = (feature, id) => Boolean(feature.dockviewApi?.getPanel?.(id));

describe("Dockview edge-dock restore behavior", () => {
    it("restores side and top edge minimum sizes from a stale saved layout", async () => {
        const docks = { center: [panel("center1")], left: [panel("left1")], top: [panel("top1")] };
        const { feature } = await mountFeature(layoutFor(docks, { narrow: true }));

        assert.equal(leftEdgeMin(feature), 250, "left dock keeps 250px minimum");
        assert.equal(topEdgeMin(feature), 120, "top dock keeps 120px minimum");

        const restored = feature.dockviewApi.toJSON();
        assert.ok(restored.edgeGroups.left.size >= 250, `left size clamped, got ${restored.edgeGroups.left.size}`);
        assert.ok(restored.edgeGroups.top.size >= 120, `top size clamped, got ${restored.edgeGroups.top.size}`);
    });

    it("removes an emptied edge group entirely instead of leaving a collapsed strip", async () => {
        const { feature } = await mountFeature(layoutFor({ center: [panel("center1")], left: [panel("left1")], top: [panel("top1")] }));
        assert.ok(feature.dockviewApi.getEdgeGroup("left"), "left edge group present after restore");

        feature.dockviewApi.removePanel(feature.dockviewApi.getPanel("left1"));
        await flushMicrotasks();

        assert.equal(feature.dockviewApi.getEdgeGroup("left"), undefined, "emptied left edge group is removed");
        assert.ok(feature.dockviewApi.getEdgeGroup("top"), "populated top edge group is untouched");
    });

    it("activates the native-map aperture when a map panel is the active center", async () => {
        const { feature, appEl } = await mountFeature(layoutFor({ center: [mapPanel("map:scene1")] }));

        assert.ok(feature.getActiveCenterMapPanel(), "feature reports an active center map panel");
        assert.ok(appEl.querySelector(".totc-workspace-v2-shell").classList.contains("has-native-canvas-aperture"), "shell exposes the canvas aperture");
    });

    it("forces inline rendering when restoring a layout that persisted renderer:'always'", async () => {
        const docks = { center: [mapPanel("map:scene1")] };
        const geometry = buildGeometry(docks);
        // Emulate a pre-fix saved layout: the map panel was serialized as "always".
        geometry.panels["map:scene1"].renderer = "always";
        const layout = withDockviewWorkspaceState(buildModel(docks), geometry);

        const { feature, appEl } = await mountFeature(layout);

        assert.equal(feature.dockviewApi.getPanel("map:scene1").api.renderer, "onlyWhenVisible", "restored map renders inline, not in a floating overlay");
        // No floating render-overlay should hold the map panel.
        assert.equal(appEl.querySelector(".dv-render-overlay"), null, "no dv-render-overlay is created for the map");
    });
});

describe("Dockview layout-engine reconciliation", () => {
    it("adds a scene map to the center on re-render (scene double-click) and opens the aperture", async () => {
        const mounted = await mountFeature(layoutFor({ center: [panel("center1")], left: [panel("left1")] }));
        assert.equal(hasPanel(mounted.feature, "map:scene9"), false, "map not present initially");

        // Simulate openSceneMapPanel: the map is added to the center dock model
        // and activated (first entry in the stack = active tab).
        await mounted.rerender(layoutFor({ center: [mapPanel("map:scene9"), panel("center1")], left: [panel("left1")] }));

        assert.ok(hasPanel(mounted.feature, "map:scene9"), "reconcile added the scene map to the center");
        assert.ok(mounted.feature.getActiveCenterMapPanel(), "map is active and the aperture is open");
        assert.ok(mounted.appEl.querySelector(".totc-workspace-v2-shell").classList.contains("has-native-canvas-aperture"));
    });

    it("removes a panel from Dockview when it leaves the layout model", async () => {
        const mounted = await mountFeature(layoutFor({ center: [panel("center1")], left: [panel("left1")] }));
        assert.ok(hasPanel(mounted.feature, "left1"), "left panel present initially");

        await mounted.rerender(layoutFor({ center: [panel("center1")] }));

        assert.equal(hasPanel(mounted.feature, "left1"), false, "reconcile removed the closed panel");
        assert.equal(mounted.feature.dockviewApi.getEdgeGroup("left"), undefined, "and cleaned up its empty edge group");
    });

    it("does not revert a center tab the user switched directly in Dockview", async () => {
        const docks = { center: [panel("a"), panel("b")] };
        const mounted = await mountFeature(layoutFor(docks));
        assert.equal(mounted.feature.dockviewApi.getPanel("a").api.isActive, true, "first center panel active initially");

        // User clicks the other tab in Dockview (model still marks "a" active).
        mounted.feature.dockviewApi.getPanel("b").api.setActive();
        await mounted.rerender();

        assert.equal(mounted.feature.dockviewApi.getPanel("b").api.isActive, true, "user's tab choice survives re-render");
        assert.equal(mounted.feature.dockviewApi.getPanel("a").api.isActive, false);
    });

    it("refreshes the content of existing panels on re-render", async () => {
        const state = { value: "before" };
        const renderPanelContent = (p) => (p?.id === "scenes" ? `<div class="marker">${state.value}</div>` : "");
        const mounted = await mountFeature(layoutFor({ center: [panel("center1")], left: [panel("scenes")] }), { renderPanelContent });
        const marker = () => mounted.appEl.querySelector('[data-panel-id="scenes"] .marker')?.textContent;
        assert.equal(marker(), "before");

        state.value = "after";
        await mounted.rerender();

        assert.equal(marker(), "after", "panel body is re-rendered, not left stale");
    });

    it("keeps one live Dockview instance across re-renders and preserves edge sizes", async () => {
        const docks = { center: [panel("center1")], left: [panel("left1")] };
        const mounted = await mountFeature(layoutFor(docks, {}));
        const instance = mounted.feature.dockviewApi;
        assert.equal(leftEdgeMin(mounted.feature), 250);

        await mounted.rerender();

        assert.equal(mounted.feature.dockviewApi, instance, "Dockview is reconciled, not torn down and rebuilt");
        assert.equal(leftEdgeMin(mounted.feature), 250, "edge constraints survive the re-render");
        assert.ok(hasPanel(mounted.feature, "left1"));
    });
});
