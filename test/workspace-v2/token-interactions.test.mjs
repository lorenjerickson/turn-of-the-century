import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const workspacePanelHostSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/workspace-panel-host.mjs"), "utf8");
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("workspace token interactions", () => {
    it("renders tokens with necessary data-action, draggable, selection state, and ids", () => {
        // Assert token rendering supports selection and dragging prevention
        assert.match(workspacePanelHostSource, /getSelectedTokenIds\s*=\s*\(\)\s*=>\s*new Set\(\)/);
        assert.match(workspacePanelHostSource, /const selectedTokenIds = this\.getSelectedTokenIds\(\)/);
        assert.match(workspacePanelHostSource, /const isSelected = selectedTokenIds\.has\(tokenId\) \? " is-selected" : ""/);
        assert.match(workspacePanelHostSource, /data-token-id="\$\{this\.escapeHTML\(tokenId\)\}"/);
        assert.match(workspacePanelHostSource, /data-actor-id="\$\{this\.escapeHTML\(actorId\)\}"/);
        assert.match(workspacePanelHostSource, /data-action="map-token"/);
        assert.match(workspacePanelHostSource, /draggable="false"/);
    });

    it("wires token events for double click, drag, and selection in root app", () => {
        // Assert selectedTokenIds initialization and passage to host
        assert.match(workspaceRootSource, /this\.selectedTokenIds = new Set\(\)/);
        assert.match(workspaceRootSource, /getSelectedTokenIds: \(\) => this\.selectedTokenIds/);
        assert.match(workspaceRootSource, /const pinnedEncounterSceneId = String\(this\._encounterPlannerSelection\?\.sceneId \?\? ""\)\.trim\(\)/);
        assert.match(workspaceRootSource, /const canSyncTokenSelectionFromCanvas = isCanvasSceneMatch && \(!pinnedEncounterSceneId \|\| !canvasSceneId \|\| pinnedEncounterSceneId === canvasSceneId\)/);
        assert.match(workspaceRootSource, /if \(canSyncTokenSelectionFromCanvas && \(controlledTokens\.length > 0 \|\| this\.selectedTokenIds\.size > 0\)\)/);

        // Assert double-clicking opens the editor without bypassing selection-driven details
        assert.match(workspaceRootSource, /viewport\.addEventListener\("dblclick"/);
        assert.match(workspaceRootSource, /this\.actorWorkspaceController\.openActorEditor\(\)/);
        assert.doesNotMatch(workspaceRootSource, /const actorId = tokenEl\.dataset\.actorId;[\s\S]*openDetails\(actorId\)/);

        // Assert left-click pointerdown logic checks for calibrating and resolves tokens or selection
        assert.match(workspaceRootSource, /viewport\.classList\.contains\("is-calibrating"\)/);
        assert.match(workspaceRootSource, /event\.button !== 0/);
        assert.match(workspaceRootSource, /event\.target\.closest\("\[data-action='map-token'\]"\)/);

        // Assert group dragging with scale division and grid snapping update
        assert.match(workspaceRootSource, /scale\s*}\s*=\s*this\.\#getMapImageTransform\(viewport\)/);
        assert.match(workspaceRootSource, /const rawX = t\.startLeft \+ dx;/);
        assert.match(workspaceRootSource, /Math\.round\(\(rawX - offsetX\) \/ cellSize\) \* cellSize \+ offsetX/);
        assert.match(workspaceRootSource, /scene\.updateEmbeddedDocuments\("Token", updates\)/);

        // Assert token dragging checks for owner permission on actors
        assert.match(workspaceRootSource, /const tokenDoc = scene\.tokens\?\.get\(tokenId\);/);
        assert.match(workspaceRootSource, /if \(!\(game\.user\?\.isGM \|\| actor\?\.isOwner\)\) return;/);
        assert.match(workspaceRootSource, /if \(!\(game\.user\?\.isGM \|\| tActor\?\.isOwner\)\) continue;/);
        assert.match(workspaceRootSource, /#showEncounterPanelForToken\(\{ combat = null, scene = null, token = null, actor = null \}/);
        assert.match(workspaceRootSource, /#canPlanEncounterToken\(\{ combat = null, token = null, actor = null \}/);
        assert.match(workspaceRootSource, /#getTokenCombatant\(token = null\)/);
        assert.match(workspaceRootSource, /token\?\.combatant \?\? token\?\.object\?\.combatant/);
        assert.match(workspaceRootSource, /game\.user\?\.isGM \|\| actor\?\.isOwner/);
        assert.match(workspaceRootSource, /combat\?\.encounterState\?\.initialized \?\? combat\?\.encounter\?\.state\?\.initialized/);
        assert.match(workspaceRootSource, /#getEncounterCombatForToken\(token = null\)/);
        assert.match(workspaceRootSource, /#canViewEncounterToken\(\{ token = null, actor = null, combatant = null \}/);
        assert.match(workspaceRootSource, /#getEncounterCombatants\(combat = null, actor = null\)/);
        assert.match(workspaceRootSource, /\.\.\.this\.\#collectionContents\(combat\?\.turns\)/);
        assert.match(workspaceRootSource, /findCombatantForToken\(\{[\s\S]*combatants: this\.\#getEncounterCombatants\(combat, actor\),[\s\S]*actor/);
        assert.match(workspaceRootSource, /if \(!canView\) return false;/);
        assert.match(workspaceRootSource, /await this\.\#showEncounterPanelForToken\(\{[\s\S]*combat: this\.\#getEncounterCombatForToken\(tokenDoc\) \?\? this\.\#getEncounterCombat\(\),[\s\S]*token: tokenDoc,[\s\S]*actor[\s\S]*\}\)/);
        assert.match(workspaceRootSource, /this\._encounterPlannerSelection = \{[\s\S]*sceneId:[\s\S]*tokenId:[\s\S]*actorId:[\s\S]*combat,[\s\S]*scene,[\s\S]*token,[\s\S]*actor/);
        assert.match(workspaceRootSource, /source: "pinned"/);
        assert.match(workspaceRootSource, /#resolveActorFromSelectedSceneTokens\(scene = canvas\?\.scene \?\? null\)/);
        assert.match(workspaceRootSource, /if \(this\.selectedTokenIds\.size !== 1\) return null;/);
        assert.match(workspaceRootSource, /if \(game\.user\?\.isGM \|\| actor\.isOwner\) return actor;/);
        assert.match(workspaceRootSource, /#syncActorDetailsToTokenSelection\(scene = canvas\?\.scene \?\? null\)/);
        assert.match(workspaceRootSource, /this\.actorWorkspaceController\.clearDetails\(\)/);

        // Assert rubberband selection box creation, class toggling, and cleanup
        assert.match(workspaceRootSource, /totc-v2-map-viewport__selection-box/);
        assert.match(workspaceRootSource, /overlaps = ![\s\S]*tokenRect\.right < boxRect\.left/);
        assert.match(workspaceRootSource, /el\.classList\.toggle\("is-selected", this\.selectedTokenIds\.has\(el\.dataset\.tokenId\)\)/);
        assert.match(workspaceRootSource, /boxEl\.remove\(\)/);
    });

    it("wires wall edit tools without intercepting token pointer starts in root app", () => {
        assert.match(workspaceRootSource, /addWallSegmentToScene/);
        assert.match(workspaceRootSource, /removeWallSegmentsById/);
        assert.doesNotMatch(workspaceRootSource, /removeWallSegmentAtPoint/);
        assert.match(workspaceRootSource, /findWallsIntersectingBounds/);
        assert.match(workspaceRootSource, /findWallsWithinBounds/);
        assert.match(workspaceRootSource, /getControlledWallIds/);
        assert.match(workspaceRootSource, /controlWall", handler: this\._wallSelectionRefreshHandler/);
        assert.match(workspaceRootSource, /#syncSelectedWallsFromCanvas\(scene[\s\S]*getControlledWallIds\(canvas\?\.walls\)/);
        assert.match(workspaceRootSource, /#syncSelectedWallsFromCanvas\(scene\);[\s\S]*const selectedIds = this\.\#getSelectedWallIds\(scene\)/);
        assert.match(workspaceRootSource, /viewport\?\.dataset\?\.mapPanelId[\s\S]*#getMapPanelToolbarState\(\{ id: panelId \}\)/);
        assert.match(workspaceRootSource, /splitWallSegmentAtPoint/);
        assert.match(workspaceRootSource, /joinWallSegmentsById/);
        assert.doesNotMatch(workspaceRootSource, /joinWallSegmentsAtPoint/);
        assert.match(workspaceRootSource, /this\._wallAddSequence = null/);
        assert.match(workspaceRootSource, /const tokenEl = event\.target\.closest\("\[data-action='map-token'\]"\);[\s\S]*if \(!tokenEl && this\.\#isWallSelectionPointerEvent\(viewport\)\) \{[\s\S]*this\.\#beginWallRubberbandSelection\(viewport, event\)/);
        assert.match(workspaceRootSource, /if \(!moved\) \{[\s\S]*this\.\#isWallEditingPointerEvent\(viewport\)[\s\S]*this\.\#handleWallEditingPointerDown\(viewport, event\)/);
        assert.match(workspaceRootSource, /this\.selectedTokenIds\.clear\(\);[\s\S]*querySelectorAll\("\[data-action='map-token'\]"\)[\s\S]*classList\.remove\("is-selected"\)/);
        assert.match(workspaceRootSource, /else if \(mode === "walls"\) \{[\s\S]*this\.\#deactivateWallModeForPanel\(panelId\)/);
        assert.match(workspaceRootSource, /event\.key === "Escape" && this\._wallAddSequence/);
        assert.match(workspaceRootSource, /if \(key === "w"\) \{[\s\S]*mode: null[\s\S]*#deactivateWallModeForPanel\(panelId\)[\s\S]*mode: "walls"[\s\S]*#executeDesignAction\("scene\.walls", \{ panelId \}\)/);
        assert.match(workspaceRootSource, /if \(key === "a"\) \{[\s\S]*wallCommand: "add"/);
        assert.match(workspaceRootSource, /if \(key === "s"\) \{[\s\S]*#cancelWallAddSequence\(\)[\s\S]*wallCommand: "split"/);
        assert.match(workspaceRootSource, /if \(key === "j"\) \{[\s\S]*#joinSelectedWallsForPanel\(panelId\)/);
        assert.match(workspaceRootSource, /if \(key === "delete"\) \{[\s\S]*selectedWallCount[\s\S]*#deleteSelectedWallsForPanel\(panelId\)/);
        assert.match(workspaceRootSource, /const wallTypeByKey = \{[\s\S]*1: "wall",[\s\S]*2: "window",[\s\S]*3: "door"[\s\S]*\}/);
        assert.match(workspaceRootSource, /if \(this\._wallAddSequence\) \{[\s\S]*this\.\#cancelWallAddSequence\(\);[\s\S]*return;[\s\S]*\}/);
    });

    it("redraws wall overlays on normal map renders when grid calibration is inactive", () => {
        assert.match(workspaceRootSource, /if \(!this\.gridCalibrationController\.active\) \{\s*this\.\#drawGridCalibrationOverlay\(\);\s*return;\s*\}/);
        assert.match(workspaceRootSource, /if \(result\?\.ok\) this\.\#refreshSceneWallOverlay\(scene\);/);
        assert.match(workspaceRootSource, /if \(actionId === "scene\.walls" && result\?\.ok && actionScene\) this\.\#refreshSceneWallOverlay\(actionScene\);/);
        assert.match(workspaceRootSource, /totc-v2-grid-overlay__selected-wall-halo/);
        assert.match(workspaceRootSource, /stop-opacity="0\.45"/);
        assert.match(workspaceRootSource, /x - 3\.75\)\.toFixed\(1\)[\s\S]*width="7\.5" height="7\.5"/);
        assert.match(workspaceRootSource, /segment\.wallKind === "door"[\s\S]*is-door[\s\S]*segment\.wallKind === "window"[\s\S]*is-window/);
        assert.match(styles, /\.totc-v2-grid-overlay__selected-wall-halo\s*\{/);
        assert.match(styles, /\.totc-v2-grid-overlay__selected-wall-halo\s*\{[\s\S]*stroke-width:\s*15;/);
        assert.match(styles, /\.totc-v2-grid-overlay__detected-wall\s*\{[\s\S]*stroke-width:\s*3\.375;/);
        assert.match(styles, /\.totc-v2-grid-overlay__detected-wall\.is-selected\s*\{[\s\S]*rgba\(255,\s*247,\s*153,\s*1\)/);
        assert.match(styles, /\.totc-v2-grid-overlay__detected-wall\.is-window\s*\{[\s\S]*rgba\(96,\s*165,\s*250,\s*0\.96\)/);
        assert.match(styles, /\.totc-v2-grid-overlay__detected-wall\.is-door\s*\{[\s\S]*rgba\(74,\s*222,\s*128,\s*0\.96\)/);
    });

    it("defines CSS rules for selected tokens and rubberband selection box", () => {
        assert.match(styles, /\.totc-v2-map-panel__token\.is-selected\s*\{/);
        assert.match(styles, /\.totc-v2-map-panel__token\s*\{[\s\S]*pointer-events:\s*auto;/);
        assert.match(styles, /\.totc-v2-map-panel__grid-overlay\s*\{[\s\S]*pointer-events:\s*none;/);
        assert.match(styles, /outline:\s*2px\s*solid\s*#fbbf24;/);
        assert.match(styles, /\.totc-v2-map-viewport__selection-box\s*\{/);
        assert.match(styles, /border:\s*1\.5px\s*dashed\s*#fbbf24;/);
        assert.match(styles, /background:\s*rgba\(251,\s*191,\s*36,\s*0\.12\);/);
    });

    it("styles map toolbar buttons like other panel action buttons", () => {
        assert.match(styles, /\.totc-v2-actor-list-panel__new,[\s\S]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.2\);[\s\S]*border-radius:\s*4px;/);
        assert.match(styles, /\.totc-v2-map-toolbar__btn\s*\{[\s\S]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.2\);[\s\S]*border-radius:\s*4px;[\s\S]*color:\s*#dbeafe;/);
        assert.match(styles, /\.totc-v2-map-toolbar__btn:hover\s*\{[\s\S]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.3\);[\s\S]*border-color:\s*rgba\(191,\s*219,\s*254,\s*0\.7\);/);
    });

    it("removes obsolete player panel actor-selection handlers", () => {
        assert.doesNotMatch(workspaceRootSource, /data-action='player-select-actor'/);
        assert.doesNotMatch(workspaceRootSource, /\[data-action='player-toggle-section'\]/);
        assert.doesNotMatch(workspaceRootSource, /\[data-action='player-open-sheet'\]/);
        assert.doesNotMatch(workspaceRootSource, /\[data-action='player-center-token'\]/);
        assert.doesNotMatch(workspaceRootSource, /\#setPlayerPanelStatePatch\(/);
    });
});
