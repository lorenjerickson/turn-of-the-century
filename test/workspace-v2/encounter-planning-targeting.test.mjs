import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EncounterPlanningFeature } from "../../module/ui/workspace-v2/controllers/encounter-planning-feature.mjs";
import { dieRollRequestManager } from "../../module/die-roll-request-manager.mjs";

function makeActionButton(panel, dataset = {}) {
    return {
        dataset,
        value: dataset.label ?? "Strike",
        closest(selector) {
            if (selector.includes("[data-action='encounter-select-popup-action']")) return this;
            if (selector === ".totc-v2-encounter-panel") return panel;
            return null;
        }
    };
}

function makeConfiguredActionButton(panel, dataset = {}) {
    const config = {
        dataset: {
            remainingAp: dataset.remainingAp ?? "6"
        },
        querySelector(selector) {
            if (selector === "[data-action='encounter-config-target-mode']") return { value: dataset.targetMode ?? "selectTarget" };
            if (selector === "[data-action='encounter-config-positioning-ap']") return { value: dataset.positioningAp ?? "0" };
            if (selector === "[data-action='encounter-config-effect-ap']") return { value: dataset.effectAp ?? dataset.apCost ?? "1" };
            if (selector === "[data-action='encounter-config-ap-cost']") return { value: dataset.apCost ?? "1" };
            if (selector === "[data-action='encounter-config-follow-through']") return { value: "chooseAnotherAction" };
            if (selector === "[data-action='encounter-config-failure-outcome']") return { value: "bestReachablePosition" };
            return null;
        }
    };

    return {
        dataset,
        value: dataset.label ?? "Strike",
        closest(selector) {
            if (selector.includes("[data-action='encounter-confirm-configured-action']")) return this;
            if (selector === ".totc-v2-encounter-config") return config;
            if (selector === ".totc-v2-encounter-panel") return panel;
            return null;
        }
    };
}

async function selectAndConfirmAction(clickHandlers, panel, actionDataset) {
    const clickEvent = {
        preventDefault: () => {},
        stopPropagation: () => {}
    };
    await clickHandlers.at(-1)({
        ...clickEvent,
        target: makeActionButton(panel, actionDataset)
    });
    await clickHandlers.at(-1)({
        ...clickEvent,
        target: makeConfiguredActionButton(panel, actionDataset)
    });
}

