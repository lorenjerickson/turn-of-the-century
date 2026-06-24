import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const workspaceLayoutFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/workspace-layout-feature.mjs"), "utf8");
const sceneDesignFeatureSource = readFileSync(join(rootDir, "module/ui/workspace-v2/controllers/scene-design-feature.mjs"), "utf8");
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("native canvas workspace integration", () => {
    it("uses center map panels as a native Foundry canvas aperture", () => {
        assert.match(workspaceLayoutFeatureSource, /getActiveCenterMapPanel/);
        assert.match(workspaceRootSource, /#syncNativeCanvasScene/);
        assert.match(workspaceRootSource, /scene\.view\(\)/);
        assert.match(workspaceLayoutFeatureSource, /dockId === "centerDock" && this\.\#isMapPanel\(activePanel\)/);
        assert.match(workspaceLayoutFeatureSource, /is-native-canvas-aperture/);
    });

    it("centers tokens with native canvas pan controls", () => {
        assert.match(workspaceRootSource, /canvas\?\.animatePan/);
        assert.match(workspaceRootSource, /canvas\?\.pan/);
        assert.doesNotMatch(workspaceRootSource, /centerOnPoint\(viewport, image/);
    });

    it("keeps grid calibration input keys from escaping to the native canvas", () => {
        assert.match(sceneDesignFeatureSource, /gridCalInputSelector/);
        assert.match(sceneDesignFeatureSource, /input\?\.matches\?\.\(gridCalInputSelector\)/);
        assert.match(sceneDesignFeatureSource, /event\.stopPropagation\(\);/);
        assert.match(sceneDesignFeatureSource, /event\.key === "Tab"[\s\S]*event\.preventDefault\(\);/);
        assert.match(sceneDesignFeatureSource, /this\.syncGridCalibrationStateFromInputs\([\s\S]*\);[\s\S]*await this\.flushGridCalibrationPreview\(\);/);
        assert.match(sceneDesignFeatureSource, /focusAdjacentGridCalibrationInput/);
    });

    it("debounces grid calibration previews while keeping boundary events immediate", () => {
        assert.match(sceneDesignFeatureSource, /GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS = 100/);
        assert.match(sceneDesignFeatureSource, /GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS = 500/);
        assert.match(sceneDesignFeatureSource, /input\?\.matches\?\.\(gridCalInputSelector\)/);
        assert.match(sceneDesignFeatureSource, /this\.scheduleGridCalibrationPreview\(\{ geometry: input\.dataset\.action !== "grid-cal-color" \}\);/);
        assert.match(sceneDesignFeatureSource, /scheduleGridCalibrationPreview\(\{ geometry = true \} = \{\}\)[\s\S]*GRID_CALIBRATION_GEOMETRY_PREVIEW_DEBOUNCE_MS[\s\S]*GRID_CALIBRATION_COLOR_PREVIEW_DEBOUNCE_MS[\s\S]*setTimeout\(\(\) => \{[\s\S]*this\.previewGridCalibrationOnCanvas\(\);[\s\S]*delay/);
        assert.match(sceneDesignFeatureSource, /flushGridCalibrationPreview\(\)[\s\S]*this\.clearGridCalibrationPreviewTimer\(\);[\s\S]*return this\.previewGridCalibrationOnCanvas\(\);/);
    });

    it("lets pointer events pass through the workspace canvas aperture", () => {
        assert.match(styles, /\.totc-workspace-v2-root-app\s*\{[\s\S]*pointer-events:\s*none;/);
        assert.match(styles, /\.turn-of-the-century \.totc-workspace-v2-shell\s*\{[\s\S]*pointer-events:\s*none;/);
        assert.doesNotMatch(styles, /body\.totc-v2-active #board\s*\{[\s\S]*display:\s*none\s*!important;[\s\S]*\}/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-layout\.has-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-dock\s*\{[\s\S]*pointer-events:\s*auto;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-dock--centerDock\.is-native-canvas-aperture\s*\{[\s\S]*pointer-events:\s*none;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__header\s*\{[\s\S]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.88\);[\s\S]*pointer-events:\s*auto;/);
    });

    it("keeps floating panels and dock resize handles interactive above the canvas aperture", () => {
        assert.match(styles, /\.turn-of-the-century \.totc-v2-floating\s*\{[\s\S]*pointer-events:\s*auto;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-floating__header\s*\{[\s\S]*touch-action:\s*none;[\s\S]*user-select:\s*none;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-floating__resize-handle\s*\{[\s\S]*touch-action:\s*none;[\s\S]*user-select:\s*none;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-layout \[data-action='dock-resizer'\]\s*\{[\s\S]*pointer-events:\s*auto;[\s\S]*touch-action:\s*none;[\s\S]*z-index:\s*3;/);
        assert.match(workspaceLayoutFeatureSource, /\[data-action='floating-move-handle'\][\s\S]*addEventListener\("pointerdown"/);
        assert.match(workspaceLayoutFeatureSource, /\[data-action='dock-resizer'\][\s\S]*addEventListener\("pointerdown"/);
    });

    it("keeps move, close, and resize controls interactive without a theme wrapper", () => {
        assert.match(styles, /\.totc-workspace-v2-root-app \.totc-v2-floating,[\s\S]*\.totc-workspace-v2-root-app \[data-action='dock-resizer'\]\s*\{[\s\S]*pointer-events:\s*auto !important;/);
        assert.match(styles, /\.totc-workspace-v2-root-app \.totc-v2-stack-splitter/);
        assert.match(workspaceLayoutFeatureSource, /\[data-action='floating-close'\][\s\S]*pointerdown[\s\S]*event\.stopPropagation\(\)/);
        assert.doesNotMatch(workspaceLayoutFeatureSource, /\[data-action='floating-close'\][\s\S]{0,180}pointerdown[\s\S]{0,120}event\.preventDefault\(\)/);
    });

    it("keeps Victorian theme surfaces from repainting the native canvas aperture", () => {
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-layout\.has-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-dock--centerDock\.is-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__header\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(73,\s*51,\s*33,\s*0\.96\),\s*rgba\(36,\s*26,\s*20,\s*0\.96\)\);[\s\S]*border:\s*1px solid rgba\(183,\s*146,\s*82,\s*0\.58\);/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__content\s*\{[\s\S]*background:\s*transparent;/);
    });
});
