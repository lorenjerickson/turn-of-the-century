import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GamemasterFeature } from "../../module/ui/workspace-v2/controllers/gamemaster-feature.mjs";
import {
    buildEncounterManagerPanelModel,
    renderEncounterManagerPanel
} from "../../module/ui/workspace-v2/panels/encounter-manager-panel.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function combatFixture() {
    return {
        id: "combat-1",
        name: "Rookery Ambush",
        round: 4,
        phase: "roundComplete",
        apBudget: 6,
        initializeEncounterRound: async () => {},
        setEncounterPhase: async () => {},
        resolveEncounterRound: async () => {},
        combatants: {
            contents: [
                {
                    id: "combatant-1",
                    name: "Ada Price",
                    img: "actors/ada.webp",
                    actor: {
                        name: "Ada Price",
                        img: "actors/ada.webp",
                        system: {
                            resources: { health: { value: 8, max: 10 } }
                        },
                        effects: [{ id: "effect-1", name: "Bleeding", disabled: false }]
                    }
                },
                {
                    id: "combatant-2",
                    name: "Brass Knuckles Briggs",
                    actor: {
                        system: {
                            resources: { health: { value: 5, max: 7 } }
                        },
                        effects: []
                    }
                }
            ]
        },
        encounterState: {
            initialized: true,
            phase: "roundComplete",
            round: 4,
            apBudget: 6,
            perCombatant: {
                "combatant-1": {
                    ready: true,
                    plan: [
                        { id: "move", label: "Move", apCost: 2 },
                        { id: "strike", label: "Strike", apCost: 1 }
                    ]
                },
                "combatant-2": {
                    ready: false,
                    plan: [{ id: "hunker", label: "Hunker Down", apCost: 3 }]
                }
            },
            timeline: [
                {
                    slot: 2,
                    combatantId: "combatant-1",
                    action: { id: "move", label: "Move", apStart: 1, apEnd: 2 },
                    outcome: { result: "moved", detail: "Ada Price moves 20 ft." }
                },
                {
                    slot: 3,
                    combatantId: "combatant-2",
                    action: { id: "hunker", label: "Hunker Down", apStart: 1, apEnd: 3 },
                    outcome: { result: "defended", detail: "Briggs hunkers down." }
                }
            ]
        }
    };
}

function resolvingCombatFixture() {
    const combat = combatFixture();
    return {
        ...combat,
        phase: "resolving",
        encounterState: {
            ...combat.encounterState,
            phase: "resolving",
            resolution: {
                status: "paused",
                currentTick: 2,
                totalTicks: 6,
                snapshots: [{ tick: 0 }, { tick: 1 }, { tick: 2 }],
                tickNarratives: []
            }
        },
        stepEncounterResolution: async () => {}
    };
}

