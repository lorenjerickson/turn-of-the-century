import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// Set up global environment synchronously before test execution
globalThis.foundry = {
    applications: {
        api: {
            ApplicationV2: class MockApplicationV2 {
                constructor() {
                    this.rendered = false;
                    this.element = null;
                }
                render() {}
                async _onRender(context, options) {}
                close() {
                    return Promise.resolve();
                }
            }
        }
    },
    documents: {
        Actor: class MockActor {},
        Item: class MockItem {},
        Combat: class MockCombat {}
    },
    utils: {
        deepClone: (value) => structuredClone(value)
    }
};

globalThis.Hooks = {
    once: () => {}
};

globalThis.ui = {
    notifications: {
        warn: () => {}
    }
};

globalThis.canvas = {
    scene: null,
    ready: false,
    tokens: { controlled: [] },
    grid: {
        highlightPosition: () => {}
    }
};

globalThis.game = {
    user: { id: "user-1", isGM: true },
    users: [],
    combats: { active: null },
    messages: { contents: [] }
};

globalThis.document = {
    addEventListener: () => {}
};

// Dynamically load the modules to ensure globals are already set
let WorkspaceFeature;
let WorkspaceRootApp;
let WorkspacePanelHost;
let EncounterPlanningFeature;
let SceneDesignFeature;
let ConcreteFeature;

before(async () => {
    const featureModule = await import("../../module/ui/workspace-v2/workspace-feature.mjs");
    WorkspaceFeature = featureModule.WorkspaceFeature;

    const rootAppModule = await import("../../module/ui/workspace-v2/workspace-root-app.mjs");
    WorkspaceRootApp = rootAppModule.WorkspaceRootApp;

    const panelHostModule = await import("../../module/ui/workspace-v2/controllers/workspace-panel-host.mjs");
    WorkspacePanelHost = panelHostModule.WorkspacePanelHost;

    const encounterFeatureModule = await import("../../module/ui/workspace-v2/controllers/encounter-planning-feature.mjs");
    EncounterPlanningFeature = encounterFeatureModule.EncounterPlanningFeature;
    const sceneFeatureModule = await import("../../module/ui/workspace-v2/controllers/scene-design-feature.mjs");
    SceneDesignFeature = sceneFeatureModule.SceneDesignFeature;

    ConcreteFeature = class extends WorkspaceFeature {
        constructor() {
            super();
            this.prepareContextCalled = false;
            this.bindCalled = false;
            this.disposeCalled = false;
            this.renderCalled = false;
        }

        prepareContext(context) {
            this.prepareContextCalled = true;
            context.customData = "feature-data";
        }

        bind(element) {
            this.bindCalled = true;
            this.boundElement = element;
        }

        render(panel, context) {
            this.renderCalled = true;
            if (panel.id === "custom-panel") {
                return `<div class="custom-feature-panel">Custom Content</div>`;
            }
            return undefined;
        }

        dispose() {
            this.disposeCalled = true;
        }
    };
});

