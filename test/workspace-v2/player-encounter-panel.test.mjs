import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
    buildPlayerEncounterPanelModel,
    renderPlayerEncounterPanel
} from "../../module/ui/workspace-v2/panels/player-encounter-panel.mjs";

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const encounterPlanningFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/encounter-planning-feature.mjs"), "utf8");
const workspaceEncounterSource = `${workspaceRootSource}\n${encounterPlanningFeatureSource}`;

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function actorFixture() {
    return {
        id: "actor-1",
        name: "Ada Price",
        type: "hero",
        img: "actors/ada.webp",
        system: {
            resources: {
                health: { value: 7, max: 10 },
                grit: { value: 3, max: 4 }
            },
            defenses: { defenseRating: 13 }
        },
        effects: [
            { id: "effect-2", name: "Bleeding", disabled: false },
            { id: "effect-1", name: "Hidden", disabled: true }
        ]
    };
}

function plannerFixture() {
    return {
        combatId: "combat-1",
        combatantId: "combatant-1",
        encounterName: "Rookery Ambush",
        phase: "planning",
        round: 3,
        apBudget: 6,
        remainingAp: 3,
        plannedAp: 3,
        planningTimeDisplay: "38s",
        canEditPlan: true,
        canCommit: true,
        ready: false,
        availableActions: [
            { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 4, variableAp: true, movementFeetPerAp: 10, rangeType: "melee" },
            { id: "strike", actionId: "strike", type: "attack", label: "Strike", apCost: 2, apMin: 2, apMax: 2, requiresToHit: true, toHitBonus: 5, rangeType: "normal" }
        ],
        queue: [
            {
                id: "move",
                actionId: "move",
                type: "movement",
                label: "Move",
                apCost: 2,
                apMin: 1,
                apMax: 4,
                variableAp: true,
                movementFeetPerAp: 10,
                rangeType: "melee",
                summary: "Spend 2 AP moving toward the selected location.",
                apEnvelope: { positioningAp: 0, effectAp: 2, maxAp: 2 },
                clauses: [{ clauseId: "move", clauseType: "movement", text: "move toward the selected location" }]
            },
            {
                id: "strike",
                actionId: "strike",
                type: "attack",
                label: "Strike",
                apCost: 1,
                apMin: 1,
                apMax: 1,
                rangeType: "normal",
                summary: "Spend 1 AP to attack Elias Vane with Clockmaker's Stiletto.",
                apEnvelope: { positioningAp: 0, effectAp: 1, maxAp: 1 },
                clauses: [{ clauseId: "strike", clauseType: "effect", text: "attack Elias Vane" }]
            }
        ]
    };
}