describe("encounter manager panel", () => {
    it("renders no active encounter empty state when there is no encounter", () => {
        const model = buildEncounterManagerPanelModel({ combat: null });
        const html = renderEncounterManagerPanel(model, { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-manager is-empty"/);
        assert.match(html, /class="totc-v2-encounter-manager__empty">No active encounter\.<\/div>/);
    });

    it("builds GM actor summaries, current tick, and last AP narrative", () => {
        const model = buildEncounterManagerPanelModel({ combat: combatFixture() });

        assert.equal(model.round, 4);
        assert.equal(model.phase, "roundComplete");
        assert.equal(model.currentTick, 3);
        assert.equal(model.actors.length, 2);
        assert.equal(model.actors[0].name, "Ada Price");
        assert.deepEqual(model.actors[0].conditions, ["Bleeding"]);
        assert.deepEqual(model.actors[0].segments.map((segment) => segment.label), ["Move", "Strike"]);
        assert.equal(model.lastNarrative, "Briggs hunkers down.");
    });

    it("enables second-step controls only during resolving phase", () => {
        const planningModel = buildEncounterManagerPanelModel({ combat: combatFixture() });
        assert.equal(planningModel.canStepPrevious, false);
        assert.equal(planningModel.canStepNext, false);

        const resolvingModel = buildEncounterManagerPanelModel({ combat: resolvingCombatFixture() });
        assert.equal(resolvingModel.canStepPrevious, true);
        assert.equal(resolvingModel.canStepNext, true);
    });

    it("renders stacked actor plan rows with compact status labels, narrative, and lifecycle controls", () => {
        const html = renderEncounterManagerPanel(buildEncounterManagerPanelModel({ combat: combatFixture() }), { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-manager"/);
        assert.match(html, /Round 4/);
        assert.match(html, /<h3>Action Plans<\/h3>/);
        assert.match(html, /class="totc-v2-encounter-manager__actor-plan"/);
        assert.match(html, /class="totc-v2-encounter-manager__actor-ready is-resolved">Resolved<\/span>/);
        assert.match(html, /--totc-current-tick:3/);
        assert.match(html, /data-action="encounter-manager-start-round"/);
        assert.doesNotMatch(html, /turn-order roll/i);
        assert.match(html, /data-action="encounter-manager-set-phase" data-phase="locked"/);
        assert.match(html, /data-action="encounter-manager-resolve-round"/);
        assert.match(html, /class="totc-v2-encounter-manager__progress"/);
        assert.match(html, /data-action="encounter-manager-step-tick" data-direction="-1"/);
        assert.match(html, /data-action="encounter-manager-step-tick" data-direction="1"/);
        assert.match(html, />Prev Second<\/button>/);
        assert.match(html, />Next Second<\/button>/);
        assert.match(html, /Briggs hunkers down\./);
        assert.match(html, /class="totc-v2-encounter-manager__current-line" aria-hidden="true"/);
    });

    it("starts encounters through the GM feature and opens the Encounter Manager panel", async () => {
        let createdWith = null;
        let initialized = false;
        let managerOpened = false;
        let renderCalled = false;
        const feature = new GamemasterFeature({
            getGame: () => ({ user: { isGM: true }, combats: { active: null }, combat: null }),
            getCanvas: () => ({ scene: { id: "scene-1" }, tokens: { controlled: [] } }),
            getUi: () => ({ notifications: { warn() {}, info() {} } }),
            createCombat: async (data) => {
                createdWith = data;
                return {
                    initializeEncounterRound: async () => { initialized = true; }
                };
            },
            openEncounterManager: async () => { managerOpened = true; },
            render: () => { renderCalled = true; }
        });

        await feature.executeAction("gm-start-encounter");

        assert.deepEqual(createdWith, { scene: "scene-1" });
        assert.equal(initialized, true);
        assert.equal(managerOpened, true);
        assert.equal(renderCalled, true);
    });

    it("executes dynamically rendered GM panel actions through delegated click handling", async () => {
        let deleted = false;
        let renderCalled = false;
        let clickHandler = null;
        const combat = {
            id: "combat-1",
            delete: async () => { deleted = true; }
        };
        const feature = new GamemasterFeature({
            getGame: () => ({ user: { isGM: true }, combats: { active: combat }, combat: null }),
            getCanvas: () => ({ scene: { id: "scene-1" }, tokens: { controlled: [] } }),
            getUi: () => ({ notifications: { warn() {}, info() {} } }),
            render: () => { renderCalled = true; }
        });
        const root = {
            addEventListener: (eventName, handler) => {
                if (eventName === "click") clickHandler = handler;
            },
            removeEventListener: () => {}
        };

        feature.bind(root);
        feature.bind(root);

        const button = {
            dataset: { gmActionId: "gm-end-combat" },
            closest: (selector) => selector === "[data-action='gm-execute-action']" ? button : null
        };
        await clickHandler({
            target: button,
            preventDefault() {},
            stopPropagation() {}
        });

        assert.equal(deleted, true);
        assert.equal(renderCalled, true);
    });
});
