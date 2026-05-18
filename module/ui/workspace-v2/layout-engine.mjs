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
        stacks: []
    };
}

function makePanelInstance(panelDef) {
    return {
        id: panelDef.id,
        title: panelDef.title
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

export class LayoutEngine {
    static createDefaultLayout({ panels = [] } = {}) {
        const centerDefaultPanel = panels.find((panel) => panel.id === "map") ?? panels[0] ?? {
            id: "placeholder",
            title: "Workspace"
        };

        return {
            version: 1,
            root: {
                leftDock: makeEmptyDock("vertical"),
                topDock: makeEmptyDock("horizontal"),
                centerDock: {
                    orientation: "vertical",
                    stacks: [makeStackWithPanel(centerDefaultPanel)]
                },
                rightDock: makeEmptyDock("vertical"),
                bottomDock: makeEmptyDock("horizontal"),
                floatingWindows: []
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

        for (const dockId of WORKSPACE_V2_DOCK_IDS) {
            const dock = candidate.root[dockId];
            if (!dock || !Array.isArray(dock.stacks)) {
                return null;
            }
            for (const stack of dock.stacks) {
                if (!stack || typeof stack !== "object") return null;
                if (!Array.isArray(stack.panels)) return null;
            }
        }

        if (!Array.isArray(candidate.root.floatingWindows)) {
            candidate.root.floatingWindows = [];
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

    #composeIntoEdgeDock(layout, panelDef, dockId) {
        const dock = layout.root[dockId] ?? layout.root.centerDock;
        if (!dock.stacks.length) {
            dock.stacks.push(makeStackWithPanel(panelDef));
            return;
        }

        const stack = dock.stacks[0];
        stack.panels.push(makePanelInstance(panelDef));
        stack.activePanelId = panelDef.id;
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
            return;
        }

        const targetIndex = intent.zone === LOCAL_ZONE_TOP ? stackIndex : stackIndex + 1;
        dock.stacks.splice(targetIndex, 0, makeStackWithPanel(panelDef));
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
    }
}