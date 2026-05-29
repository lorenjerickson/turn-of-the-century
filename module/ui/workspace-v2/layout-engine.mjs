import { WORKSPACE_V2_DOCK_IDS } from "./constants.mjs";

const LOCAL_ZONE_TOP = "local-top";
const LOCAL_ZONE_BOTTOM = "local-bottom";
const LOCAL_ZONE_CENTER = "local-center";

function clone(value) {
    return foundry.utils.deepClone(value);
}

function nextId(prefix) {
    const token = foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 10);
    return `${prefix}-${token}`;
}

function makeEmptyDock(orientation) {
    return {
        orientation,
        collapsed: false,
        stacks: []
    };
}

function makePanelInstance(panelDef) {
    return {
        id: panelDef.id,
        title: panelDef.title,
        ...(panelDef.baseId ? { baseId: panelDef.baseId } : {}),
        ...(panelDef.sceneId ? { sceneId: panelDef.sceneId } : {})
    };
}

function makeStackWithPanel(panelDef) {
    return {
        id: nextId("stack"),
        panels: [makePanelInstance(panelDef)],
        activePanelId: panelDef.id,
        size: 1
    };
}

function makeStackWithPanels(panelDefs, { activePanelId = null } = {}) {
    const panels = panelDefs.filter(Boolean).map(makePanelInstance);
    const activeId = activePanelId && panels.some((panel) => panel.id === activePanelId)
        ? activePanelId
        : panels[0]?.id;

    return {
        id: nextId("stack"),
        panels,
        activePanelId: activeId,
        size: 1
    };
}

function makeFloatingWindow(panelDef, geometry = {}) {
    return {
        id: nextId("float"),
        panel: makePanelInstance(panelDef),
        x: Number.isFinite(geometry.x) ? geometry.x : 80,
        y: Number.isFinite(geometry.y) ? geometry.y : 80,
        width: Number.isFinite(geometry.width) ? geometry.width : 480,
        height: Number.isFinite(geometry.height) ? geometry.height : 360,
        zIndex: Number.isFinite(geometry.zIndex) ? geometry.zIndex : 10,
        lastDock: geometry.lastDock ? { ...geometry.lastDock } : null
    };
}

function makeDefaultDockWeights() {
    return {
        left: 0.18,
        center: 0.46,
        right: 0.18,
        top: 0.18,
        bottom: 0.18
    };
}

function makeDefaultPanelMemory() {
    return {};
}

function isCollapsibleDock(dockId) {
    return dockId && dockId !== "centerDock";
}

function findPanelById(panels, panelId, fallbackIndex = 0) {
    return panels.find((panel) => panel.id === panelId) ?? panels[fallbackIndex] ?? {
        id: "placeholder",
        title: "Workspace"
    };
}

export class LayoutEngine {
    static createDefaultLayout({ panels = [] } = {}) {
        const leftPanel = findPanelById(panels, "gamemaster");
        const scenesPanel = findPanelById(panels, "scenes");
        const topPanel = findPanelById(panels, "chat");
        const centerPanel = findPanelById(panels, "map");
        const rightPanel = findPanelById(panels, "compendium");
        const bottomPanel = findPanelById(panels, "tracker");
        const floatingPanel = findPanelById(panels, "camp");

        return {
            version: 1,
            dockWeights: makeDefaultDockWeights(),
            root: {
                leftDock: {
                    orientation: "vertical",
                    collapsed: false,
                    stacks: [makeStackWithPanels([leftPanel, scenesPanel], { activePanelId: leftPanel.id })]
                },
                topDock: {
                    orientation: "horizontal",
                    collapsed: false,
                    stacks: [makeStackWithPanel(topPanel)]
                },
                centerDock: {
                    orientation: "vertical",
                    collapsed: false,
                    stacks: [makeStackWithPanel(centerPanel)]
                },
                rightDock: {
                    orientation: "vertical",
                    collapsed: false,
                    stacks: [makeStackWithPanel(rightPanel)]
                },
                bottomDock: {
                    orientation: "horizontal",
                    collapsed: false,
                    stacks: [makeStackWithPanel(bottomPanel)]
                },
                floatingWindows: [makeFloatingWindow(floatingPanel, { x: 120, y: 120, width: 420, height: 280, zIndex: 20 })],
                panelMemory: makeDefaultPanelMemory()
            }
        };
    }

