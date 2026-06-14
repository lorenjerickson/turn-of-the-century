import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
    buildEncounterManagerPanelModel,
    renderEncounterManagerPanel
} from "../../module/ui/workspace-v2/panels/encounter-manager-panel.mjs";

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");

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

describe("encounter manager panel", () => {
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

    it("renders collapsible actor summaries, AP tick markers, narrative, and lifecycle controls", () => {
        const html = renderEncounterManagerPanel(buildEncounterManagerPanelModel({ combat: combatFixture() }), { escapeHTML });

        assert.match(html, /class="totc-v2-encounter-manager"/);
        assert.match(html, /Round 4/);
        assert.match(html, /<details class="totc-v2-encounter-manager__actor" open>/);
        assert.match(html, /totc-v2-encounter-manager__actors-current-line/);
        assert.match(html, /--totc-current-tick:3/);
        assert.match(html, /data-action="encounter-manager-start-round"/);
        assert.doesNotMatch(html, /turn-order roll/i);
        assert.match(html, /data-action="encounter-manager-set-phase" data-phase="locked"/);
        assert.match(html, /data-action="encounter-manager-resolve-round"/);
        assert.match(html, /Briggs hunkers down\./);
    });

    it("wires GM start encounter to activate the Encounter Manager panel", () => {
        assert.match(workspaceRootSource, /case "gm-start-encounter"/);
        assert.match(workspaceRootSource, /await this\.\#showEncounterManagerPanel\(\)/);
        assert.match(workspaceRootSource, /this\.panelRegistry\.get\("encounter-manager"\)/);
        assert.match(workspaceRootSource, /restorePanel\(panelDef, \{ preferredDockId: panelDef\.defaultDock \?\? "leftDock" \}\)/);
        assert.match(workspaceRootSource, /#wireEncounterManagerPanelHandlers/);
        assert.match(workspaceRootSource, /resolveEncounterRound/);
    });
});
