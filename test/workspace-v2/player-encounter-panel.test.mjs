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
        draftRemainingAp: 3,
        plannedAp: 3,
        planningTimeDisplay: "38s",
        canEditPlan: true,
        canCommit: true,
        ready: false,
        draftPlan: {
            clauses: [
                { clauseId: "draft-clause-1", actionId: "move", type: "movement", apCost: 2 },
                { clauseId: "draft-clause-2", actionId: "strike", type: "attack", apCost: 1 }
            ]
        },
        draftNarrative: {
            text: "Ada Price moves 20 feet (2 AP), then attacks Elias Vane with Clockmaker's Stiletto (1 AP).",
            lifecycle: "drafting",
            apBudget: 6,
            spentAp: 3,
            remainingAp: 3,
            complete: true,
            overBudget: false,
            helpText: "3 AP remaining.",
            missingDecisions: [],
            phrases: [
                { phraseId: "draft-clause-1:action", clauseId: "draft-clause-1", clauseIndex: 0, decision: "action", rootDecision: "action", text: "moves", editable: true },
                { phraseId: "draft-clause-1:movementDestination", clauseId: "draft-clause-1", clauseIndex: 0, decision: "movementDestination", rootDecision: "movementDestination", text: "20 feet", editable: true },
                { phraseId: "draft-clause-2:action", clauseId: "draft-clause-2", clauseIndex: 1, decision: "action", rootDecision: "action", text: "attacks", editable: true },
                { phraseId: "draft-clause-2:target", clauseId: "draft-clause-2", clauseIndex: 1, decision: "target", rootDecision: "target", text: "Elias Vane", editable: true },
                { phraseId: "draft-clause-2:item", clauseId: "draft-clause-2", clauseIndex: 1, decision: "item", rootDecision: "item", text: "Clockmaker's Stiletto", editable: true }
            ]
        },
        availableActions: [
            { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 4, variableAp: true, movementFeetPerAp: 10, rangeType: "melee" },
            { id: "strike", actionId: "strike", type: "attack", label: "Strike", apCost: 2, apMin: 2, apMax: 2, requiresToHit: true, toHitBonus: 5, rangeType: "normal" }
        ],
        availableItems: [
            { id: "stiletto", name: "Clockmaker's Stiletto", type: "weapon", img: "items/stiletto.webp", description: "A precise spring-loaded blade." }
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

    it("renders the narrative composer as the primary planning surface and keeps history bars", () => {
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
        assert.match(html, /class="totc-v2-encounter-narrative"/);
        assert.match(html, /data-action="encounter-narrative-phrase"[^>]*data-decision="movementDestination"/);
        assert.match(html, /Ada Price/);
        assert.match(html, /20 feet/);
        assert.doesNotMatch(html, /data-action="encounter-edit-plan-slot"/);
        assert.doesNotMatch(html, /data-action="encounter-plan-bar"/);
        assert.ok(
            html.indexOf("totc-v2-encounter-panel__planning-view") < html.indexOf("totc-v2-encounter-panel__history"),
            "planning workspace should render before history"
        );
        assert.doesNotMatch(html, /class="totc-v2-encounter-panel__orders"/);
        assert.doesNotMatch(html, /data-action="encounter-plan-segment"/);
        assert.match(html, /data-action="encounter-clear-plan"[\s\S]*>Clear Unlocked<\/button>/);
        assert.match(html, /data-action="encounter-toggle-ready"[\s\S]*aria-pressed="false"[\s\S]*>Confirm Plan<\/button>/);
        assert.match(html, /class="totc-v2-encounter-panel__progress"/);
        assert.match(html, /class="totc-v2-encounter-panel__history-bar"/);
        assert.match(html, /Strike/);
    });

    it("renders the follow-on select action prompt as an editable narrative phrase", () => {
        const planner = {
            ...plannerFixture(),
            draftPlan: {
                clauses: [{ clauseId: "draft-clause-1", actionId: "move", type: "movement", apCost: 2 }]
            },
            draftNarrative: {
                text: "Ada Price moves 20 feet (2 AP), then [select action].",
                lifecycle: "drafting",
                apBudget: 6,
                spentAp: 2,
                remainingAp: 4,
                complete: true,
                overBudget: false,
                helpText: "4 AP remaining.",
                missingDecisions: [],
                phrases: [
                    { phraseId: "draft-clause-1:action", clauseId: "draft-clause-1", clauseIndex: 0, decision: "action", rootDecision: "action", text: "moves", editable: true },
                    { phraseId: "draft-clause-1:movementDestination", clauseId: "draft-clause-1", clauseIndex: 0, decision: "movementDestination", rootDecision: "movementDestination", text: "20 feet", editable: true },
                    { phraseId: "draft-clause-2:action", clauseId: "draft-clause-2", clauseIndex: 1, decision: "action", rootDecision: "action", text: "[select action]", placeholder: true, editable: true }
                ]
            }
        };
        const model = buildPlayerEncounterPanelModel({ actor: actorFixture(), planner, combat: null });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(
            html,
            /data-action="encounter-narrative-phrase"[^>]*data-clause-index="1"[^>]*data-decision="action"[\s\S]*\[select action\]/
        );
    });

    it("renders minimal required roll status below the narrative", () => {
        const planner = {
            ...plannerFixture(),
            canEditPlan: false,
            canCommit: false,
            draftPlan: {
                ...plannerFixture().draftPlan,
                lifecycle: "confirmedAwaitingRolls"
            },
            draftNarrative: {
                ...plannerFixture().draftNarrative,
                lifecycle: "confirmedAwaitingRolls"
            },
            rollStatus: {
                required: true,
                complete: false,
                pendingCount: 1,
                items: [
                    { actionIndex: 1, actionId: "strike", label: "Strike", rollType: "attack", rollSubType: "toHit", complete: false }
                ]
            }
        };
        const model = buildPlayerEncounterPanelModel({ actor: actorFixture(), planner, combat: null });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.equal(model.canEditPlan, false);
        assert.match(html, /class="totc-v2-encounter-rolls"/);
        assert.match(html, /Required Rolls/);
        assert.match(html, /1 roll pending/);
        assert.match(html, /Strike/);
        assert.match(html, /Pending/);
        assert.ok(
            html.indexOf("totc-v2-encounter-narrative") < html.indexOf("totc-v2-encounter-rolls"),
            "roll status should sit below the narrative"
        );
    });

    it("disables Clear Plan when there are no planned actions to clear", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: {
                ...plannerFixture(),
                queue: [],
                canEditPlan: true,
                draftPlan: { clauses: [] },
                draftNarrative: {
                    text: "Ada Price [select an action]",
                    lifecycle: "drafting",
                    apBudget: 6,
                    spentAp: 0,
                    remainingAp: 6,
                    complete: false,
                    overBudget: false,
                    helpText: "6 AP remaining.",
                    missingDecisions: [],
                    phrases: [{ phraseId: "draft-clause-1:action", clauseId: "draft-clause-1", clauseIndex: 0, decision: "action", rootDecision: "action", text: "[select an action]", placeholder: true, editable: true }]
                }
            },
            combat: null
        });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action="encounter-clear-plan" disabled>Clear Unlocked<\/button>/);
    });

    it("locks narrative phrases when the plan is not editable", () => {
        const planner = plannerFixture();
        planner.canEditPlan = false;
        const model = buildPlayerEncounterPanelModel({ actor: actorFixture(), planner, combat: null });
        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.equal(model.canEditPlan, false);
        assert.match(html, /data-action="encounter-narrative-phrase"[\s\S]*disabled/);
        assert.doesNotMatch(html, /data-action="encounter-plan-segment"/);
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
                mode: "draftAction",
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
        assert.match(html, /Choose Action · 1 AP available/);
        assert.match(html, /data-action="encounter-action-search"/);
        assert.match(html, /data-action="encounter-select-popup-action"[^>]*data-action-id="move"[^>]*data-range-type="melee"/);
        assert.doesNotMatch(html, /data-action="encounter-select-popup-action"[^>]*data-action-id="strike"/);
    });

    it("does not render the legacy action popup while draft movement is awaiting a map destination", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                mode: "draftMovement",
                index: 0,
                helpText: "Choose a destination on the map."
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.doesNotMatch(html, /class="totc-v2-encounter-popup-overlay"/);
        assert.doesNotMatch(html, /Add Action/);
        assert.match(html, /Choose a destination on the map\./);
    });

    it("renders searchable carried item choices for item narrative phrases", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                mode: "draftItem",
                index: 1
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /Choose Item/);
        assert.match(html, /data-action="encounter-item-search"/);
        assert.match(html, /data-action="encounter-select-draft-item"[^>]*data-item-id="stiletto"/);
        assert.match(html, /Clockmaker&#039;s Stiletto|Clockmaker's Stiletto/);
    });

    it("renders plain duration choices for duration narrative phrases", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: plannerFixture(),
            combat: null,
            activePlanEditSlot: {
                mode: "draftDuration",
                index: 2,
                maxDurationAp: 3
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /Choose Duration/);
        assert.match(html, /data-action="encounter-select-draft-duration"[^>]*data-duration-ap="1"/);
        assert.match(html, /data-action="encounter-select-draft-duration"[^>]*data-duration-ap="3"/);
        assert.doesNotMatch(html, /data-duration-ap="4"/);
    });

    it("preserves duration requirements on rendered action choices", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: {
                ...plannerFixture(),
                availableActions: [{
                    id: "follow",
                    actionId: "follow",
                    type: "movement",
                    label: "Follow",
                    apCost: 1,
                    apMin: 1,
                    apMax: 3,
                    variableAp: true,
                    requiresTarget: true,
                    requiresDuration: true,
                    apLabel: "1-3 AP"
                }]
            },
            combat: null,
            activePlanEditSlot: {
                mode: "draftAction",
                index: 0,
                remainingAp: 3
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action-id="follow"/);
        assert.match(html, /data-requires-duration="true"/);
    });

    it("preserves Close and Engage requirements on rendered action choices", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: {
                ...plannerFixture(),
                availableActions: [{
                    id: "pursue",
                    actionId: "pursue",
                    type: "movement",
                    label: "Close and Engage",
                    apCost: 1,
                    apMin: 1,
                    apMax: 6,
                    variableAp: true,
                    requiresTarget: true,
                    requiresEngagementAction: true,
                    apLabel: "1-6 AP"
                }]
            },
            combat: null,
            activePlanEditSlot: {
                mode: "draftAction",
                index: 0,
                remainingAp: 6
            }
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action-id="pursue"/);
        assert.match(html, /data-requires-target="true"/);
        assert.match(html, /data-requires-engagement-action="true"/);
    });

    it("does not render the legacy action detail editor in the narrative planner", () => {
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
        assert.doesNotMatch(html, /class="totc-v2-encounter-config"/);
        assert.doesNotMatch(html, /data-action="encounter-confirm-configured-action"/);
        assert.doesNotMatch(html, /class="totc-v2-encounter-popup-overlay"/);
    });

    it("keeps movement represented by the narrative phrase rather than the legacy AP editor", () => {
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

        assert.match(html, /data-action="encounter-narrative-phrase"[^>]*data-decision="movementDestination"/);
        assert.doesNotMatch(html, /data-action="encounter-config-ap-cost"/);
        assert.doesNotMatch(html, /data-movement-target-x="400"/);
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
        assert.match(encounterPlanningFeatureSource, /encounter-narrative-phrase/);
        assert.match(encounterPlanningFeatureSource, /setCombatantDraftPlan/);
        assert.match(encounterPlanningFeatureSource, /encounter-action-search/);
        assert.match(encounterPlanningFeatureSource, /encounter-select-popup-action/);
        assert.match(encounterPlanningFeatureSource, /encounter-confirm-configured-action/);
        assert.match(encounterPlanningFeatureSource, /encounter-config-back/);
        assert.match(encounterPlanningFeatureSource, /addEventListener\("change"/);
        assert.match(encounterPlanningFeatureSource, /encounter-config-effect-ap/);
        assert.match(encounterPlanningFeatureSource, /_buildConfiguredEncounterPlanAction/);
        assert.match(encounterPlanningFeatureSource, /encounter-close-popup/);
        assert.match(encounterPlanningFeatureSource, /confirmCombatantDraftPlan/);
        assert.match(encounterPlanningFeatureSource, /_requestEncounterAttackRolls/);
        assert.match(encounterPlanningFeatureSource, /setCombatantPlan/);
        assert.match(encounterPlanningFeatureSource, /_beginEncounterMovementInteraction/);
        assert.match(encounterPlanningFeatureSource, /_beginEncounterTargetingInteraction/);
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
        assert.match(encounterPlanningFeatureSource, /const selection = this\._resolveEncounterPlannerSelection\(\{ combat, scene \}\)/);
        assert.match(encounterPlanningFeatureSource, /buildEncounterPlannerForCombatant\(\{/);
        assert.match(encounterPlanningFeatureSource, /context\.playerEncounterPanel = buildPlayerEncounterPanelModel/);
        assert.match(encounterPlanningFeatureSource, /_getSelectedEncounterToken\(scene = null\)/);
    });
});
