import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { dieRollRequestManager } from "../../module/die-roll-request-manager.mjs";

// Mock globals before importing RollRequestFeature
globalThis.game = {
    user: { id: "user-1", isGM: true },
    users: {
        contents: [
            { id: "user-1", name: "Alice", isGM: true },
            { id: "user-2", name: "Bob", isGM: false }
        ]
    }
};

globalThis.ui = {
    notifications: {
        warn: (msg) => {
            globalThis.ui.notifications.lastWarn = msg;
        }
    }
};

// Dynamically import RollRequestFeature after setting up globals
const { RollRequestFeature } = await import("../../module/ui/workspace-v2/controllers/roll-request-feature.mjs");

describe("RollRequestFeature", () => {
    let mockLayoutEngine;
    let mockPanelRegistry;
    let mockStateStore;
    let renderCalled;
    let restoredPanelId = null;

    let originalOnChange;
    let originalSendRequest;
    let originalAdjustModifier;
    let originalRollRequestForRecipient;
    let originalSendCancel;
    let originalHasOutstandingRequests;
    let originalGetVisibleRequests;

    let onChangeCallback = null;
    let requestsSent = [];
    let deltaAdjusted = null;
    let rollsExecuted = [];
    let cancelsSent = [];
    let outstanding = false;
    let visibleRequests = [];

    beforeEach(() => {
        globalThis.game.user.isGM = true;
        renderCalled = false;
        restoredPanelId = null;
        requestsSent = [];
        deltaAdjusted = null;
        rollsExecuted = [];
        cancelsSent = [];
        outstanding = false;
        visibleRequests = [];

        mockLayoutEngine = {
            getLayout: () => ({ root: {} }),
            restorePanel: (panelDef) => {
                restoredPanelId = panelDef.id;
                return {};
            }
        };

        mockPanelRegistry = {
            get: (id) => ({ id, defaultDock: "bottomDock" })
        };

        mockStateStore = {
            setUserLayout: async () => {}
        };

        // Stub methods on the singleton dieRollRequestManager
        originalOnChange = dieRollRequestManager.onChange;
        originalSendRequest = dieRollRequestManager.sendRequest;
        originalAdjustModifier = dieRollRequestManager.adjustModifier;
        originalRollRequestForRecipient = dieRollRequestManager.rollRequestForRecipient;
        originalSendCancel = dieRollRequestManager.sendCancel;
        originalHasOutstandingRequests = dieRollRequestManager.hasOutstandingRequests;
        originalGetVisibleRequests = dieRollRequestManager.getVisibleRequests;

        dieRollRequestManager.onChange = (cb) => {
            onChangeCallback = cb;
            return () => { onChangeCallback = null; };
        };
        dieRollRequestManager.sendRequest = (req) => {
            requestsSent.push(req);
        };
        dieRollRequestManager.adjustModifier = (requestId, userId, delta) => {
            deltaAdjusted = { requestId, userId, delta };
        };
        dieRollRequestManager.rollRequestForRecipient = (requestId, userId) => {
            rollsExecuted.push({ requestId, userId });
        };
        dieRollRequestManager.sendCancel = (requestId, options) => {
            cancelsSent.push({ requestId, options });
        };
        dieRollRequestManager.hasOutstandingRequests = () => outstanding;
        dieRollRequestManager.getVisibleRequests = () => visibleRequests;
    });

    afterEach(() => {
        // Restore singleton methods
        dieRollRequestManager.onChange = originalOnChange;
        dieRollRequestManager.sendRequest = originalSendRequest;
        dieRollRequestManager.adjustModifier = originalAdjustModifier;
        dieRollRequestManager.rollRequestForRecipient = originalRollRequestForRecipient;
        dieRollRequestManager.sendCancel = originalSendCancel;
        dieRollRequestManager.hasOutstandingRequests = originalHasOutstandingRequests;
        dieRollRequestManager.getVisibleRequests = originalGetVisibleRequests;
    });

    it("subscribes to dieRollRequestManager and triggers on changes", async () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore,
            render: () => { renderCalled = true; }
        });

        assert.ok(onChangeCallback);

        // Mock a pending request to verify restore panel is triggered
        visibleRequests = [{ isPending: true, hasResult: () => false }];
        
        await onChangeCallback({ type: "other" });

        assert.equal(restoredPanelId, "gamemaster");
        assert.ok(renderCalled);

        feature.dispose();
        assert.equal(onChangeCallback, null);
    });

    it("prepares context with dieRollRequestPanel model", async () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.dieRollRequestPanel);
        assert.equal(context.dieRollRequestPanel.isGM, true);
        assert.equal(context.dieRollRequestPanel.userId, "user-1");
        assert.equal(context.dieRollRequestPanel.users.length, 2);
    });

    it("prepares context with diceRollFeedPanel built from messages and visible requests", async () => {
        globalThis.game.messages = {
            contents: [
                {
                    timestamp: 1000,
                    rolls: [{ formula: "1d20", total: 15, terms: [] }],
                    speaker: { alias: "Alice" },
                    author: { name: "Alice" }
                }
            ]
        };
        visibleRequests = [];

        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const context = {};
        await feature.prepareContext(context);

        assert.ok(context.diceRollFeedPanel, "diceRollFeedPanel should be set on context");
        assert.ok(Array.isArray(context.diceRollFeedPanel.entries), "diceRollFeedPanel should have entries array");

        delete globalThis.game.messages;
    });

    it("renders die-roll-request panel when routed", () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const context = {
            dieRollRequestPanel: {
                request: null,
                requests: [],
                isGM: false,
                userId: "user-2",
                users: []
            }
        };

        const html = feature.render({ id: "die-roll-request" }, context);
        assert.match(html, /totc-v2-die-roll-request-panel/);
        assert.match(html, /No pending die roll requests/);
    });

    it("renders custom inline roll request markup for GM", () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const html = feature.renderRollRequests({
            request: null,
            requests: [],
            isGM: true,
            userId: "user-1",
            users: [{ id: "user-2", name: "Bob", isGM: false }]
        });
        assert.match(html, /totc-v2-die-roll-request-panel__gm-form/);
    });

    it("blocks locked actions under roll lock click handler", () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        const mockElement = {
            listeners: {},
            addEventListener(event, handler, options) {
                this.listeners[event] = handler;
            },
            removeEventListener(event, handler, options) {
                delete this.listeners[event];
            },
            querySelectorAll(query) {
                return [];
            }
        };

        feature.bind(mockElement);
        assert.ok(mockElement.listeners.click);

        // When no outstanding requests, clicks should pass
        outstanding = false;
        let prevented = false;
        let stopped = false;
        const fakeEvent = {
            target: {
                closest: (query) => {
                    if (query === "[data-action]") return { dataset: { action: "gm-create-scene" } };
                    return null;
                }
            },
            preventDefault() { prevented = true; },
            stopPropagation() { stopped = true; }
        };

        mockElement.listeners.click(fakeEvent);
        assert.equal(prevented, false);

        // Under outstanding requests, locked action must be blocked
        outstanding = true;
        mockElement.listeners.click(fakeEvent);
        assert.equal(prevented, true);
        assert.equal(stopped, true);

        // Unlocked action should not be blocked
        prevented = false;
        stopped = false;
        const unlockedEvent = {
            target: {
                closest: (query) => {
                    if (query === "[data-action]") return { dataset: { action: "unlocked-action" } };
                    return null;
                }
            },
            preventDefault() { prevented = true; },
            stopPropagation() { stopped = true; }
        };
        mockElement.listeners.click(unlockedEvent);
        assert.equal(prevented, false);
    });

    it("wires event listeners for buttons and forms on bind", () => {
        const feature = new RollRequestFeature({
            layoutEngine: mockLayoutEngine,
            panelRegistry: mockPanelRegistry,
            stateStore: mockStateStore
        });

        let formSubmitHandler = null;
        let adjustClickHandler = null;
        let rollClickHandler = null;
        let cancelClickHandler = null;

        const mockElement = {
            addEventListener() {},
            querySelectorAll(query) {
                if (query === "[data-action='die-roll-request-create']") {
                    return [{
                        addEventListener(event, handler) {
                            if (event === "submit") formSubmitHandler = handler;
                        }
                    }];
                }
                if (query === "[data-action='die-roll-adjust']") {
                    return [{
                        dataset: { requestId: "req1", delta: "2" },
                        addEventListener(event, handler) {
                            if (event === "click") adjustClickHandler = handler;
                        }
                    }];
                }
                if (query === "[data-action='die-roll-request-roll']") {
                    return [{
                        dataset: { requestId: "req1" },
                        addEventListener(event, handler) {
                            if (event === "click") rollClickHandler = handler;
                        }
                    }];
                }
                if (query === "[data-action='die-roll-request-cancel']") {
                    return [{
                        dataset: { requestId: "req1" },
                        addEventListener(event, handler) {
                            if (event === "click") cancelClickHandler = handler;
                        }
                    }];
                }
                return [];
            }
        };

        feature.bind(mockElement);

        assert.ok(formSubmitHandler);
        assert.ok(adjustClickHandler);
        assert.ok(rollClickHandler);
        assert.ok(cancelClickHandler);

        // Submit form
        let prevented = false;
        const fakeForm = {
            preventDefault() { prevented = true; },
            stopPropagation() {}
        };
        // Mock FormData
        globalThis.FormData = class {
            constructor(form) {}
            get(key) {
                if (key === "recipientId") return "user-2";
                if (key === "label") return "Acrobatics";
                if (key === "rollType") return "attribute-check";
                if (key === "rollMode") return "advantage";
                if (key === "modifier") return "3";
                return null;
            }
        };

        formSubmitHandler(fakeForm);
        assert.equal(prevented, true);
        assert.equal(requestsSent.length, 1);
        assert.equal(requestsSent[0].recipientIds[0], "user-2");
        assert.equal(requestsSent[0].label, "Acrobatics");
        assert.equal(requestsSent[0].rollType, "attribute-check");

        // Click adjust
        adjustClickHandler({ preventDefault() {}, stopPropagation() {} });
        assert.ok(deltaAdjusted);
        assert.equal(deltaAdjusted.requestId, "req1");
        assert.equal(deltaAdjusted.delta, 2);

        // Click roll
        rollClickHandler({ preventDefault() {}, stopPropagation() {} });
        assert.equal(rollsExecuted.length, 1);
        assert.equal(rollsExecuted[0].requestId, "req1");

        // Click cancel
        cancelClickHandler({ preventDefault() {}, stopPropagation() {} });
        assert.equal(cancelsSent.length, 1);
        assert.equal(cancelsSent[0].requestId, "req1");
    });
});
