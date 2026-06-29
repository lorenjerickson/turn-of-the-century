import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkspacePanelHost } from "../../module/ui/workspace-v2/controllers/workspace-panel-host.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

describe("WorkspacePanelHost", () => {
    it("renders scene map panels as native canvas targets without custom scene layers", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: {
                    contents: [
                        {
                            name: "Ada",
                            x: 200,
                            y: 300,
                            width: 1,
                            height: 1,
                            texture: { src: "tokens/ada.webp" }
                        },
                        {
                            name: "Porter",
                            document: {
                                x: 400,
                                y: 500,
                                width: 2,
                                height: 1
                            }
                        }
                    ]
                }
            }),
            getSceneGridOverlayState: () => ({ gridType: 1, cellW: 100, offsetX: 0, offsetY: 0 }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelBodyContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-native-canvas-panel="true"/);
        assert.match(html, /data-map-panel-id="map:scene-1"/);
        assert.match(html, /data-scene-id="scene-1"/);
        assert.doesNotMatch(html, /data-map-viewport="true"/);
        assert.doesNotMatch(html, /data-map-token-layer="true"/);
        assert.doesNotMatch(html, /data-action="map-token"/);
        assert.doesNotMatch(html, /data-grid-overlay="true"/);
        assert.doesNotMatch(html, /data-encounter-movement-overlay="true"/);
        assert.doesNotMatch(html, /data-encounter-targeting-overlay="true"/);
        assert.match(html, /Rookery Yard/);
    });

    it("does not wrap native map panels in the design lens toolbar", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => true,
            isDesignLensActive: () => true,
            isMapPanel: () => true,
            designActionRegistry: {
                getApplicableActions: () => [
                    { id: "scene.walls", label: "Walls", description: "Draw walls." },
                    { id: "scene.detectWalls", label: "Detect Walls", description: "Detect walls." }
                ]
            },
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: []
            }),
            getMapPanelToolbarState: () => ({ mode: "walls", wallCommand: "split", wallType: "wall" }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-native-canvas-panel="true"/);
        assert.doesNotMatch(html, /totc-v2-panel-with-design-lens/);
        assert.doesNotMatch(html, /totc-v2-map-toolbar/);
        assert.doesNotMatch(html, /data-action="design-lens-action"/);
    });

    it("wraps active design lens markup around panel content", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => true,
            isDesignLensActive: () => true,
            designActionRegistry: {
                getApplicableActions: () => []
            }
        });

        const html = host.renderPanelContent({ id: "unknown", title: "Unknown" }, {});

        assert.match(html, /totc-v2-panel-with-design-lens/);
        assert.match(html, /totc-v2-panel-placeholder/);
    });

    it("keeps actor list GM-gated while allowing actor details for players", () => {
        const mockActorFeature = {
            render(panel, context) {
                if (panel.id === "actors") {
                    if (!context.gm?.isGM) {
                        return `<section class="totc-v2-actor-list-panel"><p class="totc-v2-actor-list-panel__empty">This panel is only available to the active Gamemaster.</p></section>`;
                    }
                    return "rendered-actor-list";
                }
                if (panel.id === "actor-editor") {
                    return "Select an actor or create a new one";
                }
                return undefined;
            }
        };

        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => false,
            getFeatures: () => [mockActorFeature]
        });

        const actorsHtml = host.renderPanelBodyContent({ id: "actors", title: "Actors" }, { gm: { isGM: false } });
        const actorEditorHtml = host.renderPanelBodyContent({ id: "actor-editor", title: "Actor Details" }, {
            gm: { isGM: false },
            actorEditorPanel: {
                mode: "empty"
            }
        });

        assert.match(actorsHtml, /only available to the active Gamemaster/);
        assert.match(actorEditorHtml, /Select an actor or create a new one/);
    });

    it("renders the player encounter panel for the encounter workspace panel", () => {
        const host = new WorkspacePanelHost({ escapeHTML });

        const html = host.renderPanelBodyContent({ id: "encounter", title: "Encounter" }, {
            playerEncounterPanel: {
                activeEncounter: true,
                status: {
                    name: "Ada Price",
                    type: "hero",
                    img: "actors/ada.webp",
                    health: { value: 8, max: 10 },
                    grit: { value: 2, max: 3 },
                    defenseRating: 14,
                    effects: []
                },
                combatantId: "combatant-1",
                encounterName: "Rookery Ambush",
                phase: "planning",
                round: 1,
                apBudget: 6,
                remainingAp: 6,
                draftRemainingAp: 6,
                canEditPlan: true,
                canCommit: false,
                availableActions: [
                    { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 3, variableAp: true }
                ],
                plannedActions: [],
                draftNarrative: {
                    text: "Ada Price [select an action]",
                    complete: false,
                    overBudget: false,
                    phrases: [{
                        id: "draft-action-placeholder",
                        text: "[select an action]",
                        decision: "action",
                        rootDecision: "action",
                        clauseIndex: 0,
                        state: "placeholder",
                        editable: true
                    }]
                },
                historyRows: []
            }
        });

        assert.match(html, /totc-v2-encounter-panel/);
        assert.match(html, /totc-v2-encounter-narrative/);
        assert.match(html, /data-action="encounter-narrative-phrase"/);
        assert.doesNotMatch(html, /data-action="encounter-plan-bar"/);
    });

    it("renders the GM encounter manager panel", () => {
        const host = new WorkspacePanelHost({ escapeHTML });

        const html = host.renderPanelBodyContent({ id: "encounter-manager", title: "Encounter Manager" }, {
            gm: { isGM: true },
            encounterManagerPanel: {
                active: true,
                initialized: true,
                name: "Rookery Ambush",
                round: 2,
                phase: "planning",
                apBudget: 6,
                currentTick: 1,
                actors: [
                    {
                        id: "combatant-1",
                        name: "Ada Price",
                        img: "actors/ada.webp",
                        health: { value: 8, max: 10 },
                        conditions: ["Bleeding"],
                        ready: false,
                        apBudget: 6,
                        segments: [{ id: "move", label: "Move", start: 1, span: 2 }]
                    }
                ],
                lastNarrative: "",
                lastEvaluatedTick: null,
                canStartRound: true,
                canResolveRound: true,
                canSetPhase: true
            }
        });

        assert.match(html, /totc-v2-encounter-manager/);
        assert.match(html, /data-action="encounter-manager-resolve-round"/);
        assert.match(html, /<h3>Action Plans<\/h3>/);
        assert.match(html, /totc-v2-encounter-manager__actor-plan/);
    });
});
