import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const encounterPlanningFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/encounter-planning-feature.mjs"), "utf8");
const sceneDesignFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/scene-design-feature.mjs"), "utf8");
const workspacePanelHostSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/workspace-panel-host.mjs"), "utf8");
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("workspace token interactions", () => {
    it("does not render or wire custom HTML map tokens", () => {
        assert.doesNotMatch(workspacePanelHostSource, /data-action="map-token"/);
        assert.doesNotMatch(workspacePanelHostSource, /data-map-token-layer="true"/);
        assert.doesNotMatch(workspaceRootSource, /event\.target\.closest\("\[data-action='map-token'\]"\)/);
        assert.doesNotMatch(workspaceRootSource, /scene\.updateEmbeddedDocuments\("Token", updates\)/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__token\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-viewport__selection-box\s*\{/);
    });

    it("uses Foundry canvas selection and panning for token workflows", () => {
        assert.match(workspaceRootSource, /this\.selectedTokenIds = new Set\(\)/);
        assert.match(workspaceRootSource, /canvas\?\.tokens\?\.controlled/);
        assert.match(workspaceRootSource, /#syncSelectionToCanvas\(scene = null\)/);
        assert.match(workspaceRootSource, /canvas\?\.animatePan/);
        assert.match(workspaceRootSource, /canvas\?\.pan/);
        assert.match(encounterPlanningFeatureSource, /showEncounterPanelForToken\(\{ combat = null, scene = null, token = null, actor = null \}/);
    });

    it("activates native wall tools instead of workspace map pointer handlers", () => {
        assert.match(sceneDesignFeatureSource, /this\.executeDesignAction\("scene\.walls", \{ panelId \}\)/);
        assert.match(sceneDesignFeatureSource, /deactivateWallModeForPanel\(panelId\)/);
        assert.match(sceneDesignFeatureSource, /deactivateWallControls\(\{ uiRef: this\.uiRef, canvasRef: this\.canvasRef \}\)/);
        assert.match(sceneDesignFeatureSource, /syncWallCommandCanvasListener\(\)/);
        assert.match(sceneDesignFeatureSource, /listenForNativeCanvasPointerDown\(canvas/);
        assert.match(sceneDesignFeatureSource, /handleWallCommandPointerDown/);
        assert.match(sceneDesignFeatureSource, /if \(!isPrimaryPointerButton\(event\)\) return;/);
        assert.match(sceneDesignFeatureSource, /addWallSegmentToScene/);
        assert.match(sceneDesignFeatureSource, /advanceWallPlacementSequence\(previousSequence/);
        assert.match(sceneDesignFeatureSource, /this\.wallAddSequence = step\.sequence/);
        assert.match(sceneDesignFeatureSource, /event\.key === "Escape"[\s\S]*this\.cancelWallAddSequence\(\{ notify: false \}\)[\s\S]*wallCommand: "add"/);
        assert.match(sceneDesignFeatureSource, /Wall placement reset\. Click to set a new starting point\./);
        assert.match(sceneDesignFeatureSource, /wallTypeForShortcut\(key\)/);
        assert.match(sceneDesignFeatureSource, /key === "w" && !wallsActive/);
        assert.match(sceneDesignFeatureSource, /wallType, wallCommand: "add"/);
        assert.match(sceneDesignFeatureSource, /active\.command === "split"[\s\S]*splitWallSegmentAtPoint/);
        assert.doesNotMatch(sceneDesignFeatureSource, /active\.command === "split"[\s\S]*patchMapPanelToolbarState\(active\.panel\.id, \{ wallCommand: "add" \}\)/);
        assert.doesNotMatch(sceneDesignFeatureSource, /stopWallAddMode/);
        assert.doesNotMatch(sceneDesignFeatureSource, /if \(key === "a"\)/);
        assert.match(sceneDesignFeatureSource, /splitWallSegmentAtPoint/);
        assert.match(sceneDesignFeatureSource, /getControlledWallIds\(canvas\?\.walls\)/);
        assert.match(sceneDesignFeatureSource, /this\.setJoinableWallIds\(scene, getJoinableWallIds\(scene, selectedIds\)\)/);
        assert.match(sceneDesignFeatureSource, /removeWallSegmentsById/);
        assert.match(sceneDesignFeatureSource, /joinWallSegmentsById/);
        assert.match(sceneDesignFeatureSource, /\["door", "window", "transparent"\]/);
        assert.doesNotMatch(workspaceRootSource, /#beginWallRubberbandSelection/);
        assert.doesNotMatch(workspaceRootSource, /#handleWallEditingPointerDown/);
        assert.doesNotMatch(workspaceRootSource, /totc-v2-grid-overlay__/);
    });

    it("blocks canvas token selection during targeting by intercepting pointerdown at document level before PIXI", () => {
        // Canvas-level capture listeners fire after PIXI (registered at Foundry init),
        // so we must register at document level to fire first and stop propagation.
        assert.match(encounterPlanningFeatureSource, /document\.addEventListener\("pointerdown", handler, \{ capture: true \}\)/);
        assert.match(encounterPlanningFeatureSource, /document\.removeEventListener\("pointerdown", handler, \{ capture: true \}\)/);
        // Only intercept events on the canvas view element — let panel UI clicks through.
        assert.match(encounterPlanningFeatureSource, /if \(view && event\.target !== view\) return;/);
        assert.match(encounterPlanningFeatureSource, /get hasActiveTargetingInteraction\(\)/);
    });

    it("keeps map toolbar button styling without fake map layer styles", () => {
        assert.match(styles, /\.totc-v2-map-toolbar__btn\s*\{[\s\S]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.2\);[\s\S]*border-radius:\s*4px;[\s\S]*color:\s*#dbeafe;/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__movement-overlay\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__targeting-overlay\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__grid-overlay\s*\{/);
    });
});
