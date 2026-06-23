import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

// Mock globals before importing MarketFeature
globalThis.foundry = {
    utils: {
        randomID: () => "mock-random-id"
    }
};

globalThis.game = {
    scenes: {
        viewed: {
            id: "scene-1",
            name: "Market Square",
            getFlag: () => ({
                id: "market-123",
                title: "Strange Market",
                summary: "Some narrative summary",
                generatedAt: Date.now(),
                offers: [
                    { id: "off-1", name: "Rifle", type: "weapon", price: 10, stock: 2, currency: "pounds" }
                ]
            }),
            setFlag: () => {}
        }
    },
    actors: {
        contents: []
    },
    user: { id: "user-1", isGM: true },
    system: { id: "turn-of-the-century" }
};

globalThis.canvas = {
    scene: globalThis.game.scenes.viewed,
    tokens: {
        controlled: []
    }
};

// Dynamically import to ensure global mocks are defined before modules load
const { MarketFeature } = await import("../../module/ui/workspace-v2/controllers/market-feature.mjs");

describe("MarketFeature", () => {
    let mockLayoutEngine;
    let mockPanelRegistry;
    let mockStateStore;
    let mockCompendiumCache;
    let renderCalled;
    let announceCalled;

    beforeEach(() => {
        globalThis.game.actors.contents = [
            {
                id: "actor-1",
                name: "Clara",
                isOwner: true,
                system: { economy: { wallet: { gbp: 50 } } },
                items: { contents: [] }
            }
        ];
        renderCalled = false;
        announceCalled = false;

        mockLayoutEngine = {};
        mockPanelRegistry = {};
        mockStateStore = {
            getUserScopedState: () => ({ selectedBuyerActorId: "actor-1" }),
            setUserScopedStatePatch: () => {}
        };
        mockCompendiumCache = {
            getItems: async () => []
        };
    });

    it("initializes with underlying controller", () => {
        const feature = new MarketFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            compendiumCacheController: mockCompendiumCache,
            render: () => { renderCalled = true; },
            announce: () => { announceCalled = true; }
        });

        assert.ok(feature.marketController);
    });

    it("prepares context and populates marketPanel model", async () => {
        const feature = new MarketFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            compendiumCacheController: mockCompendiumCache,
            render: () => { renderCalled = true; },
            announce: () => { announceCalled = true; }
        });

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.marketPanel);
        assert.equal(context.marketPanel.title, "Strange Market");
        assert.equal(context.marketPanel.offers.length, 1);
        assert.equal(context.marketPanel.offers[0].name, "Rifle");
    });

    it("renders market panel correctly and returns undefined for other panels", async () => {
        const feature = new MarketFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            compendiumCacheController: mockCompendiumCache
        });

        const context = {
            marketPanel: {
                hasMarket: true,
                title: "Strange Market",
                summary: "Some narrative summary",
                actors: [{ id: "actor-1", name: "Clara", selected: true }],
                offers: [{ id: "off-1", name: "Rifle", type: "weapon", priceLabel: "10 pounds", stockLabel: "Stock 2", packLabel: "Market Stock", canBuy: true, buyHint: "Buy it" }],
                sellableItems: []
            }
        };

        const marketHtml = feature.render({ id: "market" }, context);
        assert.ok(marketHtml.includes("Strange Market"));
        assert.ok(marketHtml.includes("Rifle"));

        const otherHtml = feature.render({ id: "other-panel" }, context);
        assert.equal(otherHtml, undefined);
    });

    it("wires handlers in bind", () => {
        let wireHandlersCalled = false;
        const feature = new MarketFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            compendiumCacheController: mockCompendiumCache
        });

        feature.marketController.wireHandlers = (root) => {
            assert.equal(root, "mock-root");
            wireHandlersCalled = true;
        };

        feature.bind("mock-root");
        assert.ok(wireHandlersCalled);
    });

    it("delegates generateOfferBoard", async () => {
        let generateOfferBoardCalled = false;
        const feature = new MarketFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            compendiumCacheController: mockCompendiumCache
        });

        feature.marketController.generateOfferBoard = async () => {
            generateOfferBoardCalled = true;
        };

        await feature.generateOfferBoard();
        assert.ok(generateOfferBoardCalled);
    });
});
