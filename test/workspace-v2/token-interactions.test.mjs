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

        // Assert double-clicking opens details and opens editor
        assert.match(workspaceRootSource, /viewport\.addEventListener\("dblclick"/);
        assert.match(workspaceRootSource, /this\.actorWorkspaceController\.openDetails\(actorId\)/);
        assert.match(workspaceRootSource, /this\.actorWorkspaceController\.openActorEditor\(\)/);

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
        assert.match(workspaceRootSource, /if \(!actor\?\.isOwner\) return;/);
        assert.match(workspaceRootSource, /if \(!tActor\?\.isOwner\) continue;/);

        // Assert rubberband selection box creation, class toggling, and cleanup
        assert.match(workspaceRootSource, /totc-v2-map-viewport__selection-box/);
        assert.match(workspaceRootSource, /overlaps = ![\s\S]*tokenRect\.right < boxRect\.left/);
        assert.match(workspaceRootSource, /el\.classList\.toggle\("is-selected", this\.selectedTokenIds\.has\(el\.dataset\.tokenId\)\)/);
        assert.match(workspaceRootSource, /boxEl\.remove\(\)/);
    });

    it("defines CSS rules for selected tokens and rubberband selection box", () => {
        assert.match(styles, /\.totc-v2-map-panel__token\.is-selected\s*\{/);
        assert.match(styles, /outline:\s*2px\s*solid\s*#fbbf24;/);
        assert.match(styles, /\.totc-v2-map-viewport__selection-box\s*\{/);
        assert.match(styles, /border:\s*1\.5px\s*dashed\s*#fbbf24;/);
        assert.match(styles, /background:\s*rgba\(251,\s*191,\s*36,\s*0\.12\);/);
    });
});