describe("EncounterPlanningFeature targeting", () => {
    it("builds Close and Engage draft clauses with a reserved follow-up action budget", async () => {
        let draftPlan = { clauses: [] };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants: new Map(),
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };

        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat
        };
        globalThis.canvas = { scene: null };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { mode: "draftAction", index: 0, remainingAp: 6 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        const clickEvent = {
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        await clickHandlers.at(-1)({
            ...clickEvent,
            target: makeActionButton(panel, {
                id: "pursue",
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                actionIndex: "0",
                apCost: "1",
                apMin: "1",
                apMax: "6",
                variableAp: "true",
                requiresTarget: "true",
                requiresEngagementAction: "true",
                targetingRangeFeet: "10000",
                movementFeetPerAp: "10"
            })
        });

        assert.equal(draftPlan.clauses.length, 1);
        assert.equal(draftPlan.clauses[0].actionId, "pursue");
        assert.equal(draftPlan.clauses[0].apCost, 6);
        assert.equal(draftPlan.clauses[0].requiresEngagementAction, true);

        feature.activePlanEditSlot = {
            mode: "draftEngagementAction",
            index: 0,
            remainingAp: 6
        };

        await clickHandlers.at(-1)({
            ...clickEvent,
            target: makeActionButton(panel, {
                id: "scalpel:precisionStrike",
                actionId: "precisionStrike",
                type: "attack",
                label: "Surgical Scalpel: Precision Strike",
                actionLabel: "Precision Strike",
                actionNarrativeText: "slashes precisely",
                actionIndex: "0",
                apCost: "2",
                apMin: "2",
                apMax: "2",
                requiresToHit: "true",
                requiresTarget: "true",
                itemId: "scalpel",
                itemName: "surgical scalpel",
                targetingRangeFeet: "5",
                rangeType: "melee",
                damageFormula: "1d4"
            })
        });

        const clause = draftPlan.clauses[0];
        assert.equal(clause.engageActionId, "precisionStrike");
        assert.equal(clause.engageActionLabel, "Precision Strike");
        assert.equal(clause.engageActionNarrativeText, "slashes precisely");
        assert.equal(clause.engageActionAp, 2);
        assert.equal(clause.positioningAp, 4);
        assert.equal(clause.itemId, "scalpel");
        assert.equal(clause.itemName, "surgical scalpel");
        assert.equal(clause.targetingRangeFeet, 5);
        assert.equal(clause.rangeType, "melee");
        assert.deepEqual(clause.rollRequirements.map((requirement) => requirement.rollSubType).sort(), ["damage", "toHit"]);
    });

    it("uses remaining draft AP when a Close and Engage clause still has the catalog's 1 AP cost", async () => {
        let draftPlan = {
            apBudget: 6,
            clauses: [{
                clauseId: "draft-clause-1",
                actionId: "pursue",
                type: "movement",
                label: "Close and Engage",
                apCost: 1,
                apMin: 1,
                apMax: 6,
                requiresTarget: true,
                targetId: "target-1",
                targetName: "Mallory",
                requiresEngagementAction: true,
                movementFeetPerAp: 10
            }]
        };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants: new Map(),
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };

        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat
        };
        globalThis.canvas = { scene: null };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.bind(rootElement);
        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        const phrase = {
            dataset: {
                clauseIndex: "0",
                decision: "engagementAction",
                rootDecision: "engagementAction"
            },
            closest(selector) {
                if (selector.includes("[data-action='encounter-narrative-phrase']")) return this;
                if (selector === ".totc-v2-encounter-panel") return panel;
                return null;
            }
        };
        const clickEvent = {
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        await clickHandlers.at(-1)({
            ...clickEvent,
            target: phrase
        });
        assert.equal(feature.activePlanEditSlot.remainingAp, 6);

        await clickHandlers.at(-1)({
            ...clickEvent,
            target: makeActionButton(panel, {
                id: "knife:slash",
                actionId: "slash",
                type: "attack",
                label: "Knife: Slash",
                actionLabel: "Slash",
                actionIndex: "0",
                apCost: "2",
                apMin: "2",
                apMax: "2",
                requiresToHit: "true",
                requiresTarget: "true",
                itemId: "knife",
                itemName: "knife",
                targetingRangeFeet: "5",
                rangeType: "melee",
                damageFormula: "1d4"
            })
        });

        const clause = draftPlan.clauses[0];
        assert.equal(clause.apCost, 6);
        assert.equal(clause.engageActionAp, 2);
        assert.equal(clause.positioningAp, 4);
    });

    it("builds configured intent orders from target mode plus positioning and effect AP", async () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true
        };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: [sourceToken]
        };

        let plan = [];
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan;
            }
        };

        globalThis.document = {
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: {} },
            tokens: { placeables: [sourceToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 3 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        await selectAndConfirmAction(clickHandlers, panel, {
            id: "strike",
            actionId: "strike",
            type: "attack",
            label: "Strike",
            actionIndex: "0",
            apCost: "2",
            apMin: "1",
            apMax: "2",
            requiresToHit: "true",
            rangeType: "normal",
            targetingRangeFeet: "30",
            remainingAp: "3",
            targetMode: "selectTarget",
            positioningAp: "1",
            effectAp: "2"
        });

        assert.equal(plan.length, 1);
        assert.equal(plan[0].apCost, 3);
        assert.equal(plan[0].targetMode, "selectTarget");
        assert.deepEqual(plan[0].apEnvelope, {
            positioningAp: 1,
            effectAp: 2,
            maxAp: 3
        });
        assert.equal(plan[0].positioningRequirement.type, "weaponRange");
        assert.equal(plan[0].positioningRequirement.rangeFeet, 30);
        assert.equal(plan[0].followThrough.type, "chooseAnotherAction");
        assert.equal(plan[0].failureOutcome.type, "bestReachablePosition");
    });

    it("uses the movement overlay to set pending Move destination and protected AP before confirmation", async () => {
        const pointerHandlers = [];
        const highlighted = [];
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 200,
            y: 200,
            width: 1,
            height: 1,
            visible: true,
            updateSource(update) {
                this.x = update.x;
                this.y = update.y;
            }
        };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: [sourceToken]
        };

        let plan = [];
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan;
            },
            removeCombatantAction: async () => {
                throw new Error("pending movement should not remove an uncommitted action");
            }
        };

        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        const canvasView = {
            addEventListener: (type, handler) => {
                if (type === "pointerdown") pointerHandlers.push(handler);
            },
            removeEventListener: () => {},
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
            width: 1000,
            height: 1000
        };
        globalThis.canvas = {
            scene,
            app: { view: canvasView },
            interface: {
                grid: {
                    clearHighlightLayer: () => {},
                    addHighlightLayer: () => {},
                    highlightPosition: (_layer, position) => highlighted.push(position)
                }
            },
            perception: { update: () => {} },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 3 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        const clickEvent = {
            preventDefault: () => {},
            stopPropagation: () => {}
        };
        await clickHandlers.at(-1)({
            ...clickEvent,
            target: makeActionButton(panel, {
                id: "move",
                actionId: "move",
                type: "movement",
                label: "Move",
                actionIndex: "0",
                apCost: "1",
                apMin: "1",
                apMax: "3",
                movementFeetPerAp: "10"
            })
        });

        const overlay = feature.getMovementOverlayState(scene);
        assert.equal(overlay?.active, true);
        assert.equal(overlay.maxAp, 3);
        assert.equal(pointerHandlers.length, 1);
        assert.equal(highlighted.length > 0, true);

        await pointerHandlers[0]({
            button: 0,
            clientX: 450,
            clientY: 250,
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(feature.getMovementOverlayState(scene), null);
        assert.equal(feature.activePlanEditSlot.selectedAction.apCost, 1);
        assert.equal(feature.activePlanEditSlot.selectedAction.movementTargetCol, 4);
        assert.equal(feature.activePlanEditSlot.selectedAction.movementTargetRow, 2);

        await clickHandlers.at(-1)({
            ...clickEvent,
            target: makeConfiguredActionButton(panel, {
                ...feature.activePlanEditSlot.selectedAction,
                actionIndex: "0"
            })
        });

        assert.equal(plan.length, 1);
        assert.equal(plan[0].apCost, 1);
        assert.equal(plan[0].movementFeet, 10);
        assert.equal(plan[0].movementTargetX, 400);
        assert.equal(plan[0].movementTargetY, 200);
        assert.equal(feature.getMovementOverlayState(scene), null);
    });

    it("commits a target from array-backed scene tokens without clearing the action", async () => {
        const pointerHandlers = [];
        const originalPixi = globalThis.PIXI;
        dieRollRequestManager.activeRequests.clear();
        class FakeContainer {
            constructor() {
                this.children = [];
                this.destroyed = false;
                this.parent = null;
            }

            addChild(child) {
                child.parent = this;
                this.children.push(child);
                return child;
            }

            removeChildAt(index) {
                return this.children.splice(index, 1)[0] ?? null;
            }

            destroy() {
                this.destroyed = true;
            }
        }
        class FakeGraphics {
            beginFill() { return this; }
            endFill() { return this; }
            lineStyle() { return this; }
            drawCircle() { return this; }
            drawPolygon() { return this; }
            moveTo() { return this; }
            lineTo() { return this; }
            destroy() { this.destroyed = true; }
        }
        globalThis.PIXI = { Container: FakeContainer, Graphics: FakeGraphics };
        globalThis.document = {
            addEventListener: (type, handler, options) => {
                if (type === "pointerdown" && options?.capture) pointerHandlers.push(handler);
            },
            removeEventListener: () => {}
        };

        const sourceToken = { id: "source-token", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1, visible: true };
        const targetToken = { id: "target-token", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1, visible: true };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: [sourceToken, targetToken]
        };

        let plan = [];
        const sourceActor = {
            id: "source-actor",
            items: {
                get: (id) => id === "pistol" ? { system: { damage: { formula: "1d6", bonus: 2 } } } : null
            }
        };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", name: "Alice", tokenId: "source-token", actor: sourceActor }],
            ["target-combatant", { id: "target-combatant", tokenId: "target-token", actor: { id: "target-actor" } }]
        ]);
        const removed = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan;
            },
            removeCombatantAction: async (_combatantId, actionIndex) => {
                removed.push(actionIndex);
                plan.splice(actionIndex, 1);
            }
        };

        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        const canvasView = {};
        const tokenLayer = {
            placeables: [sourceToken, targetToken],
            children: [],
            addChild(child) {
                child.parent = this;
                this.children.push(child);
                return child;
            }
        };
        globalThis.canvas = {
            scene,
            app: { view: canvasView },
            tokens: tokenLayer,
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({
            render: () => {}
        });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 2 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        await selectAndConfirmAction(clickHandlers, panel, {
            id: "strike",
            actionId: "strike",
            type: "attack",
            label: "Strike",
            actionIndex: "0",
            apCost: "1",
            apMin: "1",
            apMax: "1",
            requiresToHit: "true",
            rangeType: "normal",
            targetingRangeFeet: "30",
            itemId: "pistol"
        });

        assert.equal(feature.hasActiveTargetingInteraction, true);
        assert.equal(plan.length, 1);
        assert.equal(pointerHandlers.length, 1);

        const canvasChild = {};
        canvasView.contains = (target) => target === canvasChild;
        await pointerHandlers[0]({
            target: canvasChild,
            composedPath: () => [canvasChild, canvasView],
            button: 0,
            clientX: 150,
            clientY: 50,
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
        });

        assert.equal(feature.hasActiveTargetingInteraction, false);
        assert.equal(plan.length, 1);
        assert.equal(plan[0].targetId, "target-combatant");
        assert.equal(tokenLayer.children.length, 1);
        assert.equal(tokenLayer.children[0].name, "totc-encounter-target-icons");
        assert.equal(tokenLayer.children[0].children.length, 1);
        globalThis.PIXI = originalPixi;
        const rollRequests = dieRollRequestManager.getAllRequests()
            .filter((request) => request.combatId === "combat-1" && request.combatantId === "source-combatant");
        assert.deepEqual(rollRequests.map((request) => request.rollSubType).sort(), ["damage", "toHit"]);
        assert.equal(rollRequests.find((request) => request.rollSubType === "damage")?.getFormulaFor("gm"), "1d6 + 2");
        assert.deepEqual(removed, []);
        dieRollRequestManager.activeRequests.clear();
    });

    it("commits a target when canvas placeable ids differ from token document ids", async () => {
        const pointerHandlers = [];
        globalThis.document = {
            addEventListener: (type, handler, options) => {
                if (type === "pointerdown" && options?.capture) pointerHandlers.push(handler);
            },
            removeEventListener: () => {}
        };

        const sourceDocument = { id: "source-doc", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1 };
        const targetDocument = { id: "target-doc", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1 };
        const sourcePlaceable = { id: "source-placeable", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1, visible: true, document: sourceDocument };
        const targetPlaceable = { id: "target-placeable", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1, visible: true, document: targetDocument };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: {
                contents: [sourceDocument, targetDocument],
                get: (id) => [sourceDocument, targetDocument].find((token) => token.id === id) ?? null
            }
        };

        let plan = [];
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", token: { document: { id: "source-doc" } }, actor: { id: "source-actor" } }],
            ["target-combatant", { id: "target-combatant", token: { document: { id: "target-doc" } }, actor: { id: "target-actor" } }]
        ]);
        const removed = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan;
            },
            removeCombatantAction: async (_combatantId, actionIndex) => {
                removed.push(actionIndex);
                plan.splice(actionIndex, 1);
            }
        };

        globalThis.game = {
            user: { isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        const canvasView = {};
        globalThis.canvas = {
            scene,
            app: { view: canvasView },
            tokens: { placeables: [sourcePlaceable, targetPlaceable] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 2 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        await selectAndConfirmAction(clickHandlers, panel, {
            id: "strike",
            actionId: "strike",
            type: "attack",
            label: "Strike",
            actionIndex: "0",
            apCost: "1",
            apMin: "1",
            apMax: "1",
            requiresToHit: "true",
            rangeType: "normal",
            targetingRangeFeet: "30"
        });

        assert.equal(feature.hasActiveTargetingInteraction, true);

        await pointerHandlers[0]({
            target: canvasView,
            button: 0,
            clientX: 150,
            clientY: 50,
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
        });

        assert.equal(feature.hasActiveTargetingInteraction, false);
        assert.equal(plan.length, 1);
        assert.equal(plan[0].targetId, "target-combatant");
        assert.deepEqual(removed, []);
    });

    it("retains the planned action when a target click cannot be resolved", async () => {
        const pointerHandlers = [];
        globalThis.document = {
            addEventListener: (type, handler, options) => {
                if (type === "pointerdown" && options?.capture) pointerHandlers.push(handler);
            },
            removeEventListener: () => {}
        };

        const sourceToken = { id: "source-token", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1, visible: true };
        const targetToken = { id: "target-token", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1, visible: true };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: [sourceToken, targetToken]
        };

        let plan = [];
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }],
            ["target-combatant", { id: "target-combatant", tokenId: "target-token", actor: { id: "target-actor" } }]
        ]);
        const removed = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan;
            },
            removeCombatantAction: async (_combatantId, actionIndex) => {
                removed.push(actionIndex);
                plan.splice(actionIndex, 1);
            }
        };

        globalThis.game = {
            user: { isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        const canvasView = {};
        globalThis.canvas = {
            scene,
            app: { view: canvasView },
            tokens: { placeables: [sourceToken, targetToken] }
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 2 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        await selectAndConfirmAction(clickHandlers, panel, {
            id: "follow",
            actionId: "follow",
            type: "movement",
            label: "Follow",
            actionIndex: "0",
            apCost: "1",
            apMin: "1",
            apMax: "1",
            requiresTarget: "true",
            rangeType: "normal",
            targetingRangeFeet: "30"
        });

        assert.equal(feature.hasActiveTargetingInteraction, true);

        await pointerHandlers[0]({
            target: canvasView,
            button: 0,
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
        });

        assert.equal(feature.hasActiveTargetingInteraction, false);
        assert.equal(plan.length, 1);
        assert.equal(plan[0].targetId, undefined);
        assert.deepEqual(removed, []);
    });

    it("commits a target when plan normalization drops requiresTarget", async () => {
        const pointerHandlers = [];
        globalThis.document = {
            addEventListener: (type, handler, options) => {
                if (type === "pointerdown" && options?.capture) pointerHandlers.push(handler);
            },
            removeEventListener: () => {}
        };

        const sourceToken = { id: "source-token", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1, visible: true };
        const targetToken = { id: "target-token", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1, visible: true };
        const scene = {
            id: "scene-1",
            grid: { size: 100, distance: 5 },
            tokens: [sourceToken, targetToken]
        };

        let plan = [];
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }],
            ["target-combatant", { id: "target-combatant", tokenId: "target-token", actor: { id: "target-actor" } }]
        ]);
        const removed = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => plan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                plan = nextPlan.map(({ requiresTarget, ...action }) => action);
            },
            removeCombatantAction: async (_combatantId, actionIndex) => {
                removed.push(actionIndex);
                plan.splice(actionIndex, 1);
            }
        };

        globalThis.game = {
            user: { isGM: true },
            scenes: {
                viewed: scene,
                get: (id) => id === scene.id ? scene : null
            },
            combats: {
                active: combat,
                get: (id) => id === combat.id ? combat : null
            },
            combat,
            actors: { get: () => null }
        };
        const canvasView = {};
        globalThis.canvas = {
            scene,
            app: { view: canvasView },
            tokens: { placeables: [sourceToken, targetToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = { index: 0, startTick: 1, remainingAp: 2 };
        feature.bind(rootElement);

        const panel = {
            dataset: { combatId: combat.id, combatantId: "source-combatant" }
        };
        await selectAndConfirmAction(clickHandlers, panel, {
            id: "follow",
            actionId: "follow",
            type: "movement",
            label: "Follow",
            actionIndex: "0",
            apCost: "1",
            apMin: "1",
            apMax: "1",
            requiresTarget: "true",
            rangeType: "normal",
            targetingRangeFeet: "30"
        });

        assert.equal(feature.hasActiveTargetingInteraction, true);
        assert.equal(plan[0].requiresTarget, undefined);

        await pointerHandlers[0]({
            target: canvasView,
            button: 0,
            clientX: 150,
            clientY: 50,
            preventDefault: () => {},
            stopPropagation: () => {},
            stopImmediatePropagation: () => {}
        });

        assert.equal(feature.hasActiveTargetingInteraction, false);
        assert.equal(plan.length, 1);
        assert.equal(plan[0].targetId, "target-combatant");
        assert.deepEqual(removed, []);
    });

    it("commits draft target selections to the draft plan instead of the committed plan", async () => {
        const sourceToken = { id: "source-token", actorId: "source-actor", x: 0, y: 0, width: 1, height: 1, visible: true };
        const targetToken = { id: "target-token", actorId: "target-actor", x: 100, y: 0, width: 1, height: 1, visible: true };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken, targetToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }],
            ["target-combatant", { id: "target-combatant", tokenId: "target-token", name: "", actor: { id: "target-actor", name: "Mallory" } }]
        ]);
        let draftPlan = {
            apBudget: 6,
            remainingAp: 4,
            clauses: [{ clauseId: "draft-clause-1", actionId: "attack", type: "attack", label: "Attack", apCost: 2, requiresTarget: true }]
        };
        let committedPlan = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => committedPlan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                committedPlan = nextPlan;
            },
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: {} },
            tokens: { placeables: [sourceToken, targetToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature._beginEncounterTargetingInteraction({
            combat,
            combatantId: "source-combatant",
            actionIndex: 0,
            action: draftPlan.clauses[0],
            draftDecision: "target"
        });

        await feature._finishEncounterTargetingInteraction("target-token");

        assert.equal(committedPlan.length, 0);
        assert.equal(draftPlan.clauses[0].targetId, "target-combatant");
        assert.equal(draftPlan.clauses[0].targetName, "Mallory");
        assert.match(feature.lastTargetIconsHash, /target-token:target/);
    });

    it("builds draft target overlays from canvas placeables when scene tokens are unavailable", async () => {
        const sourceToken = {
            id: "source-placeable",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true,
            document: { id: "source-doc", actorId: "source-actor" }
        };
        const targetToken = {
            id: "target-placeable",
            actorId: "target-actor",
            x: 100,
            y: 0,
            width: 1,
            height: 1,
            visible: true,
            document: { id: "target-doc", actorId: "target-actor" }
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-doc", actor: { id: "source-actor" } }],
            ["target-combatant", { id: "target-combatant", tokenId: "target-doc", actor: { id: "target-actor", name: "Mallory" } }]
        ]);
        let draftPlan = {
            apBudget: 6,
            clauses: [{ clauseId: "draft-clause-1", actionId: "attack", type: "attack", label: "Attack", apCost: 2, requiresTarget: true }]
        };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: {} },
            tokens: { placeables: [sourceToken, targetToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature._beginEncounterTargetingInteraction({
            combat,
            combatantId: "source-combatant",
            actionIndex: 0,
            action: draftPlan.clauses[0],
            draftDecision: "target"
        });

        const overlay = feature.getTargetOverlayState(scene);
        assert.equal(overlay.active, true);
        assert.ok(overlay.targetTokenIds.includes("target-placeable"));
        assert.ok(overlay.targetTokenIds.includes("target-doc"));

        await feature._finishEncounterTargetingInteraction("target-doc");

        assert.equal(draftPlan.clauses[0].targetId, "target-combatant");
        assert.equal(draftPlan.clauses[0].targetName, "Mallory");
    });

    it("starts the draft movement overlay immediately after selecting Move", async () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        let draftPlan = { apBudget: 6, clauses: [] };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            setCombatantPlan: async () => {},
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: { addEventListener: () => {}, removeEventListener: () => {} } },
            tokens: { placeables: [sourceToken] },
            interface: { grid: { clearHighlightLayer: () => {}, addHighlightLayer: () => {}, highlightPosition: () => {} } },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = {
            mode: "draftAction",
            index: 0,
            remainingAp: 4
        };
        feature.bind(rootElement);

        const panel = { dataset: { combatId: combat.id, combatantId: "source-combatant" } };
        await clickHandlers.at(-1)({
            target: makeActionButton(panel, {
                id: "move",
                actionId: "move",
                type: "movement",
                label: "Move",
                actionIndex: "0",
                apCost: "1",
                apMin: "1",
                apMax: "1",
                movementFeetPerAp: "10"
            }),
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        const overlay = feature.getMovementOverlayState(scene);
        assert.equal(draftPlan.clauses[0].actionId, "move");
        assert.equal(overlay.active, true);
        assert.equal(overlay.maxAp, 4);
        assert.equal(feature.activePlanEditSlot.mode, "draftMovement");
        assert.equal(feature.activePlanEditSlot.helpText, "Choose a destination on the map.");
    });

    it("commits draft movement destinations to the draft plan with calculated AP", async () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true,
            updateSource(update) {
                this.x = update.x;
                this.y = update.y;
            }
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        let draftPlan = {
            apBudget: 6,
            remainingAp: 5,
            clauses: [{ clauseId: "draft-clause-1", actionId: "move", type: "movement", label: "Move", apCost: 1, movementFeetPerAp: 10, requiresMovementDestination: true }]
        };
        let committedPlan = [];
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => committedPlan,
            setCombatantPlan: async (_combatantId, nextPlan) => {
                committedPlan = nextPlan;
            },
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: {} },
            tokens: { placeables: [sourceToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature._beginEncounterMovementInteraction({
            combat,
            combatantId: "source-combatant",
            actionIndex: 0,
            maxAp: 6,
            feetPerAp: 10,
            draftDecision: "movementDestination"
        });

        await feature._finishEncounterMovementInteraction({
            requiredAp: 3,
            row: 0,
            col: 3,
            left: 300,
            top: 0
        });

        assert.equal(committedPlan.length, 0);
        assert.equal(draftPlan.clauses[0].apCost, 3);
        assert.equal(draftPlan.clauses[0].movementFeet, 30);
        assert.equal(draftPlan.clauses[0].movementTargetX, 300);
    });

    it("anchors draft movement overlays to the projected position before the edited clause", () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        const draftPlan = {
            apBudget: 6,
            remainingAp: 1,
            clauses: [
                { clauseId: "draft-clause-1", actionId: "move", type: "movement", apCost: 2, movementTargetX: 200, movementTargetY: 0 },
                { clauseId: "draft-clause-2", actionId: "move", type: "movement", apCost: 2, movementFeetPerAp: 10, requiresMovementDestination: true },
                { clauseId: "draft-clause-3", actionId: "wait", type: "utility", apCost: 1, durationAp: 1 }
            ]
        };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            getCombatantDraftPlan: () => draftPlan
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: {} },
            tokens: { placeables: [sourceToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature._beginEncounterMovementInteraction({
            combat,
            combatantId: "source-combatant",
            actionIndex: 1,
            maxAp: 3,
            feetPerAp: 10,
            draftDecision: "movementDestination"
        });
        const overlay = feature.getMovementOverlayState(scene);

        assert.equal(overlay.active, true);
        assert.equal(overlay.maxAp, 3);
        assert.equal(overlay.originCell.col, 2);
        assert.equal(overlay.originCell.row, 0);
    });

    it("anchors movement overlays to scene token coordinates instead of stale canvas placeables", () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 200,
            y: 200,
            width: 1,
            height: 1,
            visible: true
        };
        const stalePlaceable = {
            id: "source-token",
            actorId: "source-actor",
            x: 900,
            y: 900,
            width: 1,
            height: 1,
            visible: true
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        const combat = {
            id: "combat-1",
            combatants,
            getCombatantPlan: () => []
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: { addEventListener: () => {}, removeEventListener: () => {} } },
            tokens: { placeables: [stalePlaceable] },
            interface: { grid: { clearHighlightLayer: () => {}, addHighlightLayer: () => {}, highlightPosition: () => {} } },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature._beginEncounterMovementInteraction({
            combat,
            combatantId: "source-combatant",
            actionIndex: 0,
            maxAp: 3,
            feetPerAp: 10
        });
        const overlay = feature.getMovementOverlayState(scene);

        assert.equal(overlay.active, true);
        assert.equal(overlay.originCell.col, 2);
        assert.equal(overlay.originCell.row, 2);
    });

    it("opens completed movement phrases with only the AP available to that draft clause", async () => {
        const sourceToken = {
            id: "source-token",
            actorId: "source-actor",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true
        };
        const scene = { id: "scene-1", grid: { size: 100, distance: 5 }, tokens: [sourceToken] };
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", tokenId: "source-token", actor: { id: "source-actor" } }]
        ]);
        const draftPlan = {
            apBudget: 6,
            spentAp: 5,
            remainingAp: 1,
            clauses: [
                { clauseId: "draft-clause-1", actionId: "move", type: "movement", apCost: 2, movementTargetX: 200, movementTargetY: 0 },
                { clauseId: "draft-clause-2", actionId: "move", type: "movement", apCost: 2, movementFeetPerAp: 10, requiresMovementDestination: true, movementTargetX: 400, movementTargetY: 0 },
                { clauseId: "draft-clause-3", actionId: "wait", type: "utility", apCost: 1, durationAp: 1 }
            ]
        };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            getCombatantDraftPlan: () => draftPlan
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            scenes: { viewed: scene, get: (id) => id === scene.id ? scene : null },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = {
            scene,
            app: { view: { addEventListener: () => {}, removeEventListener: () => {} } },
            tokens: { placeables: [sourceToken] },
            canvasCoordinatesFromClient: (x, y) => ({ x, y })
        };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.bind(rootElement);

        const panel = { dataset: { combatId: combat.id, combatantId: "source-combatant" } };
        const phrase = {
            dataset: {
                decision: "movementDestination",
                rootDecision: "movementDestination",
                clauseIndex: "1"
            },
            closest(selector) {
                if (selector.includes("[data-action='encounter-narrative-phrase']")) return this;
                if (selector === ".totc-v2-encounter-panel") return panel;
                return null;
            }
        };

        await clickHandlers.at(-1)({
            target: phrase,
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        const overlay = feature.getMovementOverlayState(scene);
        assert.equal(overlay.active, true);
        assert.equal(overlay.maxAp, 3);
        assert.equal(overlay.originCell.col, 2);
        assert.equal(feature.activePlanEditSlot.helpText, "Choose a destination on the map.");
    });

    it("opens trailing select-action narrative phrases with the remaining draft AP budget", async () => {
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", actor: { id: "source-actor" } }]
        ]);
        const draftPlan = {
            apBudget: 6,
            clauses: [
                {
                    clauseId: "draft-clause-1",
                    actionId: "move",
                    type: "movement",
                    apCost: 2,
                    movementTargetX: 200,
                    movementTargetY: 0
                }
            ]
        };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            getCombatantDraftPlan: () => draftPlan
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = { scene: null };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.bind(rootElement);

        const panel = { dataset: { combatId: combat.id, combatantId: "source-combatant" } };
        const phrase = {
            dataset: {
                decision: "action",
                rootDecision: "action",
                clauseIndex: "1"
            },
            closest(selector) {
                if (selector.includes("[data-action='encounter-narrative-phrase']")) return this;
                if (selector === ".totc-v2-encounter-panel") return panel;
                return null;
            }
        };

        await clickHandlers.at(-1)({
            target: phrase,
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(feature.activePlanEditSlot.mode, "draftAction");
        assert.equal(feature.activePlanEditSlot.index, 1);
        assert.equal(feature.activePlanEditSlot.startTick, 3);
        assert.equal(feature.activePlanEditSlot.remainingAp, 4);
    });

    it("keeps selected duration-required actions incomplete until a duration is chosen", async () => {
        const combatants = new Map([
            ["source-combatant", { id: "source-combatant", actor: { id: "source-actor" } }]
        ]);
        let draftPlan = { apBudget: 6, clauses: [] };
        const combat = {
            id: "combat-1",
            apBudget: 6,
            combatants,
            getCombatantPlan: () => [],
            getCombatantDraftPlan: () => draftPlan,
            setCombatantDraftPlan: async (_combatantId, nextDraftPlan) => {
                draftPlan = nextDraftPlan;
            }
        };
        globalThis.game = {
            user: { id: "gm", name: "GM", isGM: true },
            combats: { active: combat, get: (id) => id === combat.id ? combat : null },
            combat,
            actors: { get: () => null }
        };
        globalThis.canvas = { scene: null };
        globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

        const clickHandlers = [];
        const rootElement = {
            addEventListener: (type, handler) => {
                if (type === "click") clickHandlers.push(handler);
            }
        };
        const feature = new EncounterPlanningFeature({ render: () => {} });
        feature.activePlanEditSlot = {
            mode: "draftAction",
            index: 0,
            remainingAp: 4
        };
        feature.bind(rootElement);

        const panel = { dataset: { combatId: combat.id, combatantId: "source-combatant" } };
        await clickHandlers.at(-1)({
            target: makeActionButton(panel, {
                id: "follow",
                actionId: "follow",
                type: "movement",
                label: "Follow",
                actionIndex: "0",
                apCost: "1",
                apMin: "1",
                apMax: "4",
                variableAp: "true",
                requiresTarget: "true",
                requiresDuration: "true",
                targetingRangeFeet: "10000",
                movementFeetPerAp: "10"
            }),
            preventDefault: () => {},
            stopPropagation: () => {}
        });

        assert.equal(draftPlan.clauses[0].actionId, "follow");
        assert.equal(draftPlan.clauses[0].requiresDuration, true);
        assert.equal(draftPlan.clauses[0].durationAp, undefined);
        assert.equal(draftPlan.clauses[0].requiresTarget, true);
    });
});
