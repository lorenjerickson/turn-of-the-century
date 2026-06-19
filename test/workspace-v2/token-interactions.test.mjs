import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const rootDir = new URL("../..", import.meta.url).pathname;
const workspaceRootSource = readFileSync(join(rootDir, "module/ui/workspace-v2/workspace-root-app.mjs"), "utf8");
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
        assert.match(workspaceRootSource, /#showEncounterPanelForToken\(\{ combat = null, scene = null, token = null, actor = null \}/);
    });

    it("activates native wall tools instead of workspace map pointer handlers", () => {
        assert.match(workspaceRootSource, /#executeDesignAction\("scene\.walls", \{ panelId \}\)/);
        assert.match(workspaceRootSource, /getControlledWallIds\(canvas\?\.walls\)/);
        assert.match(workspaceRootSource, /removeWallSegmentsById/);
        assert.match(workspaceRootSource, /joinWallSegmentsById/);
        assert.doesNotMatch(workspaceRootSource, /#beginWallRubberbandSelection/);
        assert.doesNotMatch(workspaceRootSource, /#handleWallEditingPointerDown/);
        assert.doesNotMatch(workspaceRootSource, /totc-v2-grid-overlay__/);
    });

    it("keeps map toolbar button styling without fake map layer styles", () => {
        assert.match(styles, /\.totc-v2-map-toolbar__btn\s*\{[\s\S]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.2\);[\s\S]*border-radius:\s*4px;[\s\S]*color:\s*#dbeafe;/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__movement-overlay\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__targeting-overlay\s*\{/);
        assert.doesNotMatch(styles, /\.totc-v2-map-panel__grid-overlay\s*\{/);
    });
});