    constructor({ layout = null, panels = [] } = {}) {
        this.panels = clone(panels);
        this.layout = this.validate(layout) ?? LayoutEngine.createDefaultLayout({ panels: this.panels });
    }

    setPanels(panels = []) {
        this.panels = clone(panels);
    }

    getLayout() {
        return clone(this.layout);
    }

    setLayout(layout) {
        this.layout = this.validate(layout) ?? LayoutEngine.createDefaultLayout({ panels: this.panels });
        return this.getLayout();
    }

    validate(layout) {
        const candidate = clone(layout);
        if (!candidate || typeof candidate !== "object") return null;
        if (!candidate.root || typeof candidate.root !== "object") return null;

        candidate.dockWeights = this.#normalizeDockWeights(candidate.dockWeights);

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = candidate.root[dockId];
            if (!dock || !Array.isArray(dock.stacks)) {
                return null;
            }
            dock.collapsed = isCollapsibleDock(dockId) ? Boolean(dock.collapsed) : false;
            for (const stack of dock.stacks) {
                if (!stack || typeof stack !== "object") return null;
                if (!Array.isArray(stack.panels)) return null;
                stack.size = Number.isFinite(stack.size) && stack.size > 0 ? stack.size : 1;
            }
        }

        if (!Array.isArray(candidate.root.floatingWindows)) {
            candidate.root.floatingWindows = [];
        } else {
            candidate.root.floatingWindows = candidate.root.floatingWindows
                .filter((window) => window && window.panel?.id)
                .map((window) => ({
                    id: window.id ?? nextId("float"),
                    panel: makePanelInstance(window.panel),
                    x: Number.isFinite(window.x) ? window.x : 80,
                    y: Number.isFinite(window.y) ? window.y : 80,
                    width: Number.isFinite(window.width) ? window.width : 480,
                    height: Number.isFinite(window.height) ? window.height : 360,
                    zIndex: Number.isFinite(window.zIndex) ? window.zIndex : 10,
                    lastDock: this.#normalizeLastDock(window.lastDock)
                }));
        }

        if (!candidate.root.panelMemory || typeof candidate.root.panelMemory !== "object") {
            candidate.root.panelMemory = makeDefaultPanelMemory();
        }

