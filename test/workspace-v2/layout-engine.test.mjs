import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

let idCounter = 0;

beforeEach(() => {
    idCounter = 0;
    globalThis.foundry = {
        utils: {
            deepClone: (value) => structuredClone(value),
            randomID: () => String(++idCounter).padStart(4, "0")
        }
    };
});

async function loadLayoutEngine() {
    const moduleUrl = new URL(`../../module/ui/workspace-v2/layout-engine.mjs?test=${Date.now()}-${idCounter}`, import.meta.url);
    return import(moduleUrl.href);
}

const panelLibrary = Object.freeze([
    { id: "gamemaster", title: "Gamemaster" },
    { id: "map", title: "Map" },
    { id: "chat", title: "Chat and Messages" },
    { id: "tracker", title: "Turn Tracker" },
    { id: "camp", title: "Camp" },
    { id: "player", title: "Player Panel", defaultDock: "rightDock" }
]);

describe("LayoutEngine", () => {
    it("creates a default layout with core docks and one floating panel", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const layout = LayoutEngine.createDefaultLayout({ panels: panelLibrary });

        assert.equal(layout.version, 1);
        assert.equal(layout.root.leftDock.stacks[0].panels[0].id, "gamemaster");
        assert.equal(layout.root.centerDock.stacks[0].panels[0].id, "map");
        assert.equal(layout.root.topDock.stacks[0].panels[0].id, "chat");
        assert.equal(layout.root.bottomDock.stacks[0].panels[0].id, "tracker");
        assert.equal(layout.root.floatingWindows[0].panel.id, "camp");
    });

    it("composes local-center drops as tabs in the target stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stackId = engine.getLayout().root.centerDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-center" }
        );

        const stack = layout.root.centerDock.stacks[0];
        assert.deepEqual(stack.panels.map((panel) => panel.id), ["map", "player"]);
        assert.equal(stack.activePanelId, "player");
    });

    it("stacks local-top drops before the target stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stackId = engine.getLayout().root.centerDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-top" }
        );

        assert.deepEqual(
            layout.root.centerDock.stacks.map((stack) => stack.panels[0].id),
            ["player", "map"]
        );
    });

    it("remembers and restores closed panel locations", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });

        engine.closePanel("map");
        assert.equal(engine.getLayout().root.centerDock.stacks.length, 0);

        const layout = engine.restorePanel({ id: "map", title: "Map" });
        assert.equal(layout.root.centerDock.stacks[0].panels[0].id, "map");
    });

    it("enforces minimum floating window dimensions", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const floatingId = engine.getLayout().root.floatingWindows[0].id;

        const layout = engine.updateFloatingWindow(floatingId, {
            width: 100,
            height: 90
        });

        const floatingWindow = layout.root.floatingWindows[0];
        assert.equal(floatingWindow.width, 240);
        assert.equal(floatingWindow.height, 160);
    });
});
