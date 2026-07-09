export const DOCKVIEW_WORKSPACE_LAYOUT_VERSION = 3;

export const DOCKVIEW_PANEL_COMPONENTS = Object.freeze({
    workspacePanel: "workspace-panel",
    nativeMapAperture: "native-map-aperture"
});

export const DOCKVIEW_DOCK_POSITIONS = Object.freeze({
    leftDock: "left",
    topDock: "top",
    rightDock: "right",
    bottomDock: "bottom"
});

export function isDockviewWorkspaceLayout(layout = null) {
    return Boolean(
        layout?.dockviewWorkspace?.version === DOCKVIEW_WORKSPACE_LAYOUT_VERSION
        && layout.dockviewWorkspace.dockview
        && typeof layout.dockviewWorkspace.dockview === "object"
    );
}

export function getDockviewWorkspaceState(layout = null) {
    return isDockviewWorkspaceLayout(layout) ? layout.dockviewWorkspace : null;
}

export function withDockviewWorkspaceState(layout = null, dockview = null) {
    const base = cloneLayout(layout) ?? {};
    if (!dockview || typeof dockview !== "object") {
        delete base.dockviewWorkspace;
        return base;
    }

    base.dockviewWorkspace = {
        version: DOCKVIEW_WORKSPACE_LAYOUT_VERSION,
        dockview: cloneLayout(dockview)
    };
    return base;
}

export function normalizeDockviewSideEdgeGroupSizes(dockview = null, minimumWidth = 0) {
    const normalized = cloneLayout(dockview);
    const minWidth = Number.isFinite(minimumWidth) ? Math.max(0, minimumWidth) : 0;
    if (!normalized || typeof normalized !== "object" || minWidth <= 0) return normalized;

    for (const position of ["left", "right"]) {
        const edgeGroup = normalized.edgeGroups?.[position];
        if (!edgeGroup || typeof edgeGroup !== "object") continue;
        const currentSize = Number(edgeGroup.size);
        if (!Number.isFinite(currentSize) || currentSize < minWidth) edgeGroup.size = minWidth;
    }

    return normalized;
}

export function isNativeMapPanel(panel = null) {
    const id = String(panel?.id ?? "").trim();
    const baseId = String(panel?.baseId ?? "").trim();
    return baseId === "map" || id === "map" || id.startsWith("map:");
}

export function createDockviewPanelDescriptor(panel = null) {
    if (!panel?.id) return null;
    const nativeMapPanel = isNativeMapPanel(panel);
    return {
        id: String(panel.id),
        title: String(panel.title ?? panel.id),
        component: nativeMapPanel
            ? DOCKVIEW_PANEL_COMPONENTS.nativeMapAperture
            : DOCKVIEW_PANEL_COMPONENTS.workspacePanel,
        // Render inline (not "always"). The "always" render mode wraps the panel
        // in a floating .dv-render-overlay layer outside .dv-groupview, which
        // breaks the aperture transparency selectors and floats an
        // event-capturing surface over the center tabs. The map aperture is an
        // empty div with no DOM state, so inline rendering loses nothing.
        renderer: "onlyWhenVisible",
        params: {
            panel: cloneLayout(panel)
        }
    };
}

export function collectDockviewPanelDescriptors(layout = null) {
    const descriptors = [];
    const seen = new Set();

    for (const dockId of ["centerDock", "leftDock", "topDock", "rightDock", "bottomDock"]) {
        for (const stack of layout?.root?.[dockId]?.stacks ?? []) {
            for (const panel of stack?.panels ?? []) {
                appendDescriptor(descriptors, seen, panel);
            }
        }
    }

    for (const floatingWindow of layout?.root?.floatingWindows ?? []) {
        appendDescriptor(descriptors, seen, floatingWindow?.panel);
    }

    return descriptors;
}

export function getLegacyActiveCenterMapPanel(layout = null) {
    const centerDock = layout?.root?.centerDock;
    for (const stack of centerDock?.stacks ?? []) {
        const activePanel = (stack?.panels ?? []).find((panel) => panel.id === stack.activePanelId) ?? stack?.panels?.[0];
        if (isNativeMapPanel(activePanel)) return activePanel;
    }
    return null;
}

function appendDescriptor(descriptors, seen, panel) {
    const descriptor = createDockviewPanelDescriptor(panel);
    if (!descriptor || seen.has(descriptor.id)) return;
    seen.add(descriptor.id);
    descriptors.push(descriptor);
}

function cloneLayout(value) {
    if (value === null || value === undefined) return value;
    if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(value);
    return JSON.parse(JSON.stringify(value));
}
