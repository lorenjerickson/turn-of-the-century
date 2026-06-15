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
            { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 4, variableAp: true, movementFeetPerAp: 10 },
            { id: "strike", actionId: "strike", type: "attack", label: "Strike", apCost: 2, apMin: 2, apMax: 2, requiresToHit: true, toHitBonus: 5 }
        ],
        queue: [
            { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 2, apMin: 1, apMax: 4, variableAp: true, movementFeetPerAp: 10 },
            { id: "strike", actionId: "strike", type: "attack", label: "Strike", apCost: 1, apMin: 1, apMax: 1 }
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
        assert.equal(model.historyRows.length, 1);
        assert.equal(model.historyRows[0].segments[0].label, "Move");
        assert.equal(model.historyRows[0].segments[0].span, 2);
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
        assert.match(html, /type="search"[^>]*data-action="encounter-add-action"/);
        assert.match(html, /data-action="encounter-add-selected-action"[^>]*disabled[^>]*>Add<\/button>/);
        assert.match(html, /<datalist id="totc-encounter-actions-combatant-1">/);
        assert.match(html, /data-action="encounter-plan-segment"[\s\S]*draggable="true"/);
        assert.match(html, /data-action="encounter-resize-action"[\s\S]*data-action-index="0"/);
        assert.match(html, /data-action="encounter-remove-action"[\s\S]*data-action-index="1"/);
        assert.match(html, /data-action="encounter-clear-plan"[\s\S]*>Clear Plan<\/button>/);
        assert.match(html, /data-action="encounter-toggle-ready"[\s\S]*aria-pressed="false"[\s\S]*>Ready<\/button>/);
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

        assert.match(html, /data-action="encounter-clear-plan" disabled>Clear Plan<\/button>/);
    });

    it("keeps the action search focusable for browsing when actions are available", () => {
        const model = buildPlayerEncounterPanelModel({
            actor: actorFixture(),
            planner: {
                ...plannerFixture(),
                canEditPlan: false
            },
            combat: null
        });

        const html = renderPlayerEncounterPanel(model, { escapeHTML });

        assert.match(html, /data-action="encounter-add-action"[^>]*data-can-edit-plan="false"/);
        assert.doesNotMatch(html, /data-action="encounter-add-action"[^>]*disabled/);
        assert.match(html, /<option value="Move"/);
        assert.match(html, /<option value="Strike"/);
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
        assert.match(workspaceRootSource, /#wirePlayerEncounterPanelHandlers/);
        assert.match(workspaceRootSource, /encounter-add-action/);
        assert.match(workspaceRootSource, /encounter-add-selected-action/);
        assert.match(workspaceRootSource, /syncEncounterAddButtonState/);
        assert.match(workspaceRootSource, /addEncounterActionFromInput/);
        assert.match(workspaceRootSource, /addCombatantAction/);
        assert.match(workspaceRootSource, /setCombatantPlan/);
        assert.match(workspaceRootSource, /setCombatantActionApCost/);
        assert.match(workspaceRootSource, /if \(input\?\.dataset\?\.canEditPlan !== "true"\) return;/);
        assert.doesNotMatch(workspaceRootSource, /rollEncounter/);
        assert.doesNotMatch(workspaceRootSource, /rollAllMissing/);
        assert.doesNotMatch(workspaceRootSource, /player-execute-encounter-action/);
    });

    it("keeps the player encounter panel available as its own right-dock panel", () => {
        assert.match(workspaceRootSource, /#showEncounterPanel/);
        assert.match(workspaceRootSource, /this\.panelRegistry\.get\("encounter"\)/);
        assert.match(workspaceRootSource, /restorePanel\(panelDef, \{ preferredDockId: panelDef\.defaultDock \?\? "rightDock" \}\)/);
    });

    it("uses encounter-specific token selection when building the encounter planner", () => {
        assert.match(workspaceRootSource, /const encounterPlannerSelection = this\.\#resolveEncounterPlannerSelection\(\{/);
        assert.match(workspaceRootSource, /const selectedEncounterActor = encounterPlannerSelection\?\.actor \?\? null/);
        assert.match(workspaceRootSource, /const selectedEncounterToken = encounterPlannerSelection\?\.token \?\? null/);
        assert.doesNotMatch(workspaceRootSource, /const selectedEncounterActor = encounterPlannerSelection\?\.actor \?\? selectedPlayerActor/);
        assert.doesNotMatch(workspaceRootSource, /buildEncounterPlanner\(selectedEncounterActor, selectedEncounterToken\)/);
        assert.match(workspaceRootSource, /buildEncounterPlannerForCombatant\(\{/);
        assert.match(workspaceRootSource, /combatantId: encounterPlannerSelection\.combatant\.id/);
        assert.match(workspaceRootSource, /actor: selectedEncounterActor,[\s\S]*planner: playerEncounterPlanner/);
        assert.match(workspaceRootSource, /#getSelectedEncounterToken\(scene = null\)/);
        assert.match(workspaceRootSource, /selectionSource: String\(encounterPlannerSelection\?\.source \?\? ""\)/);
        assert.match(workspaceRootSource, /#getEncounterCombat\(element = null\)/);
        assert.match(workspaceRootSource, /closest\?\.\("\.totc-v2-encounter-panel"\)\?\.dataset\?\.combatId/);
        assert.match(workspaceRootSource, /const combat = this\.\#getEncounterCombat\(input\)/);
    });
});
