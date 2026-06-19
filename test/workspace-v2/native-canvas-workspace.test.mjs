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
        assert.match(styles, /\.turn-of-the-century \.totc-v2-dock\s*\{[\s\S]*pointer-events:\s*auto;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-dock--centerDock\.is-native-canvas-aperture\s*\{[\s\S]*pointer-events:\s*none;/);
        assert.match(styles, /\.turn-of-the-century \.totc-v2-stack\.is-native-canvas-aperture \.totc-v2-stack__header\s*\{[\s\S]*pointer-events:\s*auto;/);
    });
});