describe("player encounter panel", () => {
    it("builds a player status, action picker, plan bar, and resolved history model", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: {
                apBudget: 6,
                encounterState: {
                    round: 2,
                    resolution: {
                        currentTick: 2,
                        status: "running"
                    },
                    roundHistory: [
                        {
                            round: 1,
                            timeline: [
                                { combatantId: "combatant-1", slot: 1, action: { id: "watch", label: "Watch", apStart: 1, apEnd: 1 }, outcome: { result: "ready" } }
                            ]
                        }
                    ],
                    timeline: [
                        { combatantId: "combatant-1", slot: 1, action: { id: "move", label: "Move", apStart: 1, apEnd: 2 }, outcome: { result: "advanced" } },
                        { combatantId: "combatant-2", slot: 3, action: { id: "watch", label: "Watch", apStart: 3, apEnd: 3 } }
                    ]
                }
            }
        });

        assert.equal(model.status.name, "Ada Price");
        assert.equal(model.status.health.value, 7);
        assert.equal(model.status.defenseRating, 13);
        assert.deepEqual(model.status.effects.map((effect) => effect.name), ["Bleeding"]);
        assert.equal(model.availableActions.length, 2);
        assert.equal(model.plannedActions[0].span, 2);
        assert.equal(model.plannedActions[0].summary, "Spend 2 AP moving toward the selected location.");
        assert.equal(model.plannedActions[1].apEnvelope.maxAp, 1);
        assert.equal(model.currentTick, 2);
        assert.equal(model.historyRows.length, 2);
        assert.equal(model.historyRows[0].segments[0].label, "Move");
        assert.equal(model.historyRows[0].segments[0].span, 2);
        assert.equal(model.historyRows[1].segments[0].label, "Watch");
    });

    it("renders searchable actions, draggable plan segments, resize handles, and history bars", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: {
                encounterState: {
                    round: 2,
                    timeline: [
                        { combatantId: "combatant-1", action: { id: "strike", label: "Strike", apStart: 2, apEnd: 2 }, outcome: { result: "hit" } }
                    ]
                }
            }
        });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-panel"/);
        assert.match(html, /data-combat-id="combat-1" data-combatant-id="combatant-1"/);
        assert.match(html, /class="totc-v2-encounter-panel__segment is-empty"[^>]*data-action="encounter-edit-plan-slot"/);
        assert.match(html, /class="totc-v2-encounter-panel__planning-view"[\s\S]*class="totc-v2-encounter-panel__bar"/);
        assert.ok(
            html.indexOf("totc-v2-encounter-panel__planning-view") < html.indexOf("totc-v2-encounter-panel__orders"),
            "planning workspace should render before the order summary"
        );
        assert.match(html, /class="totc-v2-encounter-panel__orders"/);
        assert.match(html, /Spend 2 AP moving toward the selected location\./);
        assert.match(html, /Spend 1 AP to attack Elias Vane with Clockmaker's Stiletto\./);
        assert.match(html, /data-action="encounter-plan-segment"[\s\S]*draggable="true"/);
        assert.match(html, /data-action="encounter-resize-action"[\s\S]*data-action-index="0"/);
        assert.match(html, /data-action="encounter-remove-action"[\s\S]*data-action-index="1"/);
        assert.match(html, /data-action="encounter-clear-plan"[\s\S]*>Clear Unlocked<\/button>/);
        assert.match(html, /data-action="encounter-toggle-ready"[\s\S]*aria-pressed="false"[\s\S]*>Ready<\/button>/);
        assert.match(html, /class="totc-v2-encounter-panel__progress"/);
        assert.match(html, /class="totc-v2-encounter-panel__current-line"/);
        assert.match(html, /class="totc-v2-encounter-panel__history-bar"/);
        assert.match(html, /Strike/);
    });

    it("disables Clear Plan when there are no planned actions to clear", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: {
                ...plannerFixture(),
                queue: [],
                canEditPlan: true
            },
            combat: null
        });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action="encounter-clear-plan" disabled>Clear Unlocked<\/button>/);
    });

    it("renders accepted-roll actions as locked and only permits later actions to be edited", () => {
        const planner = plannerFixture();
        planner.queue[0].planningLocked = true;
        const model = buildPlayerEncounterPanelModel({ actor: actorFixture(), planner, combat: null });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.equal(model.lockedThroughIndex, 0);
        assert.equal(model.plannedActions[0].editable, false);
        assert.equal(model.plannedActions[1].editable, true);
        assert.match(html, /data-action="encounter-locked-plan-segment"[\s\S]*fa-lock/);
        assert.doesNotMatch(html, /data-action="encounter-locked-plan-segment"[^>]*draggable="true"/);
        assert.match(html, /data-action="encounter-plan-segment"[\s\S]*data-action-index="1"/);
    });

    it("shows no active encounter when selected actor is not in combat", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: null,
            combat: {
                id: "combat-1",
                name: "Rookery Ambush",
                round: 2,
                phase: "planning"
            }
        });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.equal(model.activeEncounter, false);
        assert.match(html, /class="totc-v2-encounter-panel is-empty"/);
        assert.match(html, /class="totc-v2-encounter-panel__empty">No active encounter\.<\/div>/);
    });

    it("renders available actions in the popup modal filtered by remaining AP", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                index: 2,
                startTick: 6,
                remainingAp: 1
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-popup-overlay"/);
        assert.match(html, /class="totc-v2-encounter-popup"/);
        assert.ok(
            html.indexOf("totc-v2-encounter-panel__planning-view") < html.indexOf("totc-v2-encounter-popup-overlay"),
            "action picker should be inside the growable planning workspace"
        );
        assert.match(html, /Add Action \(Tick 6, Max 1 AP\)/);
        assert.match(html, /data-action="encounter-select-popup-action"[^>]*data-action-id="move"[^>]*data-range-type="melee"/);
        assert.doesNotMatch(html, /data-action="encounter-select-popup-action"[^>]*data-action-id="strike"/);
    });

    it("renders selected action configuration inline below the action plan", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                index: 2,
                startTick: 4,
                remainingAp: 3,
                selectedAction: {
                    id: "strike",
                    actionId: "strike",
                    type: "attack",
                    label: "Strike",
                    apCost: 2,
                    apMin: 1,
                    apMax: 3,
                    requiresToHit: true,
                    rangeType: "melee"
                }
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.equal(model.activePlanEditSlot.selectedAction.apCost, 2);
        assert.match(html, /class="totc-v2-encounter-config"/);
        assert.match(html, /<h4>Strike<\/h4>/);
        assert.match(html, /Tick 4 · 3 AP available/);
        assert.match(html, /data-action="encounter-config-target-mode"[\s\S]*<option value="selectTarget" selected>Select target on map<\/option>/);
        assert.match(html, /data-action="encounter-config-positioning-ap"[\s\S]*<option value="0" selected>0 AP<\/option>[\s\S]*<option value="1" >1 AP<\/option>/);
        assert.match(html, /data-action="encounter-config-effect-ap"[\s\S]*<option value="2" selected>2 AP<\/option>/);
        assert.match(html, /data-action="encounter-config-ap-cost" disabled[\s\S]*<option value="2" selected>2 AP<\/option>/);
        assert.match(html, /data-action="encounter-config-follow-through"[\s\S]*Plan another action if AP remains/);
        assert.match(html, /data-action="encounter-config-failure-outcome"[\s\S]*Best reachable position/);
        assert.match(html, /data-action="encounter-confirm-configured-action"[^>]*data-action-id="strike"[^>]*data-target-mode="selectTarget"/);
        assert.match(html, /data-action="encounter-config-back"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-popup-overlay"/);
    });

    it("renders Move AP as protected once the overlay has selected a destination", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                index: 2,
                startTick: 4,
                remainingAp: 3,
                selectedAction: {
                    id: "move",
                    actionId: "move",
                    type: "movement",
                    label: "Move",
                    apCost: 1,
                    apMin: 1,
                    apMax: 3,
                    movementFeetPerAp: 10,
                    movementTargetRow: 2,
                    movementTargetCol: 4,
                    movementTargetX: 400,
                    movementTargetY: 200
                }
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action="encounter-config-target-mode" disabled[\s\S]*<option value="location" selected>Selected location<\/option>/);
        assert.match(html, /data-action="encounter-config-positioning-ap" disabled[\s\S]*<option value="0" selected>0 AP<\/option>/);
        assert.match(html, /data-action="encounter-config-effect-ap" disabled[\s\S]*<option value="1" selected>1 AP<\/option>/);
        assert.match(html, /data-action="encounter-config-ap-cost" disabled/);
        assert.match(html, /<option value="1" selected>1 AP<\/option>/);
        assert.match(html, /data-movement-target-x="400"/);
        assert.match(html, /data-movement-target-y="200"/);
    });

    it("keeps encounter planning out of actor sheets and the combat tracker", () => {
        for (const file of [
            "templates/actors/hero-sheet.hbs",
            "templates/actors/villain-sheet.hbs",
            "templates/actors/pawn-sheet.hbs",
            "templates/combat/combat-tracker.hbs",
            "module/sheets/actor-sheet.mjs",
            "module/sheets/combat-tracker.mjs"
        ]) {
            const source = readFileSync(join(rootDir, file), "utf8");
            assert.doesNotMatch(source, /encounterPlanner|totc-planner-available-action|totc-encounter-remove-action|totc-add-action|totc-clear-plan|totc-toggle-ready/, file);
        }
    });

    it("wires player encounter actions through per-action combat APIs", () => {
        assert.doesNotMatch(workspaceRootSource, /this\.\#wirePlayerEncounterPanelHandlers\(\)/);
        assert.match(encounterPlanningFeatureSource, /encounter-edit-plan-slot/);
        assert.match(encounterPlanningFeatureSource, /encounter-select-popup-action/);
        assert.match(encounterPlanningFeatureSource, /encounter-confirm-configured-action/);
        assert.match(encounterPlanningFeatureSource, /encounter-config-back/);
        assert.match(encounterPlanningFeatureSource, /addEventListener\("change"/);
        assert.match(encounterPlanningFeatureSource, /encounter-config-effect-ap/);
        assert.match(encounterPlanningFeatureSource, /#buildConfiguredEncounterPlanAction/);
        assert.match(encounterPlanningFeatureSource, /encounter-close-popup/);
        assert.match(encounterPlanningFeatureSource, /setCombatantPlan/);
        assert.match(encounterPlanningFeatureSource, /#beginEncounterMovementInteraction/);
        assert.match(encounterPlanningFeatureSource, /#beginEncounterTargetingInteraction/);
        assert.match(encounterPlanningFeatureSource, /applyLocalPlanningTokenPath\(token, movementUpdate\.path\)/);
        assert.doesNotMatch(workspaceEncounterSource, /player-execute-encounter-action/);
    });

    it("keeps the player encounter panel available as its own right-dock panel", () => {
        assert.match(encounterPlanningFeatureSource, /showEncounterPanel\(\)/);
        assert.match(encounterPlanningFeatureSource, /this\.panelRegistry\.get\("encounter"\)/);
        assert.match(encounterPlanningFeatureSource, /restorePanel\(panelDef, \{ preferredDockId: panelDef\.defaultDock \?\? "rightDock" \}\)/);
    });

    it("uses encounter-specific token selection when building the encounter planner", () => {
        assert.match(workspaceRootSource, /this\.registerFeature\(this\.encounterPlanningFeature\)/);
        assert.match(encounterPlanningFeatureSource, /const selection = this\.\#resolveEncounterPlannerSelection\(\{ combat, scene \}\)/);
        assert.match(encounterPlanningFeatureSource, /buildEncounterPlannerForCombatant\(\{/);
        assert.match(encounterPlanningFeatureSource, /context\.playerEncounterPanel = buildPlayerEncounterPanelModel/);
        assert.match(encounterPlanningFeatureSource, /#getSelectedEncounterToken\(scene = null\)/);
    });
});
