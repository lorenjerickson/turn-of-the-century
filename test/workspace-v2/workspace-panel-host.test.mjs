import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WorkspacePanelHost } from "../../module/ui/workspace-v2/controllers/workspace-panel-host.mjs";

const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function toolbarButton(html, command) {
    return Array.from(html.matchAll(/<button type="button"[\s\S]*?<\/button>/g))
        .map((match) => match[0])
        .find((button) => button.includes(`data-command="${command}"`)) ?? "";
}

describe("WorkspacePanelHost", () => {
    it("renders scene map panels with actor drop and grid overlay layers", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
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

        assert.match(html, /<div class="totc-v2-map-panel__viewport[^"]*" data-action="map-viewport" data-map-viewport="true"\s+data-scene-actor-drop-target="true" data-map-panel-id="map:scene-1" data-scene-id="scene-1"/);
        assert.doesNotMatch(html, /<figure class="totc-v2-map-panel[^"]*"[^>]*data-scene-actor-drop-target="true"/);
        assert.match(html, /data-map-token-layer="true"/);
        assert.match(html, /class="totc-v2-map-panel__token"[^>]*src="tokens\/ada\.webp"[^>]*style="left:200px;top:300px;width:100px;height:100px"/);
        assert.match(html, /class="totc-v2-map-panel__token totc-v2-map-panel__token--fallback"[^>]*style="left:400px;top:500px;width:200px;height:100px"[^>]*>P<\/span>/);
        assert.match(html, /data-actor-drop-preview="true"/);
        assert.match(html, /data-grid-overlay="true"/);
        assert.match(html, /Rookery Yard/);
    });

    it("renders overlay layer when only detected wall overlay is present", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: []
            }),
            getSceneGridOverlayState: () => null,
            getSceneWallOverlayState: () => ({ segments: [{ x1: 0, y1: 0, x2: 100, y2: 0 }] }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelBodyContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-grid-overlay="true"/);
    });

    it("renders encounter movement overlay squares above the map token layer", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100, distance: 5 },
                tokens: []
            }),
            getEncounterMovementOverlayState: () => ({
                active: true,
                cells: [
                    { row: 2, col: 2, left: 200, top: 200, width: 100, height: 100, requiredAp: 0, distanceFeet: 0, origin: true },
                    { row: 2, col: 4, left: 400, top: 200, width: 100, height: 100, requiredAp: 1, distanceFeet: 10, origin: false }
                ]
            }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelBodyContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-encounter-movement-overlay="true"/);
        assert.match(html, /data-action="encounter-move-square"[^>]*data-row="2"[^>]*data-col="4"[^>]*data-required-ap="1"/);
        assert.match(html, /class="totc-v2-map-panel__movement-cell is-origin"/);
    });

    it("renders encounter targeting overlay and marks targetable tokens", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isMapPanel: () => true,
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100, distance: 5 },
                tokens: {
                    contents: [
                        { id: "source", name: "Ada", x: 200, y: 200, width: 1, height: 1, texture: { src: "tokens/ada.webp" } },
                        { id: "target", name: "Briggs", x: 400, y: 200, width: 1, height: 1, texture: { src: "tokens/briggs.webp" } },
                        { id: "far", name: "Far", x: 1200, y: 200, width: 1, height: 1, texture: { src: "tokens/far.webp" } }
                    ]
                }
            }),
            getEncounterTargetOverlayState: () => ({
                active: true,
                sourceTokenId: "source",
                targetTokenIds: ["target"],
                rangeType: "normal",
                rangeFeet: 30,
                radiusPixels: 600,
                origin: { x: 250, y: 250 }
            }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelBodyContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-encounter-targeting-overlay="true"/);
        assert.match(html, /class="totc-v2-map-panel__targeting-ring"/);
        assert.match(html, /Select normal target \(30 ft\)/);
        assert.match(html, /data-token-id="target"[\s\S]*class="totc-v2-map-panel__token is-targetable"|class="totc-v2-map-panel__token is-targetable"[\s\S]*data-token-id="target"/);
        assert.match(html, /data-token-id="source"[\s\S]*is-source|is-source[\s\S]*data-token-id="source"/);
    });

    it("renders split and join wall commands in the primary map toolbar", () => {
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
                mapSrc: "yard.webp",
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

        assert.match(html, /data-command="add"/);
        assert.match(html, /data-command="remove"[\s\S]*disabled/);
        assert.match(html, /data-command="split"[\s\S]*aria-pressed="true"/);
        assert.match(html, /data-command="join"[\s\S]*disabled/);
        assert.doesNotMatch(html, /totc-v2-map-toolbar__secondary/);
        assert.match(html, /totc-v2-map-toolbar__primary[\s\S]*data-mode="walls"[\s\S]*data-command="add"[\s\S]*data-wall-type="wall"/);
        assert.doesNotMatch(html, /data-action="design-lens-action"[\s\S]*data-design-action-id="scene\.walls"/);
    });

    it("enables the wall remove tool when wall segments are selected", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => true,
            isDesignLensActive: () => true,
            isMapPanel: () => true,
            designActionRegistry: {
                getApplicableActions: () => []
            },
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: []
            }),
            getMapPanelToolbarState: () => ({ mode: "walls", wallCommand: "split", wallType: "wall", selectedWallCount: 2, joinableWallCount: 2 }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });
        const removeButton = toolbarButton(html, "remove");
        const joinButton = toolbarButton(html, "join");

        assert.match(removeButton, /Delete 2 selected wall segments/);
        assert.doesNotMatch(removeButton, /disabled/);
        assert.doesNotMatch(removeButton, /is-active/);
        assert.match(joinButton, /Join 2 fully selected wall segments/);
        assert.doesNotMatch(joinButton, /disabled/);
        assert.doesNotMatch(joinButton, /is-active/);
    });

    it("hides wall command controls when wall mode is inactive", () => {
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => true,
            isDesignLensActive: () => true,
            isMapPanel: () => true,
            designActionRegistry: {
                getApplicableActions: () => []
            },
            getMapPanelScene: () => ({
                id: "scene-1",
                name: "Rookery Yard",
                mapSrc: "yard.webp",
                width: 1200,
                height: 800,
                shiftX: 0,
                shiftY: 0,
                grid: { type: 1, size: 100 },
                tokens: []
            }),
            getMapPanelToolbarState: () => ({ mode: null, wallCommand: "split", wallType: "wall", selectedWallCount: 2, joinableWallCount: 2 }),
            gridCalibrationState: () => ({ active: false })
        });

        const html = host.renderPanelContent({ id: "map:scene-1", baseId: "map", sceneId: "scene-1" });

        assert.match(html, /data-mode="walls"[\s\S]*aria-pressed="false"/);
        assert.doesNotMatch(html, /data-command="split"/);
        assert.doesNotMatch(html, /data-command="join"/);
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
        const host = new WorkspacePanelHost({
            escapeHTML,
            isGM: () => false
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
                canEditPlan: true,
                canCommit: false,
                availableActions: [
                    { id: "move", actionId: "move", type: "movement", label: "Move", apCost: 1, apMin: 1, apMax: 3, variableAp: true }
                ],
                plannedActions: [],
                historyRows: []
            }
        });

        assert.match(html, /totc-v2-encounter-panel/);
        assert.match(html, /data-action="encounter-edit-plan-slot"/);
        assert.match(html, /data-action="encounter-plan-bar"/);
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
