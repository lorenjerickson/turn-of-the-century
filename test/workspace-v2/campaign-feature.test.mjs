import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

// Mock globals before importing CampaignFeature
globalThis.foundry = {
    documents: {
        Actor: class ActorMock {
            static async create(data) {
                return {
                    id: "actor-new-123",
                    type: data.type,
                    name: data.name,
                    system: data.system,
                    sheet: { render: () => {} }
                };
            }
        },
        Item: class ItemMock {
            static async create(data) {
                return {
                    id: "item-new-456",
                    type: data.type,
                    name: data.name,
                    system: data.system,
                    sheet: { render: () => {} }
                };
            }
        }
    }
};

globalThis.game = {
    items: {
        contents: [],
        get(id) {
            return this.contents.find(i => i.id === id) || null;
        }
    },
    actors: {
        contents: [],
        get(id) {
            return this.contents.find(a => a.id === id) || null;
        }
    },
    users: [],
    user: { id: "user-1", isGM: true }
};

globalThis.ChatMessage = {
    getWhisperRecipients: () => [],
    getSpeaker: () => ({}),
    create: async () => {}
};

// Dynamically import to ensure global mocks are defined before modules load
const { CampaignFeature } = await import("../../module/ui/workspace-v2/controllers/campaign-feature.mjs");
const { LLMService } = await import("../../module/services/llm-service.mjs");

describe("CampaignFeature", () => {
    let mockLayoutEngine;
    let mockPanelRegistry;
    let renderOptionsPassed;
    let announceMessagePassed;

    beforeEach(() => {
        globalThis.game.items.contents = [
            { id: "camp-1", name: "Campaign One", type: "campaign", system: { scenarios: ["scen-1"] } },
            { id: "scen-1", name: "Scenario One", type: "scenario", system: { campaignId: "camp-1", encounters: [] } },
            { id: "loc-1", name: "Location One", type: "location", system: {} }
        ];
        globalThis.game.actors.contents = [];

        mockLayoutEngine = {
            getLayout: () => ({}),
            restorePanel: (panelDef) => ({})
        };
        mockPanelRegistry = {
            get: (id) => ({ id, defaultDock: "rightDock" })
        };
        renderOptionsPassed = null;
        announceMessagePassed = null;
    });

    it("initializes with default state properties", () => {
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry
        });

        assert.equal(feature.campaignViewState.selectedId, "");
        assert.ok(feature.campaignViewState.expandedIds instanceof Set);
        assert.equal(feature.gmAssistantState.elementType, "campaign");
        assert.equal(feature.gmAssistantState.isGenerating, false);
    });

    it("prepares context for builder, tree view, and GM assistant panels", async () => {
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry
        });

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.campaignBuilderPanel);
        assert.ok(context.scenarioBuilderPanel);
        assert.ok(context.campaignViewPanel);
        assert.ok(context.gmAssistantPanel);

        // Spot check content
        assert.equal(context.campaignBuilderPanel.campaigns.length, 1);
        assert.equal(context.campaignBuilderPanel.campaigns[0].id, "camp-1");
        assert.equal(context.scenarioBuilderPanel.scenarios.length, 1);
        assert.equal(context.scenarioBuilderPanel.scenarios[0].id, "scen-1");
    });

    it("renders registered panels and returns undefined for unknown panel", () => {
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry
        });

        const context = {
            campaignBuilderPanel: { campaigns: [] },
            scenarioBuilderPanel: { scenarios: [] },
            campaignViewPanel: { campaigns: [] },
            gmAssistantPanel: {
                elementType: "campaign",
                prompt: "",
                parentLocationOptions: [],
                options: [],
                actorTypeOptions: [],
                showParentLocationSelector: false,
                showActorTypeSelector: false,
                isGenerating: false,
                result: null,
                error: null
            }
        };

        const htmlCampaignView = feature.render({ id: "campaign-view" }, context);
        assert.match(htmlCampaignView, /totc-v2-campaign-view/);

        const htmlGMAssistant = feature.render({ id: "gm-assistant" }, context);
        assert.match(htmlGMAssistant, /totc-v2-gm-assistant/);

        const htmlUnknown = feature.render({ id: "unknown-panel-id" }, context);
        assert.equal(htmlUnknown, undefined);
    });

    it("wires delegated click listeners on bind", async () => {
        let rerendered = false;
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            render: () => { rerendered = true; }
        });

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (event, handler) => {
                if (event === "click") clickHandlers.push(handler);
            }
        };

        feature.bind(rootElement);

        assert.equal(clickHandlers.length, 1);

        // Test campaign view select click
        const button = {
            dataset: { itemId: "camp-1" },
            closest: (selector) => selector === "[data-action='campaign-view-select']" ? button : null
        };
        const event = {
            target: button,
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        await clickHandlers[0](event);

        assert.equal(feature.campaignViewState.selectedId, "camp-1");
        assert.equal(rerendered, true);
    });

    it("handles inputs and debounces prompt set", async () => {
        let rerendered = false;
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            render: async () => { rerendered = true; }
        });

        const inputHandlers = [];
        const rootElement = {
            addEventListener: (event, handler) => {
                if (event === "input") inputHandlers.push(handler);
            },
            querySelector: () => null
        };

        feature.bind(rootElement);

        assert.equal(inputHandlers.length, 1);

        const input = {
            value: "A mysterious manor in the rain",
            dataset: { action: "gm-assistant-set-prompt" },
            matches: (selector) => selector === "[data-action='gm-assistant-set-prompt']"
        };
        const event = {
            target: input
        };

        inputHandlers[0](event);

        assert.equal(feature.gmAssistantState.prompt, "A mysterious manor in the rain");

        // Wait for debounce timer
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(rerendered, true);
    });

    it("handles generation correctly", async () => {
        let rerendered = false;
        const feature = new CampaignFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            render: () => { rerendered = true; }
        });

        feature.gmAssistantState.prompt = "Create a steampunk workshop";
        feature.gmAssistantState.elementType = "campaign";

        // Mock LLMService.generate
        const oldGenerate = LLMService.generate;
        let generatedPrompt = null;
        LLMService.generate = async (prompt, options) => {
            generatedPrompt = prompt;
            return {
                name: "The Clockwork Refinery",
                description: "A dark workshop with copper pipes.",
                system: {
                    profile: {
                        summary: "Steam and smoke"
                    }
                }
            };
        };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (event, handler) => {
                if (event === "click") clickHandlers.push(handler);
            },
            querySelector: () => null
        };

        feature.bind(rootElement);

        const button = {
            closest: (selector) => selector.includes("gm-assistant-generate") ? button : null
        };
        const event = {
            target: button,
            preventDefault: () => {}
        };

        await clickHandlers[0](event);

        assert.equal(generatedPrompt, "Create a steampunk workshop");
        assert.equal(feature.gmAssistantState.isGenerating, false);
        assert.deepEqual(feature.gmAssistantState.result, {
            name: "The Clockwork Refinery",
            description: "A dark workshop with copper pipes.",
            system: {
                profile: {
                    summary: "Steam and smoke"
                }
            }
        });

        // Restore LLMService.generate
        LLMService.generate = oldGenerate;
    });
});