        return candidate;
    }

    applyDropIntent(panelDef, intent = {}) {
        if (!panelDef?.id || !panelDef?.title) return this.getLayout();

        const next = this.getLayout();
        this.#removePanelInstances(next, panelDef.id);

        if (intent.kind === "edge" && intent.dockId) {
            this.#composeIntoEdgeDock(next, panelDef, intent.dockId);
        } else if (intent.kind === "local" && intent.dockId && intent.stackId && intent.zone) {
            this.#composeIntoLocalZone(next, panelDef, intent);
        } else {
            this.#composeIntoEdgeDock(next, panelDef, "centerDock");
        }

        this.layout = next;
        return this.getLayout();
    }

    floatPanel(panelDef, geometry = {}) {
        if (!panelDef?.id || !panelDef?.title) return this.getLayout();

        const next = this.getLayout();
        this.#removePanelInstances(next, panelDef.id);
        next.root.floatingWindows.push(makeFloatingWindow(panelDef, geometry));
        this.layout = next;
        return this.getLayout();
    }

    undockPanel({ dockId, stackId, panelId, geometry = {} } = {}) {
        if (!dockId || !stackId || !panelId) return this.getLayout();

        const next = this.getLayout();
        const dock = next.root[dockId];
        const stack = dock?.stacks?.find((entry) => entry.id === stackId);
        const panel = stack?.panels?.find((entry) => entry.id === panelId);
        if (!dock || !stack || !panel) return this.getLayout();

        stack.panels = stack.panels.filter((entry) => entry.id !== panelId);
        if (!stack.panels.length) {
            dock.stacks = dock.stacks.filter((entry) => entry.id !== stackId);
        } else {
            stack.activePanelId = stack.panels.some((entry) => entry.id === stack.activePanelId)
                ? stack.activePanelId
                : stack.panels[0].id;
        }

        next.root.floatingWindows.push(makeFloatingWindow(panel, {
            ...geometry,
            lastDock: { dockId, stackId }
        }));

        this.layout = next;
        return this.getLayout();
    }

    redockFloatingWindow(windowId) {
        const next = this.getLayout();
        const index = next.root.floatingWindows.findIndex((entry) => entry.id === windowId);
        if (index === -1) return this.getLayout();

        const window = next.root.floatingWindows[index];
        const panelDef = window?.panel;
        if (!panelDef?.id || !panelDef?.title) return this.getLayout();

        next.root.floatingWindows.splice(index, 1);
        this.#composeIntoDockLocation(next, panelDef, window.lastDock);
        this.layout = next;
        return this.getLayout();
    }

    closePanel(panelId) {
        if (!panelId) return this.getLayout();

        const next = this.getLayout();
        this.#rememberPanelLocation(next, panelId);
        this.#removePanelInstances(next, panelId);
        this.layout = next;
        return this.getLayout();
    }

    removePanel(panelId) {
        if (!panelId) return this.getLayout();

        const next = this.getLayout();
        this.#removePanelInstances(next, panelId);
        delete next.root.panelMemory?.[panelId];
        this.layout = next;
        return this.getLayout();
    }

    restorePanel(panelDef, { preferredDockId = null } = {}) {
        if (!panelDef?.id || !panelDef?.title) return this.getLayout();

        const next = this.getLayout();
        const memory = next.root.panelMemory?.[panelDef.id] ?? null;
        this.#removePanelInstances(next, panelDef.id);

        if (memory?.kind === "floating") {
            next.root.floatingWindows.push(makeFloatingWindow(panelDef, {
                x: memory.x,
                y: memory.y,
                width: memory.width,
                height: memory.height,
                zIndex: memory.zIndex,
                lastDock: memory.lastDock
            }));
            this.layout = next;
            return this.getLayout();
        }

        if (memory?.kind === "dock" && memory.dockId) {
            this.#composeIntoDockLocation(next, panelDef, {
                dockId: memory.dockId,
                stackId: memory.stackId
            });
            this.layout = next;
            return this.getLayout();
        }

        if (preferredDockId) {
            this.#composeIntoEdgeDock(next, panelDef, preferredDockId);
            this.layout = next;
            return this.getLayout();
        }

        if (panelDef.defaultDock) {
            this.#composeIntoEdgeDock(next, panelDef, panelDef.defaultDock);
            this.layout = next;
            return this.getLayout();
        }

        next.root.floatingWindows.push(makeFloatingWindow(panelDef));
        this.layout = next;
        return this.getLayout();
    }

    updateFloatingWindow(windowId, patch = {}) {
        const next = this.getLayout();
        const window = next.root.floatingWindows.find((entry) => entry.id === windowId);
        if (!window) return this.getLayout();

        if (Number.isFinite(patch.x)) window.x = patch.x;
        if (Number.isFinite(patch.y)) window.y = patch.y;
        if (Number.isFinite(patch.width)) window.width = Math.max(240, patch.width);
        if (Number.isFinite(patch.height)) window.height = Math.max(160, patch.height);
        if (Number.isFinite(patch.zIndex)) window.zIndex = patch.zIndex;

        this.layout = next;
        return this.getLayout();
    }

    removeFloatingWindow(windowId) {
        const next = this.getLayout();
        const removed = next.root.floatingWindows.find((entry) => entry.id === windowId);
        if (!removed) return this.getLayout();

        next.root.floatingWindows = next.root.floatingWindows.filter((entry) => entry.id !== windowId);
        this.layout = next;
        return this.getLayout();
    }

    setDockWeight(dockId, weight) {
        const next = this.getLayout();
        const normalized = Math.max(0.1, Math.min(0.4, Number(weight) || 0));

        if (dockId === "leftDock") next.dockWeights.left = normalized;
        else if (dockId === "rightDock") next.dockWeights.right = normalized;
        else if (dockId === "topDock") next.dockWeights.top = normalized;
        else if (dockId === "bottomDock") next.dockWeights.bottom = normalized;
        else if (dockId === "centerDock") next.dockWeights.center = normalized;

        this.layout = this.#normalizeLayout(next);
        return this.getLayout();
    }

    setDockCollapsed(dockId, collapsed = false) {
        if (!isCollapsibleDock(dockId)) return this.getLayout();

        const next = this.getLayout();
        const dock = next.root[dockId];
        if (!dock) return this.getLayout();

        dock.collapsed = Boolean(collapsed);
        this.layout = next;
        return this.getLayout();
    }

    toggleDockCollapsed(dockId) {
        if (!isCollapsibleDock(dockId)) return this.getLayout();

        const next = this.getLayout();
        const dock = next.root[dockId];
        if (!dock) return this.getLayout();

        dock.collapsed = !dock.collapsed;
        this.layout = next;
        return this.getLayout();
    }

    setActivePanel(dockId, stackId, panelId) {
        const next = this.getLayout();
        const dock = next.root[dockId];
        if (!dock) return this.getLayout();

        const stack = dock.stacks.find((entry) => entry.id === stackId);
        if (!stack || !stack.panels.some((panel) => panel.id === panelId)) {
            return this.getLayout();
        }

        stack.activePanelId = panelId;
        if (isCollapsibleDock(dockId) && dock.collapsed) dock.collapsed = false;
        this.layout = next;
        return this.getLayout();
    }

    resizeStack(dockId, stackId, delta = 0, trailingStackId = null) {
        const next = this.getLayout();
        const dock = next.root[dockId] ?? next.root.centerDock;
        const stackIndex = dock.stacks.findIndex((stack) => stack.id === stackId);
        if (stackIndex === -1) return this.getLayout();

        const currentStack = dock.stacks[stackIndex];
        const sibling = trailingStackId
            ? dock.stacks.find((stack) => stack.id === trailingStackId)
            : dock.stacks[stackIndex + 1];
        if (!sibling) return this.getLayout();

        const amount = Number(delta) || 0;
        const currentSize = Math.max(0.2, Number(currentStack.size) || 1);
        const siblingSize = Math.max(0.2, Number(sibling.size) || 1);
        currentStack.size = Math.max(0.2, currentSize + amount);
        sibling.size = Math.max(0.2, siblingSize - amount);

        this.layout = next;
        return this.getLayout();
    }

    getDockWeightLayout() {
        const weights = this.layout?.dockWeights ?? makeDefaultDockWeights();
        const centerX = Math.max(0.2, 1 - weights.left - weights.right);
        const centerY = Math.max(0.2, 1 - weights.top - weights.bottom);
        return {
            left: weights.left,
            center: weights.center,
            centerX,
            centerY,
            right: weights.right,
            top: weights.top,
            bottom: weights.bottom
        };
    }

    #composeIntoEdgeDock(layout, panelDef, dockId) {
        const dock = layout.root[dockId] ?? layout.root.centerDock;
        if (!dock.stacks.length) {
            dock.stacks.push(makeStackWithPanel(panelDef));
            if (isCollapsibleDock(dockId)) dock.collapsed = false;
            return;
        }

        const stack = dock.stacks[0];
        stack.panels.push(makePanelInstance(panelDef));
        stack.activePanelId = panelDef.id;
        if (isCollapsibleDock(dockId)) dock.collapsed = false;
    }

    #composeIntoDockLocation(layout, panelDef, location = null) {
        if (!location?.dockId) {
            this.#composeIntoEdgeDock(layout, panelDef, "centerDock");
            return;
        }

        const dock = layout.root[location.dockId] ?? layout.root.centerDock;
        const stack = dock.stacks.find((entry) => entry.id === location.stackId);
        if (stack) {
            stack.panels.push(makePanelInstance(panelDef));
            stack.activePanelId = panelDef.id;
            if (isCollapsibleDock(location.dockId)) dock.collapsed = false;
            return;
        }

        this.#composeIntoEdgeDock(layout, panelDef, location.dockId);
    }

    #composeIntoLocalZone(layout, panelDef, intent) {
        const dock = layout.root[intent.dockId] ?? layout.root.centerDock;
        const stackIndex = dock.stacks.findIndex((stack) => stack.id === intent.stackId);
        if (stackIndex === -1) {
            this.#composeIntoEdgeDock(layout, panelDef, intent.dockId);
            return;
        }

        if (intent.zone === LOCAL_ZONE_CENTER) {
            dock.stacks[stackIndex].panels.push(makePanelInstance(panelDef));
            dock.stacks[stackIndex].activePanelId = panelDef.id;
            if (isCollapsibleDock(intent.dockId)) dock.collapsed = false;
            return;
        }

        const targetIndex = intent.zone === LOCAL_ZONE_TOP ? stackIndex : stackIndex + 1;
        dock.stacks.splice(targetIndex, 0, makeStackWithPanel(panelDef));
        if (isCollapsibleDock(intent.dockId)) dock.collapsed = false;
    }

    #removePanelInstances(layout, panelId) {
        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout.root[dockId];
            const retainedStacks = [];

            for (const stack of dock.stacks) {
                const retainedPanels = stack.panels.filter((panel) => panel.id !== panelId);
                if (!retainedPanels.length) continue;
                retainedStacks.push({
                    ...stack,
                    panels: retainedPanels,
                    activePanelId: retainedPanels.some((panel) => panel.id === stack.activePanelId)
                        ? stack.activePanelId
                        : retainedPanels[0].id
                });
            }

            dock.stacks = retainedStacks;
        }

        layout.root.floatingWindows = (layout.root.floatingWindows ?? []).filter((entry) => entry.panel?.id !== panelId);
    }

    #rememberPanelLocation(layout, panelId) {
        layout.root.panelMemory ??= makeDefaultPanelMemory();

        for (const window of layout.root.floatingWindows ?? []) {
            if (window?.panel?.id !== panelId) continue;
            layout.root.panelMemory[panelId] = {
                kind: "floating",
                x: Number.isFinite(window.x) ? window.x : 80,
                y: Number.isFinite(window.y) ? window.y : 80,
                width: Number.isFinite(window.width) ? window.width : 480,
                height: Number.isFinite(window.height) ? window.height : 360,
                zIndex: Number.isFinite(window.zIndex) ? window.zIndex : 10,
                lastDock: this.#normalizeLastDock(window.lastDock)
            };
            return;
        }

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = layout.root[dockId];
            for (const stack of dock?.stacks ?? []) {
                if (!(stack?.panels ?? []).some((panel) => panel.id === panelId)) continue;
                layout.root.panelMemory[panelId] = {
                    kind: "dock",
                    dockId,
                    stackId: stack.id
                };
                return;
            }
        }
    }

    #normalizeDockWeights(weights = {}) {
        return {
            left: Number.isFinite(weights.left) ? weights.left : 0.18,
            center: Number.isFinite(weights.center) ? weights.center : 0.46,
            right: Number.isFinite(weights.right) ? weights.right : 0.18,
            top: Number.isFinite(weights.top) ? weights.top : 0.18,
            bottom: Number.isFinite(weights.bottom) ? weights.bottom : 0.18
        };
    }

    #normalizeLastDock(lastDock = null) {
        if (!lastDock || typeof lastDock !== "object") return null;
        if (!lastDock.dockId || !lastDock.stackId) return null;

        return {
            dockId: lastDock.dockId,
            stackId: lastDock.stackId
        };
    }

    #normalizeLayout(layout) {
        const validated = this.validate(layout);
        return validated ?? LayoutEngine.createDefaultLayout({ panels: this.panels });
    }
}
