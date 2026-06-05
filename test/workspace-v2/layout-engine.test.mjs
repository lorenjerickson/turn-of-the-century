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
    { id: "scenes", title: "Scenes", defaultDock: "leftDock" },
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
        assert.deepEqual(layout.root.leftDock.stacks[0].panels.map((panel) => panel.id), ["gamemaster", "scenes"]);
        assert.equal(layout.root.leftDock.stacks[0].activePanelId, "gamemaster");
        assert.deepEqual(layout.root.centerDock.stacks, []);
        assert.equal(layout.root.topDock.stacks[0].panels[0].id, "chat");
        assert.equal(layout.root.bottomDock.stacks[0].panels[0].id, "tracker");
        assert.equal(layout.root.floatingWindows[0].panel.id, "camp");
    });

    it("composes local-center drops as tabs in the target stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const mapLayout = engine.applyDropIntent(
            { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" },
            { kind: "edge", dockId: "centerDock" }
        );
        const stackId = mapLayout.root.centerDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-center" }
        );

        const stack = layout.root.centerDock.stacks[0];
        assert.deepEqual(stack.panels.map((panel) => panel.id), ["map:scene-a", "player"]);
        assert.equal(stack.activePanelId, "player");
    });

    it("preserves multiple scene-specific map panels as separate tabs", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });

        const firstLayout = engine.applyDropIntent(
            { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" },
            { kind: "edge", dockId: "centerDock" }
        );
        const stackId = firstLayout.root.centerDock.stacks[0].id;
        const layout = engine.applyDropIntent(
            { id: "map:scene-b", title: "Hotel Cellar", baseId: "map", sceneId: "scene-b" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-center" }
        );

        const stack = layout.root.centerDock.stacks[0];
        assert.deepEqual(stack.panels.map((panel) => panel.id), ["map:scene-a", "map:scene-b"]);
        assert.deepEqual(stack.panels[0], {
            id: "map:scene-a",
            title: "Station Yard",
            baseId: "map",
            sceneId: "scene-a"
        });
        assert.equal(stack.activePanelId, "map:scene-b");
    });

    it("stacks local-top drops before the target stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const mapLayout = engine.applyDropIntent(
            { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" },
            { kind: "edge", dockId: "centerDock" }
        );
        const stackId = mapLayout.root.centerDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-top" }
        );

        assert.deepEqual(
            layout.root.centerDock.stacks.map((stack) => stack.panels[0].id),
            ["player", "map:scene-a"]
        );
    });

    it("stacks local-left drops before a top dock stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stackId = engine.getLayout().root.topDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "topDock", stackId, zone: "local-left" }
        );

        assert.deepEqual(
            layout.root.topDock.stacks.map((stack) => stack.panels[0].id),
            ["player", "chat"]
        );
    });

    it("stacks local-right drops after a bottom dock stack", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stackId = engine.getLayout().root.bottomDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "bottomDock", stackId, zone: "local-right" }
        );

        assert.deepEqual(
            layout.root.bottomDock.stacks.map((stack) => stack.panels[0].id),
            ["tracker", "player"]
        );
    });

    it("treats vertical zones in horizontal docks as tab composition", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stackId = engine.getLayout().root.topDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "topDock", stackId, zone: "local-top" }
        );

        assert.equal(layout.root.topDock.stacks.length, 1);
        assert.deepEqual(
            layout.root.topDock.stacks[0].panels.map((panel) => panel.id),
            ["chat", "player"]
        );
        assert.equal(layout.root.topDock.stacks[0].activePanelId, "player");
    });

    it("treats horizontal zones in vertical docks as tab composition", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const mapLayout = engine.applyDropIntent(
            { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" },
            { kind: "edge", dockId: "centerDock" }
        );
        const stackId = mapLayout.root.centerDock.stacks[0].id;

        const layout = engine.applyDropIntent(
            { id: "player", title: "Player Panel" },
            { kind: "local", dockId: "centerDock", stackId, zone: "local-left" }
        );

        assert.equal(layout.root.centerDock.stacks.length, 1);
        assert.deepEqual(
            layout.root.centerDock.stacks[0].panels.map((panel) => panel.id),
            ["map:scene-a", "player"]
        );
        assert.equal(layout.root.centerDock.stacks[0].activePanelId, "player");
    });

    it("remembers and restores closed panel locations", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });

        engine.closePanel("chat");
        assert.equal(engine.getLayout().root.topDock.stacks.length, 0);

        const layout = engine.restorePanel({ id: "chat", title: "Chat and Messages" });
        assert.equal(layout.root.topDock.stacks[0].panels[0].id, "chat");
    });

    it("removes deleted scene map panels without remembering them", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });

        engine.applyDropIntent(
            { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" },
            { kind: "edge", dockId: "centerDock" }
        );
        engine.removePanel("map:scene-a");

        const layout = engine.getLayout();
        assert.equal(
            layout.root.centerDock.stacks.some((stack) => stack.panels.some((panel) => panel.id === "map:scene-a")),
            false
        );
        assert.equal(layout.root.panelMemory["map:scene-a"], undefined);
    });

    it("removes generic map panels from persisted layouts", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const layout = LayoutEngine.createDefaultLayout({ panels: panelLibrary });
        layout.root.centerDock.stacks = [{
            id: "stack-old-map",
            panels: [
                { id: "map", title: "Map" },
                { id: "map:scene-a", title: "Station Yard", baseId: "map", sceneId: "scene-a" }
            ],
            activePanelId: "map",
            size: 1
        }];

        const engine = new LayoutEngine({ layout, panels: panelLibrary });
        const stack = engine.getLayout().root.centerDock.stacks[0];

        assert.deepEqual(stack.panels.map((panel) => panel.id), ["map:scene-a"]);
        assert.equal(stack.activePanelId, "map:scene-a");
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

    it("toggles collapsed state only for edge docks", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });

        const collapsed = engine.toggleDockCollapsed("leftDock");
        assert.equal(collapsed.root.leftDock.collapsed, true);

        const expanded = engine.toggleDockCollapsed("leftDock");
        assert.equal(expanded.root.leftDock.collapsed, false);

        const centerLayout = engine.toggleDockCollapsed("centerDock");
        assert.equal(centerLayout.root.centerDock.collapsed, false);
    });

    it("restores a collapsed dock when one of its tab headers is activated", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const engine = new LayoutEngine({ panels: panelLibrary });
        const stack = engine.getLayout().root.leftDock.stacks[0];

        engine.setDockCollapsed("leftDock", true);
        const layout = engine.setActivePanel("leftDock", stack.id, "scenes");

        assert.equal(layout.root.leftDock.collapsed, false);
        assert.equal(layout.root.leftDock.stacks[0].activePanelId, "scenes");
    });

    it("normalizes missing and invalid collapsed flags on persisted layouts", async () => {
        const { LayoutEngine } = await loadLayoutEngine();
        const layout = LayoutEngine.createDefaultLayout({ panels: panelLibrary });
        layout.root.leftDock.collapsed = "yes";
        delete layout.root.rightDock.collapsed;
        layout.root.centerDock.collapsed = true;

        const engine = new LayoutEngine({ layout, panels: panelLibrary });
        const normalized = engine.getLayout();

        assert.equal(normalized.root.leftDock.collapsed, true);
        assert.equal(normalized.root.rightDock.collapsed, false);
        assert.equal(normalized.root.centerDock.collapsed, false);
    });
});