describe("WorkspaceFeature and composition shell", () => {
    it("throws a TypeError when trying to instantiate WorkspaceFeature directly", () => {
        assert.throws(() => {
            new WorkspaceFeature();
        }, TypeError, "Cannot instantiate abstract class WorkspaceFeature directly.");
    });

    it("can instantiate a concrete subclass extending WorkspaceFeature", () => {
        const feature = new ConcreteFeature();
        assert.ok(feature instanceof WorkspaceFeature);
        assert.ok(feature instanceof ConcreteFeature);
    });

    it("requires features registered to WorkspaceRootApp to be instances of WorkspaceFeature", () => {
        const app = new WorkspaceRootApp();
        assert.throws(() => {
            app.registerFeature({});
        }, TypeError, "feature must be an instance of WorkspaceFeature");

        const feature = new ConcreteFeature();
        app.registerFeature(feature);
        assert.equal(app.features.at(-1), feature);
        assert.ok(app.features.every((entry) => entry instanceof WorkspaceFeature));
    });

    it("registers encounter planning as a built-in workspace feature", () => {
        const app = new WorkspaceRootApp();
        assert.ok(app.encounterPlanningFeature instanceof EncounterPlanningFeature);
        assert.ok(app.features.includes(app.encounterPlanningFeature));
    });

    it("registers scene design as a built-in workspace feature", () => {
        const app = new WorkspaceRootApp();
        assert.ok(app.sceneDesignFeature instanceof SceneDesignFeature);
        assert.ok(app.features.includes(app.sceneDesignFeature));
    });

    it("lets encounter planning project selected-token state into shared context", () => {
        const actor = { id: "actor-1", name: "Ada" };
        const token = { id: "token-1", actorId: actor.id };
        const scene = { id: "scene-1", tokens: [token] };
        game.actors = { get: (id) => id === actor.id ? actor : null };
        game.scenes = { viewed: scene };
        canvas.scene = scene;
        canvas.tokens.controlled = [];

        const feature = new EncounterPlanningFeature({
            getSelectedTokenIds: () => new Set([token.id])
        });
        const context = {};
        feature.prepareContext(context);

        assert.equal(context.encounterPlannerSelection?.token, token);
        assert.equal(context.selectedEncounterActor, actor);
        assert.equal(context.selectedEncounterToken, token);
        assert.ok(context.playerEncounterPanel);
    });

    it("routes _prepareContext lifecycle event to registered features", async () => {
        const app = new WorkspaceRootApp();
        const feature = new ConcreteFeature();
        app.registerFeature(feature);

        // Minimal mock setup to allow _prepareContext to execute
        app.stateStore = {
            getPolicy: () => ({ enabled: true, debugGovernance: false }),
            getUserLayout: () => ({ root: {} })
        };
        app.compendiumCacheController = {
            getItems: () => Promise.resolve([])
        };

        const context = await app._prepareContext({});
        assert.ok(feature.prepareContextCalled);
        assert.equal(context.customData, "feature-data");
    });

    it("routes _onRender lifecycle event to registered features and binds them to the element", async () => {
        const app = new WorkspaceRootApp();
        const feature = new ConcreteFeature();
        app.registerFeature(feature);

        const mockElement = {
            querySelectorAll: () => [],
            querySelector: () => null,
            addEventListener: () => {}
        };
        app.element = mockElement;

        // Stub/mock internal handlers that _onRender calls
        app.hooksController = { bindAll: () => {} };
        app.sceneWorkspaceController = {
            wireSceneListHandlers: () => {},
            getPanelSceneId: () => "",
            wireScenePropertiesHandlers: () => {}
        };
        app.actorWorkspaceController = { wireHandlers: () => {} };
        app.sceneActorDropController = { wireActorListDragHandlers: () => {} };

        // Execute render hooks
        await app._onRender({}, {});
        assert.ok(feature.bindCalled);
        assert.equal(feature.boundElement, mockElement);
    });

    it("routes close lifecycle event to registered features for disposal", async () => {
        const app = new WorkspaceRootApp();
        const feature = new ConcreteFeature();
        app.registerFeature(feature);

        // Mock internal dependencies of close()
        app.hooksController = { unbindAll: () => {} };
        app.compendiumCacheController = { dispose: () => {} };
        app.sceneActorDropController = { clearDragImage: () => {} };
        app.gridCalibrationController = { close: () => {} };

        await app.close();
        assert.ok(feature.disposeCalled);
    });

    it("delegates panel rendering to registered features in WorkspacePanelHost", () => {
        const feature = new ConcreteFeature();
        const host = new WorkspacePanelHost({
            getFeatures: () => [feature],
            isMapPanel: () => false
        });

        // Test custom feature rendering interception
        const customHtml = host.renderPanelBodyContent({ id: "custom-panel" });
        assert.ok(feature.renderCalled);
        assert.equal(customHtml, `<div class="custom-feature-panel">Custom Content</div>`);

        // Test fallback to default panel rendering when feature returns undefined
        const fallbackHtml = host.renderPanelBodyContent({ id: "non-existent-panel" });
        assert.equal(fallbackHtml, `<div class="totc-v2-panel-placeholder"></div>`);
    });
});
