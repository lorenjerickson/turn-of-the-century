import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
const styles = readFileSync(join(rootDir, "styles/system-styles.css"), "utf8");

describe("native canvas workspace integration", () => {
    it("uses center map panels as a native Foundry canvas aperture", () => {
        assert.match(workspaceRootSource, /#getActiveCenterMapPanel/);
        assert.match(workspaceRootSource, /#syncNativeCanvasScene/);
        assert.match(workspaceRootSource, /scene\.view\(\)/);
        assert.match(workspaceRootSource, /dockId === "centerDock" && this\.\#isMapPanel\(activePanel\)/);
        assert.match(workspaceRootSource, /is-native-canvas-aperture/);
    });

    it("centers tokens with native canvas pan controls", () => {
        assert.match(workspaceRootSource, /canvas\?\.animatePan/);
        assert.match(workspaceRootSource, /canvas\?\.pan/);
        assert.doesNotMatch(workspaceRootSource, /centerOnPoint\(viewport, image/);
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

    it("keeps Victorian theme surfaces from repainting the native canvas aperture", () => {
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-layout\.has-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-dock--centerDock\.is-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__header\s*\{[\s\S]*linear-gradient\(180deg,\s*rgba\(73,\s*51,\s*33,\s*0\.96\),\s*rgba\(36,\s*26,\s*20,\s*0\.96\)\);[\s\S]*border:\s*1px solid rgba\(183,\s*146,\s*82,\s*0\.58\);/);
        assert.match(styles, /body\.totc-theme-victorian \.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__content\s*\{[\s\S]*background:\s*transparent;/);
    });
});
